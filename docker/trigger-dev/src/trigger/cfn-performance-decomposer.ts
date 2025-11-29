import { task } from "@trigger.dev/sdk/v3";

export interface PerformanceDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
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
  optimizationStrategy: string;
}

export const cfnPerformanceDecomposerTask = task({
  id: "cfn-performance-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: PerformanceDecomposerPayload): Promise<PerformanceAnalysis> => {
    const startTime = Date.now();

    console.log(`[performance-decomposer] Analyzing task: ${payload.taskDescription.substring(0, 80)}...`);

    try {
      const prompt = `You are a performance engineer. Analyze this task for performance considerations and decompose into performance-focused micro-tasks.

Task: ${payload.taskDescription}

Provide:
1. Performance-focused micro-tasks (ID, title, description, metrics)
2. Performance recommendations
3. Optimization strategy

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
  "optimizationStrategy": "..."
}`;

      const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b",
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

      let analysis: any = { microTasks: [], performanceRecommendations: [], optimizationStrategy: "" };
      try {
        analysis = JSON.parse(content);
      } catch {
        console.warn("[performance-decomposer] Failed to parse JSON");
      }

      const result: PerformanceAnalysis = {
        taskId: payload.taskId,
        perspective: "performance",
        microTasks: analysis.microTasks || [],
        performanceRecommendations: analysis.performanceRecommendations || [],
        optimizationStrategy: analysis.optimizationStrategy || "",
      };

      console.log(`[performance-decomposer] ✓ Success: ${result.microTasks.length} micro-tasks`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`[performance-decomposer] ✗ Error: ${errorMsg}`);

      return {
        taskId: payload.taskId,
        perspective: "performance",
        microTasks: [],
        performanceRecommendations: [],
        optimizationStrategy: "",
      };
    }
  },
});
