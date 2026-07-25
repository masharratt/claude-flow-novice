/**
 * Performance Decomposer
 *
 * Analyzes tasks for performance considerations and decomposes into performance-focused micro-tasks.
 * Receives architecture and security context from previous decomposers to inform analysis.
 *
 * @module performance
 * @version 1.0.0 - Extracted from Trigger.dev
 */

import { callGLMWithThinking } from '../glm-client.js';
import { parseJSONFromResponse } from '../validation.js';
import type { ArchitectureAnalysis } from './architecture.js';
import type { SecurityAnalysis } from './security.js';

// =============================================
// Type Definitions
// =============================================

export interface PerformanceDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
  previousContext?: {
    architecture?: ArchitectureAnalysis;
    securityConstraints?: SecurityAnalysis;
    securityBoundaries?: any[];
  };
}

export interface PerformanceConstraint {
  metric: "latency" | "throughput" | "memory" | "cpu" | "bandwidth";
  target: string;
  rationale: string;
  impactedComponents: string[];
}

export interface PerformanceAnalysis {
  taskId: string;
  perspective: "performance";
  microTasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    rationale: string;
    metrics: string[];
  }>;
  performanceRecommendations: string[];
  performanceConstraints: PerformanceConstraint[];
  optimizationStrategy: string;
}

// =============================================
// Performance Decomposer Function
// =============================================

/**
 * Decompose a task from a performance perspective
 *
 * @param payload - Task description and metadata with optional context
 * @returns Performance analysis with micro-tasks
 */
export async function decomposePerformance(
  payload: PerformanceDecomposerPayload
): Promise<PerformanceAnalysis> {
  const startTime = Date.now();

  console.log(`[performance-decomposer] Analyzing task: ${payload.taskDescription.substring(0, 80)}...`);

  // Build context section if provided
  let contextSection = "";
  if (payload.previousContext?.architecture || payload.previousContext?.securityConstraints) {
    const parts = [];

    if (payload.previousContext.architecture) {
      const arch = payload.previousContext.architecture;
      parts.push(`ARCHITECTURE CONTEXT:
- Components: ${JSON.stringify(arch.components || [])}
- Boundaries: ${JSON.stringify(arch.boundaries || [])}`);
    }

    if (payload.previousContext.securityConstraints) {
      const sec = payload.previousContext.securityConstraints;
      parts.push(`SECURITY CONSTRAINTS:
- Security Recommendations: ${JSON.stringify(sec.securityRecommendations || [])}
- Security Boundaries: ${JSON.stringify(sec.securityBoundaries || [])}
- Risk Level: ${sec.riskLevel}`);
    }

    contextSection = `

${parts.join('\n\n')}

Use this context to identify performance implications:
- Inter-service calls → latency overhead, need caching
- Security encryption/auth → CPU overhead, need connection pooling
- Multiple boundaries → cascading failures, need circuit breakers
- Database access → query optimization, connection pooling`;
  }

  const prompt = `You are a performance engineer. Analyze this task for performance considerations and decompose into performance-focused micro-tasks.

Task: ${payload.taskDescription}${contextSection}

IMPORTANT: Return ONLY valid JSON with NO comments, NO trailing commas. Use double quotes for all strings.

Provide:
1. Performance-focused micro-tasks (ID, title, description, metrics)
2. Performance recommendations informed by architecture and security
3. Performance constraints (latency, throughput, memory targets)
4. Optimization strategy

Format as JSON:
{
  "microTasks": [
    {
      "id": "perf-1",
      "title": "...",
      "description": "...",
      "priority": "critical|high|medium|low",
      "rationale": "Performance optimization",
      "metrics": ["latency", "memory", ...]
    }
  ],
  "performanceRecommendations": ["...", "..."],
  "performanceConstraints": [
    {
      "metric": "latency|throughput|memory|cpu|bandwidth",
      "target": "< 100ms p95",
      "rationale": "User experience requirement",
      "impactedComponents": ["APIGateway", "AuthService"]
    }
  ],
  "optimizationStrategy": "..."
}`;

  try {
    // Call GLM with thinking enabled for performance reasoning
    const glmResult = await callGLMWithThinking(prompt, {
      temperature: 0.7,
      maxTokens: 2048,
    });

    console.log(`[performance-decomposer] GLM API: ${glmResult.durationMs}ms, ${glmResult.inputTokens}+${glmResult.outputTokens} tokens (thinking: ${glmResult.thinkingEnabled})`);

    // Parse JSON response with robust error handling
    const analysis = parseJSONFromResponse(glmResult.content, "performance-decomposer") as {
      microTasks?: Array<any>;
      performanceRecommendations?: string[];
      performanceConstraints?: PerformanceConstraint[];
      optimizationStrategy?: string;
    };

    // Validate and structure the result
    const result: PerformanceAnalysis = {
      taskId: payload.taskId,
      perspective: "performance",
      microTasks: (analysis.microTasks || []).map((task: any) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        rationale: task.rationale || "",
        metrics: task.metrics || [],
      })),
      performanceRecommendations: analysis.performanceRecommendations || [],
      performanceConstraints: analysis.performanceConstraints || [],
      optimizationStrategy: analysis.optimizationStrategy || "",
    };

    console.log(`[performance-decomposer] Success: ${result.microTasks.length} micro-tasks, ${result.performanceConstraints.length} constraints`);
    console.log(`  Time: ${Date.now() - startTime}ms`);

    return result;
  } catch (error) {
    const errorMsg = (error as Error).message;

    console.error(`[performance-decomposer] Critical Error: ${errorMsg}`);
    console.error(`[performance-decomposer] Context: taskId=${payload.taskId}, taskDescription length=${payload.taskDescription?.length || 0} chars`);

    // Re-throw with context
    throw new Error(
      `[performance-decomposer] Failed to decompose task: ${errorMsg}\n` +
      `This is a critical error. Performance analysis is mandatory for production tasks.\n` +
      `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
    );
  }
}