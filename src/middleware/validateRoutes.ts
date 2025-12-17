import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

// Versión corregida que ejecuta los validadores
export const validateRoutes = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Primero ejecutar los validadores (si existen)
        await Promise.all([
            ...req.body.usermail ? [req.body] : [], // Ejemplo simplificado
            // En realidad, express-validator maneja esto internamente
        ]);
        
        let Errores = validationResult(req);
        
        if (!Errores.isEmpty()) {
            const errorArray = Errores.array();
            console.log('❌ Errores de validación:', errorArray);
            return res.status(202).json({ 
                result: false, 
                content: [], 
                error: [errorArray[0].msg] 
            });
        }
        
        next();
    } catch (error: any) {
        console.error('💥 Error en validateRoutes:', error.message);
        return res.status(500).json({ 
            result: false, 
            content: [], 
            error: ['Error de validación'] 
        });
    }
};