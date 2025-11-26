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

import { spawn, execFileSync } from 'child_process';
import { resolve } from 'path';

interface AgentSpawnOptions {
  agentType: string;
  agentId?: string;
  taskId?: string;
  iteration?: number;
  context?: string;
  mode?: string;
  priority?: number;
  parentTaskId?: string;
}

/**
 * SECURITY: Parameter validation to prevent command injection (CVSS 8.9)
 * Validates all parameters that will be passed to execFileSync()
 */

/**
 * Validates taskId format to prevent command injection attacks
 * Pattern: optional namespace prefix (e.g., "cli:", "task:"), alphanumeric, underscore, hyphen, dot (max 64 chars)
 * Examples: "task-123", "cli:task-456", "orchestrator:batch-789"
 */
function validateTaskId(taskId: string): { valid: boolean; error?: string } {
  if (typeof taskId !== 'string' || taskId.length === 0) {
    return { valid: false, error: 'Task ID must be a non-empty string' };
  }

  // Allow optional namespace prefix (lowercase letters + colon), followed by alphanumeric/underscore/hyphen/dot
  const taskIdPattern = /^([a-z]+:)?[a-zA-Z0-9_.-]{1,64}$/;
  if (!taskIdPattern.test(taskId)) {
    return {
      valid: false,
      error: 'Invalid task ID format - must contain optional namespace prefix (e.g., "cli:") and alphanumeric characters, underscores, hyphens, or dots (max 64 chars)'
    };
  }
  return { valid: true };
}

/**
 * Validates Redis host to prevent command injection
 * Allows: hostnames, domain names, localhost, IPv4, IPv6 (::1)
 */
function validateRedisHost(host: string): { valid: boolean; error?: string } {
  if (typeof host !== 'string' || host.length === 0) {
    return { valid: false, error: 'Redis host must be a non-empty string' };
  }

  // Pattern: alphanumeric, hyphens, dots (for domains), plus special IPv6 loopback
  const hostPattern = /^[a-zA-Z0-9.-]+$|^::1$/;
  if (!hostPattern.test(host)) {
    return { valid: false, error: 'Invalid Redis host format' };
  }
  return { valid: true };
}

/**
 * Validates Redis port to prevent command injection
 * Range: 1-65535
 */
function validateRedisPort(port: string): { valid: boolean; error?: string } {
  if (typeof port !== 'string' || port.length === 0) {
    return { valid: false, error: 'Redis port must be a non-empty string' };
  }

  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return { valid: false, error: 'Invalid Redis port - must be between 1 and 65535' };
  }
  return { valid: true };
}

/**
 * Safely retrieves context from Redis using execFileSync()
 * Prevents command injection by using array-based arguments instead of template literals
 */
function getRedisContextSafely(
  taskId: string,
  redisHost: string,
  redisPort: string,
  contextKey: string
): string {
  try {
    // Validate all parameters BEFORE executing
    const taskIdValidation = validateTaskId(taskId);
    if (!taskIdValidation.valid) {
      console.warn(`[cfn-spawn] Invalid task ID: ${taskIdValidation.error}`);
      return '';
    }

    const hostValidation = validateRedisHost(redisHost);
    if (!hostValidation.valid) {
      console.warn(`[cfn-spawn] Invalid Redis host: ${hostValidation.error}`);
      return '';
    }

    const portValidation = validateRedisPort(redisPort);
    if (!portValidation.valid) {
      console.warn(`[cfn-spawn] Invalid Redis port: ${portValidation.error}`);
      return '';
    }

    // All parameters validated - now execute safely with execFileSync()
    // Using array arguments prevents shell interpolation of metacharacters
    const redisKey = `swarm:${taskId}:${contextKey}`;
    const result = execFileSync('redis-cli', [
      '-h', redisHost,
      '-p', redisPort,
      'get',
      redisKey
    ], { encoding: 'utf8' });

    const trimmed = result.trim();
    return trimmed === '(nil)' ? '' : trimmed;
  } catch (e) {
    // Redis not available or key doesn't exist - fail silently
    return '';
  }
}

/**
 * Parse command line arguments for agent spawning
 */
