import { Request, Response } from "express";
import sequelize from "../database/config";
import UserLogin from "../database/models/userlogin";
import Representative from "../database/models/representative";
import Student from "../database/models/student";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";

// Función placeholder para envío de correo (debes implementarla)
const sendVerificationEmail = async (email: string, code: string): Promise<void> => {
  // Ejemplo con nodemailer o consola
  console.log(`[EMAIL] Enviando código ${code} a ${email}`);
  // TODO: implementar envío real
};

export class PublicController {
  
  /**
   * POST /public/register
   * Registro público de representante con estudiantes.
   * Requiere: usermail, userlogin, userpass, userrepass, representativeData, studentsData[]
   * Crea cuenta desactivada, envía código de verificación.
   */
  static register = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const {
        usermail,
        userlogin,
        username,
        userpass,
        userrepass,
        representativeData,
        studentsData,
      } = req.body;

      // Validaciones básicas
      if (userpass !== userrepass) {
        await transaction.rollback();
        res.status(400).json({
          result: false,
          content: [],
          error: ["Las contraseñas no coinciden"]
        });
        return;
      }

      // Verificar email existente
      const existingEmail = await UserLogin.findOne({ where: { usermail }, transaction });
      if (existingEmail) {
        await transaction.rollback();
        res.status(202).json({
          result: false,
          content: [],
          error: [`El email ${usermail} ya está registrado`]
        });
        return;
      }

      // Verificar login existente
      const existingLogin = await UserLogin.findOne({ where: { userlogin }, transaction });
      if (existingLogin) {
        await transaction.rollback();
        res.status(202).json({
          result: false,
          content: [],
          error: [`El usuario ${userlogin} ya está en uso`]
        });
        return;
      }

      // Generar código de 5 dígitos
      const verificationCode = Math.floor(10000 + Math.random() * 90000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

      // Crear usuario SIEMPRE desactivado y sin verificar
      const newUser = await UserLogin.create({
        usermail,
        userlogin,
        username: username || userlogin,
        userpass, // el hook de encriptación se encargará
        nivel: 1,          // siempre representante
        userstatus: false, // cuenta desactivada hasta la entrevista
        emailVerified: false,
        verificationCode,
        verificationCodeExpires: expiresAt,
      }, { transaction });

      // Crear representante
      if (!representativeData || !representativeData.fullName || !representativeData.identityCard) {
        await transaction.rollback();
        res.status(400).json({
          result: false,
          content: [],
          error: ["Datos del representante incompletos"]
        });
        return;
      }

      // Verificar cédula del representante única
      const existingRep = await Representative.findOne({
        where: { identityCard: representativeData.identityCard },
        transaction
      });
      if (existingRep) {
        await transaction.rollback();
        res.status(202).json({
          result: false,
          content: [],
          error: [`La cédula ${representativeData.identityCard} ya está registrada`]
        });
        return;
      }

      const newRepresentative = await Representative.create({
        fullName: representativeData.fullName,
        identityCard: representativeData.identityCard,
        address: representativeData.address || '',
        phone: representativeData.phone || '',
        relationship: representativeData.relationship || 'No especificada',
        parentName: representativeData.parentName,
        parentIdentityCard: representativeData.parentIdentityCard,
        parentAddress: representativeData.parentAddress,
        parentPhone: representativeData.parentPhone,
        userId: newUser.id,
      }, { transaction });

      // Crear estudiantes (si vienen)
      if (studentsData && Array.isArray(studentsData)) {
        for (const student of studentsData) {
          if (!student.fullName || !student.identityCard) continue;

          // Verificar cédula única
          const existStudent = await Student.findOne({
            where: { identityCard: student.identityCard },
            transaction
          });
          if (existStudent) {
            await transaction.rollback();
            res.status(202).json({
              result: false,
              content: [],
              error: [`La cédula del estudiante ${student.identityCard} ya está registrada`]
            });
            return;
          }

          await Student.create({
            fullName: student.fullName,
            identityCard: student.identityCard,
            birthDate: new Date(student.birthDate),
            nationality: student.nationality || '',
            birthCountry: student.birthCountry || '',
            state: student.state || '',
            zone: student.zone || '',
            addressDescription: student.addressDescription || '',
            phone: student.phone || '',
            emergencyContact: student.emergencyContact || '',
            emergencyPhone: student.emergencyPhone || '',
            hasAllergies: student.hasAllergies || false,
            allergiesDescription: student.allergiesDescription || '',
            hasDiseases: student.hasDiseases || false,
            diseasesDescription: student.diseasesDescription || '',
            currentGrade: student.currentGrade || 'En asignar',
            section: student.section || 'Pendiente',
            status: 'pendiente',          // ✅ pendiente por defecto
            balance: 0.00,                // ✅ sin saldo
            admissionDate: new Date(),
            initialSchoolYear: new Date().getFullYear().toString(),
            representativeId: newRepresentative.id,
            userId: newUser.id,
          }, { transaction });
        }
      }

      // Enviar correo con el código
      await sendVerificationEmail(usermail, verificationCode).catch(err => {
        console.error("Error enviando correo de verificación:", err);
        // No hacemos rollback, el usuario está creado pero puede reenviar código
      });

      await transaction.commit();

      res.status(200).json({
        result: true,
        content: ["Registro exitoso. Se ha enviado un código de verificación a su correo."],
        error: []
      });

    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'PublicController', getErrorLocation("register"));
      res.status(500).json({
        result: false,
        content: [],
        error: [`Error en el registro: ${error.message}`]
      });
    }
  };

  /**
   * POST /public/verify-email
   * Verifica el código de 5 dígitos enviado al correo.
   */
  static verifyEmail = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        await transaction.rollback();
        res.status(400).json({
          result: false,
          content: [],
          error: ["Email y código son requeridos"]
        });
        return;
      }

      const user = await UserLogin.findOne({
        where: { usermail: email },
        transaction
      });

      if (!user) {
        await transaction.rollback();
        res.status(404).json({
          result: false,
          content: [],
          error: ["Usuario no encontrado"]
        });
        return;
      }

      if (user.emailVerified) {
        await transaction.rollback();
        res.status(202).json({
          result: false,
          content: [],
          error: ["El correo ya ha sido verificado"]
        });
        return;
      }

      if (user.verificationCode !== code) {
        await transaction.rollback();
        res.status(202).json({
          result: false,
          content: [],
          error: ["Código de verificación inválido"]
        });
        return;
      }

      if (user.verificationCodeExpires && new Date() > user.verificationCodeExpires) {
        await transaction.rollback();
        res.status(202).json({
          result: false,
          content: [],
          error: ["El código ha expirado. Solicite uno nuevo"]
        });
        return;
      }

      // Marcar como verificado y limpiar código
      user.emailVerified = true;
      user.verificationCode = null;
      user.verificationCodeExpires = null;
      await user.save({ transaction });

      await transaction.commit();

      res.status(200).json({
        result: true,
        content: ["Correo verificado exitosamente. Su cuenta permanece pendiente de activación."],
        error: []
      });

    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'PublicController', getErrorLocation("verifyEmail"));
      res.status(500).json({
        result: false,
        content: [],
        error: [`Error en la verificación: ${error.message}`]
      });
    }
  };
}