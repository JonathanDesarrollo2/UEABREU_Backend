// src/controllers/balance-controller.ts
import type { Request, Response } from "express";
import Representative from "../database/models/representative";
import Student from "../database/models/student";
import Transaction, { PaymentMethod, TransactionType, TransactionStatus } from "../database/models/transaction";
import UserLogin from "../database/models/userlogin";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import sequelize from "../database/config";
import { Op, fn, col } from "sequelize";
import { BillingService } from "../services/billingServices";

export class BalanceController {

  private static async distributeAmountAmongStudents(
    representativeId: string,
    amountUSD: number,
    transaction: any
  ): Promise<string[]> {
    const students = await Student.findAll({
      where: { representativeId },
      transaction
    });
    if (students.length === 0) return [];

    const perStudentUSD = amountUSD / students.length;
    const updatedIds: string[] = [];

    for (const student of students) {
      await student.update({
        balance: (student.balance || 0) + perStudentUSD
      }, { transaction });
      updatedIds.push(student.id!);
    }
    return updatedIds;
  }

  static listRepresentatives = async (req: Request, res: Response) => {
    try {
      const {
        page = 1, limit = 10, fullName, identityCard, relationship,
        hasDebt, hasCredit, hasStudents, activeOnly = true, search,
        sortBy = 'fullName', sortOrder = 'asc'
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const where: any = {};

      if (fullName) where.fullName = { [Op.iLike]: `%${fullName}%` };
      if (identityCard) where.identityCard = { [Op.iLike]: `%${identityCard}%` };
      if (relationship) where.relationship = relationship;

      if (search) {
        where[Op.or] = [
          { fullName: { [Op.iLike]: `%${search}%` } },
          { identityCard: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (activeOnly === true || activeOnly === 'true') {
        where['$user.userstatus$'] = true;
      }

      const { count, rows: representatives } = await Representative.findAndCountAll({
        where,
        limit: Number(limit),
        offset,
        order: [[sortBy as string, sortOrder === 'asc' ? 'ASC' : 'DESC']],
        include: [
          {
            model: UserLogin,
            as: 'user',
            attributes: ['id', 'userlogin', 'usermail', 'userstatus'],
            required: true
          },
          {
            model: Student,
            as: 'students',
            attributes: ['id', 'fullName', 'status', 'balance'],
            required: false
          }
        ],
        distinct: true
      });

      const formattedRepresentatives = representatives
        .map((rep: any) => {
          const totalBalanceUSD = rep.students?.reduce((sum: number, s: any) => sum + (s.balance || 0), 0) || 0;
          return {
            id: rep.id,
            fullName: rep.fullName,
            identityCard: rep.identityCard,
            phone: rep.phone,
            relationship: rep.relationship,
            balanceUSD: totalBalanceUSD,
            balance: totalBalanceUSD,
            balanceFormatted: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(totalBalanceUSD),
            balanceStatus: totalBalanceUSD < 0 ? 'debt' : totalBalanceUSD > 0 ? 'credit' : 'zero',
            debtAmount: totalBalanceUSD < 0 ? Math.abs(totalBalanceUSD) : 0,
            studentCount: rep.students?.length || 0,
            userStatus: rep.user?.userstatus || false,
            email: rep.user?.usermail || '',
            createdAt: rep.createdAt,
            updatedAt: rep.updatedAt
          };
        })
        .filter(rep => {
          if (hasDebt === 'true' && rep.balance >= 0) return false;
          if (hasCredit === 'true' && rep.balance <= 0) return false;
          if (hasStudents === 'true' && rep.studentCount === 0) return false;
          return true;
        });

      res.status(200).json({
        result: true,
        content: {
          representatives: formattedRepresentatives,
          pagination: {
            totalRecords: count,
            currentPage: Number(page),
            totalPages: Math.ceil(count / Number(limit)),
            pageSize: Number(limit)
          }
        },
        error: []
      });

    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("listRepresentatives"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al obtener representantes']
      });
    }
  };

  static getTopDebtors = async (req: Request, res: Response) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const reps = await Representative.findAll({
        include: [
          {
            model: Student,
            as: 'students',
            attributes: ['id', 'fullName', 'balance'],
            required: false
          },
          {
            model: UserLogin,
            as: 'user',
            attributes: ['usermail', 'userstatus'],
            required: true
          }
        ]
      });

      const debtors = reps
        .map(rep => {
          const totalBalanceUSD = rep.students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;
          return {
            id: rep.id,
            fullName: rep.fullName,
            identityCard: rep.identityCard,
            balanceUSD: totalBalanceUSD,
            debtAmount: totalBalanceUSD < 0 ? Math.abs(totalBalanceUSD) : 0,
            studentCount: rep.students?.length || 0,
            email: rep.user?.usermail || '',
            phone: rep.phone
          };
        })
        .filter(d => d.balanceUSD < 0)
        .sort((a, b) => a.balanceUSD - b.balanceUSD)
        .slice(0, limit);

      res.status(200).json({
        result: true,
        content: {
          debtors,
          totalDebtUSD: debtors.reduce((sum, d) => sum + d.debtAmount, 0)
        },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getTopDebtors"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al obtener top deudores']
      });
    }
  };

  static getTopCreditors = async (req: Request, res: Response) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const reps = await Representative.findAll({
        include: [{
          model: Student,
          as: 'students',
          attributes: ['id', 'fullName', 'balance'],
          required: false
        }]
      });

      const creditors = reps
        .map(rep => {
          const totalBalanceUSD = rep.students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;
          return {
            id: rep.id,
            fullName: rep.fullName,
            identityCard: rep.identityCard,
            balanceUSD: totalBalanceUSD,
            creditAmount: totalBalanceUSD > 0 ? totalBalanceUSD : 0,
            studentCount: rep.students?.length || 0,
            phone: rep.phone
          };
        })
        .filter(c => c.balanceUSD > 0)
        .sort((a, b) => b.balanceUSD - a.balanceUSD)
        .slice(0, limit);

      res.status(200).json({
        result: true,
        content: {
          creditors,
          totalCreditUSD: creditors.reduce((sum, c) => sum + c.creditAmount, 0)
        },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getTopCreditors"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al obtener top con saldo']
      });
    }
  };

  static getBalance = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const representative = await Representative.findByPk(id, {
        include: [
          {
            model: UserLogin,
            as: 'user',
            attributes: ['userlogin', 'usermail', 'userstatus']
          },
          {
            model: Student,
            as: 'students',
            attributes: ['id', 'fullName', 'status', 'currentGrade', 'balance']
          }
        ]
      });

      if (!representative) {
        return res.status(404).json({
          result: false,
          content: [],
          error: ['Representante no encontrado']
        });
      }

      const totalBalanceUSD = representative.students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;

      const recentTransactions = await Transaction.findAll({
        where: { representativeId: id },
        limit: 10,
        order: [['createdAt', 'DESC']]
      });

      const result = {
        representative: {
          id: representative.id,
          fullName: representative.fullName,
          identityCard: representative.identityCard,
          phone: representative.phone,
          balanceUSD: totalBalanceUSD,
          balance: totalBalanceUSD,
          balanceFormatted: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(totalBalanceUSD),
          balanceStatus: totalBalanceUSD < 0 ? 'debt' : totalBalanceUSD > 0 ? 'credit' : 'zero',
          debtAmount: totalBalanceUSD < 0 ? Math.abs(totalBalanceUSD) : 0,
          studentCount: representative.students?.length || 0,
          userEmail: representative.user?.usermail || '',
          students: representative.students?.map(s => ({
            id: s.id,
            fullName: s.fullName,
            status: s.status,
            currentGrade: s.currentGrade,
            balanceUSD: s.balance || 0,
            balance: s.balance || 0,
            balanceFormatted: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(s.balance || 0)
          })) || []
        },
        recentTransactions: recentTransactions.map((t: any) => ({
          id: t.id,
          type: t.type,
          amountUSD: t.amountUSD,
          amount: t.amount,
          bcvRate: t.bcvRate,
          description: t.description,
          paymentMethod: t.paymentMethod,
          reference: t.reference,
          status: t.status,
          createdAt: t.createdAt
        }))
      };

      res.status(200).json({
        result: true,
        content: result,
        error: []
      });

    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getBalance"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al obtener balance']
      });
    }
  };

    static getTransactionHistory = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        page = 1, limit = 20, type, status, startDate, endDate,
        studentId, search, sortBy = 'createdAt', sortOrder = 'desc'
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const where: any = { representativeId: id };

      if (type) where.type = type;
      if (status) where.status = status;
      if (studentId) where.studentId = studentId;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate as string);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate as string);
      }

      if (search) {
        where[Op.or] = [
          { description: { [Op.iLike]: `%${search}%` } },
          { reference: { [Op.iLike]: `%${search}%` } },
          { '$student.fullName$': { [Op.iLike]: `%${search}%` } }
        ];
      }

      const order: any = [[String(sortBy), String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC']];

      const { count, rows: transactions } = await Transaction.findAndCountAll({
        where,
        limit: Number(limit),
        offset,
        order,
        attributes: [
          'id', 'type', 'amount', 'amountUSD', 'bcvRate', 'description',
          'paymentMethod', 'reference', 'status', 'createdAt',
          'balanceBefore', 'balanceAfter', 'studentId', 'representativeId',
          'createdBy', 'metadata'
        ],
        include: [
          { model: Student, as: 'student', required: false, attributes: ['id', 'fullName', 'currentGrade', 'section', 'status'] },
          { model: Representative, as: 'representative', attributes: ['id', 'fullName', 'identityCard'] },
          {
            model: UserLogin,
            as: 'creator',
            attributes: ['id', 'userlogin', 'username', 'nivel'],
            required: false,
          }
        ],
        distinct: true,
      });

      const formatted = transactions.map(t => {
        const isDeposit = t.type === TransactionType.DEPOSIT;
        const balanceAfterUSD = t.balanceAfter ?? 0;
        const pendingUSD = balanceAfterUSD < 0 ? Math.abs(balanceAfterUSD) : 0;
        const creditUSD = balanceAfterUSD > 0 ? balanceAfterUSD : 0;
        const displayStatus = (t.type === TransactionType.FEE || t.type === TransactionType.ADJUSTMENT)
          ? 'Pendiente'
          : (t.status === TransactionStatus.COMPLETED ? 'Completado' : t.status);

        const creatorAny = (t as any).creator;

        return {
          id: t.id,
          type: t.type,
          amount: t.amount,
          amountUSD: t.amountUSD,
          bcvRate: t.bcvRate,
          description: t.description,
          paymentMethod: t.paymentMethod,
          reference: t.reference,
          status: t.status,
          displayStatus,
          pendingUSD,
          creditUSD,
          balanceAfterUSD,
          balanceBeforeUSD: t.balanceBefore,
          createdAt: t.createdAt,
          student: t.student,
          representative: t.representative,
          metadata: (t as any).metadata || null,
          creator: creatorAny ? {
            id: creatorAny.id,
            userlogin: creatorAny.userlogin,
            username: creatorAny.username,
            nivel: creatorAny.nivel,
            role: creatorAny.nivel === 2 ? 'admin' : creatorAny.nivel === 1 ? 'representative' : 'system',
          } : null,
        };
      });

      res.status(200).json({
        result: true,
        content: {
          transactions: formatted,
          pagination: {
            totalRecords: count,
            currentPage: Number(page),
            totalPages: Math.ceil(count / Number(limit)),
            pageSize: Number(limit)
          }
        },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getTransactionHistory"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al obtener historial']
      });
    }
  };

  static getFinancialStatistics = async (req: Request, res: Response) => {
    try {
      const totalRepresentatives = await Representative.count();
      const reps = await Representative.findAll({
        include: [{ model: Student, as: 'students', attributes: ['balance'] }]
      });

      let totalDebtUSD = 0;
      let totalCreditUSD = 0;
      let debtorsCount = 0;
      let creditorsCount = 0;
      let zeroBalanceCount = 0;

      reps.forEach(rep => {
        const totalBalanceUSD = rep.students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;
        if (totalBalanceUSD < 0) {
          totalDebtUSD += Math.abs(totalBalanceUSD);
          debtorsCount++;
        } else if (totalBalanceUSD > 0) {
          totalCreditUSD += totalBalanceUSD;
          creditorsCount++;
        } else {
          zeroBalanceCount++;
        }
      });

      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const monthlyTransactions = await Transaction.findAll({
        where: {
          createdAt: { [Op.between]: [firstDayOfMonth, lastDayOfMonth] },
          status: 'completed'
        },
        attributes: ['type', [fn('SUM', col('amountUSD')), 'totalUSD']],
        group: ['type'],
        raw: true
      });

      const totalDepositsUSD = monthlyTransactions
        .filter((t: any) => t.type === 'deposit')
        .reduce((sum: number, t: any) => sum + parseFloat(t.totalUSD || 0), 0);

      const totalWithdrawalsUSD = monthlyTransactions
        .filter((t: any) => t.type === 'withdrawal')
        .reduce((sum: number, t: any) => sum + parseFloat(t.totalUSD || 0), 0);

      const result = {
        general: {
          totalRepresentatives,
          debtorsCount,
          creditorsCount,
          zeroBalanceCount,
          totalDebtUSD,
          totalCreditUSD,
          netBalanceUSD: totalCreditUSD - totalDebtUSD
        },
        monthlyTransactions: {
          totalDepositsUSD,
          totalWithdrawalsUSD,
          netMonthlyUSD: totalDepositsUSD - totalWithdrawalsUSD,
          transactionCount: monthlyTransactions.length
        },
        percentages: {
          debtorsPercentage: Math.round((debtorsCount / totalRepresentatives) * 100) || 0,
          creditorsPercentage: Math.round((creditorsCount / totalRepresentatives) * 100) || 0,
          paymentRate: Math.round(((totalRepresentatives - debtorsCount) / totalRepresentatives) * 100) || 0
        }
      };

      res.status(200).json({
        result: true,
        content: result,
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getFinancialStatistics"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al obtener estadísticas financieras']
      });
    }
  };

  static manualDeposit = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { amount, description, paymentMethod, reference, createdBy, studentId } = req.body;

      if (!amount || amount <= 0) {
        await transaction.rollback();
        return res.status(400).json({ result: false, content: [], error: ['El monto debe ser mayor a 0'] });
      }

      const bcvRate = await BillingService.getCurrentBCVRate();
      const amountUSD = amount / bcvRate;

      if (reference) {
        const existingTransaction = await Transaction.findOne({ where: { reference }, transaction });
        if (existingTransaction) {
          await transaction.rollback();
          return res.status(409).json({ result: false, content: [], error: [`La referencia "${reference}" ya fue utilizada en otra transacción.`] });
        }
      }

      const representative = await Representative.findByPk(id, {
        transaction,
        include: [{ model: Student, as: 'students' }]
      });
      if (!representative) {
        await transaction.rollback();
        return res.status(404).json({ result: false, content: [], error: ['Representante no encontrado'] });
      }

      let validCreatedBy = null;
      if (createdBy) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(createdBy)) validCreatedBy = createdBy;
      }

      let targetStudentId: string | null = null;
      let newTotalBalanceUSD: number;
      let updatedStudentIds: string[] = [];

      const totalBeforeUSD = representative.students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;

      if (studentId) {
        const student = await Student.findOne({ where: { id: studentId, representativeId: id }, transaction });
        if (!student) {
          await transaction.rollback();
          return res.status(400).json({ result: false, content: [], error: ['Estudiante no encontrado o no pertenece al representante'] });
        }

        const newBalanceUSD = (student.balance || 0) + amountUSD;
        await student.update({ balance: newBalanceUSD }, { transaction });
        targetStudentId = student.id!;
        updatedStudentIds.push(student.id!);
        const updatedStudents = await Student.findAll({ where: { representativeId: id }, transaction });
        newTotalBalanceUSD = updatedStudents.reduce((sum, s) => sum + (s.balance || 0), 0);
      } else {
        updatedStudentIds = await this.distributeAmountAmongStudents(id, amountUSD, transaction);
        const updatedStudents = await Student.findAll({ where: { representativeId: id }, transaction });
        newTotalBalanceUSD = updatedStudents.reduce((sum, s) => sum + (s.balance || 0), 0);
      }

      const newTransaction = await Transaction.create({
        representativeId: id,
        studentId: targetStudentId,
        type: TransactionType.DEPOSIT,
        amount: amount,
        amountUSD: amountUSD,
        bcvRate: bcvRate,
        description: description || 'Depósito manual',
        paymentMethod: paymentMethod || PaymentMethod.CASH,
        reference: reference || `MANUAL-${Date.now()}`,
        status: TransactionStatus.COMPLETED,
        createdBy: validCreatedBy,
        balanceBefore: totalBeforeUSD,
        balanceAfter: newTotalBalanceUSD,
        transactionDate: new Date(),
      }, { transaction });

      await transaction.commit();

      res.status(200).json({
        result: true,
        content: {
          message: 'Depósito registrado exitosamente',
          transactionId: newTransaction.id,
          newBalanceUSD: newTotalBalanceUSD,
          distributedAmong: updatedStudentIds.length,
          appliedToStudent: targetStudentId
        },
        error: []
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("manualDeposit"));
      res.status(500).json({ result: false, content: [], error: [`Error al realizar depósito: ${error.message}`] });
    }
  };

  static manualWithdrawal = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const { amount, description, paymentMethod, reference, createdBy, studentId } = req.body;

      if (!amount || amount <= 0) {
        await transaction.rollback();
        return res.status(400).json({ result: false, content: [], error: ['El monto debe ser mayor a 0'] });
      }

      const bcvRate = await BillingService.getCurrentBCVRate();
      const amountUSD = amount / bcvRate;

      const representative = await Representative.findByPk(id, {
        transaction,
        include: [{ model: Student, as: 'students' }]
      });
      if (!representative) {
        await transaction.rollback();
        return res.status(404).json({ result: false, content: [], error: ['Representante no encontrado'] });
      }

      const totalBalanceUSD = representative.students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;

      let validCreatedBy = null;
      if (createdBy) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(createdBy)) validCreatedBy = createdBy;
      }

      let targetStudentId: string | null = null;
      let newTotalBalanceUSD: number;
      let updatedStudentIds: string[] = [];

      if (studentId) {
        const student = await Student.findOne({ where: { id: studentId, representativeId: id }, transaction });
        if (!student) {
          await transaction.rollback();
          return res.status(400).json({ result: false, content: [], error: ['Estudiante no encontrado o no pertenece al representante'] });
        }
        if ((student.balance || 0) < amountUSD) {
          await transaction.rollback();
          return res.status(400).json({ result: false, content: [], error: [`Saldo insuficiente en el estudiante seleccionado. Saldo actual: ${student.balance} USD`] });
        }
        const newBalanceUSD = (student.balance || 0) - amountUSD;
        await student.update({ balance: newBalanceUSD }, { transaction });
        targetStudentId = student.id!;
        updatedStudentIds.push(student.id!);
        const updatedStudents = await Student.findAll({ where: { representativeId: id }, transaction });
        newTotalBalanceUSD = updatedStudents.reduce((sum, s) => sum + (s.balance || 0), 0);
      } else {
        if (totalBalanceUSD < amountUSD) {
          await transaction.rollback();
          return res.status(400).json({ result: false, content: [], error: [`Saldo insuficiente. Saldo actual: ${totalBalanceUSD} USD`] });
        }
        updatedStudentIds = await this.distributeAmountAmongStudents(id, -amountUSD, transaction);
        const updatedStudents = await Student.findAll({ where: { representativeId: id }, transaction });
        newTotalBalanceUSD = updatedStudents.reduce((sum, s) => sum + (s.balance || 0), 0);
      }

      const newTransaction = await Transaction.create({
        representativeId: id,
        studentId: targetStudentId,
        type: TransactionType.WITHDRAWAL,
        amount: amount,
        amountUSD: amountUSD,
        bcvRate: bcvRate,
        description: description || 'Retiro manual',
        paymentMethod: paymentMethod || PaymentMethod.CASH,
        reference: reference || `MANUAL-${Date.now()}`,
        status: TransactionStatus.COMPLETED,
        createdBy: validCreatedBy,
        balanceBefore: totalBalanceUSD,
        balanceAfter: newTotalBalanceUSD
      }, { transaction });

      await transaction.commit();

      res.status(200).json({
        result: true,
        content: {
          message: 'Retiro registrado exitosamente',
          transactionId: newTransaction.id,
          newBalanceUSD: newTotalBalanceUSD,
          appliedToStudent: targetStudentId
        },
        error: []
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("manualWithdrawal"));
      res.status(500).json({ result: false, content: [], error: [`Error al realizar retiro: ${error.message}`] });
    }
  };

  // ================== NUEVO MÉTODO: Mover pago entre estudiantes ==================
    // ================== MÉTODO: Mover pago entre estudiantes (parcial o total) ==================
  static movePaymentBetweenStudents = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const { transactionId, targetStudentId, amountToMove } = req.body;

      if (!transactionId || !targetStudentId || amountToMove === undefined) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: ['transactionId, targetStudentId y amountToMove son requeridos']
        });
      }

      const amountToMoveBs = parseFloat(amountToMove);
      if (isNaN(amountToMoveBs) || amountToMoveBs <= 0) {
        await transaction.rollback();
        return res.status(400).json({ result: false, content: [], error: ['El monto a mover debe ser mayor a 0'] });
      }

      // Obtener transacción origen
      const sourceTransaction = await Transaction.findByPk(transactionId, { transaction });
      if (!sourceTransaction) {
        await transaction.rollback();
        return res.status(404).json({ result: false, content: [], error: ['Transacción no encontrada'] });
      }

      // Validar que sea un depósito completado y que tenga estudiante asignado
      if (sourceTransaction.type !== TransactionType.DEPOSIT || sourceTransaction.status !== TransactionStatus.COMPLETED) {
        await transaction.rollback();
        return res.status(400).json({ result: false, content: [], error: ['La transacción debe ser un depósito completado'] });
      }
      if (!sourceTransaction.studentId) {
        await transaction.rollback();
        return res.status(400).json({ result: false, content: [], error: ['La transacción no tiene un estudiante asignado'] });
      }

      const sourceBcvRate = sourceTransaction.bcvRate || 0;
      if (sourceBcvRate <= 0) {
        await transaction.rollback();
        return res.status(400).json({ result: false, content: [], error: ['Tasa BCV inválida en la transacción original'] });
      }

      const originalAmountBs = sourceTransaction.amount || 0;
      const originalAmountUSD = sourceTransaction.amountUSD || 0;

      if (amountToMoveBs > originalAmountBs) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: [`El monto a mover (${amountToMoveBs} Bs) no puede ser mayor al monto original (${originalAmountBs} Bs)`]
        });
      }

      // Convertir el monto a mover a USD usando la tasa histórica original
      const amountToMoveUSD = Math.round((amountToMoveBs / sourceBcvRate) * 100) / 100;
      const remainingAmountUSD = Math.round((originalAmountUSD - amountToMoveUSD) * 100) / 100;
      const remainingAmountBs = Math.round((originalAmountBs - amountToMoveBs) * 100) / 100;

      if (amountToMoveUSD <= 0) {
        await transaction.rollback();
        return res.status(400).json({ result: false, content: [], error: ['El monto a mover es demasiado pequeño'] });
      }

      // Obtener estudiante origen
      const sourceStudent = await Student.findByPk(sourceTransaction.studentId, { transaction });
      if (!sourceStudent) {
        await transaction.rollback();
        return res.status(404).json({ result: false, content: [], error: ['Estudiante origen no encontrado'] });
      }

      // Obtener estudiante destino
      const targetStudent = await Student.findByPk(targetStudentId, { transaction });
      if (!targetStudent) {
        await transaction.rollback();
        return res.status(404).json({ result: false, content: [], error: ['Estudiante destino no encontrado'] });
      }

      // Verificar que ambos pertenezcan al mismo representante
      if (sourceStudent.representativeId !== targetStudent.representativeId) {
        await transaction.rollback();
        return res.status(400).json({ result: false, content: [], error: ['Los estudiantes deben pertenecer al mismo representante'] });
      }

      if (sourceStudent.id === targetStudent.id) {
        await transaction.rollback();
        return res.status(400).json({ result: false, content: [], error: ['No se puede mover a sí mismo'] });
      }

      const sourceBalanceBefore = sourceStudent.balance || 0;
      const targetBalanceBefore = targetStudent.balance || 0;

      // 1) Restar del origen el monto original y devolver el remanente
      const sourceBalanceAfter = Math.round((sourceBalanceBefore - amountToMoveUSD) * 100) / 100;
      await sourceStudent.update({ balance: sourceBalanceAfter }, { transaction });

      // 2) Sumar al destino el monto a mover
      const targetBalanceAfter = Math.round((targetBalanceBefore + amountToMoveUSD) * 100) / 100;
      await targetStudent.update({ balance: targetBalanceAfter }, { transaction });

      // 3) Marcar la transacción original como REVERSED
      await sourceTransaction.update({ status: TransactionStatus.REVERSED }, { transaction });

      // 4) Crear nueva transacción DEPOSIT para el estudiante ORIGEN con el remanente (si queda algo)
      if (remainingAmountUSD > 0) {
        await Transaction.create({
          representativeId: sourceTransaction.representativeId,
          studentId: sourceStudent.id,
          type: TransactionType.DEPOSIT,
          amount: remainingAmountBs,
          amountUSD: remainingAmountUSD,
          bcvRate: sourceBcvRate,
          description: `${sourceTransaction.description || 'Depósito'} (remanente)`,
          paymentMethod: sourceTransaction.paymentMethod,
          reference: `${sourceTransaction.reference || 'MOVED'}-REM-${Date.now()}`,
          status: TransactionStatus.COMPLETED,
          createdBy: sourceTransaction.createdBy,
          balanceBefore: Math.round((sourceBalanceBefore - originalAmountUSD) * 100) / 100,
          balanceAfter: sourceBalanceAfter,
          transactionDate: new Date(),
          metadata: {
            isMovedRemainder: true,
            sourceTransactionId: sourceTransaction.id,
            movedToStudentId: targetStudent.id,
            movedToStudentName: targetStudent.fullName,
            movedAmountBs: amountToMoveBs,
            movedAmountUSD: amountToMoveUSD,
            remainingAmountBs,
            remainingAmountUSD,
          },
        }, { transaction });
      }

      // 5) Crear nueva transacción DEPOSIT para el estudiante DESTINO con el monto movido
     await Transaction.create({
        representativeId: sourceTransaction.representativeId,
        studentId: targetStudent.id,
        type: TransactionType.DEPOSIT,
        amount: amountToMoveBs,
        amountUSD: amountToMoveUSD,
        bcvRate: sourceBcvRate,
        description: `${sourceTransaction.description || 'Depósito'} (movido)`,
        paymentMethod: sourceTransaction.paymentMethod,
        reference: `${sourceTransaction.reference || 'MOVED'}-MOV-${Date.now()}`,
        status: TransactionStatus.COMPLETED,
        createdBy: sourceTransaction.createdBy,
        balanceBefore: targetBalanceBefore,
        balanceAfter: targetBalanceAfter,
        transactionDate: new Date(),
        metadata: {
          isMoved: true,
          sourceTransactionId: sourceTransaction.id,
          movedFromStudentId: sourceStudent.id,
          movedFromStudentName: sourceStudent.fullName,
          movedToStudentId: targetStudent.id,
          movedToStudentName: targetStudent.fullName,
          movedAmountBs: amountToMoveBs,
          movedAmountUSD: amountToMoveUSD,
        },
      }, { transaction });

      await transaction.commit();

      res.status(200).json({
        result: true,
        content: {
          message: remainingAmountUSD > 0
            ? `Se movieron ${amountToMoveBs} Bs al estudiante destino. Quedan ${remainingAmountBs} Bs en el estudiante origen.`
            : `Se movió todo el pago (${amountToMoveBs} Bs) al estudiante destino.`,
          sourceTransactionId: sourceTransaction.id,
          sourceStudentId: sourceStudent.id,
          targetStudentId: targetStudent.id,
          movedAmountBs: amountToMoveBs,
          movedAmountUSD: amountToMoveUSD,
          remainingAmountBs,
          remainingAmountUSD,
        },
        error: []
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("movePaymentBetweenStudents"));
      res.status(500).json({ result: false, content: [], error: [`Error al mover pago: ${error.message}`] });
    }
  };
  // ================== FIN MÉTODO ==================

  // ================== FIN NUEVO MÉTODO ==================

  static checkPaymentExists = async (req: Request, res: Response) => {
    try {
      const { reference, representativeId } = req.query;
      if (!reference || !representativeId) {
        return res.status(400).json({ result: false, content: [], error: ['La referencia y el ID del representante son requeridos'] });
      }
      const existingTransaction = await Transaction.findOne({
        where: {
          reference: reference as string,
          representativeId: representativeId as string,
          status: TransactionStatus.COMPLETED
        }
      });
      res.status(200).json({
        result: true,
        content: { exists: !!existingTransaction, transaction: existingTransaction || null },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("checkPaymentExists"));
      res.status(500).json({ result: false, content: [], error: ['Error al verificar pago'] });
    }
  };

  static getTransactionStatus = async (req: Request, res: Response) => {
    try {
      const { reference, bankCode, accountNumber, amount } = req.query;
      if (!reference || !bankCode) {
        return res.status(400).json({ result: false, content: [], error: ['La referencia y el código de banco son requeridos'] });
      }
      const transaction = await Transaction.findOne({
        where: { reference: reference as string },
        include: [{ model: Representative, as: 'representative', attributes: ['fullName', 'identityCard'] }]
      });
      if (!transaction) {
        return res.status(404).json({ result: false, content: [], error: ['Transacción no encontrada'] });
      }
      res.status(200).json({
        result: true,
        content: {
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
          amountUSD: transaction.amountUSD,
          status: transaction.status,
          reference: transaction.reference,
          description: transaction.description,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          representative: transaction.representative
        },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getTransactionStatus"));
      res.status(500).json({ result: false, content: [], error: ['Error al obtener estado de transacción'] });
    }
  };

  static getRepresentativeByEmail = async (req: Request, res: Response) => {
    try {
      const { email } = req.query;
      if (!email) {
        return res.status(400).json({ result: false, content: [], error: ['Email es requerido'] });
      }
      const user = await UserLogin.findOne({ where: { usermail: email as string } });
      if (!user) return res.status(404).json({ result: false, content: [], error: ['Usuario no encontrado'] });
      const representative = await Representative.findOne({ where: { userId: user.id } });
      if (!representative) return res.status(404).json({ result: false, content: [], error: ['No se encontró representante asociado a este usuario'] });
      res.json({
        result: true,
        content: {
          id: representative.id,
          fullName: representative.fullName,
          identityCard: representative.identityCard
        },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getRepresentativeByEmail"));
      res.status(500).json({ result: false, content: [], error: ['Error al buscar representante'] });
    }
  };

  static getRecentTransactions = async (req: Request, res: Response) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const transactions = await Transaction.findAll({
        limit,
        order: [['createdAt', 'DESC']],
        attributes: [
          'id', 'type', 'amount', 'amountUSD', 'bcvRate', 'description',
          'paymentMethod', 'reference', 'status', 'createdAt',
          'balanceBefore', 'balanceAfter', 'studentId', 'representativeId'
        ],
        include: [
          { model: Representative, as: 'representative', attributes: ['id', 'fullName', 'identityCard'] }
        ]
      });

      const formatted = transactions.map(t => {
        const paymentStatus = (t.type === TransactionType.DEPOSIT && (t.balanceAfter ?? 0) < 0) ? 'incompleto' : 'completo';
        return {
          id: t.id,
          date: t.createdAt ? new Date(t.createdAt).toLocaleDateString('es-VE') : 'N/A',
          representativeName: t.representative?.fullName || 'N/A',
          type: t.type,
          description: t.description,
          amount: t.amount,
          amountUSD: t.amountUSD,
          bcvRate: t.bcvRate,
          balanceAfter: t.balanceAfter,
          paymentStatus,
          status: t.status
        };
      });

      res.status(200).json({ result: true, content: formatted, error: [] });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getRecentTransactions"));
      res.status(500).json({ result: false, content: [], error: ['Error al obtener transacciones recientes'] });
    }
  };

     static getAllTransactions = async (req: Request, res: Response) => {
    try {
      const {
        page = 1, limit = 20, representativeId, studentId,
        type, status, startDate, endDate, search, sortBy, sortOrder,
        createdByRole,
        balanceStatus,
        studentGrade,      // nuevo
        studentSection,    // nuevo
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      const where: any = {};

      if (representativeId) where.representativeId = representativeId;
      if (studentId) where.studentId = studentId;
      if (type) where.type = type;
      if (status) where.status = status;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate as string);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate as string);
      }

      if (balanceStatus && balanceStatus !== 'all') {
        const reps = await Representative.findAll({
          include: [{ model: Student, as: 'students', attributes: ['balance'] }]
        });

        const repIds: string[] = [];
        reps.forEach((rep: any) => {
          const total = rep.students?.reduce((sum: number, s: any) => sum + (s.balance || 0), 0) || 0;
          if (balanceStatus === 'debtors' && total < 0) repIds.push(rep.id);
          if (balanceStatus === 'creditors' && total >= 0) repIds.push(rep.id);
        });

        where.representativeId = {
          [Op.in]: repIds.length > 0 ? repIds : ['00000000-0000-0000-0000-000000000000']
        };
      }

      if (search) {
        where[Op.or] = [
          { description: { [Op.iLike]: `%${search}%` } },
          { reference: { [Op.iLike]: `%${search}%` } },
          { '$representative.fullName$': { [Op.iLike]: `%${search}%` } },
          { '$student.fullName$': { [Op.iLike]: `%${search}%` } }
        ];
      }

      const order: any = [];
      if (sortBy && sortOrder) {
        const direction = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
        order.push([sortBy as string, direction]);
      } else {
        order.push(['createdAt', 'DESC']);
      }

      // Include de Student con filtros opcionales por grado y sección
      const studentInclude: any = {
        model: Student,
        as: 'student',
        attributes: ['id', 'fullName', 'currentGrade', 'section'],
      };
      if (studentGrade || studentSection) {
        studentInclude.required = true;
        studentInclude.where = {};
        if (studentGrade) studentInclude.where.currentGrade = studentGrade;
        if (studentSection) studentInclude.where.section = studentSection;
      }

      const include: any[] = [
        studentInclude,
        { model: Representative, as: 'representative', attributes: ['id', 'fullName', 'identityCard'] },
        {
          model: UserLogin,
          as: 'creator',
          attributes: ['id', 'userlogin', 'username', 'nivel'],
          required: false,
        }
      ];

      if (createdByRole === 'admin' || createdByRole === 'representative') {
        include[2].required = true;
        include[2].where = {
          nivel: createdByRole === 'admin' ? 2 : 1,
        };
      } else if (createdByRole === 'system') {
        where.createdBy = null;
        where.type = { [Op.in]: ['fee', 'adjustment'] };
      }

      const { count, rows: transactions } = await Transaction.findAndCountAll({
        where,
        limit: Number(limit),
        offset,
        order,
        attributes: [
          'id', 'type', 'amount', 'amountUSD', 'bcvRate', 'description',
          'paymentMethod', 'reference', 'status', 'createdAt',
          'balanceBefore', 'balanceAfter', 'studentId', 'representativeId',
          'createdBy', 'metadata'
        ],
        include,
        distinct: true,
      });

      const formatted = transactions.map(t => {
        const paymentStatus = (t.type === TransactionType.DEPOSIT && (t.balanceAfter ?? 0) < 0) ? 'incompleto' : 'completo';
        const creatorAny = (t as any).creator;
        return {
          id: t.id,
          type: t.type,
          amount: t.amount,
          amountUSD: t.amountUSD,
          bcvRate: t.bcvRate,
          description: t.description,
          paymentMethod: t.paymentMethod,
          reference: t.reference,
          status: t.status,
          paymentStatus,
          balanceAfter: t.balanceAfter,
          createdAt: t.createdAt,
          student: t.student,
          representative: t.representative,
          metadata: (t as any).metadata || null,
          creator: creatorAny ? {
            id: creatorAny.id,
            userlogin: creatorAny.userlogin,
            username: creatorAny.username,
            nivel: creatorAny.nivel,
            role: creatorAny.nivel === 2 ? 'admin' : creatorAny.nivel === 1 ? 'representative' : 'system',
          } : null,
        };
      });

      res.status(200).json({
        result: true,
        content: {
          transactions: formatted,
          pagination: {
            totalRecords: count,
            currentPage: Number(page),
            totalPages: Math.ceil(count / Number(limit)),
          }
        },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getAllTransactions"));
      res.status(500).json({ result: false, content: [], error: ['Error al obtener transacciones'] });
    }
  };
    // ==================================================================
  // ESTADO DE CUENTA POR REPRESENTANTE
  // GET /private/balance/representative/:id/account-statement
  // ==================================================================
  static getAccountStatement = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { startDate, endDate, studentId } = req.query;

      const representative = await Representative.findByPk(id, {
        include: [
          { model: UserLogin, as: 'user', attributes: ['userlogin', 'usermail'] },
          {
            model: Student,
            as: 'students',
            attributes: ['id', 'fullName', 'identityCard', 'status', 'currentGrade', 'balance']
          }
        ]
      });

      if (!representative) {
        return res.status(404).json({ result: false, content: [], error: ['Representante no encontrado'] });
      }

      const where: any = { representativeId: id };
      if (studentId) where.studentId = studentId;
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate as string);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate as string);
      }

      const transactions = await Transaction.findAll({
        where,
        order: [['createdAt', 'ASC']],
        attributes: [
          'id', 'type', 'amount', 'amountUSD', 'bcvRate', 'description',
          'paymentMethod', 'reference', 'status', 'createdAt',
          'balanceBefore', 'balanceAfter', 'studentId'
        ],
        include: [
          { model: Student, as: 'student', attributes: ['id', 'fullName'] }
        ]
      });

      let totalCargosUSD = 0;
      let totalAbonosUSD = 0;
      let totalCargosBs = 0;
      let totalAbonosBs = 0;

      transactions.forEach((t: any) => {
        if (t.type === 'deposit') {
          totalAbonosUSD += t.amountUSD || 0;
          totalAbonosBs += t.amount || 0;
        } else if (t.type === 'fee') {
          totalCargosUSD += t.amountUSD || 0;
          totalCargosBs += t.amount || 0;
        } else if (t.type === 'adjustment') {
          // Ajuste a favor: considerarlo abono
          totalAbonosUSD += t.amountUSD || 0;
          totalAbonosBs += t.amount || 0;
        }
      });

      const totalBalanceUSD =
        representative.students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;

      res.status(200).json({
        result: true,
        content: {
          representative: {
            id: representative.id,
            fullName: representative.fullName,
            identityCard: representative.identityCard,
            phone: representative.phone,
            email: representative.user?.usermail || '',
            balanceUSD: Math.round(totalBalanceUSD * 100) / 100,
            students: representative.students || []
          },
          summary: {
            totalCargosUSD: Math.round(totalCargosUSD * 100) / 100,
            totalAbonosUSD: Math.round(totalAbonosUSD * 100) / 100,
            totalCargosBs: Math.round(totalCargosBs * 100) / 100,
            totalAbonosBs: Math.round(totalAbonosBs * 100) / 100,
            saldoFinalUSD: Math.round(totalBalanceUSD * 100) / 100,
            transactionCount: transactions.length,
          },
          transactions: transactions.map((t: any) => ({
            id: t.id,
            type: t.type,
            amount: t.amount,
            amountUSD: t.amountUSD,
            bcvRate: t.bcvRate,
            description: t.description,
            paymentMethod: t.paymentMethod,
            reference: t.reference,
            status: t.status,
            createdAt: t.createdAt,
            balanceAfter: t.balanceAfter,
            student: t.student,
          })),
        },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getAccountStatement"));
      res.status(500).json({ result: false, content: [], error: ['Error al obtener estado de cuenta'] });
    }
  };
}