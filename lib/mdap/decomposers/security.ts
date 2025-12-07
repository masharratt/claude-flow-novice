/**
 * Security Decomposer
 *
 * Analyzes tasks for security implications and decomposes into security-focused micro-tasks.
 * Receives architecture context from the baseline decomposer to inform security analysis.
 *
 * @module security
 * @version 1.0.0 - Extracted from Trigger.dev
 */

import { callGLMWithThinking } from '../glm-client.js';
import { parseJSONFromResponse } from '../validation.js';
import type { ArchitectureAnalysis, ArchitectureComponent, ArchitectureBoundary } from './architecture.js';

// =============================================
// Type Definitions
// =============================================

export interface SecurityDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
  previousContext?: {
    architecture?: ArchitectureAnalysis;
    components?: ArchitectureComponent[];
    boundaries?: ArchitectureBoundary[];
  };
}

export interface SecurityBoundary {
  boundary: string;
  threatModel: string[];
  mitigations: string[];
  complianceRequirements?: string[];
}

export interface SecurityAnalysis {
  taskId: string;
  perspective: "security";
  microTasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    rationale: string;
    threatVectors: string[];
  }>;
  securityRecommendations: string[];
  securityBoundaries: SecurityBoundary[];
  riskLevel: "critical" | "high" | "medium" | "low";
}

// =============================================
// Security Decomposer Function
// =============================================

/**
 * Decompose a task from a security perspective
 *
 * @param payload - Task description and metadata with optional context
 * @returns Security analysis with micro-tasks
 */
export async function decomposeSecurity(
  payload: SecurityDecomposerPayload
): Promise<SecurityAnalysis> {
  const startTime = Date.now();

  console.log(`[security-decomposer] Analyzing task: ${payload.taskDescription.substring(0, 80)}...`);

  // Build context section if provided
  let contextSection = "";
  if (payload.previousContext?.architecture) {
    const arch = payload.previousContext.architecture;
    contextSection = `

ARCHITECTURE CONTEXT (from previous decomposer):
- Components: ${JSON.stringify(arch.components || [])}
- Boundaries: ${JSON.stringify(arch.boundaries || [])}
- Recommendations: ${JSON.stringify(arch.recommendations || [])}

Use this architecture context to identify security implications:
- Microservices → need inter-service authentication
- Payment services → PCI compliance requirements
- API boundaries → input validation, rate limiting
- Database access → SQL injection prevention
- Frontend → XSS, CSRF protection`;
  }

  const prompt = `You are a security specialist. Analyze this task for security implications and decompose into security-focused micro-tasks.

Task: ${payload.taskDescription}${contextSection}

IMPORTANT: Return ONLY valid JSON with NO comments, NO trailing commas. Use double quotes for all strings.

Provide:
1. Security-focused micro-tasks (ID, title, description, threat vectors)
2. Security recommendations informed by architecture
3. Security boundaries for inter-component communication
4. Overall risk level (critical|high|medium|low)

Format as JSON:
{
  "microTasks": [
    {
      "id": "sec-1",
      "title": "...",
      "description": "...",
      "priority": "critical|high|medium|low",
      "rationale": "Security concern",
      "threatVectors": ["injection", "xss", ...]
    }
  ],
  "securityRecommendations": ["...", "..."],
  "securityBoundaries": [
    {
      "boundary": "API Gateway <-> Auth Service",
      "threatModel": ["Token theft", "Replay attacks"],
      "mitigations": ["JWT with short expiry", "HTTPS only", "Rate limiting"],
      "complianceRequirements": ["GDPR", "PCI-DSS"]
    }
  ],
  "riskLevel": "critical|high|medium|low"
}`;

  try {
    // Call GLM with thinking enabled for security reasoning
    const glmResult = await callGLMWithThinking(prompt, {
      temperature: 0.7,
      maxTokens: 2048,
    });

    console.log(`[security-decomposer] GLM API: ${glmResult.durationMs}ms, ${glmResult.inputTokens}+${glmResult.outputTokens} tokens (thinking: ${glmResult.thinkingEnabled})`);

    // Parse JSON response with robust error handling
    const analysis = parseJSONFromResponse(glmResult.content, "security-decomposer") as {
      microTasks?: Array<any>;
      securityRecommendations?: string[];
      securityBoundaries?: SecurityBoundary[];
      riskLevel?: "critical" | "high" | "medium" | "low";
    };

    // Validate and structure the result
    const result: SecurityAnalysis = {
      taskId: payload.taskId,
      perspective: "security",
      microTasks: (analysis.microTasks || []).map((task: any) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        rationale: task.rationale || "",
        threatVectors: task.threatVectors || [],
      })),
      securityRecommendations: analysis.securityRecommendations || [],
      securityBoundaries: analysis.securityBoundaries || [],
      riskLevel: analysis.riskLevel || "low",
    };

    console.log(`[security-decomposer] Success: Risk level ${result.riskLevel}, ${result.securityBoundaries.length} boundaries`);
    console.log(`  Time: ${Date.now() - startTime}ms`);

    return result;
  } catch (error) {
    const errorMsg = (error as Error).message;

    console.error(`[security-decomposer] Critical Error: ${errorMsg}`);
    console.error(`[security-decomposer] Context: taskId=${payload.taskId}, taskDescription length=${payload.taskDescription?.length || 0} chars`);

    // Re-throw with context
    throw new Error(
      `[security-decomposer] Failed to decompose task: ${errorMsg}\n` +
      `This is a critical error. Security analysis is mandatory for production tasks.\n` +
      `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
    );
  }
}