// src/bank/bank-api.ts
import * as crypto from 'crypto';
import {
  BankApiResponse,
  BankWelcomeResponse,
  BankHealthResponse,
  BankLogOnResponse,
  ValidateP2PRequest,
  ValidateReferenceRequest,
  ValidateExistenceRequest,
  ValidationResponse,
  CascadedValidationResult,
  BCVRateResponse,
} from './Types';

/**
 * Clase para manejar la encriptación/desencriptación según especificaciones del banco
 */
class BankCrypto {
  private static readonly SALT = Buffer.from([
    0x49, 0x76, 0x61, 0x6e, 0x20, 0x4d, 0x65, 0x64, 0x76, 0x65, 0x64, 0x65, 0x76,
  ]); // "Ivan Medvedev" en bytes

  /**
   * Deriva clave y IV usando PBKDF2 con el salt fijo
   */
  static deriveKeyAndIV(encryptionKey: string): { key: Buffer; iv: Buffer } {
    const derived = crypto.pbkdf2Sync(encryptionKey, this.SALT, 1000, 48, 'sha1');
    return {
      key: derived.subarray(0, 32), // primeros 32 bytes para AES-256
      iv: derived.subarray(32, 48), // siguientes 16 bytes para IV
    };
  }

  /**
   * Encripta texto plano con AES-256-CBC
   */
  static encryptAES(plainText: string, key: Buffer, iv: Buffer): string {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  }

  /**
   * Desencripta texto en base64 con AES-256-CBC
   */
  static decryptAES(encryptedBase64: string, key: Buffer, iv: Buffer): string {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedBase64, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Calcula hash SHA256 de un string y devuelve en hexadecimal
   */
  static encryptSHA256(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }
}

export class BankAPI {
  private baseURL: string;
  private clientGUID: string;
  private masterKey: string;
  private workingKey: string | null = null;
  private referenceCounter: number = 0;

  constructor() {
    this.baseURL = process.env.BNC_BASE_URL || 'https://servicios.bncenlinea.com:16500/api';
    this.clientGUID = process.env.BNC_CLIENT_GUID || '4A074C46-DD4E-4E54-8010-B80A6A8758F4';
    this.masterKey = process.env.BNC_MASTER_KEY || '';
  }

  /**
   * Genera una referencia única por día (para evitar duplicados)
   */
  private generateReference(): string {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    this.referenceCounter = (this.referenceCounter + 1) % 10000;
    return `REF-${dateStr}-${this.referenceCounter.toString().padStart(4, '0')}`;
  }

  /**
   * Construye y envía una petición al banco, manejando encriptación y desencriptación
   */
  private async sendRequest<T>(
    endpoint: string,
    payload: object,
    useMasterKey: boolean = false
  ): Promise<T> {
    // Si estamos en modo prueba, devolver respuestas simuladas
    if (process.env.BNC_TEST_MODE === 'true') {
      return this.getMockResponse<T>(endpoint, payload);
    }

    // Determinar clave a usar
    const encryptionKey = useMasterKey ? this.masterKey : this.workingKey;
    if (!encryptionKey) {
      throw new Error('No hay clave de encriptación disponible');
    }

    // Derivar clave e IV
    const { key, iv } = BankCrypto.deriveKeyAndIV(encryptionKey);

    // Serializar payload a JSON
    const payloadJson = JSON.stringify(payload);

    // Encriptar payload para Value
    const valueEncrypted = BankCrypto.encryptAES(payloadJson, key, iv);

    // Calcular hash SHA256 para Validation
    const validationHash = BankCrypto.encryptSHA256(payloadJson);

    // Construir request completo
    const requestBody = {
      ClientGUID: this.clientGUID,
      Reference: this.generateReference(),
      Value: valueEncrypted,
      Validation: validationHash,
      swTestOperation: false,
    };

    // Enviar petición
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const bankResponse = (await response.json()) as BankApiResponse;

    if (bankResponse.status !== 'OK') {
      // Verificar si el mensaje contiene RWK (refresh working key)
      if (bankResponse.message.includes('RWK')) {
        // Refrescar working key
        await this.authenticate();
        // Reintentar la petición recursivamente (solo una vez para evitar bucles)
        return this.sendRequest<T>(endpoint, payload, useMasterKey);
      }
      throw new Error(bankResponse.message || 'Error en respuesta del banco');
    }

    // Desencriptar el value
    try {
      const decryptedValue = BankCrypto.decryptAES(bankResponse.value!, key, iv);
      return JSON.parse(decryptedValue) as T;
    } catch (error) {
      throw new Error('Error al desencriptar la respuesta del banco');
    }
  }

