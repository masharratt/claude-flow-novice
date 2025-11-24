/**
 * Agent Spawner Module
 *
 * High-level API for spawning agents with full type safety,
 * environment variable handling, provider configuration parsing,
 * and Redis coordination integration.
 *
 * Usage:
 *   const spawner = new AgentSpawner();
 *   const result = await spawner.spawnAgent({
 *     agentType: 'backend-developer',
 *     taskId: 'task-123',
 *     iteration: 1,
 *     mode: 'standard'
 *   });
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { execFileSync, spawn as childSpawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { generateTaskId } from './spawn-agent-cli';
import { getEnvValue, getNetworkName } from '../lib/environment-contract';

/**
 * Configuration for spawning an agent
 */
interface SpawnAgentConfig {
  agentType: string;
  taskId: string;
  iteration: number;
  mode: 'mvp' | 'standard' | 'enterprise';
  provider?: string;
  model?: string;
  prompt?: string;
  env?: Record<string, string>;
  background?: boolean;
  timeout?: number;
}

/**
 * Result of agent spawning operation
 */
interface SpawnResult {
  agentId: string;
  pid: number;
  status: 'spawned' | 'running' | 'failed';
  timestamp: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Provider configuration parsed from agent profile
 */
interface ProviderConfig {
  provider: string;
  model: string;
  baseUrl?: string;
}

/**
 * Worker spawning configuration
 */
interface SpawnWorkerConfig {
  team: string;
  complexity: 'simple' | 'complex';
  providerMode: 'auto' | 'zai' | 'anthropic';
  agentType?: string;
  taskContext?: string;
}

/**
 * Validation result with optional error message
 */
interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * AgentSpawner class - Type-safe agent spawning with validation
 */
export class AgentSpawner {
  private projectRoot: string;
  private agentProfilesDir: string;
  private agentConfigFile: string;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || process.cwd();
    this.agentProfilesDir = resolve(this.projectRoot, '.claude/agents/cfn-dev-team');
    this.agentConfigFile = resolve(this.projectRoot, '.claude/cfn-config/team-providers.json');
  }

