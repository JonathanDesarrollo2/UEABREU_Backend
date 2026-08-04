// src/database/models/representative.ts
import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, Length, HasMany, ForeignKey, BelongsTo
} from "sequelize-typescript";
import { typerepresentative_full } from "../types/representative";
import Student from "./student";
import UserLogin from "./userlogin";

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

  // Relación con usuario
  @AllowNull(true)
  @ForeignKey(() => UserLogin)
  @Column({ type: DataType.UUID })
  declare userId?: string;

  @BelongsTo(() => UserLogin)
  declare user?: UserLogin;

  // Relaciones
  @HasMany(() => Student)
  declare students?: Student[];

  // Método para obtener el balance total (suma de estudiantes)
  async getTotalBalance(): Promise<number> {
    const students = await this.$get('students');
    return students?.reduce((sum, s) => sum + (s.balance || 0), 0) || 0;
  }
}
