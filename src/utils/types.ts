/**
 * Shared Type Definitions for Claude Flow Novice v2
 *
 * Centralized location for commonly-used types across the codebase.
 * This prevents circular dependencies and provides a single source of truth.
 */

// ===== LOGGING TYPES =====

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  destination: 'console' | 'file' | 'both';
  filePath?: string;
  maxFileSize?: number;
  maxFiles?: number;
}

export interface ILogger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, error?: unknown): void;
  configure(config: LoggingConfig): Promise<void>;
  level?: string;
}

// ===== COMMON TYPES =====

export interface Timestamp {
  createdAt: number;
  updatedAt?: number;
  completedAt?: number;
}

export interface MetadataBase {
  [key: string]: unknown;
}

export type ACLLevel = 1 | 2 | 3 | 4 | 5; // Private | Agent | Swarm | Project | System

export interface WithMetadata {
  metadata?: MetadataBase;
}

export interface WithTimestamp extends Timestamp {}

export interface WithACL {
  aclLevel: ACLLevel;
  ownerId?: string;
}

// ===== CONFIDENCE & SCORING =====

export interface ConfidenceScore {
  value: number; // 0.0 to 1.0
  source: string;
  timestamp: number;
  metadata?: MetadataBase;
}

export interface ValidationResult {
  passed: boolean;
  confidence: number;
  errors: string[];
  warnings: string[];
  metadata?: MetadataBase;
}

// ===== AGENT TYPES =====

export type AgentStatus =
  | 'idle'
  | 'preparing'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface AgentMetadata extends MetadataBase {
  agentId: string;
  agentType: string;
  swarmId?: string;
  priority?: number;
}

export interface AgentConfig {
  id: string;
  type: string;
  tools: string[];
  maxRetries?: number;
  timeout?: number;
  metadata?: AgentMetadata;
}

// ===== TASK TYPES =====

export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TaskMetadata extends MetadataBase {
  taskId: string;
  assignedTo?: string;
  dependencies?: string[];
  estimatedDuration?: number;
}

export interface TaskConfig {
  id: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  metadata?: TaskMetadata;
}

// ===== REDIS TYPES =====

export type RedisChannel =
  | 'agent:spawn'
  | 'agent:status'
  | 'agent:progress'
  | 'agent:complete'
  | 'swarm:broadcast'
  | 'coordination:update'
  | 'feedback:loop';

export interface RedisMessage<T = unknown> {
  channel: RedisChannel;
  payload: T;
  timestamp: number;
  senderId?: string;
  metadata?: MetadataBase;
}

// ===== MEMORY TYPES =====

export interface MemoryEntry {
  key: string;
  value: unknown;
  aclLevel: ACLLevel;
  ttl?: number;
  createdAt: number;
  updatedAt?: number;
  encryptedValue?: string;
  metadata?: MetadataBase;
}

export interface MemoryQuery {
  key?: string;
  pattern?: string;
  aclLevel?: ACLLevel;
  limit?: number;
  offset?: number;
}

// ===== COLLABORATION INTEGRATION TYPES =====

export type CollaborationConfig = Record<string, unknown>;
export type PerformanceData = Record<string, unknown>;
export type ProgressData = Record<string, unknown>;
export type AnomalyData = Record<string, unknown>;
export type DashboardData = Record<string, unknown>;
export type CollaborationStep = Record<string, unknown>;
export type AgentType = string;
export type CollaborationId = string;
export type AgentId = string;
export type IntegrationEventType = string;

// ===== ERROR TYPES =====

export class CFNError extends Error {
  constructor(
    message: string,
    public code: string,
    public metadata?: MetadataBase
  ) {
    super(message);
    this.name = 'CFNError';
  }
}

export class ValidationError extends CFNError {
  constructor(message: string, metadata?: MetadataBase) {
    super(message, 'VALIDATION_ERROR', metadata);
    this.name = 'ValidationError';
  }
}

export class ConfigurationError extends CFNError {
  constructor(message: string, metadata?: MetadataBase) {
    super(message, 'CONFIGURATION_ERROR', metadata);
    this.name = 'ConfigurationError';
  }
}

// ===== UTILITY TYPES =====

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export type RequireOnlyOne<T, Keys extends keyof T = keyof T> =
  Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?:
      Required<Pick<T, K>> &
      Partial<Record<Exclude<Keys, K>, undefined>>;
  }[Keys];
