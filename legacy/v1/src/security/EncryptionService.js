/**
 * Enterprise Encryption & Key Management Service
 *
 * Phase 3 Enterprise Security Framework Implementation
 * Provides AES-256-GCM encryption with HSM integration and 90-day key rotation
 */

import crypto from 'crypto';
import { connectRedis } from '../cli/utils/redis-client.js';

/**
 * Enterprise Encryption Service with HSM Integration
 * Provides end-to-end encryption with automated key management and rotation
 */
export class EncryptionService {
  constructor(config = {}) {
    this.config = {
      encryption: {
        algorithm: 'aes-256-gcm',
        keyLength: 32, // 256 bits
        ivLength: 16,  // 128 bits
        tagLength: 16  // 128 bits
      },
      keyManagement: {
        rotationPeriod: config.keyRotationPeriod || 90 * 24 * 60 * 60 * 1000, // 90 days
        maxKeyAge: config.maxKeyAge || 180 * 24 * 60 * 60 * 1000, // 180 days
        keyCacheSize: config.keyCacheSize || 1000,
        keyDerivationRounds: config.keyDerivationRounds || 100000
      },
      hsm: {
        enabled: config.hsmEnabled || false,
        provider: config.hsmProvider || 'software',
        slot: config.hsmSlot || 0,
        pin: config.hsmPin,
        library: config.hsmLibrary
      },
      redis: {
        host: config.redisHost || 'localhost',
        port: config.redisPort || 6379,
        password: config.redisPassword,
        db: config.redisDb || 0
      }
    };

    this.redisClient = null;
    this.keyCache = new Map();
    this.encryptionKeys = new Map();
    this.hsmClient = null;
    this.masterKey = null;
  }

