/**
 * Agent Lifecycle Management Commands
 * Sprint 4.1: Agent Lifecycle SQLite Integration
 *
 * Provides CLI commands for agent lifecycle tracking:
 * - spawn: Register agent in SQLite on spawn
 * - update: Update agent status and metadata
 * - terminate: Mark agent as terminated
 * - status: Query agent lifecycle status
 *
 * Epic: production-blocking-coordination
 * Sprint: 4.1 - Agent Lifecycle CLI Integration
 *
 * @module cli/commands/agent-lifecycle
 */

import chalk from 'chalk';
import type { CommandContext } from '../cli-core.js';
import Redis from 'ioredis';
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { resolve } from 'path';

// ===== TYPE DEFINITIONS =====

/**
 * Agent type validation allowlist
 */
const VALID_AGENT_TYPES = [
  'coder',
  'tester',
  'reviewer',
  'architect',
  'researcher',
  'planner',
  'coordinator',
  'backend-dev',
  'frontend-dev',
  'mobile-dev',
  'devops-engineer',
  'cicd-engineer',
  'security-specialist',
  'perf-analyzer',
  'api-docs',
  'system-architect'
] as const;

type ValidAgentType = typeof VALID_AGENT_TYPES[number];

/**
 * ACL level range: 1-6
 */
type ACLLevel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Option schema for CLI flag parsing
 */
interface OptionSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean';
    default?: any;
  };
}

/**
 * Parse CLI flags into typed options object
 * Handles both short (--id) and long (--id) flag formats
 * Converts kebab-case to camelCase
 */
function parseCLIOptions<T>(ctx: CommandContext, schema: OptionSchema): T {
  const options: Record<string, any> = {};

  for (const [key, config] of Object.entries(schema)) {
    const kebabKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
    const value = ctx.flags[key] || ctx.flags[`--${kebabKey}`] || config.default;

    if (config.type === 'number') {
      options[key] = parseInt(String(value || config.default || '0'), 10);
    } else if (config.type === 'boolean') {
      options[key] = value === 'true' || value === true || !!value;
    } else {
      options[key] = value;
    }
  }

  return options as T;
}

/**
 * Spawn command options
 */
interface SpawnOptions {
  id: string;
  type: ValidAgentType;
  aclLevel: ACLLevel;
  name?: string;
  swarmId?: string;
  teamId?: string;
  projectId?: string;
  capabilities?: string;
  metadata?: string;
  json?: boolean;
}

/**
 * Update command options
 */
interface UpdateOptions {
  id: string;
  confidence?: number;
  reasoning?: string;
  phase?: string;
  iteration?: number;
  json?: boolean;
}

/**
 * Complete command options
 */
interface CompleteOptions {
  id: string;
  confidence: number;
  output?: string;
  metadata?: string;
  phase?: string;
  iteration?: number;
  json?: boolean;
}

/**
 * Terminate command options
 */
interface TerminateOptions {
  id: string;
  reason?: string;
  json?: boolean;
}

/**
 * Status command options
 */
interface StatusOptions {
  id: string;
  limit?: number;
  eventTypes?: string;
  json?: boolean;
}

// ===== OPTION SCHEMAS =====

const SPAWN_OPTIONS_SCHEMA: OptionSchema = {
  id: { type: 'string' },
  type: { type: 'string' },
  aclLevel: { type: 'number', default: 1 },
  name: { type: 'string' },
  swarmId: { type: 'string', default: 'default-swarm' },
  teamId: { type: 'string' },
  projectId: { type: 'string' },
  capabilities: { type: 'string' },
  metadata: { type: 'string' },
  json: { type: 'boolean', default: false }
};

const COMPLETE_OPTIONS_SCHEMA: OptionSchema = {
  id: { type: 'string' },
  confidence: { type: 'number', default: 0 },
  output: { type: 'string' },
  metadata: { type: 'string' },
  phase: { type: 'string' },
  iteration: { type: 'number' },
  json: { type: 'boolean', default: false }
};

// ===== SIMPLE SQLITE MANAGER =====

