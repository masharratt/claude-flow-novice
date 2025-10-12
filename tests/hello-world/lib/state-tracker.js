/**
 * State Tracker
 *
 * Centralized state tracking for Layer 3 dormant coordinators.
 * Subscribes to all state transition events and validates state machine.
 * Detects deadlocks, invalid transitions, and performance issues.
 * Exports validation report.
 */

import { createClient } from 'redis';

export class StateTracker {
  constructor(redisUrl) {
    this.redisUrl = redisUrl;
    this.redis = null;
    this.subClient = null;

    // State tracking
    this.coordinatorStates = new Map(); // coordinatorId -> current state
    this.stateTransitions = []; // All transitions
    this.coordinatorTransitions = new Map(); // coordinatorId -> transitions[]

    // Validation rules
    this.validTransitions = new Map([
      ['dormant', new Set(['active'])],
      ['active', new Set(['paused', 'dormant'])],
      ['paused', new Set(['active', 'dormant'])],
    ]);

    // Deadlock detection
    this.pausedCoordinators = new Map(); // coordinatorId -> pausedAt timestamp

    // Performance metrics
    this.stateMetrics = new Map(); // state -> { count, totalTimeMs }
    this.coordinatorMetrics = new Map(); // coordinatorId -> metrics

    // Validation results
    this.invalidTransitions = [];
    this.deadlocks = [];
    this.warnings = [];

    this.running = false;
  }

  /**
   * Initialize and start tracking
   */
  async start() {
    console.log('[StateTracker] Starting...');

    // Create Redis clients
    this.redis = createClient({ url: this.redisUrl });
    this.subClient = createClient({ url: this.redisUrl });

    await this.redis.connect();
    await this.subClient.connect();

    console.log('[StateTracker] Redis clients connected');

    // Subscribe to state transition events
    await this.subClient.subscribe('coordinator:state-transitions', (message) => {
      this.handleStateTransition(JSON.parse(message));
    });

    console.log('[StateTracker] Subscribed to coordinator:state-transitions');

    this.running = true;

    // Start deadlock detection loop
    this.deadlockCheckInterval = setInterval(() => {
      this.checkForDeadlocks();
    }, 5000); // Check every 5 seconds

    console.log('[StateTracker] Deadlock detection started');
  }

  /**
   * Handle state transition event
   */
  handleStateTransition(event) {
    const { coordinatorId, from, to, timestamp } = event;

    console.log(`[StateTracker] ${coordinatorId}: ${from} → ${to}`);

    // Record transition
    this.stateTransitions.push(event);

    if (!this.coordinatorTransitions.has(coordinatorId)) {
      this.coordinatorTransitions.set(coordinatorId, []);
    }
    this.coordinatorTransitions.get(coordinatorId).push(event);

    // Update current state
    const previousState = this.coordinatorStates.get(coordinatorId);
    this.coordinatorStates.set(coordinatorId, to);

    // Validate transition
    if (!this.isValidTransition(from, to)) {
      const invalid = {
        coordinatorId,
        from,
        to,
        timestamp,
        reason: `Invalid transition: ${from} → ${to}`
      };

      this.invalidTransitions.push(invalid);
      console.error(`[StateTracker] INVALID TRANSITION: ${coordinatorId}: ${from} → ${to}`);
    }

    // Track paused coordinators for deadlock detection
    if (to === 'paused') {
      this.pausedCoordinators.set(coordinatorId, timestamp);
    } else if (from === 'paused') {
      this.pausedCoordinators.delete(coordinatorId);
    }

    // Update performance metrics
    if (previousState && previousState !== to) {
      this.updateMetrics(coordinatorId, previousState, from, to, timestamp);
    }

    // Initialize metrics for new coordinator
    if (!this.coordinatorMetrics.has(coordinatorId)) {
      this.coordinatorMetrics.set(coordinatorId, {
        totalTransitions: 0,
        timeInDormant: 0,
        timeInActive: 0,
        timeInPaused: 0,
        lastTransitionTime: timestamp
      });
    }

    const metrics = this.coordinatorMetrics.get(coordinatorId);
    metrics.totalTransitions++;
    metrics.lastTransitionTime = timestamp;
  }

