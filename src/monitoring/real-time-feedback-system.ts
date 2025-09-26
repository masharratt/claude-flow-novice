import { EventEmitter } from 'events';
import { WebSocket } from 'ws';

export interface MetricDefinition {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  description: string;
  labels: string[];
  unit?: string;
  threshold?: {
    warning: number;
    critical: number;
  };
}

export interface MetricValue {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
}

export interface Alert {
  id: string;
  metric: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  resolved: boolean;
  acknowledgments: Acknowledgment[];
}

export interface Acknowledgment {
  userId: string;
  timestamp: Date;
  comment?: string;
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  panels: DashboardPanel[];
  refreshInterval: number;
  timeRange: {
    from: string;
    to: string;
  };
}

export interface DashboardPanel {
  id: string;
  title: string;
  type: 'graph' | 'singlestat' | 'table' | 'logs' | 'heatmap';
  metrics: string[];
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  options: {
    legend?: boolean;
    tooltip?: boolean;
    yAxisMin?: number;
    yAxisMax?: number;
    unit?: string;
  };
}

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical' | 'unknown';
  components: ComponentHealth[];
  lastUpdate: Date;
  uptime: number;
  version: string;
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  metrics: Record<string, number>;
  checks: HealthCheck[];
  dependencies: string[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
  timestamp: Date;
}

export interface FeedbackLoop {
  id: string;
  name: string;
  source: 'metrics' | 'logs' | 'traces' | 'user-feedback' | 'alerts';
  trigger: FeedbackTrigger;
  actions: FeedbackAction[];
  enabled: boolean;
  lastTriggered?: Date;
  triggerCount: number;
}

export interface FeedbackTrigger {
  type: 'threshold' | 'pattern' | 'anomaly' | 'correlation';
  condition: string;
  duration?: number;
  sensitivity?: number;
}

export interface FeedbackAction {
  type: 'alert' | 'auto-scale' | 'rollback' | 'restart' | 'notification' | 'workflow';
  config: Record<string, any>;
  delay?: number;
}

export class RealTimeFeedbackSystem extends EventEmitter {
  private metrics: Map<string, MetricValue[]> = new Map();
  private metricDefinitions: Map<string, MetricDefinition> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private dashboards: Map<string, Dashboard> = new Map();
  private feedbackLoops: Map<string, FeedbackLoop> = new Map();
  private webSocketServer?: any;
  private clients: Set<WebSocket> = new Set();
  private systemHealth: SystemHealth;
  private metricsRetention = 24 * 60 * 60 * 1000; // 24 hours
  private collectionInterval: NodeJS.Timeout | null = null;

  constructor(private config: {
    port?: number;
    retention?: number;
    collectionInterval?: number;
  } = {}) {
    super();

    this.systemHealth = {
      overall: 'unknown',
      components: [],
      lastUpdate: new Date(),
      uptime: 0,
      version: '1.0.0'
    };

    this.initializeDefaultMetrics();
    this.initializeDefaultFeedbackLoops();
    this.initializeDefaultDashboards();
    this.startMetricsCollection();
  }

  private initializeDefaultMetrics(): void {
    const defaultMetrics: MetricDefinition[] = [
      {
        name: 'http_requests_total',
        type: 'counter',
        description: 'Total HTTP requests',
        labels: ['method', 'status', 'endpoint']
      },
      {
        name: 'http_request_duration',
        type: 'histogram',
        description: 'HTTP request duration in milliseconds',
        labels: ['method', 'endpoint'],
        unit: 'ms'
      },
      {
        name: 'test_execution_count',
        type: 'counter',
        description: 'Number of tests executed',
        labels: ['suite', 'status']
      },
      {
        name: 'test_coverage_percentage',
        type: 'gauge',
        description: 'Test coverage percentage',
        labels: ['component'],
        unit: '%',
        threshold: {
          warning: 80,
          critical: 70
        }
      },
      {
        name: 'deployment_duration',
        type: 'histogram',
        description: 'Deployment duration in seconds',
        labels: ['stage', 'strategy'],
        unit: 's'
      },
      {
        name: 'error_rate',
        type: 'gauge',
        description: 'Error rate percentage',
        labels: ['service', 'environment'],
        unit: '%',
        threshold: {
          warning: 1.0,
          critical: 5.0
        }
      },
      {
        name: 'memory_usage',
        type: 'gauge',
        description: 'Memory usage percentage',
        labels: ['service', 'pod'],
        unit: '%',
        threshold: {
          warning: 80,
          critical: 95
        }
      },
      {
        name: 'cpu_usage',
        type: 'gauge',
        description: 'CPU usage percentage',
        labels: ['service', 'pod'],
        unit: '%',
        threshold: {
          warning: 70,
          critical: 90
        }
      }
    ];

    for (const metric of defaultMetrics) {
      this.metricDefinitions.set(metric.name, metric);
      this.metrics.set(metric.name, []);
    }
  }

