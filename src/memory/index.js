/**
 * Memory Module - Unified memory persistence with fallback capabilities
 *
 * Provides SQLite-based SharedMemory with automatic fallback to in-memory storage
 * when SQLite is unavailable. Critical for Byzantine consensus validation.
 *
 * @module memory
 */

import SharedMemory from './shared-memory.js';
import { SwarmMemory, createSwarmMemory } from './swarm-memory.js';
import ResilientMemorySystem, {
  InMemoryStorageEngine,
  createResilientMemory,
  testSQLiteAvailability
} from './fallback-memory-system.js';

// Export all memory systems
export {
  SharedMemory,
  SwarmMemory,
  createSwarmMemory,
  ResilientMemorySystem,
  InMemoryStorageEngine,
  createResilientMemory,
  testSQLiteAvailability
};

// Re-export swarm namespaces for convenience
export const SWARM_NAMESPACES = {
  AGENTS: 'swarm:agents',
  TASKS: 'swarm:tasks',
  COMMUNICATIONS: 'swarm:communications',
  CONSENSUS: 'swarm:consensus',
  PATTERNS: 'swarm:patterns',
  METRICS: 'swarm:metrics',
  COORDINATION: 'swarm:coordination',
  VALIDATION: 'swarm:validation',
  TRUTH_SCORING: 'swarm:truth-scoring',
  FALLBACK: 'swarm:fallback'
};

/**
 * Create resilient memory instance with automatic fallback
 * @param {Object} options - Configuration options
 * @returns {ResilientMemorySystem|SwarmMemory|SharedMemory} Memory instance
 */
export function createMemory(options = {}) {
  // Use resilient memory system by default for critical applications
  if (options.resilient !== false) {
    return new ResilientMemorySystem(options);
  }

  if (options.type === 'swarm' || options.swarmId) {
    return new SwarmMemory(options);
  }

  return new SharedMemory(options);
}

/**
 * Create Byzantine-safe memory for consensus validation
 * @param {Object} options - Configuration options
 * @returns {ResilientMemorySystem} Resilient memory with truth scoring
 */
export function createByzantineMemory(options = {}) {
  return new ResilientMemorySystem({
    ...options,
    enableTruthScoring: true,
    byzantineMode: true,
    consensusThreshold: options.consensusThreshold || 0.85
  });
}

/**
 * Memory system health check
 * @returns {Object} Health status of all memory systems
 */
export async function checkMemoryHealth() {
  const health = {
    timestamp: Date.now(),
    systems: {}
  };

  // Test SQLite availability
  try {
    const sqliteTest = await testSQLiteAvailability();
    health.systems.sqlite = {
      available: sqliteTest.available,
      tested: sqliteTest.tested,
      error: sqliteTest.error
    };
  } catch (error) {
    health.systems.sqlite = {
      available: false,
      tested: false,
      error: error.message
    };
  }

  // Test fallback system
  try {
    const fallbackEngine = new InMemoryStorageEngine({
      enablePersistence: false,
      maxMemoryMB: 10
    });
    await fallbackEngine.initialize();

    await fallbackEngine.store('test', 'value');
    const retrieved = await fallbackEngine.retrieve('test');
    await fallbackEngine.close();

    health.systems.fallback = {
      available: true,
      tested: retrieved === 'value',
      error: null
    };
  } catch (error) {
    health.systems.fallback = {
      available: false,
      tested: false,
      error: error.message
    };
  }

  // Test resilient system
  try {
    const resilientSystem = new ResilientMemorySystem({
      enablePersistence: false,
      maxMemoryMB: 10
    });
    await resilientSystem.initialize();

    const systemInfo = resilientSystem.getSystemInfo();
    await resilientSystem.close();

    health.systems.resilient = {
      available: true,
      mode: systemInfo.mode,
      tested: true,
      error: null
    };
  } catch (error) {
    health.systems.resilient = {
      available: false,
      tested: false,
      error: error.message
    };
  }

  // Overall health assessment
  health.overall = {
    healthy: health.systems.fallback.available || health.systems.sqlite.available,
    primaryMode: health.systems.sqlite.available ? 'sqlite' : 'fallback',
    fallbackReady: health.systems.fallback.available,
    resilientReady: health.systems.resilient.available
  };

  return health;
}

// Default export with all systems
export default {
  SharedMemory,
  SwarmMemory,
  createMemory,
  createSwarmMemory,
  ResilientMemorySystem,
  InMemoryStorageEngine,
  createResilientMemory,
  createByzantineMemory,
  testSQLiteAvailability,
  checkMemoryHealth,
  SWARM_NAMESPACES
};
