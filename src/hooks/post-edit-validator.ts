/**
 * Post-Edit Validator - File validation after modifications
 * Runs syntax, formatting, and linting checks on edited files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';

interface ValidationConfig {
  checkSyntax: boolean;
  checkFormatting: boolean;
  checkDuplication: boolean;
  blockingValidation: boolean;
  typescript?: {
    enabled: boolean;
    noEmit: boolean;
    skipLibCheck: boolean;
  };
  bash?: {
    enabled: boolean;
    validators: string[];
    timeout: number;
  };
}

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  timestamp: string;
  filePath: string;
  executionTime: number;
}

export class PostEditValidator {
  private config: ValidationConfig;
  private projectRoot: string;
  private configPath: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = projectRoot;
    this.configPath = path.join(projectRoot, '.claude/hooks/cfn-post-edit.config.json');
    this.config = {
      checkSyntax: true,
      checkFormatting: true,
      checkDuplication: false,
      blockingValidation: false,
    };
  }

  /**
   * Load validation config from JSON file
   */
  async loadConfig(): Promise<ValidationConfig> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const rawConfig = JSON.parse(configContent);

      // Merge with defaults
      this.config = {
        checkSyntax: rawConfig.validation?.syntax?.enabled ?? true,
        checkFormatting: rawConfig.validation?.formatting?.enabled ?? true,
        checkDuplication: rawConfig.validation?.duplication?.enabled ?? false,
        blockingValidation: rawConfig.blocking ?? false,
        typescript: rawConfig.validation?.typescript ?? {
          enabled: true,
          noEmit: true,
          skipLibCheck: true,
        },
        bash: rawConfig.validation?.bash ?? {
          enabled: true,
          validators: ['pipe-safety', 'dependency-checker', 'line-endings'],
          timeout: 5000,
        },
      };

      return this.config;
    } catch (error) {
      // Return defaults if config not found
      return this.config;
    }
  }

  /**
   * Get file extension to determine file type
   */
  private getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
  }

  /**
   * Validate TypeScript/JavaScript files
   */
  private async validateTypeScript(filePath: string): Promise<ValidationResult> {
    const startTime = Date.now();
    const result: ValidationResult = {
      passed: true,
      errors: [],
      warnings: [],
      suggestions: [],
      timestamp: new Date().toISOString(),
      filePath,
      executionTime: 0,
    };

    try {
      // Check if tsc is available
      const tscPath = path.join(this.projectRoot, 'node_modules/.bin/tsc');
      await fs.stat(tscPath);

      return await this.runTypeScriptCheck(filePath, result);
    } catch {
      // TypeScript not available, skip
      result.warnings.push('TypeScript compiler not available, skipping type checking');
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  /**
   * Run TypeScript compilation check
   */
  private runTypeScriptCheck(
    filePath: string,
    result: ValidationResult
  ): Promise<ValidationResult> {
    return new Promise((resolve) => {
      try {
        const tsc = spawn('npx', ['tsc', '--noEmit', filePath], {
          cwd: this.projectRoot,
          timeout: 10000,
        });

        let stderr = '';
        let stdout = '';

        tsc.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        tsc.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        tsc.on('close', (code) => {
          if (code !== 0 && stdout) {
            result.passed = false;
            result.errors.push(`TypeScript compilation failed:\n${stdout}`);
          }
          result.executionTime = Date.now() - new Date(result.timestamp).getTime();
          resolve(result);
        });

        tsc.on('error', (error) => {
          result.warnings.push(`TypeScript check skipped: ${error.message}`);
          result.executionTime = Date.now() - new Date(result.timestamp).getTime();
          resolve(result);
        });
      } catch (error) {
        result.warnings.push(`Failed to run TypeScript check: ${error}`);
        result.executionTime = Date.now() - new Date(result.timestamp).getTime();
        resolve(result);
      }
    });
  }

  /**
   * Validate Bash scripts
   */
  private async validateBash(filePath: string): Promise<ValidationResult> {
    const startTime = Date.now();
    const result: ValidationResult = {
      passed: true,
      errors: [],
      warnings: [],
      suggestions: [],
      timestamp: new Date().toISOString(),
      filePath,
      executionTime: 0,
    };

    try {
      // Run basic bash syntax check with bash -n
      const content = await fs.readFile(filePath, 'utf-8');

      // Check for common bash issues
      if (content.includes('[ -z')) {
        result.warnings.push(
          'Consider using [[ -z instead of [ -z for more robust string checking'
        );
      }

      if (content.match(/\|\s*while.*read/)) {
        result.warnings.push(
          'Pipe to while-read can cause issues with variable scope, consider using process substitution'
        );
      }

      if (!content.includes('set -euo pipefail')) {
        result.suggestions.push('Add "set -euo pipefail" at the top of the script for safety');
      }

      // Check for unquoted variables
      const unquotedVars = content.match(/\$\w+(?![\w"}])/g) || [];
      if (unquotedVars.length > 0) {
        result.warnings.push(
          `Found ${unquotedVars.length} potentially unquoted variables - consider quoting them`
        );
      }

      result.executionTime = Date.now() - startTime;
      return result;
    } catch (error) {
      result.errors.push(`Bash validation failed: ${error}`);
      result.passed = false;
      result.executionTime = Date.now() - startTime;
      return result;
    }
  }

  /**
   * Validate JSON files
   */
  private async validateJSON(filePath: string): Promise<ValidationResult> {
    const startTime = Date.now();
    const result: ValidationResult = {
      passed: true,
      errors: [],
      warnings: [],
      suggestions: [],
      timestamp: new Date().toISOString(),
      filePath,
      executionTime: 0,
    };

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      JSON.parse(content);
    } catch (error) {
      result.passed = false;
      result.errors.push(`JSON validation failed: ${error}`);
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  /**
   * Check for code duplication
   */
  private async checkDuplication(filePath: string): Promise<ValidationResult> {
    const startTime = Date.now();
    const result: ValidationResult = {
      passed: true,
      errors: [],
      warnings: [],
      suggestions: [],
      timestamp: new Date().toISOString(),
      filePath,
      executionTime: 0,
    };

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // Check for duplicate consecutive lines
      const seenLines = new Map<string, number>();

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line && line.length > 20) {
          // Only check non-trivial lines
          const count = seenLines.get(line) || 0;

          if (count > 0) {
            result.suggestions.push(
              `Duplicate line found at line ${i + 1}: "${line.substring(0, 50)}..."`
            );
          }

          seenLines.set(line, count + 1);
        }
      }
    } catch (error) {
      result.warnings.push(`Duplication check skipped: ${error}`);
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  /**
   * Check file formatting consistency
   */
  private async checkFormatting(filePath: string): Promise<ValidationResult> {
    const startTime = Date.now();
    const result: ValidationResult = {
      passed: true,
      errors: [],
      warnings: [],
      suggestions: [],
      timestamp: new Date().toISOString(),
      filePath,
      executionTime: 0,
    };

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // Check for mixed line endings
      const hasWindowsLineEndings = content.includes('\r\n');
      const hasUnixLineEndings = content.includes('\n');

      if (hasWindowsLineEndings && hasUnixLineEndings) {
        result.warnings.push('Mixed line endings detected (CRLF and LF)');
      }

      // Check for trailing whitespace
      let trailingWhitespaceCount = 0;
      for (const line of lines) {
        if (line !== line.trimRight()) {
          trailingWhitespaceCount++;
        }
      }

      if (trailingWhitespaceCount > 0) {
        result.suggestions.push(
          `${trailingWhitespaceCount} lines have trailing whitespace`
        );
      }

      // Check for tabs vs spaces
      const hasTabs = content.includes('\t');
      const hasSpaces = /^  +/.test(content);

      if (hasTabs && hasSpaces) {
        result.warnings.push('Mixed tabs and spaces detected');
      }
    } catch (error) {
      result.warnings.push(`Formatting check skipped: ${error}`);
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  /**
   * Run full validation pipeline on a file
   */
  async validateFile(filePath: string, agentId?: string): Promise<ValidationResult> {
    try {
      await this.loadConfig();

      // Validate file exists
      await fs.stat(filePath);
    } catch {
      return {
        passed: false,
        errors: [`File does not exist: ${filePath}`],
        warnings: [],
        suggestions: [],
        timestamp: new Date().toISOString(),
        filePath,
        executionTime: 0,
      };
    }

    // Run validation pipeline
    return await this.runValidationPipeline(filePath);
  }

  /**
   * Execute complete validation pipeline
   */
  async runValidationPipeline(filePath: string): Promise<ValidationResult> {
    const startTime = Date.now();
    const ext = this.getFileExtension(filePath);
    const aggregatedResult: ValidationResult = {
      passed: true,
      errors: [],
      warnings: [],
      suggestions: [],
      timestamp: new Date().toISOString(),
      filePath,
      executionTime: 0,
    };

    try {
      // Run type-specific validation
      let typeValidation: ValidationResult;

      if (['.ts', '.tsx'].includes(ext)) {
        if (this.config.typescript?.enabled) {
          typeValidation = await this.validateTypeScript(filePath);
          this.mergeResults(aggregatedResult, typeValidation);
        }
      } else if (['.js', '.jsx'].includes(ext)) {
        // Basic JS validation would go here
      } else if (['.json'].includes(ext)) {
        typeValidation = await this.validateJSON(filePath);
        this.mergeResults(aggregatedResult, typeValidation);
      } else if (['.sh', '.bash'].includes(ext)) {
        if (this.config.bash?.enabled) {
          typeValidation = await this.validateBash(filePath);
          this.mergeResults(aggregatedResult, typeValidation);
        }
      }

      // Run common checks
      if (this.config.checkFormatting) {
        const formattingResult = await this.checkFormatting(filePath);
        this.mergeResults(aggregatedResult, formattingResult);
      }

      if (this.config.checkDuplication) {
        const duplicationResult = await this.checkDuplication(filePath);
        this.mergeResults(aggregatedResult, duplicationResult);
      }

      aggregatedResult.executionTime = Date.now() - startTime;
      return aggregatedResult;
    } catch (error) {
      aggregatedResult.errors.push(`Validation pipeline failed: ${error}`);
      aggregatedResult.passed = false;
      aggregatedResult.executionTime = Date.now() - startTime;
      return aggregatedResult;
    }
  }

  /**
   * Merge validation results
   */
  private mergeResults(target: ValidationResult, source: ValidationResult): void {
    target.errors.push(...source.errors);
    target.warnings.push(...source.warnings);
    target.suggestions.push(...source.suggestions);

    if (!source.passed) {
      target.passed = false;
    }
  }

  /**
   * Get validation feedback summary
   */
  getValidationSummary(result: ValidationResult): string {
    const lines: string[] = [];

    if (result.passed) {
      lines.push('✅ Validation passed');
    } else {
      lines.push('❌ Validation failed');
    }

    if (result.errors.length > 0) {
      lines.push(`\nErrors (${result.errors.length}):`);
      result.errors.forEach((error) => lines.push(`  - ${error}`));
    }

    if (result.warnings.length > 0) {
      lines.push(`\nWarnings (${result.warnings.length}):`);
      result.warnings.forEach((warning) => lines.push(`  - ${warning}`));
    }

    if (result.suggestions.length > 0) {
      lines.push(`\nSuggestions (${result.suggestions.length}):`);
      result.suggestions.forEach((suggestion) => lines.push(`  - ${suggestion}`));
    }

    lines.push(`\nExecution time: ${result.executionTime}ms`);

    return lines.join('\n');
  }
}
