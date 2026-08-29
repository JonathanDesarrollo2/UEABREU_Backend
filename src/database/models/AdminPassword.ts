import { Table, Column, Model, DataType, IsUUID, PrimaryKey, Default, AllowNull } from "sequelize-typescript";

@Table({ tableName: 'admin_password', freezeTableName: true, timestamps: true })
export default class AdminPassword extends Model {
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  @AllowNull(false)
  @Column({ type: DataType.TEXT })
  declare passwordHash: string;
}