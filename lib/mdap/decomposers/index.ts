/**
 * MDAP Decomposers Module
 *
 * Exports all decomposer functions for analyzing tasks from different perspectives.
 * Each decomposer focuses on a specific aspect (architecture, security, performance, testing).
 *
 * @module decomposers
 * @version 1.0.0
 */

// Export decomposer functions
export { decomposeArchitecture } from './architecture.js';
export { decomposeTesting } from './testing.js';
export { decomposePerformance } from './performance.js';
export { decomposeSecurity } from './security.js';

// Import functions for internal registry
import { decomposeArchitecture } from './architecture.js';
import { decomposeTesting } from './testing.js';
import { decomposePerformance } from './performance.js';
import { decomposeSecurity } from './security.js';

// Export types for each decomposer
export type {
  ArchitectureDecomposerPayload,
  ArchitectureAnalysis,
  ArchitectureComponent,
  ArchitectureBoundary,
} from './architecture.js';

export type {
  TestingDecomposerPayload,
  TestingAnalysis,
  TestRequirement,
} from './testing.js';

export type {
  PerformanceDecomposerPayload,
  PerformanceAnalysis,
  PerformanceConstraint,
} from './performance.js';

export type {
  SecurityDecomposerPayload,
  SecurityAnalysis,
  SecurityBoundary,
} from './security.js';

// =============================================
// Decomposer Registry
// =============================================

/**
 * Available decomposer perspectives
 */
export type DecomposerPerspective = "architecture" | "security" | "performance" | "testing";

/**
 * Decomposer function registry
 */
export const DECOMPOSERS = {
  architecture: { decompose: decomposeArchitecture },
  security: { decompose: decomposeSecurity },
  performance: { decompose: decomposePerformance },
  testing: { decompose: decomposeTesting },
} as const;

/**
 * Get decomposer function by perspective
 *
 * @param perspective - The perspective name
 * @returns The decomposer function
 */
export function getDecomposer(perspective: DecomposerPerspective) {
  return DECOMPOSERS[perspective].decompose;
}

/**
 * Get all available decomposer perspectives
 *
 * @returns Array of perspective names
 */
export function getAvailablePerspectives(): DecomposerPerspective[] {
  return Object.keys(DECOMPOSERS) as DecomposerPerspective[];
}