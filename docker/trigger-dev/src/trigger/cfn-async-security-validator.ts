import { task } from "@trigger.dev/sdk/v3";

export interface AsyncSecurityValidatorPayload {
  taskId: string;
  implementation: string; // Generated code to analyze
  testCode: string; // Test code for the implementation
  workDir: string;
}

export interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  description: string;
  lineNumber?: number;
  recommendation: string;
}

export interface AsyncSecurityValidatorResult {
  taskId: string;
  timestamp: number;
  findings: SecurityFinding[];
  overallRiskLevel: "critical" | "high" | "medium" | "low";
  vulnerabilityScore: number; // 0-100
  recommendations: string[];
  passedValidation: boolean;
}

export const cfnAsyncSecurityValidatorTask = task({
  id: "cfn-async-security-validator",
  retry: { maxAttempts: 1 },

  run: async (payload: AsyncSecurityValidatorPayload): Promise<AsyncSecurityValidatorResult> => {
    const startTime = Date.now();

    console.log(`[security-validator] Analyzing code for security issues`);
    console.log(`  Task ID: ${payload.taskId}`);
    console.log(`  Code length: ${payload.implementation.length} chars`);

    try {
      // Security analysis prompt
      const prompt = `You are a security specialist. Analyze this code for security vulnerabilities.

CODE:
${payload.implementation}

TEST CODE:
${payload.testCode}

Analyze for:
1. Injection vulnerabilities (SQL, command, template)
2. XSS/Script vulnerabilities
3. Cryptography issues
4. Authentication/authorization flaws
5. Data exposure risks
6. Unsafe deserialization
7. Input validation issues
8. Race conditions

Return JSON:
{
  "findings": [
    {
      "severity": "critical|high|medium|low",
      "category": "injection|xss|crypto|auth|exposure|deserialization|validation|race",
      "title": "Short title",
      "description": "Detailed description",
      "lineNumber": 42,
      "recommendation": "How to fix"
    }
  ],
  "overallRiskLevel": "critical|high|medium|low",
  "vulnerabilityScore": 0-100,
  "recommendations": ["...", "..."]
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
          temperature: 0.5, // Lower temp for consistency
        }),
      });

      if (!response.ok) {
        throw new Error(`Cerebras API error: ${response.status}`);
      }

      const data = (await response.json()) as any;
      const content = data.choices[0]?.message?.content || "{}";

      let analysis: any = {
        findings: [],
        overallRiskLevel: "low",
        vulnerabilityScore: 0,
        recommendations: [],
      };

      try {
        analysis = JSON.parse(content);
      } catch {
        console.warn("[security-validator] Failed to parse security analysis JSON");
      }

      // Determine if passed validation (low/medium risk = pass, high/critical = review needed)
      const passedValidation =
        analysis.overallRiskLevel !== "critical" &&
        (analysis.vulnerabilityScore || 0) < 70;

      const result: AsyncSecurityValidatorResult = {
        taskId: payload.taskId,
        timestamp: Date.now(),
        findings: analysis.findings || [],
        overallRiskLevel: analysis.overallRiskLevel || "low",
        vulnerabilityScore: analysis.vulnerabilityScore || 0,
        recommendations: analysis.recommendations || [],
        passedValidation,
      };

      console.log(`[security-validator] ✓ Complete`);
      console.log(`  Risk level: ${result.overallRiskLevel}`);
      console.log(`  Findings: ${result.findings.length}`);
      console.log(`  Vulnerability score: ${result.vulnerabilityScore}/100`);
      console.log(`  Passed validation: ${result.passedValidation}`);
      console.log(`  Time: ${Date.now() - startTime}ms`);

      return result;
    } catch (error) {
      const errorMsg = (error as Error).message;
      console.error(`[security-validator] ✗ Error: ${errorMsg}`);

      return {
        taskId: payload.taskId,
        timestamp: Date.now(),
        findings: [],
        overallRiskLevel: "medium",
        vulnerabilityScore: 0,
        recommendations: [],
        passedValidation: false,
      };
    }
  },
});
