/**
 * Agent Spawning Utility
 * Handles spawning CFN Loop agents via CLI with proper context injection
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import {
  AgentSpawningRequest,
  AgentSpawningResponse,
  SuccessCriteria,
} from '../types/cfn-types';

const execAsync = promisify(exec);

/**
 * Configuration for agent spawning
 */
interface SpawnerConfig {
  /** Path to CFN CLI executable */
  cfnCliPath: string;

  /** Redis coordination host */
  redisHost: string;

  /** Redis coordination port */
  redisPort: number;

  /** Orchestrator context path */
  contextPath: string;

  /** Timeout for spawning in milliseconds */
  spawnTimeoutMs: number;
}

/**
 * Default spawner configuration
 */
const DEFAULT_CONFIG: SpawnerConfig = {
  cfnCliPath: 'npx claude-flow-novice',
  redisHost: 'localhost',
  redisPort: 6379,
  contextPath: '.claude/context',
  spawnTimeoutMs: 30000,
};

/**
 * Agent Spawner class for CFN Loop agents
 */
export class AgentSpawner {
  private config: SpawnerConfig;

  constructor(config: Partial<SpawnerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate unique agent ID
   * Format: <type>-<timestamp>-<random>
   */
  private generateAgentId(agentType: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `${agentType}-${timestamp}-${random}`;
  }

  /**
   * Validate success criteria before spawning
   */
  private validateSuccessCriteria(criteria: SuccessCriteria): void {
    if (!criteria.testCommand || criteria.testCommand.trim() === '') {
      throw new Error('Success criteria must include testCommand');
    }

    if (
      typeof criteria.passRateThreshold !== 'number' ||
      criteria.passRateThreshold < 0 ||
      criteria.passRateThreshold > 1
    ) {
      throw new Error('passRateThreshold must be a number between 0 and 1');
    }
  }

  /**
   * Build agent spawn command with proper context
   *
   * TODO: RUNTIME_TEST - Verify spawn command syntax with actual CFN CLI
   */
  private buildSpawnCommand(
    request: AgentSpawningRequest,
    agentId: string
  ): string {
    // Escape special characters in task description
    const escapedDescription = request.taskDescription
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$');

    // Build context JSON for agent
    const context = {
      taskId: request.taskId,
      agentId,
      agentType: request.agentType,
      successCriteria: request.successCriteria,
      ...request.context,
    };

    const contextJson = JSON.stringify(context);
    const escapedContext = contextJson.replace(/"/g, '\\"').replace(/\$/g, '\\$');

    // Build spawn command
    const command = [
      this.config.cfnCliPath,
      'agent-spawn',
      request.agentType,
      `--task-id "${request.taskId}"`,
      `--agent-id "${agentId}"`,
      `--task-description "${escapedDescription}"`,
      `--context '${escapedContext}'`,
      `--redis-host ${this.config.redisHost}`,
      `--redis-port ${this.config.redisPort}`,
    ].join(' ');

    return command;
  }

  /**
   * Spawn a CFN Loop agent
   *
   * @param request Agent spawning request
   * @returns Agent spawning response with job details
   * @throws Error if spawning fails or request is invalid
   *
   * TODO: RUNTIME_TEST - Verify agent spawn completes successfully
   * TODO: RUNTIME_TEST - Verify Redis coordination signals are received
   * TODO: RUNTIME_TEST - Verify agent-id uniqueness across concurrent spawns
   */
  async spawn(request: AgentSpawningRequest): Promise<AgentSpawningResponse> {
    // Validate inputs
    if (!request.agentType || request.agentType.trim() === '') {
      throw new Error('agentType is required');
    }

    if (!request.taskDescription || request.taskDescription.trim() === '') {
      throw new Error('taskDescription is required');
    }

    if (!request.taskId || request.taskId.trim() === '') {
      throw new Error('taskId is required');
    }

    this.validateSuccessCriteria(request.successCriteria);

    // Generate agent ID if not provided
    const agentId = request.agentId || this.generateAgentId(request.agentType);

    // Build spawn command
    const command = this.buildSpawnCommand(request, agentId);

    try {
      // Execute spawn command with timeout
      const { stdout, stderr } = await execAsync(command, {
        timeout: this.config.spawnTimeoutMs,
      });

      // Parse spawn response (expected format: JSON with jobId)
      const spawnResponse = this.parseSpawnResponse(stdout, stderr);

      return {
        agentId,
        jobId: spawnResponse.jobId,
        spawnedAt: new Date().toISOString(),
        estimatedDurationSeconds: this.estimateDuration(request.agentType),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to spawn agent ${agentId}: ${errorMessage}`);
    }
  }

  /**
   * Spawn multiple agents in parallel (fan-out pattern)
   *
   * @param requests Array of agent spawning requests
   * @returns Array of spawning responses
   *
   * TODO: RUNTIME_TEST - Verify all agents spawn successfully
   * TODO: RUNTIME_TEST - Verify no race conditions in parallel spawning
   * TODO: RUNTIME_TEST - Verify agent IDs remain unique
   */
  async spawnBatch(
    requests: AgentSpawningRequest[]
  ): Promise<AgentSpawningResponse[]> {
    const spawnPromises = requests.map((request) => this.spawn(request));
    return Promise.all(spawnPromises);
  }

  /**
   * Parse spawn response from CLI
   * Expected format: JSON with { jobId, ... } or stdout containing jobId
   *
   * TODO: RUNTIME_TEST - Verify response parsing matches actual CLI output
   */
  private parseSpawnResponse(
    stdout: string,
    stderr: string
  ): { jobId: string } {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(stdout);
      if (parsed.jobId) {
        return parsed;
      }
    } catch {
      // Not JSON, try to extract jobId from text
    }

    // Extract jobId from stdout or stderr
    const jobIdMatch =
      stdout.match(/jobId['":\s]+([a-zA-Z0-9_-]+)/) ||
      stderr.match(/jobId['":\s]+([a-zA-Z0-9_-]+)/);

    if (jobIdMatch && jobIdMatch[1]) {
      return { jobId: jobIdMatch[1] };
    }

    throw new Error(
      'Could not extract jobId from spawn response. ' +
        `stdout: ${stdout}, stderr: ${stderr}`
    );
  }

  /**
   * Estimate agent execution duration based on type
   * This is a heuristic; actual duration depends on task complexity
   */
  private estimateDuration(agentType: string): number {
    const estimates: Record<string, number> = {
      'backend-developer': 600, // 10 minutes
      'frontend-engineer': 540, // 9 minutes
      'devops-engineer': 420, // 7 minutes
      'security-specialist': 480, // 8 minutes
      'typescript-specialist': 300, // 5 minutes
      'database-architect': 600, // 10 minutes
      'qa-engineer': 480, // 8 minutes
    };

    return estimates[agentType] || 420; // Default 7 minutes
  }
}

/**
 * Singleton spawner instance
 */
let spawnerInstance: AgentSpawner | null = null;

/**
 * Get or create agent spawner instance
 */
export function getSpawner(config?: Partial<SpawnerConfig>): AgentSpawner {
  if (!spawnerInstance) {
    spawnerInstance = new AgentSpawner(config);
  }
  return spawnerInstance;
}

/**
 * Reset spawner instance (for testing)
 */
export function resetSpawner(): void {
  spawnerInstance = null;
}
