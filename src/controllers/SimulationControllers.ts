// src/controllers/SimulationControllers.ts
import type { Request, Response } from 'express';
import sequelize from '../database/config';
import Student from '../database/models/student';
import Transaction from '../database/models/transaction';
import Representative from '../database/models/representative';
import UserLogin from '../database/models/userlogin';
import RegistrationApplication from '../database/models/RegistrationAplicattion';
import { ErrorLog } from '../utility/ErrorLog';
import { getErrorLocation } from '../utility/callerinfo';
import { BillingService } from '../services/billingServices';

export class SimulationController {

  // ─── FECHA SIMULADA ────────────────────────────────────────────────
  static getSimulatedDate = async (_req: Request, res: Response) => {
    try {
      const simulatedDate = process.env.SIMULATED_DATE || null;
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
      process.env.SIMULATED_DATE = date;
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

  // ─── REINICIO TOTAL DE DATOS (SOLO DESARROLLO) ──────────────────────
  static resetEverything = async (_req: Request, res: Response) => {
    // Bloquear en producción
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        result: false,
        content: [],
        error: ['Esta acción no está disponible en producción']
      });
    }

    const transaction = await sequelize.transaction();
    try {
      // 1. Eliminar transacciones (historial financiero)
      await Transaction.destroy({ where: {}, transaction });

      // 2. Restablecer estudiantes a pendiente, balance 0 y sin inscripción
      await Student.update(
        { status: 'pendiente', balance: 0, hasPaidInscription: false },
        { where: {}, transaction }
      );

      // 3. Eliminar solicitudes de registro
      await RegistrationApplication.destroy({ where: {}, transaction });

      // 4. Eliminar representantes y usuarios asociados
      await Representative.destroy({ where: {}, transaction });

      // 5. Eliminar usuarios de nivel 1 (representantes)
      await UserLogin.destroy({ where: { nivel: 1 }, transaction });

      await transaction.commit();

      res.status(200).json({
        result: true,
        content: ['Todos los datos de prueba han sido reiniciados'],
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