/**
 * CFN Runtime Environment Module
 * Migrated from: docker/runtime/cfn-runtime.sh
 *
 * Provides type-safe environment variable management with:
 * - Standard CFN_* names
 * - Legacy compatibility (REDIS_*, TASK_*, etc.)
 * - Defaults and type coercion
 * - Shell script export
 */

/**
 * Redis configuration
 */
export interface RedisConfig {
  host: string;
  port: number;
  url: string;
  password: string;
}

/**
 * Task configuration
 */
export interface TaskConfig {
  id: string;
  timeout: number;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  id: string;
  type: string;
  image: string;
  registry: string;
}

/**
 * Resource configuration
 */
export interface ResourcesConfig {
  memoryBudget: string;
  cpuLimit: number;
  maxParallelAgents: number;
  spawnIntervalMs: number;
}

/**
 * Docker configuration
 */
export interface DockerConfig {
  socketPath: string;
  networkName: string;
  containerMode: boolean;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  customRouting: boolean;
  defaultProvider: string;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  mode: string;
  gateConfidenceThreshold: number;
  consensusThreshold: number;
  iterationLimit: number;
}

/**
 * API configuration
 */
export interface ApiConfig {
  host: string;
  port: number;
  key: string;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  level: string;
  format: string;
}

/**
 * Feature flags configuration
 */
export interface FeaturesConfig {
  progressTracking: boolean;
  healthChecks: boolean;
  metrics: boolean;
}

/**
 * Complete CFN Runtime configuration
 */
export interface CfnRuntimeConfig {
  redis: RedisConfig;
  task: TaskConfig;
  agent: AgentConfig;
  resources: ResourcesConfig;
  docker: DockerConfig;
  provider: ProviderConfig;
  orchestrator: OrchestratorConfig;
  api: ApiConfig;
  logging: LoggingConfig;
  features: FeaturesConfig;
}

/**
 * CFN Runtime Environment Management
 * Provides unified interface for all CFN configuration
 */
export class CfnRuntime implements CfnRuntimeConfig {
  redis: RedisConfig;
  task: TaskConfig;
  agent: AgentConfig;
  resources: ResourcesConfig;
  docker: DockerConfig;
  provider: ProviderConfig;
  orchestrator: OrchestratorConfig;
  api: ApiConfig;
  logging: LoggingConfig;
  features: FeaturesConfig;

  private envMap: Map<string, string> = new Map();
  private aliases: Map<string, string[]> = new Map();

  constructor(overrides?: Partial<CfnRuntimeConfig>) {
    // Initialize configurations
    this.redis = this.initRedis(overrides?.redis);
    this.task = this.initTask(overrides?.task);
    this.agent = this.initAgent(overrides?.agent);
    this.resources = this.initResources(overrides?.resources);
    this.docker = this.initDocker(overrides?.docker);
    this.provider = this.initProvider(overrides?.provider);
    this.orchestrator = this.initOrchestrator(overrides?.orchestrator);
    this.api = this.initApi(overrides?.api);
    this.logging = this.initLogging(overrides?.logging);
    this.features = this.initFeatures(overrides?.features);

    // Register aliases for legacy compatibility
    this.registerAliases();
  }

  /**
   * Initialize Redis configuration
   */
  private initRedis(overrides?: Partial<RedisConfig>): RedisConfig {
    return {
      host: overrides?.host ||
        this.getEnv('CFN_REDIS_HOST') ||
        this.getEnv('REDIS_HOST') ||
        'cfn-redis',
      port: overrides?.port !== undefined ? overrides.port :
        parseInt(this.getEnv('CFN_REDIS_PORT') || this.getEnv('REDIS_PORT') || '6379', 10),
      url: overrides?.url ||
        this.getEnv('CFN_REDIS_URL') ||
        this.getEnv('REDIS_URL') ||
        '',
      password: overrides?.password ||
        this.getEnv('CFN_REDIS_PASSWORD') ||
        this.getEnv('REDIS_PASSWORD') ||
        '',
    };
  }

