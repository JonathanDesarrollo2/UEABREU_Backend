// src/bank/bank-api.ts
import { 
  BankApiResponse, 
  BankWelcomeResponse, 
  BankHealthResponse,
  BankLogOnRequest,
  BankLogOnResponse,
  ValidateP2PRequest,
  ValidateReferenceRequest,
  ValidateExistenceRequest,
  ValidationResponse,
  CascadedValidationResult
} from './Types';

export class BankAPI {
  private baseURL: string;
  private clientGUID: string;
  private masterKey: string;
  private workingKey: string | null = null;

  constructor() {
    this.baseURL = process.env.BNC_BASE_URL || 'https://servicios.bncenlinea.com:16500/api';
    this.clientGUID = process.env.BNC_CLIENT_GUID || '4A074C46-DD4E-4E54-8010-B80A6A8758F4';
    this.masterKey = process.env.BNC_MASTER_KEY || 'tu-master-key-aqui';
  }

  // Método para realizar LogOn y obtener WorkingKey
  async authenticate(): Promise<string> {
    try {
      if (process.env.BNC_TEST_MODE === 'true') {
        console.log('🔐 MODO PRUEBA: Simulando autenticación con banco');
        this.workingKey = 'test-working-key-' + Date.now();
        return this.workingKey;
      }

      const logOnRequest: BankLogOnRequest = {
        ClientGUID: this.clientGUID
      };

      console.log('🔐 Iniciando autenticación con banco...');

      const response = await fetch(`${this.baseURL}/Auth/LogOn`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logOnRequest)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as BankLogOnResponse;
      
      if (!data.WorkingKey) {
        throw new Error('WorkingKey no recibido en la respuesta');
      }

      this.workingKey = data.WorkingKey;
      
      console.log('✅ Autenticación con banco exitosa');
      return this.workingKey;

    } catch (error: any) {
      console.error('❌ Error en autenticación con banco:', error);
      
      if (process.env.BNC_TEST_MODE === 'true') {
        console.log('🔄 MODO PRUEBA: Continuando con clave simulada');
        this.workingKey = 'test-fallback-key-' + Date.now();
        return this.workingKey;
      }
      
      throw new Error(`Failed to authenticate with bank: ${error.message}`);
    }
  }

