import type { Request, Response } from "express";
import Teacher from "../database/models/teacher";
import Subject from "../database/models/subject";
import Schedule from "../database/models/Schedule";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import sequelize from "../database/config";
import { Op } from "sequelize";

export class TeacherController {
  
  // Crear docente
  static addTeacher = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const teacherData = req.body;

      // Validaciones básicas
      if (!teacherData.fullName || !teacherData.identityCard || !teacherData.email) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['Nombre completo, cédula y email son requeridos'] 
        });
      }

      // Verificar si la cédula ya existe
      const existingByIdentity = await Teacher.findOne({ 
        where: { identityCard: teacherData.identityCard },
        transaction
      });
      
      if (existingByIdentity) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: [`La cédula ${teacherData.identityCard} ya está registrada`] 
        });
      }

      // Verificar si el email ya existe
      const existingByEmail = await Teacher.findOne({ 
        where: { email: teacherData.email },
        transaction
      });
      
      if (existingByEmail) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: [`El email ${teacherData.email} ya está registrado`] 
        });
      }

      // Crear docente
      const newTeacher = await Teacher.create(teacherData, { transaction });
      await transaction.commit();

      res.status(200).json({ 
        result: true, 
        content: {
          message: 'Docente creado exitosamente',
          teacherId: newTeacher.id,
          teacherName: newTeacher.fullName
        }, 
        error: [] 
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("addTeacher"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al crear docente: ${error.message}`] 
      });
    }
  };

  // Listar docentes paginados
  static getPaginatedTeachers = async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string, 10) || 1;
      const limit = parseInt(req.query.limit as string, 10) || 10;
      const search = (req.query.search as string) || '';
      const offset = (page - 1) * limit;

      const whereClause: any = {};
      
      if (search) {
        whereClause[Op.or] = [
          { fullName: { [Op.iLike]: `%${search}%` } },
          { identityCard: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { specialization: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await Teacher.findAndCountAll({
        where: whereClause,
        limit,
        offset,
        order: [['fullName', 'ASC']],
        attributes: ['id', 'fullName', 'identityCard', 'email', 'phone', 'status', 'specialization', 'createdAt']
      });

      res.status(200).json({
        result: true,
        content: rows,
        pagination: {
          totalRecords: count,
          currentPage: page,
          totalPages: Math.ceil(count / limit),
        },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getPaginatedTeachers"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener docentes'] 
      });
    }
  };

  // Obtener docente por ID
  static getTeacherById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const teacher = await Teacher.findByPk(id, {
        include: [{
          model: Subject,
          as: 'subjects',
          attributes: ['id', 'name', 'code', 'subjectType']
        }]
      });

      if (!teacher) {
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Docente no encontrado'] 
        });
      }

      res.status(200).json({
        result: true,
        content: teacher,
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getTeacherById"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener docente'] 
      });
    }
  };

  // Actualizar docente
  static updateTeacher = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id, ...updateData } = req.body;
      const teacher = await Teacher.findByPk(id, { transaction });
      
      if (!teacher) {
        await transaction.rollback();
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Docente no encontrado'] 
        });
      }

      // Si se actualiza la cédula, verificar que no exista
      if (updateData.identityCard && updateData.identityCard !== teacher.identityCard) {
        const existing = await Teacher.findOne({
          where: { identityCard: updateData.identityCard },
          transaction
        });
        
        if (existing) {
          await transaction.rollback();
          return res.status(400).json({ 
            result: false, 
            content: [], 
            error: [`La cédula ${updateData.identityCard} ya está registrada`] 
          });
        }
      }

      // Si se actualiza el email, verificar que no exista
      if (updateData.email && updateData.email !== teacher.email) {
        const existing = await Teacher.findOne({
          where: { email: updateData.email },
          transaction
        });
        
        if (existing) {
          await transaction.rollback();
          return res.status(400).json({ 
            result: false, 
            content: [], 
            error: [`El email ${updateData.email} ya está registrado`] 
          });
        }
      }

      await teacher.update(updateData, { transaction });
      await transaction.commit();

      res.status(200).json({ 
        result: true, 
        content: ['Docente actualizado exitosamente'], 
        error: [] 
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("updateTeacher"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al actualizar docente: ${error.message}`] 
      });
    }
  };

  // Eliminar docente con validaciones
  static deleteTeacher = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.body;
      const teacher = await Teacher.findByPk(id, {
        include: [
          {
            model: Subject,
            as: 'subjects',
            required: false,
            include: [{
              model: Schedule,
              as: 'schedules',
              required: false,
              where: { 
                day: { [Op.in]: ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'] }
              }
            }]
          }
        ],
        transaction
      });
      
      if (!teacher) {
        await transaction.rollback();
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Docente no encontrado'] 
        });
      }

      // Validar si el docente tiene materias asignadas
      if (teacher.subjects && teacher.subjects.length > 0) {
        let activeSubjects = 0;
        
        // Verificar si alguna materia tiene horarios activos
        teacher.subjects.forEach(subject => {
          if (subject.schedules && subject.schedules.length > 0) {
            activeSubjects++;
          }
        });

        if (activeSubjects > 0) {
          await transaction.rollback();
          return res.status(400).json({ 
            result: false, 
            content: [], 
            error: [`No se puede eliminar el docente ${teacher.fullName} porque tiene ${activeSubjects} materia(s) con horarios activos asignados`] 
          });
        }
      }

      await teacher.destroy({ transaction });
      await transaction.commit();

      res.status(200).json({ 
        result: true, 
        content: [`Docente ${teacher.fullName} eliminado exitosamente`], 
        error: [] 
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("deleteTeacher"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al eliminar docente: ${error.message}`] 
      });
    }
  };

  // Obtener docentes activos para select
  static getActiveTeachers = async (req: Request, res: Response) => {
    try {
      const teachers = await Teacher.findAll({
        where: { status: true },
        attributes: ['id', 'fullName', 'specialization'],
        order: [['fullName', 'ASC']]
      });

      res.status(200).json({
        result: true,
        content: teachers,
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getActiveTeachers"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener docentes activos'] 
      });
    }
  };
}