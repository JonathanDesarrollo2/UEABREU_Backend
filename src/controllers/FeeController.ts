import { Request, Response } from "express";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import SchoolFee from "../database/models/ScoolFee";
import AuditLog from "../database/models/auditLog";
import AdminPassword from "../database/models/AdminPassword";
import bcrypt from 'bcrypt';

export class FeeController {
  // Obtener las tarifas del año activo (o crear una por defecto)
  static getFees = async (req: Request, res: Response) => {
    try {
      const schoolYear = req.query.schoolYear as string || '2026-2027';
      let fee = await SchoolFee.findOne({ where: { schoolYear } });
      if (!fee) {
        fee = await SchoolFee.create({
          schoolYear,
          inscriptionFeeUSD: 80,
          monthlyFeeUSD: 100,
          prontoPagoDiscount: 10,
          prontoPagoDeadlineDay: 10,
          administrativeFeeUSD: 20,
          august2027HalfPaymentUSD: 45,
          monthlyFeeStartDate: '2026-09-01',
          inscriptionStartDate: '2026-07-15',
          inscriptionEndDate: '2026-10-01',
        });
      }
      res.json({ result: true, content: fee, error: [] });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'FeeController', getErrorLocation("getFees"));
      res.status(500).json({ result: false, content: [], error: [error.message] });
    }
  };

  // Actualizar tarifas
  // En FeeController.updateFees
static updateFees = async (req: Request, res: Response) => {
  try {
    const { schoolYear } = req.params;
    const {
      inscriptionFeeUSD,
      monthlyFeeUSD,
      prontoPagoDiscount,
      prontoPagoDeadlineDay,
      administrativeFeeUSD,
      august2027HalfPaymentUSD,
      monthlyFeeStartDate,
      inscriptionStartDate,
      inscriptionEndDate,
      schoolYearEndDate,   // ✅ Nuevo campo
      password,            // ✅ Contraseña requerida
    } = req.body;

    // Verificar contraseña administrativa
    const passwordRecord = await AdminPassword.findOne();
    if (!passwordRecord) {
      return res.status(400).json({ result: false, content: [], error: ['No hay contraseña administrativa configurada'] });
    }
    const match = await bcrypt.compare(password, passwordRecord.passwordHash);
    if (!match) {
      return res.status(403).json({ result: false, content: [], error: ['Contraseña incorrecta'] });
    }

    const fee = await SchoolFee.findOne({ where: { schoolYear } });
    if (!fee) return res.status(404).json({ result: false, content: [], error: ['Año escolar no encontrado'] });

    await fee.update({
      inscriptionFeeUSD,
      monthlyFeeUSD,
      prontoPagoDiscount,
      prontoPagoDeadlineDay,
      administrativeFeeUSD,
      august2027HalfPaymentUSD,
      monthlyFeeStartDate,
      inscriptionStartDate,
      inscriptionEndDate,
      schoolYearEndDate, // ✅
    });

    // Registrar auditoría
    await AuditLog.create({
      userId: req.tokenData?.id,
      action: 'UPDATE_SCHOOL_FEES',
      details: {
        schoolYear,
        changes: fee.toJSON(),
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ result: true, content: fee, error: [] });
  } catch (error: any) {
    ErrorLog.createErrorLog(error, 'FeeController', getErrorLocation("updateFees"));
    res.status(500).json({ result: false, content: [], error: [error.message] });
  }
};
}