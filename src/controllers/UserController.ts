//#region Import
import type { Request, Response, NextFunction } from "express";
import { FindAndCountOptions, Op, WhereOptions } from 'sequelize';
import UserLogin from "../database/models/userlogin";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo"; 
import { typeuserlogin_full, typeuserlogin_in, typeTokenData, typeuserlogin_active } from "../database/types/userlogin";
import { generateJWT } from "../utility/genToken";
import Student from "../database/models/student";
import Representative from "../database/models/representative";
import sequelize from "../database/config";
import { Transaction } from "sequelize";

//#endregion

export class User {
    //#region: Crear usuarios Nuevos post('/adduser')
    static adduser = async (req: Request, res: Response) => {
        const transaction = await sequelize.transaction();
        
        try {
            const { 
                userpass, 
                userrepass, 
                representativeData, 
                studentsData, 
                ...userFields 
            }: typeuserlogin_full = req.body;

            // Verificar si el email ya existe
            if (userFields.usermail) {
                const existingEmail = await UserLogin.findOne({ 
                    where: { usermail: userFields.usermail } 
                });
                
                if (existingEmail) {
                    await transaction.rollback();
                    res.status(202).json({ 
                        result: false, 
                        content: [], 
                        error: [`El email ${userFields.usermail} ya fue asignado a otro usuario`] 
                    }); 
                    return;
                }
            }

            // Verificar si el login ya existe
            if (userFields.userlogin) {
                const existingLogin = await UserLogin.findOne({ 
                    where: { userlogin: userFields.userlogin } 
                });
                
                if (existingLogin) {
                    await transaction.rollback();
                    res.status(202).json({ 
                        result: false, 
                        content: [], 
                        error: [`El login ${userFields.userlogin} ya está en uso`] 
                    }); 
                    return;
                }
            }

            // Crear el usuario
            const newUser = await UserLogin.create({
                ...userFields,
                userpass: userpass,
                nivel: userFields.nivel || 1,
                userstatus: userFields.userstatus !== undefined ? userFields.userstatus : true
            }, { transaction });

            // Si es representante (nivel 1) Y hay datos de representante
            if (newUser.nivel === 1 && representativeData) {
                
                if (!representativeData || !representativeData.identityCard) {
                    // No hacemos rollback porque el usuario ya se creó
                } else {
                    // Verificar si la cédula del representante ya existe
                    const existingRep = await Representative.findOne({ 
                        where: { identityCard: representativeData.identityCard },
                        transaction
                    });
                    
                    if (!existingRep) {
                        // Crear el representante CON SALDO
                        try {
                            const newRepresentative = await Representative.create({
                                fullName: representativeData.fullName,
                                identityCard: representativeData.identityCard,
                                address: representativeData.address,
                                phone: representativeData.phone,
                                relationship: representativeData.relationship,
                                parentName: representativeData.parentName,
                                parentIdentityCard: representativeData.parentIdentityCard,
                                parentAddress: representativeData.parentAddress,
                                parentPhone: representativeData.parentPhone,
                                balance: representativeData.initialBalance || 0.00,
                                userId: newUser.id
                            }, { transaction });

                            // CREAR ESTUDIANTES
                            if (studentsData && Array.isArray(studentsData) && studentsData.length > 0) {
                                for (const studentData of studentsData) {
                                    if (!studentData.identityCard || !studentData.fullName) {
                                        continue;
                                    }

                                    // Verificar si la cédula del estudiante ya existe
                                    const existingStudent = await Student.findOne({
                                        where: { identityCard: studentData.identityCard },
                                        transaction
                                    });
                                    
                                    if (!existingStudent) {
                                        try {
                                            await Student.create({
                                                fullName: studentData.fullName,
                                                identityCard: studentData.identityCard,
                                                birthDate: new Date(studentData.birthDate),
                                                state: studentData.state,
                                                zone: studentData.zone,
                                                addressDescription: studentData.addressDescription,
                                                phone: studentData.phone || '',
                                                nationality: studentData.nationality,
                                                birthCountry: studentData.birthCountry,
                                                hasAllergies: studentData.hasAllergies,
                                                allergiesDescription: studentData.allergiesDescription || '',
                                                hasDiseases: studentData.hasDiseases,
                                                diseasesDescription: studentData.diseasesDescription || '',
                                                emergencyContact: studentData.emergencyContact,
                                                emergencyPhone: studentData.emergencyPhone,
                                                representativeId: newRepresentative.id,
                                                userId: newUser.id,
                                                status: 'pendiente',
                                                admissionDate: new Date(),
                                                initialSchoolYear: new Date().getFullYear().toString(),
                                                currentGrade: 'En asignar',
                                                section: 'Pendiente',
                                            }, { transaction });
                                        } catch (studentError: any) {
                                            // Continuamos con el siguiente estudiante
                                        }
                                    }
                                }
                            }
                        } catch (repError: any) {
                            // No hacemos rollback, continuamos sin representante
                        }
                    }
                }
            }

            // Confirmar transacción
            await transaction.commit();
            
            res.status(200).json({ 
                result: true, 
                content: [`Usuario Creado Exitosamente`], 
                error: [] 
            }); 
        } catch (error: any) {
            // Revertir transacción en caso de error
            await transaction.rollback();
            
            if (error.name === 'SequelizeValidationError') {
                // Solo registramos, no mostramos al usuario
            }
            
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("adduser"));
            res.status(500).json({ 
                result: false, 
                content: [], 
                error: [`Error al crear Usuario: ${error.message}`]
            });
        }
    };
    //#endregion

    //#region: Verificar Contraseñas con confirmación de contraseña
    static ComparePass = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { userpass, userrepass } = req.body;
            if (userpass !== userrepass) {
                res.status(202).json({ result: false, content: [], error: ['Las contraseñas no coinciden'] });
                return;
            };
            next(); 
        } catch (error) {
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("ComparePass"));
            res.status(500).json({ result: false, content: [], error: ['Error comprobando las contraseñas'] });
        }
    };
    //#endregion

    //#region: Verificar si el Email esta Ocupado o Disponible
    static CheckEmailExists = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const LoginData: typeuserlogin_full = req.body;
            if (LoginData.usermail) {
                const existingEmail = await UserLogin.findOne({ where: { usermail: LoginData.usermail } });
                if (existingEmail) {
                    res.status(202).json({ result: false, content: [], error: [`El email ${LoginData.usermail} ya fue asignado a otro usuario`] }); 
                    return;
                }
            }
            next(); 
        } catch (error) {
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("CheckEmailExists"));
            res.status(500).json({ result: false, content: [], error: ['Error comprobando Email'] });
        }
    };
    //#endregion

    //#region: Verificar si el Login esta Ocupado o Disponible 
    static CheckUserIDExists = async (req: Request, res: Response, next: NextFunction) => {
        try {
            const LoginData: typeuserlogin_full = req.body;
            if (LoginData.userlogin) {
                const existingLogin = await UserLogin.findOne({ where: { userlogin: LoginData.userlogin } });
                if (existingLogin) {
                    res.status(202).json({ result: false, content: [], error: [`El login ${LoginData.userlogin} ya fue asignado a otro usuario`] }); 
                    return;
                }
            }
            next(); 
        } catch (error) {
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("CheckUserIDExists"));
            res.status(500).json({ result: false, content: [], error: ['Error comprobando login del usuario'] });
        }
    };
    //#endregion

    //#region Eliminar Usuarios post('/removelogin')
    static removelogin = async (req: Request, res: Response) => {
        const transaction = await sequelize.transaction();
        
        try {
            const loginData: typeuserlogin_full = req.body;
            const ResultadoDB = await UserLogin.findOne({
                where: { id: loginData.id },
                transaction
            });
            
            if (!ResultadoDB) {
                await transaction.rollback();
                res.status(202).json({ result: false, content: [], error: [`usuario: ${loginData.userlogin}, no encontrado`] });
                return;
            }
            
            // Verificar si es representante (nivel 1)
            if (ResultadoDB.nivel === 1) {
                // Buscar el representante asociado
                const representative = await Representative.findOne({
                    where: { userId: ResultadoDB.id },
                    include: [{
                        model: Student,
                        as: 'students',
                        required: false
                    }],
                    transaction
                });
                
                if (representative) {
                    // Verificar si tiene estudiantes
                    const studentCount = await Student.count({
                        where: { representativeId: representative.id },
                        transaction
                    });
                    
                    // Verificar si tiene deuda (balance negativo)
                    if ((representative.balance || 0) < 0) {
                        await transaction.rollback();
                        res.status(202).json({ 
                            result: false, 
                            content: [], 
                            error: [`No se puede eliminar el representante ${representative.fullName} porque tiene una deuda de ${Math.abs(representative.balance || 0)}`] 
                        });
                        return;
                    }
                    
                    // Verificar si tiene estudiantes
                    if (studentCount > 0) {
                        await transaction.rollback();
                        res.status(202).json({ 
                            result: false, 
                            content: [], 
                            error: [`No se puede eliminar el representante ${representative.fullName} porque tiene ${studentCount} estudiante(s) registrado(s)`] 
                        });
                        return;
                    }
                    
                    // Si no tiene deuda ni estudiantes, eliminar el representante
                    await representative.destroy({ transaction });
                }
            }
            
            await ResultadoDB.destroy({ transaction });
            await transaction.commit();
            
            res.status(200).json({ result: true, content: [`El usuario: ${loginData.userlogin} fue eliminado exitosamente`], error: [] });
        } catch (error) {
            await transaction.rollback();
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("removelogin"));
            res.status(500).json({ result: false, content: [], error: ['Error al eliminar el usuario'] });
        }
    };
    //#endregion

    //#region Actualizar Usuarios con gestión de estudiantes post('/updatelogin')
