import { Router } from "express";
import { body, query } from "express-validator"; 
import { validateRoutes } from "../../middleware/validateRoutes";
import { User } from "../../controllers/UserController"; // Ajusta la ruta según tu estructura
import { loginLimiter } from "../../utility/loginLimiter";
import { authsession } from "../../utility/authsession";

const RouterUser = Router();

// Crear usuario
RouterUser.post('/adduser' 

    ,body('usermail')
        .notEmpty().withMessage('Es requerido ingresar el email del Usuario')
        .isEmail().withMessage('Es requerido ingresar un Email Valido')
        .isLength({ min: 8, max: 250 }).withMessage('El Email debe contener entre 8 y 250 caracteres')
    ,body('userlogin')
        .notEmpty().withMessage('Es requerido ingresar el login del Usuario')
        .isLength({ min: 4, max: 100 }).withMessage('El login debe contener entre 4 y 100 caracteres')
    ,body('username')
        .optional()
        .isLength({ min: 4, max: 200 }).withMessage('El nombre debe contener entre 4 y 200 caracteres')
    ,body('userpass')
        .notEmpty().withMessage('Es requerido ingresar la contraseña del Usuario')
        .isLength({min:6, max: 200 }).withMessage('Es requerido una contraseña con minimo 6 caracteres')
    ,body('userrepass')
        .notEmpty().withMessage('Es requerido ingresar la contraseña de confirmación del Usuario')
        .isLength({min:6, max: 200 }).withMessage('Es requerido una contraseña con minimo 6 caracteres')
    ,body('nivel')
        .optional()
        .isInt({ min: 1 }).withMessage('El nivel debe ser un número entero mayor a 0')
    ,User.adduser
);

// Lista paginada de usuarios
RouterUser.get('/listpag',
    authsession,
    query('page')
        .optional()
        .isNumeric().withMessage('La página debe ser un valor numérico')
        .toInt(),
    query('limit')
        .optional()
        .isNumeric().withMessage('El límite debe ser un valor numérico')
        .toInt(),
    query('idBus')
        .optional()
        .isNumeric().withMessage('La idBus debe ser un valor numérico')
        .toInt(),
    query('DeBus')
        .optional()
        .isString().withMessage('El parámetro de búsqueda debe ser un texto'),
    validateRoutes,
    User.getPaginatedlogin
);

// Eliminar usuario
RouterUser.post('/removelogin',
    authsession,
    body('id')
        .notEmpty().withMessage('Es requerido ingresar el id del Usuario'),
    body('userlogin')
        .notEmpty().withMessage('Es requerido ingresar el login del Usuario'),
    validateRoutes,
    User.removelogin
);

// Actualizar usuario
RouterUser.post('/updatelogin',
    authsession,
    body('id')
        .notEmpty().withMessage('Es requerido ingresar el id del Usuario'),
    body('usermail')
        .optional()
        .isEmail().withMessage('Debe ser un email válido')
        .isLength({ min: 8, max: 250 }).withMessage('El Email debe contener entre 8 y 250 caracteres'),
    body('userlogin')
        .optional()
        .isLength({ min: 4, max: 100 }).withMessage('El login debe contener entre 4 y 100 caracteres'),
    body('username')
        .optional()
        .isLength({ min: 4, max: 200 }).withMessage('El nombre debe contener entre 4 y 200 caracteres'),
    body('userpass')
        .optional()
        .isLength({min:6, max: 200 }).withMessage('La contraseña debe tener mínimo 6 caracteres'),
    body('userstatus')
        .optional()
        .isBoolean().withMessage('El estado debe ser un valor booleano'),
    body('nivel')
        .optional()
        .isInt({ min: 1 }).withMessage('El nivel debe ser un número entero mayor a 0'),
    validateRoutes,
    User.updatelogin
);

// Iniciar sesión
RouterUser.post('/privateauth',
    //loginLimiter,
    body('usermail')
        .notEmpty().withMessage('Es requerido ingresar el correo del usuario')
        .isEmail().withMessage('Debe ser un email válido'),
    body('userpass')
        .notEmpty().withMessage('Es requerido ingresar la contraseña'),
    //validateRoutes,
    User.SesionIn
);

// Usuario activo en sesión
RouterUser.get('/onsession'
    , authsession
    , User.UserActive
);

// Estadísticas del sistema
RouterUser.get('/statistics'
    , authsession
    , User.getStatistics
);

export default RouterUser;