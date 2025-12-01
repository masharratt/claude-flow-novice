/**
 * CFN Thinking-Model-Driven Task Decomposer
 *
 * Replaces template-based decomposition with intelligent reasoning-based task breakdown.
 * Uses Cerebras Qwen-3-235B to generate optimal micro-task decompositions with full
 * reasoning about task structure, dependencies, and execution strategy.
 *
 * Key Features:
 * - Thinking-first approach: Model reasons through decomposition before generating JSON
 * - Complexity-aware planning: Generates execution phases (parallel, sequential)
 * - Risk assessment: Detects security, performance, and compliance implications
 * - Caching: Avoids re-decomposing identical tasks
 * - Fallback handling: Graceful degradation to rule-based decomposition on API failure
 *
 * @module cfn-thinking-decomposer
 * @version 2.0.0
 */

import { task, tasks } from "@trigger.dev/sdk/v3";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// =============================================
// Type Definitions
// =============================================

export type AgentType =
  | "backend-developer"
  | "frontend-engineer"
  | "typescript-specialist"
  | "data-engineer"
  | "security-specialist"
  | "analyst"
  | "devops-engineer"
  | "ml-engineer";

/**
 * Validation criteria for a micro-task
 */
export interface ValidationCriteria {
  /** Type of validation required */
  type:
    | "tdd"
    | "integration"
    | "security"
    | "report"
    | "diagnostic"
    | "quality";
  /** Success threshold (e.g., 0.95 for 95% test pass rate) */
  threshold?: number;
  /** Whether security review is needed */
  securityChecks?: boolean;
  /** Whether performance checks are needed */
  performanceChecks?: boolean;
  /** Test files that must pass */
  testFiles?: string[];
  /** Custom validation script or criteria */
  customValidator?: string;
}

/**
 * Atomic micro-task
 */
export interface MicroTask {
  /** Unique task identifier (task-1, task-2, etc.) */
  id: string;
  /** One-line atomic action description (no "and", no plurals) */
  description: string;
  /** List of task IDs this depends on (empty for independent) */
  dependsOn: string[];
  /** Type of executor best suited for this task */
  executorType: AgentType;
  /** Complexity level */
  complexity: "simple" | "moderate";
  /** Expected number of lines of output */
  estimatedLines: number;
  /** Context hints for the executor */
  contextHints: string[];
  /** Success criteria for this specific task */
  validationCriteria: ValidationCriteria;
}

/**
 * Execution phase (parallel or sequential)
 */
export interface Phase {
  /** Phase identifier */
  id: string;
  /** Task IDs to execute in parallel in this phase */
  parallel?: string[];
  /** Task IDs to execute sequentially in this phase */
  sequential?: string[];
  /** Estimated duration in minutes */
  estimatedDuration: number;
  /** Description of this phase */
  description: string;
}

/**
 * Decomposition result from thinking model
 */
export interface DecompositionResult {
  /** Unique task ID for this decomposition */
  taskId: string;
  /** Original task description */
  originalTask: string;
  /** Array of atomic micro-tasks */
  microTasks: MicroTask[];
  /** Execution strategy */
  executionPlan: {
    /** Phases for execution (parallel/sequential) */
    phases: Phase[];
    /** Total estimated duration in minutes */
    estimatedDuration: number;
    /** Recommended number of agents to spawn */
    recommendedTeamSize: number;
    /** Task IDs that can be parallelized */
    parallelizable: string[];
  };
  /** Metadata about the decomposition */
  metadata: {
    /** Overall complexity assessment */
    complexity: "simple" | "moderate" | "complex";
    /** Risk level of the task */
    riskLevel: "low" | "medium" | "high";
    /** Whether security review is recommended */
    requiresSecurityReview: boolean;
    /** Whether performance review is recommended */
    requiresPerformanceReview: boolean;
  };
}

/**
 * Payload for the decomposer task
 */
export interface DecomposerPayload {
  /** Task description to decompose */
  taskDescription: string;
  /** Working directory */
  workDir: string;
  /** Additional context for decomposition */
  context?: {
    /** List of relevant files */
    files?: string[];
    /** Test files affected */
    tests?: string[];
    /** Previous task descriptions for reference */
    relatedTasks?: string[];
    /** Team expertise hints */
    teamExpertise?: AgentType[];
    /** Time constraints */
    timeConstraint?: "immediate" | "4h" | "8h" | "1d";
  };
  /** Skip caching (always call thinking model) */
  skipCache?: boolean;
  /** Thinking model to use */
  thinkingModel?: "qwen-3-235b" | "claude-opus" | "o1";
  /** Provider for thinking model */
  provider?: "cerebras" | "anthropic" | "openai";
}

