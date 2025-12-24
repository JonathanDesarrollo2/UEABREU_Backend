import { Sequelize } from "sequelize-typescript";  // ¡IMPORTANTE!
import dotenv from "dotenv";
import colors from "colors";
import path from "path";

// Importa TODOS tus modelos
import UserLogin from "./models/userlogin";
import Student from "./models/student";
import Representative from "./models/representative";
import Transaction from "./models/transaction";

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

// Configuración de Sequelize con sequelize-typescript
if (NODE_ENV === 'production') {
  // Para Render (PRODUCCIÓN)
  sequelize = new Sequelize({
    database: DB_NAME,
    username: DB_USER,
    password: DB_PASSWORD,
    host: DB_HOST,
    port: parseInt(DB_PORT || '5432', 10),
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    models: [UserLogin, Student, Representative, Transaction], // ¡Modelos REGISTRADOS!
    logging: console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
  
  console.log(colors.green.bold("✅ Sequelize-typescript configurado para PRODUCCIÓN (Render)"));

} else {
  // Para desarrollo local
  sequelize = new Sequelize({
    database: DB_NAME,
    username: DB_USER,
    password: DB_PASSWORD,
    host: DB_HOST || 'localhost',
    port: parseInt(DB_PORT || '5434', 10),
    dialect: 'postgres',
    models: [UserLogin, Student, Representative, Transaction], // ¡Modelos REGISTRADOS!
    logging: console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });
  
  console.log(colors.green.bold("✅ Sequelize-typescript configurado para DESARROLLO LOCAL"));
}

export const connectToDatabase = async () => {
  try {
    console.log(colors.yellow.bold("🚀 Conectando a la base de datos..."));
    console.log(colors.gray(`   Host: ${DB_HOST}:${DB_PORT}`));
    console.log(colors.gray(`   Base de datos: ${DB_NAME}`));
    
    // 1. Autenticar conexión
    await sequelize.authenticate();
    console.log(colors.green.bold('✅ Conexión a PostgreSQL establecida.'));

    // 2. Sincronizar modelos (¡CREA LAS TABLAS AUTOMÁTICAMENTE!)
    console.log(colors.yellow.bold('🔄 Sincronizando modelos...'));
    
    if (NODE_ENV === 'production') {
      // En producción: sync sin alter (más seguro para empezar)
      await sequelize.sync();
      console.log(colors.green.bold('✅ Tablas creadas/verificadas en Render.'));
      
      // Verificar que userlogin tiene datos
      const userCount = await UserLogin.count();
      if (userCount === 0) {
        console.log(colors.cyan.bold('👑 Creando usuario admin por defecto...'));
        await UserLogin.create({
          usermail: 'admin@ueabreu.edu',
          userlogin: 'admin',
          username: 'Administrador',
          userpass: 'admin123',
          userstatus: true,
          nivel: 99
        });
        console.log(colors.green.bold('✅ Usuario admin creado.'));
      }
    } else {
      // En desarrollo: sync con alter (para cambios durante desarrollo)
     // await sequelize.sync({ alter: true });
      console.log(colors.green.bold('✅ Modelos sincronizados (desarrollo).'));
    }
    
    console.log(colors.green.bold('🎉 Base de datos lista!'));
    
  } catch (error: any) {
    console.error(colors.red.bold('❌ Error conectando a la base de datos:'), error.message);
    
    // Diagnóstico detallado
    if (error.original) {
      console.error('- Error original:', error.original.message);
      console.error('- Código:', error.original.code);
    }
    
    // Sugerencias según el error
    if (error.message.includes('password authentication')) {
      console.log(colors.yellow('\n💡 SUGERENCIA: Verifica usuario/contraseña en .env'));
    }
    if (error.message.includes('getaddrinfo')) {
      console.log(colors.yellow('\n💡 SUGERENCIA: No se puede resolver el host. Verifica DB_HOST'));
    }
    if (error.message.includes('Connection refused')) {
      console.log(colors.yellow('\n💡 SUGERENCIA: PostgreSQL no está corriendo o el puerto es incorrecto'));
    }
    if (error.message.includes('database') && error.message.includes('does not exist')) {
      console.log(colors.yellow('\n💡 SUGERENCIA: La base de datos no existe. Crea la BD primero'));
    }
    
    throw error;
  }
};

export default sequelize;