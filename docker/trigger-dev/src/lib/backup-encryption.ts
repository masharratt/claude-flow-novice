/**
 * RuVector Security: AES-256-GCM Backup Encryption
 *
 * P0.2 Critical Security Fix: Encrypt backup files at rest
 *
 * Features:
 * - AES-256-GCM encryption with authentication
 * - Secure key derivation (PBKDF2, 100k iterations)
 * - IV (Initialization Vector) per backup
 * - HMAC authentication for integrity
 * - Environment-based key management
 * - Key rotation support
 *
 * Security Properties:
 * - Confidentiality: AES-256-GCM
 * - Integrity: GCM authentication tag + HMAC
 * - Authenticity: HMAC verification
 * - Forward secrecy: Unique IV per encryption
 *
 * @module backup-encryption
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { writeFileSync as syncWrite } from 'fs';

/**
 * Security: Secure file write helper
 * Ensures backup files are created with restrictive permissions (0600)
 *
 * @param filePath - Path to file
 * @param data - File contents (string or Buffer)
 * @param sensitive - If true, uses 0o600 (owner only); otherwise 0o644
 * @throws Error if write fails
 */
function secureFileWrite(filePath: string, data: string | Buffer, sensitive = true): void {
  const mode = sensitive ? 0o600 : 0o644;
  syncWrite(filePath, data, { mode });
}

/**
 * Encrypted backup structure
 */
export interface EncryptedBackup {
  /** Encrypted data */
  ciphertext: Buffer;

  /** Initialization vector (12 bytes for GCM) */
  iv: Buffer;

  /** GCM authentication tag (16 bytes) */
  authTag: Buffer;

  /** HMAC for additional integrity verification */
  hmac: Buffer;

  /** Salt used for key derivation */
  salt: Buffer;

  /** Metadata (unencrypted) */
  metadata: {
    version: string;
    algorithm: string;
    timestamp: string;
    originalSize: number;
    encryptedSize: number;
  };
}

/**
 * Encryption configuration
 */
export interface EncryptionConfig {
  /** Algorithm (always aes-256-gcm) */
  algorithm: 'aes-256-gcm';

  /** Key derivation iterations (PBKDF2) */
  iterations: number;

  /** Key length in bytes (32 for AES-256) */
  keyLength: number;

  /** IV length in bytes (12 for GCM) */
  ivLength: number;

  /** Auth tag length in bytes (16 for GCM) */
  authTagLength: number;

  /** Salt length in bytes */
  saltLength: number;
}

/**
 * Default encryption configuration (OWASP compliant)
 */
const DEFAULT_CONFIG: EncryptionConfig = {
  algorithm: 'aes-256-gcm',
  iterations: 100000, // PBKDF2 iterations (OWASP recommendation: >=100k)
  keyLength: 32,      // 256 bits
  ivLength: 12,       // 96 bits (GCM standard)
  authTagLength: 16,  // 128 bits
  saltLength: 32,     // 256 bits
};

/**
 * Current encryption version
 */
const ENCRYPTION_VERSION = 'v1.0.0';

/**
 * Error classes
 */
export class EncryptionError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'EncryptionError';
  }
}

export class DecryptionError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'DecryptionError';
  }
}

export class IntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrityError';
  }
}

/**
 * Generate a cryptographically secure backup encryption key
 *
 * @returns Base64-encoded 256-bit key
 */
export function generateBackupKey(): string {
  const key = crypto.randomBytes(DEFAULT_CONFIG.keyLength);
  return key.toString('base64');
}

/**
 * Derive encryption key from passphrase using PBKDF2
 *
 * @param passphrase - Master passphrase or key
 * @param salt - Salt for key derivation
 * @param config - Encryption configuration
 * @returns Derived key (32 bytes)
 */
function deriveKey(
  passphrase: string,
  salt: Buffer,
  config: EncryptionConfig = DEFAULT_CONFIG
): Buffer {
  return crypto.pbkdf2Sync(
    passphrase,
    salt,
    config.iterations,
    config.keyLength,
    'sha256'
  );
}

/**
 * Calculate HMAC for integrity verification
 *
 * @param key - HMAC key
 * @param data - Data to authenticate
 * @returns HMAC digest
 */
function calculateHMAC(key: Buffer, data: Buffer): Buffer {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(data);
  return hmac.digest();
}

/**
 * Verify HMAC integrity
 *
 * @param key - HMAC key
 * @param data - Data to verify
 * @param expectedHmac - Expected HMAC value
 * @throws {IntegrityError} If HMAC verification fails
 */
