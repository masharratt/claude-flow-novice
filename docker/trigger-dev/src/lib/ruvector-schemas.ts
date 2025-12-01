/**
 * RuVector Schema Definitions for CFN Loop v3 Learning Systems
 *
 * Defines TypeScript interfaces for all 5 RuVector collections:
 * 1. DecompositionHistoryEntry - Task decomposition patterns and success metrics
 * 2. CodebaseIndexEntry - Semantic index of code files and relationships
 * 3. ErrorLibraryEntry - Error patterns, root causes, and fixes
 * 4. SecurityPatternEntry - Security vulnerabilities and prevention strategies
 * 5. PerformancePatternEntry - Performance issues and optimization strategies
 *
 * Each interface includes:
 * - text: Vector embedding source (combined content for semantic search)
 * - metadata: Structured data for filtering and analytics
 *
 * Reference: planning/DECOMPOSITION_SWARM_RUVECTOR_IMPLEMENTATION_PLAN.md (lines 154-346)
 */

// =============================================
// Collection 1: Decomposition History
// =============================================

/**
 * Decomposition History Entry
 *
 * Stores successful task decomposition patterns for reuse in similar tasks.
 * Enables learning which decomposition approaches work best for different
 * task categories and complexity levels.
 *
 * Use cases:
 * - Find similar past decompositions for new tasks (RAG)
 * - Analyze which approaches lead to highest success rates
 * - Track decomposition quality over time
 * - Suggest decomposition strategies based on task category
 */
export interface DecompositionHistoryEntry {
  /**
   * Vector embedding source
   * Combines task description and decomposition approach for semantic search
   * Format: "<originalTask> | Approach: <decompositionApproach>"
   */
  text: string;

  /**
   * Structured metadata for filtering and analytics
   */
  metadata: {
    // Task identification
    /** Unique task identifier from CFN Loop execution */
    taskId: string;

    /** Original task description provided by user */
    originalTask: string;

    /** Decomposition strategy used (e.g., "sequential context passing", "parallel batch") */
    decompositionApproach: string;

    /** Number of micro-tasks created */
    microTaskCount: number;

    /** Number of execution phases (waves) */
    executionPhases: number;

    // Performance metrics
    /** Gate check score from Loop 3 validation (0.0-1.0) */
    gateCheckScore: number;

    /** Gate check threshold for the mode used (0.70-0.98) */
    gateCheckThreshold: number;

    /** Final product owner decision */
    finalDecision: 'PROCEED' | 'ITERATE' | 'ABORT';

    // Quality metrics
    /** Highest security risk level found (critical > high > medium > low) */
    securityRiskLevel: 'critical' | 'high' | 'medium' | 'low';

    /** Total number of security findings */
    securityFindings: number;

    /** Performance grade from async validator (A-F) */
    performanceGrade: string;

    /** Performance score (0-100) */
    performanceScore: number;

    // Timing
    /** Unix timestamp of decomposition completion */
    timestamp: number;

    /** Time spent on decomposition phase (ms) */
    decompositionTimeMs: number;

    /** Time spent on execution phase (ms) */
    executionTimeMs: number;

    /** Total time from start to completion (ms) */
    totalTimeMs: number;

    // Reusability
    /** Success rate when this pattern is reused (0.0-1.0) */
    successRate: number;

    /** Number of times this decomposition pattern was reused */
    timesUsed: number;

    /** Unix timestamp of last reuse */
    lastUsed: number;

    // Tags for searching
    /** Task category (e.g., "api-endpoint", "database-migration", "ui-component") */
    taskCategory: string;

    /** Task complexity level */
    complexity: 'simple' | 'moderate' | 'complex';

    /** Technologies involved (e.g., ["TypeScript", "React", "PostgreSQL"]) */
    technologies: string[];
  };
}

// =============================================
// Collection 2: Codebase Index
// =============================================

/**
 * Codebase Index Entry
 *
 * Semantic index of code files with metadata for dependency tracking,
 * relationships, and code metrics. Enables intelligent file selection
 * when planning micro-tasks.
 *
 * Use cases:
 * - Find related files when modifying a component
 * - Understand file purpose and exports before editing
 * - Track which agents created which files
 * - Identify files with similar purposes
 */
