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
import ExchangeRate from "../database/models/exchangeRate";

export class BillingService {

  public static async getCurrentBCVRate(): Promise<number> {
    const today = await this.getCaracasDate();

    // 1) Buscar tasa de HOY en la BD
    const stored = await ExchangeRate.findOne({ where: { effectiveDate: today } });
    if (stored?.rate && Number(stored.rate) > 0) {
      return Number(stored.rate);
    }

    // 2) No existe → consultar al banco y guardar
    try {
      const bankAPI = new BankAPI();
      const bcvRate = await bankAPI.getBCVRate();

      if (!bcvRate.PriceRateBCV || bcvRate.PriceRateBCV <= 0) {
        throw new Error('El banco devolvió una tasa inválida');
      }

      const [record] = await ExchangeRate.findOrCreate({
        where: { effectiveDate: today },
        defaults: {
          effectiveDate: today,
          rate: bcvRate.PriceRateBCV,
          fetchedAt: new Date(),
          source: 'BNC-autofetch',
        },
      });

      console.log(`📈 Tasa BCV auto-guardada para ${today}: ${record.rate} Bs/USD`);
      return Number(record.rate);
    } catch (error: any) {
      console.error('⚠️ Error al auto-consultar tasa BCV:', error.message);
    }

    throw new Error(
      `No existe una tasa registrada para la fecha ${today} y no se pudo consultar al banco`
    );
  }

  private static async getCaracasDate(): Promise<string> {
    const simulated = process.env.SIMULATED_DATE;
    if (simulated) return simulated.slice(0, 10);
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
  }

  /** Obtiene la tasa guardada para la fecha valor. Si no existe y es HOY, la consulta al banco y la guarda. */
  public static async getRateForDate(date: string): Promise<number> {
    // 1) Buscar en la BD
    const stored = await ExchangeRate.findOne({ where: { effectiveDate: date } });
    if (stored?.rate && Number(stored.rate) > 0) {
      return Number(stored.rate);
    }

    // 2) Si no existe Y la fecha es HOY → auto-consultar al banco y guardar
    const today = await this.getCaracasDate();
    if (date === today) {
      try {
        const bankAPI = new BankAPI();
        const bcvRate = await bankAPI.getBCVRate();

        if (bcvRate.PriceRateBCV && bcvRate.PriceRateBCV > 0) {
          const [record] = await ExchangeRate.findOrCreate({
            where: { effectiveDate: date },
            defaults: {
              effectiveDate: date,
              rate: bcvRate.PriceRateBCV,
              fetchedAt: new Date(),
              source: 'BNC-autofetch',
            },
          });

          console.log(`📈 Tasa auto-guardada para ${date}: ${record.rate} Bs/USD`);
          return Number(record.rate);
        }
      } catch (err: any) {
        console.error(`⚠️ Error al auto-consultar tasa para ${date}:`, err.message);
      }
    }

    throw new Error(`No existe una tasa registrada para la fecha ${date}`);
  }

