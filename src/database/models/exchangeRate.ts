import { Table, Column, Model, DataType, PrimaryKey, Default, AllowNull, Unique } from 'sequelize-typescript';

/**
 * Historial inmutable de tasas.
 * `effectiveDate` es la fecha valor: la tasa consultada a las 18:00 se
 * guarda para el día siguiente y nunca se reemplaza una tasa ya usada.
 */
@Table({ tableName: 'exchange_rate', freezeTableName: true, timestamps: true })
export default class ExchangeRate extends Model {
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column(DataType.UUID)
  declare id?: string;

  @Unique('exchange-rate-effective-date')
  @AllowNull(false)
  @Column(DataType.DATEONLY)
  declare effectiveDate?: string;

  @AllowNull(false)
  @Column(DataType.DECIMAL(12, 4))
  declare rate?: number;

  @AllowNull(true)
  @Column(DataType.DATE)
  declare fetchedAt?: Date;

  @AllowNull(true)
  @Column(DataType.STRING(50))
  declare source?: string;
}
