import { describe, it, expect } from 'vitest';
import { validateCFNDecision } from '../../src/cfn-loop/validate-cfn-decision';
import { Decision, CFNContext } from '../../src/cfn-loop/validation-rules';

describe('CFN Decision Validation', () => {
  describe('LOOP without permission validation', () => {
    it('should reject LOOP decision with permission request', async () => { try {
      const decision: Decision = {
        action: 'LOOP',
        requestedPermission: true,
      };
      const context: CFNContext = {
        mode: 'standard',
        iteration: 3,
        consensus: 0.82,
      };

      const result = await validateCFNDecision(decision, context);

      expect(result.valid).toBe(false);
      expect(result.violations?.[0]?.rule).toBe(
        'LOOP without permission check'
      );
      expect(result.corrected).toBe(true);
      expect(result.decision.requestedPermission).toBe(false);
      expect(result.decision.executeImmediately).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should accept LOOP decision without permission request', async () => { try {
      const decision: Decision = {
        action: 'LOOP',
        executeImmediately: true,
      };
      const context: CFNContext = {
        mode: 'standard',
        iteration: 3,
        consensus: 0.82,
      };

      const result = await validateCFNDecision(decision, context);

      expect(result.valid).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Iteration limit enforcement', () => {
    it('should force ESCALATE when max iterations reached', async () => { try {
      const decision: Decision = { action: 'LOOP' };
      const context: CFNContext = {
        mode: 'standard',
        iteration: 10,
        consensus: 0.82,
      };

      const result = await validateCFNDecision(decision, context);

      expect(result.valid).toBe(false);
      expect(result.corrected).toBe(true);
      expect(result.decision.action).toBe('ESCALATE');
      expect(result.decision.reason).toContain('Max iterations');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should allow ESCALATE when max iterations reached', async () => { try {
      const decision: Decision = {
        action: 'ESCALATE',
        reason: 'Max iterations',
      };
      const context: CFNContext = {
        mode: 'standard',
        iteration: 10,
        consensus: 0.82,
      };

      const result = await validateCFNDecision(decision, context);

      expect(result.valid).toBe(true);
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Consensus threshold alignment', () => {
    it('should reject LOOP when consensus above threshold', async () => { try {
      const decision: Decision = { action: 'LOOP' };
      const context: CFNContext = {
        mode: 'standard',
        iteration: 5,
        consensus: 0.95,
      };

      const result = await validateCFNDecision(decision, context);

      expect(result.valid).toBe(false);
      expect(result.corrected).toBe(true);
      expect(result.decision.action).toBe('PROCEED');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should reject PROCEED when consensus below threshold', async () => { try {
      const decision: Decision = { action: 'PROCEED' };
      const context: CFNContext = {
        mode: 'standard',
        iteration: 5,
        consensus: 0.75,
      };

      const result = await validateCFNDecision(decision, context);

      expect(result.valid).toBe(false);
      expect(result.corrected).toBe(true);
      expect(result.decision.action).toBe('LOOP');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
