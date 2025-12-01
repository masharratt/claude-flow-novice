/**
 * Task Analyzer
 *
 * Analyzes task complexity to determine optimal agent configuration.
 *
 * Migrated from:
 * - analyze-task-complexity.sh (277 lines)
 */

import type {
  TaskId,
  Logger
} from './types';
import {
  CoordinationError,
  CoordinationErrorType,
  isValidTaskId
} from './types';
import { RedisCoordinator } from './redis-client';

export type DifficultyLevel = 'simple' | 'standard' | 'complex' | 'enterprise';

export interface ComplexityAnalysis {
  taskId?: TaskId;
  taskDescription: string;
  complexityScore: number;
  difficulty: DifficultyLevel;
  domains: string[];
  suggestedAgents: {
    loop3Count: number;
    loop2Count: number;
    estimatedDurationMinutes: number;
  };
  reasoning: string;
  timestamp: string;
}

export class TaskAnalyzer {
  constructor(
    private redis: RedisCoordinator,
    private logger: Logger
  ) {}

  /**
   * Analyze task complexity and suggest agent configuration
   */
  analyzeComplexity(
    taskDescription: string,
    difficulty?: DifficultyLevel
  ): ComplexityAnalysis {
    if (!taskDescription || taskDescription.trim().length === 0) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        'Task description cannot be empty'
      );
    }

    let complexityScore = 0;
    const detectedDomains: Set<string> = new Set();
    let reasoning = '';

    const lowerDescription = taskDescription.toLowerCase();

    // 1. Word count analysis
    const wordCount = taskDescription.split(/\s+/).length;
    let wordScore = 0;

    if (wordCount < 5) {
      wordScore = 1;
    } else if (wordCount < 10) {
      wordScore = 2;
    } else if (wordCount < 20) {
      wordScore = 3;
    } else {
      wordScore = 4;
    }

    complexityScore += wordScore;

    // 2. Domain detection
    const domainPatterns: Record<string, RegExp> = {
      frontend: /react|frontend|ui|component|dashboard|vue|angular|html|css/i,
      backend: /api|backend|server|endpoint|rest|graphql|service/i,
      database: /database|db|sql|postgres|mongo|redis|cache/i,
      infrastructure: /deploy|infra|docker|k8s|kubernetes|aws|cloud|gcp|azure/i,
      security: /auth|security|encrypt|permission|rbac|oauth|jwt|ssl/i,
      testing: /test|unit|integration|e2e|coverage|mock|stub/i,
      devops: /ci|cd|pipeline|jenkins|github|gitlab|build|release/i,
      machine_learning: /ml|ai|model|predict|train|neural|algorithm/i,
      performance: /performance|optimize|cache|speed|latency|throughput/i,
      migration: /migrate|upgrade|refactor|legacy|deprecat/i
    };

    for (const [domain, pattern] of Object.entries(domainPatterns)) {
      if (pattern.test(lowerDescription)) {
        detectedDomains.add(domain);
      }
    }

    const domainCount = detectedDomains.size;
    complexityScore += Math.min(domainCount * 2, 10);

    // 3. Difficulty keywords
    const difficultyKeywords: Record<DifficultyLevel, RegExp> = {
      simple: /simple|basic|easy|trivial|straightforward|minor|patch/i,
      standard: /implement|add|create|build|update|modify|fix/i,
      complex: /complex|sophisticated|intricate|critical|major|rewrite|redesign/i,
      enterprise: /enterprise|scalability|distributed|fault.?tolerant|multi.?tenant|compliance/i
    };

    // 4. Complexity phrases
    const complexPhrases: Record<string, number> = {
      'multiple components': 3,
      'distributed system': 4,
      'real-time': 2,
      'batch process': 1,
      'high performance': 3,
      'high availability': 3,
      'disaster recovery': 3,
      'zero downtime': 3,
      'multi-region': 4,
      'async': 2
    };

    for (const [phrase, score] of Object.entries(complexPhrases)) {
      if (lowerDescription.includes(phrase)) {
        complexityScore += score;
      }
    }

    // Cap score at 20
    complexityScore = Math.min(complexityScore, 20);

    // 5. Determine difficulty level
    let finalDifficulty: DifficultyLevel = difficulty || 'standard';

    if (!difficulty) {
      if (complexityScore <= 4) {
        finalDifficulty = 'simple';
      } else if (complexityScore <= 9) {
        finalDifficulty = 'standard';
      } else if (complexityScore <= 12) {
        finalDifficulty = 'complex';
      } else {
        finalDifficulty = 'enterprise';
      }
    }

    // 6. Suggest agent counts and duration
    const agentConfig = this.suggestAgentConfiguration(
      finalDifficulty,
      domainCount,
      wordCount
    );

    // 7. Build reasoning
    const reasons: string[] = [];

    if (domainCount > 1) {
      reasons.push(`Multi-domain task (${Array.from(detectedDomains).join(', ')})`);
    }

    if (wordCount > 20) {
      reasons.push('Long description suggests complex scope');
    }

    if (complexityScore >= 10) {
      reasons.push('High complexity score indicates sophisticated implementation');
    }

    if (complexPhrases[Object.keys(complexPhrases).find(phrase => lowerDescription.includes(phrase)) as string]) {
      reasons.push('Contains complex architectural patterns');
    }

    reasoning = reasons.length > 0
      ? reasons.join('; ')
      : `Determined to be ${finalDifficulty} complexity`;

    const analysis: ComplexityAnalysis = {
      taskDescription,
      complexityScore,
      difficulty: finalDifficulty,
      domains: Array.from(detectedDomains),
      suggestedAgents: agentConfig,
      reasoning,
      timestamp: new Date().toISOString()
    };

    this.logger.info(
      `📊 Task Analysis: ${finalDifficulty} (score: ${complexityScore}/20), ` +
      `Domains: ${Array.from(detectedDomains).join(', ')} or 'none'}, ` +
      `Suggested: ${agentConfig.loop3Count} Loop3 + ${agentConfig.loop2Count} Loop2 agents`
    );

    return analysis;
  }

  /**
   * Suggest agent counts based on difficulty and domains
   */
  suggestAgentConfiguration(
    difficulty: DifficultyLevel,
    domainCount: number,
    wordCount: number
  ): {
    loop3Count: number;
    loop2Count: number;
    estimatedDurationMinutes: number;
  } {
    let loop3Count = 1;
    let loop2Count = 1;
    let duration = 5;

    // Base counts by difficulty
    switch (difficulty) {
      case 'simple':
        loop3Count = 1;
        loop2Count = 1;
        duration = 5;
        break;
      case 'standard':
        loop3Count = 2;
        loop2Count = 2;
        duration = 15;
        break;
      case 'complex':
        loop3Count = 3;
        loop2Count = 3;
        duration = 30;
        break;
      case 'enterprise':
        loop3Count = 5;
        loop2Count = 4;
        duration = 60;
        break;
    }

    // Adjust for domain count
    if (domainCount > 1) {
      loop3Count = Math.min(loop3Count + domainCount - 1, 7);
      loop2Count = Math.min(loop2Count + 1, 5);
    }

    // Adjust for description length
    if (wordCount > 50) {
      duration += 15;
    }

    return {
      loop3Count,
      loop2Count,
      estimatedDurationMinutes: duration
    };
  }

  /**
   * Calculate priority/score for task scheduling
   */
  calculatePriority(analysis: ComplexityAnalysis): number {
    // Higher complexity = higher priority
    const baseScore = analysis.complexityScore;

    // Boost for specific domain combinations
    const domainBoosts: Record<string, number> = {
      'security': 2,
      'infrastructure': 1.5,
      'machine_learning': 1.5,
      'database': 1
    };

    let boost = 0;
    for (const domain of analysis.domains) {
      boost += domainBoosts[domain] || 0;
    }

    const priority = baseScore + boost;

    return priority;
  }

  /**
   * Store analysis in Redis
   *
   * In Task Mode: Logs and returns gracefully
   * In CLI Mode: Stores in Redis
   */
  async storeAnalysis(
    taskId: TaskId,
    analysis: ComplexityAnalysis
  ): Promise<void> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: Task analysis not stored (no Redis)');
      return;
    }

    // CLI Mode: Store in Redis
    const key = `swarm:${taskId}:analysis`;

    try {
      const data: Record<string, string> = {
        taskDescription: analysis.taskDescription,
        complexityScore: String(analysis.complexityScore),
        difficulty: analysis.difficulty,
        domains: JSON.stringify(analysis.domains),
        loop3Count: String(analysis.suggestedAgents.loop3Count),
        loop2Count: String(analysis.suggestedAgents.loop2Count),
        estimatedDuration: String(analysis.suggestedAgents.estimatedDurationMinutes),
        reasoning: analysis.reasoning,
        timestamp: analysis.timestamp
      };

      await this.redis.hset(key, ...Object.entries(data).flat());

      // Set TTL (24 hours)
      await this.redis.expire(key, 86400);

      this.logger.info(`✅ Task analysis stored for: ${taskId}`);
    } catch (error) {
      this.logger.error('Failed to store task analysis', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to store task analysis: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get stored analysis from Redis
   */
  async getAnalysis(taskId: TaskId): Promise<ComplexityAnalysis | null> {
    // Validate input
    if (!isValidTaskId(taskId)) {
      throw new CoordinationError(
        CoordinationErrorType.VALIDATION_ERROR,
        `Invalid task ID: ${taskId}`
      );
    }

    // Graceful no-op in Task Mode
    if (!this.redis.canUseRedis) {
      this.logger.info('Task Mode: No task analysis available in Redis');
      return null;
    }

    // CLI Mode: Retrieve from Redis
    const key = `swarm:${taskId}:analysis`;

    try {
      const data = await this.redis.hgetall(key);

      if (!data || Object.keys(data).length === 0) {
        this.logger.warn(`No task analysis found: ${taskId}`);
        return null;
      }

      const analysis: ComplexityAnalysis = {
        taskId,
        taskDescription: data.taskDescription || '',
        complexityScore: parseFloat(data.complexityScore || '0'),
        difficulty: (data.difficulty as DifficultyLevel) || 'standard',
        domains: data.domains ? JSON.parse(data.domains) : [],
        suggestedAgents: {
          loop3Count: parseInt(data.loop3Count || '1', 10),
          loop2Count: parseInt(data.loop2Count || '1', 10),
          estimatedDurationMinutes: parseInt(data.estimatedDuration || '15', 10)
        },
        reasoning: data.reasoning || '',
        timestamp: data.timestamp || new Date().toISOString()
      };

      return analysis;
    } catch (error) {
      this.logger.error('Failed to get task analysis', error as Error);
      throw new CoordinationError(
        CoordinationErrorType.REDIS_UNAVAILABLE,
        `Failed to retrieve task analysis: ${(error as Error).message}`
      );
    }
  }

  /**
   * Suggest execution mode based on analysis
   */
  suggestMode(analysis: ComplexityAnalysis): 'mvp' | 'standard' | 'enterprise' {
    // Map difficulty to execution mode
    const modeMap: Record<DifficultyLevel, 'mvp' | 'standard' | 'enterprise'> = {
      simple: 'mvp',
      standard: 'standard',
      complex: 'standard',
      enterprise: 'enterprise'
    };

    return modeMap[analysis.difficulty];
  }
}
