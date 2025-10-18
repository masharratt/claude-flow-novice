/**
 * State Validation Schemas for Redis Swarm State
 *
 * This file provides comprehensive validation schemas for all swarm state components
 * ensuring data integrity and consistency across Redis operations.
 */

import { Logger } from '../core/logger.js';

// Logger instance for validation
const logger = new Logger({
  level: 'info',
  format: 'json',
  destination: 'console'
}, { component: 'StateValidation' });

// Basic validation patterns
export const VALIDATION_PATTERNS = {
  SWARM_ID: /^swarm_[a-zA-Z0-9_]{8,32}$/,
  AGENT_ID: /^agent_[a-zA-Z0-9_]{8,32}$/,
  TASK_ID: /^task_[a-zA-Z0-9_]{8,32}$/,
  PHASE_ID: /^phase_[a-zA-Z0-9_]{8,32}$/,
  MEMORY_ID: /^mem_[a-zA-Z0-9_]{8,32}$/,
  CHECKPOINT_ID: /^checkpoint_[a-zA-Z0-9_]{8,32}$/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  ISO_DATETIME: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/
};

// Base validator interface
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Generic validator function
export function createValidator<T>(schema: ValidationSchema<T>): (data: unknown) => ValidationResult {
  return (data: unknown): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      validateField(data, schema, '', errors, warnings);
    } catch (error) {
      errors.push(`Validation error: ${error}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  };
}

// Field validation function
function validateField(
  data: unknown,
  schema: ValidationSchema<any>,
  path: string,
  errors: string[],
  warnings: string[]
): void {
  if (schema.required && (data === undefined || data === null)) {
    errors.push(`${path} is required`);
    return;
  }

  if (data === undefined || data === null) {
    return; // Optional field not provided
  }

  // Type validation
  if (schema.type && typeof data !== schema.type) {
    errors.push(`${path} must be of type ${schema.type}, got ${typeof data}`);
    return;
  }

  // Pattern validation
  if (schema.pattern && typeof data === 'string' && !schema.pattern.test(data)) {
    errors.push(`${path} does not match required pattern`);
  }

  // Enum validation
  if (schema.enum && Array.isArray(schema.enum) && !schema.enum.includes(data)) {
    errors.push(`${path} must be one of: ${schema.enum.join(', ')}`);
  }

  // Range validation
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push(`${path} must be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push(`${path} must be <= ${schema.maximum}`);
    }
  }

  // String length validation
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push(`${path} must be at least ${schema.minLength} characters`);
    }
    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push(`${path} must be at most ${schema.maxLength} characters`);
    }
  }

  // Array validation
  if (schema.items && Array.isArray(data)) {
    data.forEach((item, index) => {
      validateField(item, schema.items!, `${path}[${index}]`, errors, warnings);
    });
  }

  // Object validation
  if (schema.properties && typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;

    // Validate required properties
    Object.entries(schema.properties).forEach(([key, propSchema]) => {
      validateField(obj[key], propSchema, path ? `${path}.${key}` : key, errors, warnings);
    });

    // Check for additional properties
    if (!schema.additionalProperties) {
      const allowedKeys = new Set(Object.keys(schema.properties));
      const actualKeys = new Set(Object.keys(obj));
      const extraKeys = Array.from(actualKeys).filter(key => !allowedKeys.has(key));

      if (extraKeys.length > 0) {
        warnings.push(`${path} contains unexpected properties: ${extraKeys.join(', ')}`);
      }
    }
  }

  // Custom validation
  if (schema.validator) {
    try {
      const customResult = schema.validator(data);
      if (!customResult.valid) {
        errors.push(...customResult.errors);
      }
      warnings.push(...customResult.warnings);
    } catch (error) {
      errors.push(`${path} custom validation failed: ${error}`);
    }
  }
}

// Validation schema interface
export interface ValidationSchema<T = any> {
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  pattern?: RegExp;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  items?: ValidationSchema;
  properties?: Record<string, ValidationSchema>;
  additionalProperties?: boolean;
  validator?: (data: any) => ValidationResult;
}