  /**
   * Initialize the encryption service
   */
  async initialize() {
    try {
      this.redisClient = await connectRedis(this.config.redis);

      // Initialize HSM if enabled
      if (this.config.hsm.enabled) {
        await this.initializeHSM();
      } else {
        await this.initializeSoftwareKeyManagement();
      }

      // Load existing keys from Redis
      await this.loadEncryptionKeys();

      // Start key rotation scheduler
      this.startKeyRotationScheduler();

      await this.publishSecurityEvent('encryption-service-initialized', {
        timestamp: new Date().toISOString(),
        hsmEnabled: this.config.hsm.enabled,
        encryptionAlgorithm: this.config.encryption.algorithm,
        keyRotationPeriod: this.config.keyManagement.rotationPeriod
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize EncryptionService:', error);
      throw error;
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  async encrypt(data, options = {}) {
    try {
      const {
        keyId = null,
        associatedData = null,
        metadata = {}
      } = options;

      // Get or generate encryption key
      const encryptionKey = await this.getEncryptionKey(keyId);

      // Generate random IV
      const iv = crypto.randomBytes(this.config.encryption.ivLength);

      // Create cipher using createCipheriv (more secure)
      const cipher = crypto.createCipheriv(this.config.encryption.algorithm, encryptionKey.key, iv);
      cipher.setAAD(Buffer.from(associatedData || ''));

      // Encrypt the data
      let encrypted = cipher.update(Buffer.from(JSON.stringify(data)));
      const final = cipher.final();
      encrypted = Buffer.concat([encrypted, final]);

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Create encrypted package
      const encryptedPackage = {
        version: '1.0',
        keyId: encryptionKey.id,
        algorithm: this.config.encryption.algorithm,
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: encrypted.toString('base64'),
        associatedData: associatedData || null,
        metadata: {
          ...metadata,
          encryptedAt: new Date().toISOString(),
          encryptedBy: 'EncryptionService'
        }
      };

      await this.publishSecurityEvent('data-encrypted', {
        keyId: encryptionKey.id,
        dataSize: JSON.stringify(data).length,
        encryptedSize: encryptedPackage.data.length,
        timestamp: new Date().toISOString()
      });

      return encryptedPackage;
    } catch (error) {
      await this.publishSecurityEvent('encryption-failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  async decrypt(encryptedPackage, options = {}) {
    try {
      const {
        verifyTimestamp = true,
        maxAge = 24 * 60 * 60 * 1000 // 24 hours
      } = options;

      // Validate encrypted package structure
      this.validateEncryptedPackage(encryptedPackage);

      // Verify timestamp if requested
      if (verifyTimestamp && encryptedPackage.metadata?.encryptedAt) {
        const encryptedTime = new Date(encryptedPackage.metadata.encryptedAt).getTime();
        if (Date.now() - encryptedTime > maxAge) {
          throw new Error('Encrypted data is too old');
        }
      }

      // Get decryption key
      const decryptionKey = await this.getDecryptionKey(encryptedPackage.keyId);
      if (!decryptionKey) {
        throw new Error('Encryption key not found or has been rotated');
      }

      // Create decipher using createDecipheriv (more secure)
      const decipher = crypto.createDecipheriv(encryptedPackage.algorithm, decryptionKey.key, Buffer.from(encryptedPackage.iv, 'base64'));
      decipher.setAAD(Buffer.from(encryptedPackage.associatedData || ''));
      decipher.setAuthTag(Buffer.from(encryptedPackage.tag, 'base64'));

      // Decrypt the data
      let decrypted = decipher.update(Buffer.from(encryptedPackage.data, 'base64'));
      const final = decipher.final();
      decrypted = Buffer.concat([decrypted, final]);

      const decryptedData = JSON.parse(decrypted.toString());

      await this.publishSecurityEvent('data-decrypted', {
        keyId: encryptedPackage.keyId,
        dataSize: JSON.stringify(decryptedData).length,
        timestamp: new Date().toISOString()
      });

      return decryptedData;
    } catch (error) {
      await this.publishSecurityEvent('decryption-failed', {
        keyId: encryptedPackage?.keyId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Encrypt stream data
   */
  async encryptStream(inputStream, outputStream, options = {}) {
    try {
      const {
        keyId = null,
        chunkSize = 64 * 1024, // 64KB chunks
        associatedData = null
      } = options;

      const encryptionKey = await this.getEncryptionKey(keyId);
      const iv = crypto.randomBytes(this.config.encryption.ivLength);

      // Write encryption header
      const header = {
        version: '1.0',
        keyId: encryptionKey.id,
        algorithm: this.config.encryption.algorithm,
        iv: iv.toString('base64'),
        associatedData: associatedData || null
      };

      outputStream.write(JSON.stringify(header) + '\n');

      // Create cipher for streaming using createCipheriv
      const streamIv = crypto.randomBytes(this.config.encryption.ivLength);
      const cipher = crypto.createCipheriv(this.config.encryption.algorithm, encryptionKey.key, streamIv);
      cipher.setAAD(Buffer.from(associatedData || ''));

      // Pipe input through cipher to output
      inputStream.pipe(cipher).pipe(outputStream);

      await new Promise((resolve, reject) => {
        outputStream.on('finish', resolve);
        outputStream.on('error', reject);
      });

      await this.publishSecurityEvent('stream-encrypted', {
        keyId: encryptionKey.id,
        timestamp: new Date().toISOString()
      });

      return { keyId: encryptionKey.id, iv: iv.toString('base64') };
    } catch (error) {
      await this.publishSecurityEvent('stream-encryption-failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Decrypt stream data
   */
  async decryptStream(inputStream, outputStream, options = {}) {
    try {
      let headerLine = '';
      let header = null;

      // Read header
      for await (const chunk of inputStream) {
        const line = chunk.toString();
        headerLine += line;
        const headerIndex = headerLine.indexOf('\n');
        if (headerIndex !== -1) {
          header = JSON.parse(headerLine.substring(0, headerIndex));
          // Put the rest of the chunk back
          inputStream.unshift(Buffer.from(headerLine.substring(headerIndex + 1)));
          break;
        }
      }

      if (!header) {
        throw new Error('Invalid encrypted stream format');
      }

      // Get decryption key
      const decryptionKey = await this.getDecryptionKey(header.keyId);
      if (!decryptionKey) {
        throw new Error('Encryption key not found');
      }

      // Create decipher for streaming using createDecipheriv
      const decipher = crypto.createDecipheriv(header.algorithm, decryptionKey.key, Buffer.from(header.iv, 'base64'));
      decipher.setAAD(Buffer.from(header.associatedData || ''));

      // Pipe input through decipher to output
      inputStream.pipe(decipher).pipe(outputStream);

      await new Promise((resolve, reject) => {
        outputStream.on('finish', resolve);
        outputStream.on('error', reject);
      });

      await this.publishSecurityEvent('stream-decrypted', {
        keyId: header.keyId,
        timestamp: new Date().toISOString()
      });

      return { keyId: header.keyId };
    } catch (error) {
      await this.publishSecurityEvent('stream-decryption-failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Generate new encryption key
   */
  async generateEncryptionKey(options = {}) {
    try {
      const {
        purpose = 'general',
        metadata = {}
      } = options;

      const keyId = crypto.randomUUID();
      const key = crypto.randomBytes(this.config.encryption.keyLength);

      const keyInfo = {
        id: keyId,
        key: this.config.hsm.enabled ?
          await this.wrapKeyWithHSM(key) :
          key,
        algorithm: this.config.encryption.algorithm,
        purpose,
        createdAt: Date.now(),
        expiresAt: Date.now() + this.config.keyManagement.maxKeyAge,
        lastUsedAt: null,
        usageCount: 0,
        status: 'active',
        metadata: {
          ...metadata,
          createdBy: 'EncryptionService',
          version: '1.0'
        }
      };

      // Store key
      await this.storeEncryptionKey(keyInfo);

      // Add to cache
      this.keyCache.set(keyId, keyInfo);

      await this.publishSecurityEvent('encryption-key-generated', {
        keyId,
        purpose,
        algorithm: this.config.encryption.algorithm,
        timestamp: new Date().toISOString()
      });

      return keyInfo;
    } catch (error) {
      await this.publishSecurityEvent('key-generation-failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Rotate encryption keys
   */
  async rotateKeys() {
    try {
      const keys = Array.from(this.encryptionKeys.values());
      const now = Date.now();
      const rotationThreshold = this.config.keyManagement.rotationPeriod;

      const keysToRotate = keys.filter(key =>
        key.status === 'active' &&
        (now - key.createdAt) > rotationThreshold
      );

      const rotationResults = [];

      for (const key of keysToRotate) {
        try {
          // Generate new key
          const newKey = await this.generateEncryptionKey({
            purpose: key.purpose,
            metadata: {
              ...key.metadata,
              rotatedFrom: key.id,
              rotationReason: 'scheduled'
            }
          });

          // Mark old key for deprecation
          key.status = 'deprecated';
          key.deprecatedAt = now;
          key.deprecatedBy = newKey.id;
          await this.updateEncryptionKey(key);

          // Update references if needed
          await this.updateKeyReferences(key.id, newKey.id);

          rotationResults.push({
            oldKeyId: key.id,
            newKeyId: newKey.id,
            success: true
          });

          await this.publishSecurityEvent('key-rotated', {
            oldKeyId: key.id,
            newKeyId: newKey.id,
            purpose: key.purpose,
            timestamp: new Date().toISOString()
          });
        } catch (error) {
          rotationResults.push({
            oldKeyId: key.id,
            success: false,
            error: error.message
          });

          await this.publishSecurityEvent('key-rotation-failed', {
            keyId: key.id,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Clean up old deprecated keys
      await this.cleanupDeprecatedKeys();

      return {
        totalKeys: keys.length,
        rotatedKeys: rotationResults.filter(r => r.success).length,
        failedRotations: rotationResults.filter(r => !r.success).length,
        results: rotationResults
      };
    } catch (error) {
      await this.publishSecurityEvent('key-rotation-process-failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Derive key from password
   */
  async deriveKeyFromPassword(password, salt, options = {}) {
    try {
      const {
        iterations = this.config.keyManagement.keyDerivationRounds,
        keyLength = this.config.encryption.keyLength,
        digest = 'sha256'
      } = options;

      return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, iterations, keyLength, digest, (err, derivedKey) => {
          if (err) {
            reject(err);
          } else {
            resolve(derivedKey);
          }
        });
      });
    } catch (error) {
      throw new Error(`Key derivation failed: ${error.message}`);
    }
  }

  /**
   * Generate secure random key
   */
  generateSecureKey(size = this.config.encryption.keyLength) {
    return crypto.randomBytes(size);
  }

  /**
   * Get encryption key status
   */
  async getKeyStatus(keyId) {
    const key = await this.getEncryptionKey(keyId);
    if (!key) {
      return { status: 'not_found' };
    }

    const now = Date.now();
    const age = now - key.createdAt;
    const remainingLife = key.expiresAt - now;

    return {
      id: key.id,
      status: key.status,
      age,
      remainingLife,
      usageCount: key.usageCount,
      lastUsedAt: key.lastUsedAt,
      expired: remainingLife <= 0,
      requiresRotation: age > this.config.keyManagement.rotationPeriod
    };
  }

  // Private helper methods

  async getEncryptionKey(keyId = null) {
    // Use provided keyId or get default/current key
    const targetKeyId = keyId || await this.getCurrentKeyId();

    // Check cache first
    if (this.keyCache.has(targetKeyId)) {
      const key = this.keyCache.get(targetKeyId);
      await this.updateKeyUsage(key.id);
      return key;
    }

    // Load from storage
    const key = await this.loadEncryptionKey(targetKeyId);
    if (!key) {
      throw new Error(`Encryption key not found: ${targetKeyId}`);
    }

    // Add to cache
    this.keyCache.set(targetKeyId, key);
    await this.updateKeyUsage(key.id);

    return key;
  }

  async getDecryptionKey(keyId) {
    if (this.keyCache.has(keyId)) {
      return this.keyCache.get(keyId);
    }

    return await this.loadEncryptionKey(keyId);
  }

  async getCurrentKeyId() {
    // Get the most recent active key
    const keys = Array.from(this.encryptionKeys.values())
      .filter(key => key.status === 'active')
      .sort((a, b) => b.createdAt - a.createdAt);

    return keys.length > 0 ? keys[0].id : null;
  }

  validateEncryptedPackage(packageData) {
    const required = ['version', 'keyId', 'algorithm', 'iv', 'tag', 'data'];
    for (const field of required) {
      if (!packageData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (packageData.algorithm !== this.config.encryption.algorithm) {
      throw new Error(`Unsupported algorithm: ${packageData.algorithm}`);
    }
  }

  async storeEncryptionKey(keyInfo) {
    this.encryptionKeys.set(keyInfo.id, keyInfo);

    if (this.redisClient) {
      // Convert all values to strings for Redis storage
      const keyData = {
        id: keyInfo.id,
        algorithm: keyInfo.algorithm,
        purpose: keyInfo.purpose,
        createdAt: keyInfo.createdAt.toString(),
        expiresAt: keyInfo.expiresAt.toString(),
        lastUsedAt: (keyInfo.lastUsedAt || 0).toString(),
        usageCount: keyInfo.usageCount.toString(),
        status: keyInfo.status,
        key: keyInfo.key.toString('base64'), // Store key as base64
        metadata: JSON.stringify(keyInfo.metadata)
      };

      await this.redisClient.hSet(`encryption_key:${keyInfo.id}`, keyData);
      await this.redisClient.expire(`encryption_key:${keyInfo.id}`,
        Math.floor(this.config.keyManagement.maxKeyAge / 1000));

      // Add to keys index
      await this.redisClient.sAdd('encryption_keys:index', keyInfo.id);
    }
  }

  async loadEncryptionKey(keyId) {
    if (this.encryptionKeys.has(keyId)) {
      return this.encryptionKeys.get(keyId);
    }

    if (this.redisClient) {
      const keyData = await this.redisClient.hGetAll(`encryption_key:${keyId}`);
      if (Object.keys(keyData).length > 0) {
        // Parse and convert data back to proper types
        const parsedKey = {
          id: keyData.id,
          algorithm: keyData.algorithm,
          purpose: keyData.purpose,
          createdAt: parseInt(keyData.createdAt),
          expiresAt: parseInt(keyData.expiresAt),
          lastUsedAt: parseInt(keyData.lastUsedAt) || null,
          usageCount: parseInt(keyData.usageCount),
          status: keyData.status,
          key: Buffer.from(keyData.key, 'base64'),
          metadata: JSON.parse(keyData.metadata)
        };

        this.encryptionKeys.set(keyId, parsedKey);
        return parsedKey;
      }
    }

    return null;
  }

  async loadEncryptionKeys() {
    if (this.redisClient) {
      const keyIds = await this.redisClient.sMembers('encryption_keys:index');

      for (const keyId of keyIds) {
        try {
          await this.loadEncryptionKey(keyId);
        } catch (error) {
          console.warn(`Failed to load encryption key ${keyId}:`, error.message);
        }
      }
    }
  }

  async updateEncryptionKey(keyInfo) {
    this.encryptionKeys.set(keyInfo.id, keyInfo);

    if (this.redisClient) {
      // Convert all values to strings for Redis storage
      const keyData = {
        id: keyInfo.id,
        algorithm: keyInfo.algorithm,
        purpose: keyInfo.purpose,
        createdAt: keyInfo.createdAt.toString(),
        expiresAt: keyInfo.expiresAt.toString(),
        lastUsedAt: (keyInfo.lastUsedAt || 0).toString(),
        usageCount: keyInfo.usageCount.toString(),
        status: keyInfo.status,
        key: keyInfo.key.toString('base64'),
        metadata: JSON.stringify(keyInfo.metadata)
      };
      await this.redisClient.hSet(`encryption_key:${keyInfo.id}`, keyData);
    }
  }

  async updateKeyUsage(keyId) {
    const key = this.encryptionKeys.get(keyId);
    if (key) {
      key.lastUsedAt = Date.now();
      key.usageCount++;
      await this.updateEncryptionKey(key);
    }
  }

  async updateKeyReferences(oldKeyId, newKeyId) {
    // Update any references to the old key in other systems
    // This would be implemented based on specific needs
  }

  async cleanupDeprecatedKeys() {
    const now = Date.now();
    const deprecatedThreshold = this.config.keyManagement.maxKeyAge;

    for (const [keyId, key] of this.encryptionKeys) {
      if (key.status === 'deprecated' &&
          (now - key.deprecatedAt) > deprecatedThreshold) {

        // Remove from cache
        this.keyCache.delete(keyId);
        this.encryptionKeys.delete(keyId);

        // Remove from Redis
        if (this.redisClient) {
          await this.redisClient.del(`encryption_key:${keyId}`);
          await this.redisClient.sRem('encryption_keys:index', keyId);
        }

        await this.publishSecurityEvent('encryption-key-cleanup', {
          keyId,
          deprecatedAt: key.deprecatedAt,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  startKeyRotationScheduler() {
    // Schedule key rotation every 24 hours
    setInterval(async () => {
      try {
        await this.rotateKeys();
      } catch (error) {
        console.error('Key rotation failed:', error);
      }
    }, 24 * 60 * 60 * 1000);
  }

  async initializeHSM() {
    // Mock HSM initialization - would integrate with actual HSM provider
    console.log('Initializing HSM key management...');
    this.hsmClient = {
      wrapKey: async (key) => key, // Mock implementation
      unwrapKey: async (wrappedKey) => wrappedKey // Mock implementation
    };
  }

  async initializeSoftwareKeyManagement() {
    // Initialize master key for software-based key management
    const masterKeyId = await this.getCurrentKeyId();
    if (!masterKeyId) {
      await this.generateEncryptionKey({ purpose: 'master' });
    }
  }

  async wrapKeyWithHSM(key) {
    if (this.hsmClient) {
      return await this.hsmClient.wrapKey(key);
    }
    return key;
  }

  async publishSecurityEvent(eventType, data) {
    if (this.redisClient) {
      const event = {
        type: eventType,
        data,
        timestamp: new Date().toISOString(),
        service: 'EncryptionService'
      };

      await this.redisClient.publish('swarm:phase-3:security', JSON.stringify(event));
    }
  }
}

export default EncryptionService;