// src/bank/Types.ts
export interface BankApiResponse {
  status: 'OK' | 'KO';
  message: string;
  value?: string;
  validation?: string;
}

export interface BankWelcomeResponse {
  message: string;
  service: string;
  version: string;
  timestamp?: string;
}

export interface BankHealthResponse {
  service: string;
  status: string;
  timestamp: string;
  environment: string;
}

export interface ProxyResponse<T = any> {
  result: boolean;
  content: T;
  error: string[];
}

// Tipos para LogOn
export interface BankLogOnRequest {
  ClientGUID: string;
}

export interface BankLogOnResponse {
  WorkingKey: string;
}

// Tipos para las validaciones
export interface ValidateP2PRequest {
  AccountNumber: string;
  BankCode: number;
  PhoneNumber: string;
  ClientID: string;
  Reference: string;
  RequestDate: string;
  Amount: number;
  ChildClientID?: string;
  BranchID?: string;
}

export interface ValidateReferenceRequest {
  ClientID: string;
  AccountNumber: string;
  Reference: string;
  Amount: number;
  DateMovement: string;
  ChildClientID?: string;
  BranchID?: string;
}

export interface ValidateExistenceRequest {
  AccountNumber: string;
  BankCode: number;
  PhoneNumber: string;
  ClientID: string;
  RequestDate: string;
  Amount: number;
  ChildClientID?: string;
  BranchID?: string;
}

// Respuesta común para todas las validaciones
export interface ValidationResponse {
  MovementExists: boolean;
  Date: string;
  ControlNumber: string;
  Amount: number;
  BankCode: string;
  Code: string;
  DebtorInstrument: any;
  Concept: string;
  DebitAccount: string;
  Type: string;
  BalanceDelta: string;
  ReferenceA: string;
  ReferenceB: string;
  ReferenceC: string;
  ReferenceD: string;
  DebtorID?: string;
  DebtorType?: string;
}

// Resultado de la validación en cascada
export interface CascadedValidationResult {
  overallResult: 'success' | 'manual_review' | 'error';
  message: string;
  details: {
    validateP2P: {
      executed: boolean;
      success: boolean;
      movementExists: boolean;
      data?: ValidationResponse;
      error?: string;
    };
    validateReference: {
      executed: boolean;
      success: boolean;
      movementExists: boolean;
      data?: ValidationResponse;
      error?: string;
    };
    validateExistence: {
      executed: boolean;
      success: boolean;
      movementExists: boolean;
      data?: ValidationResponse;
      error?: string;
    };
  };
  timestamp: string;
}