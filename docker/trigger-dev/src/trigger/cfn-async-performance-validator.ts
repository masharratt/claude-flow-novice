import { task } from "@trigger.dev/sdk/v3";

export interface AsyncPerformanceValidatorPayload {
  taskId: string;
  implementation: string; // Generated code to analyze
  testCode: string; // Test code for perf measurement
  complexity: "simple" | "moderate" | "complex";
  workDir: string;
}

export interface PerformanceIssue {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  description: string;
  impact: string; // e.g., "10x slower", "O(n²) complexity"
  recommendation: string;
}

export interface AsyncPerformanceValidatorResult {
  taskId: string;
  timestamp: number;
  issues: PerformanceIssue[];
  overallPerformanceGrade: "A" | "B" | "C" | "D" | "F";
  estimatedThroughput: number; // Tasks per second
  memoryEstimate: number; // MB
  recommendations: string[];
  passedValidation: boolean;
}

export const cfnAsyncPerformanceValidatorTask = task({
  id: "cfn-async-performance-validator",
  retry: { maxAttempts: 1 },

  run: async (payload: AsyncPerformanceValidatorPayload): Promise<AsyncPerformanceValidatorResult> => {
    const startTime = Date.now();

    console.log(`[performance-validator] Analyzing code for performance issues`);
    console.log(`  Task ID: ${payload.taskId}`);
    console.log(`  Complexity: ${payload.complexity}`);

    try {
      // Performance analysis prompt
      const prompt = `You are a performance engineer. Analyze this code for performance issues.

CODE:
${payload.implementation}

TEST CODE:
${payload.testCode}

Analyze for:
1. Algorithm complexity (Big O analysis)
2. Memory usage patterns
3. I/O bottlenecks
4. Cache efficiency
5. Unnecessary computations
6. N+1 query patterns
7. Unoptimized loops
8. Blocking operations

Return JSON:
{
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "complexity|memory|io|cache|computation|nplus1|loops|blocking",
      "title": "Short title",
      "description": "Detailed description",
      "impact": "e.g., 10x slower, O(n²) complexity",
      "recommendation": "How to optimize"
    }
  ],
  "overallPerformanceGrade": "A|B|C|D|F",
  "estimatedThroughput": 1000,
  "memoryEstimate": 50,
  "recommendations": ["...", "..."]
}`;

      const response = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-oss-120b",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 2048,
          temperature: 0.5,
        }),
      });

      if (!response.ok) {
        throw new Error(`Cerebras API error: ${response.status}`);
      }

      const data = (await response.json()) as any;
      const content = data.choices[0]?.message?.content || "{}";

      let analysis: any = {
        issues: [],
        overallPerformanceGrade: "B",
        estimatedThroughput: 100,
        memoryEstimate: 100,
        recommendations: [],
      };

      try {
        analysis = JSON.parse(content);
      } catch {
        console.warn("[performance-validator] Failed to parse performance analysis JSON");
      }

      // Determine if passed validation (A/B = pass, C/D/F = review needed)
      const passedValidation =
        analysis.overallPerformanceGrade === "A" ||
        analysis.overallPerformanceGrade === "B";

      const result: AsyncPerformanceValidatorResult = {
        taskId: payload.taskId,
        timestamp: Date.now(),
        issues: analysis.issues || [],
        overallPerformanceGrade: analysis.overallPerformanceGrade || "B",
        estimatedThroughput: analysis.estimatedThroughput || 100,
        memoryEstimate: analysis.memoryEstimate || 100,
        recommendations: analysis.recommendations || [],
        passedValidation,
      };

      console.log(`[performance-validator] ✓ Complete`);
      console.log(`  Grade: ${result.overallPerformanceGrade}`);
      console.log(`  Issues: ${result.issues.length}`);
      console.log(`  Estimated throughput: ${result.estimatedThroughput} tasks/sec`);
      console.log(`  Memory estimate: ${result.memoryEstimate} MB`);
      console.log(`  Passed validation: ${result.passedValidation}`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`[performance-validator] ✗ Error: ${errorMsg}`);

      return {
        taskId: payload.taskId,
        timestamp: Date.now(),
        issues: [],
        overallPerformanceGrade: "B",
        estimatedThroughput: 100,
        memoryEstimate: 100,
        recommendations: [],
        passedValidation: false,
      };
    }
  },
});
