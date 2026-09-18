import { Router } from 'express';
import { query } from 'express-validator';
import { authsession } from '../../utility/authsession';
import { validateRoutes } from '../../middleware/validateRoutes';
import ExchangeRate from '../models/exchangeRate';

const router = Router();

router.get('/', authsession, query('date').optional().isISO8601(), validateRoutes, async (req, res) => {
  try {
    const date = String(req.query.date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }));
    const rate = await ExchangeRate.findOne({ where: { effectiveDate: date } });
    if (!rate) return res.status(404).json({ result: false, content: [], error: [`No existe una tasa registrada para ${date}`] });
    return res.json({ result: true, content: { PriceRateBCV: Number(rate.rate), dtRate: rate.effectiveDate }, error: [] });
  } catch {
    return res.status(500).json({ result: false, content: [], error: ['Error al obtener la tasa histórica'] });
  }
});

export default router;
