import { Router } from "express";
import { body, param } from "express-validator";
import { authsession } from "../../utility/authsession";
import { FeeController } from "../../controllers/FeeController";
import { validateRoutes } from "../../middleware/validateRoutes";

const FeeRoutes = Router();

FeeRoutes.get('/fees',
  authsession,
  FeeController.getFees
);

FeeRoutes.put('/fees/:schoolYear',
  authsession,
  param('schoolYear').isString().withMessage('Año escolar requerido'),
  body('inscriptionFeeUSD').isNumeric().withMessage('Valor numérico requerido'),
  body('monthlyFeeUSD').isNumeric().withMessage('Valor numérico requerido'),
  body('prontoPagoDiscount').isNumeric().withMessage('Valor numérico requerido'),
  body('prontoPagoDeadlineDay').isInt({ min: 1, max: 31 }).withMessage('Día entre 1 y 31'),
  body('administrativeFeeUSD').isNumeric().withMessage('Valor numérico requerido'),
  body('august2027HalfPaymentUSD').isNumeric().withMessage('Valor numérico requerido'),
  body('monthlyFeeStartDate').isISO8601().withMessage('Fecha válida requerida'),
  body('inscriptionStartDate').isISO8601().withMessage('Fecha válida requerida'),
  body('inscriptionEndDate').isISO8601().withMessage('Fecha válida requerida'),
  validateRoutes,
  FeeController.updateFees
);

export default FeeRoutes;