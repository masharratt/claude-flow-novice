import { task } from "@trigger.dev/sdk/v3";

export interface TestingDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
}

export interface TestingAnalysis {
  taskId: string;
  perspective: "testing";
  microTasks: Array<{
    id: string;
    title: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    rationale: string;
    testTypes: string[];
  }>;
  testingRecommendations: string[];
  coverageGoal: number;
}

export const cfnTestingDecomposerTask = task({
  id: "cfn-testing-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: TestingDecomposerPayload): Promise<TestingAnalysis> => {
    const startTime = Date.now();

    console.log(`[testing-decomposer] Analyzing task: ${payload.taskDescription.substring(0, 80)}...`);

    try {
      const prompt = `You are a QA engineer. Analyze this task for testing requirements and decompose into testing-focused micro-tasks.

Task: ${payload.taskDescription}

Provide:
1. Testing-focused micro-tasks (ID, title, description, test types)
2. Testing recommendations
3. Coverage goal percentage

Format as JSON:
{
  "microTasks": [
    {
      "id": "test-1",
      "title": "...",
      "description": "...",
      "priority": "critical|high|medium|low",
      "rationale": "Test coverage",
      "testTypes": ["unit", "integration", "e2e"]
    }
  ],
  "testingRecommendations": ["...", "..."],
  "coverageGoal": 85
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

      let analysis: any = { microTasks: [], testingRecommendations: [], coverageGoal: 80 };
      try {
        analysis = JSON.parse(content);
      } catch {
        console.warn("[testing-decomposer] Failed to parse JSON");
      }

      const result: TestingAnalysis = {
        taskId: payload.taskId,
        perspective: "testing",
        microTasks: analysis.microTasks || [],
        testingRecommendations: analysis.testingRecommendations || [],
        coverageGoal: analysis.coverageGoal || 80,
      };

      console.log(`[testing-decomposer] ✓ Success: Coverage goal ${result.coverageGoal}%`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`[testing-decomposer] ✗ Error: ${errorMsg}`);

      return {
        taskId: payload.taskId,
        perspective: "testing",
        microTasks: [],
        testingRecommendations: [],
        coverageGoal: 80,
      };
    }
  },
});
