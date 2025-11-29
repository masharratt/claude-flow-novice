/**
 * Cerebras GPT-OSS-120B Quality Deep Dive
 *
 * Captures full output and performs detailed code quality analysis
 */

import * as fs from "fs";

const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
const CEREBRAS_API_URL = "https://api.cerebras.ai/v1";
const MODEL = "gpt-oss-120b";

if (!CEREBRAS_API_KEY) {
  console.error("Error: CEREBRAS_API_KEY not set");
  process.exit(1);
}

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

interface DetailedResult {
  taskId: number;
  description: string;
  durationMs: number;
  tokensUsed: number;
  output: string;
  qualityMetrics: {
    hasTypes: boolean;
    hasExports: boolean;
    hasComments: boolean;
    hasErrorHandling: boolean;
    lineCount: number;
    hasImports: boolean;
    isValid: boolean;
    issues: string[];
  };
  estimatedGrade: number;
}

function analyzeCode(code: string): DetailedResult["qualityMetrics"] {
  const lines = code.split("\n").filter((l) => l.trim());
  const issues: string[] = [];

  const hasTypes = /\binterface\b|\btype\b|\b:\s*\w+/.test(code);
  const hasExports = /\bexport\b/.test(code);
  const hasComments = /\/\//m.test(code);
  const hasErrorHandling =
    /try\s*{|catch\s*\(|Error|throw|if\s*\(|return\s*null/.test(code);
  const hasImports = /^import\s+/m.test(code);

  if (!hasTypes) issues.push("Missing type annotations");
  if (!hasExports) issues.push("Missing exports");
  if (!hasErrorHandling) issues.push("Missing error handling");
  if (lines.length > 50) issues.push("Exceeds 50 lines");

  return {
    hasTypes,
    hasExports,
    hasComments,
    hasErrorHandling,
    lineCount: lines.length,
    hasImports,
    isValid: code.length > 100 && code.includes("export"),
    issues,
  };
}

async function callCerebras(prompt: string): Promise<string> {
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

  const data = (await response.json()) as any;
  return data.choices[0]?.message?.content || "";
}

async function executeTask(
  task: (typeof MICRO_TASKS)[0]
): Promise<DetailedResult> {
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

    const output = await callCerebras(prompt);
    const endTime = Date.now();

    const metrics = analyzeCode(output);

    let grade = 50;
    if (metrics.hasTypes) grade += 15;
    if (metrics.hasExports) grade += 15;
    if (metrics.hasComments) grade += 10;
    if (metrics.hasErrorHandling) grade += 10;
    if (!metrics.issues.length) grade += 10;

    return {
      taskId: task.id,
      description: task.description,
      durationMs: endTime - startTime,
      tokensUsed: 0,
      output: output.substring(0, 500), // First 500 chars for display
      qualityMetrics: metrics,
      estimatedGrade: Math.min(100, grade),
    };
  } catch (error) {
    return {
      taskId: task.id,
      description: task.description,
      durationMs: 0,
      tokensUsed: 0,
      output: `ERROR: ${(error as Error).message}`,
      qualityMetrics: {
        hasTypes: false,
        hasExports: false,
        hasComments: false,
        hasErrorHandling: false,
        lineCount: 0,
        hasImports: false,
        isValid: false,
        issues: [(error as Error).message],
      },
      estimatedGrade: 0,
    };
  }
}

async function main() {
  console.log("========================================");
  console.log("Cerebras Code Quality Deep Dive");
  console.log("========================================\n");

  const results: DetailedResult[] = [];

  for (const task of MICRO_TASKS) {
    console.log(`[Task ${task.id}] ${task.description}`);
    const result = await executeTask(task);

    console.log(`  Duration: ${result.durationMs}ms`);
    console.log(`  Lines: ${result.qualityMetrics.lineCount}`);
    console.log(`  Has types: ${result.qualityMetrics.hasTypes ? "✓" : "✗"}`);
    console.log(`  Has exports: ${result.qualityMetrics.hasExports ? "✓" : "✗"}`);
    console.log(
      `  Has error handling: ${result.qualityMetrics.hasErrorHandling ? "✓" : "✗"}`
    );
    console.log(`  Has comments: ${result.qualityMetrics.hasComments ? "✓" : "✗"}`);

    if (result.qualityMetrics.issues.length) {
      console.log(`  Issues: ${result.qualityMetrics.issues.join(", ")}`);
    }

    console.log(`  Grade: ${result.estimatedGrade}`);
    console.log(`  Output preview:\n${result.output.substring(0, 300)}...\n`);

    results.push(result);
  }

  // Summary
  console.log("========================================");
  console.log("QUALITY SUMMARY");
  console.log("========================================\n");

  const avgGrade = Math.round(
    results.reduce((s, r) => s + r.estimatedGrade, 0) / results.length
  );
  const avgLines = Math.round(
    results.reduce((s, r) => s + r.qualityMetrics.lineCount, 0) /
      results.length
  );
  const typeCoverage = results.filter((r) => r.qualityMetrics.hasTypes).length;
  const exportCoverage = results.filter((r) => r.qualityMetrics.hasExports)
    .length;
  const errorHandlingCoverage = results.filter(
    (r) => r.qualityMetrics.hasErrorHandling
  ).length;

  console.log(`Average Grade: ${avgGrade}/100`);
  console.log(`Average Lines: ${avgLines}`);
  console.log(`Type Annotations: ${typeCoverage}/7 (${((typeCoverage / 7) * 100).toFixed(0)}%)`);
  console.log(`Exports: ${exportCoverage}/7 (${((exportCoverage / 7) * 100).toFixed(0)}%)`);
  console.log(`Error Handling: ${errorHandlingCoverage}/7 (${((errorHandlingCoverage / 7) * 100).toFixed(0)}%)`);

  const allIssues = results.flatMap((r) => r.qualityMetrics.issues);
  if (allIssues.length) {
    console.log(`\nCommon Issues:`);
    const issueCounts: Record<string, number> = {};
    allIssues.forEach((issue) => {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    });
    Object.entries(issueCounts).forEach(([issue, count]) => {
      console.log(`  - ${issue}: ${count} tasks`);
    });
  }

  // Save full results
  const reportPath = `/tmp/cerebras-detailed-${Date.now()}.json`;
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nFull results saved to: ${reportPath}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