/**
 * Standalone SQLite manager for agent lifecycle (no CFNLoopMemoryManager dependency)
 */
class SimpleAgentLifecycleDB {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    // Create agents table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'spawned',
        confidence REAL,
        output TEXT,
        metadata TEXT,
        spawned_at TEXT NOT NULL,
        completed_at TEXT,
        updated_at TEXT NOT NULL
      )
    `);

    // Create lifecycle_events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lifecycle_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        confidence REAL,
        reasoning TEXT,
        phase TEXT,
        iteration INTEGER,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      )
    `);
  }

  spawnAgent(id: string, name: string, type: string, aclLevel: number, metadata: any = {}): void {
    const stmt = this.db.prepare(`
      INSERT INTO agents (id, name, type, status, metadata, spawned_at, updated_at)
      VALUES (?, ?, ?, 'spawned', ?, datetime('now'), datetime('now'))
    `);
    stmt.run(id, name, type, JSON.stringify({ aclLevel, ...metadata }));
  }

  getAgent(id: string): any {
    const stmt = this.db.prepare('SELECT * FROM agents WHERE id = ?');
    return stmt.get(id);
  }

  updateConfidence(id: string, confidence: number, reasoning: string, phase?: string, iteration?: number): void {
    // Update agent confidence
    const stmt = this.db.prepare(`
      UPDATE agents
      SET confidence = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(confidence, id);

    // Log event
    const eventStmt = this.db.prepare(`
      INSERT INTO lifecycle_events (agent_id, event_type, confidence, reasoning, phase, iteration, timestamp)
      VALUES (?, 'confidence_update', ?, ?, ?, ?, datetime('now'))
    `);
    eventStmt.run(id, confidence, reasoning, phase || null, iteration || null);
  }

  markCompleted(id: string, confidence: number, output?: string, metadata?: any): void {
    const stmt = this.db.prepare(`
      UPDATE agents
      SET status = 'completed', confidence = ?, output = ?, metadata = ?, completed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(confidence, output || null, metadata ? JSON.stringify(metadata) : null, id);

    // Log completion event
    const eventStmt = this.db.prepare(`
      INSERT INTO lifecycle_events (agent_id, event_type, confidence, reasoning, timestamp)
      VALUES (?, 'complete', ?, ?, datetime('now'))
    `);
    eventStmt.run(id, confidence, output || 'Agent completed');
  }

  terminate(id: string, reason: string): void {
    const stmt = this.db.prepare(`
      UPDATE agents
      SET status = 'terminated', updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(id);

    // Log termination event
    const eventStmt = this.db.prepare(`
      INSERT INTO lifecycle_events (agent_id, event_type, reasoning, timestamp)
      VALUES (?, 'terminate', ?, datetime('now'))
    `);
    eventStmt.run(id, reason);
  }

  getLifecycleHistory(id: string, options: { limit?: number; eventTypes?: string[] } = {}): any[] {
    let query = 'SELECT * FROM lifecycle_events WHERE agent_id = ?';
    const params: any[] = [id];

    if (options.eventTypes && options.eventTypes.length > 0) {
      query += ` AND event_type IN (${options.eventTypes.map(() => '?').join(',')})`;
      params.push(...options.eventTypes);
    }

    query += ' ORDER BY timestamp DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = this.db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Atomically mark agent as completed (prevents race conditions)
   * Security: CWE-362 prevention via optimistic locking
   *
   * Uses SQL transaction with atomic check-and-update to prevent TOCTOU vulnerability.
   * Returns true on success, throws error if agent doesn't exist or is already completed.
   */
  markCompletedAtomic(id: string, confidence: number, output?: string, metadata?: any): boolean {
    // Use transaction with status check
    const transaction = this.db.transaction((agentId: string, conf: number, out: string | null, meta: string | null) => {
      // Atomic check-and-update (prevents race condition)
      const result = this.db.prepare(`
        UPDATE agents
        SET status = 'completed', confidence = ?, output = ?, metadata = ?,
            completed_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND status != 'completed'
      `).run(conf, out, meta, agentId);

      if (result.changes === 0) {
        // Either agent doesn't exist or already completed
        const agent = this.db.prepare('SELECT status FROM agents WHERE id = ?').get(agentId) as any;
        if (!agent) {
          throw new Error(`Agent "${agentId}" not found. Use 'spawn' first.`);
        }
        if (agent.status === 'completed') {
          throw new Error(`Agent "${agentId}" is already completed`);
        }
        throw new Error(`Failed to complete agent "${agentId}"`);
      }

      // Log completion event
      this.db.prepare(`
        INSERT INTO lifecycle_events (agent_id, event_type, confidence, reasoning, timestamp)
        VALUES (?, 'complete', ?, ?, datetime('now'))
      `).run(agentId, conf, out || 'Agent completed');

      return true;
    });

    return transaction(id, confidence, output || null, metadata ? JSON.stringify(metadata) : null);
  }

  close(): void {
    this.db.close();
  }
}

// ===== VALIDATION FUNCTIONS =====

/**
 * Validate agent ID format
 * Format: alphanumeric with hyphens and underscores
 */
function validateAgentId(id: string): { valid: boolean; error?: string } {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'Agent ID is required' };
  }

  const idPattern = /^[a-zA-Z0-9_-]+$/;
  if (!idPattern.test(id)) {
    return { valid: false, error: 'Agent ID must contain only alphanumeric characters, hyphens, and underscores' };
  }

  if (id.length < 3 || id.length > 64) {
    return { valid: false, error: 'Agent ID must be between 3 and 64 characters' };
  }

  return { valid: true };
}

/**
 * Validate agent type
 */
function validateAgentType(type: string): { valid: boolean; error?: string } {
  if (!type || typeof type !== 'string') {
    return { valid: false, error: 'Agent type is required' };
  }

  if (!VALID_AGENT_TYPES.includes(type as ValidAgentType)) {
    return {
      valid: false,
      error: `Invalid agent type. Must be one of: ${VALID_AGENT_TYPES.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Validate ACL level
 */
function validateACLLevel(level: number): { valid: boolean; error?: string } {
  if (typeof level !== 'number') {
    return { valid: false, error: 'ACL level is required' };
  }

  if (level < 1 || level > 6) {
    return { valid: false, error: 'ACL level must be between 1 (private) and 6 (system)' };
  }

  if (!Number.isInteger(level)) {
    return { valid: false, error: 'ACL level must be an integer' };
  }

  return { valid: true };
}

/**
 * Validate confidence score
 */
function validateConfidence(confidence: number): { valid: boolean; error?: string } {
  if (typeof confidence !== 'number') {
    return { valid: false, error: 'Confidence must be a number' };
  }

  if (confidence < 0 || confidence > 1) {
    return { valid: false, error: 'Confidence must be between 0.0 and 1.0' };
  }

  return { valid: true };
}

/**
 * Sanitize error message for production (remove file paths, line numbers)
 * Security: CWE-209 prevention (Information Exposure Through Error Messages)
 *
 * Removes sensitive information from error messages in production:
 * - Absolute file paths (e.g., /home/user/project/file.ts:123:45)
 * - Relative file paths with line numbers
 * - Stack trace function locations
 * - Directory structures
 *
 * In DEBUG mode, original error messages are preserved for troubleshooting.
 *
 * @param message - Error message to sanitize
 * @returns Sanitized error message (or original if DEBUG=1)
 */
function sanitizeErrorMessage(message: string): string {
  // In DEBUG mode, preserve original error messages for troubleshooting
  if (process.env.DEBUG === '1') {
    return message;
  }

  // Production mode: remove sensitive information
  let sanitized = message;

  // Remove absolute file paths with line numbers (e.g., /path/to/file.ts:123:45)
  sanitized = sanitized.replace(/\/[^\s:]+\.(ts|js|tsx|jsx):\d+:\d+/g, '[file]');

  // Remove relative file paths with line numbers (e.g., ./src/file.ts:123)
  sanitized = sanitized.replace(/\.\/[^\s:]+\.(ts|js|tsx|jsx):\d+/g, '[file]');

  // Remove stack trace function locations (e.g., at functionName (/path/file.ts:123:45))
  sanitized = sanitized.replace(/at [^\s]+ \([^)]+\)/g, 'at [function]');

  // Remove absolute directory paths
  sanitized = sanitized.replace(/\/[^\s]+\//g, '[path]/');

  // Remove Windows-style paths (C:\Users\...)
  sanitized = sanitized.replace(/[A-Z]:\\[^\s]+\\/g, '[path]\\');

  return sanitized;
}

/**
 * Validate and parse JSON with size/depth limits
 * Security: CWE-754 prevention (DoS via unbounded input)
 *
 * Prevents DoS attacks via:
 * - Large JSON payloads (>100KB default)
 * - Deeply nested objects (>10 levels default)
 * - Circular references (depth check catches infinite recursion)
 *
 * @param jsonString - JSON string to parse
 * @param options - Validation options (maxSize, maxDepth)
 * @returns Parsed JSON object
 * @throws Error if validation fails
 */
function parseAndValidateJSON(
  jsonString: string,
  options: { maxSize?: number; maxDepth?: number } = {}
): any {
  const maxSize = options.maxSize || 102400; // 100KB default
  const maxDepth = options.maxDepth || 10;   // 10 levels default

  // Check size (DoS prevention)
  const sizeBytes = Buffer.byteLength(jsonString, 'utf8');
  if (sizeBytes > maxSize) {
    throw new Error(`JSON metadata too large (${sizeBytes} bytes, max ${maxSize})`);
  }

  // Parse JSON
  let parsed: any;
  try {
    parsed = JSON.parse(jsonString);
  } catch (error) {
    throw new Error(`Invalid JSON format: ${error instanceof Error ? error.message : 'parse error'}`);
  }

  // Check depth (DoS prevention via deeply nested objects)
  function checkDepth(obj: any, currentDepth: number = 0): void {
    if (currentDepth > maxDepth) {
      throw new Error(`JSON metadata too deeply nested (max depth: ${maxDepth})`);
    }

    if (obj && typeof obj === 'object') {
      // Handle arrays and objects
      for (const key in obj) {
        checkDepth(obj[key], currentDepth + 1);
      }
    }
  }

  checkDepth(parsed);

  return parsed;
}

// ===== INITIALIZATION HELPERS =====

/**
 * Initialize simple database for lifecycle operations
 */
function initializeDatabase(): SimpleAgentLifecycleDB {
  const dbPath = process.env.AGENT_LIFECYCLE_DB || './agent-lifecycle.db';
  return new SimpleAgentLifecycleDB(dbPath);
}

/**
 * Initialize Redis for event bus coordination
 */
function initializeRedis(): Redis {
  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 1000, 3000);
    }
  });
}

