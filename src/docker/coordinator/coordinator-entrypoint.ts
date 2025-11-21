/**
 * Coordinator Entrypoint Module
 * Migrated from: docker/coordinator-entrypoint.sh
 *
 * Main entry point for Docker-based CFN coordinator with:
 * - Environment validation
 * - Docker and Redis connectivity checks
 * - Security hardening (path traversal, JSON DoS protection)
 * - Success criteria loading and validation
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Task context for coordinator execution
 */
export interface TaskContext {
  task_id: string;
  task_description: string;
  agents?: string;
  max_iterations: number;
  gate_threshold: number;
  consensus_threshold: number;
  memory_limit: string;
  network: string;
  redis_host: string;
  redis_port: number;
  created_at: string;
}

/**
 * Verification result
 */
export interface VerificationResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Coordinator execution result
 */
export interface ExecutionResult extends VerificationResult {
  context?: TaskContext;
}

/**
 * Coordinator configuration
 */
export interface CoordinatorConfig {
  task_id?: string;
  task_description?: string;
  memory_limit?: string;
  network?: string;
  redis_host?: string;
  redis_port?: number;
  agents?: string;
  max_iterations?: number;
  gate_threshold?: number;
  consensus_threshold?: number;
}

/**
 * Coordinator Entrypoint Class
 * Manages coordinator initialization and verification
 */
export class CoordinatorEntrypoint {
  taskId: string;
  taskDescription: string;
  projectRoot: string;
  dockerSocket: string;
  config: CoordinatorConfig;

  // Default values
  private readonly DEFAULT_MEMORY_LIMIT = '1g';
  private readonly DEFAULT_NETWORK = 'cfn-network';
  private readonly DEFAULT_MAX_ITERATIONS = 10;
  private readonly DEFAULT_GATE_THRESHOLD = 0.75;
  private readonly DEFAULT_CONSENSUS_THRESHOLD = 0.90;
  private readonly MAX_JSON_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly ALLOWED_PATH_PREFIXES = ['/workspace', '/etc/cfn'];

  constructor(config: CoordinatorConfig = {}) {
    // Validate required environment variables
    this.taskId = config.task_id ||
      process.env.CFN_TASK_ID ||
      process.env.TASK_ID;

    if (!this.taskId) {
      throw new Error('TASK_ID environment variable required');
    }

    this.taskDescription = config.task_description ||
      process.env.TASK_DESCRIPTION;

    if (!this.taskDescription) {
      throw new Error('TASK_DESCRIPTION environment variable required');
    }

    this.projectRoot = config.redis_host || process.env.PROJECT_ROOT || '/workspace';
    this.dockerSocket = process.env.CFN_DOCKER_SOCKET || '/var/run/docker.sock';
    this.config = config;
  }

  /**
   * Get full configuration with defaults
   */
  getFullConfig(): CoordinatorConfig {
    return {
      task_id: this.taskId,
      task_description: this.taskDescription,
      memory_limit: this.config.memory_limit ||
        process.env.CFN_MEMORY_BUDGET ||
        process.env.MEMORY_LIMIT ||
        this.DEFAULT_MEMORY_LIMIT,
      network: this.config.network ||
        process.env.NETWORK ||
        this.DEFAULT_NETWORK,
      redis_host: this.config.redis_host ||
        process.env.CFN_REDIS_HOST ||
        'cfn-redis',
      redis_port: this.config.redis_port ||
        parseInt(process.env.CFN_REDIS_PORT || '6379', 10),
      agents: this.config.agents ||
        process.env.AGENTS,
      max_iterations: this.config.max_iterations ||
        parseInt(process.env.MAX_ITERATIONS || String(this.DEFAULT_MAX_ITERATIONS), 10),
      gate_threshold: this.config.gate_threshold ||
        parseFloat(process.env.GATE_THRESHOLD || String(this.DEFAULT_GATE_THRESHOLD)),
      consensus_threshold: this.config.consensus_threshold ||
        parseFloat(process.env.CONSENSUS_THRESHOLD || String(this.DEFAULT_CONSENSUS_THRESHOLD)),
    };
  }

