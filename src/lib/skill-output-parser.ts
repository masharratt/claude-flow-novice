/**
 * Skill Output Parser
 * Task 5.4: Eliminate Bash Output Parsing
 *
 * Parses structured JSON outputs from skill execution with legacy text fallback
 *
 * @version 1.0.0
 */

import { ErrorCode, createError, createValidationError } from './errors';

// ============================================================================
// Types
// ============================================================================

/**
 * Skill execution output (structured JSON format)
 */
export interface SkillOutput {
  /** Whether skill execution was successful */
  success: boolean;

  /** Confidence score (0.0-1.0) */
  confidence: number;

  /** Files created or modified */
  deliverables: string[];

  /** Execution metrics */
  metrics: SkillMetrics;

  /** Errors encountered during execution */
  errors: SkillError[];
}

/**
 * Skill execution metrics
 */
export interface SkillMetrics {
  /** Execution time in milliseconds */
  execution_time_ms?: number;

  /** Number of files modified */
  files_modified?: number;

  /** Additional custom metrics */
  [key: string]: number | undefined;
}

/**
 * Skill execution error
 */
export interface SkillError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Error stack trace (optional) */
  stack?: string;

  /** Additional error context */
  context?: Record<string, any>;
}

/**
 * Skill output parse result
 */
export interface SkillParseResult {
  /** Whether parsing was successful */
  success: boolean;

  /** Parsed skill output */
  output: SkillOutput;

  /** Parse method used: json | legacy | validation_failed */
  parseMethod: 'json' | 'legacy' | 'validation_failed';

  /** Parsing confidence (0.0-1.0) */
  confidence: number;

  /** Parsing errors */
  errors: string[];

  /** Parsing warnings */
  warnings: string[];
}

/**
 * Parser configuration
 */
export interface SkillOutputParserConfig {
  /** Enable legacy text parsing fallback (default: true) */
  enableLegacyParsing?: boolean;

  /** Default confidence for legacy parsing (default: 0.5) */
  defaultConfidence?: number;

  /** Enable strict validation mode (default: false) */
  strictValidation?: boolean;
}

// ============================================================================
// Parser Class
// ============================================================================

/**
 * SkillOutputParser: Parses skill execution outputs
 *
 * Primary path: JSON parsing with schema validation
 * Fallback path: Legacy text parsing
 */
export class SkillOutputParser {
  private config: Required<SkillOutputParserConfig>;

  constructor(config: SkillOutputParserConfig = {}) {
    this.config = {
      enableLegacyParsing: config.enableLegacyParsing ?? true,
      defaultConfidence: config.defaultConfidence ?? 0.5,
      strictValidation: config.strictValidation ?? false,
    };
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Parse skill output (JSON or legacy text)
   *
   * @param output - Raw skill output string
   * @returns Parse result
   */
  public parse(output: string): SkillParseResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Handle empty input
    if (!output || output.trim().length === 0) {
      warnings.push('Empty input received');
      return this.createLegacyParseResult(output, warnings);
    }

    // Try JSON parsing first
    const jsonResult = this.tryParseJSON(output);
    if (jsonResult.success && jsonResult.data) {
      // Validate JSON schema
      const validationResult = this.validateSkillOutput(jsonResult.data);

      if (validationResult.valid) {
        return {
          success: true,
          output: jsonResult.data,
          parseMethod: 'json',
          confidence: 0.95, // High confidence for valid JSON
          errors: [],
          warnings: this.config.strictValidation ? validationResult.warnings : [],
        };
      } else {
        // JSON parsed but validation failed - don't fall back to legacy
        // because JSON structure exists, it's just invalid
        errors.push(...validationResult.errors);
        return {
          success: false,
          output: this.createDefaultOutput(),
          parseMethod: 'validation_failed',
          confidence: 0.0,
          errors,
          warnings,
        };
      }
    }

    // JSON parsing failed
    if (this.config.enableLegacyParsing) {
      warnings.push('Using legacy text parsing (consider migrating to JSON output)');
      return this.createLegacyParseResult(output, warnings);
    } else {
      errors.push('JSON parsing failed and legacy parsing disabled');
      return {
        success: false,
        output: this.createDefaultOutput(),
        parseMethod: 'validation_failed',
        confidence: 0.0,
        errors,
        warnings,
      };
    }
  }

  /**
   * Parse multiple skill outputs in batch
   *
   * @param outputs - Array of raw skill output strings
   * @returns Array of parse results
   */
  public parseBatch(outputs: string[]): SkillParseResult[] {
    return outputs.map((output) => this.parse(output));
  }

  // ==========================================================================
  // JSON Parsing
  // ==========================================================================

