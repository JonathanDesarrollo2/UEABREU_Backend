import { Request, Response, NextFunction } from "express";
import UserLogin from "../database/models/userlogin";
import Student from "../database/models/student";
import { VerifJWToken } from "../utility/genToken";
import { typeTokenData } from "../database/types/userlogin";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import jwt, { JwtPayload } from 'jsonwebtoken';

declare global {
    namespace Express {
        interface Request {
            tokenData?: typeTokenData;
        }
    }
}

export const getTokenExpirationDate = (token: string): Date | null => {
    try {
        const decoded = jwt.decode(token) as JwtPayload;

        if (decoded && typeof decoded === 'object' && decoded.exp) {
            const expTimestamp = decoded.exp * 1000;
            return new Date(expTimestamp);
        }

        return null;
    } catch (error) {
        console.error('❌ Error decodificando token para obtener fecha de expiración:', error);
        return null;
    }
};

export const authsession = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    // Verificar cabecera de autorización
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(429).json({ result: false, content: [], error: ["Autenticación requerida. Por favor, inicie sesión nuevamente"] });
        return;
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
        // Verificar token JWT
        const tokenData: typeTokenData = VerifJWToken(token);
        
        // Validar estructura del token (adaptado a tu nuevo modelo)
        if (!tokenData?.id || !tokenData?.userlogin || !tokenData?.usermail || tokenData.nivel === undefined) {
            res.status(429).json({ result: false, content: [], error: ["Autenticación requerida. Por favor, inicie sesión nuevamente"] });
            return;
        }
        
        // Si se requiere renovar, enviar nuevo token en header
        if (tokenData.hacer === 'RENEW' && tokenData.newToke) {
            res.setHeader('newtoken', tokenData.newToke);
        } else {
            // Header explícitamente vacío para evitar efectos colaterales
            res.setHeader('newtoken', ''); 
        }
        
        // Verificar existencia de usuario
        const transaction = await UserLogin.sequelize!.transaction();
        try {
            const user = await UserLogin.findOne({
                where: { 
                    id: tokenData.id,
                    userlogin: tokenData.userlogin,
                    usermail: tokenData.usermail
                },
                transaction,
                attributes: ['id', 'userlogin', 'username', 'usermail', 'userstatus', 'nivel'],
                rejectOnEmpty: false
            });
            
            // Validar usuario y estado
            if (!user || !user.userstatus) {
                await transaction.rollback();
                res.status(429).json({ result: false, content: [], error: ["Autenticación requerida. Por favor, inicie sesión nuevamente"] });
                return;
            }
            
            // VERIFICACIÓN ADICIONAL: Asegurar que los campos requeridos no sean undefined
            if (!user.id || !user.userlogin || !user.usermail || user.nivel === undefined) {
                await transaction.rollback();
                ErrorLog.createErrorLog('Datos de usuario incompletos en base de datos', user.usermail || 'unknown', getErrorLocation("authsession"));
                res.status(429).json({ result: false, content: [], error: ["Autenticación requerida. Por favor, inicie sesión nuevamente"] });
                return;
            }
            
            await transaction.commit();
            
            // Adjuntar datos al request CON TYPE ASSERTION
            req.tokenData = {
                id: user.id as string,
                userlogin: user.userlogin as string,
                username: user.username,
                usermail: user.usermail as string,
                nivel: user.nivel as number
            };
            
            next();
        } catch (dbError) {
            await transaction.rollback();
            ErrorLog.createErrorLog(dbError, 'ServerDB', getErrorLocation("authsession"));
            res.status(429).json({ result: false, content: [], error: ["Autenticación requerida. Por favor, inicie sesión nuevamente"] });
            return;
        }
    } catch (jwtError) {
        ErrorLog.createErrorLog(jwtError, 'ServerTK', getErrorLocation("authsession"));
        res.status(429).json({ result: false, content: [], error: ["Autenticación requerida. Por favor, inicie sesión nuevamente"] });
        return;
    }
};