// src/database/migrations/202412190000-create-userlogin.ts
import { QueryInterface, DataTypes } from 'sequelize';

module.exports = {
  async up(queryInterface: QueryInterface): Promise<void> {
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

    // Índice adicional para búsquedas rápidas
    await queryInterface.addIndex('userlogin', ['usermail']);
  },

  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.dropTable('userlogin');
  }
};