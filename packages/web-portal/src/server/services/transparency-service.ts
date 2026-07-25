/**
 * Transparency Service
 *
 * Business logic layer for TransparencySystem integration
 * Implements caching layer for performance optimization
 */

import NodeCache from 'node-cache';
import { TransparencySystem } from '../../../../../src/coordination/shared/transparency/transparency-system.js';
import type {
  AgentHierarchyNode,
  AgentStatus,
  AgentLifecycleEvent,
  TransparencyMetrics,
  TransparencyEventListener,
} from '../../../../../src/coordination/shared/transparency/interfaces/transparency-system.js';

/**
 * Singleton transparency service instance
 */
class TransparencyService {
  private transparencySystem: TransparencySystem | null = null;
  private cache: NodeCache;
  private eventCallbacks: Set<(event: AgentLifecycleEvent) => void> = new Set();

  constructor() {
    // Initialize cache with different TTLs for different data types
    this.cache = new NodeCache({
      stdTTL: 30, // Default 30 seconds for hierarchy
      checkperiod: 10, // Check for expired keys every 10 seconds
      useClones: false, // Performance optimization
    });
  }

  /**
   * Initialize transparency system
   */
  async initialize(): Promise<void> {
    if (this.transparencySystem) {
      return;
    }

    this.transparencySystem = new TransparencySystem();
    await this.transparencySystem.initialize({
      enableRealTimeMonitoring: true,
      enableEventStreaming: true,
      eventRetentionHours: 24,
      metricsUpdateIntervalMs: 5000,
      heartbeatIntervalMs: 10000,
      enablePerformanceTracking: true,
      enableDependencyTracking: true,
      maxEventsInMemory: 10000,
      enableHierarchyNotifications: true,
    });
    await this.transparencySystem.startMonitoring();

    // Register event listener to invalidate caches on agent updates
    await this.transparencySystem.registerEventListener({
      onLifecycleEvent: (event) => {
        // Invalidate hierarchy cache on agent lifecycle changes
        if (
          event.eventType === 'spawned' ||
          event.eventType === 'terminated' ||
          event.eventType === 'state_changed'
        ) {
          this.cache.del('hierarchy');
        }

        // Notify external subscribers (WebSocket adapter)
        this.eventCallbacks.forEach((callback) => {
          try {
            callback(event);
          } catch (error) {
            console.error('Error in event callback:', error);
          }
        });
      },
      onMetricsUpdate: () => {
        // Invalidate metrics cache on update
        this.cache.del('metrics');
      },
      onAgentStateChange: ({ agentId }) => {
        // Invalidate agent-specific status cache
        this.cache.del(`agent:${agentId}`);
      },
    });
  }

  /**
   * Subscribe to lifecycle events (for WebSocket adapter)
   */
  subscribeToLifecycleEvents(
    callback: (event: AgentLifecycleEvent) => void
  ): () => void {
    this.eventCallbacks.add(callback);
    return () => {
      this.eventCallbacks.delete(callback);
    };
  }

  /**
   * Get transparency system instance
   */
  private getSystem(): TransparencySystem {
    if (!this.transparencySystem) {
      throw new Error('TransparencySystem not initialized');
    }
    return this.transparencySystem;
  }

  /**
   * Get agent hierarchy with optional filters
   * Cache TTL: 30 seconds (Sprint 2.1 requirement)
   */
  async getAgentHierarchy(filters?: {
    status?: string;
    type?: string;
  }): Promise<AgentHierarchyNode[]> {
    const cacheKey = `hierarchy:${JSON.stringify(filters || {})}`;
    const cached = this.cache.get<AgentHierarchyNode[]>(cacheKey);

    if (cached) {
      return cached;
    }

    let hierarchy = await this.getSystem().getAgentHierarchy();

    if (filters?.status) {
      hierarchy = hierarchy.filter((node) => node.state === filters.status);
    }

    if (filters?.type) {
      hierarchy = hierarchy.filter((node) => node.type === filters.type);
    }

    // Cache with 30-second TTL
    this.cache.set(cacheKey, hierarchy, 30);
    return hierarchy;
  }

