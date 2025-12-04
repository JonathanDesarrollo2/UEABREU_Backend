import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, Length, ForeignKey, BelongsTo
} from "sequelize-typescript";
import { typestudent_full } from "../types/student";
import Representative from "./representative";
import UserLogin from "./userlogin";

@Table({
  tableName: 'student',
  freezeTableName: true,
  timestamps: true,
})
export default class Student extends Model<typestudent_full> {
  
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  // Información Personal
  @AllowNull(false)
  @Length({ min: 3, max: 100 })
  @Column({ type: DataType.STRING(100) })
  declare fullName?: string;

  @AllowNull(false)
  @Length({ min: 6, max: 20 })
  @Column({ type: DataType.STRING(20), unique: true })
  declare identityCard?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(200) })
  declare address?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(15) })
  declare phone?: string;

  // Información Académica
  @AllowNull(false)
  @Column({ type: DataType.DATE })
  declare admissionDate?: Date;

  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare initialSchoolYear?: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(20) })
  declare currentGrade?: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(10) })
  declare section?: string;

  @AllowNull(false)
  @Default('regular')
  @Column({ 
    type: DataType.ENUM('regular', 'repitiente', 'condicionado')
  })
  declare status?: string;

  // Relaciones
  @ForeignKey(() => Representative)
  @AllowNull(false)
  @Column({ type: DataType.UUID })
  declare representativeId?: string;

  @BelongsTo(() => Representative)
  declare representative?: Representative;

  @ForeignKey(() => UserLogin)
  @AllowNull(true)
  @Column({ type: DataType.UUID })
  declare userId?: string;

  @BelongsTo(() => UserLogin)
  declare user?: UserLogin;
}