/**
 * CFN Validator - Unified Validation Module
 *
 * Core validation functionality for CFN Loop system:
 * - Deliverable verification (prevents "consensus on vapor")
 * - Success criteria validation
 * - Gate threshold checking
 * - Consensus validation
 * - Vapor detection
 *
 * @module cfn-loop-validation/validator
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import {
  ExecutionMode,
  ValidationConfig,
  DeliverableValidation,
  DeliverableValidationResult,
  SuccessCriteria,
  SuccessCriteriaValidationResult,
  GateValidationResult,
  ConsensusValidationResult,
  VaporDetectionResult,
  ValidationResult,
  ValidationError,
  ConsensusOnVaporError,
} from './types';

/**
 * CFN Validator class
 */
export class CFNValidator {
  private config: ValidationConfig;
  private readonly modeThresholds = {
    mvp: 0.70,
    standard: 0.95,
    enterprise: 0.98,
  };

  constructor(config: ValidationConfig) {
    this.config = config;
  }

  /**
   * Get mode-specific threshold
   */
  getModeThreshold(mode?: ExecutionMode): number {
    const targetMode = mode || this.config.mode;
    return this.modeThresholds[targetMode];
  }

  /**
   * Validate deliverables exist and are accessible
   */
  async validateDeliverables(
    paths: string[]
  ): Promise<DeliverableValidationResult> {
    const deliverables: DeliverableValidation[] = [];
    let totalSizeBytes = 0;

    for (const filePath of paths) {
      const validation: DeliverableValidation = {
        path: filePath,
        exists: false,
      };

      try {
        // Check if file exists
        if (!fs.existsSync(filePath)) {
          deliverables.push(validation);
          continue;
        }

        const stats = fs.statSync(filePath);
        validation.exists = true;
        validation.sizeBytes = stats.size;
        validation.lastModified = stats.mtime.toISOString();
        validation.readable = true;

        totalSizeBytes += stats.size;

        // Get MIME type (basic detection)
        validation.mimeType = this.detectMimeType(filePath);
      } catch (error) {
        validation.exists = false;
        validation.error = error instanceof Error ? error.message : String(error);
        validation.readable = false;
      }

      deliverables.push(validation);
    }

    const existingFiles = deliverables.filter((d) => d.exists).length;

    return {
      deliverables,
      totalFiles: paths.length,
      existingFiles,
      missingFiles: paths.length - existingFiles,
      totalSizeBytes,
      allExist: existingFiles === paths.length,
      timestamp: Date.now(),
    };
  }

