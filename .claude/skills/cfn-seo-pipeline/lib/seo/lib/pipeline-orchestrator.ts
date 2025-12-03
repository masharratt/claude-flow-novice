/**
 * Pipeline Orchestrator - SEO Intelligence Integration Phase 1 Sprint 4
 *
 * @module planning/seo/lib/pipeline-orchestrator
 * @description Orchestrates the complete 14-step SEO intelligence pipeline
 */

import * as crypto from 'crypto';
import {
  PipelineTask,
  PipelineContext,
  PipelineResult,
  PipelineStep,
  PipelineOrchestratorConfig,
  PatternApplication,
} from '../types';
import { IntelligenceCurator } from './intelligence-curator';
import { PatternManager } from './pattern-manager';
import { RedisContextStore } from './redis-context-store';
import { executeStep0, Step0Config } from './steps/step-0-intelligence-preload';
import { executeStep12, Step12Config } from './steps/step-12-learning-capture';

/**
 * Pipeline Orchestrator implementation
 *
 * Orchestrates the complete 14-step SEO pipeline:
 * - Step 0: Intelligence Pre-load (NEW)
 * - Steps 1-11: Existing SEO pipeline steps (placeholder)
 * - Step 12: Learning Capture (NEW)
 */
export class PipelineOrchestrator {
  private intelligenceCurator: IntelligenceCurator;
  private patternManager: PatternManager;
  private redisContextStore: RedisContextStore;
  private config: PipelineOrchestratorConfig;

  constructor(config: PipelineOrchestratorConfig = {}) {
    this.config = config;
    this.intelligenceCurator =
      (config.intelligenceCurator as IntelligenceCurator) ||
      new IntelligenceCurator({ verbose: config.verbose });
    this.patternManager =
      (config.patternManager as PatternManager) ||
      new PatternManager({ verbose: config.verbose });
    this.redisContextStore =
      (config.redisContextStore as RedisContextStore) ||
      new RedisContextStore({ verbose: config.verbose });
  }

  /**
   * Execute the complete pipeline
   *
   * @param task - Pipeline task configuration
   * @returns Pipeline execution result
   */
  async execute(task: PipelineTask): Promise<PipelineResult> {
    const startTime = Date.now();
    const totalSteps = 14; // 0 + 1-11 + 12
    let stepsCompleted = 0;
    let patternsApplied = 0;
    let learningsCaptured = 0;

    if (this.config.verbose) {
      console.log('='.repeat(80));
      console.log('Pipeline Orchestrator - Execution Starting');
      console.log('='.repeat(80));
      console.log(`Task ID: ${task.taskId}`);
      console.log(`Target Keyword: ${task.targetKeyword}`);
      console.log(`Content Type: ${task.contentType}`);
      console.log(`Industry: ${task.industry || 'N/A'}`);
      console.log('='.repeat(80));
    }

    // Initialize pipeline context
    const context: PipelineContext = {
      task,
      intelligence: {
        competitive: [],
        serpPatterns: [],
        learnings: [],
        metadata: {
          itemsLoaded: 0,
          oldestItemAge: 0,
          executionTime: 0,
          hasFreshData: false,
        },
      },
      patternApplications: [],
      metrics: {},
    };

    try {
      // Step 0: Intelligence Pre-load
      await this.executeStep0(context);
      stepsCompleted++;

      // Steps 1-11: Existing SEO pipeline (placeholder implementation)
      for (let i = 1; i <= 11; i++) {
        await this.executeExistingStep(context, i);
        stepsCompleted++;
      }

      // Step 12: Learning Capture (success outcome)
      const step12Result = await this.executeStep12(context, 'success');
      stepsCompleted++;
      learningsCaptured = step12Result.learningsCaptured;

      // Count pattern applications
      patternsApplied = context.patternApplications.length;

      const executionTimeMs = Date.now() - startTime;

      if (this.config.verbose) {
        console.log('='.repeat(80));
        console.log('Pipeline Orchestrator - Execution Complete');
        console.log('='.repeat(80));
        console.log(`Status: SUCCESS`);
        console.log(`Steps Completed: ${stepsCompleted}/${totalSteps}`);
        console.log(`Patterns Applied: ${patternsApplied}`);
        console.log(`Learnings Captured: ${learningsCaptured}`);
        console.log(`Execution Time: ${executionTimeMs}ms`);
        console.log('='.repeat(80));
      }

      return {
        taskId: task.taskId,
        status: 'success',
        stepsCompleted,
        totalSteps,
        patternsApplied,
        learningsCaptured,
        executionTimeMs,
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.config.verbose) {
        console.error('='.repeat(80));
        console.error('Pipeline Orchestrator - Execution Failed');
        console.error('='.repeat(80));
        console.error(`Error: ${errorMessage}`);
        console.error(`Steps Completed: ${stepsCompleted}/${totalSteps}`);
        console.error('='.repeat(80));
      }

      // Attempt to capture learning even on failure
      try {
        const step12Result = await this.executeStep12(context, 'failure');
        learningsCaptured = step12Result.learningsCaptured;
      } catch (captureError) {
        if (this.config.verbose) {
          console.error('[Pipeline] Failed to capture learning on error:', captureError);
        }
      }

      return {
        taskId: task.taskId,
        status: 'failure',
        stepsCompleted,
        totalSteps,
        patternsApplied: context.patternApplications.length,
        learningsCaptured,
        executionTimeMs,
        error: {
          step: `step-${stepsCompleted}`,
          message: errorMessage,
        },
      };
    }
  }

