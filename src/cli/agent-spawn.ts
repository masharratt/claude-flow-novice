#!/usr/bin/env node
/**
 * Agent Spawning CLI - Direct agent process spawning
 *
 * Usage:
 *   npx cfn-spawn agent <type> [options]
 *   npx cfn-spawn <type> [options]  (agent is implied)
 *
 * Examples:
 *   npx cfn-spawn agent researcher --task-id task-123 --iteration 1
 *   npx cfn-spawn researcher --task-id task-123 --iteration 1
 */

import { spawn } from 'child_process';
import { resolve } from 'path';

interface AgentSpawnOptions {
  agentType: string;
  taskId?: string;
  iteration?: number;
  context?: string;
  mode?: string;
  priority?: number;
  parentTaskId?: string;
}

/**
 * Parse command line arguments for agent spawning
 */
function parseAgentArgs(args: string[]): AgentSpawnOptions | null {
  // Handle both "agent <type>" and "<type>" patterns
  let agentType: string;
  let optionArgs: string[];

  if (args[0] === 'agent') {
    agentType = args[1];
    optionArgs = args.slice(2);
  } else {
    agentType = args[0];
    optionArgs = args.slice(1);
  }

  if (!agentType) {
    console.error('Error: Agent type is required');
    console.error('Usage: cfn-spawn agent <type> [options]');
    return null;
  }

  const options: AgentSpawnOptions = { agentType };

  // Parse optional parameters
  for (let i = 0; i < optionArgs.length; i += 2) {
    const key = optionArgs[i];
    const value = optionArgs[i + 1];

    switch (key) {
      case '--task-id':
        options.taskId = value;
        break;
      case '--iteration':
        options.iteration = parseInt(value, 10);
        break;
      case '--context':
        options.context = value;
        break;
      case '--mode':
        options.mode = value;
        break;
      case '--priority':
        options.priority = parseInt(value, 10);
        break;
      case '--parent-task':
      case '--parent-task-id':
        options.parentTaskId = value;
        break;
      default:
        console.warn(`Unknown option: ${key}`);
    }
  }

  return options;
}

/**
 * Spawn an agent process using npx claude-flow-novice agent
 *
 * This is a wrapper/alias for the existing claude-flow-novice agent spawning mechanism
 * Provides the cfn-spawn naming pattern while delegating to the working implementation
 */
async function spawnAgent(options: AgentSpawnOptions): Promise<void> {
  const { agentType, taskId, iteration, context, mode, priority, parentTaskId } = options;

  console.log(`[cfn-spawn] Spawning agent: ${agentType}`);
  if (taskId) console.log(`[cfn-spawn]   Task ID: ${taskId}`);
  if (iteration) console.log(`[cfn-spawn]   Iteration: ${iteration}`);
  if (context) console.log(`[cfn-spawn]   Context: ${context}`);
  if (mode) console.log(`[cfn-spawn]   Mode: ${mode}`);

  // Build command arguments for npx claude-flow-novice agent
  const claudeArgs = ['claude-flow-novice', 'agent', agentType];

  // Add optional parameters
  if (taskId) {
    claudeArgs.push('--task-id', taskId);
  }
  if (iteration) {
    claudeArgs.push('--iteration', iteration.toString());
  }
  if (context) {
    claudeArgs.push('--context', context);
  }
  if (mode) {
    claudeArgs.push('--mode', mode);
  }
  if (priority) {
    claudeArgs.push('--priority', priority.toString());
  }
  if (parentTaskId) {
    claudeArgs.push('--parent-task-id', parentTaskId);
  }

  // Add environment variables for agent context
  const env = {
    ...process.env,
    AGENT_TYPE: agentType,
    TASK_ID: taskId || '',
    ITERATION: iteration?.toString() || '1',
    CONTEXT: context || '',
    MODE: mode || 'cli',
    PRIORITY: priority?.toString() || '5',
    PARENT_TASK_ID: parentTaskId || ''
  };

  console.log(`[cfn-spawn] Executing: npx ${claudeArgs.join(' ')}`);

  // Spawn the claude-flow-novice agent process
  const agentProcess = spawn('npx', claudeArgs, {
    stdio: 'inherit',
    env,
    cwd: process.cwd()
  });

  // Handle process exit
  agentProcess.on('exit', (code, signal) => {
    if (code === 0) {
      console.log(`[cfn-spawn] Agent ${agentType} completed successfully`);
    } else {
      console.error(`[cfn-spawn] Agent ${agentType} exited with code ${code}, signal ${signal}`);
    }
    process.exit(code || 0);
  });

  // Handle process errors
  agentProcess.on('error', (err) => {
    console.error(`[cfn-spawn] Failed to spawn agent ${agentType}:`, err.message);
    process.exit(1);
  });

  // Cleanup on parent exit
  process.on('SIGINT', () => {
    console.log('\n[cfn-spawn] Received SIGINT, terminating agent...');
    agentProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('\n[cfn-spawn] Received SIGTERM, terminating agent...');
    agentProcess.kill('SIGTERM');
  });
}

/**
 * Build task description for the agent
 */
function buildTaskDescription(
  agentType: string,
  taskId?: string,
  iteration?: number,
  context?: string
): string {
  let desc = `Execute task as ${agentType} agent`;

  if (taskId) desc += ` for task ${taskId}`;
  if (iteration) desc += ` (iteration ${iteration})`;
  if (context) desc += `: ${context}`;

  return desc;
}

/**
 * Main CLI entry point
 */
export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  // Show help if requested
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
cfn-spawn - Claude Flow Novice Agent Spawner

Usage:
  cfn-spawn agent <type> [options]
  cfn-spawn <type> [options]        (agent is implied)

Options:
  --task-id <id>         Task identifier
  --iteration <n>        Iteration number
  --context <text>       Context description
  --mode <mode>          Execution mode (cli, api, hybrid)
  --priority <1-10>      Task priority
  --parent-task-id <id>  Parent task identifier

Examples:
  cfn-spawn agent researcher --task-id task-123 --iteration 1
  cfn-spawn coder --task-id auth-impl --context "Implement JWT auth"
  cfn-spawn reviewer --task-id auth-impl --iteration 2 --mode cli
    `);
    return;
  }

  // Parse arguments
  const options = parseAgentArgs(args);
  if (!options) {
    process.exit(1);
  }

  // Spawn the agent
  await spawnAgent(options);
}

// Run if called directly
// ES module check - compare import.meta.url with the executed file
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '');
if (isMainModule) {
  main().catch((err) => {
    console.error('[cfn-spawn] Fatal error:', err);
    process.exit(1);
  });
}