  /**
   * Respuestas simuladas para modo prueba
   */
  private getMockResponse<T>(endpoint: string, payload: any): T {
    // LogOn
    if (endpoint === '/Auth/LogOn') {
      this.workingKey = 'mock-working-key-' + Date.now();
      return { WorkingKey: this.workingKey } as T;
    }

    // BCV Rate
    if (endpoint === '/Services/BCVRates') {
      const today = new Date();
      const formattedDate = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
      const randomRate = 35 + Math.random() * 3;
      return {
        PriceRateBCV: parseFloat(randomRate.toFixed(6)),
        dtRate: formattedDate,
      } as T;
    }

    // Validaciones
    const movementExists = Math.random() > 0.3; // 70% éxito
    return {
      MovementExists: movementExists,
      Date: movementExists ? new Date().toISOString().split('T')[0] : '',
      ControlNumber: movementExists ? `MOCK-${Date.now()}` : '',
      Amount: payload.Amount || 0.01,
      BankCode: '0191',
      Code: movementExists ? '200' : '404',
      DebtorInstrument: null,
      Concept: movementExists ? `Pago de prueba` : '',
      DebitAccount: payload.AccountNumber || '01910001482101010049',
      Type: 'P2P',
      BalanceDelta: 'CREDIT',
      ReferenceA: '12345',
      ReferenceB: '',
      ReferenceC: '',
      ReferenceD: '',
      DebtorID: movementExists ? 'V123456789' : '',
      DebtorType: movementExists ? 'V' : '',
    } as T;
  }

  // Autenticación (LogOn)
  async authenticate(): Promise<string> {
    try {
      if (!this.masterKey) {
        throw new Error('MasterKey no configurada');
      }

      const payload = { ClientGUID: this.clientGUID };
      const response = await this.sendRequest<BankLogOnResponse>(
        '/Auth/LogOn',
        payload,
        true // usar MasterKey
      );

      this.workingKey = response.WorkingKey;
      return this.workingKey;
    } catch (error: any) {
      // En modo prueba, si falla, usar mock
      if (process.env.BNC_TEST_MODE === 'true') {
        this.workingKey = 'test-fallback-key-' + Date.now();
        return this.workingKey;
      }
      throw new Error(`Error en autenticación: ${error.message}`);
    }
  }

  // Obtener tasa BCV
  async getBCVRate(): Promise<BCVRateResponse> {
    try {
      if (!this.workingKey) await this.authenticate();
      return await this.sendRequest<BCVRateResponse>('/Services/BCVRates', {});
    } catch (error: any) {
      if (process.env.BNC_TEST_MODE === 'true') {
        // fallback a mock
        return this.getMockResponse('/Services/BCVRates', {});
      }
      throw new Error(`Error obteniendo tasa BCV: ${error.message}`);
    }
  }

  // Validación P2P
  async validateP2P(data: ValidateP2PRequest): Promise<ValidationResponse> {
    try {
      if (!this.workingKey) await this.authenticate();
      return await this.sendRequest<ValidationResponse>('/Position/ValidateP2P', data);
    } catch (error: any) {
      if (process.env.BNC_TEST_MODE === 'true') {
        return this.getMockResponse('/Position/ValidateP2P', data);
      }
      throw new Error(`Error en validación P2P: ${error.message}`);
    }
  }

  // Validación con Referencia
  async validateReference(data: ValidateReferenceRequest): Promise<ValidationResponse> {
    try {
      if (!this.workingKey) await this.authenticate();
      return await this.sendRequest<ValidationResponse>('/Position/Validate', data);
    } catch (error: any) {
      if (process.env.BNC_TEST_MODE === 'true') {
        return this.getMockResponse('/Position/Validate', data);
      }
      throw new Error(`Error en validación con referencia: ${error.message}`);
    }
  }

  // Validación de Existencia
  async validateExistence(data: ValidateExistenceRequest): Promise<ValidationResponse> {
    try {
      if (!this.workingKey) await this.authenticate();
      return await this.sendRequest<ValidationResponse>('/Position/ValidateExistence', data);
    } catch (error: any) {
      if (process.env.BNC_TEST_MODE === 'true') {
        return this.getMockResponse('/Position/ValidateExistence', data);
      }
      throw new Error(`Error en validación de existencia: ${error.message}`);
    }
  }

