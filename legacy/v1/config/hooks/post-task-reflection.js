#!/usr/bin/env node

/**
 * Post-Task Reflection Hook
 *
 * Automatically triggers ACE reflection after task completion.
 * Extracts lessons from execution traces and stores in context_reflections table.
 *
 * Usage: Configured in Claude Code hooks settings
 * Trigger: After task completion (auto)
 *
 * Environment Variables:
 * - TASK_ID: Current task ID
 * - AGENT_ID: Current agent ID
 * - TASK_STATUS: Task status (completed|failed)
 * - AUTO_CURATE: Enable auto-curation (true|false)
 */

const { spawn } = require('child_process');
const path = require('path');

const CONFIG = {
  minConfidenceForReflection: 0.5,
  autoCurateThreshold: 0.8,
  enabledForTaskTypes: ['feature', 'bug', 'refactor', 'optimization', 'security'],
  reflectionAgentType: 'context-reflector',
  skipReflectionOnFailure: false,
};

/**
 * Main hook execution
 */
async function main() {
  const taskId = process.env.TASK_ID || process.argv[2];
  const agentId = process.env.AGENT_ID || process.argv[3];
  const taskStatus = process.env.TASK_STATUS || process.argv[4] || 'completed';
  const autoCurate = process.env.AUTO_CURATE === 'true';

  if (!taskId) {
    console.error('❌ POST-TASK-REFLECTION: No task ID provided');
    process.exit(1);
  }

  console.log(`🔄 POST-TASK-REFLECTION: Task ${taskId} (status: ${taskStatus})`);

  // Skip reflection for failed tasks if configured
  if (taskStatus === 'failed' && CONFIG.skipReflectionOnFailure) {
    console.log('⏭️  Skipping reflection for failed task (configured)');
    process.exit(0);
  }

  try {
    // Check if task type is enabled for reflection
    const taskType = await getTaskType(taskId);
    if (taskType && !CONFIG.enabledForTaskTypes.includes(taskType)) {
      console.log(`⏭️  Task type '${taskType}' not configured for reflection`);
      process.exit(0);
    }

    // Spawn context-reflector agent
    console.log(`🤖 Spawning ${CONFIG.reflectionAgentType} agent...`);

    const reflectionResult = await spawnReflector({
      taskId,
      agentId,
      taskStatus,
      autoCurate: autoCurate || shouldAutoCurate(taskStatus),
    });

    if (reflectionResult.success) {
      console.log(`✅ Reflection completed: ${reflectionResult.reflectionId}`);
      console.log(`📊 Extracted ${reflectionResult.lessonCount} lessons`);

      if (reflectionResult.autoCurated) {
        console.log(`✅ Auto-curation completed: ${reflectionResult.bulletIds.length} bullets updated`);
      } else {
        console.log(`💡 Run /context-curate --reflection-id=${reflectionResult.reflectionId} to merge`);
      }

      // Log to SQLite metrics
      await logReflectionMetrics(reflectionResult);

      process.exit(0);
    } else {
      console.error(`❌ Reflection failed: ${reflectionResult.error}`);
      process.exit(1);
    }

  } catch (error) {
    console.error(`❌ POST-TASK-REFLECTION ERROR: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Get task type from SQLite
 */
async function getTaskType(taskId) {
  // Query SQLite tasks table
  // This is a placeholder - actual implementation would use SQLite client
  return 'feature'; // Example
}

/**
 * Determine if auto-curation should be enabled
 */
function shouldAutoCurate(taskStatus) {
  // Auto-curate successful tasks with high confidence
  return taskStatus === 'completed';
}

/**
 * Spawn context-reflector agent via CLI
 */
async function spawnReflector(options) {
  return new Promise((resolve, reject) => {
    const args = [
      '/context-reflect',
      `--task-id=${options.taskId}`,
    ];

    if (options.agentId) {
      args.push(`--agent-id=${options.agentId}`);
    }

    if (options.autoCurate) {
      args.push('--auto-curate');
    }

    args.push('--output=json');

    // Execute slash command
    const proc = spawn('claude-flow-novice', args, {
      cwd: path.join(__dirname, '../..'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(stdout);
          resolve({
            success: true,
            reflectionId: result.reflectionId,
            lessonCount: result.extracted_lessons?.length || 0,
            autoCurated: result.autoCurated || false,
            bulletIds: result.bulletIds || [],
          });
        } catch (error) {
          reject(new Error(`Failed to parse reflection output: ${error.message}`));
        }
      } else {
        reject(new Error(`Reflection failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (error) => {
      reject(new Error(`Failed to spawn reflector: ${error.message}`));
    });
  });
}

/**
 * Log reflection metrics to SQLite
 */
async function logReflectionMetrics(result) {
  // Insert into metrics table
  // This is a placeholder - actual implementation would use SQLite client
  console.log('📊 Logging reflection metrics to SQLite...');
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
