// src/database/routes/exchange-rate-routes.ts
import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authsession } from '../../utility/authsession';
import { validateRoutes } from '../../middleware/validateRoutes';
import ExchangeRate from '../models/exchangeRate';
import { Op } from 'sequelize';
import { BillingService } from '../../services/billingServices';
import { ExchangeRateController } from '../../controllers/exchangeRate-controller';

const router = Router();

// Ruta existente: tasa por fecha exacta o última disponible
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

// NUEVO: todas las tasas de un mes (?year=YYYY&month=MM)
router.get(
  '/month',
  authsession,
  query('year')
    .notEmpty().withMessage('El año es requerido')
    .isInt({ min: 2024, max: 2100 }).withMessage('Año inválido')
    .toInt(),
  query('month')
    .notEmpty().withMessage('El mes es requerido')
    .isInt({ min: 1, max: 12 }).withMessage('Mes inválido')
    .toInt(),
  validateRoutes,
  ExchangeRateController.getRatesByMonth
);

// NUEVO: editar la tasa de un registro (solo `rate`)
router.put(
  '/:id',
  authsession,
  param('id').isUUID().withMessage('ID inválido'),
  body('rate')
    .notEmpty().withMessage('La tasa es requerida')
    .isFloat({ gt: 0 }).withMessage('La tasa debe ser mayor a 0'),
  validateRoutes,
  ExchangeRateController.updateRate
);

export default router;