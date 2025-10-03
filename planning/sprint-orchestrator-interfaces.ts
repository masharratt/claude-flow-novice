/**
 * Sprint Orchestrator - TypeScript Interface Definitions
 *
 * Complete type definitions for the SprintOrchestrator architecture
 */

import { EventEmitter } from 'events';
import type { PhaseResult, AgentConfig as CFNAgentConfig } from '../src/cfn-loop/cfn-loop-orchestrator.js';
import type { CFNLoopIntegrator } from '../src/cfn-loop/cfn-loop-integrator.js';
import type { SwarmMemoryManager } from '../src/memory/swarm-memory.js';

// ===== SPRINT CONFIGURATION =====

export interface Sprint {
  /** Unique sprint identifier */
  id: string;
  /** Execution order hint (for validation) */
  order: number;
  /** Human-readable sprint name */
  name: string;
  /** Sprint description and objectives */
  description: string;
  /** List of sprint IDs this sprint depends on */
  dependsOn: string[];
  /** Source markdown file path (for status updates) */
  sourceFile?: string;
  /** Checkpoint validation criteria */
  checkpointCriteria: CheckpointCriteria;
  /** Agent assignment strategy */
  agentAssignment: 'auto' | AgentConfig[];
}

export interface CheckpointCriteria {
  /** All tests must pass */
  testsPass: boolean;
  /** Minimum test coverage percentage (0-100) */
  minCoverage: number;
  /** No critical security/quality issues allowed */
  noCriticalIssues: boolean;
  /** Minimum confidence score (0-1) */
  minConfidence: number;
  /** All dependency sprints must be completed */
  dependenciesSatisfied: boolean;
  /** Optional custom validation function */
  customValidation?: (result: PhaseResult) => Promise<boolean>;
}

export const DEFAULT_CHECKPOINT_CRITERIA: CheckpointCriteria = {
  testsPass: true,
  minCoverage: 80,
  noCriticalIssues: true,
  minConfidence: 0.75,
  dependenciesSatisfied: true,
};

// ===== AGENT CONFIGURATION =====

export interface AgentConfig {
  /** Unique agent identifier */
  agentId: string;
  /** Agent type (e.g., 'backend-dev', 'tester', 'security-specialist') */
  agentType: string;
  /** Agent role in swarm */
  role: 'primary' | 'validator';
  /** Task-specific instructions for this agent */
  instructions: string;
}

export interface AgentAssignmentRule {
  /** Regex patterns to match in sprint description */
  taskPatterns: RegExp[];
  /** Agent types to assign when pattern matches */
  agentTypes: string[];
  /** Rule priority (higher = higher precedence) */
  priority: number;
  /** Minimum number of agents required */
  minAgents: number;
  /** Maximum number of agents to assign */
  maxAgents: number;
}

// ===== DEPENDENCY GRAPH =====

export interface DependencyNode {
  /** Sprint definition */
  sprint: Sprint;
  /** Sprint IDs this sprint depends on */
  dependencies: Set<string>;
  /** Sprint IDs that depend on this sprint */
  dependents: Set<string>;
  /** Visited flag for cycle detection */
  visited: boolean;
  /** In-progress flag for cycle detection */
  inProgress: boolean;
}

export interface DependencyLevel {
  /** Level number (0 = no dependencies, 1 = depends on level 0, etc.) */
  level: number;
  /** Sprints at this dependency level (can execute in parallel) */
  sprints: Sprint[];
}

// ===== SPRINT CONTEXT =====

export interface SprintContext {
  /** Current sprint ID */
  sprintId: string;
  /** Parent phase ID */
  phaseId: string;
  /** Epic ID (if part of epic) */
  epicId?: string;
  /** Sprint dependencies */
  dependencies: string[];
  /** Results from dependency sprints */
  dependencyResults: Map<string, PhaseResult>;
  /** Number of previous execution attempts */
  previousAttempts: number;
  /** Additional metadata */
  metadata: Record<string, any>;
}

export interface PhaseContext {
  /** Phase ID */
  phaseId: string;
  /** Epic ID (if part of epic) */
  epicId?: string;
  /** Phase dependencies */
  dependencies: string[];
  /** Results from dependency phases */
  dependencyResults: Map<string, PhaseResult>;
  /** Additional metadata */
  metadata: Record<string, any>;
}

// ===== SPRINT EXECUTION RESULT =====

export interface SprintExecutionResult {
  /** Sprint ID */
  sprintId: string;
  /** Execution result (from CFNLoopIntegrator) */
  result: PhaseResult;
  /** Attempt number (1-10) */
  attempt: number;
  /** Checkpoint validation passed */
  checkpointPassed?: boolean;
}

// ===== SPRINT ORCHESTRATOR RESULT =====

export interface SprintOrchestratorResult {
  /** Overall success (all sprints completed) */
  success: boolean;
  /** Total number of sprints */
  totalSprints: number;
  /** Successfully completed sprint IDs */
  completedSprints: string[];
  /** Failed sprint IDs */
  failedSprints: string[];
  /** Results for each sprint */
  sprintResults: Map<string, PhaseResult>;
  /** Total execution duration (ms) */
  totalDuration: number;
  /** Result timestamp */
  timestamp: number;
}

