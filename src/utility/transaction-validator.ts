// src/utility/transaction-validator.ts

import { Op } from "sequelize";
import Transaction from "../database/models/transaction";

export class TransactionValidator {
  /**
   * Verifica si una transacción bancaria ya fue registrada
   * Usa múltiples criterios para evitar falsos positivos
   */
  static async isDuplicateTransaction(bankData: {
    reference: string;
    bankCode: string;
    accountNumber: string;
    amount: number;
    phoneNumber?: string;
  }): Promise<{
    isDuplicate: boolean;
    existingTransaction?: any;
    reason?: string;
  }> {
    try {
      // CRITERIO 1: Misma referencia, mismo banco, misma cuenta
      const exactMatch = await Transaction.findOne({
        where: {
          reference: bankData.reference,
          bankCode: bankData.bankCode,
          accountNumber: bankData.accountNumber
        },
        attributes: ['id', 'representativeId', 'amount', 'createdAt', 'metadata']
      });

      if (exactMatch) {
        return {
          isDuplicate: true,
          existingTransaction: exactMatch,
          reason: 'Transacción con misma referencia, banco y cuenta ya registrada'
        };
      }

      // CRITERIO 2: Mismo monto, mismo banco, mismo día (para pagos móviles)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const sameDayTransaction = await Transaction.findOne({
        where: {
          bankCode: bankData.bankCode,
          amount: bankData.amount,
          createdAt: {
            [Op.gte]: today,
            [Op.lt]: tomorrow
          }
        },
        attributes: ['id', 'representativeId', 'amount', 'reference', 'createdAt']
      });

      if (sameDayTransaction) {
        // Verificar si es probablemente la misma transacción
        const existingRef = sameDayTransaction.reference;
        const newRef = bankData.reference;
        
        // Si las referencias son similares (últimos 4 dígitos coinciden)
        if (existingRef && newRef && 
            existingRef.slice(-4) === newRef.slice(-4)) {
          return {
            isDuplicate: true,
            existingTransaction: sameDayTransaction,
            reason: 'Transacción similar ya registrada hoy (mismo monto y banco)'
          };
        }
      }

      // CRITERIO 3: Para Pago Móvil - mismo teléfono, mismo monto, mismo día
      if (bankData.phoneNumber) {
        const samePhoneTransaction = await Transaction.findOne({
          where: {
            [Op.or]: [
              { 
                'metadata.phoneNumber': bankData.phoneNumber 
              },
              {
                'metadata.bankValidation.details.validateP2P.data.PhoneNumber': bankData.phoneNumber
              }
            ],
            amount: bankData.amount,
            createdAt: {
              [Op.gte]: today,
              [Op.lt]: tomorrow
            }
          },
          attributes: ['id', 'representativeId', 'amount', 'reference', 'metadata']
        });

        if (samePhoneTransaction) {
          return {
            isDuplicate: true,
            existingTransaction: samePhoneTransaction,
            reason: 'Transacción con mismo teléfono y monto ya registrada hoy'
          };
        }
      }

      return {
        isDuplicate: false
      };

    } catch (error) {
      console.error('❌ Error verificando duplicados:', error);
      // En caso de error, asumimos que no es duplicado para no bloquear operaciones
      return {
        isDuplicate: false
      };
    }
  }

  /**
   * Genera un ID único para la transacción basado en sus datos
   */
  static generateTransactionId(bankData: {
    reference: string;
    bankCode: string;
    accountNumber: string;
    amount: number;
    phoneNumber?: string;
    date: string;
  }): string {
    // Usamos una combinación de campos para crear un ID único
    const data = `${bankData.reference}-${bankData.bankCode}-${bankData.accountNumber}-${bankData.amount}-${bankData.date}`;
    
    // Simple hash (puedes usar crypto para algo más seguro si quieres)
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convertir a 32bit integer
    }
    
    return `txn-${Math.abs(hash).toString(36)}`;
  }
}