export interface CodebaseIndexEntry {
  /**
   * Vector embedding source
   * Combines file content, purpose, and exports for semantic search
   * Format: "<fileContent> | Purpose: <purpose> | Exports: <exports.join(', ')>"
   */
  text: string;

  /**
   * Structured metadata for filtering and analytics
   */
  metadata: {
    // File identification
    /** Absolute or workspace-relative file path */
    filePath: string;

    /** File name with extension */
    fileName: string;

    /** File extension (ts, tsx, js, py, rs, etc.) */
    fileType: string;

    /** Brief description of file's purpose */
    purpose: string;

    /** Exported functions, classes, types, etc. */
    exports: string[];

    /** Imported modules and dependencies */
    dependencies: string[];

    // Code metrics
    /** Total lines of code (including comments) */
    lines: number;

    /** Cyclomatic complexity score */
    complexity: number;

    /** Test coverage percentage (0-100) */
    coverage: number;

    // History
    /** Unix timestamp of file creation */
    createdAt: number;

    /** Unix timestamp of last modification */
    lastModified: number;

    /** Agent ID or name that created this file */
    agentWhoCreated: string;

    // Relationships
    /** Task IDs that modified this file */
    relatedMicroTasks: string[];

    /** Related file paths (imported/exported dependencies) */
    relatedFiles: string[];

    // Tags
    /** Technologies used in file (e.g., ["React", "Redux", "Axios"]) */
    technologies: string[];

    /** Design patterns used (e.g., ["singleton", "factory", "observer"]) */
    patterns: string[];

    /** Custom tags for categorization */
    tags: string[];
  };
}

// =============================================
// Collection 3: Error Library
// =============================================

/**
 * Error Library Entry
 *
 * Stores error patterns, root causes, fixes, and causality chains.
 * Enables fast error resolution by learning from past errors.
 *
 * Use cases:
 * - Match new errors to known patterns
 * - Suggest fixes based on past successful resolutions
 * - Identify error causality chains
 * - Track error frequency and severity trends
 */
export interface ErrorLibraryEntry {
  /**
   * Vector embedding source
   * Combines error message, stack trace, root cause, and fix
   * Format: "<errorMessage> | Root Cause: <rootCause> | Fix: <fix>"
   */
  text: string;

  /**
   * Structured metadata for filtering and analytics
   */
  metadata: {
    // Error identification
    /** Full error message as seen in logs */
    errorMessage: string;

    /** Error class/type (TypeError, ReferenceError, etc.) */
    errorType: string;

    /** Regex pattern for matching similar errors */
    errorPattern: string;

    // Root cause & fix
    /** Explanation of why the error occurred */
    rootCause: string;

    /** Confidence in root cause analysis (0.0-1.0) */
    rootCauseConfidence: number;

    /** Code fix or remediation steps */
    fix: string;

    /** Success rate of this fix when applied (0.0-1.0) */
    fixSuccessRate: number;

    /** How to prevent this error in the future */
    prevention: string;

    // Statistics
    /** Number of times this error has been seen */
    timesSeen: number;

    /** Unix timestamp of first occurrence */
    firstSeen: number;

    /** Unix timestamp of last occurrence */
    lastSeen: number;

    // Component info
    /** Component or module where error occurs */
    component: string;

    /** Programming language (TypeScript, Python, etc.) */
    language: string;

    /** Framework or library (React, Express, etc.) */
    framework: string;

    // Severity
    /** Error severity level */
    severity: 'critical' | 'high' | 'medium' | 'low';

    /** Environments where error has been seen */
    environments: string[];

    // Causality
    /** Error IDs that cause this error (upstream dependencies) */
    causedBy: string[];

    /** Error IDs that this error causes (downstream effects) */
    causes: string[];

    /** Confidence in causality relationship (0.0-1.0) */
    causeConfidence: number;
  };
}

// =============================================
// Collection 4: Security Patterns
// =============================================

/**
 * Security Pattern Entry
 *
 * Stores security vulnerabilities, common patterns, and prevention strategies.
 * Enables proactive security validation by learning from past findings.
 *
 * Use cases:
 * - Identify vulnerability patterns in new code
 * - Suggest security best practices for task categories
 * - Track vulnerability co-occurrence
 * - Prioritize security reviews based on severity
 */
