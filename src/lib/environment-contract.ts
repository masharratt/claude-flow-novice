/**
 * Environment Variable Contract Resolver
 *
 * Provides single source of truth for environment variables with mode-specific overrides.
 * Implements Phase 3 of CLI/Trigger.dev collision mitigation strategy.
 *
 * Reference: planning/trigger/CLI_TRIGGER_COLLISION_ANALYSIS.md (Phase 3)
 * Contract: docker/runtime/cfn-runtime.contract.yml
 *
 * Variable Resolution Order (First Set Wins):
 * 1. Mode-specific overrides (if specified in contract)
 * 2. Environment variable with CFN_ prefix (standard)
 * 3. Legacy environment variable (with deprecation warning)
 * 4. Default value from contract
 * 5. Error if no value found and required=true
 *
 * Usage:
 *   import { getEnvValue } from './environment-contract';
 *
 *   // CLI mode - uses mcp-network
 *   const cliRedisHost = getEnvValue('redis_host', 'cli');
 *
 *   // Trigger.dev mode - uses trigger-cfn-network
 *   const triggerRedisHost = getEnvValue('redis_host', 'trigger');
 *
 *   // Environment override takes precedence
 *   process.env.CFN_REDIS_HOST = 'custom-redis';
 *   const overriddenHost = getEnvValue('redis_host', 'cli'); // Returns 'custom-redis'
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Validation constraints for contract values
 */
interface ValidationRules {
  pattern?: string;
  min?: number;
  max?: number;
  allowed_values?: string[];
  description?: string;
}

/**
 * Mode-specific overrides in contract
 */
interface ModeOverride {
  override?: string | number;
  network?: string;
}

/**
 * Contract specification for a single environment variable
 */
interface ContractSpec {
  description: string;
  default: string | number | null;
  type: 'string' | 'integer' | 'boolean' | 'float';
  scope: string[];
  legacy_aliases?: string[];
  required?: boolean;
  required_in_production?: boolean;
  example?: string;
  security_notes?: string;
  validation?: ValidationRules;
  mode_defaults?: Record<string, string | number>;
  modes?: {
    cli?: ModeOverride;
    trigger?: ModeOverride;
  };
}

/**
 * Loaded contract cache (lazy-loaded on first use)
 */
let contractCache: Record<string, ContractSpec & { _cfnVarName?: string }> | null = null;

/**
 * Clears the contract cache (for testing purposes)
 * @internal
 */
export function _clearContractCache(): void {
  contractCache = null;
}

/**
 * Loads the environment variable contract from YAML file
 * Cached after first load for performance
 *
 * @returns Contract specification mapping
 * @throws Error if contract file not found or invalid YAML
 */
function loadContract(): Record<string, ContractSpec> {
  if (contractCache) {
    return contractCache;
  }

  const projectRoot = process.env.PROJECT_ROOT || path.resolve(__dirname, '../../');
  const contractPath = path.resolve(projectRoot, 'docker/runtime/cfn-runtime.contract.yml');

  if (!fs.existsSync(contractPath)) {
    throw new Error(
      `Environment contract not found at ${contractPath}. ` +
        `Ensure docker/runtime/cfn-runtime.contract.yml exists.`
    );
  }

  const contractYaml = fs.readFileSync(contractPath, 'utf8');
  const contractData = yaml.load(contractYaml) as Record<string, any>;

  // Flatten nested contract structure (e.g., redis.CFN_REDIS_HOST becomes redis_host)
  contractCache = flattenContract(contractData);

  return contractCache;
}

/**
 * Flattens nested contract structure into flat key mapping
 * Maps environment variable names (CFN_REDIS_HOST) to their specs
 *
 * @param nested - Nested contract from YAML
 * @returns Flattened mapping with both simple keys and spec metadata
 */
function flattenContract(nested: Record<string, any>): Record<string, ContractSpec & { _cfnVarName?: string }> {
  const flattened: Record<string, ContractSpec & { _cfnVarName?: string }> = {};

  // Process each top-level category (redis, agent, task, etc.)
  for (const [category, variables] of Object.entries(nested)) {
    // Skip metadata fields
    if (category === 'version' || category === 'last_updated') {
      continue;
    }

    if (typeof variables !== 'object' || variables === null) {
      continue;
    }

    // Process each variable in category
    for (const [envVarName, spec] of Object.entries(variables)) {
      if (typeof spec === 'object' && spec !== null) {
        // Create a simple key from env var name (e.g., CFN_REDIS_HOST -> redis_host)
        const simpleKey = envVarName
          .replace(/^CFN_/, '')
          .toLowerCase()
          .replace(/_/g, '_');

        const specWithCfnName = {
          ...(spec as ContractSpec),
          _cfnVarName: envVarName, // Store the CFN variable name for later lookup
        };

        flattened[simpleKey] = specWithCfnName;
      }
    }
  }

  return flattened;
}

