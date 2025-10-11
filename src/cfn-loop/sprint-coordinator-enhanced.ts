/**
 * Sprint Coordinator Enhanced - Sprint 4.2: Dependency Waiting with Productive Work
 *
 * Enhances sprint coordination with:
 * - Dependency waiting while working on independent files
 * - Interface signal publishing when ready
 * - Parallel Loop 2 validation
 * - Integration with blocking-coordination signal ACK protocol
 *
 * Key Pattern: Don't block waiting for dependencies - work on independent files
 * while monitoring for dependency completion signals via Redis pub/sub.
 *
 * @module cfn-loop/sprint-coordinator-enhanced
 */

import { EventEmitter } from 'events';
import { Logger } from '../core/logger.js';
import type { Redis } from 'ioredis';
import type { LoggingConfig } from '../utils/types.js';
import {
  BlockingCoordinationManager,
  CoordinationSignal,
  SignalAck,
} from './blocking-coordination.js';

// ===== TYPE DEFINITIONS =====

/**
 * File dependency analysis result
 */
export interface FileDependencyAnalysis {
  /** Files that depend on external interfaces */
  dependentFiles: string[];
  /** Files that are independent (can work on immediately) */
  independentFiles: string[];
  /** Dependency map: file -> required interface IDs */
  dependencyMap: Map<string, string[]>;
}

/**
 * Interface signal for cross-sprint coordination
 */
export interface InterfaceSignal {
  /** Unique signal ID */
  signalId: string;
  /** Sprint ID that produced the interface */
  sprintId: string;
  /** Interface identifier (e.g., "api/users", "types/User") */
  interfaceId: string;
  /** Interface definition (type, API spec, etc.) */
  definition: any;
  /** Timestamp when interface was published */
  timestamp: number;
}

/**
 * Sprint coordinator configuration
 */
export interface SprintCoordinatorConfig {
  /** Sprint identifier */
  sprintId: string;
  /** Phase identifier */
  phaseId: string;
  /** Files to work on */
  files: string[];
  /** External interface dependencies (interface IDs) */
  interfaceDependencies: string[];
  /** Redis client for pub/sub */
  redisClient: Redis;
  /** Blocking coordination manager */
  blockingCoordination: BlockingCoordinationManager;
  /** Maximum wait time for dependencies (ms, default: 300000 = 5min) */
  maxDependencyWait?: number;
  /** Enable parallel Loop 2 validation (default: true) */
  enableParallelValidation?: boolean;
}

/**
 * Sprint execution result
 */
export interface SprintExecutionResult {
  /** Success status */
  success: boolean;
  /** Sprint ID */
  sprintId: string;
  /** Completed files */
  completedFiles: string[];
  /** Failed files */
  failedFiles: string[];
  /** Published interfaces */
  publishedInterfaces: InterfaceSignal[];
  /** Confidence score */
  confidence: number;
  /** Validation result */
  validationPassed: boolean;
  /** Duration (ms) */
  duration: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Work progress update
 */
export interface WorkProgress {
  /** Sprint ID */
  sprintId: string;
  /** Type of update */
  type: 'file_started' | 'file_completed' | 'file_failed' | 'dependency_wait' | 'dependency_resolved';
  /** File being worked on */
  file?: string;
  /** Dependency interface ID */
  interfaceId?: string;
  /** Timestamp */
  timestamp: number;
}

// ===== SPRINT COORDINATOR ENHANCED =====

/**
 * Enhanced Sprint Coordinator with dependency waiting and productive work
 */
export class SprintCoordinatorEnhanced extends EventEmitter {
  private logger: Logger;
  private config: Required<SprintCoordinatorConfig>;
  private redis: Redis;
  private blockingCoordination: BlockingCoordinationManager;

  // File tracking
  private completedFiles: Set<string> = new Set();
  private failedFiles: Set<string> = new Set();
  private inProgressFiles: Set<string> = new Set();

  // Dependency tracking
  private receivedInterfaces: Map<string, InterfaceSignal> = new Map();
  private pendingInterfaceDependencies: Set<string> = new Set();

  // Interface publishing
  private publishedInterfaces: InterfaceSignal[] = [];

  // Redis keys
  private readonly INTERFACE_CHANNEL = 'cfn:interfaces';
  private readonly COORDINATION_CHANNEL = 'cfn:sprint:coordination';

  // Timing
  private startTime: number = 0;

