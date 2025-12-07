/**
 * Shared TypeScript interfaces for MDAP library
 *
 * Central type definitions used across MDAP modules.
 * Extracted from Trigger.dev to create standalone library.
 */

// =============================================
// Core MDAP Types
// =============================================

/**
 * Represents a compiler error from TypeScript or other compilers
 */
export interface CompilerError {
  /** Error code (e.g., E0599, TS2304) */
  code: string;
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column?: number;
  /** Error message from compiler */
  message: string;
  /** Optional suggestion from compiler */
  suggestion?: string;
  /** File path where error occurred */
  filePath?: string;
  /** Severity level */
  severity?: 'error' | 'warning' | 'info';
}

/**
 * Instruction for fixing a specific error
 */
export interface FixInstruction {
  /** Line number to modify (1-indexed) */
  line: number;
  /** Action to perform */
  action: "replace" | "insert_before" | "insert_after" | "delete";
  /** New content (required for replace/insert actions) */
  content?: string;
  /** End line for multi-line replacements */
  endLine?: number;
  /** Original content being replaced (for validation) */
  original?: string;
  /** Reason for the fix */
  reason?: string;
}

/**
 * Represents a task decomposition result
 */
export interface DecomposedTask {
  /** Unique task identifier */
  id: string;
  /** Task title */
  title: string;
  /** Detailed task description */
  description: string;
  /** Priority level */
  priority: "critical" | "high" | "medium" | "low";
  /** Task dependencies */
  dependencies: string[];
  /** Rationale for decomposition */
  rationale?: string;
  /** Estimated effort (optional) */
  estimatedEffort?: number;
  /** Files involved (optional) */
  files?: string[];
}

/**
 * MDAP task execution result
 */
export interface MDAPResult {
  /** Whether the task succeeded */
  success: boolean;
  /** File path that was modified */
  filePath?: string;
  /** Number of lines written */
  linesWritten?: number;
  /** Confidence score (0.0-1.0) */
  confidence: number;
  /** Optional error message */
  error?: string;
  /** Execution duration in milliseconds */
  durationMs?: number;
}

// =============================================
// Provider Types
// =============================================

/**
 * Supported AI providers for MDAP
 */
export type AIProvider =
  | "zai"          // Z.ai (cost-optimized)
  | "kimi"         // Moonshot Kimi (balanced)
  | "anthropic"    // Anthropic Claude (premium)
  | "openrouter"   // OpenRouter (variable)
  | "gemini"       // Google Gemini
  | "xai";         // xAI Grok

// =============================================
// Validation Types
// =============================================

/**
 * Schema validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors if any */
  errors: string[];
  /** Warnings if any */
  warnings: string[];
  /** Additional metadata */
  metadata?: Record<string, any>;
}

// =============================================
// Memory and Performance Types
// =============================================

/**
 * Memory allocation tier for batching
 */
export type MemoryTier =
  | "tier1"  // 512MB - 1 file
  | "tier2"  // 600MB - 2-3 files
  | "tier3"  // 800MB - 4-8 files
  | "tier4"; // 1GB - 9+ files

/**
 * Batch configuration for parallel execution
 */
export interface BatchConfig {
  /** Unique batch identifier */
  batchId: string;
  /** Memory tier for this batch */
  tier: MemoryTier;
  /** List of files in this batch */
  files: string[];
  /** Total errors in batch */
  totalErrors: number;
  /** Memory allocation */
  memory: string;
  /** Coordination notes */
  coordinationNote?: string;
  /** Current iteration */
  iteration?: number;
}