  /**
   * Initialize Task configuration
   */
  private initTask(overrides?: Partial<TaskConfig>): TaskConfig {
    return {
      id: overrides?.id ||
        this.getEnv('CFN_TASK_ID') ||
        this.getEnv('TASK_ID') ||
        this.getEnv('SWARM_ID') ||
        'auto-generated',
      timeout: overrides?.timeout !== undefined ? overrides.timeout :
        parseInt(this.getEnv('CFN_TASK_TIMEOUT') || '3600', 10),
    };
  }

  /**
   * Initialize Agent configuration
   */
  private initAgent(overrides?: Partial<AgentConfig>): AgentConfig {
    return {
      id: overrides?.id ||
        this.getEnv('CFN_AGENT_ID') ||
        this.getEnv('AGENT_ID') ||
        'auto-generated',
      type: overrides?.type ||
        this.getEnv('CFN_AGENT_TYPE') ||
        this.getEnv('AGENT_TYPE') ||
        'unknown',
      image: overrides?.image ||
        this.getEnv('CFN_AGENT_IMAGE') ||
        this.getEnv('AGENT_IMAGE') ||
        'claude-flow-novice-agent:latest',
      registry: overrides?.registry ||
        this.getEnv('CFN_AGENT_REGISTRY') ||
        this.getEnv('AGENT_REGISTRY') ||
        'docker.io',
    };
  }

  /**
   * Initialize Resources configuration
   */
  private initResources(overrides?: Partial<ResourcesConfig>): ResourcesConfig {
    return {
      memoryBudget: overrides?.memoryBudget ||
        this.getEnv('CFN_MEMORY_BUDGET') ||
        this.getEnv('MEMORY_BUDGET') ||
        '40g',
      cpuLimit: overrides?.cpuLimit !== undefined ? overrides.cpuLimit :
        parseInt(this.getEnv('CFN_CPU_LIMIT') || '4', 10),
      maxParallelAgents: overrides?.maxParallelAgents !== undefined ? overrides.maxParallelAgents :
        parseInt(this.getEnv('CFN_MAX_PARALLEL_AGENTS') || '4', 10),
      spawnIntervalMs: overrides?.spawnIntervalMs !== undefined ? overrides.spawnIntervalMs :
        parseInt(this.getEnv('CFN_SPAWN_INTERVAL_MS') || '500', 10),
    };
  }

  /**
   * Initialize Docker configuration
   */
  private initDocker(overrides?: Partial<DockerConfig>): DockerConfig {
    return {
      socketPath: overrides?.socketPath ||
        this.getEnv('CFN_DOCKER_SOCKET') ||
        '/var/run/docker.sock',
      networkName: overrides?.networkName ||
        this.getEnv('CFN_NETWORK_NAME') ||
        'cfn-network',
      containerMode: overrides?.containerMode !== undefined ? overrides.containerMode :
        this.parseBoolean(this.getEnv('CFN_CONTAINER_MODE') || 'false'),
    };
  }

  /**
   * Initialize Provider configuration
   */
  private initProvider(overrides?: Partial<ProviderConfig>): ProviderConfig {
    return {
      customRouting: overrides?.customRouting !== undefined ? overrides.customRouting :
        this.parseBoolean(this.getEnv('CFN_CUSTOM_ROUTING') || 'false'),
      defaultProvider: overrides?.defaultProvider ||
        this.getEnv('CFN_DEFAULT_PROVIDER') ||
        'zai',
    };
  }

  /**
   * Initialize Orchestrator configuration
   */
  private initOrchestrator(overrides?: Partial<OrchestratorConfig>): OrchestratorConfig {
    return {
      mode: overrides?.mode ||
        this.getEnv('CFN_ORCHESTRATOR_MODE') ||
        'standard',
      gateConfidenceThreshold: overrides?.gateConfidenceThreshold !== undefined ? overrides.gateConfidenceThreshold :
        parseFloat(this.getEnv('CFN_GATE_CONFIDENCE_THRESHOLD') || '0.75'),
      consensusThreshold: overrides?.consensusThreshold !== undefined ? overrides.consensusThreshold :
        parseFloat(this.getEnv('CFN_CONSENSUS_THRESHOLD') || '0.90'),
      iterationLimit: overrides?.iterationLimit !== undefined ? overrides.iterationLimit :
        parseInt(this.getEnv('CFN_ITERATION_LIMIT') || '10', 10),
    };
  }