  /**
   * Solo este método consulta al BNC. El cron lo ejecuta a las 18:00 y la
   * tasa recibida queda vigente desde el día siguiente.
   */
  public static async refreshDailyBCVRate(): Promise<ExchangeRate> {
    const today = await this.getCaracasDate();
    const effective = new Date(`${today}T00:00:00Z`);
    effective.setUTCDate(effective.getUTCDate() + 1);
    const effectiveDate = effective.toISOString().slice(0, 10);
    const existing = await ExchangeRate.findOne({ where: { effectiveDate } });
    if (existing) return existing;

    const bankAPI = new BankAPI();
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Timeout al obtener tasa BCV')), 10000)
    );
    const bcvRate = await Promise.race([bankAPI.getBCVRate(), timeoutPromise]);
    if (!bcvRate.PriceRateBCV || bcvRate.PriceRateBCV <= 0) throw new Error('El banco devolvió una tasa inválida');
    return ExchangeRate.create({
      effectiveDate,
      rate: bcvRate.PriceRateBCV,
      fetchedAt: new Date(),
      source: 'BNC'
    });
  }

  /** Inicializa la fecha actual una sola vez si una instalación aún no tiene historial. */
  public static async ensureCurrentRate(): Promise<ExchangeRate> {
    const today = await this.getCaracasDate();
    const existing = await ExchangeRate.findOne({ where: { effectiveDate: today } });
    if (existing) return existing;
    const bankAPI = new BankAPI();
    const bcvRate = await bankAPI.getBCVRate();
    return ExchangeRate.create({ effectiveDate: today, rate: bcvRate.PriceRateBCV, fetchedAt: new Date(), source: 'BNC-bootstrap' });
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

        // ── Primeros 10 días de octubre 2026: SOLO mensualidad de octubre ──
        // Ventana especial por retraso en el pase a producción: durante
        // los primeros 10 días de octubre 2026 solo se cobra la mensualidad
        // de octubre. Se omite inscripción, gasto administrativo, agosto
        // 2027 y cualquier mensualidad retroactiva (ej. septiembre).
        // A partir del día 11, se retoma el flujo normal sin cambios.
        // Coincide con el último día de pronto pago (prontoPagoDeadlineDay = 10).
        const isFirstWeekOfOctober2026 =
          currentYear === 2026 && currentMonth === 9 && today.getDate() <= 10;

        if (isFirstWeekOfOctober2026) {
          const descOct = `Mensualidad ${monthNames[9]} 2026`;
          const existingOct = await Transaction.findOne({
            where: {
              studentId: student.id,
              type: TransactionType.FEE,
              description: descOct,
              createdAt: {
                [Op.gte]: new Date(2026, 9, 1),
                [Op.lt]: new Date(2026, 10, 1)
              }
            },
            transaction: t,
          });

          if (!existingOct) {
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
              description: descOct,
              paymentMethod: PaymentMethod.CASH,
              status: TransactionStatus.COMPLETED,
              balanceBefore: currentBalanceUSD,
              balanceAfter: currentBalanceUSD - monthlyUSD,
            }, { transaction: t });
            currentBalanceUSD -= monthlyUSD;
          }

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

    /**
   * Asegura que el estudiante tenga la mensualidad del MES EN CURSO.
   * - Idempotente: si ya existe, no hace nada.
   * - Solo aplica a estudiantes activos con grado y sección asignados.
   * - No toca inscripción, admin, agosto 2027, ni meses pasados.
   * - No aplica en septiembre 2026 (regla del cron).
   * - Si ya se pagó (ya existe la FEE del mes), no hace nada.
   *
   * Se usa desde:
   *  - activación de un estudiante desde `updatelogin`
   *  - endpoint administrativo de backfill
   */
  public static async ensureCurrentMonthFee(
    studentId: string,
    representativeId: string,
    externalTransaction?: any
  ): Promise<{ applied: boolean; reason?: string; amountUSD?: number }> {
    const t = externalTransaction || await sequelize.transaction();
    try {
      const student = await Student.findByPk(studentId, { transaction: t });
      if (!student) {
        if (!externalTransaction) await t.rollback();
        return { applied: false, reason: 'student_not_found' };
      }

      // Solo activos
      const ACTIVE = ['regular', 'repitiente', 'condicionado'];
      if (!student.status || !ACTIVE.includes(student.status)) {
        if (!externalTransaction) await t.commit();
        return { applied: false, reason: 'status_not_active' };
      }

      // Debe tener grado y sección asignados
      const gradeOk = !!student.currentGrade && student.currentGrade.trim() !== '' && student.currentGrade !== 'En asignar';
      const sectionOk = !!student.section && student.section.trim() !== '' && student.section !== 'Pendiente';
      if (!gradeOk || !sectionOk) {
        if (!externalTransaction) await t.commit();
        return { applied: false, reason: 'no_grade_or_section' };
      }

      const today = await getCurrentDate();
      const year = today.getFullYear();
      const month = today.getMonth();

      // Septiembre 2026: nada (misma regla del cron)
      if (year === 2026 && month === 8) {
        if (!externalTransaction) await t.commit();
        return { applied: false, reason: 'september_2026_skip' };
      }

      const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
      ];
      const desc = `Mensualidad ${monthNames[month]} ${year}`;

      // ¿Ya existe la FEE del mes?
      const existing = await Transaction.findOne({
        where: {
          studentId: student.id,
          type: TransactionType.FEE,
          description: desc,
          createdAt: {
            [Op.gte]: new Date(year, month, 1),
            [Op.lt]: new Date(year, month + 1, 1),
          },
        },
        transaction: t,
      });

      if (existing) {
        if (!externalTransaction) await t.commit();
        return { applied: false, reason: 'already_exists' };
      }

      // Tasa: usamos la del día 1 del mes en curso (como haría el cron).
      // Si no existe, caemos a la tasa del día actual.
      const firstDayOfMonth = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      let bcvRate: number;
      try {
        bcvRate = await this.getRateForDate(firstDayOfMonth);
      } catch {
        bcvRate = await this.getCurrentBCVRate();
      }

      const fees = await this.getSchoolFees();
      const exoneration = student.exonerationPercent || 0;
      let monthlyUSD = fees.monthlyFeeUSD! * (1 - exoneration / 100);
      monthlyUSD = Math.round(monthlyUSD * 100) / 100;
      if (monthlyUSD <= 0) {
        if (!externalTransaction) await t.commit();
        return { applied: false, reason: 'amount_zero_after_exoneration' };
      }
      const monthlyBS = Math.round(monthlyUSD * bcvRate * 100) / 100;

      const currentBalanceUSD = student.balance || 0;

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
        balanceAfter: Math.round((currentBalanceUSD - monthlyUSD) * 100) / 100,
      }, { transaction: t });

      await student.update(
        { balance: Math.round((currentBalanceUSD - monthlyUSD) * 100) / 100 },
        { transaction: t }
      );

      if (!externalTransaction) await t.commit();
      return { applied: true, amountUSD: monthlyUSD };
    } catch (error) {
      if (!externalTransaction) await t.rollback();
      throw error;
    }
  }

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
        //    Regla: si hoy > deadlineDay (ej: 10), o sea desde el 11, se aplica el recargo.
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