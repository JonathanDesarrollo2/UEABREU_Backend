import { CorsOptions } from 'cors' 
import { Request } from 'express'
import dotenv from "dotenv";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";

dotenv.config();

const {
    FRONTEND_URL1,
    FRONTEND_URL2,
    FRONTEND_URL3,
    FRONTEND_URL4,
    FRONTEND_URL5,
    BACKEND_URL,
    BACKEND_URL1,
    FRONTEND_URL // ← Nueva variable
} = process.env;

// Lista blanca actualizada
var ListaBlanca = [
    FRONTEND_URL1,
    FRONTEND_URL2, 
    FRONTEND_URL3,
    FRONTEND_URL4,
    FRONTEND_URL5,
    BACKEND_URL,
    BACKEND_URL1,
    FRONTEND_URL, // ← Agregada
    'http://localhost:5173', // ← Por si acaso
    'http://localhost:3000'  // ← Por si acaso
].filter(Boolean); // Esto remueve undefined/null

export const corsConfig = function (req: Request, callback: (err: Error | null, options?: CorsOptions) => void)  { 
    let corsOptions: CorsOptions;
    
    try {
        const origin = req.header('Origin') || '';
        
        // Para desarrollo, permitir todos los orígenes locales
        if (process.env.NODE_ENV === 'development') {
            corsOptions = { 
                origin: true, 
                exposedHeaders: ['newtoken'],
                credentials: true,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
            };
        } 
        // Para producción, usar lista blanca
        else if (ListaBlanca.includes(origin)) { 
            corsOptions = { 
                origin: true, 
                exposedHeaders: ['newtoken'],
                credentials: true,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
            };
        } else {
            corsOptions = { origin: false };
        }
        
        callback(null, corsOptions);
        
    } catch (error) {
        ErrorLog.createErrorLog(error, 'Server', getErrorLocation("corsConfig"));
        // En desarrollo, en caso de error, permitir el acceso
        callback(null, { 
            origin: true,
            exposedHeaders: ['newtoken'],
            credentials: true 
        });
    }  
}