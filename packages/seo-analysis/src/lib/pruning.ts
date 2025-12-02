/**
 * Promise-Based Pruning Logic for MDAP Beam Search
 *
 * @module @claude-flow-novice/seo-analysis/lib/pruning
 * @description Evidence-based branch pruning for MDAP beam search algorithm
 * @version 1.0.0
 *
 * Implements promise-based pruning (NOT quota-based) that:
 * - Keeps branches with evidence of promise (SOLVED, PROMISING, EXPLORING)
 * - Discards only dead-end branches with concrete evidence of failure
 * - Logs all decisions with reasoning and evidence
 * - Uses strict type-safe interfaces
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/**
 * Branch state enumeration representing the current state of exploration
 */
export enum BranchState {
  /** Branch path has reached a solution */
  SOLVED = 'SOLVED',
  /** Branch shows strong potential for solution */
  PROMISING = 'PROMISING',
  /** Branch is being actively explored */
  EXPLORING = 'EXPLORING',
  /** Branch has not progressed recently */
  STALLED = 'STALLED',
  /** Branch has hit a logical contradiction or constraint violation */
  DISPROVEN = 'DISPROVEN',
}

/**
 * Pruning configuration with promise-based thresholds
 */
export interface PruningConfig {
  /** Maximum number of iterations without progress before marking stalled */
  max_stalled_iterations: number;
  /** Minimum confidence threshold to keep branch (0.0-1.0) */
  min_confidence_threshold: number;
  /** Required minimum progress every N iterations to avoid stalling */
  require_progress_every_n_iterations: number;
}

/**
 * Evidence of branch state with supporting data
 */
export interface BranchEvidence {
  /** Iteration count when evidence was collected */
  iteration: number;
  /** Type of evidence (e.g., "contradiction", "constraint_violation", "no_progress") */
  type: string;
  /** Description of the evidence */
  description: string;
  /** Confidence level of the evidence (0.0-1.0) */
  confidence: number;
}

/**
 * Branch exploration metrics for decision making
 */
export interface BranchMetrics {
  /** Current iteration count for this branch */
  current_iteration: number;
  /** Last iteration where meaningful progress was made */
  last_progress_iteration: number;
  /** Confidence score for this branch (0.0-1.0) */
  confidence: number;
  /** Current state of the branch */
  state: BranchState;
  /** Evidence supporting the current state */
  evidence: BranchEvidence[];
}

/**
 * Complete branch state for pruning evaluation
 */
export interface Branch {
  /** Unique identifier for the branch */
  id: string;
  /** Current metrics of the branch */
  metrics: BranchMetrics;
}

/**
 * Pruning decision with justification
 */
export interface PruningDecision {
  /** Branch identifier */
  branch_id: string;
  /** Action to take: keep or discard */
  action: 'keep' | 'discard';
  /** Human-readable reason for decision */
  reason: string;
  /** Supporting evidence for the decision */
  evidence: string[];
}

/**
 * Pruning result summary
 */
export interface PruningResult {
  /** Array of pruning decisions for each branch */
  decisions: PruningDecision[];
  /** Number of branches kept */
  kept_count: number;
  /** Number of branches discarded */
  discarded_count: number;
  /** Pruning operation timestamp */
  timestamp: Date;
}

// ============================================================================
// LOGGER INTERFACE
// ============================================================================

/**
 * Logger interface for pruning operations (injectable)
 */
