import { Table, Column, Model, DataType, IsUUID, PrimaryKey, Default, AllowNull, ForeignKey, BelongsTo } from "sequelize-typescript";
import UserLogin from "./userlogin";

@Table({ tableName: 'audit_log', freezeTableName: true, timestamps: true })
export default class AuditLog extends Model {
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  @ForeignKey(() => UserLogin)
  @AllowNull(true)
  @Column({ type: DataType.UUID })
  declare userId?: string;

  @BelongsTo(() => UserLogin)
  declare user?: UserLogin;

  @AllowNull(false)
  @Column({ type: DataType.TEXT })
  declare action: string;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare details?: object;
}