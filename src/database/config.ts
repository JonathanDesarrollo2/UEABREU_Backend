import { Sequelize } from "sequelize-typescript";
import dotenv from "dotenv";
import colors from "colors";
import path from "path";

dotenv.config();

const {
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  NODE_ENV,
  DB_PORT,
  DB_HOST
} = process.env;

let sequelize: Sequelize;

if (NODE_ENV === 'production') {
  // ✅ CONFIGURACIÓN PARA PRODUCCIÓN (Cloud Run + Render) - IGUAL que tu padre
  sequelize = new Sequelize(DB_NAME!, DB_USER!, DB_PASSWORD!, {
    dialect: 'postgres',
    host: DB_HOST,
    port: parseInt(DB_PORT || '5432', 10),
    models: [path.join(__dirname, "./models/**/*.ts"), path.join(__dirname, "./models/**/*.js")],
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
    logging: false // Desactiva logs SQL en producción
  });
  console.log(colors.green.bold("✅ Sequelize configurado para PRODUCCIÓN (Render + SSL)."));

} else {
  // ✅ CONFIGURACIÓN PARA DESARROLLO LOCAL
  sequelize = new Sequelize({
    dialect: 'postgres',
    host: DB_HOST || 'localhost',
    port: parseInt(DB_PORT || '5434', 10), // Usa tu puerto local 5434
    username: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    models: [path.join(__dirname, "./models/**/*.ts"), path.join(__dirname, "./models/**/*.js")],
    logging: console.log, // Muestra SQL en desarrollo
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    },
  });
  console.log(colors.green.bold("✅ Sequelize configurado para DESARROLLO LOCAL."));
}

export const connectToDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log(colors.green.bold('✅ Conexión a PostgreSQL establecida.'));

    // ⚠️ SOLO sincronizar en desarrollo (igual que tu padre)
    if (process.env.NODE_ENV !== 'production') {
      await sequelize.sync({ alter: true });
      console.log(colors.green.bold('✅ Modelos sincronizados (solo desarrollo).'));
    }
    // En producción NO se ejecuta sync(). Las tablas deben crearse manualmente.
    
  } catch (error: any) {
    console.error(colors.red.bold('❌ Error conectando a la base de datos:'), error.message);
    throw error;
  }
};

export default sequelize;