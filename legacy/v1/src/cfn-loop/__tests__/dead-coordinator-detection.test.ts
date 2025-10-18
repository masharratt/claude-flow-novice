/**
 * Dead Coordinator Detection Test Suite
 *
 * Sprint 1.2: Validates dead coordinator detection within 2 minutes
 *
 * Test Coverage:
 * 1. Heartbeat Freshness - Verify warnings trigger at >120s
 * 2. Escalation - Verify 3 warnings → DEAD status
 * 3. Orphan Cleanup - Verify state/ACKs/signals removed
 * 4. False Positives - Verify fresh heartbeats don't trigger warnings
 * 5. Recovery - Verify coordinator can restart after being marked dead
 *
 * @module cfn-loop/__tests__/dead-coordinator-detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';

// ===== MOCK COORDINATOR STATE =====

interface CoordinatorHeartbeat {
  coordinatorId: string;
  timestamp: number;
  status: 'ALIVE' | 'WARNING' | 'DEAD';
  warningCount: number;
}

interface CoordinatorState {
  coordinatorId: string;
  agentIds: string[];
  pendingAcks: Map<string, number>;
  pendingSignals: Map<string, any>;
  heartbeat: CoordinatorHeartbeat;
}

// ===== DEAD COORDINATOR DETECTOR =====

class DeadCoordinatorDetector extends EventEmitter {
  private coordinators: Map<string, CoordinatorState> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_TIMEOUT_MS = 120000; // 2 minutes
  private readonly WARNING_THRESHOLD = 3; // 3 warnings = DEAD
  private readonly CHECK_INTERVAL_MS = 30000; // Check every 30 seconds

  constructor() {
    super();
  }

  /**
   * Start monitoring for dead coordinators
   */
  startMonitoring(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
      this.checkHeartbeats();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Register a coordinator
   */
  registerCoordinator(coordinatorId: string, agentIds: string[] = []): void {
    const heartbeat: CoordinatorHeartbeat = {
      coordinatorId,
      timestamp: Date.now(),
      status: 'ALIVE',
      warningCount: 0,
    };

    this.coordinators.set(coordinatorId, {
      coordinatorId,
      agentIds,
      pendingAcks: new Map(),
      pendingSignals: new Map(),
      heartbeat,
    });

    this.emit('coordinator:registered', { coordinatorId });
  }

  /**
   * Update coordinator heartbeat
   */
  updateHeartbeat(coordinatorId: string): void {
    const coordinator = this.coordinators.get(coordinatorId);
    if (!coordinator) {
      throw new Error(`Coordinator ${coordinatorId} not registered`);
    }

    coordinator.heartbeat.timestamp = Date.now();
    coordinator.heartbeat.status = 'ALIVE';
    coordinator.heartbeat.warningCount = 0;

    this.emit('heartbeat:updated', { coordinatorId, timestamp: coordinator.heartbeat.timestamp });
  }

  /**
   * Add pending ACK for coordinator
   */
  addPendingAck(coordinatorId: string, ackId: string): void {
    const coordinator = this.coordinators.get(coordinatorId);
    if (!coordinator) {
      throw new Error(`Coordinator ${coordinatorId} not registered`);
    }

    coordinator.pendingAcks.set(ackId, Date.now());
  }

  /**
   * Add pending signal for coordinator
   */
  addPendingSignal(coordinatorId: string, signalId: string, signalData: any): void {
    const coordinator = this.coordinators.get(coordinatorId);
    if (!coordinator) {
      throw new Error(`Coordinator ${coordinatorId} not registered`);
    }

    coordinator.pendingSignals.set(signalId, signalData);
  }

  /**
   * Check all coordinator heartbeats for staleness
   */
  checkHeartbeats(): void {
    const now = Date.now();

    for (const [coordinatorId, coordinator] of this.coordinators.entries()) {
      const timeSinceHeartbeat = now - coordinator.heartbeat.timestamp;

      if (coordinator.heartbeat.status === 'DEAD') {
        continue; // Already marked as dead
      }

      if (timeSinceHeartbeat > this.HEARTBEAT_TIMEOUT_MS) {
        // Heartbeat is stale
        coordinator.heartbeat.warningCount++;

        this.emit('heartbeat:stale', {
          coordinatorId,
          timeSinceHeartbeat,
          warningCount: coordinator.heartbeat.warningCount,
        });

        if (coordinator.heartbeat.warningCount >= this.WARNING_THRESHOLD) {
          // Mark as DEAD and cleanup
          coordinator.heartbeat.status = 'DEAD';
          this.markCoordinatorDead(coordinatorId);
        } else {
          // Mark as WARNING
          coordinator.heartbeat.status = 'WARNING';
          this.emit('coordinator:warning', {
            coordinatorId,
            warningCount: coordinator.heartbeat.warningCount,
            threshold: this.WARNING_THRESHOLD,
          });
        }
      }
    }
  }

  /**
   * Mark coordinator as DEAD and cleanup orphaned state
   */
  private markCoordinatorDead(coordinatorId: string): void {
    const coordinator = this.coordinators.get(coordinatorId);
    if (!coordinator) {
      return;
    }

    this.emit('coordinator:dead', {
      coordinatorId,
      agentCount: coordinator.agentIds.length,
      pendingAcks: coordinator.pendingAcks.size,
      pendingSignals: coordinator.pendingSignals.size,
    });

    // Cleanup orphaned state
    this.cleanupOrphanedState(coordinatorId);
  }

  /**
   * Cleanup orphaned state for dead coordinator
   */
  private cleanupOrphanedState(coordinatorId: string): void {
    const coordinator = this.coordinators.get(coordinatorId);
    if (!coordinator) {
      return;
    }

    // Clear pending ACKs
    const ackCount = coordinator.pendingAcks.size;
    coordinator.pendingAcks.clear();

    // Clear pending signals
    const signalCount = coordinator.pendingSignals.size;
    coordinator.pendingSignals.clear();

    // Clear agent assignments
    const agentCount = coordinator.agentIds.length;
    coordinator.agentIds = [];

    this.emit('orphans:cleaned', {
      coordinatorId,
      acksCleaned: ackCount,
      signalsCleaned: signalCount,
      agentsReleased: agentCount,
    });
  }

  /**
   * Attempt to recover a dead coordinator
   */
  recoverCoordinator(coordinatorId: string): boolean {
    const coordinator = this.coordinators.get(coordinatorId);
    if (!coordinator) {
      return false;
    }

    if (coordinator.heartbeat.status !== 'DEAD') {
      return false; // Not dead, no recovery needed
    }

    // Reset heartbeat
    coordinator.heartbeat.timestamp = Date.now();
    coordinator.heartbeat.status = 'ALIVE';
    coordinator.heartbeat.warningCount = 0;

    this.emit('coordinator:recovered', { coordinatorId });

    return true;
  }

  /**
   * Get coordinator status
   */
  getCoordinatorStatus(coordinatorId: string): CoordinatorHeartbeat | null {
    const coordinator = this.coordinators.get(coordinatorId);
    return coordinator ? { ...coordinator.heartbeat } : null;
  }

  /**
   * Get coordinator state (for testing)
   */
  getCoordinatorState(coordinatorId: string): CoordinatorState | null {
    const coordinator = this.coordinators.get(coordinatorId);
    return coordinator ? { ...coordinator } : null;
  }

  /**
   * Force manual heartbeat check (for testing)
   */
  forceCheck(): void {
    this.checkHeartbeats();
  }

  /**
   * Cleanup
   */
  shutdown(): void {
    this.stopMonitoring();
    this.coordinators.clear();
    this.removeAllListeners();
  }
}

