import { Sequelize } from "sequelize-typescript";
import dotenv from "dotenv";
import colors from "colors";
import path from "path";

// Importa TODOS tus modelos (AGREGA LOS NUEVOS)
import UserLogin from "./models/userlogin";
import Student from "./models/student";
import Representative from "./models/representative";
import Transaction from "./models/transaction";
import Teacher from "./models/teacher";
import Subject from "./models/subject";
import Schedule from "./models/Schedule";
import StudentSchedule from "./models/StudentSchedule";
import BlockTimeConfig from "./models/blockTimeConfig";
import Setting from "./models/settings";
// ⭐ NUEVOS MODELOS ⭐
import PlanillaCounter from "./models/PlanillaCounter";
import RegistrationApplication from "./models/RegistrationAplicattion"; // Ajusta el nombre si es "RegistrationApplication"

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
    models: [
      UserLogin,
      Student,
      Representative,
      Transaction,
      Teacher,
      Subject,
      Schedule,
      StudentSchedule,
      BlockTimeConfig,
      Setting,
      PlanillaCounter,        // ⭐ NUEVO
      RegistrationApplication // ⭐ NUEVO
    ],
    logging: console.log,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });

} else {
  sequelize = new Sequelize({
    database: DB_NAME,
    username: DB_USER,
    password: DB_PASSWORD,
    host: DB_HOST || 'localhost',
    port: parseInt(DB_PORT || '5434', 10),
    dialect: 'postgres',
    models: [
      UserLogin,
      Student,
      Representative,
      Transaction,
      Teacher,
      Subject,
      Schedule,
      StudentSchedule,
      BlockTimeConfig,
      Setting,
      PlanillaCounter,        // ⭐ NUEVO
      RegistrationApplication // ⭐ NUEVO
    ],
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

    await sequelize.authenticate();
    console.log(colors.green.bold('✅ Conexión a PostgreSQL establecida.'));

    console.log(colors.yellow.bold('🔄 Sincronizando modelos...'));

    if (NODE_ENV === 'production') {
      await sequelize.sync();
      console.log(colors.green.bold('✅ Tablas creadas/verificadas en Render.'));

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
      // ⚠️ IMPORTANTE: Para desarrollo, descomenta sync({ alter: true })
      // await sequelize.sync({ alter: true });
      console.log(colors.green.bold('✅ Modelos sincronizados (desarrollo).'));
    }

    console.log(colors.green.bold('🎉 Base de datos lista!'));

  } catch (error: any) {
    console.error(colors.red.bold('❌ Error conectando a la base de datos:'), error.message);

    if (error.original) {
      console.error('- Error original:', error.original.message);
      console.error('- Código:', error.original.code);
    }

    throw error;
  }
};

export default sequelize;
