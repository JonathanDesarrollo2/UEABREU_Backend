// src/database/models/studentschedule.ts
import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, ForeignKey, BelongsTo
} from "sequelize-typescript";
import Student from "./student";
import { typestudentschedule_full } from "../types/StudentSchedule";
import Schedule from "./Schedule";

@Table({
  tableName: 'studentschedule',
  freezeTableName: true,
  timestamps: true,
})
export default class StudentSchedule extends Model<typestudentschedule_full> {
  
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  // Relación con estudiante
  @ForeignKey(() => Student)
  @AllowNull(false)
  @Column({ type: DataType.UUID })
  declare studentId?: string;

  @BelongsTo(() => Student)
  declare student?: Student;

  // Relación con horario
  @ForeignKey(() => Schedule)
  @AllowNull(false)
  @Column({ type: DataType.UUID })
  declare scheduleId?: string;

  @BelongsTo(() => Schedule)
  declare schedule?: Schedule;

  // Tipo de horario (regular o pendiente para materias de otro año)
  @AllowNull(false)
  @Default('regular')
  @Column({ 
    type: DataType.ENUM('regular', 'pendiente')
  })
  declare scheduleType?: string;

  // Campos adicionales
  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare comment1?: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare comment2?: string;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare comment3?: string;

  // Fechas
  @AllowNull(false)
  @Default(DataType.NOW)
  @Column({ type: DataType.DATE })
  declare assignedAt?: Date;

  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare endDate?: Date;
}