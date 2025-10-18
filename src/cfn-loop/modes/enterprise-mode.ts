/**
 * Enterprise Mode Configuration
 * Maximum quality gates and comprehensive validation - for critical systems
 */

import type { CFNLoopMode } from './types.js';

/**
 * Enterprise mode: Maximum quality and comprehensive validation
 * - High thresholds for strict quality control
 * - Maximum validators (5)
 * - Planning consensus (Loop 0.5) with architects
 * - Product owner team with weighted voting
 */
export const enterpriseMode: CFNLoopMode = {
  name: 'enterprise',
  gateThreshold: 0.85,
  consensusThreshold: 0.95,
  maxLoop2Iterations: 15,
  maxLoop3Iterations: 15,
  validatorCount: 5,
  validatorTypes: ['reviewer', 'tester', 'security', 'performance', 'architect'],
  productOwnerStructure: 'team',
  specialInstructions:
    'Enterprise mode: Maximum quality standards. All validations required including architecture review, security audit, and accessibility compliance. Product owner board makes final decisions.',

  // Loop 0.5: Planning consensus before Loop 1
  planningConsensus: {
    enabled: true,
    architectTypes: ['architect', 'system-architect', 'security-specialist'],
    threshold: 0.85,
  },

  // Loop 4: Product owner team with weighted voting
  productOwnerTeam: {
    roles: [
      { name: 'cto', weight: 0.35 },
      { name: 'product-owner', weight: 0.30 },
      { name: 'user-power', weight: 0.20 },
      { name: 'user-accessibility', weight: 0.15 },
    ],
    votingAlgorithm: 'weighted-confidence',
  },
};

export default enterpriseMode;
