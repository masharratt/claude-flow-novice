/**
 * AI-Powered Epic Parser
 *
 * Converts natural language epic documents to structured JSON configuration
 * with comprehensive validation, dependency cycle detection, and error handling.
 *
 * Features:
 * - Markdown parsing with regex patterns
 * - Sprint extraction with status, dependencies, tasks
 * - Cross-phase dependency tracking
 * - Dependency cycle detection via DFS
 * - Comprehensive error and warning reporting
 * - Validation of sprint references and statuses
 */

import * as fs from "fs";
import * as path from "path";
import { PhaseParser } from "./phase-parser.js";
import { sanitizeFilePath, validateEpicDirectory } from "../utils/path-security.js";
import type {
  EpicConfig,
  Phase,
  CrossPhaseDependency,
  RiskAssessment,
  EpicParserOptions,
} from "./epic-parser-types.js";
import {
  validateEpicConfig,
  validateAndThrow,
  sanitizeObjectKeys,
} from "../validators/epic-config-schema.js";
import { MarkdownSanitizer } from "../utils/markdown-sanitizer.js";

// ============================================================================
// Enhanced Error Types
// ============================================================================

export interface ParseError {
  type:
    | "dependency_cycle"
    | "invalid_dependency"
    | "invalid_status"
    | "parsing_error"
    | "file_not_found"
    | "missing_field";
  message: string;
  location?: { file: string; line?: number };
  severity: "error" | "warning";
  details?: any;
}

export interface ValidationResult {
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
}

export class EpicParser {
  private epicDirectory: string;
  private overviewFile: string;
  private errors: ParseError[] = [];
  private warnings: ParseError[] = [];
  private parsingErrors: ParseError[] = [];
  private sprintRegistry: Map<string, any> = new Map();
  private phaseRegistry: Map<string, Phase> = new Map();

  constructor(options: EpicParserOptions) {
    // SECURITY: Validate epic directory is within allowed paths
    validateEpicDirectory(options.epicDirectory);

    this.epicDirectory = path.resolve(options.epicDirectory);
    this.overviewFile = options.overviewFile
      ? path.resolve(options.overviewFile)
      : path.join(this.epicDirectory, "EPIC_OVERVIEW.md");

    // Validate directory and overview file exist
    if (!fs.existsSync(this.epicDirectory)) {
      throw new Error(`Epic directory not found: ${this.epicDirectory}`);
    }

    if (!fs.existsSync(this.overviewFile)) {
      throw new Error(`Epic overview file not found: ${this.overviewFile}`);
    }
  }

