import type { Request, Response } from "express";
import Subject from "../database/models/subject";
import Teacher from "../database/models/teacher";
import Schedule from "../database/models/Schedule";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import sequelize from "../database/config";
import { Op } from "sequelize";

export class SubjectController {
  
  // Crear materia
  static addSubject = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const subjectData = req.body;

      // Validaciones básicas
      if (!subjectData.name || !subjectData.code) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['Nombre y código son requeridos'] 
        });
      }

      // Verificar si el código ya existe
      const existingSubject = await Subject.findOne({ 
        where: { code: subjectData.code },
        transaction
      });
      
      if (existingSubject) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: [`El código ${subjectData.code} ya está registrado`] 
        });
      }

      // Verificar si el docente existe (si se proporciona)
      if (subjectData.teacherId) {
        const teacher = await Teacher.findByPk(subjectData.teacherId, { transaction });
        if (!teacher) {
          await transaction.rollback();
          return res.status(404).json({ 
            result: false, 
            content: [], 
            error: ['Docente no encontrado'] 
          });
        }
      }

      // Crear materia
      const newSubject = await Subject.create(subjectData, { transaction });
      await transaction.commit();

      res.status(200).json({ 
        result: true, 
        content: {
          message: 'Materia creada exitosamente',
          subjectId: newSubject.id,
          subjectName: newSubject.name,
          code: newSubject.code
        }, 
        error: [] 
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("addSubject"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al crear materia: ${error.message}`] 
      });
    }
  };

  // Listar materias con filtros
  static getSubjects = async (req: Request, res: Response) => {
    try {
      const { grade, subjectType, teacherId, search } = req.query;
      const where: any = {};

      // Aplicar filtros
      if (grade) {
        // El código contiene el grado (ej: "1ro.Biologia")
        where.code = { [Op.iLike]: `${grade}%` };
      }
      
      if (subjectType) {
        where.subjectType = subjectType;
      }
      
      if (teacherId) {
        where.teacherId = teacherId;
      }

      if (search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { code: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const subjects = await Subject.findAll({
        where,
        include: [{
          model: Teacher,
          as: 'teacher',
          attributes: ['id', 'fullName', 'email']
        }],
        order: [['code', 'ASC']]
      });

      res.status(200).json({
        result: true,
        content: subjects,
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getSubjects"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener materias'] 
      });
    }
  };

  // Obtener materia por ID
  static getSubjectById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const subject = await Subject.findByPk(id, {
        include: [{
          model: Teacher,
          as: 'teacher',
          attributes: ['id', 'fullName', 'email']
        }]
      });

      if (!subject) {
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Materia no encontrada'] 
        });
      }

      res.status(200).json({
        result: true,
        content: subject,
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getSubjectById"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener materia'] 
      });
    }
  };

  // Actualizar materia
  static updateSubject = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id, ...updateData } = req.body;
      const subject = await Subject.findByPk(id, { transaction });
      
      if (!subject) {
        await transaction.rollback();
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Materia no encontrada'] 
        });
      }

      // Si se actualiza el código, verificar que no exista
      if (updateData.code && updateData.code !== subject.code) {
        const existing = await Subject.findOne({
          where: { code: updateData.code },
          transaction
        });
        
        if (existing) {
          await transaction.rollback();
          return res.status(400).json({ 
            result: false, 
            content: [], 
            error: [`El código ${updateData.code} ya está registrado`] 
          });
        }
      }

      // Verificar si el docente existe (si se proporciona)
      if (updateData.teacherId && updateData.teacherId !== subject.teacherId) {
        const teacher = await Teacher.findByPk(updateData.teacherId, { transaction });
        if (!teacher) {
          await transaction.rollback();
          return res.status(404).json({ 
            result: false, 
            content: [], 
            error: ['Docente no encontrado'] 
          });
        }
      }

      await subject.update(updateData, { transaction });
      await transaction.commit();

      res.status(200).json({ 
        result: true, 
        content: ['Materia actualizada exitosamente'], 
        error: [] 
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("updateSubject"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al actualizar materia: ${error.message}`] 
      });
    }
  };

  // Eliminar materia con validaciones
  static deleteSubject = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.body;
      const subject = await Subject.findByPk(id, {
        include: [{
          model: Schedule,
          as: 'schedules',
          required: false
        }],
        transaction
      });
      
      if (!subject) {
        await transaction.rollback();
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Materia no encontrada'] 
        });
      }

      // Validar si la materia tiene horarios asignados
      if (subject.schedules && subject.schedules.length > 0) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: [`No se puede eliminar la materia ${subject.name} porque tiene ${subject.schedules.length} horario(s) asignado(s)`] 
        });
      }

      await subject.destroy({ transaction });
      await transaction.commit();

      res.status(200).json({ 
        result: true, 
        content: [`Materia ${subject.name} eliminada exitosamente`], 
        error: [] 
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("deleteSubject"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al eliminar materia: ${error.message}`] 
      });
    }
  };

  // Obtener materias por grado
  static getSubjectsByGrade = async (req: Request, res: Response) => {
    try {
      const { grade } = req.params;
      
      const subjects = await Subject.findAll({
        where: {
          code: { [Op.iLike]: `${grade}%` }
        },
        include: [{
          model: Teacher,
          as: 'teacher',
          attributes: ['id', 'fullName']
        }],
        order: [['name', 'ASC']]
      });

      res.status(200).json({
        result: true,
        content: subjects,
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getSubjectsByGrade"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener materias'] 
      });
    }
  };
}