  private initializeDefaultFeedbackLoops(): void {
    const defaultLoops: FeedbackLoop[] = [
      {
        id: 'high-error-rate-rollback',
        name: 'High Error Rate Auto-Rollback',
        source: 'metrics',
        trigger: {
          type: 'threshold',
          condition: 'error_rate > 5.0',
          duration: 300 // 5 minutes
        },
        actions: [
          {
            type: 'alert',
            config: {
              severity: 'critical',
              message: 'High error rate detected, initiating rollback'
            }
          },
          {
            type: 'rollback',
            config: {
              strategy: 'immediate',
              reason: 'High error rate threshold exceeded'
            },
            delay: 60000 // 1 minute delay
          }
        ],
        enabled: true,
        triggerCount: 0
      },
      {
        id: 'performance-degradation-scale',
        name: 'Performance Degradation Auto-Scale',
        source: 'metrics',
        trigger: {
          type: 'correlation',
          condition: 'cpu_usage > 80 AND response_time > 500',
          duration: 120
        },
        actions: [
          {
            type: 'auto-scale',
            config: {
              direction: 'up',
              instances: 2
            }
          },
          {
            type: 'notification',
            config: {
              channels: ['slack', 'email'],
              message: 'Auto-scaling triggered due to performance degradation'
            }
          }
        ],
        enabled: true,
        triggerCount: 0
      },
      {
        id: 'test-failure-notification',
        name: 'Test Failure Notification',
        source: 'metrics',
        trigger: {
          type: 'pattern',
          condition: 'test_execution_count{status="failed"} > 0'
        },
        actions: [
          {
            type: 'notification',
            config: {
              channels: ['slack'],
              message: 'Test failures detected in CI/CD pipeline'
            }
          },
          {
            type: 'workflow',
            config: {
              workflowId: 'investigate-test-failures'
            }
          }
        ],
        enabled: true,
        triggerCount: 0
      }
    ];

    for (const loop of defaultLoops) {
      this.feedbackLoops.set(loop.id, loop);
    }
  }

  private initializeDefaultDashboards(): void {
    const systemOverviewDashboard: Dashboard = {
      id: 'system-overview',
      name: 'System Overview',
      description: 'High-level system health and performance metrics',
      refreshInterval: 30000,
      timeRange: {
        from: 'now-1h',
        to: 'now'
      },
      panels: [
        {
          id: 'error-rate-panel',
          title: 'Error Rate',
          type: 'graph',
          metrics: ['error_rate'],
          position: { x: 0, y: 0, width: 6, height: 4 },
          options: {
            legend: true,
            tooltip: true,
            yAxisMax: 10,
            unit: '%'
          }
        },
        {
          id: 'response-time-panel',
          title: 'Response Time',
          type: 'graph',
          metrics: ['http_request_duration'],
          position: { x: 6, y: 0, width: 6, height: 4 },
          options: {
            legend: true,
            tooltip: true,
            unit: 'ms'
          }
        },
        {
          id: 'resource-usage-panel',
          title: 'Resource Usage',
          type: 'graph',
          metrics: ['cpu_usage', 'memory_usage'],
          position: { x: 0, y: 4, width: 12, height: 4 },
          options: {
            legend: true,
            tooltip: true,
            yAxisMax: 100,
            unit: '%'
          }
        }
      ]
    };

    const testingDashboard: Dashboard = {
      id: 'testing-overview',
      name: 'Testing Overview',
      description: 'Testing metrics and coverage information',
      refreshInterval: 60000,
      timeRange: {
        from: 'now-24h',
        to: 'now'
      },
      panels: [
        {
          id: 'test-coverage-panel',
          title: 'Test Coverage',
          type: 'singlestat',
          metrics: ['test_coverage_percentage'],
          position: { x: 0, y: 0, width: 4, height: 3 },
          options: {
            unit: '%'
          }
        },
        {
          id: 'test-execution-panel',
          title: 'Test Executions',
          type: 'graph',
          metrics: ['test_execution_count'],
          position: { x: 4, y: 0, width: 8, height: 6 },
          options: {
            legend: true,
            tooltip: true
          }
        }
      ]
    };

    this.dashboards.set('system-overview', systemOverviewDashboard);
    this.dashboards.set('testing-overview', testingDashboard);
  }

