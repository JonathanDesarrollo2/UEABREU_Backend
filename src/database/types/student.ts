import { typeuserlogin_response } from "./userlogin";
import { typerepresentative_response } from "./representative";

export type StudentStatus = 'regular' | 'repitiente' | 'condicionado';

export interface typestudent_full {
    id?: string;
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
    createdAt?: Date;
    updatedAt?: Date;
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
    representative?: typerepresentative_response;
    user?: typeuserlogin_response;
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
