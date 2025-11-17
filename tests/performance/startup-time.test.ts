/**
 * Performance Test: System Startup Time
 *
 * Target SLA: <2s for system initialization
 *
 * Tests:
 * - Coordination layer startup
 * - Component instantiation
 * - Complete system startup
 */

import { describe, it, expect } from '@jest/globals';
import { RedisCoordination } from '../../src/coordination';

describe('Startup Time Performance', () => {
  it('should establish coordination layer within 300ms', async () => {
    const start = Date.now();

    const coordination = new RedisCoordination({
      host: 'localhost',
      port: 6379,
    });

    await coordination.connect();
    const duration = Date.now() - start;

    await coordination.disconnect();

    expect(duration).toBeLessThan(300);
  });

  it('should handle concurrent coordination connections efficiently', async () => {
    const start = Date.now();

    const promises = [];

    for (let i = 0; i < 5; i++) {
      promises.push(
        (async () => {
          const coord = new RedisCoordination({
            host: 'localhost',
            port: 6379,
          });
          await coord.connect();
          await coord.disconnect();
        })()
      );
    }

    await Promise.all(promises);
    const duration = Date.now() - start;

    // 5 concurrent connections should complete within 1.5s
    expect(duration).toBeLessThan(1500);
  });

  it('should instantiate coordination layer quickly', () => {
    const start = Date.now();

    for (let i = 0; i < 100; i++) {
      const coordination = new RedisCoordination({
        host: 'localhost',
        port: 6379,
      });
    }

    const duration = Date.now() - start;

    // 100 instantiations should be very fast (<100ms)
    expect(duration).toBeLessThan(100);
  });

  it('should maintain startup performance under load', async () => {
    const startupTimes: number[] = [];

    for (let i = 0; i < 10; i++) {
      const start = Date.now();

      const coordination = new RedisCoordination({
        host: 'localhost',
        port: 6379,
      });

      await coordination.connect();
      const duration = Date.now() - start;
      startupTimes.push(duration);
      await coordination.disconnect();
    }

    const avgStartupTime = startupTimes.reduce((a, b) => a + b, 0) / startupTimes.length;
    const maxStartupTime = Math.max(...startupTimes);

    // Average startup should be <100ms, max should be <300ms
    expect(avgStartupTime).toBeLessThan(100);
    expect(maxStartupTime).toBeLessThan(300);
  });

  it('should provide cold-start time measurement', async () => {
    const start = Date.now();

    // Simulate fresh coordination layer creation
    const coordination = new RedisCoordination({
      host: 'localhost',
      port: 6379,
    });

    // Connection is the expensive operation
    await coordination.connect();

    const coldStartDuration = Date.now() - start;

    await coordination.disconnect();

    // Cold start should complete within SLA
    expect(coldStartDuration).toBeLessThan(500);
  });
});
