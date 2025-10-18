import { describe, test, expect, beforeAll } from '@jest/globals';
/**
 * CRITICAL FAILING TESTS - Phase 3 Cryptographic Signature Validation
 * REQUIREMENT: 100% test pass rate for signature verification (currently failing)
 *
 * These tests MUST FAIL initially to follow TDD protocol
 * All cryptographic signature validation must pass for Phase 4 approval
 */

const { CryptographicValidator } = require('../../src/crypto/signature-validator');
const crypto = require('crypto');

describe('Cryptographic Signature Validation - CRITICAL SECURITY TESTS', () => {
  let validator;
  const testKeyPairs = {};

  beforeAll(async () => {
    validator = new CryptographicValidator({
      algorithms: ['RSA-PSS', 'ECDSA', 'EdDSA'],
      hashAlgorithms: ['SHA-256', 'SHA-384', 'SHA-512']
    });

    // Generate test key pairs for different algorithms
    testKeyPairs.rsa = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    testKeyPairs.ec = crypto.generateKeyPairSync('ec', {
      namedCurve: 'secp384r1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    testKeyPairs.ed25519 = crypto.generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
  });

  describe('CRITICAL: RSA Signature Validation', () => {
    test('FAILING TEST: should validate RSA-PSS signatures with SHA-256', async () => {
      const message = 'Critical security validation test message';
      const messageBuffer = Buffer.from(message, 'utf8');

      // Create signature
      const signature = crypto.sign('RSA-PSS', messageBuffer, {
        key: testKeyPairs.rsa.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
        hashAlgorithm: 'sha256'
      });

      // THIS MUST PASS - currently failing
      const isValid = await validator.validateSignature({
        message: messageBuffer,
        signature: signature,
        publicKey: testKeyPairs.rsa.publicKey,
        algorithm: 'RSA-PSS',
        hashAlgorithm: 'SHA-256'
      });

      expect(isValid).toBe(true);
      expect(validator.getLastValidationMetadata()).toHaveProperty('algorithm', 'RSA-PSS');
      expect(validator.getLastValidationMetadata()).toHaveProperty('hashAlgorithm', 'SHA-256');
    });

    test('FAILING TEST: should reject invalid RSA signatures', async () => {
      const message = 'Valid message';
      const tamperedMessage = 'Tampered message';

      const messageBuffer = Buffer.from(message, 'utf8');
      const tamperedBuffer = Buffer.from(tamperedMessage, 'utf8');

      const signature = crypto.sign('RSA-PSS', messageBuffer, {
        key: testKeyPairs.rsa.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
        hashAlgorithm: 'sha256'
      });

      // Should detect tampering
      const isValid = await validator.validateSignature({
        message: tamperedBuffer,
        signature: signature,
        publicKey: testKeyPairs.rsa.publicKey,
        algorithm: 'RSA-PSS',
        hashAlgorithm: 'SHA-256'
      });

      expect(isValid).toBe(false);
      expect(validator.getLastValidationError()).toContain('signature verification failed');
    });
  });

  describe('CRITICAL: ECDSA Signature Validation', () => {
    test('FAILING TEST: should validate ECDSA signatures with secp384r1 curve', async () => {
      const message = 'ECDSA test message for critical validation';
      const messageBuffer = Buffer.from(message, 'utf8');

      const signature = crypto.sign('SHA-384', messageBuffer, testKeyPairs.ec.privateKey);

      const isValid = await validator.validateSignature({
        message: messageBuffer,
        signature: signature,
        publicKey: testKeyPairs.ec.publicKey,
        algorithm: 'ECDSA',
        hashAlgorithm: 'SHA-384',
        curve: 'secp384r1'
      });

      expect(isValid).toBe(true);
      expect(validator.getLastValidationMetadata()).toHaveProperty('curve', 'secp384r1');
    });

    test('FAILING TEST: should handle ECDSA signature with wrong curve', async () => {
      const message = 'Test message for curve validation';
      const messageBuffer = Buffer.from(message, 'utf8');

      // Generate signature with different curve
      const wrongCurveKeys = crypto.generateKeyPairSync('ec', {
        namedCurve: 'secp256r1',
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const signature = crypto.sign('SHA-256', messageBuffer, wrongCurveKeys.privateKey);

      const isValid = await validator.validateSignature({
        message: messageBuffer,
        signature: signature,
        publicKey: testKeyPairs.ec.publicKey, // Different curve
        algorithm: 'ECDSA',
        hashAlgorithm: 'SHA-256'
      });

      expect(isValid).toBe(false);
      expect(validator.getLastValidationError()).toContain('key mismatch');
    });
  });

  describe('CRITICAL: EdDSA Signature Validation', () => {
    test('FAILING TEST: should validate Ed25519 signatures', async () => {
      const message = 'EdDSA signature validation test';
      const messageBuffer = Buffer.from(message, 'utf8');

      const signature = crypto.sign(null, messageBuffer, testKeyPairs.ed25519.privateKey);

      const isValid = await validator.validateSignature({
        message: messageBuffer,
        signature: signature,
        publicKey: testKeyPairs.ed25519.publicKey,
        algorithm: 'EdDSA',
        curve: 'Ed25519'
      });

      expect(isValid).toBe(true);
      expect(validator.getLastValidationMetadata()).toHaveProperty('algorithm', 'EdDSA');
    });

    test('FAILING TEST: should reject Ed25519 signatures with wrong public key', async () => {
      const message = 'EdDSA wrong key test';
      const messageBuffer = Buffer.from(message, 'utf8');

      // Generate different key pair
      const wrongKeys = crypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const signature = crypto.sign(null, messageBuffer, testKeyPairs.ed25519.privateKey);

      const isValid = await validator.validateSignature({
        message: messageBuffer,
        signature: signature,
        publicKey: wrongKeys.publicKey, // Wrong key
        algorithm: 'EdDSA',
        curve: 'Ed25519'
      });

      expect(isValid).toBe(false);
    });
  });

  describe('CRITICAL: Multi-Signature Validation', () => {
    test('FAILING TEST: should validate multiple signatures for Byzantine consensus', async () => {
      const message = 'Byzantine consensus multi-signature test';
      const messageBuffer = Buffer.from(message, 'utf8');

      // Create multiple signatures
      const signatures = [
        {
          signature: crypto.sign('RSA-PSS', messageBuffer, {
            key: testKeyPairs.rsa.privateKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
            hashAlgorithm: 'sha256'
          }),
          publicKey: testKeyPairs.rsa.publicKey,
          algorithm: 'RSA-PSS',
          hashAlgorithm: 'SHA-256'
        },
        {
          signature: crypto.sign('SHA-384', messageBuffer, testKeyPairs.ec.privateKey),
          publicKey: testKeyPairs.ec.publicKey,
          algorithm: 'ECDSA',
          hashAlgorithm: 'SHA-384'
        },
        {
          signature: crypto.sign(null, messageBuffer, testKeyPairs.ed25519.privateKey),
          publicKey: testKeyPairs.ed25519.publicKey,
          algorithm: 'EdDSA'
        }
      ];

      const validationResults = await validator.validateMultipleSignatures({
        message: messageBuffer,
        signatures: signatures,
        requiredValidSignatures: 2,
        byzantineFaultTolerance: true
      });

      expect(validationResults.isValid).toBe(true);
      expect(validationResults.validCount).toBeGreaterThanOrEqual(2);
      expect(validationResults.totalCount).toBe(3);
      expect(validationResults.byzantineSecure).toBe(true);
    });

    test('FAILING TEST: should detect Byzantine faults in multi-signature validation', async () => {
      const validMessage = 'Valid Byzantine test message';
      const tamperedMessage = 'Tampered Byzantine test message';

      const validBuffer = Buffer.from(validMessage, 'utf8');
      const tamperedBuffer = Buffer.from(tamperedMessage, 'utf8');

      // Create signatures with some tampered
      const signatures = [
        {
          signature: crypto.sign('RSA-PSS', validBuffer, {
            key: testKeyPairs.rsa.privateKey,
            padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
            saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
            hashAlgorithm: 'sha256'
          }),
          publicKey: testKeyPairs.rsa.publicKey,
          algorithm: 'RSA-PSS',
          hashAlgorithm: 'SHA-256'
        },
        {
          // This signature is for tampered message but we'll validate against original
          signature: crypto.sign('SHA-384', tamperedBuffer, testKeyPairs.ec.privateKey),
          publicKey: testKeyPairs.ec.publicKey,
          algorithm: 'ECDSA',
          hashAlgorithm: 'SHA-384'
        }
      ];

      const validationResults = await validator.validateMultipleSignatures({
        message: validBuffer,
        signatures: signatures,
        requiredValidSignatures: 2,
        byzantineFaultTolerance: true
      });

      expect(validationResults.isValid).toBe(false);
      expect(validationResults.validCount).toBeLessThan(2);
      expect(validationResults.byzantineFaults).toHaveLength(1);
      expect(validationResults.byzantineFaults[0]).toHaveProperty('signatureIndex', 1);
    });
  });

  describe('CRITICAL: Performance and Security Requirements', () => {
    test('FAILING TEST: signature validation should complete within 50ms', async () => {
      const message = 'Performance test message';
      const messageBuffer = Buffer.from(message, 'utf8');

      const signature = crypto.sign('RSA-PSS', messageBuffer, {
        key: testKeyPairs.rsa.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
        hashAlgorithm: 'sha256'
      });

      const startTime = process.hrtime.bigint();

      await validator.validateSignature({
        message: messageBuffer,
        signature: signature,
        publicKey: testKeyPairs.rsa.publicKey,
        algorithm: 'RSA-PSS',
        hashAlgorithm: 'SHA-256'
      });

      const endTime = process.hrtime.bigint();
      const durationMs = Number(endTime - startTime) / 1000000;

      expect(durationMs).toBeLessThan(50);
    });

    test('FAILING TEST: should prevent timing attacks', async () => {
      const message = 'Timing attack prevention test';
      const messageBuffer = Buffer.from(message, 'utf8');

      const validSignature = crypto.sign('RSA-PSS', messageBuffer, {
        key: testKeyPairs.rsa.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
        hashAlgorithm: 'sha256'
      });

      // Generate invalid signature (random bytes)
      const invalidSignature = crypto.randomBytes(validSignature.length);

      // Measure timing for valid signature
      const validTimes = [];
      for (let i = 0; i < 10; i++) {
        const start = process.hrtime.bigint();
        await validator.validateSignature({
          message: messageBuffer,
          signature: validSignature,
          publicKey: testKeyPairs.rsa.publicKey,
          algorithm: 'RSA-PSS',
          hashAlgorithm: 'SHA-256'
        });
        const end = process.hrtime.bigint();
        validTimes.push(Number(end - start));
      }

      // Measure timing for invalid signature
      const invalidTimes = [];
      for (let i = 0; i < 10; i++) {
        const start = process.hrtime.bigint();
        await validator.validateSignature({
          message: messageBuffer,
          signature: invalidSignature,
          publicKey: testKeyPairs.rsa.publicKey,
          algorithm: 'RSA-PSS',
          hashAlgorithm: 'SHA-256'
        });
        const end = process.hrtime.bigint();
        invalidTimes.push(Number(end - start));
      }

      const avgValidTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
      const avgInvalidTime = invalidTimes.reduce((a, b) => a + b, 0) / invalidTimes.length;

      // Timing should be similar to prevent timing attacks (within 10% difference)
      const timingDifference = Math.abs(avgValidTime - avgInvalidTime) / Math.max(avgValidTime, avgInvalidTime);
      expect(timingDifference).toBeLessThan(0.1);
    });
  });

  describe('CRITICAL: Error Handling and Edge Cases', () => {
    test('FAILING TEST: should handle malformed signatures gracefully', async () => {
      const message = 'Malformed signature test';
      const messageBuffer = Buffer.from(message, 'utf8');

      const malformedSignatures = [
        Buffer.from('not-a-signature'),
        Buffer.alloc(0), // Empty signature
        Buffer.from('malformed-base64-signature-data'),
        null,
        undefined
      ];

      for (const malformedSig of malformedSignatures) {
        const isValid = await validator.validateSignature({
          message: messageBuffer,
          signature: malformedSig,
          publicKey: testKeyPairs.rsa.publicKey,
          algorithm: 'RSA-PSS',
          hashAlgorithm: 'SHA-256'
        });

        expect(isValid).toBe(false);
        expect(validator.getLastValidationError()).toBeDefined();
      }
    });

    test('FAILING TEST: should validate signature metadata and provenance', async () => {
      const message = 'Metadata validation test';
      const messageBuffer = Buffer.from(message, 'utf8');

      const signature = crypto.sign('RSA-PSS', messageBuffer, {
        key: testKeyPairs.rsa.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
        hashAlgorithm: 'sha256'
      });

      const isValid = await validator.validateSignature({
        message: messageBuffer,
        signature: signature,
        publicKey: testKeyPairs.rsa.publicKey,
        algorithm: 'RSA-PSS',
        hashAlgorithm: 'SHA-256',
        metadata: {
          timestamp: Date.now(),
          signer: 'test-signer-id',
          purpose: 'phase3-critical-validation'
        }
      });

      expect(isValid).toBe(true);

      const metadata = validator.getLastValidationMetadata();
      expect(metadata).toHaveProperty('timestamp');
      expect(metadata).toHaveProperty('signer', 'test-signer-id');
      expect(metadata).toHaveProperty('purpose', 'phase3-critical-validation');
    });
  });
});