static updatelogin = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
        const loginData: typeuserlogin_full = req.body;
        const { representativeData, studentsData, ...userUpdateData } = loginData;
        
        // Buscar usuario
        const ResultadoDB = await UserLogin.findOne({
            where: { id: loginData.id },
            transaction
        });
        
        if (!ResultadoDB) {
            await transaction.rollback();
            res.status(202).json({ result: false, content: [], error: [`usuario: ${loginData.userlogin}, no encontrado`] });
            return;
        }
        
        // Verificar si está cambiando de nivel (solo si se envía nivel)
        if (userUpdateData.nivel !== undefined && userUpdateData.nivel !== ResultadoDB.nivel) {
            // Si estaba en nivel 1 (representante) y quiere cambiar a otro nivel
            if (ResultadoDB.nivel === 1) {
                // Buscar si tiene representante asociado
                const representative = await Representative.findOne({
                    where: { userId: ResultadoDB.id },
                    transaction
                });
                
                if (representative) {
                    // Verificar si el representante tiene estudiantes o deuda
                    const studentCount = await Student.count({
                        where: { representativeId: representative.id },
                        transaction
                    });
                    
                    if ((representative.balance || 0) < 0 || studentCount > 0) {
                        await transaction.rollback();
                        res.status(202).json({ 
                            result: false, 
                            content: [], 
                            error: [`No se puede cambiar el nivel del usuario porque tiene ${studentCount} estudiante(s) y/o una deuda de ${Math.abs(representative.balance || 0)}`] 
                        });
                        return;
                    }
                }
            }
        }
        
        // Actualizar datos del usuario
        await ResultadoDB.update(userUpdateData, { transaction });
        
        // Si es representante (nivel 1) o sigue siendo representante
        if ((userUpdateData.nivel === 1 || ResultadoDB.nivel === 1) && representativeData) {
            // Buscar el representante asociado
            let representative = await Representative.findOne({
                where: { userId: ResultadoDB.id },
                transaction
            });
            
            if (representative) {
                // Actualizar datos del representante
                await representative.update(representativeData, { transaction });
            } else if (representativeData.identityCard && representativeData.fullName) {
                // Crear representante si no existe
                representative = await Representative.create({
                    ...representativeData,
                    userId: ResultadoDB.id,
                    balance: representativeData.initialBalance || 0.00
                }, { transaction });
            }
            
            // GESTIÓN DE ESTUDIANTES
            if (studentsData && Array.isArray(studentsData) && representative) {
                // Obtener estudiantes actuales
                const currentStudents = await Student.findAll({
                    where: { representativeId: representative.id },
                    transaction
                });
                
                const currentStudentIds = currentStudents.map(s => s.id);
                const updatedStudentIds: string[] = [];
                
                // Procesar cada estudiante del request
                for (const studentData of studentsData) {
                    // Crear un tipo explícito para studentData con todos los campos posibles
                    const typedStudentData = studentData as any;
                    
                    if (typedStudentData.id && currentStudentIds.includes(typedStudentData.id)) {
                        // Actualizar estudiante existente
                        const existingStudent = await Student.findOne({
                            where: { 
                                id: typedStudentData.id,
                                representativeId: representative.id 
                            },
                            transaction
                        });
                        
                        if (existingStudent) {
                            // Preparar datos de actualización con fechas convertidas
                            const updateData: any = { ...typedStudentData };
                            
                            // Convertir fechas si vienen como string
                            if (typedStudentData.birthDate && typeof typedStudentData.birthDate === 'string') {
                                updateData.birthDate = new Date(typedStudentData.birthDate);
                            }
                            
                            if (typedStudentData.admissionDate && typeof typedStudentData.admissionDate === 'string') {
                                updateData.admissionDate = new Date(typedStudentData.admissionDate);
                            }
                            
                            // Si no viene admissionDate, mantener el valor actual
                            if (!typedStudentData.admissionDate) {
                                delete updateData.admissionDate; // No actualizar si no se envía
                            }
                            
                            await existingStudent.update(updateData, { transaction });
                            updatedStudentIds.push(typedStudentData.id);
                        }
                    } else if (!typedStudentData.id && typedStudentData.identityCard && typedStudentData.fullName) {
                        // Crear nuevo estudiante (verificar cédula única)
                        const existingStudentById = await Student.findOne({
                            where: { identityCard: typedStudentData.identityCard },
                            transaction
                        });
                        
                        if (!existingStudentById) {
                            // PREPARAR DATOS CON TIPOS CORRECTOS
                            const studentCreateData = {
                                // Información Personal
                                fullName: typedStudentData.fullName,
                                identityCard: typedStudentData.identityCard,
                                birthDate: new Date(typedStudentData.birthDate), // ✅ CONVERTIR A Date
                                
                                // Dirección
                                state: typedStudentData.state,
                                zone: typedStudentData.zone,
                                addressDescription: typedStudentData.addressDescription,
                                phone: typedStudentData.phone || '',
                                
                                // Nacionalidad
                                nationality: typedStudentData.nationality,
                                birthCountry: typedStudentData.birthCountry,
                                
                                // Salud
                                hasAllergies: typedStudentData.hasAllergies || false,
                                allergiesDescription: typedStudentData.allergiesDescription || '',
                                hasDiseases: typedStudentData.hasDiseases || false,
                                diseasesDescription: typedStudentData.diseasesDescription || '',
                                
                                // Emergencia
                                emergencyContact: typedStudentData.emergencyContact,
                                emergencyPhone: typedStudentData.emergencyPhone,
                                
                                // Académico (con valores por defecto)
                                status: typedStudentData.status || 'pendiente',
                                admissionDate: typedStudentData.admissionDate ? 
                                    new Date(typedStudentData.admissionDate) : new Date(),
                                initialSchoolYear: typedStudentData.initialSchoolYear || 
                                    new Date().getFullYear().toString(),
                                currentGrade: typedStudentData.currentGrade || 'En asignar',
                                section: typedStudentData.section || 'Pendiente',
                                
                                // Relaciones
                                representativeId: representative.id!,
                                userId: ResultadoDB.id!,
                            };

                            const newStudent = await Student.create(studentCreateData, { transaction });
                            
                            updatedStudentIds.push(newStudent.id!);
                        }
                    }
                }
                
                // Opcional: Eliminar estudiantes que no están en el request
                // Para activar esta funcionalidad, descomenta el siguiente bloque:
                /*
                const studentsToDelete = currentStudentIds.filter(id => !updatedStudentIds.includes(id));
                if (studentsToDelete.length > 0) {
                    // Verificar que los estudiantes a eliminar no tengan registros asociados (horarios, pagos, etc.)
                    // Esta validación depende de tu modelo de datos
                    await Student.destroy({
                        where: { 
                            id: studentsToDelete,
                            representativeId: representative.id 
                        },
                        transaction
                    });
                }
                */
            }
        }
        
        await transaction.commit();
        
        res.status(200).json({ 
            result: true, 
            content: [`El Usuario ${loginData.userlogin}, fue actualizado exitosamente`], 
            error: [] 
        });
    } catch (error) {
        await transaction.rollback();
        ErrorLog.createErrorLog(error, 'Server', getErrorLocation("updatelogin"));
        res.status(500).json({ result: false, content: [], error: ['Error al Actualizar el usuario'] });
    }
};
    //#endregion
    
    //#region: Lista de Usuarios Paginados get('/listpag')
    static async getPaginatedlogin(req: Request, res: Response) {
        try {
            type FieldKeys = 'usermail' | 'userlogin' | 'username' | 'createdAt';
            type OrderDirection = 'ASC' | 'DESC';
            
            type FieldConfig = {
                [key: number]: {
                    field: FieldKeys | 'createdAt';
                    orderDirection: OrderDirection;
                };
            };

            const page = parseInt(req.query.page as string, 10) || 1;
            const limit = parseInt(req.query.limit as string, 10) || 5;
            const idBus = parseInt(req.query.idBus as string, 10) || 1;
            const DeBus = (req.query.DeBus as string || '').trim();
            const offset = (page - 1) * limit;

            const fieldConfig: FieldConfig = {
                1: { field: 'usermail', orderDirection: 'ASC' },
                2: { field: 'userlogin', orderDirection: 'ASC' },
                3: { field: 'username', orderDirection: 'ASC' },
                4: { field: 'createdAt', orderDirection: 'DESC' }
            };

            const config = fieldConfig[idBus] || { 
                field: 'createdAt' as const, 
                orderDirection: 'DESC' as OrderDirection 
            };

            const queryOptions: FindAndCountOptions<typeuserlogin_full> = {
                limit,
                offset,
                attributes: { exclude: ['userpass'] },
            };

            queryOptions.order = [[config.field, config.orderDirection]];
            
            if (DeBus) {
                const where: WhereOptions<any> = {
                    [Op.or]: [
                        { usermail: { [Op.iLike]: `%${DeBus}%` } },
                        { userlogin: { [Op.iLike]: `%${DeBus}%` } },
                        { username: { [Op.iLike]: `%${DeBus}%` } }
                    ]
                };
                queryOptions.where = where;
            }
            
            const { count, rows } = await UserLogin.findAndCountAll(queryOptions);
            
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

        } catch (error) {
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getPaginatedlogin"));
            res.status(500).json({ 
                result: false, 
                content: [], 
                error: ['Error al obtener usuarios'] 
            });
        }
    }
    //#endregion

    //#region: Iniciar Sesion post('/privateauth')
    static SesionIn = async (req: Request, res: Response) => {
        try {
            const loginData: typeuserlogin_in = req.body;

            const ResultadoDB = await UserLogin.findOne({
                where: { usermail: loginData.usermail }
            });
            
            if (!ResultadoDB) {
                ErrorLog.createErrorLog(`Credenciales invalidas, usuario no existe`, loginData.usermail, getErrorLocation("SesionIn"));
                res.status(429).json({ result: false, content: [], error: [`Credenciales invalidas`] });
                return;
            }
            
            if (!ResultadoDB.userstatus) {
                ErrorLog.createErrorLog(`Credenciales invalidas, usuario inactivo`, loginData.usermail, getErrorLocation("SesionIn"));
                res.status(429).json({ result: false, content: [], error: [`Credenciales no autorizada`] });
                return; 
            }
            
            const Comparacion = await ResultadoDB.comparePassword(loginData.userpass);
            
            if (!Comparacion) {
                ErrorLog.createErrorLog(`Credenciales invalidas, las contraseñas no coinciden`, loginData.usermail, getErrorLocation("SesionIn"));
                res.status(429).json({ result: false, content: [], error: [`Credenciales invalidas`] });
                return; 
            }
            
            if (!ResultadoDB.id || !ResultadoDB.userlogin || !ResultadoDB.usermail || ResultadoDB.nivel === undefined) {
                ErrorLog.createErrorLog(`Datos de usuario incompletos`, loginData.usermail, getErrorLocation("SesionIn"));
                res.status(500).json({ result: false, content: [], error: ['Error en los datos del usuario'] });
                return;
            }
            
            const jwtUser = generateJWT({ 
                id: ResultadoDB.id,                
                userlogin: ResultadoDB.userlogin,
                username: ResultadoDB.username,
                usermail: ResultadoDB.usermail,
                nivel: ResultadoDB.nivel
            });

            if (!jwtUser) {
                res.status(500).json({ result: false, content: [], error: ['Error generando token de autenticación'] });
                return;
            }

            res.status(200).json({ result: true, content: jwtUser, error: [] });
            
        } catch (error) {
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("SesionIn"));
            res.status(500).json({ result: false, content: [], error: ['Error al iniciar sesión'] });
        }
    };
    //#endregion

    //#region: Usuario Activo get('/onsession')
    static UserActive = async (req: Request, res: Response) => {
        const tokenDataActive: typeTokenData | undefined = req.tokenData;
        
        if (
            !tokenDataActive?.id || 
            typeof tokenDataActive.id !== "string" ||
            !tokenDataActive?.userlogin || 
            typeof tokenDataActive.userlogin !== "string" ||
            !tokenDataActive.usermail || 
            typeof tokenDataActive.usermail !== "string" 
        ) {
            res.status(429).json({ result: false, content: [], error: ["Autenticación requerida. Por favor, inicie sesión nuevamente"] });
            return;
        }
        
        if (tokenDataActive.username && typeof tokenDataActive.username !== "string") {
            res.status(429).json({ result: false, content: [], error: ["Autenticación requerida. Por favor, inicie sesión nuevamente"] });
            return;
        }

        try {
            const userData = await UserLogin.findOne({
                where: { id: tokenDataActive.id },
                attributes: ['id', 'userlogin', 'username', 'usermail', 'userstatus', 'nivel'],
                rejectOnEmpty: false
            });

            if (!userData || !userData.userstatus) {
                res.status(429).json({ result: false, content: [], error: ["Autenticación requerida. Por favor, inicie sesión nuevamente"] });
                return;
            }

            let studentInfo = null;
            try {
                studentInfo = await Student.findOne({
                    where: { userId: tokenDataActive.id },
                    attributes: ['id', 'fullName', 'status']
                });
            } catch (studentError) {
                // Silencioso, continuar sin información del estudiante
            }

            const EnviarUserActive: typeuserlogin_active = {
                sesionUser: userData.username || userData.userlogin,
                sesionEmail: userData.usermail,
                userStatus: userData.userstatus,
                nivel: userData.nivel,
                studentInfo: studentInfo ? {
                    name: studentInfo.fullName,
                    status: studentInfo.status === 'regular'
                } : null
            };

            res.status(200).json({ result: true, content: EnviarUserActive, error: [] });

        } catch (dbError) {
            ErrorLog.createErrorLog(dbError, 'Server', getErrorLocation("UserActive"));
            res.status(429).json({ result: false, content: [], error: ["Autenticación requerida. Por favor, inicie sesión nuevamente"] });
            return;
        }
    };
    //#endregion

    //#region: Estadísticas del Sistema
    static getStatistics = async (req: Request, res: Response) => {
        try {
            const totalUsers = await UserLogin.count();
            const activeUsers = await UserLogin.count({ where: { userstatus: true } });
            const totalStudents = await Student.count();
            const activeStudents = await Student.count({ where: { status: true } });
            const usersByLevel = await UserLogin.findAll({
                attributes: [
                    'nivel',
                    [UserLogin.sequelize!.fn('COUNT', UserLogin.sequelize!.col('id')), 'count']
                ],
                group: ['nivel'],
                raw: true
            });

            const result = {
                users: {
                    total: totalUsers,
                    active: activeUsers,
                    byLevel: usersByLevel
                },
                students: {
                    total: totalStudents,
                    active: activeStudents
                }
            };

            res.status(200).json({ result: true, content: result, error: [] });
        } catch (error) {
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getStatistics"));
            res.status(500).json({ result: false, content: [], error: ['Error obteniendo estadísticas'] });
        }
    };
    //#endregion

    //#region: Endpoints adicionales para gestión de estudiantes
    static addStudentToRepresentative = async (req: Request, res: Response) => {
        const transaction = await sequelize.transaction();
        
        try {
            const { representativeId, studentData } = req.body;
            
            if (!representativeId || !studentData) {
                await transaction.rollback();
                res.status(400).json({ 
                    result: false, 
                    content: [], 
                    error: ['representativeId y studentData son requeridos'] 
                });
                return;
            }
            
            // Verificar que el representante exista
            const representative = await Representative.findByPk(representativeId, { transaction });
            if (!representative) {
                await transaction.rollback();
                res.status(404).json({ 
                    result: false, 
                    content: [], 
                    error: ['Representante no encontrado'] 
                });
                return;
            }
            
            // Verificar cédula única
            if (studentData.identityCard) {
                const existingStudent = await Student.findOne({
                    where: { identityCard: studentData.identityCard },
                    transaction
                });
                
                if (existingStudent) {
                    await transaction.rollback();
                    res.status(400).json({ 
                        result: false, 
                        content: [], 
                        error: [`La cédula ${studentData.identityCard} ya está registrada`] 
                    });
                    return;
                }
            }
            
            // Obtener usuario del representante
            const user = await UserLogin.findByPk(representative.userId, { transaction });
            
            // Crear estudiante
            const newStudent = await Student.create({
                ...studentData,
                birthDate: new Date(studentData.birthDate),
                representativeId: representative.id,
                userId: user?.id,
                status: 'pendiente',
                admissionDate: new Date(),
                initialSchoolYear: new Date().getFullYear().toString(),
                currentGrade: 'En asignar',
                section: 'Pendiente'
            }, { transaction });
            
            await transaction.commit();
            
            res.status(200).json({ 
                result: true, 
                content: {
                    message: 'Estudiante agregado exitosamente',
                    studentId: newStudent.id,
                    studentName: newStudent.fullName
                }, 
                error: [] 
            });
            
        } catch (error: any) {
            await transaction.rollback();
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("addStudentToRepresentative"));
            res.status(500).json({ 
                result: false, 
                content: [], 
                error: [`Error al agregar estudiante: ${error.message}`] 
            });
        }
    };
    
    static removeStudent = async (req: Request, res: Response) => {
        const transaction = await sequelize.transaction();
        
        try {
            const { studentId, representativeId } = req.body;
            
            if (!studentId || !representativeId) {
                await transaction.rollback();
                res.status(400).json({ 
                    result: false, 
                    content: [], 
                    error: ['studentId y representativeId son requeridos'] 
                });
                return;
            }
            
            // Verificar que el estudiante exista y pertenezca al representante
            const student = await Student.findOne({
                where: { 
                    id: studentId,
                    representativeId: representativeId 
                },
                transaction
            });
            
            if (!student) {
                await transaction.rollback();
                res.status(404).json({ 
                    result: false, 
                    content: [], 
                    error: ['Estudiante no encontrado o no pertenece al representante'] 
                });
                return;
            }
            
            // Aquí puedes agregar validaciones adicionales:
            // - Verificar si el estudiante tiene horarios asignados
            // - Verificar si tiene pagos pendientes
            // - Verificar si tiene registros académicos
            
            await student.destroy({ transaction });
            await transaction.commit();
            
            res.status(200).json({ 
                result: true, 
                content: [`Estudiante ${student.fullName} eliminado exitosamente`], 
                error: [] 
            });
            
        } catch (error) {
            await transaction.rollback();
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("removeStudent"));
            res.status(500).json({ result: false, content: [], error: ['Error al eliminar estudiante'] });
        }
    };
    //#endregion
}