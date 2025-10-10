# Security Hardening Recommendations - Message Bus

**Date**: 2025-10-03
**Based on**: SECURITY_AUDIT_PHASE3.md

---

## CRITICAL FIXES (Implement Immediately)

### 1. Payload Validation & Sanitization
```typescript
// Add to MessageBroker constructor
this.payloadValidator = new PayloadValidator({
  maxDepth: 5,
  maxSize: 1024 * 1024,  // 1MB
  forbiddenKeys: ['__proto__', 'constructor', 'prototype', 'eval', 'Function'],
  allowedTypes: ['string', 'number', 'boolean', 'object', 'array']
});

// Add to publish() method
const validationResult = await this.payloadValidator.validate(config.payload);
if (!validationResult.valid) {
  throw new MessageBrokerError(`Payload validation failed: ${validationResult.errors}`);
}
config.payload = this.payloadValidator.sanitize(config.payload);
```

### 2. Rate Limiting
```typescript
import { RateLimiter } from 'limiter';

// Add to MessageBroker
private rateLimiters: Map<string, RateLimiter> = new Map();

async publish(config: MessageConfig): Promise<Message> {
  const senderId = config.senderId || 'anonymous';
  const allowed = await this.checkRateLimit(senderId);
  if (!allowed) {
    throw new MessageBrokerError(`Rate limit exceeded for ${senderId}`);
  }
  // ... continue publish
}

private async checkRateLimit(senderId: string): Promise<boolean> {
  let limiter = this.rateLimiters.get(senderId);
  if (!limiter) {
    limiter = new RateLimiter({ tokensPerInterval: 100, interval: 'second' });
    this.rateLimiters.set(senderId, limiter);
  }
  const remaining = await limiter.removeTokens(1);
  return remaining >= 0;
}
```

### 3. Queue Overflow Protection
```typescript
interface MessageBrokerConfig {
  maxQueueSize: number;
  maxQueueSizePerSender: number;  // NEW: 100 default
  enableDeadLetterQueue: boolean;  // NEW: true default
  priorityEvictionThreshold: number;  // NEW: 0.9 default
}

// Add per-sender tracking
private senderQueueSizes: Map<string, number> = new Map();

async publish(config: MessageConfig): Promise<Message> {
  const senderId = config.senderId || 'anonymous';
  const senderQueueSize = this.senderQueueSizes.get(senderId) || 0;

  if (senderQueueSize >= this.config.maxQueueSizePerSender) {
    throw new MessageBrokerError(`Sender ${senderId} exceeded queue limit`);
  }

  if (this.messageQueue.length >= this.config.maxQueueSize) {
    const evicted = this.evictLowPriorityMessages(config.priority);
    if (evicted.length === 0) {
      throw new MessageBrokerError('Message queue full (no evictable messages)');
    }
  }

  // ... enqueue message
  this.senderQueueSizes.set(senderId, senderQueueSize + 1);
}
```

### 4. Subscription Limits
```typescript
interface MessageBrokerConfig {
  maxSubscriptions: number;  // NEW: 10000 default
  maxSubscriptionsPerAgent: number;  // NEW: 100 default
  subscriptionTTL: number;  // NEW: 3600000 (1 hour)
}

private agentSubscriptions: Map<string, Set<string>> = new Map();

async subscribe(config: SubscriptionConfig): Promise<Subscription> {
  if (this.stats.totalSubscriptions >= this.config.maxSubscriptions) {
    throw new MessageBrokerError('Maximum subscriptions reached');
  }

  const subscriberId = config.subscriberId || 'anonymous';
  const agentSubs = this.agentSubscriptions.get(subscriberId) || new Set();

  if (agentSubs.size >= this.config.maxSubscriptionsPerAgent) {
    throw new MessageBrokerError(`Subscriber ${subscriberId} exceeded subscription limit`);
  }

  // ... create subscription with TTL
  const internalSub: InternalSubscription = {
    // ...
    expiresAt: Date.now() + this.config.subscriptionTTL
  };

  agentSubs.add(subscriptionId);
  this.agentSubscriptions.set(subscriberId, agentSubs);
}
```