  /**
   * Spawn an agent with the given configuration
   */
  async spawnAgent(config: SpawnAgentConfig): Promise<SpawnResult> {
    const timestamp = new Date().toISOString();
    const agentId = this.generateAgentId(config.agentType);

    try {
      // Validate configuration
      this.validateSpawnConfig(config);

      // Check agent exists
      const agentExists = await this.validateAgentExists(config.agentType);
      if (!agentExists) {
        return {
          agentId,
          pid: -1,
          status: 'failed',
          timestamp,
          error: `Agent type not found: ${config.agentType}`
        };
      }

      // Parse provider configuration if not explicitly provided
      let provider = config.provider;
      let model = config.model;

      if (!provider || !model) {
        const providerConfig = await this.parseAgentProvider(config.agentType);
        provider = provider || providerConfig.provider;
        model = model || providerConfig.model;
      }

      // Build environment variables
      const env = this.buildEnvironment(config, agentId, provider, model);

      // Spawn the process
      const pid = await this.spawnProcess(config.agentType, env, config.background);

      return {
        agentId,
        pid,
        status: 'spawned',
        timestamp,
        metadata: {
          agentType: config.agentType,
          taskId: config.taskId,
          iteration: config.iteration,
          mode: config.mode,
          provider,
          model
        }
      };
    } catch (error) {
      return {
        agentId,
        pid: -1,
        status: 'failed',
        timestamp,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Spawn a worker with team configuration
   */
  async spawnWorker(config: SpawnWorkerConfig): Promise<SpawnResult> {
    const timestamp = new Date().toISOString();
    const workerId = this.generateWorkerId(config.team);

    try {
      // Validate worker configuration
      this.validateWorkerConfig(config);

      // Load team provider configuration
      const teamConfig = this.loadTeamConfig(config.team);

      // Select model based on complexity
      const model = this.selectModel(config.team, config.complexity);

      // Get API key from environment
      const apiKey = this.getApiKey(config.team, 'workers');

      // Build environment for worker
      const env = this.buildWorkerEnvironment(config, workerId, model, apiKey);

      // Provider routing
      this.routeWorkerProvider(config.providerMode, config.team, model, apiKey);

      return {
        agentId: workerId,
        pid: 0,
        status: 'spawned',
        timestamp,
        metadata: {
          team: config.team,
          complexity: config.complexity,
          model,
          provider: config.providerMode
        }
      };
    } catch (error) {
      return {
        agentId: workerId,
        pid: -1,
        status: 'failed',
        timestamp,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Validate that an agent type exists in the profiles directory
   */
  async validateAgentExists(agentType: string): Promise<boolean> {
    // Normalize agent type (handle both underscore and hyphen variations)
    const normalized = agentType.replace(/_/g, '-').toLowerCase();

    // Check for agent profile in subdirectories
    const possiblePaths = [
      resolve(this.agentProfilesDir, `${normalized}.md`),
      // Check in subdirectories
      ...this.findAgentInSubdirs(normalized)
    ];

    return possiblePaths.some(path => existsSync(path));
  }

  /**
   * Parse provider configuration from agent profile frontmatter
   */
  async parseAgentProvider(agentType: string): Promise<ProviderConfig> {
    const agentPath = this.findAgentProfile(agentType);

    if (!agentPath) {
      return {
        provider: 'zai',
        model: 'glm-4.6'
      };
    }

    try {
      const content = readFileSync(agentPath, 'utf-8');
      const providerMatch = content.match(/<!-- PROVIDER_PARAMETERS\s*([\s\S]*?)\s*-->/);

      if (providerMatch) {
        const params = providerMatch[1];
        const providerMatch_ = params.match(/provider:\s*(\w+)/);
        const modelMatch = params.match(/model:\s*([^\n]+)/);

        return {
          provider: providerMatch_?.[1] || 'zai',
          model: modelMatch?.[1]?.trim() || 'glm-4.6'
        };
      }
    } catch (error) {
      // Silent fallback
    }

    return {
      provider: 'zai',
      model: 'glm-4.6'
    };
  }

  /**
   * Generate a unique agent ID
   */
  private generateAgentId(agentType: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `agent-${agentType}-${timestamp}-${random}`;
  }

  /**
   * Generate a unique worker ID
   */
  private generateWorkerId(team: string): string {
    const uuid = uuidv4().substring(0, 8);
    return `worker-${team}-${uuid}`;
  }

  /**
   * Validate spawn configuration
   */
  private validateSpawnConfig(config: SpawnAgentConfig): void {
    const errors: string[] = [];

    if (!config.agentType || typeof config.agentType !== 'string') {
      errors.push('agentType must be a non-empty string');
    }

    if (!config.taskId || typeof config.taskId !== 'string') {
      errors.push('taskId must be a non-empty string');
    } else {
      const taskIdValidation = this.validateTaskId(config.taskId);
      if (!taskIdValidation.valid) {
        errors.push(taskIdValidation.error || 'Invalid taskId format');
      }
    }

    if (config.iteration === undefined || typeof config.iteration !== 'number') {
      errors.push('iteration must be a number');
    }

    if (!['mvp', 'standard', 'enterprise'].includes(config.mode)) {
      errors.push('mode must be mvp, standard, or enterprise');
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Validate worker configuration
   */
  private validateWorkerConfig(config: SpawnWorkerConfig): void {
    const errors: string[] = [];

    if (!config.team || typeof config.team !== 'string') {
      errors.push('team must be a non-empty string');
    }

    if (!['simple', 'complex'].includes(config.complexity)) {
      errors.push('complexity must be simple or complex');
    }

    if (!['auto', 'zai', 'anthropic'].includes(config.providerMode)) {
      errors.push('providerMode must be auto, zai, or anthropic');
    }

    if (errors.length > 0) {
      throw new Error(`Worker configuration validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Validate task ID format (CVSS 8.9 - command injection prevention)
   * Supports both raw IDs and Phase 1 prefixed IDs (cli:*, trigger:*)
   * Pattern: alphanumeric, underscore, hyphen, dot, and colon (for mode prefix) only, max 128 chars
   *
   * Accepted formats:
   *   - Raw: task-123 (16 chars)
   *   - Prefixed: cli:task-123 (20 chars)
   *   - Prefixed: trigger:task-123 (24 chars)
   */
  private validateTaskId(taskId: string): ValidationResult {
    if (typeof taskId !== 'string' || taskId.length === 0) {
      return { valid: false, error: 'Task ID must be a non-empty string' };
    }

    // Updated pattern to support mode prefixes (cli:, trigger:)
    const taskIdPattern = /^(?:cli:|trigger:)?[a-zA-Z0-9_.-]{1,64}$/;
    if (!taskIdPattern.test(taskId)) {
      return {
        valid: false,
        error: 'Invalid task ID format - must contain only alphanumeric characters, dot, underscore, hyphens, and optional mode prefix (cli:, trigger:)'
      };
    }

    return { valid: true };
  }

  /**
   * Build environment variables for agent execution
   */
  private buildEnvironment(
    config: SpawnAgentConfig,
    agentId: string,
    provider: string,
    model: string
  ): Record<string, string> {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      AGENT_ID: agentId,
      AGENT_TYPE: config.agentType,
      TASK_ID: config.taskId,
      ITERATION: String(config.iteration),
      MODE: config.mode,
      PROVIDER: provider,
      MODEL: model,
      SPAWNED_AT: new Date().toISOString(),
      PROJECT_ROOT: this.projectRoot,
      // Redis coordination for CLI mode agents (resolved via environment contract)
      CFN_REDIS_HOST: getEnvValue('redis_host', 'cli'),
      CFN_REDIS_PORT: getEnvValue('redis_port', 'cli'),
      CFN_REDIS_PASSWORD: process.env.CFN_REDIS_PASSWORD || process.env.REDIS_PASSWORD || '',
      CFN_NETWORK_NAME: getNetworkName('cli')
    };

    // Add optional prompt parameter if provided
    if (config.prompt) {
      env.PROMPT = config.prompt;
    }

    // Merge user-provided environment variables
    if (config.env) {
      Object.assign(env, config.env);
    }

    return env;
  }

  /**
   * Build environment for worker process
   */
  private buildWorkerEnvironment(
    config: SpawnWorkerConfig,
    workerId: string,
    model: string,
    apiKey: string
  ): Record<string, string> {
    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      WORKER_ID: workerId,
      TEAM: config.team,
      COMPLEXITY: config.complexity,
      MODEL: model,
      API_KEY: apiKey,
      PROJECT_ROOT: this.projectRoot
    };

    if (config.agentType) {
      env.AGENT_TYPE = config.agentType;
    }

    if (config.taskContext) {
      env.TASK_CONTEXT = config.taskContext;
    }

    return env;
  }

  /**
   * Spawn the actual process
   */
  private async spawnProcess(
    agentType: string,
    env: Record<string, string>,
    background: boolean = true
  ): Promise<number> {
    const args = [
      'src/cli/agent-executor.ts',
      '--agent-type', agentType
    ];

    const child = childSpawn('tsx', args, {
      env,
      stdio: background ? 'ignore' : 'inherit',
      detached: background
    });

    const pid = child.pid || 0;

    if (background) {
      child.unref();
    } else {
      await new Promise((resolve, reject) => {
        child.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`Process exited with code ${code}`));
          } else {
            resolve(undefined);
          }
        });
      });
    }

    return pid;
  }

  /**
   * Find agent profile in directory structure
   */
  private findAgentProfile(agentType: string): string | null {
    const normalized = agentType.replace(/_/g, '-').toLowerCase();

    // Direct path
    const directPath = resolve(this.agentProfilesDir, `${normalized}.md`);
    if (existsSync(directPath)) {
      return directPath;
    }

    // Search in subdirectories
    const subdirs = [
      'developers', 'testers', 'reviewers', 'architecture',
      'dev-ops', 'product-owners', 'coordinators', 'analysts', 'utility'
    ];

    for (const subdir of subdirs) {
      const path = resolve(this.agentProfilesDir, subdir, `${normalized}.md`);
      if (existsSync(path)) {
        return path;
      }

      // Check nested subdirectories
      const nestedDirs = ['frontend', 'backend', 'database', 'quality', 'e2e', 'unit', 'validation', 'data'];
      for (const nested of nestedDirs) {
        const nestedPath = resolve(this.agentProfilesDir, subdir, nested, `${normalized}.md`);
        if (existsSync(nestedPath)) {
          return nestedPath;
        }
      }
    }

    return null;
  }

  /**
   * Find agent in subdirectories
   */
  private findAgentInSubdirs(normalized: string): string[] {
    const paths: string[] = [];
    const subdirs = [
      'developers', 'testers', 'reviewers', 'architecture',
      'dev-ops', 'product-owners', 'coordinators', 'analysts', 'utility'
    ];

    for (const subdir of subdirs) {
      const path = resolve(this.agentProfilesDir, subdir, `${normalized}.md`);
      paths.push(path);

      // Check nested directories
      const nestedDirs = ['frontend', 'backend', 'database', 'quality', 'e2e', 'unit', 'validation', 'data'];
      for (const nested of nestedDirs) {
        paths.push(resolve(this.agentProfilesDir, subdir, nested, `${normalized}.md`));
      }
    }

    return paths;
  }

  /**
   * Load team configuration from config file
   */
  private loadTeamConfig(team: string): Record<string, unknown> {
    if (!existsSync(this.agentConfigFile)) {
      throw new Error(`Team configuration not found at ${this.agentConfigFile}`);
    }

    const content = readFileSync(this.agentConfigFile, 'utf-8');
    const config = JSON.parse(content);

    if (!config.teams || !config.teams[team]) {
      throw new Error(`Invalid or missing provider configuration for team: ${team}`);
    }

    return config.teams[team] as Record<string, unknown>;
  }

  /**
   * Select model based on complexity
   */
  private selectModel(team: string, complexity: 'simple' | 'complex'): string {
    const config = this.loadTeamConfig(team);
    const workers = config.workers as Record<string, unknown>;
    const models = workers?.models as Record<string, unknown>;

    if (models && models[complexity]) {
      return models[complexity] as string;
    }

    // Fallback to default complexity
    const defaultComplexity = 'simple';
    if (models && models[defaultComplexity]) {
      return models[defaultComplexity] as string;
    }

    return 'gpt-4';
  }

  /**
   * Get API key from environment
   */
  private getApiKey(team: string, role: 'coordinator' | 'workers'): string {
    const config = this.loadTeamConfig(team);
    const roleConfig = config[role] as Record<string, unknown>;

    if (!roleConfig) {
      throw new Error(`No configuration found for team=${team}, role=${role}`);
    }

    const apiKeyEnvVar = roleConfig.apiKeyEnvVar as string;

    if (!apiKeyEnvVar) {
      throw new Error(`apiKeyEnvVar not configured for team=${team}, role=${role}`);
    }

    const apiKey = process.env[apiKeyEnvVar];

    if (!apiKey) {
      throw new Error(`API key not found in environment variable: ${apiKeyEnvVar}`);
    }

    return apiKey;
  }

  /**
   * Route worker to appropriate provider
   */
  private routeWorkerProvider(
    providerMode: string,
    team: string,
    model: string,
    apiKey: string
  ): void {
    const config = this.loadTeamConfig(team);
    const workers = config.workers as Record<string, unknown>;
    const provider = workers?.provider as string;
    const baseUrl = workers?.baseUrl as string;

    switch (providerMode) {
      case 'auto':
        this.routeAutoProvider(provider, baseUrl, model, apiKey);
        break;
      case 'zai':
        process.env.ZAI_API_KEY = apiKey;
        process.env.ZAI_BASE_URL = baseUrl;
        process.env.ZAI_MODEL = model;
        break;
      case 'anthropic':
        process.env.ANTHROPIC_API_KEY = apiKey;
        process.env.ANTHROPIC_BASE_URL = baseUrl;
        process.env.ANTHROPIC_MODEL = model;
        break;
      default:
        throw new Error(`Invalid provider mode: ${providerMode}`);
    }
  }

  /**
   * Route to appropriate provider based on configuration
   */
  private routeAutoProvider(provider: string, baseUrl: string, model: string, apiKey: string): void {
    switch (provider) {
      case 'zai':
        process.env.ZAI_API_KEY = apiKey;
        process.env.ZAI_BASE_URL = baseUrl;
        process.env.ZAI_MODEL = model;
        break;
      case 'anthropic':
        process.env.ANTHROPIC_API_KEY = apiKey;
        process.env.ANTHROPIC_BASE_URL = baseUrl;
        process.env.ANTHROPIC_MODEL = model;
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}

export type { SpawnAgentConfig, SpawnResult, ProviderConfig, SpawnWorkerConfig };