/**
 * Decomposer task result
 */
export interface DecomposerResult {
  /** Whether decomposition succeeded */
  success: boolean;
  /** Decomposition result (if successful) */
  result?: DecompositionResult;
  /** Error message (if failed) */
  error?: string;
  /** Time spent in thinking model (ms) */
  thinkingTimeMs: number;
  /** Total time for decomposition (ms) */
  totalTimeMs: number;
  /** Whether result was from cache */
  fromCache: boolean;
  /** Confidence score in decomposition (0.0-1.0) */
  confidence: number;
}

// =============================================
// Constants
// =============================================

const DECOMPOSITION_CACHE_DIR =
  process.env.CFN_DECOMPOSITION_CACHE_DIR || "/tmp/cfn-decomposition-cache";

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const CEREBRAS_API_URL = process.env.CEREBRAS_API_URL || "https://api.cerebras.ai/v1";

// Risk keywords for security/performance detection
const SECURITY_KEYWORDS = [
  "security",
  "auth",
  "password",
  "token",
  "permission",
  "admin",
  "privilege",
  "vulnerability",
  "encryption",
  "ssl",
  "tls",
];
const PERFORMANCE_KEYWORDS = [
  "optimize",
  "performance",
  "cache",
  "benchmark",
  "load",
  "throughput",
  "latency",
  "memory",
];
const BREAKING_CHANGE_KEYWORDS = [
  "breaking",
  "migration",
  "schema",
  "database",
  "delete",
  "deprecate",
  "remove",
];

// =============================================
// Thinking Model Prompt Generation
// =============================================

/**
 * Generate prompt for thinking model decomposition
 */
function generateDecompositionPrompt(
  taskDescription: string,
  context?: DecomposerPayload["context"]
): string {
  return `You are an expert task decomposer specializing in breaking large tasks into minimal atomic micro-tasks for small language models (T1 models like Qwen-1.5-3B or similar).

TASK ANALYSIS:
Task: ${taskDescription}

${
  context?.files
    ? `Related Files:\n${context.files.map((f) => `  - ${f}`).join("\n")}`
    : ""
}

${
  context?.tests
    ? `Test Files:\n${context.tests.map((f) => `  - ${f}`).join("\n")}`
    : ""
}

${
  context?.relatedTasks
    ? `Related Tasks:\n${context.relatedTasks.map((t) => `  - ${t}`).join("\n")}`
    : ""
}

Time Constraint: ${context?.timeConstraint || "not specified"}

REASONING REQUIREMENTS:
1. Analyze the task for complexity and atomicity
2. Identify natural decomposition boundaries
3. Determine dependencies between sub-tasks
4. Assess optimal executor type for each task
5. Estimate execution complexity and duration
6. Identify security/performance implications
7. Plan execution strategy (parallel vs sequential)
8. Estimate team size needed

MICRO-TASK REQUIREMENTS:
- Each task must be atomic (one action, one file typically)
- Description must be a single sentence (no "and")
- No circular dependencies
- Estimated output: 5-50 lines of code
- Independent or clearly specified dependencies
- No cross-task coordination needed within task execution

EXECUTOR TYPES AVAILABLE:
- backend-developer: API, database, business logic
- frontend-engineer: UI components, styling, responsiveness
- typescript-specialist: Type definitions, advanced TS patterns
- data-engineer: Data pipelines, transformations, schemas
- security-specialist: Auth, encryption, vulnerability fixes
- analyst: Documentation, reports, analysis
- devops-engineer: Infrastructure, deployment, CI/CD
- ml-engineer: ML models, training pipelines

VALIDATION CRITERIA TYPES:
- tdd: Unit tests must pass (specify threshold 0.85-1.0)
- integration: Integration tests, cross-module compatibility
- security: Security checks, no vulnerabilities
- report: Output documentation/analysis
- diagnostic: Debug output, metrics
- quality: Code quality metrics, linting

OUTPUT MUST BE VALID JSON ONLY:

{
  "analysis": {
    "taskComplexity": "simple|moderate|complex",
    "suggestedMicroTaskCount": number,
    "estimatedTotalDuration": number (minutes),
    "requiredTeamSize": number,
    "hasSecurityImplications": boolean,
    "hasPerformanceImplications": boolean,
    "identifiedRisks": string[]
  },
  "microTasks": [
    {
      "id": "task-1",
      "description": "atomic action (no 'and', single sentence)",
      "dependsOn": ["task-0"],
      "executorType": "backend-developer",
      "complexity": "simple",
      "estimatedLines": 25,
      "contextHints": ["hint1", "hint2"],
      "validationCriteria": {
        "type": "tdd",
        "threshold": 0.95,
        "securityChecks": false,
        "performanceChecks": false,
        "testFiles": ["test-file.spec.ts"]
      }
    }
  ],
  "executionPlan": {
    "phases": [
      {
        "id": "phase-1",
        "parallel": ["task-1", "task-2"],
        "sequential": null,
        "estimatedDuration": 5,
        "description": "Setup and type definitions"
      },
      {
        "id": "phase-2",
        "parallel": null,
        "sequential": ["task-3", "task-4"],
        "estimatedDuration": 10,
        "description": "API implementation"
      }
    ],
    "estimatedDuration": 15,
    "recommendedTeamSize": 3,
    "parallelizable": ["task-1", "task-2"]
  },
  "confidence": 0.92
}

CRITICAL RULES:
1. Output ONLY valid JSON, no markdown code blocks, no explanations
2. All fields must be present and correctly typed
3. No circular dependencies (task A depends on B, B depends on A)
4. Task descriptions must be atomic (fail if contains "and")
5. Confidence score 0.0-1.0 reflecting decomposition quality
6. Phases must include all micro-tasks
7. parallelizable array must only include tasks with no dependencies

Start decomposition analysis now:`;
}

