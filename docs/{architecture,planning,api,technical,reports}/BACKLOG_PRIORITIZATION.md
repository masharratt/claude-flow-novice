# Enterprise Coordination - Prioritized Backlog

**Generated:** October 12, 2025
**Source:** Enterprise Coordination Final Report
**Total Items:** 10
**Total Effort:** 90 hours

---

## Priority Matrix

| Priority | Items | Total Hours | Timeline | Blocks Deployment |
|----------|-------|-------------|----------|-------------------|
| **P0 (CRITICAL)** | 3 | 26 | 3-4 days | ✅ YES |
| **P1 (HIGH)** | 6 | 48 | 6-7 days | ⚠️ PARTIAL |
| **P2 (MEDIUM)** | 1 | 8 | 1 day | ❌ NO |

---

## P0: CRITICAL (BLOCKS PRODUCTION) - 26 hours

### 1. Redis Authentication [8 hours] 🔴
**Issue:** No authentication on Redis connections (VULN-001, CVSS 8.5)
**Impact:** Unauthorized access to coordination data, work stealing, message injection
**Blocks:** Layers 1-3 Realistic production deployment

**Tasks:**
- [ ] Add `REDIS_PASSWORD` to `.env.example`
- [ ] Update all Redis clients to use `password: process.env.REDIS_PASSWORD`
- [ ] Configure Redis server with `requirepass` in redis.conf
- [ ] Test authentication across all coordinators
- [ ] Document Redis auth setup in deployment guide

**Files to Modify:**
- `tests/hello-world/lib/redis-client.js`
- `src/cli/utils/secure-redis-client.js`
- All coordinator files using Redis

**Acceptance Criteria:**
- All Redis connections require authentication
- Unauthorized connections rejected
- No hardcoded passwords in code

---

### 2. JSON Schema Validation [12 hours] 🔴
**Issue:** Unsafe JSON deserialization (VULN-002, CVSS 7.8)
**Impact:** Prototype pollution, DoS, potential RCE
**Blocks:** Layers 1-3 Realistic production deployment

**Tasks:**
- [ ] Install `ajv` library: `npm install ajv`
- [ ] Define JSON schemas for all message types (request, response, error, heartbeat)
- [ ] Add validation in `handleIncomingMessage()` for all coordinators
- [ ] Implement prototype pollution detection
- [ ] Add payload size limits (max 1MB per message)
- [ ] Test with malformed payloads
- [ ] Document schema validation in security guide

**Schemas Required:**
```javascript
const requestSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    type: { type: 'string', enum: ['request', 'response', 'error', 'heartbeat'] },
    from: { type: 'string', minLength: 1, maxLength: 100 },
    to: { type: 'string', minLength: 1, maxLength: 100 },
    task: { type: 'string', minLength: 1, maxLength: 100 },
    correlationId: { type: 'string', format: 'uuid' },
    timestamp: { type: 'number', minimum: 0 },
    data: { type: 'object' }
  },
  required: ['id', 'type', 'from', 'to', 'timestamp'],
  additionalProperties: false
};
```

**Files to Modify:**
- `tests/hello-world/lib/dormant-coordinator-base.js`
- All coordinator `handleIncomingMessage()` methods

**Acceptance Criteria:**
- All messages validated against schemas
- Invalid messages rejected with error log
- No prototype pollution possible
- Payload size enforced

---

### 3. Coordinator HMAC Authentication [6 hours] 🔴
**Issue:** No coordinator authentication (VULN-003, CVSS 6.5)
**Impact:** Message spoofing, coordinator impersonation
**Blocks:** Layer 3 Dormant production deployment (optional for Layers 1-3)

**Tasks:**
- [ ] Add `COORDINATOR_SECRET` to `.env.example`
- [ ] Implement HMAC-SHA256 signing in `sendRequest()` and `sendResponse()`
- [ ] Add signature verification in `handleIncomingMessage()`
- [ ] Reject unsigned messages
- [ ] Test with spoofed messages
- [ ] Document HMAC setup in security guide

**Implementation:**
```javascript
const crypto = require('crypto');

function signMessage(message, secret) {
  const payload = JSON.stringify(message);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return { ...message, signature };
}

function verifyMessage(message, secret) {
  const { signature, ...payload } = message;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return signature === expected;
}
```

**Files to Modify:**
- `tests/hello-world/lib/dormant-coordinator-base.js` (sendRequest, sendResponse, handleIncomingMessage)

