import { Request, Response } from "express";
import sequelize from "../database/config";
import UserLogin from "../database/models/userlogin";
import Representative from "../database/models/representative";
import Student from "../database/models/student";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import nodemailer from "nodemailer";
import Setting from "../database/models/settings";

// Configuración del transporte solo si hay variables de entorno
let transporter: nodemailer.Transporter | null = null;
if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: process.env.EMAIL_PORT === '465', // true para 465
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  console.log('📧 Transporte de correo configurado correctamente');
} else {
  console.warn('⚠️  Variables de correo no definidas. No se enviarán correos reales.');
}

const sendVerificationEmail = async (email: string, code: string): Promise<void> => {
  if (!transporter) {
    console.log(`[EMAIL] No hay transporte configurado. Código para ${email}: ${code}`);
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"Institución" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Código de verificación de cuenta',
      html: `
        <h2>Verificación de correo</h2>
        <p>Tu código de verificación es: <strong>${code}</strong></p>
        <p>Este código expira en 15 minutos.</p>
        <p>Si no solicitaste este registro, ignora este mensaje.</p>
      `,
    });
    console.log(`[EMAIL] Mensaje enviado a ${email}: ${info.messageId}`);
  } catch (error: any) {
    console.error(`[EMAIL] Error enviando a ${email}:`, error.message);
    // Opcional: lanzar error para que se registre en el log de Cloud Run
    ErrorLog.createErrorLog(error, 'PublicController', getErrorLocation("sendVerificationEmail"));
    throw error; // Relanza para capturar en el controlador
  }
};

export class PublicController {
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
      if (!usermail || !userlogin || !userpass || !userrepass) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: ["Faltan campos obligatorios: usermail, userlogin, userpass, userrepass"]
        });
      }

      if (userpass !== userrepass) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: ["Las contraseñas no coinciden"]
        });
      }

      if (!representativeData || !representativeData.fullName || !representativeData.identityCard) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: ["Datos del representante incompletos (fullName, identityCard requeridos)"]
        });
      }

      // Verificar email existente
      const existingEmail = await UserLogin.findOne({ where: { usermail }, transaction });
      if (existingEmail) {
        await transaction.rollback();
        return res.status(202).json({
          result: false,
          content: [],
          error: [`El email ${usermail} ya está registrado`]
        });
      }

      // Verificar login existente
      const existingLogin = await UserLogin.findOne({ where: { userlogin }, transaction });
      if (existingLogin) {
        await transaction.rollback();
        return res.status(202).json({
          result: false,
          content: [],
          error: [`El usuario ${userlogin} ya está en uso`]
        });
      }

      // Generar código de 5 dígitos y expiración
      const verificationCode = Math.floor(10000 + Math.random() * 90000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

      // Crear usuario SIEMPRE desactivado y sin verificar
      const newUser = await UserLogin.create({
        usermail,
        userlogin,
        username: username || userlogin,
        userpass,
        nivel: 1,
        userstatus: false,
        emailVerified: false,
        verificationCode,
        verificationCodeExpires: expiresAt,
      }, { transaction });

      // Crear representante
      const existingRep = await Representative.findOne({
        where: { identityCard: representativeData.identityCard },
        transaction
      });
      if (existingRep) {
        await transaction.rollback();
        return res.status(202).json({
          result: false,
          content: [],
          error: [`La cédula ${representativeData.identityCard} ya está registrada`]
        });
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

      // Crear estudiantes
      if (studentsData && Array.isArray(studentsData)) {
        for (const student of studentsData) {
          if (!student.fullName || !student.identityCard) continue;

          const existStudent = await Student.findOne({
            where: { identityCard: student.identityCard },
            transaction
          });
          if (existStudent) {
            await transaction.rollback();
            return res.status(202).json({
              result: false,
              content: [],
              error: [`La cédula del estudiante ${student.identityCard} ya está registrada`]
            });
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
            status: 'pendiente',
            balance: 0.00,
            admissionDate: new Date(),
            initialSchoolYear: new Date().getFullYear().toString(),
            representativeId: newRepresentative.id,
            userId: newUser.id,
          }, { transaction });
        }
      }

      // Enviar correo (no revierte si falla, pero se registra el error)
      try {
        await sendVerificationEmail(usermail, verificationCode);
      } catch (emailError) {
        // El usuario ya está creado; simplemente logueamos el error
        console.error('Error al enviar el correo de verificación:', emailError);
        // Podrías también guardar un log en BD si lo deseas
      }

      await transaction.commit();

      return res.status(200).json({
        result: true,
        content: ["Registro exitoso. Se ha enviado un código de verificación a su correo."],
        error: []
      });

    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'PublicController', getErrorLocation("register"));
      return res.status(500).json({
        result: false,
        content: [],
        error: [`Error en el registro: ${error.message}`]
      });
    }
  };

  static verifyEmail = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        await transaction.rollback();
        return res.status(400).json({
          result: false,
          content: [],
          error: ["Email y código son requeridos"]
        });
      }

      const user = await UserLogin.findOne({ where: { usermail: email }, transaction });
      if (!user) {
        await transaction.rollback();
        return res.status(404).json({
          result: false,
          content: [],
          error: ["Usuario no encontrado"]
        });
      }

      if (user.emailVerified) {
        await transaction.rollback();
        return res.status(202).json({
          result: false,
          content: [],
          error: ["El correo ya ha sido verificado"]
        });
      }

      if (user.verificationCode !== code) {
        await transaction.rollback();
        return res.status(202).json({
          result: false,
          content: [],
          error: ["Código de verificación inválido"]
        });
      }

      if (user.verificationCodeExpires && new Date() > user.verificationCodeExpires) {
        await transaction.rollback();
        return res.status(202).json({
          result: false,
          content: [],
          error: ["El código ha expirado. Solicite uno nuevo"]
        });
      }

      user.emailVerified = true;
      user.verificationCode = null;
      user.verificationCodeExpires = null;
      await user.save({ transaction });

      await transaction.commit();

      return res.status(200).json({
        result: true,
        content: ["Correo verificado exitosamente. Su cuenta permanece pendiente de activación."],
        error: []
      });

    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'PublicController', getErrorLocation("verifyEmail"));
      return res.status(500).json({
        result: false,
        content: [],
        error: [`Error en la verificación: ${error.message}`]
      });
    }
  };
  // Dentro de la clase PublicController
static getRegistrationStatus = async (req: Request, res: Response) => {
  try {
    let setting = await Setting.findOne({ where: { key: 'registrations_enabled' } });
    // Si no existe, lo creamos con valor por defecto false
    if (!setting) {
      setting = await Setting.create({
        key: 'registrations_enabled',
        value: 'false',
        description: 'Controla si el registro público de representantes está habilitado'
      });
    }
    const isEnabled = setting.value === 'true';
    res.json({ result: true, content: { registrationsEnabled: isEnabled }, error: [] });
  } catch (error: any) {
    res.status(500).json({ result: false, content: [], error: [error.message] });
  }
};
}