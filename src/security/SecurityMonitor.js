/**
 * Enterprise Security Monitoring & Threat Detection Service
 *
 * Phase 3 Enterprise Security Framework Implementation
 * Provides comprehensive security monitoring with threat detection and alerting
 */

import crypto from 'crypto';
import { connectRedis } from '../cli/utils/redis-client.js';

/**
 * Security Monitor with Threat Detection
 * Monitors security events, detects threats, and triggers automated responses
 */
export class SecurityMonitor {
  constructor(config = {}) {
    this.config = {
      monitoring: {
        eventRetentionPeriod: config.eventRetentionPeriod || 30 * 24 * 60 * 60 * 1000, // 30 days
        threatThresholds: {
          failedLoginAttempts: config.failedLoginThreshold || 5,
          suspiciousActivityScore: config.suspiciousActivityThreshold || 0.8,
          anomalyScore: config.anomalyThreshold || 0.7,
          rateLimitViolations: config.rateLimitThreshold || 10
        },
        monitoringWindows: {
          short: config.shortWindow || 5 * 60 * 1000,    // 5 minutes
          medium: config.mediumWindow || 30 * 60 * 1000, // 30 minutes
          long: config.longWindow || 60 * 60 * 1000      // 1 hour
        }
      },
      threats: {
        detectionRules: config.detectionRules || this.getDefaultDetectionRules(),
        responseActions: config.responseActions || this.getDefaultResponseActions(),
        escalation: {
          level1Threshold: config.level1Threshold || 0.6,  // Low threat
          level2Threshold: config.level2Threshold || 0.8,  // Medium threat
          level3Threshold: config.level3Threshold || 0.9   // High threat
        }
      },
      alerts: {
        channels: config.alertChannels || ['redis', 'log'],
        severity: {
          info: 'info',
          warning: 'warning',
          critical: 'critical'
        },
        deduplicationWindow: config.deduplicationWindow || 60 * 1000 // 1 minute
      },
      redis: {
        host: config.redisHost || 'localhost',
        port: config.redisPort || 6379,
        password: config.redisPassword,
        db: config.redisDb || 0
      }
    };

    this.redisClient = null;
    this.eventBuffer = [];
    this.threatDetectors = new Map();
    this.alertDeduplication = new Map();
    this.statistics = {
      totalEvents: 0,
      threatsDetected: 0,
      alertsSent: 0,
      falsePositives: 0,
      startTime: Date.now()
    };

    // Initialize threat detectors
    this.initializeThreatDetectors();
  }