  // Validación P2P
  async validateP2P(validationData: ValidateP2PRequest): Promise<ValidationResponse> {
    try {
      if (!this.workingKey) {
        await this.authenticate();
      }

      console.log('🔍 Validando P2P:', {
        account: validationData.AccountNumber,
        reference: validationData.Reference,
        amount: validationData.Amount
      });

      if (process.env.BNC_TEST_MODE === 'true') {
        console.log('🔍 MODO PRUEBA: Simulando validación P2P');
        return this.getMockValidationResponse('P2P');
      }

      const response = await fetch(`${this.baseURL}/Position/ValidateP2P`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validationData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const bankResponse = await response.json() as BankApiResponse;
      
      console.log('📨 Respuesta P2P:', {
        status: bankResponse.status,
        message: bankResponse.message
      });

      return await this.decryptResponse(bankResponse);

    } catch (error: any) {
      console.error('❌ Error validando P2P:', error);
      
      if (process.env.BNC_TEST_MODE === 'true') {
        console.log('🔍 MODO PRUEBA: Devolviendo respuesta mock por error');
        return this.getMockValidationResponse('P2P');
      }
      
      throw new Error(`P2P validation failed: ${error.message}`);
    }
  }

  // Validación con Referencia
  async validateReference(validationData: ValidateReferenceRequest): Promise<ValidationResponse> {
    try {
      if (!this.workingKey) {
        await this.authenticate();
      }

      console.log('🔍 Validando con Referencia:', {
        account: validationData.AccountNumber,
        reference: validationData.Reference,
        amount: validationData.Amount
      });

      if (process.env.BNC_TEST_MODE === 'true') {
        console.log('🔍 MODO PRUEBA: Simulando validación con referencia');
        return this.getMockValidationResponse('REFERENCE');
      }

      const response = await fetch(`${this.baseURL}/Position/Validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validationData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const bankResponse = await response.json() as BankApiResponse;
      
      console.log('📨 Respuesta Referencia:', {
        status: bankResponse.status,
        message: bankResponse.message
      });

      return await this.decryptResponse(bankResponse);

    } catch (error: any) {
      console.error('❌ Error validando con referencia:', error);
      
      if (process.env.BNC_TEST_MODE === 'true') {
        console.log('🔍 MODO PRUEBA: Devolviendo respuesta mock por error');
        return this.getMockValidationResponse('REFERENCE');
      }
      
      throw new Error(`Reference validation failed: ${error.message}`);
    }
  }

  // Validación de Existencia (sin referencia)
  async validateExistence(validationData: ValidateExistenceRequest): Promise<ValidationResponse> {
    try {
      if (!this.workingKey) {
        await this.authenticate();
      }

      console.log('🔍 Validando Existencia:', {
        account: validationData.AccountNumber,
        phone: validationData.PhoneNumber,
        amount: validationData.Amount
      });

      if (process.env.BNC_TEST_MODE === 'true') {
        console.log('🔍 MODO PRUEBA: Simulando validación de existencia');
        return this.getMockValidationResponse('EXISTENCE');
      }

      const response = await fetch(`${this.baseURL}/Position/ValidateExistence`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validationData)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const bankResponse = await response.json() as BankApiResponse;
      
      console.log('📨 Respuesta Existencia:', {
        status: bankResponse.status,
        message: bankResponse.message
      });

      return await this.decryptResponse(bankResponse);

    } catch (error: any) {
      console.error('❌ Error validando existencia:', error);
      
      if (process.env.BNC_TEST_MODE === 'true') {
        console.log('🔍 MODO PRUEBA: Devolviendo respuesta mock por error');
        return this.getMockValidationResponse('EXISTENCE');
      }
      
      throw new Error(`Existence validation failed: ${error.message}`);
    }
  }

  // Validación en Cascada - Método principal que usarás
  async cascadedValidation(validationData: any): Promise<CascadedValidationResult> {
    console.log('🔄 Iniciando validación en cascada...');
    
    const result: CascadedValidationResult = {
      overallResult: 'error',
      message: '',
      details: {
        validateP2P: { executed: false, success: false, movementExists: false },
        validateReference: { executed: false, success: false, movementExists: false },
        validateExistence: { executed: false, success: false, movementExists: false }
      },
      timestamp: new Date().toISOString()
    };

    try {
      // 1. Primera validación: P2P
      try {
        const p2pData: ValidateP2PRequest = {
          AccountNumber: validationData.AccountNumber,
          BankCode: validationData.BankCode,
          PhoneNumber: validationData.PhoneNumber,
          ClientID: validationData.ClientID,
          Reference: validationData.Reference,
          RequestDate: validationData.RequestDate,
          Amount: validationData.Amount,
          ChildClientID: validationData.ChildClientID,
          BranchID: validationData.BranchID
        };

        const p2pResult = await this.validateP2P(p2pData);
        result.details.validateP2P = {
          executed: true,
          success: true,
          movementExists: p2pResult.MovementExists,
          data: p2pResult
        };

        if (p2pResult.MovementExists) {
          result.overallResult = 'success';
          result.message = '✅ Pago verificado exitosamente mediante validación P2P';
          console.log('✅ Validación P2P exitosa - Movimiento encontrado');
          return result;
        }
      } catch (p2pError: any) {
        result.details.validateP2P = {
          executed: true,
          success: false,
          movementExists: false,
          error: p2pError.message
        };
        console.log('⚠️ Validación P2P falló, continuando con siguiente método...');
      }

      // 2. Segunda validación: Con Referencia
      try {
        const referenceData: ValidateReferenceRequest = {
          ClientID: validationData.ClientID,
          AccountNumber: validationData.AccountNumber,
          Reference: validationData.Reference,
          Amount: validationData.Amount,
          DateMovement: validationData.RequestDate,
          ChildClientID: validationData.ChildClientID,
          BranchID: validationData.BranchID
        };

        const referenceResult = await this.validateReference(referenceData);
        result.details.validateReference = {
          executed: true,
          success: true,
          movementExists: referenceResult.MovementExists,
          data: referenceResult
        };

        if (referenceResult.MovementExists) {
          result.overallResult = 'success';
          result.message = '✅ Pago verificado exitosamente mediante validación con referencia';
          console.log('✅ Validación con Referencia exitosa - Movimiento encontrado');
          return result;
        }
      } catch (referenceError: any) {
        result.details.validateReference = {
          executed: true,
          success: false,
          movementExists: false,
          error: referenceError.message
        };
        console.log('⚠️ Validación con Referencia falló, continuando con siguiente método...');
      }

      // 3. Tercera validación: Existencia (sin referencia)
      try {
        const existenceData: ValidateExistenceRequest = {
          AccountNumber: validationData.AccountNumber,
          BankCode: validationData.BankCode,
          PhoneNumber: validationData.PhoneNumber,
          ClientID: validationData.ClientID,
          RequestDate: validationData.RequestDate,
          Amount: validationData.Amount,
          ChildClientID: validationData.ChildClientID,
          BranchID: validationData.BranchID
        };

        const existenceResult = await this.validateExistence(existenceData);
        result.details.validateExistence = {
          executed: true,
          success: true,
          movementExists: existenceResult.MovementExists,
          data: existenceResult
        };

        if (existenceResult.MovementExists) {
          result.overallResult = 'success';
          result.message = '✅ Pago verificado exitosamente mediante validación de existencia';
          console.log('✅ Validación de Existencia exitosa - Movimiento encontrado');
          return result;
        }
      } catch (existenceError: any) {
        result.details.validateExistence = {
          executed: true,
          success: false,
          movementExists: false,
          error: existenceError.message
        };
        console.log('⚠️ Validación de Existencia falló');
      }

      // Evaluar resultado final
      const anyMovementFound = 
        result.details.validateP2P.movementExists ||
        result.details.validateReference.movementExists || 
        result.details.validateExistence.movementExists;

      if (anyMovementFound) {
        result.overallResult = 'success';
        result.message = '✅ Pago verificado exitosamente';
      } else {
        const anyValidationExecuted = 
          result.details.validateP2P.executed ||
          result.details.validateReference.executed ||
          result.details.validateExistence.executed;

        if (anyValidationExecuted) {
          result.overallResult = 'manual_review';
          result.message = '⚠️ Hubo un problema, se verificará de manera manual. Ninguna validación automática encontró el movimiento.';
        } else {
          result.overallResult = 'error';
          result.message = '❌ Error: No se pudo ejecutar ninguna validación. Por favor contacte al administrador.';
        }
      }

      console.log('📊 Resultado final de validación en cascada:', result.overallResult);
      return result;

    } catch (error: any) {
      console.error('💥 Error crítico en validación en cascada:', error);
      
      result.overallResult = 'error';
      result.message = '❌ Error crítico en el proceso de validación. Por favor contacte al administrador.';
      
      return result;
    }
  }

  // Método placeholder para desencriptación
  private async decryptResponse(bankResponse: BankApiResponse): Promise<ValidationResponse> {
    console.log('🔓 Desencriptando respuesta (placeholder)...');
    
    // TODO: Implementar lógica real de desencriptación cuando tengas el MasterKey
    // Por ahora retornamos un mock
    return this.getMockValidationResponse();
  }

  // Respuesta mock para pruebas
  private getMockValidationResponse(type?: string): ValidationResponse {
    // Simular que a veces encuentra el movimiento y a veces no
    const movementExists = Math.random() > 0.3; // 70% de probabilidad de encontrar
    
    return {
      MovementExists: movementExists,
      Date: new Date().toISOString().split('T')[0],
      ControlNumber: `MOCK-${Date.now()}`,
      Amount: 0.01,
      BankCode: '0191',
      Code: movementExists ? '200' : '404',
      DebtorInstrument: null,
      Concept: `Pago ${type || 'generico'} de prueba`,
      DebitAccount: '01910001482101010049',
      Type: type || 'P2P',
      BalanceDelta: 'CREDIT',
      ReferenceA: '12345',
      ReferenceB: '',
      ReferenceC: '',
      ReferenceD: '',
      DebtorID: movementExists ? 'V123456789' : '',
      DebtorType: movementExists ? 'V' : ''
    };
  }

  // ... los demás métodos existentes (getWelcome, testConnection, etc.)
  async getWelcome(): Promise<BankWelcomeResponse> {
    try {
      const response = await fetch(`${this.baseURL}/welcome/home`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      
      return {
        message: text,
        service: 'BNC Electronic Payments Interface',
        version: 'v1.1',
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      console.error('Error calling bank welcome API:', error);
      throw new Error(`Failed to connect to bank API: ${error.message}`);
    }
  }

  async testConnection(): Promise<BankHealthResponse> {
    try {
      const response = await fetch(`${this.baseURL}/welcome/home`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return {
        service: 'BNC API Integration',
        status: 'Connected',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      };

    } catch (error: any) {
      console.error('Error testing bank connection:', error);
      throw new Error(`Bank connection test failed: ${error.message}`);
    }
  }

  // Getter para verificar estado de autenticación
  get isAuthenticated(): boolean {
    return !!this.workingKey;
  }
}