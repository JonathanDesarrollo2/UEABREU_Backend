import type { Request, Response, NextFunction } from "express";
import Representative from "../database/models/representative";
import Transaction, { TransactionType, PaymentMethod, TransactionStatus } from "../database/models/transaction";
import Student from "../database/models/student";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import { Sequelize, Op, fn, col, literal } from "sequelize";
import { TransactionValidator } from "../utility/transaction-validator";

export class BalanceController {
  
  //#region: Obtener balance de un representante
  static getBalance = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      const representative = await Representative.findByPk(id, {
        attributes: ['id', 'fullName', 'identityCard', 'phone', 'balance'],
        include: [
          {
            model: Student,
            as: 'students',
            attributes: ['id', 'fullName', 'status']
          },
          {
            model: Transaction,
            as: 'transactions',
            limit: 10,
            order: [['createdAt', 'DESC']],
            attributes: ['id', 'type', 'amount', 'description', 'paymentMethod', 'reference', 'status', 'createdAt']
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

      // Calcular resumen financiero
      const financialSummary = (representative as any).getFinancialSummary ? 
        (representative as any).getFinancialSummary() : 
        {
          currentBalance: representative.balance || 0,
          debtAmount: (representative.balance || 0) < 0 ? Math.abs(representative.balance || 0) : 0,
          availableCredit: (representative.balance || 0) > 0 ? (representative.balance || 0) : 0,
          activeStudents: 0,
          monthlyFee: 0,
          nextPaymentDue: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
          canEnrollNewStudent: (representative.balance || 0) >= 0
        };

      res.status(200).json({ 
        result: true, 
        content: {
          ...representative.toJSON(),
          financialSummary
        }, 
        error: [] 
      });

    } catch (error) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getBalance"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener el balance'] 
      });
    }
  };

  //#region: Listar representantes con filtros avanzados
  static listRepresentatives = async (req: Request, res: Response) => {
    try {
      const { 
        page = 1, 
        limit = 20,
        fullName,
        identityCard,
        relationship,
        balanceStatus,
        minBalance,
        maxBalance,
        hasDebt,
        hasCredit,
        hasStudents,
        activeOnly = true,
        search,
        sortBy = 'fullName',
        sortOrder = 'asc'
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);
      
      // Validar sortOrder
      const sortOrderStr = typeof sortOrder === 'string' ? sortOrder : 'asc';
      const sortOrderUpper = sortOrderStr.toUpperCase();

      // Construir filtros
      const where: any = {};

      // Búsqueda por texto
      if (search && typeof search === 'string') {
        where[Op.or] = [
          { fullName: { [Op.iLike]: `%${search}%` } },
          { identityCard: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } }
        ];
      }

      if (fullName && typeof fullName === 'string') {
        where.fullName = { [Op.iLike]: `%${fullName}%` };
      }

      if (identityCard && typeof identityCard === 'string') {
        where.identityCard = { [Op.iLike]: `%${identityCard}%` };
      }

      if (relationship && typeof relationship === 'string') {
        where.relationship = relationship;
      }

      // Filtros por saldo
      if (balanceStatus === 'debt') {
        where.balance = { [Op.lt]: 0 };
      } else if (balanceStatus === 'credit') {
        where.balance = { [Op.gt]: 0 };
      } else if (balanceStatus === 'zero') {
        where.balance = 0;
      }

      if (minBalance !== undefined) {
        where.balance = { ...where.balance, [Op.gte]: Number(minBalance) };
      }

      if (maxBalance !== undefined) {
        where.balance = { ...where.balance, [Op.lte]: Number(maxBalance) };
      }

      if (hasDebt === 'true') {
        where.balance = { [Op.lt]: 0 };
      }

      if (hasCredit === 'true') {
        where.balance = { [Op.gt]: 0 };
      }

      // Construir ordenamiento
      let order: any[] = [];
      const sortByStr = typeof sortBy === 'string' ? sortBy : 'fullName';
      
      switch (sortByStr) {
        case 'balance':
          order = [['balance', sortOrderUpper]];
          break;
        case 'debtAmount':
          order = [
            [literal('ABS(CASE WHEN balance < 0 THEN balance ELSE 0 END)'), 'DESC']
          ];
          break;
        case 'fullName':
          order = [['fullName', sortOrderUpper]];
          break;
        case 'createdAt':
          order = [['createdAt', sortOrderUpper]];
          break;
        default:
          order = [['fullName', 'ASC']];
      }

      // Incluir estudiantes si se solicita
      const include: any[] = [];
      
      if (hasStudents === 'true') {
        include.push({
          model: Student,
          as: 'students',
          required: true,
          attributes: []
        });
      } else if (hasStudents === 'false') {
        include.push({
          model: Student,
          as: 'students',
          required: false,
          where: {
            id: { [Op.is]: null }
          },
          attributes: []
        });
      } else {
        include.push({
          model: Student,
          as: 'students',
          required: false,
          attributes: ['id', 'fullName', 'status']
        });
      }

      // Ejecutar consulta
      const { count, rows: representatives } = await Representative.findAndCountAll({
        where,
        limit: Number(limit),
        offset,
        order,
        include,
        distinct: true
      });

      // Calcular estadísticas
      const allRepresentatives = await Representative.findAll({
        attributes: [
          [fn('COUNT', col('id')), 'total'],
          [fn('SUM', literal('CASE WHEN balance < 0 THEN balance ELSE 0 END')), 'totalDebt'],
          [fn('SUM', literal('CASE WHEN balance > 0 THEN balance ELSE 0 END')), 'totalCredit'],
          [fn('AVG', col('balance')), 'averageBalance'],
          [fn('COUNT', literal('CASE WHEN balance < 0 THEN 1 END')), 'withDebt'],
          [fn('COUNT', literal('CASE WHEN balance > 0 THEN 1 END')), 'withCredit']
        ],
        raw: true
      });

      const stats = (allRepresentatives[0] as any) || {
        total: 0,
        totalDebt: 0,
        totalCredit: 0,
        averageBalance: 0,
        withDebt: 0,
        withCredit: 0
      };

      // Formatear respuesta
      const formattedRepresentatives = representatives.map(rep => {
        const repData = rep.toJSON();
        const students = (repData as any).students || [];
        const activeStudents = students.filter((s: any) => 
          s.status === 'active' || s.status === 'regular'
        );
        
        const balance = repData.balance || 0;
        const debtAmount = balance < 0 ? Math.abs(balance) : 0;
        const balanceStatus = balance < 0 ? 'debt' : balance === 0 ? 'zero' : 'credit';

        return {
          ...repData,
          debtAmount,
          balanceStatus,
          financialSummary: {
            currentBalance: balance,
            debtAmount,
            availableCredit: balance > 0 ? balance : 0,
            activeStudents: activeStudents.length,
            monthlyFee: activeStudents.length * 30,
            nextPaymentDue: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
            canEnrollNewStudent: balance >= 0
          }
        };
      });

      const totalNum = Number(stats.total || 0);
      const withDebtNum = Number(stats.withDebt || 0);
      const withCreditNum = Number(stats.withCredit || 0);

      const response = {
        representatives: formattedRepresentatives,
        total: count,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(count / Number(limit)),
        summary: {
          totalRepresentatives: totalNum,
          totalBalance: (Number(stats.totalDebt || 0) + Number(stats.totalCredit || 0)),
          totalDebt: Math.abs(Number(stats.totalDebt || 0)),
          totalCredit: Number(stats.totalCredit || 0),
          averageBalance: Number(stats.averageBalance || 0),
          representativesWithDebt: withDebtNum,
          representativesWithCredit: withCreditNum,
          representativesWithZeroBalance: totalNum - withDebtNum - withCreditNum
        },
        filters: {
          applied: Object.keys(req.query).length > 0,
          search,
          balanceStatus,
          hasDebt,
          hasCredit,
          hasStudents,
          sortBy,
          sortOrder
        }
      };

      res.status(200).json({
        result: true,
        content: response,
        error: []
      });

    } catch (error) {
      console.error('❌ Error listando representantes:', error);
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("listRepresentatives"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al listar representantes'] 
      });
    }
  };

  //#region: Obtener representantes con más deuda
  static getTopDebtors = async (req: Request, res: Response) => {
    try {
      const { limit = 10 } = req.query;

      const representatives = await Representative.findAll({
        where: {
          balance: { [Op.lt]: 0 }
        },
        attributes: [
          'id',
          'fullName',
          'identityCard',
          'phone',
          'balance',
          [
            literal('ABS(balance)'),
            'debtAmount'
          ]
        ],
        order: [
          [literal('ABS(balance)'), 'DESC']
        ],
        limit: Number(limit),
        include: [{
          model: Student,
          as: 'students',
          attributes: ['id', 'fullName', 'status']
        }]
      });

      // Calcular total de deuda
      const totalDebt = await Representative.sum('balance', {
        where: { balance: { [Op.lt]: 0 } }
      }) || 0;

      const formatted = representatives.map(rep => {
        const repData = rep.toJSON();
        const students = (repData as any).students || [];
        const activeStudents = students.filter((s: any) => 
          s.status === 'active' || s.status === 'regular'
        );

        return {
          ...repData,
          debtAmount: Math.abs(repData.balance || 0),
          balanceStatus: 'debt',
          activeStudents: activeStudents.length,
          monthlyFee: activeStudents.length * 30,
          monthsInDebt: Math.ceil(Math.abs(repData.balance || 0) / (activeStudents.length * 30 || 1))
        };
      });

      res.status(200).json({
        result: true,
        content: {
          debtors: formatted,
          summary: {
            totalDebtors: formatted.length,
            totalDebtAmount: Math.abs(totalDebt),
            averageDebt: Math.abs(totalDebt) / (formatted.length || 1),
            highestDebt: formatted[0]?.debtAmount || 0,
            lowestDebt: formatted[formatted.length - 1]?.debtAmount || 0
          }
        },
        error: []
      });

    } catch (error) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getTopDebtors"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener deudores'] 
      });
    }
  };

  //#region: Obtener representantes con más saldo
  static getTopCreditors = async (req: Request, res: Response) => {
    try {
      const { limit = 10 } = req.query;

      const representatives = await Representative.findAll({
        where: {
          balance: { [Op.gt]: 0 }
        },
        attributes: [
          'id',
          'fullName',
          'identityCard',
          'phone',
          'balance',
          [
            literal('balance'),
            'creditAmount'
          ]
        ],
        order: [
          ['balance', 'DESC']
        ],
        limit: Number(limit),
        include: [{
          model: Student,
          as: 'students',
          attributes: ['id', 'fullName', 'status']
        }]
      });

      // Calcular total de saldo positivo
      const totalCredit = await Representative.sum('balance', {
        where: { balance: { [Op.gt]: 0 } }
      }) || 0;

      const formatted = representatives.map(rep => {
        const repData = rep.toJSON();
        const students = (repData as any).students || [];
        const activeStudents = students.filter((s: any) => 
          s.status === 'active' || s.status === 'regular'
        );

        return {
          ...repData,
          creditAmount: repData.balance || 0,
          balanceStatus: 'credit',
          activeStudents: activeStudents.length,
          monthsPaidAhead: Math.floor((repData.balance || 0) / (activeStudents.length * 30 || 1))
        };
      });

      res.status(200).json({
        result: true,
        content: {
          creditors: formatted,
          summary: {
            totalCreditors: formatted.length,
            totalCreditAmount: totalCredit,
            averageCredit: totalCredit / (formatted.length || 1),
            highestCredit: formatted[0]?.creditAmount || 0,
            lowestCredit: formatted[formatted.length - 1]?.creditAmount || 0
          }
        },
        error: []
      });

    } catch (error) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getTopCreditors"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener acreedores'] 
      });
    }
  };

  //#region: Obtener estadísticas financieras
  static getFinancialStatistics = async (req: Request, res: Response) => {
    try {
      // Estadísticas generales
      const generalStats = await Representative.findAll({
        attributes: [
          [fn('COUNT', col('id')), 'total'],
          [fn('SUM', col('balance')), 'totalBalance'],
          [fn('AVG', col('balance')), 'averageBalance'],
          [fn('COUNT', literal('CASE WHEN balance < 0 THEN 1 END')), 'withDebt'],
          [fn('COUNT', literal('CASE WHEN balance > 0 THEN 1 END')), 'withCredit'],
          [fn('COUNT', literal('CASE WHEN balance = 0 THEN 1 END')), 'withZero']
        ],
        raw: true
      });

      // Distribución por rango de saldo
      const balanceDistribution = await Representative.findAll({
        attributes: [
          [
            literal(`
              CASE 
                WHEN balance < -500 THEN 'Menos de -500'
                WHEN balance >= -500 AND balance < -100 THEN '-500 a -100'
                WHEN balance >= -100 AND balance < 0 THEN '-100 a 0'
                WHEN balance = 0 THEN '0'
                WHEN balance > 0 AND balance <= 100 THEN '0 a 100'
                WHEN balance > 100 AND balance <= 500 THEN '100 a 500'
                ELSE 'Más de 500'
              END
            `),
            'range'
          ],
          [fn('COUNT', col('id')), 'count'],
          [fn('SUM', col('balance')), 'total']
        ],
        group: ['range'],
        order: [[literal('MIN(balance)'), 'ASC']],
        raw: true
      });

      // Historial de transacciones por mes
      const monthlyTransactions = await Transaction.findAll({
        attributes: [
          [fn('DATE_TRUNC', 'month', col('createdAt')), 'month'],
          [fn('COUNT', col('id')), 'transactionCount'],
          [fn('SUM', literal("CASE WHEN type = 'deposit' THEN amount ELSE 0 END")), 'totalDeposits'],
          [fn('SUM', literal("CASE WHEN type = 'withdrawal' THEN amount ELSE 0 END")), 'totalWithdrawals']
        ],
        where: {
          status: TransactionStatus.COMPLETED,
          createdAt: {
            [Op.gte]: new Date(new Date().setMonth(new Date().getMonth() - 6))
          }
        },
        group: [fn('DATE_TRUNC', 'month', col('createdAt'))],
        order: [[fn('DATE_TRUNC', 'month', col('createdAt')), 'DESC']],
        raw: true
      });

      // Representantes con estudiantes activos
      const repsWithActiveStudents = await Representative.count({
        include: [{
          model: Student,
          as: 'students',
          where: {
            status: { [Op.in]: ['active', 'regular'] }
          },
          required: true,
          attributes: []
        }]
      });

      // Deuda total proyectada (30 USD por hijo activo por mes)
      const activeStudents = await Student.count({
        where: {
          status: { [Op.in]: ['active', 'regular'] }
        }
      });

      const projectedMonthlyRevenue = activeStudents * 30;

      const response = {
        general: generalStats[0] || {},
        balanceDistribution,
        monthlyTransactions,
        studentStatistics: {
          totalActiveStudents: activeStudents,
          representativesWithActiveStudents: repsWithActiveStudents,
          projectedMonthlyRevenue,
          averageStudentsPerRepresentative: repsWithActiveStudents > 0 ? 
            (activeStudents / repsWithActiveStudents).toFixed(2) : 0
        },
        alerts: {
          highDebt: await Representative.count({
            where: {
              balance: { [Op.lt]: -100 }
            }
          }),
          upcomingPayments: await Representative.count({
            where: {
              balance: { [Op.lt]: 0 },
              updatedAt: {
                [Op.lt]: new Date(new Date().setDate(new Date().getDate() - 30))
              }
            }
          })
        },
        calculatedAt: new Date().toISOString()
      };

      res.status(200).json({
        result: true,
        content: response,
        error: []
      });

    } catch (error) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getFinancialStatistics"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener estadísticas'] 
      });
    }
  };

  //#region: Registrar depósito manual
  static manualDeposit = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { 
        amount, 
        description, 
        paymentMethod = PaymentMethod.CASH,
        reference,
        createdBy 
      } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['El monto debe ser mayor a 0'] 
        });
      }

      const representative = await Representative.findByPk(id);
      if (!representative) {
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Representante no encontrado'] 
        });
      }

      // Crear la transacción
      const transaction = await Transaction.create({
        representativeId: id,
        type: TransactionType.DEPOSIT,
        amount: parseFloat(amount),
        description: description || `Depósito manual (${paymentMethod})`,
        paymentMethod,
        reference,
        status: TransactionStatus.COMPLETED,
        createdBy,
        processedAt: new Date(),
        transactionDate: new Date()
      });

      // Actualizar el balance
      const currentBalance = representative.balance || 0;
      const newBalance = currentBalance + parseFloat(amount);
      
      await representative.update({ 
        balance: newBalance,
        updatedAt: new Date()
      });

      console.log(`✅ Depósito manual registrado:`, {
        representativeId: id,
        amount: parseFloat(amount),
        newBalance,
        transactionId: transaction.id
      });

      res.status(200).json({ 
        result: true, 
        content: {
          transaction,
          newBalance,
          representative: {
            id: representative.id,
            name: representative.fullName,
            previousBalance: currentBalance
          },
          message: 'Depósito registrado exitosamente'
        }, 
        error: [] 
      });

    } catch (error) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("manualDeposit"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al registrar el depósito'] 
      });
    }
  };

  //#region: Registrar pago bancario validado
  static registerBankPayment = async (
    representativeId: string, 
    amount: number, 
    bankData: {
      reference: string;
      bankCode: string;
      accountNumber: string;
      phoneNumber: string;
      clientId: string;
      validationResponse: any;
    }
  ) => {
    try {
      const representative = await Representative.findByPk(representativeId);
      if (!representative) {
        throw new Error('Representante no encontrado');
      }

      // Verificar duplicados
      const duplicateCheck = await TransactionValidator.isDuplicateTransaction({
        reference: bankData.reference,
        bankCode: bankData.bankCode,
        accountNumber: bankData.accountNumber,
        amount: amount,
        phoneNumber: bankData.phoneNumber
      });

      if (duplicateCheck.isDuplicate && duplicateCheck.existingTransaction) {
        const existing = duplicateCheck.existingTransaction;
        
        // Obtener nombre del representante que ya registró
        let existingRepName = 'Desconocido';
        if (existing.representativeId) {
          const existingRep = await Representative.findByPk(existing.representativeId, {
            attributes: ['fullName']
          });
          if (existingRep) {
            existingRepName = existingRep.fullName || 'Desconocido';
          }
        }

        return {
          success: false,
          duplicate: true,
          message: `Esta transacción ya fue registrada por ${existingRepName} el ${new Date(existing.createdAt).toLocaleDateString()}`,
          existingTransaction: existing
        };
      }

      // Crear la transacción
      const transaction = await Transaction.create({
        representativeId,
        type: TransactionType.DEPOSIT,
        amount,
        description: `Pago bancario validado - ${bankData.bankCode}`,
        paymentMethod: PaymentMethod.PAGO_MOVIL,
        reference: bankData.reference,
        status: TransactionStatus.COMPLETED,
        externalReference: bankData.reference,
        bankCode: bankData.bankCode,
        accountNumber: bankData.accountNumber,
        transactionDate: new Date(),
        metadata: {
          bankValidation: bankData.validationResponse,
          phoneNumber: bankData.phoneNumber,
          clientId: bankData.clientId,
          processedAt: new Date().toISOString()
        },
        processedAt: new Date()
      });

      // Actualizar balance
      const currentBalance = representative.balance || 0;
      const newBalance = currentBalance + amount;
      
      await representative.update({ 
        balance: newBalance,
        updatedAt: new Date()
      });

      console.log(`✅ Pago bancario registrado:`, {
        representativeId,
        amount,
        newBalance,
        transactionId: transaction.id,
        reference: bankData.reference
      });

      return {
        success: true,
        transaction,
        newBalance,
        representative: {
          id: representative.id,
          name: representative.fullName,
          previousBalance: currentBalance,
          newBalance
        }
      };

    } catch (error) {
      console.error('❌ Error en registerBankPayment:', error);
      ErrorLog.createErrorLog(error, 'System', getErrorLocation("registerBankPayment"));
      
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Error al registrar pago',
        error: error
      };
    }
  };

  //#region: Verificar estado de transacción
  static getTransactionStatus = async (req: Request, res: Response) => {
    try {
      const { reference, bankCode, accountNumber, amount } = req.query;

      if (!reference || !bankCode) {
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['Se requiere referencia y código de banco'] 
        });
      }

      const transaction = await Transaction.findOne({
        where: {
          reference: reference as string,
          bankCode: bankCode as string,
          ...(accountNumber && { accountNumber: accountNumber as string }),
          ...(amount && { amount: parseFloat(amount as string) })
        },
        include: [{
          model: Representative,
          as: 'representative',
          attributes: ['id', 'fullName', 'identityCard', 'phone']
        }],
        order: [['createdAt', 'DESC']]
      });

      if (!transaction) {
        return res.status(200).json({ 
          result: true, 
          content: {
            exists: false,
            message: 'Transacción no registrada'
          }, 
          error: [] 
        });
      }

      const response = {
        exists: true,
        transaction: {
          id: transaction.id,
          amount: transaction.amount,
          reference: transaction.reference,
          bankCode: transaction.bankCode,
          accountNumber: transaction.accountNumber,
          status: transaction.status,
          createdAt: transaction.createdAt,
          paymentMethod: transaction.paymentMethod
        },
        representative: transaction.representative ? {
          id: transaction.representative.id,
          fullName: transaction.representative.fullName,
          identityCard: transaction.representative.identityCard
        } : null
      };

      res.status(200).json({ 
        result: true, 
        content: response, 
        error: [] 
      });

    } catch (error) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getTransactionStatus"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al verificar transacción'] 
      });
    }
  };

  //#region: Verificar si un pago ya fue registrado
  static checkPaymentExists = async (req: Request, res: Response) => {
    try {
      const { reference, representativeId } = req.query;

      if (!reference || !representativeId) {
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['Se requiere referencia e ID del representante'] 
        });
      }

      const transaction = await Transaction.findOne({
        where: { 
          reference: reference as string,
          representativeId: representativeId as string,
          type: TransactionType.DEPOSIT
        },
        attributes: ['id', 'amount', 'status', 'createdAt']
      });

      res.status(200).json({ 
        result: true, 
        content: {
          exists: !!transaction,
          transaction: transaction || null
        }, 
        error: [] 
      });

    } catch (error) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("checkPaymentExists"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al verificar el pago'] 
      });
    }
  };

  //#region: Obtener historial de transacciones
  static getTransactionHistory = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { 
        page = 1, 
        limit = 20, 
        type, 
        startDate, 
        endDate,
        status 
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);

      // Verificar que el representante existe
      const representative = await Representative.findByPk(id, {
        attributes: ['id']
      });

      if (!representative) {
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Representante no encontrado'] 
        });
      }

      // Construir filtros
      const where: any = { representativeId: id };

      if (type) {
        where.type = type;
      }

      if (status) {
        where.status = status;
      }

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt[Op.gte] = new Date(startDate as string);
        }
        if (endDate) {
          where.createdAt[Op.lte] = new Date(endDate as string);
        }
      }

      const { count, rows: transactions } = await Transaction.findAndCountAll({
        where,
        limit: Number(limit),
        offset,
        order: [['createdAt', 'DESC']],
        include: [{
          model: Representative,
          as: 'representative',
          attributes: ['id', 'fullName', 'identityCard']
        }]
      });

      res.status(200).json({
        result: true,
        content: transactions,
        pagination: {
          totalRecords: count,
          currentPage: Number(page),
          totalPages: Math.ceil(count / Number(limit)),
          hasMore: offset + transactions.length < count
        },
        error: []
      });

    } catch (error) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getTransactionHistory"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener el historial'] 
      });
    }
  };
 
  //#region: Registrar retiro manual
  static manualWithdrawal = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { 
        amount, 
        description, 
        paymentMethod = PaymentMethod.CASH,
        reference,
        createdBy 
      } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['El monto debe ser mayor a 0'] 
        });
      }

      const representative = await Representative.findByPk(id);
      if (!representative) {
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Representante no encontrado'] 
        });
      }

      // Verificar que tenga saldo suficiente
      const currentBalance = representative.balance || 0;
      if (currentBalance < amount) {
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['Saldo insuficiente'] 
        });
      }

      // Crear la transacción
      const transaction = await Transaction.create({
        representativeId: id,
        type: TransactionType.WITHDRAWAL,
        amount: parseFloat(amount),
        description: description || `Retiro manual (${paymentMethod})`,
        paymentMethod,
        reference,
        status: TransactionStatus.COMPLETED,
        createdBy,
        processedAt: new Date()
      });

      // Actualizar el balance
      const newBalance = currentBalance - parseFloat(amount);
      
      await representative.update({ 
        balance: newBalance,
        updatedAt: new Date()
      });

      console.log(`✅ Retiro manual registrado:`, {
        representativeId: id,
        amount: parseFloat(amount),
        newBalance,
        transactionId: transaction.id
      });

      res.status(200).json({ 
        result: true, 
        content: {
          transaction,
          newBalance,
          message: 'Retiro registrado exitosamente'
        }, 
        error: [] 
      });

    } catch (error) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("manualWithdrawal"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al registrar el retiro'] 
      });
    }
  };
}