  /**
   * Execute Step 0: Intelligence Pre-load
   */
  private async executeStep0(context: PipelineContext): Promise<void> {
    if (this.config.verbose) {
      console.log('\n[Step 0/14] Intelligence Pre-load');
      console.log('-'.repeat(80));
    }

    const step0Config: Step0Config = {
      intelligenceCurator: this.intelligenceCurator,
      patternManager: this.patternManager,
      redisContextStore: this.redisContextStore,
      verbose: this.config.verbose,
    };

    const result = await executeStep0(context, step0Config);

    if (this.config.verbose) {
      console.log(`  Intelligence Items: ${result.intelligenceItemsLoaded}`);
      console.log(`  Patterns Loaded: ${result.patternsLoaded}`);
      console.log(`  High-Risk Patterns: ${result.highRiskPatterns}`);
      console.log(`  Execution Time: ${result.executionTime}ms`);
    }
  }

  /**
   * Execute existing pipeline step (placeholder)
   *
   * This is a placeholder for the existing 11 steps of the SEO pipeline.
   * In production, these would call the actual pipeline step implementations.
   */
  private async executeExistingStep(context: PipelineContext, stepNumber: number): Promise<void> {
    const stepNames = [
      'Keyword Research',
      'Competitor Analysis',
      'Content Planning',
      'Content Outline',
      'Content Writing',
      'SEO Optimization',
      'Technical SEO',
      'Link Building Strategy',
      'Content Publishing',
      'Performance Monitoring',
      'Continuous Improvement',
    ];

    const stepName = stepNames[stepNumber - 1] || `Step ${stepNumber}`;

    if (this.config.verbose) {
      console.log(`\n[Step ${stepNumber}/14] ${stepName}`);
      console.log('-'.repeat(80));
    }

    // Simulate step execution
    const executionTime = 100 + Math.random() * 200; // 100-300ms
    await new Promise((resolve) => setTimeout(resolve, executionTime));

    // Track metrics
    context.metrics[`step-${stepNumber}-${stepName.toLowerCase().replace(/\s+/g, '-')}`] =
      executionTime;

    // Simulate pattern application (20% chance per step)
    if (Math.random() < 0.2 && context.intelligence.metadata.itemsLoaded > 0) {
      const mockApplication: PatternApplication = {
        patternId: `pattern-${stepNumber}-${Math.floor(Math.random() * 100)}`,
        appliedAt: `step-${stepNumber}`,
        outcome: Math.random() < 0.8 ? 'success' : 'failure',
        metrics: {
          executionTime,
          confidence: 0.7 + Math.random() * 0.3,
        },
      };
      context.patternApplications.push(mockApplication);

      if (this.config.verbose) {
        console.log(
          `  Pattern Applied: ${mockApplication.patternId} (${mockApplication.outcome})`
        );
      }
    }

    if (this.config.verbose) {
      console.log(`  Execution Time: ${executionTime.toFixed(0)}ms`);
    }
  }

  /**
   * Execute Step 12: Learning Capture
   */
  private async executeStep12(
    context: PipelineContext,
    outcome: 'success' | 'failure'
  ): Promise<any> {
    if (this.config.verbose) {
      console.log('\n[Step 12/14] Learning Capture');
      console.log('-'.repeat(80));
    }

    const step12Config: Step12Config = {
      intelligenceCurator: this.intelligenceCurator,
      patternManager: this.patternManager,
      redisContextStore: this.redisContextStore,
      verbose: this.config.verbose,
    };

    const result = await executeStep12(context, step12Config, outcome);

    if (this.config.verbose) {
      console.log(`  Learnings Captured: ${result.learningsCaptured}`);
      console.log(`  Patterns Updated: ${result.patternsUpdated}`);
      console.log(`  Patterns Promoted: ${result.patternsPromoted}`);
      console.log(`  Patterns Archived: ${result.patternsArchived}`);
      console.log(`  Execution Time: ${result.executionTime}ms`);
    }

    return result;
  }

  /**
   * Create a new pipeline task
   *
   * @param targetKeyword - Target keyword for SEO content
   * @param contentType - Type of content to create
   * @param options - Additional task options
   * @returns Pipeline task configuration
   */
  static createTask(
    targetKeyword: string,
    contentType: string,
    options: {
      industry?: string;
      competitorDomains?: string[];
    } = {}
  ): PipelineTask {
    return {
      taskId: crypto.randomBytes(8).toString('hex'),
      targetKeyword,
      contentType,
      industry: options.industry,
      competitorDomains: options.competitorDomains,
      createdAt: new Date(),
    };
  }

  /**
   * Validate pipeline task configuration
   *
   * @param task - Pipeline task to validate
   * @returns Validation errors (empty array if valid)
   */
  static validateTask(task: PipelineTask): string[] {
    const errors: string[] = [];

    if (!task.taskId || task.taskId.length === 0) {
      errors.push('Task ID is required');
    }

    if (!task.targetKeyword || task.targetKeyword.trim().length === 0) {
      errors.push('Target keyword is required');
    }

    if (!task.contentType || task.contentType.trim().length === 0) {
      errors.push('Content type is required');
    }

    if (task.targetKeyword && task.targetKeyword.length > 200) {
      errors.push('Target keyword must be 200 characters or less');
    }

    if (
      task.competitorDomains &&
      task.competitorDomains.some((domain) => !isValidDomain(domain))
    ) {
      errors.push('Invalid competitor domain format');
    }

    return errors;
  }
}

/**
 * Validate domain format
 */
function isValidDomain(domain: string): boolean {
  const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  return domainRegex.test(domain);
}
