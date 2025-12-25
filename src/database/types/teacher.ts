// src/database/types/teacher.ts
export interface typeteacher_full {
    id?: string;
    fullName?: string;
    identityCard?: string;
    address?: string;
    phone?: string;
    email?: string;
    specialization?: string;
    degree?: string;
    status?: boolean;
    comments?: string;
    class?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface typeteacher_create {
    fullName: string;
    identityCard: string;
    address: string;
    phone: string;
    email: string;
    specialization?: string;
    degree?: string;
    status?: boolean;
    comments?: string;
    class?: string;
}

export interface typeteacher_response {
    id: string;
    fullName: string;
    identityCard: string;
    email: string;
    phone: string;
    status: boolean;
    specialization?: string;
}