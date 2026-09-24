import { QueryInterface, DataTypes } from 'sequelize';

// Migración de seguridad (idempotente): garantiza que las columnas de
// contacto exigidas para las cuentas administrativas existan en `userlogin`.
// Cubre el caso en que la migración 202609180001-add-account-and-payment-fields
// no se haya ejecutado en el ambiente o la tabla provenga de un respaldo
// anterior a dichas columnas (error: "column UserLogin.phone does not exist").
module.exports = {
  async up(queryInterface: QueryInterface): Promise<void> {
    const userTable = await queryInterface.describeTable('userlogin');
    if (!userTable.phone) {
      await queryInterface.addColumn('userlogin', 'phone', { type: DataTypes.STRING(20), allowNull: true });
    }
    if (!userTable.identityCard) {
      await queryInterface.addColumn('userlogin', 'identityCard', { type: DataTypes.STRING(20), allowNull: true });
    }
  },

  async down(_queryInterface: QueryInterface): Promise<void> {
    // Sin rollback: phone/identityCard son requisito funcional de las cuentas
    // administrativas; eliminarlas rompería el listado y la creación de usuarios.
  }
};
