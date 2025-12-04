// Tipos genéricos para respuestas de API
export interface ApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
}

export interface PaginatedResponse<T = any> {
    success: boolean;
    message: string;
    data: {
        items: T[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface ErrorResponse {
    success: false;
    message: string;
    error: string;
    details?: any;
}

// Respuestas específicas
export interface HealthCheckResponse {
    status: string;
    message: string;
    timestamp: string;
    environment: string;
    database: boolean;
}

export interface ValidationError {
    field: string;
    message: string;
    value?: any;
}

export interface BulkOperationResult {
    success: number;
    failed: number;
    errors?: Array<{
        item: any;
        error: string;
    }>;
}