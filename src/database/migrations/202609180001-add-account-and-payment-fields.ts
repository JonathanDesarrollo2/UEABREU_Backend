import { QueryInterface, DataTypes } from 'sequelize';
import { Migration } from '../migrator';

// Firma Umzug v3 (igual que 202503160000-move-balance-to-students).
// Idempotente: verifica cada columna con describeTable antes de crearla.
export const up: Migration = async ({ context: queryInterface }: { context: QueryInterface }) => {
  const userTable = await queryInterface.describeTable('userlogin');
  if (!userTable.phone) await queryInterface.addColumn('userlogin', 'phone', { type: DataTypes.STRING(20), allowNull: true });
  if (!userTable.identityCard) await queryInterface.addColumn('userlogin', 'identityCard', { type: DataTypes.STRING(20), allowNull: true });
  if (!userTable.verificationCode) await queryInterface.addColumn('userlogin', 'verificationCode', { type: DataTypes.STRING(10), allowNull: true });
  if (!userTable.verificationCodeExpires) await queryInterface.addColumn('userlogin', 'verificationCodeExpires', { type: DataTypes.DATE, allowNull: true });
  const transactionTable = await queryInterface.describeTable('transaction').catch(() => null);
  if (transactionTable && !transactionTable.paymentTime) await queryInterface.addColumn('transaction', 'paymentTime', { type: DataTypes.STRING(5), allowNull: true });
};

export const down: Migration = async ({ context: queryInterface }: { context: QueryInterface }) => {
  const transactionTable = await queryInterface.describeTable('transaction').catch(() => null);
  if (transactionTable?.paymentTime) await queryInterface.removeColumn('transaction', 'paymentTime');
  await queryInterface.removeColumn('userlogin', 'phone');
  await queryInterface.removeColumn('userlogin', 'identityCard');
  await queryInterface.removeColumn('userlogin', 'verificationCode');
  await queryInterface.removeColumn('userlogin', 'verificationCodeExpires');
};
