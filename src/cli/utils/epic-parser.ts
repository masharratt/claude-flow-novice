/**
 * CLI Epic Parser Utility
 *
 * Lightweight wrapper around the core epic parser for CLI-specific use cases.
 * Converts markdown epic files to JSON configuration with validation.
 *
 * Features:
 * - Parse OVERVIEW.md for epic metadata
 * - Parse phase-*.md files for phase details and sprints
 * - Parse dependencies.md for cross-phase requirements
 * - Validate structure and dependencies
 * - Generate JSON output
 */

import * as fs from "fs";
import * as path from "path";
import { EpicParser, type ParseError } from "../../parsers/epic-parser.js";
import type {
  EpicConfig,
  Phase,
  Sprint,
  CrossPhaseDependency,
  RiskAssessment,
} from "../../parsers/epic-parser-types.js";

// ============================================================================
// Re-export Types for CLI Convenience
// ============================================================================

export type {
  EpicConfig,
  Phase,
  Sprint,
  CrossPhaseDependency,
  RiskAssessment,
  ParseError,
};

// ============================================================================
// CLI-Specific Interfaces
// ============================================================================

export interface EpicParserResult {
  success: boolean;
  config?: EpicConfig;
  errors: ParseError[];
  warnings: ParseError[];
  stats?: {
    totalPhases: number;
    totalSprints: number;
    completedSprints: number;
    dependencyCount: number;
    cyclesDetected: number;
  };
}

export interface ParseOptions {
  epicDirectory: string;
  overviewFile?: string;
  outputFile?: string;
  validateOnly?: boolean;
  verbose?: boolean;
}

// ============================================================================
// CLI Parser Functions
// ============================================================================

/**
 * Parse epic markdown files to JSON configuration
 *
 * @param options - Parser configuration options
 * @returns Parsing result with config, errors, warnings, and stats
 *
 * @example
 * ```typescript
 * const result = await parseEpic({
 *   epicDirectory: './planning/example-epic',
 *   outputFile: './epic-config.json',
 *   verbose: true
 * });
 *
 * if (result.success) {
 *   console.log(`Parsed ${result.stats.totalPhases} phases`);
 * }
 * ```
 */
export async function parseEpic(
  options: ParseOptions,
): Promise<EpicParserResult> {
  try {
    const parser = new EpicParser({
      epicDirectory: options.epicDirectory,
      overviewFile: options.overviewFile,
    });

    // Parse epic configuration
    const config = parser.parse();
    const validation = parser.getValidationResult();

    // Log verbose output if requested
    if (options.verbose) {
      logParsingProgress(validation);
    }

    // Write output file if requested and parsing succeeded
    if (options.outputFile && validation.valid) {
      const absolutePath = path.resolve(options.outputFile);
      fs.writeFileSync(absolutePath, JSON.stringify(config, null, 2), "utf-8");

      if (options.verbose) {
        console.log(`✅ Epic configuration saved: ${absolutePath}`);
      }
    }

    return {
      success: validation.valid,
      config: validation.valid ? config : undefined,
      errors: validation.errors,
      warnings: validation.warnings,
      stats: validation.stats,
    };
  } catch (error) {
    const parseError: ParseError = {
      type: "parsing_error",
      message: `Failed to parse epic: ${error instanceof Error ? error.message : String(error)}`,
      severity: "error",
      details: error,
    };

    return {
      success: false,
      errors: [parseError],
      warnings: [],
    };
  }
}

/**
 * Validate epic markdown structure without generating config
 *
 * @param epicDirectory - Path to epic directory
 * @param verbose - Enable verbose logging
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const result = await validateEpic('./planning/example-epic', true);
 * if (!result.success) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export async function validateEpic(
  epicDirectory: string,
  verbose: boolean = false,
): Promise<EpicParserResult> {
  return parseEpic({
    epicDirectory,
    validateOnly: true,
    verbose,
  });
}

/**
 * Generate epic configuration JSON from markdown files
 *
 * @param epicDirectory - Path to epic directory
 * @param outputPath - Optional output file path (defaults to epic-config.json in epic directory)
 * @returns Parsing result
 *
 * @example
 * ```typescript
 * const result = await generateEpicConfig(
 *   './planning/example-epic',
 *   './config/epic.json'
 * );
 * ```
 */
export async function generateEpicConfig(
  epicDirectory: string,
  outputPath?: string,
): Promise<EpicParserResult> {
  const outputFile =
    outputPath || path.join(epicDirectory, "epic-config.json");

  return parseEpic({
    epicDirectory,
    outputFile,
    verbose: true,
  });
}

/**
 * Quick parse - returns config or throws error
 *
 * @param epicDirectory - Path to epic directory
 * @returns Epic configuration
 * @throws Error if parsing fails
 *
 * @example
 * ```typescript
 * try {
 *   const config = await parseEpicOrThrow('./planning/example-epic');
 *   console.log(`Epic: ${config.name}`);
 * } catch (error) {
 *   console.error('Parse failed:', error);
 * }
 * ```
 */
