/**
 * Workflow Reflections Generator Test Suite
 * Tests workflow reflection and analysis generation
 *
 * Migration from: docker/tests/mocks/generate-workflow-reflections.sh
 */

import { describe, it, expect, beforeEach } from '@jest/globals';

interface WorkflowReflection {
  id: string;
  workflowId: string;
  executionId: string;
  timestamp: Date;
  duration: number;
  status: 'success' | 'partial' | 'failure';
  insights: string[];
  metrics: Record<string, number>;
  recommendations: string[];
}

class WorkflowReflectionsGenerator {
  /**
   * Generate workflow reflection
   */
  generateReflection(
    workflowId: string,
    executionId: string,
    duration: number,
    status: 'success' | 'partial' | 'failure' = 'success',
    insights: string[] = [],
    metrics: Record<string, number> = {}
  ): WorkflowReflection {
    const recommendations = this.generateRecommendations(status, insights);

    return {
      id: `reflection-${Date.now()}-${Math.random()}`,
      workflowId,
      executionId,
      timestamp: new Date(),
      duration,
      status,
      insights,
      metrics,
      recommendations
    };
  }

  /**
   * Generate recommendations based on status
   */
  private generateRecommendations(
    status: string,
    insights: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (status === 'failure') {
      recommendations.push('Review error logs for root cause');
      recommendations.push('Consider retrying with adjusted parameters');
    }

    if (status === 'partial') {
      recommendations.push('Investigate incomplete execution paths');
      recommendations.push('Validate intermediate results');
    }

    if (insights.includes('slow')) {
      recommendations.push('Profile workflow for performance bottlenecks');
    }

    if (insights.includes('memory')) {
      recommendations.push('Review memory usage and optimize algorithms');
    }

    if (recommendations.length === 0) {
      recommendations.push('Workflow executed as expected');
    }

    return recommendations;
  }

  /**
   * Analyze workflow reflection
   */
  analyzeReflection(reflection: WorkflowReflection): {
    healthScore: number;
    issues: string[];
    opportunities: string[];
  } {
    const issues: string[] = [];
    const opportunities: string[] = [];
    let healthScore = 100;

    if (reflection.status === 'failure') {
      issues.push('Workflow failed');
      healthScore -= 50;
    }

    if (reflection.status === 'partial') {
      issues.push('Workflow partially completed');
      healthScore -= 25;
    }

    if (reflection.duration > 10000) {
      opportunities.push('Consider performance optimization');
      healthScore -= 10;
    }

    if (reflection.metrics['errorRate'] && reflection.metrics['errorRate'] > 0.1) {
      issues.push('High error rate detected');
      healthScore -= 15;
    }

    return {
      healthScore: Math.max(0, healthScore),
      issues,
      opportunities
    };
  }

  /**
   * Compare reflections
   */
  compareReflections(
    reflection1: WorkflowReflection,
    reflection2: WorkflowReflection
  ): {
    improvements: string[];
    regressions: string[];
    summary: string;
  } {
    const improvements: string[] = [];
    const regressions: string[] = [];

    if (reflection1.duration > reflection2.duration) {
      improvements.push(`Performance improved by ${((reflection1.duration - reflection2.duration) / reflection1.duration * 100).toFixed(1)}%`);
    } else if (reflection2.duration > reflection1.duration) {
      regressions.push(`Performance degraded by ${((reflection2.duration - reflection1.duration) / reflection2.duration * 100).toFixed(1)}%`);
    }

    if (reflection1.status === 'failure' && reflection2.status === 'success') {
      improvements.push('Fixed failing workflow');
    } else if (reflection1.status === 'success' && reflection2.status === 'failure') {
      regressions.push('Introduced workflow failure');
    }

    const summary = improvements.length > regressions.length
      ? `Overall improvement (${improvements.length} improvements, ${regressions.length} regressions)`
      : improvements.length === regressions.length
      ? 'No net change'
      : `Overall regression (${improvements.length} improvements, ${regressions.length} regressions)`;

    return { improvements, regressions, summary };
  }

  /**
   * Batch generate reflections
   */
  batchGenerate(
    count: number,
    workflowId: string,
    statusDistribution: { success: number; partial: number; failure: number }
  ): WorkflowReflection[] {
    const reflections: WorkflowReflection[] = [];
    const total = statusDistribution.success + statusDistribution.partial + statusDistribution.failure;

    for (let i = 0; i < count; i++) {
      let status: 'success' | 'partial' | 'failure' = 'success';
      const random = (i % total) + 1;

      if (random <= statusDistribution.success) {
        status = 'success';
      } else if (random <= statusDistribution.success + statusDistribution.partial) {
        status = 'partial';
      } else {
        status = 'failure';
      }

      const reflection = this.generateReflection(
        workflowId,
        `exec-${i}`,
        Math.random() * 5000 + 100,
        status,
        [],
        { successRate: Math.random() }
      );

      reflections.push(reflection);
    }

    return reflections;
  }

  /**
   * Serialize reflection to JSON
   */
  serialize(reflection: WorkflowReflection): string {
    return JSON.stringify({
      ...reflection,
      timestamp: reflection.timestamp.toISOString()
    }, null, 2);
  }

  /**
   * Deserialize reflection from JSON
   */
  deserialize(json: string): WorkflowReflection {
    const data = JSON.parse(json);
    return {
      ...data,
      timestamp: new Date(data.timestamp)
    };
  }
}

