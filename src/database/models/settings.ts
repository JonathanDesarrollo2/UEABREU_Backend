import { Table, Column, Model, DataType, PrimaryKey, IsUUID, Default, AllowNull, Unique } from "sequelize-typescript";

@Table({
  tableName: 'settings',
  freezeTableName: true,
  timestamps: true,
})
export default class Setting extends Model {
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  @AllowNull(false)
  @Unique
  @Column({ type: DataType.STRING(100) })
  declare key?: string;

  @AllowNull(false)
  @Column({ type: DataType.TEXT })
  declare value?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(255) })
  declare description?: string;
}