  /**
   * Get agent status by ID
   * No cache (real-time requirement from Sprint 2.1)
   */
  async getAgentStatus(agentId: string): Promise<AgentStatus> {
    return this.getSystem().getAgentStatus(agentId);
  }

  /**
   * Get system metrics
   * Cache TTL: 10 seconds (Sprint 2.1 requirement)
   */
  async getSystemMetrics(): Promise<TransparencyMetrics> {
    const cacheKey = 'metrics';
    const cached = this.cache.get<TransparencyMetrics>(cacheKey);

    if (cached) {
      return cached;
    }

    const metrics = await this.getSystem().getTransparencyMetrics();

    // Cache with 10-second TTL
    this.cache.set(cacheKey, metrics, 10);
    return metrics;
  }

  /**
   * Get paginated events
   */
  async getEvents(params: {
    page: number;
    limit: number;
    type?: string;
    severity?: string;
    agentId?: string;
    startTime?: Date;
    endTime?: Date;
  }): Promise<{
    data: AgentLifecycleEvent[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    let events: AgentLifecycleEvent[];

    // Fetch based on filters
    if (params.startTime && params.endTime) {
      events = await this.getSystem().getEventsInTimeRange(
        params.startTime,
        params.endTime,
        params.limit * params.page
      );
    } else if (params.agentId) {
      events = await this.getSystem().getAgentEvents(
        params.agentId,
        params.limit * params.page
      );
    } else {
      events = await this.getSystem().getRecentEvents(
        params.limit * params.page,
        params.type
      );
    }

    // Filter by severity if provided
    if (params.severity) {
      events = events.filter((event) => {
        const errorData = event.eventData as any;
        return errorData.severity === params.severity;
      });
    }

    // Calculate pagination
    const total = events.length;
    const totalPages = Math.ceil(total / params.limit);
    const startIndex = (params.page - 1) * params.limit;
    const endIndex = startIndex + params.limit;

    return {
      data: events.slice(startIndex, endIndex),
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Get resource utilization per agent
   */
  async getResourceUtilization(threshold?: number): Promise<
    Array<{
      agentId: string;
      cpu: number;
      memory: number;
      disk: number;
      tokensUsed: number;
    }>
  > {
    const statuses = await this.getSystem().getAllAgentStatuses();

    const resources = statuses.map((status) => ({
      agentId: status.agentId,
      cpu: status.cpuUsage,
      memory: status.memoryUsage,
      disk: 0, // Not tracked yet, placeholder
      tokensUsed: status.tokensUsed,
    }));

    // Filter by threshold if provided
    if (threshold !== undefined) {
      return resources.filter(
        (r) => r.cpu >= threshold || r.memory >= threshold
      );
    }

    return resources;
  }

  /**
   * Trigger agent intervention
   */
  async interventeAgent(
    agentId: string,
    action: 'pause' | 'resume' | 'terminate' | 'restart',
    reason: string
  ): Promise<{ success: boolean; message: string }> {
    // Verify agent exists
    try {
      await this.getSystem().getAgentStatus(agentId);
    } catch (error) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // In read-only mode (Sprint 2.1), we don't actually perform interventions
    // This would be implemented in Sprint 2.2 with write capabilities
    return {
      success: true,
      message: `Intervention ${action} queued for agent ${agentId} (read-only mode)`,
    };
  }

  /**
   * Get system health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    version: string;
    services: {
      transparencySystem: 'up' | 'down';
      database: 'up' | 'down';
      redis: 'up' | 'down';
    };
  }> {
    const startTime = Date.now();

    try {
      // Check transparency system
      await this.getSystem().getTransparencyMetrics();

      return {
        status: 'healthy',
        uptime: process.uptime(),
        version: process.env.npm_package_version || '3.0.0',
        services: {
          transparencySystem: 'up',
          database: 'up', // Placeholder
          redis: 'up', // Placeholder
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        uptime: process.uptime(),
        version: process.env.npm_package_version || '3.0.0',
        services: {
          transparencySystem: 'down',
          database: 'up',
          redis: 'up',
        },
      };
    }
  }
}

// Export singleton instance
export const transparencyService = new TransparencyService();
