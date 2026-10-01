import { Request, Response } from "express";
import bcrypt from "bcrypt";
import AdminPassword from "../database/models/AdminPassword";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";

export class AdminPasswordController {
  // Establecer contraseña (solo una vez)
  static setPassword = async (req: Request, res: Response) => {
    try {
      const existing = await AdminPassword.findOne();
      if (existing) {
        return res.status(400).json({ result: false, content: [], error: ['La contraseña ya fue establecida. No se puede cambiar.'] });
      }
      const { password } = req.body;
      if (!password || password.length < 12) {
        return res.status(400).json({ result: false, content: [], error: ['La contraseña debe tener al menos 12 caracteres.'] });
      }
      const saltRounds = 12;
      const hash = await bcrypt.hash(password, saltRounds);
      await AdminPassword.create({ passwordHash: hash });
      res.status(200).json({ result: true, content: ['Contraseña administrativa configurada correctamente.'], error: [] });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'AdminPasswordController', getErrorLocation("setPassword"));
      res.status(500).json({ result: false, content: [], error: ['Error al guardar la contraseña'] });
    }
  };

  // Verificar si ya existe contraseña
  static checkPasswordStatus = async (_req: Request, res: Response) => {
    try {
      const record = await AdminPassword.findOne();
      res.status(200).json({ result: true, content: { exists: !!record }, error: [] });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'AdminPasswordController', getErrorLocation("checkPasswordStatus"));
      res.status(500).json({ result: false, content: [], error: ['Error al verificar estado de contraseña'] });
    }
  };
}