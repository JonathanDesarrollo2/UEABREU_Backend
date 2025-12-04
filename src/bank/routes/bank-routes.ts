// src/bank/routes/bank-routes.ts
import { Router } from 'express';
import { BankController } from '../controllers/bank-controller';
import { body } from 'express-validator';
import { validateRoutes } from '../../middleware/validateRoutes';

const router = Router();
const bankController = new BankController();

// Rutas públicas del banco
router.get('/welcome', bankController.getBankWelcome);
router.get('/test-connection', bankController.testBankConnection);
router.get('/health', bankController.getBankHealth);
router.get('/full-status', bankController.getBankFullStatus);

// Autenticación
router.post('/logon', bankController.bankLogOn);

// Validación en cascada (PRINCIPAL)
router.post('/cascaded-validation',
  [
    body('AccountNumber').notEmpty().isString().withMessage('AccountNumber es requerido'),
    body('BankCode').isInt({ min: 1 }).withMessage('BankCode debe ser un número entero mayor a 0'),
    body('PhoneNumber').notEmpty().isString().withMessage('PhoneNumber es requerido'),
    body('ClientID').notEmpty().isString().withMessage('ClientID es requerido'),
    body('Reference').notEmpty().isString().withMessage('Reference es requerido'),
    body('RequestDate').notEmpty().isString().withMessage('RequestDate es requerido'),
    body('Amount').isNumeric().withMessage('Amount debe ser un número')
  ],
  validateRoutes,
  bankController.cascadedValidation
);

// Validaciones individuales
router.post('/validate-p2p',
  [
    body('AccountNumber').notEmpty().isString(),
    body('BankCode').isInt({ min: 1 }),
    body('PhoneNumber').notEmpty().isString(),
    body('ClientID').notEmpty().isString(),
    body('Reference').notEmpty().isString(),
    body('RequestDate').notEmpty().isString(),
    body('Amount').isNumeric()
  ],
  validateRoutes,
  bankController.validateP2P
);

router.post('/validate-reference',
  [
    body('ClientID').notEmpty().isString(),
    body('AccountNumber').notEmpty().isString(),
    body('Reference').notEmpty().isString(),
    body('Amount').isNumeric(),
    body('DateMovement').notEmpty().isString()
  ],
  validateRoutes,
  bankController.validateReference
);

router.post('/validate-existence',
  [
    body('AccountNumber').notEmpty().isString(),
    body('BankCode').isInt({ min: 1 }),
    body('PhoneNumber').notEmpty().isString(),
    body('ClientID').notEmpty().isString(),
    body('RequestDate').notEmpty().isString(),
    body('Amount').isNumeric()
  ],
  validateRoutes,
  bankController.validateExistence
);

export default router;