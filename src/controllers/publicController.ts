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
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// Configurar fuentes de pdfmake
(pdfMake as any).vfs = pdfFonts.vfs;
// Configurar fuentes de pdfmake correctamente
(pdfMake as any).vfs = (pdfFonts as any).vfs;
(pdfMake as any).fonts = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf'
  }
};
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
 * Genera el PDF de la planilla y devuelve un Buffer.
 * Versión sin logo para evitar dependencias de archivos.
 */
async function generatePlanillaPDFBuffer(
  data: any,
  planillaNumber: number,
  _calcularEdad: (fecha: string) => number | string
): Promise<Buffer> {
  // Función para calcular edad (misma lógica del frontend)
  const calcEdad = (fecha: string): number | string => {
    if (!fecha) return '';
    const hoy = new Date();
    const nac = new Date(fecha);
    let edad = hoy.getFullYear() - nac.getFullYear();
    const mes = hoy.getMonth() - nac.getMonth();
    if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad;
  };

  const docDefinition: any = {
    pageSize: 'A4',
    pageMargins: [20, 20, 20, 20],
    content: [
      // Sin logo
      { text: 'PLANILLA DE SOLICITUD DE INSCRIPCIÓN', style: 'title' },
      { text: 'U.E. José Antonio Abreu - Naguanagua', style: 'subtitle' },
      { text: `N° de Planilla: ${planillaNumber}    |    Fecha: ${new Date().toLocaleDateString()}`, style: 'date' },
      { text: '\n' },
      {
        layout: 'noBorders',
        table: {
          widths: ['*', '*'],
          body: [
            [
              {
                stack: [
                  { text: '1. DATOS DEL REPRESENTANTE', style: 'sectionHeader' },
                  { text: `Nombre y Apellido: ${data.representativeData.fullName}` },
                  { text: `Cédula de Identidad: ${data.representativeData.identityCard}` },
                  { text: `Dirección: ${data.representativeData.address}` },
                  { text: `Teléfono: ${data.representativeData.phone}` },
                  { text: `Relación con el estudiante: ${data.representativeData.relationship}` },
                  { text: `Nombre del Padre/Madre: ${data.representativeData.parentName || '-'}` },
                  { text: `Cédula Padre/Madre: ${data.representativeData.parentIdentityCard || '-'}` },
                  { text: `Teléfono Padre/Madre: ${data.representativeData.parentPhone || '-'}` },
                ],
                margin: [0, 0, 5, 0],
              },
              {
                stack: [
                  { text: '2. DATOS DE LOS SOLICITANTES', style: 'sectionHeader' },
                  ...data.studentsData.map((est: any, idx: number) => ({
                    stack: [
                      { text: `Solicitante ${idx + 1}`, style: 'studentTitle' },
                      { text: `Nombre: ${est.fullName}` },
                      { text: `Edad: ${calcEdad(est.birthDate)}` },
                      { text: `Fecha Nac.: ${est.birthDate}` },
                      { text: `Nacionalidad: ${est.nationality}` },
                      { text: `País Nac.: ${est.birthCountry}` },
                      { text: `Estado: ${est.state}` },
                      { text: `Zona donde vive: ${est.zone}` },
                      { text: `Municipio: ${est.municipality || '-'}` },
                      { text: `Escuela de procedencia: ${est.previousSchool || '-'}` },
                      { text: `Año que aspira: ${est.currentGrade || est.aspiredGrade || 'En asignar'}` },
                      { text: `Dirección: ${est.addressDescription}` },
                      { text: `Teléfono: ${est.phone || '-'}` },
                      { text: `Emergencia: ${est.emergencyContact}` },
                      { text: `Tel. Emerg.: ${est.emergencyPhone}` },
                      { text: `Alergias: ${est.hasAllergies ? est.allergiesDescription : 'No'}` },
                      { text: `Enfermedades: ${est.hasDiseases ? est.diseasesDescription : 'No'}` },
                    ],
                    margin: [0, 0, 0, 8],
                  })),
                ],
              },
            ],
          ],
        },
      },
      { text: '\n' },
      { text: 'Para uso del representante:', style: 'bold' },
      {
        layout: 'noBorders',
        table: {
          widths: ['*', '*', '*', '*'],
          body: [
            [
              '_________________\nFirma del Representante',
              '_________________\nFirma de quien recibe',
              '_________________\nSello',
              'Fecha y hora: ________\n(Uso interno)',
            ],
          ],
        },
      },
      { text: '\n' },
      {
        text: 'Nota: Esta planilla es solo una solicitud de preinscripción, no asegura ni garantiza un cupo definitivo. La aprobación está sujeta a disponibilidad y evaluación de la U.E. José Antonio Abreu.',
        style: 'note',
      },
    ],
    styles: {
      title: { fontSize: 14, bold: true, alignment: 'center', margin: [0, 5, 0, 0] },
      subtitle: { fontSize: 10, alignment: 'center', margin: [0, 0, 0, 5] },
      date: { fontSize: 9, alignment: 'center', margin: [0, 0, 0, 10] },
      sectionHeader: { fontSize: 11, bold: true, decoration: 'underline', margin: [0, 0, 0, 4] },
      studentTitle: { fontSize: 10, bold: true, margin: [0, 4, 0, 2] },
      note: { fontSize: 8, alignment: 'center', color: 'red', margin: [0, 10, 0, 0] },
      bold: { bold: true, fontSize: 9 },
    },
    defaultStyle: { fontSize: 8, lineHeight: 1.15 },
  };

  return new Promise((resolve, reject) => {
    pdfMake.createPdf(docDefinition).getBuffer((buffer: Buffer) => {
      resolve(buffer);
    });
  });
}

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
        studentsData
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
            admissionDate: new Date(),
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

      // 9. Generar PDF de la planilla
            const pdfBuffer = await generatePlanillaPDFBuffer(
        req.body,
        planillaNumber,
        (fecha: string) => {
          if (!fecha) return '';
          const hoy = new Date();
          const nac = new Date(fecha);
          let edad = hoy.getFullYear() - nac.getFullYear();
          const mes = hoy.getMonth() - nac.getMonth();
          if (mes < 0 || (mes === 0 && hoy.getDate() < nac.getDate())) edad--;
          return edad;
        }
      );
            console.log(`📄 PDF generado, tamaño: ${pdfBuffer.length} bytes`);
      console.log(`📄 Primeros 50 caracteres: ${pdfBuffer.toString('utf8', 0, 50)}`);

      // 10. Guardar registro de la planilla (con el PDF)
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

      // 12. Enviar correo con código y PDF adjunto
      try {
        await sendVerificationEmail(usermail, verificationCode, pdfBuffer);
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
}