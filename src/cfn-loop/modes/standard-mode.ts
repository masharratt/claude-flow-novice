/**
 * Standard Mode Configuration
 * Balanced approach with good quality gates - suitable for most projects
 */

import type { CFNLoopMode } from './types.js';

/**
 * Standard mode: Balanced quality and velocity
 * - Moderate thresholds for reasonable quality
 * - Standard validator count (4)
 * - Standard validations
 * - Single product owner
 */
export const standardMode: CFNLoopMode = {
  name: 'standard',
  gateThreshold: 0.75,
  consensusThreshold: 0.90,
  maxLoop2Iterations: 10,
  maxLoop3Iterations: 10,
  validatorCount: 4,
  validatorTypes: ['reviewer', 'tester', 'security', 'performance'],
  productOwnerStructure: 'single',
  specialInstructions:
    'Standard mode: Balance quality and velocity. All standard validations required. Aim for production-ready code with reasonable iteration limits.',
};

export default standardMode;