  /**
   * Try to parse output as JSON
   *
   * @param output - Raw output string
   * @returns Parse result with success flag and data
   */
  private tryParseJSON(output: string): { success: boolean; data?: any } {
    try {
      // Try to extract JSON from mixed output
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return { success: true, data };
      }

      // Try parsing entire output
      const data = JSON.parse(output);
      return { success: true, data };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Validate skill output against schema
   *
   * @param data - Parsed JSON data
   * @returns Validation result
   */
  private validateSkillOutput(data: any): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (typeof data.success !== 'boolean') {
      errors.push('Missing required field: success (must be boolean)');
    }

    if (typeof data.confidence !== 'number') {
      errors.push('Missing required field: confidence (must be number)');
    } else if (data.confidence < 0.0 || data.confidence > 1.0) {
      errors.push('Confidence must be between 0.0 and 1.0');
    }

    if (!Array.isArray(data.deliverables)) {
      errors.push('Deliverables must be an array');
    }

    if (typeof data.metrics !== 'object' || data.metrics === null || Array.isArray(data.metrics)) {
      errors.push('Metrics must be an object');
    }

    if (!Array.isArray(data.errors)) {
      errors.push('Errors must be an array');
    }

    // Strict mode: check for unexpected fields
    if (this.config.strictValidation) {
      const allowedFields = new Set(['success', 'confidence', 'deliverables', 'metrics', 'errors']);
      const actualFields = Object.keys(data);
      const unexpectedFields = actualFields.filter((field) => !allowedFields.has(field));

      if (unexpectedFields.length > 0) {
        warnings.push(`Unexpected fields in output: ${unexpectedFields.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ==========================================================================
  // Legacy Parsing
  // ==========================================================================

  /**
   * Parse legacy text output
   *
   * @param output - Raw text output
   * @param warnings - Existing warnings to include
   * @returns Parse result
   */
  private createLegacyParseResult(output: string, warnings: string[] = []): SkillParseResult {
    // Special handling for empty input
    const isEmpty = !output || output.trim().length === 0;

    const parsedOutput: SkillOutput = {
      success: isEmpty ? false : this.detectSuccess(output),
      confidence: isEmpty ? 0.0 : this.extractConfidence(output),
      deliverables: this.extractDeliverables(output),
      metrics: this.extractMetrics(output),
      errors: this.extractErrors(output),
    };

    return {
      success: true,
      output: parsedOutput,
      parseMethod: 'legacy',
      confidence: parsedOutput.confidence,
      errors: [],
      warnings,
    };
  }

  /**
   * Detect success from text patterns
   */
  private detectSuccess(output: string): boolean {
    const successPatterns = [
      /SUCCESS/i,
      /complete(d)?/i,
      /passed/i,
      /\[OK\]/i,
      /✓/,
    ];

    const failurePatterns = [
      /ERROR/i,
      /FAILED/i,
      /ABORT/i,
      /\[FAIL\]/i,
      /✗/,
    ];

    // Check for explicit failure first
    for (const pattern of failurePatterns) {
      if (pattern.test(output)) {
        return false;
      }
    }

    // Check for success patterns
    for (const pattern of successPatterns) {
      if (pattern.test(output)) {
        return true;
      }
    }

    // Default: assume success if no clear failure
    return output.trim().length > 0;
  }

  /**
   * Extract confidence from text
   */
  private extractConfidence(output: string): number {
    // Look for explicit confidence marker
    const confidenceMatch = output.match(/confidence:?\s*(0?\.\d+|1\.0|0|1)/i);
    if (confidenceMatch) {
      return parseFloat(confidenceMatch[1]);
    }

    // Return default confidence
    return this.config.defaultConfidence;
  }

  /**
   * Extract deliverables from text
   */
  private extractDeliverables(output: string): string[] {
    const deliverables: string[] = [];

    // Look for file patterns
    const patterns = [
      /(?:created|modified|updated|generated):?\s+([^\s\n]+)/gi,
      /(?:file|path):?\s+([^\s\n]+)/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(output)) !== null) {
        const file = match[1].trim();
        if (file && !deliverables.includes(file)) {
          deliverables.push(file);
        }
      }
    }

    return deliverables;
  }

  /**
   * Extract metrics from text
   */
  private extractMetrics(output: string): SkillMetrics {
    const metrics: SkillMetrics = {};

    // Extract execution time
    const timeMatch = output.match(/(?:execution\s+time|duration|took):?\s*(\d+)\s*ms/i);
    if (timeMatch) {
      metrics.execution_time_ms = parseInt(timeMatch[1], 10);
    }

    // Extract file count
    const fileCountMatch = output.match(/(?:modified|created|updated)\s+(\d+)\s+files?/i);
    if (fileCountMatch) {
      metrics.files_modified = parseInt(fileCountMatch[1], 10);
    }

    return metrics;
  }

  /**
   * Extract errors from text
   */
  private extractErrors(output: string): SkillError[] {
    const errors: SkillError[] = [];

    // Look for error patterns
    const errorMatches = output.matchAll(/ERROR:?\s*([^\n]+)/gi);
    for (const match of errorMatches) {
      errors.push({
        code: 'LEGACY_ERROR',
        message: match[1].trim(),
      });
    }

    return errors;
  }

  // ==========================================================================
  // Utilities
  // ==========================================================================

  /**
   * Create default empty output
   */
  private createDefaultOutput(): SkillOutput {
    return {
      success: false,
      confidence: 0.0,
      deliverables: [],
      metrics: {},
      errors: [],
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export default SkillOutputParser;
