// src/controllers/SimulationController.ts
import { Request, Response } from "express";
import Setting from "../database/models/settings";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import { BillingService } from "../services/billingServices";

export class SimulationController {
  // Obtener la fecha simulada actual
  static getSimulatedDate = async (req: Request, res: Response) => {
    try {
      const setting = await Setting.findOne({ where: { key: 'simulated_date' } });
      const simulatedDate = setting ? setting.value : null;
      res.json({ result: true, content: { simulatedDate }, error: [] });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getSimulatedDate"));
      res.status(500).json({ result: false, content: [], error: [error.message] });
    }
  };

  // Establecer una nueva fecha simulada
  static setSimulatedDate = async (req: Request, res: Response) => {
    try {
      const { date } = req.body; // formato 'YYYY-MM-DD'
      if (!date) return res.status(400).json({ result: false, content: [], error: ['Se requiere una fecha'] });

      await Setting.upsert({
        key: 'simulated_date',
        value: date,
        description: 'Fecha simulada para pruebas de cobros'
      });

      res.json({ result: true, content: { simulatedDate: date }, error: [] });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("setSimulatedDate"));
      res.status(500).json({ result: false, content: [], error: [error.message] });
    }
  };

  // Restablecer (eliminar) la fecha simulada → vuelve a usar la fecha real
  static resetSimulatedDate = async (req: Request, res: Response) => {
    try {
      await Setting.destroy({ where: { key: 'simulated_date' } });
      res.json({ result: true, content: { simulatedDate: null }, error: [] });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("resetSimulatedDate"));
      res.status(500).json({ result: false, content: [], error: [error.message] });
    }
  };
  static applyMonthlyFees = async (req: Request, res: Response) => {
  try {
    await BillingService.applyMonthlyFee(); // Ya usa getCurrentDate() internamente
    res.json({ result: true, content: { message: 'Mensualidades aplicadas correctamente' }, error: [] });
  } catch (error: any) {
    ErrorLog.createErrorLog(error, 'Server', getErrorLocation("applyMonthlyFees"));
    res.status(500).json({ result: false, content: [], error: [error.message] });
  }
};
}