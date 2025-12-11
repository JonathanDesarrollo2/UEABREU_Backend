// src/database/models/representative.ts
import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, Length, HasMany, ForeignKey, BelongsTo,
  Scopes
} from "sequelize-typescript";
import { typerepresentative_full } from "../types/representative";
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
        [Op.gte]: 0
      }
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
export default class Representative extends Model<typerepresentative_full> {
  
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

  // NUEVO: Saldo del representante
  @AllowNull(false)
  @Default(0.00)
  @Column({ 
    type: DataType.DECIMAL(12, 2),
    get() {
      const value = this.getDataValue('balance');
      return value ? parseFloat(value) : 0.00;
    }
  })
  declare balance?: number;

  // NUEVO: Campo calculado para deuda
  @Column({
    type: DataType.VIRTUAL,
    get() {
      const balance = this.getDataValue('balance') || 0;
      return balance < 0 ? Math.abs(balance) : 0;
    }
  })
  declare debtAmount?: number;

  // NUEVO: Estado del saldo
  @Column({
    type: DataType.VIRTUAL,
    get() {
      const balance = this.getDataValue('balance') || 0;
      if (balance < 0) return 'debt';
      if (balance === 0) return 'zero';
      return 'credit';
    }
  })
  declare balanceStatus?: 'debt' | 'zero' | 'credit';

  // NUEVO: Relación con usuario (opcional)
  @AllowNull(true)
  @ForeignKey(() => UserLogin)
  @Column({ type: DataType.UUID })
  declare userId?: string;

  @BelongsTo(() => UserLogin)
  declare user?: UserLogin;

  // Relaciones
  @HasMany(() => Student)
  declare students?: Student[];

  // Método para calcular deuda mensual
  calculateMonthlyDebt(): number {
    const students = this.students || [];
    const activeStudents = students.filter(s => s.status === 'active' || s.status === 'regular');
    return activeStudents.length * 30; // 30 USD por hijo activo
  }

  // Método para obtener resumen financiero
  getFinancialSummary() {
    const balance = this.balance || 0;
    const students = this.students || [];
    const activeStudents = students.filter(s => s.status === 'active' || s.status === 'regular');
    
    return {
      currentBalance: balance,
      debtAmount: balance < 0 ? Math.abs(balance) : 0,
      availableCredit: balance > 0 ? balance : 0,
      activeStudents: activeStudents.length,
      monthlyFee: activeStudents.length * 30,
      nextPaymentDue: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
      canEnrollNewStudent: balance >= 0 // Puede inscribir si no tiene deuda
    };
  }
}