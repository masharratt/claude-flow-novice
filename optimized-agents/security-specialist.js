/**
 * Optimized Security Specialist Agent
 * 
 * Enhanced with multi-layered security validation, threat detection,
 * and secure coordination patterns for distributed consensus systems.
 */

import crypto from 'crypto';
import { createClient } from 'redis';

export class SecuritySpecialist {
  constructor(agentId, config = {}) {
    this.agentId = agentId;
    this.config = {
      // Security thresholds
      threatScoreThreshold: config.threatScoreThreshold || 0.7,
      signatureTimeout: config.signatureTimeout || 30000,
      maxFailedAttempts: config.maxFailedAttempts || 3,
      
      // Redis configuration
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      
      // Security keys
      hmacSecret: config.hmacSecret || process.env.HMAC_SECRET || 'default-secret-key',
      encryptionKey: config.encryptionKey || process.env.ENCRYPTION_KEY || 'default-encryption-key-32',
      
      ...config
    };
    
    this.redisClient = null;
    this.redisAvailable = false;
    this.securityState = {
      activeThreats: new Map(),
      validationCache: new Map(),
      blockedAgents: new Set(),
      auditLog: []
    };
    
    // Security metrics
    this.metrics = {
      threatsDetected: 0,
      threatsMitigated: 0,
      validationsPerformed: 0,
      securityViolations: 0
    };
  }

  /**
   * Initialize security specialist with Redis connection
   */
  async initialize() {
    try {
      this.redisClient = createClient({ url: this.config.redisUrl });
      
      this.redisClient.on('error', (err) => {
        console.log(`⚠️  Security ${this.agentId}: Redis unavailable:`, err.message);
        this.redisAvailable = false;
      });

      await this.redisClient.connect();
      this.redisAvailable = true;
      
      // Initialize security channels
      await this.setupSecurityChannels();
      
      console.log(`✅ Security Specialist ${this.agentId} initialized`);
      return true;
      
    } catch (error) {
      console.log(`⚠️  Security ${this.agentId}: Initialization failed:`, error.message);
      this.redisAvailable = false;
      return false;
    }
  }

  /**
   * Setup security monitoring channels
   */
  async setupSecurityChannels() {
    if (!this.redisAvailable) return;

    // Subscribe to security events
    const subscriber = this.redisClient.duplicate();
    await subscriber.connect();
    
    // Security threat channel
    await subscriber.subscribe('security:threats', (message) => {
      this.handleThreatAlert(JSON.parse(message));
    });
    
    // Security validation channel
    await subscriber.subscribe('security:validation', (message) => {
      this.handleValidationRequest(JSON.parse(message));
    });
    
    // Agent status channel
    await subscriber.subscribe('agents:status', (message) => {
      this.handleAgentStatusUpdate(JSON.parse(message));
    });
  }

  /**
   * Enhanced payload validation with multi-layered security checks
   */
  async validatePayload(payload, signature, context = {}) {
    const validationId = crypto.randomUUID();
    this.metrics.validationsPerformed++;
    
    const validationResult = {
      validationId,
      timestamp: Date.now(),
      payloadHash: this.hashPayload(payload),
      valid: false,
      threats: [],
      securityLevel: 'unknown'
    };

    try {
      // Layer 1: Signature verification
      const signatureValid = this.verifySignature(payload, signature);
      if (!signatureValid) {
        validationResult.threats.push({
          type: 'INVALID_SIGNATURE',
          severity: 'HIGH',
          description: 'Payload signature verification failed'
        });
      }

      // Layer 2: Content security analysis
      const contentThreats = this.analyzeContentSecurity(payload);
      validationResult.threats.push(...contentThreats);

      // Layer 3: Behavioral analysis
      const behavioralThreats = this.analyzeBehavioralPatterns(payload, context);
      validationResult.threats.push(...behavioralThreats);

      // Layer 4: Consensus-specific validation
      if (context.consensusData) {
        const consensusThreats = this.validateConsensusSecurity(payload, context.consensusData);
        validationResult.threats.push(...consensusThreats);
      }

      // Calculate overall threat score
      const threatScore = this.calculateThreatScore(validationResult.threats);
      validationResult.threatScore = threatScore;
      
      // Determine security level
      validationResult.securityLevel = this.determineSecurityLevel(threatScore);
      validationResult.valid = threatScore < this.config.threatScoreThreshold && signatureValid;

      // Cache validation result
      this.securityState.validationCache.set(validationId, validationResult);

      // Log validation
      await this.logSecurityEvent('VALIDATION_PERFORMED', {
        validationId,
        threatScore,
        valid: validationResult.valid,
        threatsCount: validationResult.threats.length
      });

      return validationResult;

    } catch (error) {
      console.error(`❌ Security ${this.agentId}: Validation error:`, error.message);
      
      await this.logSecurityEvent('VALIDATION_ERROR', {
        validationId,
        error: error.message
      });
      
      return {
        ...validationResult,
        valid: false,
        threats: [{
          type: 'VALIDATION_ERROR',
          severity: 'CRITICAL',
          description: error.message
        }]
      };
    }
  }