describe('Workflow Reflections Generator', () => {
  let generator: WorkflowReflectionsGenerator;

  beforeEach(() => {
    generator = new WorkflowReflectionsGenerator();
  });

  describe('Reflection Generation', () => {
    it('should generate workflow reflection', () => {
      const reflection = generator.generateReflection(
        'workflow-1',
        'exec-1',
        1000
      );

      expect(reflection.id).toBeDefined();
      expect(reflection.workflowId).toBe('workflow-1');
      expect(reflection.executionId).toBe('exec-1');
      expect(reflection.duration).toBe(1000);
      expect(reflection.status).toBe('success');
    });

    it('should include insights', () => {
      const insights = ['performance', 'stability'];
      const reflection = generator.generateReflection(
        'workflow-1',
        'exec-1',
        1000,
        'success',
        insights
      );

      expect(reflection.insights).toEqual(insights);
    });

    it('should include metrics', () => {
      const metrics = { cpu: 0.5, memory: 0.3 };
      const reflection = generator.generateReflection(
        'workflow-1',
        'exec-1',
        1000,
        'success',
        [],
        metrics
      );

      expect(reflection.metrics).toEqual(metrics);
    });

    it('should generate recommendations', () => {
      const reflection = generator.generateReflection(
        'workflow-1',
        'exec-1',
        1000,
        'failure'
      );

      expect(reflection.recommendations.length).toBeGreaterThan(0);
      expect(reflection.recommendations[0]).toContain('error');
    });

    it('should set timestamp', () => {
      const before = new Date();
      const reflection = generator.generateReflection(
        'workflow-1',
        'exec-1',
        1000
      );
      const after = new Date();

      expect(reflection.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(reflection.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Reflection Analysis', () => {
    it('should analyze successful reflection', () => {
      const reflection = generator.generateReflection(
        'workflow-1',
        'exec-1',
        1000,
        'success'
      );

      const analysis = generator.analyzeReflection(reflection);
      expect(analysis.healthScore).toBeGreaterThan(80);
      expect(analysis.issues).toHaveLength(0);
    });

    it('should analyze failed reflection', () => {
      const reflection = generator.generateReflection(
        'workflow-1',
        'exec-1',
        1000,
        'failure'
      );

      const analysis = generator.analyzeReflection(reflection);
      expect(analysis.healthScore).toBeLessThan(50);
      expect(analysis.issues.length).toBeGreaterThan(0);
    });

    it('should analyze partial reflection', () => {
      const reflection = generator.generateReflection(
        'workflow-1',
        'exec-1',
        1000,
        'partial'
      );

      const analysis = generator.analyzeReflection(reflection);
      expect(analysis.healthScore).toBeLessThan(100);
      expect(analysis.issues).toContain('Workflow partially completed');
    });

    it('should detect performance issues', () => {
      const reflection = generator.generateReflection(
        'workflow-1',
        'exec-1',
        15000, // Slow
        'success'
      );

      const analysis = generator.analyzeReflection(reflection);
      expect(analysis.opportunities.length).toBeGreaterThan(0);
    });
  });

  describe('Reflection Comparison', () => {
    it('should compare two reflections', () => {
      const ref1 = generator.generateReflection('workflow-1', 'exec-1', 2000);
      const ref2 = generator.generateReflection('workflow-1', 'exec-2', 1000);

      const comparison = generator.compareReflections(ref1, ref2);
      expect(comparison.improvements.length).toBeGreaterThan(0);
      expect(comparison.summary).toBeDefined();
    });

    it('should detect regressions', () => {
      const ref1 = generator.generateReflection('workflow-1', 'exec-1', 1000, 'success');
      const ref2 = generator.generateReflection('workflow-1', 'exec-2', 1000, 'failure');

      const comparison = generator.compareReflections(ref1, ref2);
      expect(comparison.regressions.length).toBeGreaterThan(0);
    });

    it('should detect improvements', () => {
      const ref1 = generator.generateReflection('workflow-1', 'exec-1', 1000, 'failure');
      const ref2 = generator.generateReflection('workflow-1', 'exec-2', 1000, 'success');

      const comparison = generator.compareReflections(ref1, ref2);
      expect(comparison.improvements.length).toBeGreaterThan(0);
    });
  });

  describe('Batch Generation', () => {
    it('should batch generate reflections', () => {
      const reflections = generator.batchGenerate(5, 'workflow-1', {
        success: 3,
        partial: 1,
        failure: 1
      });

      expect(reflections).toHaveLength(5);
      expect(reflections[0].workflowId).toBe('workflow-1');
    });

    it('should respect status distribution', () => {
      const reflections = generator.batchGenerate(100, 'workflow-1', {
        success: 70,
        partial: 20,
        failure: 10
      });

      const statuses = reflections.map(r => r.status);
      expect(statuses.filter(s => s === 'success').length).toBeGreaterThan(50);
    });
  });

  describe('Serialization', () => {
    it('should serialize reflection to JSON', () => {
      const reflection = generator.generateReflection(
        'workflow-1',
        'exec-1',
        1000
      );

      const json = generator.serialize(reflection);
      expect(typeof json).toBe('string');
      expect(json).toContain('workflow-1');
    });

    it('should deserialize reflection from JSON', () => {
      const original = generator.generateReflection(
        'workflow-1',
        'exec-1',
        1000,
        'success',
        ['test']
      );

      const json = generator.serialize(original);
      const restored = generator.deserialize(json);

      expect(restored.workflowId).toBe(original.workflowId);
      expect(restored.status).toBe(original.status);
      expect(restored.insights).toEqual(original.insights);
    });
  });
});
