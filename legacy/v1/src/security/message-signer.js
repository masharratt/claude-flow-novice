/**
 * Message Signer - HMAC-SHA256 Message Authentication
 *
 * Security: Prevents message spoofing and coordinator impersonation (VULN-003, CVSS 6.5)
 *
 * Features:
 * - HMAC-SHA256 cryptographic signatures
 * - Canonical message serialization (deterministic)
 * - Signature verification with constant-time comparison
 * - Timestamp validation (prevents replay attacks)
 * - Key rotation support
 * - Performance monitoring (<5ms overhead target)
 *
 * Usage:
 *   const { MessageSigner } = require('./src/security/message-signer');
 *   const signer = new MessageSigner(process.env.COORDINATOR_SECRET);
 *
 *   // Sign outgoing message
 *   const signedMessage = signer.signMessage(message);
 *   await redis.publish(channel, JSON.stringify(signedMessage));
 *
 *   // Verify incoming message
 *   try {
 *     const verifiedMessage = signer.verifyMessage(receivedMessage);
 *     // Process verified message
 *   } catch (error) {
 *     console.error('Signature verification failed:', error.message);
 *     // Reject message
 *   }
 */

import crypto from 'crypto';

// Configuration constants
const DEFAULT_ALGORITHM = 'sha256';
const DEFAULT_ENCODING = 'hex';
const MAX_TIMESTAMP_DRIFT_MS = 300000; // 5 minutes (prevent replay attacks)
const MIN_SECRET_LENGTH = 32; // Minimum 32 characters for security
const PERFORMANCE_WARNING_THRESHOLD_MS = 5; // Log warning if signing takes >5ms

/**
 * Message Signer - HMAC-based message authentication
 */
