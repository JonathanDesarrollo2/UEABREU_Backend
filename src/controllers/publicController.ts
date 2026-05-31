import type { Request, Response } from "express";
import sequelize from "../database/config";
import nodemailer from 'nodemailer';                       // ← nuevo
import UserLogin from "../database/models/userlogin";
import Representative from "../database/models/representative";
import Student from "../database/models/student";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import PlanillaCounter from "../database/models/PlanillaCounter";
import RegistrationApplication from "../database/models/RegistrationAplicattion";

// ------------------------------------------------------------
// Transporter reutilizable (se crea una sola vez)
// ------------------------------------------------------------
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 465,
  secure: Number(process.env.EMAIL_PORT) === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export class PublicController {

  // ====================================================================
  // POST /register
  // ====================================================================
  static register = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const { usermail, userlogin, userpass, userrepass, representativeData, studentsData } = req.body;

      if (userpass !== userrepass) {
        await transaction.rollback();
        res.status(400).json({ result: false, content: [], error: ['Las contraseñas no coinciden'] });
        return;
      }

      const existingEmail = await UserLogin.findOne({ where: { usermail }, transaction });
      if (existingEmail) {
        await transaction.rollback();
        res.status(400).json({ result: false, content: [], error: ['El email ya está registrado'] });
        return;
      }

      const existingLogin = await UserLogin.findOne({ where: { userlogin }, transaction });
      if (existingLogin) {
        await transaction.rollback();
        res.status(400).json({ result: false, content: [], error: ['El nombre de usuario ya está en uso'] });
        return;
      }

      if (representativeData?.identityCard) {
        const repExists = await Representative.findOne({
          where: { identityCard: representativeData.identityCard },
          transaction
        });
        if (repExists) {
          await transaction.rollback();
          res.status(400).json({ result: false, content: [], error: ['La cédula del representante ya está registrada'] });
          return;
        }
      }

      const newUser = await UserLogin.create({
        usermail,
        userlogin,
        userpass,
        username: representativeData.fullName,
        nivel: 1,
        userstatus: false,
        emailVerified: false,
        verificationCode: null,
        verificationCodeExpires: null,
      }, { transaction });

      const newRepresentative = await Representative.create({
        ...representativeData,
        userId: newUser.id,
      }, { transaction });

      if (studentsData && Array.isArray(studentsData)) {
        for (const student of studentsData) {
          if (student.identityCard) {
            const studentExists = await Student.findOne({
              where: { identityCard: student.identityCard },
              transaction
            });
            if (studentExists) {
              await transaction.rollback();
              res.status(400).json({
                result: false, content: [],
                error: [`La cédula del estudiante ${student.identityCard} ya está registrada`]
              });
              return;
            }
          }

          await Student.create({
            fullName: student.fullName,
            identityCard: student.identityCard,
            birthDate: new Date(student.birthDate),
            nationality: student.nationality,
            birthCountry: student.birthCountry,
            state: student.state,
            zone: student.zone,
            addressDescription: student.addressDescription,
            phone: student.phone || '',
            emergencyContact: student.emergencyContact,
            emergencyPhone: student.emergencyPhone,
            hasAllergies: student.hasAllergies || false,
            allergiesDescription: student.allergiesDescription || '',
            hasDiseases: student.hasDiseases || false,
            diseasesDescription: student.diseasesDescription || '',
            previousSchool: student.previousSchool || null,
            municipality: student.municipality || null,
            representativeId: newRepresentative.id,
            userId: newUser.id,
            status: 'pendiente',
            currentGrade: student.currentGrade || 'En asignar',
            section: student.section || 'Pendiente',
            admissionDate: new Date(),
            initialSchoolYear: new Date().getFullYear().toString(),
            balance: 0
          }, { transaction });
        }
      }

      // Generar número de planilla secuencial
      const [counter] = await PlanillaCounter.findOrCreate({
        where: {},
        defaults: { currentNumber: 1 },
        transaction
      });
      const planillaNumber = counter.currentNumber;
      await counter.update({ currentNumber: planillaNumber + 1 }, { transaction });

      // Guardar registro de la planilla
      await RegistrationApplication.create({
        planillaNumber,
        userId: newUser.id,
        representativeId: newRepresentative.id,
        formSnapshot: req.body
      }, { transaction });

      // Generar y guardar código de verificación
      const verificationCode = Math.floor(10000 + Math.random() * 90000).toString();
      newUser.verificationCode = verificationCode;
      newUser.verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000);
      await newUser.save({ transaction });

      // -----------------------------------------------
      // 📧 ENVIAR EL CORREO DE VERIFICACIÓN (REAL)
      // -----------------------------------------------
      const mailOptions = {
        from: process.env.EMAIL_FROM || '"U.E. Antonio Abreu" <uejantonioabreu@gmail.com>',
        to: usermail,
        subject: 'Verifica tu correo - U.E. José Antonio Abreu',
        text: `Tu código de verificación es: ${verificationCode}. Válido por 15 minutos.`,
        html: `<p>Tu código de verificación es: <strong>${verificationCode}</strong></p><p>Válido por 15 minutos.</p>`,
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 Correo enviado a ${usermail} con código ${verificationCode}`);
      } catch (emailError) {
        // Si el correo falla, lo registramos pero NO hacemos rollback.
        // El usuario ya está creado y el código guardado; podría reenviarse después.
        console.error('⚠️ Error al enviar el correo de verificación:', emailError);
        // Opcional: podrías devolver un warning, pero no es necesario.
      }

      await transaction.commit();

      res.status(200).json({
        result: true,
        content: {
          message: 'Registro exitoso. Revisa tu correo para verificar la cuenta.',
          planillaNumber
        },
        error: []
      });

    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("register"));
      res.status(500).json({ result: false, content: [], error: ['Error interno al procesar el registro'] });
    }
  };

  // ====================================================================
  // POST /verify-email   (no se toca, funciona perfecto)
  // ====================================================================
  static verifyEmail = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const { email, code } = req.body;

      const user = await UserLogin.findOne({
        where: { usermail: email },
        transaction
      });

      if (!user) {
        await transaction.rollback();
        res.status(400).json({ result: false, content: [], error: ['Usuario no encontrado'] });
        return;
      }

      if (user.emailVerified) {
        await transaction.rollback();
        res.status(200).json({ result: true, content: ['El correo ya estaba verificado'], error: [] });
        return;
      }

      if (!user.verificationCode || !user.verificationCodeExpires) {
        await transaction.rollback();
        res.status(400).json({ result: false, content: [], error: ['No hay código de verificación pendiente'] });
        return;
      }

      if (new Date() > user.verificationCodeExpires) {
        await transaction.rollback();
        res.status(400).json({ result: false, content: [], error: ['El código de verificación ha expirado'] });
        return;
      }

      if (user.verificationCode !== code) {
        await transaction.rollback();
        res.status(400).json({ result: false, content: [], error: ['Código de verificación incorrecto'] });
        return;
      }

      // Solo marcar el correo como verificado, NO activar la cuenta
      user.emailVerified = true;
      user.verificationCode = null;
      user.verificationCodeExpires = null;
      await user.save({ transaction });

      await transaction.commit();

      res.status(200).json({
        result: true,
        content: ['Correo verificado exitosamente. La cuenta permanece pendiente de activación.'],
        error: []
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("verifyEmail"));
      res.status(500).json({ result: false, content: [], error: ['Error al verificar el correo'] });
    }
  };

  // ====================================================================
  // GET /registration-status
  // ====================================================================
  static getRegistrationStatus = async (req: Request, res: Response) => {
    try {
      const registrationsEnabled = true;
      res.status(200).json({
        result: true,
        content: { registrationsEnabled },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getRegistrationStatus"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error al verificar el estado de las inscripciones']
      });
    }
  };
}