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
  startTime: string;
  endTime: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: 'block_time_config',
  freezeTableName: true,
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['grade', 'section', 'blockNumber']
    }
  ]
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

  // La propiedad estática uniqueConstraint ya no es necesaria
  // static uniqueConstraint: any; <-- ELIMINAR
}