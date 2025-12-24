//#region Import
import type { Request, Response, NextFunction } from "express";
import { FindAndCountOptions, Op, WhereOptions } from 'sequelize';
import UserLogin from "../database/models/userlogin";
import { comparePass, HashPass } from "../utility/hashpass";
import { ErrorLog } from "../utility/ErrorLog";
import { getErrorLocation } from "../utility/callerinfo"; 
import { typeuserlogin_full, typeuserlogin_in, typeTokenData, typeuserlogin_active } from "../database/types/userlogin";
import { generateJWT } from "../utility/genToken";
import Student from "../database/models/student";
import Representative from "../database/models/representative";
import sequelize from "../database/config";

//#endregion

export class User {
//#region: Crear usuarios Nuevos post('/adduser')
static adduser = async (req: Request, res: Response) => {
    const transaction = await sequelize.transaction();
    
    try {
        // CORRECCIÓN: Extraer TODOS los campos correctamente
        const { 
            userpass, 
            userrepass, 
            representativeData, 
            studentsData, 
            ...userFields 
        }: typeuserlogin_full = req.body;
        
        console.log('📝 Datos recibidos en adduser:');
        console.log('- userFields:', userFields);
        console.log('- representativeData:', representativeData ? 'PRESENTE' : 'NO PRESENTE');
        console.log('- studentsData:', studentsData ? `Array de ${studentsData.length} estudiantes` : 'NO PRESENTE');

        // Verificar si el email ya existe
        if (userFields.usermail) {
            console.log('🔍 Buscando email:', userFields.usermail);
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
        console.log('👤 Creando usuario...');
        const newUser = await UserLogin.create({
            ...userFields,
            userpass: userpass,
            nivel: userFields.nivel || 1, // Por defecto nivel 1
            userstatus: userFields.userstatus !== undefined ? userFields.userstatus : true
        }, { transaction });

        console.log('✅ Usuario creado:', newUser.id);
        console.log('🔍 Nivel del usuario:', newUser.nivel);

        // ========== CRÍTICO: Verificar si hay datos de representante ==========
        // Si es representante (nivel 1) Y hay datos de representante
        if (newUser.nivel === 1 && representativeData) {
            console.log('🎯 Nivel 1 con representativeData detectado, procesando como representante...');
            
            if (!representativeData || !representativeData.identityCard) {
                console.log('⚠️  No hay datos suficientes del representante');
                // No hacemos rollback porque el usuario ya se creó
                // Continuamos sin crear representante
            } else {
                // Verificar si la cédula del representante ya existe
                console.log('🔍 Verificando cédula del representante:', representativeData.identityCard);
                const existingRep = await Representative.findOne({ 
                    where: { identityCard: representativeData.identityCard },
                    transaction
                });
                
                if (existingRep) {
                    console.log('⚠️  Cédula de representante ya existe');
                    // No hacemos rollback, solo registramos el warning
                } else {
                    // Crear el representante CON SALDO
                    console.log('👨‍👩‍👧‍👦 Creando representante...');
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

                        console.log(`💰 Representante creado con saldo: ${newRepresentative.balanceFormatted}`);
                        console.log('✅ ID del representante:', newRepresentative.id);

                        // ========== CREAR ESTUDIANTES ==========
                        if (studentsData && Array.isArray(studentsData) && studentsData.length > 0) {
                            console.log(`🎓 Creando ${studentsData.length} estudiante(s)...`);
                            let createdCount = 0;
                            
                            for (const studentData of studentsData) {
                                if (!studentData.identityCard || !studentData.fullName) {
                                    console.log('⚠️  Estudiante sin cédula o nombre, omitiendo');
                                    continue;
                                }

                                // Verificar si la cédula del estudiante ya existe
                                const existingStudent = await Student.findOne({
                                    where: { identityCard: studentData.identityCard },
                                    transaction
                                });
                                
                                if (existingStudent) {
                                    console.log(`⚠️  Cédula ${studentData.identityCard} ya registrada, omitiendo`);
                                    continue;
                                }

                                try {
                                    const newStudent = await Student.create({
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
                                        currentGrade: 'Por asignar',
                                        section: 'Por asignar'
                                    }, { transaction });

                                    createdCount++;
                                    console.log(`✅ Estudiante ${createdCount} creado: ${newStudent.fullName}`);
                                } catch (studentError: any) {
                                    console.error(`💥 Error creando estudiante ${studentData.fullName}:`, studentError.message);
                                    // Continuamos con el siguiente estudiante
                                }
                            }

                            console.log(`📊 Total estudiantes creados: ${createdCount}/${studentsData.length}`);
                        } else {
                            console.log('⚠️  No hay datos de estudiantes o el array está vacío');
                        }
                    } catch (repError: any) {
                        console.error('💥 Error creando representante:', repError.message);
                        // No hacemos rollback, continuamos sin representante
                    }
                }
            }
        } else {
            console.log('🎯 Usuario administrador o sin datos de representante - Solo cuenta creada');
        }

        // Confirmar transacción
        await transaction.commit();
        
        console.log('🎉 Proceso completado exitosamente');
        
        res.status(200).json({ 
            result: true, 
            content: [`Usuario Creado Exitosamente`], 
            error: [] 
        }); 
    } catch (error: any) {
        // Revertir transacción en caso de error
        await transaction.rollback();
        
        console.error('💥 ERROR en adduser:');
        console.error('Mensaje:', error.message);
        console.error('Stack:', error.stack);
        
        if (error.name === 'SequelizeValidationError') {
            console.error('Errores de validación:', error.errors.map((e: any) => ({
                campo: e.path,
                mensaje: e.message,
                valor: e.value
            })));
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
        try {
            const loginData: typeuserlogin_full = req.body;
            const ResultadoDB = await UserLogin.findOne({
                where: {
                    id: loginData.id
                }
            });
            
            if (!ResultadoDB) {
                res.status(202).json({ result: false, content: [], error: [`usuario: ${loginData.userlogin}, no encontrado`] });
                return;
            }
            
            await ResultadoDB.destroy();
            res.status(200).json({ result: true, content: [`El usuario: ${loginData.userlogin} fue eliminado exitosamente`], error: [] });
        } catch (error) {
            ErrorLog.createErrorLog(error, 'Server', getErrorLocation("removelogin"));
            res.status(500).json({ result: false, content: [], error: ['Error al eliminar el usuario'] });
        }
    };
    //#endregion

    //#region Actualizar Usuarios post('/updatelogin')
static updatelogin = async (req: Request, res: Response) => {
    try {
        const loginData: typeuserlogin_full = req.body;
        const ResultadoDB = await UserLogin.findOne({
            where: {
                id: loginData.id
            }
        });
        
        if (!ResultadoDB) {
            res.status(202).json({ result: false, content: [], error: [`usuario: ${loginData.userlogin}, no encontrado`] });
            return;
        }
        
        // ELIMINA ESTO - El hook @BeforeUpdate se encargará del hashing
        // if (loginData.userpass) {
        //     loginData.userpass = await HashPass(loginData.userpass);
        // }
        
        await ResultadoDB.update(loginData);
        res.status(200).json({ result: true, content: [`El Usuario ${loginData.userlogin}, fue actualizado exitosamente`], error: [] });
    } catch (error) {
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
        
        // Definir tipo para fieldConfig
        type FieldConfig = {
            [key: number]: {
                field: FieldKeys | 'createdAt';
                orderDirection: OrderDirection;
            };
        };

        // Validar parámetros
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 5;
        const idBus = parseInt(req.query.idBus as string, 10) || 1;
        const DeBus = (req.query.DeBus as string || '').trim();
        const offset = (page - 1) * limit;

        // Configuración de campos con tipo explícito
        const fieldConfig: FieldConfig = {
            1: { field: 'usermail', orderDirection: 'ASC' },
            2: { field: 'userlogin', orderDirection: 'ASC' },
            3: { field: 'username', orderDirection: 'ASC' },
            4: { field: 'createdAt', orderDirection: 'DESC' }
        };

        // Obtener configuración de ordenamiento de manera segura
        const config = fieldConfig[idBus] || { 
            field: 'createdAt' as const, 
            orderDirection: 'DESC' as OrderDirection 
        };

        // Construir consulta base
        const queryOptions: FindAndCountOptions<typeuserlogin_full> = {
            limit,
            offset,
            attributes: { exclude: ['userpass'] }, // Excluir contraseña por seguridad
        };

        // Ordenamiento
        queryOptions.order = [[config.field, config.orderDirection]];
        
        // Búsqueda
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
        console.error('Error detallado:', error);
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
    
    console.log('🔐 Intento de login:', {
      email: loginData.usermail,
      passwordLength: loginData.userpass?.length
    });

    const ResultadoDB = await UserLogin.findOne({
      where: {
        usermail: loginData.usermail
      }
    });
    
    console.log('📊 Resultado búsqueda usuario:', {
      encontrado: !!ResultadoDB,
      id: ResultadoDB?.id,
      email: ResultadoDB?.usermail,
      status: ResultadoDB?.userstatus
    });

    if (!ResultadoDB) {
      console.log('❌ Usuario no existe');
      ErrorLog.createErrorLog(`Credenciales invalidas, usuario no existe`, loginData.usermail, getErrorLocation("SesionIn"));
      res.status(429).json({ result: false, content: [], error: [`Credenciales invalidas`] });
      return;
    }
    
    if (!ResultadoDB.userstatus) {
      console.log('❌ Usuario inactivo');
      ErrorLog.createErrorLog(`Credenciales invalidas, usuario inactivo`, loginData.usermail, getErrorLocation("SesionIn"));
      res.status(429).json({ result: false, content: [], error: [`Credenciales no autorizada`] });
      return; 
    }
    
    // VERIFICACIÓN EXTRA: Mostrar el hash almacenado
    console.log('🔍 Hash almacenado en BD:', ResultadoDB.userpass);
    
    // Usar el método comparePassword del modelo
    console.log('🔑 Iniciando comparación de contraseñas...');
    const Comparacion = await ResultadoDB.comparePassword(loginData.userpass);
    console.log('🔑 Resultado comparación:', Comparacion);
    
    if (!Comparacion) {
      console.log('❌ Contraseña incorrecta');
      ErrorLog.createErrorLog(`Credenciales invalidas, las contraseñas no coinciden`, loginData.usermail, getErrorLocation("SesionIn"));
      res.status(429).json({ result: false, content: [], error: [`Credenciales invalidas`] });
      return; 
    }
    
    console.log('✅ Contraseña correcta, verificando datos...');
    
    // Verificar que las propiedades requeridas no sean undefined
    if (!ResultadoDB.id || !ResultadoDB.userlogin || !ResultadoDB.usermail || ResultadoDB.nivel === undefined) {
      console.log('❌ Datos de usuario incompletos');
      ErrorLog.createErrorLog(`Datos de usuario incompletos`, loginData.usermail, getErrorLocation("SesionIn"));
      res.status(500).json({ result: false, content: [], error: ['Error en los datos del usuario'] });
      return;
    }
    
    console.log('🎫 Generando JWT...');
    const jwtUser = generateJWT({ 
      id: ResultadoDB.id,                
      userlogin: ResultadoDB.userlogin,
      username: ResultadoDB.username,
      usermail: ResultadoDB.usermail,
      nivel: ResultadoDB.nivel
    });

    if (!jwtUser) {
      console.log('❌ Error generando JWT');
      res.status(500).json({ result: false, content: [], error: ['Error generando token de autenticación'] });
      return;
    }

    console.log('✅ Login exitoso!');
    res.status(200).json({ result: true, content: jwtUser, error: [] });
    
  } catch (error) {
    console.log('💥 Error en SesionIn:', error);
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
            where: { 
                id: tokenDataActive.id
            },
            attributes: ['id', 'userlogin', 'username', 'usermail', 'userstatus', 'nivel'],
            rejectOnEmpty: false
        });

        if (!userData || !userData.userstatus) {
            res.status(429).json({ result: false, content: [], error: ["Autenticación requerida. Por favor, inicie sesión nuevamente"] });
            return;
        }

        // Buscar información del estudiante si existe
        let studentInfo = null;
        try {
            studentInfo = await Student.findOne({
                where: { userId: tokenDataActive.id },
                attributes: ['id', 'fullName', 'status'] // Cambiado a 'fullName'
            });
        } catch (studentError) {
            // Si hay error buscando estudiante, continuar sin esa información
            console.log('No se pudo obtener información del estudiante:', studentError);
        }

        const EnviarUserActive: typeuserlogin_active = {
            sesionUser: userData.username || userData.userlogin,
            sesionEmail: userData.usermail,
            userStatus: userData.userstatus,
            nivel: userData.nivel,
            studentInfo: studentInfo ? {
                name: studentInfo.fullName, // Cambiado a fullName
                status: studentInfo.status === 'regular' // Convertir el enum a booleano
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
            // Conteos totales
            const totalUsers = await UserLogin.count();
            const activeUsers = await UserLogin.count({ where: { userstatus: true } });
            const totalStudents = await Student.count();
            const activeStudents = await Student.count({ where: { status: true } });

            // Usuarios por nivel
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
}