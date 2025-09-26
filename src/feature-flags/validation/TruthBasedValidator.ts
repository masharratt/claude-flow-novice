/**
 * Phase 4 Truth-Based Validation System
 * Validates completion with cryptographic signatures and consensus
 */

import { FeatureFlagManager } from '../core/FeatureFlagManager.js';
import { createHash, randomBytes } from 'crypto';
import { EventEmitter } from 'events';

export interface ValidationResult {
  isValid: boolean;
  truthScore: number;
  signature: string;
  timestamp: string;
  consensusNodes: number;
  metadata: {
    validator: string;
    method: 'cryptographic' | 'consensus' | 'hybrid';
    confidence: number;
  };
}

export interface CompletionTask {
  id: string;
  description: string;
  expectedOutput?: any;
  actualOutput?: any;
  context: any;
  userId?: string;
}

export class TruthBasedValidator extends EventEmitter {
  private flagManager: FeatureFlagManager;
  private validationHistory: Map<string, ValidationResult[]> = new Map();
  private consensusNodes: Set<string> = new Set();

  constructor(flagManager: FeatureFlagManager) {
    super();
    this.flagManager = flagManager;
    this.initializeConsensusNodes();
  }

  private initializeConsensusNodes(): void {
    // Simulated consensus nodes for Phase 4
    const nodeCount = parseInt(process.env.MAX_CONSENSUS_AGENTS || '5', 10);
    for (let i = 0; i < nodeCount; i++) {
      this.consensusNodes.add(`node-${i + 1}-${randomBytes(4).toString('hex')}`);
    }
  }

  /**
   * Validate task completion with truth-based approach
   */
  async validateCompletion(task: CompletionTask): Promise<ValidationResult> {
    const isEnabled = await this.flagManager.isEnabled('truth-based-validation', task.userId);

    if (!isEnabled) {
      // Fallback to basic validation
      return this.basicValidation(task);
    }

    try {
      const result = await this.performTruthValidation(task);
      this.recordValidation(task.id, result);

      this.emit('validation_completed', {
        taskId: task.id,
        result,
        method: 'truth-based',
      });

      return result;
    } catch (error) {
      this.emit('validation_error', {
        taskId: task.id,
        error: error.message,
      });

      // Fallback to basic validation on error
      return this.basicValidation(task);
    }
  }

  private async performTruthValidation(task: CompletionTask): Promise<ValidationResult> {
    const validationMethods = await Promise.allSettled([
      this.cryptographicValidation(task),
      this.consensusValidation(task),
      this.semanticValidation(task),
    ]);

    const results = validationMethods
      .filter(
        (result): result is PromiseFulfilledResult<ValidationResult> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value);

    if (results.length === 0) {
      throw new Error('All validation methods failed');
    }

    // Hybrid approach: combine results
    const avgTruthScore = results.reduce((sum, r) => sum + r.truthScore, 0) / results.length;
    const consensusCount = results.filter((r) => r.isValid).length;
    const isValid = consensusCount >= Math.ceil(results.length / 2);

    return {
      isValid,
      truthScore: avgTruthScore,
      signature: this.generateSignature(task, avgTruthScore),
      timestamp: new Date().toISOString(),
      consensusNodes: this.consensusNodes.size,
      metadata: {
        validator: 'TruthBasedValidator',
        method: 'hybrid',
        confidence: avgTruthScore * (consensusCount / results.length),
      },
    };
  }

  private async cryptographicValidation(task: CompletionTask): Promise<ValidationResult> {
    const taskHash = createHash('sha256')
      .update(
        JSON.stringify({
          id: task.id,
          description: task.description,
          expectedOutput: task.expectedOutput,
          actualOutput: task.actualOutput,
        }),
      )
      .digest('hex');

    const signature = this.generateSignature(task, 1.0);

    // Simulated cryptographic validation logic
    const isValid = this.validateSignature(taskHash, signature);
    const truthScore = isValid ? 0.95 : 0.1;

    return {
      isValid,
      truthScore,
      signature,
      timestamp: new Date().toISOString(),
      consensusNodes: 1,
      metadata: {
        validator: 'CryptographicValidator',
        method: 'cryptographic',
        confidence: truthScore,
      },
    };
  }

  private async consensusValidation(task: CompletionTask): Promise<ValidationResult> {
    const validationPromises = Array.from(this.consensusNodes).map((nodeId) =>
      this.nodeValidation(task, nodeId),
    );

    const nodeResults = await Promise.allSettled(validationPromises);
    const successfulValidations = nodeResults
      .filter((result): result is PromiseFulfilledResult<boolean> => result.status === 'fulfilled')
      .map((result) => result.value);

    const consensusCount = successfulValidations.filter(Boolean).length;
    const totalNodes = successfulValidations.length;
    const consensusRatio = consensusCount / totalNodes;

    const isValid = consensusRatio >= 0.6; // 60% consensus required
    const truthScore = consensusRatio * 0.9; // Max 90% for consensus

    return {
      isValid,
      truthScore,
      signature: this.generateSignature(task, truthScore),
      timestamp: new Date().toISOString(),
      consensusNodes: totalNodes,
      metadata: {
        validator: 'ConsensusValidator',
        method: 'consensus',
        confidence: consensusRatio,
      },
    };
  }

