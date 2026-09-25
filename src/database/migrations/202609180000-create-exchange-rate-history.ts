import { QueryInterface, DataTypes } from 'sequelize';
import { Migration } from '../migrator';

// Firma Umzug v3 (igual que 202503160000-move-balance-to-students).
export const up: Migration = async ({ context: queryInterface }: { context: QueryInterface }) => {
  const existing = await queryInterface.describeTable('exchange_rate').catch(() => null);
  if (existing) return;
  await queryInterface.createTable('exchange_rate', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true, allowNull: false },
    effectiveDate: { type: DataTypes.DATEONLY, allowNull: false, unique: true },
    rate: { type: DataTypes.DECIMAL(12, 4), allowNull: false },
    fetchedAt: { type: DataTypes.DATE, allowNull: true },
    source: { type: DataTypes.STRING(50), allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  });
};

export const down: Migration = async ({ context: queryInterface }: { context: QueryInterface }) => {
  await queryInterface.dropTable('exchange_rate');
};
