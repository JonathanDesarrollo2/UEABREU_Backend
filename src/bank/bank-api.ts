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
  BankInfo,
} from './Types';

class BankCrypto {
  private static readonly SALT = Buffer.from([
    0x49, 0x76, 0x61, 0x6e, 0x20, 0x4d, 0x65, 0x64, 0x76, 0x65, 0x64, 0x65, 0x76,
  ]);

  static deriveKeyAndIV(encryptionKey: string): { key: Buffer; iv: Buffer } {
    const derived = crypto.pbkdf2Sync(encryptionKey, this.SALT, 1000, 48, 'sha1');
    return { key: derived.subarray(0, 32), iv: derived.subarray(32, 48) };
  }

  static encryptAES(plainText: string, key: Buffer, iv: Buffer): string {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(plainText, 'utf16le', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
  }

  static decryptAES(encryptedBase64: string, key: Buffer, iv: Buffer): string {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedBase64, 'base64', 'utf16le');
    decrypted += decipher.final('utf16le');
    return decrypted;
  }

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

  private generateReference(): string {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    const timeStr = `${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    const ms = now.getMilliseconds().toString().padStart(3, '0');
    this.referenceCounter = (this.referenceCounter + 1) % 10000;
    const counter = this.referenceCounter.toString().padStart(4, '0');
    return `REF${dateStr}${timeStr}${ms}${counter}`;
  }

  private async sendRequest<T>(endpoint: string, payload: object, useMasterKey: boolean = false): Promise<T> {
    if (process.env.BNC_TEST_MODE === 'true') {
      return this.getMockResponse<T>(endpoint, payload);
    }

    const encryptionKey = useMasterKey ? this.masterKey : this.workingKey;
    if (!encryptionKey) throw new Error('No hay clave de encriptación disponible');

    const { key, iv } = BankCrypto.deriveKeyAndIV(encryptionKey);
    const payloadJson = JSON.stringify(payload);
    const valueEncrypted = BankCrypto.encryptAES(payloadJson, key, iv);
    const validationHash = BankCrypto.encryptSHA256(payloadJson);

    const requestBody = {
      ClientGUID: this.clientGUID,
      Reference: this.generateReference(),
      Value: valueEncrypted,
      Validation: validationHash,
      swTestOperation: false,
    };

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorBody = '';
      try { errorBody = await response.text(); } catch { errorBody = '(sin body)'; }

      console.error(`🚨 [BNC] HTTP ${response.status} en ${endpoint}`);
      console.error(`🚨 [BNC] Body: ${errorBody}`);

      if (response.status === 409 && endpoint === '/Auth/LogOn') {
        this.workingKey = null;
      }

      throw new Error(`HTTP error! status: ${response.status}${errorBody ? ` - ${errorBody}` : ''}`);
    }

    const bankResponse = (await response.json()) as BankApiResponse;

    if (bankResponse.status !== 'OK') {
      if (bankResponse.message.includes('RWK')) {
        await this.authenticate();
        return this.sendRequest<T>(endpoint, payload, useMasterKey);
      }
      throw new Error(bankResponse.message || 'Error en respuesta del banco');
    }

    try {
      const decryptedValue = BankCrypto.decryptAES(bankResponse.value!, key, iv);
      return JSON.parse(decryptedValue) as T;
    } catch {
      throw new Error('Error al desencriptar la respuesta del banco');
    }
  }

  private getMockResponse<T>(endpoint: string, payload: any): T {
    if (endpoint === '/Auth/LogOn') {
      this.workingKey = 'mock-working-key-' + Date.now();
      return { WorkingKey: this.workingKey } as T;
    }
    if (endpoint === '/Services/BCVRates') {
      const today = new Date();
      const formattedDate = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
      const randomRate = 35 + Math.random() * 3;
      return { PriceRateBCV: parseFloat(randomRate.toFixed(6)), dtRate: formattedDate } as T;
    }
    if (endpoint === '/Services/Banks') return this.getMockBanksList() as T;

    const movementExists = Math.random() > 0.3;
    return {
      MovementExists: movementExists,
      Date: movementExists ? new Date().toISOString().split('T')[0] : '',
      ControlNumber: movementExists ? `MOCK-${Date.now()}` : '',
      Amount: payload.Amount || 0.01,
      BankCode: '0191',
      Code: movementExists ? '200' : '404',
      DebtorInstrument: null,
      Concept: movementExists ? `Pago de prueba` : '',
      DebitAccount: payload.AccountNumber || '01910107012100104749',
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

  private getMockBanksList(): BankInfo[] {
    return [
      { Name: "Banco Nacional de Crédito, C.A. Banco Universal", Code: "0191", Services: "TRF, P2P" },
      { Name: "Banco de Venezuela", Code: "0102", Services: "TRF, P2P" },
      { Name: "Banco Mercantil, C.A.", Code: "0105", Services: "TRF, P2P" },
      { Name: "BBVA Provincial", Code: "0108", Services: "TRF, P2P" },
      { Name: "Bancaribe", Code: "0114", Services: "TRF, P2P" },
      { Name: "Banco Exterior", Code: "0115", Services: "TRF, P2P" },
      { Name: "Banesco Banco Universal", Code: "0134", Services: "TRF, P2P" },
      { Name: "Banco del Tesoro", Code: "0163", Services: "TRF, P2P" },
      { Name: "Banco Bicentenario", Code: "0175", Services: "TRF, P2P" },
    ];
  }

  async authenticate(): Promise<string> {
    const maxAttempts = 3;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (!this.masterKey) throw new Error('MasterKey no configurada');
        const payload = { ClientGUID: this.clientGUID };
        const response = await this.sendRequest<BankLogOnResponse>('/Auth/LogOn', payload, true);
        this.workingKey = response.WorkingKey;
        console.log(`✅ [BNC] LogOn exitoso (intento ${attempt})`);
        return this.workingKey;
      } catch (error: any) {
        lastError = error;
        const is409 = typeof error.message === 'string' && error.message.includes('409');
        console.warn(`⚠️ [BNC] LogOn intento ${attempt}/${maxAttempts} falló: ${error.message}`);
        if (is409 && attempt < maxAttempts) {
          const delay = attempt * 2000;
          console.log(`⏳ [BNC] Sesión previa activa. Reintentando en ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        break;
      }
    }

    if (process.env.BNC_TEST_MODE === 'true') {
      this.workingKey = 'test-fallback-key-' + Date.now();
      return this.workingKey;
    }

    throw new Error(`Error en autenticación: ${lastError?.message || 'desconocido'}`);
  }

  async getBCVRate(): Promise<BCVRateResponse> {
    try {
      if (!this.workingKey) await this.authenticate();
      return await this.sendRequest<BCVRateResponse>('/Services/BCVRates', {});
    } catch (error: any) {
      if (process.env.BNC_TEST_MODE === 'true') return this.getMockResponse('/Services/BCVRates', {});
      throw new Error(`Error obteniendo tasa BCV: ${error.message}`);
    }
  }

  async getBanksList(): Promise<BankInfo[]> {
    try {
      if (!this.workingKey) await this.authenticate();
      return await this.sendRequest<BankInfo[]>('/Services/Banks', {});
    } catch (error: any) {
      if (process.env.BNC_TEST_MODE === 'true') return this.getMockBanksList();
      throw new Error(`Error obteniendo lista de bancos: ${error.message}`);
    }
  }

  async validateP2P(data: ValidateP2PRequest): Promise<ValidationResponse> {
    try {
      if (!this.workingKey) await this.authenticate();
      return await this.sendRequest<ValidationResponse>('/Position/ValidateP2P', data);
    } catch (error: any) {
      if (process.env.BNC_TEST_MODE === 'true') return this.getMockResponse('/Position/ValidateP2P', data);
      throw new Error(`Error en validación P2P: ${error.message}`);
    }
  }

  async validateReference(data: ValidateReferenceRequest): Promise<ValidationResponse> {
    try {
      if (!this.workingKey) await this.authenticate();
      return await this.sendRequest<ValidationResponse>('/Position/Validate', data);
    } catch (error: any) {
      if (process.env.BNC_TEST_MODE === 'true') return this.getMockResponse('/Position/Validate', data);
      throw new Error(`Error en validación con referencia: ${error.message}`);
    }
  }

  async validateExistence(data: ValidateExistenceRequest): Promise<ValidationResponse> {
    try {
      if (!this.workingKey) await this.authenticate();
      return await this.sendRequest<ValidationResponse>('/Position/ValidateExistence', data);
    } catch (error: any) {
      if (process.env.BNC_TEST_MODE === 'true') return this.getMockResponse('/Position/ValidateExistence', data);
      throw new Error(`Error en validación de existencia: ${error.message}`);
    }
  }

  /**
   * Validación en cascada con DOS validaciones del banco:
   *   1. Validate (con referencia + monto + fecha)
   *   2. ValidateExistence (sin referencia + teléfono + banco + monto + fecha)
   *
   * Ambas deben encontrar el movimiento para considerar el pago verificado.
   * Si una falla o no encuentra → manual_review.
   */
  async cascadedValidation(validationData: any): Promise<CascadedValidationResult> {
    const SCHOOL_CLIENT_ID = 'J505275356';
    const SCHOOL_ACCOUNT = '01910107012100104749';

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
      const pad = (n: number) => n.toString().padStart(2, '0');

      if (!validationData.Reference || String(validationData.Reference).trim() === '') {
        result.overallResult = 'error';
        result.message = 'La referencia es obligatoria.';
        return result;
      }
      if (!validationData.PhoneNumber || String(validationData.PhoneNumber).trim() === '') {
        result.overallResult = 'error';
        result.message = 'El teléfono del pagador es obligatorio.';
        return result;
      }

      let movementDate: Date;
      if (validationData.RequestDate) {
        const parsed = new Date(validationData.RequestDate);
        movementDate = !isNaN(parsed.getTime()) ? parsed : new Date();
      } else {
        movementDate = new Date();
      }
      const formattedDate = `${movementDate.getFullYear()}/${pad(movementDate.getMonth() + 1)}/${pad(movementDate.getDate())}T${pad(movementDate.getHours())}:${pad(movementDate.getMinutes())}:${pad(movementDate.getSeconds())}`;

      if (!this.workingKey) await this.authenticate();

      const childClientID = validationData.ChildClientID?.trim() ? validationData.ChildClientID : undefined;
      const branchID = validationData.BranchID?.trim() ? validationData.BranchID : undefined;

      // ── 1. Validate (con referencia) ──
      try {
        const refPayload: any = {
          ClientID: SCHOOL_CLIENT_ID,
          AccountNumber: SCHOOL_ACCOUNT,
          Reference: String(validationData.Reference),
          Amount: Number(validationData.Amount),
          DateMovement: formattedDate,
        };
        if (childClientID) refPayload.ChildClientID = childClientID;
        if (branchID) refPayload.BranchID = branchID;

        console.log('🔍 [BNC] Validate payload:', JSON.stringify(refPayload));

        const refResult = await this.sendRequest<ValidationResponse>('/Position/Validate', refPayload);
        result.details.validateReference = {
          executed: true,
          success: true,
          movementExists: refResult.MovementExists,
          data: refResult,
        };
      } catch (error: any) {
        console.error(`🚨 [BNC] Validate falló:`, error.message);
        result.details.validateReference = {
          executed: true,
          success: false,
          movementExists: false,
          error: error.message,
        };
      }

      // ── 2. ValidateExistence (sin referencia) ──
      try {
        const existencePayload: any = {
          AccountNumber: SCHOOL_ACCOUNT,
          BankCode: validationData.BankCode,
          PhoneNumber: validationData.PhoneNumber,
          ClientID: SCHOOL_CLIENT_ID,
          RequestDate: formattedDate,
          Amount: Number(validationData.Amount),
        };
        if (childClientID) existencePayload.ChildClientID = childClientID;
        if (branchID) existencePayload.BranchID = branchID;

        console.log('🔍 [BNC] ValidateExistence payload:', JSON.stringify(existencePayload));

        const existenceResult = await this.sendRequest<ValidationResponse>('/Position/ValidateExistence', existencePayload);
        result.details.validateExistence = {
          executed: true,
          success: true,
          movementExists: existenceResult.MovementExists,
          data: existenceResult,
        };
      } catch (error: any) {
        console.error(`🚨 [BNC] ValidateExistence falló:`, error.message);
        result.details.validateExistence = {
          executed: true,
          success: false,
          movementExists: false,
          error: error.message,
        };
      }

      // ── Decisión final: AMBAS deben encontrar ──
      const refOk = result.details.validateReference.movementExists;
      const existOk = result.details.validateExistence.movementExists;

      if (refOk && existOk) {
        result.overallResult = 'success';
        result.message = 'Pago verificado exitosamente por referencia y por existencia.';
      } else if (refOk && !existOk) {
        // Muy probablemente el pago NO es P2P (es PMPC, C2P, transferencia, etc.)
        // y ValidateExistence solo cubre P2P. Se reporta para revisión manual.
        result.overallResult = 'manual_review';
        result.message = 'El pago se encontró por referencia, pero el banco no lo reconoce como P2P (ValidateExistence). Probablemente sea un pago PMPC/C2P/transferencia, que requiere verificación manual.';
      } else if (!refOk && existOk) {
        result.overallResult = 'manual_review';
        result.message = 'El pago se encontró por teléfono/banco, pero la referencia no coincidió. Verificación manual requerida.';
      } else {
        result.overallResult = 'manual_review';
        result.message = 'No se encontró el movimiento en ninguna validación. Verifique los datos o contacte al administrador.';
      }

      return result;
    } catch (error: any) {
      result.overallResult = 'error';
      result.message = `Error crítico: ${error.message}`;
      return result;
    }
  }

  async getWelcome(): Promise<BankWelcomeResponse> {
    try {
      const response = await fetch(`${this.baseURL}/welcome/home`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      return { message: text, service: 'BNC Electronic Payments Interface', version: 'v1.1', timestamp: new Date().toISOString() };
    } catch (error: any) {
      throw new Error(`Error conectando al banco: ${error.message}`);
    }
  }

  async testConnection(): Promise<BankHealthResponse> {
    try {
      const response = await fetch(`${this.baseURL}/welcome/home`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { service: 'BNC API Integration', status: 'Connected', timestamp: new Date().toISOString(), environment: process.env.NODE_ENV || 'development' };
    } catch (error: any) {
      throw new Error(`Error probando conexión: ${error.message}`);
    }
  }

  get isAuthenticated(): boolean { return !!this.workingKey; }
  getWorkingKey(): string | null { return this.workingKey; }
  resetAuthentication(): void { this.workingKey = null; }
}