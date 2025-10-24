/**
 * Integration Tests - Agent Lifecycle CLI Commands
 * Sprint 4.1: Agent Lifecycle SQLite Integration
 *
 * Tests for agent-lifecycle CLI command:
 * - spawn: Agent registration
 * - update: Confidence updates
 * - terminate: Agent termination
 * - status: Lifecycle history queries
 *
 * @module tests/integration/agent-lifecycle-cli
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import Redis from 'ioredis';

// Test configuration
const CLI_PATH = resolve(process.cwd(), '.claude-flow-novice/dist/src/cli/main.js');
const DB_PATH = resolve(process.cwd(), 'memory/cfn-loop-memory.db');
const TEST_TIMEOUT = 30000;

// Test data
const TEST_AGENT_ID = 'test-coder-1';
const TEST_AGENT_TYPE = 'coder';
const TEST_ACL_LEVEL = 1;
const TEST_SWARM_ID = 'test-swarm-lifecycle';
const TEST_PROJECT_ID = 'test-project-lifecycle';

// Redis client for cleanup
let redisClient: Redis;

/**
 * Execute CLI command and parse JSON output
 */
function executeCLI(args: string[]): any {
  const command = `node ${CLI_PATH} ${args.join(' ')}`;

  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379'
      }
    });

    // Try to parse JSON output
    try {
      return JSON.parse(output);
    } catch {
      return { output };
    }
  } catch (error: any) {
    // Return error output
    return {
      error: true,
      message: error.message,
      stdout: error.stdout?.toString(),
      stderr: error.stderr?.toString()
    };
  }
}

/**
 * Execute CLI command and get text output
 */
function executeCLIText(args: string[]): string {
  const command = `node ${CLI_PATH} ${args.join(' ')}`;

  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: 'pipe',
      env: {
        ...process.env,
        REDIS_HOST: 'localhost',
        REDIS_PORT: '6379'
      }
    });

    return output;
  } catch (error: any) {
    return error.stderr?.toString() || error.message;
  }
}

