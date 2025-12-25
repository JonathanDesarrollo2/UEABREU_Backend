// src/database/models/student.ts
import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, Length, ForeignKey, BelongsTo,
  HasMany
} from "sequelize-typescript";
import { typestudent_full } from "../types/student";
import Representative from "./representative";
import UserLogin from "./userlogin";
import StudentSchedule from "./StudentSchedule";

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

  @AllowNull(false)
  @Column({ type: DataType.DATE })
  declare birthDate?: Date;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare nationality?: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare birthCountry?: string;

  // Dirección (estructurada)
  @AllowNull(false)
  @Column({ type: DataType.STRING(50) })
  declare state?: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare zone?: string;

  @AllowNull(false)
  @Column({ type: DataType.TEXT })
  declare addressDescription?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(15) })
  declare phone?: string;

  // Información de Salud
  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare hasAllergies?: boolean;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare allergiesDescription?: string;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare hasDiseases?: boolean;

  @AllowNull(true)
  @Column({ type: DataType.TEXT })
  declare diseasesDescription?: string;

  // Contacto de Emergencia
  @AllowNull(false)
  @Column({ type: DataType.STRING(100) })
  declare emergencyContact?: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(15) })
  declare emergencyPhone?: string;

  // Información Académica
  @AllowNull(true)
  @Column({ type: DataType.DATE })
  declare admissionDate?: Date;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare initialSchoolYear?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(20) })
  declare currentGrade?: string;

  @AllowNull(true)
  @Column({ type: DataType.STRING(10) })
  declare section?: string;

  // CORRECCIÓN: Añade 'pendiente' al enum
  @AllowNull(false)
  @Default('pendiente')
  @Column({ 
    type: DataType.ENUM('pendiente', 'regular', 'repitiente', 'condicionado', 'inactivo')
  })
  declare status?: 'pendiente' | 'regular' | 'repitiente' | 'condicionado' | 'inactivo';

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

  // En tu modelo Student.ts existente, agrega estos campos:
@AllowNull(true)
@Column({ type: DataType.TEXT })
declare comment1?: string;

@AllowNull(true)
@Column({ type: DataType.TEXT })
declare comment2?: string;

@AllowNull(true)
@Column({ type: DataType.TEXT })
declare comment3?: string;

@AllowNull(true)
@Column({ type: DataType.STRING(50) })
declare class?: string; // Para agrupación administrativa

// Y la relación con StudentSchedule
@HasMany(() => StudentSchedule)
declare studentSchedules?: StudentSchedule[];
}