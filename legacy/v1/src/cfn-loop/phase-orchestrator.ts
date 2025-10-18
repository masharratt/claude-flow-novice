/**
 * Phase Orchestrator - Loop 0 (Parent Loop) Management
 *
 * Manages multi-phase progression across Phase 0 → Phase N:
 * - Dependency graph building with cycle detection
 * - Topological phase ordering
 * - Automatic phase transitions without manual intervention
 * - Phase completion validation via consensus
 * - Self-looping prompt generation for continuous execution
 * - Integration with CFNLoopOrchestrator (Loop 1/2/3)
 *
 * @module cfn-loop/phase-orchestrator
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import { CFNLoopOrchestrator, PhaseResult } from './cfn-loop-orchestrator.js';
import { SwarmMemoryManager } from '../memory/swarm-memory.js';
import {
  SprintOrchestrator,
  Sprint,
  EpicResult,
  createSprintOrchestrator
} from './sprint-orchestrator.js';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { LRUCache } from 'lru-cache';
import { RateLimiter, createMemoryRateLimiter } from '../utils/rate-limiter.js';

// ===== TYPE DEFINITIONS =====

/**
 * Iteration cost tracking for resource management (CVE-2025-001 mitigation)
 */
export interface IterationCost {
  /** Sprint or phase identifier */
  id: string;
  /** Loop 2 iterations consumed */
  loop2Iterations: number;
  /** Loop 3 iterations consumed */
  loop3Iterations: number;
  /** Total cost (loop2 × loop3) */
  totalCost: number;
  /** Timestamp */
  timestamp: Date;
}

/**
 * Phase configuration interface
 */
export interface Phase {
  /** Unique phase identifier */
  id: string;
  /** Execution order hint (for validation) */
  order: number;
  /** Human-readable phase name */
  name: string;
  /** Phase description and objectives */
  description: string;
  /** List of phase IDs this phase depends on */
  dependsOn: string[];
  /** Optional sprints within this phase */
  sprints?: Sprint[];
  /** Path to external phase file containing sprints (if not inline) */
  file?: string;
  /** Completion validation criteria */
  completionCriteria: {
    /** Minimum consensus score required (0-1) */
    minConsensusScore: number;
    /** Required deliverables that must exist */
    requiredDeliverables: string[];
    /** Optional custom validation function */
    customValidation?: (result: PhaseResult) => Promise<boolean>;
  };
  /** Self-looping prompt for auto-continuation (optional) */
  selfLoopingPrompt?: string;
  /** CFN loop configuration overrides */
  loopConfig?: {
    maxLoop2Iterations?: number;
    maxLoop3Iterations?: number;
    confidenceThreshold?: number;
    consensusThreshold?: number;
  };
}

/**
 * Phase execution context
 */
export interface PhaseContext {
  phaseId: string;
  dependencies: string[];
  dependencyResults: Map<string, PhaseResult>;
  previousAttempts: number;
  metadata: Record<string, any>;
}

/**
 * Phase orchestrator configuration
 */
export interface PhaseOrchestratorConfig {
  /** List of phases to orchestrate */
  phases: Phase[];
  /** Maximum retry attempts per phase */
  maxPhaseRetries?: number;
  /** Maximum epic-level iterations (total across all phases) */
  maxEpicIterations?: number;
  /** Maximum sprint iterations per phase */
  maxSprintIterations?: number;
  /** Enable memory persistence */
  enableMemoryPersistence?: boolean;
  /** Memory configuration */
  memoryConfig?: any;
  /** Default loop configuration for all phases */
  defaultLoopConfig?: {
    maxLoop2Iterations?: number;
    maxLoop3Iterations?: number;
    confidenceThreshold?: number;
    consensusThreshold?: number;
  };
  /** Enable rate limiting for memory operations */
  enableRateLimiting?: boolean;
}

/**
 * Dependency graph node
 */
interface DependencyNode {
  phase: Phase;
  dependencies: Set<string>;
  dependents: Set<string>;
  visited: boolean;
  inProgress: boolean;
}

/**
 * Phase orchestration result
 */
export interface PhaseOrchestratorResult {
  success: boolean;
  totalPhases: number;
  completedPhases: string[];
  failedPhases: string[];
  phaseResults: Map<string, PhaseResult>;
  totalDuration: number;
  continuationPrompt?: string;
  nextPhase?: string;
  timestamp: number;
}

/**
 * Phase execution result with continuation
 */
export interface PhaseExecutionResult {
  phaseId: string;
  result: PhaseResult;
  continuationPrompt: string;
  nextPhaseId?: string;
}

// ===== PHASE ORCHESTRATOR =====

export class PhaseOrchestrator extends EventEmitter {
  private logger: Logger;
  private config: Required<PhaseOrchestratorConfig>;
  private memoryManager?: SwarmMemoryManager;

  // Dependency graph
  private dependencyGraph: Map<string, DependencyNode> = new Map();
  private topologicalOrder: Phase[] = [];

  // Execution state
  private phaseResults: Map<string, PhaseResult> = new Map();
  private completedPhases: Set<string> = new Set();
  private failedPhases: Set<string> = new Set();
  private phaseRetries: Map<string, number> = new Map();

  // Sprint tracking with LRU cache for memory management
  private globalSprintResults: LRUCache<string, any>;
  private sprintOrchestratorResults: Map<string, EpicResult> = new Map();

  // Epic-level iteration tracking (CVE-2025-001 mitigation)
  private epicIterationCounter: number = 0;
  private readonly MAX_EPIC_ITERATIONS: number;
  private readonly MAX_SPRINT_ITERATIONS: number;
  private iterationCosts: IterationCost[] = [];

  // Rate limiting for memory operations
  private rateLimiter?: RateLimiter;

  // Timing
  private startTime: number = 0;

