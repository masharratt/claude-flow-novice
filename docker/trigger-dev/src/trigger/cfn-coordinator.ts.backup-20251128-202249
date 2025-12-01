/**
 * CFN Coordinator Task (Strategic)
 *
 * Analyzes tasks and produces agent manifests with intelligent decomposition.
 * Handles pattern detection for: libraries, features, refactors.
 * Creates phase-based breakdowns with parallel execution flags.
 *
 * @module cfn-coordinator
 * @version 1.0.0
 */

import { task } from "@trigger.dev/sdk/v3";
import * as db from "../lib/cfn-db.js";
import { analyzeTaskComplexity, type TaskComplexity } from "../lib/task-analyzer.js";

// =============================================
// Type Definitions
// =============================================

/**
 * Payload for the coordinator task
 */
export interface CoordinatorPayload {
  /** Unique task identifier */
  taskId: string;
  /** Iteration database record ID */
  iterationId: number;
  /** Human-readable task description */
  taskDescription: string;
  /** Execution mode affecting thresholds */
  mode: 'mvp' | 'standard' | 'enterprise';
  /** Working directory for file operations */
  workDir: string;
  /** Results from previous iteration (for context) */
  previousResults?: PreviousResults;
  /** Optional specific files to target */
  targetFiles?: string[];
  /** Optional specific tests to run */
  targetTests?: string[];
}

/**
 * Results from a previous iteration for context
 */
export interface PreviousResults {
  passRate: number;
  failedTests: string[];
  modifiedFiles: string[];
  validatorFeedback?: string[];
}

/**
 * Complete manifest describing how to execute the task
 */
export interface AgentManifest {
  /** Ordered phases of execution */
  phases: Phase[];
  /** Dependency map: agent id -> array of prerequisite agent ids */
  dependencies: Record<string, string[]>;
  /** Total number of agents across all phases */
  totalAgents: number;
  /** Detected task pattern */
  detectedPattern: TaskPattern;
  /** Estimated execution time in minutes */
  estimatedMinutes: number;
}

/**
 * A phase of execution containing one or more agents
 */
export interface Phase {
  /** Phase number (1-indexed) */
  phase: number;
  /** Human-readable phase name */
  name: string;
  /** Whether agents in this phase can run in parallel */
  parallel: boolean;
  /** Agents to execute in this phase */
  agents: AgentDefinition[];
  /** Phase-level success criteria */
  successCriteria?: string;
}

/**
 * Definition of a single agent's work
 */
export interface AgentDefinition {
  /** Unique agent identifier within the task */
  id: string;
  /** Agent type/specialization */
  type: AgentType;
  /** Specific task description for this agent */
  task: string;
  /** Files this agent should create/modify */
  files: string[];
  /** Tests this agent should create/run */
  tests: string[];
  /** Expected outputs from this agent */
  expectedOutputs?: string[];
  /** Estimated duration in minutes */
  estimatedMinutes?: number;
}

/**
 * Detected task pattern for decomposition strategy
 */
export type TaskPattern =
  | 'library'           // New library/module creation
  | 'feature'           // Single feature implementation
  | 'multi-feature'     // Multiple related features
  | 'refactor'          // Code refactoring
  | 'bugfix'            // Bug fix with tests
  | 'infrastructure'    // Config/setup work
  | 'documentation'     // Documentation only
  | 'unknown';          // Fallback pattern

/**
 * Agent specialization types
 */
export type AgentType =
  | 'typescript-specialist'
  | 'testing-specialist'
  | 'infrastructure-specialist'
  | 'documentation-specialist'
  | 'security-specialist'
  | 'performance-specialist'
  | 'general';

/**
 * Result returned by the coordinator task
 */
export interface CoordinatorResult {
  manifest: AgentManifest;
  analysisNotes: string[];
  complexityAnalysis: TaskComplexity;
}

// =============================================
// Pattern Detection Logic
// =============================================

interface PatternScore {
  pattern: TaskPattern;
  score: number;
  indicators: string[];
}

/**
 * Analyzes task description to detect the most likely pattern
 */
