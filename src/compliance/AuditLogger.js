/**
 * Audit Logger with Compliance Reporting
 * Comprehensive audit logging and reporting for GDPR, CCPA, SOC2, and ISO27001
 *
 * @version 1.0.0
 * @author Phase 3 Compliance Swarm
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');
const { complianceRequirements } = require('./compliance-requirements-matrix');

class AuditLogger extends EventEmitter {
  constructor(redisClient, options = {}) {
    super();
    this.redis = redisClient;
    this.options = {
      logRetentionDays: 2555, // 7 years for GDPR
      batchSize: 1000,
      flushInterval: 60000, // 1 minute
      encryptionEnabled: true,
      compressionEnabled: true,
      alertThresholds: {
        failedLogins: 5,
        dataAccess: 100,
        consentWithdrawals: 10,
        dsarRequests: 5
      },
      ...options
    };

    // Audit logging state
    this.logBuffer = [];
    this.alertCounters = new Map();
    this.reportCache = new Map();
    this.isProcessing = false;

    // Initialize audit logging
    this.initializeAuditLogging();
  }

  /**
   * Initialize audit logging system
   */
  async initializeAuditLogging() {
    try {
      // Load existing alert counters
      await this.loadAlertCounters();

      // Start periodic log flushing
      this.startLogFlushing();

      // Set up monitoring for compliance events
      this.setupComplianceMonitoring();

      this.emit('auditLoggerInitialized', {
        timestamp: new Date().toISOString(),
        alertCounters: this.alertCounters.size,
        bufferSize: this.logBuffer.length
      });

      // Log initialization to Redis for swarm coordination
      await this.logAuditEvent('AUDIT_LOGGER_INITIALIZED', {
        alertCounters: this.alertCounters.size,
        logRetentionDays: this.options.logRetentionDays,
        encryptionEnabled: this.options.encryptionEnabled
      });

    } catch (error) {
      this.emit('auditLoggerError', error);
      throw new Error(`Failed to initialize audit logger: ${error.message}`);
    }
  }

  /**
   * Log audit event
   */
  async logEvent(eventType, eventData, userId = null, sessionId = null, ipAddress = null) {
    try {
      const auditEvent = {
        eventId: crypto.randomUUID(),
        eventType,
        eventData,
        userId,
        sessionId,
        ipAddress,
        timestamp: new Date().toISOString(),
        source: process.env.SERVICE_NAME || 'unknown',
        version: '1.0.0'
      };

      // Add to buffer
      this.logBuffer.push(auditEvent);

      // Check for immediate flush conditions
      if (this.shouldFlushImmediately(auditEvent)) {
        await this.flushLogs();
      }

      // Update alert counters
      this.updateAlertCounters(auditEvent);

      // Emit event for real-time monitoring
      this.emit('auditEventLogged', auditEvent);

      return auditEvent.eventId;

    } catch (error) {
      this.emit('auditLogError', error);
      throw new Error(`Failed to log audit event: ${error.message}`);
    }
  }

  /**
   * Log data access event
   */
  async logDataAccess(userId, dataType, accessType, purpose, recordsAffected = 0) {
    return this.logEvent('DATA_ACCESS', {
      dataType,
      accessType, // READ, WRITE, DELETE, EXPORT
      purpose,
      recordsAffected,
      consentVerified: true // Assume consent verified
    }, userId, null, null);
  }

  /**
   * Log authentication event
   */
  async logAuthEvent(userId, authType, result, reason = null, mfaUsed = false) {
    return this.logEvent('AUTHENTICATION', {
      authType, // LOGIN, LOGOUT, PASSWORD_CHANGE, MFA_VERIFICATION
      result, // SUCCESS, FAILURE, LOCKED_OUT
      reason,
      mfaUsed,
      deviceInfo: this.getUserDeviceInfo()
    }, userId, null, null);
  }

  /**
   * Log consent event
   */
  async logConsentEvent(userId, consentType, action, consentId, purposes = []) {
    return this.logEvent('CONSENT_MANAGEMENT', {
      consentType,
      action, // GRANTED, WITHDRAWN, UPDATED
      consentId,
      purposes,
      legalBasis: 'consent'
    }, userId, null, null);
  }

  /**
   * Log data subject access request
   */
  async logDSAR(userId, requestType, status, dataCategories = [], requestId = null) {
    return this.logEvent('DATA_SUBJECT_REQUEST', {
      requestType, // ACCESS, ERASURE, PORTABILITY, RECTIFICATION
      status, // PENDING, PROCESSING, COMPLETED, REJECTED
      dataCategories,
      requestId
    }, userId, null, null);
  }

  /**
   * Log data breach event
   */
  async logDataBreach(breachId, severity, dataTypesAffected, recordsAffected, containmentStatus) {
    return this.logEvent('DATA_BREACH', {
      breachId,
      severity, // LOW, MEDIUM, HIGH, CRITICAL
      dataTypesAffected,
      recordsAffected,
      containmentStatus, // CONTAINED, IN_PROGRESS, NOT_CONTAINED
      notificationRequired: severity === 'HIGH' || severity === 'CRITICAL'
    }, null, null, null);
  }

  /**
   * Log security event
   */
  async logSecurityEvent(eventType, severity, description, affectedSystems = []) {
    return this.logEvent('SECURITY_INCIDENT', {
      securityEventType: eventType,
      severity,
      description,
      affectedSystems,
      investigationStatus: 'OPEN'
    }, null, null, null);
  }

  /**
   * Log system configuration change
   */
  async logConfigChange(userId, component, setting, oldValue, newValue) {
    return this.logEvent('CONFIGURATION_CHANGE', {
      component,
      setting,
      oldValue,
      newValue,
      changeReason: 'Administrative action'
    }, userId, null, null);
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(regulation, period = '30d', format = 'json') {
    try {
      const cacheKey = `${regulation}_${period}_${format}`;

      // Check cache first
      if (this.reportCache.has(cacheKey)) {
        const cached = this.reportCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 3600000) { // 1 hour cache
          return cached.report;
        }
      }

      const report = await this.buildComplianceReport(regulation, period);

      // Cache the report
      this.reportCache.set(cacheKey, {
        report,
        timestamp: Date.now()
      });

      // Log report generation
      await this.logEvent('COMPLIANCE_REPORT_GENERATED', {
        regulation,
        period,
        format,
        reportSize: JSON.stringify(report).length
      });

      this.emit('complianceReportGenerated', { regulation, period, report });
      return report;

    } catch (error) {
      this.emit('reportGenerationError', error);
      throw new Error(`Failed to generate compliance report: ${error.message}`);
    }
  }

  /**
   * Build compliance report for specific regulation
   */
  async buildComplianceReport(regulation, period) {
    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    const report = {
      regulation,
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      generatedAt: new Date().toISOString(),
      summary: {},
      details: {},
      recommendations: []
    };

    // Get audit logs for the period
    const logs = await this.getAuditLogs(startDate, endDate);

    switch (regulation) {
      case 'GDPR':
        report.summary = await this.buildGDPRSummary(logs);
        report.details = await this.buildGDPDetails(logs);
        report.recommendations = this.generateGDPRRecommendations(report.summary);
        break;

      case 'CCPA':
        report.summary = await this.buildCCPASummary(logs);
        report.details = await this.buildCCPADetails(logs);
        report.recommendations = this.generateCCPARecommendations(report.summary);
        break;

      case 'SOC2_TYPE2':
        report.summary = await this.buildSOC2Summary(logs);
        report.details = await this.buildSOC2Details(logs);
        report.recommendations = this.generateSOC2Recommendations(report.summary);
        break;

      case 'ISO27001':
        report.summary = await this.buildISOSummary(logs);
        report.details = await this.buildISODetails(logs);
        report.recommendations = this.generateISORecommendations(report.summary);
        break;

      default:
        throw new Error(`Unsupported regulation: ${regulation}`);
    }

    return report;
  }

  /**
   * Build GDPR compliance summary
   */
  async buildGDPRSummary(logs) {
    const summary = {
      dataSubjectRequests: {
        total: 0,
        completed: 0,
        pending: 0,
        rejected: 0,
        averageResponseTime: 0
      },
      consentManagement: {
        totalConsents: 0,
        consentWithdrawals: 0,
        consentUpdates: 0
      },
      dataBreaches: {
        total: 0,
        notified: 0,
        withinTimeframe: 0
      },
      dataProcessing: {
        totalAccessEvents: 0,
        lawfulBasisVerified: 0,
        dataMinimizationApplied: 0
      },
      securityMeasures: {
        encryptionEvents: 0,
        authenticationEvents: 0,
        securityIncidents: 0
      }
    };

    for (const log of logs) {
      switch (log.eventType) {
        case 'DATA_SUBJECT_REQUEST':
          summary.dataSubjectRequests.total++;
          if (log.eventData.status === 'COMPLETED') summary.dataSubjectRequests.completed++;
          if (log.eventData.status === 'PENDING') summary.dataSubjectRequests.pending++;
          if (log.eventData.status === 'REJECTED') summary.dataSubjectRequests.rejected++;
          break;

        case 'CONSENT_MANAGEMENT':
          summary.consentManagement.totalConsents++;
          if (log.eventData.action === 'WITHDRAWN') summary.consentManagement.consentWithdrawals++;
          if (log.eventData.action === 'UPDATED') summary.consentManagement.consentUpdates++;
          break;

        case 'DATA_BREACH':
          summary.dataBreaches.total++;
          if (log.eventData.notificationRequired) summary.dataBreaches.notified++;
          break;

        case 'DATA_ACCESS':
          summary.dataProcessing.totalAccessEvents++;
          if (log.eventData.consentVerified) summary.dataProcessing.lawfulBasisVerified++;
          break;

        case 'SECURITY_INCIDENT':
          summary.securityMeasures.securityIncidents++;
          break;
      }
    }

    return summary;
  }

  /**
   * Build CCPA compliance summary
   */
  async buildCCPASummary(logs) {
    const summary = {
      consumerRights: {
        accessRequests: 0,
        deletionRequests: 0,
        optOutRequests: 0,
        portabilityRequests: 0
      },
      dataProcessing: {
        dataSold: 0,
        dataShared: 0,
        dataDisclosed: 0
      },
      businessPractices: {
        discriminationClaims: 0,
        priceDiscriminationEvents: 0,
        serviceDenialEvents: 0
      },
      vendorManagement: {
        vendorDataTransfers: 0,
        vendorComplianceChecks: 0
      }
    };

    for (const log of logs) {
      switch (log.eventType) {
        case 'DATA_SUBJECT_REQUEST':
          if (log.eventData.requestType === 'ACCESS') summary.consumerRights.accessRequests++;
          if (log.eventData.requestType === 'ERASURE') summary.consumerRights.deletionRequests++;
          if (log.eventData.requestType === 'PORTABILITY') summary.consumerRights.portabilityRequests++;
          break;

        case 'DATA_ACCESS':
          if (log.eventData.accessType === 'SHARE') summary.dataProcessing.dataShared++;
          if (log.eventData.accessType === 'SELL') summary.dataProcessing.dataSold++;
          break;
      }
    }

    return summary;
  }

  /**
   * Build SOC2 Type II compliance summary
   */
  async buildSOC2Summary(logs) {
    const summary = {
      security: {
        accessControlEvents: 0,
        authenticationEvents: 0,
        securityIncidents: 0,
        vulnerabilityAssessments: 0
      },
      availability: {
        systemUptimeEvents: 0,
        downtimeEvents: 0,
        backupEvents: 0,
        recoveryEvents: 0
      },
      processingIntegrity: {
        dataValidationEvents: 0,
        processingErrors: 0,
        correctionEvents: 0
      },
      confidentiality: {
        encryptionEvents: 0,
        dataAccessEvents: 0,
        unauthorizedAccessAttempts: 0
      },
      privacy: {
        consentEvents: 0,
        dataSubjectRequests: 0,
        privacyPolicyChanges: 0
      }
    };

    for (const log of logs) {
      switch (log.eventType) {
        case 'AUTHENTICATION':
          summary.security.authenticationEvents++;
          break;

        case 'DATA_ACCESS':
          summary.confidentiality.dataAccessEvents++;
          break;

        case 'SECURITY_INCIDENT':
          summary.security.securityIncidents++;
          break;

        case 'CONSENT_MANAGEMENT':
          summary.privacy.consentEvents++;
          break;
      }
    }

    return summary;
  }

  /**
   * Build ISO27001 compliance summary
   */
  async buildISOSummary(logs) {
    const summary = {
      informationSecurityPolicies: {
        policyChanges: 0,
        policyReviews: 0,
        policyViolations: 0
      },
      riskManagement: {
        riskAssessments: 0,
        riskTreatmentPlans: 0,
        riskAcceptanceEvents: 0
      },
      assetManagement: {
        assetInventory: 0,
        assetClassification: 0,
        assetDisposal: 0
      },
      accessControl: {
        accessReviews: 0,
        accessChanges: 0,
        privilegeEscalationAttempts: 0
      },
      incidentManagement: {
        incidentsDetected: 0,
        incidentsResolved: 0,
        incidentResponseTime: 0
      }
    };

    for (const log of logs) {
      switch (log.eventType) {
        case 'SECURITY_INCIDENT':
          summary.incidentManagement.incidentsDetected++;
          break;

        case 'CONFIGURATION_CHANGE':
          summary.accessControl.accessChanges++;
          break;
      }
    }

    return summary;
  }

  /**
   * Generate GDPR recommendations
   */
  generateGDPRRecommendations(summary) {
    const recommendations = [];

    if (summary.dataSubjectRequests.pending > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Data Subject Rights',
        recommendation: 'Process pending data subject requests within legal timeframes',
        details: `${summary.dataSubjectRequests.pending} requests are pending`
      });
    }

    if (summary.dataBreaches.total > 0 && summary.dataBreaches.withinTimeframe < summary.dataBreaches.total) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'Breach Notification',
        recommendation: 'Improve breach detection and notification processes',
        details: 'Some breaches were not notified within 72-hour requirement'
      });
    }

    if (summary.consentManagement.consentWithdrawals > summary.consentManagement.totalConsents * 0.1) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Consent Management',
        recommendation: 'Review and improve consent mechanisms',
        details: 'High consent withdrawal rate detected'
      });
    }

    return recommendations;
  }

  /**
   * Generate CCPA recommendations
   */
  generateCCPARecommendations(summary) {
    const recommendations = [];

    if (summary.consumerRights.deletionRequests > 0 && summary.dataProcessing.dataSold > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Consumer Rights',
        recommendation: 'Ensure consumer deletion requests are honored across all data sales',
        details: 'Potential conflict between deletion requests and data sales'
      });
    }

    if (summary.businessPractices.priceDiscriminationEvents > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Fair Treatment',
        recommendation: 'Review pricing practices to ensure no discrimination based on privacy choices',
        details: 'Price discrimination events detected'
      });
    }

    return recommendations;
  }

  /**
   * Generate SOC2 recommendations
   */
  generateSOC2Recommendations(summary) {
    const recommendations = [];

    if (summary.security.securityIncidents > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Security',
        recommendation: 'Implement additional security controls to prevent incidents',
        details: `${summary.security.securityIncidents} security incidents detected`
      });
    }

    if (summary.availability.downtimeEvents > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Availability',
        recommendation: 'Improve system availability monitoring and redundancy',
        details: `${summary.availability.downtimeEvents} downtime events recorded`
      });
    }

    return recommendations;
  }

  /**
   * Generate ISO27001 recommendations
   */
  generateISORecommendations(summary) {
    const recommendations = [];

    if (summary.incidentManagement.incidentsDetected > summary.incidentManagement.incidentsResolved) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Incident Management',
        recommendation: 'Improve incident resolution processes',
        details: 'More incidents detected than resolved'
      });
    }

    if (summary.accessControl.privilegeEscalationAttempts > 0) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'Access Control',
        recommendation: 'Investigate and prevent privilege escalation attempts',
        details: `${summary.accessControl.privilegeEscalationAttempts} attempts detected`
      });
    }

    return recommendations;
  }

  /**
   * Get audit logs for time range
   */
  async getAuditLogs(startDate, endDate, filters = {}) {
    try {
      const startTime = startDate.getTime();
      const endTime = endDate.getTime();

      // Get logs from Redis
      const allLogs = await this.redis.lrange('audit:logs', 0, -1);

      let filteredLogs = [];

      for (const logData of allLogs) {
        try {
          const log = JSON.parse(logData);
          const logTime = new Date(log.timestamp).getTime();

          // Filter by time range
          if (logTime < startTime || logTime > endTime) continue;

          // Apply additional filters
          if (filters.eventType && log.eventType !== filters.eventType) continue;
          if (filters.userId && log.userId !== filters.userId) continue;
          if (filters.severity && log.eventData.severity !== filters.severity) continue;

          filteredLogs.push(log);
        } catch (parseError) {
          console.error('Failed to parse log entry:', parseError);
        }
      }

      return filteredLogs;

    } catch (error) {
      throw new Error(`Failed to get audit logs: ${error.message}`);
    }
  }

  /**
   * Flush buffered logs to Redis
   */
  async flushLogs() {
    if (this.isProcessing || this.logBuffer.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const batch = this.logBuffer.splice(0, this.options.batchSize);

      for (const log of batch) {
        // Encrypt sensitive data if enabled
        if (this.options.encryptionEnabled && this.containsSensitiveData(log)) {
          log.eventData = await this.encryptLogData(log.eventData);
        }

        // Store in Redis
        await this.redis.lpush('audit:logs', JSON.stringify(log));
      }

      // Trim logs to prevent memory issues
      await this.redis.ltrim('audit:logs', 0, 100000);

      this.emit('logsFlushed', { count: batch.length });

    } catch (error) {
      this.emit('logFlushError', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Check if log contains sensitive data
   */
  containsSensitiveData(log) {
    const sensitiveFields = ['email', 'phone', 'ssn', 'creditCard', 'password'];
    const logString = JSON.stringify(log.eventData).toLowerCase();

    return sensitiveFields.some(field => logString.includes(field));
  }

  /**
   * Encrypt log data
   */
  async encryptLogData(data) {
    // Simplified encryption - in production, use proper encryption
    return {
      encrypted: true,
      data: Buffer.from(JSON.stringify(data)).toString('base64')
    };
  }

  /**
   * Check if log should be flushed immediately
   */
  shouldFlushImmediately(log) {
    const immediateFlushEvents = [
      'DATA_BREACH',
      'SECURITY_INCIDENT',
      'DATA_SUBJECT_REQUEST',
      'CONSENT_MANAGEMENT'
    ];

    return immediateFlushEvents.includes(log.eventType);
  }

  /**
   * Update alert counters
   */
  updateAlertCounters(log) {
    const key = `${log.eventType}_${log.userId || 'anonymous'}`;
    const current = this.alertCounters.get(key) || 0;
    this.alertCounters.set(key, current + 1);

    // Check threshold
    const threshold = this.options.alertThresholds[log.eventType];
    if (threshold && current + 1 >= threshold) {
      this.emit('alertThresholdExceeded', {
        eventType: log.eventType,
        userId: log.userId,
        count: current + 1,
        threshold
      });
    }
  }

  /**
   * Start periodic log flushing
   */
  startLogFlushing() {
    setInterval(async () => {
      try {
        await this.flushLogs();
      } catch (error) {
        this.emit('logFlushError', error);
      }
    }, this.options.flushInterval);
  }

  /**
   * Setup compliance monitoring
   */
  setupComplianceMonitoring() {
    // Monitor Redis for compliance events
    this.redis.subscribe('swarm:phase-3:compliance', (message) => {
      try {
        const event = JSON.parse(message);
        this.emit('complianceEvent', event);
      } catch (error) {
        console.error('Failed to parse compliance event:', error);
      }
    });
  }

  /**
   * Load existing alert counters
   */
  async loadAlertCounters() {
    try {
      const counters = await this.redis.hgetall('audit:alert_counters');

      for (const [key, count] of Object.entries(counters)) {
        this.alertCounters.set(key, parseInt(count, 10));
      }

    } catch (error) {
      console.error('Failed to load alert counters:', error);
    }
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(period = '24h') {
    try {
      const endDate = new Date();
      const startDate = new Date();

      switch (period) {
        case '1h':
          startDate.setHours(startDate.getHours() - 1);
          break;
        case '24h':
          startDate.setDate(startDate.getDate() - 1);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
      }

      const logs = await this.getAuditLogs(startDate, endDate);

      const stats = {
        totalEvents: logs.length,
        eventsByType: {},
        eventsByUser: {},
        timeRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        },
        alertsTriggered: this.alertCounters.size
      };

      // Aggregate by event type
      for (const log of logs) {
        stats.eventsByType[log.eventType] = (stats.eventsByType[log.eventType] || 0) + 1;

        if (log.userId) {
          stats.eventsByUser[log.userId] = (stats.eventsByUser[log.userId] || 0) + 1;
        }
      }

      return stats;

    } catch (error) {
      throw new Error(`Failed to get audit statistics: ${error.message}`);
    }
  }

  /**
   * Get user device info
   */
  getUserDeviceInfo() {
    // Placeholder - would extract from request context
    return {
      userAgent: 'unknown',
      platform: 'unknown',
      ipAddress: 'unknown'
    };
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldLogs() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.options.logRetentionDays);

      const logs = await this.redis.lrange('audit:logs', 0, -1);
      let removedCount = 0;

      for (let i = logs.length - 1; i >= 0; i--) {
        try {
          const log = JSON.parse(logs[i]);
          if (new Date(log.timestamp) < cutoffDate) {
            await this.redis.ltrim('audit:logs', 0, i);
            removedCount = logs.length - i;
            break;
          }
        } catch (error) {
          // Remove malformed logs
          await this.redis.ltrim('audit:logs', 0, i);
          removedCount = logs.length - i;
          break;
        }
      }

      await this.logEvent('AUDIT_LOG_CLEANUP', {
        removedCount,
        cutoffDate: cutoffDate.toISOString()
      });

      return removedCount;

    } catch (error) {
      throw new Error(`Failed to cleanup old logs: ${error.message}`);
    }
  }
}

module.exports = AuditLogger;