  /**
   * Check if transition is valid
   */
  isValidTransition(from, to) {
    const validNext = this.validTransitions.get(from);
    return validNext && validNext.has(to);
  }

  /**
   * Update performance metrics
   */
  updateMetrics(coordinatorId, previousState, from, to, timestamp) {
    const metrics = this.coordinatorMetrics.get(coordinatorId);
    if (!metrics) return;

    const transitions = this.coordinatorTransitions.get(coordinatorId);
    if (transitions.length < 2) return;

    // Find previous transition timestamp
    const prevTransition = transitions[transitions.length - 2];
    const timeInState = timestamp - prevTransition.timestamp;

    // Update time in state
    if (from === 'dormant') {
      metrics.timeInDormant += timeInState;
    } else if (from === 'active') {
      metrics.timeInActive += timeInState;
    } else if (from === 'paused') {
      metrics.timeInPaused += timeInState;
    }

    // Update global state metrics
    if (!this.stateMetrics.has(from)) {
      this.stateMetrics.set(from, { count: 0, totalTimeMs: 0 });
    }

    const stateMetric = this.stateMetrics.get(from);
    stateMetric.count++;
    stateMetric.totalTimeMs += timeInState;
  }

  /**
   * Check for deadlocks
   */
  checkForDeadlocks() {
    const now = Date.now();
    const deadlockThresholdMs = 60000; // 60 seconds

    for (const [coordinatorId, pausedAt] of this.pausedCoordinators.entries()) {
      const pausedDuration = now - pausedAt;

      if (pausedDuration > deadlockThresholdMs) {
        // Check if there's another coordinator also paused
        const pausedCount = this.pausedCoordinators.size;

        if (pausedCount >= 2) {
          const deadlock = {
            coordinatorId,
            pausedAt,
            pausedDuration,
            otherPausedCoordinators: Array.from(this.pausedCoordinators.keys()).filter(id => id !== coordinatorId),
            detectedAt: now
          };

          // Only add if not already detected
          if (!this.deadlocks.find(d => d.coordinatorId === coordinatorId && d.pausedAt === pausedAt)) {
            this.deadlocks.push(deadlock);
            console.error(`[StateTracker] DEADLOCK DETECTED: ${coordinatorId} paused for ${pausedDuration}ms with ${pausedCount - 1} other(s) paused`);
          }
        } else {
          // Single coordinator paused too long - warning
          const warning = {
            type: 'long-pause',
            coordinatorId,
            pausedAt,
            pausedDuration,
            detectedAt: now
          };

          if (!this.warnings.find(w => w.type === 'long-pause' && w.coordinatorId === coordinatorId && w.pausedAt === pausedAt)) {
            this.warnings.push(warning);
            console.warn(`[StateTracker] WARNING: ${coordinatorId} paused for ${pausedDuration}ms`);
          }
        }
      }
    }
  }

  /**
   * Get validation report
   */
  getValidationReport() {
    const report = {
      coordinators: {
        total: this.coordinatorStates.size,
        byState: this.getCoordinatorsByState(),
        list: Array.from(this.coordinatorStates.entries()).map(([id, state]) => ({
          id,
          state,
          transitions: this.coordinatorTransitions.get(id)?.length || 0,
          metrics: this.coordinatorMetrics.get(id)
        }))
      },
      transitions: {
        total: this.stateTransitions.length,
        invalid: this.invalidTransitions.length,
        byType: this.getTransitionsByType()
      },
      validation: {
        passed: this.invalidTransitions.length === 0 && this.deadlocks.length === 0,
        invalidTransitions: this.invalidTransitions,
        deadlocks: this.deadlocks,
        warnings: this.warnings
      },
      performance: {
        stateMetrics: Array.from(this.stateMetrics.entries()).map(([state, metrics]) => ({
          state,
          count: metrics.count,
          totalTimeMs: metrics.totalTimeMs,
          averageTimeMs: metrics.count > 0 ? metrics.totalTimeMs / metrics.count : 0
        })),
        coordinatorMetrics: Array.from(this.coordinatorMetrics.entries()).map(([id, metrics]) => ({
          id,
          ...metrics,
          totalTimeMs: metrics.timeInDormant + metrics.timeInActive + metrics.timeInPaused,
          dormantPercentage: this.calculatePercentage(metrics.timeInDormant, metrics),
          activePercentage: this.calculatePercentage(metrics.timeInActive, metrics),
          pausedPercentage: this.calculatePercentage(metrics.timeInPaused, metrics)
        }))
      }
    };

    return report;
  }

