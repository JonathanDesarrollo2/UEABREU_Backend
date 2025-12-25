// src/database/models/subject.ts
import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, Length, ForeignKey, BelongsTo, HasMany
} from "sequelize-typescript";
import Teacher from "./teacher";
import { typesubject_full } from "../types/subject";
import Schedule from "./Schedule";

@Table({
  tableName: 'subject',
  freezeTableName: true,
  timestamps: true,
})
export default class Subject extends Model<typesubject_full> {
  
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  // Información de la materia
  @AllowNull(false)
  @Length({ min: 3, max: 100 })
  @Column({ type: DataType.STRING(100) })
  declare name?: string;

  @AllowNull(false)
  @Length({ min: 3, max: 50 })
  @Column({ type: DataType.STRING(50), unique: true })
  declare code?: string; // Ejemplo: 1ro.Biologia

  // Horas
  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.INTEGER })
  declare hoursPerWeek?: number;

  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.INTEGER })
  declare theoreticalHours?: number;

  @AllowNull(false)
  @Default(0)
  @Column({ type: DataType.INTEGER })
  declare labHours?: number;

  // Tipo de materia
  @AllowNull(false)
  @Default('regular')
  @Column({ 
    type: DataType.ENUM('ordinaria', 'regular', 'complementaria_obligatoria', 'complementaria_opcional')
  })
  declare subjectType?: string;

  // Campos adicionales
  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare comments?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(50) })
  declare class?: string; // Para agrupación administrativa

  // Relación con docente
  @ForeignKey(() => Teacher)
  @AllowNull(true)
  @Column({ type: DataType.UUID })
  declare teacherId?: string;

  @BelongsTo(() => Teacher)
  declare teacher?: Teacher;

  // Relación con horarios
  @HasMany(() => Schedule)
  declare schedules?: Schedule[];
}