  public recordMetric(name: string, value: number, labels: Record<string, string> = {}): void {
    const definition = this.metricDefinitions.get(name);
    if (!definition) {
      console.warn(`Metric ${name} is not defined`);
      return;
    }

    const metricValue: MetricValue = {
      name,
      value,
      labels,
      timestamp: new Date()
    };

    const existingMetrics = this.metrics.get(name) || [];
    existingMetrics.push(metricValue);

    // Remove old metrics based on retention policy
    const cutoffTime = Date.now() - this.metricsRetention;
    const filteredMetrics = existingMetrics.filter(m => m.timestamp.getTime() > cutoffTime);

    this.metrics.set(name, filteredMetrics);

    // Check thresholds and generate alerts
    this.checkThresholds(name, value, labels);

    // Broadcast to WebSocket clients
    this.broadcastMetric(metricValue);

    this.emit('metric:recorded', metricValue);
  }

  private checkThresholds(name: string, value: number, labels: Record<string, string>): void {
    const definition = this.metricDefinitions.get(name);
    if (!definition || !definition.threshold) return;

    let alertLevel: Alert['level'] | null = null;
    let threshold = 0;

    if (value >= definition.threshold.critical) {
      alertLevel = 'critical';
      threshold = definition.threshold.critical;
    } else if (value >= definition.threshold.warning) {
      alertLevel = 'warning';
      threshold = definition.threshold.warning;
    }

    if (alertLevel) {
      const alertId = `${name}_${JSON.stringify(labels)}_${Date.now()}`;
      const alert: Alert = {
        id: alertId,
        metric: name,
        level: alertLevel,
        message: `${name} (${value}${definition.unit || ''}) exceeds ${alertLevel} threshold (${threshold}${definition.unit || ''})`,
        value,
        threshold,
        timestamp: new Date(),
        resolved: false,
        acknowledgments: []
      };

      this.alerts.set(alertId, alert);
      this.emit('alert:triggered', alert);

      // Check feedback loops
      this.evaluateFeedbackLoops(name, value, labels);
    }
  }

  private evaluateFeedbackLoops(metricName: string, value: number, labels: Record<string, string>): void {
    for (const loop of this.feedbackLoops.values()) {
      if (!loop.enabled) continue;

      if (this.shouldTriggerFeedbackLoop(loop, metricName, value, labels)) {
        this.triggerFeedbackLoop(loop);
      }
    }
  }

  private shouldTriggerFeedbackLoop(
    loop: FeedbackLoop,
    metricName: string,
    value: number,
    labels: Record<string, string>
  ): boolean {
    // Simplified condition evaluation
    // In a real implementation, this would be more sophisticated
    const condition = loop.trigger.condition;

    if (condition.includes(metricName)) {
      // Extract threshold from condition (simplified parsing)
      const thresholdMatch = condition.match(new RegExp(`${metricName}\\s*[><]=?\\s*(\\d+(?:\\.\\d+)?)`));
      if (thresholdMatch) {
        const threshold = parseFloat(thresholdMatch[1]);
        if (condition.includes('>')) {
          return value > threshold;
        } else if (condition.includes('<')) {
          return value < threshold;
        }
      }
    }

    return false;
  }

  private async triggerFeedbackLoop(loop: FeedbackLoop): Promise<void> {
    loop.lastTriggered = new Date();
    loop.triggerCount++;

    this.emit('feedback:loop-triggered', loop);

    for (const action of loop.actions) {
      if (action.delay) {
        setTimeout(() => this.executeFeedbackAction(action), action.delay);
      } else {
        await this.executeFeedbackAction(action);
      }
    }
  }

  private async executeFeedbackAction(action: FeedbackAction): Promise<void> {
    switch (action.type) {
      case 'alert':
        this.emit('feedback:alert', action.config);
        break;
      case 'auto-scale':
        this.emit('feedback:auto-scale', action.config);
        break;
      case 'rollback':
        this.emit('feedback:rollback', action.config);
        break;
      case 'restart':
        this.emit('feedback:restart', action.config);
        break;
      case 'notification':
        this.emit('feedback:notification', action.config);
        break;
      case 'workflow':
        this.emit('feedback:workflow', action.config);
        break;
    }
  }

  private startMetricsCollection(): void {
    const interval = this.config.collectionInterval || 30000; // 30 seconds

    this.collectionInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, interval);

