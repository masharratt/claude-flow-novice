/**
 * Types and Interfaces for Pattern Analyzer
 */

export type Priority = 'high' | 'medium' | 'low';
export type OutputFormat = 'json' | 'summary' | 'both';

/**
 * Configuration options for pattern analyzer
 */
export interface PatternAnalyzerConfig {
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  timeWindow: number; // days
  minOccurrences: number;
  minSimilarity: number; // 0.0 - 1.0
  minConfidence: number; // 0.0 - 1.0
  outputDir: string;
  outputFormat: OutputFormat;
  insertDb: boolean;
  verbose: boolean;
}

/**
 * Workflow step in a pattern
 */
export interface WorkflowStep {
  [key: string]: unknown;
}

/**
 * Reflection from database
 */
export interface WorkflowReflection {
  id: string;
  task_id: string;
  team_id: string;
  content: string;
  workflow_steps: WorkflowStep[];
  confidence: number;
  created_at: string;
  tags: string[];
  domain: string;
  output: string;
}

/**
 * Detected workflow pattern
 */
export interface WorkflowPattern {
  pattern_name: string;
  workflow_steps: WorkflowStep[];
  occurrence_count: number;
  teams_affected: string[];
  similarity_score: number;
  confidence_score: number;
  deterministic: boolean;
  estimated_savings_usd: number;
  priority: Priority;
  status: string;
}

/**
 * Analysis metadata
 */
export interface AnalysisMetadata {
  analysis_timestamp: string;
  time_window_days: number;
  total_reflections_analyzed: number;
  patterns_found: number;
  filters: {
    min_occurrences: number;
    min_similarity: number;
    min_confidence: number;
  };
}

/**
 * Pattern analysis report
 */
export interface PatternAnalysisReport {
  metadata: AnalysisMetadata;
  patterns: WorkflowPattern[];
}

/**
 * Grouped reflections by signature
 */
export interface WorkflowGroup {
  reflections: WorkflowReflection[];
  signature: string;
}

/**
 * Security constraints for input validation
 */
export interface SecurityConstraints {
  maxPathLength: number;
  maxFieldLength: number;
  maxArraySize: number;
  maxFileSize: number; // bytes
  maxDbQueryLength: number;
}

/**
 * Logger interface
 */
export interface ILogger {
  log(message: string): void;
  success(message: string): void;
  error(message: string): void;
  warning(message: string): void;
}

/**
 * PostgreSQL connection interface
 */
export interface PostgreSQLConnection {
  host: string;
  port: number;
  dbname: string;
  user: string;
  password?: string;
}

/**
 * Query result type guard
 */
export function isWorkflowReflection(obj: unknown): obj is WorkflowReflection {
  if (typeof obj !== 'object' || obj === null) return false;
  const ref = obj as Record<string, unknown>;
  return (
    typeof ref['id'] === 'string' &&
    typeof ref['task_id'] === 'string' &&
    typeof ref['team_id'] === 'string' &&
    typeof ref['content'] === 'string' &&
    Array.isArray(ref['workflow_steps']) &&
    typeof ref['confidence'] === 'number' &&
    typeof ref['created_at'] === 'string'
  );
}

/**
 * Validate configuration
 */
export function isValidPatternAnalyzerConfig(obj: unknown): obj is PatternAnalyzerConfig {
  if (typeof obj !== 'object' || obj === null) return false;
  const config = obj as Record<string, unknown>;
  return (
    typeof config['dbHost'] === 'string' &&
    typeof config['dbPort'] === 'number' &&
    typeof config['dbName'] === 'string' &&
    typeof config['dbUser'] === 'string' &&
    typeof config['timeWindow'] === 'number' &&
    typeof config['minOccurrences'] === 'number' &&
    typeof config['minSimilarity'] === 'number' &&
    typeof config['minConfidence'] === 'number' &&
    typeof config['outputDir'] === 'string' &&
    typeof config['outputFormat'] === 'string' &&
    typeof config['insertDb'] === 'boolean' &&
    typeof config['verbose'] === 'boolean'
  );
}

/**
 * Validate priority
 */
export function isValidPriority(value: string): value is Priority {
  return ['high', 'medium', 'low'].includes(value);
}

/**
 * Validate output format
 */
export function isValidOutputFormat(value: string): value is OutputFormat {
  return ['json', 'summary', 'both'].includes(value);
}