export interface PruningLogger {
  info(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Default console-based logger implementation
 */
class DefaultPruningLogger implements PruningLogger {
  private prefix = '[Pruning]';

  info(message: string, data?: Record<string, unknown>): void {
    console.log(`${this.prefix} INFO: ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  debug(message: string, data?: Record<string, unknown>): void {
    console.debug(`${this.prefix} DEBUG: ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  warn(message: string, data?: Record<string, unknown>): void {
    console.warn(`${this.prefix} WARN: ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }

  error(message: string, data?: Record<string, unknown>): void {
    console.error(`${this.prefix} ERROR: ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
}

// ============================================================================
// PRUNING ENGINE
// ============================================================================

/**
 * Promise-based pruning engine for MDAP Beam Search
 *
 * Implements evidence-based branch evaluation:
 * - KEEP: SOLVED, PROMISING, EXPLORING states
 * - KEEP: STALLED with < max_stalled_iterations and sufficient confidence
 * - DISCARD: DISPROVEN (contradiction or constraint violation)
 * - DISCARD: STALLED with > max_stalled_iterations and zero progress
 */
export class PruningEngine {
  private logger: PruningLogger;

  /**
   * Initialize pruning engine with optional logger
   * @param logger Optional logger implementation (defaults to console logger)
   */
  constructor(logger?: PruningLogger) {
    this.logger = logger || new DefaultPruningLogger();
  }

  /**
   * Evaluate a single branch for pruning
   *
   * @param branch Branch to evaluate
   * @param config Pruning configuration
   * @returns Promise<PruningDecision> Decision to keep or discard
   */
  async evaluateBranch(branch: Branch, config: PruningConfig): Promise<PruningDecision> {
    this.logger.debug('Evaluating branch', {
      branch_id: branch.id,
      state: branch.metrics.state,
      confidence: branch.metrics.confidence,
      iteration: branch.metrics.current_iteration,
    });

    const metrics = branch.metrics;
    const iterationsSinceProgress = metrics.current_iteration - metrics.last_progress_iteration;

    // Rule 1: Keep if SOLVED (absolute keep)
    if (metrics.state === BranchState.SOLVED) {
      return {
        branch_id: branch.id,
        action: 'keep',
        reason: 'Branch has reached a solution',
        evidence: ['State is SOLVED'],
      };
    }

    // Rule 2: Keep if PROMISING (shows promise despite limited exploration)
    if (metrics.state === BranchState.PROMISING) {
      return {
        branch_id: branch.id,
        action: 'keep',
        reason: 'Branch shows strong potential for solution',
        evidence: [
          `State is PROMISING`,
          `Confidence: ${metrics.confidence}`,
          ...this.extractEvidenceStrings(metrics.evidence),
        ],
      };
    }

    // Rule 3: Keep if EXPLORING (active exploration)
    if (metrics.state === BranchState.EXPLORING) {
      return {
        branch_id: branch.id,
        action: 'keep',
        reason: 'Branch is being actively explored',
        evidence: [
          `State is EXPLORING`,
          `Iterations since progress: ${iterationsSinceProgress}`,
          `Confidence: ${metrics.confidence}`,
        ],
      };
    }

    // Rule 4: Discard if DISPROVEN (hard constraint)
    if (metrics.state === BranchState.DISPROVEN) {
      return {
        branch_id: branch.id,
        action: 'discard',
        reason: 'Branch has been disproven (contradiction or constraint violation)',
        evidence: this.extractProvenDisprovenEvidence(metrics.evidence, 'DISPROVEN'),
      };
    }

    // Rule 5: Evaluate STALLED branches (conditional keep/discard)
    if (metrics.state === BranchState.STALLED) {
      return this.evaluateStalledBranch(branch, config, iterationsSinceProgress);
    }

    // Fallback (should not reach here with valid state enum)
    this.logger.warn('Unknown branch state, keeping by default', {
      branch_id: branch.id,
      state: metrics.state,
    });

    return {
      branch_id: branch.id,
      action: 'keep',
      reason: 'Unknown state, keeping branch for further evaluation',
      evidence: [`State: ${metrics.state}`, `Confidence: ${metrics.confidence}`],
    };
  }

  /**
   * Evaluate STALLED branch with promise-based logic
   * @param branch STALLED branch to evaluate
   * @param config Pruning configuration
   * @param iterationsSinceProgress Iterations since last progress
   * @returns PruningDecision Keep or discard decision
   */
  private evaluateStalledBranch(
    branch: Branch,
    config: PruningConfig,
    iterationsSinceProgress: number,
  ): PruningDecision {
    const metrics = branch.metrics;

    // Sub-rule 5a: Discard if stalled >= max_stalled_iterations AND zero progress
    if (iterationsSinceProgress > config.max_stalled_iterations && iterationsSinceProgress === iterationsSinceProgress) {
      return {
        branch_id: branch.id,
        action: 'discard',
        reason: `Branch stalled for ${iterationsSinceProgress} iterations without progress (exceeds max ${config.max_stalled_iterations})`,
        evidence: [
          `State: STALLED`,
          `Iterations without progress: ${iterationsSinceProgress}`,
          `Max allowed: ${config.max_stalled_iterations}`,
          `Confidence: ${metrics.confidence}`,
        ],
      };
    }

    // Sub-rule 5b: Discard if stalled and confidence below threshold
    if (metrics.confidence < config.min_confidence_threshold) {
      return {
        branch_id: branch.id,
        action: 'discard',
        reason: `Stalled branch with insufficient confidence (${metrics.confidence} < ${config.min_confidence_threshold})`,
        evidence: [
          `State: STALLED`,
          `Confidence: ${metrics.confidence}`,
          `Threshold: ${config.min_confidence_threshold}`,
          `Iterations without progress: ${iterationsSinceProgress}`,
        ],
      };
    }

    // Sub-rule 5c: Keep if stalled but < max_stalled_iterations
    return {
      branch_id: branch.id,
      action: 'keep',
      reason: `Stalled but still within iteration limit (${iterationsSinceProgress}/${config.max_stalled_iterations})`,
      evidence: [
        `State: STALLED`,
        `Iterations without progress: ${iterationsSinceProgress}`,
        `Max allowed: ${config.max_stalled_iterations}`,
        `Confidence: ${metrics.confidence}`,
        `Threshold: ${config.min_confidence_threshold}`,
      ],
    };
  }

  /**
   * Apply pruning to all branches in parallel
   *
   * @param branches Array of branches to evaluate
   * @param config Pruning configuration
   * @returns Promise<PruningResult> Pruning decisions and summary
   */
  async pruneBranches(branches: Branch[], config: PruningConfig): Promise<PruningResult> {
    this.logger.info('Starting pruning operation', {
      total_branches: branches.length,
      config,
    });

    // Validate configuration
    this.validatePruningConfig(config);

    // Evaluate all branches in parallel
    const decisionPromises = branches.map((branch) => this.evaluateBranch(branch, config));
    const decisions = await Promise.all(decisionPromises);

    // Calculate summary statistics
    const keptCount = decisions.filter((d) => d.action === 'keep').length;
    const discardedCount = decisions.filter((d) => d.action === 'discard').length;

    const result: PruningResult = {
      decisions,
      kept_count: keptCount,
      discarded_count: discardedCount,
      timestamp: new Date(),
    };

    // Log summary
    this.logPruningResult(result);

    return result;
  }

  /**
   * Validate pruning configuration for consistency
   * @param config Configuration to validate
   * @throws Error if configuration is invalid
   */
  private validatePruningConfig(config: PruningConfig): void {
    if (config.max_stalled_iterations < 1) {
      throw new Error('max_stalled_iterations must be >= 1');
    }

    if (config.min_confidence_threshold < 0 || config.min_confidence_threshold > 1) {
      throw new Error('min_confidence_threshold must be between 0.0 and 1.0');
    }

    if (config.require_progress_every_n_iterations < 1) {
      throw new Error('require_progress_every_n_iterations must be >= 1');
    }
  }

  /**
   * Extract evidence strings from evidence array
   * @param evidence Array of evidence objects
   * @returns Array of formatted evidence strings
   */
  private extractEvidenceStrings(evidence: BranchEvidence[]): string[] {
    return evidence.map(
      (e) =>
        `Evidence: ${e.type} at iteration ${e.iteration} (confidence: ${e.confidence}) - ${e.description}`,
    );
  }

  /**
   * Extract evidence for disproven branches
   * @param evidence Array of evidence objects
   * @param targetState State to filter evidence for
   * @returns Array of formatted evidence strings
   */
  private extractProvenDisprovenEvidence(evidence: BranchEvidence[], targetState: string): string[] {
    return evidence
      .filter((e) => e.type.includes('contradiction') || e.type.includes('constraint'))
      .map(
        (e) =>
          `Evidence: ${e.type} at iteration ${e.iteration} (confidence: ${e.confidence}) - ${e.description}`,
      );
  }

  /**
   * Log pruning result summary with details
   * @param result Pruning result to log
   */
  private logPruningResult(result: PruningResult): void {
    const keptBranches = result.decisions.filter((d) => d.action === 'keep').map((d) => d.branch_id);
    const discardedBranches = result.decisions.filter((d) => d.action === 'discard').map((d) => d.branch_id);

    this.logger.info('Pruning operation completed', {
      total_branches: result.decisions.length,
      kept_count: result.kept_count,
      discarded_count: result.discarded_count,
      timestamp: result.timestamp.toISOString(),
    });

    // Log individual decisions with reasoning
    result.decisions.forEach((decision) => {
      const level = decision.action === 'keep' ? 'info' : 'warn';
      this.logger[level as 'info' | 'warn'](`Branch ${decision.action}:`, {
        branch_id: decision.branch_id,
        reason: decision.reason,
        evidence: decision.evidence,
      });
    });

    // Summary
    if (discardedBranches.length > 0) {
      this.logger.info('Discarded branches', {
        count: discardedBranches.length,
        branches: discardedBranches,
      });
    }
  }
}

// ============================================================================
// FACTORY & UTILITIES
// ============================================================================

/**
 * Create a standard pruning engine with default logger
 * @returns Configured PruningEngine instance
 */
export function createPruningEngine(): PruningEngine {
  return new PruningEngine();
}

/**
 * Create a pruning engine with custom logger
 * @param logger Custom logger implementation
 * @returns Configured PruningEngine instance
 */
export function createPruningEngineWithLogger(logger: PruningLogger): PruningEngine {
  return new PruningEngine(logger);
}

/**
 * Default pruning configuration for MDAP Beam Search
 */
export const DEFAULT_PRUNING_CONFIG: PruningConfig = {
  max_stalled_iterations: 5,
  min_confidence_threshold: 0.3,
  require_progress_every_n_iterations: 3,
};

/**
 * Conservative pruning configuration (keep more branches)
 */
export const CONSERVATIVE_PRUNING_CONFIG: PruningConfig = {
  max_stalled_iterations: 10,
  min_confidence_threshold: 0.2,
  require_progress_every_n_iterations: 5,
};

/**
 * Aggressive pruning configuration (discard more branches)
 */
export const AGGRESSIVE_PRUNING_CONFIG: PruningConfig = {
  max_stalled_iterations: 3,
  min_confidence_threshold: 0.5,
  require_progress_every_n_iterations: 2,
};

// ============================================================================
// EXPORTS
// ============================================================================

export default PruningEngine;
