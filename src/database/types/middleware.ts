import { Request } from 'express';
import { typeTokenData } from './userlogin';

// Extender la interfaz Request de Express para incluir el usuario
declare global {
    namespace Express {
        interface Request {
            user?: typeTokenData;
        }
    }
}

export interface AuthenticatedRequest extends Request {
    user: typeTokenData;
}

export interface PaginationParams {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
}

export interface SearchParams extends PaginationParams {
    query?: string;
}