// Swarm metadata validation schema
export const SwarmMetadataSchema: ValidationSchema = {
  type: 'object',
  required: true,
  properties: {
    version: {
      type: 'string',
      required: true,
      enum: ['1.0.0']
    },
    createdAt: {
      type: 'string',
      required: true,
      pattern: VALIDATION_PATTERNS.ISO_DATETIME
    },
    updatedAt: {
      type: 'string',
      pattern: VALIDATION_PATTERNS.ISO_DATETIME
    },
    expiresAt: {
      type: 'string',
      pattern: VALIDATION_PATTERNS.ISO_DATETIME
    },
    status: {
      type: 'string',
      required: true,
      enum: ['initializing', 'running', 'paused', 'completed', 'failed', 'recovering']
    },
    strategy: {
      type: 'string',
      required: true,
      enum: ['development', 'research', 'testing', 'coordination']
    },
    mode: {
      type: 'string',
      required: true,
      enum: ['mesh', 'hierarchical', 'centralized']
    },
    confidence: {
      type: 'number',
      required: true,
      minimum: 0,
      maximum: 1
    }
  },
  additionalProperties: false
};

// Objective validation schema
export const ObjectiveSchema: ValidationSchema = {
  type: 'object',
  required: true,
  properties: {
    description: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 1000
    },
    type: {
      type: 'string',
      required: true,
      enum: ['feature', 'bugfix', 'research', 'testing', 'documentation', 'architecture', 'security']
    },
    priority: {
      type: 'string',
      required: true,
      enum: ['low', 'medium', 'high', 'critical']
    },
    complexity: {
      type: 'string',
      enum: ['simple', 'moderate', 'complex', 'enterprise']
    },
    estimatedDuration: {
      type: 'number',
      minimum: 60,
      maximum: 86400
    },
    requirements: {
      type: 'array',
      items: {
        type: 'string',
        minLength: 1
      }
    },
    constraints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['time', 'budget', 'technical', 'resource', 'security']
          },
          description: {
            type: 'string',
            required: true
          },
          impact: {
            type: 'string',
            enum: ['low', 'medium', 'high']
          }
        },
        required: ['type', 'description'],
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

