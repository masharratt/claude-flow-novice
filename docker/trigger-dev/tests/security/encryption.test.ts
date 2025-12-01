/**
 * Tests for backup-encryption.ts
 *
 * P0.2: AES-256-GCM Backup Encryption
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  encryptBackup,
  decryptBackup,
  validateBackupIntegrity,
  generateBackupKey,
  serializeEncryptedBackup,
  parseEncryptedBackup,
  encryptBackupFile,
  decryptBackupFile,
  getOrCreateBackupKey,
  rotateBackupKey,
  EncryptionError,
  DecryptionError,
  IntegrityError,
} from '../../src/lib/backup-encryption';

describe('Backup Encryption', () => {
  let testKey: string;
  let testData: Buffer;
  let tempDir: string;

  beforeEach(async () => {
    testKey = generateBackupKey();
    testData = Buffer.from('Test RuVector database content with sensitive data');
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'encryption-test-'));
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Key Generation', () => {
    it('should generate cryptographically secure keys', () => {
      const key1 = generateBackupKey();
      const key2 = generateBackupKey();

      expect(key1).toBeDefined();
      expect(key2).toBeDefined();
      expect(key1).not.toBe(key2); // Keys should be unique

      // Base64-encoded 32 bytes = 44 characters
      expect(key1.length).toBe(44);
      expect(Buffer.from(key1, 'base64').length).toBe(32);
    });

    it('should get key from environment variable', () => {
      const envKey = 'test-key-from-environment';
      process.env.RUVECTOR_BACKUP_KEY = envKey;

      const key = getOrCreateBackupKey();
      expect(key).toBe(envKey);

      delete process.env.RUVECTOR_BACKUP_KEY;
    });

    it('should generate key if not in environment (dev mode)', () => {
      delete process.env.RUVECTOR_BACKUP_KEY;
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const key = getOrCreateBackupKey();
      expect(key).toBeDefined();
      expect(key.length).toBeGreaterThan(0);

      process.env.NODE_ENV = originalEnv;
    });

    it('should throw in production without environment key', () => {
      delete process.env.RUVECTOR_BACKUP_KEY;
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(() => getOrCreateBackupKey()).toThrow(
        'RUVECTOR_BACKUP_KEY environment variable must be set in production'
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Encryption', () => {
    it('should encrypt data successfully', () => {
      const encrypted = encryptBackup(testData, testKey);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.hmac).toBeDefined();
      expect(encrypted.salt).toBeDefined();

      // Verify buffer lengths
      expect(encrypted.iv.length).toBe(12); // GCM standard
      expect(encrypted.authTag.length).toBe(16); // GCM auth tag
      expect(encrypted.hmac.length).toBe(32); // SHA-256
      expect(encrypted.salt.length).toBe(32); // Salt for key derivation

      // Verify metadata
      expect(encrypted.metadata.algorithm).toBe('aes-256-gcm');
      expect(encrypted.metadata.originalSize).toBe(testData.length);
      expect(encrypted.metadata.encryptedSize).toBe(encrypted.ciphertext.length);
    });

    it('should produce different ciphertext for same data (random IV)', () => {
      const encrypted1 = encryptBackup(testData, testKey);
      const encrypted2 = encryptBackup(testData, testKey);

      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toEqual(encrypted2.iv);
      expect(encrypted1.salt).not.toEqual(encrypted2.salt);
    });

    it('should encrypt empty data', () => {
      const emptyData = Buffer.alloc(0);
      const encrypted = encryptBackup(emptyData, testKey);

      expect(encrypted.ciphertext.length).toBe(0);
      expect(encrypted.metadata.originalSize).toBe(0);
    });

    it('should encrypt large data', () => {
      const largeData = Buffer.alloc(10 * 1024 * 1024); // 10 MB
      crypto.randomFillSync(largeData);

      const encrypted = encryptBackup(largeData, testKey);

      expect(encrypted.ciphertext.length).toBe(largeData.length);
      expect(encrypted.metadata.originalSize).toBe(largeData.length);
    });
  });

  describe('Decryption', () => {
    it('should decrypt data successfully', () => {
      const encrypted = encryptBackup(testData, testKey);
      const decrypted = decryptBackup(encrypted, testKey);

      expect(decrypted).toEqual(testData);
    });

    it('should fail with wrong key', () => {
      const encrypted = encryptBackup(testData, testKey);
      const wrongKey = generateBackupKey();

      expect(() => decryptBackup(encrypted, wrongKey)).toThrow(IntegrityError);
    });

    it('should fail with corrupted ciphertext', () => {
      const encrypted = encryptBackup(testData, testKey);

      // Corrupt ciphertext
      encrypted.ciphertext[0] ^= 0xFF;

      expect(() => decryptBackup(encrypted, testKey)).toThrow();
    });

    it('should fail with corrupted IV', () => {
      const encrypted = encryptBackup(testData, testKey);

      // Corrupt IV
      encrypted.iv[0] ^= 0xFF;

      expect(() => decryptBackup(encrypted, testKey)).toThrow(IntegrityError);
    });

    it('should fail with corrupted auth tag', () => {
      const encrypted = encryptBackup(testData, testKey);

      // Corrupt auth tag
      encrypted.authTag[0] ^= 0xFF;

      expect(() => decryptBackup(encrypted, testKey)).toThrow(IntegrityError);
    });

    it('should fail with corrupted HMAC', () => {
      const encrypted = encryptBackup(testData, testKey);

      // Corrupt HMAC
      encrypted.hmac[0] ^= 0xFF;

      expect(() => decryptBackup(encrypted, testKey)).toThrow(IntegrityError);
    });
  });

  describe('Integrity Validation', () => {
    it('should validate backup integrity without decrypting', () => {
      const encrypted = encryptBackup(testData, testKey);
      const valid = validateBackupIntegrity(encrypted, testKey);

      expect(valid).toBe(true);
    });

    it('should detect integrity failure with wrong key', () => {
      const encrypted = encryptBackup(testData, testKey);
      const wrongKey = generateBackupKey();
      const valid = validateBackupIntegrity(encrypted, wrongKey);

      expect(valid).toBe(false);
    });

    it('should detect integrity failure with corrupted data', () => {
      const encrypted = encryptBackup(testData, testKey);
      encrypted.ciphertext[0] ^= 0xFF;

      const valid = validateBackupIntegrity(encrypted, testKey);

      expect(valid).toBe(false);
    });
  });

  describe('Serialization', () => {
    it('should serialize and deserialize encrypted backup', () => {
      const encrypted = encryptBackup(testData, testKey);
      const json = serializeEncryptedBackup(encrypted);

      expect(typeof json).toBe('string');
      expect(json.length).toBeGreaterThan(0);

      const parsed = parseEncryptedBackup(json);

      expect(parsed.ciphertext).toEqual(encrypted.ciphertext);
      expect(parsed.iv).toEqual(encrypted.iv);
      expect(parsed.authTag).toEqual(encrypted.authTag);
      expect(parsed.hmac).toEqual(encrypted.hmac);
      expect(parsed.salt).toEqual(encrypted.salt);
      expect(parsed.metadata).toEqual(encrypted.metadata);
    });

    it('should fail to parse invalid JSON', () => {
      expect(() => parseEncryptedBackup('invalid json')).toThrow();
    });
  });

  describe('File Operations', () => {
    it('should encrypt and decrypt files', async () => {
      const inputFile = path.join(tempDir, 'test.db');
      const encryptedFile = path.join(tempDir, 'test.db.enc');
      const decryptedFile = path.join(tempDir, 'test.db.dec');

      // Write test data
      await fs.writeFile(inputFile, testData);

      // Encrypt file
      await encryptBackupFile(inputFile, encryptedFile, testKey);
      expect(await fs.access(encryptedFile).then(() => true).catch(() => false)).toBe(true);

      // Decrypt file
      await decryptBackupFile(encryptedFile, decryptedFile, testKey);

      // Verify decrypted content
      const decryptedData = await fs.readFile(decryptedFile);
      expect(decryptedData).toEqual(testData);
    });

    it('should fail to decrypt file with wrong key', async () => {
      const inputFile = path.join(tempDir, 'test.db');
      const encryptedFile = path.join(tempDir, 'test.db.enc');
      const decryptedFile = path.join(tempDir, 'test.db.dec');

      await fs.writeFile(inputFile, testData);
      await encryptBackupFile(inputFile, encryptedFile, testKey);

      const wrongKey = generateBackupKey();

      await expect(
        decryptBackupFile(encryptedFile, decryptedFile, wrongKey)
      ).rejects.toThrow(IntegrityError);
    });
  });

  describe('Key Rotation', () => {
    it('should rotate encryption key', () => {
      const oldKey = testKey;
      const newKey = generateBackupKey();

      const encrypted = encryptBackup(testData, oldKey);
      const rotated = rotateBackupKey(encrypted, oldKey, newKey);

      // Should be able to decrypt with new key
      const decrypted = decryptBackup(rotated, newKey);
      expect(decrypted).toEqual(testData);

      // Should NOT be able to decrypt with old key
      expect(() => decryptBackup(rotated, oldKey)).toThrow();
    });

    it('should fail rotation with wrong old key', () => {
      const wrongOldKey = generateBackupKey();
      const newKey = generateBackupKey();

      const encrypted = encryptBackup(testData, testKey);

      expect(() => rotateBackupKey(encrypted, wrongOldKey, newKey)).toThrow(IntegrityError);
    });
  });

  describe('Security Properties', () => {
    it('should use unique IV for each encryption', () => {
      const ivs = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const encrypted = encryptBackup(testData, testKey);
        ivs.add(encrypted.iv.toString('hex'));
      }

      expect(ivs.size).toBe(100); // All IVs should be unique
    });

    it('should use unique salt for each encryption', () => {
      const salts = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const encrypted = encryptBackup(testData, testKey);
        salts.add(encrypted.salt.toString('hex'));
      }

      expect(salts.size).toBe(100); // All salts should be unique
    });

    it('should not leak plaintext in metadata', () => {
      const sensitiveData = Buffer.from('SECRET_PASSWORD_123');
      const encrypted = encryptBackup(sensitiveData, testKey);

      const json = serializeEncryptedBackup(encrypted);

      expect(json).not.toContain('SECRET_PASSWORD_123');
      expect(json).not.toContain(sensitiveData.toString('base64'));
    });
  });
});
