/**
 * Swarm Initialization Validator
 *
 * Validates that swarm initialization is performed before spawning multiple agents.
 * Ensures proper coordination and prevents inconsistent implementations across agents.
 *
 * @module validators/swarm-init-validator
 */

import { Logger } from '../core/logger.js';
import type { SwarmCoordinator } from '../coordination/swarm-coordinator.js';

/**
 * Validation result returned by validateSwarmInit
 */
export interface SwarmValidationResult {
  valid: boolean;
  error?: string;
  suggestion?: string;
  topology?: 'mesh' | 'hierarchical';
  maxAgents?: number;
}

/**
 * Swarm initialization status
 */
export interface SwarmStatus {
  initialized: boolean;
  topology?: 'mesh' | 'hierarchical';
  maxAgents?: number;
  activeAgents?: number;
  swarmId?: string;
}

/**
 * Configuration for swarm validator
 */
export interface SwarmValidatorConfig {
  requireSwarmForMultiAgent?: boolean;
  minAgentsRequiringSwarm?: number;
  meshTopologyMaxAgents?: number;
  hierarchicalTopologyMinAgents?: number;
}

const DEFAULT_CONFIG: Required<SwarmValidatorConfig> = {
  requireSwarmForMultiAgent: true,
  minAgentsRequiringSwarm: 2,
  meshTopologyMaxAgents: 7,
  hierarchicalTopologyMinAgents: 8,
};

/**
 * Validates swarm initialization before agent spawning
 *
 * @param agentCount - Number of agents to spawn
 * @param swarmStatus - Current swarm status (optional, will check environment if not provided)
 * @param config - Validator configuration
 * @returns Validation result with error messages and suggestions
 *
 * @example
 * ```typescript
 * const result = await validateSwarmInit(3);
 * if (!result.valid) {
 *   console.error(result.error);
 *   console.log(result.suggestion);
 * }
 * ```
 */
export async function validateSwarmInit(
  agentCount: number,
  swarmStatus?: SwarmStatus,
  config: SwarmValidatorConfig = {}
): Promise<SwarmValidationResult> {
  const logger = new Logger('SwarmInitValidator');
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Single agent spawning doesn't require swarm
  if (agentCount < cfg.minAgentsRequiringSwarm) {
    return {
      valid: true,
    };
  }

  // Check if swarm is required for this agent count
  if (!cfg.requireSwarmForMultiAgent) {
    logger.warn('Swarm validation is disabled in configuration');
    return {
      valid: true,
    };
  }

  // Get swarm status
  const status = swarmStatus || (await getSwarmStatus());

  // Validate swarm is initialized
  if (!status.initialized) {
    const topology = agentCount <= cfg.meshTopologyMaxAgents ? 'mesh' : 'hierarchical';

    return {
      valid: false,
      error: createErrorMessage(agentCount),
      suggestion: createSuggestion(agentCount, topology),
      topology,
      maxAgents: agentCount,
    };
  }

  // Validate topology matches agent count
  const topologyValidation = validateTopology(agentCount, status, cfg);
  if (!topologyValidation.valid) {
    return topologyValidation;
  }

  // Validate max agents capacity
  if (status.maxAgents && agentCount > status.maxAgents) {
    return {
      valid: false,
      error: `Cannot spawn ${agentCount} agents. Swarm configured for maximum ${status.maxAgents} agents.`,
      suggestion: `Reinitialize swarm with increased maxAgents:\n  npx claude-flow-novice swarm init --topology ${status.topology} --max-agents ${agentCount}`,
    };
  }

  logger.info(`Swarm validation passed for ${agentCount} agents`);
  return {
    valid: true,
  };
}

/**
 * Validates that topology matches agent count requirements
 */
function validateTopology(
  agentCount: number,
  status: SwarmStatus,
  config: Required<SwarmValidatorConfig>
): SwarmValidationResult {
  const expectedTopology = agentCount <= config.meshTopologyMaxAgents ? 'mesh' : 'hierarchical';

  if (status.topology && status.topology !== expectedTopology) {
    return {
      valid: false,
      error: `Topology mismatch: ${agentCount} agents require '${expectedTopology}' topology, but swarm is using '${status.topology}'.`,
      suggestion: `Reinitialize swarm with correct topology:\n  npx claude-flow-novice swarm init --topology ${expectedTopology} --max-agents ${agentCount}`,
      topology: expectedTopology,
      maxAgents: agentCount,
    };
  }

  return { valid: true };
}

/**
 * Creates error message for missing swarm initialization
 */
function createErrorMessage(agentCount: number): string {
  return `
❌ SWARM INITIALIZATION REQUIRED

You are attempting to spawn ${agentCount} agents without initializing swarm.

Without swarm coordination:
  • Agents work independently with no shared context
  • Results may be inconsistent (e.g., 3 different JWT secret solutions)
  • No consensus validation or Byzantine fault tolerance
  • Memory coordination is disabled

This violates the mandatory coordination requirements in CLAUDE.md.
`.trim();
}

