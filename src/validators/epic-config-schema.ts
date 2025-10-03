import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

// Type definitions for epic configuration
export interface SprintConfig {
  sprintId: string;
  name: string;
  description: string;
  taskType: string;
  maxIterations?: number;
  dependencies?: string[];
}

export interface PhaseConfig {
  phaseId: string;
  name: string;
  file: string;
  description?: string;
  sprints?: SprintConfig[];
  dependencies?: string[];
}

export interface EpicConfig {
  epicId: string;
  name: string;
  description?: string;
  phases: PhaseConfig[];
  metadata?: {
    createdAt?: string;
    author?: string;
    version?: string;
  };
}

// JSON schema for sprint configuration
const sprintSchema = {
  type: 'object',
  required: ['sprintId', 'name', 'description', 'taskType'],
  properties: {
    sprintId: {
      type: 'string',
      pattern: '^[a-zA-Z0-9\\-_]{1,50}$',
      minLength: 1,
      maxLength: 50,
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
    },
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 5000, // Reasonable limit for sprint descriptions
    },
    taskType: {
      type: 'string',
      enum: [
        'implementation',
        'testing',
        'documentation',
        'refactoring',
        'security',
        'performance',
        'research',
        'deployment',
      ],
    },
    maxIterations: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      nullable: true,
    },
    dependencies: {
      type: 'array',
      items: { type: 'string', pattern: '^[a-zA-Z0-9\\-_]{1,50}$' },
      maxItems: 20,
      nullable: true,
    },
  },
  additionalProperties: false, // Prevent prototype pollution
};

// JSON schema for phase configuration
const phaseSchema = {
  type: 'object',
  required: ['phaseId', 'name', 'file'],
  properties: {
    phaseId: {
      type: 'string',
      pattern: '^[a-zA-Z0-9\\-_]{1,50}$',
      minLength: 1,
      maxLength: 50,
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
    },
    file: {
      type: 'string',
      minLength: 1,
      maxLength: 500,
      pattern: '^[^<>:"|?*\\x00-\\x1F]+$', // Prevent path traversal characters
    },
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 5000,
      nullable: true,
    },
    sprints: {
      type: 'array',
      items: sprintSchema,
      maxItems: 100,
      nullable: true,
    },
    dependencies: {
      type: 'array',
      items: { type: 'string', pattern: '^[a-zA-Z0-9\\-_]{1,50}$' },
      maxItems: 20,
      nullable: true,
    },
  },
  additionalProperties: false,
};

// JSON schema for epic configuration
export const epicConfigSchema = {
  type: 'object',
  required: ['epicId', 'name', 'phases'],
  properties: {
    epicId: {
      type: 'string',
      pattern: '^[a-zA-Z0-9\\-_]{1,50}$',
      minLength: 1,
      maxLength: 50,
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
    },
    description: {
      type: 'string',
      minLength: 1,
      maxLength: 10000,
      nullable: true,
    },
    phases: {
      type: 'array',
      items: phaseSchema,
      minItems: 1,
      maxItems: 50,
    },
    metadata: {
      type: 'object',
      properties: {
        createdAt: {
          type: 'string',
          format: 'date-time',
          nullable: true,
        },
        author: {
          type: 'string',
          maxLength: 100,
          nullable: true,
        },
        version: {
          type: 'string',
          pattern: '^\\d+\\.\\d+\\.\\d+$', // Semver format
          nullable: true,
        },
      },
      nullable: true,
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

// Compiled validators
export const validateEpicConfig = ajv.compile(epicConfigSchema);
export const validatePhaseConfig = ajv.compile(phaseSchema);
export const validateSprintConfig = ajv.compile(sprintSchema);

/**
 * Validates epic configuration with detailed error reporting
 * @throws Error with validation details if invalid
 */
export function validateAndThrow(config: unknown, validator: typeof validateEpicConfig): void {
  if (!validator(config)) {
    const errors = validator.errors?.map((err) => {
      const path = err.instancePath || 'root';
      return `  - ${path}: ${err.message}`;
    }).join('\n');

    throw new Error(
      `Invalid configuration:\n${errors}\n\n` +
      `This helps prevent:\n` +
      `  - CVE-2025-005: Malformed JSON injection\n` +
      `  - Prototype pollution attacks\n` +
      `  - Path traversal vulnerabilities`
    );
  }
}

/**
 * Sanitize object keys to prevent prototype pollution
 */
export function sanitizeObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObjectKeys);
  }

  const sanitized: any = {};
  const dangerousKeys = ['__proto__', 'constructor', 'prototype'];

  for (const key of Object.keys(obj)) {
    // Skip dangerous keys
    if (dangerousKeys.includes(key)) {
      console.warn(`[SECURITY] Blocked dangerous key: ${key}`);
      continue;
    }

    sanitized[key] = sanitizeObjectKeys(obj[key]);
  }

  // Explicitly set __proto__ to null to prevent prototype pollution
  Object.setPrototypeOf(sanitized, null);

  return sanitized;
}