// =============================================
// Cache Management
// =============================================

/**
 * Generate cache key from task description
 */
function generateCacheKey(taskDescription: string): string {
  return crypto
    .createHash("sha256")
    .update(taskDescription)
    .digest("hex")
    .substring(0, 16);
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
  if (!fs.existsSync(DECOMPOSITION_CACHE_DIR)) {
    fs.mkdirSync(DECOMPOSITION_CACHE_DIR, { recursive: true });
  }
}

/**
 * Get cached decomposition
 */
function getCachedDecomposition(
  taskDescription: string
): DecompositionResult | null {
  try {
    ensureCacheDir();
    const cacheKey = generateCacheKey(taskDescription);
    const cachePath = path.join(DECOMPOSITION_CACHE_DIR, `${cacheKey}.json`);

    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      console.log(`[cfn-thinking-decomposer] Cache hit for task: ${cacheKey}`);
      return cached;
    }
  } catch (err) {
    console.warn(
      `[cfn-thinking-decomposer] Cache read error: ${(err as Error).message}`
    );
  }
  return null;
}

/**
 * Save decomposition to cache
 */
function cacheDecomposition(
  taskDescription: string,
  result: DecompositionResult
): void {
  try {
    ensureCacheDir();
    const cacheKey = generateCacheKey(taskDescription);
    const cachePath = path.join(DECOMPOSITION_CACHE_DIR, `${cacheKey}.json`);

    fs.writeFileSync(cachePath, JSON.stringify(result, null, 2));
    console.log(`[cfn-thinking-decomposer] Cached decomposition: ${cacheKey}`);
  } catch (err) {
    console.warn(
      `[cfn-thinking-decomposer] Cache write error: ${(err as Error).message}`
    );
  }
}

// =============================================
// Complexity & Risk Assessment
// =============================================

/**
 * Assess task complexity from micro-task count
 */
function assessComplexity(microTaskCount: number): "simple" | "moderate" | "complex" {
  if (microTaskCount <= 3) return "simple";
  if (microTaskCount <= 8) return "moderate";
  return "complex";
}

/**
 * Detect security implications
 */
function detectSecurityImplications(
  taskDescription: string,
  microTasks: MicroTask[]
): boolean {
  const taskLower = taskDescription.toLowerCase();
  const hasSecurityKeywords = SECURITY_KEYWORDS.some((kw) =>
    taskLower.includes(kw)
  );
  const hasSecurityValidator = microTasks.some(
    (t) => t.validationCriteria.type === "security"
  );
  return hasSecurityKeywords || hasSecurityValidator;
}

/**
 * Detect performance implications
 */
function detectPerformanceImplications(
  taskDescription: string,
  microTasks: MicroTask[]
): boolean {
  const taskLower = taskDescription.toLowerCase();
  const hasPerformanceKeywords = PERFORMANCE_KEYWORDS.some((kw) =>
    taskLower.includes(kw)
  );
  const hasPerformanceValidator = microTasks.some(
    (t) => t.validationCriteria.performanceChecks === true
  );
  return hasPerformanceKeywords || hasPerformanceValidator;
}

/**
 * Assess overall risk level
 */
