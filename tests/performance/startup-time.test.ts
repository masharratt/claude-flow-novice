/**
 * Performance Test: System Startup Time
 *
 * Target SLA: <2s for system initialization
 *
 * Tests:
 * - Database service initialization
 * - Coordination layer startup
 * - Skill manager initialization
 * - Complete system cold start
 */

import { describe, it, expect } from '@jest/globals';
import { DatabaseService } from '../../src/lib/database-service';
import { RedisCoordination } from '../../src/coordination';
import { SkillContentManager } from '../../src/lib/skill-content-manager';
import { MetricsLogger } from '../../src/lib/metrics-logger';
import { AgentWorkspace } from '../../src/lib/agent-workspace';

describe('Startup Time Performance', () => {
  it('should initialize database service within 500ms', async () => {
    const start = Date.now();

    const dbService = new DatabaseService({
      redis: {
        type: 'redis',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
      sqlite: {
        type: 'sqlite',
        database: ':memory:',
      },
    });

    await dbService.initialize();
    const duration = Date.now() - start;

    await dbService.disconnect();

    expect(duration).toBeLessThan(500);
  });

  it('should establish coordination layer within 300ms', async () => {
    const start = Date.now();

    const coordination = new RedisCoordination({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });

    await coordination.connect();
    const duration = Date.now() - start;

    await coordination.disconnect();

    expect(duration).toBeLessThan(300);
  });

  it('should initialize skill manager within 200ms', async () => {
    const start = Date.now();

    const skillManager = new SkillContentManager({
      baseDir: '.test-skills-perf',
    });

    // Initialization is synchronous, measure instantiation
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(200);
  });

  it('should complete full system startup within 2s', async () => {
    const start = Date.now();

    // Initialize all core systems
    const dbService = new DatabaseService({
      redis: { type: 'redis', host: 'localhost', port: 6379 },
      sqlite: { type: 'sqlite', database: ':memory:' },
    });

    await dbService.initialize();

    const coordination = new RedisCoordination({
      host: 'localhost',
      port: 6379,
    });

    await coordination.connect();

    const metricsLogger = new MetricsLogger({
      enableRedis: true,
      enableSQLite: true,
    });

    const workspace = new AgentWorkspace({
      baseDir: '.test-workspace-perf',
    });

    await workspace.initialize();

    const skillManager = new SkillContentManager({
      baseDir: '.test-skills-perf',
    });

    const duration = Date.now() - start;

    // Cleanup
    await dbService.disconnect();
    await coordination.disconnect();
    await metricsLogger.close();
    await workspace.cleanup();

    expect(duration).toBeLessThan(2000);
  });

  it('should handle concurrent system initializations efficiently', async () => {
    const start = Date.now();

    const promises = [];

    for (let i = 0; i < 5; i++) {
      promises.push(
        (async () => {
          const db = new DatabaseService({
            redis: { type: 'redis', host: 'localhost', port: 6379 },
            sqlite: { type: 'sqlite', database: ':memory:' },
          });
          await db.initialize();
          await db.disconnect();
        })()
      );
    }

    await Promise.all(promises);
    const duration = Date.now() - start;

    // 5 concurrent initializations should complete within 3s
    expect(duration).toBeLessThan(3000);
  });
});
