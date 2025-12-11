// src/routes/balance-routes.ts
import { Router } from "express";
import { body, param, query } from "express-validator"; 
import { validateRoutes } from "../../middleware/validateRoutes";
import { BalanceController } from "../../controllers/balance-controller";
import { authsession } from "../../utility/authsession";
import { PaymentMethod, TransactionType, TransactionStatus } from "../../database/models/transaction";

const router = Router();

// ========== REPRESENTANTES CON FILTROS ==========
router.get('/representatives',
  authsession,
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('fullName').optional().isString(),
  query('identityCard').optional().isString(),
  query('relationship').optional().isIn(['padre', 'madre', 'tutor', 'abuelo', 'otro']),
  query('balanceStatus').optional().isIn(['debt', 'zero', 'credit']),
  query('minBalance').optional().isFloat().toFloat(),
  query('maxBalance').optional().isFloat().toFloat(),
  query('hasDebt').optional().isIn(['true', 'false']),
  query('hasCredit').optional().isIn(['true', 'false']),
  query('hasStudents').optional().isIn(['true', 'false']),
  query('activeOnly').optional().isBoolean(),
  query('search').optional().isString(),
  query('sortBy').optional().isIn(['balance', 'fullName', 'createdAt', 'debtAmount']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
  validateRoutes,
  BalanceController.listRepresentatives
);

// Top 10 deudores
router.get('/representatives/top-debtors',
  authsession,
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  validateRoutes,
  BalanceController.getTopDebtors
);

// Top 10 con más saldo
router.get('/representatives/top-creditors',
  authsession,
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  validateRoutes,
  BalanceController.getTopCreditors
);

// ========== BALANCE INDIVIDUAL ==========
router.get('/representative/:id/balance',
  authsession,
  param('id').isUUID().withMessage('ID inválido'),
  validateRoutes,
  BalanceController.getBalance
);

// ========== TRANSACCIONES ==========
router.get('/representative/:id/transactions',
  authsession,
  param('id').isUUID().withMessage('ID inválido'),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('type').optional().isIn(Object.values(TransactionType)),
  query('status').optional().isIn(Object.values(TransactionStatus)),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  validateRoutes,
  BalanceController.getTransactionHistory
);

// Depósito manual
router.post('/representative/:id/deposit',
  authsession,
  param('id').isUUID().withMessage('ID inválido'),
  body('amount')
    .notEmpty().withMessage('El monto es requerido')
    .isFloat({ min: 0.01 }).withMessage('El monto debe ser mayor a 0'),
  body('description').optional().isString().isLength({ max: 500 }),
  body('paymentMethod').optional().isIn(Object.values(PaymentMethod)),
  body('reference').optional().isString(),
  body('createdBy').optional().isUUID(),
  validateRoutes,
  BalanceController.manualDeposit
);

// Retiro manual
router.post('/representative/:id/withdraw',
  authsession,
  param('id').isUUID().withMessage('ID inválido'),
  body('amount')
    .notEmpty().withMessage('El monto es requerido')
    .isFloat({ min: 0.01 }).withMessage('El monto debe ser mayor a 0'),
  body('description').optional().isString().isLength({ max: 500 }),
  body('paymentMethod').optional().isIn(Object.values(PaymentMethod)),
  body('reference').optional().isString(),
  body('createdBy').optional().isUUID(),
  validateRoutes,
  BalanceController.manualWithdrawal
);

// ========== VERIFICACIONES ==========
router.get('/check-payment',
  authsession,
  query('reference').notEmpty().withMessage('La referencia es requerida'),
  query('representativeId').notEmpty().withMessage('El ID del representante es requerido'),
  validateRoutes,
  BalanceController.checkPaymentExists
);

router.get('/transaction-status',
  authsession,
  query('reference').notEmpty().withMessage('La referencia es requerida'),
  query('bankCode').notEmpty().withMessage('El código de banco es requerido'),
  query('accountNumber').optional().isString(),
  query('amount').optional().isFloat({ min: 0.01 }),
  validateRoutes,
  BalanceController.getTransactionStatus
);

// ========== ESTADÍSTICAS ==========
router.get('/statistics/financial',
  authsession,
  BalanceController.getFinancialStatistics
);

export default router;