class MessageSigner {
  /**
   * Create a new MessageSigner instance
   *
   * @param {string} secret - Shared secret for HMAC signing (minimum 32 chars)
   * @param {object} options - Optional configuration
   * @param {string} options.algorithm - HMAC algorithm (default: 'sha256')
   * @param {string} options.encoding - Signature encoding (default: 'hex')
   * @param {number} options.maxTimestampDrift - Max allowed timestamp drift in ms
   * @param {boolean} options.enableReplayProtection - Enable timestamp validation
   * @throws {Error} If secret is missing or too short
   */
  constructor(secret, options = {}) {
    // Validate secret
    if (!secret) {
      throw new Error(
        'COORDINATOR_SECRET not configured. Set environment variable COORDINATOR_SECRET.'
      );
    }

    if (typeof secret !== 'string') {
      throw new Error('COORDINATOR_SECRET must be a string');
    }

    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `COORDINATOR_SECRET too short (${secret.length} chars). ` +
        `Minimum ${MIN_SECRET_LENGTH} characters required for security.`
      );
    }

    this.secret = secret;
    this.algorithm = options.algorithm || DEFAULT_ALGORITHM;
    this.encoding = options.encoding || DEFAULT_ENCODING;
    this.maxTimestampDrift = options.maxTimestampDrift || MAX_TIMESTAMP_DRIFT_MS;
    this.enableReplayProtection = options.enableReplayProtection !== false;

    // Performance statistics
    this.stats = {
      signOperations: 0,
      verifyOperations: 0,
      verifyFailures: 0,
      replayAttemptsBlocked: 0,
      totalSignTimeMs: 0,
      totalVerifyTimeMs: 0,
      slowOperations: 0 // Operations exceeding performance threshold
    };

    // Key rotation support
    this.keyVersion = options.keyVersion || 1;
    this.previousSecrets = options.previousSecrets || []; // For seamless rotation
  }

  /**
   * Create canonical message payload for signing
   *
   * Creates a deterministic string representation of the message by:
   * 1. Removing signature field (if present)
   * 2. Sorting keys alphabetically (recursively for nested objects)
   * 3. JSON stringifying with sorted keys
   *
   * This ensures the same message always produces the same signature,
   * regardless of property order in the original object.
   *
   * @param {object} message - Message to canonicalize
   * @returns {string} Canonical message string
   * @private
   */
  _createCanonicalPayload(message) {
    // Remove signature field (if present) and keyVersion
    const { signature, keyVersion, ...payload } = message;

    // Recursively sort all object keys for deterministic serialization
    const sortObjectKeys = (obj) => {
      if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        return obj;
      }

      const sorted = {};
      const keys = Object.keys(obj).sort();

      for (const key of keys) {
        sorted[key] = sortObjectKeys(obj[key]);
      }

      return sorted;
    };

    const sortedPayload = sortObjectKeys(payload);

    // Create canonical JSON
    const canonical = JSON.stringify(sortedPayload);

    return canonical;
  }

  /**
   * Generate HMAC-SHA256 signature for message
   *
   * @param {string} canonicalPayload - Canonical message string
   * @returns {string} Hex-encoded HMAC signature
   * @private
   */
  _generateSignature(canonicalPayload) {
    const hmac = crypto.createHmac(this.algorithm, this.secret);
    hmac.update(canonicalPayload);
    return hmac.digest(this.encoding);
  }

  /**
   * Constant-time string comparison (prevents timing attacks)
   *
   * @param {string} a - First string
   * @param {string} b - Second string
   * @returns {boolean} True if strings are equal
   * @private
   */
  _constantTimeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }

    if (a.length !== b.length) {
      return false;
    }

    // Use crypto.timingSafeEqual for constant-time comparison
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    try {
      return crypto.timingSafeEqual(bufA, bufB);
    } catch (error) {
      // Buffers have different lengths (should not happen due to check above)
      return false;
    }
  }

  /**
   * Validate message timestamp (replay attack prevention)
   *
   * @param {number} timestamp - Message timestamp (Unix ms)
   * @returns {boolean} True if timestamp is valid
   * @throws {Error} If timestamp validation fails
   * @private
   */
  _validateTimestamp(timestamp) {
    if (!this.enableReplayProtection) {
      return true; // Replay protection disabled
    }

    const now = Date.now();
    const drift = Math.abs(now - timestamp);

    if (drift > this.maxTimestampDrift) {
      throw new Error(
        `Message timestamp drift (${drift}ms) exceeds maximum (${this.maxTimestampDrift}ms). ` +
        `Possible replay attack detected.`
      );
    }

    return true;
  }

  /**
   * Sign outgoing message with HMAC-SHA256
   *
   * Adds signature and key version to message:
   * - signature: HMAC-SHA256 hex string
   * - keyVersion: Key version for rotation support
   *
   * @param {object} message - Message to sign
   * @returns {object} Signed message with signature field
   * @throws {Error} If message is invalid
   */
  signMessage(message) {
    const startTime = Date.now();

    try {
      // Validate input
      if (!message || typeof message !== 'object') {
        throw new Error('Message must be a non-null object');
      }

      // Ensure message has timestamp (for replay protection)
      if (!message.timestamp) {
        message.timestamp = Date.now();
      }

      // Create canonical payload (exclude signature field)
      const canonical = this._createCanonicalPayload(message);

      // Generate HMAC signature
      const signature = this._generateSignature(canonical);

      // Update statistics
      const elapsed = Date.now() - startTime;
      this.stats.signOperations++;
      this.stats.totalSignTimeMs += elapsed;

      // Log performance warning if signing is slow
      if (elapsed > PERFORMANCE_WARNING_THRESHOLD_MS) {
        this.stats.slowOperations++;
        console.warn(
          `[MessageSigner] Slow signature operation: ${elapsed}ms (threshold: ${PERFORMANCE_WARNING_THRESHOLD_MS}ms)`
        );
      }

      // Return message with signature and key version
      return {
        ...message,
        signature,
        keyVersion: this.keyVersion
      };
    } catch (error) {
      throw new Error(`Message signing failed: ${error.message}`);
    }
  }

  /**
   * Verify incoming message signature
   *
   * Validates:
   * 1. Message has signature field
   * 2. Signature matches expected HMAC
   * 3. Timestamp is within acceptable drift (replay protection)
   * 4. Key version is supported (for rotation)
   *
   * @param {object} message - Message to verify
   * @returns {object} Verified message (signature field removed)
   * @throws {Error} If signature verification fails
   */
  verifyMessage(message) {
    const startTime = Date.now();

    try {
      // Increment verify operations counter (for accurate failure rate)
      this.stats.verifyOperations++;

      // Validate input
      if (!message || typeof message !== 'object') {
        this.stats.verifyFailures++;
        throw new Error('Message must be a non-null object');
      }

      // Check for signature
      if (!message.signature) {
        this.stats.verifyFailures++;
        throw new Error('Message missing signature field');
      }

      // Check key version (for rotation support)
      const messageKeyVersion = message.keyVersion || 1;
      const isCurrentKey = messageKeyVersion === this.keyVersion;
      const isPreviousKey = this.previousSecrets.length > 0 &&
                           messageKeyVersion === this.keyVersion - 1;

      if (!isCurrentKey && !isPreviousKey) {
        this.stats.verifyFailures++;
        throw new Error(
          `Unsupported key version: ${messageKeyVersion}. ` +
          `Current version: ${this.keyVersion}`
        );
      }

      // Select appropriate secret for verification
      const verificationSecret = isCurrentKey
        ? this.secret
        : this.previousSecrets[0];

      // Extract signature from message
      const receivedSig = message.signature;

      // Create canonical payload (exclude signature)
      const canonical = this._createCanonicalPayload(message);

      // Generate expected signature
      const hmac = crypto.createHmac(this.algorithm, verificationSecret);
      hmac.update(canonical);
      const expectedSig = hmac.digest(this.encoding);

      // Constant-time comparison (prevent timing attacks)
      const isValid = this._constantTimeCompare(receivedSig, expectedSig);

      if (!isValid) {
        this.stats.verifyFailures++;
        throw new Error('Invalid message signature');
      }

      // Validate timestamp (replay attack prevention)
      if (message.timestamp) {
        try {
          this._validateTimestamp(message.timestamp);
        } catch (error) {
          this.stats.replayAttemptsBlocked++;
          throw error;
        }
      }

      // Update statistics
      const elapsed = Date.now() - startTime;
      this.stats.totalVerifyTimeMs += elapsed;

      // Log performance warning if verification is slow
      if (elapsed > PERFORMANCE_WARNING_THRESHOLD_MS) {
        this.stats.slowOperations++;
        console.warn(
          `[MessageSigner] Slow verification operation: ${elapsed}ms (threshold: ${PERFORMANCE_WARNING_THRESHOLD_MS}ms)`
        );
      }

      // Return message without signature (verified)
      const { signature, keyVersion, ...verifiedMessage } = message;
      return verifiedMessage;
    } catch (error) {
      throw new Error(`Message verification failed: ${error.message}`);
    }
  }

  /**
   * Rotate signing key (seamless key rotation)
   *
   * Steps for zero-downtime rotation:
   * 1. Deploy new coordinator instances with new secret and previous secret
   * 2. Wait for all coordinators to update
   * 3. Remove previous secret from configuration
   *
   * @param {string} newSecret - New signing secret
   * @param {boolean} keepPreviousSecret - Keep current secret for verification
   * @throws {Error} If new secret is invalid
   */
  rotateKey(newSecret, keepPreviousSecret = true) {
    // Validate new secret
    if (!newSecret || typeof newSecret !== 'string') {
      throw new Error('New secret must be a non-empty string');
    }

    if (newSecret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `New secret too short (${newSecret.length} chars). ` +
        `Minimum ${MIN_SECRET_LENGTH} characters required.`
      );
    }

    // Store previous secret for verification during transition
    if (keepPreviousSecret) {
      this.previousSecrets.unshift(this.secret);
      // Keep only most recent previous secret (limit memory)
      if (this.previousSecrets.length > 1) {
        this.previousSecrets = this.previousSecrets.slice(0, 1);
      }
    }

    // Update to new secret and increment key version
    this.secret = newSecret;
    this.keyVersion++;

    console.log(
      `[MessageSigner] Key rotation complete. ` +
      `New version: ${this.keyVersion}, ` +
      `Previous secrets stored: ${this.previousSecrets.length}`
    );
  }

  /**
   * Get performance statistics
   *
   * @returns {object} Performance and security metrics
   */
  getStats() {
    const avgSignTime = this.stats.signOperations > 0
      ? this.stats.totalSignTimeMs / this.stats.signOperations
      : 0;

    const avgVerifyTime = this.stats.verifyOperations > 0
      ? this.stats.totalVerifyTimeMs / this.stats.verifyOperations
      : 0;

    const verifyFailureRate = this.stats.verifyOperations > 0
      ? this.stats.verifyFailures / this.stats.verifyOperations
      : 0;

    return {
      signOperations: this.stats.signOperations,
      verifyOperations: this.stats.verifyOperations,
      verifyFailures: this.stats.verifyFailures,
      replayAttemptsBlocked: this.stats.replayAttemptsBlocked,
      slowOperations: this.stats.slowOperations,
      avgSignTimeMs: avgSignTime.toFixed(3),
      avgVerifyTimeMs: avgVerifyTime.toFixed(3),
      verifyFailureRate: (verifyFailureRate * 100).toFixed(2) + '%',
      keyVersion: this.keyVersion,
      previousSecretsCount: this.previousSecrets.length,
      replayProtectionEnabled: this.enableReplayProtection,
      maxTimestampDriftMs: this.maxTimestampDrift
    };
  }

  /**
   * Reset statistics (for testing)
   */
  resetStats() {
    this.stats = {
      signOperations: 0,
      verifyOperations: 0,
      verifyFailures: 0,
      replayAttemptsBlocked: 0,
      totalSignTimeMs: 0,
      totalVerifyTimeMs: 0,
      slowOperations: 0
    };
  }
}

