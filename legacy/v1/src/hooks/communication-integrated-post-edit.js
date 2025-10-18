#!/usr/bin/env node

/**
 * Communication-Integrated Post-Edit Pipeline
 *
 * Integrates the ultra-fast communication system with the enhanced post-edit pipeline
 * to enable real-time agent coordination and memory sharing during editing operations.
 *
 * Features:
 * - Ultra-fast inter-agent communication (<1ms latency)
 * - Shared memory coordination for multi-agent workflows
 * - Real-time progress broadcasting to agent swarms
 * - Zero-copy data structures for performance
 * - Event-driven architecture for scalability
 */

import { enhancedPostEditHook } from './enhanced-post-edit-pipeline.js';
import { EventEmitter } from 'events';
import fs from 'fs/promises';
import path from 'path';

// Import ultra-fast communication components (runtime check)
let UltraFastCommunicationBus = null;
let ZeroCopyRingBuffer = null;
let OptimizedMessageSerializer = null;

try {
  const commModule = await import('../communication/ultra-fast-communication-bus.js');
  UltraFastCommunicationBus = commModule.UltraFastCommunicationBus || commModule.default;
} catch {
  console.warn('⚠️  Ultra-fast communication bus not available - using fallback');
}

try {
  const zcModule = await import('../communication/zero-copy-structures.js');
  ZeroCopyRingBuffer = zcModule.ZeroCopyRingBuffer;
} catch {
  console.warn('⚠️  Zero-copy structures not available - using fallback');
}

try {
  const serModule = await import('../communication/optimized-serialization.js');
  OptimizedMessageSerializer = serModule.OptimizedMessageSerializer;
} catch {
  console.warn('⚠️  Optimized serialization not available - using fallback');
}

/**
 * Communication-Integrated Memory Store
 * Extends the enhanced memory store with ultra-fast communication capabilities
 */
class CommunicationMemoryStore extends EventEmitter {
  constructor(options = {}) {
    super();

    this.memoryDir = path.join(process.cwd(), '.swarm');
    this.memoryFile = path.join(this.memoryDir, 'communication-memory.json');
    this.data = new Map();
    this.subscribers = new Map();

    // Communication system configuration
    this.enableCommunication = options.enableCommunication !== false;
    this.enableZeroCopy = options.enableZeroCopy !== false && ZeroCopyRingBuffer !== null;
    this.enableOptimizedSerialization = options.enableOptimizedSerialization !== false && OptimizedMessageSerializer !== null;

    // Initialize communication components if available
    if (this.enableCommunication && UltraFastCommunicationBus) {
      this.communicationBus = new UltraFastCommunicationBus({
        enableZeroCopy: this.enableZeroCopy,
        enableOptimizedSerialization: this.enableOptimizedSerialization,
        maxBufferSize: 1024 * 1024 * 10, // 10MB
        workerThreads: 2
      });

      this.communicationEnabled = true;
      console.log('✅ Ultra-fast communication enabled');
    } else {
      this.communicationBus = new EventEmitter(); // Fallback
      this.communicationEnabled = false;
      console.log('ℹ️  Using fallback communication (EventEmitter)');
    }

    // Performance metrics
    this.metrics = {
      messagesPublished: 0,
      messagesReceived: 0,
      averageLatency: 0,
      peakLatency: 0,
      totalBytes: 0
    };
  }

  /**
   * Initialize the communication-integrated memory store
   */
  async initialize() {
    try {
      await fs.mkdir(this.memoryDir, { recursive: true });

      try {
        const content = await fs.readFile(this.memoryFile, 'utf8');
        const parsed = JSON.parse(content);
        this.data = new Map(Object.entries(parsed));
        console.log(`✅ Communication memory store loaded (${this.data.size} entries)`);
      } catch {
        console.log('ℹ️  Initializing new communication memory store...');
      }

      // Initialize communication bus if enabled
      if (this.communicationEnabled && this.communicationBus.initialize) {
        await this.communicationBus.initialize();

        // Subscribe to memory update broadcasts
        this.communicationBus.on('memory:update', this.handleMemoryUpdate.bind(this));
        this.communicationBus.on('memory:query', this.handleMemoryQuery.bind(this));
        console.log('✅ Communication bus initialized');
      }

    } catch (error) {
      console.warn(`⚠️  Communication memory store init warning: ${error.message}`);
    }
  }

