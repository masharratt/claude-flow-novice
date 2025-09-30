/**
 * SDK Monitoring Alerts and Notifications
 * Provides comprehensive alerting system for SDK integration monitoring
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class AlertManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      channels: config.channels || ['console', 'file', 'webhook'],
      webhookUrl: config.webhookUrl || process.env.ALERT_WEBHOOK_URL,
      alertsFile: config.alertsFile || './logs/alerts.json',
      severityThresholds: {
        critical: 0,
        high: 5,
        warning: 10,
        info: 20
      },
      ...config
    };

    this.alerts = [];
    this.alertHistory = [];
    this.suppressedAlerts = new Set();
  }

  /**
   * Trigger alert
   */
  async trigger(alert) {
    const enrichedAlert = this.enrichAlert(alert);

    // Check if alert should be suppressed
    if (this.shouldSuppress(enrichedAlert)) {
      return;
    }

    // Add to alerts
    this.alerts.push(enrichedAlert);
    this.alertHistory.push(enrichedAlert);

    // Emit event
    this.emit('alert', enrichedAlert);

    // Send notifications
    await this.notify(enrichedAlert);

    // Keep only last 1000 alerts in memory
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }

    return enrichedAlert;
  }

  /**
   * Enrich alert with metadata
   */
  enrichAlert(alert) {
    return {
      id: alert.id || `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: alert.timestamp || Date.now(),
      name: alert.name,
      severity: alert.severity || 'warning',
      message: alert.message,
      metric: alert.metric,
      currentValue: alert.currentValue,
      threshold: alert.threshold,
      recommendation: alert.recommendation,
      resolved: false,
      resolvedAt: null,
      tags: alert.tags || [],
      metadata: alert.metadata || {}
    };
  }

  /**
   * Check if alert should be suppressed
   */
  shouldSuppress(alert) {
    const key = `${alert.name}-${alert.metric}`;

    // Check if recently triggered
    const recentAlerts = this.alerts.filter(
      a => a.name === alert.name &&
           a.metric === alert.metric &&
           !a.resolved &&
           Date.now() - a.timestamp < 300000 // 5 minutes
    );

    if (recentAlerts.length > 0) {
      this.suppressedAlerts.add(key);
      return true;
    }

    this.suppressedAlerts.delete(key);
    return false;
  }

  /**
   * Send notifications through configured channels
   */
  async notify(alert) {
    const promises = [];

    if (this.config.channels.includes('console')) {
      promises.push(this.notifyConsole(alert));
    }

    if (this.config.channels.includes('file')) {
      promises.push(this.notifyFile(alert));
    }

    if (this.config.channels.includes('webhook') && this.config.webhookUrl) {
      promises.push(this.notifyWebhook(alert));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Console notification
   */
  async notifyConsole(alert) {
    const icon = this.getSeverityIcon(alert.severity);
    const color = this.getSeverityColor(alert.severity);

    console.log(`\n${color}${icon} ALERT: ${alert.name}${'\x1b[0m'}`);
    console.log(`   Severity: ${alert.severity.toUpperCase()}`);
    console.log(`   Message: ${alert.message}`);
    console.log(`   Metric: ${alert.metric}`);
    console.log(`   Current: ${alert.currentValue}`);
    console.log(`   Threshold: ${alert.threshold}`);
    console.log(`   Recommendation: ${alert.recommendation}`);
    console.log(`   Time: ${new Date(alert.timestamp).toISOString()}\n`);
  }

  /**
   * File notification
   */
  async notifyFile(alert) {
    try {
      const alertsDir = path.dirname(this.config.alertsFile);
      await fs.mkdir(alertsDir, { recursive: true });

      let alerts = [];
      try {
        const content = await fs.readFile(this.config.alertsFile, 'utf8');
        alerts = JSON.parse(content);
      } catch (err) {
        // File doesn't exist yet
      }

      alerts.push(alert);

      // Keep only last 10000 alerts in file
      if (alerts.length > 10000) {
        alerts = alerts.slice(-10000);
      }

      await fs.writeFile(
        this.config.alertsFile,
        JSON.stringify(alerts, null, 2)
      );
    } catch (error) {
      console.error('Failed to write alert to file:', error);
    }
  }

  /**
   * Webhook notification
   */
  async notifyWebhook(alert) {
    try {
      const payload = {
        alert_id: alert.id,
        timestamp: new Date(alert.timestamp).toISOString(),
        severity: alert.severity,
        name: alert.name,
        message: alert.message,
        metric: alert.metric,
        current_value: alert.currentValue,
        threshold: alert.threshold,
        recommendation: alert.recommendation,
        tags: alert.tags,
        metadata: alert.metadata
      };

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }
    } catch (error) {
      console.error('Failed to send webhook notification:', error);
    }
  }

  /**
   * Resolve alert
   */
  async resolve(alertId, resolution = {}) {
    const alert = this.alerts.find(a => a.id === alertId);

    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    if (alert.resolved) {
      return alert;
    }

    alert.resolved = true;
    alert.resolvedAt = Date.now();
    alert.resolution = resolution;

    this.emit('resolved', alert);

    // Notify resolution
    await this.notifyResolution(alert);

    return alert;
  }

  /**
   * Notify alert resolution
   */
  async notifyResolution(alert) {
    if (this.config.channels.includes('console')) {
      console.log(`\n✅ ALERT RESOLVED: ${alert.name}`);
      console.log(`   Resolved at: ${new Date(alert.resolvedAt).toISOString()}`);
      console.log(`   Duration: ${((alert.resolvedAt - alert.timestamp) / 1000).toFixed(0)}s\n`);
    }

    if (this.config.channels.includes('file')) {
      await this.notifyFile(alert);
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(severity = null) {
    let alerts = this.alerts.filter(a => !a.resolved);

    if (severity) {
      alerts = alerts.filter(a => a.severity === severity);
    }

    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Get alert statistics
   */
  getStats() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;

    const activeAlerts = this.alerts.filter(a => !a.resolved);
    const recentAlerts = this.alerts.filter(a => a.timestamp > oneHourAgo);
    const todayAlerts = this.alerts.filter(a => a.timestamp > oneDayAgo);

    return {
      total: this.alerts.length,
      active: activeAlerts.length,
      resolved: this.alerts.filter(a => a.resolved).length,
      lastHour: recentAlerts.length,
      last24Hours: todayAlerts.length,
      bySeverity: {
        critical: activeAlerts.filter(a => a.severity === 'critical').length,
        high: activeAlerts.filter(a => a.severity === 'high').length,
        warning: activeAlerts.filter(a => a.severity === 'warning').length,
        info: activeAlerts.filter(a => a.severity === 'info').length
      },
      topAlerts: this.getTopAlerts(5)
    };
  }

  /**
   * Get most frequent alerts
   */
  getTopAlerts(limit = 5) {
    const counts = {};

    this.alerts.forEach(alert => {
      const key = `${alert.name}-${alert.metric}`;
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => ({ name: key, count }));
  }

  /**
   * Clear resolved alerts
   */
  clearResolved() {
    const before = this.alerts.length;
    this.alerts = this.alerts.filter(a => !a.resolved);
    const cleared = before - this.alerts.length;

    console.log(`Cleared ${cleared} resolved alerts`);
    return cleared;
  }

  /**
   * Get severity icon
   */
  getSeverityIcon(severity) {
    const icons = {
      critical: '🚨',
      high: '⚠️',
      warning: '⚡',
      info: 'ℹ️'
    };
    return icons[severity] || '•';
  }

  /**
   * Get severity color (ANSI)
   */
  getSeverityColor(severity) {
    const colors = {
      critical: '\x1b[31m', // Red
      high: '\x1b[33m',     // Yellow
      warning: '\x1b[35m',  // Magenta
      info: '\x1b[36m'      // Cyan
    };
    return colors[severity] || '\x1b[37m'; // White
  }
}

/**
 * Pre-configured alert rules
 */
class AlertRules {
  constructor(alertManager) {
    this.manager = alertManager;
    this.rules = this.getDefaultRules();
  }

  getDefaultRules() {
    return [
      {
        name: 'high-error-rate',
        metric: 'errorRate',
        threshold: 0.05, // 5%
        window: 300000, // 5 minutes
        severity: 'critical',
        message: 'Error rate exceeds 5%',
        recommendation: 'Investigate errors immediately. Consider rollback if errors persist.'
      },
      {
        name: 'validation-failure-spike',
        metric: 'validationFailureRate',
        threshold: 0.2, // 20%
        window: 300000,
        severity: 'high',
        message: 'Validation failure rate above 20%',
        recommendation: 'Review validation configuration and agent quality.'
      },
      {
        name: 'low-cache-hit-rate',
        metric: 'cacheHitRate',
        threshold: 0.3, // 30%
        window: 600000, // 10 minutes
        severity: 'warning',
        message: 'Cache hit rate below 30%',
        recommendation: 'Review cache configuration and query patterns.'
      },
      {
        name: 'high-response-time',
        metric: 'responseTimeP95',
        threshold: 10000, // 10 seconds
        window: 300000,
        severity: 'high',
        message: 'P95 response time exceeds 10 seconds',
        recommendation: 'Check for performance bottlenecks and system load.'
      },
      {
        name: 'high-token-usage',
        metric: 'tokenUsage',
        threshold: 100000, // per hour
        window: 3600000,
        severity: 'warning',
        message: 'Token usage exceeds 100k per hour',
        recommendation: 'Review token optimization and caching effectiveness.'
      },
      {
        name: 'low-validation-success',
        metric: 'validationSuccess',
        threshold: 0.9, // 90%
        window: 600000,
        severity: 'warning',
        message: 'Validation success rate below 90%',
        recommendation: 'Review code quality and validation thresholds.'
      },
      {
        name: 'high-memory-usage',
        metric: 'memoryUsage',
        threshold: 0.85, // 85%
        window: 300000,
        severity: 'high',
        message: 'Memory usage exceeds 85%',
        recommendation: 'Check for memory leaks and consider scaling resources.'
      },
      {
        name: 'high-cpu-usage',
        metric: 'cpuUsage',
        threshold: 0.9, // 90%
        window: 300000,
        severity: 'high',
        message: 'CPU usage exceeds 90%',
        recommendation: 'Check for CPU-intensive operations and consider scaling.'
      }
    ];
  }

  /**
   * Check metrics against rules
   */
  async check(metrics) {
    const alerts = [];

    for (const rule of this.rules) {
      const value = this.extractMetricValue(metrics, rule.metric);

      if (value === null || value === undefined) {
        continue;
      }

      const violated = this.checkThreshold(value, rule.threshold, rule.metric);

      if (violated) {
        const alert = await this.manager.trigger({
          name: rule.name,
          metric: rule.metric,
          currentValue: value,
          threshold: rule.threshold,
          severity: rule.severity,
          message: rule.message,
          recommendation: rule.recommendation,
          tags: ['automated', 'rule-based']
        });

        if (alert) {
          alerts.push(alert);
        }
      }
    }

    return alerts;
  }

  /**
   * Extract metric value from nested object
   */
  extractMetricValue(metrics, path) {
    const parts = path.split('.');
    let value = metrics;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return null;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * Check if threshold is violated
   */
  checkThreshold(value, threshold, metric) {
    // Metrics where lower is better
    const lowerIsBetter = ['errorRate', 'validationFailureRate', 'responseTime', 'tokenUsage'];

    if (lowerIsBetter.some(m => metric.includes(m))) {
      return value > threshold;
    }

    // Metrics where higher is better (like cacheHitRate, validationSuccess)
    return value < threshold;
  }
}

module.exports = {
  AlertManager,
  AlertRules
};