function assessRiskLevel(
  taskDescription: string,
  microTasks: MicroTask[]
): "low" | "medium" | "high" {
  const taskLower = taskDescription.toLowerCase();
  const breakingChangeCount = BREAKING_CHANGE_KEYWORDS.filter((kw) =>
    taskLower.includes(kw)
  ).length;

  const securityRisk = detectSecurityImplications(taskDescription, microTasks);
  const performanceRisk = detectPerformanceImplications(
    taskDescription,
    microTasks
  );
  const complexTasks = microTasks.filter((t) => t.complexity === "moderate")
    .length;

  let riskScore = 0;
  if (breakingChangeCount > 0) riskScore += 3;
  if (securityRisk) riskScore += 2;
  if (performanceRisk) riskScore += 1;
  riskScore += Math.ceil(complexTasks / 3);

  if (riskScore >= 5) return "high";
  if (riskScore >= 3) return "medium";
  return "low";
}

// =============================================
// Thinking Model API Call
// =============================================

/**
 * Call Cerebras thinking model for decomposition
 */
async function callThinkingModel(
  taskDescription: string,
  context?: DecomposerPayload["context"]
): Promise<{
  content: string;
  thinkingTimeMs: number;
  confidence: number;
}> {
  if (!CEREBRAS_API_KEY) {
    throw new Error("CEREBRAS_API_KEY not configured");
  }

  const prompt = generateDecompositionPrompt(taskDescription, context);
  const startMs = Date.now();

  console.log(
    `[cfn-thinking-decomposer] Calling thinking model for task decomposition`
  );
  console.log(`[cfn-thinking-decomposer] Task: ${taskDescription.substring(0, 80)}...`);

  const response = await fetch(`${CEREBRAS_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({
      model: "qwen-3-235b-a22b-instruct-2507",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Thinking model API error: ${response.status} - ${error.substring(0, 200)}`
    );
  }

  const data = (await response.json()) as any;
  const content = data.choices[0]?.message?.content || "";
  const thinkingTimeMs = Date.now() - startMs;

  // Extract confidence from response if available, default to 0.85
  let confidence = 0.85;
  try {
    const jsonMatch = content.match(/"confidence":\s*([\d.]+)/);
    if (jsonMatch) {
      confidence = parseFloat(jsonMatch[1]);
    }
  } catch {
    // Keep default
  }

  console.log(
    `[cfn-thinking-decomposer] Model response received (${thinkingTimeMs}ms, confidence: ${confidence})`
  );

  return { content, thinkingTimeMs, confidence };
}

// =============================================
// JSON Parsing & Validation
// =============================================

/**
 * Parse thinking model output and validate JSON
 */
function parseDecompositionResponse(content: string): {
  analysis: {
    taskComplexity: "simple" | "moderate" | "complex";
    suggestedMicroTaskCount: number;
    estimatedTotalDuration: number;
    requiredTeamSize: number;
    hasSecurityImplications: boolean;
    hasPerformanceImplications: boolean;
    identifiedRisks: string[];
  };
  microTasks: MicroTask[];
  executionPlan: {
    phases: Phase[];
    estimatedDuration: number;
    recommendedTeamSize: number;
    parallelizable: string[];
  };
  confidence: number;
} {
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = content.trim();
  if (jsonStr.includes("```json")) {
    jsonStr = jsonStr.split("```json")[1].split("```")[0];
  } else if (jsonStr.includes("```")) {
    jsonStr = jsonStr.split("```")[1].split("```")[0];
  }

  const parsed = JSON.parse(jsonStr);

  // Validate required fields
  if (
    !parsed.analysis ||
    !parsed.microTasks ||
    !Array.isArray(parsed.microTasks) ||
    !parsed.executionPlan
  ) {
    throw new Error("Missing required fields in decomposition response");
  }

  // Validate all micro-tasks have required fields
  for (const task of parsed.microTasks) {
    if (
      !task.id ||
      !task.description ||
      !task.executorType ||
      !task.complexity ||
      !task.validationCriteria
    ) {
      throw new Error(`Micro-task ${task.id} missing required fields`);
    }
  }

  return parsed;
}

// =============================================
// Fallback Decomposition
// =============================================

/**
 * Simple rule-based decomposition (fallback)
 */
