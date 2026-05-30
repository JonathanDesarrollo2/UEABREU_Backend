import { Table, Column, Model, DataType, AllowNull, Default } from "sequelize-typescript";

@Table({
  tableName: 'planilla_counter',
  freezeTableName: true,
  timestamps: false,
})
export default class PlanillaCounter extends Model {
  @AllowNull(false)
  @Default(1)  // empieza en 1
  @Column({ type: DataType.INTEGER })
  declare currentNumber: number;
}