function detectTaskPattern(description: string): PatternScore {
  const lower = description.toLowerCase();
  const scores: PatternScore[] = [];

  // Library pattern indicators
  const libraryIndicators: string[] = [];
  if (lower.includes('library')) libraryIndicators.push('mentions library');
  if (lower.includes('module')) libraryIndicators.push('mentions module');
  if (lower.includes('package')) libraryIndicators.push('mentions package');
  if (lower.includes('create') && (lower.includes('types') || lower.includes('exports'))) {
    libraryIndicators.push('create + types/exports');
  }
  if (lower.includes('npm') || lower.includes('publish')) libraryIndicators.push('npm/publish mention');
  scores.push({ pattern: 'library', score: libraryIndicators.length * 2, indicators: libraryIndicators });

  // Feature pattern indicators
  const featureIndicators: string[] = [];
  if (lower.includes('feature')) featureIndicators.push('mentions feature');
  if (lower.includes('implement')) featureIndicators.push('mentions implement');
  if (lower.includes('add') && !lower.includes('add test')) featureIndicators.push('add (not test)');
  if (lower.includes('endpoint') || lower.includes('api')) featureIndicators.push('endpoint/api mention');
  if (lower.includes('component') || lower.includes('ui')) featureIndicators.push('component/ui mention');
  scores.push({ pattern: 'feature', score: featureIndicators.length * 1.5, indicators: featureIndicators });

  // Multi-feature pattern
  const multiIndicators: string[] = [];
  if ((lower.match(/and/g) || []).length >= 2) multiIndicators.push('multiple "and" conjunctions');
  if (lower.includes('features')) multiIndicators.push('plural "features"');
  if (lower.includes('multiple') || lower.includes('several')) multiIndicators.push('multiple/several mention');
  scores.push({ pattern: 'multi-feature', score: multiIndicators.length * 2, indicators: multiIndicators });

  // Refactor pattern indicators
  const refactorIndicators: string[] = [];
  if (lower.includes('refactor')) refactorIndicators.push('mentions refactor');
  if (lower.includes('restructure')) refactorIndicators.push('mentions restructure');
  if (lower.includes('reorganize')) refactorIndicators.push('mentions reorganize');
  if (lower.includes('improve') && lower.includes('code')) refactorIndicators.push('improve code');
  if (lower.includes('clean up') || lower.includes('cleanup')) refactorIndicators.push('cleanup mention');
  if (lower.includes('extract') || lower.includes('split')) refactorIndicators.push('extract/split mention');
  scores.push({ pattern: 'refactor', score: refactorIndicators.length * 2, indicators: refactorIndicators });

  // Bugfix pattern indicators
  const bugfixIndicators: string[] = [];
  if (lower.includes('bug')) bugfixIndicators.push('mentions bug');
  if (lower.includes('fix')) bugfixIndicators.push('mentions fix');
  if (lower.includes('issue')) bugfixIndicators.push('mentions issue');
  if (lower.includes('error')) bugfixIndicators.push('mentions error');
  if (lower.includes('broken')) bugfixIndicators.push('mentions broken');
  if (lower.includes('failing')) bugfixIndicators.push('mentions failing');
  scores.push({ pattern: 'bugfix', score: bugfixIndicators.length * 1.5, indicators: bugfixIndicators });

  // Infrastructure pattern indicators
  const infraIndicators: string[] = [];
  if (lower.includes('config')) infraIndicators.push('mentions config');
  if (lower.includes('setup')) infraIndicators.push('mentions setup');
  if (lower.includes('docker')) infraIndicators.push('mentions docker');
  if (lower.includes('ci') || lower.includes('cd')) infraIndicators.push('ci/cd mention');
  if (lower.includes('deploy')) infraIndicators.push('mentions deploy');
  if (lower.includes('environment')) infraIndicators.push('mentions environment');
  scores.push({ pattern: 'infrastructure', score: infraIndicators.length * 1.5, indicators: infraIndicators });

  // Documentation pattern indicators
  const docIndicators: string[] = [];
  if (lower.includes('document')) docIndicators.push('mentions document');
  if (lower.includes('readme')) docIndicators.push('mentions readme');
  if (lower.includes('jsdoc') || lower.includes('tsdoc')) docIndicators.push('jsdoc/tsdoc mention');
  if (lower.includes('comment')) docIndicators.push('mentions comment');
  if (lower.includes('explain')) docIndicators.push('mentions explain');
  scores.push({ pattern: 'documentation', score: docIndicators.length * 1.5, indicators: docIndicators });

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  // Return highest scoring pattern, or 'unknown' if no indicators
  if (scores[0].score > 0) {
    return scores[0];
  }

  return { pattern: 'unknown', score: 0, indicators: [] };
}

