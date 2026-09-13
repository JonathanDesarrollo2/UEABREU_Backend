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

  public static async getCurrentBCVRate(): Promise<number> {
    if (process.env.BCV_TEST_RATE) {
      const rate = parseFloat(process.env.BCV_TEST_RATE);
      if (!isNaN(rate) && rate > 0) {
        console.log(`💱 Usando tasa BCV de prueba (fija): ${rate} Bs/USD`);
        return rate;
      }
    }

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
      return 45;
    }
  }

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
        schoolYearEndDate: '2027-06-30',
      });
    }
    return fee;
  }

  // ========================================================================
  // FUNCIÓN PRINCIPAL
  // ========================================================================
  public static async applyFeesBasedOnAdmission(
    studentId: string,
    representativeId: string,
    externalTransaction?: any
  ) {
    const t = externalTransaction || await sequelize.transaction();
    try {
      const student = await Student.findByPk(studentId, { transaction: t });
      if (!student) {
        if (!externalTransaction) await t.rollback();
        throw new Error('Estudiante no encontrado');
      }

      const fees = await this.getSchoolFees();
      const schoolStartDate = new Date(fees.monthlyFeeStartDate!);
      const admissionDate = student.admissionDate ? new Date(student.admissionDate) : new Date();
      const isNewStudent = admissionDate >= schoolStartDate;

      const bcvRate = await this.getCurrentBCVRate();
      let currentBalanceUSD = student.balance || 0;

      const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
      ];

      // ================================================================
      // 🔥 LÓGICA ESPECIAL AÑO 2026-2027
      // ================================================================
      if (fees.schoolYear === '2026-2027') {
        const today = await getCurrentDate();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();

        // ── Septiembre 2026: NADA ────────────────────────────────
        if (currentYear === 2026 && currentMonth === 8) {
          await student.update({ balance: currentBalanceUSD }, { transaction: t });
          if (!externalTransaction) await t.commit();
          return;
        }

        // ¿Es diciembre 2026 o posterior? → cobrar 100% agosto 2027
        const isDecOrLater = (currentYear === 2026 && currentMonth >= 11) || currentYear > 2026;

        // ── 1. INSCRIPCIÓN + ADMIN + AGOSTO 2027 ──────────────────
        if (!student.hasPaidInscription) {
          // Inscripción
          const usdInscr = fees.inscriptionFeeUSD!;
          const bsInscr = Math.round(usdInscr * bcvRate * 100) / 100;
          await Transaction.create({
            studentId: student.id,
            representativeId,
            type: TransactionType.FEE,
            amount: bsInscr,
            amountUSD: usdInscr,
            bcvRate,
            description: "Inscripción año escolar 2026-2027",
            paymentMethod: PaymentMethod.CASH,
            status: TransactionStatus.COMPLETED,
            balanceBefore: currentBalanceUSD,
            balanceAfter: currentBalanceUSD - usdInscr,
          }, { transaction: t });
          currentBalanceUSD -= usdInscr;

          // Admin (solo NUEVOS)
          if (isNewStudent) {
            const usdAdmin = fees.administrativeFeeUSD!;
            const bsAdmin = Math.round(usdAdmin * bcvRate * 100) / 100;
            await Transaction.create({
              studentId: student.id,
              representativeId,
              type: TransactionType.FEE,
              amount: bsAdmin,
              amountUSD: usdAdmin,
              bcvRate,
              description: "Gasto administrativo (nuevo ingreso)",
              paymentMethod: PaymentMethod.CASH,
              status: TransactionStatus.COMPLETED,
              balanceBefore: currentBalanceUSD,
              balanceAfter: currentBalanceUSD - usdAdmin,
            }, { transaction: t });
            currentBalanceUSD -= usdAdmin;
          }

          // Agosto 2027 (100% si es dic+, 50% si es antes)
          if (isDecOrLater) {
            const usdFull = Math.round(fees.august2027HalfPaymentUSD! * 2 * 100) / 100;
            const bsFull = Math.round(usdFull * bcvRate * 100) / 100;
            await Transaction.create({
              studentId: student.id,
              representativeId,
              type: TransactionType.FEE,
              amount: bsFull,
              amountUSD: usdFull,
              bcvRate,
              description: "Mensualidad Agosto 2027 (pago completo)",
              paymentMethod: PaymentMethod.CASH,
              status: TransactionStatus.COMPLETED,
              balanceBefore: currentBalanceUSD,
              balanceAfter: currentBalanceUSD - usdFull,
            }, { transaction: t });
            currentBalanceUSD -= usdFull;
          } else {
            const usdHalf = fees.august2027HalfPaymentUSD!;
            const bsHalf = Math.round(usdHalf * bcvRate * 100) / 100;
            await Transaction.create({
              studentId: student.id,
              representativeId,
              type: TransactionType.FEE,
              amount: bsHalf,
              amountUSD: usdHalf,
              bcvRate,
              description: "Anticipo 50% mensualidad Agosto 2027",
              paymentMethod: PaymentMethod.CASH,
              status: TransactionStatus.COMPLETED,
              balanceBefore: currentBalanceUSD,
              balanceAfter: currentBalanceUSD - usdHalf,
            }, { transaction: t });
            currentBalanceUSD -= usdHalf;
          }

          await student.update({ hasPaidInscription: true }, { transaction: t });
        }

        // ── 2. MENSUALIDADES ──────────────────────────────────────
        // Regular: desde Sept 2026 hasta el mes en curso.
        // Nuevo:   solo el mes en curso.
        const startDate = isNewStudent
          ? new Date(currentYear, currentMonth, 1)
          : new Date(2026, 8, 1);

        const endDate = new Date(currentYear, currentMonth + 1, 0);
        const cursor = new Date(startDate);

        while (cursor <= endDate) {
          const y = cursor.getFullYear();
          const m = cursor.getMonth();

          // Agosto nunca se cobra como mensualidad
          if (m === 7) {
            cursor.setMonth(cursor.getMonth() + 1);
            continue;
          }

          const desc = `Mensualidad ${monthNames[m]} ${y}`;
          const existing = await Transaction.findOne({
            where: {
              studentId: student.id,
              type: TransactionType.FEE,
              description: desc,
              createdAt: {
                [Op.gte]: new Date(y, m, 1),
                [Op.lt]: new Date(y, m + 1, 1)
              }
            },
            transaction: t,
          });

          if (!existing) {
            const exoneration = student.exonerationPercent || 0;
            let monthlyUSD = fees.monthlyFeeUSD! * (1 - exoneration / 100);
            monthlyUSD = Math.round(monthlyUSD * 100) / 100;
            const monthlyBS = Math.round(monthlyUSD * bcvRate * 100) / 100;

            await Transaction.create({
              studentId: student.id,
              representativeId,
              type: TransactionType.FEE,
              amount: monthlyBS,
              amountUSD: monthlyUSD,
              bcvRate,
              description: desc,
              paymentMethod: PaymentMethod.CASH,
              status: TransactionStatus.COMPLETED,
              balanceBefore: currentBalanceUSD,
              balanceAfter: currentBalanceUSD - monthlyUSD,
            }, { transaction: t });
            currentBalanceUSD -= monthlyUSD;
          }

          cursor.setMonth(cursor.getMonth() + 1);
        }

        await student.update({ balance: currentBalanceUSD }, { transaction: t });
        if (!externalTransaction) await t.commit();
        return;
      }
      // ================================================================

      // ── Lógica de respaldo para otros años ──
      if (isNewStudent) {
        if (!student.hasPaidInscription) {
          const usd = fees.inscriptionFeeUSD!;
          const bs = Math.round(usd * bcvRate * 100) / 100;
          await Transaction.create({
            studentId: student.id,
            representativeId,
            type: TransactionType.FEE,
            amount: bs,
            amountUSD: usd,
            bcvRate,
            description: "Inscripción año escolar 2026-2027",
            paymentMethod: PaymentMethod.CASH,
            status: TransactionStatus.COMPLETED,
            balanceBefore: currentBalanceUSD,
            balanceAfter: currentBalanceUSD - usd,
          }, { transaction: t });
          currentBalanceUSD -= usd;

          const usdAdmin = fees.administrativeFeeUSD!;
          const bsAdmin = Math.round(usdAdmin * bcvRate * 100) / 100;
          await Transaction.create({
            studentId: student.id,
            representativeId,
            type: TransactionType.FEE,
            amount: bsAdmin,
            amountUSD: usdAdmin,
            bcvRate,
            description: "Gasto administrativo (nuevo ingreso)",
            paymentMethod: PaymentMethod.CASH,
            status: TransactionStatus.COMPLETED,
            balanceBefore: currentBalanceUSD,
            balanceAfter: currentBalanceUSD - usdAdmin,
          }, { transaction: t });
          currentBalanceUSD -= usdAdmin;

          const usdAgo = fees.august2027HalfPaymentUSD!;
          const bsAgo = Math.round(usdAgo * bcvRate * 100) / 100;
          await Transaction.create({
            studentId: student.id,
            representativeId,
            type: TransactionType.FEE,
            amount: bsAgo,
            amountUSD: usdAgo,
            bcvRate,
            description: "Anticipo 50% mensualidad Agosto 2027",
            paymentMethod: PaymentMethod.CASH,
            status: TransactionStatus.COMPLETED,
            balanceBefore: currentBalanceUSD,
            balanceAfter: currentBalanceUSD - usdAgo,
          }, { transaction: t });
          currentBalanceUSD -= usdAgo;

          await student.update({ hasPaidInscription: true }, { transaction: t });
        }

        const today = await getCurrentDate();
        if (today >= schoolStartDate) {
          const year = today.getFullYear();
          const month = today.getMonth();
          const desc = `Mensualidad ${monthNames[month]} ${year}`;
          const existing = await Transaction.findOne({
            where: {
              studentId: student.id,
              type: TransactionType.FEE,
              description: desc,
              createdAt: {
                [Op.gte]: new Date(year, month, 1),
                [Op.lt]: new Date(year, month + 1, 1)
              }
            },
            transaction: t,
          });
          if (!existing) {
            const exoneration = student.exonerationPercent || 0;
            let monthlyUSD = fees.monthlyFeeUSD! * (1 - exoneration / 100);
            monthlyUSD = Math.round(monthlyUSD * 100) / 100;
            const monthlyBS = Math.round(monthlyUSD * bcvRate * 100) / 100;
            await Transaction.create({
              studentId: student.id,
              representativeId,
              type: TransactionType.FEE,
              amount: monthlyBS,
              amountUSD: monthlyUSD,
              bcvRate,
              description: desc,
              paymentMethod: PaymentMethod.CASH,
              status: TransactionStatus.COMPLETED,
              balanceBefore: currentBalanceUSD,
              balanceAfter: currentBalanceUSD - monthlyUSD,
            }, { transaction: t });
            currentBalanceUSD -= monthlyUSD;
          }
        }

        await student.update({ balance: currentBalanceUSD }, { transaction: t });
      } else {
        const today = await getCurrentDate();
        if (today >= schoolStartDate) {
          const cursor = new Date(schoolStartDate);
          while (cursor <= today) {
            const year = cursor.getFullYear();
            const month = cursor.getMonth();
            const desc = `Mensualidad ${monthNames[month]} ${year}`;
            const existing = await Transaction.findOne({
              where: {
                studentId: student.id,
                type: TransactionType.FEE,
                description: desc,
                createdAt: {
                  [Op.gte]: new Date(year, month, 1),
                  [Op.lt]: new Date(year, month + 1, 1)
                }
              },
              transaction: t,
            });
            if (!existing) {
              const exoneration = student.exonerationPercent || 0;
              let monthlyUSD = fees.monthlyFeeUSD! * (1 - exoneration / 100);
              monthlyUSD = Math.round(monthlyUSD * 100) / 100;
              const monthlyBS = Math.round(monthlyUSD * bcvRate * 100) / 100;
              await Transaction.create({
                studentId: student.id,
                representativeId,
                type: TransactionType.FEE,
                amount: monthlyBS,
                amountUSD: monthlyUSD,
                bcvRate,
                description: desc,
                paymentMethod: PaymentMethod.CASH,
                status: TransactionStatus.COMPLETED,
                balanceBefore: currentBalanceUSD,
                balanceAfter: currentBalanceUSD - monthlyUSD,
              }, { transaction: t });
              currentBalanceUSD -= monthlyUSD;
            }
            cursor.setMonth(cursor.getMonth() + 1);
          }
        }
        await student.update({ balance: currentBalanceUSD }, { transaction: t });
      }

      if (!externalTransaction) await t.commit();
    } catch (error) {
      if (!externalTransaction) await t.rollback();
      throw error;
    }
  }

  // ========================================================================
  // MÉTODOS ORIGINALES
  // ========================================================================

  public static async applyInscriptionFeesWithTransaction(
    studentId: string,
    representativeId: string,
    isNewStudent: boolean,
    bcvRate: number,
    transaction: any
  ) {
    const student = await Student.findByPk(studentId, { transaction });
    if (!student) return;

    const fees = await this.getSchoolFees();
    let currentBalanceUSD = student.balance || 0;

    if (!student.hasPaidInscription) {
      const usd = fees.inscriptionFeeUSD!;
      const bs = Math.round(usd * bcvRate * 100) / 100;
      await Transaction.create({
        studentId: student.id,
        representativeId,
        type: TransactionType.FEE,
        amount: bs,
        amountUSD: usd,
        bcvRate,
        description: "Inscripción año escolar 2026-2027",
        paymentMethod: PaymentMethod.CASH,
        status: TransactionStatus.COMPLETED,
        balanceBefore: currentBalanceUSD,
        balanceAfter: currentBalanceUSD - usd,
      }, { transaction });
      currentBalanceUSD -= usd;
    }

    if (isNewStudent && !student.hasPaidInscription) {
      const usd = fees.administrativeFeeUSD!;
      const bs = Math.round(usd * bcvRate * 100) / 100;
      await Transaction.create({
        studentId: student.id,
        representativeId,
        type: TransactionType.FEE,
        amount: bs,
        amountUSD: usd,
        bcvRate,
        description: "Gasto administrativo (nuevo ingreso)",
        paymentMethod: PaymentMethod.CASH,
        status: TransactionStatus.COMPLETED,
        balanceBefore: currentBalanceUSD,
        balanceAfter: currentBalanceUSD - usd,
      }, { transaction });
      currentBalanceUSD -= usd;
    }

    if (!student.hasPaidInscription) {
      const usd = fees.august2027HalfPaymentUSD!;
      const bs = Math.round(usd * bcvRate * 100) / 100;
      await Transaction.create({
        studentId: student.id,
        representativeId,
        type: TransactionType.FEE,
        amount: bs,
        amountUSD: usd,
        bcvRate,
        description: "Anticipo 50% mensualidad Agosto 2027",
        paymentMethod: PaymentMethod.CASH,
        status: TransactionStatus.COMPLETED,
        balanceBefore: currentBalanceUSD,
        balanceAfter: currentBalanceUSD - usd,
      }, { transaction });
      currentBalanceUSD -= usd;
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
      const desc = `Mensualidad ${monthNames[month]} ${year}`;
      const existingMonthly = await Transaction.findOne({
        where: {
          studentId: student.id,
          type: TransactionType.FEE,
          description: desc,
          createdAt: {
            [Op.gte]: new Date(year, month, 1),
            [Op.lt]: new Date(year, month + 1, 1)
          }
        },
        transaction,
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
          amountUSD: monthlyUSD,
          bcvRate,
          description: desc,
          paymentMethod: PaymentMethod.CASH,
          status: TransactionStatus.COMPLETED,
          balanceBefore: currentBalanceUSD,
          balanceAfter: currentBalanceUSD - monthlyUSD,
        }, { transaction });
        currentBalanceUSD -= monthlyUSD;
      }
    }

    await student.update({
      balance: currentBalanceUSD,
      hasPaidInscription: true,
    }, { transaction });
  }

    // 🔒 Mutex para evitar doble ejecución
  private static applyMonthlyFeeRunning = false;

  static async applyMonthlyFee() {
    if (BillingService.applyMonthlyFeeRunning) {
      console.log('⏳ applyMonthlyFee ya está en ejecución, se omite esta llamada');
      return;
    }
    BillingService.applyMonthlyFeeRunning = true;

    try {
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
      const deadlineDay = fees.prontoPagoDeadlineDay || 10;

      // Septiembre 2026: no aplicar nada
      if (year === 2026 && month === 8) return;

      const students = await Student.findAll({
        where: {
          status: {
            [Op.in]: ['regular', 'repitiente', 'condicionado']
          }
        }
      });

      for (const student of students) {
        let currentBalanceUSD = student.balance || 0;

        // 1. Mensualidad del mes actual (excepto agosto)
        if (month !== 7) {
          const exoneration = student.exonerationPercent || 0;
          let feeUSD = fees.monthlyFeeUSD! * (1 - exoneration / 100);
          feeUSD = Math.round(feeUSD * 100) / 100;

          if (feeUSD > 0) {
            const feeBS = Math.round(feeUSD * bcvRate * 100) / 100;
            const descMensualidad = `Mensualidad ${monthNames[month]} ${year}`;

            const existingMensualidad = await Transaction.findOne({
              where: {
                studentId: student.id,
                type: TransactionType.FEE,
                description: descMensualidad,
                createdAt: {
                  [Op.gte]: new Date(year, month, 1),
                  [Op.lt]: new Date(year, month + 1, 1)
                }
              }
            });

            if (!existingMensualidad) {
              await Transaction.create({
                studentId: student.id,
                representativeId: student.representativeId!,
                type: TransactionType.FEE,
                amount: feeBS,
                amountUSD: feeUSD,
                bcvRate,
                description: descMensualidad,
                paymentMethod: PaymentMethod.CASH,
                status: TransactionStatus.COMPLETED,
                balanceBefore: currentBalanceUSD,
                balanceAfter: currentBalanceUSD - feeUSD,
              });
              currentBalanceUSD -= feeUSD;
              await student.update({ balance: currentBalanceUSD });
            }
          }
        }

        // 2. Diciembre 2026: cobrar el segundo 50% de agosto 2027
        if (year === 2026 && month === 11) {
          const descFull = "Mensualidad Agosto 2027 (pago completo)";
          const descSecond = "Segundo 50% mensualidad Agosto 2027";
          const descFirst = "Anticipo 50% mensualidad Agosto 2027";

          const existingFull = await Transaction.findOne({
            where: { studentId: student.id, description: descFull }
          });
          const existingSecond = await Transaction.findOne({
            where: { studentId: student.id, description: descSecond }
          });

          if (!existingFull && !existingSecond) {
            const existingFirst = await Transaction.findOne({
              where: { studentId: student.id, description: descFirst }
            });

            if (existingFirst) {
              const usdHalf = fees.august2027HalfPaymentUSD!;
              const bsHalf = Math.round(usdHalf * bcvRate * 100) / 100;
              await Transaction.create({
                studentId: student.id,
                representativeId: student.representativeId!,
                type: TransactionType.FEE,
                amount: bsHalf,
                amountUSD: usdHalf,
                bcvRate,
                description: descSecond,
                paymentMethod: PaymentMethod.CASH,
                status: TransactionStatus.COMPLETED,
                balanceBefore: currentBalanceUSD,
                balanceAfter: currentBalanceUSD - usdHalf,
              });
              currentBalanceUSD -= usdHalf;
              await student.update({ balance: currentBalanceUSD });
            }
          }
        }

        // 3. Recargo por pronto pago vencido
        const newBalanceUSD = currentBalanceUSD;
        if (today.getDate() > deadlineDay && newBalanceUSD < 0) {
          const descRecargo = `Recargo por pronto pago vencido ${monthNames[month]} ${year}`;
          const existingRecargo = await Transaction.findOne({
            where: {
              studentId: student.id,
              type: TransactionType.FEE,
              description: descRecargo,
              createdAt: {
                [Op.gte]: new Date(year, month, 1),
                [Op.lt]: new Date(year, month + 1, 1)
              }
            }
          });

          if (!existingRecargo) {
            const recargoUSD = fees.prontoPagoDiscount || 0;
            const recargoBS = Math.round(recargoUSD * bcvRate * 100) / 100;

            if (recargoUSD > 0) {
              await Transaction.create({
                studentId: student.id,
                representativeId: student.representativeId!,
                type: TransactionType.FEE,
                amount: recargoBS,
                amountUSD: recargoUSD,
                bcvRate,
                description: descRecargo,
                paymentMethod: PaymentMethod.CASH,
                status: TransactionStatus.COMPLETED,
                balanceBefore: newBalanceUSD,
                balanceAfter: newBalanceUSD - recargoUSD,
              });

              await student.update({ balance: newBalanceUSD - recargoUSD });
            }
          }
        }
      }
    } finally {
      BillingService.applyMonthlyFeeRunning = false;
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
    const t = await sequelize.transaction();

    try {
      let currentBalanceUSD = student.balance || 0;

      if (!student.hasPaidInscription) {
        const usd = fees.inscriptionFeeUSD!;
        const bs = Math.round(usd * bcvRate * 100) / 100;
        await Transaction.create({
          studentId: student.id,
          representativeId,
          type: TransactionType.FEE,
          amount: bs,
          amountUSD: usd,
          bcvRate,
          description: "Inscripción año escolar 2026-2027",
          paymentMethod: PaymentMethod.CASH,
          status: TransactionStatus.COMPLETED,
          balanceBefore: currentBalanceUSD,
          balanceAfter: currentBalanceUSD - usd,
        }, { transaction: t });
        currentBalanceUSD -= usd;
      }

      if (isNewStudent && !student.hasPaidInscription) {
        const usd = fees.administrativeFeeUSD!;
        const bs = Math.round(usd * bcvRate * 100) / 100;
        await Transaction.create({
          studentId: student.id,
          representativeId,
          type: TransactionType.FEE,
          amount: bs,
          amountUSD: usd,
          bcvRate,
          description: "Gasto administrativo (nuevo ingreso)",
          paymentMethod: PaymentMethod.CASH,
          status: TransactionStatus.COMPLETED,
          balanceBefore: currentBalanceUSD,
          balanceAfter: currentBalanceUSD - usd,
        }, { transaction: t });
        currentBalanceUSD -= usd;
      }

      if (!student.hasPaidInscription) {
        const usd = fees.august2027HalfPaymentUSD!;
        const bs = Math.round(usd * bcvRate * 100) / 100;
        await Transaction.create({
          studentId: student.id,
          representativeId,
          type: TransactionType.FEE,
          amount: bs,
          amountUSD: usd,
          bcvRate,
          description: "Anticipo 50% mensualidad Agosto 2027",
          paymentMethod: PaymentMethod.CASH,
          status: TransactionStatus.COMPLETED,
          balanceBefore: currentBalanceUSD,
          balanceAfter: currentBalanceUSD - usd,
        }, { transaction: t });
        currentBalanceUSD -= usd;
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
        const desc = `Mensualidad ${monthNames[month]} ${year}`;
        const existingMonthly = await Transaction.findOne({
          where: {
            studentId: student.id,
            type: TransactionType.FEE,
            description: desc,
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
            amountUSD: monthlyUSD,
            bcvRate,
            description: desc,
            paymentMethod: PaymentMethod.CASH,
            status: TransactionStatus.COMPLETED,
            balanceBefore: currentBalanceUSD,
            balanceAfter: currentBalanceUSD - monthlyUSD,
          }, { transaction: t });
          currentBalanceUSD -= monthlyUSD;
        }
      }

      await student.update({
        balance: currentBalanceUSD,
        hasPaidInscription: true,
      }, { transaction: t });

      await t.commit();
    } catch (error) {
      await t.rollback();
      throw error;
    }
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

    const desc = `Descuento Pronto Pago ${monthNames[month]} ${year}`;
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
      const discountUSD = fees.prontoPagoDiscount!;
      const discountBS = Math.round(discountUSD * bcvRate * 100) / 100;
      const student = await Student.findByPk(studentId);
      if (!student) return;

      await Transaction.create({
        studentId,
        representativeId,
        type: TransactionType.ADJUSTMENT,
        amount: discountBS,
        amountUSD: discountUSD,
        bcvRate,
        description: desc,
        paymentMethod: PaymentMethod.CASH,
        status: TransactionStatus.COMPLETED,
        balanceBefore: student.balance || 0,
        balanceAfter: (student.balance || 0) + discountUSD,
      });

      await student.update({ balance: (student.balance || 0) + discountUSD });
    }
  }
}