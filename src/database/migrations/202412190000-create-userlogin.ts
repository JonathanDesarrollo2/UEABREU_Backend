// src/database/migrations/202412190000-create-userlogin.ts
import { QueryInterface, DataTypes } from 'sequelize';
import { Migration } from '../migrator';

// Firma Umzug v3 (igual que 202503160000-move-balance-to-students): Umzug invoca
// up({ name, path, context }) y el QueryInterface llega en `context`.
// Idempotente: si la tabla ya existe (creada históricamente por sequelize.sync),
// no intenta recrearla ni duplicar el índice.
export const up: Migration = async ({ context: queryInterface }: { context: QueryInterface }) => {
  const existing = await queryInterface.describeTable('userlogin').catch(() => null);

  if (!existing) {
    await queryInterface.createTable('userlogin', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false
      },
      usermail: {
        type: DataTypes.STRING(250),
        allowNull: false,
        unique: true
      },
      userlogin: {
        type: DataTypes.STRING(100),
        allowNull: false
      },
      username: {
        type: DataTypes.STRING(100),
        allowNull: true
      },
      userpass: {
        type: DataTypes.STRING(200),
        allowNull: false
      },
      userstatus: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      nivel: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });
  }

  // Índice adicional para búsquedas rápidas (solo si no hay ya uno sobre usermail)
  const indexes = (await queryInterface.showIndex('userlogin').catch(() => [])) as any[];
  const hasUsermailIndex = indexes.some((ix: any) =>
    (ix.fields || []).some((f: any) => f.attribute === 'usermail')
  );
  if (!hasUsermailIndex) {
    await queryInterface.addIndex('userlogin', ['usermail']);
  }
};

export const down: Migration = async ({ context: queryInterface }: { context: QueryInterface }) => {
  await queryInterface.dropTable('userlogin');
};
