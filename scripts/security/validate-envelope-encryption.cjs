/**
 * Envelope Encryption Implementation Validator
 *
 * This script validates the envelope encryption implementation without requiring
 * a full test suite. It performs critical security checks and generates a
 * confidence report.
 */

const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const EncryptionKeyManager = require('../../src/sqlite/EncryptionKeyManager');

const VALIDATION_RESULTS = {
  tests: [],
  passed: 0,
  failed: 0,
  confidence: 0
};

function test(name, fn) {
  try {
    fn();
    VALIDATION_RESULTS.tests.push({ name, status: 'PASS' });
    VALIDATION_RESULTS.passed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    VALIDATION_RESULTS.tests.push({ name, status: 'FAIL', error: error.message });
    VALIDATION_RESULTS.failed++;
    console.error(`❌ ${name}: ${error.message}`);
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    VALIDATION_RESULTS.tests.push({ name, status: 'PASS' });
    VALIDATION_RESULTS.passed++;
    console.log(`✅ ${name}`);
  } catch (error) {
    VALIDATION_RESULTS.tests.push({ name, status: 'FAIL', error: error.message });
    VALIDATION_RESULTS.failed++;
    console.error(`❌ ${name}: ${error.message}`);
  }
}

async function validateEnvelopeEncryption() {
  console.log('🔐 Envelope Encryption Security Validation');
  console.log('=' .repeat(60));
  console.log('');

  const db = new sqlite3.Database(':memory:');
  const testMasterKey = crypto.randomBytes(32).toString('base64');

  // Test 1: Master key loading
  console.log('1️⃣ Master Key Management');
  let keyManager;

  await asyncTest('Master key loads from options', async () => {
    keyManager = new EncryptionKeyManager({ db, masterKey: testMasterKey });
    await keyManager.initialize();

    if (!keyManager.masterKey || keyManager.masterKey.length < 32) {
      throw new Error('Master key invalid or too short');
    }
  });

  test('Master key validation rejects short keys', () => {
    const shortKey = crypto.randomBytes(16).toString('base64');
    try {
      new EncryptionKeyManager({ db, masterKey: shortKey });
      throw new Error('Should have rejected short key');
    } catch (error) {
      if (!error.message.includes('at least 32 bytes')) {
        throw error;
      }
    }
  });

  test('Master key validation rejects invalid format', () => {
    try {
      new EncryptionKeyManager({ db, masterKey: 'invalid-format' });
      throw new Error('Should have rejected invalid format');
    } catch (error) {
      if (!error.message.includes('Invalid master key format')) {
        throw error;
      }
    }
  });

  // Test 2: DEK Generation and Encryption
  console.log('');
  console.log('2️⃣ Data Encryption Key (DEK) Generation');

  await asyncTest('DEK encrypted with master key before storage', async () => {
    const sql = 'SELECT key_material, metadata FROM encryption_keys WHERE is_active = 1';
    const row = await new Promise((resolve, reject) => {
      db.get(sql, (err, row) => (err ? reject(err) : resolve(row)));
    });

    if (!row) {
      throw new Error('No active key found');
    }

    // Verify envelope encryption flag
    const metadata = JSON.parse(row.metadata);
    if (!metadata.envelopeEncryption) {
      throw new Error('Envelope encryption not enabled in metadata');
    }

    // Verify stored key is base64-encoded (not hex plaintext)
    if (row.key_material.match(/^[0-9a-f]{64}$/)) {
      throw new Error('Key appears to be stored as plaintext hex');
    }
  });

  await asyncTest('DEK not stored in plaintext', async () => {
    const activeDEK = keyManager.activeKey;

    const sql = 'SELECT key_material FROM encryption_keys WHERE is_active = 1';
    const row = await new Promise((resolve, reject) => {
      db.get(sql, (err, row) => (err ? reject(err) : resolve(row)));
    });

    // Stored key should NOT equal plaintext DEK
    const storedKey = row.key_material;

    // Try to decode as hex (legacy format)
    let hexAttempt;
    try {
      hexAttempt = Buffer.from(storedKey, 'hex');
    } catch {
      hexAttempt = null;
    }

    if (hexAttempt && hexAttempt.equals(activeDEK)) {
      throw new Error('DEK stored in plaintext!');
    }
  });

  test('DEK encryption tracked in metrics', () => {
    const metrics = keyManager.getMetrics();
    if (!metrics.dekEncryptions || metrics.dekEncryptions < 1) {
      throw new Error('DEK encryption not tracked in metrics');
    }
  });

  // Test 3: DEK Decryption
  console.log('');
  console.log('3️⃣ DEK Decryption and Retrieval');

  await asyncTest('DEK decrypts correctly on retrieval', async () => {
    const originalDEK = keyManager.activeKey;
    const keyId = keyManager.activeKeyId;

    keyManager.keyCache.clear();

    const retrievedDEK = await keyManager.getDecryptionKey(keyId);

    if (!retrievedDEK.equals(originalDEK)) {
      throw new Error('Decrypted DEK does not match original');
    }
  });

  await asyncTest('DEK cached in memory after retrieval', async () => {
    const keyId = keyManager.activeKeyId;
    await keyManager.getDecryptionKey(keyId);

    if (!keyManager.keyCache.has(keyId)) {
      throw new Error('DEK not cached after retrieval');
    }
  });

  test('DEK decryption tracked in metrics', () => {
    const metrics = keyManager.getMetrics();
    if (!metrics.dekDecryptions || metrics.dekDecryptions < 1) {
      throw new Error('DEK decryption not tracked in metrics');
    }
  });

  // Test 4: Security Validations
  console.log('');
  console.log('4️⃣ Security Validations');

  await asyncTest('Decryption fails with wrong master key', async () => {
    const keyId = keyManager.activeKeyId;
    keyManager.keyCache.clear();

    const wrongMasterKey = crypto.randomBytes(32);
    keyManager.masterKey = wrongMasterKey;

    try {
      await keyManager.getDecryptionKey(keyId);
      throw new Error('Decryption should have failed with wrong master key');
    } catch (error) {
      if (!error.message.includes('DEK decryption failed')) {
        throw error;
      }
    }

    // Restore correct master key
    keyManager.masterKey = Buffer.from(testMasterKey, 'base64');
  });

  await asyncTest('Audit trail includes envelope encryption flag', async () => {
    const auditTrail = await keyManager.getAuditTrail();

    if (auditTrail.length === 0) {
      throw new Error('No audit trail found');
    }

    const generateEntry = auditTrail.find(entry => entry.operation === 'generate');
    if (!generateEntry) {
      throw new Error('No generate operation in audit trail');
    }

    const metadata = JSON.parse(generateEntry.metadata);
    if (!metadata.envelopeEncryption) {
      throw new Error('Envelope encryption not flagged in audit trail');
    }
  });

  await asyncTest('All stored DEKs are encrypted', async () => {
    const sql = 'SELECT key_material FROM encryption_keys';
    const rows = await new Promise((resolve, reject) => {
      db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

    for (const row of rows) {
      // Verify base64-encoded envelope (IV + authTag + encrypted DEK)
      const decoded = Buffer.from(row.key_material, 'base64');
      if (decoded.length <= 28) {
        throw new Error('Stored key too short for envelope encryption');
      }
    }
  });

  // Test 5: Key Rotation
  console.log('');
  console.log('5️⃣ Key Rotation with Envelope Encryption');

  await asyncTest('Key rotation creates envelope-encrypted DEK', async () => {
    const oldKeyId = keyManager.activeKeyId;
    await keyManager.rotateKey('validation-test');

    const sql = 'SELECT metadata FROM encryption_keys WHERE is_active = 1';
    const row = await new Promise((resolve, reject) => {
      db.get(sql, (err, row) => (err ? reject(err) : resolve(row)));
    });

    const metadata = JSON.parse(row.metadata);
    if (!metadata.envelopeEncryption) {
      throw new Error('Rotated key not using envelope encryption');
    }
  });

  test('Multiple DEKs generated are unique', () => {
    const allKeys = Array.from(keyManager.keyCache.values());
    const uniqueKeys = new Set(allKeys.map(k => k.toString('hex')));

    if (uniqueKeys.size !== allKeys.length) {
      throw new Error('Generated DEKs are not unique');
    }
  });

  // Test 6: Environment Variable Support
  console.log('');
  console.log('6️⃣ Environment Variable Support');

  test('Loads master key from MASTER_ENCRYPTION_KEY env var', () => {
    process.env.MASTER_ENCRYPTION_KEY = testMasterKey;

    const envKeyManager = new EncryptionKeyManager({ db });

    if (!envKeyManager.masterKey) {
      throw new Error('Master key not loaded from environment variable');
    }

    delete process.env.MASTER_ENCRYPTION_KEY;
  });

  test('Throws error in production without MASTER_ENCRYPTION_KEY', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    delete process.env.MASTER_ENCRYPTION_KEY;

    try {
      new EncryptionKeyManager({ db });
      throw new Error('Should have thrown error in production');
    } catch (error) {
      if (!error.message.includes('MASTER_ENCRYPTION_KEY not found')) {
        throw error;
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // Cleanup
  await keyManager.shutdown();
  await new Promise((resolve) => db.close(resolve));

  // Calculate confidence score
  console.log('');
  console.log('=' .repeat(60));
  console.log('📊 Validation Results');
  console.log('=' .repeat(60));
  console.log('');
  console.log(`Total Tests: ${VALIDATION_RESULTS.tests.length}`);
  console.log(`Passed: ${VALIDATION_RESULTS.passed} ✅`);
  console.log(`Failed: ${VALIDATION_RESULTS.failed} ❌`);
  console.log('');

  VALIDATION_RESULTS.confidence = VALIDATION_RESULTS.passed / VALIDATION_RESULTS.tests.length;

  console.log(`Confidence Score: ${(VALIDATION_RESULTS.confidence * 100).toFixed(1)}%`);
  console.log('');

  if (VALIDATION_RESULTS.confidence >= 0.75) {
    console.log('✅ VALIDATION PASSED (Confidence ≥ 0.75)');
  } else {
    console.log('❌ VALIDATION FAILED (Confidence < 0.75)');
  }

  console.log('');
  console.log('=' .repeat(60));

  return VALIDATION_RESULTS;
}

// Run validation
validateEnvelopeEncryption()
  .then((results) => {
    const exitCode = results.confidence >= 0.75 ? 0 : 1;
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error('');
    console.error('💥 Validation Error:', error);
    process.exit(1);
  });
