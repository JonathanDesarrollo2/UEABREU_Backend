import { QueryInterface, DataTypes } from 'sequelize';
import { Migration } from '../migrator';

export const up: Migration = async ({ context: queryInterface }: { context: QueryInterface }) => {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    // 1. Agregar columna balance a la tabla students
    await queryInterface.addColumn('student', 'balance', {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
      allowNull: false,
    }, { transaction });

    // 2. Obtener todos los representantes con sus estudiantes
    const representatives = await queryInterface.sequelize.query(
      `SELECT r.id, r.balance, array_agg(s.id) as student_ids
       FROM representatives r
       LEFT JOIN students s ON s."representativeId" = r.id
       GROUP BY r.id, r.balance`,
      { type: 'SELECT', transaction }
    );

    // 3. Distribuir el balance entre los estudiantes de cada representante
    for (const rep of representatives as any[]) {
      const studentIds = rep.student_ids;
      if (!studentIds || studentIds.length === 0) continue;

      const totalBalance = parseFloat(rep.balance) || 0;
      const perStudent = totalBalance / studentIds.length;

      for (const studentId of studentIds) {
        await queryInterface.sequelize.query(
          `UPDATE students SET balance = :balance WHERE id = :id`,
          {
            replacements: { balance: perStudent, id: studentId },
            transaction
          }
        );
      }
    }

    // 4. Eliminar la columna balance de representatives
    await queryInterface.removeColumn('representative', 'balance', { transaction });

    await transaction.commit();
    console.log('✅ Migración completada: balance transferido a estudiantes.');
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error en migración:', error);
    throw error;
  }
};

export const down: Migration = async ({ context: queryInterface }: { context: QueryInterface }) => {
  const transaction = await queryInterface.sequelize.transaction();

  try {
    // Revertir: restaurar balance en representatives sumando los balances de sus estudiantes
    await queryInterface.addColumn('representative', 'balance', {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
      allowNull: false,
    }, { transaction });

    const representatives = await queryInterface.sequelize.query(
      `SELECT r.id, SUM(s.balance) as total_balance
       FROM representatives r
       LEFT JOIN students s ON s."representativeId" = r.id
       GROUP BY r.id`,
      { type: 'SELECT', transaction }
    );

    for (const rep of representatives as any[]) {
      await queryInterface.sequelize.query(
        `UPDATE representatives SET balance = :balance WHERE id = :id`,
        {
          replacements: { balance: rep.total_balance || 0, id: rep.id },
          transaction
        }
      );
    }

    await queryInterface.removeColumn('student', 'balance', { transaction });

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};