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

import { CorrelationKey } from './types';

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
