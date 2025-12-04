import { typestudent_response } from "./student";

export type RelationshipType = 'padre' | 'madre' | 'tutor' | 'abuelo' | 'otro';

export interface typerepresentative_full {
    id?: string;
    fullName?: string;
    identityCard?: string;
    address?: string;
    phone?: string;
    relationship?: RelationshipType;
    parentName?: string;
    parentIdentityCard?: string;
    parentAddress?: string;
    parentPhone?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface typerepresentative_create {
    fullName: string;
    identityCard: string;
    address: string;
    phone: string;
    relationship: RelationshipType;
    parentName?: string;
    parentIdentityCard?: string;
    parentAddress?: string;
    parentPhone?: string;
}

export interface typerepresentative_update {
    id: string;
    fullName?: string;
    identityCard?: string;
    address?: string;
    phone?: string;
    relationship?: RelationshipType;
    parentName?: string;
    parentIdentityCard?: string;
    parentAddress?: string;
    parentPhone?: string;
}

export interface typerepresentative_response {
    id: string;
    fullName: string;
    identityCard: string;
    address: string;
    phone: string;
    relationship: RelationshipType;
    parentName?: string;
    parentIdentityCard?: string;
    parentAddress?: string;
    parentPhone?: string;
    createdAt: Date;
    updatedAt: Date;
    students?: typestudent_response[];
}

export interface typerepresentative_list {
    representatives: typerepresentative_response[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface typerepresentative_filter {
    fullName?: string;
    identityCard?: string;
    relationship?: RelationshipType;
    page?: number;
    limit?: number;
}