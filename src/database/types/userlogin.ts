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