// ===== SPRINT ORCHESTRATOR CONFIGURATION =====

export interface SprintOrchestratorConfig {
  /** Parent phase ID */
  phaseId: string;
  /** Path to sprints markdown file */
  sprintsFile: string;
  /** Phase context from PhaseOrchestrator */
  phaseContext: PhaseContext;
  /** Maximum retry attempts per sprint (default: 10) */
  maxRetries?: number;
  /** Enable memory persistence (default: true) */
  enableMemoryPersistence?: boolean;
  /** Memory configuration */
  memoryConfig?: any;
  /** Enable parallel sprint execution (default: true) */
  enableParallelExecution?: boolean;
}

// ===== MARKDOWN PARSING =====

export interface MarkdownSprintDefinition {
  /** Sprint name extracted from markdown */
  name: string;
  /** Sprint description */
  description: string;
  /** Dependency sprint names */
  dependsOn: string[];
  /** Current status emoji */
  status: '❌' | '🔄' | '✅' | null;
  /** Line number in source file (for updates) */
  lineNumber: number;
}

export interface MarkdownUpdateOptions {
  /** Sprint ID to update */
  sprintId: string;
  /** New status */
  status: '❌' | '🔄' | '✅';
  /** Source file path */
  filePath: string;
}

// ===== FEEDBACK INJECTION =====

export interface CheckpointFeedback {
  /** Sprint ID */
  sprintId: string;
  /** Failed criteria */
  failedCriteria: string[];
  /** Actionable steps to address failures */
  actionableSteps: CheckpointActionableStep[];
  /** Timestamp */
  timestamp: number;
}

export interface CheckpointActionableStep {
  /** Priority level */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Issue category */
  category: string;
  /** Action description */
  action: string;
  /** Target agent type (if applicable) */
  targetAgent?: string;
  /** Estimated effort */
  estimatedEffort: 'low' | 'medium' | 'high';
}

// ===== MEMORY NAMESPACING =====

export interface MemoryNamespace {
  /** Epic ID */
  epicId: string;
  /** Phase ID */
  phaseId: string;
  /** Sprint ID */
  sprintId: string;
  /** Full namespace path */
  path: string;
}

export interface SprintMemoryEntry {
  /** Namespace */
  namespace: string;
  /** Entry key */
  key: string;
  /** Entry value */
  value: any;
  /** Tags for search */
  tags: string[];
  /** Metadata */
  metadata: Record<string, any>;
}

// ===== SPRINT ORCHESTRATOR CLASS =====

export interface ISprintOrchestrator extends EventEmitter {
  // Initialization
  initialize(): Promise<void>;
  loadSprintsFromMarkdown(filePath: string): Promise<Sprint[]>;

  // Execution
  executeAllSprints(phaseContext: PhaseContext): Promise<SprintOrchestratorResult>;
  executeSprintWithRetry(sprint: Sprint, phaseContext: PhaseContext): Promise<SprintExecutionResult>;

  // Dependency Management
  buildDependencyGraph(sprints: Sprint[]): void;
  detectCycles(): void;
  computeTopologicalOrder(): Sprint[];
  computeDependencyLevels(): DependencyLevel[];
  areDependenciesSatisfied(sprint: Sprint): boolean;

  // Auto-Agent Assignment
  assignAgentsToSprint(sprint: Sprint): AgentConfig[];
  generateAgentInstructions(sprint: Sprint, agentType: string): string;

  // Checkpoint Validation
  validateSprintCheckpoint(sprint: Sprint, result: PhaseResult): Promise<boolean>;

  // Feedback Injection
  injectCheckpointFeedback(sprint: Sprint, result: PhaseResult, agents: AgentConfig[]): Promise<void>;

  // Progress Tracking
  updateMarkdownStatus(sprintId: string, status: '❌' | '🔄' | '✅'): Promise<void>;

  // Memory Management
  buildMemoryNamespace(sprintId: string): string;
  storeSprintResult(sprintId: string, result: PhaseResult): Promise<void>;
  loadDependencyResults(sprint: Sprint): Promise<Map<string, PhaseResult>>;

  // Helper Methods
  buildSprintContext(sprint: Sprint, phaseContext: PhaseContext): Promise<SprintContext>;
  buildSprintInstructions(sprint: Sprint, context: SprintContext): string;
  shouldAbortOnSprintFailure(sprint: Sprint): boolean;
  createFailedSprintResult(sprint: Sprint, error?: Error): PhaseResult;

  // Statistics
  getStatistics(): SprintOrchestratorStatistics;

  // Cleanup
  shutdown(): Promise<void>;
}

