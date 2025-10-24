// tests/cfn-loop/compliance-monitor.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createClient } from 'redis';
import { CFNComplianceMonitor } from '../../src/cfn-loop/cfn-compliance-monitor.js';
import { CorrectionPublisher } from '../../src/cfn-loop/correction-publisher.js';

describe('CFN Compliance Monitor', () => {
  let monitor: CFNComplianceMonitor;
  let publisher: CorrectionPublisher;
  let redisClient: any;
  const testRedisUrl = 'redis://localhost:6379';

  beforeEach(async () => { try {
    monitor = new CFNComplianceMonitor({
      redisUrl: testRedisUrl,
      autoCorrect: true,
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    publisher = new CorrectionPublisher(testRedisUrl);
    redisClient = createClient({ url: testRedisUrl } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    await redisClient.connect();
    await monitor.start();
    await publisher.connect();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  afterEach(async () => { try {
    await monitor.stop();
    await publisher.disconnect();
    await redisClient.quit();
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Violation Detection', () => {
    it('should detect iteration limit violation', async () => { try {
      const decision = {
        action: 'LOOP',
        context: {
          mode: 'standard',
          iteration: 11,
          maxIterations: 10,
          consensus: 0.85,
        },
      };

      await redisClient.publish(
        'cfn:coordinator:test-coord:decisions',
        JSON.stringify(decision)
      );

      await new Promise((resolve) => setTimeout(resolve, 200));

      const violations = await monitor.getViolations('test-coord');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].rule).toBe('Iteration Limit Exceeded');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should detect consensus threshold violation', async () => { try {
      const decision = {
        action: 'LOOP',
        context: {
          mode: 'standard',
          iteration: 5,
          maxIterations: 10,
          consensus: 0.8,
        },
      };

      await redisClient.publish(
        'cfn:coordinator:test-coord:decisions',
        JSON.stringify(decision)
      );

      await new Promise((resolve) => setTimeout(resolve, 200));

      const violations = await monitor.getViolations('test-coord');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].rule).toBe('Consensus Threshold Not Met');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

    it('should detect unexpected permission request', async () => { try {
      const decision = {
        action: 'LOOP',
        requestedPermission: true,
        context: {
          mode: 'standard',
          iteration: 5,
          maxIterations: 10,
          consensus: 0.9,
        },
      };

      await redisClient.publish(
        'cfn:coordinator:test-coord:decisions',
        JSON.stringify(decision)
      );

      await new Promise((resolve) => setTimeout(resolve, 200));

      const violations = await monitor.getViolations('test-coord');
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].rule).toBe('Unexpected Permission Request');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Correction Publishing', () => {
    it('should publish correction for critical violations', async () => { try {
      const decision = {
        action: 'LOOP',
        context: {
          mode: 'standard',
          iteration: 11,
          maxIterations: 10,
          consensus: 0.85,
        },
      };

      const correctionPromise = new Promise((resolve) => {
        const subscriber = createClient({ url: testRedisUrl } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
        subscriber.connect()await ( => {
          subscriber.subscribe(
            'cfn:coordinator:test-coord:corrections',
            (message) => {
              const correction = JSON.parse(message);
              resolve(correction);
            }
          );
        } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
      } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

      await redisClient.publish(
        'cfn:coordinator:test-coord:decisions',
        JSON.stringify(decision)
      );

      const correction: any = await Promise.race([
        correctionPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 2000)
        ),
      ]);

      expect(correction).toBeDefined();
      expect(correction.violations[0].rule).toBe('Iteration Limit Exceeded');
      expect(correction.correctedDecision.action).toBe('TERMINATE');
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});

  describe('Violation History', () => {
    it('should maintain violation log', async () => { try {
      const decisions = [
        {
          action: 'LOOP',
          context: {
            mode: 'standard',
            iteration: 11,
            maxIterations: 10,
            consensus: 0.85,
          },
        },
        {
          action: 'LOOP',
          requestedPermission: true,
          context: {
            mode: 'standard',
            iteration: 5,
            maxIterations: 10,
            consensus: 0.8,
          },
        },
      ];

      for (const decision of decisions) {
        await redisClient.publish(
          'cfn:coordinator:test-coord:decisions',
          JSON.stringify(decision)
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 500));

      const violations = await monitor.getViolations('test-coord');
      expect(violations.length).toBe(2);
      expect(
        violations.some((v) => v.rule === 'Iteration Limit Exceeded')
      ).toBeTruthy();
      expect(
        violations.some((v) => v.rule === 'Unexpected Permission Request')
      ).toBeTruthy();
    } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
  } catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
} catch (error) { console.error(`Test failed: ${error.message}`); throw error; }});