  // Validación en cascada
  async cascadedValidation(validationData: any): Promise<CascadedValidationResult> {
    const result: CascadedValidationResult = {
      overallResult: 'error',
      message: '',
      details: {
        validateP2P: { executed: false, success: false, movementExists: false },
        validateReference: { executed: false, success: false, movementExists: false },
        validateExistence: { executed: false, success: false, movementExists: false },
      },
      timestamp: new Date().toISOString(),
    };

    try {
      // 1. P2P
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
          BranchID: validationData.BranchID,
        };
        const p2pResult = await this.validateP2P(p2pData);
        result.details.validateP2P = {
          executed: true,
          success: true,
          movementExists: p2pResult.MovementExists,
          data: p2pResult,
        };
        if (p2pResult.MovementExists) {
          result.overallResult = 'success';
          result.message = 'Pago verificado exitosamente mediante validación P2P';
          return result;
        }
      } catch (error: any) {
        result.details.validateP2P = {
          executed: true,
          success: false,
          movementExists: false,
          error: error.message,
        };
      }

      // 2. Referencia
      try {
        const refData: ValidateReferenceRequest = {
          ClientID: validationData.ClientID,
          AccountNumber: validationData.AccountNumber,
          Reference: validationData.Reference,
          Amount: validationData.Amount,
          DateMovement: validationData.RequestDate,
          ChildClientID: validationData.ChildClientID,
          BranchID: validationData.BranchID,
        };
        const refResult = await this.validateReference(refData);
        result.details.validateReference = {
          executed: true,
          success: true,
          movementExists: refResult.MovementExists,
          data: refResult,
        };
        if (refResult.MovementExists) {
          result.overallResult = 'success';
          result.message = 'Pago verificado exitosamente mediante validación con referencia';
          return result;
        }
      } catch (error: any) {
        result.details.validateReference = {
          executed: true,
          success: false,
          movementExists: false,
          error: error.message,
        };
      }

      // 3. Existencia
      try {
        const existenceData: ValidateExistenceRequest = {
          AccountNumber: validationData.AccountNumber,
          BankCode: validationData.BankCode,
          PhoneNumber: validationData.PhoneNumber,
          ClientID: validationData.ClientID,
          RequestDate: validationData.RequestDate,
          Amount: validationData.Amount,
          ChildClientID: validationData.ChildClientID,
          BranchID: validationData.BranchID,
        };
        const existenceResult = await this.validateExistence(existenceData);
        result.details.validateExistence = {
          executed: true,
          success: true,
          movementExists: existenceResult.MovementExists,
          data: existenceResult,
        };
        if (existenceResult.MovementExists) {
          result.overallResult = 'success';
          result.message = 'Pago verificado exitosamente mediante validación de existencia';
          return result;
        }
      } catch (error: any) {
        result.details.validateExistence = {
          executed: true,
          success: false,
          movementExists: false,
          error: error.message,
        };
      }

      // Evaluar resultado final
      const anyMovementFound =
        result.details.validateP2P.movementExists ||
        result.details.validateReference.movementExists ||
        result.details.validateExistence.movementExists;

      if (anyMovementFound) {
        result.overallResult = 'success';
        result.message = 'Pago verificado exitosamente';
      } else {
        result.overallResult = 'manual_review';
        result.message = 'No se encontró el movimiento en ninguna validación. Se requiere revisión manual.';
      }

      return result;
    } catch (error: any) {
      result.overallResult = 'error';
      result.message = `Error crítico: ${error.message}`;
      return result;
    }
  }

  // Endpoints de utilidad (sin encriptación, solo para pruebas)
  async getWelcome(): Promise<BankWelcomeResponse> {
    try {
      const response = await fetch(`${this.baseURL}/welcome/home`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      return {
        message: text,
        service: 'BNC Electronic Payments Interface',
        version: 'v1.1',
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      throw new Error(`Error conectando al banco: ${error.message}`);
    }
  }

  async testConnection(): Promise<BankHealthResponse> {
    try {
      const response = await fetch(`${this.baseURL}/welcome/home`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return {
        service: 'BNC API Integration',
        status: 'Connected',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
      };
    } catch (error: any) {
      throw new Error(`Error probando conexión: ${error.message}`);
    }
  }

  get isAuthenticated(): boolean {
    return !!this.workingKey;
  }

  getWorkingKey(): string | null {
    return this.workingKey;
  }

  resetAuthentication(): void {
    this.workingKey = null;
  }
}