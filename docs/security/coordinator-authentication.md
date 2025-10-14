# Coordinator Message Authentication (HMAC-SHA256)

## Overview

HMAC-SHA256 message authentication prevents message spoofing and coordinator impersonation attacks (VULN-003, CVSS 6.5). All coordinator-to-coordinator messages are cryptographically signed to ensure authenticity and integrity.

## Security Features

- **HMAC-SHA256 Signatures**: Cryptographic message authentication using SHA-256 hashing
- **Replay Attack Prevention**: Timestamp validation rejects messages outside acceptable time window
- **Tamper Detection**: Any modification to message content invalidates the signature
- **Key Rotation Support**: Seamless secret rotation with zero downtime
- **Performance Optimized**: <5ms overhead per message (signing + verification)
- **Constant-Time Comparison**: Prevents timing attacks during signature verification

## Quick Start

### 1. Generate Secret

```bash
# Generate 32-byte (256-bit) secret
openssl rand -hex 32
```

### 2. Configure Environment

```bash
# config/.env or environment variables
COORDINATOR_SECRET=your-generated-secret-here

# Optional: Advanced configuration
COORDINATOR_HMAC_ALGORITHM=sha256               # Default: sha256
COORDINATOR_SIGNATURE_ENCODING=hex              # Default: hex
COORDINATOR_MAX_TIMESTAMP_DRIFT_MS=300000       # Default: 5 minutes
COORDINATOR_ENABLE_REPLAY_PROTECTION=true       # Default: true
COORDINATOR_KEY_VERSION=1                        # Default: 1

# Optional: Key rotation support
COORDINATOR_PREVIOUS_SECRET=previous-secret-here
```

### 3. Enable in Coordinators

```javascript
import { DormantCoordinatorBase } from './tests/hello-world/lib/dormant-coordinator-base.js';

// Message signing enabled by default
const coordinator = new DormantCoordinatorBase('coordinator-1', 'redis://localhost:6379');

// Disable message signing (NOT RECOMMENDED)
const unsafeCoordinator = new DormantCoordinatorBase(
  'coordinator-2',
  'redis://localhost:6379',
  { enableMessageSigning: false }
);
```

## Usage

### Signing Messages

```javascript
import { createSignerFromEnv } from './src/security/message-signer.js';

// Create signer from environment config
const signer = createSignerFromEnv();

// Sign outgoing message
const message = {
  id: '123',
  type: 'request',
  from: 'coordinator-1',
  to: 'coordinator-2',
  task: 'process',
  data: { key: 'value' },
  timestamp: Date.now()
};

const signedMessage = signer.signMessage(message);

// Publish to Redis
await redis.publish('coordinator:coordinator-2:requests', JSON.stringify(signedMessage));
```

### Verifying Messages

```javascript
// Receive message from Redis
redis.subscribe('coordinator:coordinator-1:requests', (messageStr) => {
  try {
    // Parse JSON
    const message = JSON.parse(messageStr);

    // Verify signature
    const verifiedMessage = signer.verifyMessage(message);

    // Process verified message
    handleMessage(verifiedMessage);
  } catch (error) {
    console.error('Signature verification failed:', error.message);
    // Reject message
  }
});
```

## Security Guarantees

### Message Integrity

Any modification to a signed message will be detected:

```javascript
const signed = signer.signMessage(message);

// Modify message
signed.id = 'tampered';

// Verification fails
signer.verifyMessage(signed); // Throws: Invalid message signature
```

### Replay Attack Prevention

Old messages are automatically rejected:

```javascript
const oldMessage = {
  id: '123',
  type: 'request',
  from: 'coordinator-1',
  timestamp: Date.now() - 400000  // 6 minutes ago
};

const signed = signer.signMessage(oldMessage);

// Verification fails
signer.verifyMessage(signed); // Throws: Possible replay attack detected
```

### Tamper Detection Examples

**Modified payload:**
```javascript
signed.data.key = 'tampered';  // ❌ Detected
```

**Added properties:**
```javascript
signed.malicious = 'payload';  // ❌ Detected
```

**Removed properties:**
```javascript
delete signed.to;  // ❌ Detected
```

**Modified nested data:**
```javascript
signed.data.nested.value = 'changed';  // ❌ Detected
```

## Key Management

### Secret Requirements

- **Minimum Length**: 32 characters (recommended: 64 hex characters = 32 bytes)
- **Entropy**: Use cryptographically secure random generation
- **Storage**: Store in environment variables or secrets manager (Vault, AWS Secrets Manager, K8s Secrets)
- **Distribution**: Deploy to all coordinators before enabling message signing
- **Access Control**: Restrict read access to coordinator processes only

### Key Rotation

Zero-downtime key rotation in 3 steps:

#### Step 1: Deploy New Secret with Previous Secret

```bash
# All coordinators
COORDINATOR_SECRET=new-secret-here
COORDINATOR_PREVIOUS_SECRET=old-secret-here
COORDINATOR_KEY_VERSION=2
```

