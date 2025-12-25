// src/database/types/schedule.ts
export interface typeschedule_full {
    id?: string;
    code?: string;
    grade?: string;
    section?: string;
    day?: 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';
    startBlock?: number;
    endBlock?: number;
    classroom?: string;
    building?: string;
    subjectId?: string;
    teacherId?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface typeschedule_create {
    code: string;
    grade: string;
    section: string;
    day: 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes';
    startBlock: number;
    endBlock: number;
    classroom?: string;
    building?: string;
    subjectId: string;
    teacherId?: string;
}