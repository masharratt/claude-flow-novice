/**
 * Event Bus Circuit Breaker Integration Tests
 * Sprint 1.4: Circuit Breaker Implementation & Validation
 *
 * Test Coverage:
 * 1. Normal Operation (CLOSED state)
 * 2. Circuit Opens After 5 Failures
 * 3. Open Circuit Rejects Events
 * 4. Priority 8-9 Bypass Circuit
 * 5. Half-Open Recovery
 * 6. Half-Open Failure Re-Opens Circuit
 *
 * Circuit Breaker States:
 * - CLOSED: Normal operation, all events processed
 * - OPEN: Circuit tripped, reject events (except priority 8-9)
 * - HALF-OPEN: Testing recovery, allow limited events
 *
 * State Transitions:
 * - CLOSED → OPEN: 5 consecutive failures
 * - OPEN → HALF-OPEN: 30 second timeout
 * - HALF-OPEN → CLOSED: 3 successful events
 * - HALF-OPEN → OPEN: Any failure
 *
 * Priority Bypass:
 * - Priority 8-9 events ALWAYS bypass circuit breaker
 * - Used for critical CFN Loop coordination
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { QEEventBus } from '../../src/coordination/event-bus/qe-event-bus.js';

// Test results for confidence scoring
const testResults = {
  normalOperation: null,
  circuitOpens: null,
  circuitRejects: null,
  priorityBypass: null,
  halfOpenRecovery: null,
  halfOpenFailure: null,
  confidence: 0
};

describe('Event Bus Circuit Breaker Integration', () => {
  let eventBus;

  beforeEach(async () => {
    // Create fresh event bus with short recovery timeout for testing
    eventBus = new QEEventBus({
      throughputTarget: 10000,
      latencyTarget: 50,
      workerThreads: 4,
      batchSize: 100,
      enableWASM: false, // Disable WASM for predictable testing
      failureThreshold: 5,      // Open circuit after 5 failures
      recoveryTimeout: 100       // 100ms for testing (30s in production)
    });

    await eventBus.initialize();
  });

  afterEach(async () => {
    if (eventBus) {
      // Clear priority queues to avoid shutdown errors with open circuit
      eventBus.priorityQueues.forEach(queue => queue.length = 0);
      eventBus.eventBatch.length = 0;

      await eventBus.shutdown();
    }
  });

  describe('Test 1: Normal Operation (CLOSED state)', () => {
    it('should process events normally when circuit is CLOSED', async () => {
      const result = {
        eventsProcessed: 0,
        state: null,
        consecutiveFailures: 0,
        passed: false
      };

      try {
        // Subscribe to events
        let eventsReceived = 0;
        eventBus.subscribe('agent\\..*', (event) => {
          eventsReceived++;
        });

        // Process 10 normal events (using valid event type pattern)
        for (let i = 0; i < 10; i++) {
          await eventBus.publish(`agent.test.event.${i}`, { id: i, data: `test_${i}` }, {
            priority: 5
          });
        }

        // Allow time for processing
        await new Promise(resolve => setTimeout(resolve, 50));

        result.eventsProcessed = eventsReceived;

        // Check circuit breaker status
        const status = eventBus.getCircuitStatus();
        result.state = status.state;
        result.consecutiveFailures = status.consecutiveFailures;

        // Validation
        result.passed = result.state === 'CLOSED' &&
                       result.consecutiveFailures === 0 &&
                       result.eventsProcessed === 10;

        console.log('  ✓ Circuit State:', result.state);
        console.log('  ✓ Events Processed:', result.eventsProcessed);
        console.log('  ✓ Consecutive Failures:', result.consecutiveFailures);
      } catch (error) {
        console.error('  ✗ Normal operation test failed:', error.message);
        result.passed = false;
      }

      testResults.normalOperation = result;

      expect(result.state).toBe('CLOSED');
      expect(result.consecutiveFailures).toBe(0);
      expect(result.eventsProcessed).toBe(10);
      expect(result.passed).toBe(true);
    });
  });

  describe('Test 2: Circuit Opens After 5 Failures', () => {
    it('should open circuit after 5 consecutive failures', async () => {
      const result = {
        failuresTriggered: 0,
        state: null,
        circuitOpens: 0,
        passed: false
      };

      try {
        // Subscribe with handler that always fails
        eventBus.subscribe('agent\\.failing\\..*', () => {
          throw new Error('Simulated handler failure');
        });

        // Trigger 5 consecutive failures (using valid event type)
        for (let i = 0; i < 5; i++) {
          try {
            await eventBus.publish('agent.failing.event', { id: i }, { priority: 5 });
            result.failuresTriggered++;
          } catch (error) {
            // Expected to fail
            result.failuresTriggered++;
          }
        }

        // Allow time for circuit to open
        await new Promise(resolve => setTimeout(resolve, 50));

        // Check circuit breaker status
        const status = eventBus.getCircuitStatus();
        result.state = status.state;
        result.circuitOpens = status.metrics.circuitOpens;

        // Validation
        result.passed = result.state === 'OPEN' &&
                       result.circuitOpens >= 1 &&
                       result.failuresTriggered === 5;

        console.log('  ✓ Circuit State:', result.state);
        console.log('  ✓ Failures Triggered:', result.failuresTriggered);
        console.log('  ✓ Circuit Opens:', result.circuitOpens);
      } catch (error) {
        console.error('  ✗ Circuit open test failed:', error.message);
        result.passed = false;
      }

      testResults.circuitOpens = result;

      expect(result.state).toBe('OPEN');
      expect(result.circuitOpens).toBeGreaterThanOrEqual(1);
      expect(result.passed).toBe(true);
    });
  });

  describe('Test 3: Open Circuit Rejects Events', () => {
    it('should reject events when circuit is OPEN', async () => {
      const result = {
        eventsRejected: 0,
        state: null,
        passed: false
      };

      try {
        // Subscribe with failing handler
        eventBus.subscribe('agent\\.failing\\..*', () => {
          throw new Error('Simulated failure');
        });

        // Trip the circuit (5 failures)
        for (let i = 0; i < 5; i++) {
          try {
            await eventBus.publish('agent.failing.event', { id: i }, { priority: 5 });
          } catch (error) {
            // Expected
          }
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify circuit is OPEN
        let status = eventBus.getCircuitStatus();
        expect(status.state).toBe('OPEN');

        // Try to process normal event (should be rejected)
        // Force immediate processing by triggering batch
        try {
          await eventBus.publish('agent.normal.event', { data: 'test' }, { priority: 5 });
          // Force batch processing to hit circuit breaker
          await eventBus.processBatch();
        } catch (error) {
          if (error.message.includes('Circuit breaker OPEN')) {
            result.eventsRejected++;
          }
        }

        // Try another event (should also be rejected)
        try {
          await eventBus.publish('agent.another.event', { data: 'test2' }, { priority: 5 });
          // Force batch processing to hit circuit breaker
          await eventBus.processBatch();
        } catch (error) {
          if (error.message.includes('Circuit breaker OPEN')) {
            result.eventsRejected++;
          }
        }

        status = eventBus.getCircuitStatus();
        result.state = status.state;
        const metricsRejected = status.metrics.eventsRejected || 0;

        // Validation
        result.passed = result.state === 'OPEN' &&
                       (result.eventsRejected >= 1 || metricsRejected >= 1);

        console.log('  ✓ Circuit State:', result.state);
        console.log('  ✓ Events Rejected:', result.eventsRejected);
        console.log('  ✓ Metrics Rejected:', metricsRejected);
      } catch (error) {
        console.error('  ✗ Circuit rejection test failed:', error.message);
        result.passed = false;
      }

      testResults.circuitRejects = result;

      expect(result.state).toBe('OPEN');
      expect(result.passed).toBe(true);
    });
  });

  describe('Test 4: Priority 8-9 Bypass Circuit', () => {
    it('should allow priority 8-9 events to bypass OPEN circuit', async () => {
      const result = {
        bypassEvents: 0,
        state: null,
        highPriorityProcessed: 0,
        passed: false
      };

      try {
        // Subscribe to both failing and critical events
        eventBus.subscribe('agent\\.failing\\..*', () => {
          throw new Error('Simulated failure');
        });

        let criticalEventsReceived = 0;
        eventBus.subscribe('cfn\\.loop\\..*', () => {
          criticalEventsReceived++;
        });

        // Trip the circuit (5 failures)
        for (let i = 0; i < 5; i++) {
          try {
            await eventBus.publish('agent.failing.event', { id: i }, { priority: 5 });
          } catch (error) {
            // Expected
          }
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        // Verify circuit is OPEN
        let status = eventBus.getCircuitStatus();
        expect(status.state).toBe('OPEN');

        // High priority events (8-9) should still process
        const criticalEvent1 = await eventBus.publish('cfn.loop.coordination',
          { urgent: true, data: 'CFN Loop coordination' },
          { priority: 9 }
        );
        expect(criticalEvent1).toBeDefined();
        result.highPriorityProcessed++;

        const criticalEvent2 = await eventBus.publish('cfn.loop.emergency',
          { urgent: true, data: 'Emergency shutdown' },
          { priority: 8 }
        );
        expect(criticalEvent2).toBeDefined();
        result.highPriorityProcessed++;

        await new Promise(resolve => setTimeout(resolve, 100));

        status = eventBus.getCircuitStatus();
        result.state = status.state;
        result.bypassEvents = status.metrics.bypassEvents || 0;

        // Circuit should still be OPEN
        expect(result.state).toBe('OPEN');

        // Validation
        result.passed = result.state === 'OPEN' &&
                       result.highPriorityProcessed === 2 &&
                       (result.bypassEvents >= 2 || criticalEventsReceived === 2);

        console.log('  ✓ Circuit State:', result.state);
        console.log('  ✓ High Priority Processed:', result.highPriorityProcessed);
        console.log('  ✓ Bypass Events:', result.bypassEvents);
        console.log('  ✓ Critical Events Received:', criticalEventsReceived);
      } catch (error) {
        console.error('  ✗ Priority bypass test failed:', error.message);
        result.passed = false;
      }

      testResults.priorityBypass = result;

      expect(result.passed).toBe(true);
    });
  });

  describe('Test 5: Half-Open Recovery', () => {
    it('should transition to HALF-OPEN after timeout, then CLOSED after 3 successes', async () => {
      const result = {
        states: [],
        recoveryAttempts: 0,
        passed: false
      };

      try {
        // Subscribe with failing handler
        eventBus.subscribe('agent\\.failing\\..*', () => {
          throw new Error('Simulated failure');
        });

        // Subscribe with successful handler for recovery
        eventBus.subscribe('agent\\.recovery\\..*', () => {
          // Successful handler
        });

        // Trip the circuit (5 failures)
        for (let i = 0; i < 5; i++) {
          try {
            await eventBus.publish('agent.failing.event', { id: i }, { priority: 5 });
          } catch (error) {
            // Expected
          }
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        let status = eventBus.getCircuitStatus();
        result.states.push(status.state);
        expect(status.state).toBe('OPEN');

        // Wait for recovery timeout (100ms)
        await new Promise(resolve => setTimeout(resolve, 150));

        // First successful event triggers HALF-OPEN
        await eventBus.publish('agent.recovery.event1', { id: 1 }, { priority: 5 });
        await eventBus.processBatch(); // Force processing to hit circuit breaker
        await new Promise(resolve => setTimeout(resolve, 20));

        status = eventBus.getCircuitStatus();
        result.states.push(status.state);
        expect(status.state).toBe('HALF-OPEN');

        // 2 more successful events should close circuit
        await eventBus.publish('agent.recovery.event2', { id: 2 }, { priority: 5 });
        await eventBus.processBatch(); // Force processing
        await new Promise(resolve => setTimeout(resolve, 20));

        await eventBus.publish('agent.recovery.event3', { id: 3 }, { priority: 5 });
        await eventBus.processBatch(); // Force processing
        await new Promise(resolve => setTimeout(resolve, 50));

        status = eventBus.getCircuitStatus();
        result.states.push(status.state);
        result.recoveryAttempts = status.metrics.recoveryAttempts || 0;

        // Validation
        result.passed = result.states.includes('OPEN') &&
                       result.states.includes('HALF-OPEN') &&
                       result.states.includes('CLOSED') &&
                       result.recoveryAttempts >= 1;

        console.log('  ✓ State Transitions:', result.states.join(' → '));
        console.log('  ✓ Recovery Attempts:', result.recoveryAttempts);
      } catch (error) {
        console.error('  ✗ Half-open recovery test failed:', error.message);
        result.passed = false;
      }

      testResults.halfOpenRecovery = result;

      expect(result.passed).toBe(true);
    });
  });

  describe('Test 6: Half-Open Failure Re-Opens Circuit', () => {
    it('should immediately re-open circuit on failure in HALF-OPEN state', async () => {
      const result = {
        states: [],
        circuitOpens: 0,
        passed: false
      };

      try {
        // Subscribe with failing handler
        eventBus.subscribe('agent\\.failing\\..*', () => {
          throw new Error('Simulated failure');
        });

        // Subscribe with successful handler
        eventBus.subscribe('agent\\.success\\..*', () => {
          // Successful handler
        });

        // Trip the circuit (5 failures)
        for (let i = 0; i < 5; i++) {
          try {
            await eventBus.publish('agent.failing.event', { id: i }, { priority: 5 });
          } catch (error) {
            // Expected
          }
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        let status = eventBus.getCircuitStatus();
        result.states.push(status.state);
        expect(status.state).toBe('OPEN');
        const initialCircuitOpens = status.metrics.circuitOpens;

        // Wait for recovery timeout (100ms)
        await new Promise(resolve => setTimeout(resolve, 150));

        // First successful event triggers HALF-OPEN
        await eventBus.publish('agent.success.event1', { id: 1 }, { priority: 5 });
        await eventBus.processBatch(); // Force processing
        await new Promise(resolve => setTimeout(resolve, 20));

        status = eventBus.getCircuitStatus();
        result.states.push(status.state);
        expect(status.state).toBe('HALF-OPEN');

        // Failure in HALF-OPEN should immediately re-open circuit
        try {
          await eventBus.publish('agent.failing.event', { id: 99 }, { priority: 5 });
          await eventBus.processBatch(); // Force processing to trigger circuit breaker
        } catch (error) {
          // Expected to fail
        }

        await new Promise(resolve => setTimeout(resolve, 50));

        status = eventBus.getCircuitStatus();
        result.states.push(status.state);
        result.circuitOpens = status.metrics.circuitOpens;

        // Validation: Should be back in OPEN state with increased open count
        result.passed = result.states.includes('HALF-OPEN') &&
                       result.states[result.states.length - 1] === 'OPEN' &&
                       result.circuitOpens > initialCircuitOpens;

        console.log('  ✓ State Transitions:', result.states.join(' → '));
        console.log('  ✓ Circuit Opens (re-opened):', result.circuitOpens);
      } catch (error) {
        console.error('  ✗ Half-open failure test failed:', error.message);
        result.passed = false;
      }

      testResults.halfOpenFailure = result;

      expect(result.passed).toBe(true);
    });
  });

  describe('Integration Validation Summary', () => {
    it('should validate all circuit breaker tests passed with ≥0.92 confidence', () => {
      // Calculate confidence score
      const scores = [
        testResults.normalOperation?.passed ? 1.0 : 0.0,
        testResults.circuitOpens?.passed ? 1.0 : 0.0,
        testResults.circuitRejects?.passed ? 1.0 : 0.0,
        testResults.priorityBypass?.passed ? 1.0 : 0.0,
        testResults.halfOpenRecovery?.passed ? 1.0 : 0.0,
        testResults.halfOpenFailure?.passed ? 1.0 : 0.0
      ];

      testResults.confidence = scores.reduce((a, b) => a + b, 0) / scores.length;

      console.log('\n📋 Circuit Breaker Integration Test Summary:');
      console.log(`  1. Normal Operation (CLOSED): ${testResults.normalOperation?.passed ? 'PASS ✅' : 'FAIL ❌'}`);
      console.log(`  2. Circuit Opens (5 failures): ${testResults.circuitOpens?.passed ? 'PASS ✅' : 'FAIL ❌'}`);
      console.log(`  3. Circuit Rejects Events: ${testResults.circuitRejects?.passed ? 'PASS ✅' : 'FAIL ❌'}`);
      console.log(`  4. Priority 8-9 Bypass: ${testResults.priorityBypass?.passed ? 'PASS ✅' : 'FAIL ❌'}`);
      console.log(`  5. Half-Open Recovery: ${testResults.halfOpenRecovery?.passed ? 'PASS ✅' : 'FAIL ❌'}`);
      console.log(`  6. Half-Open Re-Open: ${testResults.halfOpenFailure?.passed ? 'PASS ✅' : 'FAIL ❌'}`);
      console.log(`  \n  Overall Confidence: ${(testResults.confidence * 100).toFixed(1)}%`);
      console.log(`  Target Confidence: ≥92.0%`);
      console.log(`  Status: ${testResults.confidence >= 0.92 ? 'PASS ✅' : 'FAIL ❌'}`);

      expect(testResults.confidence).toBeGreaterThanOrEqual(0.92);
    });
  });
});

export { testResults };
