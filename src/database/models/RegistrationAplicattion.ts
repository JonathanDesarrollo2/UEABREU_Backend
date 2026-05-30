import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, ForeignKey, BelongsTo, Unique
} from "sequelize-typescript";
import UserLogin from "./userlogin";
import Representative from "./representative";

@Table({
  tableName: 'registration_application',
  freezeTableName: true,
  timestamps: true,
})
export default class RegistrationApplication extends Model {
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  @AllowNull(false)
  @Unique
  @Column({ type: DataType.INTEGER })
  declare planillaNumber: number;

  @ForeignKey(() => UserLogin)
  @AllowNull(false)
  @Column({ type: DataType.UUID })
  declare userId?: string;

  @BelongsTo(() => UserLogin)
  declare user?: UserLogin;

  @ForeignKey(() => Representative)
  @AllowNull(false)
  @Column({ type: DataType.UUID })
  declare representativeId?: string;

  @BelongsTo(() => Representative)
  declare representative?: Representative;

  @AllowNull(true)
  @Column({ type: DataType.JSONB })
  declare formSnapshot?: object;
}
