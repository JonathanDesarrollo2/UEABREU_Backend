// src/controllers/transaction-delete-controller.ts
import { Request, Response } from 'express';
import sequelize from '../database/config';
import Transaction from '../database/models/transaction';
import Student from '../database/models/student';
import UserLogin from '../database/models/userlogin';
import AuditLog from '../database/models/auditLog';
import { ErrorLog } from '../utility/ErrorLog';
import { getErrorLocation } from '../utility/callerinfo';

export class TransactionDeleteController {
  /**
   * Elimina una transacción (pago/mensualidad/inscripción/etc.) y revierte
   * el saldo del estudiante. Solo el usuario con `nivel === 2` (administrador
   * principal) puede ejecutarlo, y debe confirmar con SU contraseña.
   *
   * Nota de roles:
   *   - nivel 1 = representante
   *   - nivel 2 = administrador principal  ← único autorizado a eliminar
   */
  static deleteTransaction = async (req: Request, res: Response) => {
    const t = await sequelize.transaction();
    try {
      const { transactionId } = req.params;
      const { password } = req.body;
      const adminId = req.tokenData?.id;

      // 1. Admin autenticado
      if (!adminId) {
        await t.rollback();
        return res.status(401).json({ result: false, content: [], error: ['No autenticado'] });
      }

      const admin = await UserLogin.findByPk(adminId, { transaction: t });
      if (!admin) {
        await t.rollback();
        return res.status(404).json({ result: false, content: [], error: ['Usuario no encontrado'] });
      }

      // 2. SOLO admin de nivel 2 (administrador principal)
      if (admin.nivel !== 2) {
        await t.rollback();
        return res.status(403).json({
          result: false,
          content: [],
          error: ['Solo el administrador principal (nivel 2) puede eliminar pagos'],
        });
      }

      // 3. Contraseña requerida
      if (!password || typeof password !== 'string' || password.length < 4) {
        await t.rollback();
        return res.status(400).json({ result: false, content: [], error: ['Contraseña requerida'] });
      }

      const passwordOk = await admin.comparePassword(password);
      if (!passwordOk) {
        await t.rollback();
        return res.status(403).json({ result: false, content: [], error: ['Contraseña incorrecta'] });
      }

      // 4. Buscar la transacción
      const transaction = await Transaction.findByPk(transactionId, { transaction: t });
      if (!transaction) {
        await t.rollback();
        return res.status(404).json({ result: false, content: [], error: ['Transacción no encontrada'] });
      }

      // 5. Calcular reversión de saldo según el tipo de transacción
      const amtUSD = Number(transaction.amountUSD) || 0;
      let reverseUSD = 0;
      switch (transaction.type) {
        case 'fee':
        case 'withdrawal':
          // Estas reducían el saldo → al eliminar se devuelve
          reverseUSD = amtUSD;
          break;
        case 'deposit':
        case 'payment':
          // Estas aumentaban el saldo → al eliminar se quita
          reverseUSD = -amtUSD;
          break;
        case 'adjustment':
          // Los ajustes actuales son descuentos (suman al saldo) → al eliminar se quita
          reverseUSD = -amtUSD;
          break;
        default:
          await t.rollback();
          return res.status(400).json({
            result: false,
            content: [],
            error: [`Tipo de transacción no soportado para eliminación: ${transaction.type}`],
          });
      }

      // 6. Actualizar saldo del estudiante (si aplica)
      let newBalance: number | null = null;
      let studentUpdated = false;
      if (transaction.studentId) {
        const student = await Student.findByPk(transaction.studentId, { transaction: t });
        if (student) {
          const currentBalance = Number(student.balance) || 0;
          newBalance = Math.round((currentBalance + reverseUSD) * 100) / 100;
          await student.update({ balance: newBalance }, { transaction: t });
          studentUpdated = true;
        }
      }

      // 7. Snapshot para el audit log (antes de borrar)
      const snapshot = {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        amountUSD: transaction.amountUSD,
        bcvRate: transaction.bcvRate,
        description: transaction.description,
        reference: transaction.reference,
        studentId: transaction.studentId,
        representativeId: transaction.representativeId,
        createdAt: transaction.createdAt,
      };

      // 8. Eliminar la transacción físicamente
      await transaction.destroy({ transaction: t });

      // 9. Registrar auditoría
      await AuditLog.create(
        {
          userId: admin.id,
          action: 'DELETE_TRANSACTION',
          details: {
            deletedTransaction: snapshot,
            reverseUSD,
            newStudentBalance: newBalance,
            studentUpdated,
            deletedBy: {
              id: admin.id,
              userlogin: admin.userlogin,
              username: admin.username,
              nivel: admin.nivel,
            },
            timestamp: new Date().toISOString(),
          },
        },
        { transaction: t }
      );

      await t.commit();

      return res.json({
        result: true,
        content: {
          deletedId: snapshot.id,
          description: snapshot.description,
          reverseUSD,
          newBalance,
        },
        error: [],
      });
    } catch (error: any) {
      await t.rollback();
      ErrorLog.createErrorLog(
        error,
        'TransactionDeleteController',
        getErrorLocation('deleteTransaction')
      );
      return res.status(500).json({ result: false, content: [], error: [error.message] });
    }
  };
}