// ===== COMMAND HANDLERS =====

/**
 * Handle agent spawn registration
 */
async function handleAgentSpawn(ctx: CommandContext): Promise<void> {
  // Debug: log flags
  if (process.env.DEBUG === '1') {
    console.log('DEBUG: ctx.flags:', JSON.stringify(ctx.flags, null, 2));
  }

  // Parse options from flags using generic utility
  const options = parseCLIOptions<SpawnOptions>(ctx, SPAWN_OPTIONS_SCHEMA);

  if (process.env.DEBUG === '1') {
    console.log('DEBUG: parsed options:', JSON.stringify(options, null, 2));
  }

  try {
    // Validate required parameters
    const idValidation = validateAgentId(options.id);
    if (!idValidation.valid) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'error', error: idValidation.error }, null, 2));
      } else {
        console.error(chalk.red(`✗ ${idValidation.error}`));
      }
      process.exit(1);
    }

    const typeValidation = validateAgentType(options.type);
    if (!typeValidation.valid) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'error', error: typeValidation.error }, null, 2));
      } else {
        console.error(chalk.red(`✗ ${typeValidation.error}`));
      }
      process.exit(1);
    }

    const aclValidation = validateACLLevel(options.aclLevel);
    if (!aclValidation.valid) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'error', error: aclValidation.error }, null, 2));
      } else {
        console.error(chalk.red(`✗ ${aclValidation.error}`));
      }
      process.exit(1);
    }

    // Initialize database
    const db = initializeDatabase();

    try {
      // Parse optional metadata with size/depth validation
      let metadata: any = {};
      if (options.metadata) {
        metadata = parseAndValidateJSON(options.metadata, {
          maxSize: 102400,  // 100KB
          maxDepth: 10
        });
      }

      // Parse optional capabilities
      if (options.capabilities) {
        metadata.capabilities = options.capabilities.split(',').map(c => c.trim());
      }

      // Add context to metadata
      metadata.swarmId = options.swarmId || 'default-swarm';
      metadata.teamId = options.teamId;
      metadata.projectId = options.projectId;

      // Register agent spawn
      db.spawnAgent(options.id, options.name || options.id, options.type, options.aclLevel, metadata);

      const spawnTimestamp = Date.now();

      // Output result
      if (options.json) {
        console.log(JSON.stringify({
          status: 'success',
          agent_id: options.id,
          type: options.type,
          spawned_at: spawnTimestamp,
          swarm_id: options.swarmId || 'default-swarm',
          acl_level: options.aclLevel
        }, null, 2));
      } else {
        console.log(chalk.green(`✓ Agent ${chalk.bold(options.id)} spawned successfully`));
        console.log(chalk.gray(`  Type: ${options.type}`));
        console.log(chalk.gray(`  ACL Level: ${options.aclLevel}`));
        console.log(chalk.gray(`  Swarm: ${options.swarmId || 'default-swarm'}`));
        console.log(chalk.gray(`  Spawned at: ${new Date(spawnTimestamp).toISOString()}`));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    // Security: CWE-209 - Never expose stack traces in production
    // Stack traces only shown in DEBUG mode (non-JSON output)
    if (options.json) {
      console.log(JSON.stringify({
        status: 'error',
        error: sanitizeErrorMessage(errorMessage)
      }, null, 2));
    } else {
      console.error(chalk.red(`✗ Failed to spawn agent: ${sanitizeErrorMessage(errorMessage)}`));
      if (process.env.DEBUG === '1' && errorStack) {
        console.error(chalk.gray('Stack trace (DEBUG mode):'));
        console.error(chalk.gray(errorStack));
      }
    }
    process.exit(1);
  }
}