  /**
   * Initialize API configuration
   */
  private initApi(overrides?: Partial<ApiConfig>): ApiConfig {
    return {
      host: overrides?.host ||
        this.getEnv('CFN_API_HOST') ||
        '0.0.0.0',
      port: overrides?.port !== undefined ? overrides.port :
        parseInt(this.getEnv('CFN_API_PORT') || '9000', 10),
      key: overrides?.key ||
        this.getEnv('CFN_API_KEY') ||
        'auto-generated',
    };
  }

  /**
   * Initialize Logging configuration
   */
  private initLogging(overrides?: Partial<LoggingConfig>): LoggingConfig {
    return {
      level: overrides?.level ||
        this.getEnv('CFN_LOG_LEVEL') ||
        'info',
      format: overrides?.format ||
        this.getEnv('CFN_LOG_FORMAT') ||
        'json',
    };
  }

  /**
   * Initialize Features configuration
   */
  private initFeatures(overrides?: Partial<FeaturesConfig>): FeaturesConfig {
    return {
      progressTracking: overrides?.progressTracking !== undefined ? overrides.progressTracking :
        this.parseBoolean(this.getEnv('CFN_ENABLE_PROGRESS_TRACKING') || 'true'),
      healthChecks: overrides?.healthChecks !== undefined ? overrides.healthChecks :
        this.parseBoolean(this.getEnv('CFN_ENABLE_HEALTH_CHECKS') || 'true'),
      metrics: overrides?.metrics !== undefined ? overrides.metrics :
        this.parseBoolean(this.getEnv('CFN_ENABLE_METRICS') || 'true'),
    };
  }

  /**
   * Register legacy aliases for environment variables
   */
  private registerAliases(): void {
    this.aliases.set('CFN_REDIS_HOST', ['REDIS_HOST']);
    this.aliases.set('CFN_REDIS_PORT', ['REDIS_PORT']);
    this.aliases.set('CFN_REDIS_URL', ['REDIS_URL']);
    this.aliases.set('CFN_REDIS_PASSWORD', ['REDIS_PASSWORD']);
    this.aliases.set('CFN_TASK_ID', ['TASK_ID', 'SWARM_ID']);
    this.aliases.set('CFN_AGENT_ID', ['AGENT_ID']);
    this.aliases.set('CFN_AGENT_TYPE', ['AGENT_TYPE']);
    this.aliases.set('CFN_AGENT_IMAGE', ['AGENT_IMAGE']);
    this.aliases.set('CFN_AGENT_REGISTRY', ['AGENT_REGISTRY']);
    this.aliases.set('CFN_MEMORY_BUDGET', ['MEMORY_BUDGET']);
  }

