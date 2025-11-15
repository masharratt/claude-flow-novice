/**
 * TypeScript type definitions for CFN Configuration System
 * Derived from schemas/cfn-config-v1.json
 *
 * @version 1.0.0
 * @description Canonical types for all CFN configuration formats
 */

/**
 * Resource allocation limits with explicit property definitions
 * @description All properties are optional but type-safe when present
 */
export interface ResourceLimits {
  maxMemoryMB?: number;
  maxCpuCores?: number;
  maxRequestsPerMinute?: number;
  maxConcurrentRequests?: number;
  maxConnections?: number;
  maxCpuPercent?: number;
  maxWorkflows?: number;
  maxSessions?: number;
}

/**
 * Environment variable definition
 */
export interface EnvironmentVariable {
  value?: string | number | boolean | null;
  description: string;
  type: 'string' | 'integer' | 'number' | 'boolean';
  required?: boolean;
  default?: string | number | boolean | null;
  scope?: string[];
  legacyAliases?: string[];
  example?: string | number | boolean;
}

/**
 * Health check configuration
 */
export interface HealthCheckConfig {
  enabled?: boolean;
  path?: string;
  interval?: number;
  timeout?: number;
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
  type: 'token' | 'oauth2' | 'basic' | 'apikey';
  header?: string;
  secretName?: string;
  required?: boolean;
}

/**
 * Agent whitelist configuration
 */
export interface Agent {
  type: string;
  displayName: string;
  skills: string[];
  allowedMcpServers?: string[];
  resourceLimits?: ResourceLimits;
  description?: string;
}

export interface AgentWhitelistConfig {
  version: string;
  description?: string;
  lastUpdated?: string;
  agents: Agent[];
}

/**
 * MCP Server configuration
 */
export interface MCPServer {
  endpoint: string;
  requiredSkills: string[];
  auth: AuthConfig;
  healthCheck?: string | HealthCheckConfig;
  timeoutMs?: number;
  retryAttempts?: number;
  resourceLimits?: ResourceLimits;
  capabilities?: string[];
}

export interface MCPServersConfig {
  version: string;
  description?: string;
  lastUpdated?: string;
  servers: Record<string, MCPServer>;
}

/**
 * Skill requirements configuration
 */
export interface ResourceImpact {
  memoryMB?: number;
  cpuUnits?: number;
  durationSeconds?: number;
}

export interface ToolRequirement {
  displayName: string;
  requiredSkills: string[];
  optionalSkills?: string[];
  allowedAgentTypes?: string[];
  resourceImpact?: ResourceImpact;
  description?: string;
}

export interface SkillRequirementsConfig {
  version: string;
  description?: string;
  lastUpdated?: string;
  tools: Record<string, ToolRequirement>;
}

/**
 * Runtime contract configuration
 */
export interface RuntimeContractConfig {
  version: string;
  lastUpdated?: string;
  generated?: string;
  variables?: Record<string, EnvironmentVariable>;
}

/**
 * Team configuration
 */
export interface TeamWorkspace {
  path?: string;
  diskQuota?: string;
}

export interface TeamResources {
  memory?: string;
  cpuCores?: number;
  maxAgents?: number;
}

export interface TeamNetwork {
  subnetId?: number;
  coordinatorIp?: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  workspace?: TeamWorkspace;
  resources?: TeamResources;
  allowedSkills?: string[];
  network?: TeamNetwork;
}

export interface TeamConfig {
  team: Team;
}

/**
 * Union type for all possible CFN configuration types
 */
export type CFNConfig =
  | AgentWhitelistConfig
  | MCPServersConfig
  | SkillRequirementsConfig
  | RuntimeContractConfig
  | TeamConfig;

/**
 * Validation result type
 */
export interface ValidationError {
  field: string;
  message: string;
  path: string;
  value?: unknown;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  configType?: string;
}

/**
 * Environment variable export map
 */
export interface EnvVarExportMap {
  [key: string]: string | number | boolean;
}

/**
 * Configuration loader options
 */
export interface ConfigLoaderOptions {
  validateSchema?: boolean;
  strictMode?: boolean;
  resolveEnvVars?: boolean;
  warnOnLegacyVars?: boolean;
}

/**
 * Type guard helpers
 */
export function isAgentWhitelistConfig(
  config: CFNConfig
): config is AgentWhitelistConfig {
  return 'agents' in config && Array.isArray((config as AgentWhitelistConfig).agents);
}

export function isMCPServersConfig(
  config: CFNConfig
): config is MCPServersConfig {
  return (
    'servers' in config &&
    typeof (config as MCPServersConfig).servers === 'object'
  );
}

export function isSkillRequirementsConfig(
  config: CFNConfig
): config is SkillRequirementsConfig {
  return (
    'tools' in config &&
    typeof (config as SkillRequirementsConfig).tools === 'object'
  );
}

export function isRuntimeContractConfig(
  config: CFNConfig
): config is RuntimeContractConfig {
  return (
    'variables' in config &&
    (config as RuntimeContractConfig).variables !== undefined
  );
}

export function isTeamConfig(config: CFNConfig): config is TeamConfig {
  return 'team' in config && (config as TeamConfig).team !== undefined;
}
