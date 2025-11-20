/**
 * Agent Spawning Helper - TypeScript Implementation
 *
 * Spawns Loop 3 and Loop 2 agents with enriched context injection.
 * Wraps npx claude-flow-novice agent-spawn with format validation and dry-run support.
 *
 * @module helpers/spawn-agents
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Agent spawning result
 */
export interface SpawnResult {
  agentId: string;
  agentType: string;
  success: boolean;
  pid?: number | undefined;
  error?: string | undefined;
}

/**
 * Agent spawning summary
 */
export interface SpawnSummary {
  totalSpawned: number;
  successCount: number;
  failureCount: number;
  results: SpawnResult[];
  duration: number;
}

/**
 * Spawn agents configuration
 */
export interface SpawnAgentsConfig {
  taskId: string;
  iteration: number;
  agents: string[];
  originalContext: string;
  dryRun?: boolean;
  logDir?: string;
  projectRoot?: string;
}

/**
 * Validates agent type is either loop3 or loop2
 */
function validateAgentType(agentType: string): boolean {
  return ['loop3', 'loop2'].includes(agentType.toLowerCase());
}

/**
 * Sanitizes input to prevent injection attacks
 * Allows only alphanumeric, dash, underscore, dot, comma, colon
 */
function sanitizeInput(input: string): string {
  return input.replace(/[^a-zA-Z0-9._:,\-]/g, '');
}

/**
 * Generates unique agent ID with instance counter
 */
function generateAgentId(
  agentType: string,
  iteration: number,
  instanceNum: number
): string {
  return `${agentType}-${iteration}-${instanceNum}`;
}

/**
 * Formats the agent spawn CLI command
 */
function formatSpawnCommand(
  agentType: string,
  taskId: string,
  agentId: string,
  iteration: number,
  context: string
): string[] {
  return [
    'npx',
    'claude-flow-novice',
    'agent-spawn',
    agentType,
    '--task-id',
    taskId,
    '--agent-id',
    agentId,
    '--iteration',
    iteration.toString(),
    '--context',
    context,
  ];
}

/**
 * Validates CLI command format
 */
function validateCommandFormat(command: string[]): boolean {
  if (!Array.isArray(command) || command.length === 0) {
    return false;
  }

  if (command[0] !== 'npx' || command[1] !== 'claude-flow-novice') {
    return false;
  }

  if (command[2] !== 'agent-spawn') {
    return false;
  }

  // Validate required parameters
  const hasTaskId = command.includes('--task-id');
  const hasAgentId = command.includes('--agent-id');
  const hasIteration = command.includes('--iteration');
  const hasContext = command.includes('--context');

  return hasTaskId && hasAgentId && hasIteration && hasContext;
}

/**
 * Logs message to file and console
 */
