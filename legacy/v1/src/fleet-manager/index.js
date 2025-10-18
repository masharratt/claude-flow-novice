/**
 * Fleet Manager - Enterprise-grade fleet management for 1000+ AI agents
 *
 * @module @claude-flow-novice/fleet-manager
 * @version 2.0.0
 * @description
 * Unified fleet management system supporting:
 * - 1000+ concurrent agents across distributed systems
 * - Auto-scaling with 40%+ efficiency gains
 * - Redis-backed coordination and persistence
 * - Real-time monitoring and health checks
 * - Priority-based resource allocation
 * - High-throughput event bus (10,000+ events/sec)
 *
 * @example
 * ```javascript
 * import { FleetManager } from '@claude-flow-novice/fleet-manager';
 *
 * const fleet = new FleetManager({
 *   maxAgents: 1500,
 *   redis: { host: 'redis.example.com', port: 6379 },
 *   autoScaling: { enabled: true, efficiencyTarget: 0.45 },
 *   monitoring: { enabled: true, metricsInterval: 10000 }
 * });
 *
 * await fleet.initialize();
 *
 * // Allocate agent for task
 * const allocation = await fleet.allocateAgent({
 *   type: 'coder',
 *   taskId: 'task-123',
 *   capabilities: ['javascript', 'typescript']
 * });
 *
 * // Release agent when task completes
 * await fleet.releaseAgent(allocation.agentId, {
 *   success: true,
 *   duration: 1500
 * });
 *
 * // Get fleet status
 * const status = await fleet.getStatus();
 * console.log(`Active agents: ${status.agents.active}/${status.agents.total}`);
 * ```
 */

// Core components
export { FleetManager, FleetConfigSchema, AGENT_POOL_TYPES } from './core/FleetManager.js';
export { AgentRegistry } from './core/AgentRegistry.js';
export { ResourceAllocator, ALLOCATION_STRATEGIES } from './core/ResourceAllocator.js';

// Coordination
export { RedisCoordinator, SerializationFormat, ConnectionStatus } from './coordination/RedisCoordinator.js';
export { QEEventBus } from './coordination/EventBus.js';

// Scaling
export { AutoScalingManager, AutoScalingConfigSchema } from './scaling/AutoScalingManager.js';

// Monitoring
export { FleetMonitor, MonitoringConfigSchema } from './monitoring/FleetMonitor.js';

// Default export
export { FleetManager as default } from './core/FleetManager.js';

/**
 * Package version
 */
export const VERSION = '2.0.0';

/**
 * Quick-start helper function
 *
 * @param {Object} config - Fleet configuration
 * @returns {Promise<FleetManager>} Initialized fleet manager instance
 *
 * @example
 * ```javascript
 * import { createFleet } from '@claude-flow-novice/fleet-manager';
 *
 * const fleet = await createFleet({
 *   maxAgents: 1000,
 *   redis: { host: 'localhost' }
 * });
 * ```
 */
export async function createFleet(config = {}) {
  const { FleetManager } = await import('./core/FleetManager.js');
  const fleet = new FleetManager(config);
  await fleet.initialize();
  return fleet;
}

/**
 * Configuration presets for common deployment scenarios
 */
export const FLEET_PRESETS = {
  /**
   * Development preset - minimal resources
   */
  development: {
    maxAgents: 50,
    autoScaling: {
      enabled: false
    },
    monitoring: {
      enabled: true,
      metricsInterval: 30000
    }
  },

  /**
   * Staging preset - moderate resources
   */
  staging: {
    maxAgents: 200,
    autoScaling: {
      enabled: true,
      efficiencyTarget: 0.35
    },
    monitoring: {
      enabled: true,
      metricsInterval: 15000
    }
  },

  /**
   * Production preset - full scale
   */
  production: {
    maxAgents: 1000,
    autoScaling: {
      enabled: true,
      efficiencyTarget: 0.45
    },
    monitoring: {
      enabled: true,
      metricsInterval: 10000,
      retentionDays: 90
    },
    redis: {
      ttl: 7200 // 2 hours
    }
  },

  /**
   * Enterprise preset - maximum scale
   */
  enterprise: {
    maxAgents: 2000,
    autoScaling: {
      enabled: true,
      efficiencyTarget: 0.5,
      minPoolSize: 10,
      maxPoolSize: 300
    },
    monitoring: {
      enabled: true,
      metricsInterval: 5000,
      retentionDays: 180
    },
    redis: {
      ttl: 10800 // 3 hours
    }
  }
};