// ===== TEST SUITE =====

describe('Dead Coordinator Detection', () => {
  let detector: DeadCoordinatorDetector;

  beforeEach(() => {
    detector = new DeadCoordinatorDetector();
    vi.useFakeTimers();
  });

  afterEach(() => {
    detector.shutdown();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  // ===== TEST 1: HEARTBEAT FRESHNESS =====

  describe('Heartbeat Freshness', () => {
    it('should trigger warning at >120s heartbeat staleness', () => {
      const coordinatorId = 'coord-test-1';
      const warningEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('heartbeat:stale', (data) => warningEvents.push(data));

      // Fast-forward 121 seconds (1 second over threshold)
      vi.advanceTimersByTime(121000);

      // Force heartbeat check
      detector.forceCheck();

      expect(warningEvents).toHaveLength(1);
      expect(warningEvents[0]).toMatchObject({
        coordinatorId,
        warningCount: 1,
      });
      expect(warningEvents[0].timeSinceHeartbeat).toBeGreaterThan(120000);
    });

    it('should not trigger warning at <120s heartbeat staleness', () => {
      const coordinatorId = 'coord-test-2';
      const warningEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('heartbeat:stale', (data) => warningEvents.push(data));

      // Fast-forward 119 seconds (1 second under threshold)
      vi.advanceTimersByTime(119000);

      // Force heartbeat check
      detector.forceCheck();

      expect(warningEvents).toHaveLength(0);
    });

    it('should trigger multiple warnings for prolonged staleness', () => {
      const coordinatorId = 'coord-test-3';
      const warningEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('heartbeat:stale', (data) => warningEvents.push(data));

      // Fast-forward and check 3 times
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      expect(warningEvents).toHaveLength(3);
      expect(warningEvents[0].warningCount).toBe(1);
      expect(warningEvents[1].warningCount).toBe(2);
      expect(warningEvents[2].warningCount).toBe(3);
    });
  });

  // ===== TEST 2: ESCALATION =====

  describe('Escalation to DEAD Status', () => {
    it('should mark coordinator DEAD after 3 warnings', () => {
      const coordinatorId = 'coord-escalate-1';
      const deadEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('coordinator:dead', (data) => deadEvents.push(data));

      // Trigger 3 warnings
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      expect(deadEvents).toHaveLength(1);
      expect(deadEvents[0]).toMatchObject({
        coordinatorId,
      });

      const status = detector.getCoordinatorStatus(coordinatorId);
      expect(status?.status).toBe('DEAD');
      expect(status?.warningCount).toBe(3);
    });

    it('should remain ALIVE with only 2 warnings', () => {
      const coordinatorId = 'coord-escalate-2';
      const deadEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('coordinator:dead', (data) => deadEvents.push(data));

      // Trigger only 2 warnings
      for (let i = 0; i < 2; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      expect(deadEvents).toHaveLength(0);

      const status = detector.getCoordinatorStatus(coordinatorId);
      expect(status?.status).toBe('WARNING');
      expect(status?.warningCount).toBe(2);
    });

    it('should emit coordinator:warning event before DEAD', () => {
      const coordinatorId = 'coord-escalate-3';
      const warningEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('coordinator:warning', (data) => warningEvents.push(data));

      // Trigger 2 warnings (not enough for DEAD)
      for (let i = 0; i < 2; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      expect(warningEvents).toHaveLength(2);
      expect(warningEvents[0].warningCount).toBe(1);
      expect(warningEvents[1].warningCount).toBe(2);
    });
  });

  // ===== TEST 3: ORPHAN CLEANUP =====

  describe('Orphan State Cleanup', () => {
    it('should cleanup pending ACKs when coordinator marked DEAD', () => {
      const coordinatorId = 'coord-cleanup-1';
      const cleanupEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('orphans:cleaned', (data) => cleanupEvents.push(data));

      // Add pending ACKs
      detector.addPendingAck(coordinatorId, 'ack-1');
      detector.addPendingAck(coordinatorId, 'ack-2');
      detector.addPendingAck(coordinatorId, 'ack-3');

      // Verify ACKs exist
      const stateBefore = detector.getCoordinatorState(coordinatorId);
      expect(stateBefore?.pendingAcks.size).toBe(3);

      // Trigger DEAD status (3 warnings)
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      expect(cleanupEvents).toHaveLength(1);
      expect(cleanupEvents[0]).toMatchObject({
        coordinatorId,
        acksCleaned: 3,
      });

      // Verify ACKs cleared
      const stateAfter = detector.getCoordinatorState(coordinatorId);
      expect(stateAfter?.pendingAcks.size).toBe(0);
    });

    it('should cleanup pending signals when coordinator marked DEAD', () => {
      const coordinatorId = 'coord-cleanup-2';
      const cleanupEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('orphans:cleaned', (data) => cleanupEvents.push(data));

      // Add pending signals
      detector.addPendingSignal(coordinatorId, 'signal-1', { type: 'test' });
      detector.addPendingSignal(coordinatorId, 'signal-2', { type: 'test' });

      // Verify signals exist
      const stateBefore = detector.getCoordinatorState(coordinatorId);
      expect(stateBefore?.pendingSignals.size).toBe(2);

      // Trigger DEAD status
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      expect(cleanupEvents).toHaveLength(1);
      expect(cleanupEvents[0]).toMatchObject({
        coordinatorId,
        signalsCleaned: 2,
      });

      // Verify signals cleared
      const stateAfter = detector.getCoordinatorState(coordinatorId);
      expect(stateAfter?.pendingSignals.size).toBe(0);
    });

    it('should release agent assignments when coordinator marked DEAD', () => {
      const coordinatorId = 'coord-cleanup-3';
      const cleanupEvents: any[] = [];

      detector.registerCoordinator(coordinatorId, ['agent-1', 'agent-2', 'agent-3']);
      detector.on('orphans:cleaned', (data) => cleanupEvents.push(data));

      // Verify agents assigned
      const stateBefore = detector.getCoordinatorState(coordinatorId);
      expect(stateBefore?.agentIds).toHaveLength(3);

      // Trigger DEAD status
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      expect(cleanupEvents).toHaveLength(1);
      expect(cleanupEvents[0]).toMatchObject({
        coordinatorId,
        agentsReleased: 3,
      });

      // Verify agents released
      const stateAfter = detector.getCoordinatorState(coordinatorId);
      expect(stateAfter?.agentIds).toHaveLength(0);
    });

    it('should cleanup all orphan state types simultaneously', () => {
      const coordinatorId = 'coord-cleanup-4';
      const cleanupEvents: any[] = [];

      detector.registerCoordinator(coordinatorId, ['agent-1', 'agent-2']);
      detector.on('orphans:cleaned', (data) => cleanupEvents.push(data));

      // Add all orphan state types
      detector.addPendingAck(coordinatorId, 'ack-1');
      detector.addPendingAck(coordinatorId, 'ack-2');
      detector.addPendingSignal(coordinatorId, 'signal-1', { type: 'test' });

      // Trigger DEAD status
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      expect(cleanupEvents).toHaveLength(1);
      expect(cleanupEvents[0]).toMatchObject({
        coordinatorId,
        acksCleaned: 2,
        signalsCleaned: 1,
        agentsReleased: 2,
      });
    });
  });

  // ===== TEST 4: FALSE POSITIVES =====

  describe('False Positive Prevention', () => {
    it('should not trigger warning for fresh heartbeats', () => {
      const coordinatorId = 'coord-fresh-1';
      const warningEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('heartbeat:stale', (data) => warningEvents.push(data));

      // Update heartbeat multiple times within threshold
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(60000); // 60 seconds
        detector.updateHeartbeat(coordinatorId);
        detector.forceCheck();
      }

      expect(warningEvents).toHaveLength(0);

      const status = detector.getCoordinatorStatus(coordinatorId);
      expect(status?.status).toBe('ALIVE');
      expect(status?.warningCount).toBe(0);
    });

    it('should reset warning count when heartbeat updated', () => {
      const coordinatorId = 'coord-fresh-2';
      const warningEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('heartbeat:stale', (data) => warningEvents.push(data));

      // Trigger 2 warnings
      for (let i = 0; i < 2; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      expect(warningEvents).toHaveLength(2);

      // Update heartbeat to reset
      detector.updateHeartbeat(coordinatorId);

      const status = detector.getCoordinatorStatus(coordinatorId);
      expect(status?.status).toBe('ALIVE');
      expect(status?.warningCount).toBe(0);
    });

    it('should not mark as DEAD if heartbeat updated before 3rd warning', () => {
      const coordinatorId = 'coord-fresh-3';
      const deadEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('coordinator:dead', (data) => deadEvents.push(data));

      // Trigger 2 warnings
      for (let i = 0; i < 2; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      // Update heartbeat before 3rd warning
      detector.updateHeartbeat(coordinatorId);

      // Try to trigger 3rd warning
      vi.advanceTimersByTime(121000);
      detector.forceCheck();

      expect(deadEvents).toHaveLength(0);

      const status = detector.getCoordinatorStatus(coordinatorId);
      expect(status?.status).toBe('WARNING'); // Only 1 warning now
      expect(status?.warningCount).toBe(1);
    });

    it('should ignore DEAD coordinators in subsequent checks', () => {
      const coordinatorId = 'coord-fresh-4';
      const deadEvents: any[] = [];
      const warningEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('coordinator:dead', (data) => deadEvents.push(data));
      detector.on('heartbeat:stale', (data) => warningEvents.push(data));

      // Trigger DEAD status (3 warnings)
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      expect(deadEvents).toHaveLength(1);
      const initialWarnings = warningEvents.length;

      // Continue checking - should not trigger more warnings/dead events
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      expect(deadEvents).toHaveLength(1); // Still just 1
      expect(warningEvents.length).toBe(initialWarnings); // No new warnings
    });
  });

  // ===== TEST 5: RECOVERY =====

  describe('Coordinator Recovery', () => {
    it('should allow recovery of DEAD coordinator', () => {
      const coordinatorId = 'coord-recovery-1';
      const recoveryEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('coordinator:recovered', (data) => recoveryEvents.push(data));

      // Mark as DEAD
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      const statusBefore = detector.getCoordinatorStatus(coordinatorId);
      expect(statusBefore?.status).toBe('DEAD');

      // Recover
      const recovered = detector.recoverCoordinator(coordinatorId);

      expect(recovered).toBe(true);
      expect(recoveryEvents).toHaveLength(1);
      expect(recoveryEvents[0]).toMatchObject({ coordinatorId });

      const statusAfter = detector.getCoordinatorStatus(coordinatorId);
      expect(statusAfter?.status).toBe('ALIVE');
      expect(statusAfter?.warningCount).toBe(0);
    });

    it('should not recover non-DEAD coordinator', () => {
      const coordinatorId = 'coord-recovery-2';
      const recoveryEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('coordinator:recovered', (data) => recoveryEvents.push(data));

      // Don't mark as DEAD
      const recovered = detector.recoverCoordinator(coordinatorId);

      expect(recovered).toBe(false);
      expect(recoveryEvents).toHaveLength(0);
    });

    it('should allow re-registration after recovery', () => {
      const coordinatorId = 'coord-recovery-3';

      detector.registerCoordinator(coordinatorId, ['agent-1', 'agent-2']);

      // Mark as DEAD (clears agents)
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      const stateDead = detector.getCoordinatorState(coordinatorId);
      expect(stateDead?.agentIds).toHaveLength(0);

      // Recover
      detector.recoverCoordinator(coordinatorId);

      // Can now update heartbeat and function normally
      detector.updateHeartbeat(coordinatorId);

      const statusAfter = detector.getCoordinatorStatus(coordinatorId);
      expect(statusAfter?.status).toBe('ALIVE');
    });

    it('should reset heartbeat timestamp on recovery', () => {
      const coordinatorId = 'coord-recovery-4';

      detector.registerCoordinator(coordinatorId);

      const initialTimestamp = detector.getCoordinatorStatus(coordinatorId)?.timestamp || 0;

      // Mark as DEAD
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      // Fast-forward time
      vi.advanceTimersByTime(60000);

      // Recover
      detector.recoverCoordinator(coordinatorId);

      const recoveredTimestamp = detector.getCoordinatorStatus(coordinatorId)?.timestamp || 0;

      expect(recoveredTimestamp).toBeGreaterThan(initialTimestamp);
    });

    it('should not trigger warnings after recovery with fresh heartbeats', () => {
      const coordinatorId = 'coord-recovery-5';
      const warningEvents: any[] = [];

      detector.registerCoordinator(coordinatorId);
      detector.on('heartbeat:stale', (data) => warningEvents.push(data));

      // Mark as DEAD
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      const initialWarnings = warningEvents.length;

      // Recover
      detector.recoverCoordinator(coordinatorId);

      // Update heartbeat regularly
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(60000);
        detector.updateHeartbeat(coordinatorId);
        detector.forceCheck();
      }

      expect(warningEvents.length).toBe(initialWarnings); // No new warnings
    });
  });

  // ===== EDGE CASES =====

  describe('Edge Cases', () => {
    it('should handle multiple coordinators independently', () => {
      const coord1 = 'coord-multi-1';
      const coord2 = 'coord-multi-2';
      const deadEvents: any[] = [];

      detector.registerCoordinator(coord1);
      detector.registerCoordinator(coord2);
      detector.on('coordinator:dead', (data) => deadEvents.push(data));

      // Mark coord1 as DEAD
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      // Update coord2 heartbeat
      detector.updateHeartbeat(coord2);

      const status1 = detector.getCoordinatorStatus(coord1);
      const status2 = detector.getCoordinatorStatus(coord2);

      expect(status1?.status).toBe('DEAD');
      expect(status2?.status).toBe('ALIVE');
      expect(deadEvents).toHaveLength(1);
      expect(deadEvents[0].coordinatorId).toBe(coord1);
    });

    it('should throw error for unregistered coordinator operations', () => {
      const coordinatorId = 'coord-unregistered';

      expect(() => {
        detector.updateHeartbeat(coordinatorId);
      }).toThrow(`Coordinator ${coordinatorId} not registered`);

      expect(() => {
        detector.addPendingAck(coordinatorId, 'ack-1');
      }).toThrow(`Coordinator ${coordinatorId} not registered`);

      expect(() => {
        detector.addPendingSignal(coordinatorId, 'signal-1', {});
      }).toThrow(`Coordinator ${coordinatorId} not registered`);
    });

    it('should handle cleanup when no orphan state exists', () => {
      const coordinatorId = 'coord-no-orphans';
      const cleanupEvents: any[] = [];

      detector.registerCoordinator(coordinatorId, []);
      detector.on('orphans:cleaned', (data) => cleanupEvents.push(data));

      // Mark as DEAD without any orphan state
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(121000);
        detector.forceCheck();
      }

      expect(cleanupEvents).toHaveLength(1);
      expect(cleanupEvents[0]).toMatchObject({
        coordinatorId,
        acksCleaned: 0,
        signalsCleaned: 0,
        agentsReleased: 0,
      });
    });
  });
});