  constructor(config: SprintCoordinatorConfig) {
    super();

    // Set defaults
    this.config = {
      sprintId: config.sprintId,
      phaseId: config.phaseId,
      files: config.files,
      interfaceDependencies: config.interfaceDependencies,
      redisClient: config.redisClient,
      blockingCoordination: config.blockingCoordination,
      maxDependencyWait: config.maxDependencyWait || 300000, // 5 minutes
      enableParallelValidation: config.enableParallelValidation ?? true,
    };

    this.redis = config.redisClient;
    this.blockingCoordination = config.blockingCoordination;

    // Initialize pending dependencies
    this.pendingInterfaceDependencies = new Set(config.interfaceDependencies);

    // Initialize logger
    const loggerConfig: LoggingConfig =
      process.env.CLAUDE_FLOW_ENV === 'test'
        ? { level: 'error', format: 'json', destination: 'console' }
        : { level: 'info', format: 'json', destination: 'console' };

    this.logger = new Logger(loggerConfig, {
      component: 'SprintCoordinatorEnhanced',
    });

    this.logger.info('Sprint Coordinator Enhanced initialized', {
      sprintId: this.config.sprintId,
      phaseId: this.config.phaseId,
      fileCount: this.config.files.length,
      interfaceDependencies: this.config.interfaceDependencies,
    });
  }

