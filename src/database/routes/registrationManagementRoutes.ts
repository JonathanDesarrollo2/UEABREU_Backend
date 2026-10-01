import { Router } from "express";
import { param, body } from "express-validator";
import { requireRegistrationOpen } from "../../middleware/registrationOpen";
import { authsession } from "../../utility/authsession";
import { RegistrationManagementController } from "../../controllers/registrationManagementController";
import { validateRoutes } from "../../middleware/validateRoutes";

const RegistrationManagementRouter = Router();

RegistrationManagementRouter.post('/existing-representative', authsession, requireRegistrationOpen,
  body('studentData').isObject().withMessage('Datos del estudiante requeridos'),
  body('studentData.fullName').notEmpty(),
  body('studentData.identityCard').notEmpty(),
  body('studentData.birthDate').notEmpty(),
  validateRoutes,
  RegistrationManagementController.createForExistingRepresentative
);

// Listar solicitudes
RegistrationManagementRouter.get(
  "/list",
  authsession,
  RegistrationManagementController.listApplications
);

// Descargar PDF
RegistrationManagementRouter.get(
  "/:id/pdf",
  authsession,
  param("id").isUUID().withMessage("ID inválido"),
  validateRoutes,
  RegistrationManagementController.downloadPdf
);

// Activar cuenta
RegistrationManagementRouter.post(
  "/:id/activate",
  authsession,
  param("id").isUUID().withMessage("ID inválido"),
  validateRoutes,
  RegistrationManagementController.activateApplication
);

// Eliminar registro completo
RegistrationManagementRouter.delete(
  "/:id",
  authsession,
  param("id").isUUID().withMessage("ID inválido"),
  validateRoutes,
  RegistrationManagementController.deleteApplication
);

RegistrationManagementRouter.get(
  '/:id/diagnostic-text',
  authsession,
  param('id').isUUID().withMessage('ID inválido'),
  validateRoutes,
  RegistrationManagementController.diagnosticText
);
RegistrationManagementRouter.get(
  "/:id/data",
  authsession,
  param("id").isUUID().withMessage("ID inválido"),
  validateRoutes,
  RegistrationManagementController.getApplicationData
);

RegistrationManagementRouter.put(
  "/:id/update",
  authsession,
  param("id").isUUID().withMessage("ID inválido"),
  validateRoutes,
  RegistrationManagementController.updateApplication
);
export default RegistrationManagementRouter;
