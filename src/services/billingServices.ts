// src/services/billingService.ts

import Student from "../database/models/student";
import Transaction, { TransactionType, TransactionStatus, PaymentMethod } from "../database/models/transaction";
import sequelize from "../database/config";
import { Op } from "sequelize";
import { currentSchoolFees } from "../config/fee-config";

export class BillingService {

  /**
   * Aplica la mensualidad a todos los estudiantes regulares el día 1 de cada mes.
   * Respeta el porcentaje de exoneración individual.
   */
  static async applyMonthlyFee() {
    const today = new Date();
    const startDate = new Date(currentSchoolFees.monthlyFeeStartDate);
    if (today < startDate) return;

    const year = today.getFullYear();
    const month = today.getMonth(); // 0-indexado
    const monthNames = [
      "Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
    ];

    const students = await Student.findAll({
      where: { status: 'regular' },
    });

    for (const student of students) {
      const exoneration = student.exonerationPercent || 0;
      let feeAmount = currentSchoolFees.monthlyFeeUSD * (1 - exoneration / 100);
      feeAmount = Math.round(feeAmount * 100) / 100;

      if (feeAmount <= 0) continue;

      // Evitar duplicados en el mismo mes
      const existing = await Transaction.findOne({
        where: {
          studentId: student.id,
          type: TransactionType.FEE,
          description: `Mensualidad ${monthNames[month]} ${year}`,
          createdAt: {
            [Op.gte]: new Date(year, month, 1),
            [Op.lt]: new Date(year, month + 1, 1)
          }
        }
      });
      if (existing) continue;

      await Transaction.create({
        studentId: student.id,
        representativeId: student.representativeId!,
        type: TransactionType.FEE,
        amount: feeAmount,
        description: `Mensualidad ${monthNames[month]} ${year}`,
        paymentMethod: PaymentMethod.CASH,
        status: TransactionStatus.COMPLETED,
        balanceBefore: student.balance || 0,
        balanceAfter: (student.balance || 0) - feeAmount,
      });

      await student.update({ balance: (student.balance || 0) - feeAmount });
    }
  }

  /**
   * Aplica las cuotas únicas al activar un estudiante (inscripción, gasto administrativo, anticipo agosto 2027).
   * @param studentId ID del estudiante
   * @param representativeId ID del representante asociado
   * @param isNewStudent true si el estudiante nunca había sido activado (nuevo ingreso)
   */
  static async applyInscriptionFees(studentId: string, representativeId: string, isNewStudent: boolean) {
    const student = await Student.findByPk(studentId);
    if (!student) return;

    const t = await sequelize.transaction();
    try {
      let currentBalance = student.balance || 0;

      // Inscripción (solo si no se ha cobrado antes)
      if (!student.hasPaidInscription) {
        const inscriptionAmount = currentSchoolFees.inscriptionFeeUSD;
        await Transaction.create({
          studentId: student.id,
          representativeId,
          type: TransactionType.FEE,
          amount: inscriptionAmount,
          description: "Inscripción año escolar 2026-2027",
          paymentMethod: PaymentMethod.CASH,
          status: TransactionStatus.COMPLETED,
          balanceBefore: currentBalance,
          balanceAfter: currentBalance - inscriptionAmount,
        }, { transaction: t });
        currentBalance -= inscriptionAmount;
      }

      // Gasto administrativo (solo nuevos ingresos)
      if (isNewStudent && !student.hasPaidInscription) {
        const adminAmount = currentSchoolFees.administrativeFeeUSD;
        await Transaction.create({
          studentId: student.id,
          representativeId,
          type: TransactionType.FEE,
          amount: adminAmount,
          description: "Gasto administrativo (nuevo ingreso)",
          paymentMethod: PaymentMethod.CASH,
          status: TransactionStatus.COMPLETED,
          balanceBefore: currentBalance,
          balanceAfter: currentBalance - adminAmount,
        }, { transaction: t });
        currentBalance -= adminAmount;
      }

      // Anticipo 50% mensualidad agosto 2027 (si no se ha cobrado)
      if (!student.hasPaidInscription) {
        const halfPayment = currentSchoolFees.august2027HalfPaymentUSD;
        await Transaction.create({
          studentId: student.id,
          representativeId,
          type: TransactionType.FEE,
          amount: halfPayment,
          description: "Anticipo 50% mensualidad Agosto 2027",
          paymentMethod: PaymentMethod.CASH,
          status: TransactionStatus.COMPLETED,
          balanceBefore: currentBalance,
          balanceAfter: currentBalance - halfPayment,
        }, { transaction: t });
        currentBalance -= halfPayment;
      }

      // Marcar que la inscripción ya fue pagada
      await student.update({
        balance: currentBalance,
        hasPaidInscription: true,
      }, { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Verifica si un representante ya alcanzó el máximo de 2 depósitos en el mes actual.
   */
  static async checkMonthlyDepositLimit(representativeId: string): Promise<boolean> {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const count = await Transaction.count({
      where: {
        representativeId,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        createdAt: {
          [Op.between]: [firstDay, lastDay]
        }
      }
    });

    return count >= 2;
  }
}