/**
 * Handle agent confidence update
 */
async function handleAgentUpdate(ctx: CommandContext): Promise<void> {
  const options = ctx.flags as unknown as UpdateOptions;

  try {
    // Validate agent ID
    const idValidation = validateAgentId(options.id);
    if (!idValidation.valid) {
      console.error(chalk.red(`✗ ${idValidation.error}`));
      process.exit(1);
    }

    // Validate confidence if provided
    if (options.confidence !== undefined) {
      const confidenceValidation = validateConfidence(options.confidence);
      if (!confidenceValidation.valid) {
        console.error(chalk.red(`✗ ${confidenceValidation.error}`));
        process.exit(1);
      }
    }

    const db = initializeDatabase();

    try {
      if (options.confidence !== undefined) {
        db.updateConfidence(
          options.id,
          options.confidence,
          options.reasoning || 'No reasoning provided',
          options.phase,
          options.iteration
        );

        if (options.json) {
          console.log(JSON.stringify({
            status: 'success',
            agent_id: options.id,
            confidence: options.confidence,
            updated_at: Date.now()
          }, null, 2));
        } else {
          console.log(chalk.green(`✓ Agent ${chalk.bold(options.id)} confidence updated to ${options.confidence}`));
        }
      } else {
        console.error(chalk.red('✗ No update parameters provided'));
        process.exit(1);
      }
    } finally {
      db.close();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Security: CWE-209 - Sanitize error messages in production
    console.error(chalk.red(`✗ Failed to update agent: ${sanitizeErrorMessage(errorMessage)}`));
    process.exit(1);
  }
}

/**
 * Handle agent complete command
 */
async function handleAgentComplete(ctx: CommandContext): Promise<void> {
  // Parse options from flags using generic utility
  const options = parseCLIOptions<CompleteOptions>(ctx, COMPLETE_OPTIONS_SCHEMA);

  try {
    // Validate agent ID
    const idValidation = validateAgentId(options.id);
    if (!idValidation.valid) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'error', error: idValidation.error }, null, 2));
      } else {
        console.error(chalk.red(`✗ ${idValidation.error}`));
      }
      process.exit(1);
    }

    // Validate confidence
    const confidenceValidation = validateConfidence(options.confidence);
    if (!confidenceValidation.valid) {
      if (options.json) {
        console.log(JSON.stringify({ status: 'error', error: confidenceValidation.error }, null, 2));
      } else {
        console.error(chalk.red(`✗ ${confidenceValidation.error}`));
      }
      process.exit(1);
    }

    // Initialize database
    const db = initializeDatabase();

    try {
      // Parse optional metadata with size/depth validation
      let metadata: any = {};
      if (options.metadata) {
        metadata = parseAndValidateJSON(options.metadata, {
          maxSize: 102400,  // 100KB
          maxDepth: 10
        });
      }

      // Add phase/iteration to metadata
      if (options.phase) metadata.phase = options.phase;
      if (options.iteration) metadata.iteration = options.iteration;

      // Atomic completion (prevents TOCTOU race condition)
      // Security: CWE-362 prevention via transaction-based optimistic locking
      db.markCompletedAtomic(options.id, options.confidence, options.output, metadata);

      // CFN Loop 3 gate check
      const gatePass = options.confidence >= 0.75;
      const gateStatus = gatePass ? 'PASS ✅' : 'FAIL ❌';

      // Output result
      if (options.json) {
        console.log(JSON.stringify({
          status: 'success',
          agent_id: options.id,
          confidence: options.confidence,
          gate_status: gateStatus,
          gate_threshold: 0.75,
          completed_at: Date.now()
        }, null, 2));
      } else {
        console.log(chalk.green(`✓ Agent ${chalk.bold(options.id)} marked as completed`));
        console.log(chalk.gray(`  Confidence: ${options.confidence.toFixed(2)} (CFN Loop 3 Gate: ${gateStatus})`));

        if (options.output) {
          const truncated = options.output.substring(0, 60);
          console.log(chalk.gray(`  Output: ${truncated}${options.output.length > 60 ? '...' : ''}`));
        }

        if (options.phase) {
          console.log(chalk.gray(`  Phase: ${options.phase}`));
        }
      }
    } finally {
      db.close();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Security: CWE-209 - Never expose stack traces in production (JSON or non-JSON)
    if (options.json) {
      console.log(JSON.stringify({
        status: 'error',
        error: sanitizeErrorMessage(errorMessage)
      }, null, 2));
    } else {
      console.error(chalk.red(`✗ Failed to complete agent: ${sanitizeErrorMessage(errorMessage)}`));
    }
    process.exit(1);
  }
}

