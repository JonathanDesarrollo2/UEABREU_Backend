import type { Request, Response } from "express";
import sequelize from "../database/config";
import nodemailer from "nodemailer";
import UserLogin from "../database/models/userlogin";
import Representative from "../database/models/representative";
import Student from "../database/models/student";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import PlanillaCounter from "../database/models/PlanillaCounter";
import RegistrationApplication from "../database/models/RegistrationAplicattion";


// Transporte de correo
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.EMAIL_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});


/**
 * Envía un correo con el código de verificación y el PDF adjunto.
 */
async function sendVerificationEmail(
  email: string,
  code: string,
  pdfBuffer: Buffer
): Promise<void> {
  const mailOptions = {
    from: process.env.EMAIL_FROM || '"U.E. Antonio Abreu" <uejantonioabreu@gmail.com>',
    to: email,
    subject: "Código de verificación y planilla - U.E. Antonio Abreu",
    html: `
      <h2>Verificación de correo</h2>
      <p>Tu código de verificación es: <strong>${code}</strong></p>
      <p>Este código expira en 15 minutos.</p>
      <p>Adjuntamos la planilla de solicitud en PDF.</p>
      <p>Si no solicitaste este registro, ignora este mensaje.</p>
    `,
    attachments: [
      {
        filename: 'Planilla_Inscripcion.pdf',
        content: pdfBuffer,
      },
    ],
  };

  await transporter.sendMail(mailOptions);
  console.log(`📧 Correo enviado a ${email} con código ${code} y PDF adjunto`);
}

export class PublicController {

  // ====================================================================
  // POST /register
  // ====================================================================
  static register = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const {
        usermail,
        userlogin,
        userpass,
        userrepass,
        representativeData,
        studentsData,
        pdfBase64          // ⬅️ nuevo campo
      } = req.body;

      // 1. Validar contraseñas
      if (userpass !== userrepass) {
        await transaction.rollback();
        res.status(400).json({ result: false, content: [], error: ['Las contraseñas no coinciden'] });
        return;
      }

      // 2. Verificar si el email ya existe
      const existingEmail = await UserLogin.findOne({ where: { usermail }, transaction });
      if (existingEmail) {
        await transaction.rollback();
        res.status(400).json({ result: false, content: [], error: ['El email ya está registrado'] });
        return;
      }

      // 3. Verificar si el login ya existe
      const existingLogin = await UserLogin.findOne({ where: { userlogin }, transaction });
      if (existingLogin) {
        await transaction.rollback();
        res.status(400).json({ result: false, content: [], error: ['El nombre de usuario ya está en uso'] });
        return;
      }

      // 4. Verificar cédula del representante
      if (representativeData?.identityCard) {
        const repExists = await Representative.findOne({
          where: { identityCard: representativeData.identityCard },
          transaction
        });
        if (repExists) {
          await transaction.rollback();
          res.status(400).json({
            result: false, content: [], error: ['La cédula del representante ya está registrada']
          });
          return;
        }
      }

      // 5. Crear usuario (inactivo, nivel 1, sin verificar)
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

      // 6. Crear representante
      const newRepresentative = await Representative.create({
        ...representativeData,
        userId: newUser.id,
      }, { transaction });

