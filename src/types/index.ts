// Zone B Interface Foundation - Main Barrel Export
// Exports all core domain types and validation utilities

// Domain entity types
export * from './user.js';
export * from './story.js';
export * from './family.js';
export * from './media.js';

// Validation utilities and schemas
export * from './validation.js';

// Common shared types and interfaces
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginationParams {
  offset?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: Date;
    requestId: string;
    version: string;
  };
}

export interface QueryFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'like' | 'ilike';
  value: any;
}

export interface SearchParams {
  query?: string;
  filters?: QueryFilter[];
  pagination?: PaginationParams;
}