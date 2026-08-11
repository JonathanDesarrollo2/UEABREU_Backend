// src/services/billingService.ts

import Student from "../database/models/student";
import Transaction, {
  TransactionType,
  TransactionStatus,
  PaymentMethod,
} from "../database/models/transaction";
import sequelize from "../database/config";
import { Op } from "sequelize";
import { BankAPI } from "../bank/bank-api";
import SchoolFee from "../database/models/ScoolFee";
import { getCurrentDate } from "../utility/dateHelper";

export class BillingService {
  /**
   * Obtiene la tasa BCV actual.
   * - Si existe la variable de entorno BCV_TEST_RATE, la usa (sin llamar al banco).
   * - Si no, llama a la API del banco con un timeout de 3 segundos.
   * - Si falla o expira, usa una tasa de respaldo (45 Bs/USD).
   */
  private static async getCurrentBCVRate(): Promise<number> {
    // 1. Si hay una tasa fija para pruebas, se usa directamente
    if (process.env.BCV_TEST_RATE) {
      const rate = parseFloat(process.env.BCV_TEST_RATE);
      if (!isNaN(rate) && rate > 0) {
        console.log(`💱 Usando tasa BCV de prueba (fija): ${rate} Bs/USD`);
        return rate;
      }
    }

    // 2. Intentar obtener la tasa real con un timeout de 3 segundos
    try {
      const bankAPI = new BankAPI();
      const timeoutPromise = new Promise<{ PriceRateBCV: number }>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout al obtener tasa BCV")), 3000)
      );
      const bcvRate = await Promise.race([bankAPI.getBCVRate(), timeoutPromise]);
      console.log(`💱 Tasa BCV obtenida del banco: ${bcvRate.PriceRateBCV} Bs/USD`);
      return bcvRate.PriceRateBCV;
    } catch (error) {
      console.error("⚠️ No se pudo obtener la tasa BCV, usando tasa de respaldo (45):", error);
      return 45; // tasa de respaldo
    }
  }

  // ─── El resto de los métodos permanecen EXACTAMENTE IGUAL ─────────────

  private static async getSchoolFees(): Promise<SchoolFee> {
    let fee = await SchoolFee.findOne({ where: { schoolYear: '2026-2027' } });
    if (!fee) {
      fee = await SchoolFee.create({
        schoolYear: '2026-2027',
        inscriptionFeeUSD: 80,
        monthlyFeeUSD: 100,
        prontoPagoDiscount: 10,
        prontoPagoDeadlineDay: 10,
        administrativeFeeUSD: 20,
        august2027HalfPaymentUSD: 45,
        monthlyFeeStartDate: '2026-09-01',
        inscriptionStartDate: '2026-07-15',
        inscriptionEndDate: '2026-10-01',
      });
    }
    return fee;
  }

  static async applyMonthlyFee() {
    const today = await getCurrentDate();
    const fees = await this.getSchoolFees();
    const startDate = new Date(fees.monthlyFeeStartDate!);
    if (today < startDate) return;

    const year = today.getFullYear();
    const month = today.getMonth();
    const monthNames = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];

    const bcvRate = await this.getCurrentBCVRate();
    console.log(`💱 Tasa BCV para mensualidades: ${bcvRate} Bs/USD`);

    const students = await Student.findAll({
      where: { status: 'regular' },
    });

    for (const student of students) {
      const exoneration = student.exonerationPercent || 0;
      let feeUSD = fees.monthlyFeeUSD! * (1 - exoneration / 100);
      feeUSD = Math.round(feeUSD * 100) / 100;
      if (feeUSD <= 0) continue;

      const feeBS = Math.round(feeUSD * bcvRate * 100) / 100;

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

  static async applyInscriptionFees(
    studentId: string,
    representativeId: string,
    isNewStudent: boolean
  ) {
    const student = await Student.findByPk(studentId);
    if (!student) return;

    const fees = await this.getSchoolFees();
    const bcvRate = await this.getCurrentBCVRate();
    console.log(`💱 Tasa BCV para inscripción: ${bcvRate} Bs/USD`);

    const t = await sequelize.transaction();
    try {
      let currentBalance = student.balance || 0;

      if (!student.hasPaidInscription) {
        const inscriptionBS = Math.round(fees.inscriptionFeeUSD! * bcvRate * 100) / 100;
        await Transaction.create({
          studentId: student.id,
          representativeId,
          type: TransactionType.FEE,
          amount: inscriptionBS,
          description: "Inscripción año escolar 2026-2027",
          paymentMethod: PaymentMethod.CASH,
          status: TransactionStatus.COMPLETED,
          balanceBefore: currentBalance,
          balanceAfter: currentBalance - inscriptionBS,
        }, { transaction: t });
        currentBalance -= inscriptionBS;
      }

      if (isNewStudent && !student.hasPaidInscription) {
        const adminBS = Math.round(fees.administrativeFeeUSD! * bcvRate * 100) / 100;
        await Transaction.create({
          studentId: student.id,
          representativeId,
          type: TransactionType.FEE,
          amount: adminBS,
          description: "Gasto administrativo (nuevo ingreso)",
          paymentMethod: PaymentMethod.CASH,
          status: TransactionStatus.COMPLETED,
          balanceBefore: currentBalance,
          balanceAfter: currentBalance - adminBS,
        }, { transaction: t });
        currentBalance -= adminBS;
      }

      if (!student.hasPaidInscription) {
        const halfBS = Math.round(fees.august2027HalfPaymentUSD! * bcvRate * 100) / 100;
        await Transaction.create({
          studentId: student.id,
          representativeId,
          type: TransactionType.FEE,
          amount: halfBS,
          description: "Anticipo 50% mensualidad Agosto 2027",
          paymentMethod: PaymentMethod.CASH,
          status: TransactionStatus.COMPLETED,
          balanceBefore: currentBalance,
          balanceAfter: currentBalance - halfBS,
        }, { transaction: t });
        currentBalance -= halfBS;
      }

      const today = await getCurrentDate();
      const monthlyStart = new Date(fees.monthlyFeeStartDate!);
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
              [Op.lt]: new Date(year, month + 1, 1)
            }
          },
          transaction: t,
        });
        if (!existingMonthly) {
          const exoneration = student.exonerationPercent || 0;
          let monthlyUSD = fees.monthlyFeeUSD! * (1 - exoneration / 100);
          monthlyUSD = Math.round(monthlyUSD * 100) / 100;
          const monthlyBS = Math.round(monthlyUSD * bcvRate * 100) / 100;
          await Transaction.create({
            studentId: student.id,
            representativeId,
            type: TransactionType.FEE,
            amount: monthlyBS,
            description: `Mensualidad ${monthNames[month]} ${year}`,
            paymentMethod: PaymentMethod.CASH,
            status: TransactionStatus.COMPLETED,
            balanceBefore: currentBalance,
            balanceAfter: currentBalance - monthlyBS,
          }, { transaction: t });
          currentBalance -= monthlyBS;
        }
      }

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

  static async checkMonthlyDepositLimit(representativeId: string): Promise<boolean> {
    const now = await getCurrentDate();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const count = await Transaction.count({
      where: {
        representativeId,
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.COMPLETED,
        createdAt: { [Op.between]: [firstDay, lastDay] }
      }
    });

    return count >= 2;
  }

  static async applyEarlyPaymentDiscount(studentId: string, representativeId: string) {
    const today = await getCurrentDate();
    const fees = await this.getSchoolFees();
    if (today.getDate() > fees.prontoPagoDeadlineDay!) return;

    const year = today.getFullYear();
    const month = today.getMonth();
    const monthNames = [
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ];

    const existingFee = await Transaction.findOne({
      where: {
        studentId,
        type: TransactionType.FEE,
        description: `Mensualidad ${monthNames[month]} ${year}`,
        createdAt: {
          [Op.gte]: new Date(year, month, 1),
          [Op.lt]: new Date(year, month + 1, 1)
        }
      }
    });

    if (existingFee) {
      const bcvRate = await this.getCurrentBCVRate();
      const discountBS = Math.round(fees.prontoPagoDiscount! * bcvRate * 100) / 100;
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