// =============================================
// Decomposition Strategies
// =============================================

/**
 * Creates manifest for library creation pattern
 */
function decomposeLibraryPattern(
  payload: CoordinatorPayload,
  patternInfo: PatternScore
): AgentManifest {
  const phases: Phase[] = [];
  const dependencies: Record<string, string[]> = {};

  // Phase 1: Project setup (sequential)
  phases.push({
    phase: 1,
    name: 'project-setup',
    parallel: false,
    successCriteria: 'package.json and tsconfig.json exist and are valid',
    agents: [{
      id: 'setup-1',
      type: 'typescript-specialist',
      task: 'Create project structure: package.json with dependencies, tsconfig.json with strict settings, jest.config.js for testing',
      files: ['package.json', 'tsconfig.json', 'jest.config.js'],
      tests: [],
      estimatedMinutes: 5
    }]
  });

  // Phase 2: Types and error handling (parallel)
  phases.push({
    phase: 2,
    name: 'types-and-errors',
    parallel: true,
    successCriteria: 'Type definitions compile without errors, error classes are properly exported',
    agents: [
      {
        id: 'types-1',
        type: 'typescript-specialist',
        task: `Create comprehensive type definitions for: ${payload.taskDescription}`,
        files: ['src/types/index.ts'],
        tests: ['src/types/__tests__/index.test.ts'],
        estimatedMinutes: 10
      },
      {
        id: 'errors-1',
        type: 'typescript-specialist',
        task: 'Create custom error classes with proper error codes and messages',
        files: ['src/errors/index.ts'],
        tests: ['src/errors/__tests__/index.test.ts'],
        estimatedMinutes: 8
      }
    ]
  });

  dependencies['types-1'] = ['setup-1'];
  dependencies['errors-1'] = ['setup-1'];

  // Phase 3: Core implementation (can be parallel if multiple components)
  phases.push({
    phase: 3,
    name: 'core-implementation',
    parallel: true,
    successCriteria: 'Core functionality works and all tests pass',
    agents: [{
      id: 'core-1',
      type: 'typescript-specialist',
      task: `Implement core library functionality: ${payload.taskDescription}`,
      files: ['src/core/index.ts'],
      tests: ['src/core/__tests__/index.test.ts'],
      estimatedMinutes: 20
    }]
  });

  dependencies['core-1'] = ['types-1', 'errors-1'];

  // Phase 4: Integration and exports (sequential)
  phases.push({
    phase: 4,
    name: 'integration-and-exports',
    parallel: false,
    successCriteria: 'All exports available from index.ts, integration tests pass',
    agents: [{
      id: 'exports-1',
      type: 'typescript-specialist',
      task: 'Create src/index.ts with all public exports, add integration tests',
      files: ['src/index.ts'],
      tests: ['src/__tests__/index.test.ts', 'src/__tests__/integration.test.ts'],
      estimatedMinutes: 10
    }]
  });

  dependencies['exports-1'] = ['core-1'];

  const totalAgents = phases.reduce((sum, p) => sum + p.agents.length, 0);
  const estimatedMinutes = phases.reduce(
    (sum, p) => sum + Math.max(...p.agents.map(a => a.estimatedMinutes || 10)),
    0
  );

  return {
    phases,
    dependencies,
    totalAgents,
    detectedPattern: 'library',
    estimatedMinutes
  };
}

/**
 * Creates manifest for feature implementation pattern
 */