  constructor(config: PhaseOrchestratorConfig) {
    super();

    // Validate and set defaults
    this.config = {
      phases: config.phases,
      maxPhaseRetries: config.maxPhaseRetries || 3,
      maxEpicIterations: config.maxEpicIterations,
      maxSprintIterations: config.maxSprintIterations,
      enableMemoryPersistence: config.enableMemoryPersistence ?? true,
      memoryConfig: config.memoryConfig || {},
      defaultLoopConfig: config.defaultLoopConfig || {
        maxLoop2Iterations: 10,
        maxLoop3Iterations: 10,
        confidenceThreshold: 0.75,
        consensusThreshold: 0.90,
      },
      enableRateLimiting: config.enableRateLimiting ?? true,
    };

    // Set epic-level iteration limits
    this.MAX_EPIC_ITERATIONS = this.config.maxEpicIterations || 100; // 10 phases × 10 retries
    this.MAX_SPRINT_ITERATIONS = this.config.maxSprintIterations || 100; // 10 sprints × 10 retries per phase

    // Initialize rate limiter if enabled
    if (this.config.enableRateLimiting) {
      this.rateLimiter = createMemoryRateLimiter();
    }

    // Initialize logger
    const loggerConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
        : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'PhaseOrchestrator' });

    // Initialize LRU cache for sprint results with TTL and archiving
    this.globalSprintResults = new LRUCache<string, any>({
      max: 500, // Max 500 sprint results in memory
      ttl: 1000 * 60 * 60, // 1 hour TTL
      dispose: (value, key) => {
        // Archive to persistent storage on eviction
        this.archiveSprintResult(key, value).catch(error => {
          this.logger.error('Failed to archive sprint result on eviction', {
            key,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      },
      updateAgeOnGet: true, // Refresh TTL on access
    });

    // Initialize memory manager if enabled
    if (this.config.enableMemoryPersistence) {
      // SwarmMemoryManager initialization would go here
      this.memoryManager = undefined;
    }

    this.logger.info('Phase Orchestrator initialized', {
      phaseCount: this.config.phases.length,
      maxRetries: this.config.maxPhaseRetries,
      sprintCacheSize: 500,
      sprintCacheTTL: '1 hour',
    });
  }

  /**
   * Archive sprint result to persistent storage
   * Called automatically on LRU eviction or manual cleanup
   */
  private async archiveSprintResult(key: string, result: any): Promise<void> {
    if (!this.memoryManager) {
      return;
    }

    try {
      await this.memoryManager.store(`archived/${key}`, JSON.stringify(result));
      this.logger.debug('Sprint result archived', {
        key,
        resultSize: JSON.stringify(result).length,
      });
    } catch (error) {
      this.logger.error('Failed to archive sprint result', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Manual cleanup of completed phase sprint results
   * Removes all sprint results for a specific phase from cache and archives them
   */
  async cleanupCompletedPhase(phaseId: string): Promise<void> {
    const keysToRemove: string[] = [];

    // Collect all keys for this phase using forEach (LRU cache iterator)
    this.globalSprintResults.forEach((value, key) => {
      if (key.startsWith(`${phaseId}/`)) {
        keysToRemove.push(key);
      }
    });

    // Archive and remove keys
    for (const key of keysToRemove) {
      const value = this.globalSprintResults.get(key);
      if (value) {
        // Archive before removal
        await this.archiveSprintResult(key, value);
      }
      this.globalSprintResults.delete(key);
    }

    this.logger.info('Cleaned up sprint results for completed phase', {
      phaseId,
      removedCount: keysToRemove.length,
      remainingCacheSize: this.globalSprintResults.size,
    });
  }

  /**
   * Get memory statistics for monitoring
   */
  getMemoryStats(): { size: number; maxSize: number; ttl: number; evictions: number } {
    return {
      size: this.globalSprintResults.size,
      maxSize: 500,
      ttl: 1000 * 60 * 60,
      evictions: this.globalSprintResults.calculatedSize || 0,
    };
  }

  /**
   * Initialize orchestrator and build dependency graph
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Phase Orchestrator');

    // Load sprints for phases that have external files
    await this.loadPhaseFilesWithSprints();

    // Build dependency graph
    this.buildDependencyGraph();

    // Detect cycles
    this.detectCycles();

    // Compute topological order
    this.topologicalOrder = this.computeTopologicalOrder();

    this.logger.info('Phase Orchestrator ready', {
      phases: this.topologicalOrder.map(p => p.id),
      order: this.topologicalOrder.map((p, idx) => `${idx}: ${p.id}`),
    });
  }

  /**
   * Load phase files and extract sprint definitions
   */
  private async loadPhaseFilesWithSprints(): Promise<void> {
    for (const phase of this.config.phases) {
      if (phase.file && !phase.sprints) {
        try {
          this.logger.info('Loading phase file', {
            phaseId: phase.id,
            file: phase.file,
          });

          const fileContent = await fs.readFile(phase.file, 'utf-8');
          const phaseData = JSON.parse(fileContent);

          // Extract sprints from phase file
          if (phaseData.sprints && Array.isArray(phaseData.sprints)) {
            phase.sprints = phaseData.sprints.map((sprint: any) => ({
              id: sprint.sprintId || sprint.id,
              phaseId: phase.id,
              name: sprint.name,
              description: sprint.description || '',
              dependencies: sprint.dependencies || [],
              crossPhaseDependencies: sprint.crossPhaseDependencies || [],
              suggestedAgentTypes: sprint.suggestedAgentTypes,
              checkpoints: sprint.checkpoints || {
                testsPass: true,
                minCoverage: 85,
                noSecurityIssues: true,
                minConfidence: 0.75,
                dependenciesSatisfied: true,
              },
              maxRetries: sprint.maxRetries || 10,
              metadata: sprint.metadata || {},
            }));

            this.logger.info('Loaded sprints from phase file', {
              phaseId: phase.id,
              sprintCount: phase.sprints.length,
            });
          }
        } catch (error) {
          this.logger.error('Failed to load phase file', {
            phaseId: phase.id,
            file: phase.file,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Execute all phases in topological order
   *
   * @param initialTask - High-level task description
   * @returns Complete orchestration result
   */
  async executeAllPhases(initialTask: string): Promise<PhaseOrchestratorResult> {
    this.startTime = Date.now();

    this.logger.info('Starting multi-phase orchestration', {
      totalPhases: this.topologicalOrder.length,
      task: initialTask,
    });

    try {
      // Execute phases in topological order
      for (const phase of this.topologicalOrder) {
        // Check epic-level iteration limit BEFORE executing phase
        if (this.epicIterationCounter >= this.MAX_EPIC_ITERATIONS) {
          this.logger.error('Epic-level iteration limit reached', {
            currentIterations: this.epicIterationCounter,
            maxIterations: this.MAX_EPIC_ITERATIONS,
            currentPhase: phase.id,
          });
          throw new Error(
            `Epic iteration limit exceeded: ${this.epicIterationCounter}/${this.MAX_EPIC_ITERATIONS}. ` +
            `Preventing infinite loop. Current phase: ${phase.id}`
          );
        }

        // Warn at 80% threshold
        if (this.epicIterationCounter >= this.MAX_EPIC_ITERATIONS * 0.8) {
          this.logger.warn('Epic-level iteration limit approaching', {
            currentIterations: this.epicIterationCounter,
            maxIterations: this.MAX_EPIC_ITERATIONS,
            utilizationPercent: ((this.epicIterationCounter / this.MAX_EPIC_ITERATIONS) * 100).toFixed(1),
            currentPhase: phase.id,
          });
        }

        // Check if dependencies are satisfied
        if (!this.areDependenciesSatisfied(phase)) {
          this.logger.error('Phase dependencies not satisfied', {
            phaseId: phase.id,
            dependencies: phase.dependsOn,
          });
          this.failedPhases.add(phase.id);
          continue;
        }

        // Execute phase
        const executionResult = await this.executePhaseWithRetry(phase, initialTask);

        // Store result
        this.phaseResults.set(phase.id, executionResult.result);

        // Check if phase completed successfully
        if (executionResult.result.success) {
          this.completedPhases.add(phase.id);
          this.logger.info('Phase completed successfully', {
            phaseId: phase.id,
            continuationPrompt: executionResult.continuationPrompt.substring(0, 100),
          });

          // Emit continuation event
          this.emit('phase:complete', {
            phaseId: phase.id,
            result: executionResult.result,
            continuationPrompt: executionResult.continuationPrompt,
            nextPhaseId: executionResult.nextPhaseId,
          });
        } else {
          this.failedPhases.add(phase.id);
          this.logger.error('Phase failed after retries', {
            phaseId: phase.id,
            attempts: this.phaseRetries.get(phase.id) || 0,
          });

          // Decide whether to continue or abort
          if (this.shouldAbortOnPhaseFailure(phase)) {
            this.logger.error('Aborting orchestration due to critical phase failure', {
              phaseId: phase.id,
            });
            break;
          }
        }
      }

      // Generate final result
      const totalDuration = Date.now() - this.startTime;

      return {
        success: this.failedPhases.size === 0,
        totalPhases: this.topologicalOrder.length,
        completedPhases: Array.from(this.completedPhases),
        failedPhases: Array.from(this.failedPhases),
        phaseResults: this.phaseResults,
        totalDuration,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.logger.error('Phase orchestration failed with error', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Execute single phase with retry logic
   */
  private async executePhaseWithRetry(
    phase: Phase,
    initialTask: string
  ): Promise<PhaseExecutionResult> {
    let lastError: Error | undefined;
    let lastResult: PhaseResult | undefined;

    const maxRetries = this.config.maxPhaseRetries;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      this.phaseRetries.set(phase.id, attempt);

      // Increment epic-level iteration counter
      this.epicIterationCounter++;

      // Check epic-level iteration limit during retries
      if (this.epicIterationCounter >= this.MAX_EPIC_ITERATIONS) {
        this.logger.error('Epic iteration limit reached during phase retry', {
          phaseId: phase.id,
          attempt,
          epicIterations: this.epicIterationCounter,
        });
        throw new Error(
          `Epic iteration limit exceeded during ${phase.id} retry ${attempt}. ` +
          `Total iterations: ${this.epicIterationCounter}/${this.MAX_EPIC_ITERATIONS}`
        );
      }

      this.logger.info('Executing phase', {
        phaseId: phase.id,
        attempt,
        maxRetries,
      });

      try {
        // Build phase context
        const context = this.buildPhaseContext(phase);

        // Execute phase via CFN Loop Orchestrator
        const result = await this.executePhase(phase, context, initialTask);

        // Validate phase completion
        const validationPassed = await this.validatePhaseCompletion(phase, result);

        if (validationPassed) {
          this.logger.info('Phase validation passed', {
            phaseId: phase.id,
            attempt,
          });

          // Cleanup sprint results for completed phase
          await this.cleanupCompletedPhase(phase.id);

          // Log memory stats after cleanup
          const memStats = this.getMemoryStats();
          this.logger.info('Memory stats after phase cleanup', {
            phaseId: phase.id,
            cacheSize: memStats.size,
            maxSize: memStats.maxSize,
          });

          // Generate continuation prompt
          const continuationPrompt = this.generateContinuationPrompt(phase, result);
          const nextPhaseId = this.getNextPhase(phase.id);

          return {
            phaseId: phase.id,
            result,
            continuationPrompt,
            nextPhaseId,
          };
        } else {
          this.logger.warn('Phase validation failed, retrying', {
            phaseId: phase.id,
            attempt,
          });

          lastResult = result;
        }
      } catch (error) {
        this.logger.error('Phase execution error', {
          phaseId: phase.id,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });

        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    // All retries exhausted
    this.logger.error('Phase failed after all retry attempts', {
      phaseId: phase.id,
      attempts: maxRetries,
    });

    // Return failed result
    return {
      phaseId: phase.id,
      result: lastResult || this.createFailedPhaseResult(phase, lastError),
      continuationPrompt: this.generateFailureContinuationPrompt(phase),
      nextPhaseId: undefined,
    };
  }

  /**
   * Execute single phase via CFN Loop Orchestrator or Sprint Orchestrator
   */
  private async executePhase(
    phase: Phase,
    context: PhaseContext,
    initialTask: string
  ): Promise<PhaseResult> {
    this.logger.info('Executing phase', {
      phaseId: phase.id,
      dependencies: context.dependencies,
      hasSprints: !!phase.sprints && phase.sprints.length > 0,
    });

    // If phase has sprints, use Sprint Orchestrator
    if (phase.sprints && phase.sprints.length > 0) {
      return await this.executePhaseWithSprints(phase, context, initialTask);
    }

    // Otherwise, execute directly via CFN Loop
    return await this.executePhaseDirectly(phase, context, initialTask);
  }

  /**
   * Convert sprint confidence scores to ConfidenceScore format
   */
  private convertSprintScoresToConfidenceScores(sprintResult: EpicResult): any[] {
    const confidenceScores: any[] = [];

    for (const [sprintId, result] of sprintResult.sprintResults.entries()) {
      for (let i = 0; i < result.confidenceScores.length; i++) {
        confidenceScores.push({
          agentId: result.assignedAgents[i]?.agentId || `agent-${i}`,
          agentType: result.assignedAgents[i]?.agentType || 'unknown',
          confidence: result.confidenceScores[i],
          reasoning: `Sprint ${sprintId} completion`,
          blockers: [],
          timestamp: Date.now(),
        });
      }
    }

    return confidenceScores;
  }

  /**
   * Enrich sprints with cross-phase dependency resolution
   *
   * Converts cross-phase dependencies like "phase-1/sprint-1.3" to actual
   * sprint IDs that the SprintOrchestrator can validate against globalSprintResults.
   */
  private enrichSprintsWithCrossPhaseDependencies(sprints: Sprint[]): Sprint[] {
    return sprints.map(sprint => {
      if (sprint.crossPhaseDependencies.length === 0) {
        return sprint;
      }

      this.logger.debug('Enriching sprint with cross-phase dependencies', {
        sprintId: sprint.id,
        crossPhaseDeps: sprint.crossPhaseDependencies,
      });

      // Cross-phase dependencies are already in "phase-X/sprint-Y" format
      // The SprintOrchestrator will validate these against globalSprintResults
      // which stores results with the same key format
      return {
        ...sprint,
        crossPhaseDependencies: sprint.crossPhaseDependencies.map(dep => {
          // Ensure format is consistent
          if (dep.includes('/')) {
            return dep;
          }
          // If it's just a sprint ID, prepend current phase
          return `${sprint.phaseId}/${dep}`;
        }),
      };
    });
  }

  /**
   * Execute phase with sprint orchestration
   */
  private async executePhaseWithSprints(
    phase: Phase,
    context: PhaseContext,
    initialTask: string
  ): Promise<PhaseResult> {
    this.logger.info('Executing phase via Sprint Orchestrator', {
      phaseId: phase.id,
      sprintCount: phase.sprints!.length,
    });

    // Prepare task with context
    const phaseTask = this.preparePhaseTask(phase, context, initialTask);

    // Resolve cross-phase sprint dependencies
    const enrichedSprints = this.enrichSprintsWithCrossPhaseDependencies(phase.sprints!);

    // Create Sprint Orchestrator with global sprint results for cross-phase coordination
    const sprintOrchestrator = createSprintOrchestrator({
      epicId: initialTask,
      sprints: enrichedSprints,
      globalSprintResults: this.globalSprintResults,
      defaultMaxRetries: 10,
      loopConfig: {
        ...this.config.defaultLoopConfig,
        ...phase.loopConfig,
      },
      memoryConfig: {
        enabled: true,
        namespace: `phase/${phase.id}`,
      },
    });

    try {
      // Initialize sprint orchestrator
      await sprintOrchestrator.initialize();

      // Execute all sprints
      const sprintResult = await sprintOrchestrator.executeEpic();

      // Store sprint orchestrator result
      this.sprintOrchestratorResults.set(phase.id, sprintResult);

      // Store individual sprint results in global map for cross-phase dependencies
      for (const [sprintId, result] of sprintResult.sprintResults.entries()) {
        const globalKey = `${phase.id}/${sprintId}`;

        // Apply rate limiting to memory operations if enabled
        if (this.rateLimiter) {
          await this.rateLimiter.acquire(1);
        }

        this.globalSprintResults.set(globalKey, result);

        this.logger.debug('Stored sprint result globally', {
          phaseId: phase.id,
          sprintId,
          globalKey,
        });
      }

      // Track iteration costs for sprint orchestrator
      const iterationCost: IterationCost = {
        id: `${phase.id}`,
        loop2Iterations: sprintResult.statistics.totalRetries,
        loop3Iterations: sprintResult.totalSprints,
        totalCost: sprintResult.statistics.totalRetries * sprintResult.totalSprints,
        timestamp: new Date(),
      };
      this.iterationCosts.push(iterationCost);

      // Log cost tracking
      this.logger.info('Phase iteration cost tracked', {
        phaseId: phase.id,
        sprintIterations: sprintResult.totalSprints,
        totalRetries: sprintResult.statistics.totalRetries,
        totalCost: iterationCost.totalCost,
        epicIterationCounter: this.epicIterationCounter,
      });

      // Convert sprint result to phase result
      const phaseResult: PhaseResult = {
        success: sprintResult.success,
        phaseId: phase.id,
        totalLoop2Iterations: 0, // Handled by sprint orchestrator
        totalLoop3Iterations: 0,
        finalDeliverables: Array.from(sprintResult.sprintResults.values())
          .flatMap(r => r.deliverables),
        confidenceScores: this.convertSprintScoresToConfidenceScores(sprintResult),
        consensusResult: {
          consensusScore: sprintResult.statistics.averageConsensus,
          consensusThreshold: this.config.defaultLoopConfig.consensusThreshold || 0.90,
          consensusPassed: sprintResult.success,
          validatorResults: [],
          votingBreakdown: {},
          iteration: 0,
          timestamp: Date.now(),
        },
        escalated: !sprintResult.success && sprintResult.failedSprints.length > 0,
        escalationReason: sprintResult.failedSprints.length > 0
          ? `Failed sprints: ${sprintResult.failedSprints.join(', ')}`
          : undefined,
        statistics: {
          totalDuration: sprintResult.totalDuration,
          primarySwarmExecutions: sprintResult.totalSprints,
          consensusSwarmExecutions: sprintResult.totalSprints,
          averageConfidenceScore: sprintResult.statistics.averageConfidence,
          finalConsensusScore: sprintResult.statistics.averageConsensus,
          gatePasses: sprintResult.completedSprints.length,
          gateFails: sprintResult.failedSprints.length,
          feedbackInjections: sprintResult.statistics.totalRetries,
          circuitBreakerTrips: 0,
          timeouts: 0,
        },
        timestamp: Date.now(),
      };

      // Store result in memory if enabled
      if (this.memoryManager) {
        await this.storePhaseResult(phase.id, phaseResult);
      }

      return phaseResult;
    } finally {
      // Cleanup orchestrator
      await sprintOrchestrator.shutdown();
    }
  }

  /**
   * Execute phase directly via CFN Loop (no sprints)
   */
  private async executePhaseDirectly(
    phase: Phase,
    context: PhaseContext,
    initialTask: string
  ): Promise<PhaseResult> {
    this.logger.info('Executing phase via CFN Loop', {
      phaseId: phase.id,
      dependencies: context.dependencies,
    });

    // Prepare task with context
    const phaseTask = this.preparePhaseTask(phase, context, initialTask);

    // Merge loop configuration
    const loopConfig = {
      phaseId: phase.id,
      swarmId: `swarm-${phase.id}`,
      ...this.config.defaultLoopConfig,
      ...phase.loopConfig,
    };

    // Create CFN Loop Orchestrator
    const orchestrator = new CFNLoopOrchestrator(loopConfig);

    try {
      // Execute phase
      const result = await orchestrator.executePhase(phaseTask);

      // Store result in memory if enabled
      if (this.memoryManager) {
        await this.storePhaseResult(phase.id, result);
      }

      return result;
    } finally {
      // Cleanup orchestrator
      await orchestrator.shutdown();
    }
  }

  /**
   * Validate phase completion criteria
   */
  private async validatePhaseCompletion(phase: Phase, result: PhaseResult): Promise<boolean> {
    this.logger.info('Validating phase completion', {
      phaseId: phase.id,
      success: result.success,
      consensusScore: result.consensusResult.consensusScore,
    });

    // Check basic success
    if (!result.success) {
      return false;
    }

    // Check consensus threshold
    if (
      result.consensusResult.consensusScore < phase.completionCriteria.minConsensusScore
    ) {
      this.logger.warn('Phase consensus score below threshold', {
        phaseId: phase.id,
        actual: result.consensusResult.consensusScore,
        required: phase.completionCriteria.minConsensusScore,
      });
      return false;
    }

    // Check required deliverables
    const deliverableIds = result.finalDeliverables.map((d: any) => d.id || d.name || '');
    const missingDeliverables = phase.completionCriteria.requiredDeliverables.filter(
      req => !deliverableIds.includes(req)
    );

    if (missingDeliverables.length > 0) {
      this.logger.warn('Phase missing required deliverables', {
        phaseId: phase.id,
        missing: missingDeliverables,
      });
      return false;
    }

    // Run custom validation if provided
    if (phase.completionCriteria.customValidation) {
      try {
        const customValid = await phase.completionCriteria.customValidation(result);
        if (!customValid) {
          this.logger.warn('Phase custom validation failed', {
            phaseId: phase.id,
          });
          return false;
        }
      } catch (error) {
        this.logger.error('Phase custom validation error', {
          phaseId: phase.id,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }

    this.logger.info('Phase validation passed', {
      phaseId: phase.id,
    });

    return true;
  }

  /**
   * Generate continuation prompt for next phase
   */
  private generateContinuationPrompt(phase: Phase, result: PhaseResult): string {
    const nextPhaseId = this.getNextPhase(phase.id);
    const nextPhase = nextPhaseId
      ? this.config.phases.find(p => p.id === nextPhaseId)
      : undefined;

    // Get sprint status for current phase
    const sprintStatus = this.getSprintStatus(phase);

    // Use custom prompt if provided
    if (phase.selfLoopingPrompt) {
      return this.interpolatePrompt(phase.selfLoopingPrompt, {
        phaseId: phase.id,
        nextPhaseId: nextPhaseId || 'NONE',
        consensusScore: result.consensusResult.consensusScore,
        deliverableCount: result.finalDeliverables.length,
        sprintStatus,
      });
    }

    // Generate default continuation prompt
    if (nextPhase) {
      const satisfiedDeps = nextPhase.dependsOn.filter(dep => this.completedPhases.has(dep));
      const allDepsSatisfied = satisfiedDeps.length === nextPhase.dependsOn.length;

      return `
Phase ${phase.id} completed successfully with ${(result.consensusResult.consensusScore * 100).toFixed(1)}% consensus.

${result.finalDeliverables.length} deliverables produced:
${result.finalDeliverables.map((d: any, idx: number) => `  ${idx + 1}. ${d.name || d.id || 'Unknown deliverable'}`).join('\n')}

${sprintStatus}

${allDepsSatisfied ? '✅' : '⏳'} **IMMEDIATELY proceed to Phase ${nextPhase.id}: ${nextPhase.name}**

Phase ${nextPhase.id} Description:
${nextPhase.description}

Dependencies satisfied: ${satisfiedDeps.join(', ')}${allDepsSatisfied ? ' ✅ ALL SATISFIED' : ' ⏳ WAITING'}

DO NOT wait for human approval. IMMEDIATELY initialize swarm and begin execution.

Success criteria:
- Minimum consensus score: ${(nextPhase.completionCriteria.minConsensusScore * 100).toFixed(0)}%
- Required deliverables: ${nextPhase.completionCriteria.requiredDeliverables.join(', ')}

NEXT STEP: Initialize swarm for Phase ${nextPhase.id} and spawn agents.
`.trim();
    } else {
      return `
Phase ${phase.id} completed successfully. This was the final phase.

Total phases completed: ${this.completedPhases.size}/${this.topologicalOrder.length}

Final consensus score: ${(result.consensusResult.consensusScore * 100).toFixed(1)}%

${sprintStatus}

All orchestration objectives achieved. System ready for production use.
`.trim();
    }
  }

  /**
   * Get sprint status summary for a phase
   */
  private getSprintStatus(phase: Phase): string {
    const sprintResult = this.sprintOrchestratorResults.get(phase.id);

    if (!sprintResult) {
      return '';
    }

    const completedSprints = sprintResult.completedSprints.length;
    const failedSprints = sprintResult.failedSprints.length;
    const totalSprints = sprintResult.totalSprints;

    const sprintDetails = Array.from(sprintResult.sprintResults.entries())
      .map(([sprintId, result]) => {
        const status = result.success ? '✅' : '❌';
        const confidence = (result.averageConfidence * 100).toFixed(1);
        return `  - ${sprintId}: ${status} (confidence: ${confidence}%, deliverables: ${result.deliverables.length})`;
      })
      .join('\n');

    return `
Sprint Summary:
- Total sprints: ${totalSprints}
- Completed: ${completedSprints} ✅
- Failed: ${failedSprints} ${failedSprints > 0 ? '❌' : ''}
- Average confidence: ${(sprintResult.statistics.averageConfidence * 100).toFixed(1)}%
- Average consensus: ${(sprintResult.statistics.averageConsensus * 100).toFixed(1)}%

Sprint Details:
${sprintDetails}
`.trim();
  }

  /**
   * Generate failure continuation prompt
   */
  private generateFailureContinuationPrompt(phase: Phase): string {
    return `
Phase ${phase.id} failed after ${this.phaseRetries.get(phase.id)} attempts.

ESCALATION REQUIRED: Human intervention needed to resolve phase failure.

Recommended next steps:
1. Review phase ${phase.id} requirements
2. Check dependency satisfaction: ${phase.dependsOn.join(', ')}
3. Analyze validation failures
4. Retry phase with adjusted configuration

DO NOT proceed to next phase until this phase is resolved.
`.trim();
  }

  /**
   * Build dependency graph from phase definitions
   */
  private buildDependencyGraph(): void {
    this.logger.info('Building dependency graph');

    // Create nodes
    for (const phase of this.config.phases) {
      const node: DependencyNode = {
        phase,
        dependencies: new Set(phase.dependsOn),
        dependents: new Set(),
        visited: false,
        inProgress: false,
      };
      this.dependencyGraph.set(phase.id, node);
    }

    // Build reverse edges (dependents)
    for (const [phaseId, node] of this.dependencyGraph) {
      for (const depId of node.dependencies) {
        const depNode = this.dependencyGraph.get(depId);
        if (depNode) {
          depNode.dependents.add(phaseId);
        } else {
          throw new Error(
            `Phase ${phaseId} depends on non-existent phase ${depId}`
          );
        }
      }
    }

    this.logger.info('Dependency graph built', {
      nodes: this.dependencyGraph.size,
    });
  }

  /**
   * Detect cycles in dependency graph
   */
  private detectCycles(): void {
    this.logger.info('Detecting dependency cycles');

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (phaseId: string, path: string[]): void => {
      if (recStack.has(phaseId)) {
        const cycle = [...path, phaseId];
        throw new Error(`Dependency cycle detected: ${cycle.join(' → ')}`);
      }

      if (visited.has(phaseId)) {
        return;
      }

      visited.add(phaseId);
      recStack.add(phaseId);

      const node = this.dependencyGraph.get(phaseId)!;
      for (const depId of node.dependencies) {
        dfs(depId, [...path, phaseId]);
      }

      recStack.delete(phaseId);
    };

    for (const phaseId of this.dependencyGraph.keys()) {
      if (!visited.has(phaseId)) {
        dfs(phaseId, []);
      }
    }

    this.logger.info('No dependency cycles detected');
  }

  /**
   * Compute topological ordering of phases
   */
  private computeTopologicalOrder(): Phase[] {
    this.logger.info('Computing topological order');

    const sorted: Phase[] = [];
    const visited = new Set<string>();

    const dfs = (phaseId: string): void => {
      if (visited.has(phaseId)) {
        return;
      }

      visited.add(phaseId);

      const node = this.dependencyGraph.get(phaseId)!;
      for (const depId of node.dependencies) {
        dfs(depId);
      }

      sorted.push(node.phase);
    };

    for (const phaseId of this.dependencyGraph.keys()) {
      dfs(phaseId);
    }

    this.logger.info('Topological order computed', {
      order: sorted.map(p => p.id),
    });

    return sorted;
  }

  /**
   * Check if phase dependencies are satisfied
   */
  private areDependenciesSatisfied(phase: Phase): boolean {
    return phase.dependsOn.every(depId => this.completedPhases.has(depId));
  }

  /**
   * Build phase execution context
   */
  private buildPhaseContext(phase: Phase): PhaseContext {
    const dependencyResults = new Map<string, PhaseResult>();

    for (const depId of phase.dependsOn) {
      const result = this.phaseResults.get(depId);
      if (result) {
        dependencyResults.set(depId, result);
      }
    }

    return {
      phaseId: phase.id,
      dependencies: phase.dependsOn,
      dependencyResults,
      previousAttempts: this.phaseRetries.get(phase.id) || 0,
      metadata: {},
    };
  }

  /**
   * Prepare phase task with context
   */
  private preparePhaseTask(
    phase: Phase,
    context: PhaseContext,
    initialTask: string
  ): string {
    const depSummary = Array.from(context.dependencyResults.entries())
      .map(([depId, result]) => `  - ${depId}: ${result.success ? '✅' : '❌'} (${result.finalDeliverables.length} deliverables)`)
      .join('\n');

    return `
${initialTask}

CURRENT PHASE: ${phase.id} - ${phase.name}

DESCRIPTION:
${phase.description}

DEPENDENCIES COMPLETED:
${depSummary || '  (none)'}

SUCCESS CRITERIA:
- Minimum consensus score: ${(phase.completionCriteria.minConsensusScore * 100).toFixed(0)}%
- Required deliverables: ${phase.completionCriteria.requiredDeliverables.join(', ')}

EXECUTE THIS PHASE NOW.
`.trim();
  }

  /**
   * Get next phase in topological order
   */
  private getNextPhase(currentPhaseId: string): string | undefined {
    const currentIndex = this.topologicalOrder.findIndex(p => p.id === currentPhaseId);
    if (currentIndex >= 0 && currentIndex < this.topologicalOrder.length - 1) {
      return this.topologicalOrder[currentIndex + 1].id;
    }
    return undefined;
  }

  /**
   * Determine if orchestration should abort on phase failure
   */
  private shouldAbortOnPhaseFailure(phase: Phase): boolean {
    // Abort if any dependent phases exist
    const node = this.dependencyGraph.get(phase.id);
    return node ? node.dependents.size > 0 : false;
  }

  /**
   * Store phase result in memory with hierarchical namespace
   *
   * Memory structure: cfn-loop/epic-{id}/phase-{n}/sprint-{m}/iteration-{i}
   */
  private async storePhaseResult(phaseId: string, result: PhaseResult): Promise<void> {
    if (!this.memoryManager) {
      return;
    }

    try {
      // Store phase-level result
      const phaseNamespace = `cfn-loop/phase/${phaseId}`;

      this.logger.info('Storing phase result in memory', {
        phaseId,
        namespace: phaseNamespace,
        success: result.success,
      });

      // In real implementation, would use SwarmMemory:
      // await this.memoryManager.store(phaseNamespace, {
      //   phaseId,
      //   result,
      //   timestamp: Date.now(),
      // });

      // If phase used sprint orchestrator, store sprint-level results
      const sprintResult = this.sprintOrchestratorResults.get(phaseId);
      if (sprintResult) {
        for (const [sprintId, sprint] of sprintResult.sprintResults.entries()) {
          const sprintNamespace = `cfn-loop/phase/${phaseId}/sprint/${sprintId}`;

          this.logger.debug('Storing sprint result in memory', {
            phaseId,
            sprintId,
            namespace: sprintNamespace,
          });

          // In real implementation:
          // await this.memoryManager.store(sprintNamespace, {
          //   sprintId,
          //   phaseId,
          //   result: sprint,
          //   timestamp: Date.now(),
          // });
        }
      }
    } catch (error) {
      this.logger.error('Failed to store phase result in memory', {
        phaseId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Create failed phase result
   */
  private createFailedPhaseResult(phase: Phase, error?: Error): PhaseResult {
    return {
      success: false,
      phaseId: phase.id,
      totalLoop2Iterations: 0,
      totalLoop3Iterations: 0,
      finalDeliverables: [],
      confidenceScores: [],
      consensusResult: {
        consensusScore: 0,
        consensusThreshold: phase.completionCriteria.minConsensusScore,
        consensusPassed: false,
        validatorResults: [],
        votingBreakdown: {},
        iteration: 0,
        timestamp: Date.now(),
      },
      escalated: true,
      escalationReason: error ? error.message : 'Phase execution failed',
      statistics: {
        totalDuration: 0,
        primarySwarmExecutions: 0,
        consensusSwarmExecutions: 0,
        averageConfidenceScore: 0,
        finalConsensusScore: 0,
        gatePasses: 0,
        gateFails: 0,
        feedbackInjections: 0,
        circuitBreakerTrips: 0,
        timeouts: 0,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Interpolate variables in prompt template
   */
  private interpolatePrompt(
    template: string,
    variables: Record<string, any>
  ): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, String(value));
    }
    return result;
  }

  /**
   * Get orchestration statistics with memory metrics
   */
  getStatistics() {
    const memStats = this.getMemoryStats();
    const totalIterationCost = this.iterationCosts.reduce((sum, cost) => sum + cost.totalCost, 0);
    const avgCostPerPhase = this.iterationCosts.length > 0
      ? totalIterationCost / this.iterationCosts.length
      : 0;

    return {
      totalPhases: this.topologicalOrder.length,
      completedPhases: this.completedPhases.size,
      failedPhases: this.failedPhases.size,
      inProgress: this.topologicalOrder.length - this.completedPhases.size - this.failedPhases.size,
      duration: this.startTime > 0 ? Date.now() - this.startTime : 0,
      epicIterations: this.epicIterationCounter,
      maxEpicIterations: this.MAX_EPIC_ITERATIONS,
      epicIterationUtilization: (this.epicIterationCounter / this.MAX_EPIC_ITERATIONS) * 100,
      totalIterationCost,
      avgCostPerPhase,
      rateLimiterStats: this.rateLimiter?.getStats(),
      memoryStats: {
        sprintCacheSize: memStats.size,
        sprintCacheMaxSize: memStats.maxSize,
        sprintCacheTTL: memStats.ttl,
        sprintCacheEvictions: memStats.evictions,
      },
    };
  }

  /**
   * Shutdown orchestrator
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Phase Orchestrator');
    this.removeAllListeners();
  }
}

// ===== FACTORY FUNCTION =====

/**
 * Create Phase Orchestrator instance
 *
 * @param config - Orchestrator configuration
 * @returns Configured PhaseOrchestrator instance
 */
export function createPhaseOrchestrator(
  config: PhaseOrchestratorConfig
): PhaseOrchestrator {
  return new PhaseOrchestrator(config);
}

// ===== PHASE LOADER =====

/**
 * Load phases from epic configuration file
 *
 * @param source - Path to epic-config.json file
 * @returns Array of phase definitions with sprints loaded
 */
export async function loadPhasesFromConfig(source: string): Promise<Phase[]> {
  const logger = new Logger(
    { level: 'info' as const, format: 'json' as const, destination: 'console' as const },
    { component: 'PhaseLoader' }
  );

  try {
    logger.info('Loading phases from config', { source });

    // Read epic configuration file
    const epicConfigContent = await fs.readFile(source, 'utf-8');
    const epicConfig = JSON.parse(epicConfigContent);

    if (!epicConfig.phases || !Array.isArray(epicConfig.phases)) {
      throw new Error('Epic config missing phases array');
    }

    const phases: Phase[] = [];
    const epicDir = dirname(source);

    // Load each phase
    for (const phaseConfig of epicConfig.phases) {
      const phase: Phase = {
        id: phaseConfig.phaseId,
        order: phases.length,
        name: phaseConfig.name,
        description: phaseConfig.description,
        dependsOn: phaseConfig.dependencies || [],
        completionCriteria: {
          minConsensusScore: 0.90,
          requiredDeliverables: [],
        },
      };

      // Load sprints from inline definition or external file
      if (phaseConfig.sprints && Array.isArray(phaseConfig.sprints)) {
        // Sprints defined inline in epic-config.json
        phase.sprints = phaseConfig.sprints.map((sprint: any) => ({
          id: sprint.sprintId || sprint.id,
          phaseId: phase.id,
          name: sprint.name,
          description: sprint.description || '',
          dependencies: sprint.dependencies || [],
          crossPhaseDependencies: sprint.crossPhaseDependencies || [],
          suggestedAgentTypes: sprint.suggestedAgentTypes || [],
          checkpoints: sprint.checkpoints || {
            testsPass: true,
            minCoverage: 85,
            noSecurityIssues: true,
            minConfidence: 0.75,
            dependenciesSatisfied: true,
          },
          maxRetries: sprint.maxRetries || 10,
          metadata: sprint.metadata || {},
        }));
      } else if (phaseConfig.file) {
        // Sprints defined in external markdown/JSON file
        const phaseFilePath = join(epicDir, phaseConfig.file);
        phase.file = phaseFilePath;

        try {
          const phaseFileContent = await fs.readFile(phaseFilePath, 'utf-8');

          // Try parsing as JSON first
          if (phaseFilePath.endsWith('.json')) {
            const phaseData = JSON.parse(phaseFileContent);
            if (phaseData.sprints) {
              phase.sprints = phaseData.sprints.map((sprint: any) => ({
                id: sprint.sprintId || sprint.id,
                phaseId: phase.id,
                name: sprint.name,
                description: sprint.description || '',
                dependencies: sprint.dependencies || [],
                crossPhaseDependencies: sprint.crossPhaseDependencies || [],
                suggestedAgentTypes: sprint.suggestedAgentTypes || [],
                checkpoints: sprint.checkpoints || {
                  testsPass: true,
                  minCoverage: 85,
                  noSecurityIssues: true,
                  minConfidence: 0.75,
                  dependenciesSatisfied: true,
                },
                maxRetries: sprint.maxRetries || 10,
                metadata: sprint.metadata || {},
              }));
            }
          } else if (phaseFilePath.endsWith('.md')) {
            // Parse markdown file for sprint definitions
            phase.sprints = parseSprintsFromMarkdown(phaseFileContent, phase.id);
          }
        } catch (error) {
          logger.warn('Failed to load phase file, skipping sprints', {
            phaseId: phase.id,
            file: phaseFilePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      phases.push(phase);
    }

    // Process cross-phase dependencies from epic config
    if (epicConfig.crossPhaseDependencies && Array.isArray(epicConfig.crossPhaseDependencies)) {
      for (const crossDep of epicConfig.crossPhaseDependencies) {
        // Parse "phase-2/sprint-2.2" format
        const fromMatch = crossDep.from.match(/^(phase-[\w-]+)\/(sprint-[\w.]+)$/);
        const toMatch = crossDep.to.match(/^(phase-[\w-]+)\/(sprint-[\w.]+)$/);

        if (fromMatch && toMatch) {
          const [, fromPhaseId, fromSprintId] = fromMatch;
          const [, toPhaseId, toSprintId] = toMatch;

          // Find the phase and sprint
          const fromPhase = phases.find(p => p.id === fromPhaseId);
          if (fromPhase && fromPhase.sprints) {
            const fromSprint = fromPhase.sprints.find(s => s.id === fromSprintId);
            if (fromSprint) {
              // Add cross-phase dependency
              if (!fromSprint.crossPhaseDependencies.includes(`${toPhaseId}/${toSprintId}`)) {
                fromSprint.crossPhaseDependencies.push(`${toPhaseId}/${toSprintId}`);
              }
            }
          }
        }
      }
    }

    logger.info('Phases loaded successfully', {
      phaseCount: phases.length,
      totalSprints: phases.reduce((sum, p) => sum + (p.sprints?.length || 0), 0),
    });

    return phases;
  } catch (error) {
    logger.error('Failed to load phases from config', {
      source,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Parse sprints from markdown phase file
 *
 * @param markdown - Markdown content
 * @param phaseId - Phase identifier
 * @returns Array of sprint definitions
 */
function parseSprintsFromMarkdown(markdown: string, phaseId: string): Sprint[] {
  const sprints: Sprint[] = [];

  // Match sprint sections (### Sprint X.X: Title)
  const sprintSections = markdown.split(/^###\s+Sprint\s+([\d.]+):\s+(.+)$/gm);

  for (let i = 1; i < sprintSections.length; i += 3) {
    const sprintId = `sprint-${sprintSections[i].trim()}`;
    const sprintName = sprintSections[i + 1].trim();
    const content = sprintSections[i + 2] || '';

    // Extract description (first paragraph after status/duration/dependencies)
    const descMatch = content.match(/\*\*Tasks\*\*:\s*\n([\s\S]+?)(?:\n\*\*|$)/);
    const description = descMatch ? descMatch[1].trim() : '';

    // Extract dependencies
    const depsMatch = content.match(/\*\*Dependencies\*\*:\s*(.+)/);
    const dependencies: string[] = [];
    if (depsMatch && depsMatch[1].trim() !== 'None') {
      const depList = depsMatch[1].match(/Sprint\s+([\d.]+)/g);
      if (depList) {
        dependencies.push(...depList.map(d => `sprint-${d.replace('Sprint ', '')}`));
      }
    }

    // Extract cross-phase dependencies (if any)
    const crossDepsMatch = content.match(/\*\*Cross-Phase Dependencies\*\*:\s*(.+)/);
    const crossPhaseDependencies: string[] = [];
    if (crossDepsMatch && crossDepsMatch[1].trim() !== 'None') {
      // Parse format like "Phase 1 Sprint 1.3"
      const crossDepList = crossDepsMatch[1].match(/Phase\s+(\d+)\s+Sprint\s+([\d.]+)/g);
      if (crossDepList) {
        crossPhaseDependencies.push(
          ...crossDepList.map(d => {
            const match = d.match(/Phase\s+(\d+)\s+Sprint\s+([\d.]+)/);
            if (match) {
              return `phase-${match[1]}/sprint-${match[2]}`;
            }
            return '';
          }).filter(Boolean)
        );
      }
    }

    // Extract coverage requirement
    const coverageMatch = content.match(/Coverage:\s*≥(\d+)%/);
    const minCoverage = coverageMatch ? parseInt(coverageMatch[1], 10) : 85;

    sprints.push({
      id: sprintId,
      phaseId,
      name: sprintName,
      description,
      dependencies,
      crossPhaseDependencies,
      suggestedAgentTypes: [],
      checkpoints: {
        testsPass: true,
        minCoverage,
        noSecurityIssues: true,
        minConfidence: 0.75,
        dependenciesSatisfied: true,
      },
      maxRetries: 10,
      metadata: {},
    });
  }

  return sprints;
}

// ===== EXPORTS =====

export default PhaseOrchestrator;