/**
 * Creates suggestion message with fix command
 */
function createSuggestion(agentCount: number, topology: 'mesh' | 'hierarchical'): string {
  return `
Fix:
1. Initialize swarm first:
   npx claude-flow-novice swarm init --topology ${topology} --max-agents ${agentCount}

2. Then spawn agents:
   [Your agent spawning command]

Topology Selection:
  • mesh: 2-7 agents (peer-to-peer coordination)
  • hierarchical: 8+ agents (coordinator-led structure)

See CLAUDE.md section "Swarm Initialization" for coordination requirements.
`.trim();
}

/**
 * Gets current swarm status from environment or MCP server
 */
async function getSwarmStatus(): Promise<SwarmStatus> {
  const logger = new Logger('SwarmInitValidator');

  // Check environment variables
  const swarmId = process.env['CLAUDE_SWARM_ID'];
  if (!swarmId) {
    return {
      initialized: false,
    };
  }

  // Try to get status from MCP server via swarm coordinator
  try {
    // Import dynamically to avoid circular dependencies
    const { getSwarmCoordinator } = await import('../coordination/swarm-coordinator-factory.js').catch(() => ({
      getSwarmCoordinator: null
    }));

    if (getSwarmCoordinator) {
      const coordinator = getSwarmCoordinator();
      if (coordinator) {
        const status = coordinator.getSwarmStatus();
        return {
          initialized: true,
          swarmId,
          activeAgents: status.agents.total,
          maxAgents: status.agents.total, // Use current total as max if not specified
        };
      }
    }
  } catch (error) {
    logger.debug('Could not get swarm status from coordinator', error);
  }

  // If we have a swarm ID but can't get details, assume initialized
  return {
    initialized: true,
    swarmId,
  };
}

/**
 * Validates swarm initialization and throws error if invalid
 *
 * This is a convenience wrapper for validateSwarmInit that throws on validation failure.
 * Use this in CLI commands where you want to halt execution on validation errors.
 *
 * @param agentCount - Number of agents to spawn
 * @param swarmStatus - Current swarm status (optional)
 * @param config - Validator configuration
 * @throws Error if validation fails
 *
 * @example
 * ```typescript
 * try {
 *   await requireSwarmInit(3);
 *   // Proceed with spawning agents
 * } catch (error) {
 *   console.error(error.message);
 *   process.exit(1);
 * }
 * ```
 */
export async function requireSwarmInit(
  agentCount: number,
  swarmStatus?: SwarmStatus,
  config?: SwarmValidatorConfig
): Promise<void> {
  const result = await validateSwarmInit(agentCount, swarmStatus, config);

  if (!result.valid) {
    const errorMessage = `${result.error}\n\n${result.suggestion}`;
    throw new Error(errorMessage);
  }
}

/**
 * Gets recommended topology for agent count
 *
 * @param agentCount - Number of agents
 * @param config - Validator configuration
 * @returns Recommended topology
 */
export function getRecommendedTopology(
  agentCount: number,
  config: SwarmValidatorConfig = {}
): 'mesh' | 'hierarchical' {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  return agentCount <= cfg.meshTopologyMaxAgents ? 'mesh' : 'hierarchical';
}

/**
 * Checks if swarm initialization is required for agent count
 *
 * @param agentCount - Number of agents
 * @param config - Validator configuration
 * @returns true if swarm initialization is required
 */
export function isSwarmRequired(
  agentCount: number,
  config: SwarmValidatorConfig = {}
): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  return cfg.requireSwarmForMultiAgent && agentCount >= cfg.minAgentsRequiringSwarm;
}

/**
 * Validates swarm configuration before initialization
 *
 * @param topology - Requested topology
 * @param maxAgents - Maximum number of agents
 * @param config - Validator configuration
 * @returns Validation result
 */
export function validateSwarmConfig(
  topology: 'mesh' | 'hierarchical',
  maxAgents: number,
  config: SwarmValidatorConfig = {}
): SwarmValidationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Validate topology matches max agents
  const recommendedTopology = getRecommendedTopology(maxAgents, config);

  if (topology !== recommendedTopology) {
    return {
      valid: false,
      error: `Topology '${topology}' is not optimal for ${maxAgents} agents.`,
      suggestion: `Recommended topology: '${recommendedTopology}'\n  • mesh: 2-${cfg.meshTopologyMaxAgents} agents\n  • hierarchical: ${cfg.hierarchicalTopologyMinAgents}+ agents`,
      topology: recommendedTopology,
      maxAgents,
    };
  }

  return { valid: true };
}

/**
 * Factory for creating a swarm coordinator factory module
 * This is a placeholder that will be replaced with actual implementation
 */
export const SwarmCoordinatorFactory = {
  getSwarmCoordinator(): SwarmCoordinator | null {
    return null;
  }
};