/**
 * Create MessageSigner from environment configuration
 *
 * @param {object} env - Environment variables (defaults to process.env)
 * @returns {MessageSigner} Configured MessageSigner instance
 * @throws {Error} If COORDINATOR_SECRET is not configured
 */
function createSignerFromEnv(env = process.env) {
  const secret = env.COORDINATOR_SECRET;

  if (!secret) {
    throw new Error(
      'COORDINATOR_SECRET environment variable not set. ' +
      'Generate secret: openssl rand -hex 32'
    );
  }

  const options = {
    algorithm: env.COORDINATOR_HMAC_ALGORITHM || 'sha256',
    encoding: env.COORDINATOR_SIGNATURE_ENCODING || 'hex',
    maxTimestampDrift: parseInt(env.COORDINATOR_MAX_TIMESTAMP_DRIFT_MS || '300000', 10),
    enableReplayProtection: env.COORDINATOR_ENABLE_REPLAY_PROTECTION !== 'false',
    keyVersion: parseInt(env.COORDINATOR_KEY_VERSION || '1', 10)
  };

  // Support seamless key rotation
  if (env.COORDINATOR_PREVIOUS_SECRET) {
    options.previousSecrets = [env.COORDINATOR_PREVIOUS_SECRET];
  }

  return new MessageSigner(secret, options);
}

export {
  MessageSigner,
  createSignerFromEnv,
  DEFAULT_ALGORITHM,
  DEFAULT_ENCODING,
  MAX_TIMESTAMP_DRIFT_MS,
  MIN_SECRET_LENGTH,
  PERFORMANCE_WARNING_THRESHOLD_MS
};
