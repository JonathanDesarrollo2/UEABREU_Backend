import { Request, Response } from 'express';
import UserLogin from '../database/models/userlogin';
import { BillingService } from '../services/billingServices';
import { ErrorLog } from '../utility/ErrorLog';
import { getErrorLocation } from '../utility/callerinfo';

export class AdminRunProntoPagoController {
  static run = async (req: Request, res: Response) => {
    try {
      const adminId = req.tokenData?.id;
      if (!adminId) return res.status(401).json({ result: false, content: [], error: ['No autenticado'] });

      const admin = await UserLogin.findByPk(adminId);
      if (!admin) return res.status(404).json({ result: false, content: [], error: ['Usuario no encontrado'] });
      if (admin.nivel !== 2) return res.status(403).json({ result: false, content: [], error: ['Solo admin nivel 2'] });

      const { password } = req.body as { password?: string };
      if (!password) return res.status(400).json({ result: false, content: [], error: ['Contraseña requerida'] });

      const ok = await admin.comparePassword(password);
      if (!ok) return res.status(403).json({ result: false, content: [], error: ['Contraseña incorrecta'] });

      await BillingService.applyProntoPagoRecargo(true); // force=true
      return res.json({
        result: true,
        content: ['Recargo por pronto pago ejecutado. Revisa los logs del servidor para ver cuántos se aplicaron.'],
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'AdminRunProntoPagoController', getErrorLocation('run'));
      return res.status(500).json({ result: false, content: [], error: [error.message] });
    }
  };
}