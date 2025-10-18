/**
 * CFN Loop Mode Exports
 * Centralized export of all mode configurations
 */

export { mvpMode } from './mvp-mode.js';
export { standardMode } from './standard-mode.js';
export { enterpriseMode } from './enterprise-mode.js';

export type {
  CFNLoopMode,
  CFNLoopModeName,
  ProductOwnerStructure,
  PlanningConsensusConfig,
  ProductOwnerRole,
  ProductOwnerTeamConfig,
  ModeDetectionMetadata,
  ModeSelectionResult,
  StakeholderVote,
  BoardDecision,
} from './types.js';

export {
  isMVPMode,
  isEnterpriseMode,
  isStandardMode,
  hasPlanningConsensus,
  hasProductOwnerTeam,
} from './types.js';

import { mvpMode } from './mvp-mode.js';
import { standardMode } from './standard-mode.js';
import { enterpriseMode } from './enterprise-mode.js';
import type { CFNLoopMode, CFNLoopModeName } from './types.js';

/**
 * Get mode configuration by name
 */
export function getModeByName(modeName: CFNLoopModeName): CFNLoopMode {
  switch (modeName) {
    case 'mvp':
      return mvpMode;
    case 'standard':
      return standardMode;
    case 'enterprise':
      return enterpriseMode;
    default:
      throw new Error(`Unknown CFN Loop mode: ${modeName}`);
  }
}

/**
 * Get all available modes
 */
export function getAllModes(): CFNLoopMode[] {
  return [mvpMode, standardMode, enterpriseMode];
}

/**
 * Default mode (Standard)
 */
export const DEFAULT_MODE: CFNLoopMode = standardMode;

/**
 * Select mode based on mode name or detection metadata
 */
export function selectMode(
  modeName?: CFNLoopModeName,
  metadata?: { cfnMode?: CFNLoopModeName; mode?: CFNLoopModeName }
): CFNLoopMode {
  // Explicit mode name takes precedence
  if (modeName) {
    return getModeByName(modeName);
  }

  // Check metadata
  if (metadata?.cfnMode) {
    return getModeByName(metadata.cfnMode);
  }
  if (metadata?.mode) {
    return getModeByName(metadata.mode);
  }

  // Default to standard mode
  return DEFAULT_MODE;
}
