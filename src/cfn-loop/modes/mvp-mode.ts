/**
 * MVP Mode Configuration
 * Fast iteration with minimal validation - suitable for prototyping
 */

import type { CFNLoopMode } from './types.js';

/**
 * MVP mode: Optimized for speed and rapid iteration
 * - Lower thresholds for faster decisions
 * - Fewer validators (2)
 * - Skips architecture review
 * - Single product owner
 */
export const mvpMode: CFNLoopMode = {
  name: 'mvp',
  gateThreshold: 0.70,
  consensusThreshold: 0.85,
  maxLoop2Iterations: 5,
  maxLoop3Iterations: 5,
  validatorCount: 2,
  validatorTypes: ['reviewer', 'tester'],
  productOwnerStructure: 'single',
  skipValidations: ['architecture-review', 'enterprise-security-audit'],
  specialInstructions:
    'MVP mode: Focus on rapid iteration and core functionality. Skip comprehensive architecture reviews. Acceptable to have technical debt for later refinement.',
};

export default mvpMode;
