/**
 * EncryptionKeyManager - AES-256-GCM key management with envelope encryption
 * Phase 2 Fleet Manager Features & Advanced Capabilities
 *
 * Features:
 * - Envelope encryption (DEKs encrypted with master key)
 * - Automatic 90-day key rotation
 * - Secure key storage in SQLite
 * - Multi-generation key support for data re-encryption
 * - Audit trail for key lifecycle
 * - Master key from environment (MASTER_ENCRYPTION_KEY)
 */

const crypto = require('crypto');
const EventEmitter = require('events');

class EncryptionKeyManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.db = options.db; // SQLite database instance
    this.rotationDays = options.rotationDays || 90;
    this.keyDerivationIterations = options.keyDerivationIterations || 100000;

    // Master key for envelope encryption (from environment)
    this.masterKey = this._loadMasterKey(options.masterKey);
    this.masterKeySalt = options.masterKeySalt || crypto.randomBytes(32);

    // Legacy support (deprecated)
    this.masterPassword = options.masterPassword || this._generateSecurePassword();
    this.salt = options.salt || crypto.randomBytes(32);

    // Current active DEK (Data Encryption Key)
    this.activeKey = null;
    this.activeKeyId = null;
    this.activeKeyGeneration = 0;

    // DEK cache for decryption of old data
    this.keyCache = new Map(); // keyId -> decrypted DEK
    this.maxCachedKeys = options.maxCachedKeys || 10;

    // Rotation monitoring
    this.rotationCheckInterval = options.rotationCheckInterval || 86400000; // 24 hours
    this.rotationTimer = null;

    // Metrics
    this.metrics = {
      keyRotations: 0,
      keysGenerated: 0,
      decryptionAttempts: 0,
      encryptionAttempts: 0,
      keyRetrievals: 0,
      dekEncryptions: 0,
      dekDecryptions: 0,
      errors: 0
    };
  }

  /**
   * Load master key from environment or options
   * @private
   */
  _loadMasterKey(providedKey) {
    // Priority: 1. Provided key, 2. Environment variable, 3. Generate (dev only)
    const masterKeySource = providedKey
      || process.env.MASTER_ENCRYPTION_KEY
      || (process.env.NODE_ENV === 'production' ? null : this._generateMasterKey());

    if (!masterKeySource) {
      throw new Error(
        'MASTER_ENCRYPTION_KEY not found. Set environment variable or provide masterKey option. ' +
        'Generate with: openssl rand -base64 32'
      );
    }

    // Validate master key format (base64 encoded, 32+ bytes)
    let masterKeyBuffer;
    try {
      masterKeyBuffer = Buffer.from(masterKeySource, 'base64');
      if (masterKeyBuffer.length < 32) {
        throw new Error('Master key must be at least 32 bytes (256 bits)');
      }
    } catch (error) {
      throw new Error(`Invalid master key format: ${error.message}. Expected base64-encoded key.`);
    }

    // Never log the actual key
    console.log('🔑 Master key loaded successfully (length: ' + masterKeyBuffer.length + ' bytes)');
    return masterKeyBuffer;
  }

  /**
   * Generate master key (development only)
   * @private
   */
  _generateMasterKey() {
    console.warn('⚠️ Generating temporary master key. DO NOT USE IN PRODUCTION.');
    return crypto.randomBytes(32).toString('base64');
  }

  /**
   * Encrypt data encryption key (DEK) with master key using envelope encryption
   * @private
   */
  _encryptDEK(dek) {
    try {
      const iv = crypto.randomBytes(12); // GCM standard IV size
      const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);

      const encrypted = Buffer.concat([
        cipher.update(dek),
        cipher.final()
      ]);

      const authTag = cipher.getAuthTag();

      // Return IV + authTag + encrypted DEK as single buffer
      const envelopedDEK = Buffer.concat([iv, authTag, encrypted]);

      this.metrics.dekEncryptions++;

      return envelopedDEK.toString('base64');
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`DEK encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data encryption key (DEK) with master key
   * @private
   */
  _decryptDEK(envelopedDEKBase64) {
    try {
      const envelopedDEK = Buffer.from(envelopedDEKBase64, 'base64');

      // Extract IV (12 bytes) + authTag (16 bytes) + encrypted DEK
      const iv = envelopedDEK.subarray(0, 12);
      const authTag = envelopedDEK.subarray(12, 28);
      const encryptedDEK = envelopedDEK.subarray(28);

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
      decipher.setAuthTag(authTag);

      const decryptedDEK = Buffer.concat([
        decipher.update(encryptedDEK),
        decipher.final()
      ]);

      this.metrics.dekDecryptions++;

      return decryptedDEK;
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`DEK decryption failed: ${error.message}`);
    }
  }

  /**
   * Initialize encryption key manager with envelope encryption
   */
  async initialize() {
    try {
      console.log('🔑 Initializing EncryptionKeyManager with envelope encryption...');

      // Create encryption_keys table if not exists
      await this._createKeysTable();

      // Load or generate active key
      const activeKey = await this._loadActiveKey();
      if (activeKey) {
        // Decrypt DEK from database using master key
        try {
          this.activeKey = this._decryptDEK(activeKey.key_material);
          this.activeKeyId = activeKey.id;
          this.activeKeyGeneration = activeKey.generation;

          const metadata = JSON.parse(activeKey.metadata || '{}');
          const envelopeEnabled = metadata.envelopeEncryption || false;

          console.log(
            `✅ Loaded active key: ${this.activeKeyId} (gen ${this.activeKeyGeneration}, ` +
            `envelope: ${envelopeEnabled})`
          );
        } catch (dekError) {
          // Fallback for legacy keys (pre-envelope encryption)
          console.warn('⚠️ Legacy key format detected, attempting fallback...');
          try {
            this.activeKey = Buffer.from(activeKey.key_material, 'hex');
            this.activeKeyId = activeKey.id;
            this.activeKeyGeneration = activeKey.generation;
            console.log(`✅ Loaded legacy key: ${this.activeKeyId} (gen ${this.activeKeyGeneration})`);
          } catch (legacyError) {
            throw new Error(`Failed to load key: ${dekError.message}`);
          }
        }
      } else {
        await this._generateAndStoreNewKey();
        console.log(`✅ Generated new active key: ${this.activeKeyId} (envelope encryption enabled)`);
      }

      // Start rotation monitoring
      this._startRotationMonitoring();

      this.emit('initialized');
      return this;
    } catch (error) {
      console.error('❌ Failed to initialize EncryptionKeyManager:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Create encryption_keys table
   */
  async _createKeysTable() {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS encryption_keys (
          id TEXT PRIMARY KEY,
          generation INTEGER NOT NULL,
          key_material TEXT NOT NULL,
          algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
          key_size INTEGER NOT NULL DEFAULT 256,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotated', 'retired', 'compromised')),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          activated_at DATETIME,
          rotated_at DATETIME,
          expires_at DATETIME,
          metadata TEXT,
          checksum TEXT,
          derived_from TEXT,
          rotation_reason TEXT,
          usage_count INTEGER DEFAULT 0,
          last_used_at DATETIME,
          is_active BOOLEAN DEFAULT 0,
          UNIQUE(generation)
        );

        CREATE INDEX IF NOT EXISTS idx_encryption_keys_status ON encryption_keys(status);
        CREATE INDEX IF NOT EXISTS idx_encryption_keys_is_active ON encryption_keys(is_active);
        CREATE INDEX IF NOT EXISTS idx_encryption_keys_generation ON encryption_keys(generation);
        CREATE INDEX IF NOT EXISTS idx_encryption_keys_expires_at ON encryption_keys(expires_at);

        -- Audit log for key operations
        CREATE TABLE IF NOT EXISTS key_audit_log (
          id TEXT PRIMARY KEY,
          key_id TEXT NOT NULL,
          operation TEXT NOT NULL CHECK (operation IN ('generate', 'activate', 'rotate', 'retire', 'compromise', 'decrypt', 'encrypt')),
          operator TEXT,
          metadata TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (key_id) REFERENCES encryption_keys(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_key_audit_key_id ON key_audit_log(key_id);
        CREATE INDEX IF NOT EXISTS idx_key_audit_operation ON key_audit_log(operation);
        CREATE INDEX IF NOT EXISTS idx_key_audit_timestamp ON key_audit_log(timestamp);
      `;

      this.db.exec(sql, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Generate secure random password
   */
  _generateSecurePassword() {
    return crypto.randomBytes(64).toString('base64');
  }

  /**
   * Derive encryption key from master password
   */
  _deriveKey(password, salt) {
    return crypto.pbkdf2Sync(
      password,
      salt,
      this.keyDerivationIterations,
      32, // 256 bits
      'sha512'
    );
  }

  /**
   * Generate new encryption key
   */
  _generateEncryptionKey() {
    return crypto.randomBytes(32); // 256 bits for AES-256
  }

  /**
   * Load active encryption key from database
   */
  async _loadActiveKey() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM encryption_keys
        WHERE is_active = 1 AND status = 'active'
        ORDER BY generation DESC
        LIMIT 1
      `;

      this.db.get(sql, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  /**
   * Generate and store new encryption key with envelope encryption
   */
  async _generateAndStoreNewKey() {
    const keyId = `key-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const generation = this.activeKeyGeneration + 1;

    // Generate DEK (Data Encryption Key)
    const dek = this._generateEncryptionKey();

    // Encrypt DEK with master key (envelope encryption)
    const encryptedDEK = this._encryptDEK(dek);

    const expiresAt = new Date(Date.now() + this.rotationDays * 24 * 60 * 60 * 1000);

    // Checksum of encrypted DEK (not plaintext DEK)
    const checksum = crypto.createHash('sha256').update(encryptedDEK).digest('hex');

    return new Promise((resolve, reject) => {
      // Deactivate old keys
      const deactivateSql = `UPDATE encryption_keys SET is_active = 0 WHERE is_active = 1`;

      this.db.run(deactivateSql, async (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Insert new key (encrypted DEK stored)
        const insertSql = `
          INSERT INTO encryption_keys (
            id, generation, key_material, algorithm, key_size, status,
            activated_at, expires_at, checksum, is_active, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const metadata = JSON.stringify({
          rotationDays: this.rotationDays,
          generatedBy: 'EncryptionKeyManager',
          version: '2.0.0',
          envelopeEncryption: true,
          masterKeyLength: this.masterKey.length
        });

        this.db.run(insertSql, [
          keyId,
          generation,
          encryptedDEK, // Store encrypted DEK, not plaintext
          'aes-256-gcm',
          256,
          'active',
          new Date().toISOString(),
          expiresAt.toISOString(),
          checksum,
          1,
          metadata
        ], async (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Update instance state with decrypted DEK (in memory only)
          this.activeKey = dek;
          this.activeKeyId = keyId;
          this.activeKeyGeneration = generation;
          this.metrics.keysGenerated++;

          // Audit log
          await this._auditLog(keyId, 'generate', {
            generation,
            expiresAt: expiresAt.toISOString(),
            envelopeEncryption: true
          });

          this.emit('keyGenerated', { keyId, generation });
          resolve({ keyId, generation });
        });
      });
    });
  }

  /**
   * Get encryption key for encryption operations
   */
  getEncryptionKey() {
    if (!this.activeKey) {
      throw new Error('No active encryption key available');
    }

    this.metrics.encryptionAttempts++;
    this._updateKeyUsage(this.activeKeyId);
    return this.activeKey;
  }

  /**
   * Get decryption key by key ID (with envelope decryption)
   */
  async getDecryptionKey(keyId) {
    this.metrics.decryptionAttempts++;
    this.metrics.keyRetrievals++;

    // Check cache first
    if (this.keyCache.has(keyId)) {
      return this.keyCache.get(keyId);
    }

    // Load from database
    return new Promise((resolve, reject) => {
      const sql = `SELECT key_material, metadata FROM encryption_keys WHERE id = ?`;

      this.db.get(sql, [keyId], (err, row) => {
        if (err) {
          this.metrics.errors++;
          reject(err);
          return;
        }

        if (!row) {
          this.metrics.errors++;
          reject(new Error(`Key not found: ${keyId}`));
          return;
        }

        let decryptedKey;
        try {
          const metadata = JSON.parse(row.metadata || '{}');
          const envelopeEnabled = metadata.envelopeEncryption || false;

          if (envelopeEnabled) {
            // Decrypt DEK using master key (envelope encryption)
            decryptedKey = this._decryptDEK(row.key_material);
          } else {
            // Legacy key format (pre-envelope encryption)
            decryptedKey = Buffer.from(row.key_material, 'hex');
          }
        } catch (decryptError) {
          // Fallback to legacy format
          try {
            decryptedKey = Buffer.from(row.key_material, 'hex');
          } catch (legacyError) {
            this.metrics.errors++;
            reject(new Error(`Failed to decrypt key: ${decryptError.message}`));
            return;
          }
        }

        // Cache the decrypted key (in memory only, never persist plaintext)
        this._cacheKey(keyId, decryptedKey);

        // Update usage
        this._updateKeyUsage(keyId);

        resolve(decryptedKey);
      });
    });
  }

  /**
   * Cache decryption key
   */
  _cacheKey(keyId, key) {
    // Implement LRU cache
    if (this.keyCache.size >= this.maxCachedKeys) {
      const firstKey = this.keyCache.keys().next().value;
      this.keyCache.delete(firstKey);
    }

    this.keyCache.set(keyId, key);
  }

  /**
   * Update key usage statistics
   */
  _updateKeyUsage(keyId) {
    const sql = `
      UPDATE encryption_keys
      SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

    this.db.run(sql, [keyId], (err) => {
      if (err) {
        console.error('Failed to update key usage:', err);
      }
    });
  }

  /**
   * Check if key rotation is needed
   */
  async checkRotationNeeded() {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM encryption_keys
        WHERE is_active = 1 AND status = 'active'
        AND expires_at < datetime('now')
      `;

      this.db.get(sql, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(!!row);
        }
      });
    });
  }

  /**
   * Rotate encryption key
   */
  async rotateKey(reason = 'scheduled') {
    try {
      console.log(`🔄 Rotating encryption key (reason: ${reason})...`);

      // Mark old key as rotated
      if (this.activeKeyId) {
        await this._markKeyRotated(this.activeKeyId, reason);
      }

      // Generate new key
      await this._generateAndStoreNewKey();

      this.metrics.keyRotations++;

      // Audit log
      await this._auditLog(this.activeKeyId, 'rotate', { reason });

      console.log(`✅ Key rotation completed: ${this.activeKeyId}`);
      this.emit('keyRotated', {
        oldKeyId: this.activeKeyId,
        newKeyId: this.activeKeyId,
        reason
      });

      return this.activeKeyId;
    } catch (error) {
      console.error('❌ Key rotation failed:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Mark key as rotated
   */
  async _markKeyRotated(keyId, reason) {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE encryption_keys
        SET status = 'rotated', rotated_at = CURRENT_TIMESTAMP,
            is_active = 0, rotation_reason = ?
        WHERE id = ?
      `;

      this.db.run(sql, [reason, keyId], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Start automatic rotation monitoring
   */
  _startRotationMonitoring() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }

    this.rotationTimer = setInterval(async () => {
      try {
        const needsRotation = await this.checkRotationNeeded();
        if (needsRotation) {
          await this.rotateKey('automatic');
        }
      } catch (error) {
        console.error('Rotation check failed:', error);
        this.metrics.errors++;
      }
    }, this.rotationCheckInterval);

    console.log(`⏰ Key rotation monitoring started (check interval: ${this.rotationCheckInterval}ms)`);
  }

  /**
   * Stop rotation monitoring
   */
  _stopRotationMonitoring() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
      console.log('⏹️ Key rotation monitoring stopped');
    }
  }

  /**
   * Audit log for key operations
   */
  async _auditLog(keyId, operation, metadata = {}) {
    return new Promise((resolve, reject) => {
      const auditId = `audit-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const sql = `
        INSERT INTO key_audit_log (id, key_id, operation, metadata)
        VALUES (?, ?, ?, ?)
      `;

      this.db.run(sql, [
        auditId,
        keyId,
        operation,
        JSON.stringify(metadata)
      ], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(auditId);
        }
      });
    });
  }

  /**
   * Get key rotation history
   */
  async getRotationHistory(limit = 10) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM encryption_keys
        ORDER BY generation DESC
        LIMIT ?
      `;

      this.db.all(sql, [limit], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get audit trail
   */
  async getAuditTrail(keyId = null, limit = 100) {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT * FROM key_audit_log
        ${keyId ? 'WHERE key_id = ?' : ''}
        ORDER BY timestamp DESC
        LIMIT ?
      `;

      const params = keyId ? [keyId, limit] : [limit];

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeKeyId: this.activeKeyId,
      activeKeyGeneration: this.activeKeyGeneration,
      cachedKeys: this.keyCache.size,
      rotationDays: this.rotationDays
    };
  }

  /**
   * Manual key compromise handling
   */
  async markKeyCompromised(keyId, reason) {
    try {
      console.log(`⚠️ Marking key as compromised: ${keyId}`);

      const sql = `
        UPDATE encryption_keys
        SET status = 'compromised', is_active = 0
        WHERE id = ?
      `;

      await new Promise((resolve, reject) => {
        this.db.run(sql, [keyId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Audit log
      await this._auditLog(keyId, 'compromise', { reason });

      // If it's the active key, rotate immediately
      if (keyId === this.activeKeyId) {
        await this.rotateKey('compromise');
      }

      this.emit('keyCompromised', { keyId, reason });
      console.log(`✅ Key marked as compromised: ${keyId}`);
    } catch (error) {
      console.error('Failed to mark key as compromised:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Shutdown key manager
   */
  async shutdown() {
    console.log('🛑 Shutting down EncryptionKeyManager...');
    this._stopRotationMonitoring();
    this.keyCache.clear();
    this.emit('shutdown');
    console.log('✅ EncryptionKeyManager shut down');
  }
}

module.exports = EncryptionKeyManager;
