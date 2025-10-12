/**
 * MVP Mode Configuration
 *
 * Speed-focused CFN Loop mode for rapid prototyping and MVP development.
 *
 * Characteristics:
 * - Lower thresholds (Gate: 0.70, Consensus: 0.80)
 * - Fewer iterations (Max Loop2: 5, Max Loop3: 5)
 * - 2 validators (minimal team)
 * - Single product owner agent
 * - Skip non-critical validations (accessibility, performance benchmarks)
 * - Prioritize working implementation over perfect architecture
 *
 * @module cfn-loop/modes/mvp-mode
 */

import type { CFNLoopMode } from './types.js';

/**
 * MVP mode configuration
 *
 * Optimized for:
 * - Fast iteration cycles
 * - Working prototypes
 * - Technical debt acceptable
 * - Ship fast, iterate later
 */
export const mvpMode: CFNLoopMode = {
  name: 'mvp',

  // Lower confidence thresholds for speed
  gateThreshold: 0.70, // Loop 3 gate (vs 0.75 standard)
  consensusThreshold: 0.80, // Loop 2 consensus (vs 0.90 standard)

  // Reduced iteration limits
  maxLoop2Iterations: 5, // Phase-level (vs 10 standard)
  maxLoop3Iterations: 5, // Swarm-level (vs 10 standard)

  // Minimal validator team
  validatorCount: 2,
  validatorTypes: ['reviewer', 'tester'],

  // Single product owner for speed
  productOwnerStructure: 'single',

  // Skip non-critical validations
  skipValidations: [
    'accessibility', // WCAG compliance (defer to production)
    'performance-benchmarks', // Load testing (defer to optimization phase)
    'comprehensive-docs', // Full documentation (MVP can have basic docs)
  ],

  // Special instructions for MVP mindset
  specialInstructions: `
# MVP Mode - Speed-Focused Development

You are working in **MVP Mode**. Priorities:

1. **Working Implementation First**
   - Focus on core functionality
   - Basic implementation over perfect architecture
   - Technical debt acceptable for MVP

2. **Ship Fast, Iterate Later**
   - Deliver working features quickly
   - Defer optimizations to future iterations
   - Document known limitations

3. **Pragmatic Quality Standards**
   - Basic test coverage (>70%)
   - Core security checks only
   - Simple architecture patterns

4. **Acceptable Trade-offs**
   - Performance: Must work, optimization later
   - Scalability: Single-instance first, scale later
   - Documentation: Inline comments + basic README

**Remember:** This is MVP mode. Perfect is the enemy of good. Ship working code.
  `.trim(),
};

/**
 * Get MVP mode configuration
 */
export function getMVPMode(): CFNLoopMode {
  return mvpMode;
}

export default mvpMode;
