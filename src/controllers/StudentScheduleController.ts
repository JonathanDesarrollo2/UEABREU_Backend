// src/controllers/StudentScheduleController.ts
import type { Request, Response } from "express";
import { Op, WhereOptions } from 'sequelize';
import StudentSchedule from "../database/models/StudentSchedule";
import Student from "../database/models/student";
import Schedule from "../database/models/Schedule";
import Subject from "../database/models/subject";
import Teacher from "../database/models/teacher";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import sequelize from "../database/config";

export class StudentScheduleController {
  // Obtener todas las asignaciones estudiante-horario
  static getStudentSchedules = async (req: Request, res: Response) => {
    try {
      const { studentId, scheduleId, scheduleType, grade, section } = req.query;

      const whereOptions: WhereOptions<any> = {};

      if (studentId) whereOptions.studentId = studentId;
      if (scheduleId) whereOptions.scheduleId = scheduleId;
      if (scheduleType) whereOptions.scheduleType = scheduleType;

      // Incluir filtros por grado y sección a través del horario
      const includeOptions: any[] = [
        {
          model: Schedule,
          as: 'schedule',
          include: [
            {
              model: Subject,
              as: 'subject',
              include: [{
                model: Teacher,
                as: 'teacher',
                attributes: ['id', 'fullName', 'email']
              }]
            },
            {
              model: Teacher,
              as: 'teacher',
              attributes: ['id', 'fullName', 'email']
            }
          ]
        },
        {
          model: Student,
          as: 'student',
          attributes: ['id', 'fullName', 'currentGrade', 'section']
        }
      ];

      // Aplicar filtros adicionales al schedule si se proporcionan
      if (grade || section) {
        const scheduleWhere: WhereOptions<any> = {};
        if (grade) scheduleWhere.grade = grade;
        if (section) scheduleWhere.section = section;
        
        includeOptions[0].where = scheduleWhere;
      }

      const studentSchedules = await StudentSchedule.findAll({
        where: whereOptions,
        include: includeOptions,
        order: [
          [{ model: Student, as: 'student' }, 'fullName', 'ASC'],
          [{ model: Schedule, as: 'schedule' }, 'day', 'ASC'],
          [{ model: Schedule, as: 'schedule' }, 'startBlock', 'ASC']
        ]
      });

      const formattedSchedules = studentSchedules.map(ss => ({
        id: ss.id,
        studentId: ss.studentId,
        studentName: ss.student?.fullName,
        studentGrade: ss.student?.currentGrade,
        studentSection: ss.student?.section,
        scheduleId: ss.scheduleId,
        scheduleCode: ss.schedule?.code,
        day: ss.schedule?.day,
        startBlock: ss.schedule?.startBlock,
        endBlock: ss.schedule?.endBlock,
        timeRange: this.getTimeRange(ss.schedule?.startBlock, ss.schedule?.endBlock),
        subject: ss.schedule?.subject?.name,
        subjectCode: ss.schedule?.subject?.code,
        teacher: ss.schedule?.teacher?.fullName || ss.schedule?.subject?.teacher?.fullName,
        classroom: ss.schedule?.classroom,
        scheduleType: ss.scheduleType,
        comment1: ss.comment1,
        comment2: ss.comment2,
        comment3: ss.comment3,
        assignedAt: ss.assignedAt
      }));

      res.status(200).json({
        result: true,
        content: formattedSchedules,
        error: []
      });

    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getStudentSchedules"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al obtener asignaciones: ${error.message}`] 
      });
    }
  };

  // Obtener asignación por ID
  static getStudentScheduleById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const studentSchedule = await StudentSchedule.findByPk(id, {
        include: [
          {
            model: Schedule,
            as: 'schedule',
            include: [
              {
                model: Subject,
                as: 'subject',
                include: [{
                  model: Teacher,
                  as: 'teacher',
                  attributes: ['id', 'fullName', 'email']
                }]
              },
              {
                model: Teacher,
                as: 'teacher',
                attributes: ['id', 'fullName', 'email']
              }
            ]
          },
          {
            model: Student,
            as: 'student',
            attributes: ['id', 'fullName', 'currentGrade', 'section']
          }
        ]
      });

      if (!studentSchedule) {
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Asignación no encontrada'] 
        });
      }

      res.status(200).json({
        result: true,
        content: studentSchedule,
        error: []
      });

    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getStudentScheduleById"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al obtener asignación: ${error.message}`] 
      });
    }
  };

  // Obtener horarios por estudiante
  static getStudentSchedulesByStudent = async (req: Request, res: Response) => {
    try {
      const { studentId } = req.params;

      const studentSchedules = await StudentSchedule.findAll({
        where: { studentId },
        include: [
          {
            model: Schedule,
            as: 'schedule',
            include: [
              {
                model: Subject,
                as: 'subject',
                include: [{
                  model: Teacher,
                  as: 'teacher',
                  attributes: ['id', 'fullName', 'email']
                }]
              },
              {
                model: Teacher,
                as: 'teacher',
                attributes: ['id', 'fullName', 'email']
              }
            ]
          }
        ],
        order: [
          [{ model: Schedule, as: 'schedule' }, 'day', 'ASC'],
          [{ model: Schedule, as: 'schedule' }, 'startBlock', 'ASC']
        ]
      });

      const formattedSchedules = studentSchedules.map(ss => ({
        id: ss.id,
        scheduleId: ss.scheduleId,
        scheduleCode: ss.schedule?.code,
        day: ss.schedule?.day,
        startBlock: ss.schedule?.startBlock,
        endBlock: ss.schedule?.endBlock,
        timeRange: this.getTimeRange(ss.schedule?.startBlock, ss.schedule?.endBlock),
        subject: ss.schedule?.subject?.name,
        subjectCode: ss.schedule?.subject?.code,
        teacher: ss.schedule?.teacher?.fullName || ss.schedule?.subject?.teacher?.fullName,
        classroom: ss.schedule?.classroom,
        scheduleType: ss.scheduleType,
        comment1: ss.comment1,
        comment2: ss.comment2,
        comment3: ss.comment3,
        assignedAt: ss.assignedAt
      }));

      res.status(200).json({
        result: true,
        content: formattedSchedules,
        error: []
      });

    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getStudentSchedulesByStudent"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al obtener horarios del estudiante: ${error.message}`] 
      });
    }
  };

  // Actualizar asignación
  static updateStudentSchedule = async (req: Request, res: Response) => {
    try {
      const { id, scheduleType, comment1, comment2, comment3 } = req.body;

      if (!id) {
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['ID de asignación requerido'] 
        });
      }

      const assignment = await StudentSchedule.findByPk(id);
      if (!assignment) {
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Asignación no encontrada'] 
        });
      }

      await assignment.update({
        scheduleType,
        comment1,
        comment2,
        comment3
      });

      res.status(200).json({
        result: true,
        content: ['Asignación actualizada exitosamente'],
        error: []
      });

    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("updateStudentSchedule"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al actualizar asignación: ${error.message}`] 
      });
    }
  };

  // Eliminar asignación
  static deleteStudentSchedule = async (req: Request, res: Response) => {
    try {
      const { id } = req.body;

      if (!id) {
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['ID de asignación requerido'] 
        });
      }

      const assignment = await StudentSchedule.findByPk(id);
      if (!assignment) {
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Asignación no encontrada'] 
        });
      }

      await assignment.destroy();

      res.status(200).json({
        result: true,
        content: ['Asignación eliminada exitosamente'],
        error: []
      });

    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("deleteStudentSchedule"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al eliminar asignación: ${error.message}`] 
      });
    }
  };

  // Asignar múltiples estudiantes a un horario - CORREGIDO
  static assignMultipleStudents = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { scheduleId, studentIds, scheduleType, comment1, comment2, comment3 } = req.body;

      if (!scheduleId || !studentIds || !Array.isArray(studentIds)) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['scheduleId y studentIds (array) son requeridos'] 
        });
      }

      // Verificar que el horario exista
      const schedule = await Schedule.findByPk(scheduleId, { transaction });
      if (!schedule) {
        await transaction.rollback();
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Horario no encontrado'] 
        });
      }

      // Definir tipos para los resultados
      type SuccessResult = { studentId: string, studentName?: string, assignmentId?: string };
      type FailedResult = { studentId: string, studentName?: string, error?: string };
      type AlreadyAssignedResult = { studentId: string, studentName?: string };

      const results: {
        success: SuccessResult[],
        failed: FailedResult[],
        alreadyAssigned: AlreadyAssignedResult[]
      } = {
        success: [],
        failed: [],
        alreadyAssigned: []
      };

      // Procesar cada estudiante
      for (const studentId of studentIds) {
        try {
          // Verificar que el estudiante exista
          const student = await Student.findByPk(studentId, { transaction });
          if (!student) {
            results.failed.push({ studentId, error: 'Estudiante no encontrado' });
            continue;
          }

          // Verificar si ya está asignado
          const existingAssignment = await StudentSchedule.findOne({
            where: { studentId, scheduleId },
            transaction
          });

          if (existingAssignment) {
            results.alreadyAssigned.push({ 
              studentId, 
              studentName: student.fullName 
            });
            continue;
          }

          // Verificar conflicto de horario
          const conflictingSchedule = await StudentSchedule.findOne({
            where: {
              studentId,
              '$schedule.day$': schedule.day,
              '$schedule.startBlock$': { [Op.lte]: schedule.endBlock },
              '$schedule.endBlock$': { [Op.gte]: schedule.startBlock }
            },
            include: [{
              model: Schedule,
              as: 'schedule',
              required: true
            }],
            transaction
          });

          if (conflictingSchedule) {
            results.failed.push({ 
              studentId, 
              studentName: student.fullName,
              error: 'Conflicto de horario' 
            });
            continue;
          }

          // Crear asignación
          const assignment = await StudentSchedule.create({
            studentId,
            scheduleId,
            scheduleType: scheduleType || 'regular',
            comment1,
            comment2,
            comment3,
            assignedAt: new Date()
          }, { transaction });

          results.success.push({
            studentId,
            studentName: student.fullName,
            assignmentId: assignment.id
          });

        } catch (error: any) {
          results.failed.push({ 
            studentId, 
            error: error.message 
          });
        }
      }

      await transaction.commit();

      res.status(200).json({ 
        result: true, 
        content: {
          message: 'Asignación de estudiantes completada',
          summary: {
            total: studentIds.length,
            success: results.success.length,
            failed: results.failed.length,
            alreadyAssigned: results.alreadyAssigned.length
          },
          details: results
        }, 
        error: [] 
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("assignMultipleStudents"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al asignar estudiantes: ${error.message}`] 
      });
    }
  };

  // Método auxiliar para formatear rango de tiempo
  private static getTimeRange(startBlock?: number, endBlock?: number): string {
    if (!startBlock || !endBlock) return '';

    const blockTimes: Record<number, string> = {
      1: '7:00 - 7:40',
      2: '7:40 - 8:20',
      3: '8:20 - 9:00',
      4: '9:00 - 9:40',
      5: '10:00 - 10:40',
      6: '10:40 - 11:20',
      7: '11:20 - 12:00',
      8: '12:00 - 12:40',
      9: '12:40 - 13:20'
    };

    const startTime = blockTimes[startBlock]?.split(' - ')[0];
    const endTime = blockTimes[endBlock]?.split(' - ')[1];
    
    return startTime && endTime ? `${startTime} - ${endTime}` : '';
  }
}