import { Router } from "express";
import { body, query, param } from "express-validator";
import { validateRoutes } from "../../middleware/validateRoutes";
import { authsession } from "../../utility/authsession";
import { TeacherController } from "../../controllers/TeacherController";
import { StudentScheduleController } from "../../controllers/StudentScheduleController";
import { ScheduleController } from "../../controllers/Schedule";
import { SubjectController } from "../../controllers/subjectController";

const AcademicRouter = Router();

// ========== RUTAS PARA DOCENTES ==========
AcademicRouter.post('/teacher/add',
  authsession,
  body('fullName').notEmpty().withMessage('Nombre completo requerido'),
  body('identityCard').notEmpty().withMessage('Cédula requerida'),
  body('email').isEmail().withMessage('Email inválido'),
  body('phone').notEmpty().withMessage('Teléfono requerido'),
  body('address').notEmpty().withMessage('Dirección requerida'),
  validateRoutes,
  TeacherController.addTeacher
);

AcademicRouter.get('/teacher/list',
  authsession,
  query('page').optional().isNumeric().toInt(),
  query('limit').optional().isNumeric().toInt(),
  query('search').optional().isString(),
  validateRoutes,
  TeacherController.getPaginatedTeachers
);

AcademicRouter.get('/teacher/:id',
  authsession,
  param('id').isUUID().withMessage('ID inválido'),
  validateRoutes,
  TeacherController.getTeacherById
);

AcademicRouter.post('/teacher/update',
  authsession,
  body('id').notEmpty().withMessage('ID requerido'),
  body('fullName').optional().isLength({ min: 3, max: 100 }),
  body('identityCard').optional().isLength({ min: 6, max: 20 }),
  body('email').optional().isEmail(),
  validateRoutes,
  TeacherController.updateTeacher
);

AcademicRouter.post('/teacher/delete',
  authsession,
  body('id').notEmpty().withMessage('ID requerido'),
  validateRoutes,
  TeacherController.deleteTeacher
);

AcademicRouter.get('/teacher/active/list',
  authsession,
  TeacherController.getActiveTeachers
);

// ========== RUTAS PARA MATERIAS ==========
AcademicRouter.post('/subject/add',
  authsession,
  body('name').notEmpty().withMessage('Nombre requerido'),
  body('code').notEmpty().withMessage('Código requerido'),
  body('hoursPerWeek').isInt({ min: 0 }).withMessage('Horas por semana inválidas'),
  body('subjectType').optional().isIn(['ordinaria', 'regular', 'complementaria_obligatoria', 'complementaria_opcional']),
  validateRoutes,
  SubjectController.addSubject
);

AcademicRouter.get('/subject/list',
  authsession,
  query('grade').optional().isString(),
  query('subjectType').optional().isString(),
  query('teacherId').optional().isUUID(),
  query('search').optional().isString(),
  validateRoutes,
  SubjectController.getSubjects
);

AcademicRouter.get('/subject/:id',
  authsession,
  param('id').isUUID().withMessage('ID inválido'),
  validateRoutes,
  SubjectController.getSubjectById
);

AcademicRouter.get('/subject/grade/:grade',
  authsession,
  param('grade').isString().withMessage('Grado inválido'),
  validateRoutes,
  SubjectController.getSubjectsByGrade
);

AcademicRouter.post('/subject/update',
  authsession,
  body('id').notEmpty().withMessage('ID requerido'),
  body('code').optional().isLength({ min: 3, max: 50 }),
  validateRoutes,
  SubjectController.updateSubject
);

AcademicRouter.post('/subject/delete',
  authsession,
  body('id').notEmpty().withMessage('ID requerido'),
  validateRoutes,
  SubjectController.deleteSubject
);

// ========== RUTAS PARA HORARIOS ==========
AcademicRouter.post('/schedule/add',
  authsession,
  body('code').notEmpty().withMessage('Código requerido'),
  body('grade').notEmpty().withMessage('Grado requerido'),
  body('section').notEmpty().withMessage('Sección requerida'),
  body('day').isIn(['lunes', 'martes', 'miercoles', 'jueves', 'viernes']).withMessage('Día inválido'),
  body('startBlock').isInt({ min: 1, max: 9 }).withMessage('Bloque inicial inválido'),
  body('endBlock').optional().isInt({ min: 1, max: 9 }),
  body('subjectId').optional({ nullable: true }).isUUID().withMessage('ID de materia inválido'),
  validateRoutes,
  ScheduleController.addSchedule
);

