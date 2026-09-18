import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
  async up(queryInterface: QueryInterface): Promise<void> {
    const userTable = await queryInterface.describeTable('userlogin');
    if (!userTable.phone) await queryInterface.addColumn('userlogin', 'phone', { type: DataTypes.STRING(20), allowNull: true });
    if (!userTable.identityCard) await queryInterface.addColumn('userlogin', 'identityCard', { type: DataTypes.STRING(20), allowNull: true });
    if (!userTable.verificationCode) await queryInterface.addColumn('userlogin', 'verificationCode', { type: DataTypes.STRING(10), allowNull: true });
    if (!userTable.verificationCodeExpires) await queryInterface.addColumn('userlogin', 'verificationCodeExpires', { type: DataTypes.DATE, allowNull: true });
    const transactionTable = await queryInterface.describeTable('transaction').catch(() => null);
    if (transactionTable && !transactionTable.paymentTime) await queryInterface.addColumn('transaction', 'paymentTime', { type: DataTypes.STRING(5), allowNull: true });
  },
  async down(queryInterface: QueryInterface): Promise<void> {
    const transactionTable = await queryInterface.describeTable('transaction').catch(() => null);
    if (transactionTable?.paymentTime) await queryInterface.removeColumn('transaction', 'paymentTime');
    await queryInterface.removeColumn('userlogin', 'phone');
    await queryInterface.removeColumn('userlogin', 'identityCard');
    await queryInterface.removeColumn('userlogin', 'verificationCode');
    await queryInterface.removeColumn('userlogin', 'verificationCodeExpires');
  }
};
