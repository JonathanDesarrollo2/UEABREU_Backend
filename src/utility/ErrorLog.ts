import * as winston from 'winston';
import { Storage } from '@google-cloud/storage';
import * as fs from 'fs';
import { getErrorLocation } from './callerinfo';

interface LogMessage {
    id: number;
    timestamp: string;
    userloggin: string;
    lastroute?: string;
    messagerror: string;
}

export class ErrorLog {
    private static baseId: number = Date.now();
    private static randomOffset: number = Math.floor(Math.random() * 10000);
    private static currentId: number = ErrorLog.baseId + ErrorLog.randomOffset;
    
    private static getEnvironmentPrefix(): string {
        return process.env.NODE_ENV === 'production' 
            ? 'errors/production/' 
            : 'errors/develop/';
    }
    
    private static getLogFilePath(): string {
        return `${this.getEnvironmentPrefix()}backend.log`;
    }
    
    private static logger: winston.Logger = winston.createLogger({
        level: 'error',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.printf((info: any) => {
                try {
                    const logObject: LogMessage = {
                        id: Number(info.id),
                        timestamp: String(info.timestamp || new Date().toISOString()),
                        userloggin: String(info.userloggin || ''),
                        messagerror: String(info.messagerror || '').replace(/["]/g, '') 
                    };

                    if (info.lastroute) logObject.lastroute = String(info.lastroute);

                    return JSON.stringify(logObject, null, 2);
                } catch {
                    return JSON.stringify({ timestamp: new Date().toISOString(), error: 'Error al formatear log' });
                }
            })
        ),
        transports: [
            new winston.transports.File({ filename: './src/errors/backend.log' })
        ]
    });

    // MÉTODO ACTUALIZADO PARA MANEJAR unknown
    public static async createErrorLog(errorInput: unknown, usuario: string, file: string): Promise<void> {
        try {
            const storage = new Storage();
            const bucketName = process.env.GCS_BUCKET_NAME!;
            const bucket = storage.bucket(bucketName);
            
            // Convertir unknown a string de manera segura
            let mensaje: string;
            if (errorInput instanceof Error) {
                mensaje = errorInput.message;
            } else if (typeof errorInput === 'string') {
                mensaje = errorInput;
            } else {
                mensaje = String(errorInput);
            }
            
            // Remover comillas dobles y caracteres problemáticos del mensaje de error
            mensaje = mensaje.replace(/["]/g, '');
            
            const logObject: LogMessage = {
                id: ErrorLog.currentId++,
                timestamp: new Date().toISOString(),
                userloggin: usuario,
                messagerror: mensaje
            };

            if (file) logObject.lastroute = file;

            const filePath = this.getLogFilePath();
            const gcsFile = bucket.file(filePath);
            
            let existingContent = '';
            try {
                const [exists] = await gcsFile.exists();
                if (exists) {
                    const [content] = await gcsFile.download();
                    existingContent = content.toString();
                }
            } catch (error) {
                console.error('Error obteniendo archivo existente:', error);
            }

            const newEntry = JSON.stringify(logObject, null, 2);
            const newContent = existingContent 
                ? `${existingContent}\n${newEntry}`
                : newEntry;
            
            await gcsFile.save(newContent, {
                metadata: { 
                    contentType: 'application/json',
                    cacheControl: 'no-cache' 
                }
            });

        } catch(error: unknown) {
            // Fallback: guardar localmente si hay error con GCS
            console.error('Error guardando en GCS, guardando localmente:', error);
            
            // Convertir unknown a string de manera segura
            let mensaje: string;
            if (errorInput instanceof Error) {
                mensaje = errorInput.message;
            } else if (typeof errorInput === 'string') {
                mensaje = errorInput;
            } else {
                mensaje = String(errorInput);
            }
            
            const logObject: LogMessage = {
                id: ErrorLog.currentId++,
                timestamp: new Date().toISOString(),
                userloggin: usuario,
                messagerror: mensaje.replace(/["]/g, '')
            };

            if (file) logObject.lastroute = file;

            try {
                this.logger.error(logObject);
            } catch (loggerError) {
                console.error('Error incluso en el fallback del logger:', loggerError);
            }
        }
    }

    public static async getAllErrorLog(): Promise<{ totalErrores: number, registros: LogMessage[] | null }> {
        try {
            const storage = new Storage();
            const bucketName = process.env.GCS_BUCKET_NAME!;
            const bucket = storage.bucket(bucketName);
            const filePath = this.getLogFilePath();
            const gcsFile = bucket.file(filePath);
            
            const [exists] = await gcsFile.exists();
            if (!exists) return { totalErrores: 0, registros: null };

            const [content] = await gcsFile.download();
            const contentString = content.toString();
            
            const registros: LogMessage[] = [];
            let currentEntry = '';
            
            contentString.split('\n').forEach(line => {
                const trimmedLine = line.trim();
                if (!trimmedLine) return;
                
                currentEntry += trimmedLine;
                if (trimmedLine.endsWith('}')) {
                    try {
                        registros.push(JSON.parse(currentEntry));
                    } catch (error) {
                        console.error('Error parseando entrada:', currentEntry);
                    }
                    currentEntry = '';
                }
            });
            
            return {
                totalErrores: registros.length,
                registros: registros.length > 0 ? registros : null
            };
        } catch (error: unknown) {
            console.error('Error obteniendo logs de GCS:', error);
            return { totalErrores: 0, registros: null };
        }
    }

    public static async clearErrorLog(): Promise<boolean> {
        try {
            const storage = new Storage();
            const bucketName = process.env.GCS_BUCKET_NAME!;
            const bucket = storage.bucket(bucketName);
            const filePath = this.getLogFilePath();
            const gcsFile = bucket.file(filePath);
            
            await gcsFile.save('', { 
                metadata: { 
                    contentType: 'application/json' 
                } 
            });
            
            return true;
        } catch (error: unknown) {
            console.error('Error limpiando logs:', error);
            return false;
        }
    }
}