/**
 * Unified Validation Abstraction Layer
 * Centralizes validation logic for gate checks, consensus, and deliverables
 * Type-safe validation with comprehensive result tracking
 */

import { gateCheck as performGateCheck, Mode } from './gate-check';
import { collectConsensus, validateConsensus } from './consensus';
import { verifyDeliverables } from './deliverable-verifier';

/**
 * Unified validation result - common interface for all validation types
 */
export interface ValidationResult {
  passed: boolean;
  score: number;
  threshold: number;
  reason: string;
  metadata?: Record<string, any>;
}

/**
 * Validator interface - abstraction for different validation strategies
 */
export interface Validator {
  validate(data: any): Promise<ValidationResult>;
  name: string;
}

/**
 * Gate validator - validates test pass rates against mode thresholds
 */
export class GateValidator implements Validator {
  name = 'GateValidator';

  async validate(data: {
    passRate: number;
    threshold?: number;
    mode: Mode;
  }): Promise<ValidationResult> {
    const result = performGateCheck({
      passRate: data.passRate,
      threshold: data.threshold ?? undefined,
      mode: data.mode,
    });

    return {
      passed: result.passed,
      score: result.passRate,
      threshold: result.threshold,
      reason: result.reason,
      metadata: {
        gap: result.gap,
        mode: result.mode,
        type: 'gate',
      },
    };
  }
}

/**
 * Consensus validator - validates Loop 2 validator scores
 */
export class ConsensusValidator implements Validator {
  name = 'ConsensusValidator';

  async validate(data: {
    scores: number[];
    threshold?: number;
    mode: Mode | string;
  }): Promise<ValidationResult> {
    // Collect consensus statistics
    const consensus = collectConsensus(data.scores);

    // Validate against threshold
    const validation = validateConsensus({
      average: consensus.average,
      threshold: data.threshold ?? undefined,
      mode: data.mode,
    });

    return {
      passed: validation.passed,
      score: validation.average,
      threshold: validation.threshold,
      reason: `Consensus ${validation.passed ? 'PASSED' : 'FAILED'}: Average score ${validation.average.toFixed(4)} ${validation.passed ? '>=' : '<'} threshold ${validation.threshold.toFixed(4)} (mode: ${validation.mode})`,
      metadata: {
        gap: validation.gap,
        scoreCount: consensus.count,
        scores: consensus.scores,
        min: consensus.min,
        max: consensus.max,
        type: 'consensus',
      },
    };
  }
}

/**
 * Deliverable validator - verifies expected deliverables exist
 */
export class DeliverableValidator implements Validator {
  name = 'DeliverableValidator';

  async validate(data: {
    files: string[];
    expectedTypes?: string[];
    requireGitChanges?: boolean;
    taskType?: string;
  }): Promise<ValidationResult> {
    const result = verifyDeliverables(data);

    const reason = result.reason
      ? result.reason
      : result.verified
        ? `Deliverables VERIFIED: ${result.found.length} files found`
        : `Deliverables MISSING: ${result.missing.length} files not found`;

    return {
      passed: result.verified,
      score: result.found.length / (result.files.length || 1),
      threshold: 1.0,
      reason,
      metadata: {
        found: result.found,
        missing: result.missing,
        gitChanges: result.gitChanges,
        typeErrors: result.typeErrors,
        requiresChanges: result.requiresChanges,
        type: 'deliverable',
      },
    };
  }
}

/**
 * Composite validator - combines multiple validators with AND logic
 */
export class CompositeValidator implements Validator {
  name = 'CompositeValidator';

  constructor(private validators: Validator[]) {}

  async validate(data: Record<string, any>): Promise<ValidationResult> {
    const results: ValidationResult[] = [];

    for (const validator of this.validators) {
      const result = await validator.validate(data);
      results.push(result);
    }

    // All must pass (AND logic)
    const allPassed = results.every(r => r.passed);

    // Average score across all validators
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

    // Combine reasons
    const reasons = results.map(r => `[${r.metadata?.type || 'unknown'}] ${r.reason}`).join('\n');

    return {
      passed: allPassed,
      score: avgScore,
      threshold: 0.5, // Composite uses AND logic
      reason: `Composite validation ${allPassed ? 'PASSED' : 'FAILED'}:\n${reasons}`,
      metadata: {
        validatorResults: results.map(r => ({
          passed: r.passed,
          score: r.score,
          type: r.metadata?.type,
        })),
        totalValidators: results.length,
        passedValidators: results.filter(r => r.passed).length,
        type: 'composite',
      },
    };
  }
}

/**
 * Validator factory - creates validators based on type
 */
export class ValidatorFactory {
  static create(type: 'gate' | 'consensus' | 'deliverable'): Validator {
    switch (type) {
      case 'gate':
        return new GateValidator();
      case 'consensus':
        return new ConsensusValidator();
      case 'deliverable':
        return new DeliverableValidator();
      default:
        throw new Error(`Unknown validator type: ${type}`);
    }
  }

  static createComposite(types: ('gate' | 'consensus' | 'deliverable')[]): CompositeValidator {
    const validators = types.map(type => this.create(type));
    return new CompositeValidator(validators);
  }
}

/**
 * Validation context - encapsulates validation state and operations
 */
export class ValidationContext {
  private validators: Map<string, Validator> = new Map();

  registerValidator(name: string, validator: Validator): void {
    this.validators.set(name, validator);
  }

  async validate(validatorName: string, data: any): Promise<ValidationResult> {
    const validator = this.validators.get(validatorName);
    if (!validator) {
      throw new Error(`Validator not found: ${validatorName}`);
    }
    return validator.validate(data);
  }

  async validateAll(
    validatorNames: string[],
    data: any
  ): Promise<Map<string, ValidationResult>> {
    const results = new Map<string, ValidationResult>();

    for (const name of validatorNames) {
      const result = await this.validate(name, data);
      results.set(name, result);
    }

    return results;
  }
}

/**
 * CLI entry point for validation
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const validationType = args[0];

  (async () => {
    try {
      const data = JSON.parse(args[1] || '{}');

      let result: ValidationResult;

      switch (validationType) {
        case 'gate': {
          const validator = new GateValidator();
          result = await validator.validate(data);
          break;
        }
        case 'consensus': {
          const validator = new ConsensusValidator();
          result = await validator.validate(data);
          break;
        }
        case 'deliverable': {
          const validator = new DeliverableValidator();
          result = await validator.validate(data);
          break;
        }
        default:
          throw new Error(`Unknown validation type: ${validationType}`);
      }

      console.log(JSON.stringify(result, null, 2));
      process.exit(result.passed ? 0 : 1);
    } catch (error) {
      console.error('Validation error:', error);
      process.exit(1);
    }
  })();
}