export interface SecurityPatternEntry {
  /**
   * Vector embedding source
   * Combines code snippet and vulnerability description
   * Format: "<codeSnippet> | Vulnerability: <vulnerabilityType> | Findings: <findings.join('; ')>"
   */
  text: string;

  /**
   * Structured metadata for filtering and analytics
   */
  metadata: {
    // Pattern identification
    /** Name of security pattern (e.g., "SQL Injection in Search", "XSS in User Input") */
    patternName: string;

    /** Task category where pattern was found */
    taskCategory: string;

    /** Type of vulnerability (injection, xss, auth, crypto, etc.) */
    vulnerabilityType: string;

    // Findings
    /** List of specific security findings */
    findings: string[];

    /** Number of critical severity findings */
    criticalFindingsCount: number;

    /** Number of high severity findings */
    highFindingsCount: number;

    // Learning
    /** Number of times this pattern has been seen */
    occurrenceCount: number;

    /** Overall vulnerability score (0-100, higher = more severe) */
    vulnerabilityScore: number;

    // Patterns
    /** Common vulnerabilities in this pattern */
    commonVulnerabilities: string[];

    /** Which vulnerabilities appear together (co-occurrence counts) */
    vulnerabilityCooccurrence: Record<string, number>;

    // Prevention
    /** Strategies to prevent this vulnerability */
    preventionStrategies: string[];

    /** Security best practices to follow */
    bestPractices: string[];

    // Historical
    /** Unix timestamp of first occurrence */
    firstSeen: number;

    /** Unix timestamp of last occurrence */
    lastSeen: number;

    // Tagging
    /** Technologies involved (e.g., ["Express", "PostgreSQL"]) */
    technologies: string[];

    /** CWE (Common Weakness Enumeration) IDs */
    cwe: string[];
  };
}

// =============================================
// Collection 5: Performance Patterns
// =============================================

/**
 * Performance Pattern Entry
 *
 * Stores performance issues, optimization strategies, and expected improvements.
 * Enables proactive performance optimization by learning from past issues.
 *
 * Use cases:
 * - Identify performance anti-patterns in new code
 * - Suggest optimizations based on similar past issues
 * - Track performance issue co-occurrence
 * - Estimate impact of optimizations
 */
export interface PerformancePatternEntry {
  /**
   * Vector embedding source
   * Combines code snippet and performance issues
   * Format: "<codeSnippet> | Issues: <issues.join('; ')> | Grade: <performanceGrade>"
   */
  text: string;

  /**
   * Structured metadata for filtering and analytics
   */
  metadata: {
    // Pattern identification
    /** Name of performance pattern (e.g., "N+1 Queries in User List", "Unbounded Memory Growth") */
    patternName: string;

    /** Task category where pattern was found */
    taskCategory: string;

    /** Type of issue (complexity, memory, io, network, etc.) */
    issueType: string;

    // Issues
    /** List of specific performance issues */
    issues: string[];

    /** Number of critical performance issues */
    criticalIssuesCount: number;

    // Learning
    /** Number of times this pattern has been seen */
    occurrenceCount: number;

    /** Performance grade (A-F) */
    performanceGrade: string;

    /** Performance score (0-100, higher = better performance) */
    performanceScore: number;

    // Patterns
    /** Common performance issues in this pattern */
    commonIssues: string[];

    /** Which issues appear together (co-occurrence counts) */
    issueCooccurrence: Record<string, number>;

    // Optimization
    /** Strategies to optimize this pattern */
    optimizationStrategies: string[];

    /** Expected improvement metrics (e.g., {"memory": "50% reduction", "latency": "2x faster"}) */
    expectedImprovement: Record<string, string>;

    // Metrics
    /** Estimated throughput (tasks/second) */
    estimatedThroughput: number;

    /** Estimated latency (milliseconds) */
    estimatedLatency: number;

    /** Estimated memory usage (megabytes) */
    estimatedMemory: number;

    // Historical
    /** Unix timestamp of first occurrence */
    firstSeen: number;

    /** Unix timestamp of last occurrence */
    lastSeen: number;

    // Tagging
    /** Technologies involved (e.g., ["React", "Redux"]) */
    technologies: string[];

    /** Frameworks used (e.g., ["Express", "FastAPI"]) */
    frameworks: string[];
  };
}

