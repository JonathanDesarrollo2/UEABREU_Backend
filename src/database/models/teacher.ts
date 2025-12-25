// src/database/models/teacher.ts
import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, Length, HasMany
} from "sequelize-typescript";
import { typeteacher_full } from "../types/teacher";
import Subject from "./subject";

@Table({
  tableName: 'teacher',
  freezeTableName: true,
  timestamps: true,
})
export default class Teacher extends Model<typeteacher_full> {
  
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

  @AllowNull(false)
  @Column({ type: DataType.STRING(200) })
  declare address?: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(15) })
  declare phone?: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare email?: string;

  // Información Profesional
  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare specialization?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare degree?: string;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare status?: boolean;

  // Campos adicionales
  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare comments?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare class?: string; // Para agrupación administrativa

  // Relación con materias
  @HasMany(() => Subject)
  declare subjects?: Subject[];
}