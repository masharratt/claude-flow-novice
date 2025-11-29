/**
 * Cerebras GPT-OSS-120B Quality & Speed Test
 *
 * Tests Cerebras model on same 7 MDAP micro-tasks as the dashboard test.
 * Measures speed, quality, and consistency.
 *
 * Baseline (glm-4.5-air): Grade C (75), 81.5s avg per task
 * Goal: Compare Cerebras performance
 */

import * as fs from "fs";

// =============================================
// Configuration
// =============================================

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const CEREBRAS_API_URL = "https://api.cerebras.ai/v1";
const MODEL = "gpt-oss-120b"; // Cerebras GPT-OSS-120B

if (!CEREBRAS_API_KEY) {
  console.error("Error: CEREBRAS_API_KEY not set");
  process.exit(1);
}

// =============================================
// MDAP Micro-Tasks (same as test-dashboard-build.ts)
// =============================================

const MICRO_TASKS = [
  {
    id: 1,
    description: "Create AgentStatus interface with id, name, state, metrics",
    targetFile: "src/components/dashboard/types.ts",
  },
  {
    id: 2,
    description:
      "Implement useAgentMetrics hook to fetch and cache agent metrics",
    targetFile: "src/components/dashboard/hooks.ts",
  },
  {
    id: 3,
    description: "Build AgentCard component displaying agent info and stats",
    targetFile: "src/components/dashboard/AgentCard.tsx",
  },
  {
    id: 4,
    description: "Create MetricsPanel component with real-time metric updates",
    targetFile: "src/components/dashboard/MetricsPanel.tsx",
  },
  {
    id: 5,
    description:
      "Implement TaskQueue component showing pending and completed tasks",
    targetFile: "src/components/dashboard/TaskQueue.tsx",
  },
  {
    id: 6,
    description: "Build LogViewer component with filtering and search",
    targetFile: "src/components/dashboard/LogViewer.tsx",
  },
  {
    id: 7,
    description:
      "Create Dashboard container integrating all components with data flow",
    targetFile: "src/components/dashboard/Dashboard.tsx",
  },
];

// =============================================
// Type Definitions
// =============================================

interface CerebrasResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface TaskResult {
  taskId: number;
  description: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  tokensUsed: number;
  success: boolean;
  outputLength: number;
  grade: number; // 1-100
  error?: string;
}

// =============================================
// Cerebras API Call
// =============================================

async function callCerebras(prompt: string): Promise<CerebrasResponse> {
  const response = await fetch(`${CEREBRAS_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CEREBRAS_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 2048,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cerebras API error: ${response.status} - ${error}`);
  }

  return response.json() as Promise<CerebrasResponse>;
}

// =============================================
// Task Execution
// =============================================

async function executeTask(task: (typeof MICRO_TASKS)[0]): Promise<TaskResult> {
  const startTime = Date.now();

  try {
    const prompt = `
You are a TypeScript developer implementing a micro-task.

Task: ${task.description}

Target File: ${task.targetFile}

Requirements:
- Complete implementation in under 50 lines
- Include proper TypeScript types
- Add basic error handling
- Provide clean, idiomatic code
- CRITICAL: Do NOT create files; just provide the code content

Output ONLY the TypeScript code, no explanations.
`;

    const result = await callCerebras(prompt);
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    const content = result.choices[0]?.message?.content || "";
    const tokensUsed = result.usage?.total_tokens || 0;

    // Simple quality scoring
    let grade = 50;
    if (content.length > 200) grade += 10; // Sufficient length
    if (content.includes("interface") || content.includes("type"))
      grade += 10; // Has types
    if (content.includes("export")) grade += 10; // Exports properly
    if (!content.includes("TODO") && !content.includes("FIXME"))
      grade += 10; // No placeholders
    if (content.match(/\/\//g)?.length || 0 > 2) grade += 10; // Has comments

    return {
      taskId: task.id,
      description: task.description,
      startTime,
      endTime,
      durationMs,
      tokensUsed,
      success: true,
      outputLength: content.length,
      grade: Math.min(100, grade),
    };
  } catch (error) {
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    return {
      taskId: task.id,
      description: task.description,
      startTime,
      endTime,
      durationMs,
      tokensUsed: 0,
      success: false,
      outputLength: 0,
      grade: 0,
      error: (error as Error).message,
    };
  }
}

// =============================================
// Main Test
// =============================================

async function main() {
  console.log("========================================");
  console.log("Cerebras GPT-OSS-120B MDAP Test");
  console.log("========================================\n");

  console.log(`Testing ${MICRO_TASKS.length} micro-tasks...\n`);
  console.log(
    "Baseline (glm-4.5-air): Grade C (75), 81.5s avg per task\n"
  );

  const results: TaskResult[] = [];

  for (const task of MICRO_TASKS) {
    console.log(`[Task ${task.id}] ${task.description}`);
    const result = await executeTask(task);

    if (result.success) {
      console.log(
        `  ✓ Grade: ${result.grade}, Time: ${result.durationMs}ms, Tokens: ${result.tokensUsed}`
      );
    } else {
      console.log(`  ✗ Error: ${result.error}`);
    }

    results.push(result);
    console.log();
  }

  // =============================================
  // Results Summary
  // =============================================

  const successResults = results.filter((r) => r.success);
  const avgGrade =
    successResults.length > 0
      ? Math.round(
          successResults.reduce((sum, r) => sum + r.grade, 0) /
            successResults.length
        )
      : 0;
  const avgDuration =
    successResults.length > 0
      ? Math.round(
          successResults.reduce((sum, r) => sum + r.durationMs, 0) /
            successResults.length
        )
      : 0;
  const totalTokens = results.reduce((sum, r) => sum + r.tokensUsed, 0);

  console.log("========================================");
  console.log("RESULTS SUMMARY");
  console.log("========================================\n");

  console.log(`Success Rate: ${successResults.length}/${MICRO_TASKS.length}`);
  console.log(`Average Grade: ${avgGrade}`);
  console.log(`Average Duration: ${avgDuration}ms (${(avgDuration / 1000).toFixed(1)}s)`);
  console.log(`Total Tokens: ${totalTokens}`);
  console.log();

  // Comparison to baseline
  const baselineGrade = 75;
  const baselineAvgDuration = 81500; // 81.5s in ms

  console.log("Baseline Comparison (glm-4.5-air):");
  console.log(`  Grade: ${baselineGrade} → ${avgGrade} (${avgGrade - baselineGrade > 0 ? "+" : ""}${avgGrade - baselineGrade})`);
  console.log(
    `  Avg Time: ${(baselineAvgDuration / 1000).toFixed(1)}s → ${(avgDuration / 1000).toFixed(1)}s (${((avgDuration / baselineAvgDuration - 1) * 100).toFixed(1)}%)`
  );
  console.log();

  // Save results
  const reportPath = `/tmp/cerebras-mdap-results-${Date.now()}.json`;
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        model: MODEL,
        timestamp: new Date().toISOString(),
        summary: {
          successRate: `${successResults.length}/${MICRO_TASKS.length}`,
          avgGrade,
          avgDuration,
          totalTokens,
        },
        results,
        comparison: {
          baselineGrade,
          baselineAvgDuration,
          gradeImprovement: avgGrade - baselineGrade,
          speedChange: ((avgDuration / baselineAvgDuration - 1) * 100).toFixed(
            1
          ),
        },
      },
      null,
      2
    )
  );

  console.log(`Results saved to: ${reportPath}`);

  process.exit(successResults.length === MICRO_TASKS.length ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