async function logMessage(
  logDir: string,
  taskId: string,
  level: string,
  message: string
): Promise<void> {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message}`;

  // Log to console
  console.log(logEntry);

  // Log to file
  try {
    const logFile = path.join(logDir, `spawn-agents-${taskId}.log`);
    await fs.appendFile(logFile, `${logEntry}\n`);
  } catch (error) {
    console.error(`Failed to write to log file: ${error}`);
  }
}

/**
 * Spawns a single agent
 */
async function spawnSingleAgent(
  config: SpawnAgentsConfig,
  agentType: string,
  instanceNum: number,
  logDir: string
): Promise<SpawnResult> {
  const safeAgentType = sanitizeInput(agentType);
  const safeTaskId = sanitizeInput(config.taskId);
  const agentId = generateAgentId(safeAgentType, config.iteration, instanceNum);
  const safeAgentId = sanitizeInput(agentId);

  await logMessage(logDir, config.taskId, 'INFO', `Spawning agent: ${safeAgentType} (ID: ${safeAgentId})`);

  const command = formatSpawnCommand(
    safeAgentType,
    safeTaskId,
    safeAgentId,
    config.iteration,
    config.originalContext
  );

  // Validate command format
  if (!validateCommandFormat(command)) {
    const error = `Invalid command format for agent ${safeAgentType}`;
    await logMessage(logDir, config.taskId, 'ERROR', error);
    return {
      agentId: safeAgentId,
      agentType: safeAgentType,
      success: false,
      error,
    };
  }

  // Dry-run mode: just log the command without executing
  if (config.dryRun) {
    const cmdStr = command.join(' ');
    await logMessage(logDir, config.taskId, 'INFO', `DRY-RUN: ${cmdStr}`);
    return {
      agentId: safeAgentId,
      agentType: safeAgentType,
      success: true,
    };
  }

  try {
    // Spawn command in background
    const cmd = command[0];
    if (!cmd) {
      throw new Error('Command is empty');
    }

    const child = spawn(cmd, command.slice(1), {
      detached: true,
      stdio: 'ignore',
    });

    const pid = child.pid;
    await logMessage(logDir, config.taskId, 'INFO', `Agent ${safeAgentType} spawned (PID: ${pid || 'unknown'})`);

    // Unref to allow parent process to exit
    child.unref();

    return {
      agentId: safeAgentId,
      agentType: safeAgentType,
      success: true,
      pid: pid ?? undefined,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    await logMessage(logDir, config.taskId, 'ERROR', `Failed to spawn ${safeAgentType}: ${errorMsg}`);
    return {
      agentId: safeAgentId,
      agentType: safeAgentType,
      success: false,
      error: errorMsg,
    };
  }
}

/**
 * Main agent spawning function
 *
 * Spawns multiple agents with enriched context injection.
 * Returns spawn summary with results and metrics.
 *
 * @param config - Spawn configuration
 * @returns Spawn summary with results
 * @throws Error if required parameters are missing or invalid
 */
export async function spawnAgents(config: SpawnAgentsConfig): Promise<SpawnSummary> {
  const startTime = Date.now();

  // Validate required parameters
  if (!config.taskId || typeof config.taskId !== 'string') {
    throw new Error('Task ID is required and must be a string');
  }

  if (config.iteration < 0 || !Number.isInteger(config.iteration)) {
    throw new Error('Iteration must be a non-negative integer');
  }

  if (!Array.isArray(config.agents) || config.agents.length === 0) {
    throw new Error('Agents array is required and must not be empty');
  }

  if (!config.originalContext || typeof config.originalContext !== 'string') {
    throw new Error('Original context is required and must be a string');
  }

  // Validate all agents
  for (const agent of config.agents) {
    if (!validateAgentType(agent)) {
      throw new Error(`Invalid agent type: ${agent}. Must be 'loop3' or 'loop2'`);
    }
  }

  // Setup log directory
  const logDir = config.logDir || '.artifacts/logs';
  try {
    await fs.mkdir(logDir, { recursive: true });
  } catch (error) {
    console.error(`Failed to create log directory: ${error}`);
  }

  await logMessage(logDir, config.taskId, 'INFO', `Starting agent spawning (iteration ${config.iteration})`);

  // Spawn agents
  const results: SpawnResult[] = [];
  const instanceCounts = new Map<string, number>();

  for (const agent of config.agents) {
    const trimmedAgent = agent.trim();
    const instanceNum = (instanceCounts.get(trimmedAgent) || 0) + 1;
    instanceCounts.set(trimmedAgent, instanceNum);

    const result = await spawnSingleAgent(config, trimmedAgent, instanceNum, logDir);
    results.push(result);
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  await logMessage(
    logDir,
    config.taskId,
    'INFO',
    `Agent spawning complete: ${successCount} succeeded, ${failureCount} failed`
  );

  return {
    totalSpawned: results.length,
    successCount,
    failureCount,
    results,
    duration,
  };
}

/**
 * Spawns Loop 3 agents for given iteration
 */
export async function spawnLoop3Agents(
  taskId: string,
  iteration: number,
  context: string,
  dryRun?: boolean
): Promise<SpawnSummary> {
  return spawnAgents({
    taskId,
    iteration,
    agents: ['loop3'],
    originalContext: context,
    dryRun: dryRun ?? false,
  });
}

/**
 * Spawns Loop 2 agents for given iteration
 */
export async function spawnLoop2Agents(
  taskId: string,
  iteration: number,
  context: string,
  dryRun?: boolean
): Promise<SpawnSummary> {
  return spawnAgents({
    taskId,
    iteration,
    agents: ['loop2'],
    originalContext: context,
    dryRun: dryRun ?? false,
  });
}