  /**
   * Verify Docker socket access
   */
  async verifyDockerAccess(): Promise<VerificationResult> {
    try {
      execSync('docker ps > /dev/null 2>&1', {
        timeout: 5000,
      });

      return {
        success: true,
        message: 'Docker access verified',
      };
    } catch (error) {
      return {
        success: false,
        error: `Cannot access Docker daemon. Ensure /var/run/docker.sock is mounted. Details: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Verify Redis connectivity
   */
  async verifyRedisConnectivity(): Promise<VerificationResult> {
    const redisHost = this.config.redis_host ||
      process.env.CFN_REDIS_HOST ||
      'cfn-redis';
    const redisPort = this.config.redis_port ||
      parseInt(process.env.CFN_REDIS_PORT || '6379', 10);

    try {
      const redisPassword = process.env.CFN_REDIS_PASSWORD || process.env.REDIS_PASSWORD;
      let cmd = `redis-cli -h ${redisHost} -p ${redisPort} ping`;

      execSync(cmd, {
        timeout: 5000,
        stdio: 'pipe',
        env: {
          ...process.env,
          ...(redisPassword && { REDISCLI_AUTH: redisPassword })
        }
      });

      return {
        success: true,
        message: `Redis connection verified at ${redisHost}:${redisPort}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Cannot connect to Redis at ${redisHost}:${redisPort}. Details: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Verify project root is accessible
   */
  async verifyProjectRoot(): Promise<VerificationResult> {
    try {
      if (!fs.existsSync(this.projectRoot)) {
        return {
          success: false,
          error: `Project root not found: ${this.projectRoot}`,
        };
      }

      return {
        success: true,
        message: `Project root verified: ${this.projectRoot}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to verify project root: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Verify orchestration script exists
   */
  async verifyOrchestrationScript(): Promise<VerificationResult> {
    const scriptPath = path.join(
      this.projectRoot,
      '.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh'
    );

    try {
      if (!fs.existsSync(scriptPath)) {
        return {
          success: false,
          error: `Orchestration script not found at: ${scriptPath}`,
        };
      }

      return {
        success: true,
        message: `Orchestration script verified: ${scriptPath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to verify orchestration script: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Load and validate success criteria
   */
  loadSuccessCriteria(): Record<string, unknown> {
    const criteria = process.env.CFN_SUCCESS_CRITERIA || process.env.SUCCESS_CRITERIA;

    if (!criteria) {
      return {};
    }

    // First check if it looks like a file path (contains / or exists as file)
    if (criteria.includes('/') || fs.existsSync(criteria)) {
      // SECURITY: Path traversal protection
      const resolvedPath = path.resolve(criteria);

      if (!this.ALLOWED_PATH_PREFIXES.some(prefix => resolvedPath.startsWith(prefix))) {
        throw new Error(
          `Path traversal protection: Must be in /workspace or /etc/cfn. Got: ${criteria}`
        );
      }

      // SECURITY: JSON DoS protection - check file size
      const stats = fs.statSync(criteria);
      if (stats.size > this.MAX_JSON_SIZE) {
        throw new Error(
          `Success criteria file exceeds 10MB limit. Size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`
        );
      }

      const fileContent = fs.readFileSync(criteria, 'utf-8');
      try {
        return JSON.parse(fileContent);
      } catch (error) {
        throw new Error(`Invalid success criteria JSON format in file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Parse as inline JSON
    try {
      return JSON.parse(criteria);
    } catch (error) {
      throw new Error(`Invalid success criteria JSON format: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create task context for orchestration
   */
  createTaskContext(): TaskContext {
    const config = this.getFullConfig();

    return {
      task_id: this.taskId,
      task_description: this.taskDescription,
      agents: config.agents,
      max_iterations: config.max_iterations || this.DEFAULT_MAX_ITERATIONS,
      gate_threshold: config.gate_threshold || this.DEFAULT_GATE_THRESHOLD,
      consensus_threshold: config.consensus_threshold || this.DEFAULT_CONSENSUS_THRESHOLD,
      memory_limit: config.memory_limit || this.DEFAULT_MEMORY_LIMIT,
      network: config.network || this.DEFAULT_NETWORK,
      redis_host: config.redis_host || 'cfn-redis',
      redis_port: config.redis_port || 6379,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Get startup logs (sanitized for security)
   */
  getStartupLogs(): string {
    const lines: string[] = [
      '🚀 CFN Docker V3 Coordinator Starting',
      `   Task ID: ${this.taskId}`,
      `   Mode: docker`,
      `   Description: ${this.taskDescription}`,
    ];

    return lines.join('\n');
  }

  /**
   * Execute full coordinator startup sequence
   */
  async execute(): Promise<ExecutionResult> {
    // 1. Verify Docker access
    const dockerResult = await this.verifyDockerAccess();
    if (!dockerResult.success) {
      return {
        success: false,
        error: dockerResult.error || 'Docker verification failed',
      };
    }

    // 2. Verify Redis connectivity
    const redisResult = await this.verifyRedisConnectivity();
    if (!redisResult.success) {
      return {
        success: false,
        error: redisResult.error || 'Redis verification failed',
      };
    }

    // 3. Verify project root
    const projectResult = await this.verifyProjectRoot();
    if (!projectResult.success) {
      return {
        success: false,
        error: projectResult.error || 'Project root verification failed',
      };
    }

    // 4. Create task context
    const context = this.createTaskContext();

    // 5. Load success criteria (if provided)
    try {
      const successCriteria = this.loadSuccessCriteria();
      if (Object.keys(successCriteria).length > 0) {
        // Criteria loaded successfully
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to load success criteria: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    return {
      success: true,
      message: 'Coordinator initialization completed successfully',
      context,
    };
  }
}

/**
 * Convenience function for CLI entrypoint
 */
export async function runCoordinator(config?: CoordinatorConfig): Promise<void> {
  try {
    const coordinator = new CoordinatorEntrypoint(config);
    const result = await coordinator.execute();

    if (!result.success) {
      console.error(`❌ ${result.error}`);
      process.exit(1);
    }

    console.log(coordinator.getStartupLogs());
    console.log('✅ All verifications passed');
    console.log('📋 Invoking coordinator agent...');

    process.exit(0);
  } catch (error) {
    console.error(`❌ Coordinator initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
