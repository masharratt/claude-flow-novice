/**
 * Compliance Coordinator - Redis-based coordination for Phase 3 compliance
 * Central coordinator for all compliance activities with Redis pub/sub messaging
 *
 * @version 1.0.0
 * @author Phase 3 Compliance Swarm
 */

const { EventEmitter } = require('events');
const DataPrivacyController = require('./DataPrivacyController');
const AuditLogger = require('./AuditLogger');
const ComplianceValidator = require('./ComplianceValidator');
const { complianceRequirements, regionalConfigurations } = require('./compliance-requirements-matrix');

class ComplianceCoordinator extends EventEmitter {
  constructor(redisClient, options = {}) {
    super();
    this.redis = redisClient;

    this.options = {
      swarmId: 'phase-3-compliance',
      coordinationChannel: 'swarm:phase-3:compliance',
      heartbeatInterval: 30000, // 30 seconds
      taskTimeout: 300000, // 5 minutes
      maxRetries: 3,
      regions: ['EU', 'US_CALIFORNIA', 'US', 'APAC', 'CANADA', 'AUSTRALIA'],
      ...options
    };

    // Initialize compliance components
    this.dataPrivacyController = new DataPrivacyController(redisClient, options.privacy);
    this.auditLogger = new AuditLogger(redisClient, options.audit);
    this.complianceValidator = new ComplianceValidator(
      redisClient,
      this.dataPrivacyController,
      this.auditLogger,
      options.validation
    );

    // Coordinator state
    this.isActive = false;
    this.currentTasks = new Map();
    this.agentStatus = new Map();
    this.coordinationState = {
      initialized: false,
      lastHeartbeat: null,
      activeRegions: new Set(),
      complianceScores: new Map(),
      pendingValidations: new Set()
    };

    // Setup Redis coordination
    this.setupRedisCoordination();
  }

  /**
   * Initialize compliance coordinator with Redis coordination
   */
  async initialize() {
    try {
      this.isActive = true;

      // Initialize all compliance components
      await this.dataPrivacyController.initializePrivacyControls();
      await this.auditLogger.initializeAuditLogging();
      await this.complianceValidator.initializeValidation();

      // Setup Redis pub/sub for coordination
      await this.setupRedisPubSub();

      // Start heartbeat for coordination
      this.startHeartbeat();

      // Initialize regional compliance
      await this.initializeRegionalCompliance();

      // Run initial compliance validation
      await this.runInitialValidation();

      // Store initialization state in Redis
      await this.storeCoordinatorState();

      this.emit('coordinatorInitialized', {
        swarmId: this.options.swarmId,
        timestamp: new Date().toISOString(),
        regions: this.options.regions,
        components: ['DataPrivacyController', 'AuditLogger', 'ComplianceValidator']
      });

      // Log to Redis for swarm coordination
      await this.publishComplianceEvent('COORDINATOR_INITIALIZED', {
        swarmId: this.options.swarmId,
        components: ['privacy', 'audit', 'validation'],
        regions: this.options.regions
      });

      console.log(`🔒 Compliance Coordinator initialized for swarm: ${this.options.swarmId}`);
      console.log(`🌍 Active regions: ${this.options.regions.join(', ')}`);
      console.log(`📡 Redis coordination channel: ${this.options.coordinationChannel}`);

    } catch (error) {
      this.isActive = false;
      this.emit('coordinatorError', error);
      throw new Error(`Failed to initialize compliance coordinator: ${error.message}`);
    }
  }

  /**
   * Setup Redis pub/sub for coordination
   */
  async setupRedisPubSub() {
    try {
      // Subscribe to coordination channel
      await this.redis.subscribe(this.options.coordinationChannel, async (message) => {
        await this.handleCoordinationMessage(message);
      });

      // Setup regional channels
      for (const region of this.options.regions) {
        const regionalChannel = `${this.options.coordinationChannel}:${region}`;
        await this.redis.subscribe(regionalChannel, async (message) => {
          await this.handleRegionalMessage(region, message);
        });
      }

      console.log(`📡 Redis pub/sub coordination established`);

    } catch (error) {
      throw new Error(`Failed to setup Redis pub/sub: ${error.message}`);
    }
  }