  /**
   * Parse epic overview and all phase files with comprehensive validation
   */
  parse(): EpicConfig {
    // Reset state
    this.errors = [];
    this.warnings = [];
    this.parsingErrors = [];
    this.sprintRegistry.clear();
    this.phaseRegistry.clear();

    // Read and sanitize overview content (CVE-2025-006 mitigation)
    const rawOverviewContent = fs.readFileSync(this.overviewFile, "utf-8");
    const overviewContent = MarkdownSanitizer.sanitize(rawOverviewContent);
    const overviewLines = overviewContent.split("\n");

    // Extract epic metadata from overview
    const epicId = this.extractEpicId(overviewLines);
    const name = this.extractEpicName(overviewLines);
    const description = this.extractDescription(overviewLines);
    const status = this.extractStatus(overviewLines);
    const owner = this.extractFieldValue(overviewLines, "Owner") || "Unknown";
    const estimatedDuration =
      this.extractFieldValue(overviewLines, "Estimated Duration") || "Unknown";

    // Find and parse phase files
    const phaseFiles = this.findPhaseFiles(overviewContent);
    const phases = this.parsePhases(phaseFiles);

    // Build registries for validation
    this.buildRegistries(phases);

    // Extract epic-level acceptance criteria
    const epicAcceptanceCriteria =
      this.extractAcceptanceCriteria(overviewLines);

    // Extract cross-phase dependencies
    const crossPhaseDependencies =
      this.extractCrossPhaseDependencies(overviewLines);

    // Validate dependencies
    this.validateDependencies(phases, crossPhaseDependencies);

    // Detect dependency cycles
    this.detectDependencyCycles(phases, crossPhaseDependencies);

    // Validate sprint statuses
    this.validateSprintStatuses(phases);

    // Extract risk assessment
    const riskAssessment = this.extractRiskAssessment(overviewLines);

    // Check if parsing errors occurred
    if (this.hasErrors()) {
      throw new Error(
        `Epic parsing failed with ${this.errors.length + this.parsingErrors.length} errors:\n` +
        [...this.errors, ...this.parsingErrors].map(e => `  - [${e.type}] ${e.message}${e.location ? ` at ${e.location.file}` : ''}`).join('\n')
      );
    }

    const epicConfig: EpicConfig = {
      epicId,
      name,
      description,
      status,
      owner,
      estimatedDuration,
      overviewFile: path.relative(process.cwd(), this.overviewFile),
      phases,
      epicAcceptanceCriteria,
      crossPhaseDependencies,
      ...(riskAssessment && { riskAssessment }),
    };

    // Validate against JSON schema (CVE-2025-005 mitigation)
    try {
      validateAndThrow(epicConfig, validateEpicConfig);
    } catch (err) {
      throw new Error(
        `Epic config validation failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Sanitize object keys to prevent prototype pollution
    const sanitizedConfig = sanitizeObjectKeys(epicConfig) as EpicConfig;

    return sanitizedConfig;
  }

  /**
   * Parse epic and save to JSON file
   */
  parseAndSave(outputFile?: string): EpicConfig {
    const epicConfig = this.parse();

    const outputPath = outputFile
      ? path.resolve(outputFile)
      : path.join(this.epicDirectory, "epic-config.json");

    fs.writeFileSync(outputPath, JSON.stringify(epicConfig, null, 2), "utf-8");

    console.log(`✅ Epic config saved to: ${outputPath}`);

    return epicConfig;
  }

  /**
   * Extract epic ID from overview
   */
  private extractEpicId(lines: string[]): string {
    const epicIdValue = this.extractFieldValue(lines, "Epic ID");
    if (epicIdValue) {
      // Sanitize epic ID to prevent injection
      return MarkdownSanitizer.sanitizeId(epicIdValue, 'epic');
    }

    // Fallback: derive from directory name
    const dirName = path.basename(this.epicDirectory);
    return MarkdownSanitizer.sanitizeId(dirName, 'epic');
  }

  /**
   * Extract epic name (first H1 heading)
   */
  private extractEpicName(lines: string[]): string {
    for (const line of lines) {
      if (line.startsWith("# ") && !line.startsWith("##")) {
        return line.replace(/^#\s*/, "").trim();
      }
    }
    return "Unnamed Epic";
  }

  /**
   * Extract description from "Epic Description" section
   */
  private extractDescription(lines: string[]): string {
    let inDescription = false;
    const descriptionLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith("## Epic Description")) {
        inDescription = true;
        continue;
      }

      if (inDescription) {
        if (line.startsWith("##")) {
          break;
        }
        if (line.trim()) {
          descriptionLines.push(line.trim());
        }
      }
    }

    return descriptionLines.join(" ").trim() || "No description provided";
  }

  /**
   * Extract status from overview
   */
  private extractStatus(
    lines: string[],
  ): "not_started" | "in_progress" | "completed" {
    const statusLine = lines.find((line) => line.includes("**Status**"));
    if (!statusLine) return "not_started";

    if (
      statusLine.includes("✅") ||
      statusLine.toLowerCase().includes("completed")
    ) {
      return "completed";
    } else if (
      statusLine.includes("🔄") ||
      statusLine.toLowerCase().includes("in progress")
    ) {
      return "in_progress";
    } else {
      return "not_started";
    }
  }

  /**
   * Extract field value from markdown
   */
  private extractFieldValue(lines: string[], fieldName: string): string | null {
    const pattern = new RegExp(
      `\\*\\*${fieldName}\\*\\*:\\s*\`?([^\`\n]+)\`?`,
      "i",
    );
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    return null;
  }

  /**
   * Find phase files referenced in overview
   */
  private findPhaseFiles(overviewContent: string): string[] {
    const phaseFiles: string[] = [];

    // Match markdown links: **File**: `path/to/file.md` or [file.md](path/to/file.md)
    const filePatterns = [
      /\*\*File\*\*:\s*`([^`]+\.md)`/g,
      /\[([^\]]+\.md)\]\(([^)]+)\)/g,
    ];

    for (const pattern of filePatterns) {
      let match;
      while ((match = pattern.exec(overviewContent)) !== null) {
        const filePath = match[1] || match[2];
        if (filePath && !phaseFiles.includes(filePath)) {
          phaseFiles.push(filePath);
        }
      }
    }

    // If no files found in overview, scan directory for phase-*.md files
    if (phaseFiles.length === 0) {
      const files = fs.readdirSync(this.epicDirectory);
      phaseFiles.push(
        ...files
          .filter((f) => f.startsWith("phase-") && f.endsWith(".md"))
          .map((f) => path.join(this.epicDirectory, f)),
      );
    }

    return phaseFiles;
  }

  /**
   * Parse all phase files (CVE-2025-004: Path traversal prevention)
   */
  private parsePhases(phaseFiles: string[]): Phase[] {
    const phases: Phase[] = [];

    for (const relativeOrAbsolutePath of phaseFiles) {
      let absolutePath: string;

      try {
        // SECURITY CVE-2025-004: Sanitize file path to prevent directory traversal
        // This MUST happen BEFORE any file operations to prevent ../../../../etc/passwd attacks
        absolutePath = sanitizeFilePath(this.epicDirectory, relativeOrAbsolutePath);
      } catch (securityError) {
        this.parsingErrors.push({
          type: 'parsing_error',
          message: `Security validation failed for phase file: ${securityError instanceof Error ? securityError.message : String(securityError)}`,
          location: { file: relativeOrAbsolutePath },
          severity: 'error',
          details: securityError,
        });
        continue;
      }

      try {
        const phaseResult = PhaseParser.parsePhaseFile(absolutePath);

        const phase: Phase = {
          phaseId: phaseResult.phaseId,
          name: phaseResult.name,
          description: phaseResult.description,
          file: path.relative(process.cwd(), absolutePath),
          status: phaseResult.status,
          dependencies: phaseResult.dependencies,
          estimatedDuration: phaseResult.estimatedDuration,
          sprints: phaseResult.sprints,
        };

        phases.push(phase);
      } catch (error) {
        console.error(`❌ Error parsing phase file ${absolutePath}:`, error);

        // Collect parsing errors instead of swallowing them
        this.parsingErrors.push({
          type: 'parsing_error',
          message: `Failed to parse phase file: ${error instanceof Error ? error.message : String(error)}`,
          location: { file: absolutePath },
          severity: 'error',
          details: error,
        });
      }
    }

    return phases;
  }

  /**
   * Extract epic-level acceptance criteria
   */
  private extractAcceptanceCriteria(lines: string[]): string[] {
    const criteria: string[] = [];
    let inCriteria = false;

    for (const line of lines) {
      if (line.includes("## Acceptance Criteria")) {
        inCriteria = true;
        continue;
      }

      if (inCriteria) {
        if (line.startsWith("##")) {
          break;
        }

        // Match checkboxes or bullet points
        const bulletMatch = line.match(/^[-*]\s*\[.\]\s*(.+)|^[-*]\s+(.+)/);
        if (bulletMatch) {
          const criterion = (bulletMatch[1] || bulletMatch[2]).trim();
          criteria.push(criterion);
        }
      }
    }

    return criteria;
  }

  /**
   * Extract cross-phase dependencies
   */
  private extractCrossPhaseDependencies(
    lines: string[],
  ): CrossPhaseDependency[] {
    const dependencies: CrossPhaseDependency[] = [];
    let inNotes = false;

    for (const line of lines) {
      if (line.includes("## Notes")) {
        inNotes = true;
        continue;
      }

      if (inNotes) {
        if (line.startsWith("##")) {
          break;
        }

        // Match patterns like: "Phase 2 Sprint 2.2 depends on Phase 1 Sprint 1.3"
        const match = line.match(
          /Phase (\d+) Sprint ([\d.]+) depends on Phase (\d+) Sprint ([\d.]+)/i,
        );
        if (match) {
          dependencies.push({
            from: `phase-${match[1]}/sprint-${match[2]}`,
            to: `phase-${match[3]}/sprint-${match[4]}`,
            description: line.trim(),
          });
        }
      }
    }

    return dependencies;
  }

  /**
   * Extract risk assessment
   */
  private extractRiskAssessment(lines: string[]): RiskAssessment | null {
    let inRiskSection = false;
    let inHighRisk = false;
    let inMitigation = false;

    const highRisk: string[] = [];
    const mitigation: string[] = [];

    for (const line of lines) {
      if (line.includes("## Risk Assessment")) {
        inRiskSection = true;
        continue;
      }

      if (inRiskSection) {
        if (line.startsWith("## ") && !line.includes("Risk")) {
          break;
        }

        if (line.includes("**High Risk**")) {
          inHighRisk = true;
          inMitigation = false;
          continue;
        }

        if (line.includes("**Mitigation**")) {
          inHighRisk = false;
          inMitigation = true;
          continue;
        }

        const bulletMatch = line.match(/^[-*]\s+(.+)/);
        if (bulletMatch) {
          if (inHighRisk) {
            highRisk.push(bulletMatch[1].trim());
          } else if (inMitigation) {
            mitigation.push(bulletMatch[1].trim());
          }
        }
      }
    }

    if (highRisk.length === 0 && mitigation.length === 0) {
      return null;
    }

    return { highRisk, mitigation };
  }

  /**
   * Build sprint and phase registries for validation
   */
  private buildRegistries(phases: Phase[]): void {
    phases.forEach((phase) => {
      this.phaseRegistry.set(phase.phaseId, phase);
      phase.sprints?.forEach((sprint) => {
        this.sprintRegistry.set(sprint.sprintId, sprint);
      });
    });
  }

  /**
   * Validate all dependencies reference valid sprints/phases
   */
  private validateDependencies(
    phases: Phase[],
    crossPhase: CrossPhaseDependency[],
  ): void {
    // Validate sprint dependencies
    phases.forEach((phase) => {
      phase.sprints?.forEach((sprint) => {
        sprint.dependencies?.forEach((depId) => {
          if (!this.sprintRegistry.has(depId)) {
            this.errors.push({
              type: "invalid_dependency",
              message: `Invalid dependency "${depId}" in sprint ${sprint.sprintId}`,
              location: { file: phase.file },
              severity: "error",
            });
          }
        });
      });
    });

    // Validate cross-phase dependencies
    crossPhase.forEach((dep) => {
      const fromParts = dep.from.split("/");
      const toParts = dep.to.split("/");

      if (
        !this.sprintRegistry.has(dep.from) &&
        !this.phaseRegistry.has(fromParts[0])
      ) {
        this.errors.push({
          type: "invalid_dependency",
          message: `Cross-phase dependency "from" reference invalid: ${dep.from}`,
          severity: "error",
          details: dep,
        });
      }

      if (
        !this.sprintRegistry.has(dep.to) &&
        !this.phaseRegistry.has(toParts[0])
      ) {
        this.errors.push({
          type: "invalid_dependency",
          message: `Cross-phase dependency "to" reference invalid: ${dep.to}`,
          severity: "error",
          details: dep,
        });
      }
    });
  }

  /**
   * Detect dependency cycles using DFS algorithm
   */
  private detectDependencyCycles(
    phases: Phase[],
    crossPhase: CrossPhaseDependency[],
  ): void {
    const graph = new Map<string, string[]>();

    // Build adjacency list from sprint dependencies
    phases.forEach((phase) => {
      phase.sprints?.forEach((sprint) => {
        graph.set(sprint.sprintId, sprint.dependencies || []);
      });
    });

    // Add cross-phase dependencies to graph
    crossPhase.forEach((dep) => {
      const existing = graph.get(dep.from) || [];
      graph.set(dep.from, [...existing, dep.to]);
    });

    // DFS cycle detection
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string, path: string[]): boolean => {
      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, path)) return true;
        } else if (recStack.has(neighbor)) {
          // Cycle detected
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart).concat(neighbor);
          this.errors.push({
            type: "dependency_cycle",
            message: `Dependency cycle detected: ${cycle.join(" → ")}`,
            severity: "error",
            details: { cycle },
          });
          return true;
        }
      }

      recStack.delete(node);
      path.pop();
      return false;
    };

    // Check all nodes for cycles
    graph.forEach((_, node) => {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    });
  }

  /**
   * Validate sprint status format
   */
  private validateSprintStatuses(phases: Phase[]): void {
    const validStatuses = [
      "not_started",
      "in_progress",
      "completed",
      "❌",
      "🔄",
      "✅",
    ];

    phases.forEach((phase) => {
      phase.sprints?.forEach((sprint) => {
        if (!validStatuses.includes(sprint.status)) {
          this.warnings.push({
            type: "invalid_status",
            message: `Invalid status "${sprint.status}" in sprint ${sprint.sprintId}. Expected: ${validStatuses.join(", ")}`,
            location: { file: phase.file },
            severity: "warning",
          });
        }
      });
    });
  }

  /**
   * Check if parsing has errors
   */
  public hasErrors(): boolean {
    return this.errors.length > 0 || this.parsingErrors.length > 0;
  }

  /**
   * Get parsing errors
   */
  public getErrors(): ParseError[] {
    return [...this.errors, ...this.parsingErrors];
  }

  /**
   * Get parsing warnings
   */
  public getWarnings(): ParseError[] {
    return this.warnings;
  }

  /**
   * Get validation result with stats
   */
  public getValidationResult(): ValidationResult {
    const totalSprints = Array.from(this.sprintRegistry.values()).length;
    const completedSprints = Array.from(this.sprintRegistry.values()).filter(
      (s) => s.status === "✅" || s.status === "completed",
    ).length;

    const cyclesDetected = this.errors.filter(
      (e) => e.type === "dependency_cycle",
    ).length;

    return {
      valid: !this.hasErrors(),
      errors: [...this.errors, ...this.parsingErrors],
      warnings: this.warnings,
      stats: {
        totalPhases: this.phaseRegistry.size,
        totalSprints,
        completedSprints,
        dependencyCount: Array.from(this.sprintRegistry.values()).reduce(
          (sum, sprint) => sum + (sprint.dependencies?.length || 0),
          0,
        ),
        cyclesDetected,
      },
    };
  }

  /**
   * Validate epic config against schema
   */
  static validate(epicConfig: EpicConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Required fields
    if (!epicConfig.epicId) errors.push("Missing epicId");
    if (!epicConfig.name) errors.push("Missing name");
    if (!epicConfig.phases || epicConfig.phases.length === 0) {
      errors.push("Epic must have at least one phase");
    }

    // Validate phases
    epicConfig.phases.forEach((phase, idx) => {
      if (!phase.phaseId) errors.push(`Phase ${idx}: Missing phaseId`);
      if (!phase.name) errors.push(`Phase ${idx}: Missing name`);
      if (!phase.sprints || phase.sprints.length === 0) {
        errors.push(`Phase ${idx}: Must have at least one sprint`);
      }

      // Validate sprints
      phase.sprints?.forEach((sprint, sprintIdx) => {
        if (!sprint.sprintId) {
          errors.push(`Phase ${idx}, Sprint ${sprintIdx}: Missing sprintId`);
        }
        if (!sprint.name) {
          errors.push(`Phase ${idx}, Sprint ${sprintIdx}: Missing name`);
        }
        if (
          !sprint.acceptanceCriteria ||
          sprint.acceptanceCriteria.length === 0
        ) {
          errors.push(
            `Phase ${idx}, Sprint ${sprintIdx}: Missing acceptance criteria`,
          );
        }
      });
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// ============================================================================
// CLI Utilities
// ============================================================================

/**
 * Generate epic configuration JSON from markdown files
 */
export async function generateEpicConfig(
  epicDirectory: string,
  outputPath?: string,
): Promise<{ success: boolean; errors: ParseError[]; warnings: ParseError[] }> {
  try {
    const parser = new EpicParser({ epicDirectory });
    const config = parser.parse();
    const validation = parser.getValidationResult();

    if (!validation.valid) {
      console.error("❌ Failed to parse epic configuration");
      validation.errors.forEach((err) =>
        console.error(
          `  - [${err.type}] ${err.message}${err.location ? ` at ${err.location.file}:${err.location.line || ""}` : ""}`,
        ),
      );
      return {
        success: false,
        errors: validation.errors,
        warnings: validation.warnings,
      };
    }

    // Write to file if output path provided
    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(config, null, 2), "utf-8");
      console.log(`✅ Epic configuration generated: ${outputPath}`);
    }

    // Display warnings
    if (validation.warnings.length > 0) {
      console.warn(`⚠️  ${validation.warnings.length} warning(s):`);
      validation.warnings.forEach((warn) =>
        console.warn(`  - [${warn.type}] ${warn.message}`),
      );
    }

    // Display stats
    if (validation.stats) {
      console.log("\n📊 Epic Statistics:");
      console.log(`  - Phases: ${validation.stats.totalPhases}`);
      console.log(`  - Sprints: ${validation.stats.totalSprints}`);
      console.log(
        `  - Completed: ${validation.stats.completedSprints}/${validation.stats.totalSprints}`,
      );
      console.log(`  - Dependencies: ${validation.stats.dependencyCount}`);
    }

    return {
      success: true,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  } catch (error) {
    const parseError: ParseError = {
      type: "parsing_error",
      message: `Failed to parse epic: ${error instanceof Error ? error.message : String(error)}`,
      severity: "error",
      details: error,
    };
    return { success: false, errors: [parseError], warnings: [] };
  }
}

/**
 * Validate epic markdown structure without generating config
 */
export async function validateEpic(
  epicDirectory: string,
): Promise<{ valid: boolean; errors: ParseError[]; warnings: ParseError[] }> {
  try {
    const parser = new EpicParser({ epicDirectory });
    parser.parse();
    const validation = parser.getValidationResult();

    if (validation.valid) {
      console.log(
        `✅ Epic structure valid (${validation.stats?.totalSprints} sprints across ${validation.stats?.totalPhases} phases)`,
      );
    } else {
      console.error(
        `❌ Epic validation failed with ${validation.errors.length} error(s)`,
      );
      validation.errors.forEach((err) =>
        console.error(
          `  - [${err.type}] ${err.message}${err.location ? ` at ${err.location.file}:${err.location.line || ""}` : ""}`,
        ),
      );
    }

    return {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
    };
  } catch (error) {
    const parseError: ParseError = {
      type: "parsing_error",
      message: `Failed to validate epic: ${error instanceof Error ? error.message : String(error)}`,
      severity: "error",
      details: error,
    };
    return { valid: false, errors: [parseError], warnings: [] };
  }
}