  /**
   * Check if success criteria are met
   */
  async checkSuccessCriteria(
    criteria: SuccessCriteria[]
  ): Promise<SuccessCriteriaValidationResult> {
    const results: SuccessCriteriaValidationResult['details'] = [];
    let passedCount = 0;

    for (const criterion of criteria) {
      const result: SuccessCriteriaValidationResult['details'][0] = {
        criterion,
        passed: false,
      };

      try {
        switch (criterion.type) {
          case 'file_exists':
            result.passed = await this.validateFileExists(criterion);
            break;
          case 'test_pass':
            result.passed = await this.validateTestPass(criterion);
            break;
          case 'command_output':
            result.passed = await this.validateCommandOutput(criterion);
            break;
          case 'custom':
            result.passed = await this.validateCustom(criterion);
            break;
        }

        if (result.passed) {
          passedCount++;
        }
      } catch (error) {
        result.error = error instanceof Error ? error.message : String(error);
        result.passed = false;
      }

      results.push(result);
    }

    return {
      passed: passedCount === criteria.length,
      criteria,
      passedCount,
      failedCount: criteria.length - passedCount,
      details: results,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate file exists
   */
  private async validateFileExists(criterion: SuccessCriteria): Promise<boolean> {
    if (!criterion.paths || criterion.paths.length === 0) {
      throw new ValidationError('No paths provided for file_exists criterion', 'INVALID_CRITERION');
    }

    for (const filePath of criterion.paths) {
      if (!fs.existsSync(filePath)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate test passes
   */
  private async validateTestPass(criterion: SuccessCriteria): Promise<boolean> {
    if (!criterion.command) {
      throw new ValidationError('No command provided for test_pass criterion', 'INVALID_CRITERION');
    }

    try {
      const timeout = criterion.timeout || 30000;
      execSync(criterion.command, {
        timeout,
        stdio: 'pipe',
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate command output
   */
  private async validateCommandOutput(criterion: SuccessCriteria): Promise<boolean> {
    if (!criterion.command) {
      throw new ValidationError('No command provided for command_output criterion', 'INVALID_CRITERION');
    }

    try {
      const timeout = criterion.timeout || 30000;
      const output = execSync(criterion.command, {
        timeout,
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      if (!criterion.expected) {
        return true;
      }

      return output.trim().includes(String(criterion.expected));
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate custom criterion
   */
  private async validateCustom(criterion: SuccessCriteria): Promise<boolean> {
    // Custom validation - can be extended by subclasses
    // For now, just return false unless explicitly implemented
    return false;
  }

  /**
   * Validate gate pass (simple threshold check)
   */
  async validateGatePass(
    passRate: number,
    mode?: ExecutionMode
  ): Promise<GateValidationResult> {
    const targetMode = mode || this.config.mode;
    const threshold = this.getModeThreshold(targetMode);
    const passed = passRate >= threshold;

    return {
      passed,
      passRate,
      threshold,
      mode: targetMode,
      gap: passed ? 0 : threshold - passRate,
      reason: passed
        ? `Gate PASSED: pass rate ${(passRate * 100).toFixed(2)}% >= threshold ${(threshold * 100).toFixed(2)}%`
        : `Gate FAILED: pass rate ${(passRate * 100).toFixed(2)}% < threshold ${(threshold * 100).toFixed(2)}%`,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate consensus pass
   */
  async validateConsensus(
    scores: number[],
    mode?: ExecutionMode
  ): Promise<ConsensusValidationResult> {
    if (scores.length === 0) {
      throw new ValidationError('No consensus scores provided', 'INVALID_CONSENSUS');
    }

    const targetMode = mode || this.config.mode;
    const threshold = this.getModeThreshold(targetMode);

    // Calculate average consensus score
    const consensusScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const passed = consensusScore >= threshold;

    return {
      passed,
      consensusScore,
      threshold,
      mode: targetMode,
      validatorCount: scores.length,
      scores,
      timestamp: Date.now(),
    };
  }

  /**
   * Detect consensus on vapor - prevents false completion claims
   *
   * Returns true if agent claims completion but deliverables don't exist
   */
  async detectConsensusOnVapor(
    agentOutput: string,
    expectedDeliverables: string[]
  ): Promise<VaporDetectionResult> {
    // Check if agent claims completion/success
    const claimsCompletion =
      /complete|done|finished|success|delivered|implemented|created|generated/i.test(
        agentOutput
      );

    // Validate deliverables exist
    const validation = await this.validateDeliverables(expectedDeliverables);

    const result: VaporDetectionResult = {
      detected: claimsCompletion && !validation.allExist,
      claimsCompletion,
      deliverablesMissing: !validation.allExist,
      missingDeliverables: validation.deliverables
        .filter((d) => !d.exists)
        .map((d) => d.path),
      agentOutput: agentOutput.substring(0, 500), // Truncate for privacy
      expectedDeliverables,
      confidence: this.calculateVaporConfidence(
        claimsCompletion,
        validation.missingFiles,
        expectedDeliverables.length
      ),
      timestamp: Date.now(),
    };

    return result;
  }

  /**
   * Calculate vapor detection confidence
   *
   * Higher confidence when more deliverables are missing despite completion claims
   */
  private calculateVaporConfidence(
    claimsCompletion: boolean,
    missingFileCount: number,
    totalFileCount: number
  ): number {
    if (!claimsCompletion || missingFileCount === 0) {
      return 0.0;
    }

    // Confidence increases with percentage of missing files
    const missingRatio = missingFileCount / totalFileCount;
    return Math.min(1.0, missingRatio);
  }

  /**
   * Detect MIME type from file extension
   */
  private detectMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.js': 'application/javascript',
      '.ts': 'application/typescript',
      '.json': 'application/json',
      '.html': 'text/html',
      '.css': 'text/css',
      '.md': 'text/markdown',
      '.txt': 'text/plain',
      '.sh': 'application/x-sh',
      '.py': 'text/x-python',
      '.java': 'text/x-java-source',
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Perform comprehensive validation
   */
  async performValidation(options: {
    deliverables?: string[];
    successCriteria?: SuccessCriteria[];
    passRate?: number;
    consensusScores?: number[];
    agentOutput?: string;
  }): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    const result: ValidationResult = {
      taskId: this.config.taskId,
      timestamp: Date.now(),
      mode: this.config.mode,
      passed: true,
      errors,
      warnings,
    };

    // Validate deliverables
    if (options.deliverables) {
      try {
        result.deliverables = await this.validateDeliverables(options.deliverables);
        if (!result.deliverables.allExist) {
          warnings.push(
            `${result.deliverables.missingFiles} deliverables missing`
          );
        }
      } catch (error) {
        errors.push(
          new ValidationError(
            `Deliverable validation failed: ${error}`,
            'DELIVERABLE_VALIDATION_FAILED'
          )
        );
        result.passed = false;
      }
    }

    // Validate success criteria
    if (options.successCriteria && options.successCriteria.length > 0) {
      try {
        result.successCriteria = await this.checkSuccessCriteria(
          options.successCriteria
        );
        if (!result.successCriteria.passed) {
          warnings.push(
            `${result.successCriteria.failedCount} success criteria not met`
          );
        }
      } catch (error) {
        errors.push(
          new ValidationError(
            `Success criteria validation failed: ${error}`,
            'CRITERIA_VALIDATION_FAILED'
          )
        );
        result.passed = false;
      }
    }

    // Validate gate
    if (typeof options.passRate === 'number') {
      try {
        result.gate = await this.validateGatePass(options.passRate);
        if (!result.gate.passed) {
          result.passed = false;
        }
      } catch (error) {
        errors.push(
          new ValidationError(
            `Gate validation failed: ${error}`,
            'GATE_VALIDATION_FAILED'
          )
        );
        result.passed = false;
      }
    }

    // Validate consensus
    if (options.consensusScores && options.consensusScores.length > 0) {
      try {
        result.consensus = await this.validateConsensus(
          options.consensusScores
        );
        if (!result.consensus.passed) {
          result.passed = false;
        }
      } catch (error) {
        errors.push(
          new ValidationError(
            `Consensus validation failed: ${error}`,
            'CONSENSUS_VALIDATION_FAILED'
          )
        );
        result.passed = false;
      }
    }

    // Detect vapor
    if (
      options.agentOutput &&
      options.deliverables &&
      options.deliverables.length > 0
    ) {
      try {
        result.vapor = await this.detectConsensusOnVapor(
          options.agentOutput,
          options.deliverables
        );
        if (result.vapor.detected) {
          errors.push(
            new ConsensusOnVaporError(
              'Consensus on vapor detected: agent claims completion but deliverables missing',
              {
                missingDeliverables: result.vapor.missingDeliverables,
                confidence: result.vapor.confidence,
              }
            )
          );
          result.passed = false;
        }
      } catch (error) {
        errors.push(
          new ValidationError(
            `Vapor detection failed: ${error}`,
            'VAPOR_DETECTION_FAILED'
          )
        );
      }
    }

    return result;
  }
}

export default CFNValidator;