export function parseAgentArgs(args: string[]): AgentSpawnOptions | null {
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

  // Validate agent type exists and is not a flag
  if (!agentType || agentType.startsWith('--')) {
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
      case '--agent-id':
        options.agentId = value;
        break;
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
export async function spawnAgent(options: AgentSpawnOptions): Promise<void> {
  const { agentType, agentId, taskId, iteration, context, mode, priority, parentTaskId } = options;

  console.log(`[cfn-spawn] Spawning agent: ${agentType}`);
  if (agentId) console.log(`[cfn-spawn]   Agent ID: ${agentId}`);
  if (taskId) console.log(`[cfn-spawn]   Task ID: ${taskId}`);
  if (iteration) console.log(`[cfn-spawn]   Iteration: ${iteration}`);
  if (context) console.log(`[cfn-spawn]   Context: ${context}`);
  if (mode) console.log(`[cfn-spawn]   Mode: ${mode}`);

  // Build command arguments for npx claude-flow-novice agent
  const claudeArgs = ['claude-flow-novice', 'agent', agentType];

  // Add optional parameters
  if (agentId) {
    claudeArgs.push('--agent-id', agentId);
  }
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

  // Fetch epic context from Redis if available
  let epicContext = '';
  let phaseContext = '';
  let successCriteria = '';

  if (taskId) {
    // SECURITY FIX (CVSS 8.9): Use safe parameter validation and execFileSync()
    // Prevent command injection by validating all parameters BEFORE execution
    // FIX: Default to 'localhost' for CLI mode (host execution), not 'cfn-redis' (Docker)
    const redisHost = process.env.CFN_REDIS_HOST || 'localhost';
    const redisPort = process.env.CFN_REDIS_PORT || '6379';

    // Validate Redis connection parameters
    const hostValidation = validateRedisHost(redisHost);
    const portValidation = validateRedisPort(redisPort);

    if (hostValidation.valid && portValidation.valid) {
      // Try to read epic-level context from Redis
      epicContext = getRedisContextSafely(taskId, redisHost, redisPort, 'epic-context');

      // Try to read phase-specific context
      phaseContext = getRedisContextSafely(taskId, redisHost, redisPort, 'phase-context');

      // Try to read success criteria
      successCriteria = getRedisContextSafely(taskId, redisHost, redisPort, 'success-criteria');

      if (epicContext) {
        console.log(`[cfn-spawn]   Epic context loaded from Redis`);
      }
    } else {
      console.warn(`[cfn-spawn]   Invalid Redis configuration - skipping context load`);
      if (!hostValidation.valid) console.warn(`[cfn-spawn]   ${hostValidation.error}`);
      if (!portValidation.valid) console.warn(`[cfn-spawn]   ${portValidation.error}`);
    }
  }

  // Add environment variables for agent context - WHITELIST ONLY APPROACH
  // SECURITY FIX: Do not use ...process.env spread which exposes ALL variables including secrets
  // Instead, explicitly whitelist safe variables to pass to spawned process
  const safeEnvVars = [
    'CFN_REDIS_HOST',
    'CFN_REDIS_PORT',
    'CFN_REDIS_PASSWORD',  // CRITICAL: Required for Redis authentication
    'CFN_REDIS_URL',
    'REDIS_PASSWORD',      // Fallback for Redis password
    'CFN_MEMORY_BUDGET',
    'CFN_API_HOST',
    'CFN_API_PORT',
    'CFN_LOG_LEVEL',
    'CFN_LOG_FORMAT',
    'CFN_CONTAINER_MODE',
    'CFN_DOCKER_SOCKET',
    'CFN_NETWORK_NAME',
    'CFN_CUSTOM_ROUTING',
    'CFN_DEFAULT_PROVIDER',
    'NODE_ENV',
    'PATH',
    'HOME',
    'PWD'                  // Required for working directory context
  ];

  // Build whitelist-only env object
  const env: Record<string, string> = {};

  // Add whitelisted CFN variables
  for (const key of safeEnvVars) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }

  // Add API key only when explicitly needed (with strict validation)
  if (process.env.ANTHROPIC_API_KEY) {
    // Validate format: should start with "sk-" or "sk-ant-"
    if (process.env.ANTHROPIC_API_KEY.match(/^sk-[a-zA-Z0-9-]+$/)) {
      env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    } else {
      console.warn('[cfn-spawn] Warning: ANTHROPIC_API_KEY format invalid, not passing to agent');
    }
  }

  // Add task and execution context variables
  env.AGENT_TYPE = agentType;
  env.TASK_ID = taskId || '';
  env.ITERATION = iteration?.toString() || '1';
  env.CONTEXT = context || '';
  env.MODE = mode || 'cli';
  env.PRIORITY = priority?.toString() || '5';
  env.PARENT_TASK_ID = parentTaskId || '';

  // Epic-level context from Redis (sanitized)
  env.EPIC_CONTEXT = epicContext;
  env.PHASE_CONTEXT = phaseContext;
  env.SUCCESS_CRITERIA = successCriteria;

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
export function buildTaskDescription(
  agentType: string,
  taskId?: string,
  iteration?: number,
  context?: string
): string {
  let desc = `Execute task as ${agentType} agent`;

  if (taskId) desc += ` for task ${taskId}`;
  if (iteration !== undefined) desc += ` (iteration ${iteration})`;
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
  --agent-id <id>        Explicit agent identifier (overrides auto-generation)
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
  cfn-spawn tester --agent-id tester-1-1 --task-id test-phase --iteration 1
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
