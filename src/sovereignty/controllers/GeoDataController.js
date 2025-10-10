/**
 * GeoDataController - Geographic Data Routing and Sovereignty Enforcement
 *
 * Implements comprehensive geographic data routing and residency controls
 * with strict enforcement and individual audit granularity.
 */

const RedisClient = require('../utils/redis-client');
const { EventEmitter } = require('events');
const geoip = require('geoip-lite');

class GeoDataController extends EventEmitter {
  constructor(options = {}) {
    super();
    this.redis = new RedisClient(options.redis);
    this.enforcementLevel = options.enforcementLevel || 'strict';
    this.supportedRegions = options.supportedRegions || ['EU', 'US', 'APAC', 'Canada', 'Australia'];
    this.auditGranularity = options.auditGranularity || 'individual';

    // Geographic routing rules cache
    this.routingRules = new Map();
    this.complianceCache = new Map();
    this.lastRuleUpdate = null;

    // Performance metrics
    this.metrics = {
      totalRequests: 0,
      allowedRequests: 0,
      blockedRequests: 0,
      averageResponseTime: 0,
      violationsDetected: 0
    };

    this.initialize();
  }

  /**
   * Initialize the controller and load routing rules
   */
  async initialize() {
    try {
      await this.loadRoutingRules();
      await this.setupRedisSubscriptions();
      this.startMetricsCollection();

      this.emit('initialized', {
        regions: this.supportedRegions,
        enforcement: this.enforcementLevel,
        timestamp: new Date().toISOString()
      });

      // Publish initialization event
      await this.publishEvent('controller_initialized', {
        regions: this.supportedRegions,
        enforcement: this.enforcementLevel
      });

    } catch (error) {
      this.emit('error', { type: 'initialization', error: error.message });
      throw error;
    }
  }

  /**
   * Load geographic routing rules from Redis
   */
  async loadRoutingRules() {
    try {
      const rulesKey = 'swarm:phase3:sovereignty:rules';
      const rules = await this.redis.hgetall(rulesKey);

      this.routingRules.clear();

      for (const [region, rule] of Object.entries(rules)) {
        this.routingRules.set(region, JSON.parse(rule));
      }

      this.lastRuleUpdate = new Date();
      console.log(`Loaded ${this.routingRules.size} routing rules for regions: ${Array.from(this.routingRules.keys()).join(', ')}`);

    } catch (error) {
      console.error('Failed to load routing rules:', error);
      throw error;
    }
  }

  /**
   * Setup Redis subscriptions for real-time updates
   */
  async setupRedisSubscriptions() {
    try {
      const subscriber = this.redis.duplicate();

      // Subscribe to routing rule updates
      await subscriber.subscribe('sovereignty:routing:updates');
      subscriber.on('message', (channel, message) => {
        if (channel === 'sovereignty:routing:updates') {
          this.handleRoutingUpdate(JSON.parse(message));
        }
      });

      // Subscribe to compliance alerts
      await subscriber.subscribe('sovereignty:compliance:alerts');
      subscriber.on('message', (channel, message) => {
        if (channel === 'sovereignty:compliance:alerts') {
          this.handleComplianceAlert(JSON.parse(message));
        }
      });

    } catch (error) {
      console.error('Failed to setup Redis subscriptions:', error);
      throw error;
    }
  }

  /**
   * Process data access request with geographic enforcement
   */
  async processAccessRequest(request) {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Extract request information
      const {
        userId,
        dataId,
        operation,
        sourceLocation,
        targetLocation,
        dataType,
        sensitivity = 'standard'
      } = request;

      // Validate required fields
      this.validateRequest(request);

      // Determine source and target regions
      const sourceRegion = await this.determineRegion(sourceLocation);
      const targetRegion = await this.determineRegion(targetLocation);

      // Get routing rules for both regions
      const sourceRules = this.routingRules.get(sourceRegion);
      const targetRules = this.routingRules.get(targetRegion);

      // Perform compliance check
      const complianceResult = await this.checkCompliance({
        userId,
        sourceRegion,
        targetRegion,
        operation,
        dataType,
        sensitivity,
        sourceRules,
        targetRules
      });

      // Log individual access attempt
      await this.logAccessAttempt({
        userId,
        dataId,
        operation,
        sourceLocation,
        targetLocation,
        sourceRegion,
        targetRegion,
        complianceResult,
        timestamp: new Date().toISOString()
      });

      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, complianceResult.allowed);

      // Publish event
      await this.publishEvent('access_processed', {
        userId,
        sourceRegion,
        targetRegion,
        operation,
        allowed: complianceResult.allowed,
        responseTime,
        reasoning: complianceResult.reasoning
      });

