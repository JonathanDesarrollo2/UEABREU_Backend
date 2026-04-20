import { Router } from "express";
import { body, query } from "express-validator";
import { validateRoutes } from "../../middleware/validateRoutes";
import { authsession } from "../../utility/authsession";
import { BlockTimeConfigController } from "../../controllers/blogTimeConfigController";

const routerBlockTime = Router();

routerBlockTime.get('/block-times',
  authsession,
  query('grade').notEmpty().withMessage('Grado requerido'),
  query('section').notEmpty().withMessage('Sección requerida'),
  validateRoutes,
  BlockTimeConfigController.getBlockTimes
);

routerBlockTime.post('/block-times',
  authsession,
  body('grade').notEmpty().withMessage('Grado requerido'),
  body('section').notEmpty().withMessage('Sección requerida'),
  body('blocks').isArray({ min: 1 }).withMessage('Debe enviar un array de bloques'),
  body('blocks.*.blockNumber').isInt({ min: 1, max: 9 }).withMessage('Número de bloque inválido'),
  body('blocks.*.startTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Formato de hora inválido (HH:mm)'),
  body('blocks.*.endTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Formato de hora inválido (HH:mm)'),
  validateRoutes,
  BlockTimeConfigController.saveBlockTimes
);

routerBlockTime.post('/block-times/reset',
  authsession,
  body('grade').notEmpty().withMessage('Grado requerido'),
  body('section').notEmpty().withMessage('Sección requerida'),
  validateRoutes,
  BlockTimeConfigController.resetToDefault
);

routerBlockTime.get('/block-times/all',
  authsession,
  BlockTimeConfigController.getAllConfigs
);

export default routerBlockTime;