**Acceptance Criteria:**
- All messages signed with HMAC-SHA256
- Unsigned messages rejected
- Spoofed messages detected

---

## P1: HIGH (IMPORTANT) - 48 hours

### 4. Rate Limiting & Queue Bounds [8 hours] 🟡
**Issue:** Denial of Service via queue flooding (VULN-004, CVSS 7.5)
**Impact:** Memory exhaustion, coordinator crash

**Tasks:**
- [ ] Implement MAX_QUEUE_SIZE: 1000 requests
- [ ] Add rate limiting: 100 requests/min per sender
- [ ] Add queue overflow error handling
- [ ] Test with queue flooding attacks
- [ ] Add monitoring for queue depth

**Implementation:**
```javascript
class DormantCoordinator {
  constructor() {
    this.requestQueue = [];
    this.MAX_QUEUE_SIZE = 1000;
    this.rateLimits = new Map(); // sender -> { count, resetTime }
  }

  async handleRequest(message) {
    // Rate limiting
    const sender = message.from;
    const now = Date.now();
    const limit = this.rateLimits.get(sender) || { count: 0, resetTime: now + 60000 };

    if (now > limit.resetTime) {
      limit.count = 0;
      limit.resetTime = now + 60000;
    }

    if (limit.count >= 100) {
      throw new Error(`Rate limit exceeded for ${sender}`);
    }

    limit.count++;
    this.rateLimits.set(sender, limit);

    // Queue bounds
    if (this.requestQueue.length >= this.MAX_QUEUE_SIZE) {
      throw new Error(`Queue full (${this.MAX_QUEUE_SIZE})`);
    }

    this.requestQueue.push(message);
  }
}
```

---

### 5. Secure Error Logging [8 hours] 🟡
**Issue:** Information disclosure via error logging (VULN-005, CVSS 5.3)
**Impact:** File paths, credentials exposed in logs

**Tasks:**
- [ ] Remove sensitive data from error logs
- [ ] Implement secure audit log system
- [ ] Add error sanitization utility
- [ ] Test information disclosure scenarios
- [ ] Document secure logging practices

---

### 6. Optimize Agent Execution [8 hours] 🟡
**Issue:** Performance 4-9x slower than expected (Layer 3 Dormant)
**Impact:** Timeout issues, poor user experience

**Tasks:**
- [ ] Enable parallel agent execution (`Promise.all()`)
- [ ] Reduce agent spawn overhead (3000ms → 500ms)
- [ ] Implement agent pooling
- [ ] Profile and optimize bottlenecks
- [ ] Test with 70-file workload

---

### 7. Increase Coordinator Timeout [2 hours] 🟡
**Issue:** Timeout at 120s (Layer 3 Dormant)
**Impact:** Tests fail before completion

**Tasks:**
- [ ] Change heartbeat timeout from 120s to 600s
- [ ] Update test timeout configuration
- [ ] Document timeout hierarchy
- [ ] Test with full 70-file workload

---

### 8. Complete E2E Validation [8 hours] 🟡
**Issue:** Layer 3 Dormant incomplete (33/70 files)
**Impact:** Unvalidated pause/resume mechanism

**Tasks:**
- [ ] Run full-cycle test (70/70 files)
- [ ] Validate pause/resume state transitions
- [ ] Test dormant → active → paused → active → dormant flow
- [ ] Document E2E test results

---

### 9. Test Crash Recovery [8 hours] 🟡
**Issue:** Crash recovery untested (Layer 3 Dormant)
**Impact:** Unknown behavior on coordinator death

**Tasks:**
- [ ] Kill coordinator mid-run
- [ ] Verify graceful degradation
- [ ] Test work redistribution
- [ ] Validate no data loss
- [ ] Document recovery behavior

---

## P2: MEDIUM (NICE TO HAVE) - 8 hours

### 10. Scale Testing [8 hours] 🟢
**Issue:** Only tested with 2-3 coordinators
**Impact:** Unknown scalability limits

**Tasks:**
- [ ] Test with 10+ coordinators
- [ ] Measure Redis message throughput
- [ ] Check for coordination overhead
- [ ] Profile performance at scale
- [ ] Document scalability limits

---

## Execution Plan

### Sprint 1.2: Security Hardening (P0) - 26 hours (3-4 days)

