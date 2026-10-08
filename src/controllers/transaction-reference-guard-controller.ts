// src/controllers/transaction-reference-guard-controller.ts
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Transaction from '../database/models/transaction';
import { ErrorLog } from '../utility/ErrorLog';
import { getErrorLocation } from '../utility/callerinfo';

export class TransactionReferenceGuardController {
  /**
   * Verifica si ya existe una transacción con la misma "clave de referencia"
   * (los ÚLTIMOS 6 DÍGITOS de la referencia).
   *
   * Motivo: el banco BNC valida las operaciones usando únicamente los últimos
   * 6 dígitos de la referencia. Por lo tanto, si un usuario cambia los dígitos
   * anteriores pero conserva los últimos 6, el banco sigue encontrando el pago
   * y podría registrar el mismo movimiento múltiples veces.
   *
   * Este endpoint permite bloquear ese escenario ANTES de llamar al banco.
   */
  static checkReferenceKey = async (req: Request, res: Response) => {
    try {
      const { reference } = req.query as { reference?: string };

      if (!reference || String(reference).trim() === '') {
        return res.status(400).json({
          result: false,
          content: { exists: false },
          error: ['La referencia es requerida'],
        });
      }

      // Extraer los últimos 6 dígitos (solo caracteres numéricos)
      const digits = String(reference).replace(/\D/g, '');
      if (digits.length < 6) {
        return res.status(400).json({
          result: false,
          content: { exists: false },
          error: ['La referencia debe contener al menos 6 dígitos'],
        });
      }

      const last6 = digits.slice(-6);

      // Buscar cualquier transacción que termine con esos 6 dígitos.
      // Se usa LIKE '%' + last6 porque la referencia guardada puede tener
      // prefijos distintos al original.
      const existing = await Transaction.findOne({
        where: {
          reference: { [Op.like]: `%${last6}` },
        },
        order: [['createdAt', 'DESC']],
      });

      if (existing) {
        return res.json({
          result: true,
          content: {
            exists: true,
            last6,
            existingTransaction: {
              id: existing.id,
              reference: existing.reference,
              amount: existing.amount,
              amountUSD: existing.amountUSD,
              description: existing.description,
              createdAt: existing.createdAt,
              studentId: existing.studentId,
              representativeId: existing.representativeId,
            },
          },
          error: [],
        });
      }

      return res.json({
        result: true,
        content: { exists: false, last6 },
        error: [],
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(
        error,
        'TransactionReferenceGuardController',
        getErrorLocation('checkReferenceKey')
      );
      return res.status(500).json({
        result: false,
        content: { exists: false },
        error: [error.message],
      });
    }
  };
}