  /**
   * Setup Redis coordination infrastructure
   */
  setupRedisCoordination() {
    // Setup event handlers for compliance components
    this.dataPrivacyController.on('privacyControlsInitialized', (data) => {
      this.publishComplianceEvent('PRIVACY_CONTROLS_READY', data);
    });

    this.auditLogger.on('auditLoggerInitialized', (data) => {
      this.publishComplianceEvent('AUDIT_LOGGER_READY', data);
    });

    this.complianceValidator.on('validatorInitialized', (data) => {
      this.publishComplianceEvent('VALIDATOR_READY', data);
    });

    this.complianceValidator.on('validationCompleted', (results) => {
      this.handleValidationResults(results);
    });

    this.complianceValidator.on('violationDetected', (violation) => {
      this.handleComplianceViolation(violation);
    });

    // Handle Redis disconnection
    this.redis.on('error', (error) => {
      this.emit('redisError', error);
      this.publishComplianceEvent('REDIS_ERROR', { error: error.message });
    });

    this.redis.on('connect', () => {
      this.publishComplianceEvent('REDIS_CONNECTED', { timestamp: new Date().toISOString() });
    });
  }

  /**
   * Handle coordination messages from Redis
   */
  async handleCoordinationMessage(message) {
    try {
      const event = JSON.parse(message);

      switch (event.eventType) {
        case 'COMPLIANCE_VALIDATION_REQUEST':
          await this.handleValidationRequest(event);
          break;

        case 'REGIONAL_COMPLIANCE_UPDATE':
          await this.handleRegionalUpdate(event);
          break;

        case 'SWARM_STATUS_REQUEST':
          await this.handleStatusRequest(event);
          break;

        case 'AGENT_HEARTBEAT':
          await this.handleAgentHeartbeat(event);
          break;

        case 'TASK_ASSIGNMENT':
          await this.handleTaskAssignment(event);
          break;

        case 'EMERGENCY_COMPLIANCE_ACTION':
          await this.handleEmergencyAction(event);
          break;

        default:
          console.log(`Unknown coordination event type: ${event.eventType}`);
      }

    } catch (error) {
      console.error('Failed to handle coordination message:', error);
      this.publishComplianceEvent('COORDINATION_ERROR', {
        error: error.message,
        message: message.substring(0, 200)
      });
    }
  }

  /**
   * Handle regional compliance messages
   */
  async handleRegionalMessage(region, message) {
    try {
      const event = JSON.parse(message);
      event.region = region;

      // Update regional compliance state
      this.coordinationState.activeRegions.add(region);

      // Store regional compliance data
      await this.redis.hset(
        `${this.options.coordinationChannel}:regional_status`,
        region,
        JSON.stringify({
          lastUpdate: new Date().toISOString(),
          status: event.status || 'ACTIVE',
          complianceScore: event.complianceScore || 0,
          lastValidation: event.lastValidation || null
        })
      );

      this.emit('regionalUpdate', { region, event });

    } catch (error) {
      console.error(`Failed to handle regional message for ${region}:`, error);
    }
  }

  /**
   * Handle validation request
   */
  async handleValidationRequest(event) {
    try {
      const { regulation, region, requesterId } = event;

      console.log(`🔍 Processing validation request for ${regulation} in ${region}`);

      // Run validation
      const results = await this.complianceValidator.runValidation(regulation);

      // Send results back to requester
      await this.publishComplianceEvent('VALIDATION_RESULTS', {
        regulation,
        region,
        results,
        requesterId,
        timestamp: new Date().toISOString()
      });

      // Update coordination state
      this.coordinationState.pendingValidations.delete(`${regulation}_${region}`);

    } catch (error) {
      this.publishComplianceEvent('VALIDATION_ERROR', {
        regulation: event.regulation,
        region: event.region,
        error: error.message,
        requesterId: event.requesterId
      });
    }
  }

  /**
   * Handle regional compliance update
   */
  async handleRegionalUpdate(event) {
    try {
      const { region, complianceData } = event;

      // Update regional compliance score
      if (complianceData.overallScore) {
        this.coordinationState.complianceScores.set(region, complianceData.overallScore);
      }

      // Store comprehensive regional data
      await this.redis.hset(
        `${this.options.coordinationChannel}:regional_data`,
        region,
        JSON.stringify({
          ...complianceData,
          lastUpdated: new Date().toISOString(),
          coordinatorId: this.options.swarmId
        })
      );

      this.emit('regionalComplianceUpdated', { region, complianceData });

    } catch (error) {
      console.error('Failed to handle regional update:', error);
    }
  }

