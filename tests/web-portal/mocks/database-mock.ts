/**
 * @file Database Mock Implementation
 * @description Mock database implementations for transparency system testing
 */

import { EventEmitter } from 'events';

// Type definitions for mock database
export interface MockDatabase extends EventEmitter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(sql: string, params?: any[]): Promise<any>;
  transaction<T>(callback: (db: MockDatabase) => Promise<T>): Promise<T>;
  isConnected(): boolean;
}

export interface TransparencyDatabase extends MockDatabase {
  // Decision management
  storeDecision(decision: any): Promise<void>;
  getDecision(id: string): Promise<any>;
  getDecisions(filters?: any): Promise<any[]>;
  updateDecision(id: string, updates: any): Promise<void>;
  deleteDecision(id: string): Promise<void>;

  // Reasoning chain management
  storeReasoningChain(chain: any): Promise<void>;
  getReasoningChain(id: string): Promise<any>;
  getReasoningChains(filters?: any): Promise<any[]>;

  // Human intervention tracking
  storeIntervention(intervention: any): Promise<void>;
  getIntervention(id: string): Promise<any>;
  getInterventions(filters?: any): Promise<any[]>;

  // Agent status management
  updateAgentStatus(agentId: string, status: any): Promise<void>;
  getAgentStatus(agentId: string): Promise<any>;
  getAllAgentStatuses(): Promise<any[]>;

  // Performance metrics
  storeMetrics(metrics: any): Promise<void>;
  getMetrics(filters?: any): Promise<any[]>;

  // Cleanup and maintenance
  cleanup(retentionPolicy?: any): Promise<void>;
  backup(destination?: string): Promise<string>;
  restore(source: string): Promise<void>;
}

/**
 * Mock in-memory database implementation
 */
export class MockTransparencyDatabase extends EventEmitter implements TransparencyDatabase {
  private connected: boolean = false;
  private data: {
    decisions: Map<string, any>;
    reasoningChains: Map<string, any>;
    interventions: Map<string, any>;
    agentStatuses: Map<string, any>;
    metrics: any[];
  };

  constructor() {
    super();
    this.data = {
      decisions: new Map(),
      reasoningChains: new Map(),
      interventions: new Map(),
      agentStatuses: new Map(),
      metrics: []
    };
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    // Simulate connection delay
    await new Promise(resolve => setTimeout(resolve, 10));

    this.connected = true;
    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.connected = false;
    this.emit('disconnected');
  }

  isConnected(): boolean {
    return this.connected;
  }

  async query(sql: string, params?: any[]): Promise<any> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    // Simple SQL parser for basic operations
    const sqlLower = sql.toLowerCase().trim();

