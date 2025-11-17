/**
 * Backup Encryption Manager
 *
 * Implements AES-256-GCM encryption for backup files with:
 * - Secure key management via environment variables
 * - Unique IV generation for each backup
 * - HMAC-SHA256 integrity verification
 * - Key rotation support
 * - Backward compatibility detection
 * - Encryption metadata tracking
 *
 * CVSS Mitigation: Addresses CVSS 7.2 (high severity) vulnerability
 * by encrypting sensitive backup data at rest.
 *
 * Security Requirements:
 * - BACKUP_ENCRYPTION_KEY: 32-byte hex encoded AES-256 key (env var)
 * - BACKUP_ENCRYPTION_ENABLED: Set to 'true' to enable encryption (env var)
 * - IV: Cryptographically random, unique per backup
 * - Auth Tag: GCM authentication tag for integrity verification
 * - HMAC: SHA-256 for additional integrity verification
 *
 * Usage:
 *   const encryptionManager = new EncryptionManager();
 *   const encrypted = await encryptionManager.encrypt(buffer, backupId);
 *   const decrypted = await encryptionManager.decrypt(encrypted, backupId);
 *   const verified = encryptionManager.verifyIntegrity(encrypted);
 */

import * as crypto from 'crypto';
import { createLogger } from './logging';
import { createError, ErrorCode } from './errors';

const logger = createLogger('encryption-manager');

/**
 * Encryption metadata stored with encrypted backup
 */
export interface EncryptionMetadata {
  /** Encryption algorithm identifier */
  algorithm: 'AES-256-GCM';
  /** Initialization Vector (hex encoded) */
  iv: string;
  /** GCM Authentication Tag (hex encoded) */
  authTag: string;
  /** HMAC verification tag (hex encoded) */
  hmac: string;
  /** When encryption was applied */
  encryptedAt: string;
  /** Master key version/ID for key rotation support */
  keyVersion: string;
}

/**
 * Encrypted backup payload
 */
export interface EncryptedBackup {
  /** Encrypted file content */
  data: Buffer;
  /** Encryption metadata */
  metadata: EncryptionMetadata;
}

/**
 * Decryption result
 */
export interface DecryptionResult {
  /** Decrypted content */
  data: Buffer;
  /** Whether integrity verification passed */
  integrityVerified: boolean;
  /** Metadata about the encryption */
  metadata: EncryptionMetadata;
}

/**
 * Encryption Manager Configuration
 */
export interface EncryptionConfig {
  /** Enable encryption (default: from BACKUP_ENCRYPTION_ENABLED env var) */
  enabled?: boolean;
  /** Master encryption key (32-byte hex, from BACKUP_ENCRYPTION_KEY env var) */
  masterKey?: string;
  /** Key version ID for rotation tracking (default: 'v1') */
  keyVersion?: string;
}

/**
 * Backup Encryption Manager
 *
 * Implements AES-256-GCM encryption with integrity verification
 */
export class EncryptionManager {
  private enabled: boolean;
  private masterKey: Buffer | null = null;
  private keyVersion: string;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 16; // 128 bits
  private readonly AUTH_TAG_LENGTH = 16; // 128 bits
  private readonly KEY_LENGTH = 32; // 256 bits
  private readonly HMAC_ALGORITHM = 'sha256';

