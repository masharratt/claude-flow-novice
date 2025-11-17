/**
 * Correlation Key Utilities
 *
 * Provides correlation key generation and parsing for cross-database lookups.
 * Part of Task 0.4: Database Query Abstraction Layer (MVP)
 *
 * Format: {type}:{id}:{entity}:{subtype}
 * Examples:
 *   - task:abc123:agent:backend-developer
 *   - task:abc123:skill:auth-validation
 *   - agent:agent-456:execution:iteration-1
 */

import { CorrelationKey } from './types.js';

/**
 * Build correlation key string
 */
export function buildCorrelationKey(key: CorrelationKey): string {
  const parts = [key.type, key.id];

  if (key.entity) {
    parts.push(key.entity);
  }

  if (key.subtype) {
    parts.push(key.subtype);
  }

  return parts.join(':');
}

/**
 * Parse correlation key string
 */
export function parseCorrelationKey(keyString: string): CorrelationKey | null {
  const parts = keyString.split(':');

  if (parts.length < 2) {
    return null;
  }

  const [type, id, entity, subtype] = parts;

  if (!isValidKeyType(type)) {
    return null;
  }

  return {
    type: type as CorrelationKey['type'],
    id,
    entity,
    subtype,
  };
}

/**
 * Check if correlation key type is valid
 */
function isValidKeyType(type: string): type is CorrelationKey['type'] {
  return ['task', 'agent', 'skill', 'execution'].includes(type);
}

/**
 * Build task correlation key
 */
export function buildTaskKey(taskId: string, entity?: string): string {
  return buildCorrelationKey({
    type: 'task',
    id: taskId,
    entity,
  });
}

/**
 * Build agent correlation key
 */
export function buildAgentKey(agentId: string, entity?: string): string {
  return buildCorrelationKey({
    type: 'agent',
    id: agentId,
    entity,
  });
}

/**
 * Build skill correlation key
 */
export function buildSkillKey(skillId: string, entity?: string): string {
  return buildCorrelationKey({
    type: 'skill',
    id: skillId,
    entity,
  });
}

/**
 * Build execution correlation key
 */
export function buildExecutionKey(executionId: string, entity?: string): string {
  return buildCorrelationKey({
    type: 'execution',
    id: executionId,
    entity,
  });
}

/**
 * Extract task ID from correlation key
 */
export function extractTaskId(keyString: string): string | null {
  const key = parseCorrelationKey(keyString);
  return key && key.type === 'task' ? key.id : null;
}

/**
 * Extract agent ID from correlation key
 */
export function extractAgentId(keyString: string): string | null {
  const key = parseCorrelationKey(keyString);
  return key && key.type === 'agent' ? key.id : null;
}

/**
 * Check if correlation key matches pattern
 */
export function matchesPattern(keyString: string, pattern: Partial<CorrelationKey>): boolean {
  const key = parseCorrelationKey(keyString);

  if (!key) {
    return false;
  }

  if (pattern.type && key.type !== pattern.type) {
    return false;
  }

  if (pattern.id && key.id !== pattern.id) {
    return false;
  }

  if (pattern.entity && key.entity !== pattern.entity) {
    return false;
  }

  if (pattern.subtype && key.subtype !== pattern.subtype) {
    return false;
  }

  return true;
}

/**
 * Wildcard pattern for correlation key queries
 * Part of Task 3.3: Query Correlation Key Layer
 */
export interface WildcardPattern {
  type?: 'task' | 'agent' | 'skill' | 'execution' | '*';
  id?: string | '*';
  entity?: string | '*';
  subtype?: string | '*';
}

/**
 * Validation error details
 */
export interface ValidationError {
  code: 'INVALID_FORMAT' | 'INVALID_TYPE' | 'MISSING_REQUIRED' | 'INVALID_PATTERN';
  message: string;
  field?: string;
  value?: string;
}

/**
 * Entity type mapping for cross-database queries
 */
export const ENTITY_TYPE_MAP = {
  agent: ['execution', 'result', 'metadata'],
  skill: ['invocation', 'result', 'metadata'],
  task: ['agent', 'skill', 'artifact', 'event'],
  execution: ['step', 'log', 'metric'],
} as const;

/**
 * Generate wildcard pattern string for Redis SCAN operations
 *
 * @example
 * ```typescript
 * buildWildcardPattern({ type: 'task', id: '*', entity: 'agent' })
 * // Returns: "task:*:agent"
 *
 * buildWildcardPattern({ type: '*', id: 'abc123' })
 * // Returns: "*:abc123"
 * ```
 */
export function buildWildcardPattern(pattern: WildcardPattern): string {
  const parts: string[] = [];

  parts.push(pattern.type || '*');
  parts.push(pattern.id || '*');

  if (pattern.entity !== undefined) {
    parts.push(pattern.entity);
  }

  if (pattern.subtype !== undefined) {
    parts.push(pattern.subtype);
  }

  return parts.join(':');
}