export interface SprintOrchestratorStatistics {
  /** Total sprints processed */
  totalSprints: number;
  /** Successfully completed sprints */
  completedSprints: number;
  /** Failed sprints */
  failedSprints: number;
  /** In-progress sprints */
  inProgressSprints: number;
  /** Total execution time (ms) */
  totalDuration: number;
  /** Average sprint execution time (ms) */
  averageSprintDuration: number;
  /** Total retry attempts across all sprints */
  totalRetries: number;
  /** Checkpoint validation pass rate (0-1) */
  checkpointPassRate: number;
  /** Parallel execution efficiency (actual vs theoretical speedup) */
  parallelEfficiency: number;
}

// ===== EVENTS =====

export interface SprintOrchestratorEvents {
  'sprint:started': (data: { sprintId: string; attempt: number }) => void;
  'sprint:complete': (data: { sprintId: string; result: PhaseResult }) => void;
  'sprint:failed': (data: { sprintId: string; error: Error; attempt: number }) => void;
  'sprint:retry': (data: { sprintId: string; attempt: number; feedback: CheckpointFeedback }) => void;
  'checkpoint:passed': (data: { sprintId: string; result: PhaseResult }) => void;
  'checkpoint:failed': (data: { sprintId: string; failedCriteria: string[] }) => void;
  'markdown:updated': (data: { sprintId: string; status: string; file: string }) => void;
  'dependency:resolved': (data: { sprintId: string; dependency: string }) => void;
  'agents:assigned': (data: { sprintId: string; agents: AgentConfig[] }) => void;
  'orchestration:complete': (data: SprintOrchestratorResult) => void;
  'orchestration:failed': (data: { error: Error }) => void;
}

// ===== INTEGRATION TYPES =====

export interface PhaseWithSprints {
  /** Phase ID */
  id: string;
  /** Phase name */
  name: string;
  /** Phase description */
  description: string;
  /** Phase dependencies */
  dependsOn: string[];
  /** Path to sprints markdown file (if sprints enabled) */
  sprintsFile?: string;
  /** Completion criteria */
  completionCriteria: {
    minConsensusScore: number;
    requiredDeliverables: string[];
    customValidation?: (result: PhaseResult) => Promise<boolean>;
  };
}

// ===== UTILITY TYPES =====

export type SprintStatus = '❌' | '🔄' | '✅';

export type AgentRole = 'primary' | 'validator';

export type CheckpointPriority = 'critical' | 'high' | 'medium' | 'low';

export type EffortEstimate = 'low' | 'medium' | 'high';

// ===== CONSTANTS =====

export const AGENT_ASSIGNMENT_RULES: AgentAssignmentRule[] = [
  {
    taskPatterns: [/implement.*auth/i, /jwt/i, /oauth/i, /security/i],
    agentTypes: ['backend-dev', 'security-specialist', 'tester'],
    priority: 10,
    minAgents: 3,
    maxAgents: 5,
  },
  {
    taskPatterns: [/ui/i, /frontend/i, /component/i, /react/i, /vue/i],
    agentTypes: ['frontend-dev', 'ui-designer', 'tester'],
    priority: 9,
    minAgents: 3,
    maxAgents: 5,
  },
  {
    taskPatterns: [/api/i, /endpoint/i, /rest/i, /graphql/i],
    agentTypes: ['backend-dev', 'api-docs', 'tester'],
    priority: 8,
    minAgents: 3,
    maxAgents: 4,
  },
  {
    taskPatterns: [/database/i, /schema/i, /migration/i],
    agentTypes: ['backend-dev', 'system-architect', 'tester'],
    priority: 8,
    minAgents: 3,
    maxAgents: 4,
  },
  {
    taskPatterns: [/refactor/i, /optimize/i, /performance/i],
    agentTypes: ['coder', 'perf-analyzer', 'reviewer', 'tester'],
    priority: 7,
    minAgents: 4,
    maxAgents: 6,
  },
  {
    taskPatterns: [/test/i, /coverage/i, /validation/i],
    agentTypes: ['tester', 'reviewer'],
    priority: 6,
    minAgents: 2,
    maxAgents: 3,
  },
  {
    taskPatterns: [/deploy/i, /ci\/cd/i, /pipeline/i, /devops/i],
    agentTypes: ['devops-engineer', 'cicd-engineer', 'tester'],
    priority: 9,
    minAgents: 3,
    maxAgents: 4,
  },
  {
    taskPatterns: [/document/i, /readme/i, /guide/i],
    agentTypes: ['api-docs', 'researcher'],
    priority: 5,
    minAgents: 2,
    maxAgents: 3,
  },
  // Default fallback rule
  {
    taskPatterns: [/.*/],
    agentTypes: ['coder', 'tester', 'reviewer'],
    priority: 1,
    minAgents: 3,
    maxAgents: 5,
  },
];

export const SPRINT_STATUS_EMOJI: Record<SprintStatus, string> = {
  '❌': 'Failed',
  '🔄': 'In Progress',
  '✅': 'Completed',
};

export const DEFAULT_SPRINT_ORCHESTRATOR_CONFIG: Partial<SprintOrchestratorConfig> = {
  maxRetries: 10,
  enableMemoryPersistence: true,
  enableParallelExecution: true,
};
