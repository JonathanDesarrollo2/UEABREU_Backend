// src/database/types/studentschedule.ts
export interface typestudentschedule_full {
    id?: string;
    studentId?: string;
    scheduleId?: string;
    scheduleType?: 'regular' | 'pendiente';
    comment1?: string;
    comment2?: string;
    comment3?: string;
    assignedAt?: Date;
    endDate?: Date;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface typestudentschedule_create {
    studentId: string;
    scheduleId: string;
    scheduleType?: 'regular' | 'pendiente';
    comment1?: string;
    comment2?: string;
    comment3?: string;
}