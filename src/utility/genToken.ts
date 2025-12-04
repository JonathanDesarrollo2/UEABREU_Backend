import jwt, { JwtPayload, Secret, TokenExpiredError, JsonWebTokenError } from "jsonwebtoken";
import { StringValue } from 'ms';
import { ErrorLog } from "./ErrorLog";
import { getErrorLocation } from "./callerinfo";
import { typeTokenData } from "../database/types/userlogin";

const secretKey: Secret = process.env.SESION_SECRETKEY || 'fallback-secret-key';

const getExpiresIn = (): number | StringValue => {
    const envExpiresIn = process.env.JWT_EXPIRES_IN;
    
    if (envExpiresIn && !isNaN(Number(envExpiresIn))) {
        return Number(envExpiresIn);
    }
    
    return (envExpiresIn || '1h') as StringValue;
};

export const generateJWT = (tokenData: typeTokenData): string => {
    let UserLogin: string = tokenData.userlogin || 'Unknown';
    
    try {
        if (!secretKey) {
            ErrorLog.createErrorLog('JWT secret no configurada', 'Server', getErrorLocation("generateJWT"));
            return '';
        }

        const payload = {
            id: tokenData.id,
            userlogin: tokenData.userlogin,
            username: tokenData.username,
            usermail: tokenData.usermail,
            nivel: tokenData.nivel
        };

        const options: jwt.SignOptions = {
            expiresIn: getExpiresIn(),
            algorithm: "HS256"
        };

        return jwt.sign(payload, secretKey, options);

    } catch (error) {
        ErrorLog.createErrorLog(error, UserLogin, getErrorLocation("generateJWT"));
        return '';
    }
};

// Función de tipo guard mejorada para verificar la estructura del payload
const isTokenPayload = (payload: string | JwtPayload): payload is typeTokenData & { exp?: number } => {
    if (typeof payload === 'string') return false;
    
    return (
        'id' in payload &&
        'userlogin' in payload &&
        'usermail' in payload &&
        typeof payload.id === 'string' &&
        typeof payload.userlogin === 'string' &&
        typeof payload.usermail === 'string'
    );
};

export const verifyJWT = (jwToken: string): typeTokenData | null => {
    let UserLogin: string = 'Unknown';
    
    try {
        if (!secretKey) {
            ErrorLog.createErrorLog('JWT secret no configurada', 'Server', getErrorLocation("verifyJWT"));
            return null;
        }

        const verified = jwt.verify(jwToken, secretKey as Secret);
        
        if (typeof verified === 'object' && isTokenPayload(verified)) {
            return verified as typeTokenData;
        }
        
        return null;
        
    } catch (error) {
        // Extraer userlogin del token decodificado para logging
        try {
            const decoded = jwt.decode(jwToken);
            if (decoded && typeof decoded === 'object' && 'userlogin' in decoded) {
                UserLogin = decoded.userlogin as string;
            }
        } catch (decodeError) {
            // Ignorar errores de decodificación para logging
        }

        if (error instanceof TokenExpiredError) {
            ErrorLog.createErrorLog('Token expirado', UserLogin, getErrorLocation("verifyJWT"));
        } else if (error instanceof JsonWebTokenError) {
            ErrorLog.createErrorLog('Token inválido', UserLogin, getErrorLocation("verifyJWT"));
        } else {
            ErrorLog.createErrorLog(error, UserLogin, getErrorLocation("verifyJWT"));
        }
        
        return null;
    }
};

// MODIFICACIÓN: Esta función ahora lanza error en lugar de retornar null
// para que authsession pueda capturarlo con try/catch
export const VerifJWToken = (jwToken: string): typeTokenData & { hacer?: string; newToke?: string } => {
    let UserLogin: string = 'Unknown';
    
    try {
        const tokenData = jwt.verify(jwToken, secretKey) as JwtPayload;
        
        if (tokenData && typeof tokenData === 'object' && 
            'id' in tokenData && 
            'userlogin' in tokenData && 
            'usermail' in tokenData) {
            
            const { id, userlogin, username, usermail, nivel, exp } = tokenData;
            
            UserLogin = userlogin as string;

            // Verificar explícitamente que exp existe y es un número
            if (exp && typeof exp === 'number') {
                const nowInSec = Math.floor(Date.now() / 1000);
                const secondsToExpire = exp - nowInSec;
                const renewThresholdInSeconds = 3 * 60; // 3 minutos

                // Renovar token si está cerca de expirar
                if (secondsToExpire <= renewThresholdInSeconds && secondsToExpire > 0) {
                    const newToke = generateJWT({ 
                        id: id as string, 
                        userlogin: userlogin as string, 
                        username: username as string, 
                        usermail: usermail as string, 
                        nivel: nivel as number 
                    });
                    return {
                        hacer: 'RENEW',
                        newToke,
                        id: id as string, 
                        userlogin: userlogin as string, 
                        username: username as string, 
                        usermail: usermail as string,
                        nivel: nivel as number
                    };
                }
            }

            // Si no hay expiración o no necesita renovación, devolver datos normales
            return { 
                id: id as string, 
                userlogin: userlogin as string, 
                username: username as string, 
                usermail: usermail as string,
                nivel: nivel as number
            };
        }
        
        // Si no cumple la estructura, lanzar error
        throw new JsonWebTokenError('Estructura de token inválida');
        
    } catch (error) {
        // Extraer userlogin del token decodificado para logging
        try {
            const decoded = jwt.decode(jwToken);
            if (decoded && typeof decoded === 'object' && 'userlogin' in decoded) {
                UserLogin = decoded.userlogin as string;
            }
        } catch (decodeError) {
            // Ignorar errores de decodificación para logging
        }

        ErrorLog.createErrorLog(error, UserLogin, getErrorLocation("VerifJWToken"));
        
        // Lanzar el error para que authsession lo capture
        if (error instanceof TokenExpiredError) {
            throw new Error('Token expirado');
        } else if (error instanceof JsonWebTokenError) {
            throw new Error('Token inválido');
        } else {
            throw error;
        }
    }
};

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