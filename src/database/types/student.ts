// src/database/types/student.ts
import { typeuserlogin_response } from "./userlogin";
import { typerepresentative_full } from "./representative";

export type StudentStatus = 'regular' | 'repitiente' | 'condicionado';

export interface typestudent_full {
    id?: string;
    fullName?: string;
    identityCard?: string;
    birthDate?: Date;
    state?: string;
    zone?: string;
    addressDescription?: string;
    phone?: string;
    nationality?: string;
    birthCountry?: string;
    hasAllergies?: boolean;
    allergiesDescription?: string;
    hasDiseases?: boolean;
    diseasesDescription?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
    admissionDate?: Date;
    initialSchoolYear?: string;
    currentGrade?: string;
    section?: string;
    status?: 'pendiente' | 'regular' | 'repitiente' | 'condicionado' | 'inactivo';
    representativeId?: string;
    userId?: string;
    createdAt?: Date;
    updatedAt?: Date;
    // 💰 NUEVO CAMPO
    balance?: number;
    previousSchool?: string;
    municipality?: string;
}

export interface typestudent_create {
    fullName: string;
    identityCard: string;
    address?: string;
    phone?: string;
    admissionDate: Date;
    initialSchoolYear: string;
    currentGrade: string;
    section: string;
    status?: StudentStatus;
    representativeId: string;
    userId?: string;
    balance?: number; // opcional al crear
}

export interface typestudent_update {
    id: string;
    fullName?: string;
    identityCard?: string;
    address?: string;
    phone?: string;
    admissionDate?: Date;
    initialSchoolYear?: string;
    currentGrade?: string;
    section?: string;
    status?: StudentStatus;
    representativeId?: string;
    userId?: string;
    balance?: number; // opcional al actualizar
}

export interface typestudent_response {
    id: string;
    fullName: string;
    identityCard: string;
    address?: string;
    phone?: string;
    admissionDate: Date;
    initialSchoolYear: string;
    currentGrade: string;
    section: string;
    status: StudentStatus;
    representativeId: string;
    userId?: string;
    createdAt: Date;
    updatedAt: Date;
    representative?: typerepresentative_full;
    user?: typeuserlogin_response;
    balance?: number; // incluir en respuesta
}

export interface typestudent_list {
    students: typestudent_response[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface typestudent_filter {
    fullName?: string;
    identityCard?: string;
    currentGrade?: string;
    section?: string;
    status?: StudentStatus;
    representativeId?: string;
    page?: number;
    limit?: number;
}
