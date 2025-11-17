/**
 * Encryption Manager Tests
 *
 * Comprehensive test suite for encryption-manager.ts with target >90% coverage.
 * Tests AES-256-GCM encryption, HMAC integrity verification, key management,
 * and error handling for security-critical backup encryption.
 *
 * SECURITY CRITICAL - Part of CVSS 7.2 mitigation
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as crypto from 'crypto';
import {
  EncryptionManager,
  EncryptionMetadata,
  EncryptedBackup,
  DecryptionResult,
  EncryptionConfig,
} from '../../src/lib/encryption-manager';
import { ErrorCode } from '../../src/lib/errors';

describe('EncryptionManager', () => {
  let validKey: string;
  let encryptionManager: EncryptionManager;
  let testData: Buffer;

  beforeEach(() => {
    // Generate a valid 32-byte (256-bit) key in hex
    validKey = crypto.randomBytes(32).toString('hex');
    testData = Buffer.from('Test backup data with sensitive information', 'utf8');

    // Clear environment variables
    delete process.env.BACKUP_ENCRYPTION_ENABLED;
    delete process.env.BACKUP_ENCRYPTION_KEY;
  });

  afterEach(() => {
    delete process.env.BACKUP_ENCRYPTION_ENABLED;
    delete process.env.BACKUP_ENCRYPTION_KEY;
  });

  describe('Constructor', () => {
    it('should initialize with encryption disabled by default', () => {
      encryptionManager = new EncryptionManager();
      expect(encryptionManager.isEnabled()).toBe(false);
    });

    it('should initialize with encryption enabled when configured', () => {
      encryptionManager = new EncryptionManager({ enabled: true, masterKey: validKey });
      expect(encryptionManager.isEnabled()).toBe(true);
    });

    it('should initialize with encryption enabled from environment variables', () => {
      process.env.BACKUP_ENCRYPTION_ENABLED = 'true';
      process.env.BACKUP_ENCRYPTION_KEY = validKey;

      encryptionManager = new EncryptionManager();
      expect(encryptionManager.isEnabled()).toBe(true);
    });

    it('should initialize with encryption disabled when env var is not "true"', () => {
      process.env.BACKUP_ENCRYPTION_ENABLED = 'false';
      encryptionManager = new EncryptionManager();
      expect(encryptionManager.isEnabled()).toBe(false);
    });

    it('should throw error when encryption enabled but no key provided', () => {
      expect(() => {
        new EncryptionManager({ enabled: true });
      }).toThrow('BACKUP_ENCRYPTION_KEY environment variable is required');
    });

    it('should throw error when key is invalid hex', () => {
      expect(() => {
        new EncryptionManager({ enabled: true, masterKey: 'invalid-hex-key' });
      }).toThrow(); // Will throw either parse error or length error depending on hex validity
    });

    it('should throw error when key length is incorrect (too short)', () => {
      const shortKey = crypto.randomBytes(16).toString('hex'); // 16 bytes instead of 32
      expect(() => {
        new EncryptionManager({ enabled: true, masterKey: shortKey });
      }).toThrow('Master key must be exactly 32 bytes');
    });

    it('should throw error when key length is incorrect (too long)', () => {
      const longKey = crypto.randomBytes(64).toString('hex'); // 64 bytes instead of 32
      expect(() => {
        new EncryptionManager({ enabled: true, masterKey: longKey });
      }).toThrow('Master key must be exactly 32 bytes');
    });

    it('should accept custom key version', () => {
      encryptionManager = new EncryptionManager({
        enabled: true,
        masterKey: validKey,
        keyVersion: 'v2',
      });

      expect(encryptionManager.isEnabled()).toBe(true);
    });
  });

  describe('Encryption', () => {
    beforeEach(() => {
      encryptionManager = new EncryptionManager({ enabled: true, masterKey: validKey });
    });

    it('should encrypt data successfully', async () => {
      const backupId = 'test-backup-001';
      const encrypted = await encryptionManager.encrypt(testData, backupId);

      expect(encrypted).toBeDefined();
      expect(encrypted.data).toBeInstanceOf(Buffer);
      expect(encrypted.data.length).toBeGreaterThan(0);
      expect(encrypted.metadata).toBeDefined();
    });

    it('should include complete encryption metadata', async () => {
      const backupId = 'test-backup-002';
      const encrypted = await encryptionManager.encrypt(testData, backupId);

      expect(encrypted.metadata.algorithm).toBe('AES-256-GCM');
      expect(encrypted.metadata.iv).toMatch(/^[0-9a-f]{32}$/); // 16 bytes hex
      expect(encrypted.metadata.authTag).toMatch(/^[0-9a-f]{32}$/); // 16 bytes hex
      expect(encrypted.metadata.hmac).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex (SHA-256)
      expect(encrypted.metadata.encryptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
      expect(encrypted.metadata.keyVersion).toBe('v1');
    });

    it('should generate unique IV for each encryption', async () => {
      const encrypted1 = await encryptionManager.encrypt(testData, 'backup-1');
      const encrypted2 = await encryptionManager.encrypt(testData, 'backup-2');

      expect(encrypted1.metadata.iv).not.toBe(encrypted2.metadata.iv);
      expect(encrypted1.data.toString('hex')).not.toBe(encrypted2.data.toString('hex'));
    });

    it('should encrypt empty buffer', async () => {
      const emptyData = Buffer.from('');
      const encrypted = await encryptionManager.encrypt(emptyData, 'empty-backup');

      expect(encrypted).toBeDefined();
      expect(encrypted.data).toBeInstanceOf(Buffer);
      expect(encrypted.metadata).toBeDefined();
    });

    it('should encrypt large binary data', async () => {
      const largeData = crypto.randomBytes(1024 * 1024); // 1MB random data
      const encrypted = await encryptionManager.encrypt(largeData, 'large-backup');

      expect(encrypted).toBeDefined();
      expect(encrypted.data.length).toBeGreaterThan(0);
    });

    it('should throw error when encryption is disabled', async () => {
      const disabledManager = new EncryptionManager({ enabled: false });

      await expect(disabledManager.encrypt(testData, 'backup-id')).rejects.toThrow(
        'Encryption is not enabled'
      );
    });

    it('should use custom key version in metadata', async () => {
      const managerV2 = new EncryptionManager({
        enabled: true,
        masterKey: validKey,
        keyVersion: 'v2',
      });

      const encrypted = await managerV2.encrypt(testData, 'backup-v2');
      expect(encrypted.metadata.keyVersion).toBe('v2');
    });
  });

  describe('Decryption', () => {
    let encryptionManager: EncryptionManager;
    let encrypted: EncryptedBackup;

    beforeEach(async () => {
      encryptionManager = new EncryptionManager({ enabled: true, masterKey: validKey });
      encrypted = await encryptionManager.encrypt(testData, 'test-backup');
    });

    it('should decrypt data successfully', async () => {
      const decrypted = await encryptionManager.decrypt(encrypted, 'test-backup');

      expect(decrypted).toBeDefined();
      expect(decrypted.data).toBeInstanceOf(Buffer);
      expect(decrypted.data.toString('utf8')).toBe(testData.toString('utf8'));
      expect(decrypted.integrityVerified).toBe(true);
    });

    it('should verify HMAC integrity during decryption', async () => {
      const decrypted = await encryptionManager.decrypt(encrypted, 'test-backup');

      expect(decrypted.integrityVerified).toBe(true);
      expect(decrypted.metadata).toEqual(encrypted.metadata);
    });

    it('should detect HMAC tampering and fail decryption', async () => {
      // Tamper with encrypted data (will fail both HMAC and GCM auth tag)
      encrypted.data[0] = encrypted.data[0] ^ 0xff;

      // GCM auth tag will fail, throwing an error
      await expect(
        encryptionManager.decrypt(encrypted, 'tampered-backup')
      ).rejects.toThrow('Backup decryption failed');
    });

    it('should throw error when auth tag is invalid', async () => {
      // Tamper with auth tag
      encrypted.metadata.authTag = crypto.randomBytes(16).toString('hex');

      await expect(
        encryptionManager.decrypt(encrypted, 'invalid-auth-tag')
      ).rejects.toThrow('Backup decryption failed');
    });

    it('should throw error when IV is invalid', async () => {
      // Invalid IV length
      encrypted.metadata.iv = 'invalid';

      await expect(encryptionManager.decrypt(encrypted, 'invalid-iv')).rejects.toThrow(
        'Backup decryption failed'
      );
    });

    it('should throw error when decryption is disabled', async () => {
      const disabledManager = new EncryptionManager({ enabled: false });

      await expect(
        disabledManager.decrypt(encrypted, 'backup-id')
      ).rejects.toThrow('Encryption is not enabled');
    });

    it('should throw error when using wrong decryption key', async () => {
      const wrongKey = crypto.randomBytes(32).toString('hex');
      const wrongKeyManager = new EncryptionManager({ enabled: true, masterKey: wrongKey });

      await expect(
        wrongKeyManager.decrypt(encrypted, 'wrong-key-backup')
      ).rejects.toThrow('Backup decryption failed');
    });

    it('should decrypt empty encrypted data', async () => {
      const emptyData = Buffer.from('');
      const encryptedEmpty = await encryptionManager.encrypt(emptyData, 'empty');
      const decrypted = await encryptionManager.decrypt(encryptedEmpty, 'empty');

      expect(decrypted.data.length).toBe(0);
      expect(decrypted.integrityVerified).toBe(true);
    });
  });

  describe('Integrity Verification', () => {
    let encryptionManager: EncryptionManager;
    let encrypted: EncryptedBackup;

    beforeEach(async () => {
      encryptionManager = new EncryptionManager({ enabled: true, masterKey: validKey });
      encrypted = await encryptionManager.encrypt(testData, 'test-backup');
    });

    it('should verify integrity of valid encrypted backup', () => {
      const verified = encryptionManager.verifyIntegrity(encrypted, 'test-backup');
      expect(verified).toBe(true);
    });

    it('should detect data tampering', () => {
      // Tamper with encrypted data
      encrypted.data[0] = encrypted.data[0] ^ 0xff;

      const verified = encryptionManager.verifyIntegrity(encrypted, 'tampered-backup');
      expect(verified).toBe(false);
    });

    it('should detect metadata tampering', () => {
      // Tamper with HMAC
      encrypted.metadata.hmac = crypto.randomBytes(32).toString('hex');

      const verified = encryptionManager.verifyIntegrity(encrypted, 'tampered-hmac');
      expect(verified).toBe(false);
    });

    it('should detect IV tampering', () => {
      // Tamper with IV
      encrypted.metadata.iv = crypto.randomBytes(16).toString('hex');

      const verified = encryptionManager.verifyIntegrity(encrypted, 'tampered-iv');
      expect(verified).toBe(false);
    });

    it('should detect auth tag tampering', () => {
      // Tamper with auth tag
      encrypted.metadata.authTag = crypto.randomBytes(16).toString('hex');

      const verified = encryptionManager.verifyIntegrity(encrypted, 'tampered-auth-tag');
      expect(verified).toBe(false);
    });

    it('should return false when manager has no key', () => {
      const disabledManager = new EncryptionManager({ enabled: false });
      const verified = disabledManager.verifyIntegrity(encrypted, 'no-key');
      expect(verified).toBe(false);
    });

    it('should handle invalid hex encoding gracefully', () => {
      encrypted.metadata.iv = 'invalid-hex';

      const verified = encryptionManager.verifyIntegrity(encrypted, 'invalid-hex');
      expect(verified).toBe(false);
    });
  });

  describe('Static Methods', () => {
    describe('generateKey', () => {
      it('should generate valid 32-byte hex key', () => {
        const key = EncryptionManager.generateKey();

        expect(key).toMatch(/^[0-9a-f]{64}$/); // 32 bytes = 64 hex chars
        expect(Buffer.from(key, 'hex').length).toBe(32);
      });

      it('should generate unique keys', () => {
        const key1 = EncryptionManager.generateKey();
        const key2 = EncryptionManager.generateKey();

        expect(key1).not.toBe(key2);
      });

      it('should generate keys usable for encryption', async () => {
        const generatedKey = EncryptionManager.generateKey();
        const manager = new EncryptionManager({ enabled: true, masterKey: generatedKey });

        const encrypted = await manager.encrypt(testData, 'test');
        const decrypted = await manager.decrypt(encrypted, 'test');

        expect(decrypted.data.toString('utf8')).toBe(testData.toString('utf8'));
      });
    });

    describe('isEncrypted', () => {
      it('should detect encrypted data with metadata marker', () => {
        // Create data that contains the encrypted format marker
        const fakeEncryptedData = Buffer.from(
          'x'.repeat(100) + '{"algorithm":"AES-256-GCM"}',
          'utf8'
        );

        expect(EncryptionManager.isEncrypted(fakeEncryptedData)).toBe(true);
      });

      it('should detect unencrypted data', () => {
        const plainData = Buffer.from('This is plain text data', 'utf8');
        expect(EncryptionManager.isEncrypted(plainData)).toBe(false);
      });

      it('should return false for small buffers', () => {
        const smallBuffer = Buffer.from('small', 'utf8');
        expect(EncryptionManager.isEncrypted(smallBuffer)).toBe(false);
      });

      it('should return false for empty buffer', () => {
        const emptyBuffer = Buffer.from('');
        expect(EncryptionManager.isEncrypted(emptyBuffer)).toBe(false);
      });
    });

    describe('exportMetadata and importMetadata', () => {
      let encrypted: EncryptedBackup;

      beforeEach(async () => {
        const manager = new EncryptionManager({ enabled: true, masterKey: validKey });
        encrypted = await manager.encrypt(testData, 'test');
      });

      it('should export metadata as JSON', () => {
        const metadataJson = EncryptionManager.exportMetadata(encrypted);

        expect(metadataJson).toBeDefined();
        expect(() => JSON.parse(metadataJson)).not.toThrow();

        const parsed = JSON.parse(metadataJson);
        expect(parsed.algorithm).toBe('AES-256-GCM');
        expect(parsed.iv).toBeDefined();
        expect(parsed.authTag).toBeDefined();
        expect(parsed.hmac).toBeDefined();
      });

      it('should import metadata from JSON', () => {
        const metadataJson = EncryptionManager.exportMetadata(encrypted);
        const imported = EncryptionManager.importMetadata(metadataJson);

        expect(imported).toEqual(encrypted.metadata);
      });

      it('should preserve all metadata fields', () => {
        const metadataJson = EncryptionManager.exportMetadata(encrypted);
        const imported = EncryptionManager.importMetadata(metadataJson);

        expect(imported.algorithm).toBe(encrypted.metadata.algorithm);
        expect(imported.iv).toBe(encrypted.metadata.iv);
        expect(imported.authTag).toBe(encrypted.metadata.authTag);
        expect(imported.hmac).toBe(encrypted.metadata.hmac);
        expect(imported.encryptedAt).toBe(encrypted.metadata.encryptedAt);
        expect(imported.keyVersion).toBe(encrypted.metadata.keyVersion);
      });

      it('should throw on invalid JSON import', () => {
        expect(() => {
          EncryptionManager.importMetadata('invalid json');
        }).toThrow();
      });
    });
  });

  describe('Key Rotation Support', () => {
    it('should support multiple key versions', async () => {
      const keyV1 = EncryptionManager.generateKey();
      const keyV2 = EncryptionManager.generateKey();

      const managerV1 = new EncryptionManager({
        enabled: true,
        masterKey: keyV1,
        keyVersion: 'v1',
      });

      const managerV2 = new EncryptionManager({
        enabled: true,
        masterKey: keyV2,
        keyVersion: 'v2',
      });

      const encryptedV1 = await managerV1.encrypt(testData, 'test-v1');
      const encryptedV2 = await managerV2.encrypt(testData, 'test-v2');

      expect(encryptedV1.metadata.keyVersion).toBe('v1');
      expect(encryptedV2.metadata.keyVersion).toBe('v2');

      // Decrypt with correct version
      const decryptedV1 = await managerV1.decrypt(encryptedV1, 'test-v1');
      const decryptedV2 = await managerV2.decrypt(encryptedV2, 'test-v2');

      expect(decryptedV1.data.toString('utf8')).toBe(testData.toString('utf8'));
      expect(decryptedV2.data.toString('utf8')).toBe(testData.toString('utf8'));
    });

    it('should fail decryption with wrong key version', async () => {
      const keyV1 = EncryptionManager.generateKey();
      const keyV2 = EncryptionManager.generateKey();

      const managerV1 = new EncryptionManager({
        enabled: true,
        masterKey: keyV1,
        keyVersion: 'v1',
      });

      const managerV2 = new EncryptionManager({
        enabled: true,
        masterKey: keyV2,
        keyVersion: 'v2',
      });

      const encryptedV1 = await managerV1.encrypt(testData, 'test-v1');

      // Try to decrypt v1 data with v2 key
      await expect(managerV2.decrypt(encryptedV1, 'test-v1')).rejects.toThrow(
        'Backup decryption failed'
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle concurrent encryption operations', async () => {
      const manager = new EncryptionManager({ enabled: true, masterKey: validKey });

      const promises = Array.from({ length: 10 }, (_, i) =>
        manager.encrypt(Buffer.from(`Data ${i}`), `backup-${i}`)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result).toBeDefined();
        expect(result.data).toBeInstanceOf(Buffer);
      });
    });

    it('should handle binary data with null bytes', async () => {
      const manager = new EncryptionManager({ enabled: true, masterKey: validKey });
      const binaryData = Buffer.from([0x00, 0xff, 0x00, 0xff, 0x00]);

      const encrypted = await manager.encrypt(binaryData, 'binary');
      const decrypted = await manager.decrypt(encrypted, 'binary');

      expect(decrypted.data).toEqual(binaryData);
    });

    it('should handle UTF-8 encoded data', async () => {
      const manager = new EncryptionManager({ enabled: true, masterKey: validKey });
      const utf8Data = Buffer.from('Hello 世界 🌍', 'utf8');

      const encrypted = await manager.encrypt(utf8Data, 'utf8');
      const decrypted = await manager.decrypt(encrypted, 'utf8');

      expect(decrypted.data.toString('utf8')).toBe('Hello 世界 🌍');
    });

    it('should maintain data integrity across multiple encrypt/decrypt cycles', async () => {
      const manager = new EncryptionManager({ enabled: true, masterKey: validKey });
      let currentData = testData;

      for (let i = 0; i < 5; i++) {
        const encrypted = await manager.encrypt(currentData, `cycle-${i}`);
        const decrypted = await manager.decrypt(encrypted, `cycle-${i}`);

        expect(decrypted.data).toEqual(currentData);
        currentData = decrypted.data;
      }
    });
  });

  describe('Environment Variable Configuration', () => {
    it('should read enabled flag from environment', () => {
      process.env.BACKUP_ENCRYPTION_ENABLED = 'true';
      process.env.BACKUP_ENCRYPTION_KEY = validKey;

      const manager = new EncryptionManager();
      expect(manager.isEnabled()).toBe(true);
    });

    it('should read key from environment', async () => {
      process.env.BACKUP_ENCRYPTION_ENABLED = 'true';
      process.env.BACKUP_ENCRYPTION_KEY = validKey;

      const manager = new EncryptionManager();
      const encrypted = await manager.encrypt(testData, 'env-test');
      const decrypted = await manager.decrypt(encrypted, 'env-test');

      expect(decrypted.data.toString('utf8')).toBe(testData.toString('utf8'));
    });

    it('should prioritize config over environment', () => {
      process.env.BACKUP_ENCRYPTION_ENABLED = 'true';
      process.env.BACKUP_ENCRYPTION_KEY = validKey;

      const manager = new EncryptionManager({ enabled: false });
      expect(manager.isEnabled()).toBe(false);
    });

    it('should handle missing environment variables gracefully', () => {
      delete process.env.BACKUP_ENCRYPTION_ENABLED;
      delete process.env.BACKUP_ENCRYPTION_KEY;

      const manager = new EncryptionManager();
      expect(manager.isEnabled()).toBe(false);
    });

    it('should handle case-insensitive enabled flag', () => {
      process.env.BACKUP_ENCRYPTION_ENABLED = 'TRUE';
      process.env.BACKUP_ENCRYPTION_KEY = validKey;

      const manager = new EncryptionManager();
      expect(manager.isEnabled()).toBe(true);
    });

    it('should handle whitespace in enabled flag', () => {
      process.env.BACKUP_ENCRYPTION_ENABLED = ' true ';
      process.env.BACKUP_ENCRYPTION_KEY = validKey;

      const manager = new EncryptionManager();
      expect(manager.isEnabled()).toBe(false); // Should be strict comparison
    });
  });
});