/**
 * Validate correlation key with detailed error messages
 *
 * @param keyString - Correlation key string to validate
 * @returns Validation errors (empty array if valid)
 */
export function validateCorrelationKey(keyString: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for null/undefined
  if (!keyString || typeof keyString !== 'string') {
    errors.push({
      code: 'MISSING_REQUIRED',
      message: 'Correlation key must be a non-empty string',
      value: String(keyString),
    });
    return errors;
  }

  // Check format (minimum 2 parts: type:id)
  const parts = keyString.split(':');
  if (parts.length < 2) {
    errors.push({
      code: 'INVALID_FORMAT',
      message: 'Correlation key must have at least 2 parts (type:id)',
      value: keyString,
    });
    return errors;
  }

  const [type, id, entity, subtype] = parts;

  // Validate type
  if (!['task', 'agent', 'skill', 'execution'].includes(type)) {
    errors.push({
      code: 'INVALID_TYPE',
      message: `Invalid correlation type. Must be one of: task, agent, skill, execution`,
      field: 'type',
      value: type,
    });
  }

  // Validate ID (non-empty)
  if (!id || id.trim() === '') {
    errors.push({
      code: 'MISSING_REQUIRED',
      message: 'Correlation ID cannot be empty',
      field: 'id',
      value: id,
    });
  }

  // Validate entity (if present, check against type map)
  if (entity && type && isValidKeyType(type)) {
    const validEntities = ENTITY_TYPE_MAP[type];
    if (validEntities && !validEntities.includes(entity as any)) {
      errors.push({
        code: 'INVALID_PATTERN',
        message: `Invalid entity '${entity}' for type '${type}'. Valid entities: ${validEntities.join(', ')}`,
        field: 'entity',
        value: entity,
      });
    }
  }

  return errors;
}

/**
 * Check if correlation key is valid
 *
 * @param keyString - Correlation key to check
 * @returns True if valid, false otherwise
 */
export function isValidCorrelationKey(keyString: string): boolean {
  return validateCorrelationKey(keyString).length === 0;
}

/**
 * Get entity types for a correlation key type
 *
 * @param type - Correlation key type
 * @returns Array of valid entity types
 */
export function getEntityTypes(type: CorrelationKey['type']): readonly string[] {
  return ENTITY_TYPE_MAP[type] || [];
}

/**
 * Build multiple correlation keys in batch
 *
 * @param keys - Array of correlation key parts
 * @returns Array of correlation key strings
 *
 * @example
 * ```typescript
 * buildBatch([
 *   { type: 'task', id: 'task-1', entity: 'agent' },
 *   { type: 'task', id: 'task-1', entity: 'skill' },
 * ])
 * // Returns: ['task:task-1:agent', 'task:task-1:skill']
 * ```
 */
export function buildBatch(keys: CorrelationKey[]): string[] {
  return keys.map(buildCorrelationKey);
}

/**
 * Parse multiple correlation keys in batch
 *
 * @param keyStrings - Array of correlation key strings
 * @returns Array of parsed correlation keys (nulls filtered out)
 */
export function parseBatch(keyStrings: string[]): CorrelationKey[] {
  return keyStrings
    .map(parseCorrelationKey)
    .filter((key): key is CorrelationKey => key !== null);
}

/**
 * Match correlation key against wildcard pattern
 *
 * @param keyString - Correlation key to match
 * @param pattern - Wildcard pattern
 * @returns True if key matches pattern
 *
 * @example
 * ```typescript
 * matchesWildcard('task:abc123:agent:backend', {
 *   type: 'task',
 *   id: '*',
 *   entity: 'agent'
 * }) // Returns: true
 *
 * matchesWildcard('agent:xyz:execution', {
 *   type: 'task'
 * }) // Returns: false
 * ```
 */
export function matchesWildcard(keyString: string, pattern: WildcardPattern): boolean {
  const key = parseCorrelationKey(keyString);

  if (!key) {
    return false;
  }

  // Check type
  if (pattern.type && pattern.type !== '*' && key.type !== pattern.type) {
    return false;
  }

  // Check ID
  if (pattern.id && pattern.id !== '*' && key.id !== pattern.id) {
    return false;
  }

  // Check entity
  if (pattern.entity !== undefined && pattern.entity !== '*' && key.entity !== pattern.entity) {
    return false;
  }

  // Check subtype
  if (pattern.subtype !== undefined && pattern.subtype !== '*' && key.subtype !== pattern.subtype) {
    return false;
  }

  return true;
}

/**
 * Filter correlation keys by wildcard pattern
 *
 * @param keyStrings - Array of correlation keys
 * @param pattern - Wildcard pattern to filter by
 * @returns Filtered array of keys matching pattern
 */
export function filterByPattern(keyStrings: string[], pattern: WildcardPattern): string[] {
  return keyStrings.filter(key => matchesWildcard(key, pattern));
}
