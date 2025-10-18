/**
 * Code Transformation Pipeline
 * Real-time AST-based code transformations with validation
 */

import { EventEmitter } from 'events';
import { RealTimeASTProcessor } from '../processors/real-time-processor';
import {
  ASTNode,
  CodeTransformation,
  ProcessingResult,
  ASTOperation,
  PerformanceMetrics,
  AnalysisRule
} from '../types/ast-types';

export interface TransformationRule {
  id: string;
  name: string;
  description: string;
  pattern: RegExp | string;
  replacement: string | ((match: any) => string);
  priority: number;
  enabled: boolean;
  validation?: (node: ASTNode) => boolean;
}

export interface TransformationBatch {
  id: string;
  transformations: CodeTransformation[];
  rules: TransformationRule[];
  validateAfterTransform: boolean;
  dryRun: boolean;
}

export interface TransformationResult {
  success: boolean;
  transformedCode?: string;
  appliedTransformations: string[];
  validationResults: ValidationResult[];
  metrics: PerformanceMetrics;
  errors?: string[];
  warnings?: string[];
}

export interface ValidationResult {
  ruleId: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
  node?: ASTNode;
}

export class CodeTransformationPipeline extends EventEmitter {
  private processor: RealTimeASTProcessor;
  private transformationRules: TransformationRule[] = [];
  private validationRules: AnalysisRule[] = [];
  private transformationHistory: TransformationResult[] = [];

  constructor(processor: RealTimeASTProcessor) {
    super();
    this.processor = processor;
    this.initializeDefaultRules();
    this.setupProcessorListeners();
  }

  /**
   * Apply transformation batch to source code
   */
  async applyTransformationBatch(
    sourceCode: string,
    batch: TransformationBatch
  ): Promise<TransformationResult> {
    const startTime = performance.now();
    const appliedTransformations: string[] = [];
    const validationResults: ValidationResult[] = [];
    let currentCode = sourceCode;
    let currentAST: ASTNode | null = null;

    try {
      // Parse initial AST
      const parseResult = await this.processor.processFile('input', currentCode);
      if (!parseResult.success || !parseResult.ast) {
        throw new Error(`Failed to parse source code: ${parseResult.errors?.join(', ')}`);
      }
      currentAST = parseResult.ast;

      // Apply transformations in priority order
      const sortedTransformations = batch.transformations.sort((a, b) => {
        const priorityA = batch.rules.find(r => r.id === a.metadata?.ruleId)?.priority || 0;
        const priorityB = batch.rules.find(r => r.id === b.metadata?.ruleId)?.priority || 0;
        return priorityB - priorityA;
      });

      for (const transformation of sortedTransformations) {
        if (batch.dryRun) {
          // Simulate transformation without applying
          validationResults.push({
            ruleId: transformation.metadata?.ruleId || 'unknown',
            passed: true,
            message: `Dry run: would apply ${transformation.type} transformation`,
            severity: 'info',
            node: transformation.target,
          });
          continue;
        }

        // Apply single transformation
        const transformResult = await this.applySingleTransformation(
          currentAST!,
          transformation,
          batch.rules.find(r => r.id === transformation.metadata?.ruleId)
        );

        if (transformResult.success) {
          currentAST = transformResult.ast || currentAST;
          currentCode = transformResult.transformed || currentCode;
          appliedTransformations.push(transformation.metadata?.ruleId || transformation.type);

          // Collect validation results
          validationResults.push(...transformResult.validationResults);
        } else {
          validationResults.push({
            ruleId: transformation.metadata?.ruleId || 'unknown',
            passed: false,
            message: `Transformation failed: ${transformResult.errors?.join(', ')}`,
            severity: 'error',
            node: transformation.target,
          });
        }
      }

      // Validate final result
      if (batch.validateAfterTransform && currentAST) {
        const finalValidation = await this.validateTransformedCode(currentAST);
        validationResults.push(...finalValidation);
      }

      const processingTime = performance.now() - startTime;
      const metrics: PerformanceMetrics = {
        parseTime: parseResult.metrics.parseTime,
        transformTime: processingTime - parseResult.metrics.parseTime,
        totalTime: processingTime,
        memoryUsed: parseResult.metrics.memoryUsed,
        nodesProcessed: this.countNodes(currentAST),
        throughput: this.countNodes(currentAST) / processingTime,
      };

      const result: TransformationResult = {
        success: true,
        transformedCode: currentCode,
        appliedTransformations,
        validationResults,
        metrics,
        warnings: validationResults.filter(v => v.severity === 'warning').map(v => v.message),
        errors: validationResults.filter(v => v.severity === 'error').map(v => v.message),
      };

      // Store in history
      this.transformationHistory.push(result);
      if (this.transformationHistory.length > 1000) {
        this.transformationHistory.shift();
      }

      this.emit('transformation:completed', {
        batchId: batch.id,
        result,
      });

      return result;

    } catch (error) {
      const processingTime = performance.now() - startTime;
      return {
        success: false,
        appliedTransformations,
        validationResults,
        metrics: {
          parseTime: 0,
          transformTime: processingTime,
          totalTime: processingTime,
          memoryUsed: 0,
          nodesProcessed: 0,
          throughput: 0,
        },
        errors: [error.message],
      };
    }
  }