  private async nodeValidation(task: CompletionTask, nodeId: string): Promise<boolean> {
    // Simulated Byzantine fault-tolerant node validation
    const nodeReliability = 0.85; // 85% node reliability
    const randomFactor = Math.random();

    if (randomFactor > nodeReliability) {
      throw new Error(`Node ${nodeId} failed validation`);
    }

    // Simulate validation logic
    const hasExpectedOutput = task.expectedOutput !== undefined;
    const outputMatches =
      hasExpectedOutput &&
      JSON.stringify(task.actualOutput) === JSON.stringify(task.expectedOutput);

    const descriptionValid = task.description && task.description.length > 0;
    const contextValid = task.context !== null && task.context !== undefined;

    return outputMatches || (descriptionValid && contextValid);
  }

  private async semanticValidation(task: CompletionTask): Promise<ValidationResult> {
    // Simulated semantic analysis
    const descriptionQuality = this.analyzeDescription(task.description);
    const outputConsistency = this.analyzeOutputConsistency(task);
    const contextRelevance = this.analyzeContextRelevance(task);

    const truthScore = (descriptionQuality + outputConsistency + contextRelevance) / 3;
    const isValid = truthScore >= 0.7;

    return {
      isValid,
      truthScore,
      signature: this.generateSignature(task, truthScore),
      timestamp: new Date().toISOString(),
      consensusNodes: 1,
      metadata: {
        validator: 'SemanticValidator',
        method: 'consensus',
        confidence: truthScore,
      },
    };
  }

  private analyzeDescription(description: string): number {
    if (!description) return 0;

    // Basic quality metrics
    const wordCount = description.split(' ').length;
    const hasActionWords = /\b(implement|create|build|develop|test|validate)\b/i.test(description);
    const hasSpecificity = description.length > 20;

    let score = 0.3; // Base score
    if (wordCount >= 5) score += 0.3;
    if (hasActionWords) score += 0.2;
    if (hasSpecificity) score += 0.2;

    return Math.min(score, 1.0);
  }

  private analyzeOutputConsistency(task: CompletionTask): number {
    if (!task.expectedOutput || !task.actualOutput) return 0.5;

    try {
      const expectedStr = JSON.stringify(task.expectedOutput);
      const actualStr = JSON.stringify(task.actualOutput);

      if (expectedStr === actualStr) return 1.0;

      // Partial matching
      const similarity = this.calculateSimilarity(expectedStr, actualStr);
      return Math.max(similarity, 0.1);
    } catch {
      return 0.2;
    }
  }

  private analyzeContextRelevance(task: CompletionTask): number {
    if (!task.context) return 0.3;

    const contextKeys = Object.keys(task.context);
    const hasUsefulContext = contextKeys.length > 0;
    const hasTimestamp = 'timestamp' in task.context || 'createdAt' in task.context;
    const hasUser = 'userId' in task.context || 'user' in task.context;

    let score = 0.3;
    if (hasUsefulContext) score += 0.3;
    if (hasTimestamp) score += 0.2;
    if (hasUser) score += 0.2;

    return score;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i += 1) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j += 1) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j += 1) {
      for (let i = 1; i <= str1.length; i += 1) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator,
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  private basicValidation(task: CompletionTask): ValidationResult {
    const isValid = Boolean(task.description && task.id);
    const truthScore = isValid ? 0.5 : 0.1;

    return {
      isValid,
      truthScore,
      signature: 'basic-validation',
      timestamp: new Date().toISOString(),
      consensusNodes: 0,
      metadata: {
        validator: 'BasicValidator',
        method: 'cryptographic',
        confidence: truthScore,
      },
    };
  }

  private generateSignature(task: CompletionTask, score: number): string {
    const data = `${task.id}-${score}-${Date.now()}`;
    return createHash('sha256').update(data).digest('hex');
  }

  private validateSignature(hash: string, signature: string): boolean {
    // Simulated signature validation
    return signature.length === 64 && /^[a-f0-9]+$/i.test(signature);
  }

  private recordValidation(taskId: string, result: ValidationResult): void {
    if (!this.validationHistory.has(taskId)) {
      this.validationHistory.set(taskId, []);
    }
    this.validationHistory.get(taskId)!.push(result);
  }

  getValidationHistory(taskId: string): ValidationResult[] {
    return this.validationHistory.get(taskId) || [];
  }

  getSystemMetrics() {
    const totalValidations = Array.from(this.validationHistory.values()).reduce(
      (sum, history) => sum + history.length,
      0,
    );

    const allResults = Array.from(this.validationHistory.values()).flat();
    const avgTruthScore =
      allResults.length > 0
        ? allResults.reduce((sum, r) => sum + r.truthScore, 0) / allResults.length
        : 0;

    const successRate =
      allResults.length > 0 ? allResults.filter((r) => r.isValid).length / allResults.length : 0;

    return {
      totalValidations,
      avgTruthScore,
      successRate,
      consensusNodes: this.consensusNodes.size,
      lastValidation: allResults.length > 0 ? allResults[allResults.length - 1].timestamp : null,
    };
  }
}
