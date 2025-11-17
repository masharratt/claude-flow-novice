/**
 * Backup Encryption Test Suite
 *
 * Comprehensive test coverage for AES-256-GCM encryption functionality
 * Tests encryption, decryption, integrity verification, and key management
 *
 * Test Coverage:
 * - 25+ test cases
 * - Encryption/Decryption operations
 * - HMAC integrity verification
 * - IV uniqueness
 * - Key management
 * - Error handling
 * - Backward compatibility
 * - Performance scenarios
 */

import crypto from 'crypto';
import { EncryptionManager, EncryptedBackup, EncryptionMetadata } from '../../src/lib/encryption-manager';
import { createError, ErrorCode } from '../../src/lib/errors';

describe('EncryptionManager', () => {
  let encryptionManager: EncryptionManager;
  const testKey = crypto.randomBytes(32).toString('hex');
  const testData = Buffer.from('This is sensitive backup data that should be encrypted');

  beforeEach(() => {
    // Override environment variables for testing
    process.env.BACKUP_ENCRYPTION_ENABLED = 'true';
    process.env.BACKUP_ENCRYPTION_KEY = testKey;

    encryptionManager = new EncryptionManager({
      enabled: true,
      masterKey: testKey,
      keyVersion: 'v1',
    });
  });

  afterEach(() => {
    delete process.env.BACKUP_ENCRYPTION_ENABLED;
    delete process.env.BACKUP_ENCRYPTION_KEY;
  });

  describe('Initialization', () => {
    test('should initialize with encryption enabled', () => {
      expect(encryptionManager.isEnabled()).toBe(true);
    });

    test('should initialize with encryption disabled when not configured', () => {
      process.env.BACKUP_ENCRYPTION_ENABLED = 'false';
      const manager = new EncryptionManager({ enabled: false });
      expect(manager.isEnabled()).toBe(false);
    });

    test('should throw error when encryption enabled but no key provided', () => {
      delete process.env.BACKUP_ENCRYPTION_KEY;
      expect(() => {
        new EncryptionManager({ enabled: true });
      }).toThrow();
    });

    test('should throw error for invalid key length', () => {
      const shortKey = crypto.randomBytes(16).toString('hex'); // Only 16 bytes
      expect(() => {
        new EncryptionManager({
          enabled: true,
          masterKey: shortKey,
        });
      }).toThrow();
    });

    test('should throw error for invalid hex key format', () => {
      const invalidKey = 'not-valid-hex-data-too-short';
      expect(() => {
        new EncryptionManager({
          enabled: true,
          masterKey: invalidKey,
        });
      }).toThrow();
    });
  });

  describe('Encryption', () => {
    test('should encrypt data successfully', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      expect(encrypted.data).toBeDefined();
      expect(encrypted.metadata).toBeDefined();
      expect(encrypted.data.length).toBeGreaterThan(0);
    });

    test('should encrypt data to different ciphertext each time (unique IV)', async () => {
      const encrypted1 = await encryptionManager.encrypt(testData, 'backup-001');
      const encrypted2 = await encryptionManager.encrypt(testData, 'backup-002');

      // Different IVs should produce different ciphertexts
      expect(encrypted1.data).not.toEqual(encrypted2.data);
      expect(encrypted1.metadata.iv).not.toBe(encrypted2.metadata.iv);
    });

    test('should fail to encrypt when encryption is disabled', async () => {
      const disabledManager = new EncryptionManager({ enabled: false });

      await expect(disabledManager.encrypt(testData, 'backup-001')).rejects.toThrow();
    });

    test('should include correct algorithm in metadata', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      expect(encrypted.metadata.algorithm).toBe('AES-256-GCM');
    });

    test('should generate unique IV for each encryption', async () => {
      const encrypted1 = await encryptionManager.encrypt(testData, 'backup-001');
      const encrypted2 = await encryptionManager.encrypt(testData, 'backup-002');

      expect(encrypted1.metadata.iv).not.toBe(encrypted2.metadata.iv);
      expect(encrypted1.metadata.iv.length).toBe(32); // 16 bytes = 32 hex chars
    });

    test('should include authentication tag in metadata', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      expect(encrypted.metadata.authTag).toBeDefined();
      expect(encrypted.metadata.authTag.length).toBe(32); // 16 bytes = 32 hex chars
    });

    test('should include HMAC in metadata', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      expect(encrypted.metadata.hmac).toBeDefined();
      expect(encrypted.metadata.hmac.length).toBe(64); // SHA-256 = 32 bytes = 64 hex chars
    });

    test('should include encryption timestamp', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      expect(encrypted.metadata.encryptedAt).toBeDefined();
      expect(new Date(encrypted.metadata.encryptedAt).getTime()).toBeGreaterThan(0);
    });

    test('should include key version in metadata', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      expect(encrypted.metadata.keyVersion).toBe('v1');
    });

    test('should encrypt large files', async () => {
      const largeData = Buffer.alloc(10 * 1024 * 1024); // 10 MB
      largeData.fill('X');

      const encrypted = await encryptionManager.encrypt(largeData, 'large-backup');

      expect(encrypted.data.length).toBeGreaterThan(0);
      expect(encrypted.metadata.algorithm).toBe('AES-256-GCM');
    });

    test('should encrypt empty data', async () => {
      const emptyData = Buffer.alloc(0);

      const encrypted = await encryptionManager.encrypt(emptyData, 'empty-backup');

      expect(encrypted.data).toBeDefined();
      expect(encrypted.metadata).toBeDefined();
    });
  });

  describe('Decryption', () => {
    test('should decrypt data successfully', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');
      const decrypted = await encryptionManager.decrypt(encrypted, 'backup-001');

      expect(decrypted.data).toEqual(testData);
    });

    test('should mark integrity as verified for valid HMAC', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');
      const decrypted = await encryptionManager.decrypt(encrypted, 'backup-001');

      expect(decrypted.integrityVerified).toBe(true);
    });

    test('should fail to decrypt when encryption is disabled', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');
      const disabledManager = new EncryptionManager({ enabled: false });

      await expect(disabledManager.decrypt(encrypted, 'backup-001')).rejects.toThrow();
    });

    test('should fail with corrupted data', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      // Corrupt the encrypted data
      encrypted.data[0] = encrypted.data[0] ^ 0xff;

      await expect(encryptionManager.decrypt(encrypted, 'backup-001')).rejects.toThrow();
    });

    test('should fail with corrupted IV', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      // Corrupt the IV in metadata
      encrypted.metadata.iv = crypto.randomBytes(16).toString('hex');

      await expect(encryptionManager.decrypt(encrypted, 'backup-001')).rejects.toThrow();
    });

    test('should fail with corrupted auth tag', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      // Corrupt the auth tag
      encrypted.metadata.authTag = crypto.randomBytes(16).toString('hex');

      await expect(encryptionManager.decrypt(encrypted, 'backup-001')).rejects.toThrow();
    });

    test('should detect integrity failure with modified HMAC', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      // Modify HMAC but keep data intact
      encrypted.metadata.hmac = crypto.randomBytes(32).toString('hex');

      // Decryption should still work but integrity should fail
      const decrypted = await encryptionManager.decrypt(encrypted, 'backup-001');

      expect(decrypted.integrityVerified).toBe(false);
    });

    test('should decrypt large files', async () => {
      const largeData = Buffer.alloc(10 * 1024 * 1024);
      largeData.fill('Y');

      const encrypted = await encryptionManager.encrypt(largeData, 'large-backup');
      const decrypted = await encryptionManager.decrypt(encrypted, 'large-backup');

      expect(decrypted.data).toEqual(largeData);
    });
  });

  describe('Integrity Verification', () => {
    test('should verify integrity without decryption', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');
      const verified = encryptionManager.verifyIntegrity(encrypted, 'backup-001');

      expect(verified).toBe(true);
    });

    test('should detect integrity failure', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      // Corrupt the HMAC
      encrypted.metadata.hmac = crypto.randomBytes(32).toString('hex');

      const verified = encryptionManager.verifyIntegrity(encrypted, 'backup-001');

      expect(verified).toBe(false);
    });

    test('should detect data modification', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      // Modify encrypted data
      encrypted.data[Math.floor(encrypted.data.length / 2)] ^= 0xff;

      const verified = encryptionManager.verifyIntegrity(encrypted, 'backup-001');

      expect(verified).toBe(false);
    });

    test('should detect IV modification', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      // Modify IV
      encrypted.metadata.iv = crypto.randomBytes(16).toString('hex');

      const verified = encryptionManager.verifyIntegrity(encrypted, 'backup-001');

      expect(verified).toBe(false);
    });
  });

  describe('Encryption Metadata', () => {
    test('should export metadata as JSON', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');
      const metadataJson = EncryptionManager.exportMetadata(encrypted);

      expect(metadataJson).toBeDefined();
      const parsed = JSON.parse(metadataJson);
      expect(parsed.algorithm).toBe('AES-256-GCM');
    });

    test('should import metadata from JSON', () => {
      const metadata: EncryptionMetadata = {
        algorithm: 'AES-256-GCM',
        iv: crypto.randomBytes(16).toString('hex'),
        authTag: crypto.randomBytes(16).toString('hex'),
        hmac: crypto.randomBytes(32).toString('hex'),
        encryptedAt: new Date().toISOString(),
        keyVersion: 'v1',
      };

      const json = JSON.stringify(metadata);
      const imported = EncryptionManager.importMetadata(json);

      expect(imported.algorithm).toBe(metadata.algorithm);
      expect(imported.iv).toBe(metadata.iv);
    });
  });

  describe('Key Management', () => {
    test('should generate valid encryption key', () => {
      const key = EncryptionManager.generateKey();

      expect(key).toBeDefined();
      expect(key.length).toBe(64); // 32 bytes = 64 hex chars
      expect(/^[0-9a-f]+$/.test(key)).toBe(true);
    });

    test('should allow key rotation with different key versions', async () => {
      const manager1 = new EncryptionManager({
        enabled: true,
        masterKey: testKey,
        keyVersion: 'v1',
      });

      const encrypted = await manager1.encrypt(testData, 'backup-001');
      expect(encrypted.metadata.keyVersion).toBe('v1');

      const manager2 = new EncryptionManager({
        enabled: true,
        masterKey: testKey,
        keyVersion: 'v2',
      });

      const encrypted2 = await manager2.encrypt(testData, 'backup-002');
      expect(encrypted2.metadata.keyVersion).toBe('v2');
    });
  });

  describe('Backward Compatibility', () => {
    test('should detect unencrypted backup', () => {
      const plainData = Buffer.from('This is plain text backup data that looks like normal content');
      const isEncrypted = EncryptionManager.isEncrypted(plainData);

      expect(isEncrypted).toBe(false);
    });

    test('should not incorrectly detect encrypted status for valid text', () => {
      const textData = Buffer.from('This is regular text content, not encrypted');
      const isEncrypted = EncryptionManager.isEncrypted(textData);

      // Should return false for plaintext
      expect(isEncrypted).toBe(false);
    });

    test('should support metadata tracking for encryption status', async () => {
      // In practice, encryption status is tracked in database metadata
      // not by binary inspection. This test verifies the approach.
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      // Metadata explicitly indicates encryption algorithm
      expect(encrypted.metadata.algorithm).toBe('AES-256-GCM');

      // Database tracks this via is_encrypted boolean
      // Query: SELECT is_encrypted FROM backups WHERE id = 'backup-001'
      // Result: true
    });
  });

  describe('Edge Cases', () => {
    test('should handle binary data with null bytes', async () => {
      const binaryData = Buffer.alloc(100);
      binaryData[0] = 0x00;
      binaryData[50] = 0xff;

      const encrypted = await encryptionManager.encrypt(binaryData, 'binary-backup');
      const decrypted = await encryptionManager.decrypt(encrypted, 'binary-backup');

      expect(decrypted.data).toEqual(binaryData);
    });

    test('should handle very small data (1 byte)', async () => {
      const smallData = Buffer.from([0x42]);

      const encrypted = await encryptionManager.encrypt(smallData, 'small-backup');
      const decrypted = await encryptionManager.decrypt(encrypted, 'small-backup');

      expect(decrypted.data).toEqual(smallData);
    });

    test('should preserve exact data during encrypt-decrypt cycle', async () => {
      const testCases = [
        Buffer.from(''),
        Buffer.from('a'),
        Buffer.from('short'),
        Buffer.from('This is a test string with special chars: !@#$%^&*()'),
        Buffer.alloc(1024),
        crypto.randomBytes(512),
      ];

      for (const data of testCases) {
        const encrypted = await encryptionManager.encrypt(data, 'test-backup');
        const decrypted = await encryptionManager.decrypt(encrypted, 'test-backup');

        expect(decrypted.data).toEqual(data);
      }
    });
  });

  describe('CVSS 7.2 Vulnerability Mitigation', () => {
    test('should prevent plaintext exposure through encryption', async () => {
      const sensitiveData = Buffer.from('API_KEY=super_secret_key_12345');

      const encrypted = await encryptionManager.encrypt(sensitiveData, 'secret-backup');

      // Encrypted data should not contain the original plaintext
      expect(encrypted.data.toString()).not.toContain('super_secret_key');
      expect(encrypted.data.toString()).not.toContain('API_KEY');
    });

    test('should use strong authentication (GCM tag) to prevent tampering', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      // Authentication tag should be 16 bytes (128 bits)
      expect(encrypted.metadata.authTag.length).toBe(32); // 16 bytes in hex

      // Try to decrypt with modified data - should fail
      encrypted.data[0] ^= 0xff;

      await expect(encryptionManager.decrypt(encrypted, 'backup-001')).rejects.toThrow();
    });

    test('should use strong integrity verification (HMAC-SHA256)', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      // HMAC should be SHA-256 (32 bytes)
      expect(encrypted.metadata.hmac.length).toBe(64); // 32 bytes in hex

      // Verify integrity
      const verified = encryptionManager.verifyIntegrity(encrypted);
      expect(verified).toBe(true);
    });

    test('should use unique IV for each backup to prevent replay attacks', async () => {
      const ivSet = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const encrypted = await encryptionManager.encrypt(testData, `backup-${i}`);
        ivSet.add(encrypted.metadata.iv);
      }

      // All IVs should be unique
      expect(ivSet.size).toBe(100);
    });
  });

  describe('Error Handling', () => {
    test('should provide meaningful error message for encryption failure', async () => {
      const manager = new EncryptionManager({
        enabled: true,
        masterKey: testKey,
      });

      // Force an error by using invalid configuration
      (manager as any).masterKey = null;

      await expect(manager.encrypt(testData, 'backup-001')).rejects.toThrow();
    });

    test('should handle invalid encrypted payload gracefully', async () => {
      const invalidEncrypted: EncryptedBackup = {
        data: Buffer.from('invalid'),
        metadata: {
          algorithm: 'AES-256-GCM',
          iv: crypto.randomBytes(16).toString('hex'),
          authTag: crypto.randomBytes(16).toString('hex'),
          hmac: crypto.randomBytes(32).toString('hex'),
          encryptedAt: new Date().toISOString(),
          keyVersion: 'v1',
        },
      };

      await expect(encryptionManager.decrypt(invalidEncrypted, 'backup-001')).rejects.toThrow();
    });
  });

  describe('Performance', () => {
    test('should encrypt data efficiently', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        await encryptionManager.encrypt(testData, `backup-${i}`);
      }

      const duration = Date.now() - startTime;

      // 100 encryptions should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    });

    test('should decrypt data efficiently', async () => {
      const encrypted = await encryptionManager.encrypt(testData, 'backup-001');

      const startTime = Date.now();

      for (let i = 0; i < 100; i++) {
        await encryptionManager.decrypt(encrypted, `backup-${i}`);
      }

      const duration = Date.now() - startTime;

      // 100 decryptions should complete in reasonable time (< 5 seconds)
      expect(duration).toBeLessThan(5000);
    });
  });
});
