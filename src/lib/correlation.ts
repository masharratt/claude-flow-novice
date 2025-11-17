/**
 * Correlation ID Tracking Utilities
 *
 * Provides correlation ID generation and key building for distributed tracing.
 * Part of Task 0.5: Implementation Tooling & Utilities (Foundation)
 *
 * Format: {type}:{id}:{entity}:{subtype}
 * Examples:
 *   - task:abc123:agent:backend-developer
 *   - request:req-456:api:auth
 *   - execution:exec-789:step:validation
 *
 * Compatible with database-service correlation patterns but more generic.
 */

import { randomUUID } from 'crypto';

/**
 * Correlation key parts
 */
export interface CorrelationKeyParts {
  /** Key type (e.g., 'task', 'request', 'execution') */
  type: string;
  /** Unique identifier */
  id: string;
  /** Entity name (optional) */
  entity?: string;
  /** Subtype or additional context (optional) */
  subtype?: string;
}

/**
 * Correlation context for request tracking
 */
export interface CorrelationContext {
  /** Correlation ID */
  correlationId: string;
  /** Parent correlation ID (for nested operations) */
  parentId?: string;
  /** Request timestamp */
  timestamp: Date;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Generate a new correlation ID (UUID v4)
 *
 * @returns UUID v4 string
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Generate a short correlation ID (8 characters, timestamp-based)
 *
 * @returns Short correlation ID
 */
export function generateShortCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `${timestamp}-${random}`;
}

/**
 * Build correlation key string from parts
 *
 * Format: {type}:{id}:{entity}:{subtype}
 *
 * @param parts - Correlation key parts
 * @returns Correlation key string
 */
export function buildCorrelationKey(parts: CorrelationKeyParts): string {
  const segments = [parts.type, parts.id];

  if (parts.entity) {
    segments.push(parts.entity);
  }

  if (parts.subtype) {
    segments.push(parts.subtype);
  }

  return segments.join(':');
}

/**
 * Parse correlation key string into parts
 *
 * @param key - Correlation key string
 * @returns Parsed correlation key parts, or null if invalid
 */
export function parseCorrelationKey(key: string): CorrelationKeyParts | null {
  if (!key || typeof key !== 'string') {
    return null;
  }

  const parts = key.split(':');

  if (parts.length < 2) {
    return null;
  }

  const [type, id, entity, subtype] = parts;

  if (!type || !id) {
    return null;
  }

  return {
    type,
    id,
    entity,
    subtype,
  };
}

/**
 * Validate correlation key format
 *
 * @param key - Correlation key string
 * @returns True if key is valid
 */
export function isValidCorrelationKey(key: string): boolean {
  return parseCorrelationKey(key) !== null;
}

/**
 * Build task correlation key
 *
 * @param taskId - Task identifier
 * @param entity - Entity name (optional)
 * @param subtype - Subtype (optional)
 * @returns Correlation key string
 */
export function buildTaskKey(taskId: string, entity?: string, subtype?: string): string {
  return buildCorrelationKey({ type: 'task', id: taskId, entity, subtype });
}

/**
 * Build request correlation key
 *
 * @param requestId - Request identifier
 * @param entity - Entity name (optional)
 * @param subtype - Subtype (optional)
 * @returns Correlation key string
 */
export function buildRequestKey(requestId: string, entity?: string, subtype?: string): string {
  return buildCorrelationKey({ type: 'request', id: requestId, entity, subtype });
}

/**
 * Build execution correlation key
 *
 * @param executionId - Execution identifier
 * @param entity - Entity name (optional)
 * @param subtype - Subtype (optional)
 * @returns Correlation key string
 */
export function buildExecutionKey(
  executionId: string,
  entity?: string,
  subtype?: string
): string {
  return buildCorrelationKey({ type: 'execution', id: executionId, entity, subtype });
}

/**
 * Build agent correlation key
 *
 * @param agentId - Agent identifier
 * @param entity - Entity name (optional)
 * @param subtype - Subtype (optional)
 * @returns Correlation key string
 */