function verifyHMAC(key: Buffer, data: Buffer, expectedHmac: Buffer): void {
  const actualHmac = calculateHMAC(key, data);

  // Constant-time comparison to prevent timing attacks
  if (!crypto.timingSafeEqual(actualHmac, expectedHmac)) {
    throw new IntegrityError('HMAC verification failed - data may be corrupted or tampered');
  }
}

/**
 * Encrypt backup data using AES-256-GCM
 *
 * @param data - Plaintext data to encrypt
 * @param passphrase - Encryption passphrase (from env var or Vault)
 * @param config - Encryption configuration (optional)
 * @returns Encrypted backup structure
 * @throws {EncryptionError} If encryption fails
 *
 * @example
 * ```typescript
 * const data = await fs.readFile('backup.db');
 * const key = process.env.RUVECTOR_BACKUP_KEY || generateBackupKey();
 * const encrypted = encryptBackup(data, key);
 * await fs.writeFile('backup.db.enc', JSON.stringify(encrypted));
 * ```
 */
export function encryptBackup(
  data: Buffer,
  passphrase: string,
  config: EncryptionConfig = DEFAULT_CONFIG
): EncryptedBackup {
  try {
    // Generate random salt for key derivation
    const salt = crypto.randomBytes(config.saltLength);

    // Derive encryption key from passphrase
    const encryptionKey = deriveKey(passphrase, salt, config);

    // Generate random IV (Initialization Vector)
    const iv = crypto.randomBytes(config.ivLength);

    // Create cipher
    const cipher = crypto.createCipheriv(config.algorithm, encryptionKey, iv, {
      authTagLength: config.authTagLength,
    });

    // Encrypt data
    const ciphertext = Buffer.concat([
      cipher.update(data),
      cipher.final(),
    ]);

    // Get GCM authentication tag
    const authTag = cipher.getAuthTag();

    // Calculate HMAC for additional integrity verification
    const hmacKey = crypto.createHash('sha256').update(encryptionKey).digest();
    const hmac = calculateHMAC(hmacKey, Buffer.concat([iv, ciphertext, authTag]));

    // Build encrypted backup structure
    const encrypted: EncryptedBackup = {
      ciphertext,
      iv,
      authTag,
      hmac,
      salt,
      metadata: {
        version: ENCRYPTION_VERSION,
        algorithm: config.algorithm,
        timestamp: new Date().toISOString(),
        originalSize: data.length,
        encryptedSize: ciphertext.length,
      },
    };

    return encrypted;
  } catch (error) {
    throw new EncryptionError(
      'Failed to encrypt backup',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Decrypt backup data using AES-256-GCM
 *
 * @param encrypted - Encrypted backup structure
 * @param passphrase - Decryption passphrase
 * @param config - Encryption configuration (optional)
 * @returns Decrypted plaintext data
 * @throws {DecryptionError} If decryption fails
 * @throws {IntegrityError} If integrity verification fails
 *
 * @example
 * ```typescript
 * const encryptedJson = await fs.readFile('backup.db.enc', 'utf-8');
 * const encrypted = parseEncryptedBackup(encryptedJson);
 * const key = process.env.RUVECTOR_BACKUP_KEY;
 * const data = decryptBackup(encrypted, key);
 * await fs.writeFile('backup.db', data);
 * ```
 */
export function decryptBackup(
  encrypted: EncryptedBackup,
  passphrase: string,
  config: EncryptionConfig = DEFAULT_CONFIG
): Buffer {
  try {
    // Derive decryption key from passphrase and stored salt
    const decryptionKey = deriveKey(passphrase, encrypted.salt, config);

    // Verify HMAC integrity first
    const hmacKey = crypto.createHash('sha256').update(decryptionKey).digest();
    const dataToVerify = Buffer.concat([
      encrypted.iv,
      encrypted.ciphertext,
      encrypted.authTag,
    ]);
    verifyHMAC(hmacKey, dataToVerify, encrypted.hmac);

    // Create decipher
    const decipher = crypto.createDecipheriv(
      config.algorithm,
      decryptionKey,
      encrypted.iv,
      {
        authTagLength: config.authTagLength,
      }
    );

    // Set GCM authentication tag
    decipher.setAuthTag(encrypted.authTag);

    // Decrypt data
    const plaintext = Buffer.concat([
      decipher.update(encrypted.ciphertext),
      decipher.final(),
    ]);

    return plaintext;
  } catch (error) {
    if (error instanceof IntegrityError) {
      throw error;
    }

    throw new DecryptionError(
      'Failed to decrypt backup - wrong key or corrupted data',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Validate backup integrity without decrypting
 *
 * @param encrypted - Encrypted backup structure
 * @param passphrase - Encryption passphrase
 * @returns True if backup integrity is valid
 */
export function validateBackupIntegrity(
  encrypted: EncryptedBackup,
  passphrase: string
): boolean {
  try {
    const decryptionKey = deriveKey(passphrase, encrypted.salt);
    const hmacKey = crypto.createHash('sha256').update(decryptionKey).digest();
    const dataToVerify = Buffer.concat([
      encrypted.iv,
      encrypted.ciphertext,
      encrypted.authTag,
    ]);

    verifyHMAC(hmacKey, dataToVerify, encrypted.hmac);
    return true;
  } catch {
    return false;
  }
}

/**
 * Serialize encrypted backup to JSON string
 *
 * @param encrypted - Encrypted backup structure
 * @returns JSON string (base64-encoded buffers)
 */
export function serializeEncryptedBackup(encrypted: EncryptedBackup): string {
  return JSON.stringify({
    ciphertext: encrypted.ciphertext.toString('base64'),
    iv: encrypted.iv.toString('base64'),
    authTag: encrypted.authTag.toString('base64'),
    hmac: encrypted.hmac.toString('base64'),
    salt: encrypted.salt.toString('base64'),
    metadata: encrypted.metadata,
  });
}

/**
 * Parse encrypted backup from JSON string
 *
 * @param json - JSON string representation
 * @returns Encrypted backup structure
 */
export function parseEncryptedBackup(json: string): EncryptedBackup {
  const parsed = JSON.parse(json);

  return {
    ciphertext: Buffer.from(parsed.ciphertext, 'base64'),
    iv: Buffer.from(parsed.iv, 'base64'),
    authTag: Buffer.from(parsed.authTag, 'base64'),
    hmac: Buffer.from(parsed.hmac, 'base64'),
    salt: Buffer.from(parsed.salt, 'base64'),
    metadata: parsed.metadata,
  };
}

/**
 * Encrypt backup file
 *
 * @param inputPath - Path to plaintext backup file
 * @param outputPath - Path to encrypted backup file
 * @param passphrase - Encryption passphrase
 */
export async function encryptBackupFile(
  inputPath: string,
  outputPath: string,
  passphrase: string
): Promise<void> {
  const data = await fs.readFile(inputPath);
  const encrypted = encryptBackup(data, passphrase);
  const json = serializeEncryptedBackup(encrypted);
  // Write encrypted backup file with secure permissions (0o600)
  secureFileWrite(outputPath, json, true);
}

/**
 * Decrypt backup file
 *
 * @param inputPath - Path to encrypted backup file
 * @param outputPath - Path to decrypted backup file
 * @param passphrase - Decryption passphrase
 */
export async function decryptBackupFile(
  inputPath: string,
  outputPath: string,
  passphrase: string
): Promise<void> {
  const json = await fs.readFile(inputPath, 'utf-8');
  const encrypted = parseEncryptedBackup(json);
  const data = decryptBackup(encrypted, passphrase);
  // Write decrypted database file with secure permissions (0o600)
  secureFileWrite(outputPath, data, true);
}

/**
 * Get encryption key from environment or generate new one
 *
 * @returns Encryption key (base64-encoded)
 * @throws {Error} If no key is configured in production
 */
export function getOrCreateBackupKey(): string {
  const envKey = process.env.RUVECTOR_BACKUP_KEY;

  if (envKey) {
    return envKey;
  }

  // In production, require explicit key configuration
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'RUVECTOR_BACKUP_KEY environment variable must be set in production'
    );
  }

  // In development, generate and warn
  console.warn(
    '[SECURITY WARNING] No RUVECTOR_BACKUP_KEY configured - generating temporary key'
  );
  return generateBackupKey();
}

/**
 * Key rotation: Re-encrypt backup with new key
 *
 * @param encrypted - Existing encrypted backup
 * @param oldPassphrase - Current encryption key
 * @param newPassphrase - New encryption key
 * @returns Re-encrypted backup with new key
 */
export function rotateBackupKey(
  encrypted: EncryptedBackup,
  oldPassphrase: string,
  newPassphrase: string
): EncryptedBackup {
  // Decrypt with old key
  const plaintext = decryptBackup(encrypted, oldPassphrase);

  // Re-encrypt with new key
  return encryptBackup(plaintext, newPassphrase);
}