    if (sqlLower.startsWith('select')) {
      return this.handleSelect(sql, params);
    } else if (sqlLower.startsWith('insert')) {
      return this.handleInsert(sql, params);
    } else if (sqlLower.startsWith('update')) {
      return this.handleUpdate(sql, params);
    } else if (sqlLower.startsWith('delete')) {
      return this.handleDelete(sql, params);
    } else {
      throw new Error(`Unsupported SQL operation: ${sql}`);
    }
  }

  async transaction<T>(callback: (db: MockDatabase) => Promise<T>): Promise<T> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    // Create a transaction-scoped database instance
    const transactionDb = new MockTransparencyDatabase();
    transactionDb.connected = true;

    // Copy current data for rollback capability
    const backup = {
      decisions: new Map(this.data.decisions),
      reasoningChains: new Map(this.data.reasoningChains),
      interventions: new Map(this.data.interventions),
      agentStatuses: new Map(this.data.agentStatuses),
      metrics: [...this.data.metrics]
    };

    try {
      const result = await callback(transactionDb);

      // Commit transaction - merge changes
      this.data = transactionDb.data;

      return result;
    } catch (error) {
      // Rollback transaction
      this.data = backup;
      throw error;
    }
  }

  // Decision management methods
  async storeDecision(decision: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    const id = decision.id || this.generateId();
    const decisionWithTimestamp = {
      ...decision,
      id,
      createdAt: decision.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.decisions.set(id, decisionWithTimestamp);
    this.emit('decision_stored', decisionWithTimestamp);
  }

  async getDecision(id: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    return this.data.decisions.get(id) || null;
  }

  async getDecisions(filters: any = {}): Promise<any[]> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    let decisions = Array.from(this.data.decisions.values());

    // Apply filters
    if (filters.agentId) {
      decisions = decisions.filter(d => d.agentId === filters.agentId);
    }

    if (filters.category) {
      decisions = decisions.filter(d => d.category === filters.category);
    }

    if (filters.startTime && filters.endTime) {
      decisions = decisions.filter(d => {
        const timestamp = new Date(d.timestamp).getTime();
        return timestamp >= new Date(filters.startTime).getTime() &&
               timestamp <= new Date(filters.endTime).getTime();
      });
    }

    if (filters.timeRange) {
      const now = new Date();
      let startTime: Date;

      switch (filters.timeRange) {
        case 'last_24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'last_week':
          startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'last_month':
          startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(0);
      }

      decisions = decisions.filter(d =>
        new Date(d.timestamp || d.createdAt).getTime() >= startTime.getTime()
      );
    }

    // Sort by timestamp (newest first)
    decisions.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.createdAt).getTime();
      const timeB = new Date(b.timestamp || b.createdAt).getTime();
      return timeB - timeA;
    });

    return decisions;
  }

  async updateDecision(id: string, updates: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    const existing = this.data.decisions.get(id);
    if (!existing) {
      throw new Error(`Decision not found: ${id}`);
    }

    const updated = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.data.decisions.set(id, updated);
    this.emit('decision_updated', updated);
  }

  async deleteDecision(id: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    const deleted = this.data.decisions.delete(id);
    if (deleted) {
      this.emit('decision_deleted', id);
    }
  }

  // Reasoning chain management methods
  async storeReasoningChain(chain: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    const id = chain.id || this.generateId();
    const chainWithTimestamp = {
      ...chain,
      id,
      createdAt: chain.createdAt || new Date().toISOString()
    };

    this.data.reasoningChains.set(id, chainWithTimestamp);
    this.emit('reasoning_chain_stored', chainWithTimestamp);
  }

  async getReasoningChain(id: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    return this.data.reasoningChains.get(id) || null;
  }

  async getReasoningChains(filters: any = {}): Promise<any[]> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    let chains = Array.from(this.data.reasoningChains.values());

    if (filters.agentId) {
      chains = chains.filter(c => c.agentId === filters.agentId);
    }

    if (filters.taskId) {
      chains = chains.filter(c => c.taskId === filters.taskId);
    }

    return chains.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  // Human intervention tracking methods
  async storeIntervention(intervention: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    const id = intervention.id || this.generateId();
    const interventionWithTimestamp = {
      ...intervention,
      id,
      createdAt: intervention.createdAt || new Date().toISOString()
    };

    this.data.interventions.set(id, interventionWithTimestamp);
    this.emit('intervention_stored', interventionWithTimestamp);
  }

  async getIntervention(id: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    return this.data.interventions.get(id) || null;
  }

  async getInterventions(filters: any = {}): Promise<any[]> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    let interventions = Array.from(this.data.interventions.values());

    if (filters.agentId) {
      interventions = interventions.filter(i => i.agentId === filters.agentId);
    }

    if (filters.type) {
      interventions = interventions.filter(i => i.type === filters.type);
    }

    if (filters.timeRange) {
      const now = new Date();
      let startTime: Date;

      switch (filters.timeRange) {
        case 'last_24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(0);
      }

      interventions = interventions.filter(i =>
        new Date(i.requestTime || i.createdAt).getTime() >= startTime.getTime()
      );
    }

    return interventions.sort((a, b) =>
      new Date(b.requestTime || b.createdAt).getTime() -
      new Date(a.requestTime || a.createdAt).getTime()
    );
  }

  // Agent status management methods
  async updateAgentStatus(agentId: string, status: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    const statusWithTimestamp = {
      ...status,
      agentId,
      updatedAt: new Date().toISOString()
    };

    this.data.agentStatuses.set(agentId, statusWithTimestamp);
    this.emit('agent_status_updated', statusWithTimestamp);
  }

  async getAgentStatus(agentId: string): Promise<any> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    return this.data.agentStatuses.get(agentId) || null;
  }

  async getAllAgentStatuses(): Promise<any[]> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    return Array.from(this.data.agentStatuses.values())
      .sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }

  // Performance metrics methods
  async storeMetrics(metrics: any): Promise<void> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    const metricsWithTimestamp = {
      ...metrics,
      id: metrics.id || this.generateId(),
      timestamp: metrics.timestamp || new Date().toISOString()
    };

    this.data.metrics.push(metricsWithTimestamp);
    this.emit('metrics_stored', metricsWithTimestamp);
  }

  async getMetrics(filters: any = {}): Promise<any[]> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    let metrics = [...this.data.metrics];

    if (filters.type) {
      metrics = metrics.filter(m => m.type === filters.type);
    }

    if (filters.timeRange) {
      const now = new Date();
      let startTime: Date;

      switch (filters.timeRange) {
        case 'last_hour':
          startTime = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case 'last_24h':
          startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        default:
          startTime = new Date(0);
      }

      metrics = metrics.filter(m =>
        new Date(m.timestamp).getTime() >= startTime.getTime()
      );
    }

    return metrics.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  // Cleanup and maintenance methods
  async cleanup(retentionPolicy: any = {}): Promise<void> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    const now = new Date();
    const defaultRetention = {
      decisions: 30 * 24 * 60 * 60 * 1000, // 30 days
      reasoningChains: 14 * 24 * 60 * 60 * 1000, // 14 days
      interventions: 90 * 24 * 60 * 60 * 1000, // 90 days
      metrics: 7 * 24 * 60 * 60 * 1000 // 7 days
    };

    const retention = { ...defaultRetention, ...retentionPolicy };

    // Clean up old decisions
    for (const [id, decision] of this.data.decisions.entries()) {
      const age = now.getTime() - new Date(decision.createdAt).getTime();
      if (age > retention.decisions) {
        this.data.decisions.delete(id);
      }
    }

    // Clean up old reasoning chains
    for (const [id, chain] of this.data.reasoningChains.entries()) {
      const age = now.getTime() - new Date(chain.createdAt).getTime();
      if (age > retention.reasoningChains) {
        this.data.reasoningChains.delete(id);
      }
    }

    // Clean up old interventions
    for (const [id, intervention] of this.data.interventions.entries()) {
      const age = now.getTime() - new Date(intervention.createdAt).getTime();
      if (age > retention.interventions) {
        this.data.interventions.delete(id);
      }
    }

    // Clean up old metrics
    this.data.metrics = this.data.metrics.filter(metric => {
      const age = now.getTime() - new Date(metric.timestamp).getTime();
      return age <= retention.metrics;
    });

    this.emit('cleanup_completed', {
      decisionsRemained: this.data.decisions.size,
      reasoningChainsRemained: this.data.reasoningChains.size,
      interventionsRemained: this.data.interventions.size,
      metricsRemained: this.data.metrics.length
    });
  }

  async backup(destination?: string): Promise<string> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    const backupData = {
      timestamp: new Date().toISOString(),
      data: {
        decisions: Object.fromEntries(this.data.decisions),
        reasoningChains: Object.fromEntries(this.data.reasoningChains),
        interventions: Object.fromEntries(this.data.interventions),
        agentStatuses: Object.fromEntries(this.data.agentStatuses),
        metrics: this.data.metrics
      }
    };

    const backupId = `backup-${Date.now()}`;

    // In a real implementation, this would write to file system
    // For testing, we'll just store in memory
    (this as any).backups = (this as any).backups || new Map();
    (this as any).backups.set(backupId, backupData);

    this.emit('backup_created', { backupId, destination });

    return backupId;
  }

  async restore(source: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Database not connected');
    }

    const backups = (this as any).backups;
    if (!backups || !backups.has(source)) {
      throw new Error(`Backup not found: ${source}`);
    }

    const backupData = backups.get(source);

    this.data.decisions = new Map(Object.entries(backupData.data.decisions));
    this.data.reasoningChains = new Map(Object.entries(backupData.data.reasoningChains));
    this.data.interventions = new Map(Object.entries(backupData.data.interventions));
    this.data.agentStatuses = new Map(Object.entries(backupData.data.agentStatuses));
    this.data.metrics = backupData.data.metrics;

    this.emit('restore_completed', { source, timestamp: backupData.timestamp });
  }

  // Helper methods
  private handleSelect(sql: string, params?: any[]): any {
    // Basic SELECT implementation for common patterns
    return [];
  }

  private handleInsert(sql: string, params?: any[]): any {
    return { insertId: this.generateId(), affectedRows: 1 };
  }

  private handleUpdate(sql: string, params?: any[]): any {
    return { affectedRows: 1 };
  }

  private handleDelete(sql: string, params?: any[]): any {
    return { affectedRows: 1 };
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Test utilities
  public clearAllData(): void {
    this.data = {
      decisions: new Map(),
      reasoningChains: new Map(),
      interventions: new Map(),
      agentStatuses: new Map(),
      metrics: []
    };
    this.emit('data_cleared');
  }

  public getDataStats(): any {
    return {
      decisions: this.data.decisions.size,
      reasoningChains: this.data.reasoningChains.size,
      interventions: this.data.interventions.size,
      agentStatuses: this.data.agentStatuses.size,
      metrics: this.data.metrics.length
    };
  }

  public simulateError(operation: string): void {
    this.emit('error', new Error(`Simulated database error in ${operation}`));
  }
}

/**
 * Factory function to create mock database instances
 */
export function createMockDatabase(): TransparencyDatabase {
  return new MockTransparencyDatabase();
}

/**
 * Factory function to create connected mock database instances
 */
export async function createConnectedMockDatabase(): Promise<TransparencyDatabase> {
  const db = new MockTransparencyDatabase();
  await db.connect();
  return db;
}