/**
 * Memory Manager for CRDT Verification System
 * Handles persistence, cleanup, and distributed state management
 */

import { VerificationCRDT, VerificationReport } from '../crdt/types.js';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface MemoryConfig {
  backend: 'sqlite' | 'redis' | 'memory';
  persistence: {
    enabled: boolean;
    directory: string;
    maxSize: number; // MB
    ttl: number; // seconds
    compressionEnabled: boolean;
  };
  cleanup: {
    agentTimeout: number; // seconds
    stateRetention: number; // seconds
    orphanCleanupInterval: number; // seconds
    memoryThreshold: number; // percentage
  };
  synchronization: {
    batchSize: number;
    maxRetries: number;
    backoffMultiplier: number;
    conflictBufferSize: number;
  };
}

export interface MemoryStats {
  totalStates: number;
  persistedStates: number;
  memoryUsage: number;
  diskUsage: number;
  cleanupOperations: number;
  lastCleanup: number;
  activeAgents: number;
  orphanedStates: number;
}

export interface BackupMetadata {
  backupId: string;
  timestamp: number;
  nodeId: string;
  stateCount: number;
  size: number;
  checksum: string;
}

export class CRDTMemoryManager extends EventEmitter {
  private readonly config: MemoryConfig;
  private readonly nodeId: string;
  private readonly memoryStore: Map<string, VerificationCRDT>;
  private readonly agentRegistry: Map<string, { lastSeen: number; nodeId: string }>;
  private readonly persistenceQueue: Map<string, VerificationCRDT>;
  private readonly cleanupQueue: Set<string>;
  private readonly backupHistory: Map<string, BackupMetadata>;

  private cleanupTimer: NodeJS.Timeout | null = null;
  private statsCollector: NodeJS.Timeout | null = null;
  private isShuttingDown = false;
  private currentStats: MemoryStats;

  constructor(nodeId: string, config: MemoryConfig) {
    super();
    this.nodeId = nodeId;
    this.config = config;
    this.memoryStore = new Map();
    this.agentRegistry = new Map();
    this.persistenceQueue = new Map();
    this.cleanupQueue = new Set();
    this.backupHistory = new Map();

    this.currentStats = {
      totalStates: 0,
      persistedStates: 0,
      memoryUsage: 0,
      diskUsage: 0,
      cleanupOperations: 0,
      lastCleanup: 0,
      activeAgents: 0,
      orphanedStates: 0
    };

    this.initialize();
  }

  /**
   * Initialize memory manager
   */
  private async initialize(): Promise<void> {
    try {
      // Ensure persistence directory exists
      if (this.config.persistence.enabled) {
        await fs.mkdir(this.config.persistence.directory, { recursive: true });
      }

      // Start cleanup process
      this.startCleanupProcess();

      // Start stats collection
      this.startStatsCollection();

      // Register agent for this node
      this.registerAgent(this.nodeId, this.nodeId);

      this.emit('initialized', { nodeId: this.nodeId });

    } catch (error) {
      this.emit('initialization-error', error);
      throw error;
    }
  }

  /**
   * Store verification state in memory
   */
  async storeState(key: string, state: VerificationCRDT): Promise<void> {
    try {
      // Store in memory
      this.memoryStore.set(key, state);

      // Update agent registry
      this.registerAgent(state.nodeId, state.nodeId);

      // Queue for persistence if enabled
      if (this.config.persistence.enabled) {
        this.persistenceQueue.set(key, state);
        await this.processPersistenceQueue();
      }

      // Check memory pressure
      await this.checkMemoryPressure();

      this.emit('state-stored', { key, nodeId: state.nodeId });

    } catch (error) {
      this.emit('storage-error', { key, error });
      throw error;
    }
  }

  /**
   * Retrieve verification state from memory
   */
  async getState(key: string): Promise<VerificationCRDT | null> {
    try {
      // Try memory first
      let state = this.memoryStore.get(key);

      if (!state && this.config.persistence.enabled) {
        // Try loading from persistence
        state = await this.loadFromPersistence(key);
        if (state) {
          this.memoryStore.set(key, state);
        }
      }

      if (state) {
        this.emit('state-retrieved', { key, source: state ? 'memory' : 'persistence' });
      }

      return state || null;

    } catch (error) {
      this.emit('retrieval-error', { key, error });
      throw error;
    }
  }

