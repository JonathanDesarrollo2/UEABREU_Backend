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
    // balance ELIMINADO de aquí
    userId?: string;
    createdAt?: Date;
    updatedAt?: Date;
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
    // balance ELIMINADO de aquí
}

export interface typerepresentative_update {
    id: string;
    fullName?: string;
    address?: string;
    phone?: string;
    parentName?: string;
    parentPhone?: string;
    // balance ELIMINADO de aquí
}

export interface typerepresentative_balance {
    representativeId: string;
    amount: number;
    description: string;
    reference?: string;
    paymentMethod?: string;
}