import rateLimit from "express-rate-limit";
import { Request, Response } from 'express';
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        // Obtener IP real incluso detrás de proxy
        const forwarded = req.headers['x-forwarded-for'];
        const ip = forwarded 
            ? (typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0].split(',')[0])
            : req.socket.remoteAddress;
        
        return ip?.trim() || 'unknown-ip';
    },
    handler: async (req: Request, res: Response) => {
        // Obtener IP usando el mismo método que keyGenerator
        const forwarded = req.headers['x-forwarded-for'];
        const clientIp = forwarded 
            ? (typeof forwarded === 'string' ? forwarded.split(',')[0] : forwarded[0].split(',')[0])
            : req.socket.remoteAddress;
        const errorMessage = `Demasiados intentos de login desde la IP: ${clientIp}`;
        ErrorLog.createErrorLog(errorMessage, 'Security', getErrorLocation("loginLimiter"));
        // Respuesta al cliente
        res.status(429).json({ result: false, content: [], error: ["Demasiados intentos. Intente nuevamente en 15 minutos"] });
    },
    skipSuccessfulRequests: true,
    validate: {
        trustProxy: true
    }
});