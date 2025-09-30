/**
 * Claude SDK Real-Time Monitoring Dashboard
 * Phase 4: Production Optimization
 *
 * Provides comprehensive real-time monitoring and visualization
 */

const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const EventEmitter = require('events');

class MetricsCollector extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      performance: {
        responseTime: [],
        throughput: [],
        errorRate: [],
        cacheHitRate: []
      },
      cost: {
        tokenUsage: [],
        cacheUtilization: [],
        apiCalls: [],
        estimatedCost: 0
      },
      quality: {
        validationSuccess: [],
        testPassRate: [],
        coverageMetrics: [],
        securityIssues: []
      },
      system: {
        cpuUsage: [],
        memoryUsage: [],
        activeAgents: 0,
        queuedTasks: 0
      }
    };

    this.alerts = [];
    this.startTime = Date.now();
  }

  recordMetric(category, metric, value, timestamp = Date.now()) {
    if (this.metrics[category] && this.metrics[category][metric] !== undefined) {
      if (Array.isArray(this.metrics[category][metric])) {
        this.metrics[category][metric].push({ value, timestamp });

        // Keep only last hour of data for arrays
        const oneHourAgo = Date.now() - 3600000;
        this.metrics[category][metric] = this.metrics[category][metric].filter(
          m => m.timestamp > oneHourAgo
        );
      } else {
        this.metrics[category][metric] = value;
      }

      this.emit('metric', { category, metric, value, timestamp });
    }
  }

  getMetrics(category = null, timeWindow = 3600000) {
    const now = Date.now();
    const cutoff = now - timeWindow;

    if (category) {
      return this.filterByTime(this.metrics[category], cutoff);
    }

    const filtered = {};
    for (const [cat, metrics] of Object.entries(this.metrics)) {
      filtered[cat] = this.filterByTime(metrics, cutoff);
    }
    return filtered;
  }

  filterByTime(obj, cutoff) {
    if (Array.isArray(obj)) {
      return obj.filter(m => m.timestamp > cutoff);
    }

    if (typeof obj === 'object' && obj !== null) {
      const filtered = {};
      for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
          filtered[key] = value.filter(m => m.timestamp > cutoff);
        } else if (typeof value === 'object' && value !== null) {
          filtered[key] = this.filterByTime(value, cutoff);
        } else {
          filtered[key] = value;
        }
      }
      return filtered;
    }

    return obj;
  }

  calculateStats(dataPoints) {
    if (!dataPoints || dataPoints.length === 0) {
      return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }

    const values = dataPoints.map(d => d.value).sort((a, b) => a - b);
    const sum = values.reduce((acc, v) => acc + v, 0);

    return {
      min: values[0],
      max: values[values.length - 1],
      avg: sum / values.length,
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
      count: values.length
    };
  }

  getSummary() {
    const uptime = Date.now() - this.startTime;

    return {
      uptime: {
        milliseconds: uptime,
        formatted: this.formatUptime(uptime)
      },
      performance: {
        responseTime: this.calculateStats(this.metrics.performance.responseTime),
        throughput: this.calculateStats(this.metrics.performance.throughput),
        errorRate: this.calculateErrorRate(),
        cacheHitRate: this.calculateCacheHitRate()
      },
      cost: {
        totalTokens: this.metrics.cost.tokenUsage.reduce((sum, m) => sum + m.value, 0),
        estimatedCost: this.metrics.cost.estimatedCost,
        savingsFromCache: this.calculateCacheSavings(),
        apiCallsTotal: this.metrics.cost.apiCalls.length
      },
      quality: {
        validationSuccessRate: this.calculateSuccessRate(this.metrics.quality.validationSuccess),
        averageTestPassRate: this.calculateStats(this.metrics.quality.testPassRate).avg,
        averageCoverage: this.calculateStats(this.metrics.quality.coverageMetrics).avg,
        securityIssuesCount: this.metrics.quality.securityIssues.length
      },
      system: {
        currentCPU: this.getCurrentSystemMetric('cpuUsage'),
        currentMemory: this.getCurrentSystemMetric('memoryUsage'),
        activeAgents: this.metrics.system.activeAgents,
        queuedTasks: this.metrics.system.queuedTasks
      },
      alerts: {
        active: this.alerts.filter(a => !a.resolved).length,
        total: this.alerts.length,
        recent: this.alerts.slice(-10)
      }
    };
  }

  calculateErrorRate() {
    const errorMetrics = this.metrics.performance.errorRate;
    if (errorMetrics.length === 0) return 0;

    const recentErrors = errorMetrics.slice(-100);
    const errorCount = recentErrors.filter(m => m.value > 0).length;
    return errorCount / recentErrors.length;
  }

  calculateCacheHitRate() {
    const cacheMetrics = this.metrics.performance.cacheHitRate;
    if (cacheMetrics.length === 0) return 0;

    const stats = this.calculateStats(cacheMetrics);
    return stats.avg;
  }

  calculateCacheSavings() {
    const hitRate = this.calculateCacheHitRate();
    const totalTokens = this.metrics.cost.tokenUsage.reduce((sum, m) => sum + m.value, 0);
    // Cached tokens save 90% of cost
    return totalTokens * hitRate * 0.9 * 0.003; // $0.003 per 1k tokens
  }

  calculateSuccessRate(metrics) {
    if (metrics.length === 0) return 0;
    const successes = metrics.filter(m => m.value === true).length;
    return successes / metrics.length;
  }

  getCurrentSystemMetric(metric) {
    const metrics = this.metrics.system[metric];
    if (!metrics || metrics.length === 0) return 0;
    return metrics[metrics.length - 1].value;
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  addAlert(alert) {
    this.alerts.push({
      ...alert,
      timestamp: Date.now(),
      resolved: false
    });
    this.emit('alert', alert);
  }

  resolveAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
    }
  }
}

