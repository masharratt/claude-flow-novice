import { task } from "@trigger.dev/sdk/v3";

export interface SecurityDecomposerPayload {
  taskId: string;
  taskDescription: string;
  workDir: string;
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
  riskLevel: "critical" | "high" | "medium" | "low";
}

export const cfnSecurityDecomposerTask = task({
  id: "cfn-security-decomposer",
  retry: { maxAttempts: 1 },

  run: async (payload: SecurityDecomposerPayload): Promise<SecurityAnalysis> => {
    const startTime = Date.now();

    console.log(`[security-decomposer] Analyzing task: ${payload.taskDescription.substring(0, 80)}...`);

    try {
      const prompt = `You are a security specialist. Analyze this task for security implications and decompose into security-focused micro-tasks.

Task: ${payload.taskDescription}

Provide:
1. Security-focused micro-tasks (ID, title, description, threat vectors)
2. Security recommendations
3. Overall risk level (critical|high|medium|low)

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
        throw new Error(`Cerebras API error: ${response.status}`);
      }

      const data = (await response.json()) as any;
      const content = data.choices[0]?.message?.content || "{}";

      let analysis: any = { microTasks: [], securityRecommendations: [], riskLevel: "low" };
      try {
        analysis = JSON.parse(content);
      } catch {
        console.warn("[security-decomposer] Failed to parse JSON");
      }

      const result: SecurityAnalysis = {
        taskId: payload.taskId,
        perspective: "security",
        microTasks: analysis.microTasks || [],
        securityRecommendations: analysis.securityRecommendations || [],
        riskLevel: analysis.riskLevel || "low",
      };

      console.log(`[security-decomposer] ✓ Success: Risk level ${result.riskLevel}`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`[security-decomposer] ✗ Error: ${errorMsg}`);

      return {
        taskId: payload.taskId,
        perspective: "security",
        microTasks: [],
        securityRecommendations: [],
        riskLevel: "medium",
      };
    }
  },
});
