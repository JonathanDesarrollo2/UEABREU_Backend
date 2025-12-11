// src/bank/controllers/bank-controller.ts
import { Request, Response } from 'express';
import { BankAPI } from '../bank-api';
import { 
  ProxyResponse, 
  CascadedValidationResult,
  ValidateP2PRequest,
  ValidateReferenceRequest,
  ValidateExistenceRequest
} from '../Types';

export class BankController {
  private bankAPI: BankAPI;

  constructor() {
    this.bankAPI = new BankAPI();
  }

  /**
   * Obtener mensaje de bienvenida del banco
   */
  getBankWelcome = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('📨 Solicitando mensaje de bienvenida del banco...');
      
      const welcomeData = await this.bankAPI.getWelcome();
      
      const response: ProxyResponse<typeof welcomeData> = {
        result: true,
        content: welcomeData,
        error: []
      };

      console.log('✅ Mensaje de bienvenida obtenido exitosamente');
      res.json(response);

    } catch (error: any) {
      console.error('❌ Error obteniendo mensaje de bienvenida:', error);
      
      const response: ProxyResponse = {
        result: false,
        content: null,
        error: [error.message]
      };
      res.status(500).json(response);
    }
  };

  /**
   * Probar conexión con el banco
   */
  testBankConnection = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('🔗 Probando conexión con el banco...');
      
      const connectionData = await this.bankAPI.testConnection();
      
      const response: ProxyResponse<typeof connectionData> = {
        result: true,
        content: connectionData,
        error: []
      };

      console.log('✅ Conexión con el banco probada exitosamente');
      res.json(response);

    } catch (error: any) {
      console.error('❌ Error probando conexión con el banco:', error);
      
      const response: ProxyResponse = {
        result: false,
        content: null,
        error: [error.message]
      };
      res.status(500).json(response);
    }
  };

  /**
   * Obtener estado de salud del servicio bancario
   */
  getBankHealth = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('❤️  Solicitando estado de salud del banco...');
      
      const healthData = {
        service: 'BNC API Integration',
        status: 'Connected',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        authenticated: this.bankAPI.isAuthenticated,
        testMode: process.env.BNC_TEST_MODE === 'true'
      };

      const response: ProxyResponse<typeof healthData> = {
        result: true,
        content: healthData,
        error: []
      };

      console.log('✅ Estado de salud obtenido exitosamente');
      res.json(response);

    } catch (error: any) {
      console.error('❌ Error obteniendo estado de salud:', error);
      
      const response: ProxyResponse = {
        result: false,
        content: null,
        error: [error.message]
      };
      res.status(500).json(response);
    }
  };

  /**
   * Autenticación con el banco (LogOn)
   */
  bankLogOn = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('🔐 Iniciando autenticación con el banco...');
      
      const workingKey = await this.bankAPI.authenticate();
      
      const response: ProxyResponse<{ workingKey: string }> = {
        result: true,
        content: { workingKey },
        error: []
      };

      console.log('✅ Autenticación con el banco exitosa');
      res.json(response);

    } catch (error: any) {
      console.error('❌ Error en autenticación con el banco:', error);
      
      const response: ProxyResponse = {
        result: false,
        content: null,
        error: [error.message]
      };
      res.status(500).json(response);
    }
  };

  /**
   * Obtener tasa BCV del día
   */
  getBCVRate = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('💱 Solicitando tasa BCV del día...');
      
      const bcvRate = await this.bankAPI.getBCVRate();
      
      const response: ProxyResponse<typeof bcvRate> = {
        result: true,
        content: bcvRate,
        error: []
      };

      console.log(`✅ Tasa BCV obtenida: ${bcvRate.PriceRateBCV} Bs/USD (Fecha: ${bcvRate.dtRate})`);
      res.json(response);

    } catch (error: any) {
      console.error('❌ Error obteniendo tasa BCV:', error);
      
      const response: ProxyResponse = {
        result: false,
        content: null,
        error: [error.message]
      };
      res.status(500).json(response);
    }
  };

  /**
   * Validación en cascada - Método principal
   * Ejecuta las 3 validaciones secuencialmente hasta encontrar el movimiento
   */
  cascadedValidation = async (req: Request, res: Response): Promise<void> => {
    try {
      const validationData = req.body;
      
      console.log('🔄 Iniciando validación en cascada:', {
        account: validationData.AccountNumber,
        reference: validationData.Reference,
        amount: validationData.Amount,
        phone: validationData.PhoneNumber
      });

      const validationResult = await this.bankAPI.cascadedValidation(validationData);
      
      const response: ProxyResponse<CascadedValidationResult> = {
        result: true,
        content: validationResult,
        error: []
      };

      // Log del resultado final
      console.log(`📊 Resultado final de validación: ${validationResult.overallResult}`);
      console.log(`💬 Mensaje: ${validationResult.message}`);

      res.json(response);

    } catch (error: any) {
      console.error('💥 Error en validación en cascada:', error);
      
      const response: ProxyResponse = {
        result: false,
        content: null,
        error: [error.message]
      };
      res.status(500).json(response);
    }
  };

  /**
   * Validación P2P simple (mantener por compatibilidad)
   */
  validateP2P = async (req: Request, res: Response): Promise<void> => {
    try {
      const validationData: ValidateP2PRequest = req.body;
      
      console.log('🔍 Validación P2P simple:', {
        account: validationData.AccountNumber,
        reference: validationData.Reference,
        amount: validationData.Amount
      });

      const validationResult = await this.bankAPI.validateP2P(validationData);
      
      const response: ProxyResponse<typeof validationResult> = {
        result: true,
        content: validationResult,
        error: []
      };

      console.log(`📊 Resultado P2P: ${validationResult.MovementExists ? 'Movimiento encontrado' : 'Movimiento no encontrado'}`);
      res.json(response);

    } catch (error: any) {
      console.error('❌ Error en validación P2P:', error);
      
      const response: ProxyResponse = {
        result: false,
        content: null,
        error: [error.message]
      };
      res.status(500).json(response);
    }
  };

  /**
   * Validación con referencia específica
   */
  validateReference = async (req: Request, res: Response): Promise<void> => {
    try {
      const validationData: ValidateReferenceRequest = req.body;
      
      console.log('🔍 Validación con referencia:', {
        account: validationData.AccountNumber,
        reference: validationData.Reference,
        amount: validationData.Amount
      });

      const validationResult = await this.bankAPI.validateReference(validationData);
      
      const response: ProxyResponse<typeof validationResult> = {
        result: true,
        content: validationResult,
        error: []
      };

      console.log(`📊 Resultado con referencia: ${validationResult.MovementExists ? 'Movimiento encontrado' : 'Movimiento no encontrado'}`);
      res.json(response);

    } catch (error: any) {
      console.error('❌ Error en validación con referencia:', error);
      
      const response: ProxyResponse = {
        result: false,
        content: null,
        error: [error.message]
      };
      res.status(500).json(response);
    }
  };

  /**
   * Validación de existencia (sin referencia)
   */
  validateExistence = async (req: Request, res: Response): Promise<void> => {
    try {
      const validationData: ValidateExistenceRequest = req.body;
      
      console.log('🔍 Validación de existencia:', {
        account: validationData.AccountNumber,
        phone: validationData.PhoneNumber,
        amount: validationData.Amount
      });

      const validationResult = await this.bankAPI.validateExistence(validationData);
      
      const response: ProxyResponse<typeof validationResult> = {
        result: true,
        content: validationResult,
        error: []
      };

      console.log(`📊 Resultado de existencia: ${validationResult.MovementExists ? 'Movimiento encontrado' : 'Movimiento no encontrado'}`);
      res.json(response);

    } catch (error: any) {
      console.error('❌ Error en validación de existencia:', error);
      
      const response: ProxyResponse = {
        result: false,
        content: null,
        error: [error.message]
      };
      res.status(500).json(response);
    }
  };

  /**
   * Obtener información completa del estado del banco
   */
  getBankFullStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('📊 Solicitando estado completo del banco...');
      
      // Obtener múltiples datos en paralelo
      const [welcomeData, healthData, workingKey, bcvRate] = await Promise.allSettled([
        this.bankAPI.getWelcome(),
        this.bankAPI.testConnection(),
        this.bankAPI.authenticate().catch(() => null), // No fallar si la autenticación falla
        this.bankAPI.getBCVRate().catch(() => null)    // No fallar si BCV falla
      ]);

      const fullStatus = {
        welcome: welcomeData.status === 'fulfilled' ? welcomeData.value : { error: welcomeData.reason?.message },
        health: healthData.status === 'fulfilled' ? healthData.value : { error: healthData.reason?.message },
        bcvRate: bcvRate.status === 'fulfilled' ? bcvRate.value : { error: bcvRate.reason?.message },
        auth: {
          authenticated: !!workingKey,
          workingKey: workingKey ? 'Disponible' : 'No disponible',
          testMode: process.env.BNC_TEST_MODE === 'true'
        },
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      };

      const response: ProxyResponse<typeof fullStatus> = {
        result: true,
        content: fullStatus,
        error: []
      };

      console.log('✅ Estado completo del banco obtenido exitosamente');
      res.json(response);

    } catch (error: any) {
      console.error('❌ Error obteniendo estado completo del banco:', error);
      
      const response: ProxyResponse = {
        result: false,
        content: null,
        error: [error.message]
      };
      res.status(500).json(response);
    }
  };
}