---

## HIGH-PRIORITY FIXES (Implement Within 7 Days)

### 5. Cryptographic Correlation IDs
```typescript
import crypto from 'crypto';

static generateCorrelationId(): string {
  const randomBytes = crypto.randomBytes(16);
  const hmac = crypto.createHmac('sha256', process.env.MESSAGE_SECRET || 'default-secret');
  hmac.update(randomBytes);
  return `corr-${Date.now()}-${hmac.digest('hex').substr(0, 16)}`;
}

// Add HMAC signature validation for replies
private signReply(correlationId: string, originalSender: string): string {
  const hmac = crypto.createHmac('sha256', process.env.MESSAGE_SECRET || 'default-secret');
  hmac.update(`${correlationId}:${originalSender}`);
  return hmac.digest('hex');
}
```

### 6. Channel Access Control Enforcement
```typescript
async sendMessage(
  type: string,
  content: any,
  sender: AgentId,
  receivers: AgentId | AgentId[],
  options: { channel?: string } = {}
): Promise<string> {
  if (options.channel) {
    const channel = this.channels.get(options.channel);
    if (!channel) {
      throw new Error(`Channel ${options.channel} not found`);
    }

    // Validate sender write permission
    if (!this.canSendToChannel(channel, sender)) {
      throw new Error(`Sender ${sender.id} not authorized to send to channel`);
    }

    // Validate receiver read permissions
    const receiversArray = Array.isArray(receivers) ? receivers : [receivers];
    for (const receiver of receiversArray) {
      if (!this.canReceiveFromChannel(channel, receiver)) {
        throw new Error(`Receiver ${receiver.id} not authorized to receive from channel`);
      }
    }
  }

  // ... proceed
}
```

### 7. Channel Isolation (Cross-Channel Leak Prevention)
```typescript
interface SubscriptionHandler {
  // ...
  channelId?: string;  // NEW: Bind subscription to specific channel
}

private async routeMessage(message: Message): Promise<void> {
  const matchedTopicIds = this.topicManager.match(message.topic);

  // CRITICAL: Filter handlers by channel boundary
  const matchedHandlers = matchedTopicIds
    .map(id => this.handlers.get(id))
    .filter((h): h is SubscriptionHandler => h !== undefined)
    .filter(h => {
      // If subscription is channel-bound, check message channel
      if (h.channelId) {
        return message.metadata?.channelId === h.channelId;
      }
      // Global subscriptions receive all
      return true;
    })
    .sort((a, b) => b.priority - a.priority);

  // ... deliver
}
```

### 8. Resource Exhaustion Protection
```typescript
interface MessageBrokerConfig {
  maxMessageSize: number;  // Per-message (1MB default)
  maxCumulativeSizePerSender: number;  // NEW: 10MB default
  maxTotalQueueSize: number;  // NEW: 100MB default
}

private senderCumulativeSizes: Map<string, number> = new Map();
private totalQueueSize: number = 0;

async publish(config: MessageConfig): Promise<Message> {
  const messageSize = JSON.stringify(config.payload).length;

  // Check per-message size
  if (messageSize > this.config.maxMessageSize) {
    throw new MessageBrokerError('Message size exceeds limit');
  }

  // Check cumulative sender size
  const senderSize = this.senderCumulativeSizes.get(senderId) || 0;
  if (senderSize + messageSize > this.config.maxCumulativeSizePerSender) {
    throw new MessageBrokerError('Sender cumulative size exceeds limit');
  }

  // Check total queue size
  if (this.totalQueueSize + messageSize > this.config.maxTotalQueueSize) {
    const freed = this.evictToMakeRoom(messageSize);
    if (freed < messageSize) {
      throw new MessageBrokerError('Total queue size limit exceeded');
    }
  }

  // Update tracking
  this.senderCumulativeSizes.set(senderId, senderSize + messageSize);
  this.totalQueueSize += messageSize;

  // ... create message
}
```

