/**
 * CRDT Verification Coordinator
 * Manages conflict-free verification state across distributed consensus agents
 */

import { VerificationCRDT, VerificationReport, GCounter, ORSet } from '../crdt/types.js';
import { EventEmitter } from 'events';

export interface CoordinatorConfig {
  nodeId: string;
  replicationGroup: string[];
  syncInterval: number;
  maxRetries: number;
  enablePersistence: boolean;
  memoryBackend: 'sqlite' | 'redis' | 'memory';
}

export interface NetworkPartition {
  partitionId: string;
  nodes: string[];
  startTime: number;
  endTime?: number;
}

export interface ConflictResolutionStrategy {
  name: string;
  resolve: (reports: VerificationReport[]) => VerificationReport;
  priority: number;
}

export class CRDTVerificationCoordinator extends EventEmitter {
  private readonly config: CoordinatorConfig;
  private readonly verificationStates: Map<string, VerificationCRDT>;
  private readonly consensusMetrics: GCounter;
  private readonly activeConflicts: ORSet<string>;
  private readonly networkPartitions: Map<string, NetworkPartition>;
  private readonly resolutionStrategies: Map<string, ConflictResolutionStrategy>;
  private readonly syncQueue: Map<string, VerificationReport[]>;
  private syncTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor(config: CoordinatorConfig) {
    super();
    this.config = config;
    this.verificationStates = new Map();
    this.consensusMetrics = new GCounter(config.nodeId, config.replicationGroup);
    this.activeConflicts = new ORSet<string>(config.nodeId);
    this.networkPartitions = new Map();
    this.resolutionStrategies = new Map();
    this.syncQueue = new Map();

    this.initializeResolutionStrategies();
    this.startSyncProcess();

    // Graceful shutdown handling
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Initialize built-in conflict resolution strategies
   */
  private initializeResolutionStrategies(): void {
    // Majority consensus strategy
    this.resolutionStrategies.set('majority', {
      name: 'majority',
      priority: 1,
      resolve: (reports: VerificationReport[]): VerificationReport => {
        const statusCounts = new Map<string, number>();

        for (const report of reports) {
          const count = statusCounts.get(report.status) || 0;
          statusCounts.set(report.status, count + 1);
        }

        const majority = Array.from(statusCounts.entries())
          .sort((a, b) => b[1] - a[1])[0];

        const majorityReports = reports.filter(r => r.status === majority[0]);
        return this.mergeReports(majorityReports);
      }
    });

    // Performance-weighted strategy
    this.resolutionStrategies.set('performance', {
      name: 'performance',
      priority: 2,
      resolve: (reports: VerificationReport[]): VerificationReport => {
        // Weight by performance metrics
        const weighted = reports.map(report => {
          const performanceScore = report.metrics.get('performance_score') || 0;
          const reliability = report.metadata.agent_reliability || 1.0;
          return { report, weight: performanceScore * reliability };
        });

        weighted.sort((a, b) => b.weight - a.weight);

        // Take top 50% by weight
        const topHalf = weighted.slice(0, Math.ceil(weighted.length / 2));
        return this.mergeReports(topHalf.map(w => w.report));
      }
    });

    // Latest timestamp strategy
    this.resolutionStrategies.set('latest', {
      name: 'latest',
      priority: 3,
      resolve: (reports: VerificationReport[]): VerificationReport => {
        const sorted = reports.sort((a, b) => b.timestamp - a.timestamp);
        return sorted[0];
      }
    });
  }

  /**
   * Process verification report from consensus agent
   */
  async processVerificationReport(report: VerificationReport): Promise<void> {
    try {
      const stateKey = `${report.agentId}-${report.nodeId}`;

      // Get or create CRDT state
      let crdtState = this.verificationStates.get(stateKey);
      if (!crdtState) {
        crdtState = new VerificationCRDT(this.config.nodeId, report);
        this.verificationStates.set(stateKey, crdtState);
      } else {
        // Create temporary CRDT from report and merge
        const tempCRDT = new VerificationCRDT(report.nodeId, report);
        const changed = crdtState.merge(tempCRDT);

        if (changed) {
          this.emit('state-updated', { stateKey, report: crdtState.toReport() });
        }
      }

      // Detect conflicts
      await this.detectAndTrackConflicts(report);

      // Update consensus metrics
      this.consensusMetrics.increment(1);

      // Queue for synchronization
      this.queueForSync(report);

      // Store hooks coordination
      await this.executeHooks('post-edit', {
        file: `verification-state-${stateKey}`,
        memoryKey: `crdt-verification/state/${stateKey}`,
        report: crdtState.toReport()
      });

      this.emit('report-processed', report);

    } catch (error) {
      this.emit('error', { error, report });
      throw error;
    }
  }

  /**
   * Merge multiple conflicting verification reports
   */
  async mergeConflictingReports(reports: VerificationReport[]): Promise<VerificationReport> {
    if (reports.length === 0) {
      throw new Error('No reports to merge');
    }

    if (reports.length === 1) {
      return reports[0];
    }

    try {
      // Group reports by conflict type
      const conflictGroups = this.groupReportsByConflict(reports);
      const resolvedReports: VerificationReport[] = [];

      for (const [conflictType, groupReports] of conflictGroups) {
        const strategy = this.selectResolutionStrategy(conflictType, groupReports);
        const resolved = strategy.resolve(groupReports);
        resolvedReports.push(resolved);
      }

      // Final merge of all resolved reports
      const finalMerged = this.mergeReports(resolvedReports);

      // Track the merge operation
      this.activeConflicts.add(`merge-${Date.now()}-${reports.length}`);

      this.emit('reports-merged', { original: reports, merged: finalMerged });

      return finalMerged;

    } catch (error) {
      this.emit('merge-error', { error, reports });
      throw error;
    }
  }

  /**
   * Synchronize verification state across distributed nodes
   */
  async synchronizeWithNodes(targetNodes?: string[]): Promise<void> {
    const nodes = targetNodes || this.config.replicationGroup.filter(n => n !== this.config.nodeId);
    const syncPromises: Promise<void>[] = [];

    for (const node of nodes) {
      syncPromises.push(this.synchronizeWithNode(node));
    }

    try {
      await Promise.allSettled(syncPromises);
      this.emit('sync-completed', { nodes, timestamp: Date.now() });
    } catch (error) {
      this.emit('sync-error', { error, nodes });
      throw error;
    }
  }

  /**
   * Synchronize with a specific node
   */
  private async synchronizeWithNode(nodeId: string): Promise<void> {
    if (this.isShuttingDown) return;

    try {
      // Get states to sync
      const statesToSync = Array.from(this.verificationStates.entries())
        .map(([key, state]) => ({ key, serialized: state.serialize() }));

      // Send sync request (implementation depends on transport layer)
      const syncResult = await this.sendSyncRequest(nodeId, {
        type: 'CRDT_SYNC_REQUEST',
        sender: this.config.nodeId,
        timestamp: Date.now(),
        states: statesToSync
      });

      if (syncResult.success && syncResult.states) {
        // Merge received states
        for (const { key, serialized } of syncResult.states) {
          const receivedState = VerificationCRDT.deserialize(serialized);
          const localState = this.verificationStates.get(key);

          if (localState) {
            localState.merge(receivedState);
          } else {
            this.verificationStates.set(key, receivedState);
          }
        }
      }

      this.emit('node-synced', { nodeId, success: syncResult.success });

    } catch (error) {
      this.emit('node-sync-error', { nodeId, error });

      // Track network partition
      this.trackNetworkPartition(nodeId);
    }
  }

  /**
   * Handle agent termination and resource cleanup
   */
  async handleAgentTermination(agentId: string, nodeId: string): Promise<void> {
    try {
      const stateKey = `${agentId}-${nodeId}`;
      const state = this.verificationStates.get(stateKey);

      if (state) {
        // Final sync before cleanup
        await this.synchronizeWithNodes();

        // Store final state persistently if enabled
        if (this.config.enablePersistence) {
          await this.persistState(stateKey, state);
        }

        // Mark conflicts as resolved
        const conflicts = Array.from(this.activeConflicts.values());
        const agentConflicts = conflicts.filter(c => c.includes(agentId));

        for (const conflict of agentConflicts) {
          this.activeConflicts.remove(conflict);
        }

        // Clean up local state
        this.verificationStates.delete(stateKey);

        // Clear sync queue for this agent
        this.syncQueue.delete(agentId);

        this.emit('agent-terminated', { agentId, nodeId, cleanedUp: true });
      }

    } catch (error) {
      this.emit('cleanup-error', { agentId, nodeId, error });
      throw error;
    }
  }

  /**
   * Resolve performance benchmark conflicts using CRDT semantics
   */
  async resolveBenchmarkConflicts(benchmarkResults: Map<string, any[]>): Promise<Map<string, any>> {
    const resolved = new Map<string, any>();

    for (const [benchmark, results] of benchmarkResults) {
      try {
        if (results.length === 1) {
          resolved.set(benchmark, results[0]);
          continue;
        }

        // Create CRDTs for numeric metrics
        const metricCRDTs = new Map<string, GCounter>();
        const metadataCRDTs = new Map<string, ORSet<any>>();

        for (const result of results) {
          // Handle numeric metrics with G-Counter
          for (const [metric, value] of Object.entries(result.metrics || {})) {
            if (typeof value === 'number') {
              if (!metricCRDTs.has(metric)) {
                metricCRDTs.set(metric, new GCounter(this.config.nodeId, this.config.replicationGroup));
              }
              metricCRDTs.get(metric)!.increment(value);
            }
          }

          // Handle metadata with OR-Set
          for (const [key, value] of Object.entries(result.metadata || {})) {
            if (!metadataCRDTs.has(key)) {
              metadataCRDTs.set(key, new ORSet<any>(this.config.nodeId));
            }
            metadataCRDTs.get(key)!.add(value);
          }
        }

        // Aggregate results
        const aggregated: any = {
          benchmark,
          timestamp: Date.now(),
          metrics: {},
          metadata: {},
          resolved_conflicts: results.length - 1
        };

        // Average numeric metrics
        for (const [metric, counter] of metricCRDTs) {
          aggregated.metrics[metric] = counter.value() / results.length;
        }

        // Union metadata sets
        for (const [key, orSet] of metadataCRDTs) {
          aggregated.metadata[key] = Array.from(orSet.values());
        }

        resolved.set(benchmark, aggregated);

        // Track conflict resolution
        this.activeConflicts.add(`benchmark-${benchmark}-${Date.now()}`);

      } catch (error) {
        this.emit('benchmark-resolution-error', { benchmark, error });
        // Fallback to latest result
        resolved.set(benchmark, results[results.length - 1]);
      }
    }

    return resolved;
  }

  /**
   * Get current verification status across all nodes
   */
  getVerificationStatus(): {
    totalStates: number;
    activeConflicts: number;
    consensusMetrics: number;
    networkPartitions: number;
    lastSync: number;
  } {
    return {
      totalStates: this.verificationStates.size,
      activeConflicts: this.activeConflicts.values().size,
      consensusMetrics: this.consensusMetrics.value(),
      networkPartitions: this.networkPartitions.size,
      lastSync: Date.now() // Would track actual last sync
    };
  }

  /**
   * Graceful shutdown with state persistence
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;

    try {
      // Stop sync timer
      if (this.syncTimer) {
        clearInterval(this.syncTimer);
      }

      // Final synchronization
      await this.synchronizeWithNodes();

      // Persist all states if enabled
      if (this.config.enablePersistence) {
        const persistPromises = Array.from(this.verificationStates.entries())
          .map(([key, state]) => this.persistState(key, state));

        await Promise.allSettled(persistPromises);
      }

      // Execute shutdown hooks
      await this.executeHooks('session-end', {
        exportMetrics: true,
        finalStatus: this.getVerificationStatus()
      });

      this.emit('shutdown-complete');

    } catch (error) {
      this.emit('shutdown-error', error);
      throw error;
    }
  }

  // Private helper methods
  private async detectAndTrackConflicts(report: VerificationReport): Promise<void> {
    // Implementation for conflict detection logic
    const existingStates = Array.from(this.verificationStates.values());
    const conflicts: string[] = [];

    for (const state of existingStates) {
      const existingReport = state.toReport();
      if (this.hasConflict(report, existingReport)) {
        const conflictId = `${report.agentId}-${existingReport.agentId}-${Date.now()}`;
        conflicts.push(conflictId);
        this.activeConflicts.add(conflictId);
      }
    }

    if (conflicts.length > 0) {
      this.emit('conflicts-detected', { report, conflicts });
    }
  }

  private hasConflict(report1: VerificationReport, report2: VerificationReport): boolean {
    // Simple conflict detection: same test, different results
    return report1.id !== report2.id &&
           report1.status !== report2.status &&
           this.haveSameTarget(report1, report2);
  }

  private haveSameTarget(report1: VerificationReport, report2: VerificationReport): boolean {
    // Check if reports target the same verification subject
    return report1.metadata.target === report2.metadata.target ||
           report1.metadata.testSuite === report2.metadata.testSuite;
  }

  private groupReportsByConflict(reports: VerificationReport[]): Map<string, VerificationReport[]> {
    const groups = new Map<string, VerificationReport[]>();

    for (const report of reports) {
      for (const conflict of report.conflicts) {
        if (!groups.has(conflict)) {
          groups.set(conflict, []);
        }
        groups.get(conflict)!.push(report);
      }
    }

    return groups;
  }

  private selectResolutionStrategy(conflictType: string, reports: VerificationReport[]): ConflictResolutionStrategy {
    // Select strategy based on conflict type and context
    const strategies = Array.from(this.resolutionStrategies.values())
      .sort((a, b) => a.priority - b.priority);

    if (conflictType.includes('performance')) {
      return this.resolutionStrategies.get('performance')!;
    }

    if (reports.length >= this.config.replicationGroup.length / 2) {
      return this.resolutionStrategies.get('majority')!;
    }

    return strategies[0]; // Default to highest priority
  }

  private mergeReports(reports: VerificationReport[]): VerificationReport {
    if (reports.length === 1) return reports[0];

    const merged: VerificationReport = {
      id: `merged-${Date.now()}`,
      agentId: 'coordinator',
      nodeId: this.config.nodeId,
      timestamp: Date.now(),
      status: 'partial',
      metrics: new Map(),
      conflicts: [],
      metadata: {}
    };

    // Merge status (majority wins)
    const statusCounts = new Map<string, number>();
    reports.forEach(r => {
      statusCounts.set(r.status, (statusCounts.get(r.status) || 0) + 1);
    });

    merged.status = Array.from(statusCounts.entries())
      .sort((a, b) => b[1] - a[1])[0][0] as any;

    // Merge metrics (sum)
    reports.forEach(r => {
      for (const [key, value] of r.metrics) {
        merged.metrics.set(key, (merged.metrics.get(key) || 0) + value);
      }
    });

    // Merge conflicts (union)
    const allConflicts = new Set<string>();
    reports.forEach(r => r.conflicts.forEach(c => allConflicts.add(c)));
    merged.conflicts = Array.from(allConflicts);

    // Merge metadata (latest wins for each key)
    reports.sort((a, b) => b.timestamp - a.timestamp);
    reports.forEach(r => {
      Object.assign(merged.metadata, r.metadata);
    });

    return merged;
  }

  private queueForSync(report: VerificationReport): void {
    if (!this.syncQueue.has(report.agentId)) {
      this.syncQueue.set(report.agentId, []);
    }
    this.syncQueue.get(report.agentId)!.push(report);
  }

  private startSyncProcess(): void {
    this.syncTimer = setInterval(async () => {
      if (!this.isShuttingDown) {
        try {
          await this.synchronizeWithNodes();
        } catch (error) {
          this.emit('sync-timer-error', error);
        }
      }
    }, this.config.syncInterval);
  }

  private async sendSyncRequest(nodeId: string, request: any): Promise<any> {
    // Mock implementation - in real system would use network transport
    return {
      success: true,
      states: [],
      timestamp: Date.now()
    };
  }

  private trackNetworkPartition(nodeId: string): void {
    const partitionId = `partition-${nodeId}-${Date.now()}`;
    this.networkPartitions.set(partitionId, {
      partitionId,
      nodes: [this.config.nodeId, nodeId],
      startTime: Date.now()
    });
  }

  private async persistState(key: string, state: VerificationCRDT): Promise<void> {
    // Implementation depends on chosen backend
    const serialized = state.serialize();
    await this.executeHooks('persist-state', { key, state: serialized });
  }

  private async executeHooks(hookType: string, data: any): Promise<void> {
    try {
      // Execute Claude Flow hooks for coordination
      const hookCommand = `npx claude-flow@alpha hooks ${hookType}`;
      // Would execute actual hook command here
      this.emit('hooks-executed', { hookType, data });
    } catch (error) {
      this.emit('hooks-error', { hookType, error });
    }
  }
}