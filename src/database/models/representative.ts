import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, Length, HasMany
} from "sequelize-typescript";
import { typerepresentative_full } from "../types/representative";
import Student from "./student";

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
  declare relationship?: string; // padre, madre, tutor, etc.

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

  // Relaciones
  @HasMany(() => Student)
  declare students?: Student[];
}