  /**
   * Register agent activity
   */
  registerAgent(agentId: string, nodeId: string): void {
    this.agentRegistry.set(agentId, {
      lastSeen: Date.now(),
      nodeId: nodeId
    });

    this.emit('agent-registered', { agentId, nodeId });
  }

  /**
   * Handle agent termination
   */
  async handleAgentTermination(agentId: string): Promise<void> {
    try {
      const agentInfo = this.agentRegistry.get(agentId);
      if (!agentInfo) {
        this.emit('agent-not-found', { agentId });
        return;
      }

      // Find all states for this agent
      const agentStates = Array.from(this.memoryStore.entries())
        .filter(([key]) => key.includes(agentId));

      // Persist final states before cleanup
      if (this.config.persistence.enabled) {
        for (const [key, state] of agentStates) {
          await this.persistState(key, state);
        }
      }

      // Create final backup
      await this.createAgentBackup(agentId, agentStates.map(([_, state]) => state));

      // Schedule cleanup
      for (const [key] of agentStates) {
        this.cleanupQueue.add(key);
      }

      // Remove from registry
      this.agentRegistry.delete(agentId);

      this.emit('agent-terminated', {
        agentId,
        statesCount: agentStates.length,
        cleanupScheduled: true
      });

    } catch (error) {
      this.emit('termination-error', { agentId, error });
      throw error;
    }
  }

  /**
   * Synchronize state across distributed nodes
   */
  async synchronizeStates(nodeIds: string[], states?: Map<string, VerificationCRDT>): Promise<void> {
    try {
      const statesToSync = states || this.memoryStore;
      const syncBatches = this.createSyncBatches(statesToSync);

      for (const nodeId of nodeIds) {
        if (nodeId === this.nodeId) continue;

        for (const batch of syncBatches) {
          await this.syncBatchToNode(nodeId, batch);
        }
      }

      this.emit('states-synchronized', {
        nodeIds,
        statesCount: statesToSync.size,
        batchCount: syncBatches.length
      });

    } catch (error) {
      this.emit('sync-error', { nodeIds, error });
      throw error;
    }
  }

  /**
   * Validate resource cleanup after agent termination
   */
  async validateCleanup(): Promise<{
    orphanedStates: string[];
    memoryLeaks: string[];
    persistenceIssues: string[];
    cleanupSuccess: boolean;
  }> {
    try {
      const validation = {
        orphanedStates: [] as string[],
        memoryLeaks: [] as string[],
        persistenceIssues: [] as string[],
        cleanupSuccess: true
      };

      // Check for orphaned states
      const activeAgents = new Set(this.agentRegistry.keys());

      for (const [key, state] of this.memoryStore) {
        if (!activeAgents.has(state.nodeId)) {
          const age = Date.now() - state.timestamp;
          if (age > this.config.cleanup.agentTimeout * 1000) {
            validation.orphanedStates.push(key);
          }
        }
      }

      // Check memory usage patterns
      const memoryUsage = this.calculateMemoryUsage();
      if (memoryUsage.percentage > this.config.cleanup.memoryThreshold) {
        validation.memoryLeaks.push(`High memory usage: ${memoryUsage.percentage}%`);
        validation.cleanupSuccess = false;
      }

      // Validate persistence consistency
      if (this.config.persistence.enabled) {
        const persistenceValidation = await this.validatePersistence();
        validation.persistenceIssues = persistenceValidation.issues;
        if (persistenceValidation.issues.length > 0) {
          validation.cleanupSuccess = false;
        }
      }

      this.emit('cleanup-validated', validation);
      return validation;

    } catch (error) {
      this.emit('validation-error', error);
      throw error;
    }
  }

