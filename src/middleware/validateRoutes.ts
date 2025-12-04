import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";

export const validateRoutes = (req: Request, res: Response, next: NextFunction) => {
    let Errores = validationResult(req);
    if (!Errores.isEmpty()) {
        const errorArray = Errores.array();
        res.status(202).json({ result: false, content: [], error: [errorArray[0].msg] });
        return;
    }
    next();
};