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

export class BalanceController {
  
    // Listar representantes con filtros
    static listRepresentatives = async (req: Request, res: Response) => {
        try {
            const {
                page = 1,
                limit = 10,
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
            
            const where: any = {};
            
            // Filtros básicos
            if (fullName) where.fullName = { [Op.iLike]: `%${fullName}%` };
            if (identityCard) where.identityCard = { [Op.iLike]: `%${identityCard}%` };
            if (relationship) where.relationship = relationship;
            
            // Filtro por saldo
            if (balanceStatus) {
                switch (balanceStatus) {
                    case 'debt':
                        where.balance = { [Op.lt]: 0 };
                        break;
                    case 'zero':
                        where.balance = { [Op.eq]: 0 };
                        break;
                    case 'credit':
                        where.balance = { [Op.gt]: 0 };
                        break;
                }
            }
            
            // Rango de saldo
            if (minBalance !== undefined || maxBalance !== undefined) {
                where.balance = {};
                if (minBalance !== undefined) where.balance[Op.gte] = Number(minBalance);
                if (maxBalance !== undefined) where.balance[Op.lte] = Number(maxBalance);
            }
            
            // Filtros booleanos
            if (hasDebt === 'true') where.balance = { [Op.lt]: 0 };
            if (hasCredit === 'true') where.balance = { [Op.gt]: 0 };
            
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

            // Configurar ordenamiento
            let order: any[] = [['fullName', 'ASC']];
            if (sortBy === 'balance') {
                order = [[literal('COALESCE(balance, 0)'), sortOrder === 'asc' ? 'ASC' : 'DESC']];
            } else if (sortBy === 'debtAmount') {
                order = [[literal('ABS(COALESCE(balance, 0))'), sortOrder === 'asc' ? 'ASC' : 'DESC']];
            } else if (sortBy === 'createdAt') {
                order = [['createdAt', sortOrder === 'asc' ? 'ASC' : 'DESC']];
            } else if (sortBy === 'fullName') {
                order = [['fullName', sortOrder === 'asc' ? 'ASC' : 'DESC']];
            }

            // Consulta principal
            const { count, rows: representatives } = await Representative.findAndCountAll({
                where,
                limit: Number(limit),
                offset,
                order,
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
                        attributes: ['id', 'fullName', 'status'],
                        required: false
                    }
                ],
                distinct: true
            });

            // Formatear respuesta
            const formattedRepresentatives = representatives.map((rep: any) => ({
                id: rep.id,
                fullName: rep.fullName,
                identityCard: rep.identityCard,
                phone: rep.phone,
                relationship: rep.relationship,
                balance: rep.balance || 0,
                balanceFormatted: rep.balanceFormatted,
                balanceStatus: rep.balance < 0 ? 'debt' : rep.balance > 0 ? 'credit' : 'zero',
                debtAmount: rep.balance < 0 ? Math.abs(rep.balance) : 0,
                studentCount: rep.students?.length || 0,
                userStatus: rep.user?.userstatus || false,
                email: rep.user?.usermail || '',
                createdAt: rep.createdAt,
                updatedAt: rep.updatedAt
            }));

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

    // Top deudores
    static getTopDebtors = async (req: Request, res: Response) => {
        try {
            const limit = Number(req.query.limit) || 10;
            
            const debtors = await Representative.findAll({
                where: {
                    balance: { [Op.lt]: 0 }
                },
                limit,
                order: [['balance', 'ASC']], // Ordenar por deuda más alta (negativo más bajo)
                include: [
                    {
                        model: Student,
                        as: 'students',
                        attributes: ['id', 'fullName'],
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

            const formattedDebtors = debtors.map((debtor: any) => ({
                id: debtor.id,
                fullName: debtor.fullName,
                identityCard: debtor.identityCard,
                balance: debtor.balance || 0,
                debtAmount: Math.abs(debtor.balance || 0),
                studentCount: debtor.students?.length || 0,
                email: debtor.user?.usermail || '',
                phone: debtor.phone
            }));

            res.status(200).json({
                result: true,
                content: {
                    debtors: formattedDebtors,
                    totalDebt: formattedDebtors.reduce((sum, d) => sum + d.debtAmount, 0)
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

    // Top con más saldo
    static getTopCreditors = async (req: Request, res: Response) => {
        try {
            const limit = Number(req.query.limit) || 10;
            
            const creditors = await Representative.findAll({
                where: {
                    balance: { [Op.gt]: 0 }
                },
                limit,
                order: [['balance', 'DESC']],
                include: [
                    {
                        model: Student,
                        as: 'students',
                        attributes: ['id', 'fullName'],
                        required: false
                    }
                ]
            });

            const formattedCreditors = creditors.map((creditor: any) => ({
                id: creditor.id,
                fullName: creditor.fullName,
                identityCard: creditor.identityCard,
                balance: creditor.balance || 0,
                creditAmount: creditor.balance || 0,
                studentCount: creditor.students?.length || 0,
                phone: creditor.phone
            }));

            res.status(200).json({
                result: true,
                content: {
                    creditors: formattedCreditors,
                    totalCredit: formattedCreditors.reduce((sum, c) => sum + c.creditAmount, 0)
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

    // Obtener balance de un representante
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
                        attributes: ['id', 'fullName', 'status', 'currentGrade']
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

            // Obtener últimas transacciones
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
                    balance: representative.balance || 0,
                    balanceFormatted: representative.balanceFormatted,
                    balanceStatus: representative.balanceStatus,
                    debtAmount: representative.debtAmount || 0,
                    studentCount: representative.students?.length || 0,
                    userEmail: representative.user?.usermail || ''
                },
                recentTransactions: recentTransactions.map((t: any) => ({
                    id: t.id,
                    type: t.type,
                    amount: t.amount,
                    description: t.description,
                    status: t.status,
                    createdAt: t.createdAt
                })),
                balanceInfo: representative.getBalanceInfo ? representative.getBalanceInfo() : {}
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

    // Estadísticas financieras
    static getFinancialStatistics = async (req: Request, res: Response) => {
        try {
            // Total de representantes
            const totalRepresentatives = await Representative.count();
            
            // Representantes con deuda
            const debtorsCount = await Representative.count({
                where: { balance: { [Op.lt]: 0 } }
            });
            
            // Representantes con saldo positivo
            const creditorsCount = await Representative.count({
                where: { balance: { [Op.gt]: 0 } }
            });
            
            // Total deuda
            const totalDebtResult = await Representative.sum('balance', {
                where: { balance: { [Op.lt]: 0 } }
            });
            const totalDebt = Math.abs(totalDebtResult || 0);
            
            // Total saldo positivo
            const totalCredit = await Representative.sum('balance', {
                where: { balance: { [Op.gt]: 0 } }
            }) || 0;
            
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
                    zeroBalanceCount: totalRepresentatives - debtorsCount - creditorsCount,
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

    // Depósito manual
    static manualDeposit = async (req: Request, res: Response) => {
        const transaction = await sequelize.transaction();
        
        try {
            const { id } = req.params;
            const { amount, description, paymentMethod, reference, createdBy } = req.body;
            
            // Validaciones
            if (!amount || amount <= 0) {
                await transaction.rollback();
                return res.status(400).json({
                    result: false,
                    content: [],
                    error: ['El monto debe ser mayor a 0']
                });
            }
            
            // Verificar que el representante exista
            const representative = await Representative.findByPk(id, { transaction });
            if (!representative) {
                await transaction.rollback();
                return res.status(404).json({
                    result: false,
                    content: [],
                    error: ['Representante no encontrado']
                });
            }
            
            // Crear transacción
            const newTransaction = await Transaction.create({
                representativeId: id,
                type: 'deposit',
                amount: amount,
                description: description || 'Depósito manual',
                paymentMethod: paymentMethod || 'efectivo',
                reference: reference || `MANUAL-${Date.now()}`,
                status: 'completed',
                createdBy: createdBy || 'system',
                balanceBefore: representative.balance || 0,
                balanceAfter: (representative.balance || 0) + amount
            }, { transaction });
            
            // Actualizar saldo del representante
            await representative.update({
                balance: (representative.balance || 0) + amount
            }, { transaction });
            
            await transaction.commit();
            
            res.status(200).json({
                result: true,
                content: {
                    message: 'Depósito registrado exitosamente',
                    transactionId: newTransaction.id,
                    newBalance: representative.balance
                },
                error: []
            });
            
        } catch (error: any) {
            await transaction.rollback();
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("manualDeposit"));
            res.status(500).json({
                result: false,
                content: [],
                error: [`Error al realizar depósito: ${error.message}`]
            });
        }
    };

    // Retiro manual
    static manualWithdrawal = async (req: Request, res: Response) => {
        const transaction = await sequelize.transaction();
        
        try {
            const { id } = req.params;
            const { amount, description, paymentMethod, reference, createdBy } = req.body;
            
            // Validaciones
            if (!amount || amount <= 0) {
                await transaction.rollback();
                return res.status(400).json({
                    result: false,
                    content: [],
                    error: ['El monto debe ser mayor a 0']
                });
            }
            
            // Verificar que el representante exista
            const representative = await Representative.findByPk(id, { transaction });
            if (!representative) {
                await transaction.rollback();
                return res.status(404).json({
                    result: false,
                    content: [],
                    error: ['Representante no encontrado']
                });
            }
            
            // Verificar saldo suficiente
            if ((representative.balance || 0) < amount) {
                await transaction.rollback();
                return res.status(400).json({
                    result: false,
                    content: [],
                    error: [`Saldo insuficiente. Saldo actual: ${representative.balance || 0}`]
                });
            }
            
            // Crear transacción
            const newTransaction = await Transaction.create({
                representativeId: id,
                type: 'withdrawal',
                amount: amount,
                description: description || 'Retiro manual',
                paymentMethod: paymentMethod || 'efectivo',
                reference: reference || `MANUAL-${Date.now()}`,
                status: 'completed',
                createdBy: createdBy || 'system',
                balanceBefore: representative.balance || 0,
                balanceAfter: (representative.balance || 0) - amount
            }, { transaction });
            
            // Actualizar saldo del representante
            await representative.update({
                balance: (representative.balance || 0) - amount
            }, { transaction });
            
            await transaction.commit();
            
            res.status(200).json({
                result: true,
                content: {
                    message: 'Retiro registrado exitosamente',
                    transactionId: newTransaction.id,
                    newBalance: representative.balance
                },
                error: []
            });
            
        } catch (error: any) {
            await transaction.rollback();
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("manualWithdrawal"));
            res.status(500).json({
                result: false,
                content: [],
                error: [`Error al realizar retiro: ${error.message}`]
            });
        }
    };

    // Verificar si existe un pago
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

    // Obtener estado de transacción
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