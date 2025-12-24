// src/database/types/representative.ts
export interface typerepresentative_full {
    id?: string;
    fullName?: string;
    identityCard?: string;
    address?: string;
    phone?: string;
    relationship?: string;
    parentName?: string;
    parentIdentityCard?: string;
    parentAddress?: string;
    parentPhone?: string;
    balance?: number;                    // SALDO (puede ser negativo o positivo)
    userId?: string;
    createdAt?: Date;
    updatedAt?: Date;
    
    // Campos virtuales (NO los pongas en el modelo real, solo en la interfaz)
    debtAmount?: number;
    balanceStatus?: 'debt' | 'zero' | 'credit';
    balanceFormatted?: string;
}

export interface typerepresentative_create {
    fullName: string;
    identityCard: string;
    address: string;
    phone: string;
    relationship: string;
    parentName?: string;
    parentIdentityCard?: string;
    parentAddress?: string;
    parentPhone?: string;
    balance?: number;                    // Opcional al crear, por defecto 0
}

export interface typerepresentative_update {
    id: string;
    fullName?: string;
    address?: string;
    phone?: string;
    parentName?: string;
    parentPhone?: string;
    balance?: number;                    // Puede actualizar saldo
}

export interface typerepresentative_balance {
    representativeId: string;
    amount: number;                     // Positivo para agregar, Negativo para restar
    description: string;
    reference?: string;
    paymentMethod?: string;
}