AcademicRouter.get('/schedule/list',
  authsession,
  query('grade').optional().isString(),
  query('section').optional().isString(),
  query('day').optional().isIn(['lunes', 'martes', 'miercoles', 'jueves', 'viernes']),
  query('teacherId').optional().isUUID(),
  query('subjectId').optional().isUUID(),
  query('search').optional().isString(),
  validateRoutes,
  ScheduleController.getSchedules
);

// 🎯 **RUTA FIJA: Horarios de los hijos del representante (DEBE IR ANTES DE /:id)**
AcademicRouter.get('/schedule/my-children',
  authsession,
  ScheduleController.getChildrenSchedules
);

// Ruta con parámetro :id (DEBE IR DESPUÉS DE LAS RUTAS FIJAS)
AcademicRouter.get('/schedule/:id',
  authsession,
  param('id').isUUID().withMessage('ID inválido'),
  validateRoutes,
  ScheduleController.getScheduleById
);

AcademicRouter.post('/schedule/update',
  authsession,
  body('id').notEmpty().withMessage('ID requerido'),
  body('code').optional().isLength({ min: 7, max: 7 }),
  body('day').optional().isIn(['lunes', 'martes', 'miercoles', 'jueves', 'viernes']),
  body('startBlock').optional().isInt({ min: 1, max: 9 }),
  body('endBlock').optional().isInt({ min: 1, max: 9 }),
  validateRoutes,
  ScheduleController.updateSchedule
);

AcademicRouter.post('/schedule/delete',
  authsession,
  body('id').notEmpty().withMessage('ID requerido'),
  validateRoutes,
  ScheduleController.deleteSchedule
);

AcademicRouter.get('/schedule/grade/:grade/section/:section',
  authsession,
  param('grade').isString().withMessage('Grado inválido'),
  param('section').isString().withMessage('Sección inválida'),
  validateRoutes,
  ScheduleController.getSchedulesByGradeSection
);

// Asignar estudiante a horario
AcademicRouter.post('/schedule/assign-student',
  authsession,
  body('studentId').notEmpty().isUUID().withMessage('ID de estudiante inválido'),
  body('scheduleId').notEmpty().isUUID().withMessage('ID de horario inválido'),
  body('scheduleType').optional().isIn(['regular', 'pendiente']),
  validateRoutes,
  ScheduleController.assignStudentToSchedule
);

// Desasignar estudiante de horario
AcademicRouter.post('/schedule/remove-student',
  authsession,
  body('studentId').notEmpty().isUUID().withMessage('ID de estudiante inválido'),
  body('scheduleId').notEmpty().isUUID().withMessage('ID de horario inválido'),
  validateRoutes,
  ScheduleController.removeStudentFromSchedule
);

AcademicRouter.get('/schedule/:scheduleId/students',
  authsession,
  param('scheduleId').isUUID().withMessage('ID de horario inválido'),
  validateRoutes,
  ScheduleController.getStudentsBySchedule
);

// ========== RUTAS PARA ASIGNACIONES ESTUDIANTE-HORARIO ==========
AcademicRouter.get('/student-schedule/list',
  authsession,
  query('studentId').optional().isUUID(),
  query('scheduleId').optional().isUUID(),
  query('scheduleType').optional().isIn(['regular', 'pendiente']),
  query('grade').optional().isString(),
  query('section').optional().isString(),
  validateRoutes,
  StudentScheduleController.getStudentSchedules
);

AcademicRouter.get('/student-schedule/:id',
  authsession,
  param('id').isUUID().withMessage('ID inválido'),
  validateRoutes,
  StudentScheduleController.getStudentScheduleById
);

AcademicRouter.get('/student-schedule/student/:studentId',
  authsession,
  param('studentId').isUUID().withMessage('ID de estudiante inválido'),
  validateRoutes,
  StudentScheduleController.getStudentSchedulesByStudent
);

AcademicRouter.post('/student-schedule/update',
  authsession,
  body('id').notEmpty().withMessage('ID requerido'),
  body('scheduleType').optional().isIn(['regular', 'pendiente']),
  validateRoutes,
  StudentScheduleController.updateStudentSchedule
);

AcademicRouter.post('/student-schedule/delete',
  authsession,
  body('id').notEmpty().withMessage('ID requerido'),
  validateRoutes,
  StudentScheduleController.deleteStudentSchedule
);

AcademicRouter.post('/student-schedule/assign-multiple',
  authsession,
  body('scheduleId').notEmpty().isUUID().withMessage('ID de horario inválido'),
  body('studentIds').isArray().withMessage('studentIds debe ser un array'),
  body('studentIds.*').isUUID().withMessage('Cada ID de estudiante debe ser válido'),
  body('scheduleType').optional().isIn(['regular', 'pendiente']),
  validateRoutes,
  StudentScheduleController.assignMultipleStudents
);

export default AcademicRouter;