      if (complianceResult.allowed) {
        this.metrics.allowedRequests++;
        return {
          allowed: true,
          region: targetRegion,
          routing: complianceResult.routing,
          auditId: this.generateAuditId(),
          responseTime
        };
      } else {
        this.metrics.blockedRequests++;
        this.metrics.violationsDetected++;

        // Publish violation alert
        await this.publishViolationAlert({
          userId,
          violation: complianceResult.violation,
          sourceRegion,
          targetRegion,
          operation
        });

        return {
          allowed: false,
          reason: complianceResult.reasoning,
          violation: complianceResult.violation,
          auditId: this.generateAuditId(),
          responseTime
        };
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;

      await this.logError({
        error: error.message,
        request,
        timestamp: new Date().toISOString(),
        responseTime
      });

      throw error;
    }
  }

  /**
   * Determine geographic region from location information
   */
  async determineRegion(location) {
    try {
      // Handle different location formats
      if (typeof location === 'string') {
        // IP address
        if (/^\d+\.\d+\.\d+\.\d+$/.test(location)) {
          const geo = geoip.lookup(location);
          if (geo) {
            return this.mapCountryToRegion(geo.country);
          }
        }
        // Country code
        else if (location.length === 2) {
          return this.mapCountryToRegion(location);
        }
        // Region code directly
        else if (this.supportedRegions.includes(location)) {
          return location;
        }
      }

      // Handle object format { ip, country, region }
      if (typeof location === 'object') {
        if (location.region) {
          return location.region;
        }
        if (location.country) {
          return this.mapCountryToRegion(location.country);
        }
        if (location.ip) {
          const geo = geoip.lookup(location.ip);
          if (geo) {
            return this.mapCountryToRegion(geo.country);
          }
        }
      }

      throw new Error(`Unable to determine region for location: ${JSON.stringify(location)}`);

    } catch (error) {
      console.error('Region determination error:', error);
      throw new Error(`Region determination failed: ${error.message}`);
    }
  }

  /**
   * Map country codes to supported regions
   */
  mapCountryToRegion(countryCode) {
    const regionMap = {
      // EU countries
      'DE': 'EU', 'FR': 'EU', 'IT': 'EU', 'ES': 'EU', 'NL': 'EU',
      'BE': 'EU', 'AT': 'EU', 'PT': 'EU', 'SE': 'EU', 'DK': 'EU',
      'FI': 'EU', 'IE': 'EU', 'GR': 'EU', 'LU': 'EU', 'CY': 'EU',
      'MT': 'EU', 'SI': 'EU', 'SK': 'EU', 'EE': 'EU', 'LV': 'EU',
      'LT': 'EU', 'PL': 'EU', 'CZ': 'EU', 'HU': 'EU', 'HR': 'EU',
      'RO': 'EU', 'BG': 'EU',

      // US
      'US': 'US',

      // Canada
      'CA': 'Canada',

      // Australia
      'AU': 'Australia',

      // APAC countries
      'SG': 'APAC', 'MY': 'APAC', 'TH': 'APAC', 'PH': 'APAC',
      'ID': 'APAC', 'VN': 'APAC', 'HK': 'APAC', 'TW': 'APAC',
      'KR': 'APAC', 'JP': 'APAC', 'CN': 'APAC', 'IN': 'APAC'
    };

    const region = regionMap[countryCode?.toUpperCase()];
    if (!region) {
      throw new Error(`Unsupported country: ${countryCode}`);
    }

    return region;
  }

  /**
   * Check compliance with regional rules
   */
  async checkCompliance(context) {
    const {
      userId,
      sourceRegion,
      targetRegion,
      operation,
      dataType,
      sensitivity,
      sourceRules,
      targetRules
    } = context;

    // Same region access - generally allowed
    if (sourceRegion === targetRegion) {
      return {
        allowed: true,
        reasoning: 'Same region access',
        routing: 'local',
        confidence: 1.0
      };
    }

    // Cross-border transfer check
    if (sourceRegion !== targetRegion) {
      const transferResult = await this.checkCrossBorderTransfer({
        userId,
        sourceRegion,
        targetRegion,
        operation,
        dataType,
        sensitivity,
        sourceRules,
        targetRules
      });

      return transferResult;
    }

    // Default deny
    return {
      allowed: false,
      reasoning: 'Default deny policy',
      violation: 'UNKNOWN_TRANSFER',
      confidence: 0.0
    };
  }

  /**
   * Check cross-border transfer compliance
   */
  async checkCrossBorderTransfer(context) {
    const {
      userId,
      sourceRegion,
      targetRegion,
      operation,
      dataType,
      sensitivity,
      sourceRules,
      targetRules
    } = context;

    // Check if transfer is allowed by source region
    if (sourceRules && sourceRules.exportRestrictions) {
      const exportAllowed = sourceRules.exportRestrictions.allowedRegions.includes(targetRegion);
      if (!exportAllowed) {
        return {
          allowed: false,
          reasoning: `Source region ${sourceRegion} does not allow transfers to ${targetRegion}`,
          violation: 'EXPORT_RESTRICTION',
          confidence: 1.0
        };
      }
    }

    // Check if transfer is allowed by target region
    if (targetRules && targetRules.importRestrictions) {
      const importAllowed = targetRules.importRestrictions.allowedRegions.includes(sourceRegion);
      if (!importAllowed) {
        return {
          allowed: false,
          reasoning: `Target region ${targetRegion} does not allow imports from ${sourceRegion}`,
          violation: 'IMPORT_RESTRICTION',
          confidence: 1.0
        };
      }
    }

    // Check data type restrictions
    if (sourceRules && sourceRules.dataTypeRestrictions) {
      const dataTypeAllowed = sourceRules.dataTypeRestrictions[dataType]?.crossBorderAllowed;
      if (dataTypeAllowed === false) {
        return {
          allowed: false,
          reasoning: `Data type ${dataType} not allowed for cross-border transfer from ${sourceRegion}`,
          violation: 'DATA_TYPE_RESTRICTION',
          confidence: 1.0
        };
      }
    }

    // Check sensitivity level restrictions
    if (sensitivity === 'high') {
      const highSensitivityCheck = await this.checkHighSensitivityTransfer(context);
      if (!highSensitivityCheck.allowed) {
        return highSensitivityCheck;
      }
    }

    // Check user-specific restrictions
    const userRestrictions = await this.getUserRestrictions(userId);
    if (userRestrictions) {
      const userAllowed = userRestrictions.allowedRegions?.includes(targetRegion);
      if (userAllowed === false) {
        return {
          allowed: false,
          reasoning: `User ${userId} not authorized for transfers to ${targetRegion}`,
          violation: 'USER_RESTRICTION',
          confidence: 1.0
        };
      }
    }

    // All checks passed
    return {
      allowed: true,
      reasoning: `Transfer from ${sourceRegion} to ${targetRegion} complies with all rules`,
      routing: 'cross-border',
      confidence: 0.95,
      requirements: {
        encryption: 'AES-256',
        auditLogging: true,
        consentVerification: sensitivity === 'high'
      }
    };
  }

  /**
   * Additional checks for high sensitivity data
   */
  async checkHighSensitivityTransfer(context) {
    const { sourceRegion, targetRegion, userId } = context;

    // Require explicit consent for high sensitivity data
    const consentRequired = await this.checkExplicitConsent(userId, targetRegion);
    if (!consentRequired) {
      return {
        allowed: false,
        reasoning: 'Explicit consent required for high sensitivity data transfer',
        violation: 'CONSENT_REQUIRED',
        confidence: 1.0
      };
    }

    // Additional verification for high sensitivity transfers
    const verificationPassed = await this.performAdditionalVerification(context);
    if (!verificationPassed) {
      return {
        allowed: false,
        reasoning: 'Additional verification failed for high sensitivity data transfer',
        violation: 'VERIFICATION_FAILED',
        confidence: 1.0
      };
    }

    return { allowed: true };
  }

  /**
   * Log individual access attempt for audit trail
   */
  async logAccessAttempt(accessLog) {
    try {
      const auditKey = `swarm:phase3:sovereignty:audit:${Date.now()}`;
      await this.redis.setex(auditKey, 86400 * 365, JSON.stringify(accessLog)); // Keep for 1 year

      // Update user-specific audit log
      const userAuditKey = `swarm:phase3:sovereignty:user:${accessLog.userId}:audit`;
      await this.redis.lpush(userAuditKey, JSON.stringify(accessLog));
      await this.redis.expire(userAuditKey, 86400 * 90); // Keep 90 days per user

      // Update regional statistics
      await this.updateRegionalStats(accessLog);

    } catch (error) {
      console.error('Failed to log access attempt:', error);
    }
  }

  /**
   * Update regional compliance statistics
   */
  async updateRegionalStats(accessLog) {
    try {
      const { sourceRegion, targetRegion, complianceResult } = accessLog;

      // Update source region stats
      const sourceStatsKey = `swarm:phase3:sovereignty:stats:${sourceRegion}`;
      await this.redis.hincrby(sourceStatsKey, 'totalRequests', 1);

      if (complianceResult.allowed) {
        await this.redis.hincrby(sourceStatsKey, 'allowedRequests', 1);
      } else {
        await this.redis.hincrby(sourceStatsKey, 'blockedRequests', 1);
      }

      // Update cross-border transfer stats
      if (sourceRegion !== targetRegion) {
        const transferKey = `swarm:phase3:sovereignty:transfers:${sourceRegion}:to:${targetRegion}`;
        await this.redis.hincrby(transferKey, 'total', 1);

        if (complianceResult.allowed) {
          await this.redis.hincrby(transferKey, 'allowed', 1);
        }
      }

    } catch (error) {
      console.error('Failed to update regional stats:', error);
    }
  }

  /**
   * Publish events to Redis channels
   */
  async publishEvent(eventType, data) {
    try {
      const event = {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
        source: 'GeoDataController'
      };

      await this.redis.publish('swarm:phase-3:sovereignty', JSON.stringify(event));

    } catch (error) {
      console.error('Failed to publish event:', error);
    }
  }

  /**
   * Publish violation alert
   */
  async publishViolationAlert(violation) {
    try {
      const alert = {
        severity: 'HIGH',
        type: violation.violation,
        userId: violation.userId,
        sourceRegion: violation.sourceRegion,
        targetRegion: violation.targetRegion,
        operation: violation.operation,
        timestamp: new Date().toISOString(),
        requiresAction: true
      };

      await this.redis.publish('sovereignty:compliance:alerts', JSON.stringify(alert));

    } catch (error) {
      console.error('Failed to publish violation alert:', error);
    }
  }

  /**
   * Get user-specific restrictions
   */
  async getUserRestrictions(userId) {
    try {
      const restrictionKey = `swarm:phase3:sovereignty:user:${userId}:restrictions`;
      const restrictions = await this.redis.get(restrictionKey);
      return restrictions ? JSON.parse(restrictions) : null;
    } catch (error) {
      console.error('Failed to get user restrictions:', error);
      return null;
    }
  }

  /**
   * Check explicit consent for data transfer
   */
  async checkExplicitConsent(userId, targetRegion) {
    try {
      const consentKey = `swarm:phase3:sovereignty:user:${userId}:consent:${targetRegion}`;
      const consent = await this.redis.get(consentKey);
      return consent === 'true';
    } catch (error) {
      console.error('Failed to check explicit consent:', error);
      return false;
    }
  }

  /**
   * Perform additional verification for sensitive transfers
   */
  async performAdditionalVerification(context) {
    // Implementation would depend on specific verification requirements
    // This could include multi-factor authentication, digital signatures, etc.
    return true; // Placeholder
  }

  /**
   * Validate request structure
   */
  validateRequest(request) {
    const required = ['userId', 'operation', 'sourceLocation', 'targetLocation'];
    const missing = required.filter(field => !request[field]);

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    const validOperations = ['read', 'write', 'delete', 'transfer'];
    if (!validOperations.includes(request.operation)) {
      throw new Error(`Invalid operation: ${request.operation}`);
    }
  }

  /**
   * Handle routing rule updates from Redis
   */
  handleRoutingUpdate(update) {
    if (update.region && update.rules) {
      this.routingRules.set(update.region, update.rules);
      console.log(`Updated routing rules for region: ${update.region}`);
    }
  }

  /**
   * Handle compliance alerts from Redis
   */
  handleComplianceAlert(alert) {
    console.log('Compliance alert received:', alert);
    this.emit('compliance_alert', alert);
  }

  /**
   * Update performance metrics
   */
  updateMetrics(responseTime, allowed) {
    // Update average response time
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + responseTime) /
      this.metrics.totalRequests;
  }

  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    setInterval(() => {
      this.publishMetrics();
    }, 60000); // Publish metrics every minute
  }

  /**
   * Publish performance metrics
   */
  async publishMetrics() {
    try {
      const metricsKey = 'swarm:phase3:sovereignty:metrics';
      await this.redis.hset(metricsKey, {
        totalRequests: this.metrics.totalRequests,
        allowedRequests: this.metrics.allowedRequests,
        blockedRequests: this.metrics.blockedRequests,
        averageResponseTime: this.metrics.averageResponseTime.toFixed(2),
        violationsDetected: this.metrics.violationsDetected,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Failed to publish metrics:', error);
    }
  }

  /**
   * Log errors to Redis
   */
  async logError(errorLog) {
    try {
      const errorKey = `swarm:phase3:sovereignty:errors:${Date.now()}`;
      await this.redis.setex(errorKey, 86400 * 7, JSON.stringify(errorLog)); // Keep for 7 days
    } catch (error) {
      console.error('Failed to log error:', error);
    }
  }

  /**
   * Generate unique audit ID
   */
  generateAuditId() {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      regionsConfigured: this.routingRules.size,
      lastRuleUpdate: this.lastRuleUpdate,
      uptime: process.uptime()
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      await this.redis.ping();
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        metrics: this.getMetrics()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
}

module.exports = GeoDataController;