### 9. Pending Request Cleanup
```typescript
interface MessageBrokerConfig {
  maxPendingRequests: number;  // NEW: 1000 default
  maxPendingRequestAge: number;  // NEW: 300000 (5 min)
}

private startPendingRequestCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    for (const [correlationId, pending] of this.pendingRequests.entries()) {
      if (now - pending.createdAt > this.config.maxPendingRequestAge) {
        if (!pending.resolved) {
          pending.resolved = true;
          clearTimeout(pending.timeoutId);
          pending.reject(new MessageBrokerError('Request expired'));
          this.pendingRequests.delete(correlationId);
        }
      }
    }
  }, 30000);
}
```

---

## RECOMMENDED CONFIGURATION

```typescript
const secureBrokerConfig: MessageBrokerConfig = {
  // Queue management
  maxQueueSize: 10000,
  maxQueueSizePerSender: 100,
  enableDeadLetterQueue: true,
  priorityEvictionThreshold: 0.9,

  // Rate limiting
  rateLimit: {
    maxMessagesPerSecond: 100,
    maxBurstSize: 10,
    strategy: 'token-bucket'
  },

  // Payload validation
  maxMessageSize: 1024 * 1024,  // 1MB
  maxCumulativeSizePerSender: 10 * 1024 * 1024,  // 10MB
  maxTotalQueueSize: 100 * 1024 * 1024,  // 100MB
  payloadValidation: {
    maxDepth: 5,
    forbiddenKeys: ['__proto__', 'constructor', 'prototype']
  },

  // Subscriptions
  maxSubscriptions: 10000,
  maxSubscriptionsPerAgent: 100,
  subscriptionTTL: 3600000,  // 1 hour

  // Request/reply
  maxPendingRequests: 1000,
  maxPendingRequestAge: 300000,  // 5 minutes
  defaultRequestTimeout: 30000,

  // Authorization
  authorizationProvider: new DefaultAuthProvider(),

  // Monitoring
  enableStats: true,
  metricsEnabled: true
};

const broker = new MessageBroker(secureBrokerConfig);
```

---

## MONITORING & ALERTING

### Critical Metrics to Monitor
```typescript
interface SecurityMetrics {
  // Rate limiting
  rateLimitExceeded: number;
  rateLimitExceededBySender: Map<string, number>;

  // Queue health
  queueUtilization: number;  // % of maxQueueSize
  queueEvictions: number;
  deadLetterQueueSize: number;

  // Resource usage
  totalMemoryUsage: number;
  subscriptionCount: number;
  pendingRequestCount: number;

  // Security events
  validationFailures: number;
  unauthorizedAccess: number;
  channelIsolationViolations: number;
}

// Alert thresholds
const alerts = {
  queueUtilization: 0.8,  // Alert at 80% capacity
  rateLimitExceededThreshold: 10,  // Alert after 10 violations
  memoryUsageThreshold: 0.9,  // Alert at 90% memory
  validationFailureRate: 0.05  // Alert at 5% failure rate
};
```

### Prometheus Metrics Export
```typescript
class MessageBrokerMetrics {
  registerPrometheusMetrics(): void {
    const register = new prometheus.Registry();

    const queueSize = new prometheus.Gauge({
      name: 'message_broker_queue_size',
      help: 'Current message queue size',
      registers: [register]
    });

    const rateLimitViolations = new prometheus.Counter({
      name: 'message_broker_rate_limit_violations_total',
      help: 'Total rate limit violations',
      labelNames: ['sender_id'],
      registers: [register]
    });

    const payloadValidationFailures = new prometheus.Counter({
      name: 'message_broker_validation_failures_total',
      help: 'Total payload validation failures',
      labelNames: ['error_type'],
      registers: [register]
    });

    // Update metrics in real-time
    this.on('queue:size', size => queueSize.set(size));
    this.on('rate-limit:exceeded', data =>
      rateLimitViolations.inc({ sender_id: data.senderId })
    );
    this.on('validation:failed', data =>
      payloadValidationFailures.inc({ error_type: data.type })
    );
  }
}
```

---

## TESTING REQUIREMENTS