function decomposeFeaturePattern(
  payload: CoordinatorPayload,
  patternInfo: PatternScore
): AgentManifest {
  const phases: Phase[] = [];
  const dependencies: Record<string, string[]> = {};

  // Single phase for simple features
  phases.push({
    phase: 1,
    name: 'implementation',
    parallel: false,
    successCriteria: 'Feature implemented with tests passing',
    agents: [{
      id: 'impl-1',
      type: 'typescript-specialist',
      task: payload.taskDescription,
      files: payload.targetFiles || [],
      tests: payload.targetTests || [],
      estimatedMinutes: 15
    }]
  });

  return {
    phases,
    dependencies,
    totalAgents: 1,
    detectedPattern: 'feature',
    estimatedMinutes: 15
  };
}

/**
 * Creates manifest for refactoring pattern
 */
function decomposeRefactorPattern(
  payload: CoordinatorPayload,
  patternInfo: PatternScore
): AgentManifest {
  const phases: Phase[] = [];
  const dependencies: Record<string, string[]> = {};

  // Phase 1: Analysis and test coverage (sequential)
  phases.push({
    phase: 1,
    name: 'analysis-and-tests',
    parallel: false,
    successCriteria: 'Comprehensive tests exist to catch regressions',
    agents: [{
      id: 'test-coverage-1',
      type: 'testing-specialist',
      task: 'Add comprehensive test coverage for code being refactored to catch regressions',
      files: [],
      tests: payload.targetTests || ['src/**/__tests__/*.test.ts'],
      estimatedMinutes: 15
    }]
  });

  // Phase 2: Refactoring (sequential, depends on tests)
  phases.push({
    phase: 2,
    name: 'refactoring',
    parallel: false,
    successCriteria: 'Code refactored, all existing tests still pass',
    agents: [{
      id: 'refactor-1',
      type: 'typescript-specialist',
      task: payload.taskDescription,
      files: payload.targetFiles || [],
      tests: [],
      estimatedMinutes: 20
    }]
  });

  dependencies['refactor-1'] = ['test-coverage-1'];

  // Phase 3: Validation (sequential)
  phases.push({
    phase: 3,
    name: 'validation',
    parallel: false,
    successCriteria: 'All tests pass, no regressions detected',
    agents: [{
      id: 'validate-1',
      type: 'testing-specialist',
      task: 'Run all tests, verify no regressions, update tests if needed for new structure',
      files: [],
      tests: ['**/__tests__/*.test.ts'],
      estimatedMinutes: 10
    }]
  });

  dependencies['validate-1'] = ['refactor-1'];

  return {
    phases,
    dependencies,
    totalAgents: 3,
    detectedPattern: 'refactor',
    estimatedMinutes: 45
  };
}

/**
 * Creates manifest for bugfix pattern
 */
function decomposeBugfixPattern(
  payload: CoordinatorPayload,
  patternInfo: PatternScore
): AgentManifest {
  const phases: Phase[] = [];
  const dependencies: Record<string, string[]> = {};

  // Phase 1: Reproduce and test (sequential)
  phases.push({
    phase: 1,
    name: 'reproduce-and-test',
    parallel: false,
    successCriteria: 'Failing test written that reproduces the bug',
    agents: [{
      id: 'repro-1',
      type: 'testing-specialist',
      task: 'Write a failing test that reproduces the bug described',
      files: [],
      tests: payload.targetTests || [],
      estimatedMinutes: 10
    }]
  });

  // Phase 2: Fix implementation (sequential)
  phases.push({
    phase: 2,
    name: 'fix-implementation',
    parallel: false,
    successCriteria: 'Bug fixed, reproduction test now passes',
    agents: [{
      id: 'fix-1',
      type: 'typescript-specialist',
      task: payload.taskDescription,
      files: payload.targetFiles || [],
      tests: [],
      estimatedMinutes: 15
    }]
  });

  dependencies['fix-1'] = ['repro-1'];

  return {
    phases,
    dependencies,
    totalAgents: 2,
    detectedPattern: 'bugfix',
    estimatedMinutes: 25
  };
}

/**
 * Creates manifest for infrastructure pattern
 */