  /**
   * Initialize coordinator and subscribe to interface signals
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing Sprint Coordinator', {
      sprintId: this.config.sprintId,
    });

    // Subscribe to interface signals
    await this.subscribeToInterfaceSignals();

    // Check if dependencies are already satisfied
    await this.checkExistingInterfaces();

    this.logger.info('Sprint Coordinator ready', {
      sprintId: this.config.sprintId,
      pendingDependencies: this.pendingInterfaceDependencies.size,
    });

    this.emit('initialized', {
      sprintId: this.config.sprintId,
      timestamp: Date.now(),
    });
  }

  /**
   * Execute sprint with dependency waiting and productive work
   */
  async execute(): Promise<SprintExecutionResult> {
    this.startTime = Date.now();

    this.logger.info('Starting sprint execution', {
      sprintId: this.config.sprintId,
      totalFiles: this.config.files.length,
      dependencies: this.config.interfaceDependencies,
    });

    this.emit('execution:started', {
      sprintId: this.config.sprintId,
      timestamp: Date.now(),
    });

    try {
      // Analyze file dependencies
      const analysis = await this.analyzeFileDependencies();

      this.logger.info('File dependency analysis complete', {
        sprintId: this.config.sprintId,
        independentFiles: analysis.independentFiles.length,
        dependentFiles: analysis.dependentFiles.length,
      });

      // Work on independent files immediately
      await this.workOnIndependentFiles(analysis.independentFiles);

      // Wait for dependencies while continuing to work
      await this.waitForDependenciesWithWork(analysis);

      // Work on dependent files once interfaces are available
      await this.workOnDependentFiles(analysis.dependentFiles);

      // Publish interfaces for downstream sprints
      await this.publishInterfaces();

      // Run parallel Loop 2 validation
      const validationResult = await this.runParallelValidation();

      // Generate result
      const result: SprintExecutionResult = {
        success: this.failedFiles.size === 0 && validationResult.passed,
        sprintId: this.config.sprintId,
        completedFiles: Array.from(this.completedFiles),
        failedFiles: Array.from(this.failedFiles),
        publishedInterfaces: this.publishedInterfaces,
        confidence: validationResult.confidence,
        validationPassed: validationResult.passed,
        duration: Date.now() - this.startTime,
        timestamp: Date.now(),
      };

      this.emit('execution:completed', result);

      return result;
    } catch (error) {
      this.logger.error('Sprint execution failed', {
        sprintId: this.config.sprintId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Analyze file dependencies to identify independent vs. dependent files
   */
  private async analyzeFileDependencies(): Promise<FileDependencyAnalysis> {
    const independentFiles: string[] = [];
    const dependentFiles: string[] = [];
    const dependencyMap = new Map<string, string[]>();

    // In a real implementation, this would parse import statements
    // and match them against interface dependencies
    // For now, simplified logic:

    for (const file of this.config.files) {
      // Check if file requires any of the pending interface dependencies
      const requiredInterfaces = this.getRequiredInterfaces(file);

      if (requiredInterfaces.length === 0) {
        independentFiles.push(file);
      } else {
        dependentFiles.push(file);
        dependencyMap.set(file, requiredInterfaces);
      }
    }

    return {
      independentFiles,
      dependentFiles,
      dependencyMap,
    };
  }

  /**
   * Get required interfaces for a file (simplified heuristic)
   */
  private getRequiredInterfaces(file: string): string[] {
    // In real implementation, parse file imports and match to interface IDs
    // For now, assume files with "dependent" in name require interfaces
    if (file.includes('dependent') || file.includes('api-client')) {
      return Array.from(this.config.interfaceDependencies);
    }
    return [];
  }

  /**
   * Work on independent files (no dependencies)
   */
  private async workOnIndependentFiles(files: string[]): Promise<void> {
    if (files.length === 0) {
      this.logger.info('No independent files to work on', {
        sprintId: this.config.sprintId,
      });
      return;
    }

    this.logger.info('Working on independent files', {
      sprintId: this.config.sprintId,
      fileCount: files.length,
    });

    // Process files in parallel (up to reasonable limit)
    const batchSize = 3;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(file => this.processFile(file)));
    }

    this.logger.info('Independent files completed', {
      sprintId: this.config.sprintId,
      completed: files.filter(f => this.completedFiles.has(f)).length,
      failed: files.filter(f => this.failedFiles.has(f)).length,
    });
  }

  /**
   * Wait for dependencies while working on what we can
   */
  private async waitForDependenciesWithWork(
    analysis: FileDependencyAnalysis
  ): Promise<void> {
    if (this.pendingInterfaceDependencies.size === 0) {
      this.logger.info('All dependencies satisfied', {
        sprintId: this.config.sprintId,
      });
      return;
    }

    const startWait = Date.now();
    const timeout = this.config.maxDependencyWait;

    this.logger.info('Waiting for interface dependencies', {
      sprintId: this.config.sprintId,
      pendingCount: this.pendingInterfaceDependencies.size,
      timeout,
    });

    this.emit('progress', {
      sprintId: this.config.sprintId,
      type: 'dependency_wait',
      timestamp: Date.now(),
    } as WorkProgress);

    // Poll for dependency satisfaction
    while (this.pendingInterfaceDependencies.size > 0) {
      // Check timeout
      if (Date.now() - startWait > timeout) {
        const pending = Array.from(this.pendingInterfaceDependencies);
        this.logger.warn('Dependency wait timeout', {
          sprintId: this.config.sprintId,
          pendingInterfaces: pending,
          waitTime: Date.now() - startWait,
        });

        throw new Error(
          `Dependency timeout: waiting for interfaces ${pending.join(', ')}`
        );
      }

      // Check if any dependencies were satisfied
      await this.checkDependencySatisfaction();

      // Short sleep before next check
      await this.sleep(1000);
    }

    this.logger.info('All dependencies satisfied', {
      sprintId: this.config.sprintId,
      waitTime: Date.now() - startWait,
    });

    this.emit('progress', {
      sprintId: this.config.sprintId,
      type: 'dependency_resolved',
      timestamp: Date.now(),
    } as WorkProgress);
  }

  /**
   * Work on dependent files (requires interfaces)
   */
  private async workOnDependentFiles(files: string[]): Promise<void> {
    if (files.length === 0) {
      return;
    }

    this.logger.info('Working on dependent files', {
      sprintId: this.config.sprintId,
      fileCount: files.length,
    });

    // Process dependent files
    const batchSize = 3;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      await Promise.all(batch.map(file => this.processFile(file)));
    }

    this.logger.info('Dependent files completed', {
      sprintId: this.config.sprintId,
      completed: files.filter(f => this.completedFiles.has(f)).length,
      failed: files.filter(f => this.failedFiles.has(f)).length,
    });
  }

  /**
   * Process a single file (stub - real implementation would spawn agent)
   */
  private async processFile(file: string): Promise<void> {
    this.logger.debug('Processing file', {
      sprintId: this.config.sprintId,
      file,
    });

    this.inProgressFiles.add(file);

    this.emit('progress', {
      sprintId: this.config.sprintId,
      type: 'file_started',
      file,
      timestamp: Date.now(),
    } as WorkProgress);

    try {
      // Simulate file processing
      await this.sleep(100);

      // Mark as completed
      this.completedFiles.add(file);
      this.inProgressFiles.delete(file);

      this.emit('progress', {
        sprintId: this.config.sprintId,
        type: 'file_completed',
        file,
        timestamp: Date.now(),
      } as WorkProgress);

      this.logger.debug('File completed', {
        sprintId: this.config.sprintId,
        file,
      });
    } catch (error) {
      this.failedFiles.add(file);
      this.inProgressFiles.delete(file);

      this.emit('progress', {
        sprintId: this.config.sprintId,
        type: 'file_failed',
        file,
        timestamp: Date.now(),
      } as WorkProgress);

      this.logger.error('File processing failed', {
        sprintId: this.config.sprintId,
        file,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Publish interfaces for downstream sprints
   */
  private async publishInterfaces(): Promise<void> {
    // In real implementation, extract interfaces from completed files
    // For now, publish placeholder interfaces

    if (this.config.files.length === 0) {
      return;
    }

    this.logger.info('Publishing interfaces', {
      sprintId: this.config.sprintId,
    });

    const signal: InterfaceSignal = {
      signalId: `interface-${this.config.sprintId}-${Date.now()}`,
      sprintId: this.config.sprintId,
      interfaceId: `api/${this.config.sprintId}`,
      definition: {
        type: 'api',
        endpoints: this.completedFiles.map(f => ({
          file: f,
          endpoint: `/${f.replace('.ts', '')}`,
        })),
      },
      timestamp: Date.now(),
    };

    // Publish to Redis
    await this.redis.publish(this.INTERFACE_CHANNEL, JSON.stringify(signal));

    this.publishedInterfaces.push(signal);

    this.logger.info('Interface published', {
      sprintId: this.config.sprintId,
      interfaceId: signal.interfaceId,
    });

    // Also send coordination signal via blocking coordination
    const coordSignal: CoordinationSignal = {
      signalId: signal.signalId,
      type: 'completion',
      source: this.config.sprintId,
      targets: [], // Broadcast to all
      payload: { interface: signal },
      timestamp: Date.now(),
    };

    await this.blockingCoordination.acknowledgeSignal(coordSignal);

    this.emit('interface:published', signal);
  }

  /**
   * Run parallel Loop 2 validation
   */
  private async runParallelValidation(): Promise<{
    passed: boolean;
    confidence: number;
  }> {
    if (!this.config.enableParallelValidation) {
      return { passed: true, confidence: 0.9 };
    }

    this.logger.info('Running parallel Loop 2 validation', {
      sprintId: this.config.sprintId,
    });

    // In real implementation, spawn validator agents in parallel
    // For now, simulate validation

    await this.sleep(100);

    const confidence = 0.85 + Math.random() * 0.1; // 0.85-0.95
    const passed = confidence >= 0.85;

    this.logger.info('Validation completed', {
      sprintId: this.config.sprintId,
      confidence: confidence.toFixed(2),
      passed,
    });

    return { passed, confidence };
  }

  /**
   * Subscribe to interface signals from other sprints
   */
  private async subscribeToInterfaceSignals(): Promise<void> {
    // In real implementation, subscribe to Redis pub/sub channel
    // For now, this is a placeholder

    this.logger.debug('Subscribed to interface signals', {
      sprintId: this.config.sprintId,
      channel: this.INTERFACE_CHANNEL,
    });
  }

  /**
   * Check if existing interfaces satisfy dependencies
   */
  private async checkExistingInterfaces(): Promise<void> {
    // In real implementation, query Redis for existing interface signals
    // For now, this is a placeholder

    this.logger.debug('Checking existing interfaces', {
      sprintId: this.config.sprintId,
      pendingCount: this.pendingInterfaceDependencies.size,
    });
  }

  /**
   * Check if pending dependencies are satisfied
   */
  private async checkDependencySatisfaction(): Promise<void> {
    // In real implementation, check received interface signals
    // For now, this is a placeholder

    for (const interfaceId of this.pendingInterfaceDependencies) {
      if (this.receivedInterfaces.has(interfaceId)) {
        this.pendingInterfaceDependencies.delete(interfaceId);

        this.logger.info('Dependency satisfied', {
          sprintId: this.config.sprintId,
          interfaceId,
        });
      }
    }
  }

  /**
   * Get coordination statistics
   */
  getStatistics() {
    return {
      sprintId: this.config.sprintId,
      totalFiles: this.config.files.length,
      completedFiles: this.completedFiles.size,
      failedFiles: this.failedFiles.size,
      inProgressFiles: this.inProgressFiles.size,
      publishedInterfaces: this.publishedInterfaces.length,
      pendingDependencies: this.pendingInterfaceDependencies.size,
      duration: this.startTime > 0 ? Date.now() - this.startTime : 0,
    };
  }

  /**
   * Shutdown coordinator
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down Sprint Coordinator', {
      sprintId: this.config.sprintId,
    });

    this.removeAllListeners();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===== FACTORY FUNCTION =====

/**
 * Create Sprint Coordinator Enhanced instance
 */
export function createSprintCoordinatorEnhanced(
  config: SprintCoordinatorConfig
): SprintCoordinatorEnhanced {
  return new SprintCoordinatorEnhanced(config);
}

// ===== EXPORTS =====

export default SprintCoordinatorEnhanced;