### Security Test Suite
```typescript
describe('Message Bus Security', () => {
  describe('SEC-INJ-001: Payload Injection', () => {
    it('should reject prototype pollution attempts');
    it('should reject oversized payloads');
    it('should reject deeply nested objects');
    it('should sanitize dangerous keys');
  });

  describe('SEC-DOS-001: Queue Overflow', () => {
    it('should enforce per-sender queue limit');
    it('should evict low-priority messages when full');
    it('should move evicted messages to dead letter queue');
  });

  describe('SEC-DOS-002: Rate Limiting', () => {
    it('should enforce per-sender rate limit');
    it('should allow burst then throttle');
    it('should cleanup idle rate limiters');
  });

  describe('SEC-MEM-001: Subscription Limits', () => {
    it('should enforce global subscription limit');
    it('should enforce per-agent subscription limit');
    it('should auto-expire inactive subscriptions');
  });

  describe('SEC-ISO-002: Channel Isolation', () => {
    it('should prevent cross-channel message leakage');
    it('should allow global subscriptions to receive all channels');
  });
});
```

### Fuzzing Tests
```typescript
describe('Fuzz Testing', () => {
  it('should handle 100K random payloads', async () => {
    for (let i = 0; i < 100000; i++) {
      const randomPayload = generateRandomPayload();
      try {
        await broker.publish({ topic: 'fuzz', payload: randomPayload });
      } catch (error) {
        // Expected for invalid payloads
      }
    }
    // System should remain stable
    expect(broker.getQueueSize()).toBeLessThan(10000);
  });

  it('should handle malformed topic patterns', async () => {
    const malformedTopics = [
      '../../../etc/passwd',
      'topic\x00null',
      'a'.repeat(1000),
      '***',
      'topic; DROP TABLE messages;'
    ];

    for (const topic of malformedTopics) {
      await expect(broker.publish({ topic, payload: {} }))
        .rejects.toThrow();
    }
  });
});
```

---

## DEPLOYMENT CHECKLIST

- [ ] **Code Review**: Security team approval
- [ ] **Testing**: 95%+ coverage on security paths
- [ ] **Fuzzing**: 100K random payloads tested
- [ ] **Load Testing**: 10K msg/s sustained for 1 hour
- [ ] **Monitoring**: Prometheus metrics enabled
- [ ] **Alerting**: PagerDuty integration configured
- [ ] **Documentation**: Security runbook updated
- [ ] **Incident Response**: Security escalation paths defined
- [ ] **Rollback Plan**: Revert procedure documented
- [ ] **Environment Variables**: MESSAGE_SECRET configured

---

## INCIDENT RESPONSE

### Detected Attack Indicators
1. **Rate Limit Violations**: >10/min from single sender
2. **Validation Failures**: >5% of total messages
3. **Queue Saturation**: >90% capacity for >5 minutes
4. **Memory Spike**: >90% heap usage
5. **Unauthorized Access**: Any channel access violation

### Response Procedures
```typescript
class SecurityIncidentHandler {
  async handleRateLimitViolation(senderId: string): Promise<void> {
    // 1. Ban sender temporarily
    this.banSender(senderId, 3600000);  // 1 hour

    // 2. Alert security team
    this.alertSecurityTeam({
      type: 'RATE_LIMIT_VIOLATION',
      senderId,
      timestamp: Date.now()
    });

    // 3. Audit sender's recent activity
    const recentMessages = this.getMessagesBySender(senderId, 3600000);
    this.auditMessages(recentMessages);
  }

  async handleChannelViolation(senderId: string, channelId: string): Promise<void> {
    // 1. Immediate ban
    this.banSender(senderId, 86400000);  // 24 hours

    // 2. Critical alert
    this.alertSecurityTeam({
      type: 'CHANNEL_ISOLATION_VIOLATION',
      severity: 'CRITICAL',
      senderId,
      channelId,
      timestamp: Date.now()
    });

    // 3. Force disconnect
    this.disconnectAgent(senderId);
  }
}
```

---

**Document Version**: 1.0
**Last Updated**: 2025-10-03
**Next Review**: 2025-10-10