function decomposeInfrastructurePattern(
  payload: CoordinatorPayload,
  patternInfo: PatternScore
): AgentManifest {
  const phases: Phase[] = [];
  const dependencies: Record<string, string[]> = {};

  phases.push({
    phase: 1,
    name: 'infrastructure-setup',
    parallel: false,
    successCriteria: 'Configuration files created and validated',
    agents: [{
      id: 'infra-1',
      type: 'infrastructure-specialist',
      task: payload.taskDescription,
      files: payload.targetFiles || [],
      tests: [],
      estimatedMinutes: 15
    }]
  });

  return {
    phases,
    dependencies,
    totalAgents: 1,
    detectedPattern: 'infrastructure',
    estimatedMinutes: 15
  };
}

/**
 * Creates manifest for multi-feature pattern
 */
function decomposeMultiFeaturePattern(
  payload: CoordinatorPayload,
  patternInfo: PatternScore
): AgentManifest {
  const phases: Phase[] = [];
  const dependencies: Record<string, string[]> = {};

  // Extract feature-like segments from description
  const description = payload.taskDescription;
  const segments = description.split(/(?:,|\band\b)/i)
    .map(s => s.trim())
    .filter(s => s.length > 10);

  if (segments.length <= 1) {
    // Fall back to single feature if parsing fails
    return decomposeFeaturePattern(payload, patternInfo);
  }

  // Phase 1: Shared setup if needed
  phases.push({
    phase: 1,
    name: 'shared-setup',
    parallel: false,
    successCriteria: 'Shared types and utilities ready',
    agents: [{
      id: 'shared-1',
      type: 'typescript-specialist',
      task: 'Create shared types and utilities needed across features',
      files: ['src/shared/types.ts', 'src/shared/utils.ts'],
      tests: [],
      estimatedMinutes: 10
    }]
  });

  // Phase 2: Parallel feature implementation
  const featureAgents: AgentDefinition[] = segments.slice(0, 3).map((segment, index) => ({
    id: `feature-${index + 1}`,
    type: 'typescript-specialist' as AgentType,
    task: segment,
    files: [],
    tests: [],
    estimatedMinutes: 15
  }));

  phases.push({
    phase: 2,
    name: 'parallel-features',
    parallel: true,
    successCriteria: 'All features implemented independently',
    agents: featureAgents
  });

  featureAgents.forEach(agent => {
    dependencies[agent.id] = ['shared-1'];
  });

  // Phase 3: Integration
  phases.push({
    phase: 3,
    name: 'integration',
    parallel: false,
    successCriteria: 'Features integrated, all tests pass',
    agents: [{
      id: 'integrate-1',
      type: 'typescript-specialist',
      task: 'Integrate all features, ensure they work together, add integration tests',
      files: ['src/index.ts'],
      tests: ['src/__tests__/integration.test.ts'],
      estimatedMinutes: 15
    }]
  });

  dependencies['integrate-1'] = featureAgents.map(a => a.id);

  const totalAgents = phases.reduce((sum, p) => sum + p.agents.length, 0);

  return {
    phases,
    dependencies,
    totalAgents,
    detectedPattern: 'multi-feature',
    estimatedMinutes: 40 + (segments.length * 15)
  };
}

/**
 * Creates manifest for unknown/fallback pattern
 */
function decomposeUnknownPattern(
  payload: CoordinatorPayload,
  patternInfo: PatternScore
): AgentManifest {
  const phases: Phase[] = [];
  const dependencies: Record<string, string[]> = {};

  phases.push({
    phase: 1,
    name: 'execution',
    parallel: false,
    successCriteria: 'Task completed successfully',
    agents: [{
      id: 'agent-1',
      type: 'general',
      task: payload.taskDescription,
      files: payload.targetFiles || [],
      tests: payload.targetTests || [],
      estimatedMinutes: 20
    }]
  });

  return {
    phases,
    dependencies,
    totalAgents: 1,
    detectedPattern: 'unknown',
    estimatedMinutes: 20
  };
}

// =============================================
// Main Analysis Function
// =============================================

/**
 * Analyzes task and produces agent manifest with intelligent decomposition
 */
