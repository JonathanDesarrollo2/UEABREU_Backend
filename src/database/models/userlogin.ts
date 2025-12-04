import {
  Table, Column, Model, DataType, Default, PrimaryKey,
  IsUUID, AllowNull, Length, HasOne, BeforeCreate, BeforeUpdate
} from "sequelize-typescript";
import { typeuserlogin_full } from "../types/userlogin";
import Student from "./student";
import bcrypt from 'bcrypt';

@Table({
  tableName: 'userlogin',
  freezeTableName: true,
  timestamps: true,
})
export default class UserLogin extends Model<typeuserlogin_full> {
  
  @IsUUID("all")
  @PrimaryKey
  @Default(DataType.UUIDV4)
  @Column({ type: DataType.UUID })
  declare id?: string;

  @AllowNull(false)
  @Length({ min: 8, max: 250 })
  @Column({ 
    type: DataType.STRING(250), 
    unique: true,
    set(value: string) { 
      this.setDataValue('usermail', value.toLowerCase()); 
    }
  })
  declare usermail?: string;

  @AllowNull(false)
  @Length({ min: 4, max: 100 })
  @Column({ type: DataType.STRING(100) })
  declare userlogin?: string;

  @AllowNull(true)
  @Length({ min: 4, max: 200 })
  @Column({ type: DataType.STRING(100) })
  declare username?: string;

  @AllowNull(false)
  @Length({ min: 6, max: 200 })
  @Column({ 
    type: DataType.STRING(200),
    set(value: string) {
      // Solo almacenar el valor, el hash se hace en los hooks
      this.setDataValue('userpass', value);
    }
  })
  declare userpass?: string;

  @AllowNull(false)
  @Default(false)
  @Column({ type: DataType.BOOLEAN })
  declare userstatus?: boolean;

  @AllowNull(false)
  @Default(1)
  @Column({ type: DataType.INTEGER })
  declare nivel?: number;

  // Hash password antes de crear Y actualizar
  @BeforeCreate
  @BeforeUpdate
  static async hashPassword(instance: UserLogin) {
    if (instance.userpass && instance.changed('userpass')) {
      console.log('🔐 Hasheando contraseña...');
      const saltRounds = 10;
      instance.userpass = await bcrypt.hash(instance.userpass, saltRounds);
      console.log('🔐 Contraseña hasheada correctamente');
    }
  }

  // Método para comparar contraseñas - ¡IMPORTANTE!
  async comparePassword(candidatePassword: string): Promise<boolean> {
    if (!this.userpass) {
      console.log('❌ No hay contraseña almacenada para comparar');
      return false;
    }
    
    console.log('🔑 Comparando contraseñas...');
    console.log('Contraseña recibida:', candidatePassword);
    console.log('Hash almacenado:', this.userpass);
    
    try {
      const result = await bcrypt.compare(candidatePassword, this.userpass);
      console.log('✅ Resultado comparación:', result);
      return result;
    } catch (error) {
      console.log('❌ Error en comparación:', error);
      return false;
    }
  }

  // Relación con estudiantes
  @HasOne(() => Student)
  declare student?: Student;
}