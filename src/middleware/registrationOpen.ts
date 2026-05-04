import { Request, Response, NextFunction } from "express";
import Setting from "../database/models/settings";

export const requireRegistrationOpen = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const setting = await Setting.findOne({ where: { key: 'registrations_enabled' } });
    const isOpen = setting?.value === 'true';

    if (!isOpen) {
      return res.status(403).json({
        result: false,
        content: [],
        error: ["Las inscripciones están cerradas temporalmente."]
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({
      result: false,
      content: [],
      error: ["Error al verificar el estado de las inscripciones."]
    });
  }
};