// =============================================
// Type Guards
// =============================================

/**
 * Type guard for DecompositionHistoryEntry
 */
export function isDecompositionHistoryEntry(obj: any): obj is DecompositionHistoryEntry {
  return (
    typeof obj === 'object' &&
    typeof obj.text === 'string' &&
    typeof obj.metadata === 'object' &&
    typeof obj.metadata.taskId === 'string' &&
    typeof obj.metadata.decompositionApproach === 'string'
  );
}

/**
 * Type guard for CodebaseIndexEntry
 */
export function isCodebaseIndexEntry(obj: any): obj is CodebaseIndexEntry {
  return (
    typeof obj === 'object' &&
    typeof obj.text === 'string' &&
    typeof obj.metadata === 'object' &&
    typeof obj.metadata.filePath === 'string' &&
    Array.isArray(obj.metadata.exports)
  );
}

/**
 * Type guard for ErrorLibraryEntry
 */
export function isErrorLibraryEntry(obj: any): obj is ErrorLibraryEntry {
  return (
    typeof obj === 'object' &&
    typeof obj.text === 'string' &&
    typeof obj.metadata === 'object' &&
    typeof obj.metadata.errorMessage === 'string' &&
    typeof obj.metadata.errorType === 'string'
  );
}

/**
 * Type guard for SecurityPatternEntry
 */
export function isSecurityPatternEntry(obj: any): obj is SecurityPatternEntry {
  return (
    typeof obj === 'object' &&
    typeof obj.text === 'string' &&
    typeof obj.metadata === 'object' &&
    typeof obj.metadata.patternName === 'string' &&
    typeof obj.metadata.vulnerabilityType === 'string'
  );
}

/**
 * Type guard for PerformancePatternEntry
 */
export function isPerformancePatternEntry(obj: any): obj is PerformancePatternEntry {
  return (
    typeof obj === 'object' &&
    typeof obj.text === 'string' &&
    typeof obj.metadata === 'object' &&
    typeof obj.metadata.patternName === 'string' &&
    typeof obj.metadata.issueType === 'string'
  );
}

// =============================================
// Collection 6: MDAP Model Performance
// =============================================

/**
 * MDAP Model Performance Entry
 *
 * Stores MDAP model execution metrics for performance analysis
 * and intelligent tier selection. Enables learning which models
 * perform best for different task types.
 *
 * Use cases:
 * - Track model success rates and quality scores
 * - Identify underperforming models for deprecation
 * - Generate prompt optimization recommendations
 * - Route tasks to best-performing models
 */
export interface MDAPModelPerformanceEntry {
  /**
   * Vector embedding source
   * Combines model context and task pattern for semantic search
   * Format: "<modelName> | Tier: <tier> | TaskType: <taskType> | Patterns: <failurePatterns.join('; ')>"
   */
  text: string;

  /**
   * Structured metadata for filtering and analytics
   */
  metadata: {
    // Model identification
    /** Model name (e.g., "openai/gpt-oss-20b", "openai/gpt-oss-120b") */
    modelName: string;

    /** Tier level (1-3, where 1=haiku, 2=sonnet, 3=opus) */
    tier: 1 | 2 | 3;

    /** Canonical tier name */
    tierName: 'haiku' | 'sonnet' | 'opus';

    // Task classification
    /** Task type that was executed */
    taskType: 'simple' | 'moderate' | 'complex';

    /** Task category (e.g., "implementation", "refactoring", "testing") */
    taskCategory: string;

    // Performance metrics
    /** Success rate over all attempts (0.0-1.0) */
    successRate: number;

    /** Average validator quality score (0.0-1.0) */
    avgQualityScore: number;

    /** Average execution duration in milliseconds */
    avgDurationMs: number;

    /** Average cost per execution */
    avgCost: number;

    /** Total execution attempts */
    totalAttempts: number;

    /** Successful attempts */
    successfulAttempts: number;

    /** Failed attempts */
    failedAttempts: number;

    // Failure analysis
    /** List of recurring failure patterns */
    failurePatterns: string[];

    /** Frequency of each failure pattern */
    failurePatternFrequency: Record<string, number>;

    /** Common error types encountered */
    commonErrorTypes: string[];

    // Tier escalation tracking
    /** Number of times escalation was triggered from this tier */
    escalationCount: number;

    /** Average number of retries before success */
    avgRetriesBeforeSuccess: number;

    // Timing
    /** Unix timestamp of first recorded execution */
    firstSeen: number;

    /** Unix timestamp of most recent execution */
    lastSeen: number;

    /** Time window for metrics (hours) */
    timeWindowHours: number;

    // Status
    /** Whether model is marked as deprecated */
    isDeprecated: boolean;

    /** Deprecation reason if applicable */
    deprecationReason?: string;
  };
}

