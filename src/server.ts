// src/routes/index.ts
//#region: Importar
import express from "express";  
import colors from "colors";
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
import BalanceRoutes from "./database/routes/balance-routes"; // <-- AGREGAR ESTA LÍNEA
// import NotificationRoutes from "../bank/routes/notification-routes"; // COMENTADO POR AHORA

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
// Rutas Públicas (sin autenticación)
server.use('/api/public/login', RouterUser);

// 👇 RUTAS DEL BANCO (SOLO LAS ESENCIALES)
server.use('/api/bank', BankRoutes);

// En server.ts, en la sección de rutas privadas
server.use('/api/private/user', RouterUser);
server.use('/api/private/academic', AcademicRouter);
server.use('/api/private/balance', BalanceRoutes);

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
            auth: 'Available at /api/public/login'
        },
        endpoints: {
            health: '/api/',
            user_stats: '/api/private/user/statistics',
            balance_stats: '/api/private/balance/statistics/financial',
            teachers: '/api/private/academic/teacher/list',
            students: '/api/private/user/students/list'
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
    console.error(colors.red.bold(`💥 Error no manejado: ${err.message}`));
    console.error(err.stack);
    
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
            balance: '/api/private/balance/*', // <-- AGREGAR ESTE
            user: '/api/private/user/*',
            academic: '/api/private/academic/*',
            cors_test: '/api/cors-test'
        }
    });
});
//#endregion

export default server;