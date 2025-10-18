/**
 * Product Owner System Exports
 * Centralized export of all product owner implementations
 */

export { MVPOwner } from './mvp-owner.js';
export { EnterpriseOwnerTeam } from './enterprise-owner-team.js';

export type {
  POConfig,
  PODecision,
  PODecisionResult,
  GOAPState,
  GOAPAction,
  TeamVote,
  TeamDecisionResult,
  ProductOwner,
} from './types.js';

import { MVPOwner } from './mvp-owner.js';
import { EnterpriseOwnerTeam } from './enterprise-owner-team.js';
import type { CFNLoopModeName } from '../modes/types.js';
import type { ProductOwner } from './types.js';

/**
 * Get product owner implementation for mode
 */
export function getProductOwnerForMode(
  mode: CFNLoopModeName,
  memoryManager?: unknown
): ProductOwner {
  switch (mode) {
    case 'mvp':
    case 'standard':
      return new MVPOwner(memoryManager);
    case 'enterprise':
      return new EnterpriseOwnerTeam(memoryManager);
    default:
      throw new Error(`Unknown mode for product owner: ${mode}`);
  }
}

/**
 * Execute MVP owner decision (legacy function wrapper)
 */
export async function executeMVPOwnerDecision(
  state: import('./types.js').GOAPState,
  memoryManager?: unknown
): Promise<import('./types.js').PODecisionResult> {
  const owner = new MVPOwner(memoryManager);
  return owner.makeDecision(state);
}

/**
 * Execute Enterprise board decision (legacy function wrapper)
 */
export async function executeEnterpriseBoardDecision(
  state: import('./types.js').GOAPState,
  memoryManager?: unknown
): Promise<import('./types.js').TeamDecisionResult> {
  const team = new EnterpriseOwnerTeam(memoryManager);
  return team.makeDecision(state);
}
