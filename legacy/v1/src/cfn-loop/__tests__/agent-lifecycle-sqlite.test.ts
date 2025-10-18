/**
 * Agent Lifecycle SQLite Integration Tests - Sprint 1.7
 *
 * Test Coverage:
 * 1. Agent spawn registration in SQLite
 * 2. Confidence score updates and history tracking
 * 3. Agent termination cleanup
 * 4. Audit log completeness for lifecycle events
 * 5. Cross-session state recovery
 * 6. Concurrent agent operations
 *
 * Epic: SQLite Integration Migration
 * Sprint: 1.7 - Testing & Validation
 *
 * @module cfn-loop/__tests__/agent-lifecycle-sqlite.test
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
  retryStrategy: (times: number) => {
    if (times > 3) return null;
    return Math.min(times * 50, 500);
  },
};

const TEST_DB_PATH = join(process.cwd(), '.test-agent-lifecycle.db');
const TEST_TIMEOUT = 30000;

// ===== TYPE DEFINITIONS =====

interface AgentLifecycleEntry {
  agentId: string;
  swarmId: string;
  phase: string;
  loop: number;
  status: 'spawned' | 'active' | 'completed' | 'terminated' | 'failed';
  confidenceScore?: number;
  spawnedAt: number;
  updatedAt: number;
  terminatedAt?: number;
  metadata?: string; // JSON string
}

interface ConfidenceHistoryEntry {
  id: number;
  agentId: string;
  confidenceScore: number;
  reasoning: string;
  blockers: string; // JSON array
  timestamp: number;
}

interface AuditLogEntry {
  id: number;
  agentId: string;
  swarmId: string;
  eventType: string;
  eventData: string; // JSON string
  timestamp: number;
}

// ===== MOCK AGENT LIFECYCLE MANAGER =====

class AgentLifecycleSQLite {
  private redis: Redis;
  private db: Database.Database;

  constructor(redisClient: Redis, dbPath: string) {
    this.redis = redisClient;
    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  private initializeSchema(): void {
    this.db.exec(`
      -- Agent lifecycle tracking
      CREATE TABLE IF NOT EXISTS agent_lifecycle (
        agent_id TEXT PRIMARY KEY,
        swarm_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        loop INTEGER NOT NULL,
        status TEXT NOT NULL,
        confidence_score REAL,
        spawned_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        terminated_at INTEGER,
        metadata TEXT
      );

      -- Confidence score history
      CREATE TABLE IF NOT EXISTS confidence_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        confidence_score REAL NOT NULL,
        reasoning TEXT NOT NULL,
        blockers TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agent_lifecycle(agent_id) ON DELETE CASCADE
      );

      -- Audit log for lifecycle events
      CREATE TABLE IF NOT EXISTS agent_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        swarm_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        event_data TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agent_lifecycle(agent_id) ON DELETE CASCADE
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_agent_swarm ON agent_lifecycle(swarm_id);
      CREATE INDEX IF NOT EXISTS idx_agent_phase_loop ON agent_lifecycle(phase, loop);
      CREATE INDEX IF NOT EXISTS idx_confidence_agent ON confidence_history(agent_id);
      CREATE INDEX IF NOT EXISTS idx_audit_agent ON agent_audit_log(agent_id);
      CREATE INDEX IF NOT EXISTS idx_audit_swarm ON agent_audit_log(swarm_id);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON agent_audit_log(timestamp);
    `);
  }

  async spawnAgent(options: {
    agentId: string;
    swarmId: string;
    phase: string;
    loop: number;
    metadata?: any;
  }): Promise<void> {
    const now = Date.now();

    // Insert into SQLite
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO agent_lifecycle
      (agent_id, swarm_id, phase, loop, status, spawned_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      options.agentId,
      options.swarmId,
      options.phase,
      options.loop,
      'spawned',
      now,
      now,
      options.metadata ? JSON.stringify(options.metadata) : null
    );

    // Audit log
    await this.logAuditEvent(options.agentId, options.swarmId, 'agent.spawned', {
      phase: options.phase,
      loop: options.loop,
      metadata: options.metadata,
    });

    // Write to Redis for real-time access
    await this.redis.set(
      `agent:lifecycle:${options.agentId}`,
      JSON.stringify({
        ...options,
        status: 'spawned',
        spawnedAt: now,
        updatedAt: now,
      })
    );
  }

  async updateConfidence(
    agentId: string,
    confidence: number,
    reasoning: string,
    blockers: string[] = []
  ): Promise<void> {
    const now = Date.now();

    // Update agent lifecycle
    const updateStmt = this.db.prepare(`
      UPDATE agent_lifecycle
      SET confidence_score = ?, updated_at = ?, status = ?
      WHERE agent_id = ?
    `);

    updateStmt.run(confidence, now, 'active', agentId);

    // Insert confidence history
    const historyStmt = this.db.prepare(`
      INSERT INTO confidence_history
      (agent_id, confidence_score, reasoning, blockers, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    historyStmt.run(
      agentId,
      confidence,
      reasoning,
      JSON.stringify(blockers),
      now
    );

    // Audit log
    const agent = this.db.prepare('SELECT swarm_id FROM agent_lifecycle WHERE agent_id = ?')
      .get(agentId) as any;

    if (agent) {
      await this.logAuditEvent(agentId, agent.swarm_id, 'confidence.updated', {
        confidence,
        reasoning,
        blockers,
      });
    }

    // Update Redis
    const redisKey = `agent:lifecycle:${agentId}`;
    const redisData = await this.redis.get(redisKey);

    if (redisData) {
      const parsed = JSON.parse(redisData);
      parsed.confidenceScore = confidence;
      parsed.updatedAt = now;
      parsed.status = 'active';
      await this.redis.set(redisKey, JSON.stringify(parsed));
    }
  }

  async terminateAgent(agentId: string, reason: string): Promise<void> {
    const now = Date.now();

    // Update agent status
    const stmt = this.db.prepare(`
      UPDATE agent_lifecycle
      SET status = ?, terminated_at = ?, updated_at = ?
      WHERE agent_id = ?
    `);

    stmt.run('terminated', now, now, agentId);

    // Audit log
    const agent = this.db.prepare('SELECT swarm_id FROM agent_lifecycle WHERE agent_id = ?')
      .get(agentId) as any;

    if (agent) {
      await this.logAuditEvent(agentId, agent.swarm_id, 'agent.terminated', {
        reason,
        terminatedAt: now,
      });
    }

    // Remove from Redis
    await this.redis.del(`agent:lifecycle:${agentId}`);
  }

  async getAgent(agentId: string): Promise<AgentLifecycleEntry | null> {
    const stmt = this.db.prepare('SELECT * FROM agent_lifecycle WHERE agent_id = ?');
    const row = stmt.get(agentId) as any;

    if (!row) {
      return null;
    }

    return {
      agentId: row.agent_id,
      swarmId: row.swarm_id,
      phase: row.phase,
      loop: row.loop,
      status: row.status,
      confidenceScore: row.confidence_score,
      spawnedAt: row.spawned_at,
      updatedAt: row.updated_at,
      terminatedAt: row.terminated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  async getConfidenceHistory(agentId: string): Promise<ConfidenceHistoryEntry[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM confidence_history
      WHERE agent_id = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(agentId) as any[];

    return rows.map(row => ({
      id: row.id,
      agentId: row.agent_id,
      confidenceScore: row.confidence_score,
      reasoning: row.reasoning,
      blockers: row.blockers,
      timestamp: row.timestamp,
    }));
  }

  async getAuditLog(agentId: string): Promise<AuditLogEntry[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_audit_log
      WHERE agent_id = ?
      ORDER BY timestamp ASC
    `);

    const rows = stmt.all(agentId) as any[];

    return rows.map(row => ({
      id: row.id,
      agentId: row.agent_id,
      swarmId: row.swarm_id,
      eventType: row.event_type,
      eventData: row.event_data,
      timestamp: row.timestamp,
    }));
  }

  async getSwarmAgents(swarmId: string): Promise<AgentLifecycleEntry[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_lifecycle
      WHERE swarm_id = ?
      ORDER BY spawned_at ASC
    `);

    const rows = stmt.all(swarmId) as any[];

    return rows.map(row => ({
      agentId: row.agent_id,
      swarmId: row.swarm_id,
      phase: row.phase,
      loop: row.loop,
      status: row.status,
      confidenceScore: row.confidence_score,
      spawnedAt: row.spawned_at,
      updatedAt: row.updated_at,
      terminatedAt: row.terminated_at,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  private async logAuditEvent(
    agentId: string,
    swarmId: string,
    eventType: string,
    eventData: any
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO agent_audit_log
      (agent_id, swarm_id, event_type, event_data, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      agentId,
      swarmId,
      eventType,
      JSON.stringify(eventData),
      Date.now()
    );
  }

  close(): void {
    this.db.close();
  }
}

// ===== TEST SUITE =====

describe('AgentLifecycleSQLite', () => {
  let redis: Redis;
  let lifecycle: AgentLifecycleSQLite;

  beforeAll(async () => {
    redis = new Redis(REDIS_CONFIG);

    await new Promise<void>((resolve, reject) => {
      redis.once('ready', resolve);
      redis.once('error', reject);
    });
  });

  beforeEach(async () => {
    // Clean up test database
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // Ignore if doesn't exist
    }

    lifecycle = new AgentLifecycleSQLite(redis, TEST_DB_PATH);

    // Clean up Redis
    const keys = await redis.keys('agent:lifecycle:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }, TEST_TIMEOUT);

  afterEach(async () => {
    if (lifecycle) {
      lifecycle.close();
    }

    try {
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // Ignore
    }

    const keys = await redis.keys('agent:lifecycle:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await redis.quit();
  });

  describe('Agent Spawn Registration', () => {
    it('should register agent spawn in SQLite and Redis', async () => {
      const agentId = 'coder-1';
      const swarmId = 'swarm-phase-1';
      const phase = 'implementation';
      const loop = 3;

      await lifecycle.spawnAgent({
        agentId,
        swarmId,
        phase,
        loop,
        metadata: { role: 'primary', language: 'typescript' },
      });

      // Verify SQLite
      const agent = await lifecycle.getAgent(agentId);
      expect(agent).toBeDefined();
      expect(agent!.agentId).toBe(agentId);
      expect(agent!.swarmId).toBe(swarmId);
      expect(agent!.phase).toBe(phase);
      expect(agent!.loop).toBe(loop);
      expect(agent!.status).toBe('spawned');
      expect(agent!.metadata).toEqual({ role: 'primary', language: 'typescript' });

      // Verify Redis
      const redisData = await redis.get(`agent:lifecycle:${agentId}`);
      expect(redisData).toBeDefined();

      const redisParsed = JSON.parse(redisData!);
      expect(redisParsed.agentId).toBe(agentId);
      expect(redisParsed.status).toBe('spawned');

      // Verify audit log
      const auditLog = await lifecycle.getAuditLog(agentId);
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].eventType).toBe('agent.spawned');
    });

    it('should handle concurrent agent spawns', async () => {
      const agentCount = 10;
      const swarmId = 'swarm-concurrent';
      const phase = 'test-phase';
      const loop = 1;

      const spawnPromises = Array.from({ length: agentCount }, (_, i) =>
        lifecycle.spawnAgent({
          agentId: `concurrent-agent-${i}`,
          swarmId,
          phase,
          loop,
        })
      );

      await Promise.all(spawnPromises);

      // Verify all agents were spawned
      const swarmAgents = await lifecycle.getSwarmAgents(swarmId);
      expect(swarmAgents.length).toBe(agentCount);

      // Verify each agent
      for (let i = 0; i < agentCount; i++) {
        const agent = await lifecycle.getAgent(`concurrent-agent-${i}`);
        expect(agent).toBeDefined();
        expect(agent!.status).toBe('spawned');
      }
    });
  });

  describe('Confidence Score Updates', () => {
    beforeEach(async () => {
      // Spawn test agent
      await lifecycle.spawnAgent({
        agentId: 'test-agent',
        swarmId: 'test-swarm',
        phase: 'test-phase',
        loop: 3,
      });
    });

    it('should update confidence score and track history', async () => {
      const agentId = 'test-agent';

      // Update confidence multiple times
      await lifecycle.updateConfidence(agentId, 0.65, 'Initial implementation complete', []);
      await lifecycle.updateConfidence(agentId, 0.78, 'Tests passing, code reviewed', []);
      await lifecycle.updateConfidence(agentId, 0.85, 'All requirements met', []);

      // Verify current score
      const agent = await lifecycle.getAgent(agentId);
      expect(agent!.confidenceScore).toBe(0.85);
      expect(agent!.status).toBe('active');

      // Verify history
      const history = await lifecycle.getConfidenceHistory(agentId);
      expect(history.length).toBe(3);
      expect(history[0].confidenceScore).toBe(0.65);
      expect(history[1].confidenceScore).toBe(0.78);
      expect(history[2].confidenceScore).toBe(0.85);

      // Verify audit log includes confidence updates
      const auditLog = await lifecycle.getAuditLog(agentId);
      const confidenceEvents = auditLog.filter(e => e.eventType === 'confidence.updated');
      expect(confidenceEvents.length).toBe(3);
    });

    it('should track blockers in confidence updates', async () => {
      const agentId = 'test-agent';
      const blockers = ['Missing dependency', 'API endpoint not available'];

      await lifecycle.updateConfidence(agentId, 0.45, 'Blocked on external dependencies', blockers);

      // Verify blockers in history
      const history = await lifecycle.getConfidenceHistory(agentId);
      expect(history.length).toBe(1);

      const blockersData = JSON.parse(history[0].blockers);
      expect(blockersData).toEqual(blockers);
    });

    it('should update Redis in sync with SQLite', async () => {
      const agentId = 'test-agent';

      await lifecycle.updateConfidence(agentId, 0.90, 'Production ready', []);

      // Verify SQLite
      const agent = await lifecycle.getAgent(agentId);
      expect(agent!.confidenceScore).toBe(0.90);

      // Verify Redis
      const redisData = await redis.get(`agent:lifecycle:${agentId}`);
      const redisParsed = JSON.parse(redisData!);
      expect(redisParsed.confidenceScore).toBe(0.90);
    });
  });

  describe('Agent Termination', () => {
    beforeEach(async () => {
      await lifecycle.spawnAgent({
        agentId: 'terminate-test',
        swarmId: 'test-swarm',
        phase: 'test-phase',
        loop: 3,
      });
    });

    it('should terminate agent and cleanup state', async () => {
      const agentId = 'terminate-test';

      await lifecycle.terminateAgent(agentId, 'Task completed successfully');

      // Verify SQLite status
      const agent = await lifecycle.getAgent(agentId);
      expect(agent!.status).toBe('terminated');
      expect(agent!.terminatedAt).toBeDefined();

      // Verify Redis cleanup
      const redisData = await redis.get(`agent:lifecycle:${agentId}`);
      expect(redisData).toBeNull();

      // Verify audit log
      const auditLog = await lifecycle.getAuditLog(agentId);
      const terminationEvents = auditLog.filter(e => e.eventType === 'agent.terminated');
      expect(terminationEvents.length).toBe(1);

      const eventData = JSON.parse(terminationEvents[0].eventData);
      expect(eventData.reason).toBe('Task completed successfully');
    });
  });

  describe('Audit Log Completeness', () => {
    it('should log all lifecycle events', async () => {
      const agentId = 'audit-test';
      const swarmId = 'audit-swarm';

      // Spawn
      await lifecycle.spawnAgent({
        agentId,
        swarmId,
        phase: 'audit-phase',
        loop: 1,
      });

      // Multiple confidence updates
      await lifecycle.updateConfidence(agentId, 0.60, 'Progress 1', []);
      await lifecycle.updateConfidence(agentId, 0.75, 'Progress 2', ['Minor issue']);
      await lifecycle.updateConfidence(agentId, 0.88, 'Almost done', []);

      // Terminate
      await lifecycle.terminateAgent(agentId, 'Completed');

      // Verify complete audit trail
      const auditLog = await lifecycle.getAuditLog(agentId);

      expect(auditLog.length).toBe(5); // 1 spawn + 3 confidence + 1 terminate

      // Verify event types
      expect(auditLog[0].eventType).toBe('agent.spawned');
      expect(auditLog[1].eventType).toBe('confidence.updated');
      expect(auditLog[2].eventType).toBe('confidence.updated');
      expect(auditLog[3].eventType).toBe('confidence.updated');
      expect(auditLog[4].eventType).toBe('agent.terminated');

      // Verify chronological order
      for (let i = 1; i < auditLog.length; i++) {
        expect(auditLog[i].timestamp).toBeGreaterThanOrEqual(auditLog[i - 1].timestamp);
      }
    });
  });

  describe('Cross-Session Recovery', () => {
    it('should recover agent state from SQLite after Redis loss', async () => {
      const agentId = 'recovery-test';
      const swarmId = 'recovery-swarm';

      // Spawn and update agent
      await lifecycle.spawnAgent({
        agentId,
        swarmId,
        phase: 'recovery-phase',
        loop: 2,
        metadata: { critical: 'data' },
      });

      await lifecycle.updateConfidence(agentId, 0.80, 'Good progress', []);

      // Simulate Redis loss
      await redis.del(`agent:lifecycle:${agentId}`);

      // Verify Redis is empty
      const redisData = await redis.get(`agent:lifecycle:${agentId}`);
      expect(redisData).toBeNull();

      // Recover from SQLite
      const agent = await lifecycle.getAgent(agentId);
      expect(agent).toBeDefined();
      expect(agent!.confidenceScore).toBe(0.80);
      expect(agent!.metadata).toEqual({ critical: 'data' });

      // Verify confidence history is intact
      const history = await lifecycle.getConfidenceHistory(agentId);
      expect(history.length).toBe(1);
      expect(history[0].confidenceScore).toBe(0.80);

      // Verify audit log is intact
      const auditLog = await lifecycle.getAuditLog(agentId);
      expect(auditLog.length).toBe(2); // spawn + confidence update
    });
  });

  describe('Swarm-Wide Queries', () => {
    it('should efficiently query all agents in a swarm', async () => {
      const swarmId = 'query-swarm';
      const agentCount = 20;

      // Spawn multiple agents
      for (let i = 0; i < agentCount; i++) {
        await lifecycle.spawnAgent({
          agentId: `swarm-agent-${i}`,
          swarmId,
          phase: 'query-phase',
          loop: 1,
        });
      }

      // Query swarm agents
      const agents = await lifecycle.getSwarmAgents(swarmId);

      expect(agents.length).toBe(agentCount);

      // Verify all agents belong to swarm
      for (const agent of agents) {
        expect(agent.swarmId).toBe(swarmId);
      }
    });
  });
});
