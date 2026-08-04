// src/database/types/blockTimeConfig.ts
export interface BlockTimeConfigFull {
  id?: string;
  grade: string;
  section: string;
  blockNumber: number;
  day: string;
  startTime: string;
  endTime: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface BlockTimeConfigCreate {
  grade: string;
  section: string;
  blockNumber: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
}

export interface BlockTimeConfigUpdate {
  id: string;
  startTime?: string;
  endTime?: string;
  isActive?: boolean;
}

export interface BlockTimeConfigResponse {
  grade: string;
  section: string;
  blocks: Array<{
    blockNumber: number;
    startTime: string;
    endTime: string;
    isActive: boolean;
  }>;
  
}
export interface BlockTimeConfigAttributes {
  id?: string;
  grade: string;
  section: string;
  day: string;          // ← agregado
  blockNumber: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}