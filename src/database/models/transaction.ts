// src/database/models/transaction.ts
import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, ForeignKey, BelongsTo
} from "sequelize-typescript";
import Representative from "./representative";
import Student from "./student";
import UserLogin from "./userlogin";

export enum TransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  PAYMENT = 'payment',
  FEE = 'fee',
  ADJUSTMENT = 'adjustment'
}

export enum PaymentMethod {
  BANK_TRANSFER = 'bank_transfer',
  CASH = 'cash',
  DEBIT_CARD = 'debit_card',
  CREDIT_CARD = 'credit_card',
  PAGO_MOVIL = 'pago_movil',
  CHECK = 'check'
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  FAILED = 'failed',
  REVERSED = 'reversed'
}

@Table({
  tableName: 'transaction',
  freezeTableName: true,
  timestamps: true,
})
export default class Transaction extends Model {
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  @ForeignKey(() => Representative)
  @AllowNull(false)
  @Column({ type: DataType.UUID })
  declare representativeId?: string;

  @BelongsTo(() => Representative)
  declare representative?: Representative;

  @ForeignKey(() => Student)
  @AllowNull(true)
  @Column({ type: DataType.UUID })
  declare studentId?: string | null;

  @BelongsTo(() => Student)
  declare student?: Student | null;

  @ForeignKey(() => UserLogin)
  @AllowNull(true)
  @Column({ type: DataType.UUID })
  declare createdBy?: string;

  @BelongsTo(() => UserLogin, 'createdBy')
  declare creator?: UserLogin;

  @AllowNull(false)
  @Column({ type: DataType.ENUM(...Object.values(TransactionType)) })
  declare type?: TransactionType;

  @AllowNull(false)
  @Column({
    type: DataType.DECIMAL(12, 2),
    get() {
      const value = this.getDataValue('amount');
      return value ? parseFloat(value) : 0.00;
    }
  })
  declare amount?: number;

  // NUEVO: Monto en USD histórico
  @AllowNull(true)
  @Default(0.00)
  @Column({
    type: DataType.DECIMAL(12, 2),
    get() {
      const value = this.getDataValue('amountUSD');
      return value ? parseFloat(value) : 0.00;
    }
  })
  declare amountUSD?: number;

  // NUEVO: Tasa BCV usada (Bs/USD)
  @AllowNull(true)
  @Column({
    type: DataType.DECIMAL(10, 4),
    get() {
      const value = this.getDataValue('bcvRate');
      return value ? parseFloat(value) : 0.0000;
    }
  })
  declare bcvRate?: number;

  @AllowNull(true)
  @Column({ type: DataType.STRING(500) })
  declare description?: string;

  @AllowNull(false)
  @Column({ type: DataType.ENUM(...Object.values(PaymentMethod)) })
  declare paymentMethod?: PaymentMethod;

  @AllowNull(true)
  @Column({
    type: DataType.STRING(100),
    unique: true
  })
  declare reference?: string;

  @AllowNull(false)
  @Default(TransactionStatus.COMPLETED)
  @Column({ type: DataType.ENUM(...Object.values(TransactionStatus)) })
  declare status?: TransactionStatus;

  @AllowNull(true)
  @Column({ type: DataType.JSON })
  declare metadata?: any;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare processedAt?: Date;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare externalReference?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare bankCode?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare accountNumber?: string;

  @AllowNull(true)
  @Column({ type: DataType.DATEONLY })
  declare transactionDate?: Date;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare category?: string;

  @AllowNull(true)
  @Column({
    type: DataType.DECIMAL(12, 2),
    get() {
      const value = this.getDataValue('balanceBefore');
      return value ? parseFloat(value) : 0.00;
    }
  })
  declare balanceBefore?: number;

  @AllowNull(true)
  @Column({
    type: DataType.DECIMAL(12, 2),
    get() {
      const value = this.getDataValue('balanceAfter');
      return value ? parseFloat(value) : 0.00;
    }
  })
  declare balanceAfter?: number;

  // Métodos de ayuda (sin cambios)
  isSuccessful(): boolean {
    return this.status === TransactionStatus.COMPLETED;
  }

  isDeposit(): boolean {
    return this.type === TransactionType.DEPOSIT;
  }

  isWithdrawal(): boolean {
    return this.type === TransactionType.WITHDRAWAL;
  }

  isFee(): boolean {
    return this.type === TransactionType.FEE;
  }

  getFormattedAmount(): string {
    const amount = this.amount || 0;
    const prefix = this.isDeposit() ? '+' : '-';
    return `${prefix}${Math.abs(amount).toFixed(2)}`;
  }
}