// src/database/migrator.ts
import { Umzug, SequelizeStorage } from 'umzug';
import db from './config';
import path from 'path';

const isProduction = process.env.NODE_ENV === 'production';

export const migrator = new Umzug({
  migrations: {
    glob: path.join(
      __dirname,
      isProduction ? './migrations/*.js' : './migrations/*.ts'
    ),
  },
  context: db.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize: db }),
  // Las migraciones se ejecutan de forma explícita al arrancar; no se
  // imprimen consultas ni detalles de implementación en producción.
  logger: undefined,
});

export type Migration = typeof migrator._types.migration;
