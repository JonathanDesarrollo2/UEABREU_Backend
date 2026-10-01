// src/controllers/SimulationControllers.ts
import type { Request, Response } from 'express';
import sequelize from '../database/config';
import Student from '../database/models/student';
import Transaction from '../database/models/transaction';
import Setting from '../database/models/settings';
import UserLogin from '../database/models/userlogin';
import { ErrorLog } from '../utility/ErrorLog';
import { getErrorLocation } from '../utility/callerinfo';
import { BillingService } from '../services/billingServices';

export class SimulationController {

  // ─── FECHA SIMULADA ────────────────────────────────────────────────
static getSimulatedDate = async (_req: Request, res: Response) => {
  try {
    let simulatedDate: string | null = process.env.SIMULATED_DATE ?? null;
    if (!simulatedDate) {
      const setting = await Setting.findOne({ where: { key: 'simulated_date' } });
      simulatedDate = setting?.value ?? null;
    }
    res.status(200).json({
      result: true,
      content: { simulatedDate },
      error: []
    });
  } catch (error: any) {
    ErrorLog.createErrorLog(error, 'SimulationController', getErrorLocation("getSimulatedDate"));
    res.status(500).json({ result: false, content: [], error: ['Error al obtener fecha simulada'] });
  }
};

  static setSimulatedDate = async (req: Request, res: Response) => {
    try {
      const { date } = req.body;
      if (!date) {
        return res.status(400).json({ result: false, content: [], error: ['Fecha requerida'] });
      }

      // Guardar en variable de entorno para acceso rápido
      process.env.SIMULATED_DATE = date;

      // Guardar en BD para persistencia
      const [setting, created] = await Setting.findOrCreate({
        where: { key: 'simulated_date' },
        defaults: { key: 'simulated_date', value: date, description: 'Fecha simulada para pruebas' }
      });
      if (!created) {
        await setting.update({ value: date });
      }

      res.status(200).json({
        result: true,
        content: { simulatedDate: date },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'SimulationController', getErrorLocation("setSimulatedDate"));
      res.status(500).json({ result: false, content: [], error: ['Error al establecer fecha simulada'] });
    }
  };

  static resetSimulatedDate = async (_req: Request, res: Response) => {
    try {
      delete process.env.SIMULATED_DATE;
      await Setting.destroy({ where: { key: 'simulated_date' } });
      res.status(200).json({
        result: true,
        content: { simulatedDate: null },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'SimulationController', getErrorLocation("resetSimulatedDate"));
      res.status(500).json({ result: false, content: [], error: ['Error al restablecer fecha simulada'] });
    }
  };

  static applyMonthlyFees = async (_req: Request, res: Response) => {
    try {
      await BillingService.applyMonthlyFee();
      res.status(200).json({
        result: true,
        content: ['Mensualidades aplicadas correctamente'],
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'SimulationController', getErrorLocation("applyMonthlyFees"));
      res.status(500).json({ result: false, content: [], error: ['Error al aplicar mensualidades'] });
    }
  };

  // ─── REINICIO TOTAL DE DATOS ──
  static resetEverything = async (_req: Request, res: Response) => {
    if (process.env.ENABLE_SIMULATION !== 'true') {
      return res.status(403).json({
        result: false,
        content: [],
        error: ['Esta acción no está disponible en producción']
      });
    }

    const transaction = await sequelize.transaction();
    try {
      await Transaction.destroy({ where: {}, transaction });
      await Student.update(
        { status: 'pendiente', balance: 0, hasPaidInscription: false },
        { where: {}, transaction }
      );
      await UserLogin.update(
        { userstatus: false },
        { where: { nivel: 1 }, transaction }
      );
      await transaction.commit();

      res.status(200).json({
        result: true,
        content: ['Datos de prueba reiniciados correctamente'],
        error: []
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'SimulationController', getErrorLocation("resetEverything"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al reiniciar los datos']
      });
    }
  };
}