// =============================================
// Collection 7: Prompt Optimization Recommendations
// =============================================

/**
 * Prompt Optimization Recommendation Entry
 *
 * Stores AI-generated recommendations for improving prompts
 * based on failure patterns and success analysis.
 *
 * Use cases:
 * - Suggest prompt improvements based on failure patterns
 * - Track which prompt modifications improve success rates
 * - Build a library of effective prompt patterns
 * - Auto-enhance prompts for struggling models
 */
export interface PromptOptimizationRecommendationEntry {
  /**
   * Vector embedding source
   * Combines issue context and recommendation for semantic search
   * Format: "<modelName> T<tier> | Issue: <issue> | Recommendation: <recommendedAdditions.join('; ')>"
   */
  text: string;

  /**
   * Structured metadata for filtering and analytics
   */
  metadata: {
    // Target identification
    /** Model name this recommendation applies to */
    modelName: string;

    /** Tier level (1-3) */
    tier: 1 | 2 | 3;

    /** Task type this recommendation targets */
    taskType: string;

    // Issue analysis
    /** Type of issue being addressed */
    issue: 'low_quality' | 'high_failure_rate' | 'slow_execution' | 'type_errors' | 'runtime_errors' | 'incomplete_output';

    /** Issue severity (1-10, higher = more severe) */
    issueSeverity: number;

    /** Detailed description of the issue */
    issueDescription: string;

    // Current state
    /** Current prompt features/patterns being used */
    currentPromptFeatures: string[];

    /** Failure examples that led to this recommendation */
    failureExamples: string[];

    // Recommendations
    /** Suggested prompt additions/modifications */
    recommendedAdditions: string[];

    /** Suggested prompt removals */
    recommendedRemovals: string[];

    /** Priority level for applying this recommendation */
    priority: 'critical' | 'high' | 'medium' | 'low';

    /** Rationale explaining why this change helps */
    rationale: string;

    // Effectiveness tracking
    /** Confidence in this recommendation (0.0-1.0) */
    confidence: number;

    /** Number of attempts this recommendation is based on */
    basedOnAttempts: number;

    /** Whether this recommendation has been applied */
    applied: boolean;

    /** Success rate after applying recommendation (if applied) */
    postApplicationSuccessRate?: number;

    /** Improvement delta (postSuccessRate - preSuccessRate) */
    improvementDelta?: number;

    // Timing
    /** Unix timestamp when recommendation was generated */
    timestamp: number;

    /** Unix timestamp when recommendation was applied (if applied) */
    appliedAt?: number;
  };
}

// =============================================
// MDAP Type Guards
// =============================================

/**
 * Type guard for MDAPModelPerformanceEntry
 */
export function isMDAPModelPerformanceEntry(obj: any): obj is MDAPModelPerformanceEntry {
  return (
    typeof obj === 'object' &&
    typeof obj.text === 'string' &&
    typeof obj.metadata === 'object' &&
    typeof obj.metadata.modelName === 'string' &&
    typeof obj.metadata.tier === 'number' &&
    typeof obj.metadata.successRate === 'number'
  );
}

/**
 * Type guard for PromptOptimizationRecommendationEntry
 */
export function isPromptOptimizationRecommendationEntry(obj: any): obj is PromptOptimizationRecommendationEntry {
  return (
    typeof obj === 'object' &&
    typeof obj.text === 'string' &&
    typeof obj.metadata === 'object' &&
    typeof obj.metadata.modelName === 'string' &&
    typeof obj.metadata.tier === 'number' &&
    typeof obj.metadata.issue === 'string' &&
    Array.isArray(obj.metadata.recommendedAdditions)
  );
}