Deploy updated configuration to all coordinators. They will:
- Sign new messages with new secret (v2)
- Verify incoming messages using both new (v2) and old (v1) secrets

#### Step 2: Wait for Propagation

Wait for all coordinators to update (monitor heartbeats and stats).

#### Step 3: Remove Previous Secret

```bash
# All coordinators
COORDINATOR_SECRET=new-secret-here
# COORDINATOR_PREVIOUS_SECRET removed
COORDINATOR_KEY_VERSION=2
```

All coordinators now use only the new secret.

### Programmatic Key Rotation

```javascript
const signer = createSignerFromEnv();

// Rotate to new secret
signer.rotateKey(newSecret, keepPreviousSecret = true);

// New messages use new secret (v2)
const signed = signer.signMessage(message);

// Old messages (v1) still verify successfully
const oldVerified = signer.verifyMessage(oldSignedMessage);
```

## Performance

### Benchmarks

All tests run on standard hardware (2.5GHz CPU, 8GB RAM):

| Operation | Average Time | Target | Status |
|-----------|-------------|--------|--------|
| Sign Message | ~0.1ms | <5ms | ✅ Pass |
| Verify Message | ~0.1ms | <5ms | ✅ Pass |
| Bulk Signing (100 msgs) | ~0.5ms avg | <5ms avg | ✅ Pass |
| Bulk Verification (100 msgs) | ~1.2ms avg | <5ms avg | ✅ Pass |

### Performance Statistics

```javascript
const stats = signer.getStats();

console.log(stats);
// {
//   signOperations: 1234,
//   verifyOperations: 1234,
//   verifyFailures: 12,
//   replayAttemptsBlocked: 5,
//   slowOperations: 0,
//   avgSignTimeMs: '0.123',
//   avgVerifyTimeMs: '0.145',
//   verifyFailureRate: '0.97%',
//   keyVersion: 1,
//   previousSecretsCount: 0,
//   replayProtectionEnabled: true,
//   maxTimestampDriftMs: 300000
// }
```

## Integration with Coordinators

### DormantCoordinatorBase

The `DormantCoordinatorBase` class automatically integrates message signing:

```javascript
class DormantCoordinatorBase {
  constructor(id, redisUrl, options = {}) {
    // Message signing enabled by default
    this.enableMessageSigning = options.enableMessageSigning !== false;

    // Initialize signer from environment
    this.messageSigner = createSignerFromEnv(options.env || process.env);
  }

  async sendRequest(targetCoordinator, task, data) {
    // Create request
    let request = { id, type, from, to, task, data, timestamp };

    // Sign before sending
    if (this.enableMessageSigning) {
      request = this.messageSigner.signMessage(request);
    }

    // Publish to Redis
    await this.pubClient.publish(channel, JSON.stringify(request));
  }

  async handleIncomingMessage(messageStr) {
    // Parse and validate JSON structure
    const message = parseAndValidateMessage(messageStr);

    // Verify signature
    if (this.enableMessageSigning) {
      const verified = this.messageSigner.verifyMessage(message);
      await this.processMessage(verified);
    }
  }
}
```

### Statistics Tracking

Coordinators track signature-related security events:

```javascript
const stats = coordinator.getStats();

console.log(stats);
// {
//   messagesReceived: 1234,
//   messagesSent: 567,
//   messagesRejected: 12,
//   signatureFailures: 8,
//   replayAttemptsBlocked: 4,
//   messageSigning: {
//     enabled: true,
//     configured: true,
//     stats: { ... }  // MessageSigner stats
//   }
// }
```

## Security Audit Trail

### Logging Security Events

```javascript
// Signature verification failure
await coordinator.logSecurityEvent('signature_verification_failed', {
  error: 'Invalid message signature',
  from: 'coordinator-2',
  messageId: '12345',
  messageType: 'request',
  timestamp: Date.now()
});

// Replay attack detected
await coordinator.logSecurityEvent('replay_attack_detected', {
  error: 'Timestamp drift exceeds maximum',
  from: 'coordinator-3',
  messageId: '67890',
  drift: 400000,
  maxDrift: 300000,
  timestamp: Date.now()
});
```

### Security Event Monitoring

```javascript
// Subscribe to security events
redis.subscribe('coordinator:security-events', (eventStr) => {
  const event = JSON.parse(eventStr);

  console.log('Security Event:', {
    coordinatorId: event.coordinatorId,
    eventType: event.eventType,
    details: event.details,
    timestamp: new Date(event.timestamp).toISOString()
  });

  // Alert on critical security events
  if (event.eventType === 'signature_verification_failed') {
    alertSecurityTeam(event);
  }
});
```

## Troubleshooting

### Secret Not Configured

**Error:**
```
COORDINATOR_SECRET environment variable not set
```

**Solution:**
1. Generate secret: `openssl rand -hex 32`
2. Add to `.env` or environment: `COORDINATOR_SECRET=your-secret-here`
3. Restart coordinator

