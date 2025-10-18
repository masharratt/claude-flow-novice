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

  beforeEach(async () => {
    monitor = new CFNComplianceMonitor({
      redisUrl: testRedisUrl,
      autoCorrect: true,
    });

    publisher = new CorrectionPublisher(testRedisUrl);
    redisClient = createClient({ url: testRedisUrl });

    await redisClient.connect();
    await monitor.start();
    await publisher.connect();
  });

  afterEach(async () => {
    await monitor.stop();
    await publisher.disconnect();
    await redisClient.quit();
  });

  describe('Violation Detection', () => {
    it('should detect iteration limit violation', async () => {
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
    });

    it('should detect consensus threshold violation', async () => {
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
    });

    it('should detect unexpected permission request', async () => {
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
    });
  });

  describe('Correction Publishing', () => {
    it('should publish correction for critical violations', async () => {
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
        const subscriber = createClient({ url: testRedisUrl });
        subscriber.connect().then(() => {
          subscriber.subscribe(
            'cfn:coordinator:test-coord:corrections',
            (message) => {
              const correction = JSON.parse(message);
              resolve(correction);
            }
          );
        });
      });

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
    });
  });

  describe('Violation History', () => {
    it('should maintain violation log', async () => {
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
    });
  });
});