async function analyzeAndDecompose(payload: CoordinatorPayload): Promise<{
  manifest: AgentManifest;
  analysisNotes: string[];
  complexityAnalysis: TaskComplexity;
}> {
  const analysisNotes: string[] = [];

  // Run task complexity analysis
  const complexityAnalysis = await analyzeTaskComplexity(
    payload.taskDescription,
    payload.workDir
  );

  analysisNotes.push(`Complexity: ${complexityAnalysis.level} (files: ~${complexityAnalysis.estimatedFiles}, agents: ~${complexityAnalysis.estimatedAgents})`);
  analysisNotes.push(`Parallelizable: ${complexityAnalysis.parallelizable}`);
  analysisNotes.push(`Suggested phases: ${complexityAnalysis.suggestedPhases.join(' -> ')}`);
  analysisNotes.push(`Analysis: ${complexityAnalysis.reasoning}`);

  // Detect task pattern
  const patternInfo = detectTaskPattern(payload.taskDescription);
  analysisNotes.push(`Detected pattern: ${patternInfo.pattern} (score: ${patternInfo.score})`);

  if (patternInfo.indicators.length > 0) {
    analysisNotes.push(`Pattern indicators: ${patternInfo.indicators.join(', ')}`);
  }

  // Apply previous results context if available
  if (payload.previousResults) {
    analysisNotes.push(`Previous iteration: ${payload.previousResults.passRate * 100}% pass rate`);
    if (payload.previousResults.failedTests.length > 0) {
      analysisNotes.push(`Failed tests to address: ${payload.previousResults.failedTests.length}`);
    }
  }

  // Select decomposition strategy based on pattern
  let manifest: AgentManifest;

  switch (patternInfo.pattern) {
    case 'library':
      manifest = decomposeLibraryPattern(payload, patternInfo);
      break;
    case 'feature':
      manifest = decomposeFeaturePattern(payload, patternInfo);
      break;
    case 'multi-feature':
      manifest = decomposeMultiFeaturePattern(payload, patternInfo);
      break;
    case 'refactor':
      manifest = decomposeRefactorPattern(payload, patternInfo);
      break;
    case 'bugfix':
      manifest = decomposeBugfixPattern(payload, patternInfo);
      break;
    case 'infrastructure':
      manifest = decomposeInfrastructurePattern(payload, patternInfo);
      break;
    default:
      manifest = decomposeUnknownPattern(payload, patternInfo);
  }

  // Apply mode-specific adjustments
  if (payload.mode === 'enterprise') {
    // Add security review phase for enterprise mode
    const securityPhase: Phase = {
      phase: manifest.phases.length + 1,
      name: 'security-review',
      parallel: false,
      successCriteria: 'Security review passed, no vulnerabilities',
      agents: [{
        id: 'security-1',
        type: 'security-specialist',
        task: 'Review all code changes for security vulnerabilities, validate input handling',
        files: [],
        tests: [],
        estimatedMinutes: 10
      }]
    };

    // Security depends on all previous phases completing
    const lastPhaseAgents = manifest.phases[manifest.phases.length - 1].agents;
    manifest.dependencies['security-1'] = lastPhaseAgents.map(a => a.id);

    manifest.phases.push(securityPhase);
    manifest.totalAgents++;
    manifest.estimatedMinutes += 10;

    analysisNotes.push('Added security review phase (enterprise mode)');
  }

  // Apply complexity-based adjustments to manifest
  applyComplexityAdjustments(manifest, complexityAnalysis);

  analysisNotes.push(`Total phases: ${manifest.phases.length}`);
  analysisNotes.push(`Total agents: ${manifest.totalAgents}`);
  analysisNotes.push(`Estimated duration: ${manifest.estimatedMinutes} minutes`);

  return { manifest, analysisNotes, complexityAnalysis };
}

/**
 * Adjusts manifest based on complexity analysis
 */