class SDKDashboard {
  constructor(metricsCollector, config = {}) {
    this.collector = metricsCollector || new MetricsCollector();
    this.config = {
      port: config.port || 3000,
      updateInterval: config.updateInterval || 5000,
      authentication: config.authentication || false,
      ...config
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));

    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    // Authentication middleware (if enabled)
    if (this.config.authentication) {
      this.app.use((req, res, next) => {
        const token = req.headers['authorization'];
        if (!token || token !== `Bearer ${process.env.DASHBOARD_TOKEN}`) {
          return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
      });
    }
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        sdk: 'integrated',
        version: '1.0.0',
        uptime: Date.now() - this.collector.startTime
      });
    });

    // Metrics endpoints
    this.app.get('/api/metrics', (req, res) => {
      const timeWindow = parseInt(req.query.window) || 3600000;
      res.json({
        metrics: this.collector.getMetrics(null, timeWindow),
        summary: this.collector.getSummary()
      });
    });

    this.app.get('/api/metrics/:category', (req, res) => {
      const { category } = req.params;
      const timeWindow = parseInt(req.query.window) || 3600000;

      res.json({
        category,
        metrics: this.collector.getMetrics(category, timeWindow),
        stats: this.getStatsForCategory(category)
      });
    });

    // Summary endpoint
    this.app.get('/api/summary', (req, res) => {
      res.json(this.collector.getSummary());
    });

    // Alerts endpoints
    this.app.get('/api/alerts', (req, res) => {
      const active = req.query.active === 'true';
      const alerts = active
        ? this.collector.alerts.filter(a => !a.resolved)
        : this.collector.alerts;

      res.json({
        alerts: alerts.slice(-100),
        activeCount: this.collector.alerts.filter(a => !a.resolved).length,
        totalCount: this.collector.alerts.length
      });
    });

    this.app.post('/api/alerts/:id/resolve', (req, res) => {
      this.collector.resolveAlert(req.params.id);
      res.json({ success: true });
    });

    // Dashboard HTML
    this.app.get('/', (req, res) => {
      res.send(this.getDashboardHTML());
    });

    // Export metrics
    this.app.get('/api/export', async (req, res) => {
      const format = req.query.format || 'json';
      const summary = this.collector.getSummary();

      if (format === 'csv') {
        res.type('text/csv');
        res.send(this.metricsToCSV(summary));
      } else {
        res.json(summary);
      }
    });
  }

  setupWebSocket() {
    // Simple SSE for real-time updates
    this.app.get('/api/stream', (req, res) => {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const sendUpdate = () => {
        const summary = this.collector.getSummary();
        res.write(`data: ${JSON.stringify(summary)}\n\n`);
      };

      const interval = setInterval(sendUpdate, this.config.updateInterval);

      req.on('close', () => {
        clearInterval(interval);
      });
    });
  }

  getStatsForCategory(category) {
    const metrics = this.collector.metrics[category];
    const stats = {};

    for (const [key, values] of Object.entries(metrics)) {
      if (Array.isArray(values)) {
        stats[key] = this.collector.calculateStats(values);
      }
    }

    return stats;
  }

  getDashboardHTML() {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude SDK Monitoring Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0f1419;
            color: #e6edf3;
            padding: 20px;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { margin-bottom: 30px; color: #58a6ff; }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: #161b22;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
        }
        .card h2 {
            font-size: 18px;
            margin-bottom: 15px;
            color: #8b949e;
            font-weight: 600;
        }
        .metric {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
            padding: 8px 0;
            border-bottom: 1px solid #21262d;
        }
        .metric:last-child { border-bottom: none; }
        .metric-label { color: #8b949e; }
        .metric-value {
            font-weight: 600;
            color: #58a6ff;
        }
        .metric-value.success { color: #3fb950; }
        .metric-value.warning { color: #d29922; }
        .metric-value.error { color: #f85149; }
        .status-indicator {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-right: 8px;
        }
        .status-healthy { background: #3fb950; }
        .status-warning { background: #d29922; }
        .status-critical { background: #f85149; }
        .alert {
            background: #1c2128;
            border-left: 3px solid #d29922;
            padding: 12px;
            margin-bottom: 10px;
            border-radius: 4px;
        }
        .alert.critical { border-left-color: #f85149; }
        .chart-placeholder {
            height: 200px;
            background: #0d1117;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #8b949e;
            margin-top: 15px;
        }
        .refresh-indicator {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 8px 16px;
            background: #238636;
            border-radius: 6px;
            opacity: 0;
            transition: opacity 0.3s;
        }
        .refresh-indicator.active { opacity: 1; }
    </style>
</head>
<body>
    <div class="container">
        <h1>
            <span class="status-indicator status-healthy"></span>
            Claude SDK Monitoring Dashboard
        </h1>

        <div class="grid">
            <div class="card">
                <h2>Performance</h2>
                <div id="performance-metrics"></div>
            </div>

            <div class="card">
                <h2>Cost & Efficiency</h2>
                <div id="cost-metrics"></div>
            </div>

            <div class="card">
                <h2>Quality</h2>
                <div id="quality-metrics"></div>
            </div>

            <div class="card">
                <h2>System</h2>
                <div id="system-metrics"></div>
            </div>
        </div>

        <div class="card">
            <h2>Active Alerts</h2>
            <div id="alerts"></div>
        </div>

        <div class="refresh-indicator" id="refresh-indicator">
            Updating...
        </div>
    </div>

    <script>
        const eventSource = new EventSource('/api/stream');
        const refreshIndicator = document.getElementById('refresh-indicator');

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            updateDashboard(data);

            refreshIndicator.classList.add('active');
            setTimeout(() => refreshIndicator.classList.remove('active'), 500);
        };

        function updateDashboard(summary) {
            updatePerformance(summary.performance);
            updateCost(summary.cost);
            updateQuality(summary.quality);
            updateSystem(summary.system);
            updateAlerts(summary.alerts);
        }

        function updatePerformance(perf) {
            const html = \`
                <div class="metric">
                    <span class="metric-label">Avg Response Time</span>
                    <span class="metric-value">\${perf.responseTime.avg.toFixed(0)}ms</span>
                </div>
                <div class="metric">
                    <span class="metric-label">P95 Response Time</span>
                    <span class="metric-value">\${perf.responseTime.p95.toFixed(0)}ms</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Error Rate</span>
                    <span class="metric-value \${perf.errorRate > 0.05 ? 'error' : 'success'}">
                        \${(perf.errorRate * 100).toFixed(2)}%
                    </span>
                </div>
                <div class="metric">
                    <span class="metric-label">Cache Hit Rate</span>
                    <span class="metric-value success">\${(perf.cacheHitRate * 100).toFixed(1)}%</span>
                </div>
            \`;
            document.getElementById('performance-metrics').innerHTML = html;
        }

        function updateCost(cost) {
            const html = \`
                <div class="metric">
                    <span class="metric-label">Total Tokens</span>
                    <span class="metric-value">\${cost.totalTokens.toLocaleString()}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Estimated Cost</span>
                    <span class="metric-value">$\${cost.estimatedCost.toFixed(2)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Cache Savings</span>
                    <span class="metric-value success">$\${cost.savingsFromCache.toFixed(2)}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">API Calls</span>
                    <span class="metric-value">\${cost.apiCallsTotal.toLocaleString()}</span>
                </div>
            \`;
            document.getElementById('cost-metrics').innerHTML = html;
        }

        function updateQuality(quality) {
            const html = \`
                <div class="metric">
                    <span class="metric-label">Validation Success</span>
                    <span class="metric-value success">
                        \${(quality.validationSuccessRate * 100).toFixed(1)}%
                    </span>
                </div>
                <div class="metric">
                    <span class="metric-label">Test Pass Rate</span>
                    <span class="metric-value success">
                        \${quality.averageTestPassRate.toFixed(1)}%
                    </span>
                </div>
                <div class="metric">
                    <span class="metric-label">Avg Coverage</span>
                    <span class="metric-value">\${quality.averageCoverage.toFixed(1)}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Security Issues</span>
                    <span class="metric-value \${quality.securityIssuesCount > 0 ? 'warning' : 'success'}">
                        \${quality.securityIssuesCount}
                    </span>
                </div>
            \`;
            document.getElementById('quality-metrics').innerHTML = html;
        }

        function updateSystem(system) {
            const html = \`
                <div class="metric">
                    <span class="metric-label">CPU Usage</span>
                    <span class="metric-value">\${system.currentCPU.toFixed(1)}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Memory Usage</span>
                    <span class="metric-value">\${system.currentMemory.toFixed(1)}%</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Active Agents</span>
                    <span class="metric-value">\${system.activeAgents}</span>
                </div>
                <div class="metric">
                    <span class="metric-label">Queued Tasks</span>
                    <span class="metric-value">\${system.queuedTasks}</span>
                </div>
            \`;
            document.getElementById('system-metrics').innerHTML = html;
        }

        function updateAlerts(alerts) {
            if (alerts.active === 0) {
                document.getElementById('alerts').innerHTML =
                    '<div class="metric"><span class="metric-value success">No active alerts</span></div>';
                return;
            }

            const html = alerts.recent.map(alert => \`
                <div class="alert \${alert.severity === 'critical' ? 'critical' : ''}">
                    <strong>\${alert.name}</strong>: \${alert.message}
                    <br><small>\${new Date(alert.timestamp).toLocaleString()}</small>
                </div>
            \`).join('');

            document.getElementById('alerts').innerHTML = html;
        }

        // Initial load
        fetch('/api/summary')
            .then(res => res.json())
            .then(updateDashboard);
    </script>
</body>
</html>
    `;
  }

  metricsToCSV(summary) {
    const rows = [
      ['Category', 'Metric', 'Value'],
      ['Performance', 'Avg Response Time', summary.performance.responseTime.avg],
      ['Performance', 'P95 Response Time', summary.performance.responseTime.p95],
      ['Performance', 'Error Rate', summary.performance.errorRate],
      ['Performance', 'Cache Hit Rate', summary.performance.cacheHitRate],
      ['Cost', 'Total Tokens', summary.cost.totalTokens],
      ['Cost', 'Estimated Cost', summary.cost.estimatedCost],
      ['Cost', 'Cache Savings', summary.cost.savingsFromCache],
      ['Quality', 'Validation Success Rate', summary.quality.validationSuccessRate],
      ['Quality', 'Avg Test Pass Rate', summary.quality.averageTestPassRate],
      ['Quality', 'Avg Coverage', summary.quality.averageCoverage],
      ['System', 'Active Agents', summary.system.activeAgents],
      ['System', 'Queued Tasks', summary.system.queuedTasks]
    ];

    return rows.map(row => row.join(',')).join('\n');
  }

  start(callback) {
    this.server = this.app.listen(this.config.port, () => {
      console.log(`\n📊 SDK Dashboard running at http://localhost:${this.config.port}`);
      console.log(`   Real-time updates every ${this.config.updateInterval}ms`);
      console.log(`   Authentication: ${this.config.authentication ? 'Enabled' : 'Disabled'}\n`);

      if (callback) callback();
    });

    return this.server;
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

module.exports = {
  SDKDashboard,
  MetricsCollector
};