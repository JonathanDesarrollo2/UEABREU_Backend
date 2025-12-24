// src/database/types/userlogin.ts
import { JwtPayload } from "jsonwebtoken";

export interface typeuserlogin_full {
    id?: string;
    usermail?: string;
    userlogin?: string;
    username?: string;
    userrepass?: string;
    userpass?: string;
    userstatus?: boolean;
    nivel?: number;
    createdAt?: Date;
    updatedAt?: Date;
    
    // Nuevos campos para registro de representantes
    representativeData?: {
        fullName: string;
        identityCard: string;
        address: string;
        phone: string;
        relationship: string;
        parentName?: string;
        parentIdentityCard?: string;
        parentAddress?: string;
        parentPhone?: string;
        initialBalance?: number; // Puede ser positivo o negativo
    };
    
    studentsData?: Array<{
        fullName: string;
        identityCard: string;
        birthDate: string | Date;
        state: string;
        zone: string;
        addressDescription: string;
        phone?: string;
        nationality: string;
        birthCountry: string;
        hasAllergies: boolean;
        allergiesDescription?: string;
        hasDiseases: boolean;
        diseasesDescription?: string;
        emergencyContact: string;
        emergencyPhone: string;
    }>;
}

export interface typeuserlogin_in {
    usermail: string;
    userpass: string;
}

export interface typeuserlogin_register {
    usermail: string;
    userlogin: string;
    username?: string;
    userpass: string;
    nivel?: number;
    userstatus?: boolean;
    representativeData?: typeuserlogin_full['representativeData'];
    studentsData?: typeuserlogin_full['studentsData'];
}

export interface typeuserlogin_update {
    id: string;
    username?: string;
    userstatus?: boolean;
    nivel?: number;
}

export interface typeuserlogin_changePassword {
    id: string;
    currentPassword: string;
    newPassword: string;
}

export interface typeuserlogin_response {
    id: string;
    usermail: string;
    userlogin: string;
    username?: string;
    userstatus: boolean;
    nivel: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface typeTokenData extends JwtPayload {
    id: string;
    userlogin: string;
    username?: string;
    usermail: string;
    nivel?: number;
    hacer?: string;
    newToke?: string;
}

export interface typeLoginResponse {
    success: boolean;
    message: string;
    token?: string;
    user?: typeuserlogin_response;
}

export interface typeVerifyResponse {
    success: boolean;
    user?: typeuserlogin_response;
}

export type typeuserlogin_active = {
    sesionUser?: string;
    sesionEmail?: string;
    userStatus?: boolean;
    nivel?: number;
    studentInfo?: {
        name?: string;
        status?: boolean;
    } | null;
};