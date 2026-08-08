// src/server.ts
//#region: Importar
import express from "express";  
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { corsConfig } from "./config/cors";
import { ErrorLog } from "./utility/ErrorLog";
import { getErrorLocation } from "./utility/callerinfo";
// Importar rutas
import BankRoutes from "./bank/routes/bank-routes";
import RouterUser from "./database/routes/routeslogin";
import AcademicRouter from "./database/routes/academic-routes";
import BalanceRoutes from "./database/routes/balance-routes";
import routerBlockTime from "./database/routes/blockTimeRoutes";
import PublicRouter from "./database/routes/publicRoutes";
import SettingsRouter from "./database/routes/settingsRoutes";
import RegistrationManagementRouter from "./database/routes/registrationManagementRoutes";
import FeeRoutes from "./database/routes/FeeRoutes";
import SimulationRouter from "./database/routes/SimulationRoutes";

dotenv.config();
//#endregion

//#region: Configuración del Servidor
const server = express();

// Middlewares básicos
server.use(cors(corsConfig));
server.use(express.json());
server.use(express.urlencoded({ extended: true }));

// Middleware CORS adicional para desarrollo (seguridad)
server.use((req, res, next) => {
    const origin = req.headers.origin;
    
    if (process.env.NODE_ENV === 'development') {
        res.header('Access-Control-Allow-Origin', origin || 'http://localhost:5173');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        res.header('Access-Control-Expose-Headers', 'newtoken');
        res.header('Access-Control-Allow-Credentials', 'true');
        
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
    }
    
    next();
});
//#endregion

//#region: Rutas de la API
// Rutas Públicas existentes (login sin autenticación)
server.use('/api/public/login', RouterUser);

// ⭐ NUEVO: Rutas públicas para registro y verificación de correo
server.use('/api/public', PublicRouter);

// Rutas del Banco
server.use('/api/bank', BankRoutes);

// Rutas Privadas (con autenticación)
server.use('/api/private/user', RouterUser);
server.use('/api/private/academic', AcademicRouter);
server.use('/api/private/balance', BalanceRoutes);
server.use('/api/private/block', routerBlockTime);
server.use('/api/private/registrations', RegistrationManagementRouter);
server.use('/api/private/fees', FeeRoutes);
server.use('/api/test', SimulationRouter);

// ⭐ NUEVO: Rutas administrativas para settings (activar/desactivar inscripciones)
server.use('/api/private/settings', SettingsRouter);

// Health check actualizado
server.get('/api/', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'Sistema Académico funcionando',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        services: {
            academic: 'Operational',
            bank: 'Available at /api/bank',
            balance: 'Available at /api/private/balance',
            user: 'Available at /api/private/user',
            config: 'Available at /api/private/block',
            auth: 'Available at /api/public/login',
            publicRegister: 'Available at /api/public/register',
            publicVerify: 'Available at /api/public/verify-email',
            settings: 'Available at /api/private/settings'
        },
        endpoints: {
            health: '/api/',
            user_stats: '/api/private/user/statistics',
            balance_stats: '/api/private/balance/statistics/financial',
            teachers: '/api/private/academic/teacher/list',
            students: '/api/private/user/students/list',
            block_times: '/api/private/block/block-times',
            toggle_registrations: '/api/private/settings/registrations/toggle',
            registration_status: '/api/private/settings/registrations'
        }
    });
});

// Ruta para verificar CORS
server.get('/api/cors-test', (req, res) => {
    res.json({
        message: 'CORS funcionando correctamente',
        origin: req.headers.origin,
        allowed: true,
        timestamp: new Date().toISOString()
    });
});
//#endregion

//#region: Manejo de Errores
// Manejo de errores no capturados
server.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    ErrorLog.createErrorLog(
        err, 
        'system',
        getErrorLocation("server.ts")
    );
    
    res.status(500).json({ 
        result: false,
        content: [],
        error: [
            process.env.NODE_ENV === 'development' 
                ? `Error interno del servidor: ${err.message}`
                : 'Error interno del servidor. Contacte al administrador'
        ]
    });
});

// Ruta 404 - No encontrada
server.use('*', (req, res) => {
    res.status(404).json({ 
        result: false,
        content: [],
        error: ["Ruta no encontrada"],
        path: req.originalUrl,
        availableEndpoints: {
            root: '/',
            api: '/api/',
            bank: '/api/bank/*',
            balance: '/api/private/balance/*',
            user: '/api/private/user/*',
            academic: '/api/private/academic/*',
            config: '/api/private/block/*',
            cors_test: '/api/cors-test',
            public: '/api/public/register, /api/public/verify-email',
            settings: '/api/private/settings/registrations'
        }
    });
});
//#endregion

export default server;