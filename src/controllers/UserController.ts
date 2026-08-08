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
import Teacher from "../database/models/teacher";
import { BillingService } from "../services/billingServices";

//#endregion

// Helper para obtener el balance total de un representante (suma de balances de sus estudiantes)
const getTotalBalance = async (representativeId: string): Promise<number> => {
  const students = await Student.findAll({ where: { representativeId } });
  return students.reduce((sum, s) => sum + (s.balance || 0), 0);
};

export class User {
    //#region: Crear usuarios Nuevos post('/adduser')
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
                    // Crear el representante SIN BALANCE
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
                            userId: newUser.id
                        }, { transaction });

                        // CREAR ESTUDIANTES con balance individual
                        if (studentsData && Array.isArray(studentsData) && studentsData.length > 0) {
                            // Distribuir el initialBalance entre los estudiantes (solo como fallback)
                            const initialBalance = representativeData.initialBalance || 0;
                            const perStudentBalance = studentsData.length > 0 ? initialBalance / studentsData.length : 0;

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
                                        const studentBalance = studentData.balance !== undefined ? studentData.balance : perStudentBalance;
                                        
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
                                            status: studentData.status || 'pendiente',
                                            admissionDate: new Date(),
                                            initialSchoolYear: new Date().getFullYear().toString(),
                                            currentGrade: studentData.currentGrade || 'En asignar',
                                            section: studentData.section || 'Pendiente',
                                            balance: studentBalance
                                        }, { transaction });
                                    } catch (studentError: any) {
                                        // Continuamos con el siguiente estudiante
                                        console.error('Error creando estudiante:', studentError);
                                    }
                                }
                            }
                        }
                    } catch (repError: any) {
                        // No hacemos rollback, continuamos sin representante
                        console.error('Error creando representante:', repError);
                    }
                }
            }
        }

        // Confirmar transacción
        await transaction.commit();

        // ✅ NUEVO: Si el usuario es representante activo, aplicar cargos de inscripción
        if (newUser.nivel === 1 && newUser.userstatus && representativeData && studentsData && Array.isArray(studentsData)) {
            // Recuperar los estudiantes recién creados
            const createdStudents = await Student.findAll({
                where: { userId: newUser.id },
            });

            // También necesitamos el representante para pasar su ID
            const representative = await Representative.findOne({
                where: { userId: newUser.id },
            });

            if (representative && createdStudents.length > 0) {
                for (const student of createdStudents) {
                    try {
                        // isNewStudent = true (nuevo ingreso)
                        await BillingService.applyInscriptionFees(student.id!, representative.id!, true);
                    } catch (feeError) {
                        console.error(`Error aplicando cuotas al estudiante ${student.id}:`, feeError);
                        // No detenemos la respuesta; el usuario ya fue creado.
                    }
                }
            }
        }
        
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
                    
                    // Verificar si tiene deuda (balance total negativo)
                    const totalBalance = await getTotalBalance(representative.id!);
                    if (totalBalance < 0) {
                        await transaction.rollback();
                        res.status(202).json({ 
                            result: false, 
                            content: [], 
                            error: [`No se puede eliminar el representante ${representative.fullName} porque tiene una deuda de ${Math.abs(totalBalance)}`] 
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
                        
                        const totalBalance = await getTotalBalance(representative.id!);
                        
                        if (totalBalance < 0 || studentCount > 0) {
                            await transaction.rollback();
                            res.status(202).json({ 
                                result: false, 
                                content: [], 
                                error: [`No se puede cambiar el nivel del usuario porque tiene ${studentCount} estudiante(s) y/o una deuda de ${Math.abs(totalBalance)}`] 
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
                    // Actualizar datos del representante (sin balance)
                    const { initialBalance, ...repUpdate } = representativeData;
                    await representative.update(repUpdate, { transaction });
                } else if (representativeData.identityCard && representativeData.fullName) {
                    // Crear representante si no existe (sin balance)
                    representative = await Representative.create({
                        ...representativeData,
                        userId: ResultadoDB.id,
                    }, { transaction });
                }
                
                // GESTIÓN DE ESTUDIANTES
                if (studentsData && Array.isArray(studentsData) && representative) {
                    // Obtener estudiantes actuales
                    const currentStudents = await Student.findAll({
                        where: { representativeId: representative.id },
                        transaction
                    });
                    
                    const currentStudentIds = currentStudents.map(s => s.id!);
                    const updatedStudentIds: string[] = [];
                    
                    // Procesar cada estudiante del request
                    for (const studentData of studentsData) {
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
                                const updateData: any = { ...typedStudentData };
                                
                                if (typedStudentData.birthDate && typeof typedStudentData.birthDate === 'string') {
                                    updateData.birthDate = new Date(typedStudentData.birthDate);
                                }
                                
                                if (typedStudentData.admissionDate && typeof typedStudentData.admissionDate === 'string') {
                                    updateData.admissionDate = new Date(typedStudentData.admissionDate);
                                }
                                
                                if (!typedStudentData.admissionDate) {
                                    delete updateData.admissionDate;
                                }
                                
                                // No permitir actualizar el balance desde aquí; se maneja en transacciones
                                delete updateData.balance;
                                
                                // Asegurar que status se actualice si viene
                                if (typedStudentData.status) {
                                    updateData.status = typedStudentData.status;
                                }
                                
                                await existingStudent.update(updateData, { transaction });
                                updatedStudentIds.push(typedStudentData.id);
                            }
                        } else if (!typedStudentData.id && typedStudentData.identityCard && typedStudentData.fullName) {
                            // Crear nuevo estudiante
                            const existingStudentById = await Student.findOne({
                                where: { identityCard: typedStudentData.identityCard },
                                transaction
                            });
                            
                            if (!existingStudentById) {
                                const studentCreateData = {
                                    fullName: typedStudentData.fullName,
                                    identityCard: typedStudentData.identityCard,
                                    birthDate: new Date(typedStudentData.birthDate),
                                    state: typedStudentData.state,
                                    zone: typedStudentData.zone,
                                    addressDescription: typedStudentData.addressDescription,
                                    phone: typedStudentData.phone || '',
                                    nationality: typedStudentData.nationality,
                                    birthCountry: typedStudentData.birthCountry,
                                    hasAllergies: typedStudentData.hasAllergies || false,
                                    allergiesDescription: typedStudentData.allergiesDescription || '',
                                    hasDiseases: typedStudentData.hasDiseases || false,
                                    diseasesDescription: typedStudentData.diseasesDescription || '',
                                    emergencyContact: typedStudentData.emergencyContact,
                                    emergencyPhone: typedStudentData.emergencyPhone,
                                    status: typedStudentData.status || 'pendiente',
                                    admissionDate: typedStudentData.admissionDate ? 
                                        new Date(typedStudentData.admissionDate) : new Date(),
                                    initialSchoolYear: typedStudentData.initialSchoolYear || 
                                        new Date().getFullYear().toString(),
                                    currentGrade: typedStudentData.currentGrade || 'En asignar',
                                    section: typedStudentData.section || 'Pendiente',
                                    representativeId: representative.id!,
                                    userId: ResultadoDB.id!,
                                    balance: 0 // nuevo estudiante inicia con balance 0
                                };

                                const newStudent = await Student.create(studentCreateData, { transaction });
                                updatedStudentIds.push(newStudent.id!);
                            }
                        }
                    }
                    
                    // Opcional: Eliminar estudiantes que no están en el request
                    // (comentado como antes)
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
            const nivelFilter = req.query.nivelFilter as string || 'all';
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

            // Construir opciones de consulta PRINCIPAL
            const queryOptions: FindAndCountOptions<typeuserlogin_full> = {
                limit,
                offset,
                attributes: { exclude: ['userpass'] },
                include: [
                    {
                        model: Representative,
                        as: 'representative',
                        required: false,
                        include: [
                            {
                                model: Student,
                                as: 'students',
                                required: false,
                                attributes: [
                                    'id', 'fullName', 'identityCard', 'birthDate', 'status', 
                                    'emergencyContact', 'emergencyPhone', 'currentGrade', 'section',
                                    'balance' // ✅ Campo balance incluido
                                ]
                            }
                        ]
                    }
                ]
            };

            queryOptions.order = [[config.field, config.orderDirection]];
            
            // Construir condiciones de búsqueda
            const whereConditions: any = {};
            
            // Filtrar por nivel si no es 'all'
            if (nivelFilter !== 'all') {
                whereConditions.nivel = nivelFilter;
            }
            
            // Agregar búsqueda por texto
            if (DeBus) {
                whereConditions[Op.or] = [
                    { usermail: { [Op.iLike]: `%${DeBus}%` } },
                    { userlogin: { [Op.iLike]: `%${DeBus}%` } },
                    { username: { [Op.iLike]: `%${DeBus}%` } }
                ];
                
                // Para representantes, también buscar en representante y cédula
                if (nivelFilter === '1' || nivelFilter === 'all') {
                    const repCondition = {
                        model: Representative,
                        as: 'representative',
                        required: false,
                        where: {
                            [Op.or]: [
                                { fullName: { [Op.iLike]: `%${DeBus}%` } },
                                { identityCard: { [Op.iLike]: `%${DeBus}%` } }
                            ]
                        }
                    };
                    
                    if (!queryOptions.include) queryOptions.include = [];
                    const existingInclude = queryOptions.include as any[];
                    
                    const repIndex = existingInclude.findIndex((inc: any) => inc.as === 'representative');
                    if (repIndex !== -1) {
                        existingInclude[repIndex] = repCondition;
                    }
                }
            }
            
            if (Object.keys(whereConditions).length > 0) {
                queryOptions.where = whereConditions;
            }

            // Ejecutar la consulta principal
            const { count, rows } = await UserLogin.findAndCountAll(queryOptions);

            // ✅ Transformar la respuesta para incluir el balance total del representante
            const transformedRows = rows.map(user => {
                const userJson = user.toJSON() as any;
                if (userJson.representative && userJson.representative.students) {
                    const totalBalance = userJson.representative.students.reduce(
                        (sum: number, student: any) => sum + (student.balance || 0), 
                        0
                    );
                    // Agregar balance calculado al objeto representative
                    userJson.representative.balance = totalBalance;
                    userJson.representative.balanceFormatted = new Intl.NumberFormat('es-VE', {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: 2
                    }).format(totalBalance);
                    userJson.representative.balanceStatus = totalBalance < 0 ? 'debt' : totalBalance > 0 ? 'credit' : 'zero';
                }
                return userJson;
            });

            res.status(200).json({
                result: true,
                content: transformedRows,
                pagination: {
                    totalRecords: count,
                    currentPage: page,
                    totalPages: Math.ceil(count / limit),
                },
                error: []
            });

        } catch (error: any) {
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

    //#region: Estadísticas del Sistema - CORREGIDO
    static getStatistics = async (req: Request, res: Response) => {
        try {
            const totalUsers = await UserLogin.count();
            const activeUsers = await UserLogin.count({ where: { userstatus: true } });
            const totalStudents = await Student.count();
            const activeStudents = await Student.count({ where: { status: 'regular' } });
            const totalTeachers = await Teacher.count();
            const totalRepresentatives = await Representative.count();
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
                },
                teachers: {
                    total: totalTeachers
                },
                representatives: {
                    total: totalRepresentatives
                },
                summary: {
                    totalUsers: totalUsers,
                    totalStudents: totalStudents,
                    totalTeachers: totalTeachers,
                    totalRepresentatives: totalRepresentatives
                }
            };

            res.status(200).json({ 
                result: true, 
                content: result, 
                error: [] 
            });
        } catch (error) {
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getStatistics"));
            res.status(500).json({ 
                result: false, 
                content: [], 
                error: ['Error obteniendo estadísticas'] 
            });
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
            
            // Crear estudiante con balance 0
            const newStudent = await Student.create({
                ...studentData,
                birthDate: new Date(studentData.birthDate),
                representativeId: representative.id,
                userId: user?.id,
                status: 'pendiente',
                admissionDate: new Date(),
                initialSchoolYear: new Date().getFullYear().toString(),
                currentGrade: studentData.currentGrade || 'En asignar',
                section: studentData.section || 'Pendiente',
                balance: 0
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
            // - Verificar si tiene pagos pendientes (balance distinto de cero)
            if (student.balance !== 0) {
                await transaction.rollback();
                res.status(400).json({ 
                    result: false, 
                    content: [], 
                    error: [`No se puede eliminar el estudiante ${student.fullName} porque tiene un balance de ${student.balance}`] 
                });
                return;
            }
            
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
    
    //#region: Obtener lista de estudiantes (para dashboard)
    static listStudents = async (req: Request, res: Response) => {
        try {
            const { page = 1, limit = 100, status, search } = req.query;
            const offset = (Number(page) - 1) * Number(limit);
            
            const where: any = {};
            
            if (status) {
                where.status = status;
            }
            
            if (search && typeof search === 'string') {
                where[Op.or] = [
                    { fullName: { [Op.iLike]: `%${search}%` } },
                    { identityCard: { [Op.iLike]: `%${search}%` } },
                    { currentGrade: { [Op.iLike]: `%${search}%` } }
                ];
            }
            
            const { count, rows: students } = await Student.findAndCountAll({
                where,
                limit: Number(limit),
                offset,
                order: [['fullName', 'ASC']],
                attributes: ['id', 'fullName', 'identityCard', 'birthDate', 'status', 'currentGrade', 'section', 'createdAt', 'balance'],
                include: [{
                    model: Representative,
                    as: 'representative',
                    attributes: ['id', 'fullName', 'identityCard']
                }]
            });
            
            res.status(200).json({
                result: true,
                content: students,
                pagination: {
                    totalRecords: count,
                    currentPage: Number(page),
                    totalPages: Math.ceil(count / Number(limit)),
                },
                error: []
            });
            
        } catch (error: any) {
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("listStudents"));
            res.status(500).json({ 
                result: false, 
                content: [], 
                error: ['Error al obtener estudiantes'] 
            });
        }
    };
    //#endregion
    
    //#region: Estadísticas de usuarios (para dashboard)
    static getUserStatistics = async (req: Request, res: Response) => {
        try {
            const totalUsers = await UserLogin.count();
            const totalStudents = await Student.count();
            const totalTeachers = await Teacher.count();
            const totalRepresentatives = await Representative.count();
            
            res.status(200).json({
                result: true,
                content: {
                    users: {
                        total: totalUsers,
                        students: totalStudents,
                        teachers: totalTeachers,
                        representatives: totalRepresentatives
                    },
                    summary: {
                        totalUsers,
                        totalStudents,
                        totalTeachers,
                        totalRepresentatives
                    }
                },
                error: []
            });
        } catch (error) {
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("getUserStatistics"));
            res.status(500).json({ 
                result: false, 
                content: [], 
                error: ['Error al obtener estadísticas'] 
            });
        }
    };
    //#endregion
    // En src/controllers/UserController.ts
static updateExoneration = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { exonerationPercent } = req.body;
    const student = await Student.findByPk(id);
    if (!student) {
      return res.status(404).json({ result: false, error: ['Estudiante no encontrado'] });
    }
    student.exonerationPercent = exonerationPercent;
    await student.save();
    res.json({ result: true, content: [`Exoneración actualizada a ${exonerationPercent}%`], error: [] });
  } catch (error: any) {
    ErrorLog.createErrorLog(error, 'Server', getErrorLocation("updateExoneration"));
    res.status(500).json({ result: false, content: [], error: ['Error al actualizar exoneración'] });
  }
};
}
