/**
 * Blocking Coordination Audit Tests with SQLite - Sprint 1.7
 *
 * Test Coverage:
 * 1. Signal ACK event logging to SQLite
 * 2. Timeout event persistence
 * 3. Dead coordinator escalation logging
 * 4. Audit trail completeness
 * 5. Query performance for audit logs
 *
 * Epic: SQLite Integration Migration
 * Sprint: 1.7 - Testing & Validation
 *
 * @module cfn-loop/__tests__/blocking-coordination-audit.test
 */

import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import Database from 'better-sqlite3';
import { promises as fs } from 'fs';
import { join } from 'path';

// ===== TEST CONFIGURATION =====

const REDIS_CONFIG: RedisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_TEST_DB || '1'),
};

const TEST_DB_PATH = join(process.cwd(), '.test-blocking-audit.db');
const TEST_TIMEOUT = 30000;

// ===== TYPE DEFINITIONS =====

interface BlockingAuditEntry {
  id: number;
  coordinatorId: string;
  eventType: 'signal_ack' | 'timeout' | 'dead_coordinator' | 'work_transfer';
  eventData: string; // JSON
  timestamp: number;
}

// ===== MOCK BLOCKING COORDINATION AUDIT MANAGER =====

class BlockingCoordinationAudit {
  private redis: Redis;
  private db: Database.Database;

  constructor(redisClient: Redis, dbPath: string) {
    this.redis = redisClient;
    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS blocking_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        coordinator_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_blocking_coordinator ON blocking_audit(coordinator_id);
      CREATE INDEX IF NOT EXISTS idx_blocking_event_type ON blocking_audit(event_type);
      CREATE INDEX IF NOT EXISTS idx_blocking_timestamp ON blocking_audit(timestamp);
    `);
  }

  async logSignalACK(coordinatorId: string, signalId: string, ackData: any): Promise<void> {
    await this.logEvent(coordinatorId, 'signal_ack', {
      signalId,
      ...ackData,
    });
  }

  async logTimeout(coordinatorId: string, iteration: number, duration: number): Promise<void> {
    await this.logEvent(coordinatorId, 'timeout', {
      iteration,
      duration,
      timestamp: Date.now(),
    });
  }

  async logDeadCoordinator(coordinatorId: string, lastHeartbeat: number, escalated: boolean): Promise<void> {
    await this.logEvent(coordinatorId, 'dead_coordinator', {
      lastHeartbeat,
      escalated,
      detectedAt: Date.now(),
    });
  }

  async logWorkTransfer(fromCoordinator: string, toCoordinator: string, workData: any): Promise<void> {
    await this.logEvent(fromCoordinator, 'work_transfer', {
      toCoordinator,
      ...workData,
    });
  }

  private async logEvent(coordinatorId: string, eventType: string, eventData: any): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO blocking_audit
      (coordinator_id, event_type, event_data, timestamp)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      coordinatorId,
      eventType,
      JSON.stringify(eventData),
      Date.now()
    );

    // Also publish to Redis pub/sub for real-time monitoring
    await this.redis.publish('blocking:audit', JSON.stringify({
      coordinatorId,
      eventType,
      eventData,
      timestamp: Date.now(),
    }));
  }

  async getAuditLog(coordinatorId: string): Promise<BlockingAuditEntry[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM blocking_audit
      WHERE coordinator_id = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(coordinatorId) as any[];

    return rows.map(row => ({
      id: row.id,
      coordinatorId: row.coordinator_id,
      eventType: row.event_type,
      eventData: row.event_data,
      timestamp: row.timestamp,
    }));
  }

  async getEventsByType(eventType: string): Promise<BlockingAuditEntry[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM blocking_audit
      WHERE event_type = ?
      ORDER BY timestamp DESC
      LIMIT 100
    `);

    const rows = stmt.all(eventType) as any[];

    return rows.map(row => ({
      id: row.id,
      coordinatorId: row.coordinator_id,
      eventType: row.event_type,
      eventData: row.event_data,
      timestamp: row.timestamp,
    }));
  }

  async getEventsSince(timestamp: number): Promise<BlockingAuditEntry[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM blocking_audit
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(timestamp) as any[];

    return rows.map(row => ({
      id: row.id,
      coordinatorId: row.coordinator_id,
      eventType: row.event_type,
      eventData: row.event_data,
      timestamp: row.timestamp,
    }));
  }

  close(): void {
    this.db.close();
  }
}

// ===== TEST SUITE =====

