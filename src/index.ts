import server from "./server";
import colors from "colors";
import dotenv from "dotenv";
import { connectToDatabase } from "./database/config";
import { ErrorLog } from "./utility/ErrorLog";
import { getErrorLocation } from "./utility/callerinfo";
import { startDebtScheduler } from "./cron/DebtProcessor";

dotenv.config();
const port = process.env.PORT || 8080;

//#region: Configuración de Reintentos
const MAX_RETRIES = parseInt(process.env.DB_CONNECTION_RETRIES || '3');
const RETRY_DELAY = parseInt(process.env.DB_RETRY_DELAY || '3000');
//#endregion

//#region: Inicialización de Base de Datos
async function initializeDatabase() {
  let attempt = 1;
  const MAX_SAFE_RETRIES = 10;
  const effectiveMaxRetries = Math.min(MAX_RETRIES, MAX_SAFE_RETRIES);
  
  while (attempt <= effectiveMaxRetries) {
    try {
      await connectToDatabase();
      console.log(colors.blue.bold(`✅ Conexión exitosa a la Base de datos (Intento ${attempt})`));
      return true;
    } catch (error: any) {
      const delay = Math.min(RETRY_DELAY * Math.pow(2, attempt - 1), 60000);
      
      console.log(colors.yellow.bold(
        `⚠️  Error conectando la Base de datos, Intento ${attempt}/${effectiveMaxRetries} fallido. ` +
        `Próximo intento en ${delay/1000} segundos. ` +
        `Error: ${error.message}`
      ));
      
      ErrorLog.createErrorLog(
        error, 
        'system', 
        getErrorLocation("index.ts - initializeDatabase")
      );
      
      if (attempt < effectiveMaxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      attempt++;
    }
  }
  
  console.log(colors.red.bold(
    `❌ Error conectando la Base de datos, Máximo de reintentos alcanzado (${effectiveMaxRetries}). `
  ));
  return false;
}
//#endregion

//#region: Inicio del Servidor
async function startServer() {
  try {
    const dbConnected = await initializeDatabase();
    
    if (!dbConnected) {
      console.log(colors.yellow.bold("⚠️  Servidor iniciado SIN conexión a BD - Modo Público"));
    }

    server.listen(port, () => {
    });
    if (dbConnected) {
      startDebtScheduler();
    }

  } catch (error: any) {
    console.log(colors.red.bold(`💥 Error al iniciar servidor: ${error.message}`));
    
    ErrorLog.createErrorLog(
      error, 
      'system', 
      getErrorLocation("index.ts - startServer")
    );
    
    process.exit(1);
  }
}
//#endregion

// Iniciar la aplicación
startServer();