    // Collect initial metrics
    this.collectSystemMetrics();
  }

  private collectSystemMetrics(): void {
    // Simulate system metrics collection
    this.recordMetric('cpu_usage', Math.random() * 40 + 30, { service: 'api', pod: 'api-1' });
    this.recordMetric('memory_usage', Math.random() * 30 + 60, { service: 'api', pod: 'api-1' });
    this.recordMetric('error_rate', Math.random() * 2, { service: 'api', environment: 'production' });

    // Update system health
    this.updateSystemHealth();
  }

  private updateSystemHealth(): void {
    const components: ComponentHealth[] = [
      {
        name: 'API Gateway',
        status: 'healthy',
        metrics: {
          response_time: 150,
          error_rate: 0.5,
          throughput: 1000
        },
        checks: [
          {
            name: 'Health Check',
            status: 'pass',
            message: 'OK',
            duration: 50,
            timestamp: new Date()
          }
        ],
        dependencies: ['Database', 'Cache']
      },
      {
        name: 'Database',
        status: 'healthy',
        metrics: {
          connections: 45,
          query_time: 20,
          disk_usage: 75
        },
        checks: [
          {
            name: 'Connection Test',
            status: 'pass',
            message: 'Connected',
            duration: 10,
            timestamp: new Date()
          }
        ],
        dependencies: []
      }
    ];

    const overallStatus = components.every(c => c.status === 'healthy')
      ? 'healthy'
      : components.some(c => c.status === 'critical')
        ? 'critical'
        : 'degraded';

    this.systemHealth = {
      overall: overallStatus,
      components,
      lastUpdate: new Date(),
      uptime: process.uptime(),
      version: '1.0.0'
    };

    this.emit('health:updated', this.systemHealth);
  }

  public startWebSocketServer(port: number = 3001): void {
    const WebSocketServer = require('ws').WebSocketServer;
    this.webSocketServer = new WebSocketServer({ port });

    this.webSocketServer.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('message', (data: string) => {
        try {
          const message = JSON.parse(data);
          this.handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      });

      // Send initial health status
      ws.send(JSON.stringify({
        type: 'health',
        data: this.systemHealth
      }));
    });

    this.emit('websocket:server-started', { port });
  }

  private handleWebSocketMessage(ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'subscribe':
        // Handle metric subscriptions
        break;
      case 'dashboard':
        const dashboard = this.dashboards.get(message.dashboardId);
        if (dashboard) {
          ws.send(JSON.stringify({
            type: 'dashboard',
            data: dashboard
          }));
        }
        break;
    }
  }

  private broadcastMetric(metric: MetricValue): void {
    if (this.clients.size === 0) return;

    const message = JSON.stringify({
      type: 'metric',
      data: metric
    });

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  public getMetrics(
    name: string,
    timeRange?: { from: Date; to: Date },
    labels?: Record<string, string>
  ): MetricValue[] {
    const allMetrics = this.metrics.get(name) || [];

    let filteredMetrics = allMetrics;

    if (timeRange) {
      filteredMetrics = filteredMetrics.filter(m =>
        m.timestamp >= timeRange.from && m.timestamp <= timeRange.to
      );
    }

    if (labels) {
      filteredMetrics = filteredMetrics.filter(m => {
        return Object.entries(labels).every(([key, value]) => m.labels[key] === value);
      });
    }

    return filteredMetrics;
  }

  public getAlerts(resolved?: boolean): Alert[] {
    const allAlerts = Array.from(this.alerts.values());

    if (resolved !== undefined) {
      return allAlerts.filter(alert => alert.resolved === resolved);
    }

    return allAlerts;
  }

  public acknowledgeAlert(alertId: string, userId: string, comment?: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    const acknowledgment: Acknowledgment = {
      userId,
      timestamp: new Date(),
      comment
    };

    alert.acknowledgments.push(acknowledgment);
    this.emit('alert:acknowledged', { alert, acknowledgment });

    return true;
  }

  public resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.resolved = true;
    this.emit('alert:resolved', alert);

    return true;
  }

  public getDashboard(dashboardId: string): Dashboard | undefined {
    return this.dashboards.get(dashboardId);
  }

  public getAllDashboards(): Dashboard[] {
    return Array.from(this.dashboards.values());
  }

  public getSystemHealth(): SystemHealth {
    return this.systemHealth;
  }

  public createFeedbackLoop(loop: Omit<FeedbackLoop, 'triggerCount'>): void {
    const newLoop: FeedbackLoop = {
      ...loop,
      triggerCount: 0
    };

    this.feedbackLoops.set(loop.id, newLoop);
    this.emit('feedback:loop-created', newLoop);
  }

  public enableFeedbackLoop(loopId: string): boolean {
    const loop = this.feedbackLoops.get(loopId);
    if (!loop) return false;

    loop.enabled = true;
    this.emit('feedback:loop-enabled', loop);
    return true;
  }

  public disableFeedbackLoop(loopId: string): boolean {
    const loop = this.feedbackLoops.get(loopId);
    if (!loop) return false;

    loop.enabled = false;
    this.emit('feedback:loop-disabled', loop);
    return true;
  }

  public getFeedbackLoops(): FeedbackLoop[] {
    return Array.from(this.feedbackLoops.values());
  }

  public cleanup(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }

    if (this.webSocketServer) {
      this.webSocketServer.close();
    }

    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
}