// src/controllers/balance-controller.ts
import type { Request, Response } from "express";
import Representative from "../database/models/representative";
import Student from "../database/models/student";
import Transaction from "../database/models/transaction";
import UserLogin from "../database/models/userlogin";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import sequelize from "../database/config";
import { Op, fn, col, literal } from "sequelize";
import { PaymentMethod, TransactionType, TransactionStatus } from "../database/models/transaction";

export class BalanceController {
  
  // Helper para distribuir un monto entre los estudiantes de un representante
  private static async distributeAmountAmongStudents(
    representativeId: string, 
    amount: number, 
    transaction: any
  ): Promise<void> {
    const students = await Student.findAll({
      where: { representativeId },
      transaction
    });
    if (students.length === 0) return;
    const perStudent = amount / students.length;
    for (const student of students) {
      await student.update({
        balance: (student.balance || 0) + perStudent
      }, { transaction });
    }
  }

  // Listar representantes con filtros (ahora el balance se calcula)
  static listRepresentatives = async (req: Request, res: Response) => {
    try {
      const {
        page = 1,
        limit = 10,
        fullName,
        identityCard,
        relationship,
        hasDebt,
        hasCredit,
        hasStudents,
        activeOnly = true,
        search,
        sortBy = 'fullName',
        sortOrder = 'asc'
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      
      const where: any = {};
      
      if (fullName) where.fullName = { [Op.iLike]: `%${fullName}%` };
      if (identityCard) where.identityCard = { [Op.iLike]: `%${identityCard}%` };
      if (relationship) where.relationship = relationship;
      
      // Búsqueda general
      if (search) {
        where[Op.or] = [
          { fullName: { [Op.iLike]: `%${search}%` } },
          { identityCard: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } }
        ];
      }
      
      // Filtrar solo representantes con usuarios activos
      if (activeOnly === true || activeOnly === 'true') {
        where['$user.userstatus$'] = true;
      }

      // Consulta principal con subconsulta para obtener el balance total
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

      // Formatear respuesta calculando balance total y aplicando filtros
      const formattedRepresentatives = representatives
        .map((rep: any) => {
          const totalBalance = rep.students?.reduce((sum: number, s: any) => sum + (s.balance || 0), 0) || 0;
          return {
            id: rep.id,
            fullName: rep.fullName,
            identityCard: rep.identityCard,
            phone: rep.phone,
            relationship: rep.relationship,
            balance: totalBalance,
            balanceFormatted: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(totalBalance),
            balanceStatus: totalBalance < 0 ? 'debt' : totalBalance > 0 ? 'credit' : 'zero',
            debtAmount: totalBalance < 0 ? Math.abs(totalBalance) : 0,
            studentCount: rep.students?.length || 0,
            userStatus: rep.user?.userstatus || false,
            email: rep.user?.usermail || '',
            createdAt: rep.createdAt,
            updatedAt: rep.updatedAt
          };
        })
        .filter(rep => {
          // Aplicar filtros basados en balance después del cálculo
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

  // Top deudores (basado en balance total negativo)
  static getTopDebtors = async (req: Request, res: Response) => {
    try {
      const limit = Number(req.query.limit) || 10;
      
      // Obtener todos los representantes con estudiantes
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

      // Calcular balance total y filtrar deudores
      const debtors = reps
        .map(rep => {
          const totalBalance = rep.students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;
          return {
            id: rep.id,
            fullName: rep.fullName,
            identityCard: rep.identityCard,
            balance: totalBalance,
            debtAmount: totalBalance < 0 ? Math.abs(totalBalance) : 0,
            studentCount: rep.students?.length || 0,
            email: rep.user?.usermail || '',
            phone: rep.phone
          };
        })
        .filter(d => d.balance < 0)
        .sort((a, b) => a.balance - b.balance) // más negativo primero
        .slice(0, limit);

      res.status(200).json({
        result: true,
        content: {
          debtors,
          totalDebt: debtors.reduce((sum, d) => sum + d.debtAmount, 0)
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

  // Top con más saldo (balance total positivo)
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
          const totalBalance = rep.students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;
          return {
            id: rep.id,
            fullName: rep.fullName,
            identityCard: rep.identityCard,
            balance: totalBalance,
            creditAmount: totalBalance > 0 ? totalBalance : 0,
            studentCount: rep.students?.length || 0,
            phone: rep.phone
          };
        })
        .filter(c => c.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .slice(0, limit);

      res.status(200).json({
        result: true,
        content: {
          creditors,
          totalCredit: creditors.reduce((sum, c) => sum + c.creditAmount, 0)
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

  // Obtener balance de un representante (suma de balances de estudiantes)
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

      const totalBalance = representative.students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;

      // Obtener últimas transacciones (ahora también asociadas al representante)
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
          balance: totalBalance,
          balanceFormatted: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(totalBalance),
          balanceStatus: totalBalance < 0 ? 'debt' : totalBalance > 0 ? 'credit' : 'zero',
          debtAmount: totalBalance < 0 ? Math.abs(totalBalance) : 0,
          studentCount: representative.students?.length || 0,
          userEmail: representative.user?.usermail || '',
          students: representative.students?.map(s => ({
            id: s.id,
            fullName: s.fullName,
            status: s.status,
            currentGrade: s.currentGrade,
            balance: s.balance || 0,
            balanceFormatted: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD' }).format(s.balance || 0)
          })) || []
        },
        recentTransactions: recentTransactions.map((t: any) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
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

  // Historial de transacciones
  static getTransactionHistory = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        page = 1,
        limit = 20,
        type,
        status,
        startDate,
        endDate
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      
      const where: any = { representativeId: id };
      
      if (type) where.type = type;
      if (status) where.status = status;
      
      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt[Op.gte] = new Date(startDate as string);
        if (endDate) where.createdAt[Op.lte] = new Date(endDate as string);
      }

      const { count, rows: transactions } = await Transaction.findAndCountAll({
        where,
        limit: Number(limit),
        offset,
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: Representative,
            as: 'representative',
            attributes: ['fullName', 'identityCard']
          }
        ]
      });

      res.status(200).json({
        result: true,
        content: {
          transactions,
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

  // Estadísticas financieras (ahora basadas en balances de estudiantes)
  static getFinancialStatistics = async (req: Request, res: Response) => {
    try {
      // Total de representantes
      const totalRepresentatives = await Representative.count();
      
      // Obtener todos los representantes con estudiantes
      const reps = await Representative.findAll({
        include: [{
          model: Student,
          as: 'students',
          attributes: ['balance']
        }]
      });

      let totalDebt = 0;
      let totalCredit = 0;
      let debtorsCount = 0;
      let creditorsCount = 0;
      let zeroBalanceCount = 0;

      reps.forEach(rep => {
        const totalBalance = rep.students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;
        if (totalBalance < 0) {
          totalDebt += Math.abs(totalBalance);
          debtorsCount++;
        } else if (totalBalance > 0) {
          totalCredit += totalBalance;
          creditorsCount++;
        } else {
          zeroBalanceCount++;
        }
      });

      // Transacciones del mes actual
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      
      const monthlyTransactions = await Transaction.findAll({
        where: {
          createdAt: {
            [Op.between]: [firstDayOfMonth, lastDayOfMonth]
          },
          status: 'completed'
        },
        attributes: [
          'type',
          [fn('SUM', col('amount')), 'totalAmount']
        ],
        group: ['type'],
        raw: true
      });
      
      const totalDeposits = monthlyTransactions
        .filter((t: any) => t.type === 'deposit')
        .reduce((sum: number, t: any) => sum + parseFloat(t.totalAmount || 0), 0);
      
      const totalWithdrawals = monthlyTransactions
        .filter((t: any) => t.type === 'withdrawal')
        .reduce((sum: number, t: any) => sum + parseFloat(t.totalAmount || 0), 0);
      
      const result = {
        general: {
          totalRepresentatives,
          debtorsCount,
          creditorsCount,
          zeroBalanceCount,
          totalDebt,
          totalCredit,
          netBalance: totalCredit - totalDebt
        },
        monthlyTransactions: {
          totalDeposits,
          totalWithdrawals,
          netMonthly: totalDeposits - totalWithdrawals,
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

  // Transacciones recientes (para dashboard)
  static getRecentTransactions = async (req: Request, res: Response) => {
    try {
      const limit = Number(req.query.limit) || 10;
      
      const transactions = await Transaction.findAll({
        limit,
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: Representative,
            as: 'representative',
            attributes: ['fullName', 'identityCard']
          }
        ]
      });

      res.status(200).json({
        result: true,
        content: transactions,
        error: []
      });

    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getRecentTransactions"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al obtener transacciones recientes']
      });
    }
  };

  // Depósito manual - Ahora distribuye entre estudiantes
  static manualDeposit = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { amount, description, paymentMethod, reference, createdBy } = req.body;
      
      console.log('📥 Datos recibidos para depósito:', { id, amount, description, paymentMethod, reference, createdBy });
      
      if (!amount || amount <= 0) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: ['El monto debe ser mayor a 0']
        });
      }
      
      const representative = await Representative.findByPk(id, { 
        transaction,
        include: [{ model: Student, as: 'students' }]
      });
      if (!representative) {
        await transaction.rollback();
        return res.status(404).json({
          result: false,
          content: [],
          error: ['Representante no encontrado']
        });
      }

      // Validar createdBy
      let validCreatedBy = null;
      if (createdBy) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(createdBy)) validCreatedBy = createdBy;
      }

      // Distribuir el monto entre los estudiantes
      await this.distributeAmountAmongStudents(id, amount, transaction);

      // Calcular nuevo balance total para la transacción
      const updatedStudents = await Student.findAll({ where: { representativeId: id }, transaction });
      const newTotalBalance = updatedStudents.reduce((sum, s) => sum + (s.balance || 0), 0);

      // Crear transacción
      const newTransaction = await Transaction.create({
        representativeId: id,
        type: 'deposit',
        amount: amount,
        description: description || 'Depósito manual',
        paymentMethod: paymentMethod || 'cash',
        reference: reference || `MANUAL-${Date.now()}`,
        status: 'completed',
        createdBy: validCreatedBy,
        balanceBefore: (representative as any)._previousBalance, // no tenemos el anterior fácilmente, pero se puede omitir
        balanceAfter: newTotalBalance
      }, { transaction });
      
      await transaction.commit();
      
      res.status(200).json({
        result: true,
        content: {
          message: 'Depósito registrado exitosamente',
          transactionId: newTransaction.id,
          newBalance: newTotalBalance,
          distributedAmong: updatedStudents.length
        },
        error: []
      });
      
    } catch (error: any) {
      await transaction.rollback();
      console.error('❌ Error en manualDeposit:', error);
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("manualDeposit"));
      res.status(500).json({
        result: false,
        content: [],
        error: [`Error al realizar depósito: ${error.message}`]
      });
    }
  };

  // Retiro manual - Ahora distribuye entre estudiantes (resta)
  static manualWithdrawal = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const { amount, description, paymentMethod, reference, createdBy } = req.body;
      
      console.log('📥 Datos recibidos para retiro:', { id, amount, description, paymentMethod, reference, createdBy });
      
      if (!amount || amount <= 0) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: ['El monto debe ser mayor a 0']
        });
      }
      