function applyComplexityAdjustments(manifest: AgentManifest, complexity: TaskComplexity): void {
  // Adjust agent counts based on complexity estimation
  const targetAgents = complexity.estimatedAgents;
  const currentAgents = manifest.totalAgents;

  // If complexity analysis suggests more agents, consider adding phases
  if (targetAgents > currentAgents && complexity.level !== 'simple') {
    // Add complexity metadata to manifest for downstream use
    // This affects parallel execution decisions
  }

  // Update parallelization based on complexity analysis
  for (const phase of manifest.phases) {
    if (complexity.parallelizable && phase.agents.length > 1) {
      phase.parallel = true;
    }
  }

  // Ensure phases align with suggested phases from complexity analysis
  const suggestedPhases = complexity.suggestedPhases;
  const existingPhaseNames = manifest.phases.map(p => p.name.toLowerCase());

  // Add testing phase if suggested but missing
  if (suggestedPhases.includes('testing') && !existingPhaseNames.some(n => n.includes('test'))) {
    const lastPhase = manifest.phases[manifest.phases.length - 1];
    const testPhase: Phase = {
      phase: lastPhase.phase + 1,
      name: 'testing',
      parallel: false,
      successCriteria: 'All tests pass',
      agents: [{
        id: 'test-auto-1',
        type: 'testing-specialist',
        task: 'Run tests and validate implementation',
        files: [],
        tests: ['**/__tests__/*.test.ts'],
        estimatedMinutes: 10
      }]
    };

    // Add dependency on last phase
    const lastPhaseAgentIds = lastPhase.agents.map(a => a.id);
    manifest.dependencies['test-auto-1'] = lastPhaseAgentIds;

    manifest.phases.push(testPhase);
    manifest.totalAgents++;
    manifest.estimatedMinutes += 10;
  }

  // Add integration phase if suggested but missing (for complex/large tasks)
  if (
    (complexity.level === 'complex' || complexity.level === 'large') &&
    suggestedPhases.includes('integration') &&
    !existingPhaseNames.some(n => n.includes('integrat'))
  ) {
    const lastPhase = manifest.phases[manifest.phases.length - 1];
    const integrationPhase: Phase = {
      phase: lastPhase.phase + 1,
      name: 'integration',
      parallel: false,
      successCriteria: 'All components integrated and working together',
      agents: [{
        id: 'integration-auto-1',
        type: 'typescript-specialist',
        task: 'Integrate all components, ensure they work together',
        files: [],
        tests: ['**/__tests__/integration.test.ts'],
        estimatedMinutes: 15
      }]
    };

    const lastPhaseAgentIds = lastPhase.agents.map(a => a.id);
    manifest.dependencies['integration-auto-1'] = lastPhaseAgentIds;

    manifest.phases.push(integrationPhase);
    manifest.totalAgents++;
    manifest.estimatedMinutes += 15;
  }
}

// =============================================
// Trigger.dev Task Definition
// =============================================

/**
 * CFN Coordinator Task
 *
 * Strategic task analysis and decomposition for CFN Loop execution.
 * Produces agent manifests with phases, dependencies, and agent definitions.
 */
export const cfnCoordinatorTask = task({
  id: "cfn-coordinator",
  retry: { maxAttempts: 1 },

  run: async (payload: CoordinatorPayload): Promise<CoordinatorResult> => {
    const startTime = Date.now();

    // Log task start
    await db.logger.info('coordinator', 'Starting task analysis', {
      taskId: payload.taskId,
      data: {
        description: payload.taskDescription.substring(0, 200),
        mode: payload.mode,
        iterationId: payload.iterationId
      }
    });

    try {
      // Perform analysis and decomposition
      const { manifest, analysisNotes, complexityAnalysis } = await analyzeAndDecompose(payload);

      // Update iteration record with manifest and complexity analysis
      await db.updateIteration(payload.iterationId, {
        coordinatorManifest: manifest,
        complexityAnalysis: complexityAnalysis
      });

      // Log completion
      const durationMs = Date.now() - startTime;
      await db.logger.info('coordinator', 'Task decomposition complete', {
        taskId: payload.taskId,
        data: {
          detectedPattern: manifest.detectedPattern,
          totalPhases: manifest.phases.length,
          totalAgents: manifest.totalAgents,
          estimatedMinutes: manifest.estimatedMinutes,
          complexityLevel: complexityAnalysis.level,
          estimatedFiles: complexityAnalysis.estimatedFiles,
          parallelizable: complexityAnalysis.parallelizable,
          durationMs,
          analysisNotes
        }
      });

      return { manifest, analysisNotes, complexityAnalysis };

    } catch (error) {
      // Log error
      await db.logger.error(
        'coordinator',
        'Task analysis failed',
        error instanceof Error ? error : new Error(String(error)),
        { taskId: payload.taskId }
      );

      throw error;
    }
  }
});