  /**
   * Analyze payload content for security threats
   */
  analyzeContentSecurity(payload) {
    const threats = [];
    
    // Check for injection patterns
    const suspiciousPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /\$\{.*?\}/gi,
      /union\s+select/gi,
      /drop\s+table/gi
    ];

    const payloadString = JSON.stringify(payload);
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(payloadString)) {
        threats.push({
          type: 'INJECTION_ATTEMPT',
          severity: 'HIGH',
          description: 'Suspicious injection pattern detected',
          pattern: pattern.source
        });
      }
    }

    // Check for oversized payloads
    const payloadSize = Buffer.byteLength(payloadString, 'utf8');
    if (payloadSize > 10 * 1024 * 1024) { // 10MB limit
      threats.push({
        type: 'OVERSIZED_PAYLOAD',
        severity: 'MEDIUM',
        description: 'Payload exceeds size limit',
        size: payloadSize
      });
    }

    // Check for recursive structures
    try {
      JSON.stringify(payload);
    } catch (error) {
      if (error.message.includes('circular')) {
        threats.push({
          type: 'CIRCULAR_REFERENCE',
          severity: 'HIGH',
          description: 'Circular reference detected in payload'
        });
      }
    }

    return threats;
  }

  /**
   * Analyze behavioral patterns for anomalies
   */
  analyzeBehavioralPatterns(payload, context) {
    const threats = [];
    
    // Check for unusual timing patterns
    if (context.timestamp) {
      const timeDiff = Date.now() - context.timestamp;
      if (timeDiff > this.config.signatureTimeout) {
        threats.push({
          type: 'TIMING_ANOMALY',
          severity: 'MEDIUM',
          description: 'Payload timestamp is too old',
          timeDiff
        });
      }
    }

    // Check for rapid request patterns
    if (context.agentId) {
      const requestKey = `${context.agentId}:requests`;
      const recentRequests = this.securityState.validationCache.get(requestKey) || [];
      
      // Clean old requests (older than 1 minute)
      const now = Date.now();
      const validRequests = recentRequests.filter(timestamp => now - timestamp < 60000);
      
      if (validRequests.length > 100) { // More than 100 requests per minute
        threats.push({
          type: 'RATE_LIMIT_EXCEEDED',
          severity: 'MEDIUM',
          description: 'Too many requests from agent',
          requestCount: validRequests.length
        });
      }
      
      // Update request tracking
      validRequests.push(now);
      this.securityState.validationCache.set(requestKey, validRequests);
    }

    return threats;
  }

  /**
   * Validate consensus-specific security requirements
   */
  validateConsensusSecurity(payload, consensusData) {
    const threats = [];
    
    // Check quorum integrity
    if (consensusData.quorum && payload.votes) {
      const expectedQuorum = consensusData.quorum.size;
      const actualVotes = Object.keys(payload.votes).length;
      
      if (actualVotes > expectedQuorum) {
        threats.push({
          type: 'QUORUM_VIOLATION',
          severity: 'HIGH',
          description: 'More votes than expected quorum',
          expected: expectedQuorum,
          actual: actualVotes
        });
      }
    }

    // Check for duplicate votes
    if (payload.votes) {
      const voteValues = Object.values(payload.votes);
      const uniqueVotes = [...new Set(voteValues)];
      
      if (voteValues.length !== uniqueVotes.length) {
        threats.push({
          type: 'DUPLICATE_VOTES',
          severity: 'MEDIUM',
          description: 'Duplicate vote values detected'
        });
      }
    }

    // Validate consensus algorithm parameters
    if (payload.algorithm && !['raft', 'pbft', 'crdt', 'quorum'].includes(payload.algorithm)) {
      threats.push({
        type: 'UNKNOWN_ALGORITHM',
        severity: 'MEDIUM',
        description: 'Unknown consensus algorithm specified',
        algorithm: payload.algorithm
      });
    }

    return threats;
  }

  /**
   * Calculate overall threat score from detected threats
   */
  calculateThreatScore(threats) {
    if (threats.length === 0) return 0;
    
    const severityWeights = {
      'LOW': 0.1,
      'MEDIUM': 0.3,
      'HIGH': 0.6,
      'CRITICAL': 1.0
    };
    
    let totalScore = 0;
    for (const threat of threats) {
      const weight = severityWeights[threat.severity] || 0.5;
      totalScore += weight;
    }
    
    // Normalize to 0-1 range
    return Math.min(totalScore / threats.length, 1.0);
  }

  /**
   * Determine security level based on threat score
   */
  determineSecurityLevel(threatScore) {
    if (threatScore >= 0.8) return 'CRITICAL';
    if (threatScore >= 0.6) return 'HIGH';
    if (threatScore >= 0.3) return 'MEDIUM';
    if (threatScore >= 0.1) return 'LOW';
    return 'SECURE';
  }

  /**
   * Handle threat alerts from other agents
   */
  async handleThreatAlert(alert) {
    this.metrics.threatsDetected++;
    
    const threatId = crypto.randomUUID();
    this.securityState.activeThreats.set(threatId, {
      ...alert,
      id: threatId,
      timestamp: Date.now(),
      status: 'ACTIVE'
    });

    console.log(`🚨 Security ${this.agentId}: Threat detected - ${alert.type}`);

    // Automatic threat mitigation
    if (alert.severity === 'CRITICAL' || alert.severity === 'HIGH') {
      await this.mitigateThreat(threatId, alert);
    }

    await this.logSecurityEvent('THREAT_DETECTED', {
      threatId,
      type: alert.type,
      severity: alert.severity
    });
  }

  /**
   * Mitigate active threats
   */
  async mitigateThreat(threatId, threat) {
    console.log(`🛡️  Security ${this.agentId}: Mitigating threat ${threatId}`);
    
    switch (threat.type) {
      case 'INJECTION_ATTEMPT':
        await this.blockAgent(threat.sourceAgentId, 'Injection attempt detected');
        break;
        
      case 'RATE_LIMIT_EXCEEDED':
        await this.rateLimitAgent(threat.sourceAgentId);
        break;
        
      case 'QUORUM_VIOLATION':
        await this.isolateConsensusNode(threat.nodeId);
        break;
        
      case 'INVALID_SIGNATURE':
        await this.requireReauthentication(threat.sourceAgentId);
        break;
        
      default:
        await this.logSecurityEvent('UNKNOWN_THREAT_TYPE', { threatId, type: threat.type });
    }

    this.metrics.threatsMitigated++;
    
    // Update threat status
    const threatData = this.securityState.activeThreats.get(threatId);
    if (threatData) {
      threatData.status = 'MITIGATED';
      threatData.mitigatedAt = Date.now();
    }
  }

  /**
   * Block malicious agent
   */
  async blockAgent(agentId, reason) {
    this.securityState.blockedAgents.add(agentId);
    
    if (this.redisAvailable) {
      await this.redisClient.publish('security:block', JSON.stringify({
        agentId,
        reason,
        blockedBy: this.agentId,
        timestamp: Date.now()
      }));
    }

    await this.logSecurityEvent('AGENT_BLOCKED', { agentId, reason });
  }

  /**
   * Apply rate limiting to agent
   */
  async rateLimitAgent(agentId) {
    const rateLimitKey = `rate_limit:${agentId}`;
    
    if (this.redisAvailable) {
      await this.redisClient.setEx(rateLimitKey, 300, '1'); // 5 minute rate limit
    }

    await this.logSecurityEvent('RATE_LIMIT_APPLIED', { agentId });
  }

  /**
   * Isolate compromised consensus node
   */
  async isolateConsensusNode(nodeId) {
    if (this.redisAvailable) {
      await this.redisClient.publish('consensus:isolate', JSON.stringify({
        nodeId,
        isolatedBy: this.agentId,
        timestamp: Date.now()
      }));
    }

    await this.logSecurityEvent('NODE_ISOLATED', { nodeId });
  }

  /**
   * Require reauthentication for agent
   */
  async requireReauthentication(agentId) {
    if (this.redisAvailable) {
      await this.redisClient.publish('security:reauth', JSON.stringify({
        agentId,
        requiredBy: this.agentId,
        timestamp: Date.now()
      }));
    }

    await this.logSecurityEvent('REAUTH_REQUIRED', { agentId });
  }

  /**
   * Verify cryptographic signature
   */
  verifySignature(payload, signature) {
    try {
      const expectedSignature = this.generateSignature(payload);
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate cryptographic signature
   */
  generateSignature(payload) {
    return crypto.createHmac('sha256', this.config.hmacSecret)
                  .update(JSON.stringify(payload))
                  .digest('hex');
  }

  /**
   * Hash payload for caching
   */
  hashPayload(payload) {
    return crypto.createHash('sha256')
                  .update(JSON.stringify(payload))
                  .digest('hex');
  }

  /**
   * Log security events
   */
  async logSecurityEvent(eventType, data) {
    const event = {
      id: crypto.randomUUID(),
      type: eventType,
      agentId: this.agentId,
      timestamp: Date.now(),
      data
    };

    this.securityState.auditLog.push(event);
    
    // Keep audit log manageable
    if (this.securityState.auditLog.length > 10000) {
      this.securityState.auditLog = this.securityState.auditLog.slice(-5000);
    }

    if (this.redisAvailable) {
      await this.redisClient.lPush('security:audit', JSON.stringify(event));
      await this.redisClient.lTrim('security:audit', 0, 9999);
    }
  }

  /**
   * Get security metrics
   */
  getSecurityMetrics() {
    return {
      ...this.metrics,
      activeThreats: this.securityState.activeThreats.size,
      blockedAgents: this.securityState.blockedAgents.size,
      cacheSize: this.securityState.validationCache.size,
      auditLogSize: this.securityState.auditLog.length
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

export default SecuritySpecialist;