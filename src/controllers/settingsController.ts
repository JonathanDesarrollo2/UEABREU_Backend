import { Request, Response } from "express";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import Setting from "../database/models/settings";

export class SettingsController {
  
  // Obtener estado actual de las inscripciones
  static getRegistrationStatus = async (req: Request, res: Response) => {
    try {
      let setting = await Setting.findOne({ where: { key: 'registrations_enabled' } });
      // Si no existe, lo creamos con valor por defecto (false)
      if (!setting) {
        setting = await Setting.create({
          key: 'registrations_enabled',
          value: 'false',
          description: 'Controla si el registro público de representantes está habilitado'
        });
      }
      res.json({
        result: true,
        content: { registrationsEnabled: setting.value === 'true' },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'SettingsController', getErrorLocation("getRegistrationStatus"));
      res.status(500).json({ result: false, content: [], error: [error.message] });
    }
  };

  // Activar o desactivar inscripciones
  static toggleRegistrations = async (req: Request, res: Response) => {
    try {
      const { enable } = req.body; // boolean
      if (typeof enable !== 'boolean') {
        return res.status(400).json({ result: false, content: [], error: ["Se requiere el campo 'enable' (boolean)"] });
      }

      const [setting] = await Setting.upsert({
        key: 'registrations_enabled',
        value: enable ? 'true' : 'false',
        description: 'Controla si el registro público de representantes está habilitado'
      });

      res.json({
        result: true,
        content: { registrationsEnabled: enable, message: `Inscripciones ${enable ? 'activadas' : 'desactivadas'} correctamente` },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'SettingsController', getErrorLocation("toggleRegistrations"));
      res.status(500).json({ result: false, content: [], error: [error.message] });
    }
  };
}