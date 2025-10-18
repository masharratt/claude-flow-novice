/**
 * Consensus System Exports
 * Centralized export of all consensus implementations
 */

export { MVPConsensus } from './mvp-consensus.js';
export { EnterprisePlanningConsensus } from './enterprise-planning-consensus.js';

export type {
  ConsensusConfig,
  ConsensusResult,
  PlanningConsensusResult,
  ArchitectVote,
  ConsensusValidator,
} from './types.js';

import { MVPConsensus } from './mvp-consensus.js';
import { EnterprisePlanningConsensus } from './enterprise-planning-consensus.js';
import type { CFNLoopModeName } from '../modes/types.js';
import type { ConsensusValidator } from './types.js';

/**
 * Get consensus implementation for mode
 */
export function getConsensusForMode(
  mode: CFNLoopModeName,
  memoryManager?: unknown
): ConsensusValidator {
  switch (mode) {
    case 'mvp':
      return new MVPConsensus(memoryManager);
    case 'standard':
      return new MVPConsensus(memoryManager); // Standard uses same as MVP
    case 'enterprise':
      return new EnterprisePlanningConsensus(memoryManager);
    default:
      throw new Error(`Unknown mode for consensus: ${mode}`);
  }
}

/**
 * Execute MVP consensus (legacy function wrapper)
 */
export async function executeMVPConsensus(
  votes: import('../byzantine-consensus-adapter.js').ValidatorVote[],
  memoryManager?: unknown
): Promise<import('./types.js').ConsensusResult> {
  const consensus = new MVPConsensus(memoryManager);
  return consensus.executeConsensus(votes);
}

/**
 * Execute planning consensus (legacy function wrapper)
 */
export async function executePlanningConsensus(
  votes: import('../byzantine-consensus-adapter.js').ValidatorVote[],
  memoryManager?: unknown
): Promise<PlanningConsensusResult> {
  const consensus = new EnterprisePlanningConsensus(memoryManager);
  return consensus.executeConsensus(votes);
}
