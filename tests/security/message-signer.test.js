/**
 * Message Signer Test Suite
 *
 * Comprehensive tests for HMAC-SHA256 message authentication
 * Tests VULN-003 mitigation (message spoofing/coordinator impersonation)
 *
 * Test Coverage:
 * - Basic signing and verification
 * - Signature tampering detection
 * - Replay attack prevention
 * - Key rotation support
 * - Performance benchmarks
 * - Error handling
 * - Edge cases
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  MessageSigner,
  createSignerFromEnv,
  MIN_SECRET_LENGTH
} from '../../src/security/message-signer.js';

describe('MessageSigner - HMAC-SHA256 Authentication', () => {
  let validSecret;
  let signer;

  beforeEach(() => {
    // Generate valid secret (64 hex characters = 32 bytes)
    validSecret = crypto.randomBytes(32).toString('hex');
    signer = new MessageSigner(validSecret);
  });

  afterEach(() => {
    if (signer) {
      signer.resetStats();
    }
  });

  describe('Initialization', () => {
    it('should initialize with valid secret', () => {
      const testSigner = new MessageSigner(validSecret);
      assert.ok(testSigner);
      assert.strictEqual(testSigner.keyVersion, 1);
    });

    it('should reject missing secret', () => {
      assert.throws(
        () => new MessageSigner(),
        /COORDINATOR_SECRET not configured/
      );
    });

    it('should reject null secret', () => {
      assert.throws(
        () => new MessageSigner(null),
        /COORDINATOR_SECRET not configured/
      );
    });

    it('should reject non-string secret', () => {
      assert.throws(
        () => new MessageSigner(12345),
        /COORDINATOR_SECRET must be a string/
      );
    });

    it('should reject short secret', () => {
      const shortSecret = 'tooshort';
      assert.throws(
        () => new MessageSigner(shortSecret),
        /COORDINATOR_SECRET too short/
      );
    });

    it('should accept minimum length secret', () => {
      const minSecret = 'a'.repeat(MIN_SECRET_LENGTH);
      const testSigner = new MessageSigner(minSecret);
      assert.ok(testSigner);
    });

    it('should accept custom options', () => {
      const testSigner = new MessageSigner(validSecret, {
        algorithm: 'sha512',
        encoding: 'base64',
        maxTimestampDrift: 60000,
        enableReplayProtection: false,
        keyVersion: 2
      });

      assert.strictEqual(testSigner.algorithm, 'sha512');
      assert.strictEqual(testSigner.encoding, 'base64');
      assert.strictEqual(testSigner.maxTimestampDrift, 60000);
      assert.strictEqual(testSigner.enableReplayProtection, false);
      assert.strictEqual(testSigner.keyVersion, 2);
    });
  });

  describe('Message Signing', () => {
    it('should sign valid message', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        to: 'coordinator-2',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);

      assert.ok(signed.signature);
      assert.strictEqual(typeof signed.signature, 'string');
      assert.ok(signed.signature.length > 0);
      assert.strictEqual(signed.keyVersion, 1);
    });

    it('should preserve original message properties', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        data: { key: 'value' },
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);

      assert.strictEqual(signed.id, message.id);
      assert.strictEqual(signed.type, message.type);
      assert.strictEqual(signed.from, message.from);
      assert.deepStrictEqual(signed.data, message.data);
      assert.strictEqual(signed.timestamp, message.timestamp);
    });

    it('should add timestamp if missing', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1'
      };

      const signed = signer.signMessage(message);

      assert.ok(signed.timestamp);
      assert.strictEqual(typeof signed.timestamp, 'number');
    });

    it('should reject null message', () => {
      assert.throws(
        () => signer.signMessage(null),
        /Message must be a non-null object/
      );
    });

    it('should reject non-object message', () => {
      assert.throws(
        () => signer.signMessage('string'),
        /Message must be a non-null object/
      );
    });

    it('should generate deterministic signatures', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: 1234567890
      };

      const signed1 = signer.signMessage({ ...message });
      const signed2 = signer.signMessage({ ...message });

      assert.strictEqual(signed1.signature, signed2.signature);
    });

    it('should handle property order independence', () => {
      const message1 = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: 1234567890
      };

      const message2 = {
        timestamp: 1234567890,
        from: 'coordinator-1',
        type: 'request',
        id: '123'
      };

      const signed1 = signer.signMessage(message1);
      const signed2 = signer.signMessage(message2);

      assert.strictEqual(signed1.signature, signed2.signature);
    });

    it('should update signing statistics', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      signer.signMessage(message);
      signer.signMessage(message);

      const stats = signer.getStats();
      assert.strictEqual(stats.signOperations, 2);
    });
  });

  describe('Message Verification', () => {
    it('should verify valid signed message', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);
      const verified = signer.verifyMessage(signed);

      assert.ok(verified);
      assert.strictEqual(verified.id, message.id);
      assert.strictEqual(verified.type, message.type);
      assert.strictEqual(verified.from, message.from);
      // Signature should be removed
      assert.strictEqual(verified.signature, undefined);
    });

    it('should reject unsigned message', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      assert.throws(
        () => signer.verifyMessage(message),
        /Message missing signature field/
      );
    });

    it('should reject message with invalid signature', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now(),
        signature: 'invalid_signature_12345'
      };

      assert.throws(
        () => signer.verifyMessage(message),
        /Invalid message signature/
      );
    });

    it('should reject null message', () => {
      assert.throws(
        () => signer.verifyMessage(null),
        /Message must be a non-null object/
      );
    });

    it('should reject non-object message', () => {
      assert.throws(
        () => signer.verifyMessage('string'),
        /Message must be a non-null object/
      );
    });

    it('should update verification statistics', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);
      signer.verifyMessage(signed);
      signer.verifyMessage(signed);

      const stats = signer.getStats();
      assert.strictEqual(stats.verifyOperations, 2);
      assert.strictEqual(stats.verifyFailures, 0);
    });

    it('should track verification failures', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now(),
        signature: 'invalid'
      };

      try {
        signer.verifyMessage(message);
      } catch (error) {
        // Expected
      }

      const stats = signer.getStats();
      assert.strictEqual(stats.verifyFailures, 1);
    });
  });

  describe('Signature Tampering Detection', () => {
    it('should detect modified payload', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);

      // Tamper with message
      signed.id = '456';

      assert.throws(
        () => signer.verifyMessage(signed),
        /Invalid message signature/
      );
    });

    it('should detect modified type', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);

      // Tamper with type
      signed.type = 'response';

      assert.throws(
        () => signer.verifyMessage(signed),
        /Invalid message signature/
      );
    });

    it('should detect modified timestamp', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);

      // Tamper with timestamp
      signed.timestamp = Date.now() + 1000;

      assert.throws(
        () => signer.verifyMessage(signed),
        /Invalid message signature/
      );
    });

    it('should detect added properties', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);

      // Add new property
      signed.malicious = 'payload';

      assert.throws(
        () => signer.verifyMessage(signed),
        /Invalid message signature/
      );
    });

    it('should detect removed properties', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        to: 'coordinator-2',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);

      // Remove property
      delete signed.to;

      assert.throws(
        () => signer.verifyMessage(signed),
        /Invalid message signature/
      );
    });

    it('should detect modified nested data', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        data: { key: 'value' },
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);

      // Create a copy and tamper with nested data
      const tamperedSigned = JSON.parse(JSON.stringify(signed));
      tamperedSigned.data.key = 'tampered';

      assert.throws(
        () => signer.verifyMessage(tamperedSigned),
        /Invalid message signature/
      );
    });
  });

  describe('Replay Attack Prevention', () => {
    it('should accept message with recent timestamp', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);
      const verified = signer.verifyMessage(signed);

      assert.ok(verified);
    });

    it('should reject message with old timestamp', () => {
      const oldTimestamp = Date.now() - 400000; // 6 minutes ago
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: oldTimestamp
      };

      const signed = signer.signMessage(message);

      assert.throws(
        () => signer.verifyMessage(signed),
        /replay attack detected/
      );
    });

    it('should reject message with future timestamp', () => {
      const futureTimestamp = Date.now() + 400000; // 6 minutes in future
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: futureTimestamp
      };

      const signed = signer.signMessage(message);

      assert.throws(
        () => signer.verifyMessage(signed),
        /replay attack detected/
      );
    });

    it('should track replay attempts', () => {
      const oldTimestamp = Date.now() - 400000;
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: oldTimestamp
      };

      const signed = signer.signMessage(message);

      try {
        signer.verifyMessage(signed);
      } catch (error) {
        // Expected
      }

      const stats = signer.getStats();
      assert.strictEqual(stats.replayAttemptsBlocked, 1);
    });

    it('should allow replay protection to be disabled', () => {
      const testSigner = new MessageSigner(validSecret, {
        enableReplayProtection: false
      });

      const oldTimestamp = Date.now() - 400000;
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: oldTimestamp
      };

      const signed = testSigner.signMessage(message);
      const verified = testSigner.verifyMessage(signed);

      assert.ok(verified);
    });
  });

  describe('Key Rotation', () => {
    it('should rotate key successfully', () => {
      const newSecret = crypto.randomBytes(32).toString('hex');

      signer.rotateKey(newSecret);

      assert.strictEqual(signer.keyVersion, 2);
      assert.strictEqual(signer.secret, newSecret);
      assert.strictEqual(signer.previousSecrets.length, 1);
    });

    it('should verify messages signed with previous key', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      // Sign with original key
      const signed = signer.signMessage(message);

      // Rotate key
      const newSecret = crypto.randomBytes(32).toString('hex');
      signer.rotateKey(newSecret);

      // Should still verify message signed with previous key
      const verified = signer.verifyMessage(signed);
      assert.ok(verified);
    });

    it('should sign new messages with new key', () => {
      const newSecret = crypto.randomBytes(32).toString('hex');
      signer.rotateKey(newSecret);

      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);

      assert.strictEqual(signed.keyVersion, 2);
    });

    it('should reject invalid new secret', () => {
      assert.throws(
        () => signer.rotateKey('tooshort'),
        /New secret too short/
      );
    });

    it('should keep only most recent previous secret', () => {
      const secret2 = crypto.randomBytes(32).toString('hex');
      const secret3 = crypto.randomBytes(32).toString('hex');

      signer.rotateKey(secret2);
      signer.rotateKey(secret3);

      assert.strictEqual(signer.keyVersion, 3);
      assert.strictEqual(signer.previousSecrets.length, 1);
    });
  });

  describe('Performance', () => {
    it('should sign message in less than 5ms', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      const start = Date.now();
      signer.signMessage(message);
      const elapsed = Date.now() - start;

      assert.ok(elapsed < 5, `Signing took ${elapsed}ms (target: <5ms)`);
    });

    it('should verify message in less than 5ms', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);

      const start = Date.now();
      signer.verifyMessage(signed);
      const elapsed = Date.now() - start;

      assert.ok(elapsed < 5, `Verification took ${elapsed}ms (target: <5ms)`);
    });

    it('should handle bulk signing efficiently', () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}`,
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      }));

      const start = Date.now();
      const signed = messages.map(msg => signer.signMessage(msg));
      const elapsed = Date.now() - start;

      const avgPerMessage = elapsed / 100;
      assert.ok(
        avgPerMessage < 5,
        `Average signing time: ${avgPerMessage.toFixed(2)}ms (target: <5ms)`
      );
    });

    it('should handle bulk verification efficiently', () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        id: `msg-${i}`,
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      }));

      const signed = messages.map(msg => signer.signMessage(msg));

      const start = Date.now();
      signed.forEach(msg => signer.verifyMessage(msg));
      const elapsed = Date.now() - start;

      const avgPerMessage = elapsed / 100;
      assert.ok(
        avgPerMessage < 5,
        `Average verification time: ${avgPerMessage.toFixed(2)}ms (target: <5ms)`
      );
    });
  });

  describe('Statistics', () => {
    it('should track signing operations', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      signer.signMessage(message);
      signer.signMessage(message);
      signer.signMessage(message);

      const stats = signer.getStats();
      assert.strictEqual(stats.signOperations, 3);
    });

    it('should track verification operations', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);
      signer.verifyMessage(signed);
      signer.verifyMessage(signed);

      const stats = signer.getStats();
      assert.strictEqual(stats.verifyOperations, 2);
    });

    it('should calculate average signing time', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      signer.signMessage(message);

      const stats = signer.getStats();
      assert.ok(parseFloat(stats.avgSignTimeMs) >= 0);
    });

    it('should calculate verification failure rate', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      const signed = signer.signMessage(message);

      // Successful verification
      signer.verifyMessage(signed);

      // Failed verification (deep clone to avoid reference issues)
      try {
        const tampered = JSON.parse(JSON.stringify(signed));
        tampered.id = 'tampered';
        signer.verifyMessage(tampered);
      } catch (error) {
        // Expected
      }

      const stats = signer.getStats();
      assert.strictEqual(stats.verifyFailureRate, '50.00%');
    });

    it('should reset statistics', () => {
      const message = {
        id: '123',
        type: 'request',
        from: 'coordinator-1',
        timestamp: Date.now()
      };

      signer.signMessage(message);
      signer.resetStats();

      const stats = signer.getStats();
      assert.strictEqual(stats.signOperations, 0);
      assert.strictEqual(stats.verifyOperations, 0);
    });
  });

  describe('Environment Configuration', () => {
    it('should create signer from environment', () => {
      const env = {
        COORDINATOR_SECRET: validSecret
      };

      const testSigner = createSignerFromEnv(env);
      assert.ok(testSigner);
    });

    it('should reject missing COORDINATOR_SECRET', () => {
      const env = {};

      assert.throws(
        () => createSignerFromEnv(env),
        /COORDINATOR_SECRET environment variable not set/
      );
    });

    it('should use default values for optional config', () => {
      const env = {
        COORDINATOR_SECRET: validSecret
      };

      const testSigner = createSignerFromEnv(env);

      assert.strictEqual(testSigner.algorithm, 'sha256');
      assert.strictEqual(testSigner.encoding, 'hex');
      assert.strictEqual(testSigner.maxTimestampDrift, 300000);
      assert.strictEqual(testSigner.enableReplayProtection, true);
      assert.strictEqual(testSigner.keyVersion, 1);
    });

    it('should use custom environment values', () => {
      const env = {
        COORDINATOR_SECRET: validSecret,
        COORDINATOR_HMAC_ALGORITHM: 'sha512',
        COORDINATOR_SIGNATURE_ENCODING: 'base64',
        COORDINATOR_MAX_TIMESTAMP_DRIFT_MS: '60000',
        COORDINATOR_ENABLE_REPLAY_PROTECTION: 'false',
        COORDINATOR_KEY_VERSION: '2'
      };

      const testSigner = createSignerFromEnv(env);

      assert.strictEqual(testSigner.algorithm, 'sha512');
      assert.strictEqual(testSigner.encoding, 'base64');
      assert.strictEqual(testSigner.maxTimestampDrift, 60000);
      assert.strictEqual(testSigner.enableReplayProtection, false);
      assert.strictEqual(testSigner.keyVersion, 2);
    });

    it('should support key rotation from environment', () => {
      const previousSecret = crypto.randomBytes(32).toString('hex');
      const env = {
        COORDINATOR_SECRET: validSecret,
        COORDINATOR_PREVIOUS_SECRET: previousSecret
      };

      const testSigner = createSignerFromEnv(env);

      assert.strictEqual(testSigner.previousSecrets.length, 1);
      assert.strictEqual(testSigner.previousSecrets[0], previousSecret);
    });
  });
});
