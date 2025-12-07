/**
 * MDAP Agent Profile Standardization Test
 *
 * Uses Trigger.dev MDAP infrastructure to standardize agent profiles:
 * - Converts multi-line YAML arrays to inline format
 * - Adds missing fields (skills, tags, version, priority, color)
 * - Parallelizes across all 60+ agent files
 *
 * Target: ~500ms-3s per file via Groq/Cerebras APIs
 */

import { configure, tasks, runs } from "@trigger.dev/sdk/v3";
import * as fs from "fs/promises";
import * as path from "path";

// Configure SDK
configure({
  secretKey: process.env.TRIGGER_SECRET_KEY || "tr_dev_ffR3mLELFuaaA0txq0lO",
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

// Agent categories with their skills
const CATEGORY_SKILLS: Record<string, string[]> = {
  analysts: ["cfn-project-analysis", "cfn-ruvector-codebase-index"],
  architecture: ["cfn-planning", "cfn-task-planning"],
  coordinators: ["cfn-loop-orchestration", "cfn-redis-coordination"],
  "dev-ops": ["cfn-docker-runtime", "cfn-github-workflow"],
  developers: ["cfn-agent-spawning", "cfn-test-framework"],
  documentation: ["cfn-session-handoff", "cfn-knowledge-base"],
  "product-owners": ["cfn-sprint-execution", "cfn-validation-framework"],
  reviewers: ["cfn-validation-framework", "cfn-test-framework"],
  testers: ["cfn-test-framework", "cfn-validation-framework"],
  utility: ["cfn-agent-tooling", "cfn-skill-management"],
  testing: ["cfn-test-framework", "cfn-validation-framework"],
  quality: ["cfn-validation-framework", "cfn-project-analysis"],
  personas: ["cfn-session-handoff", "cfn-knowledge-base"],
  frontend: ["cfn-agent-spawning", "cfn-test-framework"],
  database: ["cfn-memory-persistence", "cfn-parameterized-queries"],
  data: ["cfn-memory-persistence", "cfn-ruvector-codebase-index"],
};

// Colors for agents (deterministic by filename hash)
const COLORS = [
  "red", "orange", "yellow", "green", "teal", "cyan", "blue", "indigo",
  "purple", "pink", "rose", "amber", "lime", "emerald", "sky", "violet",
  "fuchsia", "slate", "zinc", "stone", "coral", "crimson", "gold", "mint",
];

function getColorForAgent(filename: string): string {
  let hash = 0;
  for (let i = 0; i < filename.length; i++) {
    hash = ((hash << 5) - hash) + filename.charCodeAt(i);
    hash = hash & hash;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

// Find all agent files
async function findAgentFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function recurse(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await recurse(fullPath);
      } else if (
        entry.name.endsWith(".md") &&
        !entry.name.startsWith("README") &&
        !entry.name.startsWith("CLAUDE")
      ) {
        files.push(fullPath);
      }
    }
  }

  await recurse(dir);
  return files;
}

// Get category from file path
function getCategory(filePath: string): string {
  const parts = filePath.split(path.sep);
  const agentsIndex = parts.indexOf("cfn-dev-team");
  if (agentsIndex >= 0 && parts.length > agentsIndex + 1) {
    return parts[agentsIndex + 1];
  }
  return "utility";
}

// Build the standardization prompt for a single file
function buildStandardizationPrompt(
  filePath: string,
  content: string,
  category: string
): string {
  const filename = path.basename(filePath);
  const color = getColorForAgent(filename);
  const skills = CATEGORY_SKILLS[category] || ["cfn-agent-tooling"];
  const priority = ["coordinators", "quality"].includes(category) ? "P1" : "P2";

  return `You are a YAML frontmatter standardization expert. Standardize this agent profile file.

## Input File: ${filename}
## Category: ${category}

## Current Content:
\`\`\`markdown
${content}
\`\`\`

## Required Changes:
1. Convert ALL multi-line arrays to inline comma-separated format: \`field: [item1, item2]\`
2. Add missing field after 'type': \`color: ${color}\`
3. Ensure \`skills: [${skills.join(", ")}]\` is present
4. Generate tags from name + capabilities + category
5. Add \`version: 1.0.0\` if missing
6. Add \`priority: ${priority}\` if missing

## Required Field Order in Frontmatter:
name, description, model, type, color, skills, capabilities, tags, validation_hooks, acl_level, version, priority

## CRITICAL Rules:
- Keep ALL content after the closing \`---\` EXACTLY as-is
- Only modify the YAML frontmatter between the \`---\` markers
- Every array field must be on a SINGLE line: \`field: [a, b, c]\`
- Do NOT add any new content to the body

## Output Format:
Return a JSON object with a single "code" field containing the complete file content (frontmatter + body).
Example: {"code": "---\\nname: example\\n---\\n\\n# Content"}`;
}

interface AgentTask {
  filePath: string;
  filename: string;
  category: string;
  content: string;
}

/**
 * Extract markdown content from MDAP response.
 * With JSON mode enabled, expects JSON with "code" field containing frontmatter.
 * Handles multiple response formats as fallback:
 * 1. JSON with "code" field: {"code": "---\nname: ..."} (PRIMARY - JSON mode)
 * 2. Raw markdown: "---\nname: ..." (fallback)
 * 3. Markdown in code block: ```markdown\n---\nname: ...\n```
 */
function extractMarkdownContent(generatedCode: string): string {
  if (!generatedCode || typeof generatedCode !== "string") {
    throw new Error("Empty or invalid content received from AI model");
  }

  let content = generatedCode.trim();

  // PRIMARY: JSON mode response with "code" field
  // Clean up potential prefixes (e.g., "on\n" or "json\n" from "```json")
  const cleanContent = content.replace(/^(on|json|markdown)\s*/i, "");

  const jsonStart = cleanContent.indexOf("{");
  if (jsonStart >= 0) {
    const jsonContent = cleanContent.slice(jsonStart);

    // Try to parse as valid JSON
    try {
      const parsed = JSON.parse(jsonContent);
      if (parsed.code && typeof parsed.code === "string" && parsed.code.startsWith("---")) {
        return parsed.code;
      }
    } catch {
      // JSON may be truncated, try regex extraction
    }

    // Extract code field using regex (handles truncated JSON)
    const codeMatch = jsonContent.match(/"code"\s*:\s*"([\s\S]*?)(?:"\s*[,}]|$)/);
    if (codeMatch && codeMatch[1]) {
      let code = codeMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");

      if (code.startsWith("---")) {
        return code;
      }
    }
  }

  // FALLBACK 1: Raw markdown starting with frontmatter
  if (content.startsWith("---")) {
    return content;
  }

  // FALLBACK 2: Extract from markdown code block
  const codeBlockMatch = content.match(/```(?:markdown|yaml|md)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    const extracted = codeBlockMatch[1].trim();
    if (extracted.startsWith("---")) {
      return extracted;
    }
  }

  // FALLBACK 3: Find frontmatter anywhere in the content
  const frontmatterMatch = content.match(/(---\n[\s\S]*?---[\s\S]*)/);
  if (frontmatterMatch) {
    return frontmatterMatch[1];
  }

  throw new Error(`Failed to extract markdown content from response: ${content.substring(0, 100)}...`);
}

async function runMDAPStandardization() {
  console.log("=".repeat(80));
  console.log("MDAP Agent Profile Standardization");
  console.log("=".repeat(80));

  const testStartTime = Date.now();

  // Find agents directory
  const agentsDir = "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/agents-mdap-test/cfn-dev-team";

  // First, reset the test folder by copying fresh from source
  const sourceDir = "/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/agents/cfn-dev-team";
  const targetParent = path.dirname(agentsDir);

  console.log("\n1. Resetting test folder...");

  // Remove existing test folder
  try {
    await fs.rm(agentsDir, { recursive: true, force: true });
  } catch {
    // Folder might not exist
  }

  // Copy fresh from source using cp -r via child_process
  const { execSync } = await import("child_process");
  execSync(`cp -r "${sourceDir}" "${agentsDir}"`, { stdio: "pipe" });
  console.log(`   Copied fresh agents from source to test folder`);

  // Find all agent files
  const files = await findAgentFiles(agentsDir);
  console.log(`   Found ${files.length} agent files`);

  // Prepare tasks
  const agentTasks: AgentTask[] = [];
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf-8");
    // Skip files without frontmatter
    if (!content.startsWith("---\n")) {
      console.log(`   Skipping (no frontmatter): ${path.basename(filePath)}`);
      continue;
    }

    agentTasks.push({
      filePath,
      filename: path.basename(filePath),
      category: getCategory(filePath),
      content,
    });
  }

  console.log(`\n2. Preparing ${agentTasks.length} MDAP tasks...`);

  // Create payloads for MDAP implementer with rawOutput mode
  const payloads = agentTasks.map((task, index) => ({
    payload: {
      taskId: `mdap-standardize-${Date.now()}`,
      microTaskId: `agent-${index}-${task.filename.replace(".md", "")}`,
      taskDescription: buildStandardizationPrompt(
        task.filePath,
        task.content,
        task.category
      ),
      workDir: path.dirname(task.filePath),
      targetFile: task.filePath,
      language: "markdown",
      modelTier: 1, // Start with T1 for fast, simple transformations
      failureCount: 0,
      rawOutput: true, // YAML transformation - skip JSON wrapping
    },
  }));

  console.log(`\n3. Triggering batch of ${payloads.length} tasks...`);
  const batchStartTime = Date.now();

  try {
    // Trigger batch
    const batchHandle = await tasks.batchTrigger("cfn-mdap-implementer", payloads);
    console.log(`   Batch ID: ${batchHandle.batchId}`);
    console.log(`   Run count: ${batchHandle.runCount}`);

    // Use subscribeToBatch for real-time completion tracking
    console.log(`\n4. Waiting for completion (streaming)...`);

    const results: Array<{
      filename: string;
      success: boolean;
      durationMs?: number;
      error?: string;
      code?: string;
    }> = [];

    // Build a map from microTaskId to task for easy lookup
    const taskMap = new Map(
      agentTasks.map((task, index) => [
        `agent-${index}-${task.filename.replace(".md", "")}`,
        task,
      ])
    );

    let completed = 0;
    const totalTasks = batchHandle.runCount;

    // Subscribe to batch completion events
    for await (const run of runs.subscribeToBatch(batchHandle.batchId)) {
      completed++;

      // Extract microTaskId from run payload
      const payload = (run as any).payload || {};
      const microTaskId = payload.microTaskId || `unknown-${completed}`;
      const task = taskMap.get(microTaskId);

      const output = (run as any).output || {};

      if (run.status === "COMPLETED" && output.success) {
        console.log(
          `   [${completed}/${totalTasks}] ✓ ${task?.filename || microTaskId} (${output.durationMs}ms)`
        );

        // Extract and write the generated code to the file
        if (output.generatedCode && task) {
          try {
            const markdownContent = extractMarkdownContent(output.generatedCode);
            await fs.writeFile(task.filePath, markdownContent);
            results.push({
              filename: task?.filename || microTaskId,
              success: true,
              durationMs: output.durationMs,
              code: markdownContent,
            });
          } catch (extractError) {
            console.log(
              `   [${completed}/${totalTasks}] ✗ ${task?.filename || microTaskId}: ${(extractError as Error).message}`
            );
            results.push({
              filename: task?.filename || microTaskId,
              success: false,
              error: (extractError as Error).message,
            });
          }
        } else {
          results.push({
            filename: task?.filename || microTaskId,
            success: true,
            durationMs: output.durationMs,
          });
        }
      } else {
        console.log(
          `   [${completed}/${totalTasks}] ✗ ${task?.filename || microTaskId}: ${output.error || run.status}`
        );
        results.push({
          filename: task?.filename || microTaskId,
          success: false,
          error: output.error || run.status,
        });
      }
    }

    const batchDuration = Date.now() - batchStartTime;
    const totalDuration = Date.now() - testStartTime;

    // Summary
    console.log("\n" + "=".repeat(80));
    console.log("Results Summary");
    console.log("=".repeat(80));

    const successCount = results.filter((r) => r.success).length;
    const avgDuration =
      results
        .filter((r) => r.durationMs)
        .reduce((sum, r) => sum + (r.durationMs || 0), 0) /
        (successCount || 1);

    console.log(`Total Files: ${agentTasks.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${agentTasks.length - successCount}`);
    console.log(`Success Rate: ${((successCount / agentTasks.length) * 100).toFixed(1)}%`);
    console.log(`\nPerformance:`);
    console.log(`  Batch Duration: ${(batchDuration / 1000).toFixed(1)}s`);
    console.log(`  Total Duration: ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`  Avg Duration/Task: ${(avgDuration / 1000).toFixed(2)}s`);
    console.log(`  Throughput: ${(agentTasks.length / (batchDuration / 1000)).toFixed(1)} tasks/sec`);

    // List failures
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0) {
      console.log(`\nFailures:`);
      failures.forEach((f) => console.log(`  - ${f.filename}: ${f.error}`));
    }

    console.log("=".repeat(80));

    return { successCount, totalCount: agentTasks.length };
  } catch (error) {
    console.error(`\nBatch trigger failed: ${(error as Error).message}`);
    throw error;
  }
}

// Run test
runMDAPStandardization().catch(console.error);
