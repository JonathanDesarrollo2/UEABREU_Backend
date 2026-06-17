import { Request, Response } from "express";
import sequelize from "../database/config";
import RegistrationApplication from "../database/models/RegistrationAplicattion";
import UserLogin from "../database/models/userlogin";
import Representative from "../database/models/representative";
import Student from "../database/models/student";
const pdfParse = require('pdf-parse');
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import { Op } from "sequelize";

export class RegistrationManagementController {

  // Listar todas las solicitudes de inscripción
 static listApplications = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';
    const offset = (page - 1) * limit;

    const where: any = {};
    if (search) {
      const orConditions: any[] = [
        { '$representative.fullName$': { [Op.iLike]: `%${search}%` } },
        { '$user.usermail$': { [Op.iLike]: `%${search}%` } },
      ];
      // Si el texto es un número, también buscamos por planillaNumber
      if (!isNaN(Number(search))) {
        orConditions.push({ planillaNumber: Number(search) });
      }
      where[Op.or] = orConditions;
    }

    const { count, rows: applications } = await RegistrationApplication.findAndCountAll({
      where,
      attributes: ["id", "planillaNumber", "createdAt", "userId", "representativeId"],
      include: [
        {
          model: UserLogin,
          attributes: ["usermail", "userstatus"],
        },
        {
          model: Representative,
          attributes: ["fullName"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true, // importante cuando hay includes
    });

    const result = applications.map((app) => ({
      id: app.id,
      planillaNumber: app.planillaNumber,
      email: app.user?.usermail,
      representativeName: app.representative?.fullName,
      userActive: app.user?.userstatus ?? false,
      createdAt: app.createdAt,
    }));

    res.status(200).json({
      result: true,
      content: result,
      pagination: {
        totalRecords: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
      },
      error: [],
    });
  } catch (error: any) {
    ErrorLog.createErrorLog(error, 'Server', getErrorLocation("listApplications"));
    res.status(500).json({ result: false, content: [], error: ["Error al obtener solicitudes"] });
  }
};

  // Descargar el PDF almacenado
  static downloadPdf = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const application = await RegistrationApplication.findByPk(id, {
      attributes: ["pdfDocument", "planillaNumber"],
    });

    if (!application || !application.pdfDocument) {
      res.status(404).json({ result: false, content: [], error: ["PDF no encontrado"] });
      return;
    }

    // Log de diagnóstico (añadido)
    console.log(`📄 Enviando PDF planilla ${application.planillaNumber}, tamaño: ${application.pdfDocument.length} bytes`);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=Planilla_${application.planillaNumber}.pdf`);
    res.send(application.pdfDocument);
  } catch (error: any) {
    ErrorLog.createErrorLog(error, 'Server', getErrorLocation("downloadPdf"));
    res.status(500).json({ result: false, content: [], error: ["Error al descargar el PDF"] });
  }
};

  // Activar cuenta (admitir solicitud)
  static activateApplication = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const application = await RegistrationApplication.findByPk(id, {
        include: [UserLogin],
        transaction,
      });

      if (!application || !application.user) {
        await transaction.rollback();
        res.status(404).json({ result: false, content: [], error: ["Solicitud no encontrada"] });
        return;
      }

      // Activar el usuario
      application.user.userstatus = true;
      await application.user.save({ transaction });

      // Opcional: Cambiar el estado de los estudiantes a 'regular'
      await Student.update(
        { status: "regular" },
        { where: { userId: application.userId }, transaction }
      );

      await transaction.commit();

      res.status(200).json({
        result: true,
        content: [`Cuenta activada correctamente. Planilla N° ${application.planillaNumber}`],
        error: [],
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("activateApplication"));
      res.status(500).json({ result: false, content: [], error: ["Error al activar la cuenta"] });
    }
  };

  // Eliminar completamente el registro
  // Reemplaza el método deleteApplication en RegistrationManagementController.ts
static deleteApplication = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const application = await RegistrationApplication.findByPk(id, { transaction });

    if (!application) {
      await transaction.rollback();
      res.status(404).json({ result: false, content: [], error: ["Solicitud no encontrada"] });
      return;
    }

    // Orden correcto para respetar claves foráneas:
    // 1. Estudiantes (referencian a Representative y UserLogin)
    await Student.destroy({ where: { userId: application.userId }, transaction });

    // 2. La propia solicitud (referencia a Representative y UserLogin)
    await application.destroy({ transaction });

    // 3. Representante (referencia a UserLogin)
    await Representative.destroy({ where: { userId: application.userId }, transaction });

    // 4. Usuario
    await UserLogin.destroy({ where: { id: application.userId }, transaction });

    await transaction.commit();

    res.status(200).json({
      result: true,
      content: [`Registro de la planilla N° ${application.planillaNumber} eliminado completamente.`],
      error: [],
    });
  } catch (error: any) {
    await transaction.rollback();
    // Log detallado para depuración
    console.error('Error al eliminar registro:', error);
    ErrorLog.createErrorLog(error, 'Server', getErrorLocation("deleteApplication"));
    res.status(500).json({ result: false, content: [], error: ["Error al eliminar el registro"] });
  }
};
static async diagnosticText(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const application = await RegistrationApplication.findByPk(id, {
      attributes: ['pdfDocument', 'planillaNumber'],
    });

    if (!application || !application.pdfDocument) {
      res.status(404).json({ result: false, content: [], error: ['PDF no encontrado'] });
      return;
    }

    // Extraer el texto del PDF
    const data = await pdfParse(application.pdfDocument);

    res.status(200).json({
      result: true,
      content: {
        text: data.text,           // aquí verás los datos
        info: data.info,
      },
      error: [],
    });
  } catch (error: any) {
    res.status(500).json({ result: false, content: [], error: [error.message] });
  }
}
static async getApplicationData(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const application = await RegistrationApplication.findByPk(id, {
      include: [
        {
          model: Representative,
          include: [{ model: Student, as: 'students' }]
        },
        { model: UserLogin }
      ]
    });

    if (!application) {
      res.status(404).json({ result: false, content: [], error: ["Solicitud no encontrada"] });
      return;
    }

    const rep = application.representative;
    if (!rep) {
      res.status(404).json({ result: false, content: [], error: ["Representante no encontrado"] });
      return;
    }

    const data = {
      representativeFullName: rep.fullName,
      representativeIdentityCard: rep.identityCard,
      representativeAddress: rep.address,
      representativePhone: rep.phone,
      relationship: rep.relationship,
      parentName: rep.parentName,
      parentIdentityCard: rep.parentIdentityCard,
      parentPhone: rep.parentPhone,
      students: (rep.students || []).map(st => ({
        fullName: st.fullName,
        identityCard: st.identityCard,
        birthDate: st.birthDate ? new Date(st.birthDate).toISOString().substring(0, 10) : '',
        nationality: st.nationality,
        birthCountry: st.birthCountry,
        state: st.state,
        zone: st.zone,
        addressDescription: st.addressDescription,
        phone: st.phone || '',
        emergencyContact: st.emergencyContact,
        emergencyPhone: st.emergencyPhone,
        hasAllergies: st.hasAllergies,
        allergiesDescription: st.allergiesDescription || '',
        hasDiseases: st.hasDiseases,
        diseasesDescription: st.diseasesDescription || '',
        previousSchool: st.previousSchool || '',
        municipality: st.municipality || '',
        aspiredGrade: st.currentGrade || 'En asignar',
      })),
      email: application.user?.usermail || '',
      planillaNumber: application.planillaNumber,
    };

    res.status(200).json({ result: true, content: data, error: [] });
  } catch (error: any) {
    ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getApplicationData"));
    res.status(500).json({ result: false, content: [], error: ["Error al obtener datos de la solicitud"] });
  }
}
}