export async function parseEpicOrThrow(
  epicDirectory: string,
): Promise<EpicConfig> {
  const result = await parseEpic({ epicDirectory });

  if (!result.success || !result.config) {
    const errorMessages = result.errors
      .map((e) => `[${e.type}] ${e.message}`)
      .join("\n");
    throw new Error(`Epic parsing failed:\n${errorMessages}`);
  }

  return result.config;
}

/**
 * Get epic summary statistics without full parsing
 *
 * @param epicDirectory - Path to epic directory
 * @returns Quick stats about the epic
 */
export async function getEpicStats(epicDirectory: string): Promise<{
  name: string;
  phaseCount: number;
  sprintCount: number;
  completionPercentage: number;
}> {
  const result = await parseEpic({ epicDirectory, validateOnly: true });

  if (!result.success || !result.config) {
    throw new Error("Failed to get epic stats");
  }

  const totalSprints = result.stats?.totalSprints || 0;
  const completedSprints = result.stats?.completedSprints || 0;
  const completionPercentage =
    totalSprints > 0 ? (completedSprints / totalSprints) * 100 : 0;

  return {
    name: result.config.name,
    phaseCount: result.stats?.totalPhases || 0,
    sprintCount: totalSprints,
    completionPercentage: Math.round(completionPercentage),
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Log parsing progress and results
 */
function logParsingProgress(validation: {
  valid: boolean;
  errors: ParseError[];
  warnings: ParseError[];
  stats?: {
    totalPhases: number;
    totalSprints: number;
    completedSprints: number;
    dependencyCount: number;
    cyclesDetected: number;
  };
}): void {
  if (validation.valid) {
    console.log("✅ Epic parsing completed successfully");
  } else {
    console.error(`❌ Epic parsing failed with ${validation.errors.length} error(s)`);
    validation.errors.forEach((err) => {
      const location = err.location
        ? ` at ${err.location.file}${err.location.line ? `:${err.location.line}` : ""}`
        : "";
      console.error(`  - [${err.type}] ${err.message}${location}`);
    });
  }

  // Display warnings
  if (validation.warnings.length > 0) {
    console.warn(`⚠️  ${validation.warnings.length} warning(s):`);
    validation.warnings.forEach((warn) => {
      const location = warn.location
        ? ` at ${warn.location.file}${warn.location.line ? `:${warn.location.line}` : ""}`
        : "";
      console.warn(`  - [${warn.type}] ${warn.message}${location}`);
    });
  }

  // Display stats
  if (validation.stats) {
    console.log("\n📊 Epic Statistics:");
    console.log(`  - Phases: ${validation.stats.totalPhases}`);
    console.log(`  - Sprints: ${validation.stats.totalSprints}`);
    console.log(
      `  - Completed: ${validation.stats.completedSprints}/${validation.stats.totalSprints} (${Math.round((validation.stats.completedSprints / validation.stats.totalSprints) * 100)}%)`,
    );
    console.log(`  - Dependencies: ${validation.stats.dependencyCount}`);

    if (validation.stats.cyclesDetected > 0) {
      console.warn(
        `  - ⚠️  Dependency cycles detected: ${validation.stats.cyclesDetected}`,
      );
    }
  }
}

/**
 * Format errors for CLI display
 */
export function formatErrors(errors: ParseError[]): string {
  return errors
    .map((err) => {
      const location = err.location
        ? ` at ${err.location.file}${err.location.line ? `:${err.location.line}` : ""}`
        : "";
      return `[${err.severity.toUpperCase()}] [${err.type}] ${err.message}${location}`;
    })
    .join("\n");
}

/**
 * Check if epic directory exists and has required files
 */
export function validateEpicDirectory(epicDirectory: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check if directory exists
  if (!fs.existsSync(epicDirectory)) {
    errors.push(`Epic directory not found: ${epicDirectory}`);
    return { valid: false, errors };
  }

  // Check if it's a directory
  const stat = fs.statSync(epicDirectory);
  if (!stat.isDirectory()) {
    errors.push(`Path is not a directory: ${epicDirectory}`);
    return { valid: false, errors };
  }

  // Check for EPIC_OVERVIEW.md
  const overviewPath = path.join(epicDirectory, "EPIC_OVERVIEW.md");
  if (!fs.existsSync(overviewPath)) {
    errors.push(`Missing EPIC_OVERVIEW.md in ${epicDirectory}`);
  }

  // Check for at least one phase file
  const files = fs.readdirSync(epicDirectory);
  const phaseFiles = files.filter(
    (f) => f.startsWith("phase-") && f.endsWith(".md"),
  );

  if (phaseFiles.length === 0) {
    errors.push(`No phase-*.md files found in ${epicDirectory}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  parseEpic,
  validateEpic,
  generateEpicConfig,
  parseEpicOrThrow,
  getEpicStats,
  validateEpicDirectory,
  formatErrors,
};
