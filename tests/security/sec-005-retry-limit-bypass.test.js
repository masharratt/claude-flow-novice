/**
 * SEC-005: Retry Limit Bypass Vulnerability Test
 *
 * Validates that TaskScheduler properly enforces task ownership
 * and rejects unauthorized failure reports.
 *
 * CVSS: 7.1 (HIGH)
 * CWE-284: Improper Access Control
 */

import { TaskScheduler } from '../../src/coordination/v2/core/task-scheduler.js';
import { DependencyGraph } from '../../src/coordination/v2/core/dependency-graph.js';
import { DependencyNodeStatus } from '../../src/coordination/v2/core/dependency-node.js';

describe('SEC-005: Retry Limit Bypass Protection', () => {
  let graph;
  let scheduler;

  beforeEach(() => {
    graph = new DependencyGraph();
    scheduler = new TaskScheduler(graph, {
      maxConcurrency: 3,
      pollInterval: 100,
      retryLimit: 3,
      priorityWeighting: 'balanced'
    });
  });

  afterEach(() => {
    if (scheduler) {
      scheduler.stop();
    }
  });

  describe('Task Ownership Validation', () => {
    test('should reject unauthorized failure reports', () => {
      // Setup: Add task and simulate assignment
      graph.addNode({
        taskId: 'task-1',
        agentId: 'agent-alpha',
        priority: 1,
        dependencies: []
      });

      // Manually trigger assignment to set up ownership
      const readyTasks = graph.getReadyTasks();
      expect(readyTasks.length).toBeGreaterThan(0);

      const task = readyTasks[0];

      // Simulate internal assignment (sets ownership)
      scheduler['runningTasks'].add(task.taskId);
      scheduler['taskOwners'].set(task.taskId, task.agentId);
      graph.updateStatus(task.taskId, DependencyNodeStatus.EXECUTING);

      // ATTACK: Unauthorized agent tries to fail the task
      expect(() => {
        scheduler.onTaskFailed(task.taskId, new Error('Malicious failure'), 'attacker-agent');
      }).toThrow(/Unauthorized task failure report/);

      // Verify: Task still owned by original agent
      expect(scheduler['taskOwners'].get(task.taskId)).toBe('agent-alpha');
      expect(graph.nodes.get(task.taskId).status).toBe(DependencyNodeStatus.EXECUTING);
    });

    test('should reject unauthorized completion reports', () => {
      // Setup
      graph.addNode({
        taskId: 'task-2',
        agentId: 'agent-beta',
        priority: 1,
        dependencies: []
      });

      const task = graph.getReadyTasks()[0];
      scheduler['runningTasks'].add(task.taskId);
      scheduler['taskOwners'].set(task.taskId, task.agentId);
      graph.updateStatus(task.taskId, DependencyNodeStatus.EXECUTING);

      // ATTACK: Unauthorized agent tries to complete the task
      expect(() => {
        scheduler.onTaskCompleted(task.taskId, 'attacker-agent');
      }).toThrow(/Unauthorized task completion/);

      // Verify: Task still in running state
      expect(scheduler['taskOwners'].get(task.taskId)).toBe('agent-beta');
      expect(graph.nodes.get(task.taskId).status).toBe(DependencyNodeStatus.EXECUTING);
    });

    test('should allow legitimate owner to report failure', () => {
      // Setup
      graph.addNode({
        taskId: 'task-3',
        agentId: 'agent-gamma',
        priority: 1,
        dependencies: []
      });

      const task = graph.getReadyTasks()[0];
      scheduler['runningTasks'].add(task.taskId);
      scheduler['taskOwners'].set(task.taskId, task.agentId);
      graph.updateStatus(task.taskId, DependencyNodeStatus.EXECUTING);

      // Legitimate owner reports failure
      expect(() => {
        scheduler.onTaskFailed(task.taskId, new Error('Legitimate failure'), 'agent-gamma');
      }).not.toThrow();

      // Verify: Task is ready for retry (first failure of 3 retries)
      expect(scheduler['taskOwners'].has(task.taskId)).toBe(false); // Ownership cleaned up
      expect(graph.nodes.get(task.taskId).status).toBe(DependencyNodeStatus.READY);
      expect(scheduler.getRetryCount(task.taskId)).toBe(1);
    });

    test('should allow legitimate owner to complete task', () => {
      // Setup
      graph.addNode({
        taskId: 'task-4',
        agentId: 'agent-delta',
        priority: 1,
        dependencies: []
      });

      const task = graph.getReadyTasks()[0];
      scheduler['runningTasks'].add(task.taskId);
      scheduler['taskOwners'].set(task.taskId, task.agentId);
      graph.updateStatus(task.taskId, DependencyNodeStatus.EXECUTING);

      // Legitimate owner completes task
      expect(() => {
        scheduler.onTaskCompleted(task.taskId, 'agent-delta');
      }).not.toThrow();

      // Verify: Task completed and ownership cleaned up
      expect(scheduler['taskOwners'].has(task.taskId)).toBe(false);
      expect(graph.nodes.get(task.taskId).status).toBe(DependencyNodeStatus.COMPLETED);
    });

    test('should maintain backward compatibility (no callerId)', () => {
      // Setup
      graph.addNode({
        taskId: 'task-5',
        agentId: 'agent-epsilon',
        priority: 1,
        dependencies: []
      });

      const task = graph.getReadyTasks()[0];
      scheduler['runningTasks'].add(task.taskId);
      scheduler['taskOwners'].set(task.taskId, task.agentId);
      graph.updateStatus(task.taskId, DependencyNodeStatus.EXECUTING);

      // Legacy call without callerId (backward compatible)
      expect(() => {
        scheduler.onTaskFailed(task.taskId, new Error('Legacy failure'));
      }).not.toThrow();

      expect(() => {
        scheduler.onTaskCompleted(task.taskId);
      }).not.toThrow();
    });
  });

  describe('DoS Attack Mitigation', () => {
    test('should prevent retry exhaustion via unauthorized reports', () => {
      // Setup
      graph.addNode({
        taskId: 'task-6',
        agentId: 'agent-zeta',
        priority: 1,
        dependencies: []
      });

      const task = graph.getReadyTasks()[0];
      scheduler['runningTasks'].add(task.taskId);
      scheduler['taskOwners'].set(task.taskId, task.agentId);
      graph.updateStatus(task.taskId, DependencyNodeStatus.EXECUTING);

      // ATTACK: Attacker tries to exhaust retries (3 limit)
      for (let i = 0; i < 5; i++) {
        expect(() => {
          scheduler.onTaskFailed(task.taskId, new Error(`DoS attempt ${i}`), 'attacker-agent');
        }).toThrow(/Unauthorized/);
      }

      // Verify: Retry count unchanged (attack failed)
      expect(scheduler.getRetryCount(task.taskId)).toBe(0);
      expect(graph.nodes.get(task.taskId).status).toBe(DependencyNodeStatus.EXECUTING);
    });

    test('should enforce retry limits only for legitimate owner', () => {
      // Setup
      graph.addNode({
        taskId: 'task-7',
        agentId: 'agent-eta',
        priority: 1,
        dependencies: []
      });

      const task = graph.getReadyTasks()[0];
      scheduler['taskOwners'].set(task.taskId, task.agentId);

      // Simulate 3 legitimate failures (exhaust retry limit)
      for (let i = 0; i < 3; i++) {
        scheduler['runningTasks'].add(task.taskId);
        graph.updateStatus(task.taskId, DependencyNodeStatus.EXECUTING);
        scheduler.onTaskFailed(task.taskId, new Error(`Failure ${i + 1}`), 'agent-eta');
      }

      // Verify: Task marked as FAILED after 3 retries
      expect(scheduler.getRetryCount(task.taskId)).toBe(3);
      expect(graph.nodes.get(task.taskId).status).toBe(DependencyNodeStatus.FAILED);
    });
  });

  describe('Security Checklist Validation', () => {
    test('SEC-005 comprehensive security validation', () => {
      const results = {
        ownershipTracking: false,
        unauthorizedFailureRejected: false,
        unauthorizedCompletionRejected: false,
        authorizedFailureAllowed: false,
        authorizedCompletionAllowed: false,
        cleanupOnFailure: false,
        cleanupOnCompletion: false,
        backwardCompatible: false,
        dosAttackMitigated: false
      };

      // Test 1: Ownership Tracking
      graph.addNode({
        taskId: 'sec-task-1',
        agentId: 'agent-secure',
        priority: 1,
        dependencies: []
      });

      const task = graph.getReadyTasks()[0];
      scheduler['runningTasks'].add(task.taskId);
      scheduler['taskOwners'].set(task.taskId, task.agentId);
      results.ownershipTracking = scheduler['taskOwners'].has(task.taskId);

      // Test 2: Unauthorized Failure Rejection
      try {
        scheduler.onTaskFailed(task.taskId, new Error('Test'), 'attacker');
        results.unauthorizedFailureRejected = false;
      } catch (err) {
        results.unauthorizedFailureRejected = err.message.includes('Unauthorized');
      }

      // Test 3: Unauthorized Completion Rejection
      try {
        scheduler.onTaskCompleted(task.taskId, 'attacker');
        results.unauthorizedCompletionRejected = false;
      } catch (err) {
        results.unauthorizedCompletionRejected = err.message.includes('Unauthorized');
      }

      // Test 4: Authorized Failure Allowed
      try {
        scheduler.onTaskFailed(task.taskId, new Error('Legitimate'), 'agent-secure');
        results.authorizedFailureAllowed = true;
        results.cleanupOnFailure = !scheduler['taskOwners'].has(task.taskId);
      } catch (err) {
        results.authorizedFailureAllowed = false;
      }

      // Test 5: Authorized Completion Allowed
      graph.addNode({
        taskId: 'sec-task-2',
        agentId: 'agent-secure-2',
        priority: 1,
        dependencies: []
      });
      const task2 = graph.nodes.get('sec-task-2');
      scheduler['runningTasks'].add(task2.taskId);
      scheduler['taskOwners'].set(task2.taskId, task2.agentId);
      graph.updateStatus(task2.taskId, DependencyNodeStatus.EXECUTING);

      try {
        scheduler.onTaskCompleted(task2.taskId, 'agent-secure-2');
        results.authorizedCompletionAllowed = true;
        results.cleanupOnCompletion = !scheduler['taskOwners'].has(task2.taskId);
      } catch (err) {
        results.authorizedCompletionAllowed = false;
      }

      // Test 6: Backward Compatibility
      graph.addNode({
        taskId: 'sec-task-3',
        agentId: 'agent-secure-3',
        priority: 1,
        dependencies: []
      });
      const task3 = graph.nodes.get('sec-task-3');
      scheduler['runningTasks'].add(task3.taskId);
      scheduler['taskOwners'].set(task3.taskId, task3.agentId);
      graph.updateStatus(task3.taskId, DependencyNodeStatus.EXECUTING);

      try {
        scheduler.onTaskCompleted(task3.taskId); // No callerId
        results.backwardCompatible = true;
      } catch (err) {
        results.backwardCompatible = false;
      }

      // Test 7: DoS Attack Mitigation
      graph.addNode({
        taskId: 'sec-task-4',
        agentId: 'agent-secure-4',
        priority: 1,
        dependencies: []
      });
      const task4 = graph.nodes.get('sec-task-4');
      scheduler['runningTasks'].add(task4.taskId);
      scheduler['taskOwners'].set(task4.taskId, task4.agentId);
      graph.updateStatus(task4.taskId, DependencyNodeStatus.EXECUTING);

      let attacksBlocked = 0;
      for (let i = 0; i < 5; i++) {
        try {
          scheduler.onTaskFailed(task4.taskId, new Error('Attack'), 'attacker');
        } catch (err) {
          if (err.message.includes('Unauthorized')) {
            attacksBlocked++;
          }
        }
      }
      results.dosAttackMitigated = (attacksBlocked === 5);

      // Assert all security checks passed
      expect(results.ownershipTracking).toBe(true);
      expect(results.unauthorizedFailureRejected).toBe(true);
      expect(results.unauthorizedCompletionRejected).toBe(true);
      expect(results.authorizedFailureAllowed).toBe(true);
      expect(results.authorizedCompletionAllowed).toBe(true);
      expect(results.cleanupOnFailure).toBe(true);
      expect(results.cleanupOnCompletion).toBe(true);
      expect(results.backwardCompatible).toBe(true);
      expect(results.dosAttackMitigated).toBe(true);

      // Summary
      console.log('✅ SEC-005 Security Validation: ALL CHECKS PASSED');
      console.log('   - Task ownership tracking: ENABLED');
      console.log('   - Unauthorized failure rejection: ACTIVE');
      console.log('   - Unauthorized completion rejection: ACTIVE');
      console.log('   - Authorized operations: ALLOWED');
      console.log('   - Ownership cleanup: FUNCTIONAL');
      console.log('   - Backward compatibility: MAINTAINED');
      console.log('   - DoS attack mitigation: EFFECTIVE');
    });
  });
});
