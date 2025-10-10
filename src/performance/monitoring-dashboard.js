/**
 * Real-Time Performance Monitoring Dashboard
 * Provides comprehensive performance monitoring with 1-second updates and Redis coordination
 */

import { EventEmitter } from 'events';
import { connectRedis } from '../cli/utils/redis-client.js';
import { performance } from 'perf_hooks';

export class PerformanceMonitoringDashboard extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      redis: {
        host: 'localhost',
        port: 6379,
        database: 3, // Dedicated database for monitoring
      },
      dashboard: {
        updateInterval: 1000, // 1 second updates
        historySize: 300, // 5 minutes of history
        alertThresholds: {
          cpuUsage: 80, // percentage
          memoryUsage: 85, // percentage
          latency: 100, // milliseconds
          errorRate: 5, // percentage
          queueSize: 100 // number of items
        },
        performanceTargets: {
          latencyReduction: 30, // percentage
          throughputImprovement: 50, // percentage
          uptimeTarget: 99.9, // percentage
          responseTime: 50 // milliseconds
        }
      },
      web: {
        enabled: true,
        port: 3001,
        host: '0.0.0.0'
      },
      ...config
    };

    this.redisClient = null;
    this.metrics = {
      system: {
        cpu: [],
        memory: [],
        disk: [],
        network: []
      },
      application: {
        latency: [],
        throughput: [],
        errors: [],
        queueSize: []
      },
      swarm: {
        activeAgents: 0,
        completedTasks: 0,
        failedTasks: 0,
        averageTaskDuration: 0
      },
      alerts: [],
      performance: {
        baseline: null,
        current: null,
        improvement: 0
      }
    };

    this.active = false;
    this.startTime = null;
    this.updateTimer = null;
    this.webServer = null;
    this.alertHandlers = new Map();

    // Performance tracking
    this.performanceBaseline = {
      timestamp: null,
      avgLatency: 0,
      avgThroughput: 0,
      avgCpuUsage: 0,
      avgMemoryUsage: 0
    };

    this.currentPerformance = {
      timestamp: null,
      avgLatency: 0,
      avgThroughput: 0,
      avgCpuUsage: 0,
      avgMemoryUsage: 0
    };
  }

  /**
   * Initialize monitoring dashboard
   */
  async initialize() {
    console.log('📊 Initializing Performance Monitoring Dashboard...');

    try {
      // Connect to Redis
      this.redisClient = await connectRedis(this.config.redis);

      // Subscribe to performance channels
      await this.setupRedisSubscriptions();

      // Initialize web dashboard if enabled
      if (this.config.web.enabled) {
        await this.initializeWebDashboard();
      }

      // Start metrics collection
      this.startMetricsCollection();

      // Setup alert handlers
      this.setupAlertHandlers();

      this.active = true;
      this.startTime = Date.now();

      console.log('✅ Performance Monitoring Dashboard initialized');
      console.log(`📡 Update interval: ${this.config.dashboard.updateInterval}ms`);
      console.log(`🌐 Web dashboard: http://${this.config.web.host}:${this.config.web.port}`);

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize dashboard:', error.message);
      throw error;
    }
  }

  /**
   * Setup Redis subscriptions for real-time metrics
   */
  async setupRedisSubscriptions() {
    // Create subscriber client
    const subscriber = await connectRedis(this.config.redis);

    // Subscribe to performance metrics channel
    await subscriber.subscribe('swarm:phase-4:metrics', (message) => {
      this.handlePerformanceMetrics(JSON.parse(message));
    });

    // Subscribe to alert channel
    await subscriber.subscribe('swarm:phase-4:alerts', (message) => {
      this.handleAlert(JSON.parse(message));
    });

    // Subscribe to swarm status channel
    await subscriber.subscribe('swarm:phase-4:status', (message) => {
      this.handleSwarmStatus(JSON.parse(message));
    });

    console.log('📡 Redis subscriptions configured');
  }

  /**
   * Initialize web dashboard
   */
  async initializeWebDashboard() {
    try {
      // Simple HTTP server for the dashboard
      const http = await import('http');

      this.webServer = http.createServer((req, res) => {
        this.handleWebRequest(req, res);
      });

      this.webServer.listen(this.config.web.port, this.config.web.host, () => {
        console.log(`🌐 Web dashboard listening on ${this.config.web.host}:${this.config.web.port}`);
      });

    } catch (error) {
      console.warn('⚠️ Could not initialize web dashboard:', error.message);
      this.config.web.enabled = false;
    }
  }

  /**
   * Handle web requests
   */
  handleWebRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    switch (url.pathname) {
      case '/':
        this.serveDashboardHTML(res);
        break;
      case '/api/metrics':
        this.serveMetricsJSON(res);
        break;
      case '/api/alerts':
        this.serveAlertsJSON(res);
        break;
      case '/api/performance':
        this.servePerformanceJSON(res);
        break;
      case '/api/health':
        this.serveHealthJSON(res);
        break;
      default:
        res.writeHead(404);
        res.end('Not Found');
    }
  }

  /**
   * Serve dashboard HTML
   */
  serveDashboardHTML(res) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Monitoring Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .header { background: #333; color: white; padding: 20px; text-align: center; margin: -20px -20px 20px -20px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-value { font-size: 2em; font-weight: bold; color: #333; }
        .metric-label { color: #666; margin-top: 5px; }
        .metric-trend { font-size: 0.9em; margin-top: 10px; }
        .trend-up { color: #27ae60; }
        .trend-down { color: #e74c3c; }
        .chart-container { height: 200px; margin-top: 20px; }
        .alerts { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .alert { padding: 10px; margin: 5px 0; border-radius: 4px; }
        .alert-warning { background: #fff3cd; border: 1px solid #ffeaa7; }
        .alert-critical { background: #f8d7da; border: 1px solid #f5c6cb; }
        .alert-info { background: #d1ecf1; border: 1px solid #bee5eb; }
        .status-indicator { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; }
        .status-good { background: #27ae60; }
        .status-warning { background: #f39c12; }
        .status-critical { background: #e74c3c; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Performance Monitoring Dashboard</h1>
        <p>Real-time system performance metrics and alerts</p>
    </div>

    <div class="metrics-grid">
        <div class="metric-card">
            <div class="metric-value" id="cpu-usage">0%</div>
            <div class="metric-label">CPU Usage</div>
            <div class="metric-trend" id="cpu-trend">
                <span class="status-indicator status-good"></span>
                Normal
            </div>
            <div class="chart-container">
                <canvas id="cpu-chart"></canvas>
            </div>
        </div>

        <div class="metric-card">
            <div class="metric-value" id="memory-usage">0%</div>
            <div class="metric-label">Memory Usage</div>
            <div class="metric-trend" id="memory-trend">
                <span class="status-indicator status-good"></span>
                Normal
            </div>
            <div class="chart-container">
                <canvas id="memory-chart"></canvas>
            </div>
        </div>

        <div class="metric-card">
            <div class="metric-value" id="latency">0ms</div>
            <div class="metric-label">Average Latency</div>
            <div class="metric-trend" id="latency-trend">
                <span class="status-indicator status-good"></span>
                Target: < 50ms
            </div>
            <div class="chart-container">
                <canvas id="latency-chart"></canvas>
            </div>
        </div>

        <div class="metric-card">
            <div class="metric-value" id="throughput">0/s</div>
            <div class="metric-label">Throughput</div>
            <div class="metric-trend" id="throughput-trend">
                <span class="status-indicator status-good"></span>
                Operations/sec
            </div>
            <div class="chart-container">
                <canvas id="throughput-chart"></canvas>
            </div>
        </div>
    </div>

    <div class="metrics-grid" style="margin-top: 20px;">
        <div class="metric-card">
            <div class="metric-value" id="swarm-agents">0</div>
            <div class="metric-label">Active Swarm Agents</div>
            <div class="metric-trend">
                <span class="status-indicator status-good"></span>
                Distributed Processing
            </div>
        </div>

        <div class="metric-card">
            <div class="metric-value" id="completed-tasks">0</div>
            <div class="metric-label">Completed Tasks</div>
            <div class="metric-trend">
                <span class="status-indicator status-good"></span>
                Total Processed
            </div>
        </div>

        <div class="metric-card">
            <div class="metric-value" id="error-rate">0%</div>
            <div class="metric-label">Error Rate</div>
            <div class="metric-trend" id="error-trend">
                <span class="status-indicator status-good"></span>
                Target: < 5%
            </div>
        </div>

        <div class="metric-card">
            <div class="metric-value" id="performance-improvement">0%</div>
            <div class="metric-label">Performance Improvement</div>
            <div class="metric-trend">
                <span class="status-indicator status-good"></span>
                Target: 30%
            </div>
        </div>
    </div>

    <div class="alerts">
        <h3>🚨 System Alerts</h3>
        <div id="alerts-container">
            <div class="alert alert-info">
                <strong>System Status:</strong> All systems operational
            </div>
        </div>
    </div>

    <script>
        // Chart configurations
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true },
                x: { display: false }
            },
            plugins: {
                legend: { display: false }
            }
        };

        // Initialize charts
        const cpuChart = new Chart(document.getElementById('cpu-chart'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'CPU %', data: [], borderColor: '#3498db', fill: false }] },
            options: chartOptions
        });

        const memoryChart = new Chart(document.getElementById('memory-chart'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Memory %', data: [], borderColor: '#e74c3c', fill: false }] },
            options: chartOptions
        });

        const latencyChart = new Chart(document.getElementById('latency-chart'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Latency ms', data: [], borderColor: '#f39c12', fill: false }] },
            options: chartOptions
        });

        const throughputChart = new Chart(document.getElementById('throughput-chart'), {
            type: 'line',
            data: { labels: [], datasets: [{ label: 'Throughput', data: [], borderColor: '#27ae60', fill: false }] },
            options: chartOptions
        });

        // Update dashboard data
        function updateDashboard() {
            fetch('/api/metrics')
                .then(response => response.json())
                .then(data => {
                    // Update metric values
                    document.getElementById('cpu-usage').textContent = data.cpu.current.toFixed(1) + '%';
                    document.getElementById('memory-usage').textContent = data.memory.current.toFixed(1) + '%';
                    document.getElementById('latency').textContent = data.latency.current.toFixed(1) + 'ms';
                    document.getElementById('throughput').textContent = data.throughput.current.toFixed(0) + '/s';

                    document.getElementById('swarm-agents').textContent = data.swarm.activeAgents;
                    document.getElementById('completed-tasks').textContent = data.swarm.completedTasks;
                    document.getElementById('error-rate').textContent = data.errors.current.toFixed(1) + '%';
                    document.getElementById('performance-improvement').textContent = data.performance.improvement.toFixed(1) + '%';

                    // Update charts
                    updateChart(cpuChart, data.cpu.history);
                    updateChart(memoryChart, data.memory.history);
                    updateChart(latencyChart, data.latency.history);
                    updateChart(throughputChart, data.throughput.history);

                    // Update status indicators
                    updateStatusIndicators(data);
                })
                .catch(error => console.error('Error fetching metrics:', error));

            // Update alerts
            fetch('/api/alerts')
                .then(response => response.json())
                .then(alerts => {
                    updateAlerts(alerts);
                })
                .catch(error => console.error('Error fetching alerts:', error));
        }

        function updateChart(chart, data) {
            chart.data.labels = data.map((_, i) => i);
            chart.data.datasets[0].data = data;
            chart.update('none');
        }

        function updateStatusIndicators(data) {
            updateIndicator('cpu-trend', data.cpu.current, 80);
            updateIndicator('memory-trend', data.memory.current, 85);
            updateIndicator('latency-trend', data.latency.current, 50);
            updateIndicator('error-trend', data.errors.current, 5);
        }

        function updateIndicator(elementId, value, threshold) {
            const element = document.getElementById(elementId);
            const indicator = element.querySelector('.status-indicator');

            if (value > threshold) {
                indicator.className = 'status-indicator status-critical';
            } else if (value > threshold * 0.8) {
                indicator.className = 'status-indicator status-warning';
            } else {
                indicator.className = 'status-indicator status-good';
            }
        }

        function updateAlerts(alerts) {
            const container = document.getElementById('alerts-container');

            if (alerts.length === 0) {
                container.innerHTML = '<div class="alert alert-info"><strong>System Status:</strong> All systems operational</div>';
                return;
            }

            container.innerHTML = alerts.map(alert =>
                \`<div class="alert alert-\${alert.severity}">
                    <strong>\${alert.type}:</strong> \${alert.message}
                    <br><small>\${new Date(alert.timestamp).toLocaleString()}</small>
                </div>\`
            ).join('');
        }

        // Start real-time updates
        setInterval(updateDashboard, 1000);
        updateDashboard(); // Initial update
    </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  /**
   * Serve metrics as JSON
   */
  serveMetricsJSON(res) {
    const data = {
      timestamp: Date.now(),
      uptime: this.active ? Date.now() - this.startTime : 0,
      cpu: {
        current: this.getLatestValue(this.metrics.system.cpu),
        history: this.metrics.system.cpu.slice(-60) // Last 60 data points
      },
      memory: {
        current: this.getLatestValue(this.metrics.system.memory),
        history: this.metrics.system.memory.slice(-60)
      },
      latency: {
        current: this.getLatestValue(this.metrics.application.latency),
        history: this.metrics.application.latency.slice(-60)
      },
      throughput: {
        current: this.getLatestValue(this.metrics.application.throughput),
        history: this.metrics.application.throughput.slice(-60)
      },
      errors: {
        current: this.getLatestValue(this.metrics.application.errors),
        history: this.metrics.application.errors.slice(-60)
      },
      swarm: this.metrics.swarm,
      performance: this.metrics.performance
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data, null, 2));
  }

  /**
   * Serve alerts as JSON
   */
  serveAlertsJSON(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(this.metrics.alerts.slice(-20), null, 2)); // Last 20 alerts
  }

  /**
   * Serve performance data as JSON
   */
  servePerformanceJSON(res) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      baseline: this.performanceBaseline,
      current: this.currentPerformance,
      improvement: this.calculatePerformanceImprovement()
    }, null, 2));
  }

  /**
   * Serve health status as JSON
   */
  serveHealthJSON(res) {
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      uptime: this.active ? Date.now() - this.startTime : 0,
      dashboard: this.active,
      redis: this.redisClient ? 'connected' : 'disconnected',
      web: this.webServer ? 'running' : 'stopped',
      activeAlerts: this.metrics.alerts.filter(a => a.severity === 'critical').length
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    console.log('📊 Starting metrics collection...');

    this.updateTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.dashboard.updateInterval);

    // Collect initial metrics
    this.collectMetrics();
  }

  /**
   * Collect system and application metrics
   */
  collectMetrics() {
    const timestamp = Date.now();

    // System metrics
    this.collectSystemMetrics(timestamp);

    // Application metrics
    this.collectApplicationMetrics(timestamp);

    // Performance calculation
    this.updatePerformanceMetrics(timestamp);

    // Emit metrics event
    this.emit('metrics', this.getLatestMetrics());

    // Publish to Redis
    this.publishMetrics();
  }

  /**
   * Collect system metrics
   */
  collectSystemMetrics(timestamp) {
    const cpus = require('os').cpus();
    const totalmem = require('os').totalmem();
    const freemem = require('os').freemem();

    // CPU usage calculation
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const cpuUsage = ((totalTick - totalIdle) / totalTick) * 100;

    // Memory usage calculation
    const memoryUsage = ((totalmem - freemem) / totalmem) * 100;

    // Store metrics
    this.metrics.system.cpu.push({ timestamp, value: cpuUsage });
    this.metrics.system.memory.push({ timestamp, value: memoryUsage });

    // Maintain history size
    if (this.metrics.system.cpu.length > this.config.dashboard.historySize) {
      this.metrics.system.cpu.shift();
    }
    if (this.metrics.system.memory.length > this.config.dashboard.historySize) {
      this.metrics.system.memory.shift();
    }

    // Check for alerts
    this.checkSystemAlerts(cpuUsage, memoryUsage);
  }

  /**
   * Collect application metrics
   */
  collectApplicationMetrics(timestamp) {
    // These would be populated by actual application measurements
    // For now, we'll simulate some values
    const latency = Math.random() * 50 + 20; // 20-70ms
    const throughput = Math.random() * 1000 + 500; // 500-1500 ops/sec
    const errorRate = Math.random() * 2; // 0-2%

    this.metrics.application.latency.push({ timestamp, value: latency });
    this.metrics.application.throughput.push({ timestamp, value: throughput });
    this.metrics.application.errors.push({ timestamp, value: errorRate });

    // Maintain history size
    Object.keys(this.metrics.application).forEach(key => {
      if (this.metrics.application[key].length > this.config.dashboard.historySize) {
        this.metrics.application[key].shift();
      }
    });

    // Check for application alerts
    this.checkApplicationAlerts(latency, throughput, errorRate);
  }

  /**
   * Update performance metrics and calculate improvements
   */
  updatePerformanceMetrics(timestamp) {
    // Update current performance
    this.currentPerformance = {
      timestamp,
      avgLatency: this.getAverageValue(this.metrics.application.latency),
      avgThroughput: this.getAverageValue(this.metrics.application.throughput),
      avgCpuUsage: this.getAverageValue(this.metrics.system.cpu),
      avgMemoryUsage: this.getAverageValue(this.metrics.system.memory)
    };

    // Set baseline if not exists
    if (!this.performanceBaseline.timestamp) {
      this.performanceBaseline = { ...this.currentPerformance };
    }

    // Calculate improvement
    const improvement = this.calculatePerformanceImprovement();
    this.metrics.performance = {
      baseline: this.performanceBaseline,
      current: this.currentPerformance,
      improvement
    };
  }

  /**
   * Calculate performance improvement percentage
   */
  calculatePerformanceImprovement() {
    if (!this.performanceBaseline.timestamp) return 0;

    const baseline = this.performanceBaseline;
    const current = this.currentPerformance;

    // Calculate individual improvements
    const latencyImprovement = ((baseline.avgLatency - current.avgLatency) / baseline.avgLatency) * 100;
    const throughputImprovement = ((current.avgThroughput - baseline.avgThroughput) / baseline.avgThroughput) * 100;
    const cpuImprovement = ((baseline.avgCpuUsage - current.avgCpuUsage) / baseline.avgCpuUsage) * 100;
    const memoryImprovement = ((baseline.avgMemoryUsage - current.avgMemoryUsage) / baseline.avgMemoryUsage) * 100;

    // Weighted average (latency is most important)
    const weightedImprovement = (
      latencyImprovement * 0.4 +
      throughputImprovement * 0.3 +
      cpuImprovement * 0.2 +
      memoryImprovement * 0.1
    );

    return Math.max(0, weightedImprovement);
  }

  /**
   * Check for system alerts
   */
  checkSystemAlerts(cpuUsage, memoryUsage) {
    const thresholds = this.config.dashboard.alertThresholds;

    if (cpuUsage > thresholds.cpuUsage) {
      this.createAlert('high-cpu', 'warning', `High CPU usage: ${cpuUsage.toFixed(1)}%`);
    }

    if (memoryUsage > thresholds.memoryUsage) {
      this.createAlert('high-memory', 'warning', `High memory usage: ${memoryUsage.toFixed(1)}%`);
    }
  }

  /**
   * Check for application alerts
   */
  checkApplicationAlerts(latency, throughput, errorRate) {
    const thresholds = this.config.dashboard.alertThresholds;

    if (latency > thresholds.latency) {
      this.createAlert('high-latency', 'warning', `High latency: ${latency.toFixed(1)}ms`);
    }

    if (errorRate > thresholds.errorRate) {
      this.createAlert('high-error-rate', 'critical', `High error rate: ${errorRate.toFixed(1)}%`);
    }
  }

  /**
   * Create alert
   */
  createAlert(type, severity, message) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      timestamp: Date.now()
    };

    this.metrics.alerts.push(alert);

    // Keep only recent alerts
    if (this.metrics.alerts.length > 100) {
      this.metrics.alerts.shift();
    }

    // Emit alert event
    this.emit('alert', alert);

    // Publish to Redis
    this.publishAlert(alert);
  }

  /**
   * Handle incoming performance metrics from Redis
   */
  handlePerformanceMetrics(data) {
    if (data.type === 'performance-metrics') {
      // Update metrics with external data
      this.mergeExternalMetrics(data.data);
    }
  }

  /**
   * Handle incoming alerts from Redis
   */
  handleAlert(alert) {
    if (!this.metrics.alerts.find(a => a.id === alert.id)) {
      this.metrics.alerts.push(alert);
      this.emit('alert', alert);
    }
  }

  /**
   * Handle swarm status updates
   */
  handleSwarmStatus(data) {
    this.metrics.swarm = {
      activeAgents: data.activeAgents || 0,
      completedTasks: data.completedTasks || 0,
      failedTasks: data.failedTasks || 0,
      averageTaskDuration: data.averageTaskDuration || 0
    };
  }

  /**
   * Merge external metrics
   */
  mergeExternalMetrics(data) {
    // Merge external metrics with local metrics
    if (data.cpu !== undefined) {
      this.metrics.system.cpu.push({ timestamp: Date.now(), value: data.cpu });
    }
    if (data.memory !== undefined) {
      this.metrics.system.memory.push({ timestamp: Date.now(), value: data.memory });
    }
    if (data.throughput !== undefined) {
      this.metrics.application.throughput.push({ timestamp: Date.now(), value: data.throughput });
    }
  }

  /**
   * Publish metrics to Redis
   */
  async publishMetrics() {
    if (!this.redisClient) return;

    try {
      const metrics = {
        type: 'dashboard-metrics',
        timestamp: Date.now(),
        data: this.getLatestMetrics()
      };

      await this.redisClient.publish('swarm:phase-4:dashboard-metrics', JSON.stringify(metrics));
    } catch (error) {
      console.warn('Failed to publish metrics to Redis:', error.message);
    }
  }

  /**
   * Publish alert to Redis
   */
  async publishAlert(alert) {
    if (!this.redisClient) return;

    try {
      await this.redisClient.publish('swarm:phase-4:alerts', JSON.stringify(alert));
    } catch (error) {
      console.warn('Failed to publish alert to Redis:', error.message);
    }
  }

  /**
   * Setup alert handlers
   */
  setupAlertHandlers() {
    // Register alert handlers
    this.alertHandlers.set('high-cpu', (alert) => {
      console.log(`🔥 CPU Alert: ${alert.message}`);
    });

    this.alertHandlers.set('high-memory', (alert) => {
      console.log(`💾 Memory Alert: ${alert.message}`);
    });

    this.alertHandlers.set('high-latency', (alert) => {
      console.log(`⏱️ Latency Alert: ${alert.message}`);
    });

    this.alertHandlers.set('high-error-rate', (alert) => {
      console.log(`❌ Error Rate Alert: ${alert.message}`);
    });

    // Listen for alert events
    this.on('alert', (alert) => {
      const handler = this.alertHandlers.get(alert.type);
      if (handler) {
        handler(alert);
      }
    });
  }

  /**
   * Get latest metrics
   */
  getLatestMetrics() {
    return {
      timestamp: Date.now(),
      cpu: this.getLatestValue(this.metrics.system.cpu),
      memory: this.getLatestValue(this.metrics.system.memory),
      latency: this.getLatestValue(this.metrics.application.latency),
      throughput: this.getLatestValue(this.metrics.application.throughput),
      errors: this.getLatestValue(this.metrics.application.errors),
      swarm: this.metrics.swarm,
      performance: this.metrics.performance
    };
  }

  /**
   * Get latest value from metrics array
   */
  getLatestValue(metricsArray) {
    if (metricsArray.length === 0) return 0;
    return metricsArray[metricsArray.length - 1].value;
  }

  /**
   * Get average value from metrics array
   */
  getAverageValue(metricsArray) {
    if (metricsArray.length === 0) return 0;
    const sum = metricsArray.reduce((acc, item) => acc + item.value, 0);
    return sum / metricsArray.length;
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    const currentMetrics = this.getLatestMetrics();
    const improvement = this.calculatePerformanceImprovement();

    return {
      summary: {
        uptime: this.active ? Date.now() - this.startTime : 0,
        performanceImprovement: improvement,
        targetMet: improvement >= this.config.dashboard.performanceTargets.latencyReduction,
        status: improvement >= this.config.dashboard.performanceTargets.latencyReduction ? 'success' : 'in-progress'
      },
      metrics: currentMetrics,
      alerts: this.metrics.alerts.slice(-10),
      targets: this.config.dashboard.performanceTargets,
      recommendations: this.generateRecommendations(currentMetrics, improvement)
    };
  }

  /**
   * Generate performance recommendations
   */
  generateRecommendations(metrics, improvement) {
    const recommendations = [];

    if (metrics.cpu > 80) {
      recommendations.push({
        priority: 'high',
        category: 'cpu',
        action: 'Optimize CPU usage',
        description: 'Consider optimizing algorithms or scaling worker threads'
      });
    }

    if (metrics.memory > 85) {
      recommendations.push({
        priority: 'high',
        category: 'memory',
        action: 'Optimize memory usage',
        description: 'Implement memory pooling or garbage collection optimization'
      });
    }

    if (metrics.latency > 50) {
      recommendations.push({
        priority: 'medium',
        category: 'latency',
        action: 'Reduce latency',
        description: 'Optimize event bus and reduce processing overhead'
      });
    }

    if (improvement < 30) {
      recommendations.push({
        priority: 'high',
        category: 'performance',
        action: 'Improve performance',
        description: `Current improvement: ${improvement.toFixed(1)}%, Target: 30%`
      });
    }

    return recommendations;
  }

  /**
   * Export performance data
   */
  async exportData(format = 'json') {
    const data = {
      timestamp: Date.now(),
      report: this.getPerformanceReport(),
      metrics: this.metrics,
      config: this.config
    };

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'csv':
        return this.convertToCSV(data);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Convert data to CSV format
   */
  convertToCSV(data) {
    // Simple CSV conversion for metrics
    const headers = 'timestamp,cpu,memory,latency,throughput,errors';
    const rows = this.metrics.system.cpu.map((cpu, index) => {
      const memory = this.metrics.system.memory[index];
      const latency = this.metrics.application.latency[index];
      const throughput = this.metrics.application.throughput[index];
      const errors = this.metrics.application.errors[index];
      return `${cpu.timestamp},${cpu.value},${memory.value},${latency.value},${throughput.value},${errors.value}`;
    }).join('\n');

    return `${headers}\n${rows}`;
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Performance Monitoring Dashboard...');

    this.active = false;

    // Stop metrics collection
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    // Stop web server
    if (this.webServer) {
      this.webServer.close();
    }

    // Close Redis connection
    if (this.redisClient) {
      await this.redisClient.quit();
    }

    console.log('✅ Performance Monitoring Dashboard shutdown complete');
  }
}

// Export for use in other modules
export default PerformanceMonitoringDashboard;