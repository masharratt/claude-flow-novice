/**
 * WebSocket Handler for APM Integration
 * Real-time APM metrics and alerts over WebSocket connections
 */

import { Server as SocketIOServer, Socket } from 'socket.io';
import { APMIntegration } from '../../monitoring/apm/apm-integration.js';

interface APMWebSocketClient {
  socketId: string;
  userId?: string;
  subscriptions: Set<string>;
  lastActivity: Date;
  filters: {
    components?: string[];
    severity?: string[];
    timeRange?: string;
  };
}

export class APMWebSocketHandler {
  private clients: Map<string, APMWebSocketClient> = new Map();
  private metricsInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    private io: SocketIOServer,
    private apmIntegration: APMIntegration
  ) {
    this.setupEventHandlers();
    this.startRealTimeUpdates();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });
  }

  private handleConnection(socket: Socket): void {
    const client: APMWebSocketClient = {
      socketId: socket.id,
      subscriptions: new Set(),
      lastActivity: new Date(),
      filters: {}
    };

    this.clients.set(socket.id, client);

    // Setup client-specific event handlers
    socket.on('subscribe', (data) => this.handleSubscribe(socket, data));
    socket.on('unsubscribe', (data) => this.handleUnsubscribe(socket, data));
    socket.on('set-filters', (filters) => this.handleSetFilters(socket, filters));
    socket.on('request-metrics', (data) => this.handleRequestMetrics(socket, data));
    socket.on('trace-agent', (data) => this.handleTraceAgent(socket, data));
    socket.on('trace-swarm', (data) => this.handleTraceSwarm(socket, data));
    socket.on('run-integration-test', () => this.handleRunIntegrationTest(socket));
    socket.on('disconnect', () => this.handleDisconnection(socket.id));
    socket.on('error', (error) => this.handleError(socket, error));

    // Send initial connection message
    socket.emit('apm-connected', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      availableSubscriptions: [
        'health-status',
        'performance-metrics',
        'recommendations',
        'alerts',
        'slow-queries',
        'cache-performance'
      ]
    });

    // Send initial data
    this.sendInitialData(socket);
  }

  private handleSubscribe(socket: Socket, data: { subscriptions: string[] }): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const { subscriptions } = data;
    if (!Array.isArray(subscriptions)) {
      socket.emit('error', { message: 'Invalid subscriptions format' });
      return;
    }

    const validSubscriptions = [
      'health-status',
      'performance-metrics',
      'recommendations',
      'alerts',
      'slow-queries',
      'cache-performance'
    ];

    subscriptions.forEach(sub => {
      if (validSubscriptions.includes(sub)) {
        client.subscriptions.add(sub);
      }
    });

    client.lastActivity = new Date();

    socket.emit('subscribed', {
      subscriptions: Array.from(client.subscriptions),
      timestamp: new Date().toISOString()
    });

    // Send current data for new subscriptions
    this.sendSubscriptionData(socket, subscriptions);
  }

  private handleUnsubscribe(socket: Socket, data: { subscriptions: string[] }): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const { subscriptions } = data;
    if (!Array.isArray(subscriptions)) {
      socket.emit('error', { message: 'Invalid subscriptions format' });
      return;
    }

    subscriptions.forEach(sub => {
      client.subscriptions.delete(sub);
    });

    client.lastActivity = new Date();

    socket.emit('unsubscribed', {
      subscriptions: Array.from(client.subscriptions),
      timestamp: new Date().toISOString()
    });
  }

  private handleSetFilters(socket: Socket, filters: any): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    client.filters = { ...client.filters, ...filters };
    client.lastActivity = new Date();

    socket.emit('filters-updated', {
      filters: client.filters,
      timestamp: new Date().toISOString()
    });

    // Re-send data with new filters
    this.sendSubscriptionData(socket, Array.from(client.subscriptions));
  }

  private handleRequestMetrics(socket: Socket, data: { timeRange?: string; type?: string }): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    client.lastActivity = new Date();

    try {
      const analytics = this.apmIntegration.getPerformanceAnalytics();
      const timeRange = data.timeRange || '1h';
      const type = data.type || 'overview';

      let responseData: any = {
        timeRange,
        type,
        timestamp: new Date().toISOString()
      };

      switch (type) {
        case 'overview':
          responseData = { ...responseData, ...analytics };
          break;
        case 'performance':
          responseData.metrics = analytics.metrics;
          break;
        case 'recommendations':
          responseData.recommendations = analytics.recommendations;
          break;
        case 'trends':
          responseData.trends = analytics.trends;
          break;
        default:
          responseData = { ...responseData, ...analytics };
      }

      socket.emit('metrics-response', responseData);
    } catch (error) {
      socket.emit('error', {
        message: 'Failed to fetch metrics',
        error: error.message
      });
    }
  }

  private handleTraceAgent(socket: Socket, data: {
    agentType: string;
    lifecycleEvent: string;
    agentId?: string;
    metadata?: any;
  }): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    client.lastActivity = new Date();

    try {
      this.apmIntegration.traceAgentLifecycle(
        data.agentType,
        data.lifecycleEvent,
        data.agentId,
        {
          ...data.metadata,
          source: 'websocket',
          clientId: socket.id
        }
      );

      socket.emit('trace-acknowledged', {
        type: 'agent',
        agentType: data.agentType,
        lifecycleEvent: data.lifecycleEvent,
        agentId: data.agentId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      socket.emit('error', {
        message: 'Failed to trace agent lifecycle',
        error: error.message
      });
    }
  }

  private handleTraceSwarm(socket: Socket, data: {
    swarmId: string;
    activity: string;
    topology: string;
    agentCount?: number;
    metadata?: any;
  }): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    client.lastActivity = new Date();

    try {
      this.apmIntegration.traceSwarmActivity(
        data.swarmId,
        data.activity,
        data.topology,
        data.agentCount || 0,
        {
          ...data.metadata,
          source: 'websocket',
          clientId: socket.id
        }
      );

      socket.emit('trace-acknowledged', {
        type: 'swarm',
        swarmId: data.swarmId,
        activity: data.activity,
        topology: data.topology,
        agentCount: data.agentCount,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      socket.emit('error', {
        message: 'Failed to trace swarm activity',
        error: error.message
      });
    }
  }

  private async handleRunIntegrationTest(socket: Socket): Promise<void> {
    const client = this.clients.get(socket.id);
    if (!client) return;

    client.lastActivity = new Date();

    try {
      socket.emit('integration-test-started', {
        timestamp: new Date().toISOString()
      });

      const results = await this.apmIntegration.runIntegrationTest();

      socket.emit('integration-test-completed', {
        results,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      socket.emit('error', {
        message: 'Integration test failed',
        error: error.message
      });
    }
  }

  private handleDisconnection(socketId: string): void {
    this.clients.delete(socketId);
  }

  private handleError(socket: Socket, error: any): void {
    console.error('WebSocket error:', error);
    const client = this.clients.get(socket.id);
    if (client) {
      client.lastActivity = new Date();
    }
  }

  private sendInitialData(socket: Socket): void {
    try {
      // Send initial health status
      this.apmIntegration.getHealthStatus().then(health => {
        socket.emit('health-status-update', {
          ...health,
          timestamp: new Date().toISOString()
        });
      });

      // Send initial performance metrics
      const analytics = this.apmIntegration.getPerformanceAnalytics();
      socket.emit('performance-metrics-update', {
        ...analytics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to send initial data:', error);
    }
  }

  private sendSubscriptionData(socket: Socket, subscriptions: string[]): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    subscriptions.forEach(subscription => {
      switch (subscription) {
        case 'health-status':
          this.apmIntegration.getHealthStatus().then(health => {
            socket.emit('health-status-update', {
              ...health,
              timestamp: new Date().toISOString()
            });
          });
          break;

        case 'performance-metrics':
          const analytics = this.apmIntegration.getPerformanceAnalytics();
          socket.emit('performance-metrics-update', {
            ...analytics,
            timestamp: new Date().toISOString()
          });
          break;

        case 'recommendations':
          const recommendations = this.apmIntegration.getPerformanceAnalytics().recommendations;
          socket.emit('recommendations-update', {
            recommendations,
            timestamp: new Date().toISOString()
          });
          break;

        case 'slow-queries':
          const collectors = this.apmIntegration.getCollectors();
          if (collectors.performanceOptimizer) {
            const slowQueries = collectors.performanceOptimizer.getSlowQueries();
            socket.emit('slow-queries-update', {
              slowQueries,
              timestamp: new Date().toISOString()
            });
          }
          break;

        case 'cache-performance':
          const perfCollectors = this.apmIntegration.getCollectors();
          if (perfCollectors.performanceOptimizer) {
            const cacheHitRates = perfCollectors.performanceOptimizer.getCacheHitRates();
            socket.emit('cache-performance-update', {
              cacheHitRates: Object.fromEntries(cacheHitRates),
              timestamp: new Date().toISOString()
            });
          }
          break;
      }
    });
  }

  private startRealTimeUpdates(): void {
    // Send health status updates every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.apmIntegration.getHealthStatus();
        this.broadcastToSubscribers('health-status', 'health-status-update', {
          ...health,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Failed to broadcast health status:', error);
      }
    }, 30000);

    // Send performance metrics updates every 10 seconds
    this.metricsInterval = setInterval(() => {
      try {
        const analytics = this.apmIntegration.getPerformanceAnalytics();
        this.broadcastToSubscribers('performance-metrics', 'performance-metrics-update', {
          ...analytics,
          timestamp: new Date().toISOString()
        });

        // Send recommendations if any
        if (analytics.recommendations.length > 0) {
          this.broadcastToSubscribers('recommendations', 'recommendations-update', {
            recommendations: analytics.recommendations,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('Failed to broadcast performance metrics:', error);
      }
    }, 10000);
  }

  private broadcastToSubscribers(subscription: string, event: string, data: any): void {
    for (const [socketId, client] of this.clients) {
      if (client.subscriptions.has(subscription)) {
        // Apply client filters if any
        const filteredData = this.applyFilters(data, client.filters);
        this.io.to(socketId).emit(event, filteredData);
      }
    }
  }

  private applyFilters(data: any, filters: any): any {
    // Apply component filters
    if (filters.components && Array.isArray(filters.components) && data.components) {
      const filteredComponents: any = {};
      filters.components.forEach((component: string) => {
        if (data.components[component]) {
          filteredComponents[component] = data.components[component];
        }
      });
      data = { ...data, components: filteredComponents };
    }

    // Apply severity filters for recommendations
    if (filters.severity && Array.isArray(filters.severity) && data.recommendations) {
      data.recommendations = data.recommendations.filter((rec: any) =>
        filters.severity.includes(rec.priority)
      );
    }

    return data;
  }

  // Public API methods
  public broadcastAlert(alert: any): void {
    this.broadcastToSubscribers('alerts', 'alert', {
      ...alert,
      timestamp: new Date().toISOString()
    });
  }

  public broadcastSlowQuery(slowQuery: any): void {
    this.broadcastToSubscribers('slow-queries', 'slow-query-detected', {
      ...slowQuery,
      timestamp: new Date().toISOString()
    });
  }

  public broadcastRecommendation(recommendation: any): void {
    this.broadcastToSubscribers('recommendations', 'new-recommendation', {
      ...recommendation,
      timestamp: new Date().toISOString()
    });
  }

  public getClientStats(): {
    totalClients: number;
    activeSubscriptions: Record<string, number>;
    averageSubscriptionsPerClient: number;
  } {
    const subscriptionCounts: Record<string, number> = {};
    let totalSubscriptions = 0;

    for (const client of this.clients.values()) {
      totalSubscriptions += client.subscriptions.size;
      for (const subscription of client.subscriptions) {
        subscriptionCounts[subscription] = (subscriptionCounts[subscription] || 0) + 1;
      }
    }

    return {
      totalClients: this.clients.size,
      activeSubscriptions: subscriptionCounts,
      averageSubscriptionsPerClient: this.clients.size > 0 ? totalSubscriptions / this.clients.size : 0
    };
  }

  public cleanupInactiveClients(maxInactiveTime: number = 300000): void { // 5 minutes
    const now = new Date();
    const inactiveClients: string[] = [];

    for (const [socketId, client] of this.clients) {
      if (now.getTime() - client.lastActivity.getTime() > maxInactiveTime) {
        inactiveClients.push(socketId);
      }
    }

    inactiveClients.forEach(socketId => {
      this.io.to(socketId).disconnect();
      this.clients.delete(socketId);
    });

    if (inactiveClients.length > 0) {
      console.log(`Cleaned up ${inactiveClients.length} inactive WebSocket clients`);
    }
  }

  public shutdown(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Disconnect all clients
    for (const socketId of this.clients.keys()) {
      this.io.to(socketId).disconnect();
    }

    this.clients.clear();
  }
}

export function createAPMWebSocketHandler(
  io: SocketIOServer,
  apmIntegration: APMIntegration
): APMWebSocketHandler {
  return new APMWebSocketHandler(io, apmIntegration);
}