  /**
   * Store data with real-time communication to agents
   */
  async store(key, value, options = {}) {
    const startTime = performance.now();

    const entry = {
      value,
      options,
      timestamp: new Date().toISOString(),
      namespace: options.namespace || 'default',
      metadata: options.metadata || {},
      version: '3.0.0-communication',
      communicationEnabled: this.communicationEnabled
    };

    this.data.set(key, entry);

    // Persist to disk
    await this.persist();

    // Broadcast to all subscribed agents via ultra-fast communication
    if (options.broadcast !== false) {
      await this.broadcast('memory:update', {
        type: 'store',
        key,
        value,
        namespace: entry.namespace,
        metadata: entry.metadata,
        timestamp: entry.timestamp
      });
    }

    // Emit local event
    this.emit('store', { key, value, entry });

    // Update metrics
    const latency = performance.now() - startTime;
    this.updateMetrics('store', latency, JSON.stringify(entry).length);

    return entry;
  }

  /**
   * Retrieve data with optional remote coordination
   */
  async retrieve(key, options = {}) {
    const entry = this.data.get(key);

    // If not found locally and remote query enabled, ask other agents
    if (!entry && options.queryRemote && this.communicationEnabled) {
      const remoteResult = await this.queryRemote(key, options);
      if (remoteResult) {
        // Cache remotely retrieved data
        await this.store(key, remoteResult.value, {
          ...remoteResult.options,
          broadcast: false // Don't re-broadcast
        });
        return remoteResult.value;
      }
    }

    if (!entry) return null;

    if (options.namespace && entry.namespace !== options.namespace) {
      return null;
    }

    this.emit('retrieve', { key, entry });

    return entry.value;
  }

  /**
   * Subscribe to memory updates for specific keys or patterns
   */
  subscribe(pattern, callback, options = {}) {
    const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const subscription = {
      id: subscriptionId,
      pattern,
      callback,
      options,
      created: new Date().toISOString()
    };

    this.subscribers.set(subscriptionId, subscription);

    // Register with communication bus for remote updates
    if (this.communicationEnabled) {
      this.communicationBus.on(`memory:update:${pattern}`, callback);
    }

    console.log(`📡 Subscribed to memory pattern: ${pattern}`);

    return subscriptionId;
  }

  /**
   * Unsubscribe from memory updates
   */
  unsubscribe(subscriptionId) {
    const subscription = this.subscribers.get(subscriptionId);
    if (!subscription) return false;

    if (this.communicationEnabled) {
      this.communicationBus.off(`memory:update:${subscription.pattern}`, subscription.callback);
    }

    this.subscribers.delete(subscriptionId);
    console.log(`📡 Unsubscribed: ${subscriptionId}`);

    return true;
  }

  /**
   * Broadcast message to all agents
   */
  async broadcast(topic, message, options = {}) {
    const startTime = performance.now();

    try {
      if (this.communicationEnabled && this.communicationBus.publish) {
        // Use ultra-fast communication bus
        await this.communicationBus.publish(topic, message, options);
      } else {
        // Fallback: emit locally
        this.communicationBus.emit(topic, message);
      }

      this.metrics.messagesPublished++;

      const latency = performance.now() - startTime;
      this.updateMetrics('broadcast', latency, JSON.stringify(message).length);

    } catch (error) {
      console.error(`❌ Broadcast failed: ${error.message}`);
    }
  }