/**
 * Gets environment value with mode-specific override support
 *
 * Resolution order:
 * 1. Mode-specific override from contract (if defined)
 * 2. CFN_-prefixed environment variable
 * 3. Legacy environment variable (with warning)
 * 4. Default from contract
 * 5. Error if required and no value found
 *
 * @param key - Contract key (e.g., 'redis_host')
 * @param mode - Execution mode ('cli' or 'trigger')
 * @returns Resolved environment variable value as string
 * @throws Error if key not found in contract or required value missing
 */
export function getEnvValue(key: string, mode: 'cli' | 'trigger'): string {
  const contract = loadContract();
  const spec = contract[key] as (ContractSpec & { _cfnVarName?: string }) | undefined;

  if (!spec) {
    throw new Error(
      `Unknown contract key: '${key}'. ` +
        `Available keys: ${Object.keys(contract).filter(k => !k.startsWith('_')).join(', ')}`
    );
  }

  // Get the CFN variable name for this spec
  const cfnVarName = spec._cfnVarName || 'CFN_VAR';

  // Step 1: Check CFN_ prefixed environment variable (highest priority explicit env var)
  if (process.env[cfnVarName]) {
    return process.env[cfnVarName];
  }

  // Step 2: Check legacy environment variables
  if (spec.legacy_aliases && spec.legacy_aliases.length > 0) {
    for (const legacy of spec.legacy_aliases) {
      if (process.env[legacy]) {
        console.warn(
          `[ENV DEPRECATION] Using legacy environment variable '${legacy}', ` +
            `migrate to '${cfnVarName}' (see docker/runtime/cfn-runtime.contract.yml)`
        );
        return process.env[legacy];
      }
    }
  }

  // Step 3: Use mode-specific override if no explicit env var was set
  if (spec.modes?.[mode]?.override !== undefined) {
    return String(spec.modes[mode].override);
  }

  // Step 4: Use default value
  if (spec.default !== null && spec.default !== undefined) {
    return String(spec.default);
  }

  // Step 5: Error if required
  if (spec.required) {
    throw new Error(
      `Required environment variable '${cfnVarName}' not set. ` +
        `See docker/runtime/cfn-runtime.contract.yml for configuration.`
    );
  }

  // No value found and not required - return empty string
  return '';
}

/**
 * Gets mode-specific network name from contract
 *
 * @param mode - Execution mode ('cli' or 'trigger')
 * @returns Network name for the mode
 */
export function getNetworkName(mode: 'cli' | 'trigger'): string {
  const contract = loadContract();
  const spec = contract['network_name'];

  if (!spec) {
    // Fallback to default if not in contract
    return mode === 'cli' ? 'mcp-network' : 'trigger-cfn-network';
  }

  return getEnvValue('network_name', mode);
}

/**
 * Gets all environment variables for a specific mode
 * Useful for Docker environment setup
 *
 * @param mode - Execution mode ('cli' or 'trigger')
 * @returns Object with resolved environment variables
 */
export function getAllEnvValues(mode: 'cli' | 'trigger'): Record<string, string> {
  const contract = loadContract();
  const envVars: Record<string, string> = {};

  for (const [key, spec] of Object.entries(contract)) {
    if (spec && typeof spec === 'object' && 'description' in spec) {
      try {
        const value = getEnvValue(key, mode);
        if (value) {
          envVars[key] = value;
        }
      } catch {
        // Skip variables that can't be resolved (optional)
      }
    }
  }

  return envVars;
}

/**
 * Validates an environment variable against contract rules
 *
 * @param key - Contract key
 * @param value - Value to validate
 * @returns Validation result with optional error message
 */
export function validateEnvValue(key: string, value: string): { valid: boolean; error?: string } {
  const contract = loadContract();
  const spec = contract[key];

  if (!spec) {
    return { valid: false, error: `Unknown contract key: '${key}'` };
  }

  const rules = spec.validation;
  if (!rules) {
    return { valid: true };
  }

  // Pattern validation
  if (rules.pattern) {
    const regex = new RegExp(rules.pattern);
    if (!regex.test(value)) {
      return {
        valid: false,
        error: `Value '${value}' does not match pattern '${rules.pattern}'`,
      };
    }
  }

  // Numeric validations
  if (spec.type === 'integer' || spec.type === 'float') {
    const numValue = spec.type === 'integer' ? parseInt(value, 10) : parseFloat(value);

    if (isNaN(numValue)) {
      return {
        valid: false,
        error: `Value '${value}' is not a valid ${spec.type}`,
      };
    }

    if (rules.min !== undefined && numValue < rules.min) {
      return {
        valid: false,
        error: `Value ${numValue} is less than minimum ${rules.min}`,
      };
    }

    if (rules.max !== undefined && numValue > rules.max) {
      return {
        valid: false,
        error: `Value ${numValue} is greater than maximum ${rules.max}`,
      };
    }
  }

  // Allowed values
  if (rules.allowed_values && !rules.allowed_values.includes(value)) {
    return {
      valid: false,
      error: `Value '${value}' is not in allowed values: ${rules.allowed_values.join(', ')}`,
    };
  }

  return { valid: true };
}


/**
 * Exports for barrel import
 */
export default {
  getEnvValue,
  getNetworkName,
  getAllEnvValues,
  validateEnvValue,
};
