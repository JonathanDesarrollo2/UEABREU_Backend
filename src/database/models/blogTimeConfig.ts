// src/database/models/BlockTimeConfig.ts
import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, Unique, Index
} from "sequelize-typescript";

export interface BlockTimeConfigAttributes {
  id?: string;
  grade: string;
  section: string;
  blockNumber: number;
  startTime: string;   // formato 'HH:mm'
  endTime: string;     // formato 'HH:mm'
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: 'block_time_config',
  freezeTableName: true,
  timestamps: true,
})
export default class BlockTimeConfig extends Model<BlockTimeConfigAttributes> {
  
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(10) })
  declare grade: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(10) })
  declare section: string;

  @AllowNull(false)
  @Column({ type: DataType.INTEGER })
  declare blockNumber: number;

  @AllowNull(false)
  @Column({ type: DataType.STRING(5) })
  declare startTime: string;

  @AllowNull(false)
  @Column({ type: DataType.STRING(5) })
  declare endTime: string;

  @AllowNull(false)
  @Default(true)
  @Column({ type: DataType.BOOLEAN })
  declare isActive?: boolean;

  // Índice único compuesto: grado + sección + número de bloque
  @Unique('unique_grade_section_block')
  static uniqueConstraint: any;
}