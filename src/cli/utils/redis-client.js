/**
 * Redis Client for Swarm Persistence
 */

import { createClient } from 'redis';

/**
 * Connect to Redis with configuration
 */
export async function connectRedis(config = {}) {
  const {
    host = 'localhost',
    port = 6379,
    password = null,
    database = 0,
    connectTimeout = 10000,
    lazyConnect = true
  } = config;

  try {
    const client = createClient({
      socket: {
        host,
        port,
        connectTimeout,
        lazyConnect
      },
      password,
      database
    });

    // Handle connection events
    client.on('error', (err) => {
      console.warn('Redis connection error:', err.message);
    });

    client.on('connect', () => {
      console.log('Redis client connected');
    });

    client.on('ready', () => {
      console.log('Redis client ready');
    });

    client.on('end', () => {
      console.log('Redis client disconnected');
    });

    // Connect to Redis
    await client.connect();

    // Test connection
    await client.ping();

    return client;
  } catch (error) {
    throw new Error(`Failed to connect to Redis: ${error.message}`);
  }
}

/**
 * Save swarm state to Redis
 */
export async function saveSwarmState(client, swarmId, state) {
  try {
    const key = `swarm:${swarmId}`;
    const serializedState = JSON.stringify({
      ...state,
      lastUpdated: Date.now()
    });

    // Save with TTL of 24 hours (86400 seconds)
    await client.setEx(key, 86400, serializedState);

    // Also add to active swarms set
    await client.sAdd('swarms:active', swarmId);

    // Update swarm index with metadata
    const indexData = {
      id: swarmId,
      objective: state.objective,
      status: state.status,
      startTime: state.startTime,
      endTime: state.endTime || null,
      lastUpdated: Date.now()
    };
    await client.hSet('swarms:index', swarmId, JSON.stringify(indexData));

    return true;
  } catch (error) {
    throw new Error(`Failed to save swarm state: ${error.message}`);
  }
}

/**
 * Load swarm state from Redis
 */
export async function loadSwarmState(client, swarmId) {
  try {
    const key = `swarm:${swarmId}`;
    const serializedState = await client.get(key);

    if (!serializedState) {
      return null;
    }

    return JSON.parse(serializedState);
  } catch (error) {
    throw new Error(`Failed to load swarm state: ${error.message}`);
  }
}

/**
 * List all active swarms
 */
export async function listActiveSwarms(client, includeAll = false) {
  try {
    const swarmIds = await client.sMembers('swarms:active');
    const swarms = [];

    for (const swarmId of swarmIds) {
      const state = await loadSwarmState(client, swarmId);
      if (state) {
        // Filter out completed/failed swarms unless includeAll is true
        if (includeAll || (state.status !== 'completed' && state.status !== 'failed')) {
          swarms.push(state);
        }
      } else {
        // Clean up stale swarm ID from active set
        await client.sRem('swarms:active', swarmId);
        await client.hDel('swarms:index', swarmId);
      }
    }

    // Sort by start time (newest first)
    return swarms.sort((a, b) => b.startTime - a.startTime);
  } catch (error) {
    throw new Error(`Failed to list active swarms: ${error.message}`);
  }
}

/**
 * Delete swarm state from Redis
 */
export async function deleteSwarmState(client, swarmId) {
  try {
    const key = `swarm:${swarmId}`;

    // Delete swarm data
    await client.del(key);

    // Remove from active set
    await client.sRem('swarms:active', swarmId);

    // Remove from index
    await client.hDel('swarms:index', swarmId);

    return true;
  } catch (error) {
    throw new Error(`Failed to delete swarm state: ${error.message}`);
  }
}

/**
 * Update swarm status
 */
export async function updateSwarmStatus(client, swarmId, status, additionalData = {}) {
  try {
    const state = await loadSwarmState(client, swarmId);
    if (!state) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const updatedState = {
      ...state,
      status,
      ...additionalData,
      lastUpdated: Date.now()
    };

    // Add endTime if status is terminal
    if (status === 'completed' || status === 'failed') {
      updatedState.endTime = Date.now();
    }

    await saveSwarmState(client, swarmId, updatedState);

    // If terminal status, remove from active set
    if (status === 'completed' || status === 'failed') {
      await client.sRem('swarms:active', swarmId);
    }

    return updatedState;
  } catch (error) {
    throw new Error(`Failed to update swarm status: ${error.message}`);
  }
}

