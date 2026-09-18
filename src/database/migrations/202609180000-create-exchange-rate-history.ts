import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
  async up(queryInterface: QueryInterface): Promise<void> {
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
  },
  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.dropTable('exchange_rate');
  }
};
