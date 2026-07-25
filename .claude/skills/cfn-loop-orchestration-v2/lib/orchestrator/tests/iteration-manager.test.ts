/**
 * Iteration Manager Tests
 * Tests for managing CFN Loop iteration transitions and feedback
 */

import { prepareIteration, wakeAgents } from '../src/helpers/iteration-manager';

describe('iteration-manager', () => {
  describe('prepareIteration', () => {
    it('should increment iteration number', () => {
      const result = prepareIteration({
        currentIteration: 1,
        feedback: { issues: ['Fix tests'] }
      });

      expect(result.nextIteration).toBe(2);
      expect(result.feedback).toBeDefined();
      expect(result.feedback.issues).toEqual(['Fix tests']);
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
    });

    it('should handle iteration 0 to 1 transition', () => {
      const result = prepareIteration({
        currentIteration: 0,
        feedback: { message: 'Initial iteration' }
      });

      expect(result.nextIteration).toBe(1);
    });

    it('should handle high iteration numbers', () => {
      const result = prepareIteration({
        currentIteration: 15,
        feedback: {}
      });

      expect(result.nextIteration).toBe(16);
    });

    it('should preserve feedback structure', () => {
      const complexFeedback = {
        issues: ['Issue 1', 'Issue 2'],
        suggestions: ['Suggestion 1'],
        metadata: { validator: 'code-reviewer', confidence: 0.85 }
      };

      const result = prepareIteration({
        currentIteration: 3,
        feedback: complexFeedback
      });

      expect(result.feedback).toEqual(complexFeedback);
    });

    it('should allow empty feedback', () => {
      const result = prepareIteration({
        currentIteration: 2,
        feedback: {}
      });

      expect(result.nextIteration).toBe(3);
      expect(result.feedback).toEqual({});
    });

    it('should generate valid timestamp', () => {
      const result = prepareIteration({
        currentIteration: 1,
        feedback: {}
      });

      const timestamp = new Date(result.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');
    });
  });

  describe('wakeAgents', () => {
    it('should prepare wake signals for single agent', () => {
      const result = wakeAgents(['backend-dev-001']);

      expect(result.signals).toHaveLength(1);
      expect(result.signals[0]).toContain('backend-dev-001');
    });

    it('should prepare wake signals for multiple agents', () => {
      const agentIds = ['backend-dev-001', 'code-reviewer-002', 'tester-003'];
      const result = wakeAgents(agentIds);

      expect(result.signals).toHaveLength(3);
      expect(result.signals[0]).toContain('backend-dev-001');
      expect(result.signals[1]).toContain('code-reviewer-002');
      expect(result.signals[2]).toContain('tester-003');
    });

    it('should handle empty agent list', () => {
      const result = wakeAgents([]);

      expect(result.signals).toEqual([]);
    });

    it('should generate unique signals for each agent', () => {
      const agentIds = ['agent-1', 'agent-2', 'agent-3'];
      const result = wakeAgents(agentIds);

      const uniqueSignals = new Set(result.signals);
      expect(uniqueSignals.size).toBe(3);
    });

    it('should include agent ID in each signal', () => {
      const agentIds = ['test-agent-123'];
      const result = wakeAgents(agentIds);

      expect(result.signals[0]).toContain('test-agent-123');
    });
  });

  describe('integration: prepareIteration + wakeAgents', () => {
    it('should support iteration workflow', () => {
      // Prepare next iteration
      const iteration = prepareIteration({
        currentIteration: 2,
        feedback: { issues: ['Fix validation'] }
      });

      expect(iteration.nextIteration).toBe(3);

      // Wake agents for next iteration
      const wake = wakeAgents(['dev-1', 'validator-1']);

      expect(wake.signals).toHaveLength(2);
    });
  });
});