  /**
   * Calculate percentage of time in state
   */
  calculatePercentage(timeInState, metrics) {
    const total = metrics.timeInDormant + metrics.timeInActive + metrics.timeInPaused;
    return total > 0 ? (timeInState / total) * 100 : 0;
  }

  /**
   * Get coordinators grouped by state
   */
  getCoordinatorsByState() {
    const byState = {
      dormant: [],
      active: [],
      paused: []
    };

    for (const [id, state] of this.coordinatorStates.entries()) {
      if (byState[state]) {
        byState[state].push(id);
      }
    }

    return byState;
  }

  /**
   * Get transitions grouped by type
   */
  getTransitionsByType() {
    const byType = {};

    for (const transition of this.stateTransitions) {
      const type = `${transition.from} → ${transition.to}`;
      byType[type] = (byType[type] || 0) + 1;
    }

    return byType;
  }

  /**
   * Print validation report
   */
  printReport() {
    const report = this.getValidationReport();

    console.log('\n' + '━'.repeat(60));
    console.log('STATE TRACKER VALIDATION REPORT');
    console.log('━'.repeat(60));

    console.log('\n📊 Coordinators:');
    console.log(`   Total: ${report.coordinators.total}`);
    console.log(`   By state: dormant=${report.coordinators.byState.dormant.length}, active=${report.coordinators.byState.active.length}, paused=${report.coordinators.byState.paused.length}`);

    console.log('\n🔄 Transitions:');
    console.log(`   Total: ${report.transitions.total}`);
    console.log(`   Invalid: ${report.transitions.invalid}`);

    if (report.transitions.invalid > 0) {
      console.log('\n❌ Invalid Transitions:');
      for (const invalid of report.validation.invalidTransitions) {
        console.log(`   - ${invalid.coordinatorId}: ${invalid.from} → ${invalid.to} (${invalid.reason})`);
      }
    }

    console.log('\n🔒 Deadlocks:');
    console.log(`   Detected: ${report.validation.deadlocks.length}`);

    if (report.validation.deadlocks.length > 0) {
      console.log('\n❌ Deadlocks:');
      for (const deadlock of report.validation.deadlocks) {
        console.log(`   - ${deadlock.coordinatorId} paused for ${Math.round(deadlock.pausedDuration / 1000)}s`);
        console.log(`     Other paused: ${deadlock.otherPausedCoordinators.join(', ')}`);
      }
    }

    if (report.validation.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      for (const warning of report.validation.warnings) {
        console.log(`   - ${warning.type}: ${warning.coordinatorId} (${Math.round(warning.pausedDuration / 1000)}s)`);
      }
    }

    console.log('\n⏱️  Performance:');
    for (const metric of report.performance.stateMetrics) {
      console.log(`   ${metric.state}: ${metric.count} transitions, avg ${Math.round(metric.averageTimeMs)}ms`);
    }

    console.log('\n' + '━'.repeat(60));
    console.log(report.validation.passed ? '✅ VALIDATION PASSED' : '❌ VALIDATION FAILED');
    console.log('━'.repeat(60) + '\n');

    return report;
  }

  /**
   * Stop tracking
   */
  async stop() {
    console.log('[StateTracker] Stopping...');

    this.running = false;

    if (this.deadlockCheckInterval) {
      clearInterval(this.deadlockCheckInterval);
    }

    if (this.redis) {
      await this.redis.quit();
    }

    if (this.subClient) {
      await this.subClient.quit();
    }

    console.log('[StateTracker] Stopped');
  }
}
