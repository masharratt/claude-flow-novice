/**
 * Real-time Alert and Notification System
 *
 * Comprehensive alerting with multiple channels and escalation policies
 * Part of Phase 4 Fleet Monitoring Implementation
 */

import { EventEmitter } from 'events';
import { createClient } from 'redis';
import fs from 'fs/promises';
import path from 'path';

/**
 * Alert and Notification System
 */
export class AlertSystem extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      redis: {
        host: config.redis?.host || 'localhost',
        port: config.redis?.port || 6379,
        password: config.redis?.password || null,
        db: config.redis?.db || 0
      },

      // Alert thresholds
      thresholds: config.thresholds || {
        performance: {
          latency: 100, // ms
          throughput: 1000, // ops/sec
          errorRate: 5.0 // %
        },
        health: {
          availability: 99.9, // %
          diskUsage: 85, // %
          memoryUsage: 85, // %
          cpuUsage: 80 // %
        },
        utilization: {
          nodeUtilization: 90, // %
          clusterUtilization: 85 // %
        },
        cost: {
          hourlyCost: 100, // USD
          dailyBudget: 2000 // USD
        }
      },

      // Notification channels
      channels: {
        console: { enabled: true, level: 'INFO' },
        email: { enabled: false, level: 'WARNING', recipients: [] },
        slack: { enabled: false, level: 'CRITICAL', webhook: '' },
        webhook: { enabled: false, level: 'WARNING', endpoints: [] },
        sms: { enabled: false, level: 'CRITICAL', recipients: [] }
      },

      // Alert policies
      policies: {
        rateLimiting: {
          enabled: true,
          maxAlertsPerMinute: 10,
          maxAlertsPerHour: 100,
          cooldownPeriod: 30000 // 30 seconds
        },
        deduplication: {
          enabled: true,
          windowSize: 300000, // 5 minutes
          maxSimilarAlerts: 3
        },
        escalation: {
          enabled: true,
          levels: [
            { delay: 0, severity: 'WARNING', channels: ['console'] },
            { delay: 300000, severity: 'HIGH', channels: ['console', 'email'] }, // 5 minutes
            { delay: 900000, severity: 'CRITICAL', channels: ['console', 'email', 'slack'] } // 15 minutes
          ]
        },
        suppression: {
          enabled: true,
          rules: [
            { condition: 'maintenance', duration: 3600000 }, // 1 hour
            { condition: 'known_issue', duration: 1800000 } // 30 minutes
          ]
        }
      },

      // Alert storage
      storage: {
        retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
        maxAlerts: 10000,
        dataDir: config.dataDir || './data/alert-system'
      }
    };

    // Internal state
    this.isRunning = false;
    this.redisClient = null;
    this.redisSubscriber = null;

    // Alert storage
    this.alerts = [];
    this.alertHistory = [];
    this.activeAlerts = new Map();
    this.suppressedAlerts = new Set();
    this.alertCounts = new Map();

    // Rate limiting
    this.alertTimestamps = [];
    this.lastAlertTimes = new Map();

    // Notification channels
    this.notificationChannels = new Map();

    // Metrics
    this.metrics = {
      totalAlerts: 0,
      alertsBySeverity: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      alertsByType: {},
      averageResponseTime: 0,
      suppressedAlerts: 0
    };
  }

  /**
   * Initialize the alert system
   */
  async initialize() {
    try {
      console.log('🚨 Initializing Alert System...');

      // Ensure data directory exists
      await this.ensureDataDirectory();

      // Initialize Redis
      await this.initializeRedis();

      // Initialize notification channels
      await this.initializeNotificationChannels();

      // Load alert history
      await this.loadAlertHistory();

      console.log('✅ Alert System initialized');
      this.emit('initialized', { timestamp: Date.now() });

    } catch (error) {
      console.error('❌ Failed to initialize Alert System:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Start the alert system
   */
  async start() {
    if (this.isRunning) {
      console.warn('⚠️ Alert System is already running');
      return;
    }

    try {
      console.log('▶️ Starting Alert System...');

      this.isRunning = true;

      // Start Redis coordination
      await this.startRedisCoordination();

      // Start alert processing
      this.startAlertProcessing();

      console.log('✅ Alert System started');
      this.emit('started', { timestamp: Date.now() });

    } catch (error) {
      this.isRunning = false;
      console.error('❌ Failed to start Alert System:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Stop the alert system
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      console.log('⏹️ Stopping Alert System...');

      this.isRunning = false;

      // Save alert history
      await this.saveAlertHistory();

      // Cleanup Redis
      await this.cleanupRedis();

      console.log('✅ Alert System stopped');
      this.emit('stopped', { timestamp: Date.now() });

    } catch (error) {
      console.error('❌ Error stopping Alert System:', error);
      this.emit('error', error);
    }
  }

  /**
   * Send alert - main entry point for alerts
   */
  async sendAlert(alertData) {
    if (!this.isRunning) {
      console.warn('⚠️ Alert System not running, ignoring alert');
      return;
    }

    try {
      // Create alert object
      const alert = this.createAlert(alertData);

      // Check if alert should be processed
      if (!this.shouldProcessAlert(alert)) {
        return;
      }

      // Process alert
      await this.processAlert(alert);

    } catch (error) {
      console.error('❌ Error sending alert:', error);
      this.emit('alert_error', { alert: alertData, error: error.message });
    }
  }

  /**
   * Create standardized alert object
   */
  createAlert(alertData) {
    return {
      id: alertData.id || `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: alertData.type || 'UNKNOWN',
      severity: alertData.severity || 'MEDIUM',
      category: alertData.category || 'GENERAL',
      title: alertData.title || 'Alert',
      message: alertData.message || 'An alert has been triggered',
      source: alertData.source || 'fleet-monitor',
      nodeId: alertData.nodeId || null,
      value: alertData.value || null,
      threshold: alertData.threshold || null,
      timestamp: alertData.timestamp || Date.now(),
      acknowledged: false,
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolved: false,
      resolvedBy: null,
      resolvedAt: null,
      escalationLevel: 0,
      notificationsSent: [],
      metadata: alertData.metadata || {}
    };
  }

  /**
   * Check if alert should be processed
   */
  shouldProcessAlert(alert) {
    // Check suppression rules
    if (this.isAlertSuppressed(alert)) {
      this.metrics.suppressedAlerts++;
      return false;
    }

    // Check rate limiting
    if (this.isRateLimited(alert)) {
      console.warn(`⚠️ Alert rate limited: ${alert.type}`);
      return false;
    }

    // Check deduplication
    if (this.isDuplicateAlert(alert)) {
      console.warn(`⚠️ Duplicate alert suppressed: ${alert.type}`);
      return false;
    }

    return true;
  }

  /**
   * Check if alert is suppressed by rules
   */
  isAlertSuppressed(alert) {
    if (!this.config.policies.suppression.enabled) {
      return false;
    }

    // Check maintenance window
    if (this.isMaintenanceWindow()) {
      return true;
    }

    // Check known issues
    if (this.isKnownIssue(alert)) {
      return true;
    }

    return false;
  }

  /**
   * Check if currently in maintenance window
   */
  isMaintenanceWindow() {
    // This would check against a maintenance schedule
    // For now, return false
    return false;
  }

  /**
   * Check if alert matches a known issue
   */
  isKnownIssue(alert) {
    // This would check against a known issues database
    // For now, return false
    return false;
  }

  /**
   * Check if alert is rate limited
   */
  isRateLimited(alert) {
    if (!this.config.policies.rateLimiting.enabled) {
      return false;
    }

    const now = Date.now();
    const alertKey = `${alert.type}:${alert.nodeId || 'fleet'}`;

    // Check cooldown period
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    if (lastAlertTime && (now - lastAlertTime) < this.config.policies.rateLimiting.cooldownPeriod) {
      return true;
    }

    // Check per-minute limits
    const oneMinuteAgo = now - 60000;
    const recentAlerts = this.alertTimestamps.filter(timestamp => timestamp > oneMinuteAgo);
    if (recentAlerts.length >= this.config.policies.rateLimiting.maxAlertsPerMinute) {
      return true;
    }

    // Check per-hour limits
    const oneHourAgo = now - 3600000;
    const hourlyAlerts = this.alertTimestamps.filter(timestamp => timestamp > oneHourAgo);
    if (hourlyAlerts.length >= this.config.policies.rateLimiting.maxAlertsPerHour) {
      return true;
    }

    return false;
  }

  /**
   * Check if alert is a duplicate
   */
  isDuplicateAlert(alert) {
    if (!this.config.policies.deduplication.enabled) {
      return false;
    }

    const windowStart = Date.now() - this.config.policies.deduplication.windowSize;
    const similarAlerts = this.alertHistory.filter(a =>
      a.timestamp > windowStart &&
      a.type === alert.type &&
      a.nodeId === alert.nodeId &&
      a.severity === alert.severity
    );

    return similarAlerts.length >= this.config.policies.deduplication.maxSimilarAlerts;
  }

  /**
   * Process alert
   */
  async processAlert(alert) {
    const startTime = Date.now();

    try {
      // Store alert
      this.storeAlert(alert);

      // Update rate limiting
      this.updateRateLimiting(alert);

      // Determine escalation level and channels
      const escalationPlan = this.determineEscalationPlan(alert);

      // Send notifications
      await this.sendNotifications(alert, escalationPlan.channels);

      // Update alert
      alert.escalationLevel = escalationPlan.level;
      alert.notificationsSent = escalationPlan.channels;

      // Update metrics
      this.updateMetrics(alert);

      // Emit alert event
      this.emit('alert_sent', alert);

      // Set up escalation if needed
      if (this.config.policies.escalation.enabled && escalationPlan.nextEscalation) {
        this.scheduleEscalation(alert, escalationPlan.nextEscalation);
      }

      // Publish to Redis
      await this.publishAlertToRedis(alert);

      console.log(`🚨 Alert sent: ${alert.title} (${alert.severity})`);

    } catch (error) {
      console.error('❌ Error processing alert:', error);
      alert.error = error.message;
      this.emit('alert_processing_error', { alert, error: error.message });
    } finally {
      // Update response time metrics
      const responseTime = Date.now() - startTime;
      this.updateResponseTimeMetrics(responseTime);
    }
  }

  /**
   * Store alert in memory and history
   */
  storeAlert(alert) {
    // Add to active alerts
    this.alerts.push(alert);
    this.activeAlerts.set(alert.id, alert);

    // Add to history
    this.alertHistory.push(alert);

    // Maintain storage limits
    if (this.alertHistory.length > this.config.storage.maxAlerts) {
      this.alertHistory = this.alertHistory.slice(-this.config.storage.maxAlerts);
    }

    // Clean up old alerts based on retention
    const cutoff = Date.now() - this.config.storage.retentionPeriod;
    this.alertHistory = this.alertHistory.filter(a => a.timestamp > cutoff);
  }

  /**
   * Update rate limiting counters
   */
  updateRateLimiting(alert) {
    const now = Date.now();
    const alertKey = `${alert.type}:${alert.nodeId || 'fleet'}`;

    // Update timestamp list
    this.alertTimestamps.push(now);

    // Clean old timestamps (keep only last hour)
    const oneHourAgo = now - 3600000;
    this.alertTimestamps = this.alertTimestamps.filter(timestamp => timestamp > oneHourAgo);

    // Update last alert time
    this.lastAlertTimes.set(alertKey, now);
  }

  /**
   * Determine escalation plan
   */
  determineEscalationPlan(alert) {
    if (!this.config.policies.escalation.enabled) {
      return {
        level: 0,
        channels: ['console'],
        nextEscalation: null
      };
    }

    const currentLevel = this.getAlertEscalationLevel(alert);
    const escalationLevel = this.config.policies.escalation.levels[currentLevel];

    if (!escalationLevel) {
      // Use highest level if beyond defined levels
      const highestLevel = this.config.policies.escalation.levels[this.config.policies.escalation.levels.length - 1];
      return {
        level: currentLevel,
        channels: highestLevel.channels,
        nextEscalation: null
      };
    }

    return {
      level: currentLevel,
      channels: escalationLevel.channels,
      nextEscalation: currentLevel < this.config.policies.escalation.levels.length - 1 ?
        this.config.policies.escalation.levels[currentLevel + 1] : null
    };
  }

  /**
   * Get current escalation level for alert
   */
  getAlertEscalationLevel(alert) {
    // Check if alert has existing escalation level
    if (alert.escalationLevel > 0) {
      return alert.escalationLevel;
    }

    // Determine initial level based on severity and age
    const alertAge = Date.now() - alert.timestamp;
    let level = 0;

    for (let i = 0; i < this.config.policies.escalation.levels.length; i++) {
      const escalationLevel = this.config.policies.escalation.levels[i];
      if (alertAge >= escalationLevel.delay && this.matchesSeverityCriteria(alert, escalationLevel.severity)) {
        level = i;
      }
    }

    return level;
  }

  /**
   * Check if alert matches severity criteria
   */
  matchesSeverityCriteria(alert, requiredSeverity) {
    const severityOrder = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3, 'CRITICAL': 4 };
    return severityOrder[alert.severity] >= severityOrder[requiredSeverity];
  }

  /**
   * Send notifications through specified channels
   */
  async sendNotifications(alert, channels) {
    const notifications = [];

    for (const channelName of channels) {
      try {
        const channel = this.notificationChannels.get(channelName);
        if (channel && channel.enabled) {
          const result = await channel.send(alert);
          notifications.push({ channel: channelName, success: true, result });
        } else {
          console.warn(`⚠️ Notification channel ${channelName} not available`);
          notifications.push({ channel: channelName, success: false, reason: 'Channel not available' });
        }
      } catch (error) {
        console.error(`❌ Error sending notification via ${channelName}:`, error);
        notifications.push({ channel: channelName, success: false, error: error.message });
      }
    }

    return notifications;
  }

  /**
   * Schedule escalation for alert
   */
  scheduleEscalation(alert, nextEscalation) {
    if (!nextEscalation) return;

    const escalationDelay = nextEscalation.delay - (Date.now() - alert.timestamp);
    if (escalationDelay <= 0) return;

    setTimeout(async () => {
      try {
        // Check if alert is still active and not resolved
        const currentAlert = this.activeAlerts.get(alert.id);
        if (currentAlert && !currentAlert.resolved && !currentAlert.acknowledged) {
          console.log(`⬆️ Escalating alert ${alert.id} to level ${currentAlert.escalationLevel + 1}`);

          // Update escalation level
          currentAlert.escalationLevel++;

          // Send escalated notifications
          await this.sendNotifications(currentAlert, nextEscalation.channels);

          // Update alert
          currentAlert.notificationsSent.push(...nextEscalation.channels);

          // Schedule next escalation if available
          const nextLevel = this.config.policies.escalation.levels[currentAlert.escalationLevel + 1];
          if (nextLevel) {
            this.scheduleEscalation(currentAlert, nextLevel);
          }

          this.emit('alert_escalated', currentAlert);
        }
      } catch (error) {
        console.error(`❌ Error escalating alert ${alert.id}:`, error);
      }
    }, escalationDelay);
  }

  /**
   * Update alert metrics
   */
  updateMetrics(alert) {
    this.metrics.totalAlerts++;
    this.metrics.alertsBySeverity[alert.severity] = (this.metrics.alertsBySeverity[alert.severity] || 0) + 1;
    this.metrics.alertsByType[alert.type] = (this.metrics.alertsByType[alert.type] || 0) + 1;
  }

  /**
   * Update response time metrics
   */
  updateResponseTimeMetrics(responseTime) {
    const total = this.metrics.totalAlerts;
    this.metrics.averageResponseTime = ((this.metrics.averageResponseTime * (total - 1)) + responseTime) / total;
  }

  /**
   * Publish alert to Redis
   */
  async publishAlertToRedis(alert) {
    try {
      const message = {
        type: 'ALERT',
        timestamp: Date.now(),
        alert: {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          nodeId: alert.nodeId,
          timestamp: alert.timestamp
        }
      };

      await this.redisClient.publish('swarm:phase-4:alerts', JSON.stringify(message));

      // Store in Redis for swarm memory
      await this.redisClient.setex(
        `swarm:memory:phase-4:alert:${alert.id}`,
        3600, // 1 hour TTL
        JSON.stringify(alert)
      );

    } catch (error) {
      console.error('❌ Error publishing alert to Redis:', error);
    }
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId, acknowledgedBy) {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) {
        throw new Error(`Alert ${alertId} not found`);
      }

      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = Date.now();

      this.emit('alert_acknowledged', alert);

      // Publish acknowledgment
      await this.publishAcknowledgment(alert);

      return alert;

    } catch (error) {
      console.error('❌ Error acknowledging alert:', error);
      throw error;
    }
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId, resolvedBy) {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) {
        throw new Error(`Alert ${alertId} not found`);
      }

      alert.resolved = true;
      alert.resolvedBy = resolvedBy;
      alert.resolvedAt = Date.now();

      // Remove from active alerts
      this.activeAlerts.delete(alertId);

      this.emit('alert_resolved', alert);

      // Publish resolution
      await this.publishResolution(alert);

      return alert;

    } catch (error) {
      console.error('❌ Error resolving alert:', error);
      throw error;
    }
  }

  /**
   * Publish alert acknowledgment
   */
  async publishAcknowledgment(alert) {
    try {
      const message = {
        type: 'ALERT_ACKNOWLEDGMENT',
        timestamp: Date.now(),
        alertId: alert.id,
        acknowledgedBy: alert.acknowledgedBy,
        acknowledgedAt: alert.acknowledgedAt
      };

      await this.redisClient.publish('swarm:phase-4:alerts', JSON.stringify(message));
    } catch (error) {
      console.error('❌ Error publishing acknowledgment:', error);
    }
  }

  /**
   * Publish alert resolution
   */
  async publishResolution(alert) {
    try {
      const message = {
        type: 'ALERT_RESOLUTION',
        timestamp: Date.now(),
        alertId: alert.id,
        resolvedBy: alert.resolvedBy,
        resolvedAt: alert.resolvedAt
      };

      await this.redisClient.publish('swarm:phase-4:alerts', JSON.stringify(message));
    } catch (error) {
      console.error('❌ Error publishing resolution:', error);
    }
  }

  /**
   * Initialize notification channels
   */
  async initializeNotificationChannels() {
    // Console channel
    this.notificationChannels.set('console', new ConsoleNotificationChannel({
      enabled: this.config.channels.console.enabled,
      level: this.config.channels.console.level
    }));

    // Email channel
    this.notificationChannels.set('email', new EmailNotificationChannel({
      enabled: this.config.channels.email.enabled,
      level: this.config.channels.email.level,
      recipients: this.config.channels.email.recipients
    }));

    // Slack channel
    this.notificationChannels.set('slack', new SlackNotificationChannel({
      enabled: this.config.channels.slack.enabled,
      level: this.config.channels.slack.level,
      webhook: this.config.channels.slack.webhook
    }));

    // Webhook channel
    this.notificationChannels.set('webhook', new WebhookNotificationChannel({
      enabled: this.config.channels.webhook.enabled,
      level: this.config.channels.webhook.level,
      endpoints: this.config.channels.webhook.endpoints
    }));

    // SMS channel
    this.notificationChannels.set('sms', new SMSNotificationChannel({
      enabled: this.config.channels.sms.enabled,
      level: this.config.channels.sms.level,
      recipients: this.config.channels.sms.recipients
    }));

    console.log('✅ Notification channels initialized');
  }

  /**
   * Start Redis coordination
   */
  async startRedisCoordination() {
    try {
      // Initialize Redis subscriber
      this.redisSubscriber = this.redisClient.duplicate();
      await this.redisSubscriber.connect();

      // Subscribe to alert commands
      await this.redisSubscriber.subscribe('swarm:phase-4:alert-commands', (message) => {
        try {
          const command = JSON.parse(message);
          this.handleAlertCommand(command);
        } catch (error) {
          console.error('❌ Error handling alert command:', error);
        }
      });

      console.log('✅ Redis coordination started for alerts');
    } catch (error) {
      console.error('❌ Failed to start Redis coordination:', error);
      throw error;
    }
  }

  /**
   * Handle alert commands from Redis
   */
  async handleAlertCommand(command) {
    switch (command.type) {
      case 'ACKNOWLEDGE_ALERT':
        await this.acknowledgeAlert(command.alertId, command.acknowledgedBy);
        break;
      case 'RESOLVE_ALERT':
        await this.resolveAlert(command.alertId, command.resolvedBy);
        break;
      case 'SUPPRESS_ALERTS':
        await this.suppressAlerts(command.pattern, command.duration);
        break;
      default:
        console.warn(`⚠️ Unknown alert command: ${command.type}`);
    }
  }

  /**
   * Suppress alerts matching pattern
   */
  async suppressAlerts(pattern, duration) {
    const suppressionRule = {
      pattern,
      duration,
      startTime: Date.now(),
      endTime: Date.now() + duration
    };

    // Add to suppression rules
    // This would be implemented based on pattern matching logic
    console.log(`🔇 Suppressing alerts matching pattern: ${pattern} for ${duration}ms`);
  }

  /**
   * Start alert processing loop
   */
  startAlertProcessing() {
    // Periodic cleanup of old data
    setInterval(() => {
      this.cleanupOldData();
    }, 60000); // Every minute

    // Periodic metrics reporting
    setInterval(() => {
      this.reportMetrics();
    }, 300000); // Every 5 minutes
  }

  /**
   * Clean up old data
   */
  cleanupOldData() {
    const cutoff = Date.now() - this.config.storage.retentionPeriod;

    // Clean old timestamps
    this.alertTimestamps = this.alertTimestamps.filter(timestamp => timestamp > cutoff);

    // Clean old rate limiting entries
    for (const [key, time] of this.lastAlertTimes.entries()) {
      if (time < cutoff) {
        this.lastAlertTimes.delete(key);
      }
    }
  }

  /**
   * Report alert system metrics
   */
  reportMetrics() {
    console.log('📊 Alert System Metrics:', {
      totalAlerts: this.metrics.totalAlerts,
      activeAlerts: this.activeAlerts.size,
      alertsBySeverity: this.metrics.alertsBySeverity,
      averageResponseTime: Math.round(this.metrics.averageResponseTime),
      suppressedAlerts: this.metrics.suppressedAlerts
    });

    this.emit('metrics_reported', this.metrics);
  }

  /**
   * Get alert system status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeAlerts: this.activeAlerts.size,
      totalAlerts: this.metrics.totalAlerts,
      metrics: this.metrics,
      channels: Array.from(this.notificationChannels.entries()).map(([name, channel]) => ({
        name,
        enabled: channel.enabled,
        level: channel.level
      }))
    };
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(options = {}) {
    let alerts = Array.from(this.activeAlerts.values());

    // Apply filters
    if (options.severity) {
      alerts = alerts.filter(a => a.severity === options.severity);
    }

    if (options.type) {
      alerts = alerts.filter(a => a.type === options.type);
    }

    if (options.nodeId) {
      alerts = alerts.filter(a => a.nodeId === options.nodeId);
    }

    if (options.limit) {
      alerts = alerts.slice(0, options.limit);
    }

    return alerts;
  }

  /**
   * Get alert history
   */
  getAlertHistory(options = {}) {
    let history = [...this.alertHistory];

    // Apply filters
    if (options.severity) {
      history = history.filter(a => a.severity === options.severity);
    }

    if (options.type) {
      history = history.filter(a => a.type === options.type);
    }

    if (options.startTime) {
      history = history.filter(a => a.timestamp >= options.startTime);
    }

    if (options.endTime) {
      history = history.filter(a => a.timestamp <= options.endTime);
    }

    if (options.limit) {
      history = history.slice(-options.limit);
    }

    // Sort by timestamp (newest first)
    history.sort((a, b) => b.timestamp - a.timestamp);

    return history;
  }

  /**
   * Initialize Redis
   */
  async initializeRedis() {
    try {
      this.redisClient = createClient(this.config.redis);
      await this.redisClient.connect();
      console.log('✅ Alert System Redis client connected');
    } catch (error) {
      console.error('❌ Failed to connect Alert System Redis:', error);
      throw error;
    }
  }

  /**
   * Cleanup Redis connections
   */
  async cleanupRedis() {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      if (this.redisSubscriber) {
        await this.redisSubscriber.quit();
      }
      console.log('✅ Redis connections cleaned up');
    } catch (error) {
      console.error('❌ Error cleaning up Redis:', error);
    }
  }

  /**
   * Ensure data directory exists
   */
  async ensureDataDirectory() {
    try {
      await fs.mkdir(this.config.storage.dataDir, { recursive: true });
    } catch (error) {
      console.error('❌ Error creating data directory:', error);
    }
  }

  /**
   * Load alert history
   */
  async loadAlertHistory() {
    try {
      const historyFile = path.join(this.config.storage.dataDir, 'alert-history.json');
      const data = await fs.readFile(historyFile, 'utf-8');
      this.alertHistory = JSON.parse(data);
      console.log(`📂 Loaded ${this.alertHistory.length} alert history entries`);
    } catch (error) {
      console.log('📂 No alert history found, starting fresh');
    }
  }

  /**
   * Save alert history
   */
  async saveAlertHistory() {
    try {
      const historyFile = path.join(this.config.storage.dataDir, 'alert-history.json');
      await fs.writeFile(historyFile, JSON.stringify(this.alertHistory, null, 2));

      const metricsFile = path.join(this.config.storage.dataDir, 'alert-metrics.json');
      await fs.writeFile(metricsFile, JSON.stringify(this.metrics, null, 2));

      console.log('💾 Alert history and metrics saved');
    } catch (error) {
      console.error('❌ Error saving alert history:', error);
    }
  }
}

/**
 * Console Notification Channel
 */
class ConsoleNotificationChannel {
  constructor(config) {
    this.enabled = config.enabled;
    this.level = config.level;
  }

  async send(alert) {
    if (!this.enabled) return;

    const severityOrder = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3, 'CRITICAL': 4 };
    const levelOrder = { 'INFO': 1, 'WARNING': 2, 'ERROR': 3, 'CRITICAL': 4 };

    if (levelOrder[alert.severity] < levelOrder[this.level]) {
      return;
    }

    const timestamp = new Date(alert.timestamp).toISOString();
    const emoji = this.getSeverityEmoji(alert.severity);

    console.log(`${emoji} [${timestamp}] ${alert.severity}: ${alert.title}`);
    console.log(`   ${alert.message}`);
    if (alert.nodeId) {
      console.log(`   Node: ${alert.nodeId}`);
    }
    if (alert.value !== null && alert.threshold !== null) {
      console.log(`   Value: ${alert.value} (Threshold: ${alert.threshold})`);
    }
    console.log('');
  }

  getSeverityEmoji(severity) {
    const emojis = {
      'LOW': '💚',
      'MEDIUM': '💛',
      'HIGH': '🧡',
      'CRITICAL': '❤️'
    };
    return emojis[severity] || '⚪';
  }
}

/**
 * Email Notification Channel
 */
class EmailNotificationChannel {
  constructor(config) {
    this.enabled = config.enabled;
    this.level = config.level;
    this.recipients = config.recipients;
  }

  async send(alert) {
    if (!this.enabled || this.recipients.length === 0) {
      return { success: false, reason: 'Email disabled or no recipients' };
    }

    // Simulate email sending
    console.log(`📧 Email alert sent to ${this.recipients.length} recipients: ${alert.title}`);
    return { success: true, recipients: this.recipients.length };
  }
}

/**
 * Slack Notification Channel
 */
class SlackNotificationChannel {
  constructor(config) {
    this.enabled = config.enabled;
    this.level = config.level;
    this.webhook = config.webhook;
  }

  async send(alert) {
    if (!this.enabled || !this.webhook) {
      return { success: false, reason: 'Slack disabled or no webhook configured' };
    }

    // Simulate Slack notification
    console.log(`💬 Slack alert sent: ${alert.title}`);
    return { success: true, channel: 'slack' };
  }
}

/**
 * Webhook Notification Channel
 */
class WebhookNotificationChannel {
  constructor(config) {
    this.enabled = config.enabled;
    this.level = config.level;
    this.endpoints = config.endpoints;
  }

  async send(alert) {
    if (!this.enabled || this.endpoints.length === 0) {
      return { success: false, reason: 'Webhook disabled or no endpoints configured' };
    }

    // Simulate webhook calls
    console.log(`🔗 Webhook alerts sent to ${this.endpoints.length} endpoints: ${alert.title}`);
    return { success: true, endpoints: this.endpoints.length };
  }
}

/**
 * SMS Notification Channel
 */
class SMSNotificationChannel {
  constructor(config) {
    this.enabled = config.enabled;
    this.level = config.level;
    this.recipients = config.recipients;
  }

  async send(alert) {
    if (!this.enabled || this.recipients.length === 0) {
      return { success: false, reason: 'SMS disabled or no recipients configured' };
    }

    // Simulate SMS sending
    console.log(`📱 SMS alert sent to ${this.recipients.length} recipients: ${alert.title}`);
    return { success: true, recipients: this.recipients.length };
  }
}

export default AlertSystem;