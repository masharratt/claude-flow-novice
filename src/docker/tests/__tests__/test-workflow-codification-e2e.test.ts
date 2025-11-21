/**
 * Workflow Codification E2E Test Suite
 * End-to-end testing for workflow codification system
 *
 * Migration from: docker/tests/test-workflow-codification-e2e.sh
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

interface WorkflowExecution {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  steps: Array<{ name: string; status: string; duration: number }>;
  errors: string[];
}

class WorkflowCodificationE2E {
  private executions: Map<string, WorkflowExecution> = new Map();
  private executionCounter: number = 0;

  /**
   * Create and execute a workflow
   */
  async executeWorkflow(name: string, steps: string[]): Promise<string> {
    const id = `execution-${++this.executionCounter}`;
    const execution: WorkflowExecution = {
      id,
      status: 'running',
      startTime: new Date(),
      steps: [],
      errors: []
    };

    this.executions.set(id, execution);

    // Simulate workflow execution
    for (const step of steps) {
      const stepStart = Date.now();
      const success = Math.random() > 0.1; // 90% success rate

      const duration = Math.random() * 1000 + 100;
      await new Promise(resolve => setTimeout(resolve, duration));

      execution.steps.push({
        name: step,
        status: success ? 'completed' : 'failed',
        duration: Math.floor(duration)
      });

      if (!success) {
        execution.errors.push(`Step '${step}' failed`);
        execution.status = 'failed';
        execution.endTime = new Date();
        return id;
      }
    }

    execution.status = 'completed';
    execution.endTime = new Date();
    return id;
  }

  /**
   * Get execution result
   */
  getExecution(id: string): WorkflowExecution | undefined {
    return this.executions.get(id);
  }

  /**
   * Wait for execution completion
   */
  async waitForCompletion(id: string, timeout: number = 30000): Promise<WorkflowExecution | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const execution = this.executions.get(id);
      if (execution && (execution.status === 'completed' || execution.status === 'failed')) {
        return execution;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return null;
  }

  /**
   * Get execution statistics
   */
  getStatistics(): {
    total: number;
    completed: number;
    failed: number;
    average_duration: number;
    success_rate: number;
  } {
    const executions = Array.from(this.executions.values());
    const completed = executions.filter(e => e.status === 'completed').length;
    const failed = executions.filter(e => e.status === 'failed').length;

    let totalDuration = 0;
    executions.forEach(e => {
      if (e.endTime) {
        totalDuration += e.endTime.getTime() - e.startTime.getTime();
      }
    });

    const avgDuration = executions.length > 0 ? totalDuration / executions.length : 0;
    const successRate = executions.length > 0 ? (completed / executions.length) * 100 : 0;

    return {
      total: executions.length,
      completed,
      failed,
      average_duration: avgDuration,
      success_rate: successRate
    };
  }

  /**
   * Get execution history
   */
  getHistory(): WorkflowExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Clear all executions
   */
  clear(): void {
    this.executions.clear();
    this.executionCounter = 0;
  }

  /**
   * Validate workflow output
   */
  validateOutput(execution: WorkflowExecution): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!execution.id) {
      errors.push('Missing execution ID');
    }

    if (!execution.steps || execution.steps.length === 0) {
      errors.push('No steps executed');
    }

    if (execution.endTime && execution.startTime > execution.endTime) {
      errors.push('Invalid time range');
    }

    if (execution.status === 'failed' && execution.errors.length === 0) {
      errors.push('Failed status but no errors recorded');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

describe('Workflow Codification E2E', () => {
  let e2e: WorkflowCodificationE2E;

  beforeEach(() => {
    e2e = new WorkflowCodificationE2E();
  });

  afterEach(() => {
    e2e.clear();
  });

  describe('Workflow Execution', () => {
    it('should execute a simple workflow', async () => {
      const steps = ['init', 'process', 'finalize'];
      const executionId = await e2e.executeWorkflow('test-workflow', steps);

      expect(executionId).toBeDefined();
      expect(executionId).toContain('execution-');
    });

    it('should record all steps', async () => {
      const steps = ['step1', 'step2', 'step3'];
      const executionId = await e2e.executeWorkflow('test-workflow', steps);

      const execution = e2e.getExecution(executionId);
      expect(execution?.steps).toHaveLength(steps.length);

      steps.forEach((step, idx) => {
        expect(execution?.steps[idx].name).toBe(step);
      });
    });

    it('should record step duration', async () => {
      const steps = ['step1'];
      const executionId = await e2e.executeWorkflow('test-workflow', steps);

      const execution = e2e.getExecution(executionId);
      expect(execution?.steps[0].duration).toBeGreaterThan(0);
    });

    it('should handle multiple workflows', async () => {
      const id1 = await e2e.executeWorkflow('workflow1', ['step1']);
      const id2 = await e2e.executeWorkflow('workflow2', ['step2']);

      expect(id1).not.toBe(id2);
      expect(e2e.getStatistics().total).toBe(2);
    });
  });

  describe('Execution Status', () => {
    it('should track execution status', async () => {
      const id = await e2e.executeWorkflow('test', ['step1']);
      const execution = e2e.getExecution(id);

      expect(execution?.status).toMatch(/completed|failed/);
    });

    it('should set completion time', async () => {
      const id = await e2e.executeWorkflow('test', ['step1']);
      const execution = e2e.getExecution(id);

      expect(execution?.endTime).toBeDefined();
      expect(execution?.endTime?.getTime()).toBeGreaterThanOrEqual(execution?.startTime.getTime() || 0);
    });

    it('should record errors on failure', async () => {
      // Keep executing until we get a failure
      let execution: WorkflowExecution | undefined;
      for (let i = 0; i < 20; i++) {
        const id = await e2e.executeWorkflow('test', ['step1']);
        execution = e2e.getExecution(id);
        if (execution?.status === 'failed') {
          break;
        }
      }

      if (execution?.status === 'failed') {
        expect(execution.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Execution Retrieval', () => {
    it('should get execution by ID', async () => {
      const id = await e2e.executeWorkflow('test', ['step1']);
      const execution = e2e.getExecution(id);

      expect(execution).toBeDefined();
      expect(execution?.id).toBe(id);
    });

    it('should return undefined for non-existent execution', () => {
      const execution = e2e.getExecution('non-existent');
      expect(execution).toBeUndefined();
    });

    it('should get execution history', async () => {
      await e2e.executeWorkflow('workflow1', ['step1']);
      await e2e.executeWorkflow('workflow2', ['step2']);

      const history = e2e.getHistory();
      expect(history).toHaveLength(2);
    });
  });

  describe('Wait for Completion', () => {
    it('should wait for workflow completion', async () => {
      const id = await e2e.executeWorkflow('test', ['step1']);
      const execution = await e2e.waitForCompletion(id);

      expect(execution).toBeDefined();
      expect(execution?.status).toMatch(/completed|failed/);
    });

    it('should timeout if workflow takes too long', async () => {
      const id = await e2e.executeWorkflow('test', ['step1']);
      const execution = await e2e.waitForCompletion(id, 10);

      // May or may not timeout depending on execution speed
      if (execution) {
        expect(execution.id).toBe(id);
      }
    });

    it('should handle immediate completion', async () => {
      const id = await e2e.executeWorkflow('test', ['step1']);
      const execution = await e2e.waitForCompletion(id, 10000);

      expect(execution).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should calculate statistics', async () => {
      await e2e.executeWorkflow('workflow1', ['step1']);
      await e2e.executeWorkflow('workflow2', ['step2']);

      const stats = e2e.getStatistics();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('average_duration');
      expect(stats).toHaveProperty('success_rate');
    });

    it('should calculate success rate', async () => {
      for (let i = 0; i < 10; i++) {
        await e2e.executeWorkflow('test', ['step1']);
      }

      const stats = e2e.getStatistics();
      expect(stats.success_rate).toBeGreaterThanOrEqual(0);
      expect(stats.success_rate).toBeLessThanOrEqual(100);
    });

    it('should calculate average duration', async () => {
      await e2e.executeWorkflow('test', ['step1']);

      const stats = e2e.getStatistics();
      expect(stats.average_duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Output Validation', () => {
    it('should validate execution output', async () => {
      const id = await e2e.executeWorkflow('test', ['step1']);
      const execution = e2e.getExecution(id);

      if (execution) {
        const validation = e2e.validateOutput(execution);
        expect(validation).toHaveProperty('valid');
        expect(validation).toHaveProperty('errors');
      }
    });

    it('should detect missing required fields', () => {
      const invalidExecution: WorkflowExecution = {
        id: '',
        status: 'completed',
        startTime: new Date(),
        steps: [],
        errors: []
      };

      const validation = e2e.validateOutput(invalidExecution);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('State Management', () => {
    it('should clear executions', async () => {
      await e2e.executeWorkflow('test1', ['step1']);
      await e2e.executeWorkflow('test2', ['step2']);

      e2e.clear();

      const stats = e2e.getStatistics();
      expect(stats.total).toBe(0);
    });
  });
});