  /**
   * Create backup of current state
   */
  async createBackup(): Promise<BackupMetadata> {
    try {
      const backupId = `backup-${this.nodeId}-${Date.now()}`;
      const backupPath = path.join(this.config.persistence.directory, `${backupId}.json`);

      const backupData = {
        nodeId: this.nodeId,
        timestamp: Date.now(),
        states: Array.from(this.memoryStore.entries()).map(([key, state]) => ({
          key,
          state: state.serialize()
        })),
        agentRegistry: Array.from(this.agentRegistry.entries()),
        stats: this.currentStats
      };

      const serialized = JSON.stringify(backupData);

      if (this.config.persistence.compressionEnabled) {
        // Would implement compression here
      }

      await fs.writeFile(backupPath, serialized);

      const stats = await fs.stat(backupPath);
      const metadata: BackupMetadata = {
        backupId,
        timestamp: Date.now(),
        nodeId: this.nodeId,
        stateCount: this.memoryStore.size,
        size: stats.size,
        checksum: this.calculateChecksum(serialized)
      };

      this.backupHistory.set(backupId, metadata);
      this.emit('backup-created', metadata);

      return metadata;

    } catch (error) {
      this.emit('backup-error', error);
      throw error;
    }
  }

  /**
   * Restore from backup
   */
  async restoreFromBackup(backupId: string): Promise<void> {
    try {
      const metadata = this.backupHistory.get(backupId);
      if (!metadata) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      const backupPath = path.join(this.config.persistence.directory, `${backupId}.json`);
      const backupData = JSON.parse(await fs.readFile(backupPath, 'utf-8'));

      // Validate checksum
      const checksum = this.calculateChecksum(JSON.stringify(backupData));
      if (checksum !== metadata.checksum) {
        throw new Error('Backup corruption detected');
      }

      // Clear current state
      this.memoryStore.clear();
      this.agentRegistry.clear();

      // Restore states
      for (const { key, state } of backupData.states) {
        const restoredState = VerificationCRDT.deserialize(state);
        this.memoryStore.set(key, restoredState);
      }

      // Restore agent registry
      for (const [agentId, info] of backupData.agentRegistry) {
        this.agentRegistry.set(agentId, info);
      }

      this.emit('backup-restored', { backupId, statesCount: this.memoryStore.size });

    } catch (error) {
      this.emit('restore-error', { backupId, error });
      throw error;
    }
  }

  /**
   * Get current memory statistics
   */
  getStats(): MemoryStats {
    return { ...this.currentStats };
  }

