// src/database/models/schedule.ts
import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, Length, ForeignKey, BelongsTo, HasMany
} from "sequelize-typescript";
import { typeschedule_full } from "../types/schedule";
import Subject from "./subject";
import Teacher from "./teacher";
import StudentSchedule from "./StudentSchedule";

@Table({
  tableName: 'schedule',
  freezeTableName: true,
  timestamps: true,
})
export default class Schedule extends Model<typeschedule_full> {
  
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  // Código del horario (7 dígitos: 1V2526)
  @AllowNull(false)
  @Length({ min: 7, max: 7 })
  @Column({ type: DataType.STRING(7), unique: true })
  declare code?: string;

  // Información del grupo
  @AllowNull(false)
  @Column({ type: DataType.STRING(10) })
  declare grade?: string; // 1ro, 2do, etc.

  @AllowNull(false)
  @Column({ type: DataType.STRING(1) })
  declare section?: string; // A, B, C, D

  // Día de la semana
  @AllowNull(false)
  @Column({ 
    type: DataType.ENUM('lunes', 'martes', 'miercoles', 'jueves', 'viernes')
  })
  declare day?: string;

  // Bloques (1-9 según tu especificación)
  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare startBlock?: number; // Bloque inicial (1-9)

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare endBlock?: number; // Bloque final (siempre será startBlock+1 para 2 bloques)

  // Información de la clase
  @AllowNull(true)
  @Column({ type: DataType.STRING(100) })
  declare classroom?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare building?: string;

  // Relación con materia
  @ForeignKey(() => Subject)
  @AllowNull(false)
  @Column({ type: DataType.UUID })
  declare subjectId?: string;

  @BelongsTo(() => Subject)
  declare subject?: Subject;

  // Relación con docente (opcional, ya que la materia ya tiene docente)
  @ForeignKey(() => Teacher)
  @AllowNull(true)
  @Column({ type: DataType.UUID })
  declare teacherId?: string;

  @BelongsTo(() => Teacher)
  declare teacher?: Teacher;

  // Relación muchos a muchos con estudiantes
  @HasMany(() => StudentSchedule)
  declare studentSchedules?: StudentSchedule[];

  // Método para obtener información del horario formateada
  getScheduleInfo() {
    const blockTimes = {
      1: '7:00 - 7:40',
      2: '7:40 - 8:20', 
      3: '8:20 - 9:00',
      4: '9:00 - 9:01',
      5: '10:00 - 10:20',
      6: '10:20 - 10:40',
      7: '10:40 - 11:20',
      8: '11:20 - 12:00',
      9: '12:20 - 12:40'
    };

    return {
      code: this.code,
      grade: this.grade,
      section: this.section,
      day: this.day,
      timeRange: `${blockTimes[this.startBlock as keyof typeof blockTimes]} - ${blockTimes[this.endBlock as keyof typeof blockTimes]}`,
      subject: this.subject?.name,
      teacher: this.teacher?.fullName || this.subject?.teacher?.fullName,
      classroom: this.classroom
    };
  }
}