// src/services/billingService.ts

import Student from "../database/models/student";
import Transaction, {
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from "../database/models/transaction";
import sequelize from "../database/config";
import { Op } from "sequelize";
import { currentSchoolFees } from "../config/fee-config";
import { BankAPI } from "../bank/bank-api";

export class BillingService {
  /**
   * Obtiene la tasa BCV actual (Bs por USD) usando la API del banco.
   * Si falla, usa una tasa de respaldo (45 Bs/USD) para no detener el proceso.
   */
  private static async getCurrentBCVRate(): Promise<number> {
    try {
      const bankAPI = new BankAPI();
      const bcvRate = await bankAPI.getBCVRate();
      return bcvRate.PriceRateBCV;
    } catch (error) {
      console.error("⚠️ No se pudo obtener la tasa BCV, usando tasa de respaldo (45):", error);
      return 45; // tasa de respaldo
    }
  }

  /**
   * Aplica la mensualidad a todos los estudiantes regulares el día 1 de cada mes.
   * Los montos en USD se convierten a Bs usando la tasa BCV del día.
   */
  static async applyMonthlyFee() {
    const today = new Date();
    const startDate = new Date(currentSchoolFees.monthlyFeeStartDate);
    if (today < startDate) return;

    const year = today.getFullYear();
    const month = today.getMonth(); // 0-indexado
    const monthNames = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];

    const bcvRate = await this.getCurrentBCVRate();
    console.log(`💱 Tasa BCV para mensualidades: ${bcvRate} Bs/USD`);

    const students = await Student.findAll({
      where: { status: "regular" },
    });

    for (const student of students) {
      const exoneration = student.exonerationPercent || 0;
      // Monto en USD después de exoneración
      let feeUSD = currentSchoolFees.monthlyFeeUSD * (1 - exoneration / 100);
      feeUSD = Math.round(feeUSD * 100) / 100;
      if (feeUSD <= 0) continue;

      // Convertir a Bs
      const feeBS = Math.round(feeUSD * bcvRate * 100) / 100;

      // Evitar duplicados en el mismo mes
      const existing = await Transaction.findOne({
        where: {
          studentId: student.id,
          type: TransactionType.FEE,
          description: `Mensualidad ${monthNames[month]} ${year}`,
          createdAt: {
            [Op.gte]: new Date(year, month, 1),
            [Op.lt]: new Date(year, month + 1, 1),
          },
        },
      });
      if (existing) continue;

      await Transaction.create({
        studentId: student.id,
        representativeId: student.representativeId!,
        type: TransactionType.FEE,
        amount: feeBS,
        description: `Mensualidad ${monthNames[month]} ${year}`,
        paymentMethod: PaymentMethod.CASH,
        status: TransactionStatus.COMPLETED,
        balanceBefore: student.balance || 0,
        balanceAfter: (student.balance || 0) - feeBS,
      });

      await student.update({ balance: (student.balance || 0) - feeBS });
    }
  }

  /**
   * Aplica las cuotas únicas al activar un estudiante (inscripción, gasto administrativo,
   * anticipo agosto 2027) y, si ya comenzaron las mensualidades, la del mes en curso.
   * Todos los montos se convierten a Bs usando la tasa BCV del día.
   */
  static async applyInscriptionFees(
    studentId: string,
    representativeId: string,
    isNewStudent: boolean
  ) {
    const student = await Student.findByPk(studentId);
    if (!student) return;

    const bcvRate = await this.getCurrentBCVRate();
    console.log(`💱 Tasa BCV para inscripción: ${bcvRate} Bs/USD`);

    const t = await sequelize.transaction();
    try {
      let currentBalance = student.balance || 0;

      // Inscripción (solo si no se ha cobrado antes)
      if (!student.hasPaidInscription) {
        const inscriptionUSD = currentSchoolFees.inscriptionFeeUSD;
        const inscriptionBS = Math.round(inscriptionUSD * bcvRate * 100) / 100;
        await Transaction.create(
          {
            studentId: student.id,
            representativeId,
            type: TransactionType.FEE,
            amount: inscriptionBS,
            description: "Inscripción año escolar 2026-2027",
            paymentMethod: PaymentMethod.CASH,
            status: TransactionStatus.COMPLETED,
            balanceBefore: currentBalance,
            balanceAfter: currentBalance - inscriptionBS,
          },
          { transaction: t }
        );
        currentBalance -= inscriptionBS;
      }

      // Gasto administrativo (solo nuevos ingresos)
      if (isNewStudent && !student.hasPaidInscription) {
        const adminUSD = currentSchoolFees.administrativeFeeUSD;
        const adminBS = Math.round(adminUSD * bcvRate * 100) / 100;
        await Transaction.create(
          {
            studentId: student.id,
            representativeId,
            type: TransactionType.FEE,
            amount: adminBS,
            description: "Gasto administrativo (nuevo ingreso)",
            paymentMethod: PaymentMethod.CASH,
            status: TransactionStatus.COMPLETED,
            balanceBefore: currentBalance,
            balanceAfter: currentBalance - adminBS,
          },
          { transaction: t }
        );
        currentBalance -= adminBS;
      }

      // Anticipo 50% mensualidad agosto 2027 (si no se ha cobrado)
      if (!student.hasPaidInscription) {
        const halfUSD = currentSchoolFees.august2027HalfPaymentUSD;
        const halfBS = Math.round(halfUSD * bcvRate * 100) / 100;
        await Transaction.create(
          {
            studentId: student.id,
            representativeId,
            type: TransactionType.FEE,
            amount: halfBS,
            description: "Anticipo 50% mensualidad Agosto 2027",
            paymentMethod: PaymentMethod.CASH,
            status: TransactionStatus.COMPLETED,
            balanceBefore: currentBalance,
            balanceAfter: currentBalance - halfBS,
          },
          { transaction: t }
        );
        currentBalance -= halfBS;
      }

      // Mensualidad del mes en curso si ya comenzaron las mensualidades
      const today = new Date();
      const monthlyStart = new Date(currentSchoolFees.monthlyFeeStartDate);
      if (today >= monthlyStart) {
        const year = today.getFullYear();
        const month = today.getMonth();
        const monthNames = [
          "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
          "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
        ];
        const existingMonthly = await Transaction.findOne({
          where: {
            studentId: student.id,
            type: TransactionType.FEE,
            description: `Mensualidad ${monthNames[month]} ${year}`,
            createdAt: {
              [Op.gte]: new Date(year, month, 1),
              [Op.lt]: new Date(year, month + 1, 1),
            },
          },
          transaction: t,
        });
        if (!existingMonthly) {
          const exoneration = student.exonerationPercent || 0;
          let monthlyUSD =
            currentSchoolFees.monthlyFeeUSD * (1 - exoneration / 100);
          monthlyUSD = Math.round(monthlyUSD * 100) / 100;
          const monthlyBS = Math.round(monthlyUSD * bcvRate * 100) / 100;
          await Transaction.create(
            {
              studentId: student.id,
              representativeId,
              type: TransactionType.FEE,
              amount: monthlyBS,
              description: `Mensualidad ${monthNames[month]} ${year}`,
              paymentMethod: PaymentMethod.CASH,
              status: TransactionStatus.COMPLETED,
              balanceBefore: currentBalance,
              balanceAfter: currentBalance - monthlyBS,
            },
            { transaction: t }
          );
          currentBalance -= monthlyBS;
        }
      }

      // Marcar que la inscripción ya fue pagada
      await student.update(
        {
          balance: currentBalance,
          hasPaidInscription: true,
        },
        { transaction: t }
      );

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Verifica si un representante ya alcanzó el máximo de 2 depósitos en el mes actual.
   */
  static async checkMonthlyDepositLimit(
    representativeId: string
  ): Promise<boolean> {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const count = await Transaction.count({
      where: {
        representativeId,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        createdAt: {
          [Op.between]: [firstDay, lastDay],
        },
      },
    });

    return count >= 2;
  }

  /**
   * Aplica descuento por pronto pago si corresponde.
   * Se llama después de registrar un depósito (pago) para un estudiante.
   */
  static async applyEarlyPaymentDiscount(
    studentId: string,
    representativeId: string
  ) {
    const today = new Date();
    if (today.getDate() > currentSchoolFees.prontoPagoDeadlineDay) return; // solo hasta el día 10

    const year = today.getFullYear();
    const month = today.getMonth();
    const monthNames = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];

    // Buscar si existe una deuda de mensualidad para este mes
    const existingFee = await Transaction.findOne({
      where: {
        studentId,
        type: TransactionType.FEE,
        description: `Mensualidad ${monthNames[month]} ${year}`,
        createdAt: {
          [Op.gte]: new Date(year, month, 1),
          [Op.lt]: new Date(year, month + 1, 1),
        },
      },
    });

    if (existingFee) {
      // El monto de la mensualidad original ya está en Bs, pero para el descuento
      // debemos usar el valor en USD convertido a Bs con la tasa del día.
      const bcvRate = await this.getCurrentBCVRate();
      const discountUSD = currentSchoolFees.prontoPagoDiscount; // $10
      const discountBS = Math.round(discountUSD * bcvRate * 100) / 100;

      const student = await Student.findByPk(studentId);
      if (!student) return;

      await Transaction.create({
        studentId,
        representativeId,
        type: TransactionType.ADJUSTMENT,
        amount: discountBS,
        description: `Descuento Pronto Pago ${monthNames[month]} ${year}`,
        paymentMethod: PaymentMethod.CASH,
        status: TransactionStatus.COMPLETED,
        balanceBefore: student.balance || 0,
        balanceAfter: (student.balance || 0) + discountBS,
      });

      await student.update({ balance: (student.balance || 0) + discountBS });
    }
  }
}