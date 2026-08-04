import { Router } from "express";
import { body } from "express-validator";
import { authsession } from "../../utility/authsession";
import { SettingsController } from "../../controllers/settingsController";
import { validateRoutes } from "../../middleware/validateRoutes";

const SettingsRouter = Router();

// Obtener estado actual (protegido, solo admin)
SettingsRouter.get('/registrations', authsession, SettingsController.getRegistrationStatus);

// Activar/Desactivar (requiere nivel administrador)
SettingsRouter.post('/registrations/toggle',
  authsession,
  body('enable').isBoolean().withMessage('enable debe ser booleano'),
  validateRoutes,
  SettingsController.toggleRegistrations
);

export default SettingsRouter;