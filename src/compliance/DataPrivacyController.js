/**
 * Data Privacy Controller
 * Comprehensive PII handling, consent management, and privacy controls
 * Supports GDPR, CCPA, SOC2, and ISO27001 compliance requirements
 *
 * @version 1.0.0
 * @author Phase 3 Compliance Swarm
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');
const { complianceRequirements } = require('./compliance-requirements-matrix');

class DataPrivacyController extends EventEmitter {
  constructor(redisClient, options = {}) {
    super();
    this.redis = redisClient;
    this.options = {
      encryptionAlgorithm: 'aes-256-gcm',
      keyRotationInterval: 90 * 24 * 60 * 60 * 1000, // 90 days
      consentValidityPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year
      dataRetentionPeriod: 7 * 365 * 24 * 60 * 60 * 1000, // 7 years
      anonymizationThreshold: 5, // minimum records for differential privacy
      auditLogRetention: 6 * 365 * 24 * 60 * 60 * 1000, // 6 years
      ...options
    };

    // Privacy controls state
    this.encryptionKeys = new Map();
    this.consentRegistry = new Map();
    this.dataSubjectRequests = new Map();
    this.retentionPolicies = new Map();
    this.anonymizationCache = new Map();

    // Initialize privacy controls
    this.initializePrivacyControls();
  }

  /**
   * Initialize privacy controls and encryption keys
   */
  async initializePrivacyControls() {
    try {
      // Load or generate encryption keys
      await this.initializeEncryptionKeys();

      // Set up key rotation schedule
      this.scheduleKeyRotation();

      // Set up retention policy enforcement
      this.scheduleRetentionEnforcement();

      // Load existing consent records
      await this.loadConsentRecords();

      this.emit('privacyControlsInitialized', {
        timestamp: new Date().toISOString(),
        encryptionKeysCount: this.encryptionKeys.size,
        consentRecordsCount: this.consentRegistry.size
      });

      // Log to Redis for swarm coordination
      await this.logComplianceEvent('PRIVACY_CONTROLS_INITIALIZED', {
        encryptionKeys: this.encryptionKeys.size,
        consentRecords: this.consentRegistry.size
      });

    } catch (error) {
      this.emit('privacyControlsError', error);
      throw new Error(`Failed to initialize privacy controls: ${error.message}`);
    }
  }

  /**
   * Initialize encryption keys for data protection
   */
  async initializeEncryptionKeys() {
    try {
      // Load existing keys from Redis
      const storedKeys = await this.redis.hgetall('privacy:encryption_keys');

      if (Object.keys(storedKeys).length > 0) {
        // Load existing keys
        for (const [keyId, keyData] of Object.entries(storedKeys)) {
          const key = JSON.parse(keyData);
          this.encryptionKeys.set(keyId, key);
        }
      } else {
        // Generate initial encryption keys
        await this.generateNewEncryptionKey();
      }

    } catch (error) {
      console.error('Failed to initialize encryption keys:', error);
      throw error;
    }
  }

  /**
   * Generate new encryption key
   */
  async generateNewEncryptionKey() {
    const keyId = crypto.randomBytes(16).toString('hex');
    const key = crypto.randomBytes(32); // 256-bit key
    const iv = crypto.randomBytes(16);

    const keyData = {
      id: keyId,
      key: key.toString('hex'),
      iv: iv.toString('hex'),
      algorithm: this.options.encryptionAlgorithm,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      isActive: true
    };

    this.encryptionKeys.set(keyId, keyData);

    // Store in Redis
    await this.redis.hset('privacy:encryption_keys', keyId, JSON.stringify(keyData));

    // Deactivate old keys
    for (const [existingKeyId, existingKey] of this.encryptionKeys) {
      if (existingKeyId !== keyId && existingKey.isActive) {
        existingKey.isActive = false;
        await this.redis.hset('privacy:encryption_keys', existingKeyId, JSON.stringify(existingKey));
      }
    }

    return keyId;
  }

  /**
   * Encrypt PII data
   */
  async encryptPII(data, keyId = null) {
    try {
      // Get active encryption key
      let activeKey;
      if (keyId && this.encryptionKeys.has(keyId)) {
        activeKey = this.encryptionKeys.get(keyId);
      } else {
        activeKey = Array.from(this.encryptionKeys.values()).find(key => key.isActive);
      }

      if (!activeKey) {
        throw new Error('No active encryption key available');
      }

      const key = Buffer.from(activeKey.key, 'hex');
      const iv = Buffer.from(activeKey.iv, 'hex');

      const cipher = crypto.createCipheriv(this.options.encryptionAlgorithm, key, iv);
      cipher.setAAD(Buffer.from('PII_DATA', 'utf8'));

      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      const encryptedData = {
        encrypted,
        authTag: authTag.toString('hex'),
        keyId: activeKey.id,
        iv: iv.toString('hex'),
        algorithm: this.options.encryptionAlgorithm,
        encryptedAt: new Date().toISOString()
      };

      // Update key last used timestamp
      activeKey.lastUsed = new Date().toISOString();
      await this.redis.hset('privacy:encryption_keys', activeKey.id, JSON.stringify(activeKey));

      // Log encryption event
      await this.logComplianceEvent('PII_ENCRYPTED', {
        keyId: activeKey.id,
        algorithm: this.options.encryptionAlgorithm,
        dataType: typeof data
      });

      return encryptedData;

    } catch (error) {
      this.emit('encryptionError', error);
      throw new Error(`Failed to encrypt PII: ${error.message}`);
    }
  }

  /**
   * Decrypt PII data
   */
  async decryptPII(encryptedData) {
    try {
      const { encrypted, authTag, keyId, iv, algorithm } = encryptedData;

      if (!this.encryptionKeys.has(keyId)) {
        throw new Error(`Encryption key ${keyId} not found`);
      }

      const keyData = this.encryptionKeys.get(keyId);
      const key = Buffer.from(keyData.key, 'hex');
      const ivBuffer = Buffer.from(iv, 'hex');
      const authTagBuffer = Buffer.from(authTag, 'hex');

      const decipher = crypto.createDecipheriv(algorithm, key, ivBuffer);
      decipher.setAAD(Buffer.from('PII_DATA', 'utf8'));
      decipher.setAuthTag(authTagBuffer);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      const data = JSON.parse(decrypted);

      // Log decryption event
      await this.logComplianceEvent('PII_DECRYPTED', {
        keyId,
        algorithm,
        dataType: typeof data
      });

      return data;

    } catch (error) {
      this.emit('decryptionError', error);
      throw new Error(`Failed to decrypt PII: ${error.message}`);
    }
  }

  /**
   * Manage user consent
   */
  async manageConsent(userId, consentData) {
    try {
      const consentRecord = {
        userId,
        consentId: crypto.randomBytes(16).toString('hex'),
        purposes: consentData.purposes || [],
        dataTypes: consentData.dataTypes || [],
        retentionPeriod: consentData.retentionPeriod || this.options.dataRetentionPeriod,
        thirdPartySharing: consentData.thirdPartySharing || false,
        marketingConsent: consentData.marketingConsent || false,
        analyticsConsent: consentData.analyticsConsent || false,
        ipAddress: consentData.ipAddress,
        userAgent: consentData.userAgent,
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.options.consentValidityPeriod).toISOString(),
        version: consentData.version || '1.0',
        legalBasis: consentData.legalBasis || 'consent',
        withdrawalAllowed: consentData.withdrawalAllowed !== false
      };

      // Store consent record
      this.consentRegistry.set(consentRecord.consentId, consentRecord);
      await this.redis.hset('privacy:consents', consentRecord.consentId, JSON.stringify(consentRecord));

      // Update user consent index
      await this.redis.sadd(`privacy:user_consents:${userId}`, consentRecord.consentId);

      // Log consent event
      await this.logComplianceEvent('CONSENT_GRANTED', {
        userId,
        consentId: consentRecord.consentId,
        purposes: consentRecord.purposes,
        legalBasis: consentRecord.legalBasis
      });

      this.emit('consentGranted', consentRecord);
      return consentRecord;

    } catch (error) {
      this.emit('consentError', error);
      throw new Error(`Failed to manage consent: ${error.message}`);
    }
  }

  /**
   * Check if consent is valid for specific purpose
   */
  async hasValidConsent(userId, purpose, dataType = null) {
    try {
      const userConsentIds = await this.redis.smembers(`privacy:user_consents:${userId}`);

      for (const consentId of userConsentIds) {
        const consentRecord = await this.redis.hget('privacy:consents', consentId);
        if (!consentRecord) continue;

        const consent = JSON.parse(consentRecord);

        // Check if consent is still valid
        if (new Date(consent.expiresAt) < new Date()) {
          continue;
        }

        // Check if consent covers the purpose
        if (consent.purposes.includes(purpose)) {
          // Check if data type is specified and consented
          if (!dataType || !consent.dataTypes.length || consent.dataTypes.includes(dataType)) {
            return {
              valid: true,
              consentId: consent.consentId,
              expiresAt: consent.expiresAt,
              version: consent.version
            };
          }
        }
      }

      return { valid: false };

    } catch (error) {
      this.emit('consentCheckError', error);
      throw new Error(`Failed to check consent: ${error.message}`);
    }
  }

  /**
   * Withdraw user consent
   */
  async withdrawConsent(userId, consentId, reason = 'User request') {
    try {
      const consentRecord = await this.redis.hget('privacy:consents', consentId);
      if (!consentRecord) {
        throw new Error(`Consent record ${consentId} not found`);
      }

      const consent = JSON.parse(consentRecord);

      if (consent.userId !== userId) {
        throw new Error('Unauthorized consent withdrawal attempt');
      }

      if (!consent.withdrawalAllowed) {
        throw new Error('Consent withdrawal not allowed for this consent');
      }

      // Mark consent as withdrawn
      consent.withdrawnAt = new Date().toISOString();
      consent.withdrawalReason = reason;
      consent.status = 'withdrawn';

      // Update consent record
      await this.redis.hset('privacy:consents', consentId, JSON.stringify(consent));

      // Log withdrawal event
      await this.logComplianceEvent('CONSENT_WITHDRAWN', {
        userId,
        consentId,
        reason,
        timestamp: consent.withdrawnAt
      });

      this.emit('consentWithdrawn', consent);
      return consent;

    } catch (error) {
      this.emit('consentWithdrawalError', error);
      throw new Error(`Failed to withdraw consent: ${error.message}`);
    }
  }

  /**
   * Apply differential privacy to data
   */
  async applyDifferentialPrivacy(data, epsilon = 1.0, sensitivity = 1.0) {
    try {
      if (!Array.isArray(data) || data.length < this.options.anonymizationThreshold) {
        throw new Error('Insufficient data for differential privacy');
      }

      // Check cache first
      const cacheKey = `dp_${data.length}_${epsilon}_${sensitivity}`;
      if (this.anonymizationCache.has(cacheKey)) {
        return this.anonymizationCache.get(cacheKey);
      }

      // Add Laplace noise for numerical data
      const addLaplaceNoise = (value, epsilon, sensitivity) => {
        const scale = sensitivity / epsilon;
        const noise = (Math.random() - 0.5) * 2 * scale;
        return value + noise;
      };

      // Apply differential privacy
      const anonymizedData = data.map(item => {
        if (typeof item === 'number') {
          return addLaplaceNoise(item, epsilon, sensitivity);
        } else if (typeof item === 'object' && item !== null) {
          const anonymized = { ...item };
          // Remove direct identifiers
          delete anonymized.userId;
          delete anonymized.email;
          delete anonymized.name;
          delete anonymized.phoneNumber;

          // Add noise to numerical fields
          for (const [key, value] of Object.entries(anonymized)) {
            if (typeof value === 'number') {
              anonymized[key] = addLaplaceNoise(value, epsilon, sensitivity);
            }
          }

          return anonymized;
        }

        return item;
      });

      // Cache result
      this.anonymizationCache.set(cacheKey, anonymizedData);

      // Log anonymization event
      await this.logComplianceEvent('DIFFERENTIAL_PRIVACY_APPLIED', {
        recordCount: data.length,
        epsilon,
        sensitivity,
        timestamp: new Date().toISOString()
      });

      return anonymizedData;

    } catch (error) {
      this.emit('anonymizationError', error);
      throw new Error(`Failed to apply differential privacy: ${error.message}`);
    }
  }

  /**
   * Handle data subject access request (DSAR)
   */
  async handleDataSubjectAccessRequest(userId, requestId, requestedDataTypes = []) {
    try {
      const dsar = {
        requestId,
        userId,
        requestType: 'ACCESS',
        requestedDataTypes,
        status: 'PROCESSING',
        createdAt: new Date().toISOString(),
        completedAt: null,
        dataPackage: null,
        errors: []
      };

      this.dataSubjectRequests.set(requestId, dsar);
      await this.redis.hset('privacy:dsar', requestId, JSON.stringify(dsar));

      // Collect user data
      const userData = await this.collectUserData(userId, requestedDataTypes);

      // Prepare data package
      const dataPackage = {
        requestId,
        userId,
        exportedAt: new Date().toISOString(),
        dataCategories: Object.keys(userData),
        data: userData,
        format: 'JSON',
        encryption: 'AES-256-GCM'
      };

      // Encrypt sensitive data in package
      const encryptedPackage = await this.encryptPII(dataPackage);

      dsar.status = 'COMPLETED';
      dsar.completedAt = new Date().toISOString();
      dsar.dataPackage = encryptedPackage;

      // Update DSAR record
      await this.redis.hset('privacy:dsar', requestId, JSON.stringify(dsar));

      // Log DSAR completion
      await this.logComplianceEvent('DSAR_COMPLETED', {
        requestId,
        userId,
        requestType: 'ACCESS',
        dataCategories: Object.keys(userData),
        completedAt: dsar.completedAt
      });

      this.emit('dsarCompleted', dsar);
      return dsar;

    } catch (error) {
      this.emit('dsarError', error);

      // Update DSAR with error
      const dsar = this.dataSubjectRequests.get(requestId);
      if (dsar) {
        dsar.status = 'ERROR';
        dsar.errors.push(error.message);
        await this.redis.hset('privacy:dsar', requestId, JSON.stringify(dsar));
      }

      throw new Error(`Failed to handle DSAR: ${error.message}`);
    }
  }

  /**
   * Handle data subject erasure request (Right to be Forgotten)
   */
  async handleDataSubjectErasureRequest(userId, requestId, erasureScope = 'ALL') {
    try {
      const dsar = {
        requestId,
        userId,
        requestType: 'ERASURE',
        erasureScope,
        status: 'PROCESSING',
        createdAt: new Date().toISOString(),
        completedAt: null,
        erasedDataTypes: [],
        retainedDataTypes: [],
        errors: []
      };

      this.dataSubjectRequests.set(requestId, dsar);
      await this.redis.hset('privacy:dsar', requestId, JSON.stringify(dsar));

      // Identify user data locations
      const dataLocations = await this.identifyUserDataLocations(userId);

      // Erase data according to scope
      for (const [dataType, locations] of Object.entries(dataLocations)) {
        if (erasureScope === 'ALL' || erasureScope.includes(dataType)) {
          await this.eraseUserData(userId, dataType, locations);
          dsar.erasedDataTypes.push(dataType);
        } else {
          dsar.retainedDataTypes.push(dataType);
        }
      }

      // Withdraw all consents
      const userConsentIds = await this.redis.smembers(`privacy:user_consents:${userId}`);
      for (const consentId of userConsentIds) {
        await this.withdrawConsent(userId, consentId, 'Right to erasure request');
      }

      dsar.status = 'COMPLETED';
      dsar.completedAt = new Date().toISOString();

      // Update DSAR record
      await this.redis.hset('privacy:dsar', requestId, JSON.stringify(dsar));

      // Log erasure completion
      await this.logComplianceEvent('DSAR_ERASURE_COMPLETED', {
        requestId,
        userId,
        erasureScope,
        erasedDataTypes: dsar.erasedDataTypes,
        retainedDataTypes: dsar.retainedDataTypes,
        completedAt: dsar.completedAt
      });

      this.emit('dsarErasureCompleted', dsar);
      return dsar;

    } catch (error) {
      this.emit('dsarErasureError', error);

      // Update DSAR with error
      const dsar = this.dataSubjectRequests.get(requestId);
      if (dsar) {
        dsar.status = 'ERROR';
        dsar.errors.push(error.message);
        await this.redis.hset('privacy:dsar', requestId, JSON.stringify(dsar));
      }

      throw new Error(`Failed to handle erasure request: ${error.message}`);
    }
  }

  /**
   * Set data retention policy
   */
  async setRetentionPolicy(dataType, retentionPeriod, legalHold = false) {
    try {
      const policy = {
        dataType,
        retentionPeriod, // in milliseconds
        legalHold,
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        active: true
      };

      this.retentionPolicies.set(dataType, policy);
      await this.redis.hset('privacy:retention_policies', dataType, JSON.stringify(policy));

      // Log policy creation
      await this.logComplianceEvent('RETENTION_POLICY_SET', {
        dataType,
        retentionPeriod,
        legalHold
      });

      this.emit('retentionPolicySet', policy);
      return policy;

    } catch (error) {
      this.emit('retentionPolicyError', error);
      throw new Error(`Failed to set retention policy: ${error.message}`);
    }
  }

  /**
   * Enforce data retention policies
   */
  async enforceRetentionPolicies() {
    try {
      const enforcementResults = [];

      for (const [dataType, policy] of this.retentionPolicies) {
        if (!policy.active || policy.legalHold) {
          continue;
        }

        // Find expired data
        const cutoffDate = new Date(Date.now() - policy.retentionPeriod);
        const expiredData = await this.findExpiredData(dataType, cutoffDate);

        if (expiredData.length > 0) {
          await this.deleteExpiredData(dataType, expiredData);

          enforcementResults.push({
            dataType,
            recordsDeleted: expiredData.length,
            cutoffDate: cutoffDate.toISOString()
          });
        }
      }

      // Log enforcement results
      await this.logComplianceEvent('RETENTION_ENFORCEMENT', {
        policiesProcessed: this.retentionPolicies.size,
        results: enforcementResults,
        timestamp: new Date().toISOString()
      });

      this.emit('retentionEnforced', enforcementResults);
      return enforcementResults;

    } catch (error) {
      this.emit('retentionEnforcementError', error);
      throw new Error(`Failed to enforce retention policies: ${error.message}`);
    }
  }

  /**
   * Schedule key rotation
   */
  scheduleKeyRotation() {
    setInterval(async () => {
      try {
        await this.generateNewEncryptionKey();
        this.emit('keyRotated', {
          timestamp: new Date().toISOString(),
          totalKeys: this.encryptionKeys.size
        });
      } catch (error) {
        this.emit('keyRotationError', error);
      }
    }, this.options.keyRotationInterval);
  }

  /**
   * Schedule retention enforcement
   */
  scheduleRetentionEnforcement() {
    setInterval(async () => {
      try {
        await this.enforceRetentionPolicies();
      } catch (error) {
        this.emit('retentionEnforcementError', error);
      }
    }, 24 * 60 * 60 * 1000); // Daily
  }

  /**
   * Load existing consent records
   */
  async loadConsentRecords() {
    try {
      const consentRecords = await this.redis.hgetall('privacy:consents');

      for (const [consentId, consentData] of Object.entries(consentRecords)) {
        const consent = JSON.parse(consentData);
        this.consentRegistry.set(consentId, consent);
      }

    } catch (error) {
      console.error('Failed to load consent records:', error);
    }
  }

  /**
   * Collect user data for DSAR
   */
  async collectUserData(userId, requestedDataTypes) {
    // Implementation would vary based on actual data storage
    // This is a placeholder implementation
    const userData = {};

    if (!requestedDataTypes.length || requestedDataTypes.includes('profile')) {
      userData.profile = await this.getUserProfile(userId);
    }

    if (!requestedDataTypes.length || requestedDataTypes.includes('activity')) {
      userData.activity = await this.getUserActivity(userId);
    }

    if (!requestedDataTypes.length || requestedDataTypes.includes('consent')) {
      userData.consents = await this.getUserConsents(userId);
    }

    return userData;
  }

  /**
   * Identify user data locations
   */
  async identifyUserDataLocations(userId) {
    // Placeholder implementation
    return {
      profile: ['user_profiles', 'user_data'],
      activity: ['user_activities', 'user_logs'],
      consent: ['privacy:consents'],
      analytics: ['analytics_events', 'user_metrics']
    };
  }

  /**
   * Erase user data
   */
  async eraseUserData(userId, dataType, locations) {
    for (const location of locations) {
      // Implementation would depend on actual data storage
      await this.redis.del(`${location}:${userId}`);
    }
  }

  /**
   * Find expired data
   */
  async findExpiredData(dataType, cutoffDate) {
    // Placeholder implementation
    return [];
  }

  /**
   * Delete expired data
   */
  async deleteExpiredData(dataType, expiredData) {
    // Implementation would depend on actual data storage
    for (const record of expiredData) {
      await this.redis.del(`${dataType}:${record.id}`);
    }
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId) {
    return await this.redis.hgetall(`user_profile:${userId}`);
  }

  /**
   * Get user activity
   */
  async getUserActivity(userId) {
    return await this.redis.lrange(`user_activity:${userId}`, 0, -1);
  }

  /**
   * Get user consents
   */
  async getUserConsents(userId) {
    const consentIds = await this.redis.smembers(`privacy:user_consents:${userId}`);
    const consents = [];

    for (const consentId of consentIds) {
      const consentData = await this.redis.hget('privacy:consents', consentId);
      if (consentData) {
        consents.push(JSON.parse(consentData));
      }
    }

    return consents;
  }

  /**
   * Log compliance events to Redis
   */
  async logComplianceEvent(eventType, eventData) {
    const logEntry = {
      eventType,
      eventData,
      timestamp: new Date().toISOString(),
      source: 'DataPrivacyController'
    };

    await this.redis.lpush('swarm:phase-3:compliance', JSON.stringify(logEntry));
    await this.redis.ltrim('swarm:phase-3:compliance', 0, 9999); // Keep last 10k entries
  }

  /**
   * Get compliance status
   */
  async getComplianceStatus() {
    try {
      const status = {
        encryptionKeys: this.encryptionKeys.size,
        activeEncryptionKey: Array.from(this.encryptionKeys.values()).find(k => k.isActive)?.id,
        consentRecords: this.consentRegistry.size,
        retentionPolicies: this.retentionPolicies.size,
        pendingDSARs: Array.from(this.dataSubjectRequests.values()).filter(dsar => dsar.status === 'PROCESSING').length,
        lastKeyRotation: Array.from(this.encryptionKeys.values()).reduce((latest, key) =>
          new Date(key.createdAt) > new Date(latest) ? key.createdAt : latest, ''),
        complianceFrameworks: ['GDPR', 'CCPA', 'SOC2_TYPE2', 'ISO27001']
      };

      return status;

    } catch (error) {
      throw new Error(`Failed to get compliance status: ${error.message}`);
    }
  }
}

module.exports = DataPrivacyController;