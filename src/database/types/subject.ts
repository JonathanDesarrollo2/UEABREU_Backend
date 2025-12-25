// src/database/types/subject.ts
export interface typesubject_full {
    id?: string;
    name?: string;
    code?: string;
    hoursPerWeek?: number;
    theoreticalHours?: number;
    labHours?: number;
    subjectType?: 'ordinaria' | 'regular' | 'complementaria_obligatoria' | 'complementaria_opcional';
    comments?: string;
    class?: string;
    teacherId?: string;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface typesubject_create {
    name: string;
    code: string;
    hoursPerWeek: number;
    theoreticalHours?: number;
    labHours?: number;
    subjectType?: 'ordinaria' | 'regular' | 'complementaria_obligatoria' | 'complementaria_opcional';
    comments?: string;
    class?: string;
    teacherId?: string;
}