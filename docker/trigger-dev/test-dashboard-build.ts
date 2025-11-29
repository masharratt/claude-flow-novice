/**
 * MDAP Dashboard Build Test
 *
 * Tests the full MDAP pipeline:
 * 1. Decomposer analyzes "Build agent monitoring dashboard"
 * 2. Decomposes into atomic micro-tasks
 * 3. Spawns implementer tasks for each micro-task
 * 4. Collects results for grading
 *
 * Run with: TRIGGER_SECRET_KEY=tr_dev_... npx tsx test-dashboard-build.ts
 */

import { configure, tasks, runs } from "@trigger.dev/sdk/v3";
import {
  processTaskWithAtomicity,
  analyzeAtomicity,
  getAtomicitySummary,
} from "./src/lib/mdap-config.js";

// Configure SDK
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO",
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

// =============================================
// Test Configuration
// =============================================

const DASHBOARD_TASK = `Build a dashboard to monitor Trigger.dev agents and MDAP metrics with:
- Agent status grid showing running/completed/failed agents
- MDAP metrics panel with tier usage and costs
- Task queue view with pending/in-progress/completed counts
- Real-time log viewer for agent output`;

const WORK_DIR = "/tmp/dashboard-test-" + Date.now();

// =============================================
// Main Test
// =============================================