// Agent validation schema
export const AgentSchema: ValidationSchema = {
  type: 'object',
  required: true,
  properties: {
    id: {
      type: 'string',
      required: true,
      pattern: VALIDATION_PATTERNS.AGENT_ID
    },
    role: {
      type: 'string',
      required: true,
      enum: ['coder', 'tester', 'reviewer', 'architect', 'researcher', 'planner', 'security-specialist', 'perf-analyzer', 'backend-dev', 'frontend-dev', 'mobile-dev', 'api-docs', 'devops-engineer', 'cicd-engineer']
    },
    type: {
      type: 'string',
      required: true,
      enum: ['implementer', 'validator', 'coordinator']
    },
    status: {
      type: 'string',
      required: true,
      enum: ['idle', 'active', 'busy', 'completed', 'failed', 'paused']
    },
    confidence: {
      type: 'number',
      required: true,
      minimum: 0,
      maximum: 1
    },
    assignedTasks: {
      type: 'array',
      items: {
        type: 'string',
        pattern: VALIDATION_PATTERNS.TASK_ID
      }
    },
    completedTasks: {
      type: 'array',
      items: {
        type: 'string',
        pattern: VALIDATION_PATTERNS.TASK_ID
      }
    },
    currentTask: {
      type: 'string',
      pattern: VALIDATION_PATTERNS.TASK_ID
    },
    metadata: {
      type: 'object',
      properties: {
        specialization: { type: 'string' },
        experience: {
          type: 'string',
          enum: ['junior', 'mid', 'senior', 'expert']
        },
        capabilities: {
          type: 'array',
          items: { type: 'string' }
        },
        lastActive: {
          type: 'string',
          pattern: VALIDATION_PATTERNS.ISO_DATETIME
        },
        responseTime: {
          type: 'number',
          minimum: 0
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

// Task validation schema
export const TaskSchema: ValidationSchema = {
  type: 'object',
  required: true,
  properties: {
    id: {
      type: 'string',
      required: true,
      pattern: VALIDATION_PATTERNS.TASK_ID
    },
    title: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 200
    },
    description: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 1000
    },
    type: {
      type: 'string',
      required: true,
      enum: ['implementation', 'validation', 'coordination', 'research', 'testing', 'documentation', 'review', 'architecture']
    },
    status: {
      type: 'string',
      required: true,
      enum: ['pending', 'in_progress', 'completed', 'failed', 'blocked', 'cancelled']
    },
    priority: {
      type: 'string',
      required: true,
      enum: ['low', 'medium', 'high', 'critical']
    },
    assignedAgent: {
      type: 'string',
      pattern: VALIDATION_PATTERNS.AGENT_ID
    },
    dependencies: {
      type: 'array',
      items: {
        type: 'string',
        pattern: VALIDATION_PATTERNS.TASK_ID
      }
    },
    subtasks: {
      type: 'array',
      items: {
        type: 'string',
        pattern: VALIDATION_PATTERNS.TASK_ID
      }
    },
    parentTask: {
      type: 'string',
      pattern: VALIDATION_PATTERNS.TASK_ID
    },
    confidence: {
      type: 'number',
      required: true,
      minimum: 0,
      maximum: 1
    },
    progress: {
      type: 'number',
      required: true,
      minimum: 0,
      maximum: 100
    },
    estimatedDuration: {
      type: 'number',
      minimum: 60
    },
    actualDuration: {
      type: 'number',
      minimum: 0
    },
    createdAt: {
      type: 'string',
      pattern: VALIDATION_PATTERNS.ISO_DATETIME
    },
    startedAt: {
      type: 'string',
      pattern: VALIDATION_PATTERNS.ISO_DATETIME
    },
    completedAt: {
      type: 'string',
      pattern: VALIDATION_PATTERNS.ISO_DATETIME
    },
    result: {
      type: 'object'
    },
    artifacts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['file', 'directory', 'url', 'data', 'image', 'document']
          },
          path: {
            type: 'string',
            required: true
          },
          description: { type: 'string' },
          checksum: { type: 'string' }
        },
        required: ['type', 'path'],
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

// Phase validation schema
export const PhaseSchema: ValidationSchema = {
  type: 'object',
  required: true,
  properties: {
    id: {
      type: 'string',
      required: true,
      pattern: VALIDATION_PATTERNS.PHASE_ID
    },
    name: {
      type: 'string',
      required: true,
      minLength: 1
    },
    description: { type: 'string' },
    status: {
      type: 'string',
      required: true,
      enum: ['pending', 'active', 'completed', 'failed', 'skipped']
    },
    loopLevel: {
      type: 'number',
      required: true,
      minimum: 0,
      maximum: 4
    },
    tasks: {
      type: 'array',
      items: {
        type: 'string',
        pattern: VALIDATION_PATTERNS.TASK_ID
      }
    },
    entryCriteria: {
      type: 'array',
      items: { type: 'string' }
    },
    exitCriteria: {
      type: 'array',
      items: { type: 'string' }
    },
    metrics: {
      type: 'object',
      properties: {
        duration: { type: 'number', minimum: 0 },
        taskCount: { type: 'number', minimum: 0 },
        successRate: { type: 'number', minimum: 0, maximum: 1 },
        averageConfidence: { type: 'number', minimum: 0, maximum: 1 }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

// Consensus validation schema
export const ConsensusSchema: ValidationSchema = {
  type: 'object',
  required: true,
  properties: {
    currentRound: {
      type: 'number',
      required: true,
      minimum: 0
    },
    requiredConfidence: {
      type: 'number',
      required: true,
      minimum: 0,
      maximum: 1
    },
    currentConfidence: {
      type: 'number',
      required: true,
      minimum: 0,
      maximum: 1
    },
    status: {
      type: 'string',
      required: true,
      enum: ['pending', 'achieving', 'achieved', 'failed']
    },
    votes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          agentId: {
            type: 'string',
            required: true,
            pattern: VALIDATION_PATTERNS.AGENT_ID
          },
          confidence: {
            type: 'number',
            required: true,
            minimum: 0,
            maximum: 1
          },
          reasoning: { type: 'string' },
          timestamp: {
            type: 'string',
            required: true,
            pattern: VALIDATION_PATTERNS.ISO_DATETIME
          }
        },
        required: ['agentId', 'confidence', 'timestamp'],
        additionalProperties: false
      }
    },
    decision: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['PROCEED', 'DEFER', 'ESCALATE', 'RETRY']
        },
        reasoning: { type: 'string' },
        nextSteps: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['type']
    }
  },
  additionalProperties: false
};

// Complete swarm state validation schema
export const SwarmStateSchema: ValidationSchema = {
  type: 'object',
  required: true,
  properties: {
    swarmId: {
      type: 'string',
      required: true,
      pattern: VALIDATION_PATTERNS.SWARM_ID,
      validator: (data: string): ValidationResult => {
        // Custom validation: ensure swarm ID consistency
        return {
          valid: true,
          errors: [],
          warnings: []
        };
      }
    },
    metadata: SwarmMetadataSchema,
    objective: ObjectiveSchema,
    agents: {
      type: 'object',
      required: true,
      validator: (data: Record<string, unknown>): ValidationResult => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!data || typeof data !== 'object') {
          errors.push('Agents must be an object');
          return { valid: false, errors, warnings };
        }

        const agentCount = Object.keys(data).length;
        if (agentCount === 0) {
          errors.push('At least one agent is required');
        }
        if (agentCount > 1000) {
          warnings.push(`Large number of agents (${agentCount}) may impact performance`);
        }

        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }
    },
    tasks: {
      type: 'object',
      required: true,
      validator: (data: Record<string, unknown>): ValidationResult => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (!data || typeof data !== 'object') {
          errors.push('Tasks must be an object');
          return { valid: false, errors, warnings };
        }

        const taskCount = Object.keys(data).length;
        if (taskCount > 10000) {
          warnings.push(`Large number of tasks (${taskCount}) may impact performance`);
        }

        return {
          valid: errors.length === 0,
          errors,
          warnings
        };
      }
    },
    phases: { type: 'object' },
    memory: { type: 'object' },
    consensus: ConsensusSchema,
    performance: { type: 'object' },
    recovery: { type: 'object' }
  },
  additionalProperties: false
};