      // 7. Crear estudiantes (si hay)
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
                result: false,
                content: [],
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
            initialSchoolYear: new Date().getFullYear().toString(),
            balance: 0
          }, { transaction });
        }
      }

      // 8. Generar número de planilla secuencial
      const [counter] = await PlanillaCounter.findOrCreate({
        where: {},
        defaults: { currentNumber: 1 },
        transaction
      });
      const planillaNumber = counter.currentNumber;
      await counter.update({ currentNumber: planillaNumber + 1 }, { transaction });

      // 9. Convertir el PDF recibido en base64 a Buffer (si viene)
      let pdfBuffer: Buffer | null = null;
      if (pdfBase64) {
        pdfBuffer = Buffer.from(pdfBase64, 'base64');
      }

      // 10. Guardar registro de la planilla (con el PDF si existe)
      await RegistrationApplication.create({
        planillaNumber,
        userId: newUser.id,
        representativeId: newRepresentative.id,
        formSnapshot: req.body,
        pdfDocument: pdfBuffer,
      }, { transaction });

      // 11. Generar y guardar código de verificación
      const verificationCode = Math.floor(10000 + Math.random() * 90000).toString();
      newUser.verificationCode = verificationCode;
      newUser.verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000);
      await newUser.save({ transaction });

      // 12. Enviar correo con código (y adjuntar PDF si está disponible)
      try {
        const mailOptions: any = {
          from: process.env.EMAIL_FROM || '"U.E. Antonio Abreu" <uejantonioabreu@gmail.com>',
          to: usermail,
          subject: pdfBuffer
            ? "Código de verificación y planilla - U.E. Antonio Abreu"
            : "Código de verificación - U.E. Antonio Abreu",
          html: `
            <h2>Verificación de correo</h2>
            <p>Tu código de verificación es: <strong>${verificationCode}</strong></p>
            <p>Este código expira en 15 minutos.</p>
            ${pdfBuffer ? '<p>Adjuntamos la planilla de solicitud en PDF.</p>' : ''}
            <p>Si no solicitaste este registro, ignora este mensaje.</p>
          `,
        };

        if (pdfBuffer) {
          mailOptions.attachments = [
            {
              filename: 'Planilla_Inscripcion.pdf',
              content: pdfBuffer,
            },
          ];
        }

        await transporter.sendMail(mailOptions);
        console.log(`📧 Correo enviado a ${usermail} con código ${verificationCode}` + (pdfBuffer ? ' y PDF adjunto' : ''));
      } catch (emailError) {
        console.error('⚠️ Error al enviar el correo de verificación:', emailError);
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
      console.error('❌ Error en registro:', error);
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("register"));
      res.status(500).json({
        result: false,
        content: [],
        error: ['Error interno al procesar el registro']
      });
    }
  };

  // ====================================================================
  // POST /verify-email
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

      // Si expiró, eliminar todo el registro
      if (new Date() > user.verificationCodeExpires) {
        await RegistrationApplication.destroy({ where: { userId: user.id }, transaction });
        await Student.destroy({ where: { userId: user.id }, transaction });
        await Representative.destroy({ where: { userId: user.id }, transaction });
        await user.destroy({ transaction });

        await transaction.commit();
        res.status(400).json({
          result: false,
          content: [],
          error: ['El código de verificación ha expirado y el registro fue cancelado.']
        });
        return;
      }

      if (user.verificationCode !== code) {
        await transaction.rollback();
        res.status(400).json({ result: false, content: [], error: ['Código de verificación incorrecto'] });
        return;
      }

      // Código correcto → verificar correo (cuenta sigue inactiva)
      user.emailVerified = true;
      user.verificationCode = null;
      user.verificationCodeExpires = null;
      await user.save({ transaction });

      // Obtener el PDF almacenado (opcional)
      const registration = await RegistrationApplication.findOne({
        where: { userId: user.id },
        transaction,
      });
      const pdfBuffer = registration?.pdfDocument || null;

      await transaction.commit();

      res.status(200).json({
        result: true,
        content: {
          message: 'Correo verificado exitosamente. La cuenta permanece pendiente de activación.',
          pdfBase64: pdfBuffer ? pdfBuffer.toString('base64') : null,
        },
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
  // En PublicController
static getNextPlanillaNumber = async (req: Request, res: Response) => {
  try {
    const [counter] = await PlanillaCounter.findOrCreate({
      where: {},
      defaults: { currentNumber: 1 },
    });
    res.status(200).json({
      result: true,
      content: { planillaNumber: counter.currentNumber },
      error: [],
    });
  } catch (error: any) {
    ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getNextPlanillaNumber"));
    res.status(500).json({ result: false, content: [], error: ['Error al obtener el número de planilla'] });
  }
};
}