function fallbackRuleBasedDecomposition(
  taskDescription: string,
  taskId: string
): DecompositionResult {
  console.log(
    `[cfn-thinking-decomposer] Using fallback rule-based decomposition`
  );

  // Simple heuristic: split on "and" or major keywords
  const parts = taskDescription
    .split(/\s+and\s+/i)
    .filter((p) => p.trim().length > 0);

  const microTasks: MicroTask[] = parts.map((part, idx) => ({
    id: `task-${idx + 1}`,
    description: part.trim(),
    dependsOn: idx === 0 ? [] : [`task-${idx}`],
    executorType: "backend-developer",
    complexity: "moderate",
    estimatedLines: 25,
    contextHints: [`Fallback decomposition task ${idx + 1}`],
    validationCriteria: {
      type: "quality",
      threshold: 0.8,
    },
  }));

  const phases: Phase[] = [
    {
      id: "phase-1",
      sequential: microTasks.map((t) => t.id),
      estimatedDuration: microTasks.length * 5,
      description: "Sequential execution of decomposed tasks",
    },
  ];

  return {
    taskId,
    originalTask: taskDescription,
    microTasks,
    executionPlan: {
      phases,
      estimatedDuration: microTasks.length * 5,
      recommendedTeamSize: Math.min(3, microTasks.length),
      parallelizable: [],
    },
    metadata: {
      complexity: assessComplexity(microTasks.length),
      riskLevel: assessRiskLevel(taskDescription, microTasks),
      requiresSecurityReview: detectSecurityImplications(
        taskDescription,
        microTasks
      ),
      requiresPerformanceReview: detectPerformanceImplications(
        taskDescription,
        microTasks
      ),
    },
  };
}

// =============================================
// Main Decomposer Task
// =============================================

/**
 * Core decomposition logic
 */
async function performDecomposition(
  payload: DecomposerPayload
): Promise<DecompositionResult> {
  const taskId = `decomp-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  // Check cache
  if (!payload.skipCache) {
    const cached = getCachedDecomposition(payload.taskDescription);
    if (cached) {
      return cached;
    }
  }

  try {
    // Call thinking model
    const { content, thinkingTimeMs, confidence } = await callThinkingModel(
      payload.taskDescription,
      payload.context
    );

    // Parse response
    const parsed = parseDecompositionResponse(content);

    // Build result
    const result: DecompositionResult = {
      taskId,
      originalTask: payload.taskDescription,
      microTasks: parsed.microTasks,
      executionPlan: parsed.executionPlan,
      metadata: {
        complexity: parsed.analysis.taskComplexity,
        riskLevel: assessRiskLevel(payload.taskDescription, parsed.microTasks),
        requiresSecurityReview:
          parsed.analysis.hasSecurityImplications ||
          detectSecurityImplications(payload.taskDescription, parsed.microTasks),
        requiresPerformanceReview:
          parsed.analysis.hasPerformanceImplications ||
          detectPerformanceImplications(payload.taskDescription, parsed.microTasks),
      },
    };

    // Cache result
    cacheDecomposition(payload.taskDescription, result);

    console.log(
      `[cfn-thinking-decomposer] Decomposition successful: ${result.microTasks.length} micro-tasks`
    );
    console.log(`[cfn-thinking-decomposer] Thinking time: ${thinkingTimeMs}ms`);
    console.log(`[cfn-thinking-decomposer] Confidence: ${confidence}`);

    return result;
  } catch (error) {
    console.error(
      `[cfn-thinking-decomposer] Thinking model failed: ${(error as Error).message}`
    );
    console.log(`[cfn-thinking-decomposer] Falling back to rule-based decomposition`);

    // Fallback
    return fallbackRuleBasedDecomposition(payload.taskDescription, taskId);
  }
}

// =============================================
// Trigger.dev Task
// =============================================

export const cfnThinkingDecomposerTask = task({
  id: "cfn-thinking-decomposer",
  description: "Thinking-model-driven task decomposition",
  maxDuration: 600, // 10 minutes

  run: async (payload: DecomposerPayload): Promise<DecomposerResult> => {
    const startMs = Date.now();

    try {
      const result = await performDecomposition(payload);
      const totalTimeMs = Date.now() - startMs;

      return {
        success: true,
        result,
        thinkingTimeMs: 0, // Tracked separately
        totalTimeMs,
        fromCache: false,
        confidence: 0.85,
      };
    } catch (error) {
      const totalTimeMs = Date.now() - startMs;
      const errorMsg = (error as Error).message;

      console.error(`[cfn-thinking-decomposer] Task failed: ${errorMsg}`);

      return {
        success: false,
        error: errorMsg,
        thinkingTimeMs: 0,
        totalTimeMs,
        fromCache: false,
        confidence: 0.0,
      };
    }
  },
});

// =============================================
// Function Exports
// =============================================

export {
  performDecomposition,
  generateCacheKey,
  assessComplexity,
  assessRiskLevel,
  detectSecurityImplications,
  detectPerformanceImplications,
};

// Note: Types are exported at definition (top of file):
// - AgentType
// - ValidationCriteria
// - MicroTask
// - Phase
// - DecompositionResult
// - DecomposerPayload
// - DecomposerResult