/**
 * Handle agent termination
 */
async function handleAgentTerminate(ctx: CommandContext): Promise<void> {
  const options = ctx.flags as unknown as TerminateOptions;

  try {
    const idValidation = validateAgentId(options.id);
    if (!idValidation.valid) {
      console.error(chalk.red(`✗ ${idValidation.error}`));
      process.exit(1);
    }

    const db = initializeDatabase();

    try {
      db.terminate(options.id, options.reason || 'Normal termination');

      if (options.json) {
        console.log(JSON.stringify({
          status: 'success',
          agent_id: options.id,
          terminated_at: Date.now()
        }, null, 2));
      } else {
        console.log(chalk.green(`✓ Agent ${chalk.bold(options.id)} terminated`));
        console.log(chalk.gray(`  Reason: ${options.reason || 'Normal termination'}`));
      }
    } finally {
      db.close();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Security: CWE-209 - Sanitize error messages in production
    console.error(chalk.red(`✗ Failed to terminate agent: ${sanitizeErrorMessage(errorMessage)}`));
    process.exit(1);
  }
}

/**
 * Handle agent status query
 */
async function handleAgentStatus(ctx: CommandContext): Promise<void> {
  const options = ctx.flags as unknown as StatusOptions;

  try {
    const idValidation = validateAgentId(options.id);
    if (!idValidation.valid) {
      console.error(chalk.red(`✗ ${idValidation.error}`));
      process.exit(1);
    }

    const db = initializeDatabase();

    try {
      const eventTypes = options.eventTypes ? options.eventTypes.split(',') : undefined;
      const history = db.getLifecycleHistory(
        options.id,
        {
          limit: options.limit,
          eventTypes
        }
      );

      if (options.json) {
        console.log(JSON.stringify({
          status: 'success',
          agent_id: options.id,
          events_count: history.length,
          events: history
        }, null, 2));
      } else {
        console.log(chalk.blue(`Agent Lifecycle: ${chalk.bold(options.id)}`));
        console.log(chalk.gray(`Total events: ${history.length}\n`));

        for (const event of history) {
          console.log(chalk.cyan(`[${event.timestamp}] ${event.event_type}`));
          if (event.reasoning) {
            console.log(chalk.gray(`  ${event.reasoning}`));
          }
          if (event.confidence !== null) {
            console.log(chalk.gray(`  Confidence: ${event.confidence}`));
          }
        }
      }
    } finally {
      db.close();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // Security: CWE-209 - Sanitize error messages in production
    console.error(chalk.red(`✗ Failed to query agent status: ${sanitizeErrorMessage(errorMessage)}`));
    process.exit(1);
  }
}

// ===== COMMAND EXPORTS =====

/**
 * Agent lifecycle spawn command
 */
export const agentLifecycleSpawnCommand = {
  name: 'spawn',
  description: 'Register agent spawn in SQLite',
  options: [
    {
      name: 'id',
      description: 'Agent ID (alphanumeric-hyphen format)',
      type: 'string' as const,
      required: true
    },
    {
      name: 'type',
      description: `Agent type (${VALID_AGENT_TYPES.join(', ')})`,
      type: 'string' as const,
      required: true
    },
    {
      name: 'acl-level',
      description: 'ACL level (1=private, 2=agent, 3=swarm, 4=project, 5=team, 6=system)',
      type: 'number' as const,
      required: true
    },
    {
      name: 'name',
      description: 'Agent display name',
      type: 'string' as const
    },
    {
      name: 'swarm-id',
      description: 'Swarm ID',
      type: 'string' as const
    },
    {
      name: 'team-id',
      description: 'Team ID',
      type: 'string' as const
    },
    {
      name: 'project-id',
      description: 'Project ID',
      type: 'string' as const
    },
    {
      name: 'capabilities',
      description: 'Comma-separated capabilities',
      type: 'string' as const
    },
    {
      name: 'metadata',
      description: 'JSON metadata',
      type: 'string' as const
    },
    {
      name: 'json',
      description: 'Output JSON format',
      type: 'boolean' as const
    }
  ],
  action: handleAgentSpawn
};

/**
 * Agent lifecycle update command
 */
export const agentLifecycleUpdateCommand = {
  name: 'update',
  description: 'Update agent confidence and metadata',
  options: [
    {
      name: 'id',
      description: 'Agent ID',
      type: 'string' as const,
      required: true
    },
    {
      name: 'confidence',
      description: 'Confidence score (0.0-1.0)',
      type: 'number' as const
    },
    {
      name: 'reasoning',
      description: 'Reasoning for confidence score',
      type: 'string' as const
    },
    {
      name: 'phase',
      description: 'Current phase',
      type: 'string' as const
    },
    {
      name: 'iteration',
      description: 'Current iteration',
      type: 'number' as const
    },
    {
      name: 'json',
      description: 'Output JSON format',
      type: 'boolean' as const
    }
  ],
  action: handleAgentUpdate
};

/**
 * Agent lifecycle complete command
 */
export const agentLifecycleCompleteCommand = {
  name: 'complete',
  description: 'Mark agent as completed with confidence score (CFN Loop 3 gate)',
  options: [
    {
      name: 'id',
      description: 'Agent ID',
      type: 'string' as const,
      required: true
    },
    {
      name: 'confidence',
      description: 'Confidence score (0.0-1.0, gate threshold: 0.75)',
      type: 'number' as const,
      required: true
    },
    {
      name: 'output',
      description: 'Agent output/reasoning',
      type: 'string' as const
    },
    {
      name: 'metadata',
      description: 'JSON metadata',
      type: 'string' as const
    },
    {
      name: 'phase',
      description: 'CFN Loop phase',
      type: 'string' as const
    },
    {
      name: 'iteration',
      description: 'CFN Loop iteration number',
      type: 'number' as const
    },
    {
      name: 'json',
      description: 'Output JSON format',
      type: 'boolean' as const
    }
  ],
  action: handleAgentComplete
};

/**
 * Agent lifecycle terminate command
 */
export const agentLifecycleTerminateCommand = {
  name: 'terminate',
  description: 'Mark agent as terminated',
  options: [
    {
      name: 'id',
      description: 'Agent ID',
      type: 'string' as const,
      required: true
    },
    {
      name: 'reason',
      description: 'Termination reason',
      type: 'string' as const
    },
    {
      name: 'json',
      description: 'Output JSON format',
      type: 'boolean' as const
    }
  ],
  action: handleAgentTerminate
};

/**
 * Agent lifecycle status command
 */
export const agentLifecycleStatusCommand = {
  name: 'status',
  description: 'Query agent lifecycle history',
  options: [
    {
      name: 'id',
      description: 'Agent ID',
      type: 'string' as const,
      required: true
    },
    {
      name: 'limit',
      description: 'Max events to return',
      type: 'number' as const
    },
    {
      name: 'event-types',
      description: 'Comma-separated event types to filter',
      type: 'string' as const
    },
    {
      name: 'json',
      description: 'Output JSON format',
      type: 'boolean' as const
    }
  ],
  action: handleAgentStatus
};

/**
 * Main action handler for agent-lifecycle command
 * Routes to appropriate subcommand based on first argument
 */
async function handleAgentLifecycle(ctx: CommandContext): Promise<void> {
  const subcommand = ctx.args[0];

  if (!subcommand) {
    console.error(chalk.red('✗ Subcommand required'));
    console.log(chalk.gray('\nAvailable subcommands:'));
    console.log(chalk.gray('  spawn      - Register agent spawn in SQLite'));
    console.log(chalk.gray('  update     - Update agent confidence and metadata'));
    console.log(chalk.gray('  complete   - Mark agent as completed (CFN Loop 3 gate)'));
    console.log(chalk.gray('  terminate  - Mark agent as terminated'));
    console.log(chalk.gray('  status     - Query agent lifecycle history'));
    console.log(chalk.gray('\nUsage: claude-flow-novice agent-lifecycle <subcommand> [options]'));
    process.exit(1);
  }

  // Route to appropriate subcommand
  switch (subcommand) {
    case 'spawn':
      await handleAgentSpawn(ctx);
      break;
    case 'update':
      await handleAgentUpdate(ctx);
      break;
    case 'complete':
      await handleAgentComplete(ctx);
      break;
    case 'terminate':
      await handleAgentTerminate(ctx);
      break;
    case 'status':
      await handleAgentStatus(ctx);
      break;
    default:
      console.error(chalk.red(`✗ Unknown subcommand: ${subcommand}`));
      console.log(chalk.gray('Use "agent-lifecycle" without arguments to see available subcommands'));
      process.exit(1);
  }
}

/**
 * Complete agent-lifecycle command with subcommands
 */
export const agentLifecycleCommand = {
  name: 'agent-lifecycle',
  description: 'Agent lifecycle management (SQLite integration)',
  action: handleAgentLifecycle,
  subcommands: [
    agentLifecycleSpawnCommand,
    agentLifecycleUpdateCommand,
    agentLifecycleCompleteCommand,
    agentLifecycleTerminateCommand,
    agentLifecycleStatusCommand
  ]
};
