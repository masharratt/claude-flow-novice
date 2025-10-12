/**
 * Standard Mode Configuration
 *
 * Balanced CFN Loop mode for general-purpose development.
 * This is the default mode when no explicit mode is specified.
 *
 * Characteristics:
 * - Standard thresholds (Gate: 0.75, Consensus: 0.90)
 * - Standard iterations (Max Loop2: 10, Max Loop3: 10)
 * - 4 validators (balanced team)
 * - Single product owner agent
 * - Balanced quality and speed
 *
 * @module cfn-loop/modes/standard-mode
 */

import type { CFNLoopMode } from './types.js';

/**
 * Standard mode configuration
 *
 * Optimized for:
 * - Production-ready code
 * - Reasonable quality standards
 * - Balanced development speed
 * - Standard best practices
 */
export const standardMode: CFNLoopMode = {
  name: 'standard',

  // Standard confidence thresholds
  gateThreshold: 0.75, // Loop 3 gate
  consensusThreshold: 0.90, // Loop 2 consensus

  // Standard iteration limits
  maxLoop2Iterations: 10, // Phase-level
  maxLoop3Iterations: 10, // Swarm-level

  // Balanced validator team
  validatorCount: 4,
  validatorTypes: [
    'reviewer',
    'security-specialist',
    'tester',
    'analyst',
  ],

  // Single product owner
  productOwnerStructure: 'single',

  // No skipped validations
  skipValidations: [],

  // Special instructions for standard development
  specialInstructions: `
# Standard Mode - Balanced Development

You are working in **Standard Mode**. Priorities:

1. **Production-Ready Quality**
   - Clean, maintainable code
   - Comprehensive test coverage (>80%)
   - Security best practices
   - Complete error handling

2. **Balanced Approach**
   - Quality without over-engineering
   - Good architecture without gold-plating
   - Documentation that's clear and sufficient
   - Performance that meets requirements

3. **Best Practices**
   - SOLID principles
   - Design patterns where appropriate
   - Code reviews required
   - CI/CD ready

4. **Pragmatic Trade-offs**
   - Optimize for common cases
   - Document edge cases
   - Defer extreme optimizations
   - Focus on maintainability

**Remember:** This is standard mode. Deliver production-ready code with balanced quality and speed.
  `.trim(),
};

/**
 * Get Standard mode configuration
 */
export function getStandardMode(): CFNLoopMode {
  return standardMode;
}

export default standardMode;