  /**
   * Query remote agents for data
   */
  async queryRemote(key, options = {}) {
    if (!this.communicationEnabled) return null;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.communicationBus.off('memory:response', responseHandler);
        resolve(null);
      }, options.timeout || 1000);

      const responseHandler = (response) => {
        if (response.key === key) {
          clearTimeout(timeout);
          this.communicationBus.off('memory:response', responseHandler);
          resolve(response);
        }
      };

      this.communicationBus.on('memory:response', responseHandler);

      // Send query request
      this.broadcast('memory:query', {
        key,
        requestId: `query-${Date.now()}`,
        requester: process.pid,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Handle memory update broadcasts from other agents
   */
  handleMemoryUpdate(update) {
    const { type, key, value, namespace, metadata } = update;

    // Check if any subscribers match this update
    for (const [subId, subscription] of this.subscribers) {
      const pattern = subscription.pattern;

      // Simple pattern matching (supports wildcards)
      if (this.matchesPattern(key, pattern)) {
        subscription.callback(update);
      }
    }

    this.metrics.messagesReceived++;
    this.emit('remoteUpdate', update);
  }

  /**
   * Handle memory query requests from other agents
   */
  handleMemoryQuery(query) {
    const { key, requestId, requester } = query;

    const entry = this.data.get(key);

    if (entry) {
      // Respond with the data
      this.broadcast('memory:response', {
        key,
        requestId,
        requester,
        value: entry.value,
        options: entry.options,
        respondent: process.pid,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Pattern matching for subscriptions
   */
  matchesPattern(key, pattern) {
    if (pattern === '*') return true;
    if (pattern === key) return true;

    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(key);
  }

  /**
   * Update performance metrics
   */
  updateMetrics(operation, latency, bytes) {
    // Update average latency using exponential moving average
    const alpha = 0.2;
    this.metrics.averageLatency = alpha * latency + (1 - alpha) * this.metrics.averageLatency;

    // Update peak latency
    if (latency > this.metrics.peakLatency) {
      this.metrics.peakLatency = latency;
    }

    // Update total bytes
    this.metrics.totalBytes += bytes;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      messagesPerSecond: this.metrics.messagesPublished / (Date.now() / 1000),
      averageThroughput: this.metrics.totalBytes / (Date.now() / 1000),
      communicationEnabled: this.communicationEnabled,
      subscribers: this.subscribers.size
    };
  }

  /**
   * Persist memory store to disk
   */
  async persist() {
    try {
      const dataObj = Object.fromEntries(this.data);
      await fs.writeFile(this.memoryFile, JSON.stringify(dataObj, null, 2));
    } catch (error) {
      console.warn(`⚠️  Communication memory persist warning: ${error.message}`);
    }
  }

  /**
   * Close communication bus and cleanup
   */
  async close() {
    await this.persist();

    if (this.communicationEnabled && this.communicationBus.close) {
      await this.communicationBus.close();
    }

    this.subscribers.clear();
    this.emit('close');
  }
}

/**
 * Communication-Integrated Post-Edit Hook
 * Extends the enhanced post-edit hook with real-time agent communication
 */
export async function communicationIntegratedPostEdit(file, memoryKey = null, options = {}) {
  const {
    enableCommunication = true,
    broadcastProgress = true,
    coordinateWithAgents = true,
    agentId = null,
    swarmId = null,
    ...enhancedOptions
  } = options;

  console.log('🚀 Communication-Integrated Post-Edit Hook Starting...');
  console.log(`📄 File: ${file}`);
  if (memoryKey) console.log(`💾 Memory key: ${memoryKey}`);
  if (agentId) console.log(`🤖 Agent ID: ${agentId}`);
  if (swarmId) console.log(`🐝 Swarm ID: ${swarmId}`);

  // Initialize communication memory store
  const commStore = new CommunicationMemoryStore({
    enableCommunication,
    enableZeroCopy: options.enableZeroCopy !== false,
    enableOptimizedSerialization: options.enableOptimizedSerialization !== false
  });

  await commStore.initialize();

  // Broadcast start event to swarm
  if (broadcastProgress) {
    await commStore.broadcast('agent:edit:start', {
      agentId,
      swarmId,
      file,
      memoryKey,
      timestamp: new Date().toISOString()
    });
  }

  // Subscribe to agent coordination events
  const subscriptions = [];
  if (coordinateWithAgents) {
    const subId = commStore.subscribe('agent:edit:*', (update) => {
      console.log(`📡 Received agent update: ${update.type}`);
    });
    subscriptions.push(subId);
  }

  try {
    // Run the enhanced post-edit hook
    const result = await enhancedPostEditHook(file, memoryKey, {
      returnStructured: true,
      ...enhancedOptions
    });

    // Store result in communication memory
    if (result.success) {
      await commStore.store(
        memoryKey || `edit:${result.editId}`,
        result,
        {
          namespace: 'communication-edits',
          metadata: {
            agentId,
            swarmId,
            file,
            timestamp: result.timestamp,
            passed: result.validation?.passed || false,
            coverage: result.coverage?.lines?.percentage || 0,
            tddPhase: result.tddPhase
          },
          broadcast: broadcastProgress
        }
      );
    }

    // Broadcast completion to swarm
    if (broadcastProgress) {
      await commStore.broadcast('agent:edit:complete', {
        agentId,
        swarmId,
        file,
        memoryKey,
        success: result.success,
        editId: result.editId,
        validation: result.validation?.passed || false,
        coverage: result.coverage?.lines?.percentage || 0,
        tddPhase: result.tddPhase,
        timestamp: new Date().toISOString()
      });
    }

    // Add communication metrics to result
    result.communication = {
      enabled: commStore.communicationEnabled,
      metrics: commStore.getMetrics(),
      subscribers: subscriptions.length
    };

    // Cleanup subscriptions
    subscriptions.forEach(subId => commStore.unsubscribe(subId));
    await commStore.close();

    return result;

  } catch (error) {
    console.error(`❌ Communication-integrated post-edit failed: ${error.message}`);

    // Broadcast failure to swarm
    if (broadcastProgress) {
      await commStore.broadcast('agent:edit:failed', {
        agentId,
        swarmId,
        file,
        memoryKey,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }

    // Cleanup
    subscriptions.forEach(subId => commStore.unsubscribe(subId));
    await commStore.close();

    throw error;
  }
}

/**
 * CLI interface for communication-integrated post-edit
 */
export async function cliMain() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(`
🚀 Communication-Integrated Post-Edit Pipeline - v3.0.0

Integrates ultra-fast communication system with enhanced post-edit pipeline
for real-time agent coordination and memory sharing.

Available commands:
  post-edit <file> [options]         Communication-integrated post-edit

Options:
  --memory-key <key>                 Store results with specific memory key
  --agent-id <id>                    Agent identifier for coordination
  --swarm-id <id>                    Swarm identifier for coordination
  --enable-communication             Enable ultra-fast communication (default: true)
  --broadcast-progress               Broadcast progress to swarm (default: true)
  --coordinate-with-agents           Coordinate with other agents (default: true)
  --enable-zero-copy                 Enable zero-copy structures (default: true)
  --enable-optimized-serialization   Enable optimized serialization (default: true)

  # Enhanced Post-Edit Options:
  --format                           Analyze formatting (default: true)
  --validate                         Run validation (default: true)
  --enable-tdd                       Enable TDD testing (default: true)
  --minimum-coverage <percent>       Minimum coverage threshold (default: 80)
  --block-on-critical               Block execution on critical errors
  --structured                       Return structured JSON data

Examples:
  node communication-integrated-post-edit.js post-edit src/app.js --agent-id "coder-1" --swarm-id "swarm-001"
  node communication-integrated-post-edit.js post-edit test.js --memory-key "swarm/tester/step-1" --structured

Features:
  ✅ Ultra-fast inter-agent communication (<1ms latency)
  ✅ Shared memory coordination for multi-agent workflows
  ✅ Real-time progress broadcasting to agent swarms
  ✅ Zero-copy data structures for performance
  ✅ Event-driven architecture for scalability
  ✅ TDD testing with single-file execution
  ✅ Real-time coverage analysis and diff reporting
  ✅ Advanced multi-language validation
  ✅ Actionable recommendations by category
    `);
    return;
  }

  if (command === 'post-edit') {
    const file = args[1];
    if (!file) {
      console.log('❌ File path required for post-edit hook');
      return;
    }

    // Parse options
    const options = {
      // Communication options
      enableCommunication: !args.includes('--no-communication'),
      broadcastProgress: !args.includes('--no-broadcast'),
      coordinateWithAgents: !args.includes('--no-coordinate'),
      enableZeroCopy: !args.includes('--no-zero-copy'),
      enableOptimizedSerialization: !args.includes('--no-optimized-serialization'),

      // Enhanced post-edit options
      format: !args.includes('--no-format'),
      validate: !args.includes('--no-validate'),
      generateRecommendations: !args.includes('--no-recommendations'),
      blockOnCritical: args.includes('--block-on-critical'),
      enableTDD: !args.includes('--no-tdd'),
      returnStructured: args.includes('--structured')
    };

    // Parse string options
    const parseOption = (flag) => {
      const index = args.indexOf(flag);
      return index >= 0 ? args[index + 1] : null;
    };

    options.agentId = parseOption('--agent-id');
    options.swarmId = parseOption('--swarm-id');
    const memoryKey = parseOption('--memory-key');

    const coverageValue = parseOption('--minimum-coverage');
    if (coverageValue) {
      options.minimumCoverage = parseInt(coverageValue) || 80;
    }

    try {
      const result = await communicationIntegratedPostEdit(file, memoryKey, options);

      if (options.returnStructured) {
        console.log(JSON.stringify(result, null, 2));
      }

      // Exit codes
      if (result.blocking) {
        process.exit(1);
      } else if (!result.success) {
        process.exit(2);
      }

    } catch (error) {
      console.error(`❌ Communication-integrated post-edit failed: ${error.message}`);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }

  } else {
    console.log(`❌ Unknown command: ${command}`);
    console.log('Use --help for available commands');
    process.exit(1);
  }
}

// Export for programmatic use
export { CommunicationMemoryStore };

// Run CLI if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cliMain().catch(error => {
    console.error(`💥 Fatal error: ${error.message}`);
    process.exit(1);
  });
}