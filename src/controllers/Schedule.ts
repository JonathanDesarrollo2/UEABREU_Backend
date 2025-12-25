import type { Request, Response } from "express";
import Schedule from "../database/models/Schedule";
import Subject from "../database/models/subject";
import Teacher from "../database/models/teacher";
import StudentSchedule from "../database/models/StudentSchedule";
import Student from "../database/models/student";
import Representative from "../database/models/representative";
import UserLogin from "../database/models/userlogin";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo";
import sequelize from "../database/config";
import { Op } from "sequelize";

export class ScheduleController {
  
  // Crear horario
  static addSchedule = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const scheduleData = req.body;

      // Validaciones básicas
      if (!scheduleData.code || !scheduleData.grade || !scheduleData.section || 
          !scheduleData.day || !scheduleData.subjectId) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['Código, grado, sección, día y materia son requeridos'] 
        });
      }

      // Validar que el código tenga 7 dígitos
      if (scheduleData.code.length !== 7) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['El código debe tener exactamente 7 dígitos'] 
        });
      }

      // Verificar si el código ya existe
      const existingSchedule = await Schedule.findOne({ 
        where: { code: scheduleData.code },
        transaction
      });
      
      if (existingSchedule) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: [`El código ${scheduleData.code} ya está registrado`] 
        });
      }

      // Verificar que la materia exista
      const subject = await Subject.findByPk(scheduleData.subjectId, { transaction });
      if (!subject) {
        await transaction.rollback();
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Materia no encontrada'] 
        });
      }

      // Verificar que el docente exista (si se proporciona)
      if (scheduleData.teacherId) {
        const teacher = await Teacher.findByPk(scheduleData.teacherId, { transaction });
        if (!teacher) {
          await transaction.rollback();
          return res.status(404).json({ 
            result: false, 
            content: [], 
            error: ['Docente no encontrado'] 
          });
        }
      }

      // Validar bloques (deben ser consecutivos y entre 1-9)
      if (!scheduleData.startBlock || scheduleData.startBlock < 1 || scheduleData.startBlock > 9) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['El bloque inicial debe estar entre 1 y 9'] 
        });
      }

      // Calcular bloque final si no se proporciona (siempre ocupa 2 bloques)
      if (!scheduleData.endBlock) {
        scheduleData.endBlock = scheduleData.startBlock + 1;
      }

      // Validar que el bloque final sea válido
      if (scheduleData.endBlock > 9) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['El bloque final no puede ser mayor a 9'] 
        });
      }

      // Verificar que no haya superposición de horarios en el mismo grado, sección y día
      const overlappingSchedule = await Schedule.findOne({
        where: {
          grade: scheduleData.grade,
          section: scheduleData.section,
          day: scheduleData.day,
          [Op.or]: [
            {
              startBlock: { [Op.between]: [scheduleData.startBlock, scheduleData.endBlock - 1] }
            },
            {
              endBlock: { [Op.between]: [scheduleData.startBlock + 1, scheduleData.endBlock] }
            }
          ]
        },
        transaction
      });

      if (overlappingSchedule) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['Ya existe un horario en ese bloque para el mismo grado y sección'] 
        });
      }

      // Crear horario
      const newSchedule = await Schedule.create(scheduleData, { transaction });
      await transaction.commit();

      // Obtener información completa del horario creado
      const scheduleWithDetails = await Schedule.findByPk(newSchedule.id, {
        include: [
          {
            model: Subject,
            as: 'subject',
            include: [{ 
              model: Teacher, 
              as: 'teacher',
              attributes: ['id', 'fullName']
            }]
          },
          {
            model: Teacher,
            as: 'teacher',
            attributes: ['id', 'fullName']
          }
        ]
      });

      res.status(200).json({ 
        result: true, 
        content: {
          message: 'Horario creado exitosamente',
          scheduleId: newSchedule.id,
          code: newSchedule.code,
          schedule: scheduleWithDetails
        }, 
        error: [] 
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("addSchedule"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al crear horario: ${error.message}`] 
      });
    }
  };

  // Listar horarios con filtros
  static getSchedules = async (req: Request, res: Response) => {
    try {
      const { grade, section, day, teacherId, subjectId, search } = req.query;
      const where: any = {};

      // Aplicar filtros
      if (grade) {
        where.grade = grade;
      }
      
      if (section) {
        where.section = section;
      }
      
      if (day) {
        where.day = day;
      }
      
      if (teacherId) {
        where.teacherId = teacherId;
      }

      if (subjectId) {
        where.subjectId = subjectId;
      }

      if (search) {
        where[Op.or] = [
          { code: { [Op.iLike]: `%${search}%` } },
          { classroom: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const schedules = await Schedule.findAll({
        where,
        include: [
          {
            model: Subject,
            as: 'subject',
            attributes: ['id', 'name', 'code', 'subjectType']
          },
          {
            model: Teacher,
            as: 'teacher',
            attributes: ['id', 'fullName', 'email']
          },
          {
            model: StudentSchedule,
            as: 'studentSchedules',
            attributes: ['id'],
            include: [{
              model: Student,
              as: 'student',
              attributes: ['id', 'fullName']
            }]
          }
        ],
        order: [
          ['grade', 'ASC'],
          ['section', 'ASC'],
          ['day', 'ASC'],
          ['startBlock', 'ASC']
        ]
      });

      res.status(200).json({
        result: true,
        content: schedules,
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getSchedules"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener horarios'] 
      });
    }
  };

  // Obtener horario por ID
  static getScheduleById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const schedule = await Schedule.findByPk(id, {
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
          },
          {
            model: StudentSchedule,
            as: 'studentSchedules',
            include: [{
              model: Student,
              as: 'student',
              attributes: ['id', 'fullName', 'currentGrade', 'section']
            }]
          }
        ]
      });

      if (!schedule) {
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Horario no encontrado'] 
        });
      }

      res.status(200).json({
        result: true,
        content: schedule,
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getScheduleById"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener horario'] 
      });
    }
  };

  // Actualizar horario
  static updateSchedule = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id, ...updateData } = req.body;
      const schedule = await Schedule.findByPk(id, { transaction });
      
      if (!schedule) {
        await transaction.rollback();
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Horario no encontrado'] 
        });
      }

      // Si se actualiza el código, verificar que no exista
      if (updateData.code && updateData.code !== schedule.code) {
        const existing = await Schedule.findOne({
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

      // Verificar que la materia exista (si se actualiza)
      if (updateData.subjectId) {
        const subject = await Subject.findByPk(updateData.subjectId, { transaction });
        if (!subject) {
          await transaction.rollback();
          return res.status(404).json({ 
            result: false, 
            content: [], 
            error: ['Materia no encontrada'] 
          });
        }
      }

      // Verificar que el docente exista (si se actualiza)
      if (updateData.teacherId) {
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

      // Validar bloques si se actualizan
      if (updateData.startBlock !== undefined || updateData.endBlock !== undefined) {
        const startBlock = updateData.startBlock || schedule.startBlock;
        const endBlock = updateData.endBlock || schedule.endBlock;

        if (startBlock < 1 || startBlock > 9 || endBlock < 1 || endBlock > 9) {
          await transaction.rollback();
          return res.status(400).json({ 
            result: false, 
            content: [], 
            error: ['Los bloques deben estar entre 1 y 9'] 
          });
        }

        // Verificar superposición (excluyendo el propio horario)
        const overlappingSchedule = await Schedule.findOne({
          where: {
            id: { [Op.ne]: id },
            grade: updateData.grade || schedule.grade,
            section: updateData.section || schedule.section,
            day: updateData.day || schedule.day,
            [Op.or]: [
              {
                startBlock: { [Op.between]: [startBlock, endBlock - 1] }
              },
              {
                endBlock: { [Op.between]: [startBlock + 1, endBlock] }
              }
            ]
          },
          transaction
        });

        if (overlappingSchedule) {
          await transaction.rollback();
          return res.status(400).json({ 
            result: false, 
            content: [], 
            error: ['Ya existe un horario en ese bloque para el mismo grado y sección'] 
          });
        }
      }

      await schedule.update(updateData, { transaction });
      await transaction.commit();

      res.status(200).json({ 
        result: true, 
        content: ['Horario actualizado exitosamente'], 
        error: [] 
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("updateSchedule"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al actualizar horario: ${error.message}`] 
      });
    }
  };

  // Eliminar horario con validaciones
  static deleteSchedule = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.body;
      const schedule = await Schedule.findByPk(id, {
        include: [{
          model: StudentSchedule,
          as: 'studentSchedules',
          required: false
        }],
        transaction
      });
      
      if (!schedule) {
        await transaction.rollback();
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Horario no encontrado'] 
        });
      }

      // Validar si el horario tiene estudiantes asignados
      if (schedule.studentSchedules && schedule.studentSchedules.length > 0) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: [`No se puede eliminar el horario ${schedule.code} porque tiene ${schedule.studentSchedules.length} estudiante(s) asignado(s)`] 
        });
      }

      await schedule.destroy({ transaction });
      await transaction.commit();

      res.status(200).json({ 
        result: true, 
        content: [`Horario ${schedule.code} eliminado exitosamente`], 
        error: [] 
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("deleteSchedule"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al eliminar horario: ${error.message}`] 
      });
    }
  };

 static getChildrenSchedules = async (req: Request, res: Response) => {
  try {
    const tokenData = req.tokenData;
    
    if (!tokenData?.id) {
      return res.status(401).json({ 
        result: false, 
        content: [], 
        error: ['Autenticación requerida'] 
      });
    }

    // 1. Buscar el representante asociado al usuario
    const representative = await Representative.findOne({
      where: { userId: tokenData.id },
      include: [{
        model: Student,
        as: 'students',
        attributes: ['id', 'fullName', 'currentGrade', 'section', 'status']
      }]
    });

    if (!representative || !representative.students || representative.students.length === 0) {
      return res.status(200).json({ 
        result: true, 
        content: [], 
        error: [] 
      });
    }

    // 2. Obtener los IDs de los estudiantes (filtrando undefined)
    const studentIds = representative.students
      .map(s => s.id)
      .filter((id): id is string => id !== undefined);

    // 3. Buscar las asociaciones estudiante-horario
    const studentSchedules = await StudentSchedule.findAll({
      where: { studentId: { [Op.in]: studentIds } },
      include: [{
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
      }],
      order: [
        [{ model: Schedule, as: 'schedule' }, 'day', 'ASC'],
        [{ model: Schedule, as: 'schedule' }, 'startBlock', 'ASC']
      ]
    });

    // 4. Organizar los datos por estudiante
    const schedulesByStudent: Record<string, any> = {};
    
    representative.students.forEach(student => {
      if (student.id) {
        schedulesByStudent[student.id] = {
          studentId: student.id,
          studentName: student.fullName,
          grade: student.currentGrade,
          section: student.section,
          schedules: []
        };
      }
    });

    // 5. Agrupar horarios por estudiante
    studentSchedules.forEach(ss => {
      if (ss.schedule && ss.studentId) {
        const scheduleInfo = {
          scheduleId: ss.schedule.id,
          code: ss.schedule.code,
          day: ss.schedule.day,
          startBlock: ss.schedule.startBlock,
          endBlock: ss.schedule.endBlock,
          timeRange: this.getTimeRange(ss.schedule.startBlock, ss.schedule.endBlock),
          subject: ss.schedule.subject?.name,
          subjectCode: ss.schedule.subject?.code,
          teacher: ss.schedule.teacher?.fullName || ss.schedule.subject?.teacher?.fullName,
          classroom: ss.schedule.classroom,
          scheduleType: ss.scheduleType,
          comment1: ss.comment1,
          comment2: ss.comment2,
          comment3: ss.comment3,
          assignedAt: ss.assignedAt
        };

        if (schedulesByStudent[ss.studentId]) {
          schedulesByStudent[ss.studentId].schedules.push(scheduleInfo);
        }
      }
    });

    // 6. Convertir a array y ordenar
    const result = Object.values(schedulesByStudent).map((student: any) => ({
      ...student,
      schedules: student.schedules.sort((a: any, b: any) => {
        // Ordenar por día y bloque
        const daysOrder: Record<string, number> = { 
          lunes: 1, 
          martes: 2, 
          miercoles: 3, 
          jueves: 4, 
          viernes: 5 
        };
        const dayA = a.day as keyof typeof daysOrder;
        const dayB = b.day as keyof typeof daysOrder;
        return (daysOrder[dayA] || 6) - (daysOrder[dayB] || 6) || a.startBlock - b.startBlock;
      })
    }));

    res.status(200).json({
      result: true,
      content: result,
      error: []
    });

  } catch (error: any) {
    ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getChildrenSchedules"));
    res.status(500).json({ 
      result: false, 
      content: [], 
      error: [`Error al obtener horarios: ${error.message}`] 
    });
  }
};


  // Asignar estudiante a horario
  static assignStudentToSchedule = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { studentId, scheduleId, scheduleType, comment1, comment2, comment3 } = req.body;

      // Verificar que el estudiante exista
      const student = await Student.findByPk(studentId, { transaction });
      if (!student) {
        await transaction.rollback();
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Estudiante no encontrado'] 
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

      // Verificar que el estudiante no esté ya asignado a este horario
      const existingAssignment = await StudentSchedule.findOne({
        where: { studentId, scheduleId },
        transaction
      });

      if (existingAssignment) {
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['El estudiante ya está asignado a este horario'] 
        });
      }

      // Verificar que el estudiante no tenga conflicto de horario
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
        await transaction.rollback();
        return res.status(400).json({ 
          result: false, 
          content: [], 
          error: ['El estudiante ya tiene un horario asignado en ese horario'] 
        });
      }

      // Crear la asignación
      const assignment = await StudentSchedule.create({
        studentId,
        scheduleId,
        scheduleType: scheduleType || 'regular',
        comment1,
        comment2,
        comment3,
        assignedAt: new Date()
      }, { transaction });

      await transaction.commit();

      res.status(200).json({ 
        result: true, 
        content: {
          message: 'Estudiante asignado al horario exitosamente',
          assignmentId: assignment.id,
          studentName: student.fullName,
          scheduleCode: schedule.code
        }, 
        error: [] 
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("assignStudentToSchedule"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al asignar estudiante: ${error.message}`] 
      });
    }
  };

  // Desasignar estudiante de horario
  static removeStudentFromSchedule = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { studentId, scheduleId } = req.body;

      // Verificar que la asignación exista
      const assignment = await StudentSchedule.findOne({
        where: { studentId, scheduleId },
        transaction
      });

      if (!assignment) {
        await transaction.rollback();
        return res.status(404).json({ 
          result: false, 
          content: [], 
          error: ['Asignación no encontrada'] 
        });
      }

      await assignment.destroy({ transaction });
      await transaction.commit();

      res.status(200).json({ 
        result: true, 
        content: ['Estudiante desasignado del horario exitosamente'], 
        error: [] 
      });
    } catch (error: any) {
      await transaction.rollback();
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("removeStudentFromSchedule"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: [`Error al desasignar estudiante: ${error.message}`] 
      });
    }
  };

  // Obtener horarios por grado y sección (para la vista de horarios)
  static getSchedulesByGradeSection = async (req: Request, res: Response) => {
    try {
      const { grade, section } = req.params;

      const schedules = await Schedule.findAll({
        where: { grade, section },
        include: [
          {
            model: Subject,
            as: 'subject',
            include: [{ 
              model: Teacher, 
              as: 'teacher',
              attributes: ['id', 'fullName']
            }]
          },
          {
            model: Teacher,
            as: 'teacher',
            attributes: ['id', 'fullName']
          }
        ],
        order: [
          ['day', 'ASC'],
          ['startBlock', 'ASC']
        ]
      });

      // Organizar por día según la estructura del frontend
      const blockTimes = this.getBlockTimes();
      const schedulesByDay: any = {
        lunes: [],
        martes: [],
        miercoles: [],
        jueves: [],
        viernes: []
      };

      // Inicializar todos los bloques para cada día
      Object.keys(schedulesByDay).forEach(day => {
        schedulesByDay[day] = blockTimes.map((block: any) => ({
          blockId: block.id,
          time: block.time,
          period: block.period,
          isBreak: block.id === 5,
          subject: null,
          teacher: null
        }));
      });

      // Asignar materias a los bloques correspondientes
      schedules.forEach(schedule => {
        if (schedule.day && schedulesByDay[schedule.day]) {
          const blockIndex = schedulesByDay[schedule.day].findIndex(
            (block: any) => block.blockId === schedule.startBlock
          );
          
          if (blockIndex !== -1) {
            // Marcar que este bloque está ocupado por una materia
            schedulesByDay[schedule.day][blockIndex] = {
              ...schedulesByDay[schedule.day][blockIndex],
              subject: schedule.subject?.name,
              subjectCode: schedule.subject?.code,
              teacher: schedule.teacher?.fullName || schedule.subject?.teacher?.fullName,
              classroom: schedule.classroom,
              scheduleId: schedule.id,
              spans: 2 // Cada materia ocupa 2 bloques
            };
            
            // Marcar el siguiente bloque como ocupado (rowspan)
            if (blockIndex + 1 < schedulesByDay[schedule.day].length) {
              schedulesByDay[schedule.day][blockIndex + 1] = {
                ...schedulesByDay[schedule.day][blockIndex + 1],
                isOccupied: true,
                occupiedBy: schedule.id
              };
            }
          }
        }
      });

      res.status(200).json({
        result: true,
        content: {
          grade,
          section,
          blockTimes,
          schedulesByDay
        },
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getSchedulesByGradeSection"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener horarios'] 
      });
    }
  };

  // Obtener estudiantes asignados a un horario
  static getStudentsBySchedule = async (req: Request, res: Response) => {
    try {
      const { scheduleId } = req.params;

      const studentSchedules = await StudentSchedule.findAll({
        where: { scheduleId },
        include: [
          {
            model: Student,
            as: 'student',
            attributes: ['id', 'fullName', 'currentGrade', 'section', 'status']
          },
          {
            model: Schedule,
            as: 'schedule',
            attributes: ['id', 'code', 'grade', 'section', 'day']
          }
        ],
        order: [[{ model: Student, as: 'student' }, 'fullName', 'ASC']]
      });

      res.status(200).json({
        result: true,
        content: studentSchedules,
        error: []
      });
    } catch (error: any) {
      ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getStudentsBySchedule"));
      res.status(500).json({ 
        result: false, 
        content: [], 
        error: ['Error al obtener estudiantes'] 
      });
    }
  };

  // Método auxiliar: Obtener rango de tiempo según bloques
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

  // Método auxiliar: Definición de bloques de tiempo
  private static getBlockTimes() {
    return [
      { id: 1, time: '7:00 - 7:40', period: 'Primer Horario' },
      { id: 2, time: '7:40 - 8:20', period: 'Segundo Horario' },
      { id: 3, time: '8:20 - 9:00', period: 'Tercer Horario' },
      { id: 4, time: '9:00 - 9:01', period: 'Cuarto Horario' },
      { id: 5, time: '10:00 - 10:20', period: 'Receso' },
      { id: 6, time: '10:20 - 10:40', period: 'Sexto Horario' },
      { id: 7, time: '10:40 - 11:20', period: 'Séptimo Horario' },
      { id: 8, time: '11:20 - 12:00', period: 'Octavo Horario' },
      { id: 9, time: '12:20 - 12:40', period: 'Noveno Horario' }
    ];
  }
}