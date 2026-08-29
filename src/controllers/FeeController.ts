import { Request, Response } from "express";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import SchoolFee from "../database/models/ScoolFee";
import AuditLog from "../database/models/auditLog";
import AdminPassword from "../database/models/AdminPassword";
import bcrypt from 'bcrypt';
import UserLogin from "../database/models/userlogin";

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
      schoolYearEndDate,
      password,
    } = req.body;

    // Verificar o establecer contraseña administrativa
    let passwordRecord = await AdminPassword.findOne();
    if (!passwordRecord) {
      if (!password || password.length < 12) {
        return res.status(400).json({ result: false, content: [], error: ['Debes establecer una contraseña administrativa de al menos 12 caracteres'] });
      }
      const hash = await bcrypt.hash(password, 12);
      passwordRecord = await AdminPassword.create({ passwordHash: hash });
    } else {
      if (!password) return res.status(400).json({ result: false, content: [], error: ['Contraseña requerida'] });
      const match = await bcrypt.compare(password, passwordRecord.passwordHash);
      if (!match) return res.status(403).json({ result: false, content: [], error: ['Contraseña incorrecta'] });
    }

    const fee = await SchoolFee.findOne({ where: { schoolYear } });
    if (!fee) return res.status(404).json({ result: false, content: [], error: ['Año escolar no encontrado'] });

    // 📸 Capturar valores antiguos
    const oldFee = fee.toJSON();

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
      schoolYearEndDate,
    });

    // 📸 Capturar valores nuevos
    const newFee = fee.toJSON();

    // 🔍 Calcular solo los campos que cambiaron
    const campos = [
      'inscriptionFeeUSD',
      'monthlyFeeUSD',
      'prontoPagoDiscount',
      'prontoPagoDeadlineDay',
      'administrativeFeeUSD',
      'august2027HalfPaymentUSD',
      'monthlyFeeStartDate',
      'inscriptionStartDate',
      'inscriptionEndDate',
      'schoolYearEndDate',
    ];

    const changes = campos
      .filter(campo => oldFee[campo] !== newFee[campo])
      .map(campo => ({
        campo,
        antes: oldFee[campo],
        despues: newFee[campo],
      }));

    // Registrar auditoría con los cambios detallados
    await AuditLog.create({
      userId: req.tokenData?.id,
      action: 'UPDATE_SCHOOL_FEES',
      details: {
        schoolYear,
        changes,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ result: true, content: fee, error: [] });
  } catch (error: any) {
    ErrorLog.createErrorLog(error, 'FeeController', getErrorLocation("updateFees"));
    res.status(500).json({ result: false, content: [], error: [error.message] });
  }
};
static getAuditLogs = async (req: Request, res: Response) => {
  try {
    const logs = await AuditLog.findAll({
      order: [['createdAt', 'DESC']],
      limit: 20,
      include: [{
        model: UserLogin,
        attributes: ['userlogin', 'username']
      }]
    });
    res.json({ result: true, content: logs, error: [] });
  } catch (error: any) {
    ErrorLog.createErrorLog(error, 'FeeController', getErrorLocation("getAuditLogs"));
    res.status(500).json({ result: false, content: [], error: [error.message] });
  }
};
}