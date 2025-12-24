// src/database/models/representative.ts
import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, Length, HasMany, ForeignKey, BelongsTo,
  Scopes
} from "sequelize-typescript";
import { typerepresentative_full } from "../types/representative"; // ¡CORRECCIÓN AQUÍ!
import Student from "./student";
import UserLogin from "./userlogin";
import { Op, literal } from "sequelize";

@Scopes(() => ({
  withBalance: {
    attributes: {
      include: [[literal('COALESCE("balance", 0)'), 'currentBalance']]
    }
  },
  withStudents: {
    include: [{
      model: Student,
      as: 'students',
      attributes: ['id', 'fullName', 'status']
    }]
  },
  withDebt: {
    where: {
      balance: {
        [Op.lt]: 0
      }
    }
  },
  withCredit: {
    where: {
      balance: {
        [Op.gt]: 0
      }
    }
  },
  zeroBalance: {
    where: {
      balance: 0
    }
  },
  orderByDebt: {
    order: [
      [literal('COALESCE("balance", 0)'), 'ASC']
    ]
  },
  orderByCredit: {
    order: [
      [literal('COALESCE("balance", 0)'), 'DESC']
    ]
  }
}))
@Table({
  tableName: 'representative',
  freezeTableName: true,
  timestamps: true,
})
export default class Representative extends Model<typerepresentative_full> { // ¡CORRECCIÓN AQUÍ!
  
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  // Información del Representante
  @AllowNull(false)
  @Length({ min: 3, max: 100 })
  @Column({ type: DataType.STRING(100) })
  declare fullName?: string;

  @AllowNull(false)
  @Length({ min: 6, max: 20 })
  @Column({ type: DataType.STRING(20), unique: true })
  declare identityCard?: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(200) })
  declare address?: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(15) })
  declare phone?: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare relationship?: string;

  // Información del Padre/Madre (si es diferente)
  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare parentName?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare parentIdentityCard?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(200) })
  declare parentAddress?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(15) })
  declare parentPhone?: string;

  // SALDO (Positivo = Crédito, Negativo = Deuda)
  @AllowNull(false)
  @Default(0.00)
  @Column({ 
    type: DataType.DECIMAL(12, 2),
    get() {
      const value = this.getDataValue('balance');
      return value !== null && value !== undefined ? parseFloat(value) : 0.00;
    },
    set(value: number | string) {
      if (typeof value === 'string') {
        this.setDataValue('balance', parseFloat(value));
      } else {
        this.setDataValue('balance', value);
      }
    }
  })
  declare balance?: number;

  // Campo calculado: Monto de deuda (si hay)
  @Column({
    type: DataType.VIRTUAL,
    get() {
      const balance = this.getDataValue('balance') || 0;
      return balance < 0 ? Math.abs(balance) : 0;
    }
  })
  declare debtAmount?: number;

  // Campo calculado: Estado del saldo
  @Column({
    type: DataType.VIRTUAL,
    get() {
      const balance = this.getDataValue('balance') || 0;
      if (balance < 0) return 'debt';      // En deuda
      if (balance === 0) return 'zero';    // Saldo cero
      return 'credit';                     // Tiene crédito
    }
  })
  declare balanceStatus?: 'debt' | 'zero' | 'credit';

  // Campo calculado: Formateado para mostrar
  @Column({
    type: DataType.VIRTUAL,
    get() {
      const balance = this.getDataValue('balance') || 0;
      const formatter = new Intl.NumberFormat('es-VE', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
      });
      
      if (balance < 0) {
        return `-${formatter.format(Math.abs(balance))}`;
      }
      return formatter.format(balance);
    }
  })
  declare balanceFormatted?: string;

  // Relación con usuario
  @AllowNull(true)
  @ForeignKey(() => UserLogin)
  @Column({ type: DataType.UUID })
  declare userId?: string;

  @BelongsTo(() => UserLogin)
  declare user?: UserLogin;

  // Relaciones
  @HasMany(() => Student)
  declare students?: Student[];

  // Métodos de utilidad - CORREGIDO
  async addToBalance(amount: number, description?: string): Promise<{ oldBalance: number, newBalance: number }> {
    const oldBalance = this.balance || 0;
    const newBalance = oldBalance + amount;
    
    // CORRECCIÓN: Usar update con el tipo correcto
    await (this as any).update({ balance: newBalance });
    
    console.log(`💰 Saldo actualizado: ${oldBalance} -> ${newBalance} (${description || 'Sin descripción'})`);
    
    return { oldBalance, newBalance };
  }

  async subtractFromBalance(amount: number, description?: string): Promise<{ oldBalance: number, newBalance: number }> {
    return this.addToBalance(-amount, description);
  }

  getBalanceInfo() {
    const balance = this.balance || 0;
    return {
      raw: balance,
      formatted: this.balanceFormatted,
      status: this.balanceStatus,
      isInDebt: balance < 0,
      hasCredit: balance > 0,
      debtAmount: balance < 0 ? Math.abs(balance) : 0,
      creditAmount: balance > 0 ? balance : 0
    };
  }
}