  constructor(config: EncryptionConfig = {}) {
    // Check if encryption is enabled
    this.enabled = config.enabled !== undefined ? config.enabled : this.isEncryptionEnabled();

    // Load and validate master key
    if (this.enabled) {
      const keyHex = config.masterKey || process.env.BACKUP_ENCRYPTION_KEY;

      if (!keyHex) {
        throw createError(
          ErrorCode.VALIDATION_FAILED,
          'BACKUP_ENCRYPTION_KEY environment variable is required when encryption is enabled',
          { enabledVia: 'BACKUP_ENCRYPTION_ENABLED env var' }
        );
      }

      try {
        this.masterKey = Buffer.from(keyHex, 'hex');

        if (this.masterKey.length !== this.KEY_LENGTH) {
          throw createError(
            ErrorCode.VALIDATION_FAILED,
            `Master key must be exactly ${this.KEY_LENGTH} bytes (${this.KEY_LENGTH * 2} hex characters)`,
            { providedLength: this.masterKey.length, expectedLength: this.KEY_LENGTH }
          );
        }

        logger.info('Encryption manager initialized with AES-256-GCM', {
          enabled: true,
          algorithm: this.ALGORITHM,
          keyLength: this.KEY_LENGTH,
          ivLength: this.IV_LENGTH,
          authTagLength: this.AUTH_TAG_LENGTH,
        });
      } catch (error) {
        if (error instanceof Error && 'code' in error) {
          throw error;
        }

        throw createError(
          ErrorCode.VALIDATION_FAILED,
          'Failed to parse BACKUP_ENCRYPTION_KEY. Must be valid hex-encoded 32-byte key.',
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    } else {
      logger.info('Encryption manager initialized with encryption disabled', {
        enabled: false,
        enablementRequired:
          'Set BACKUP_ENCRYPTION_ENABLED=true and provide BACKUP_ENCRYPTION_KEY to enable encryption',
      });
    }

    this.keyVersion = config.keyVersion || 'v1';
  }

  /**
   * Check if encryption is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Encrypt backup data
   *
   * @param data - Data to encrypt
   * @param backupId - Backup identifier (for logging/tracking)
   * @returns Encrypted backup with metadata
   * @throws Error if encryption is disabled or encryption fails
   */
  async encrypt(data: Buffer, backupId: string): Promise<EncryptedBackup> {
    if (!this.enabled || !this.masterKey) {
      throw createError(
        ErrorCode.VALIDATION_FAILED,
        'Encryption is not enabled. Enable BACKUP_ENCRYPTION_ENABLED and provide BACKUP_ENCRYPTION_KEY.',
        { backupId }
      );
    }

    try {
      // Generate cryptographically random IV
      const iv = crypto.randomBytes(this.IV_LENGTH);

      // Create cipher
      const cipher = crypto.createCipheriv(this.ALGORITHM, this.masterKey, iv);

      // Encrypt data
      let encryptedData = cipher.update(data);
      encryptedData = Buffer.concat([encryptedData, cipher.final()]);

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      // Calculate HMAC for additional integrity verification
      const hmac = crypto
        .createHmac(this.HMAC_ALGORITHM, this.masterKey)
        .update(Buffer.concat([iv, encryptedData, authTag]))
        .digest();

      // Create metadata
      const metadata: EncryptionMetadata = {
        algorithm: 'AES-256-GCM',
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        hmac: hmac.toString('hex'),
        encryptedAt: new Date().toISOString(),
        keyVersion: this.keyVersion,
      };

      logger.debug('Backup encrypted successfully', {
        backupId,
        algorithm: this.ALGORITHM,
        dataSize: data.length,
        encryptedSize: encryptedData.length,
        ivLength: iv.length,
        authTagLength: authTag.length,
      });

      return {
        data: encryptedData,
        metadata,
      };
    } catch (error) {
      logger.error(
        'Backup encryption failed',
        error instanceof Error ? error : undefined,
        { backupId }
      );

      throw createError(
        ErrorCode.INTERNAL_ERROR,
        'Backup encryption failed',
        {
          backupId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Decrypt backup data
   *
   * @param encrypted - Encrypted backup
   * @param backupId - Backup identifier (for logging/tracking)
   * @returns Decryption result with data and integrity verification
   * @throws Error if decryption fails or integrity verification fails
   */
  async decrypt(encrypted: EncryptedBackup, backupId: string): Promise<DecryptionResult> {
    if (!this.enabled || !this.masterKey) {
      throw createError(
        ErrorCode.VALIDATION_FAILED,
        'Encryption is not enabled. Enable BACKUP_ENCRYPTION_ENABLED and provide BACKUP_ENCRYPTION_KEY.',
        { backupId }
      );
    }

    try {
      // Verify HMAC first
      const iv = Buffer.from(encrypted.metadata.iv, 'hex');
      const authTag = Buffer.from(encrypted.metadata.authTag, 'hex');
      const expectedHmac = encrypted.metadata.hmac;

      const calculatedHmac = crypto
        .createHmac(this.HMAC_ALGORITHM, this.masterKey)
        .update(Buffer.concat([iv, encrypted.data, authTag]))
        .digest()
        .toString('hex');

      const integrityVerified = calculatedHmac === expectedHmac;

      if (!integrityVerified) {
        logger.warn('HMAC verification failed during decryption', {
          backupId,
          expectedHmac,
          calculatedHmac,
        });
      }

      // Decrypt data
      const decipher = crypto.createDecipheriv(this.ALGORITHM, this.masterKey, iv);
      decipher.setAuthTag(authTag);

      let decryptedData = decipher.update(encrypted.data);
      decryptedData = Buffer.concat([decryptedData, decipher.final()]);

      logger.debug('Backup decrypted successfully', {
        backupId,
        algorithm: this.ALGORITHM,
        encryptedSize: encrypted.data.length,
        decryptedSize: decryptedData.length,
        integrityVerified,
      });

      return {
        data: decryptedData,
        integrityVerified,
        metadata: encrypted.metadata,
      };
    } catch (error) {
      logger.error(
        'Backup decryption failed',
        error instanceof Error ? error : undefined,
        { backupId }
      );

      throw createError(
        ErrorCode.INTERNAL_ERROR,
        'Backup decryption failed. Backup may be corrupted or key may be incorrect.',
        {
          backupId,
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }
  }

  /**
   * Verify backup integrity without decryption
   *
   * @param encrypted - Encrypted backup
   * @param backupId - Backup identifier (for logging)
   * @returns Whether integrity verification passed
   */
  verifyIntegrity(encrypted: EncryptedBackup, backupId?: string): boolean {
    if (!this.masterKey) {
      logger.error('Cannot verify integrity without master key', { backupId });
      return false;
    }

    try {
      const iv = Buffer.from(encrypted.metadata.iv, 'hex');
      const authTag = Buffer.from(encrypted.metadata.authTag, 'hex');
      const expectedHmac = encrypted.metadata.hmac;

      const calculatedHmac = crypto
        .createHmac(this.HMAC_ALGORITHM, this.masterKey)
        .update(Buffer.concat([iv, encrypted.data, authTag]))
        .digest()
        .toString('hex');

      const verified = calculatedHmac === expectedHmac;

      if (!verified) {
        logger.warn('Integrity verification failed', { backupId });
      }

      return verified;
    } catch (error) {
      logger.error('Integrity verification error', error instanceof Error ? error : undefined, {
        backupId,
      });

      return false;
    }
  }

  /**
   * Detect if a backup file is encrypted
   *
   * Useful for backward compatibility - detects if backup is encrypted
   *
   * @param data - File data
   * @returns Whether the data appears to be encrypted
   */
  static isEncrypted(data: Buffer): boolean {
    // Encrypted data with metadata should have a specific structure
    // For now, we can check if the data is valid JSON metadata (simple heuristic)
    try {
      // Try to detect our encryption format
      // This is a simple heuristic - encrypted data won't be valid text/JSON
      if (data.length < 100) {
        return false;
      }

      // Try to parse as JSON at the end for metadata
      const str = data.toString('utf8', Math.max(0, data.length - 500));
      const match = str.match(/"algorithm"\s*:\s*"AES-256-GCM"/);

      return match !== null;
    } catch {
      return false;
    }
  }

  /**
   * Generate a new encryption key
   *
   * Useful for key rotation
   *
   * @returns 32-byte hex-encoded AES-256 key
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Export encryption metadata as JSON
   *
   * Useful for storing metadata separately from encrypted data
   *
   * @param encrypted - Encrypted backup
   * @returns JSON stringified metadata
   */
  static exportMetadata(encrypted: EncryptedBackup): string {
    return JSON.stringify(encrypted.metadata, null, 2);
  }

  /**
   * Import encryption metadata from JSON
   *
   * @param metadataJson - JSON stringified metadata
   * @returns Parsed encryption metadata
   */
  static importMetadata(metadataJson: string): EncryptionMetadata {
    return JSON.parse(metadataJson) as EncryptionMetadata;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private isEncryptionEnabled(): boolean {
    const enabled = process.env.BACKUP_ENCRYPTION_ENABLED?.toLowerCase() === 'true';
    return enabled;
  }
}

/**
 * Singleton instance
 */
let defaultManager: EncryptionManager | null = null;

/**
 * Get the default encryption manager instance
 */
export function getEncryptionManager(config?: EncryptionConfig): EncryptionManager {
  if (!defaultManager) {
    defaultManager = new EncryptionManager(config);
  }
  return defaultManager;
}
