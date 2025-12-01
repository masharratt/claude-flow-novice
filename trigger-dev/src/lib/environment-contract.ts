/**
 * Environment Contract Utilities
 *
 * Provides type-safe access to environment variables and configuration.
 * Centralizes all environment configuration for multi-tenant Docker support.
 *
 * Type Safety:
 * - Zero `any` types
 * - Exhaustive mode-specific configuration
 * - Runtime validation for safety
 */

/**
 * CFN mode type
 */
type CFNMode = 'trigger' | 'cli' | 'kubernetes';

/**
 * Environment configuration for different modes
 */
interface EnvironmentConfig {
  redisHost: string;
  redisPort: number;
  postgresHost: string;
  postgresPort: number;
  networkName: string;
  orchestratorPort: number;
}

/**
 * Mode-specific environment configurations
 */
const modeConfigs: Record<CFNMode, EnvironmentConfig> = {
  trigger: {
    redisHost: process.env.CFN_REDIS_HOST || 'redis',
    redisPort: parseInt(process.env.CFN_REDIS_PORT || '6379', 10),
    postgresHost: process.env.CFN_POSTGRES_HOST || 'postgres',
    postgresPort: parseInt(process.env.CFN_POSTGRES_PORT || '5432', 10),
    networkName: process.env.CFN_NETWORK_NAME || 'trigger-dev_trigger-cfn-network',
    orchestratorPort: parseInt(process.env.CFN_ORCHESTRATOR_PORT || '3001', 10),
  },
  cli: {
    redisHost: process.env.CFN_REDIS_HOST || 'localhost',
    redisPort: parseInt(process.env.CFN_REDIS_PORT || '6379', 10),
    postgresHost: process.env.CFN_POSTGRES_HOST || 'localhost',
    postgresPort: parseInt(process.env.CFN_POSTGRES_PORT || '5432', 10),
    networkName: process.env.CFN_NETWORK_NAME || 'host',
    orchestratorPort: parseInt(process.env.CFN_ORCHESTRATOR_PORT || '3001', 10),
  },
  kubernetes: {
    redisHost: process.env.CFN_REDIS_HOST || 'redis.default.svc.cluster.local',
    redisPort: parseInt(process.env.CFN_REDIS_PORT || '6379', 10),
    postgresHost: process.env.CFN_POSTGRES_HOST || 'postgres.default.svc.cluster.local',
    postgresPort: parseInt(process.env.CFN_POSTGRES_PORT || '5432', 10),
    networkName: process.env.CFN_NETWORK_NAME || 'default',
    orchestratorPort: parseInt(process.env.CFN_ORCHESTRATOR_PORT || '3001', 10),
  },
};

/**
 * Get network name for the given mode
 *
 * @param mode - Execution mode (trigger, cli, kubernetes)
 * @returns Docker network name for the mode
 *
 * Examples:
 *   getNetworkName('trigger') => 'trigger-dev_trigger-cfn-network'
 *   getNetworkName('cli') => 'host'
 *   getNetworkName('kubernetes') => 'default'
 */
export function getNetworkName(mode: CFNMode): string {
  const config = modeConfigs[mode];
  if (!config) {
    throw new Error(`Unknown CFN mode: ${mode}`);
  }
  return config.networkName;
}

/**
 * Get environment value for the given mode
 *
 * Supports keys: redis_host, redis_port, postgres_host, postgres_port,
 *                network_name, orchestrator_port
 *
 * @param key - Configuration key (snake_case)
 * @param mode - Execution mode
 * @returns Configuration value
 *
 * Examples:
 *   getEnvValue('redis_host', 'trigger') => 'redis'
 *   getEnvValue('redis_port', 'trigger') => '6379'
 *   getEnvValue('postgres_host', 'cli') => 'localhost'
 */
export function getEnvValue(key: 'redis_host' | 'redis_port' | 'postgres_host' | 'postgres_port' | 'network_name' | 'orchestrator_port', mode: CFNMode): string {
  const config = modeConfigs[mode];
  if (!config) {
    throw new Error(`Unknown CFN mode: ${mode}`);
  }

  switch (key) {
    case 'redis_host':
      return config.redisHost;
    case 'redis_port':
      return config.redisPort.toString();
    case 'postgres_host':
      return config.postgresHost;
    case 'postgres_port':
      return config.postgresPort.toString();
    case 'network_name':
      return config.networkName;
    case 'orchestrator_port':
      return config.orchestratorPort.toString();
    default:
      throw new Error(`Unknown environment key: ${key}`);
  }
}

/**
 * Get complete environment configuration for the given mode
 *
 * @param mode - Execution mode
 * @returns Complete configuration object
 */
export function getEnvironmentConfig(mode: CFNMode): EnvironmentConfig {
  const config = modeConfigs[mode];
  if (!config) {
    throw new Error(`Unknown CFN mode: ${mode}`);
  }
  return config;
}

/**
 * Validate environment configuration
 *
 * Checks that all required environment values are set correctly.
 *
 * @param mode - Execution mode to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateEnvironmentConfig(mode: CFNMode): string[] {
  const errors: string[] = [];
  const config = modeConfigs[mode];

  if (!config) {
    return [`Unknown CFN mode: ${mode}`];
  }

  // Validate redis configuration
  if (!config.redisHost) {
    errors.push('Redis host not configured');
  }
  if (config.redisPort < 1 || config.redisPort > 65535) {
    errors.push(`Invalid Redis port: ${config.redisPort}`);
  }

  // Validate postgres configuration
  if (!config.postgresHost) {
    errors.push('Postgres host not configured');
  }
  if (config.postgresPort < 1 || config.postgresPort > 65535) {
    errors.push(`Invalid Postgres port: ${config.postgresPort}`);
  }

  // Validate network configuration
  if (!config.networkName) {
    errors.push('Network name not configured');
  }

  // Validate orchestrator port
  if (config.orchestratorPort < 1 || config.orchestratorPort > 65535) {
    errors.push(`Invalid orchestrator port: ${config.orchestratorPort}`);
  }

  return errors;
}

/**
 * Create Docker environment variables from config
 *
 * Formats configuration for Docker run --env flags
 *
 * @param mode - Execution mode
 * @returns Array of environment variable strings (KEY=VALUE)
 */
export function getDockerEnvVars(mode: CFNMode): string[] {
  const config = modeConfigs[mode];
  if (!config) {
    throw new Error(`Unknown CFN mode: ${mode}`);
  }

  return [
    `CFN_REDIS_HOST=${config.redisHost}`,
    `CFN_REDIS_PORT=${config.redisPort}`,
    `CFN_POSTGRES_HOST=${config.postgresHost}`,
    `CFN_POSTGRES_PORT=${config.postgresPort}`,
    `CFN_NETWORK_NAME=${config.networkName}`,
    `CFN_ORCHESTRATOR_PORT=${config.orchestratorPort}`,
  ];
}

export default {
  getNetworkName,
  getEnvValue,
  getEnvironmentConfig,
  validateEnvironmentConfig,
  getDockerEnvVars,
};