describe('Agent Lifecycle CLI Commands', () => {
  beforeAll(async () => { try {
    // Initialize Redis client for cleanup
    redisClient = new Redis({
      host: 'localhost',
      port: 6379
    });

    // Clean up any existing test data
    const keys = await redisClient.keys('cfn-loop:*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }

    // Ensure CLI is built
    if (!existsSync(CLI_PATH)) {
      throw new Error(`CLI not found at ${CLI_PATH}. Run 'npm run build' first.`);
    }
  }, TEST_TIMEOUT);

  afterAll(async () => { try {
    // Cleanup Redis
    const keys = await redisClient.keys('cfn-loop:*');
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }

    await redisClient.quit();
  });

  beforeEach(async () => { try {
    // Clean up test agent data before each test
    const keys = await redisClient.keys(`*${TEST_AGENT_ID}*`);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
  });

  describe('spawn command', () => {
    it('should register agent spawn with JSON output', () => {
      const result = executeCLI([
        'agent-lifecycle', 'spawn',
        '--id', TEST_AGENT_ID,
        '--type', TEST_AGENT_TYPE,
        '--acl-level', String(TEST_ACL_LEVEL),
        '--swarm-id', TEST_SWARM_ID,
        '--project-id', TEST_PROJECT_ID,
        '--json'
      ]);

      expect(result.status).toBe('success');
      expect(result.agent_id).toBe(TEST_AGENT_ID);
      expect(result.type).toBe(TEST_AGENT_TYPE);
      expect(result.swarm_id).toBe(TEST_SWARM_ID);
      expect(result.acl_level).toBe(TEST_ACL_LEVEL);
      expect(result.spawned_at).toBeDefined();
      expect(typeof result.spawned_at).toBe('number');
    }, TEST_TIMEOUT);

    it('should register agent spawn with human-readable output', () => {
      const output = executeCLIText([
        'agent-lifecycle', 'spawn',
        '--id', `${TEST_AGENT_ID}-human`,
        '--type', TEST_AGENT_TYPE,
        '--acl-level', String(TEST_ACL_LEVEL)
      ]);

      expect(output).toContain('spawned successfully');
      expect(output).toContain(TEST_AGENT_TYPE);
    }, TEST_TIMEOUT);

    it('should register agent with capabilities', () => {
      const result = executeCLI([
        'agent-lifecycle', 'spawn',
        '--id', `${TEST_AGENT_ID}-caps`,
        '--type', TEST_AGENT_TYPE,
        '--acl-level', String(TEST_ACL_LEVEL),
        '--capabilities', 'typescript,testing,review',
        '--json'
      ]);

      expect(result.status).toBe('success');
    }, TEST_TIMEOUT);

    it('should register agent with metadata', () => {
      const metadata = JSON.stringify({ team: 'backend', priority: 'high' });
      const result = executeCLI([
        'agent-lifecycle', 'spawn',
        '--id', `${TEST_AGENT_ID}-meta`,
        '--type', TEST_AGENT_TYPE,
        '--acl-level', String(TEST_ACL_LEVEL),
        '--metadata', `'${metadata}'`,
        '--json'
      ]);

      expect(result.status).toBe('success');
    }, TEST_TIMEOUT);

    it('should reject invalid agent ID format', () => {
      const result = executeCLI([
        'agent-lifecycle', 'spawn',
        '--id', 'invalid id with spaces',
        '--type', TEST_AGENT_TYPE,
        '--acl-level', String(TEST_ACL_LEVEL),
        '--json'
      ]);

      expect(result.status).toBe('error');
      expect(result.error).toContain('alphanumeric');
    }, TEST_TIMEOUT);

    it('should reject invalid agent type', () => {
      const result = executeCLI([
        'agent-lifecycle', 'spawn',
        '--id', TEST_AGENT_ID,
        '--type', 'invalid-type',
        '--acl-level', String(TEST_ACL_LEVEL),
        '--json'
      ]);

      expect(result.status).toBe('error');
      expect(result.error).toContain('Invalid agent type');
    }, TEST_TIMEOUT);

    it('should reject invalid ACL level', () => {
      const result = executeCLI([
        'agent-lifecycle', 'spawn',
        '--id', TEST_AGENT_ID,
        '--type', TEST_AGENT_TYPE,
        '--acl-level', '10',
        '--json'
      ]);

      expect(result.status).toBe('error');
      expect(result.error).toContain('ACL level must be between 1');
    }, TEST_TIMEOUT);
  });

  describe('update command', () => {
    beforeEach(() => {
      // Spawn test agent first
      executeCLI([
        'agent-lifecycle', 'spawn',
        '--id', TEST_AGENT_ID,
        '--type', TEST_AGENT_TYPE,
        '--acl-level', String(TEST_ACL_LEVEL),
        '--json'
      ]);
    });

    it('should update agent confidence', () => {
      const result = executeCLI([
        'agent-lifecycle', 'update',
        '--id', TEST_AGENT_ID,
        '--confidence', '0.85',
        '--reasoning', 'All tests passing',
        '--json'
      ]);

      expect(result.status).toBe('success');
      expect(result.agent_id).toBe(TEST_AGENT_ID);
      expect(result.confidence).toBe(0.85);
    }, TEST_TIMEOUT);

    it('should update confidence with phase and iteration', () => {
      const result = executeCLI([
        'agent-lifecycle', 'update',
        '--id', TEST_AGENT_ID,
        '--confidence', '0.90',
        '--reasoning', 'Security validation passed',
        '--phase', 'authentication',
        '--iteration', '3',
        '--json'
      ]);

      expect(result.status).toBe('success');
    }, TEST_TIMEOUT);

    it('should reject invalid confidence score', () => {
      const result = executeCLI([
        'agent-lifecycle', 'update',
        '--id', TEST_AGENT_ID,
        '--confidence', '1.5',
        '--json'
      ]);

      expect(result.status).toBe('error');
      expect(result.error).toContain('Confidence must be between 0.0 and 1.0');
    }, TEST_TIMEOUT);
  });

  describe('terminate command', () => {
    beforeEach(() => {
      // Spawn test agent first
      executeCLI([
        'agent-lifecycle', 'spawn',
        '--id', TEST_AGENT_ID,
        '--type', TEST_AGENT_TYPE,
        '--acl-level', String(TEST_ACL_LEVEL),
        '--json'
      ]);
    });

    it('should terminate agent', () => {
      const result = executeCLI([
        'agent-lifecycle', 'terminate',
        '--id', TEST_AGENT_ID,
        '--reason', 'Task completed',
        '--json'
      ]);

      expect(result.status).toBe('success');
      expect(result.agent_id).toBe(TEST_AGENT_ID);
      expect(result.terminated_at).toBeDefined();
    }, TEST_TIMEOUT);

    it('should terminate agent without reason', () => {
      const result = executeCLI([
        'agent-lifecycle', 'terminate',
        '--id', TEST_AGENT_ID,
        '--json'
      ]);

      expect(result.status).toBe('success');
    }, TEST_TIMEOUT);
  });

  describe('status command', () => {
    beforeEach(() => {
      // Create agent lifecycle with multiple events
      executeCLI([
        'agent-lifecycle', 'spawn',
        '--id', TEST_AGENT_ID,
        '--type', TEST_AGENT_TYPE,
        '--acl-level', String(TEST_ACL_LEVEL),
        '--json'
      ]);

      executeCLI([
        'agent-lifecycle', 'update',
        '--id', TEST_AGENT_ID,
        '--confidence', '0.75',
        '--reasoning', 'Initial implementation',
        '--json'
      ]);

      executeCLI([
        'agent-lifecycle', 'update',
        '--id', TEST_AGENT_ID,
        '--confidence', '0.90',
        '--reasoning', 'Tests passing',
        '--json'
      ]);
    });

    it('should query agent lifecycle history', () => {
      const result = executeCLI([
        'agent-lifecycle', 'status',
        '--id', TEST_AGENT_ID,
        '--json'
      ]);

      expect(result.status).toBe('success');
      expect(result.agent_id).toBe(TEST_AGENT_ID);
      expect(result.events_count).toBeGreaterThan(0);
      expect(Array.isArray(result.events)).toBe(true);
    }, TEST_TIMEOUT);

    it('should limit history results', () => {
      const result = executeCLI([
        'agent-lifecycle', 'status',
        '--id', TEST_AGENT_ID,
        '--limit', '2',
        '--json'
      ]);

      expect(result.status).toBe('success');
      expect(result.events_count).toBeLessThanOrEqual(2);
    }, TEST_TIMEOUT);

    it('should filter by event types', () => {
      const result = executeCLI([
        'agent-lifecycle', 'status',
        '--id', TEST_AGENT_ID,
        '--event-types', 'spawn,confidence_update',
        '--json'
      ]);

      expect(result.status).toBe('success');
      expect(Array.isArray(result.events)).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('complete command', () => {
    beforeEach(() => {
      // Spawn test agent first
      executeCLI([
        'agent-lifecycle', 'spawn',
        '--id', TEST_AGENT_ID,
        '--type', TEST_AGENT_TYPE,
        '--acl-level', String(TEST_ACL_LEVEL),
        '--json'
      ]);
    });

    it('should mark agent as completed', () => {
      const result = executeCLI([
        'agent-lifecycle', 'complete',
        '--id', TEST_AGENT_ID,
        '--confidence', '0.85',
        '--output', 'Task completed successfully',
        '--json'
      ]);

      expect(result.status).toBe('success');
      expect(result.agent_id).toBe(TEST_AGENT_ID);
      expect(result.confidence).toBe(0.85);
      expect(result.gate_status).toBe('PASS ✅');
      expect(result.completed_at).toBeDefined();
    }, TEST_TIMEOUT);

    it('should handle concurrent complete calls atomically (SEC-002 race condition prevention)', async () => { try {
      const agentId = `${TEST_AGENT_ID}-concurrent`;

      // Spawn test agent
      const spawnResult = executeCLI([
        'agent-lifecycle', 'spawn',
        '--id', agentId,
        '--type', TEST_AGENT_TYPE,
        '--acl-level', String(TEST_ACL_LEVEL),
        '--json'
      ]);
      expect(spawnResult.status).toBe('success');

      // Launch 2 concurrent complete commands with different confidence scores
      const results = await Promise.allSettled([
        new Promise((resolve, reject) => {
          try {
            const result = executeCLI([
              'agent-lifecycle', 'complete',
              '--id', agentId,
              '--confidence', '0.85',
              '--output', 'First completion attempt',
              '--json'
            ]);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }),
        new Promise((resolve, reject) => {
          try {
            const result = executeCLI([
              'agent-lifecycle', 'complete',
              '--id', agentId,
              '--confidence', '0.90',
              '--output', 'Second completion attempt',
              '--json'
            ]);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        })
      ]);

      // Verify results: one success, one failure
      const successful = results.filter(
        r => r.status === 'fulfilled' && (r.value as any).status === 'success'
      );
      const failed = results.filter(
        r => r.status === 'fulfilled' && (r.value as any).status === 'error'
      );

      // Exactly one should succeed
      expect(successful.length).toBe(1);
      expect(failed.length).toBe(1);

      // Failed one should have "already completed" error
      const failedResult = (failed[0] as PromiseFulfilledResult<any>).value;
      expect(failedResult.error).toContain('already completed');

      // Verify database consistency: query completion events
      const statusResult = executeCLI([
        'agent-lifecycle', 'status',
        '--id', agentId,
        '--event-types', 'complete',
        '--json'
      ]);

      expect(statusResult.status).toBe('success');
      expect(statusResult.events_count).toBe(1); // Only 1 completion event logged
      expect(statusResult.events[0].event_type).toBe('complete');
    }, TEST_TIMEOUT);

    it('should reject completion of non-existent agent', () => {
      const result = executeCLI([
        'agent-lifecycle', 'complete',
        '--id', 'non-existent-agent',
        '--confidence', '0.85',
        '--json'
      ]);

      expect(result.status).toBe('error');
      expect(result.error).toContain('not found');
    }, TEST_TIMEOUT);

    it('should reject completion with invalid confidence score', () => {
      const result = executeCLI([
        'agent-lifecycle', 'complete',
        '--id', TEST_AGENT_ID,
        '--confidence', '1.5',
        '--json'
      ]);

      expect(result.status).toBe('error');
      expect(result.error).toContain('Confidence must be between 0.0 and 1.0');
    }, TEST_TIMEOUT);
  });

  describe('end-to-end workflow', () => {
    it('should handle complete agent lifecycle', () => {
      const agentId = `${TEST_AGENT_ID}-e2e`;

      // 1. Spawn agent
      const spawnResult = executeCLI([
        'agent-lifecycle', 'spawn',
        '--id', agentId,
        '--type', TEST_AGENT_TYPE,
        '--acl-level', String(TEST_ACL_LEVEL),
        '--swarm-id', TEST_SWARM_ID,
        '--json'
      ]);
      expect(spawnResult.status).toBe('success');

      // 2. Update confidence (low)
      const update1Result = executeCLI([
        'agent-lifecycle', 'update',
        '--id', agentId,
        '--confidence', '0.65',
        '--reasoning', 'Initial implementation',
        '--phase', 'development',
        '--iteration', '1',
        '--json'
      ]);
      expect(update1Result.status).toBe('success');

      // 3. Update confidence (passing gate)
      const update2Result = executeCLI([
        'agent-lifecycle', 'update',
        '--id', agentId,
        '--confidence', '0.85',
        '--reasoning', 'All tests passing, security validated',
        '--phase', 'development',
        '--iteration', '2',
        '--json'
      ]);
      expect(update2Result.status).toBe('success');

      // 4. Check status
      const statusResult = executeCLI([
        'agent-lifecycle', 'status',
        '--id', agentId,
        '--json'
      ]);
      expect(statusResult.status).toBe('success');
      expect(statusResult.events_count).toBeGreaterThanOrEqual(3);

      // 5. Terminate
      const terminateResult = executeCLI([
        'agent-lifecycle', 'terminate',
        '--id', agentId,
        '--reason', 'Task completed successfully',
        '--json'
      ]);
      expect(terminateResult.status).toBe('success');

      // 6. Verify final status
      const finalStatusResult = executeCLI([
        'agent-lifecycle', 'status',
        '--id', agentId,
        '--json'
      ]);
      expect(finalStatusResult.status).toBe('success');
      expect(finalStatusResult.events_count).toBeGreaterThanOrEqual(4);
    }, TEST_TIMEOUT);
  });
});
