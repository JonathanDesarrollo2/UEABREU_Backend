import { Router } from "express";
import { body } from "express-validator";
import { requireRegistrationOpen } from "../../middleware/registrationOpen";
import { validateRoutes } from "../../middleware/validateRoutes";
import { PublicController } from "../../controllers/publicController";

const PublicRouter = Router();

// Registro público (requiere inscripciones abiertas)
PublicRouter.post('/register',
  requireRegistrationOpen, // 🔒 middleware de apertura
  body('usermail').isEmail().withMessage('Email válido requerido'),
  body('userlogin').isLength({ min: 4 }).withMessage('Login requerido (mínimo 4 caracteres)'),
  body('userpass').isLength({ min: 6 }).withMessage('Contraseña requerida (mínimo 6 caracteres)'),
  body('userrepass').isLength({ min: 6 }).withMessage('Confirmación requerida'),
  body('representativeData').notEmpty().withMessage('Datos del representante requeridos'),
  body('representativeData.fullName').notEmpty(),
  body('representativeData.identityCard').notEmpty(),
  body('studentsData').isArray(),
  validateRoutes,
  PublicController.register
);

// Verificación de correo (siempre disponible)
PublicRouter.post('/verify-email',
  body('email').isEmail().withMessage('Email válido requerido'),
  body('code').isLength({ min: 5, max: 5 }).withMessage('Código de 5 dígitos requerido'),
  validateRoutes,
  PublicController.verifyEmail
);

PublicRouter.get('/registration-status', PublicController.getRegistrationStatus);

export default PublicRouter;