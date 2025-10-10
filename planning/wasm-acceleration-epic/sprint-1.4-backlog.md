# Sprint 1.4 Backlog - Event Bus Circuit Breaker

**Created:** 2025-10-10
**Source:** Sprint 1.2 Condition #2 (deferred from Sprint 1.3)
**Objective:** Implement resilience enhancements for production coordination system

---

## Sprint Context

**Sprint 1.2 Condition #2:** Add Event Bus circuit breaker for high-priority events
**Sprint 1.3 Status:** Deferred (correctly scoped out per architect recommendation)
**Sprint 1.3.1 Status:** Complete (memory leak fixed with Drop trait)

**Production Readiness:**
- Sprint 1.2: 40x performance (398k events/sec) ✅
- Sprint 1.3: WASM deserialization + ADRs ✅
- Sprint 1.3.1: Memory cleanup (Drop trait) ✅
- Sprint 1.4: Resilience (circuit breaker) ⏳

---

## Priority 1: Event Bus Circuit Breaker (IN-SCOPE)

### Feature: Circuit Breaker Pattern

**Priority:** HIGH (Sprint 1.2 Condition #2)
**Effort:** 4 hours
**Target File:** `src/coordination/event-bus/qe-event-bus.js`

**Requirements:**

1. **Failure Detection:**
   - Monitor event processing failure rate
   - Track consecutive failures per event type
   - Threshold: 5 consecutive failures triggers OPEN state

2. **Circuit States:**
   - **CLOSED:** Normal operation, all events processed
   - **OPEN:** Circuit tripped, reject events (except priority 8-9)
   - **HALF-OPEN:** Testing recovery, allow limited events

3. **State Transitions:**
   - CLOSED → OPEN: After 5 consecutive failures
   - OPEN → HALF-OPEN: After 30 second timeout
   - HALF-OPEN → CLOSED: After 3 successful events
   - HALF-OPEN → OPEN: On any failure

4. **Priority Bypass:**
   - Priority 8-9 events ALWAYS bypass circuit breaker
   - Critical coordination messages (CFN Loop, swarm lifecycle)
   - Ensures system can recover even when circuit open

5. **Metrics:**
   - Circuit state changes (CLOSED/OPEN/HALF-OPEN)
   - Events rejected by circuit
   - Recovery attempts (HALF-OPEN → CLOSED)
   - Bypass events processed

### Implementation Details

**File:** `src/coordination/event-bus/qe-event-bus.js`

**Add Circuit Breaker State:**
```javascript
class QEEventBus {
  constructor(config) {
    // Existing config...

    // Circuit breaker state
    this.circuitBreaker = {
      state: 'CLOSED', // CLOSED | OPEN | HALF-OPEN
      consecutiveFailures: 0,
      failureThreshold: 5,
      recoveryTimeout: 30000, // 30 seconds
      halfOpenSuccesses: 0,
      halfOpenThreshold: 3,
      lastStateChange: Date.now(),
      openedAt: null
    };

    // Circuit breaker metrics
    this.metrics.circuitState = 'CLOSED';
    this.metrics.circuitOpens = 0;
    this.metrics.eventsRejected = 0;
    this.metrics.bypassEvents = 0;
    this.metrics.recoveryAttempts = 0;
  }
}
```

**Add Priority Check:**
```javascript
isHighPriority(event) {
  // Priority 8-9 events bypass circuit breaker
  return event.priority >= 8;
}
```

**Add Circuit Breaker Logic:**
```javascript
async processEvent(event) {
  // Check circuit breaker (priority 8-9 bypass)
  if (!this.isHighPriority(event)) {
    const canProcess = this.checkCircuit();
    if (!canProcess) {
      this.metrics.eventsRejected++;
      throw new Error(`Circuit breaker OPEN - event rejected: ${event.type}`);
    }
  } else {
    this.metrics.bypassEvents++;
  }

  try {
    // Existing event processing logic...
    const result = await this.processEventInternal(event);

    // Success: reset consecutive failures
    this.recordSuccess();
    return result;
  } catch (error) {
    // Failure: increment consecutive failures
    this.recordFailure(error);
    throw error;
  }
}
```

**Circuit Breaker State Machine:**
```javascript
checkCircuit() {
  const now = Date.now();

  switch (this.circuitBreaker.state) {
    case 'CLOSED':
      return true; // Allow all events

    case 'OPEN':
      // Check if recovery timeout elapsed
      const timeOpen = now - this.circuitBreaker.openedAt;
      if (timeOpen >= this.circuitBreaker.recoveryTimeout) {
        this.transitionTo('HALF-OPEN');
        this.metrics.recoveryAttempts++;
        return true; // Allow limited testing
      }
      return false; // Reject events

    case 'HALF-OPEN':
      return true; // Allow events for testing

    default:
      return true;
  }
}

recordSuccess() {
  switch (this.circuitBreaker.state) {
    case 'CLOSED':
      this.circuitBreaker.consecutiveFailures = 0;
      break;

    case 'HALF-OPEN':
      this.circuitBreaker.halfOpenSuccesses++;
      if (this.circuitBreaker.halfOpenSuccesses >= this.circuitBreaker.halfOpenThreshold) {
        this.transitionTo('CLOSED');
      }
      break;
  }
}

recordFailure(error) {
  this.circuitBreaker.consecutiveFailures++;

  switch (this.circuitBreaker.state) {
    case 'CLOSED':
      if (this.circuitBreaker.consecutiveFailures >= this.circuitBreaker.failureThreshold) {
        this.transitionTo('OPEN');
      }
      break;

    case 'HALF-OPEN':
      // Any failure in HALF-OPEN immediately opens circuit
      this.transitionTo('OPEN');
      break;
  }
}

transitionTo(newState) {
  const oldState = this.circuitBreaker.state;
  this.circuitBreaker.state = newState;
  this.circuitBreaker.lastStateChange = Date.now();

  if (newState === 'OPEN') {
    this.circuitBreaker.openedAt = Date.now();
    this.metrics.circuitOpens++;
  } else if (newState === 'HALF-OPEN') {
    this.circuitBreaker.halfOpenSuccesses = 0;
  } else if (newState === 'CLOSED') {
    this.circuitBreaker.consecutiveFailures = 0;
    this.circuitBreaker.halfOpenSuccesses = 0;
  }

  this.metrics.circuitState = newState;
  console.log(`🔌 Circuit breaker: ${oldState} → ${newState}`);
}
```

### Success Criteria

- ✅ Circuit breaker state machine implemented (CLOSED/OPEN/HALF-OPEN)
- ✅ Opens after 5 consecutive failures
- ✅ Half-open recovery testing after 30 seconds
- ✅ Priority 8-9 events bypass circuit breaker
- ✅ Metrics track circuit state changes and rejections
- ✅ Load test validates recovery behavior
- ✅ Post-edit hook passes
- ✅ Integration tests cover all state transitions

---

## Priority 2: Production Monitoring (OUT-OF-SCOPE)

**Deferred to Sprint 1.5 per reviewer recommendation**

### Enhancement 3.2: Production Performance Monitoring

**Priority:** LOW
**Effort:** 2 hours
**Status:** Deferred to Sprint 1.5

**Rationale:**
- Circuit breaker is Sprint 1.2 condition (blocking)
- Performance monitoring is nice-to-have (non-blocking)
- Sprint 1.4 focuses on resilience over observability

---

## Sprint 1.4 Execution Plan

### Loop 3 Agents (Estimated: 4 hours)

1. **coder-circuit-breaker** (3 hours)
   - Implement circuit breaker state machine
   - Add priority bypass logic
   - Add metrics tracking
   - Estimated confidence: 0.90

2. **tester-circuit-breaker** (1 hour)
   - Create integration tests for circuit breaker
   - Test all state transitions (CLOSED → OPEN → HALF-OPEN → CLOSED)
   - Test priority bypass (events 8-9)
   - Load test recovery behavior
   - Estimated confidence: 0.92

### Loop 2 Validators

1. **reviewer** - Code quality and error handling validation
2. **architect** - Resilience pattern validation

### Target Consensus

**Loop 2 Target:** ≥0.90 (production deployment threshold)
**Expected:** 0.92 (well-defined pattern, clear requirements)

---

## Sprint 1.4 Success Criteria

- ✅ Circuit breaker implemented per Sprint 1.2 Condition #2
- ✅ All state transitions validated (CLOSED/OPEN/HALF-OPEN)
- ✅ Priority 8-9 bypass operational
- ✅ Recovery behavior validated (30s timeout, 3 successes)
- ✅ Integration tests passing (6/6 scenarios)
- ✅ Load test validates recovery under sustained failures
- ✅ Consensus ≥0.90 from Loop 2 validators
- ✅ Sprint 1.2 Condition #2: COMPLETE

---

## Sprint 1.2 Conditions Final Status (Post-Sprint 1.4)

1. **Condition #1 (ADRs):** ✅ COMPLETE (Sprint 1.3)
2. **Condition #2 (Circuit breaker):** ✅ COMPLETE (Sprint 1.4)
3. **Condition #3 (Memory cleanup):** ✅ COMPLETE (Sprint 1.3.1)

**All Sprint 1.2 conditions satisfied** → WASM Acceleration Epic ready for production deployment

---

## Notes

**CFN Loop Protocol:**
- Auto-launch Sprint 1.4 per autonomous execution rules
- No permission required (defined in Sprint 1.3 backlog)
- DEFER decision pattern: approve deliverables, execute remaining work

**Estimated Duration:** 4 hours (single day with parallel execution)

**Risk Assessment:** LOW
- Well-defined circuit breaker pattern
- Clear state machine implementation
- Priority bypass is straightforward
- High confidence in completion

**Post-Sprint 1.4:**
- Sprint 1.5: Production monitoring (optional enhancement)
- Epic complete: All sprint conditions satisfied
- Production deployment: Full WASM acceleration system operational