  /**
   * Handle status request
   */
  async handleStatusRequest(event) {
    try {
      const status = await this.getComprehensiveStatus();

      await this.publishComplianceEvent('STATUS_RESPONSE', {
        requestId: event.requestId,
        status,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.publishComplianceEvent('STATUS_ERROR', {
        requestId: event.requestId,
        error: error.message
      });
    }
  }

  /**
   * Handle agent heartbeat
   */
  async handleAgentHeartbeat(event) {
    const { agentId, agentType, region, status } = event;

    this.agentStatus.set(agentId, {
      agentType,
      region,
      status,
      lastHeartbeat: new Date().toISOString()
    });

    // Clean up old heartbeats
    await this.cleanupOldHeartbeats();
  }

  /**
   * Handle task assignment
   */
  async handleTaskAssignment(event) {
    const { taskId, taskType, regulation, region, priority } = event;

    this.currentTasks.set(taskId, {
      taskType,
      regulation,
      region,
      priority,
      assignedAt: new Date().toISOString(),
      status: 'ASSIGNED'
    });

    // Process task based on type
    try {
      let result;

      switch (taskType) {
        case 'VALIDATION':
          result = await this.complianceValidator.runValidation(regulation);
          break;

        case 'REPORT_GENERATION':
          result = await this.auditLogger.generateComplianceReport(regulation, event.period);
          break;

        case 'CONSENT_MANAGEMENT':
          result = await this.dataPrivacyController.manageConsent(event.userId, event.consentData);
          break;

        case 'DATA_ERASURE':
          result = await this.dataPrivacyController.handleDataSubjectErasureRequest(
            event.userId, event.requestId, event.scope
          );
          break;

        default:
          throw new Error(`Unknown task type: ${taskType}`);
      }

      // Mark task as completed
      this.currentTasks.get(taskId).status = 'COMPLETED';
      this.currentTasks.get(taskId).completedAt = new Date().toISOString();
      this.currentTasks.get(taskId).result = result;

      // Publish task completion
      await this.publishComplianceEvent('TASK_COMPLETED', {
        taskId,
        result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.currentTasks.get(taskId).status = 'FAILED';
      this.currentTasks.get(taskId).error = error.message;

      await this.publishComplianceEvent('TASK_FAILED', {
        taskId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle emergency compliance action
   */
  async handleEmergencyAction(event) {
    const { action, severity, affectedSystems } = event;

    console.log(`🚨 EMERGENCY COMPLIANCE ACTION: ${action} (Severity: ${severity})`);

    try {
      // Execute emergency action
      switch (action) {
        case 'IMMEDIATE_VALIDATION':
          await this.runEmergencyValidation(affectedSystems);
          break;

        case 'DATA_RETENTION_FREEZE':
          await this.freezeDataRetention();
          break;

        case 'ENHANCED_MONITORING':
          await this.enableEnhancedMonitoring();
          break;

        case 'NOTIFICATION_ESCALATION':
          await this.escalateNotifications(severity);
          break;

        default:
          console.log(`Unknown emergency action: ${action}`);
      }

      await this.publishComplianceEvent('EMERGENCY_ACTION_COMPLETED', {
        action,
        severity,
        completedAt: new Date().toISOString()
      });

    } catch (error) {
      this.publishComplianceEvent('EMERGENCY_ACTION_FAILED', {
        action,
        error: error.message
      });
    }
  }

  /**
   * Handle validation results
   */
  async handleValidationResults(results) {
    // Store results in Redis
    await this.redis.hset(
      `${this.options.coordinationChannel}:validation_results`,
      'latest',
      JSON.stringify(results)
    );

    // Trigger alerts if needed
    if (results.overallScore < 70) {
      await this.publishComplianceEvent('COMPLIANCE_ALERT', {
        type: 'LOW_SCORE',
        score: results.overallScore,
        violations: results.criticalViolations + results.highViolations
      });
    }

    this.emit('validationResultsProcessed', results);
  }

  /**
   * Handle compliance violation
   */
  async handleComplianceViolation(violation) {
    // Store violation in Redis
    await this.redis.hset(
      `${this.options.coordinationChannel}:violations`,
      violation.id,
      JSON.stringify(violation)
    );

    // Trigger immediate alert for critical violations
    if (violation.riskLevel === 'CRITICAL') {
      await this.publishComplianceEvent('CRITICAL_VIOLATION', violation);
    }

    this.emit('violationProcessed', violation);
  }

  /**
   * Initialize regional compliance
   */
  async initializeRegionalCompliance() {
    for (const region of this.options.regions) {
      try {
        const config = regionalConfigurations[region];
        if (!config) {
          console.warn(`No configuration found for region: ${region}`);
          continue;
        }

        // Initialize regional compliance settings
        await this.redis.hset(
          `${this.options.coordinationChannel}:regional_config`,
          region,
          JSON.stringify({
            ...config,
            initializedAt: new Date().toISOString(),
            coordinatorId: this.options.swarmId
          })
        );

        this.coordinationState.activeRegions.add(region);

        console.log(`🌍 Regional compliance initialized for: ${region}`);

      } catch (error) {
        console.error(`Failed to initialize regional compliance for ${region}:`, error);
      }
    }
  }

  /**
   * Run initial validation
   */
  async runInitialValidation() {
    console.log('🔍 Running initial compliance validation...');

    try {
      const results = await this.complianceValidator.runValidation();

      await this.publishComplianceEvent('INITIAL_VALIDATION_COMPLETED', {
        overallScore: results.overallScore,
        totalViolations: results.criticalViolations + results.highViolations +
                         results.mediumViolations + results.lowViolations,
        timestamp: new Date().toISOString()
      });

      console.log(`✅ Initial validation completed. Overall score: ${results.overallScore}`);

    } catch (error) {
      console.error('Initial validation failed:', error);
      this.publishComplianceEvent('INITIAL_VALIDATION_FAILED', {
        error: error.message
      });
    }
  }

  /**
   * Publish compliance event to Redis
   */
  async publishComplianceEvent(eventType, eventData) {
    try {
      const event = {
        eventType,
        eventData,
        timestamp: new Date().toISOString(),
        source: 'ComplianceCoordinator',
        swarmId: this.options.swarmId
      };

      await this.redis.lpush(this.options.coordinationChannel, JSON.stringify(event));
      await this.redis.ltrim(this.options.coordinationChannel, 0, 9999); // Keep last 10k events

    } catch (error) {
      console.error('Failed to publish compliance event:', error);
    }
  }

  /**
   * Start heartbeat for coordination
   */
  startHeartbeat() {
    setInterval(async () => {
      if (this.isActive) {
        await this.sendHeartbeat();
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Send heartbeat to Redis
   */
  async sendHeartbeat() {
    try {
      const heartbeat = {
        swarmId: this.options.swarmId,
        timestamp: new Date().toISOString(),
        status: 'ACTIVE',
        activeRegions: Array.from(this.coordinationState.activeRegions),
        activeTasks: this.currentTasks.size,
        complianceScores: Object.fromEntries(this.coordinationState.complianceScores)
      };

      await this.redis.hset(
        `${this.options.coordinationChannel}:heartbeats`,
        this.options.swarmId,
        JSON.stringify(heartbeat)
      );

      this.coordinationState.lastHeartbeat = new Date().toISOString();

    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  }

  /**
   * Store coordinator state in Redis
   */
  async storeCoordinatorState() {
    try {
      const state = {
        ...this.coordinationState,
        initialized: true,
        options: this.options,
        components: {
          dataPrivacyController: true,
          auditLogger: true,
          complianceValidator: true
        },
        timestamp: new Date().toISOString()
      };

      await this.redis.hset(
        `${this.options.coordinationChannel}:coordinator_state`,
        this.options.swarmId,
        JSON.stringify(state)
      );

    } catch (error) {
      console.error('Failed to store coordinator state:', error);
    }
  }

  /**
   * Get comprehensive compliance status
   */
  async getComprehensiveStatus() {
    try {
      const [
        privacyStatus,
        auditStatistics,
        complianceStatus,
        regionalStatus,
        activeViolations
      ] = await Promise.all([
        this.dataPrivacyController.getComplianceStatus(),
        this.auditLogger.getAuditStatistics('24h'),
        this.complianceValidator.getComplianceStatus(),
        this.getRegionalStatus(),
        this.getActiveViolations()
      ]);

      return {
        swarmId: this.options.swarmId,
        isActive: this.isActive,
        lastHeartbeat: this.coordinationState.lastHeartbeat,
        components: {
          privacy: privacyStatus,
          audit: auditStatistics,
          validation: complianceStatus
        },
        regional: regionalStatus,
        violations: activeViolations,
        coordination: {
          activeTasks: this.currentTasks.size,
          activeAgents: this.agentStatus.size,
          activeRegions: this.coordinationState.activeRegions.size
        },
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`Failed to get comprehensive status: ${error.message}`);
    }
  }

  /**
   * Get regional status
   */
  async getRegionalStatus() {
    const regionalData = await this.redis.hgetall(`${this.options.coordinationChannel}:regional_status`);
    const status = {};

    for (const [region, data] of Object.entries(regionalData)) {
      try {
        status[region] = JSON.parse(data);
      } catch (error) {
        status[region] = { error: 'Failed to parse data' };
      }
    }

    return status;
  }

  /**
   * Get active violations
   */
  async getActiveViolations() {
    const violations = await this.redis.hgetall(`${this.options.coordinationChannel}:violations`);
    const activeViolations = [];

    for (const [violationId, violationData] of Object.entries(violations)) {
      try {
        const violation = JSON.parse(violationData);
        if (violation.status === 'OPEN') {
          activeViolations.push(violation);
        }
      } catch (error) {
        console.error(`Failed to parse violation ${violationId}:`, error);
      }
    }

    return activeViolations;
  }

  /**
   * Run emergency validation
   */
  async runEmergencyValidation(affectedSystems) {
    console.log('🚨 Running emergency compliance validation...');

    // Run validation for all regulations
    await this.complianceValidator.runValidation();

    // Enhanced monitoring for affected systems
    for (const system of affectedSystems) {
      await this.publishComplianceEvent('SYSTEM_UNDER_REVIEW', {
        system,
        reason: 'Emergency validation',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Freeze data retention
   */
  async freezeDataRetention() {
    console.log('🧊 Freezing data retention processes...');

    await this.redis.hset(
      `${this.options.coordinationChannel}:retention_status`,
      'frozen',
      JSON.stringify({
        frozenAt: new Date().toISOString(),
        reason: 'Emergency compliance action',
        coordinatorId: this.options.swarmId
      })
    );
  }

  /**
   * Enable enhanced monitoring
   */
  async enableEnhancedMonitoring() {
    console.log('📈 Enabling enhanced compliance monitoring...');

    // Reduce validation interval temporarily
    this.complianceValidator.options.validationInterval = 60000; // 1 minute

    await this.publishComplianceEvent('ENHANCED_MONITORING_ENABLED', {
      validationInterval: 60000,
      enabledAt: new Date().toISOString()
    });
  }

  /**
   * Escalate notifications
   */
  async escalateNotifications(severity) {
    console.log(`📢 Escalating notifications for severity: ${severity}`);

    await this.publishComplianceEvent('NOTIFICATION_ESCALATION', {
      severity,
      escalatedAt: new Date().toISOString(),
      coordinatorId: this.options.swarmId
    });
  }

  /**
   * Cleanup old heartbeats
   */
  async cleanupOldHeartbeats() {
    const cutoff = Date.now() - (5 * 60 * 1000); // 5 minutes ago

    for (const [agentId, status] of this.agentStatus) {
      const lastHeartbeat = new Date(status.lastHeartbeat).getTime();
      if (lastHeartbeat < cutoff) {
        this.agentStatus.delete(agentId);
      }
    }
  }

  /**
   * Shutdown coordinator gracefully
   */
  async shutdown() {
    console.log('🔄 Shutting down Compliance Coordinator...');

    this.isActive = false;

    // Publish shutdown event
    await this.publishComplianceEvent('COORDINATOR_SHUTDOWN', {
      swarmId: this.options.swarmId,
      timestamp: new Date().toISOString()
    });

    // Cleanup Redis connections
    try {
      await this.redis.quit();
    } catch (error) {
      console.error('Error during Redis cleanup:', error);
    }

    console.log('✅ Compliance Coordinator shutdown complete');
  }
}

module.exports = ComplianceCoordinator;