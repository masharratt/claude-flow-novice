/**
 * Envelope Encryption Security Validation Tests
 *
 * Validates:
 * - Master key loading and validation
 * - DEK generation and encryption
 * - DEK decryption and integrity
 * - No plaintext DEKs in database
 * - Proper key rotation with envelope encryption
 * - Legacy key compatibility
 *
 * Security Requirements:
 * - Master key only in environment
 * - DEKs never stored in plaintext
 * - All encryption operations audited
 * - Minimum key sizes enforced
 */

import crypto from 'crypto';
import sqlite3 from 'sqlite3';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const EncryptionKeyManager = require('../../src/sqlite/EncryptionKeyManager');

describe('Envelope Encryption Security Validation', () => {
  let db;
  let keyManager;
  let testMasterKey;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new sqlite3.default.Database(':memory:');

    // Generate test master key
    testMasterKey = crypto.randomBytes(32).toString('base64');
  });

  afterEach(async () => {
    if (keyManager) {
      await keyManager.shutdown();
    }

    if (db) {
      await new Promise((resolve) => {
        db.close(resolve);
      });
    }
  });

  describe('Master Key Management', () => {
    test('should load master key from environment variable', async () => {
      process.env.MASTER_ENCRYPTION_KEY = testMasterKey;

      keyManager = new EncryptionKeyManager({ db });
      await keyManager.initialize();

      expect(keyManager.masterKey).toBeDefined();
      expect(keyManager.masterKey).toBeInstanceOf(Buffer);
      expect(keyManager.masterKey.length).toBeGreaterThanOrEqual(32);

      delete process.env.MASTER_ENCRYPTION_KEY;
    });

    test('should load master key from options', async () => {
      keyManager = new EncryptionKeyManager({
        db,
        masterKey: testMasterKey
      });
      await keyManager.initialize();

      expect(keyManager.masterKey).toBeDefined();
      expect(keyManager.masterKey.length).toBeGreaterThanOrEqual(32);
    });

    test('should reject invalid master key (too short)', async () => {
      const shortKey = crypto.randomBytes(16).toString('base64'); // Only 128 bits

      expect(() => {
        new EncryptionKeyManager({ db, masterKey: shortKey });
      }).toThrow('Master key must be at least 32 bytes');
    });

    test('should reject invalid master key format', async () => {
      expect(() => {
        new EncryptionKeyManager({ db, masterKey: 'invalid-not-base64' });
      }).toThrow('Invalid master key format');
    });

    test('should throw error if no master key provided in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      delete process.env.MASTER_ENCRYPTION_KEY;

      expect(() => {
        new EncryptionKeyManager({ db });
      }).toThrow('MASTER_ENCRYPTION_KEY not found');

      process.env.NODE_ENV = originalEnv;
    });

    test('should never log master key value', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      keyManager = new EncryptionKeyManager({ db, masterKey: testMasterKey });
      await keyManager.initialize();

      const logCalls = consoleSpy.mock.calls.flat();
      const masterKeyRevealed = logCalls.some(call =>
        String(call).includes(testMasterKey)
      );

      expect(masterKeyRevealed).toBe(false);

      consoleSpy.mockRestore();
    });
  });

  describe('Data Encryption Key (DEK) Generation', () => {
    beforeEach(async () => {
      keyManager = new EncryptionKeyManager({ db, masterKey: testMasterKey });
      await keyManager.initialize();
    });

    test('should generate DEK with envelope encryption', async () => {
      const metrics = keyManager.getMetrics();

      expect(metrics.keysGenerated).toBe(1);
      expect(metrics.dekEncryptions).toBe(1);
      expect(keyManager.activeKeyId).toBeDefined();
    });

    test('should encrypt DEK with master key before storage', async () => {
      return new Promise((resolve, reject) => {
        const sql = 'SELECT key_material, metadata FROM encryption_keys WHERE is_active = 1';

        db.get(sql, (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          expect(row).toBeDefined();
          expect(row.key_material).toBeDefined();

          // Verify stored key is NOT plaintext (base64-encoded encrypted data)
          const storedKey = row.key_material;
          expect(storedKey).not.toMatch(/^[0-9a-f]{64}$/); // Not hex-encoded plaintext

          // Verify envelope encryption flag in metadata
          const metadata = JSON.parse(row.metadata);
          expect(metadata.envelopeEncryption).toBe(true);
          expect(metadata.version).toBe('2.0.0');

          resolve();
        });
      });
    });

    test('should store encrypted DEK, not plaintext', async () => {
      const activeDEK = keyManager.activeKey;

      return new Promise((resolve, reject) => {
        const sql = 'SELECT key_material FROM encryption_keys WHERE is_active = 1';

        db.get(sql, (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          // The stored key material should be encrypted envelope (IV + authTag + encrypted DEK)
          const storedEncrypted = row.key_material;

          // Attempt to decode as plaintext hex (should fail or be different)
          let plaintextAttempt;
          try {
            plaintextAttempt = Buffer.from(storedEncrypted, 'hex');
          } catch {
            plaintextAttempt = null;
          }

          // Stored key should NOT equal plaintext DEK
          expect(plaintextAttempt).not.toEqual(activeDEK);

          resolve();
        });
      });
    });

    test('should generate unique DEKs for each key generation', async () => {
      const firstKeyId = keyManager.activeKeyId;
      const firstKey = keyManager.activeKey;

      // Rotate key to generate second DEK
      await keyManager.rotateKey('test-rotation');

      const secondKeyId = keyManager.activeKeyId;
      const secondKey = keyManager.activeKey;

      expect(firstKeyId).not.toBe(secondKeyId);
      expect(firstKey.equals(secondKey)).toBe(false);
    });
  });

  describe('DEK Decryption and Retrieval', () => {
    beforeEach(async () => {
      keyManager = new EncryptionKeyManager({ db, masterKey: testMasterKey });
      await keyManager.initialize();
    });

    test('should decrypt DEK correctly on retrieval', async () => {
      const originalDEK = keyManager.activeKey;
      const keyId = keyManager.activeKeyId;

      // Clear cache to force database retrieval
      keyManager.keyCache.clear();

      const retrievedDEK = await keyManager.getDecryptionKey(keyId);

      expect(retrievedDEK.equals(originalDEK)).toBe(true);
      expect(keyManager.metrics.dekDecryptions).toBeGreaterThan(0);
    });

    test('should use cached DEK when available', async () => {
      const keyId = keyManager.activeKeyId;

      // First retrieval (cache miss)
      await keyManager.getDecryptionKey(keyId);
      const firstDecryptions = keyManager.metrics.dekDecryptions;

      // Second retrieval (cache hit)
      await keyManager.getDecryptionKey(keyId);
      const secondDecryptions = keyManager.metrics.dekDecryptions;

      // Decryption count should not increase on cache hit
      expect(secondDecryptions).toBe(firstDecryptions);
    });

    test('should cache decrypted DEKs in memory only', async () => {
      const keyId = keyManager.activeKeyId;
      await keyManager.getDecryptionKey(keyId);

      expect(keyManager.keyCache.has(keyId)).toBe(true);
      expect(keyManager.keyCache.get(keyId)).toBeInstanceOf(Buffer);
    });

    test('should enforce cache size limits (LRU)', async () => {
      keyManager.maxCachedKeys = 3;

      // Generate and cache 5 keys
      const keyIds = [];
      for (let i = 0; i < 5; i++) {
        await keyManager.rotateKey('test');
        const keyId = keyManager.activeKeyId;
        keyIds.push(keyId);
        await keyManager.getDecryptionKey(keyId);
      }

      // Cache should only contain last 3 keys
      expect(keyManager.keyCache.size).toBeLessThanOrEqual(3);

      // Oldest keys should be evicted
      expect(keyManager.keyCache.has(keyIds[0])).toBe(false);
      expect(keyManager.keyCache.has(keyIds[1])).toBe(false);
    });
  });

  describe('Security Validations', () => {
    beforeEach(async () => {
      keyManager = new EncryptionKeyManager({ db, masterKey: testMasterKey });
      await keyManager.initialize();
    });

    test('should never store plaintext DEK in database', async () => {
      return new Promise((resolve, reject) => {
        const sql = 'SELECT key_material FROM encryption_keys';

        db.all(sql, (err, rows) => {
          if (err) {
            reject(err);
            return;
          }

          rows.forEach(row => {
            // Verify each stored key is encrypted (base64, not hex)
            expect(row.key_material).toBeDefined();

            // Base64-encoded envelope should contain IV (12 bytes) + authTag (16 bytes) + encrypted DEK
            const decoded = Buffer.from(row.key_material, 'base64');
            expect(decoded.length).toBeGreaterThan(28); // At least IV + authTag
          });

          resolve();
        });
      });
    });

    test('should fail decryption with wrong master key', async () => {
      const keyId = keyManager.activeKeyId;
      keyManager.keyCache.clear();

      // Change master key
      const wrongMasterKey = crypto.randomBytes(32);
      keyManager.masterKey = wrongMasterKey;

      await expect(keyManager.getDecryptionKey(keyId)).rejects.toThrow();
    });

    test('should validate DEK integrity with authentication tag', async () => {
      return new Promise((resolve, reject) => {
        const sql = 'SELECT key_material FROM encryption_keys WHERE is_active = 1';

        db.get(sql, async (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          // Tamper with encrypted DEK
          const tamperedDEK = row.key_material + 'tampered';

          const updateSql = 'UPDATE encryption_keys SET key_material = ? WHERE is_active = 1';
          db.run(updateSql, [tamperedDEK], async () => {
            keyManager.keyCache.clear();

            // Decryption should fail due to authentication tag mismatch
            await expect(
              keyManager.getDecryptionKey(keyManager.activeKeyId)
            ).rejects.toThrow();

            resolve();
          });
        });
      });
    });

    test('should audit all key operations', async () => {
      const auditTrail = await keyManager.getAuditTrail();

      expect(auditTrail.length).toBeGreaterThan(0);
      expect(auditTrail[0].operation).toBe('generate');

      const metadata = JSON.parse(auditTrail[0].metadata);
      expect(metadata.envelopeEncryption).toBe(true);
    });

    test('should enforce minimum DEK size (256 bits)', async () => {
      const dek = keyManager.activeKey;
      expect(dek.length).toBeGreaterThanOrEqual(32); // 256 bits minimum
    });
  });

  describe('Key Rotation with Envelope Encryption', () => {
    beforeEach(async () => {
      keyManager = new EncryptionKeyManager({ db, masterKey: testMasterKey });
      await keyManager.initialize();
    });

    test('should rotate key with envelope encryption', async () => {
      const originalKeyId = keyManager.activeKeyId;
      const beforeRotations = keyManager.metrics.keyRotations;

      await keyManager.rotateKey('test-rotation');

      expect(keyManager.activeKeyId).not.toBe(originalKeyId);
      expect(keyManager.metrics.keyRotations).toBe(beforeRotations + 1);
      expect(keyManager.metrics.dekEncryptions).toBeGreaterThanOrEqual(2);
    });

    test('should mark rotated keys as inactive', async () => {
      const oldKeyId = keyManager.activeKeyId;
      await keyManager.rotateKey('test');

      return new Promise((resolve, reject) => {
        const sql = 'SELECT status, is_active FROM encryption_keys WHERE id = ?';

        db.get(sql, [oldKeyId], (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          expect(row.status).toBe('rotated');
          expect(row.is_active).toBe(0);
          resolve();
        });
      });
    });

    test('should maintain access to old DEKs after rotation', async () => {
      const oldKeyId = keyManager.activeKeyId;
      const oldKey = keyManager.activeKey;

      await keyManager.rotateKey('test');
      keyManager.keyCache.clear();

      // Should still be able to decrypt old DEK
      const retrievedOldKey = await keyManager.getDecryptionKey(oldKeyId);
      expect(retrievedOldKey.equals(oldKey)).toBe(true);
    });
  });

  describe('Legacy Key Compatibility', () => {
    test('should handle legacy keys without envelope encryption', async () => {
      // Manually insert legacy key (plaintext hex format)
      const legacyDEK = crypto.randomBytes(32);
      const legacyKeyId = 'legacy-key-test';

      return new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO encryption_keys (
            id, generation, key_material, algorithm, key_size, status,
            activated_at, is_active, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const metadata = JSON.stringify({
          version: '1.0.0',
          envelopeEncryption: false
        });

        db.run(sql, [
          legacyKeyId,
          1,
          legacyDEK.toString('hex'), // Legacy format: hex-encoded plaintext
          'aes-256-gcm',
          256,
          'active',
          new Date().toISOString(),
          1,
          metadata
        ], async () => {
          keyManager = new EncryptionKeyManager({ db, masterKey: testMasterKey });
          await keyManager.initialize();

          // Should load legacy key successfully
          expect(keyManager.activeKeyId).toBe(legacyKeyId);
          expect(keyManager.activeKey.equals(legacyDEK)).toBe(true);

          resolve();
        });
      });
    });

    test('should upgrade legacy keys on rotation', async () => {
      // Insert legacy key
      const legacyDEK = crypto.randomBytes(32);
      const legacyKeyId = 'legacy-key-test';

      await new Promise((resolve, reject) => {
        const sql = `
          INSERT INTO encryption_keys (
            id, generation, key_material, algorithm, key_size, status,
            activated_at, is_active, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const metadata = JSON.stringify({
          version: '1.0.0',
          envelopeEncryption: false
        });

        db.run(sql, [
          legacyKeyId,
          1,
          legacyDEK.toString('hex'),
          'aes-256-gcm',
          256,
          'active',
          new Date().toISOString(),
          1,
          metadata
        ], resolve);
      });

      keyManager = new EncryptionKeyManager({ db, masterKey: testMasterKey });
      await keyManager.initialize();

      // Rotate to new envelope-encrypted key
      await keyManager.rotateKey('upgrade-to-envelope');

      return new Promise((resolve, reject) => {
        const sql = 'SELECT metadata FROM encryption_keys WHERE is_active = 1';

        db.get(sql, (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          const metadata = JSON.parse(row.metadata);
          expect(metadata.envelopeEncryption).toBe(true);
          expect(metadata.version).toBe('2.0.0');

          resolve();
        });
      });
    });
  });

  describe('Metrics and Monitoring', () => {
    beforeEach(async () => {
      keyManager = new EncryptionKeyManager({ db, masterKey: testMasterKey });
      await keyManager.initialize();
    });

    test('should track DEK encryption operations', async () => {
      const beforeEncryptions = keyManager.metrics.dekEncryptions;

      await keyManager.rotateKey('test');

      expect(keyManager.metrics.dekEncryptions).toBe(beforeEncryptions + 1);
    });

    test('should track DEK decryption operations', async () => {
      keyManager.keyCache.clear();

      const beforeDecryptions = keyManager.metrics.dekDecryptions;
      await keyManager.getDecryptionKey(keyManager.activeKeyId);

      expect(keyManager.metrics.dekDecryptions).toBe(beforeDecryptions + 1);
    });

    test('should include envelope encryption metrics', async () => {
      const metrics = keyManager.getMetrics();

      expect(metrics.dekEncryptions).toBeDefined();
      expect(metrics.dekDecryptions).toBeDefined();
      expect(metrics.dekEncryptions).toBeGreaterThan(0);
    });
  });
});