### Secret Too Short

**Error:**
```
COORDINATOR_SECRET too short (16 chars). Minimum 32 characters required.
```

**Solution:**
Generate longer secret with sufficient entropy:
```bash
openssl rand -hex 32  # 64 hex chars = 32 bytes
```

### Signature Verification Failures

**Error:**
```
Invalid message signature
```

**Causes:**
1. **Mismatched secrets**: All coordinators must use the same secret
2. **Message tampering**: Message modified after signing
3. **Incorrect key version**: Coordinator using different key version

**Solution:**
1. Verify all coordinators have same `COORDINATOR_SECRET`
2. Check for middleware or proxies modifying messages
3. Ensure key rotation is properly coordinated

### Replay Attack Warnings

**Error:**
```
Message timestamp drift (400000ms) exceeds maximum (300000ms). Possible replay attack detected.
```

**Causes:**
1. **Clock skew**: Coordinator clocks out of sync
2. **Old message replay**: Attacker replaying captured messages
3. **Network delay**: Extreme network latency (>5 minutes)

**Solution:**
1. Synchronize coordinator clocks with NTP
2. Investigate suspicious message sources
3. Increase `COORDINATOR_MAX_TIMESTAMP_DRIFT_MS` if needed (not recommended)

### Performance Degradation

**Warning:**
```
[MessageSigner] Slow signature operation: 8ms (threshold: 5ms)
```

**Causes:**
1. **CPU overload**: High system load
2. **Large messages**: Messages exceeding typical size
3. **Nested data structures**: Deep object hierarchies

**Solution:**
1. Monitor CPU usage and scale coordinators
2. Reduce message payload size
3. Flatten data structures where possible

## Testing

### Running Tests

```bash
# Run comprehensive test suite (52 tests)
node tests/security/message-signer.test.js

# Expected output:
# ℹ tests 52
# ℹ pass 52
# ℹ fail 0
```

### Test Coverage

- **Initialization**: Secret validation, configuration
- **Signing**: Valid messages, deterministic signatures, property order independence
- **Verification**: Valid signatures, unsigned messages, invalid signatures
- **Tampering Detection**: Modified payloads, added/removed properties, nested data
- **Replay Prevention**: Recent timestamps, old timestamps, future timestamps
- **Key Rotation**: Seamless rotation, previous key verification
- **Performance**: Signing/verification speed, bulk operations
- **Statistics**: Operation tracking, failure rates, averages
- **Environment**: Configuration from environment variables

### Integration Testing

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DormantCoordinatorBase } from './tests/hello-world/lib/dormant-coordinator-base.js';

describe('Coordinator Message Authentication', () => {
  it('should reject unsigned messages', async () => {
    const env = { COORDINATOR_SECRET: 'test-secret-32-characters-long-enough' };
    const coordinator = new DormantCoordinatorBase('test-1', 'redis://localhost', { env });

    const unsigned = JSON.stringify({
      id: '123',
      type: 'request',
      from: 'test-2',
      timestamp: Date.now()
    });

    // Should reject unsigned message
    await coordinator.handleIncomingMessageWithValidation(unsigned);

    assert.strictEqual(coordinator.stats.signatureFailures, 1);
  });
});
```

## Production Deployment

### Checklist

- [ ] Generate production secret with `openssl rand -hex 32`
- [ ] Store secret in secrets manager (Vault/AWS Secrets Manager/K8s Secrets)
- [ ] Deploy secret to all coordinators via secure channel
- [ ] Enable message signing in production config
- [ ] Verify all coordinators show "Message signing ENABLED" in logs
- [ ] Monitor `signature_verification_failed` events
- [ ] Set up alerts for replay attacks
- [ ] Document key rotation procedures
- [ ] Schedule quarterly key rotation
- [ ] Audit security event logs

### Monitoring Metrics

**Key Metrics:**
- `signature_verification_failures_total`: Count of failed verifications
- `replay_attacks_blocked_total`: Count of replay attempts
- `message_sign_duration_ms`: Signing performance (p50, p95, p99)
- `message_verify_duration_ms`: Verification performance (p50, p95, p99)

**Alerts:**
- **Critical**: `signature_verification_failures` > 10/min (possible attack)
- **Warning**: `replay_attacks_blocked` > 5/min (clock skew or attack)
- **Info**: `message_sign_duration_ms_p99` > 5ms (performance degradation)

## References

- **VULN-003**: Message Spoofing/Coordinator Impersonation (CVSS 6.5)
- **RFC 2104**: HMAC: Keyed-Hashing for Message Authentication
- **FIPS 198-1**: The Keyed-Hash Message Authentication Code (HMAC)
- **NIST SP 800-107**: Recommendation for Applications Using Approved Hash Algorithms

## Related Documentation

- [Message Validation (VULN-002)](./message-validation.md)
- [Redis Authentication](./redis-authentication.md)
- [Security Best Practices](./security-best-practices.md)
- [Key Management](./key-management.md)