/**
 * Get swarm metrics and statistics
 */
export async function getSwarmMetrics(client) {
  try {
    const activeSwarms = await listActiveSwarms(client);
    const allSwarms = await listActiveSwarms(client, true);

    const metrics = {
      total: allSwarms.length,
      active: activeSwarms.length,
      completed: allSwarms.filter(s => s.status === 'completed').length,
      failed: allSwarms.filter(s => s.status === 'failed').length,
      initializing: allSwarms.filter(s => s.status === 'initializing').length,
      running: allSwarms.filter(s => s.status === 'running').length,
      averageDuration: 0,
      totalAgents: 0,
      totalTasks: 0
    };

    // Calculate average duration for completed swarms
    const completedSwarms = allSwarms.filter(s => s.status === 'completed' && s.endTime);
    if (completedSwarms.length > 0) {
      const totalDuration = completedSwarms.reduce((sum, swarm) => {
        return sum + (swarm.endTime - swarm.startTime);
      }, 0);
      metrics.averageDuration = Math.round(totalDuration / completedSwarms.length / 1000); // in seconds
    }

    // Count total agents and tasks
    allSwarms.forEach(swarm => {
      metrics.totalAgents += swarm.agents?.length || 0;
      metrics.totalTasks += swarm.tasks?.length || 0;
    });

    return metrics;
  } catch (error) {
    throw new Error(`Failed to get swarm metrics: ${error.message}`);
  }
}

/**
 * Cleanup old/expired swarm states
 */
export async function cleanupExpiredSwarms(client, maxAgeHours = 24) {
  try {
    const allSwarms = await listActiveSwarms(client, true);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds

    let cleanedCount = 0;

    for (const swarm of allSwarms) {
      const age = now - swarm.startTime;

      // Clean up old swarms or those with completed/failed status
      if (age > maxAge || swarm.status === 'completed' || swarm.status === 'failed') {
        await deleteSwarmState(client, swarm.id);
        cleanedCount++;
      }
    }

    return cleanedCount;
  } catch (error) {
    throw new Error(`Failed to cleanup expired swarms: ${error.message}`);
  }
}

/**
 * Backup swarm states to file
 */
export async function backupSwarmStates(client, filePath) {
  try {
    const allSwarms = await listActiveSwarms(client, true);
    const backup = {
      timestamp: Date.now(),
      swarms: allSwarms,
      count: allSwarms.length
    };

    const fs = require('fs').promises;
    await fs.writeFile(filePath, JSON.stringify(backup, null, 2));

    return backup;
  } catch (error) {
    throw new Error(`Failed to backup swarm states: ${error.message}`);
  }
}

/**
 * Restore swarm states from backup file
 */
export async function restoreSwarmStates(client, filePath) {
  try {
    const fs = require('fs').promises;
    const backupData = await fs.readFile(filePath, 'utf8');
    const backup = JSON.parse(backupData);

    if (!backup.swarms || !Array.isArray(backup.swarms)) {
      throw new Error('Invalid backup file format');
    }

    let restoredCount = 0;

    for (const swarm of backup.swarms) {
      try {
        await saveSwarmState(client, swarm.id, swarm);
        restoredCount++;
      } catch (error) {
        console.warn(`Failed to restore swarm ${swarm.id}: ${error.message}`);
      }
    }

    return restoredCount;
  } catch (error) {
    throw new Error(`Failed to restore swarm states: ${error.message}`);
  }
}

/**
 * Redis health check
 */
export async function checkRedisHealth(client) {
  try {
    const startTime = Date.now();
    await client.ping();
    const responseTime = Date.now() - startTime;

    const info = await client.info('memory');
    const memoryInfo = {};

    // Parse Redis memory info
    info.split('\r\n').forEach(line => {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        memoryInfo[key] = value;
      }
    });

    return {
      status: 'healthy',
      responseTime,
      memoryUsage: memoryInfo.used_memory_human,
      connectedClients: memoryInfo.connected_clients,
      uptime: memoryInfo.uptime_in_seconds
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
}