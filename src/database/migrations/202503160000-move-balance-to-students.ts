import { QueryInterface, DataTypes } from 'sequelize';
import { Migration } from '../migrator';

export const up: Migration = async ({ context: queryInterface }: { context: QueryInterface }) => {
  // Guarda de idempotencia: si `student` ya tiene `balance` (estado actual de la
  // BD) o la tabla aún no existe (instalación nueva: sync() la crea con la
  // columna incluida), el trabajo de esta migración ya está resuelto y se omite.
  // Sin esta guarda, el arranque falla con "column already exists".
  const studentTable: any = await queryInterface.describeTable('student').catch(() => null);
  if (!studentTable || studentTable.balance) {
    console.log('↷ Migración 202503160000 omitida: el balance ya está en student (o sync creará la tabla con la columna).');
    return;
  }
  const representativeTable: any = await queryInterface.describeTable('representative').catch(() => null);

  const transaction = await queryInterface.sequelize.transaction();

  try {
    // 1. Agregar columna balance a la tabla student
    await queryInterface.addColumn('student', 'balance', {
      type: DataTypes.DECIMAL(12, 2),
      defaultValue: 0.00,
      allowNull: false,
    }, { transaction });

    // 2. Obtener todos los representantes con sus estudiantes
    // (tablas reales con freezeTableName: 'representative' y 'student')
    const representatives = await queryInterface.sequelize.query(
      `SELECT r.id, r.balance, array_agg(s.id) as student_ids
       FROM representative r
       LEFT JOIN student s ON s."representativeId" = r.id
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
          `UPDATE student SET balance = :balance WHERE id = :id`,
          {
            replacements: { balance: perStudent, id: studentId },
            transaction
          }
        );
      }
    }

    // 4. Eliminar la columna balance de representative (solo si existe en esta BD)
    if (representativeTable?.balance) {
      await queryInterface.removeColumn('representative', 'balance', { transaction });
    }

    await transaction.commit();
    console.log('✅ Migración completada: balance transferido a estudiantes.');
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error en migración:', error);
    throw error;
  }
};

export const down: Migration = async ({ context: queryInterface }: { context: QueryInterface }) => {
  // Guarda de idempotencia: si `student` no existe o no tiene `balance`, no hay
  // nada que revertir (la migración up fue omitida en esta base de datos).
  const studentTable: any = await queryInterface.describeTable('student').catch(() => null);
  if (!studentTable?.balance) {
    return;
  }
  const representativeTable: any = await queryInterface.describeTable('representative').catch(() => null);

  const transaction = await queryInterface.sequelize.transaction();

  try {
    // Revertir: restaurar balance en representative sumando los balances de sus estudiantes
    if (!representativeTable?.balance) {
      await queryInterface.addColumn('representative', 'balance', {
        type: DataTypes.DECIMAL(12, 2),
        defaultValue: 0.00,
        allowNull: false,
      }, { transaction });
    }

    const representatives = await queryInterface.sequelize.query(
      `SELECT r.id, SUM(s.balance) as total_balance
       FROM representative r
       LEFT JOIN student s ON s."representativeId" = r.id
       GROUP BY r.id`,
      { type: 'SELECT', transaction }
    );

    for (const rep of representatives as any[]) {
      await queryInterface.sequelize.query(
        `UPDATE representative SET balance = :balance WHERE id = :id`,
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