describe('BlockingCoordinationAudit', () => {
  let redis: Redis;
  let audit: BlockingCoordinationAudit;

  beforeAll(async () => {
    redis = new Redis(REDIS_CONFIG);

    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });
  });

  beforeEach(async () => {
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // Ignore
    }

    audit = new BlockingCoordinationAudit(redis, TEST_DB_PATH);
  }, TEST_TIMEOUT);

  afterEach(async () => {
    if (audit) {
      audit.close();
    }

    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // Ignore
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await redis.quit();
  });

  describe('Signal ACK Logging', () => {
    it('should log Signal ACK events with complete data', async () => {
      const coordinatorId = 'coordinator-1';
      const signalId = 'signal-123';

      await audit.logSignalACK(coordinatorId, signalId, {
        agentId: 'agent-1',
        iteration: 5,
        ackTimestamp: Date.now(),
      });

      const logs = await audit.getAuditLog(coordinatorId);

      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe('signal_ack');

      const eventData = JSON.parse(logs[0].eventData);
      expect(eventData.signalId).toBe(signalId);
      expect(eventData.agentId).toBe('agent-1');
      expect(eventData.iteration).toBe(5);
    });

    it('should handle multiple Signal ACKs from same coordinator', async () => {
      const coordinatorId = 'coordinator-multi';

      // Log multiple ACKs
      for (let i = 0; i < 5; i++) {
        await audit.logSignalACK(coordinatorId, `signal-${i}`, {
          agentId: `agent-${i}`,
          iteration: i + 1,
        });
      }

      const logs = await audit.getAuditLog(coordinatorId);

      expect(logs.length).toBe(5);

      // Verify chronological order
      for (let i = 1; i < logs.length; i++) {
        expect(logs[i].timestamp).toBeGreaterThanOrEqual(logs[i - 1].timestamp);
      }
    });
  });

  describe('Timeout Event Persistence', () => {
    it('should persist timeout events with duration data', async () => {
      const coordinatorId = 'coordinator-timeout';
      const iteration = 10;
      const duration = 60000; // 60 seconds

      await audit.logTimeout(coordinatorId, iteration, duration);

      const logs = await audit.getAuditLog(coordinatorId);

      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe('timeout');

      const eventData = JSON.parse(logs[0].eventData);
      expect(eventData.iteration).toBe(iteration);
      expect(eventData.duration).toBe(duration);
      expect(eventData.timestamp).toBeDefined();
    });

    it('should track multiple timeouts for coordinator', async () => {
      const coordinatorId = 'coordinator-frequent-timeouts';

      // Log multiple timeouts
      await audit.logTimeout(coordinatorId, 1, 30000);
      await audit.logTimeout(coordinatorId, 2, 45000);
      await audit.logTimeout(coordinatorId, 3, 60000);

      const logs = await audit.getAuditLog(coordinatorId);

      expect(logs.length).toBe(3);

      // Verify timeout durations are recorded
      const eventData1 = JSON.parse(logs[0].eventData);
      const eventData2 = JSON.parse(logs[1].eventData);
      const eventData3 = JSON.parse(logs[2].eventData);

      expect(eventData1.duration).toBe(30000);
      expect(eventData2.duration).toBe(45000);
      expect(eventData3.duration).toBe(60000);
    });

    it('should query timeout events efficiently', async () => {
      // Create many coordinators with timeouts
      for (let i = 0; i < 50; i++) {
        await audit.logTimeout(`coordinator-${i}`, 1, 30000);
      }

      // Query by event type (should use index)
      const start = Date.now();
      const timeouts = await audit.getEventsByType('timeout');
      const duration = Date.now() - start;

      expect(timeouts.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should be fast with index
    });
  });

  describe('Dead Coordinator Escalation Logging', () => {
    it('should log dead coordinator detection', async () => {
      const coordinatorId = 'coordinator-dead';
      const lastHeartbeat = Date.now() - 120000; // 2 minutes ago

      await audit.logDeadCoordinator(coordinatorId, lastHeartbeat, true);

      const logs = await audit.getAuditLog(coordinatorId);

      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe('dead_coordinator');

      const eventData = JSON.parse(logs[0].eventData);
      expect(eventData.lastHeartbeat).toBe(lastHeartbeat);
      expect(eventData.escalated).toBe(true);
      expect(eventData.detectedAt).toBeDefined();
    });

    it('should differentiate escalated vs non-escalated deaths', async () => {
      const coordinator1 = 'coordinator-escalated';
      const coordinator2 = 'coordinator-not-escalated';

      await audit.logDeadCoordinator(coordinator1, Date.now() - 120000, true);
      await audit.logDeadCoordinator(coordinator2, Date.now() - 120000, false);

      const logs1 = await audit.getAuditLog(coordinator1);
      const logs2 = await audit.getAuditLog(coordinator2);

      const eventData1 = JSON.parse(logs1[0].eventData);
      const eventData2 = JSON.parse(logs2[0].eventData);

      expect(eventData1.escalated).toBe(true);
      expect(eventData2.escalated).toBe(false);
    });
  });

  describe('Work Transfer Logging', () => {
    it('should log work transfer between coordinators', async () => {
      const fromCoordinator = 'coordinator-failed';
      const toCoordinator = 'coordinator-recovery';

      await audit.logWorkTransfer(fromCoordinator, toCoordinator, {
        taskCount: 5,
        agentsTransferred: ['agent-1', 'agent-2', 'agent-3'],
        transferReason: 'Coordinator timeout',
      });

      const logs = await audit.getAuditLog(fromCoordinator);

      expect(logs.length).toBe(1);
      expect(logs[0].eventType).toBe('work_transfer');

      const eventData = JSON.parse(logs[0].eventData);
      expect(eventData.toCoordinator).toBe(toCoordinator);
      expect(eventData.taskCount).toBe(5);
      expect(eventData.agentsTransferred).toEqual(['agent-1', 'agent-2', 'agent-3']);
      expect(eventData.transferReason).toBe('Coordinator timeout');
    });
  });

  describe('Audit Trail Completeness', () => {
    it('should maintain complete audit trail for coordinator lifecycle', async () => {
      const coordinatorId = 'coordinator-lifecycle';

      // Simulate full coordinator lifecycle
      // 1. Multiple Signal ACKs
      await audit.logSignalACK(coordinatorId, 'signal-1', { iteration: 1 });
      await audit.logSignalACK(coordinatorId, 'signal-2', { iteration: 2 });

      // 2. Timeout event
      await audit.logTimeout(coordinatorId, 3, 45000);

      // 3. More Signal ACKs after timeout
      await audit.logSignalACK(coordinatorId, 'signal-3', { iteration: 4 });

      // 4. Dead coordinator detection
      await audit.logDeadCoordinator(coordinatorId, Date.now() - 120000, true);

      // 5. Work transfer
      await audit.logWorkTransfer(coordinatorId, 'coordinator-backup', {
        taskCount: 3,
      });

      // Verify complete trail
      const logs = await audit.getAuditLog(coordinatorId);

      expect(logs.length).toBe(6);

      // Verify event types in order
      expect(logs[0].eventType).toBe('signal_ack');
      expect(logs[1].eventType).toBe('signal_ack');
      expect(logs[2].eventType).toBe('timeout');
      expect(logs[3].eventType).toBe('signal_ack');
      expect(logs[4].eventType).toBe('dead_coordinator');
      expect(logs[5].eventType).toBe('work_transfer');

      // Verify chronological order
      for (let i = 1; i < logs.length; i++) {
        expect(logs[i].timestamp).toBeGreaterThanOrEqual(logs[i - 1].timestamp);
      }
    });
  });

  describe('Query Performance', () => {
    it('should efficiently query events by timestamp range', async () => {
      const baseTime = Date.now();

      // Create events over time range
      for (let i = 0; i < 100; i++) {
        await audit.logTimeout(`coordinator-${i}`, 1, 30000);
      }

      // Query events since specific timestamp
      const queryTime = baseTime + 50; // Midpoint
      const start = Date.now();
      const events = await audit.getEventsSince(queryTime);
      const duration = Date.now() - start;

      expect(events.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(100); // Should be fast with timestamp index
    });

    it('should efficiently retrieve events by type', async () => {
      // Mix of different event types
      for (let i = 0; i < 30; i++) {
        await audit.logSignalACK(`coordinator-${i}`, `signal-${i}`, { iteration: 1 });
        await audit.logTimeout(`coordinator-${i}`, 1, 30000);
      }

      // Query specific event type
      const start = Date.now();
      const timeouts = await audit.getEventsByType('timeout');
      const duration = Date.now() - start;

      expect(timeouts.length).toBe(30);
      expect(duration).toBeLessThan(100); // Should be fast with event_type index
    });
  });

  describe('Redis Pub/Sub Integration', () => {
    it('should publish events to Redis channel for real-time monitoring', async () => {
      const coordinatorId = 'coordinator-pubsub';
      let receivedMessage: any = null;

      // Subscribe to Redis channel
      const subscriber = new Redis(REDIS_CONFIG);
      await subscriber.subscribe('blocking:audit');

      subscriber.on('message', (channel, message) => {
        if (channel === 'blocking:audit') {
          receivedMessage = JSON.parse(message);
        }
      });

      // Wait for subscription to be ready
      await new Promise(resolve => setTimeout(resolve, 100));

      // Log event (should publish to Redis)
      await audit.logTimeout(coordinatorId, 5, 60000);

      // Wait for pub/sub message
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify message received
      expect(receivedMessage).toBeDefined();
      expect(receivedMessage.coordinatorId).toBe(coordinatorId);
      expect(receivedMessage.eventType).toBe('timeout');

      // Cleanup
      await subscriber.quit();
    });
  });
});