  /**
   * Apply automatic transformations based on rules
   */
  async applyAutomaticTransformations(sourceCode: string): Promise<TransformationResult> {
    const enabledRules = this.transformationRules.filter(rule => rule.enabled);
    const transformations: CodeTransformation[] = [];

    // Parse code to AST
    const parseResult = await this.processor.processFile('input', sourceCode);
    if (!parseResult.success || !parseResult.ast) {
      throw new Error(`Failed to parse source code: ${parseResult.errors?.join(', ')}`);
    }

    // Find transformations based on rules
    for (const rule of enabledRules) {
      const ruleTransformations = await this.findTransformationsForRule(parseResult.ast, rule);
      transformations.push(...ruleTransformations);
    }

    // Create transformation batch
    const batch: TransformationBatch = {
      id: `auto_${Date.now()}`,
      transformations,
      rules: enabledRules,
      validateAfterTransform: true,
      dryRun: false,
    };

    return this.applyTransformationBatch(sourceCode, batch);
  }

  /**
   * Add custom transformation rule
   */
  addTransformationRule(rule: TransformationRule): void {
    this.transformationRules.push(rule);
    this.emit('rule:added', rule);
  }

  /**
   * Remove transformation rule
   */
  removeTransformationRule(ruleId: string): void {
    const index = this.transformationRules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      const removed = this.transformationRules.splice(index, 1)[0];
      this.emit('rule:removed', removed);
    }
  }

  /**
   * Get transformation statistics
   */
  getTransformationStats() {
    const recent = this.transformationHistory.slice(-100);
    const successful = recent.filter(r => r.success).length;
    const failed = recent.length - successful;

    const avgMetrics = recent.length > 0 ? {
      totalTime: recent.reduce((sum, r) => sum + r.metrics.totalTime, 0) / recent.length,
      transformTime: recent.reduce((sum, r) => sum + r.metrics.transformTime, 0) / recent.length,
      nodesProcessed: recent.reduce((sum, r) => sum + r.metrics.nodesProcessed, 0) / recent.length,
      throughput: recent.reduce((sum, r) => sum + r.metrics.throughput, 0) / recent.length,
    } : {};

    return {
      totalTransformations: recent.length,
      successRate: recent.length > 0 ? (successful / recent.length) * 100 : 0,
      averageMetrics: avgMetrics,
      activeRules: this.transformationRules.filter(r => r.enabled).length,
      totalRules: this.transformationRules.length,
    };
  }

  // Private methods

  private async applySingleTransformation(
    ast: ASTNode,
    transformation: CodeTransformation,
    rule?: TransformationRule
  ): Promise<ProcessingResult> {
    // Validate transformation if rule has validation
    if (rule?.validation && !rule.validation(transformation.target)) {
      return {
        success: false,
        metrics: {
          parseTime: 0,
          transformTime: 0,
          totalTime: 0,
          memoryUsed: 0,
          nodesProcessed: 0,
          throughput: 0,
        },
        errors: [`Transformation validation failed for rule ${rule.id}`],
      };
    }

    // Apply transformation using processor
    const result = await this.processor.applyTransformations(ast, [transformation]);

    // Add validation results
    const validationResults: ValidationResult[] = [];
    if (rule) {
      validationResults.push({
        ruleId: rule.id,
        passed: result.success,
        message: result.success ? `Applied ${rule.name}` : `Failed to apply ${rule.name}`,
        severity: result.success ? 'info' : 'error',
        node: transformation.target,
      });
    }

    return {
      ...result,
      validationResults,
    };
  }

  private async findTransformationsForRule(ast: ASTNode, rule: TransformationRule): Promise<CodeTransformation[]> {
    const transformations: CodeTransformation[] = [];

    this.traverseAST(ast, (node) => {
      if (this.matchesRule(node, rule)) {
        const replacement = typeof rule.replacement === 'function'
          ? rule.replacement(node)
          : rule.replacement;

        transformations.push({
          type: 'replace',
          target: node,
          replacement,
          metadata: { ruleId: rule.id, ruleName: rule.name },
        });
      }
    });

    return transformations;
  }

  private matchesRule(node: ASTNode, rule: TransformationRule): boolean {
    if (typeof rule.pattern === 'string') {
      return node.type === rule.pattern || (node.value && node.value.includes(rule.pattern));
    } else {
      return rule.pattern.test(node.type) || (node.value && rule.pattern.test(node.value));
    }
  }

  private traverseAST(node: ASTNode, callback: (node: ASTNode) => void): void {
    callback(node);
    if (node.children) {
      for (const child of node.children) {
        this.traverseAST(child, callback);
      }
    }
  }

  private async validateTransformedCode(ast: ASTNode): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    // Run validation rules
    for (const rule of this.validationRules) {
      try {
        const isValid = rule.action(ast);
        results.push({
          ruleId: rule.id,
          passed: isValid,
          message: isValid ? `${rule.name} passed` : `${rule.name} failed`,
          severity: rule.severity,
          node: ast,
        });
      } catch (error) {
        results.push({
          ruleId: rule.id,
          passed: false,
          message: `Validation error: ${error.message}`,
          severity: 'error',
          node: ast,
        });
      }
    }

    return results;
  }

  private countNodes(ast: ASTNode | null): number {
    if (!ast) return 0;
    let count = 1;
    if (ast.children) {
      for (const child of ast.children) {
        count += this.countNodes(child);
      }
    }
    return count;
  }

  private initializeDefaultRules(): void {
    this.transformationRules = [
      {
        id: 'optimize_imports',
        name: 'Optimize Imports',
        description: 'Remove unused imports and sort remaining ones',
        pattern: /import/,
        replacement: (match) => {
          // Implementation for import optimization
          return match.value; // Placeholder
        },
        priority: 10,
        enabled: true,
      },
      {
        id: 'modernize_syntax',
        name: 'Modernize Syntax',
        description: 'Update to modern JavaScript syntax',
        pattern: 'var',
        replacement: 'const',
        priority: 8,
        enabled: true,
      },
      {
        id: 'remove_console_logs',
        name: 'Remove Console Logs',
        description: 'Remove console.log statements for production',
        pattern: /console\.log/,
        replacement: '',
        priority: 5,
        enabled: false, // Disabled by default
      },
    ];

    this.validationRules = [
      {
        id: 'syntax_validity',
        name: 'Syntax Validity',
        description: 'Ensure transformed code has valid syntax',
        pattern: /.*/,
        severity: 'error',
        action: (node) => node.type !== 'error',
      },
      {
        id: 'no_unreachable_code',
        name: 'No Unreachable Code',
        description: 'Check for unreachable code after transformations',
        pattern: /return|throw/,
        severity: 'warning',
        action: (node) => this.hasNoUnreachableCode(node),
      },
    ];
  }

  private hasNoUnreachableCode(node: ASTNode): boolean {
    // Implementation to check for unreachable code
    return true; // Placeholder
  }

  private setupProcessorListeners(): void {
    this.processor.on('realtime:event', (event) => {
      this.emit('processor:event', event);
    });

    this.processor.on('performance:update', (metrics) => {
      this.emit('performance:update', metrics);
    });
  }
}