**Week 1, Days 1-4:**
- Day 1-2: Redis Authentication (8h)
- Day 2-3: JSON Schema Validation (12h)
- Day 4: Coordinator HMAC Authentication (6h)

**Outcome:** Layers 1-3 Realistic ready for production deployment

---

### Sprint 2.2: Performance & Validation (P1) - 32 hours (4-5 days)

**Week 2, Days 1-5:**
- Day 1: Rate Limiting & Queue Bounds (8h)
- Day 2: Secure Error Logging (8h)
- Day 3: Optimize Agent Execution (8h)
- Day 4: Complete E2E Validation (8h)
- Day 5: Test Crash Recovery (8h)

**Outcome:** Layer 3 Dormant validated and ready for production

---

### Sprint 2.3: Scale Testing (P2) - 8 hours (1 day)

**Week 3, Day 1:**
- Day 1: Scale Testing (8h)

**Outcome:** Scalability limits documented

---

## Timeline Summary

| Sprint | Priority | Hours | Days | Outcome |
|--------|----------|-------|------|---------|
| **Sprint 1.2** | P0 (CRITICAL) | 26 | 3-4 | **Layers 1-3 production-ready** |
| **Sprint 2.2** | P1 (HIGH) | 32 | 4-5 | Layer 3 Dormant production-ready |
| **Sprint 2.3** | P2 (MEDIUM) | 8 | 1 | Scalability validated |
| **TOTAL** | - | **66** | **8-10** | All patterns production-ready |

---

## Dependencies

```
Sprint 1.2 (P0) → Sprint 2.2 (P1) → Sprint 2.3 (P2)
     ↓
Layers 1-3 Deployable
     ↓
Sprint 2.2 completes
     ↓
Layer 3 Dormant Deployable
     ↓
Sprint 2.3 completes
     ↓
Full Enterprise Scale Validated
```

---

## Risk Assessment

| Item | Risk Level | Mitigation |
|------|------------|------------|
| Redis Auth | LOW | Straightforward config change |
| JSON Validation | MEDIUM | Complex schemas, thorough testing needed |
| HMAC Auth | MEDIUM | Crypto implementation, key management |
| Rate Limiting | LOW | Standard pattern, well-documented |
| Performance | HIGH | Requires profiling, may need architecture changes |
| E2E Validation | MEDIUM | Depends on performance fixes |
| Crash Recovery | HIGH | Complex failure scenarios, hard to reproduce |
| Scale Testing | LOW | Standard load testing |

**Highest Risk Items:**
1. Performance Optimization (8h, HIGH risk)
2. Crash Recovery Testing (8h, HIGH risk)

**Contingency:** Allocate +50% time buffer (4h per high-risk item)

---

## Success Criteria

**Sprint 1.2 (P0) Complete When:**
- ✅ All Redis connections require authentication
- ✅ All messages validated against JSON schemas
- ✅ All messages signed with HMAC-SHA256
- ✅ Security audit re-run shows 0 CRITICAL vulnerabilities
- ✅ Layers 1-3 Realistic pass all tests

**Sprint 2.2 (P1) Complete When:**
- ✅ Rate limiting enforced (100 req/min)
- ✅ Queue bounds enforced (MAX_QUEUE_SIZE: 1000)
- ✅ Error logging sanitized (no sensitive data)
- ✅ Layer 3 Dormant generates 70/70 files without timeout
- ✅ Pause/resume mechanism validated
- ✅ Crash recovery tested (graceful degradation confirmed)

**Sprint 2.3 (P2) Complete When:**
- ✅ 10+ coordinators tested successfully
- ✅ Scalability limits documented
- ✅ Performance benchmarks meet targets

---

## Next Action

**START HERE:** Sprint 1.2, Item 1 - Redis Authentication (8 hours)

```bash
# 1. Create security branch
git checkout -b sprint-1.2-security-hardening

# 2. Add Redis password to .env.example
echo "REDIS_PASSWORD=your-secure-password-here" >> .env.example

# 3. Begin implementation
# (Next step: Update redis-client.js to use REDIS_PASSWORD)
```

**After Sprint 1.2 Complete:**
- Re-run security audit
- Deploy Layers 1-3 Realistic to staging
- Begin Sprint 2.2

---

**Backlog Status:** PRIORITIZED ✅
**Next Sprint:** Sprint 1.2 (Security Hardening)
**Estimated Completion:** 3-4 days for production-ready Layers 1-3
