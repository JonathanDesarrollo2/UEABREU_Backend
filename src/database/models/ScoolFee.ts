import { Table, Column, Model, DataType, AllowNull, PrimaryKey, IsUUID, Default, Unique } from "sequelize-typescript";
import { typeSchoolFee } from "../types/SchoolFee";

@Table({
  tableName: 'school_fee',
  freezeTableName: true,
  timestamps: true,
})
export default class SchoolFee extends Model<typeSchoolFee> {
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  @AllowNull(false)
  @Unique
  @Column({ type: DataType.STRING(20) })
  declare schoolYear?: string;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(10, 2) })
  declare inscriptionFeeUSD?: number;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(10, 2) })
  declare monthlyFeeUSD?: number;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(10, 2) })
  declare prontoPagoDiscount?: number;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare prontoPagoDeadlineDay?: number;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(10, 2) })
  declare administrativeFeeUSD?: number;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(10, 2) })
  declare august2027HalfPaymentUSD?: number;

  @AllowNull(false)
  @Column({ type: DataType.DATEONLY })
  declare monthlyFeeStartDate?: string;

  @AllowNull(false)
  @Column({ type: DataType.DATEONLY })
  declare inscriptionStartDate?: string;

  @AllowNull(false)
  @Column({ type: DataType.DATEONLY })
  declare inscriptionEndDate?: string;
}