  /**
   * Shutdown memory manager gracefully
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;

    try {
      // Stop timers
      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
      }
      if (this.statsCollector) {
        clearInterval(this.statsCollector);
      }

      // Final persistence
      if (this.config.persistence.enabled) {
        await this.processPersistenceQueue();
      }

      // Create final backup
      await this.createBackup();

      // Final cleanup validation
      await this.validateCleanup();

      this.emit('shutdown-complete');

    } catch (error) {
      this.emit('shutdown-error', error);
      throw error;
    }
  }

  // Private helper methods
  private startCleanupProcess(): void {
    this.cleanupTimer = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.performCleanup();
      }
    }, this.config.cleanup.orphanCleanupInterval * 1000);
  }

  private startStatsCollection(): void {
    this.statsCollector = setInterval(() => {
      this.updateStats();
    }, 30000); // Update every 30 seconds
  }

  private async performCleanup(): Promise<void> {
    try {
      const now = Date.now();
      const cleanedKeys: string[] = [];

      // Clean orphaned states
      for (const [key, state] of this.memoryStore) {
        const age = now - state.timestamp;
        const isOrphaned = !this.agentRegistry.has(state.nodeId) &&
                          age > this.config.cleanup.agentTimeout * 1000;

        if (isOrphaned || this.cleanupQueue.has(key)) {
          this.memoryStore.delete(key);
          this.cleanupQueue.delete(key);
          cleanedKeys.push(key);
        }
      }

      // Clean old agent registry entries
      for (const [agentId, info] of this.agentRegistry) {
        const age = now - info.lastSeen;
        if (age > this.config.cleanup.agentTimeout * 1000) {
          this.agentRegistry.delete(agentId);
        }
      }

      if (cleanedKeys.length > 0) {
        this.currentStats.cleanupOperations++;
        this.currentStats.lastCleanup = now;
        this.emit('cleanup-performed', { cleanedKeys, count: cleanedKeys.length });
      }

    } catch (error) {
      this.emit('cleanup-error', error);
    }
  }

  private async processPersistenceQueue(): Promise<void> {
    const batchSize = Math.min(this.persistenceQueue.size, this.config.synchronization.batchSize);
    const entries = Array.from(this.persistenceQueue.entries()).slice(0, batchSize);

    for (const [key, state] of entries) {
      try {
        await this.persistState(key, state);
        this.persistenceQueue.delete(key);
        this.currentStats.persistedStates++;
      } catch (error) {
        this.emit('persistence-error', { key, error });
      }
    }
  }

  private async persistState(key: string, state: VerificationCRDT): Promise<void> {
    const filePath = path.join(this.config.persistence.directory, `${key}.json`);
    const serialized = JSON.stringify(state.serialize());
    await fs.writeFile(filePath, serialized);
  }

  private async loadFromPersistence(key: string): Promise<VerificationCRDT | null> {
    try {
      const filePath = path.join(this.config.persistence.directory, `${key}.json`);
      const data = JSON.parse(await fs.readFile(filePath, 'utf-8'));
      return VerificationCRDT.deserialize(data);
    } catch {
      return null;
    }
  }

  private async checkMemoryPressure(): Promise<void> {
    const usage = this.calculateMemoryUsage();
    if (usage.percentage > this.config.cleanup.memoryThreshold) {
      await this.performCleanup();
      this.emit('memory-pressure-detected', usage);
    }
  }

  private calculateMemoryUsage(): { bytes: number; percentage: number } {
    const used = process.memoryUsage();
    const totalMB = this.config.persistence.maxSize;
    const usedMB = used.heapUsed / 1024 / 1024;

    return {
      bytes: used.heapUsed,
      percentage: (usedMB / totalMB) * 100
    };
  }

  private createSyncBatches(states: Map<string, VerificationCRDT>): Array<Map<string, VerificationCRDT>> {
    const batches: Array<Map<string, VerificationCRDT>> = [];
    const entries = Array.from(states.entries());

    for (let i = 0; i < entries.length; i += this.config.synchronization.batchSize) {
      const batch = new Map(entries.slice(i, i + this.config.synchronization.batchSize));
      batches.push(batch);
    }

    return batches;
  }

  private async syncBatchToNode(nodeId: string, batch: Map<string, VerificationCRDT>): Promise<void> {
    // Mock implementation - would use actual network transport
    this.emit('batch-synced', { nodeId, batchSize: batch.size });
  }

  private async createAgentBackup(agentId: string, states: VerificationCRDT[]): Promise<void> {
    const backupPath = path.join(this.config.persistence.directory, `agent-${agentId}-${Date.now()}.json`);
    const backupData = {
      agentId,
      timestamp: Date.now(),
      states: states.map(s => s.serialize())
    };

    await fs.writeFile(backupPath, JSON.stringify(backupData));
  }

  private async validatePersistence(): Promise<{ issues: string[] }> {
    const issues: string[] = [];

    try {
      const files = await fs.readdir(this.config.persistence.directory);
      const stateFiles = files.filter(f => f.endsWith('.json') && !f.startsWith('backup-'));

      for (const file of stateFiles) {
        try {
          const content = await fs.readFile(path.join(this.config.persistence.directory, file), 'utf-8');
          JSON.parse(content);
        } catch {
          issues.push(`Corrupted persistence file: ${file}`);
        }
      }

    } catch (error) {
      issues.push(`Persistence validation failed: ${error}`);
    }

    return { issues };
  }

  private calculateChecksum(data: string): string {
    // Simple hash implementation - would use crypto in production
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private updateStats(): void {
    this.currentStats = {
      totalStates: this.memoryStore.size,
      persistedStates: this.currentStats.persistedStates,
      memoryUsage: this.calculateMemoryUsage().bytes,
      diskUsage: 0, // Would calculate actual disk usage
      cleanupOperations: this.currentStats.cleanupOperations,
      lastCleanup: this.currentStats.lastCleanup,
      activeAgents: this.agentRegistry.size,
      orphanedStates: this.cleanupQueue.size
    };
  }
}