import { task } from "@trigger.dev/sdk/v3";
import {
  validateDecomposerInput,
  validateCerebrasResponse,
  validateDecompositionOutput,
  validateDecomposerOutput,
  validateDependencyGraph,
} from "../lib/validation-schemas.js";

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

export const cfnArchitectureDecomposerTask = task({
  id: "cfn-architecture-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: ArchitectureDecomposerPayload): Promise<ArchitectureAnalysis> => {
    const startTime = Date.now();

    // P0 Fix: Task 1 - Input Validation
    const validated = validateDecomposerInput(payload, "architecture-decomposer");

    console.log(`[architecture-decomposer] Analyzing task: ${validated.taskDescription.substring(0, 80)}...`);

    try {
      // Use Qwen-3-235B (best for architecture reasoning)
      const prompt = `You are an expert software architect. Analyze this task and decompose it into atomic micro-tasks focusing on architectural concerns.

Task: ${validated.taskDescription}

Provide:
1. List of micro-tasks needed (ID, title, description, priority, dependencies)
2. Architectural recommendations
3. System components (services, APIs, databases, etc.)
4. Boundaries between components (sync/async communication, data flow)

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

      // Call Cerebras with Qwen for architecture reasoning
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
      const data = validateCerebrasResponse(rawData, "architecture-decomposer");
      const content = data.choices[0].message.content;

      // Parse and validate decomposition output
      let analysis: any;
      try {
        analysis = JSON.parse(content);
      } catch (parseError) {
        throw new Error(
          `[architecture-decomposer] Failed to parse JSON content: ${(parseError as Error).message}\n` +
            `Raw content (first 200 chars): ${content.substring(0, 200)}\n` +
            `This indicates malformed JSON from the AI model. Try regenerating.`
        );
      }

      // P0 Fix: Task 3 - Validate decomposition structure
      const validatedAnalysis = validateDecompositionOutput(analysis, "architecture-decomposer");

      // P0 FIX sec-1.3: Add strict output type validation
      // Validates: field types, required properties, string lengths, ID formats
      const fullOutput = {
        taskId: validated.taskId,
        perspective: "architecture" as const,
        ...validatedAnalysis,
        components: analysis.components || [],
        boundaries: analysis.boundaries || [],
      };
      const typedOutput = validateDecomposerOutput(fullOutput, "architecture-decomposer");

      // P0 FIX sec-1.3: Validate dependency graph for cycles and missing references
      validateDependencyGraph(
        typedOutput.microTasks.map((t) => ({ id: t.id, dependencies: t.dependencies })),
        "architecture-decomposer"
      );

      const result: ArchitectureAnalysis = {
        taskId: validated.taskId,
        perspective: "architecture",
        microTasks: typedOutput.microTasks.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          rationale: task.rationale || "",
          dependencies: task.dependencies || [],
        })),
        recommendations: typedOutput.recommendations || [],
        components: (fullOutput as any).components || [],
        boundaries: (fullOutput as any).boundaries || [],
      };

      console.log(`[architecture-decomposer] ✓ Success: ${result.microTasks.length} micro-tasks, ${result.components.length} components`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      const errorStack = (error as Error).stack || "No stack trace available";

      // P0 Fix: Enhanced error logging with full context
      console.error(`[architecture-decomposer] ✗ Critical Error: ${errorMsg}`);
      console.error(`[architecture-decomposer] Stack trace: ${errorStack}`);
      console.error(
        `[architecture-decomposer] Context: taskId=${payload.taskId}, ` +
          `taskDescription length=${payload.taskDescription?.length || 0} chars`
      );

      // P0 Fix: Fail fast - do NOT return empty results silently
      throw new Error(
        `[architecture-decomposer] Failed to decompose task: ${errorMsg}\n` +
          `This is a critical error. The task cannot proceed without architecture baseline.\n` +
          `Common causes: API key invalid, network timeout, malformed prompt, quota exceeded.`
      );
    }
  },
});