  /**
   * Get environment variable with fallback and alias support
   */
  getEnv(key: string): string | undefined {
    // First try the exact key
    const value = process.env[key];
    if (value !== undefined) {
      return value;
    }

    // Check if this key has aliases and try them
    for (const [standard, aliases] of this.aliases) {
      if (key === standard) {
        // This is a standard key, check its aliases
        for (const alias of aliases) {
          const aliasValue = process.env[alias];
          if (aliasValue !== undefined) {
            return aliasValue;
          }
        }
        break;
      }

      // Check if this key is an alias
      if (aliases.includes(key)) {
        // Try the standard key and other aliases
        const standardValue = process.env[standard];
        if (standardValue !== undefined) {
          return standardValue;
        }

        for (const alias of aliases) {
          if (alias !== key) {
            const aliasValue = process.env[alias];
            if (aliasValue !== undefined) {
              return aliasValue;
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Parse boolean from string
   */
  private parseBoolean(value: string): boolean {
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Export all environment variables as object
   */
  toEnvObject(): Record<string, string> {
    const env: Record<string, string> = {};

    // Standard CFN_ variables
    env.CFN_REDIS_HOST = this.redis.host;
    env.CFN_REDIS_PORT = String(this.redis.port);
    env.CFN_REDIS_URL = this.redis.url;
    env.CFN_REDIS_PASSWORD = this.redis.password;

    env.CFN_TASK_ID = this.task.id;
    env.CFN_TASK_TIMEOUT = String(this.task.timeout);

    env.CFN_AGENT_ID = this.agent.id;
    env.CFN_AGENT_TYPE = this.agent.type;
    env.CFN_AGENT_IMAGE = this.agent.image;
    env.CFN_AGENT_REGISTRY = this.agent.registry;

    env.CFN_MEMORY_BUDGET = this.resources.memoryBudget;
    env.CFN_CPU_LIMIT = String(this.resources.cpuLimit);
    env.CFN_MAX_PARALLEL_AGENTS = String(this.resources.maxParallelAgents);
    env.CFN_SPAWN_INTERVAL_MS = String(this.resources.spawnIntervalMs);

    env.CFN_DOCKER_SOCKET = this.docker.socketPath;
    env.CFN_NETWORK_NAME = this.docker.networkName;
    env.CFN_CONTAINER_MODE = String(this.docker.containerMode);

    env.CFN_CUSTOM_ROUTING = String(this.provider.customRouting);
    env.CFN_DEFAULT_PROVIDER = this.provider.defaultProvider;

    env.CFN_ORCHESTRATOR_MODE = this.orchestrator.mode;
    env.CFN_GATE_CONFIDENCE_THRESHOLD = String(this.orchestrator.gateConfidenceThreshold);
    env.CFN_CONSENSUS_THRESHOLD = String(this.orchestrator.consensusThreshold);
    env.CFN_ITERATION_LIMIT = String(this.orchestrator.iterationLimit);

    env.CFN_API_HOST = this.api.host;
    env.CFN_API_PORT = String(this.api.port);
    env.CFN_API_KEY = this.api.key;

    env.CFN_LOG_LEVEL = this.logging.level;
    env.CFN_LOG_FORMAT = this.logging.format;

    env.CFN_ENABLE_PROGRESS_TRACKING = String(this.features.progressTracking);
    env.CFN_ENABLE_HEALTH_CHECKS = String(this.features.healthChecks);
    env.CFN_ENABLE_METRICS = String(this.features.metrics);

    // Legacy aliases
    env.REDIS_HOST = this.redis.host;
    env.REDIS_PORT = String(this.redis.port);
    env.REDIS_URL = this.redis.url;
    env.REDIS_PASSWORD = this.redis.password;

    env.TASK_ID = this.task.id;
    env.SWARM_ID = this.task.id;

    env.AGENT_ID = this.agent.id;
    env.AGENT_TYPE = this.agent.type;
    env.AGENT_IMAGE = this.agent.image;
    env.AGENT_REGISTRY = this.agent.registry;

    env.MEMORY_BUDGET = this.resources.memoryBudget;

    return env;
  }

  /**
   * Export as shell script format
   */
  toShellScript(): string {
    const env = this.toEnvObject();
    const lines: string[] = ['#!/bin/bash', 'set -euo pipefail', ''];

    Object.entries(env).forEach(([key, value]) => {
      // Escape values properly for shell
      const escaped = value.replace(/"/g, '\\"');
      lines.push(`export ${key}="${escaped}"`);
    });

    lines.push('');
    return lines.join('\n');
  }
}

/**
 * Convenience function to get runtime instance
 */
export function createRuntime(overrides?: Partial<CfnRuntimeConfig>): CfnRuntime {
  return new CfnRuntime(overrides);
}

/**
 * Export default instance
 */
export const runtime = new CfnRuntime();
