import { Sequelize } from 'sequelize-typescript';
import dotenv from 'dotenv';

dotenv.config();

// src/database/config.ts
const sequelize = new Sequelize({
  database: process.env.DB_NAME || 'sistema_academico',
  username: process.env.DB_USER || 'postgres',
  // ⬇️ CAMBIA ESTA LÍNEA (de DB_PASS a DB_PASSWORD) ⬇️
  password: process.env.DB_PASSWORD || 'postgres', 
  // ⬆️ Asegúrate que coincide con cloudbuild.yaml ⬆️
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  dialect: 'postgres',
  models: [__dirname + '/models'],
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  // ✅ Asegúrate de que esta parte para SSL también está presente
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

export const connectToDatabase = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexión a PostgreSQL establecida correctamente.');
    
    // Sincronizar modelos (en desarrollo)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      console.log('✅ Modelos sincronizados.');
    }
  } catch (error) {
    console.error('❌ Error conectando a la base de datos:', error);
    throw error;
  }
};

export default sequelize;