export function buildAgentKey(agentId: string, entity?: string, subtype?: string): string {
  return buildCorrelationKey({ type: 'agent', id: agentId, entity, subtype });
}

/**
 * Extract type from correlation key
 *
 * @param key - Correlation key string
 * @returns Type string, or null if invalid
 */
export function extractType(key: string): string | null {
  const parts = parseCorrelationKey(key);
  return parts ? parts.type : null;
}

/**
 * Extract ID from correlation key
 *
 * @param key - Correlation key string
 * @returns ID string, or null if invalid
 */
export function extractId(key: string): string | null {
  const parts = parseCorrelationKey(key);
  return parts ? parts.id : null;
}

/**
 * Extract entity from correlation key
 *
 * @param key - Correlation key string
 * @returns Entity string, or null if not present
 */
export function extractEntity(key: string): string | null {
  const parts = parseCorrelationKey(key);
  return parts?.entity || null;
}

/**
 * Check if correlation key matches pattern
 *
 * @param key - Correlation key string
 * @param pattern - Pattern to match (partial CorrelationKeyParts)
 * @returns True if key matches pattern
 */
export function matchesPattern(key: string, pattern: Partial<CorrelationKeyParts>): boolean {
  const parts = parseCorrelationKey(key);

  if (!parts) {
    return false;
  }

  if (pattern.type && parts.type !== pattern.type) {
    return false;
  }

  if (pattern.id && parts.id !== pattern.id) {
    return false;
  }

  if (pattern.entity && parts.entity !== pattern.entity) {
    return false;
  }

  if (pattern.subtype && parts.subtype !== pattern.subtype) {
    return false;
  }

  return true;
}

/**
 * Create correlation context
 *
 * @param correlationId - Correlation ID (generated if not provided)
 * @param parentId - Parent correlation ID (optional)
 * @param metadata - Additional metadata (optional)
 * @returns Correlation context
 */
export function createCorrelationContext(
  correlationId?: string,
  parentId?: string,
  metadata?: Record<string, any>
): CorrelationContext {
  return {
    correlationId: correlationId || generateCorrelationId(),
    parentId,
    timestamp: new Date(),
    metadata,
  };
}

/**
 * Build hierarchical correlation ID (parent-child relationship)
 *
 * Format: {parentId}/{childId}
 *
 * @param parentId - Parent correlation ID
 * @param childId - Child correlation ID (generated if not provided)
 * @returns Hierarchical correlation ID
 */
export function buildHierarchicalId(parentId: string, childId?: string): string {
  const child = childId || generateShortCorrelationId();
  return `${parentId}/${child}`;
}

/**
 * Parse hierarchical correlation ID
 *
 * @param hierarchicalId - Hierarchical correlation ID
 * @returns Object with parentId and childId, or null if invalid
 */
export function parseHierarchicalId(
  hierarchicalId: string
): { parentId: string; childId: string } | null {
  if (!hierarchicalId || typeof hierarchicalId !== 'string') {
    return null;
  }

  const parts = hierarchicalId.split('/');

  if (parts.length !== 2) {
    return null;
  }

  const [parentId, childId] = parts;

  if (!parentId || !childId) {
    return null;
  }

  return { parentId, childId };
}

/**
 * Extract parent ID from hierarchical correlation ID
 *
 * @param hierarchicalId - Hierarchical correlation ID
 * @returns Parent ID, or null if invalid
 */
export function extractParentId(hierarchicalId: string): string | null {
  const parsed = parseHierarchicalId(hierarchicalId);
  return parsed ? parsed.parentId : null;
}

/**
 * Extract child ID from hierarchical correlation ID
 *
 * @param hierarchicalId - Hierarchical correlation ID
 * @returns Child ID, or null if invalid
 */
export function extractChildId(hierarchicalId: string): string | null {
  const parsed = parseHierarchicalId(hierarchicalId);
  return parsed ? parsed.childId : null;
}
