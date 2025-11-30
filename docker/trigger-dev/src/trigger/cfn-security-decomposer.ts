import { task } from "@trigger.dev/sdk/v3";
import type { ArchitectureAnalysis, ArchitectureComponent, ArchitectureBoundary } from "./cfn-architecture-decomposer.js";
import {
  validateDecomposerInput,
  validateCerebrasResponse,
  validateDecompositionOutput,
  parseJSONFromResponse,
} from "../lib/validation-schemas.js";

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

export const cfnSecurityDecomposerTask = task({
  id: "cfn-security-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: SecurityDecomposerPayload): Promise<SecurityAnalysis> => {
    const startTime = Date.now();

    // P0 Fix: Task 1 - Input Validation
    const validated = validateDecomposerInput(payload, "security-decomposer");

    console.log(`[security-decomposer] Analyzing task: ${validated.taskDescription.substring(0, 80)}...`);

    try {
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

Task: ${validated.taskDescription}${contextSection}

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

      const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
        },
        body: JSON.stringify({
          model: "qwen-3-235b-a22b-instruct-2507",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2048,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Cerebras API error: ${response.status} - ${errorBody}\n` +
            `Check API key validity and quota limits.`
        );
      }

      const rawData = await response.json();

      // P0 Fix: Task 3 - API Response Validation
      const data = validateCerebrasResponse(rawData, "security-decomposer");
      const content = data.choices[0].message.content;

      // Parse and validate decomposition output
      const analysis = parseJSONFromResponse(content, "security-decomposer");

      // P0 Fix: Task 3 - Validate decomposition structure
      const validatedAnalysis = validateDecompositionOutput(analysis, "security-decomposer");

      const result: SecurityAnalysis = {
        taskId: validated.taskId,
        perspective: "security",
        microTasks: validatedAnalysis.microTasks.map((task) => ({
          ...task,
          rationale: task.rationale || "",
          threatVectors: [],
        })),
        securityRecommendations: analysis.securityRecommendations || [],
        securityBoundaries: analysis.securityBoundaries || [],
        riskLevel: analysis.riskLevel || "low",
      };

      console.log(`[security-decomposer] ✓ Success: Risk level ${result.riskLevel}, ${result.securityBoundaries.length} boundaries`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      const errorStack = (error as Error).stack || "No stack trace available";

      // P0 Fix: Enhanced error logging with full context
      console.error(`[security-decomposer] ✗ Critical Error: ${errorMsg}`);
      console.error(`[security-decomposer] Stack trace: ${errorStack}`);
      console.error(
        `[security-decomposer] Context: taskId=${payload.taskId}, ` +
          `taskDescription length=${payload.taskDescription?.length || 0} chars`
      );

      // P0 Fix: Fail fast - do NOT return empty results silently
      throw new Error(
        `[security-decomposer] Failed to decompose task: ${errorMsg}\n` +
          `This is a critical error. Security analysis is mandatory for production tasks.\n` +
          `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
      );
    }
  },
});
