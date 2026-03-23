/**
 * CFN Loop Validation Framework
 * Multi-layer validation system for CFN Loop outputs
 */

export interface ValidationRule {
  name: string;
  description: string;
  validate: (input: any) => ValidationResult;
}

export interface ValidationResult {
  passed: boolean;
  score: number; // 0-100
  errors: string[];
  warnings: string[];
  metadata?: Record<string, any>;
}

export interface ValidationLayer {
  name: string;
  rules: ValidationRule[];
  weight: number; // Weight for overall score calculation
}

export interface ValidationReport {
  overallScore: number;
  passed: boolean;
  layers: LayerResult[];
  summary: {
    totalRules: number;
    passedRules: number;
    failedRules: number;
    warnings: number;
  };
}

export interface LayerResult {
  name: string;
  score: number;
  passed: boolean;
  ruleResults: ValidationResult[];
}

/**
 * Validation Framework Class
 */
export class ValidationFramework {
  private layers: ValidationLayer[] = [];

  /**
   * Add validation layer
   */
  addLayer(layer: ValidationLayer): void {
    this.layers.push(layer);
  }

  /**
   * Validate input against all layers
   */
  async validate(input: any): Promise<ValidationReport> {
    const layerResults: LayerResult[] = [];
    let totalWeightedScore = 0;
    let totalWeight = 0;
    let totalRules = 0;
    let passedRules = 0;
    let warnings = 0;

    for (const layer of this.layers) {
      const ruleResults: ValidationResult[] = [];
      let layerScore = 0;

      for (const rule of layer.rules) {
        const result = rule.validate(input);
        ruleResults.push(result);

        totalRules++;
        if (result.passed) {
          passedRules++;
          layerScore += result.score;
        }
        warnings += result.warnings.length;
      }

      // Calculate average score for layer
      const avgScore = layer.rules.length > 0 ?
        layerScore / layer.rules.length : 0;

      const layerResult: LayerResult = {
        name: layer.name,
        score: avgScore,
        passed: avgScore >= 70, // 70% threshold
        ruleResults
      };

      layerResults.push(layerResult);

      // Add to weighted total
      totalWeightedScore += avgScore * layer.weight;
      totalWeight += layer.weight;
    }

    // Calculate overall score
    const overallScore = totalWeight > 0 ?
      totalWeightedScore / totalWeight : 0;

    const passed = overallScore >= 80; // 80% overall threshold

    return {
      overallScore,
      passed,
      layers: layerResults,
      summary: {
        totalRules,
        passedRules,
        failedRules: totalRules - passedRules,
        warnings
      }
    };
  }

  /**
   * Get all layers
   */
  getLayers(): ValidationLayer[] {
    return [...this.layers];
  }

  /**
   * Clear all layers
   */
  clear(): void {
    this.layers = [];
  }
}

/**
 * Common validation rules
 */
export const CommonRules = {
  /**
   * Check if deliverables exist
   */
  hasDeliverables: (): ValidationRule => ({
    name: 'has-deliverables',
    description: 'Validates that deliverables are present',
    validate: (input: any): ValidationResult => {
      const hasDeliverables = input.deliverables &&
        Array.isArray(input.deliverables) &&
        input.deliverables.length > 0;

      return {
        passed: hasDeliverables,
        score: hasDeliverables ? 100 : 0,
        errors: hasDeliverables ? [] : ['No deliverables found'],
        warnings: []
      };
    }
  }),

  /**
   * Check if confidence threshold is met
   */
  meetsConfidenceThreshold: (threshold: number = 0.8): ValidationRule => ({
    name: 'confidence-threshold',
    description: `Validates confidence meets ${threshold * 100}% threshold`,
    validate: (input: any): ValidationResult => {
      const confidence = input.confidence || 0;
      const passed = confidence >= threshold;

      return {
        passed,
        score: passed ? 100 : (confidence / threshold) * 100,
        errors: passed ? [] : [`Confidence ${confidence} below threshold ${threshold}`],
        warnings: confidence < 0.9 && confidence >= threshold ?
          [`Confidence ${confidence} is close to threshold`] : []
      };
    }
  }),

  /**
   * Check if test results meet pass rate
   */
  meetsTestPassRate: (threshold: number = 0.95): ValidationRule => ({
    name: 'test-pass-rate',
    description: `Validates test pass rate meets ${threshold * 100}% threshold`,
    validate: (input: any): ValidationResult => {
      const testResults = input.testResults;
      if (!testResults) {
        return {
          passed: false,
          score: 0,
          errors: ['No test results provided'],
          warnings: []
        };
      }

      const passRate = testResults.passRate || 0;
      const passed = passRate >= threshold;

      return {
        passed,
        score: passRate * 100,
        errors: passed ? [] : [`Test pass rate ${passRate} below threshold ${threshold}`],
        warnings: passRate < 0.98 && passRate >= threshold ?
          [`Test pass rate ${passRate} could be improved`] : []
      };
    }
  }),

  /**
   * Check for critical blockers
   */
  noCriticalBlockers: (): ValidationRule => ({
    name: 'no-critical-blockers',
    description: 'Validates no critical blockers exist',
    validate: (input: any): ValidationResult => {
      const blockers = input.blockers || [];
      const hasCritical = blockers.some((b: string) =>
        b.toLowerCase().includes('critical') ||
        b.toLowerCase().includes('security') ||
        b.toLowerCase().includes('fatal')
      );

      return {
        passed: !hasCritical,
        score: hasCritical ? 0 : 100,
        errors: hasCritical ? ['Critical blockers detected'] : [],
        warnings: blockers.length > 0 ?
          [`Found ${blockers.length} non-critical blockers`] : []
      };
    }
  })
};

// Export types
export type { ValidationRule, ValidationResult, ValidationLayer, ValidationReport, LayerResult };