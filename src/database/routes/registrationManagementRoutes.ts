import { Router } from "express";
import { param } from "express-validator";
import { authsession } from "../../utility/authsession";
import { RegistrationManagementController } from "../../controllers/registrationManagementController";
import { validateRoutes } from "../../middleware/validateRoutes";

const RegistrationManagementRouter = Router();

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