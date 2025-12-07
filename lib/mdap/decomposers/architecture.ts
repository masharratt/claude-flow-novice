/**
 * Architecture Decomposer
 *
 * Analyzes tasks for architectural concerns and decomposes into atomic micro-tasks.
 * This is the baseline decomposer - runs first with no prior context.
 *
 * @module architecture
 * @version 1.0.0 - Extracted from Trigger.dev
 */

import { callGLMWithThinking } from '../glm-client.js';
import { parseJSONFromResponse } from '../validation.js';

// =============================================
// Type Definitions
// =============================================

export interface ArchitectureDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
  previousContext?: never; // Architecture is baseline, no context
}

export interface ArchitectureComponent {
  name: string;
  type: "service" | "api" | "database" | "frontend" | "middleware" | "gateway";
  responsibilities: string[];
  dependencies: string[];
}

export interface ArchitectureBoundary {
  from: string;
  to: string;
  type: "sync" | "async" | "event" | "data";
  protocol?: string;
  constraints?: string[];
}

export interface ArchitectureAnalysis {
  taskId: string;
  perspective: "architecture";
  microTasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    rationale: string;
    dependencies: string[];
  }>;
  recommendations: string[];
  components: ArchitectureComponent[];
  boundaries: ArchitectureBoundary[];
}

// =============================================
// Architecture Decomposer Function
// =============================================

/**
 * Decompose a task from an architectural perspective
 *
 * @param payload - Task description and metadata
 * @returns Architectural analysis with micro-tasks
 */
export async function decomposeArchitecture(
  payload: ArchitectureDecomposerPayload
): Promise<ArchitectureAnalysis> {
  const startTime = Date.now();

  console.log(`[architecture-decomposer] Analyzing task: ${payload.taskDescription.substring(0, 80)}...`);

  const prompt = `You are an expert software architect. Analyze this task and decompose it into atomic micro-tasks focusing on architectural concerns.

Task: ${payload.taskDescription}

Provide:
1. List of micro-tasks needed (ID, title, description, priority, dependencies)
2. Architectural recommendations
3. System components (services, APIs, databases, etc.)
4. Boundaries between components (sync/async communication, data flow)

IMPORTANT: Return ONLY valid JSON with NO comments, NO trailing commas. Use double quotes for all strings.

Format as JSON with structure:
{
  "microTasks": [
    {
      "id": "arch-1",
      "title": "...",
      "description": "...",
      "priority": "critical|high|medium|low",
      "rationale": "Why this is architecturally important",
      "dependencies": []
    }
  ],
  "recommendations": ["...", "..."],
  "components": [
    {
      "name": "AuthService",
      "type": "service|api|database|frontend|middleware|gateway",
      "responsibilities": ["Handle authentication", "Manage sessions"],
      "dependencies": ["UserDatabase", "TokenCache"]
    }
  ],
  "boundaries": [
    {
      "from": "APIGateway",
      "to": "AuthService",
      "type": "sync|async|event|data",
      "protocol": "REST/HTTP",
      "constraints": ["Rate limiting", "Authentication required"]
    }
  ]
}`;

  try {
    // Call GLM with thinking enabled for architectural reasoning
    const glmResult = await callGLMWithThinking(prompt, {
      temperature: 0.7,
      maxTokens: 2048,
    });

    console.log(`[architecture-decomposer] GLM API: ${glmResult.durationMs}ms, ${glmResult.inputTokens}+${glmResult.outputTokens} tokens (thinking: ${glmResult.thinkingEnabled})`);

    // Parse JSON response with robust error handling
    const analysis = parseJSONFromResponse(glmResult.content, "architecture-decomposer") as {
      microTasks?: Array<any>;
      recommendations?: string[];
      components?: ArchitectureComponent[];
      boundaries?: ArchitectureBoundary[];
    };

    // Validate and structure the result
    const result: ArchitectureAnalysis = {
      taskId: payload.taskId,
      perspective: "architecture",
      microTasks: (analysis.microTasks || []).map((task: any) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        rationale: task.rationale || "",
        dependencies: task.dependencies || [],
      })),
      recommendations: analysis.recommendations || [],
      components: analysis.components || [],
      boundaries: analysis.boundaries || [],
    };

    console.log(`[architecture-decomposer] Success: ${result.microTasks.length} micro-tasks, ${result.components.length} components`);
    console.log(`  Time: ${Date.now() - startTime}ms`);

    return result;
  } catch (error) {
    const errorMsg = (error as Error).message;

    console.error(`[architecture-decomposer] Critical Error: ${errorMsg}`);
    console.error(`[architecture-decomposer] Context: taskId=${payload.taskId}, taskDescription length=${payload.taskDescription?.length || 0} chars`);

    // Re-throw with context
    throw new Error(
      `[architecture-decomposer] Failed to decompose task: ${errorMsg}\n` +
      `This is a critical error. The task cannot proceed without architecture baseline.\n` +
      `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
    );
  }
}