      const representative = await Representative.findByPk(id, { 
        transaction,
        include: [{ model: Student, as: 'students' }]
      });
      if (!representative) {
        await transaction.rollback();
        return res.status(404).json({
          result: false,
          content: [],
          error: ['Representante no encontrado']
        });
      }

      // Verificar saldo total suficiente
      const totalBalance = representative.students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;
      if (totalBalance < amount) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: [`Saldo insuficiente. Saldo actual: ${totalBalance}`]
        });
      }

      // Validar createdBy
      let validCreatedBy = null;
      if (createdBy) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(createdBy)) validCreatedBy = createdBy;
      }

      // Distribuir el retiro (restar) entre los estudiantes
      await this.distributeAmountAmongStudents(id, -amount, transaction);

      // Calcular nuevo balance total
      const updatedStudents = await Student.findAll({ where: { representativeId: id }, transaction });
      const newTotalBalance = updatedStudents.reduce((sum, s) => sum + (s.balance || 0), 0);

      // Crear transacción
      const newTransaction = await Transaction.create({
        representativeId: id,
        type: 'withdrawal',
        amount: amount,
        description: description || 'Retiro manual',
        paymentMethod: paymentMethod || 'cash',
        reference: reference || `MANUAL-${Date.now()}`,
        status: 'completed',
        createdBy: validCreatedBy,
        balanceBefore: totalBalance,
        balanceAfter: newTotalBalance
      }, { transaction });
      
      await transaction.commit();
      
      res.status(200).json({
        result: true,
        content: {
          message: 'Retiro registrado exitosamente',
          transactionId: newTransaction.id,
          newBalance: newTotalBalance
        },
        error: []
      });
      
    } catch (error: any) {
      await transaction.rollback();
      console.error('❌ Error en manualWithdrawal:', error);
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("manualWithdrawal"));
      res.status(500).json({
        result: false,
        content: [],
        error: [`Error al realizar retiro: ${error.message}`]
      });
    }
  };

  // ========== MÉTODOS FALTANTES AGREGADOS ==========

  // Verificar si existe un pago (por referencia y representante)
  static checkPaymentExists = async (req: Request, res: Response) => {
    try {
      const { reference, representativeId } = req.query;
      
      if (!reference || !representativeId) {
        return res.status(400).json({
          result: false,
          content: [],
          error: ['La referencia y el ID del representante son requeridos']
        });
      }
      
      const existingTransaction = await Transaction.findOne({
        where: {
          reference: reference as string,
          representativeId: representativeId as string,
          status: 'completed'
        }
      });
      
      res.status(200).json({
        result: true,
        content: {
          exists: !!existingTransaction,
          transaction: existingTransaction || null
        },
        error: []
      });
      
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("checkPaymentExists"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al verificar pago']
      });
    }
  };

  // Obtener estado de transacción (por referencia, código de banco, etc.)
  static getTransactionStatus = async (req: Request, res: Response) => {
    try {
      const { reference, bankCode, accountNumber, amount } = req.query;
      
      if (!reference || !bankCode) {
        return res.status(400).json({
          result: false,
          content: [],
          error: ['La referencia y el código de banco son requeridos']
        });
      }
      
      // Buscar la transacción por referencia (puede haber múltiples, pero típicamente es única)
      const transaction = await Transaction.findOne({
        where: {
          reference: reference as string
        },
        include: [{
          model: Representative,
          as: 'representative',
          attributes: ['fullName', 'identityCard']
        }]
      });
      
      if (!transaction) {
        return res.status(404).json({
          result: false,
          content: [],
          error: ['Transacción no encontrada']
        });
      }
      
      res.status(200).json({
        result: true,
        content: {
          id: transaction.id,
          type: transaction.type,
          amount: transaction.amount,
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
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al obtener estado de transacción']
      });
    }
  };
}