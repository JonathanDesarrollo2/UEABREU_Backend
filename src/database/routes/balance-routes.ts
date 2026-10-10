// src/routes/balance-routes.ts
import { Router } from "express";
import { body, param, query } from "express-validator";
import { validateRoutes } from "../../middleware/validateRoutes";
import { BalanceController } from "../../controllers/balance-controller";
import { authsession } from "../../utility/authsession";
import { PaymentMethod, TransactionType, TransactionStatus } from "../../database/models/transaction";
import { User } from "../../controllers/UserController";
import { TransactionDeleteController } from "../../controllers/transaction-delete-controller";
import { TransactionReferenceGuardController } from "../../controllers/transaction-reference-guard-controller";
import { AdminBackfillController } from "../../controllers/admin-backfill-controller";
const router = Router();

// ========== REPRESENTANTES CON FILTROS ==========
router.get('/representatives',
  authsession,
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 1000 }).toInt(),
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
  body('studentId').optional().isUUID().withMessage('ID de estudiante inválido'),
  body('paymentDate').notEmpty().isISO8601().withMessage('La fecha del pago es obligatoria'),
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
  body('paymentDate').notEmpty().isISO8601().withMessage('La fecha del pago es obligatoria'),
  body('studentId').optional().isUUID().withMessage('ID de estudiante inválido'),
  validateRoutes,
  BalanceController.manualWithdrawal
);

// Tasa BCV registrada para una fecha valor exacta (YYYY-MM-DD)
router.get('/rate/:date',
  authsession,
  param('date').isISO8601().withMessage('Fecha inválida'),
  validateRoutes,
  BalanceController.getRateByDate
);

// ========== VERIFICACIONES ==========
router.get('/check-payment',
  authsession,
  query('reference').notEmpty().withMessage('La referencia es requerida'),
  query('representativeId').notEmpty().withMessage('El ID del representante es requerido'),
  validateRoutes,
  BalanceController.checkPaymentExists
);

// 🆕 NUEVO: verifica duplicado por los ÚLTIMOS 6 DÍGITOS de la referencia
router.get('/check-reference-key',
  authsession,
  query('reference').notEmpty().withMessage('La referencia es requerida'),
  validateRoutes,
  TransactionReferenceGuardController.checkReferenceKey
);

router.get('/statistics',
  authsession,
  User.getUserStatistics
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

// Transacciones recientes (para dashboard)
router.get('/transactions/recent',
  authsession,
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  validateRoutes,
  BalanceController.getRecentTransactions
);

router.get('/representative-by-email',
  BalanceController.getRepresentativeByEmail
);

router.get('/transactions',
  authsession,
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('representativeId').optional().isUUID(),
  query('studentId').optional().isUUID(),
  query('type').optional().isIn(['deposit', 'withdrawal', 'payment', 'fee', 'adjustment']),
  query('status').optional().isIn(['pending', 'completed', 'cancelled', 'failed', 'reversed']),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('search').optional().isString(),
  query('createdByRole').optional().isIn(['admin', 'representative', 'system']),
  query('balanceStatus').optional().isIn(['all', 'debtors', 'creditors']),
  query('studentGrade').optional().isString(),
  query('studentSection').optional().isString(),
  query('sortBy').optional().isIn(['createdAt', 'amount', 'type', 'student.fullName']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
  validateRoutes,
  BalanceController.getAllTransactions
);

router.get('/representative/:id/account-statement',
  authsession,
  param('id').isUUID().withMessage('ID inválido'),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('studentId').optional().isUUID(),
  validateRoutes,
  BalanceController.getAccountStatement
);

router.post('/transaction/move',
  authsession,
  body('transactionId').isUUID().withMessage('ID de transacción inválido'),
  body('targetStudentId').isUUID().withMessage('ID de estudiante destino inválido'),
  validateRoutes,
  BalanceController.movePaymentBetweenStudents
);

// ========== ELIMINAR TRANSACCIÓN (SOLO ADMIN NIVEL 2) ==========
router.post('/transaction/:transactionId/delete',
  authsession,
  param('transactionId').isUUID().withMessage('ID de transacción inválido'),
  body('password').notEmpty().withMessage('Contraseña requerida'),
  validateRoutes,
  TransactionDeleteController.deleteTransaction
);

// ========== RANKING DE ESTUDIANTES ==========
router.get('/students-ranking',
  authsession,
  query('type').optional().isIn(['debtors', 'creditors', 'all']),
  query('search').optional().isString(),
  query('representativeId').optional().isUUID(),
  query('grade').optional().isString(),
  query('section').optional().isString(),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sortOrder').optional().isIn(['asc', 'desc']),
  validateRoutes,
  BalanceController.getStudentsRanking
);
// ========== BACKFILL: mensualidad del mes en curso (solo admin nivel 2) ==========
// Corrige estudiantes activados que no pasaron por BillingService.
// Ejecutar primero en 'preview' para revisar la lista, luego en 'apply'.
router.post('/admin/backfill-current-month-fee',
  authsession,
  body('mode').isIn(['preview', 'apply']).withMessage('mode debe ser "preview" o "apply"'),
  body('password').notEmpty().withMessage('Contraseña requerida'),
  body('studentIds').optional().isArray().withMessage('studentIds debe ser un array'),
  validateRoutes,
  AdminBackfillController.backfillCurrentMonthFee
);
export default router;