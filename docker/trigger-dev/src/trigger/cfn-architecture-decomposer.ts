import { task } from "@trigger.dev/sdk/v3";

export interface ArchitectureDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
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
}

export const cfnArchitectureDecomposerTask = task({
  id: "cfn-architecture-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: ArchitectureDecomposerPayload): Promise<ArchitectureAnalysis> => {
    const startTime = Date.now();

    console.log(`[architecture-decomposer] Analyzing task: ${payload.taskDescription.substring(0, 80)}...`);

    try {
      // Use Qwen-3-235B (best for architecture reasoning)
      const prompt = `You are an expert software architect. Analyze this task and decompose it into atomic micro-tasks focusing on architectural concerns.

Task: ${payload.taskDescription}

Provide:
1. List of micro-tasks needed (ID, title, description, priority)
2. Dependencies between tasks
3. Architectural recommendations

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
  "recommendations": ["...", "..."]
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
        throw new Error(`Cerebras API error: ${response.status}`);
      }

      const data = (await response.json()) as any;
      const content = data.choices[0]?.message?.content || "{}";

      // Parse JSON response
      let analysis: any = { microTasks: [], recommendations: [] };
      try {
        analysis = JSON.parse(content);
      } catch {
        console.warn("[architecture-decomposer] Failed to parse JSON, using fallback");
      }

      const result: ArchitectureAnalysis = {
        taskId: payload.taskId,
        perspective: "architecture",
        microTasks: analysis.microTasks || [],
        recommendations: analysis.recommendations || [],
      };

      console.log(`[architecture-decomposer] ✓ Success: ${result.microTasks.length} micro-tasks`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`[architecture-decomposer] ✗ Error: ${errorMsg}`);

      return {
        taskId: payload.taskId,
        perspective: "architecture",
        microTasks: [],
        recommendations: [],
      };
    }
  },
});