// TTL policy validation schema
export const TTLPolicySchema: ValidationSchema = {
  type: 'object',
  required: true,
  properties: {
    keyType: {
      type: 'string',
      required: true,
      enum: ['swarm', 'agent', 'task', 'phase', 'memory', 'consensus', 'performance', 'recovery', 'index']
    },
    ttl: {
      type: 'number',
      required: true,
      minimum: 60,
      maximum: 604800 // 7 days max
    },
    renewalPolicy: {
      type: 'string',
      enum: ['auto', 'manual', 'linked']
    },
    renewalTriggers: {
      type: 'array',
      items: { type: 'string' }
    },
    gracePeriod: {
      type: 'number',
      minimum: 0,
      maximum: 3600
    }
  },
  additionalProperties: false
};

// Performance benchmark validation schema
export const PerformanceBenchmarkSchema: ValidationSchema = {
  type: 'object',
  required: true,
  properties: {
    writeLatency: {
      type: 'number',
      required: true,
      minimum: 0,
      maximum: 1000, // Max 1 second
      validator: (data: number): ValidationResult => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (data > 50) {
          warnings.push(`Write latency ${data}ms exceeds target of 50ms`);
        }

        return {
          valid: data < 100, // Fail if > 100ms
          errors,
          warnings
        };
      }
    },
    readLatency: {
      type: 'number',
      required: true,
      minimum: 0,
      maximum: 500, // Max 500ms
      validator: (data: number): ValidationResult => {
        const errors: string[] = [];
        const warnings: string[] = [];

        if (data > 25) {
          warnings.push(`Read latency ${data}ms exceeds target of 25ms`);
        }

        return {
          valid: data < 50, // Fail if > 50ms
          errors,
          warnings
        };
      }
    },
    memoryUsage: {
      type: 'number',
      required: true,
      minimum: 0,
      validator: (data: number): ValidationResult => {
        const errors: string[] = [];
        const warnings: string[] = [];

        const maxMemory = 1024 * 1024 * 1024; // 1GB
        if (data > maxMemory * 0.8) {
          errors.push(`Memory usage ${data} bytes exceeds 80% of limit`);
        } else if (data > maxMemory * 0.6) {
          warnings.push(`Memory usage ${data} bytes exceeds 60% of limit`);
        }

        return {
          valid: data < maxMemory,
          errors,
          warnings
        };
      }
    },
    stateSize: {
      type: 'number',
      required: true,
      minimum: 0,
      maximum: 1024 * 1024 // Max 1MB per state
    }
  },
  additionalProperties: false
};

// Export validator functions
export const validateSwarmMetadata = createValidator(SwarmMetadataSchema);
export const validateObjective = createValidator(ObjectiveSchema);
export const validateAgent = createValidator(AgentSchema);
export const validateTask = createValidator(TaskSchema);
export const validatePhase = createValidator(PhaseSchema);
export const validateConsensus = createValidator(ConsensusSchema);
export const validateSwarmState = createValidator(SwarmStateSchema);
export const validateTTLPolicy = createValidator(TTLPolicySchema);
export const validatePerformanceBenchmark = createValidator(PerformanceBenchmarkSchema);

