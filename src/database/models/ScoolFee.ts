import {
  Table, Column, Model, DataType, PrimaryKey,
  IsUUID, Default, AllowNull, Length
} from "sequelize-typescript";

@Table({
  tableName: 'ScoolFee',  // Ajusta si el nombre real es scool_fee
  freezeTableName: true,
  timestamps: true,
})
export default class SchoolFee extends Model {
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare schoolYear: string;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(12, 2) })
  declare inscriptionFeeUSD: number;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(12, 2) })
  declare monthlyFeeUSD: number;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(12, 2) })
  declare prontoPagoDiscount: number;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare prontoPagoDeadlineDay: number;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(12, 2) })
  declare administrativeFeeUSD: number;

  @AllowNull(false)
  @Column({ type: DataType.DECIMAL(12, 2) })
  declare august2027HalfPaymentUSD: number;

  @AllowNull(false)
  @Column({ type: DataType.DATEONLY })
  declare monthlyFeeStartDate: string;

  @AllowNull(false)
  @Column({ type: DataType.DATEONLY })
  declare inscriptionStartDate: string;

  @AllowNull(false)
  @Column({ type: DataType.DATEONLY })
  declare inscriptionEndDate: string;

  // ✅ NUEVO CAMPO
  @AllowNull(true)
  @Column({ type: DataType.DATEONLY })
  declare schoolYearEndDate: string;
}