  /**
   * Initialize the security monitor
   */
  async initialize() {
    try {
      this.redisClient = await connectRedis(this.config.redis);

      // Subscribe to security events
      await this.subscribeToSecurityEvents();

      // Start monitoring loops
      this.startMonitoringLoops();

      await this.publishSecurityEvent('security-monitor-initialized', {
        timestamp: new Date().toISOString(),
        threatDetectors: this.threatDetectors.size,
        detectionRules: this.config.threats.detectionRules.length,
        monitoringWindows: this.config.monitoring.monitoringWindows
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize SecurityMonitor:', error);
      throw error;
    }
  }

  /**
   * Process security event
   */
  async processEvent(event) {
    try {
      const enrichedEvent = this.enrichEvent(event);

      // Add to event buffer
      this.eventBuffer.push(enrichedEvent);
      this.statistics.totalEvents++;

      // Store event
      await this.storeEvent(enrichedEvent);

      // Run threat detection
      const threats = await this.detectThreats(enrichedEvent);

      // Process detected threats
      for (const threat of threats) {
        await this.handleThreat(threat);
      }

      // Update statistics
      await this.updateStatistics();

      return {
        eventId: enrichedEvent.id,
        threatsDetected: threats.length,
        processedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Event processing failed:', error);
      throw error;
    }
  }

  /**
   * Detect threats in security events
   */
  async detectThreats(event) {
    const threats = [];

    for (const [detectorName, detector] of this.threatDetectors) {
      try {
        const threatLevel = await detector.analyze(event);
        if (threatLevel > 0) {
          threats.push({
            id: crypto.randomUUID(),
            type: detectorName,
            severity: this.calculateThreatSeverity(threatLevel),
            confidence: threatLevel,
            eventId: event.id,
            description: detector.getDescription(threatLevel, event),
            timestamp: new Date().toISOString(),
            evidence: detector.getEvidence(event),
            recommendedActions: detector.getRecommendedActions(threatLevel)
          });
        }
      } catch (error) {
        console.error(`Threat detector ${detectorName} failed:`, error);
      }
    }

    if (threats.length > 0) {
      this.statistics.threatsDetected += threats.length;
    }

    return threats;
  }

  /**
   * Handle detected threat
   */
  async handleThreat(threat) {
    try {
      // Determine escalation level
      const escalationLevel = this.determineEscalationLevel(threat.confidence);

      // Execute automated response actions
      const responseActions = this.getResponseActions(threat, escalationLevel);
      const actionResults = [];

      for (const action of responseActions) {
        try {
          const result = await this.executeResponseAction(action, threat);
          actionResults.push({ action, result, success: true });
        } catch (error) {
          actionResults.push({ action, error: error.message, success: false });
        }
      }

      // Create and send alert
      const alert = await this.createAlert(threat, escalationLevel, actionResults);
      await this.sendAlert(alert);

      // Store threat record
      await this.storeThreatRecord(threat, escalationLevel, actionResults);

      await this.publishSecurityEvent('threat-handled', {
        threatId: threat.id,
        type: threat.type,
        severity: threat.severity,
        confidence: threat.confidence,
        escalationLevel,
        actionsTaken: actionResults.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Threat handling failed:', error);
      throw error;
    }
  }

  /**
   * Create security alert
   */
  async createAlert(threat, escalationLevel, actionResults) {
    const alert = {
      id: crypto.randomUUID(),
      type: 'threat_detected',
      severity: threat.severity,
      escalationLevel,
      threat: {
        id: threat.id,
        type: threat.type,
        description: threat.description,
        confidence: threat.confidence
      },
      eventId: threat.eventId,
      actions: actionResults,
      timestamp: new Date().toISOString(),
      status: 'active',
      acknowledged: false,
      assignedTo: null,
      resolvedAt: null
    };

    return alert;
  }

  /**
   * Send security alert
   */
  async sendAlert(alert) {
    try {
      // Check deduplication
      if (this.isDuplicateAlert(alert)) {
        return { skipped: true, reason: 'duplicate' };
      }

      // Send to configured channels
      for (const channel of this.config.alerts.channels) {
        await this.sendAlertToChannel(alert, channel);
      }

      this.statistics.alertsSent++;
      return { sent: true, channels: this.config.alerts.channels };
    } catch (error) {
      console.error('Alert sending failed:', error);
      throw error;
    }
  }

  /**
   * Get security statistics
   */
  async getStatistics(timeRange = null) {
    try {
      const now = Date.now();
      const timeFilter = timeRange ? now - timeRange : this.statistics.startTime;

      const stats = {
        ...this.statistics,
        uptime: now - this.statistics.startTime,
        eventsPerHour: this.calculateEventsPerHour(timeFilter),
        threatDetectionRate: this.calculateThreatDetectionRate(timeFilter),
        falsePositiveRate: this.calculateFalsePositiveRate(timeFilter),
        activeThreats: await this.getActiveThreatCount(),
        activeAlerts: await this.getActiveAlertCount()
      };

      return stats;
    } catch (error) {
      console.error('Statistics retrieval failed:', error);
      return this.statistics;
    }
  }

  /**
   * Get active threats
   */
  async getActiveThreats() {
    try {
      if (this.redisClient) {
        const threatIds = await this.redisClient.sMembers('threats:active');
        const threats = [];

        for (const threatId of threatIds) {
          const threat = await this.redisClient.hGetAll(`threat:${threatId}`);
          if (Object.keys(threat).length > 0) {
            threats.push(threat);
          }
        }

        return threats;
      }
      return [];
    } catch (error) {
      console.error('Active threats retrieval failed:', error);
      return [];
    }
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId, userId, notes = null) {
    try {
      if (this.redisClient) {
        const alertData = await this.redisClient.hGetAll(`alert:${alertId}`);
        if (Object.keys(alertData).length > 0) {
          alertData.acknowledged = true;
          alertData.acknowledgedAt = new Date().toISOString();
          alertData.acknowledgedBy = userId;
          alertData.notes = notes;

          await this.redisClient.hSet(`alert:${alertId}`, alertData);

          await this.publishSecurityEvent('alert-acknowledged', {
            alertId,
            userId,
            timestamp: new Date().toISOString()
          });

          return { success: true, alertId };
        }
      }
      throw new Error('Alert not found');
    } catch (error) {
      console.error('Alert acknowledgment failed:', error);
      throw error;
    }
  }

  /**
   * Resolve threat
   */
  async resolveThreat(threatId, userId, resolution, notes = null) {
    try {
      if (this.redisClient) {
        const threat = await this.redisClient.hGetAll(`threat:${threatId}`);
        if (Object.keys(threat).length > 0) {
          threat.status = 'resolved';
          threat.resolvedAt = new Date().toISOString();
          threat.resolvedBy = userId;
          threat.resolution = resolution;
          threat.notes = notes;

          await this.redisClient.hSet(`threat:${threatId}`, threat);
          await this.redisClient.sRem('threats:active', threatId);

          await this.publishSecurityEvent('threat-resolved', {
            threatId,
            resolution,
            userId,
            timestamp: new Date().toISOString()
          });

          return { success: true, threatId };
        }
      }
      throw new Error('Threat not found');
    } catch (error) {
      console.error('Threat resolution failed:', error);
      throw error;
    }
  }

  // Private helper methods

  initializeThreatDetectors() {
    // Brute Force Attack Detector
    this.threatDetectors.set('brute_force', {
      analyze: async (event) => this.detectBruteForceAttack(event),
      getDescription: (level, event) => `Potential brute force attack detected from ${event.ipAddress}`,
      getEvidence: (event) => ({ ip: event.ipAddress, username: event.username }),
      getRecommendedActions: (level) => ['block_ip', 'notify_admin']
    });

    // Anomalous Access Pattern Detector
    this.threatDetectors.set('anomalous_access', {
      analyze: async (event) => this.detectAnomalousAccess(event),
      getDescription: (level, event) => `Anomalous access pattern detected for user ${event.userId}`,
      getEvidence: (event) => ({ userId: event.userId, time: event.timestamp, location: event.location }),
      getRecommendedActions: (level) => ['require_mfa', 'monitor_user']
    });

    // Suspicious Activity Detector
    this.threatDetectors.set('suspicious_activity', {
      analyze: async (event) => this.detectSuspiciousActivity(event),
      getDescription: (level, event) => `Suspicious activity detected: ${event.type}`,
      getEvidence: (event) => ({ event, severity: level }),
      getRecommendedActions: (level) => ['investigate', 'enhanced_monitoring']
    });

    // Privilege Escalation Detector
    this.threatDetectors.set('privilege_escalation', {
      analyze: async (event) => this.detectPrivilegeEscalation(event),
      getDescription: (level, event) => `Potential privilege escalation attempt detected`,
      getEvidence: (event) => ({ userId: event.userId, attemptedAction: event.action }),
      getRecommendedActions: (level) => ['revoke_privileges', 'force_logout', 'investigate']
    });

    // Data Exfiltration Detector
    this.threatDetectors.set('data_exfiltration', {
      analyze: async (event) => this.detectDataExfiltration(event),
      getDescription: (level, event) => `Potential data exfiltration detected`,
      getEvidence: (event) => ({ userId: event.userId, dataSize: event.dataSize, destination: event.destination }),
      getRecommendedActions: (level) => ['block_transfer', 'quarantine_account', 'investigate']
    });
  }

  async detectBruteForceAttack(event) {
    if (event.type !== 'authentication_failed') {
      return 0;
    }

    const window = this.config.monitoring.monitoringWindows.short;
    const threshold = this.config.monitoring.threatThresholds.failedLoginAttempts;

    // Count failed attempts in window
    const recentFailures = await this.countRecentEvents(
      'authentication_failed',
      event.ipAddress,
      window
    );

    if (recentFailures >= threshold) {
      return Math.min(recentFailures / threshold, 1.0);
    }

    return 0;
  }

  async detectAnomalousAccess(event) {
    if (event.type !== 'user_authenticated') {
      return 0;
    }

    // Analyze access patterns for anomalies
    const patterns = await this.analyzeAccessPatterns(event.userId);
    const anomalyScore = this.calculateAnomalyScore(event, patterns);

    return anomalyScore;
  }

  async detectSuspiciousActivity(event) {
    // Generic suspicious activity detection
    let suspicionScore = 0;

    // Check for unusual event timing
    if (this.isUnusualTime(event.timestamp)) {
      suspicionScore += 0.3;
    }

    // Check for unusual location
    if (this.isUnusualLocation(event.location, event.userId)) {
      suspicionScore += 0.4;
    }

    // Check for unusual user agent
    if (this.isUnusualUserAgent(event.userAgent, event.userId)) {
      suspicionScore += 0.3;
    }

    return Math.min(suspicionScore, 1.0);
  }

  async detectPrivilegeEscalation(event) {
    if (event.type !== 'permission_denied') {
      return 0;
    }

    // Check if user is trying to access higher privileges
    const requiredPrivileges = await this.getRequiredPrivileges(event.action);
    const userPrivileges = await this.getUserPrivileges(event.userId);

    if (this.isPrivilegeEscalationAttempt(userPrivileges, requiredPrivileges)) {
      return 0.8;
    }

    return 0;
  }

  async detectDataExfiltration(event) {
    if (event.type !== 'data_access' && event.type !== 'data_download') {
      return 0;
    }

    // Check for unusual data access patterns
    const accessPattern = await this.analyzeDataAccessPattern(event.userId);
    const exfiltrationRisk = this.calculateExfiltrationRisk(event, accessPattern);

    return exfiltrationRisk;
  }

  async subscribeToSecurityEvents() {
    if (this.redisClient) {
      const subscriber = this.redisClient.duplicate();
      await subscriber.connect();

      await subscriber.subscribe('swarm:phase-3:security', (message) => {
        try {
          const event = JSON.parse(message);
          this.processEvent(event).catch(console.error);
        } catch (error) {
          console.error('Event parsing failed:', error);
        }
      });

      console.log('Subscribed to security events channel');
    }
  }

  startMonitoringLoops() {
    // Event buffer cleanup (every 5 minutes)
    setInterval(() => {
      this.cleanupEventBuffer();
    }, 5 * 60 * 1000);

    // Statistics update (every minute)
    setInterval(() => {
      this.updateStatistics().catch(console.error);
    }, 60 * 1000);

    // Alert deduplication cleanup (every 5 minutes)
    setInterval(() => {
      this.cleanupAlertDeduplication();
    }, 5 * 60 * 1000);
  }

  enrichEvent(event) {
    return {
      id: crypto.randomUUID(),
      timestamp: event.timestamp || new Date().toISOString(),
      ...event,
      processedAt: new Date().toISOString(),
      riskScore: this.calculateInitialRiskScore(event)
    };
  }

  async storeEvent(event) {
    if (this.redisClient) {
      await this.redisClient.hSet(`event:${event.id}`, event);
      await this.redisClient.expire(`event:${event.id}`,
        Math.floor(this.config.monitoring.eventRetentionPeriod / 1000));
    }
  }

  async storeThreatRecord(threat, escalationLevel, actionResults) {
    if (this.redisClient) {
      const threatRecord = {
        ...threat,
        escalationLevel,
        actions: JSON.stringify(actionResults),
        status: 'active',
        createdAt: new Date().toISOString()
      };

      await this.redisClient.hSet(`threat:${threat.id}`, threatRecord);
      await this.redisClient.sAdd('threats:active', threat.id);
      await this.redisClient.expire(`threat:${threat.id}`,
        Math.floor(this.config.monitoring.eventRetentionPeriod / 1000));
    }
  }

  calculateThreatSeverity(confidence) {
    if (confidence >= this.config.threats.escalation.level3Threshold) {
      return this.config.alerts.severity.critical;
    } else if (confidence >= this.config.threats.escalation.level2Threshold) {
      return this.config.alerts.severity.warning;
    } else {
      return this.config.alerts.severity.info;
    }
  }

  determineEscalationLevel(confidence) {
    if (confidence >= this.config.threats.escalation.level3Threshold) {
      return 3;
    } else if (confidence >= this.config.threats.escalation.level2Threshold) {
      return 2;
    } else {
      return 1;
    }
  }

  getResponseActions(threat, escalationLevel) {
    const actions = this.config.threats.responseActions
      .filter(action => action.threatTypes.includes(threat.type))
      .filter(action => action.escalationLevel <= escalationLevel);

    return actions.map(action => action.type);
  }

  async executeResponseAction(actionType, threat) {
    // Mock implementation of response actions
    switch (actionType) {
      case 'block_ip':
        return await this.blockIP(threat.evidence?.ip);
      case 'require_mfa':
        return await this.requireMFA(threat.evidence?.userId);
      case 'notify_admin':
        return await this.notifyAdmin(threat);
      case 'force_logout':
        return await this.forceLogout(threat.evidence?.userId);
      case 'monitor_user':
        return await this.monitorUser(threat.evidence?.userId);
      case 'revoke_privileges':
        return await this.revokePrivileges(threat.evidence?.userId);
      case 'quarantine_account':
        return await this.quarantineAccount(threat.evidence?.userId);
      case 'block_transfer':
        return await this.blockDataTransfer(threat);
      default:
        throw new Error(`Unknown action type: ${actionType}`);
    }
  }

  isDuplicateAlert(alert) {
    const key = `${alert.threat.type}_${alert.eventId}`;
    const lastAlert = this.alertDeduplication.get(key);

    if (lastAlert && (Date.now() - lastAlert) < this.config.alerts.deduplicationWindow) {
      return true;
    }

    this.alertDeduplication.set(key, Date.now());
    return false;
  }

  async sendAlertToChannel(alert, channel) {
    switch (channel) {
      case 'redis':
        await this.redisClient.publish('security-alerts', JSON.stringify(alert));
        break;
      case 'log':
        console.log(`SECURITY ALERT [${alert.severity.toUpperCase()}]:`, alert);
        break;
      default:
        console.warn(`Unknown alert channel: ${channel}`);
    }
  }

  async countRecentEvents(eventType, identifier, timeWindow) {
    // Mock implementation - would query actual event store
    return Math.floor(Math.random() * 10);
  }

  async analyzeAccessPatterns(userId) {
    // Mock implementation - would analyze actual access patterns
    return {
      typicalHours: [9, 10, 11, 14, 15, 16],
      typicalLocations: ['US', 'CA'],
      typicalDevices: ['Windows', 'Mac']
    };
  }

  calculateAnomalyScore(event, patterns) {
    // Mock implementation
    return Math.random() * 0.8;
  }

  isUnusualTime(timestamp) {
    const hour = new Date(timestamp).getHours();
    return hour < 6 || hour > 22;
  }

  isUnusualLocation(location, userId) {
    // Mock implementation
    return false;
  }

  isUnusualUserAgent(userAgent, userId) {
    // Mock implementation
    return false;
  }

  async getRequiredPrivileges(action) {
    // Mock implementation
    return ['admin'];
  }

  async getUserPrivileges(userId) {
    // Mock implementation
    return ['user'];
  }

  isPrivilegeEscalationAttempt(userPrivileges, requiredPrivileges) {
    return requiredPrivileges.some(priv => !userPrivileges.includes(priv));
  }

  async analyzeDataAccessPattern(userId) {
    // Mock implementation
    return {
      averageDataSize: 1024,
      frequency: 10,
      typicalDestinations: ['internal']
    };
  }

  calculateExfiltrationRisk(event, pattern) {
    // Mock implementation
    return Math.random() * 0.7;
  }

  calculateInitialRiskScore(event) {
    // Simple risk calculation based on event type
    const riskScores = {
      authentication_failed: 0.3,
      user_authenticated: 0.1,
      permission_denied: 0.6,
      data_access: 0.4,
      mfa_verification_failed: 0.5,
      suspicious_activity: 0.8
    };

    return riskScores[event.type] || 0.2;
  }

  cleanupEventBuffer() {
    const cutoff = Date.now() - this.config.monitoring.eventRetentionPeriod;
    this.eventBuffer = this.eventBuffer.filter(event =>
      new Date(event.timestamp).getTime() > cutoff
    );
  }

  cleanupAlertDeduplication() {
    const cutoff = Date.now() - this.config.alerts.deduplicationWindow;
    for (const [key, timestamp] of this.alertDeduplication) {
      if (timestamp < cutoff) {
        this.alertDeduplication.delete(key);
      }
    }
  }

  async updateStatistics() {
    // Update additional statistics
    this.statistics.lastUpdated = Date.now();
  }

  calculateEventsPerHour(timeFilter) {
    const hours = (Date.now() - timeFilter) / (1000 * 60 * 60);
    return this.statistics.totalEvents / Math.max(hours, 1);
  }

  calculateThreatDetectionRate(timeFilter) {
    return this.statistics.totalEvents > 0 ?
      (this.statistics.threatsDetected / this.statistics.totalEvents) * 100 : 0;
  }

  calculateFalsePositiveRate(timeFilter) {
    // Mock implementation
    return this.statistics.threatsDetected > 0 ?
      (this.statistics.falsePositives / this.statistics.threatsDetected) * 100 : 0;
  }

  async getActiveThreatCount() {
    if (this.redisClient) {
      return await this.redisClient.sCard('threats:active');
    }
    return 0;
  }

  async getActiveAlertCount() {
    if (this.redisClient) {
      const alertIds = await this.redisClient.sMembers('alerts:active');
      return alertIds.length;
    }
    return 0;
  }

  // Mock response action implementations
  async blockIP(ipAddress) {
    console.log(`Blocking IP: ${ipAddress}`);
    return { action: 'block_ip', ipAddress, success: true };
  }

  async requireMFA(userId) {
    console.log(`Requiring MFA for user: ${userId}`);
    return { action: 'require_mfa', userId, success: true };
  }

  async notifyAdmin(threat) {
    console.log(`Notifying admin about threat: ${threat.id}`);
    return { action: 'notify_admin', threatId: threat.id, success: true };
  }

  async forceLogout(userId) {
    console.log(`Force logout for user: ${userId}`);
    return { action: 'force_logout', userId, success: true };
  }

  async monitorUser(userId) {
    console.log(`Enhanced monitoring for user: ${userId}`);
    return { action: 'monitor_user', userId, success: true };
  }

  async revokePrivileges(userId) {
    console.log(`Revoking privileges for user: ${userId}`);
    return { action: 'revoke_privileges', userId, success: true };
  }

  async quarantineAccount(userId) {
    console.log(`Quarantining account: ${userId}`);
    return { action: 'quarantine_account', userId, success: true };
  }

  async blockDataTransfer(threat) {
    console.log(`Blocking data transfer for threat: ${threat.id}`);
    return { action: 'block_transfer', threatId: threat.id, success: true };
  }

  async publishSecurityEvent(eventType, data) {
    if (this.redisClient) {
      const event = {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
        service: 'SecurityMonitor'
      };

      await this.redisClient.publish('swarm:phase-3:security', JSON.stringify(event));
    }
  }

  getDefaultDetectionRules() {
    return [
      {
        name: 'brute_force_detection',
        type: 'threshold',
        threshold: 5,
        timeWindow: 300000, // 5 minutes
        field: 'ipAddress'
      },
      {
        name: 'anomaly_detection',
        type: 'statistical',
        threshold: 0.7,
        baselinePeriod: 86400000 // 24 hours
      }
    ];
  }

  getDefaultResponseActions() {
    return [
      {
        type: 'block_ip',
        threatTypes: ['brute_force'],
        escalationLevel: 2
      },
      {
        type: 'require_mfa',
        threatTypes: ['anomalous_access'],
        escalationLevel: 1
      },
      {
        type: 'notify_admin',
        threatTypes: ['*'],
        escalationLevel: 1
      },
      {
        type: 'quarantine_account',
        threatTypes: ['privilege_escalation', 'data_exfiltration'],
        escalationLevel: 3
      }
    ];
  }
}

export default SecurityMonitor;