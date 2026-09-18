import { Router } from 'express';
import { query } from 'express-validator';
import { authsession } from '../../utility/authsession';
import { validateRoutes } from '../../middleware/validateRoutes';
import ExchangeRate from '../models/exchangeRate';
import { Op } from 'sequelize';
import { BillingService } from '../../services/billingServices';

const router = Router();

router.get('/', authsession, query('date').optional().isISO8601(), validateRoutes, async (req, res) => {
  try {
    const requestedDate = req.query.date ? String(req.query.date) : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
    const rate = await ExchangeRate.findOne({
      where: req.query.date ? { effectiveDate: requestedDate } : { effectiveDate: { [Op.lte]: requestedDate } },
      order: [['effectiveDate', 'DESC']]
    });
    const resolvedRate = rate || (!req.query.date ? await BillingService.ensureCurrentRate() : null);
    if (!resolvedRate) return res.status(404).json({ result: false, content: [], error: [`No existe una tasa registrada para ${requestedDate}`] });
    return res.json({ result: true, content: { PriceRateBCV: Number(resolvedRate.rate), dtRate: resolvedRate.effectiveDate }, error: [] });
  } catch {
    return res.status(500).json({ result: false, content: [], error: ['Error al obtener la tasa histórica'] });
  }
});

export default router;