async function runDashboardBuildTest() {
  console.log("=".repeat(80));
  console.log("MDAP Dashboard Build Test");
  console.log("=".repeat(80));
  console.log();

  // Create work directory and seed files
  const fs = await import("fs/promises");
  const path = await import("path");

  await fs.mkdir(path.join(WORK_DIR, "src/components/dashboard"), { recursive: true });

  // Create a seed file so the agent has context
  const seedFile = path.join(WORK_DIR, "src/components/dashboard/types.ts");
  await fs.writeFile(seedFile, `/**
 * Dashboard Component Types
 *
 * TODO: Define interfaces for:
 * - AgentStatus (running, completed, failed counts)
 * - MDAMetrics (tier usage, costs)
 * - TaskQueueStats (pending, in-progress, completed)
 * - LogEntry (timestamp, level, message)
 */

// Placeholder - implement types below
export {};
`);

  console.log(`Work directory created: ${WORK_DIR}`);
  console.log(`Seed file: ${seedFile}`);
  console.log();

  // Phase 1: Analyze and Decompose
  console.log("## Phase 1: Task Analysis and Decomposition");
  console.log("-".repeat(80));
  console.log();
  console.log("Original Task:");
  console.log(DASHBOARD_TASK);
  console.log();

  const analysis = analyzeAtomicity(DASHBOARD_TASK);
  console.log(`Atomicity Analysis:`);
  console.log(`  Is Atomic: ${analysis.isAtomic}`);
  console.log(`  Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
  console.log(`  Violations: ${analysis.violations.join(", ") || "none"}`);
  console.log(`  Estimated Lines: ${analysis.estimatedLines}`);
  console.log();

  // Decompose
  const decomposition = processTaskWithAtomicity(DASHBOARD_TASK, "zai", false);

  console.log(`Decomposition Result:`);
  console.log(`  Was Decomposed: ${decomposition.wasDecomposed}`);
  console.log(`  Micro-Tasks: ${decomposition.microTasks.length}`);
  console.log();

  console.log("Micro-Tasks Generated:");
  decomposition.microTasks.forEach((mt, i) => {
    const tier = decomposition.recommendedTiers.get(mt.id);
    console.log(`  ${i + 1}. [${mt.action}] ${mt.description}`);
    console.log(`     File: ${mt.targetFile}`);
    console.log(`     Tier: T${tier?.tier || 1}, Est. Lines: ${mt.estimatedLines}`);
    if (mt.dependsOn.length > 0) {
      console.log(`     Depends on: ${mt.dependsOn.join(", ")}`);
    }
  });
  console.log();

  // Phase 2: Execute Micro-Tasks
  console.log("## Phase 2: Execute Micro-Tasks via Trigger.dev");
  console.log("-".repeat(80));
  console.log();

  const startTime = Date.now();
  const results: Array<{
    microTaskId: string;
    description: string;
    runId: string;
    success: boolean;
    confidence: number;
    durationMs: number;
    tier: number;
    error?: string;
  }> = [];

  // Execute each micro-task
  for (let i = 0; i < decomposition.microTasks.length; i++) {
    const microTask = decomposition.microTasks[i];
    const tier = decomposition.recommendedTiers.get(microTask.id);

    console.log(`\n[${i + 1}/${decomposition.microTasks.length}] Executing: ${microTask.description.slice(0, 50)}...`);

    const taskStartTime = Date.now();

    try {
      // Pre-read ALL existing files in component directory (not just targetFile)
      // This gives agents full context of what previous tasks created
      const fileContents: Array<{ path: string; content: string }> = [];
      const componentDir = path.join(WORK_DIR, 'src/components/dashboard');

      try {
        const existingFiles = await fs.readdir(componentDir);
        for (const file of existingFiles) {
          if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            const filePath = path.join(componentDir, file);
            const stat = await fs.stat(filePath);
            if (stat.isFile()) {
              const content = await fs.readFile(filePath, 'utf-8');
              fileContents.push({
                path: `src/components/dashboard/${file}`,
                content,
              });
            }
          }
        }
        if (fileContents.length > 0) {
          console.log(`   Pre-read ${fileContents.length} existing files: ${fileContents.map(f => path.basename(f.path)).join(', ')}`);
        }
      } catch (dirError) {
        // Directory doesn't exist yet - first task will create it
        console.log(`   Note: Component directory doesn't exist yet (first task)`);
      }

      // Enrich context hints with domain-specific information
      const enrichedHints = [
        ...microTask.contextHints,
        'Domain: Agent monitoring dashboard for Trigger.dev',
        'Data types: AgentStatus, MDAMetrics, TaskQueueStats, LogEntry',
      ];
      if (microTask.description.includes('interface') || microTask.description.includes('props')) {
        enrichedHints.push('Props should include: data, loading, error, onRefresh');
      }
      if (microTask.description.includes('handler') || microTask.description.includes('refresh')) {
        enrichedHints.push('Use async/await pattern with try/catch');
        enrichedHints.push('Toggle loading state before/after fetch');
      }

      // Trigger implementer with context hints and file contents
      // Note: tests array left empty - confidence stays at 50% but execution is faster
      // Adding tsc validation causes regressions due to missing tsconfig/deps in temp dir
      const handle = await tasks.trigger("cfn-implementer-v2", {
        taskId: `dashboard-${Date.now()}-${i}`,
        agentId: `dashboard-agent-${microTask.id}`,
        iterationId: 1,
        agentType: "react-frontend-engineer",
        taskDescription: microTask.description,
        workDir: WORK_DIR,
        files: microTask.targetFile !== "TBD" ? [microTask.targetFile] : [],
        tests: [],
        provider: "zai",
        timeout: 180000, // 3 minutes per micro-task
        enableMDAP: true,
        complexityLevel: microTask.complexity,
        modelTier: tier?.tier || 1,
        failureCount: 0,
        contextHints: enrichedHints,
        fileContents,
      });

      console.log(`   Run ID: ${handle.id}`);
      console.log(`   Waiting for completion...`);

      // Poll for result
      const result = await runs.poll(handle.id, {
        pollIntervalMs: 3000,
      }) as any;

      const taskDurationMs = Date.now() - taskStartTime;
      const isCompleted = result.status === "COMPLETED";
      const isSuccess = isCompleted && (result.isSuccess === true || result.isFailed === false);

      if (isSuccess) {
        const output = result.output as any;
        console.log(`   ✅ SUCCESS in ${(taskDurationMs / 1000).toFixed(1)}s`);
        console.log(`   Confidence: ${((output?.confidence || 0.5) * 100).toFixed(0)}%`);
        console.log(`   Model: ${output?.mdap?.modelName || "unknown"}`);

        results.push({
          microTaskId: microTask.id,
          description: microTask.description,
          runId: handle.id,
          success: true,
          confidence: output?.confidence || 0.5,
          durationMs: taskDurationMs,
          tier: output?.mdap?.modelTier || 1,
        });
      } else {
        const errorMessage = result.error?.message || result.status || "Unknown error";
        console.log(`   ❌ FAILED in ${(taskDurationMs / 1000).toFixed(1)}s`);
        console.log(`   Error: ${errorMessage}`);

        results.push({
          microTaskId: microTask.id,
          description: microTask.description,
          runId: handle.id,
          success: false,
          confidence: 0.1,
          durationMs: taskDurationMs,
          tier: tier?.tier || 1,
          error: errorMessage,
        });
      }
    } catch (error) {
      const taskDurationMs = Date.now() - taskStartTime;
      console.log(`   ❌ EXCEPTION in ${(taskDurationMs / 1000).toFixed(1)}s`);
      console.log(`   Error: ${(error as Error).message}`);

      results.push({
        microTaskId: microTask.id,
        description: microTask.description,
        runId: "error",
        success: false,
        confidence: 0.1,
        durationMs: taskDurationMs,
        tier: tier?.tier || 1,
        error: (error as Error).message,
      });
    }
  }

  const totalDuration = Date.now() - startTime;

  // Phase 3: Results Summary
  console.log("\n");
  console.log("## Phase 3: Results Summary");
  console.log("-".repeat(80));
  console.log();

  const successCount = results.filter((r) => r.success).length;
  const avgConfidence =
    results.filter((r) => r.success).reduce((sum, r) => sum + r.confidence, 0) /
      successCount || 0;
  const avgDuration =
    results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;

  console.log(`Execution Summary:`);
  console.log(`  Total Micro-Tasks: ${decomposition.microTasks.length}`);
  console.log(`  Successful: ${successCount}`);
  console.log(`  Failed: ${decomposition.microTasks.length - successCount}`);
  console.log(`  Success Rate: ${((successCount / decomposition.microTasks.length) * 100).toFixed(1)}%`);
  console.log();
  console.log(`Performance:`);
  console.log(`  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`  Avg Duration/Task: ${(avgDuration / 1000).toFixed(1)}s`);
  console.log(`  Avg Confidence: ${(avgConfidence * 100).toFixed(1)}%`);
  console.log();

  // Tier distribution
  const tierCounts: Record<string, number> = {};
  results.forEach((r) => {
    const tier = `T${r.tier}`;
    tierCounts[tier] = (tierCounts[tier] || 0) + 1;
  });
  console.log(`Tier Distribution:`);
  Object.entries(tierCounts).forEach(([tier, count]) => {
    console.log(`  ${tier}: ${count} tasks`);
  });
  console.log();

  // Phase 4: Grading
  console.log("## Phase 4: Main Chat Grading");
  console.log("-".repeat(80));
  console.log();

  const grade = calculateGrade(results, decomposition.microTasks.length);
  console.log(`Overall Grade: ${grade.letter} (${grade.score}/100)`);
  console.log();
  console.log(`Breakdown:`);
  console.log(`  Completion Rate: ${grade.completionScore}/40 (${((successCount / decomposition.microTasks.length) * 100).toFixed(0)}% of tasks succeeded)`);
  console.log(`  Confidence Score: ${grade.confidenceScore}/30 (avg ${(avgConfidence * 100).toFixed(0)}% confidence)`);
  console.log(`  Efficiency Score: ${grade.efficiencyScore}/20 (${(avgDuration / 1000).toFixed(1)}s avg per task)`);
  console.log(`  Atomicity Score: ${grade.atomicityScore}/10 (${decomposition.microTasks.length} atomic tasks generated)`);
  console.log();

  // Detailed feedback
  console.log(`Feedback:`);
  grade.feedback.forEach((f) => console.log(`  - ${f}`));
  console.log();

  // Final verdict
  console.log("=".repeat(80));
  if (grade.score >= 70) {
    console.log("✅ PASSED - Dashboard build test succeeded");
  } else if (grade.score >= 50) {
    console.log("⚠️  PARTIAL - Dashboard build partially succeeded");
  } else {
    console.log("❌ FAILED - Dashboard build test failed");
  }
  console.log("=".repeat(80));

  return {
    decomposition,
    results,
    grade,
    totalDuration,
  };
}

// =============================================
// Grading Function
// =============================================

interface Grade {
  score: number;
  letter: string;
  completionScore: number;
  confidenceScore: number;
  efficiencyScore: number;
  atomicityScore: number;
  feedback: string[];
}

function calculateGrade(
  results: Array<{ success: boolean; confidence: number; durationMs: number }>,
  totalTasks: number
): Grade {
  const feedback: string[] = [];

  // Completion (40 points)
  const successCount = results.filter((r) => r.success).length;
  const completionRate = successCount / totalTasks;
  const completionScore = Math.round(completionRate * 40);

  if (completionRate === 1) {
    feedback.push("All micro-tasks completed successfully");
  } else if (completionRate >= 0.8) {
    feedback.push(`${successCount}/${totalTasks} tasks completed - good but not perfect`);
  } else if (completionRate >= 0.5) {
    feedback.push(`Only ${successCount}/${totalTasks} tasks completed - needs improvement`);
  } else {
    feedback.push(`Only ${successCount}/${totalTasks} tasks completed - significant issues`);
  }

  // Confidence (30 points)
  const avgConfidence =
    results.filter((r) => r.success).reduce((sum, r) => sum + r.confidence, 0) /
      successCount || 0;
  const confidenceScore = Math.round(avgConfidence * 30);

  if (avgConfidence >= 0.8) {
    feedback.push("High confidence in implementations");
  } else if (avgConfidence >= 0.5) {
    feedback.push("Moderate confidence - some uncertainty in implementations");
  } else {
    feedback.push("Low confidence - implementations may need review");
  }

  // Efficiency (20 points) - based on avg task time
  const avgDuration = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;
  let efficiencyScore: number;

  if (avgDuration < 30000) {
    // < 30s per task
    efficiencyScore = 20;
    feedback.push("Excellent efficiency - fast task execution");
  } else if (avgDuration < 60000) {
    // < 1 min per task
    efficiencyScore = 15;
    feedback.push("Good efficiency");
  } else if (avgDuration < 120000) {
    // < 2 min per task
    efficiencyScore = 10;
    feedback.push("Moderate efficiency - some tasks took longer");
  } else {
    efficiencyScore = 5;
    feedback.push("Low efficiency - tasks took too long");
  }

  // Atomicity (10 points) - based on decomposition quality
  let atomicityScore: number;

  if (totalTasks >= 5 && totalTasks <= 10) {
    atomicityScore = 10;
    feedback.push("Good task decomposition granularity");
  } else if (totalTasks >= 3) {
    atomicityScore = 7;
    feedback.push("Acceptable decomposition - could be more granular");
  } else {
    atomicityScore = 4;
    feedback.push("Decomposition too coarse - tasks may be too complex");
  }

  const score = completionScore + confidenceScore + efficiencyScore + atomicityScore;

  let letter: string;
  if (score >= 90) letter = "A";
  else if (score >= 80) letter = "B";
  else if (score >= 70) letter = "C";
  else if (score >= 60) letter = "D";
  else letter = "F";

  return {
    score,
    letter,
    completionScore,
    confidenceScore,
    efficiencyScore,
    atomicityScore,
    feedback,
  };
}

// Run test
runDashboardBuildTest()
  .then((result) => {
    console.log("\nTest completed.");
    process.exit(result.grade.score >= 50 ? 0 : 1);
  })
  .catch((error) => {
    console.error("Test failed with error:", error);
    process.exit(1);
  });