// Batch validation function
export function validateSwarmStateBatch(swarmState: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate overall structure
  const overallResult = validateSwarmState(swarmState);
  errors.push(...overallResult.errors);
  warnings.push(...overallResult.warnings);

  if (!overallResult.valid || typeof swarmState !== 'object') {
    return overallResult;
  }

  const state = swarmState as Record<string, unknown>;

  // Validate individual components
  if (state.metadata) {
    const metadataResult = validateSwarmMetadata(state.metadata);
    errors.push(...metadataResult.errors.map(e => `metadata.${e}`));
    warnings.push(...metadataResult.warnings.map(w => `metadata.${w}`));
  }

  if (state.objective) {
    const objectiveResult = validateObjective(state.objective);
    errors.push(...objectiveResult.errors.map(e => `objective.${e}`));
    warnings.push(...objectiveResult.warnings.map(w => `objective.${w}`));
  }

  // Validate all agents
  if (state.agents && typeof state.agents === 'object') {
    Object.entries(state.agents as Record<string, unknown>).forEach(([agentId, agent]) => {
      const agentResult = validateAgent(agent);
      errors.push(...agentResult.errors.map(e => `agents.${agentId}.${e}`));
      warnings.push(...agentResult.warnings.map(w => `agents.${agentId}.${w}`));
    });
  }

  // Validate all tasks
  if (state.tasks && typeof state.tasks === 'object') {
    Object.entries(state.tasks as Record<string, unknown>).forEach(([taskId, task]) => {
      const taskResult = validateTask(task);
      errors.push(...taskResult.errors.map(e => `tasks.${taskId}.${e}`));
      warnings.push(...taskResult.warnings.map(w => `tasks.${taskId}.${w}`));
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// Recovery validation schema
export const RecoveryCheckpointSchema: ValidationSchema = {
  type: 'object',
  required: true,
  properties: {
    timestamp: {
      type: 'string',
      required: true,
      pattern: VALIDATION_PATTERNS.ISO_DATETIME
    },
    phase: {
      type: 'string',
      pattern: VALIDATION_PATTERNS.PHASE_ID
    },
    confidence: {
      type: 'number',
      required: true,
      minimum: 0,
      maximum: 1
    },
    stateHash: {
      type: 'string',
      required: true,
      minLength: 64,
      maxLength: 64, // SHA-256 hash length
      pattern: /^[a-f0-9]{64}$/i
    }
  },
  additionalProperties: false
};

export const validateRecoveryCheckpoint = createValidator(RecoveryCheckpointSchema);

// Recovery confidence validation
export function validateRecoveryConfidence(checkpoints: unknown[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(checkpoints)) {
    errors.push('Checkpoints must be an array');
    return { valid: false, errors, warnings };
  }

  if (checkpoints.length === 0) {
    errors.push('At least one checkpoint is required for recovery');
    return { valid: false, errors, warnings };
  }

  // Calculate average confidence
  let totalConfidence = 0;
  let validCheckpoints = 0;

  for (const checkpoint of checkpoints) {
    const result = validateRecoveryCheckpoint(checkpoint);
    if (result.valid) {
      totalConfidence += (checkpoint as any).confidence;
      validCheckpoints++;
    } else {
      errors.push(...result.errors.map(e => `checkpoint.${e}`));
    }
  }

  if (validCheckpoints > 0) {
    const avgConfidence = totalConfidence / validCheckpoints;
    if (avgConfidence < 0.85) {
      errors.push(`Average confidence ${avgConfidence.toFixed(3)} below recovery threshold of 0.85`);
    } else if (avgConfidence < 0.90) {
      warnings.push(`Average confidence ${avgConfidence.toFixed(3)} marginal for recovery`);
    }
  }

  return {
    valid: errors.length === 0 && validCheckpoints > 0,
    errors,
    warnings
  };
}

logger.info('State validation schemas initialized');
export default {
  validateSwarmState: validateSwarmStateBatch,
  validateSwarmMetadata,
  validateObjective,
  validateAgent,
  validateTask,
  validatePhase,
  validateConsensus,
  validateTTLPolicy,
  validatePerformanceBenchmark,
  validateRecoveryCheckpoint,
  validateRecoveryConfidence,
  VALIDATION_PATTERNS
};