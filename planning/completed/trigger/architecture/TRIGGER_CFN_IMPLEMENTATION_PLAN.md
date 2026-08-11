# Trigger.dev CFN Loop Implementation Plan

**Version:** 1.0.0
**Date:** 2025-11-26
**Status:** Planning
**Goal:** Get CFN Loops working robustly in Trigger.dev with proper coordination, MDAP support, and observability

---

## Executive Summary

This plan addresses the architectural gaps identified in our Trigger.dev CFN Loop integration:

1. **Separation of concerns**: Orchestrator (deterministic) vs Coordinator (strategic)
2. **Redis coordination**: Real-time completion signals instead of polling-as-primary
3. **Postgres observability**: Full logging and metrics for troubleshooting
4. **Task decomposition**: Phase-level parallelism with TDD at every stage
5. **MDAP foundation**: Micro-task support with tier escalation (future-ready)

**Current State**: Infrastructure works, but CLI hangs on completion, no Redis coordination, no observability.

**Target State**: Robust CFN Loops with instant completion signals, full traceability, and MDAP-ready architecture.

---

## Table of Contents

1. [Phase 0: Infrastructure Setup](#phase-0-infrastructure-setup)
2. [Phase 1: Fix CLI Execution](#phase-1-fix-cli-execution)
3. [Phase 2: Add CFN Postgres & Redis](#phase-2-add-cfn-postgres--redis)
4. [Phase 3: Implement Proper Coordination](#phase-3-implement-proper-coordination)
5. [Phase 4: Task Decomposition & Parallelism](#phase-4-task-decomposition--parallelism)
6. [Phase 5: MDAP Foundation](#phase-5-mdap-foundation)
7. [Phase 6: Testing & Validation](#phase-6-testing--validation)
8. [File Structure](#file-structure)
9. [Success Criteria](#success-criteria)

---

## Phase 0: Infrastructure Setup

**Duration**: 1-2 hours
**Prerequisites**: Docker, Node.js 20+

### 0.1 Start Trigger.dev Infrastructure

```bash
# Start Trigger.dev v4 services
cd docker/trigger-dev-v4/hosting/docker
docker compose -f webapp/docker-compose.yml -f worker/docker-compose.yml up -d

# Verify all 9 services are running
docker compose -f webapp/docker-compose.yml -f worker/docker-compose.yml ps
```

### 0.2 Create CFN Infrastructure Stack

**File**: `docker/trigger-dev/docker-compose.cfn.yml`

```yaml
version: '3.8'

services:
  cfn-postgres:
    image: postgres:15-alpine
    container_name: cfn-postgres
    environment:
      POSTGRES_USER: cfn
      POSTGRES_PASSWORD: cfn_dev_password
      POSTGRES_DB: cfn_loop
    ports:
      - "5435:5432"
    volumes:
      - cfn-postgres-data:/var/lib/postgresql/data
      - ./schema/init-db.sql:/docker-entrypoint-initdb.d/init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cfn -d cfn_loop"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - cfn-trigger-network

  cfn-redis:
    image: redis:7-alpine
    container_name: cfn-redis
    ports:
      - "6390:6379"
    command: redis-server --appendonly yes
    volumes:
      - cfn-redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    networks:
      - cfn-trigger-network

volumes:
  cfn-postgres-data:
  cfn-redis-data:

networks:
  cfn-trigger-network:
    name: cfn-trigger-network
```

### 0.3 Database Schema

**File**: `docker/trigger-dev/schema/init-db.sql`

```sql
-- =============================================
-- CFN Loop Core Tables
-- =============================================

-- Tasks (top-level CFN Loop execution)
CREATE TABLE cfn_tasks (
    id VARCHAR(64) PRIMARY KEY,
    description TEXT NOT NULL,
    mode VARCHAR(20) NOT NULL DEFAULT 'standard',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    max_iterations INT NOT NULL DEFAULT 10,
    current_iteration INT NOT NULL DEFAULT 0,
    provider VARCHAR(20),
    work_dir VARCHAR(512),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    final_decision VARCHAR(20),
    final_pass_rate DECIMAL(5,4),
    final_consensus DECIMAL(5,4),
    error_message TEXT,

    trigger_run_id VARCHAR(64),
    metadata JSONB DEFAULT '{}'
);

-- Iterations
CREATE TABLE cfn_iterations (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(64) REFERENCES cfn_tasks(id),
    iteration_number INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    gate_pass_rate DECIMAL(5,4),
    gate_passed BOOLEAN,
    consensus_score DECIMAL(5,4),
    consensus_passed BOOLEAN,
    decision VARCHAR(20),

    coordinator_manifest JSONB,
    metadata JSONB DEFAULT '{}',

    UNIQUE(task_id, iteration_number)
);

-- Phases within iterations
CREATE TABLE cfn_phases (
    id SERIAL PRIMARY KEY,
    iteration_id INT REFERENCES cfn_iterations(id),
    phase_number INT NOT NULL,
    phase_name VARCHAR(100),
    parallel BOOLEAN DEFAULT false,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    agents_total INT,
    agents_completed INT DEFAULT 0,
    agents_passed INT DEFAULT 0,

    UNIQUE(iteration_id, phase_number)
);

-- Agents
CREATE TABLE cfn_agents (
    id VARCHAR(64) PRIMARY KEY,
    task_id VARCHAR(64) REFERENCES cfn_tasks(id),
    iteration_id INT REFERENCES cfn_iterations(id),
    phase_id INT REFERENCES cfn_phases(id),

    agent_type VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL,

    assigned_files TEXT[],
    assigned_tests TEXT[],
    task_description TEXT,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    duration_ms INT,

    success BOOLEAN,
    tests_passed BOOLEAN,
    confidence DECIMAL(5,4),
    files_modified TEXT[],
    error_message TEXT,

    trigger_run_id VARCHAR(64),
    trigger_batch_id VARCHAR(64),

    output JSONB,
    metadata JSONB DEFAULT '{}'
);

-- =============================================
-- Logging
-- =============================================

CREATE TYPE log_level AS ENUM ('debug', 'info', 'warn', 'error', 'fatal');

CREATE TABLE cfn_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),

    task_id VARCHAR(64),
    iteration_id INT,
    agent_id VARCHAR(64),
    component VARCHAR(50),

    level log_level NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,

    data JSONB DEFAULT '{}',

    error_type VARCHAR(100),
    error_stack TEXT
);

CREATE INDEX idx_logs_task_id ON cfn_logs(task_id);
CREATE INDEX idx_logs_agent_id ON cfn_logs(agent_id);
CREATE INDEX idx_logs_timestamp ON cfn_logs(timestamp DESC);
CREATE INDEX idx_logs_level ON cfn_logs(level) WHERE level IN ('error', 'fatal');

-- =============================================
-- Test Results
-- =============================================

CREATE TABLE cfn_test_runs (
    id SERIAL PRIMARY KEY,
    task_id VARCHAR(64) REFERENCES cfn_tasks(id),
    iteration_id INT REFERENCES cfn_iterations(id),
    agent_id VARCHAR(64),

    test_command VARCHAR(512),
    work_dir VARCHAR(512),

    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INT,

    exit_code INT,
    total_tests INT,
    passed_tests INT,
    failed_tests INT,
    skipped_tests INT,
    pass_rate DECIMAL(5,4),

    stdout TEXT,
    stderr TEXT,

    failed_test_names TEXT[],
    failure_details JSONB
);

CREATE INDEX idx_test_runs_task ON cfn_test_runs(task_id);

-- =============================================
-- MDAP Tables (Phase 5)
-- =============================================

CREATE TABLE mdap_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(64),
    micro_task_id VARCHAR(64) NOT NULL,

    profile VARCHAR(20) NOT NULL,
    complexity VARCHAR(20) NOT NULL,

    attempts JSONB NOT NULL,
    final_tier INT NOT NULL,
    final_model VARCHAR(50) NOT NULL,

    success BOOLEAN NOT NULL,
    red_flagged BOOLEAN DEFAULT FALSE,
    escalation_count INT DEFAULT 0,

    total_latency_ms INT NOT NULL,
    total_cost_usd DECIMAL(10,6) NOT NULL,
    test_pass_rate DECIMAL(5,4),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mdap_task ON mdap_executions(task_id);
CREATE INDEX idx_mdap_profile ON mdap_executions(profile);
CREATE INDEX idx_mdap_success ON mdap_executions(success);

CREATE TABLE mdap_model_stats (
    model VARCHAR(50) NOT NULL,
    complexity VARCHAR(20) NOT NULL,
    profile VARCHAR(20) NOT NULL,

    total_attempts INT DEFAULT 0,
    success_count INT DEFAULT 0,
    success_rate DECIMAL(5,4),

    avg_latency_ms INT,
    avg_cost_usd DECIMAL(10,6),

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (model, complexity, profile)
);

-- =============================================
-- Views
-- =============================================

CREATE VIEW v_task_summary AS
SELECT
    t.id,
    t.description,
    t.mode,
    t.status,
    t.current_iteration,
    t.final_decision,
    t.final_pass_rate,
    t.created_at,
    t.completed_at,
    EXTRACT(EPOCH FROM (t.completed_at - t.started_at)) as duration_seconds,
    COUNT(DISTINCT a.id) as total_agents,
    COUNT(DISTINCT a.id) FILTER (WHERE a.success = true) as successful_agents
FROM cfn_tasks t
LEFT JOIN cfn_agents a ON t.id = a.task_id
GROUP BY t.id;

CREATE VIEW v_recent_errors AS
SELECT
    l.timestamp,
    l.task_id,
    l.agent_id,
    l.component,
    l.message,
    l.error_type,
    l.data
FROM cfn_logs l
WHERE l.level IN ('error', 'fatal')
ORDER BY l.timestamp DESC
LIMIT 100;
```

### 0.4 Start CFN Infrastructure

```bash
cd docker/trigger-dev
docker compose -f docker-compose.cfn.yml up -d

# Verify
docker exec cfn-postgres pg_isready -U cfn -d cfn_loop
docker exec cfn-redis redis-cli ping
```

### 0.5 Environment Configuration

**File**: `docker/trigger-dev/.env`

```bash
# Trigger.dev
TRIGGER_SECRET_KEY=[REDACTED]
TRIGGER_API_URL=http://localhost:8030

# CFN Postgres
CFN_POSTGRES_HOST=localhost
CFN_POSTGRES_PORT=5435
CFN_POSTGRES_DB=cfn_loop
CFN_POSTGRES_USER=cfn
CFN_POSTGRES_PASSWORD=cfn_dev_password

# CFN Redis
CFN_REDIS_URL=redis://localhost:6390

# AI Providers
ZAI_API_KEY=your-zai-key
ZAI_BASE_URL=https://api.z.ai/api/anthropic
ANTHROPIC_API_KEY=your-anthropic-key
```

---

## Phase 1: Fix CLI Execution

**Duration**: 1-2 hours
**Goal**: Ensure Claude Code CLI completes and exits properly

### 1.1 Add forceKillAfterDelay

**File**: `docker/trigger-dev/src/trigger/cfn-implementer.ts` (line ~353)

```typescript
// Add forceKillAfterDelay to ensure process terminates
const result = await execa(CLI_COMMAND, cliArgs, {
  cwd: payload.workDir,
  timeout: payload.timeout || 600000,  // 10 minutes default
  forceKillAfterDelay: 5000,           // Force SIGKILL after 5s
  stripFinalNewline: true,
  reject: false,
  env: cliEnv,
});
```

### 1.2 Add Execution Wrapper with Timeout Logging

```typescript
// src/lib/cli-executor.ts
import { execa, type Options } from 'execa';

interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  killed: boolean;
  durationMs: number;
}

export async function executeClaudeCli(
  args: string[],
  options: {
    cwd: string;
    timeout: number;
    env: Record<string, string>;
    onTimeout?: () => void;
  }
): Promise<ExecutionResult> {
  const startTime = Date.now();

  const execaOptions: Options = {
    cwd: options.cwd,
    timeout: options.timeout,
    forceKillAfterDelay: 5000,
    stripFinalNewline: true,
    reject: false,
    env: {
      ...process.env,
      ...options.env,
    },
  };

  const result = await execa('npx', ['@anthropic-ai/claude-code', ...args], execaOptions);

  const durationMs = Date.now() - startTime;

  if (result.timedOut && options.onTimeout) {
    options.onTimeout();
  }

  return {
    success: result.exitCode === 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode ?? -1,
    timedOut: result.timedOut || false,
    killed: result.killed || false,
    durationMs,
  };
}
```

### 1.3 Validation Test

**File**: `docker/trigger-dev/test-cli-execution.ts`

```typescript
import { configure, tasks, runs } from "@trigger.dev/sdk/v3";

configure({
  secretKey: process.env.TRIGGER_SECRET_KEY,
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

async function main() {
  console.log("Testing CLI execution with forceKillAfterDelay...");

  const handle = await tasks.trigger("cfn-implementer", {
    taskDescription: "Create a file called hello.txt with content 'Hello World'",
    workDir: "/tmp/cli-test-" + Date.now(),
    agentType: "typescript-specialist",
    provider: "zai",
    timeout: 60000,  // 1 minute timeout
  });

  console.log(`Run ID: ${handle.id}`);

  const startTime = Date.now();
  const result = await runs.poll(handle.id, { pollIntervalMs: 2000 });
  const duration = Date.now() - startTime;

  console.log(`Status: ${result.status}`);
  console.log(`Duration: ${duration}ms`);
  console.log(`Output:`, result.output);

  if (duration > 120000) {
    console.error("❌ FAIL: Took longer than 2 minutes");
    process.exit(1);
  }

  console.log("✅ CLI execution completed within expected time");
}

main().catch(console.error);
```

---

## Phase 2: Add CFN Postgres & Redis

**Duration**: 2-3 hours
**Goal**: Database client library and Redis coordination

### 2.1 Install Dependencies

```bash
cd docker/trigger-dev
npm install pg ioredis
npm install -D @types/pg
```

### 2.2 Database Client Library

**File**: `docker/trigger-dev/src/lib/cfn-db.ts`

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.CFN_POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.CFN_POSTGRES_PORT || '5435'),
  database: process.env.CFN_POSTGRES_DB || 'cfn_loop',
  user: process.env.CFN_POSTGRES_USER || 'cfn',
  password: process.env.CFN_POSTGRES_PASSWORD || 'cfn_dev_password',
});

// =============================================
// Task Operations
// =============================================

export async function createTask(params: {
  id: string;
  description: string;
  mode: string;
  maxIterations: number;
  provider?: string;
  workDir?: string;
  triggerRunId?: string;
}): Promise<any> {
  const result = await pool.query(
    `INSERT INTO cfn_tasks
     (id, description, mode, max_iterations, provider, work_dir, trigger_run_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING *`,
    [params.id, params.description, params.mode, params.maxIterations,
     params.provider, params.workDir, params.triggerRunId]
  );
  return result.rows[0];
}

export async function updateTaskStatus(
  taskId: string,
  status: string,
  updates?: {
    currentIteration?: number;
    finalDecision?: string;
    finalPassRate?: number;
    finalConsensus?: number;
    errorMessage?: string;
  }
): Promise<void> {
  const setClauses = ['status = $2'];
  const values: any[] = [taskId, status];
  let paramIndex = 3;

  if (status === 'running') {
    setClauses.push('started_at = NOW()');
  }
  if (['completed', 'failed', 'aborted'].includes(status)) {
    setClauses.push('completed_at = NOW()');
  }

  if (updates) {
    if (updates.currentIteration !== undefined) {
      setClauses.push(`current_iteration = $${paramIndex++}`);
      values.push(updates.currentIteration);
    }
    if (updates.finalDecision) {
      setClauses.push(`final_decision = $${paramIndex++}`);
      values.push(updates.finalDecision);
    }
    if (updates.finalPassRate !== undefined) {
      setClauses.push(`final_pass_rate = $${paramIndex++}`);
      values.push(updates.finalPassRate);
    }
    if (updates.finalConsensus !== undefined) {
      setClauses.push(`final_consensus = $${paramIndex++}`);
      values.push(updates.finalConsensus);
    }
    if (updates.errorMessage) {
      setClauses.push(`error_message = $${paramIndex++}`);
      values.push(updates.errorMessage);
    }
  }

  await pool.query(
    `UPDATE cfn_tasks SET ${setClauses.join(', ')} WHERE id = $1`,
    values
  );
}

// =============================================
// Iteration Operations
// =============================================

export async function createIteration(params: {
  taskId: string;
  iterationNumber: number;
  coordinatorManifest?: object;
}): Promise<any> {
  const result = await pool.query(
    `INSERT INTO cfn_iterations
     (task_id, iteration_number, coordinator_manifest, status)
     VALUES ($1, $2, $3, 'running')
     RETURNING *`,
    [params.taskId, params.iterationNumber, JSON.stringify(params.coordinatorManifest || {})]
  );
  return result.rows[0];
}

export async function updateIteration(
  iterationId: number,
  updates: {
    status?: string;
    gatePassRate?: number;
    gatePassed?: boolean;
    consensusScore?: number;
    consensusPassed?: boolean;
    decision?: string;
    coordinatorManifest?: object;
  }
): Promise<void> {
  const setClauses: string[] = [];
  const values: any[] = [iterationId];
  let paramIndex = 2;

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
      if (key === 'coordinatorManifest') {
        setClauses.push(`coordinator_manifest = $${paramIndex++}`);
        values.push(JSON.stringify(value));
      } else {
        setClauses.push(`${snakeKey} = $${paramIndex++}`);
        values.push(value);
      }
    }
  }

  if (updates.status === 'completed') {
    setClauses.push('completed_at = NOW()');
  }

  if (setClauses.length > 0) {
    await pool.query(
      `UPDATE cfn_iterations SET ${setClauses.join(', ')} WHERE id = $1`,
      values
    );
  }
}

// =============================================
// Agent Operations
// =============================================

export async function createAgent(params: {
  id: string;
  taskId: string;
  iterationId: number;
  phaseId?: number;
  agentType: string;
  role: 'implementer' | 'validator' | 'coordinator';
  assignedFiles?: string[];
  assignedTests?: string[];
  taskDescription?: string;
  triggerRunId?: string;
}): Promise<any> {
  const result = await pool.query(
    `INSERT INTO cfn_agents
     (id, task_id, iteration_id, phase_id, agent_type, role,
      assigned_files, assigned_tests, task_description, trigger_run_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending')
     RETURNING *`,
    [params.id, params.taskId, params.iterationId, params.phaseId,
     params.agentType, params.role, params.assignedFiles, params.assignedTests,
     params.taskDescription, params.triggerRunId]
  );
  return result.rows[0];
}

export async function updateAgentStatus(
  agentId: string,
  status: string,
  updates?: {
    success?: boolean;
    testsPassed?: boolean;
    confidence?: number;
    filesModified?: string[];
    errorMessage?: string;
    output?: object;
    durationMs?: number;
  }
): Promise<void> {
  const setClauses = ['status = $2'];
  const values: any[] = [agentId, status];
  let paramIndex = 3;

  if (status === 'running') {
    setClauses.push('started_at = NOW()');
  }
  if (['completed', 'failed'].includes(status)) {
    setClauses.push('completed_at = NOW()');
  }

  if (updates) {
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
        if (key === 'output' || key === 'filesModified') {
          setClauses.push(`${snakeKey} = $${paramIndex++}`);
          values.push(key === 'output' ? JSON.stringify(value) : value);
        } else {
          setClauses.push(`${snakeKey} = $${paramIndex++}`);
          values.push(value);
        }
      }
    }
  }

  await pool.query(
    `UPDATE cfn_agents SET ${setClauses.join(', ')} WHERE id = $1`,
    values
  );
}

// =============================================
// Logging
// =============================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export async function log(params: {
  taskId?: string;
  iterationId?: number;
  agentId?: string;
  component: string;
  level: LogLevel;
  message: string;
  data?: object;
  errorType?: string;
  errorStack?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO cfn_logs
     (task_id, iteration_id, agent_id, component, level, message, data, error_type, error_stack)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [params.taskId, params.iterationId, params.agentId, params.component,
     params.level, params.message, JSON.stringify(params.data || {}),
     params.errorType, params.errorStack]
  );
}

export const logger = {
  debug: (component: string, message: string, ctx?: { taskId?: string; agentId?: string; data?: object }) =>
    log({ component, level: 'debug', message, ...ctx }),

  info: (component: string, message: string, ctx?: { taskId?: string; agentId?: string; data?: object }) =>
    log({ component, level: 'info', message, ...ctx }),

  warn: (component: string, message: string, ctx?: { taskId?: string; agentId?: string; data?: object }) =>
    log({ component, level: 'warn', message, ...ctx }),

  error: (component: string, message: string, error?: Error, ctx?: { taskId?: string; agentId?: string; data?: object }) =>
    log({
      component, level: 'error', message,
      errorType: error?.name, errorStack: error?.stack,
      ...ctx
    }),
};

// =============================================
// Test Results
// =============================================

export async function recordTestRun(params: {
  taskId: string;
  iterationId: number;
  agentId?: string;
  testCommand: string;
  workDir: string;
  exitCode: number;
  durationMs: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests?: number;
  stdout?: string;
  stderr?: string;
  failedTestNames?: string[];
}): Promise<void> {
  const passRate = params.totalTests > 0
    ? params.passedTests / params.totalTests
    : 0;

  await pool.query(
    `INSERT INTO cfn_test_runs
     (task_id, iteration_id, agent_id, test_command, work_dir,
      exit_code, duration_ms, total_tests, passed_tests, failed_tests, skipped_tests,
      pass_rate, stdout, stderr, failed_test_names, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
    [params.taskId, params.iterationId, params.agentId, params.testCommand, params.workDir,
     params.exitCode, params.durationMs, params.totalTests, params.passedTests,
     params.failedTests, params.skippedTests || 0, passRate, params.stdout, params.stderr,
     params.failedTestNames]
  );
}

// =============================================
// Queries
// =============================================

export async function getTaskWithDetails(taskId: string) {
  const [task, iterations, agents, logs] = await Promise.all([
    pool.query(`SELECT * FROM v_task_summary WHERE id = $1`, [taskId]),
    pool.query(`SELECT * FROM cfn_iterations WHERE task_id = $1 ORDER BY iteration_number`, [taskId]),
    pool.query(`SELECT * FROM cfn_agents WHERE task_id = $1 ORDER BY created_at`, [taskId]),
    pool.query(`SELECT * FROM cfn_logs WHERE task_id = $1 ORDER BY timestamp DESC LIMIT 100`, [taskId]),
  ]);

  return {
    task: task.rows[0],
    iterations: iterations.rows,
    agents: agents.rows,
    recentLogs: logs.rows
  };
}

export async function getRecentErrors(limit = 50) {
  const result = await pool.query(`SELECT * FROM v_recent_errors LIMIT $1`, [limit]);
  return result.rows;
}

export async function close() {
  await pool.end();
}
```

### 2.3 Redis Coordination Client

**File**: `docker/trigger-dev/src/lib/cfn-redis.ts`

```typescript
import Redis from 'ioredis';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.CFN_REDIS_URL || 'redis://localhost:6390');
  }
  return redis;
}

// =============================================
// Completion Signaling
// =============================================

export interface CompletionSignal {
  agentId: string;
  status: 'completed' | 'failed';
  success: boolean;
  testsPassed?: boolean;
  confidence?: number;
  filesModified?: string[];
  errorMessage?: string;
  durationMs: number;
  completedAt: number;
}

export async function signalCompletion(
  taskId: string,
  signal: CompletionSignal
): Promise<void> {
  const redis = getRedis();
  await redis.lpush(`cfn:complete:${taskId}`, JSON.stringify(signal));
}

export async function waitForCompletions(
  taskId: string,
  expectedCount: number,
  timeoutSeconds: number = 600
): Promise<CompletionSignal[]> {
  const redis = getRedis();
  const completions: CompletionSignal[] = [];

  while (completions.length < expectedCount) {
    const result = await redis.blpop(`cfn:complete:${taskId}`, timeoutSeconds);

    if (!result) {
      throw new Error(`Timeout waiting for completions. Got ${completions.length}/${expectedCount}`);
    }

    const [, message] = result;
    completions.push(JSON.parse(message));
  }

  return completions;
}

// =============================================
// Agent Status Tracking
// =============================================

export async function setAgentStatus(
  agentId: string,
  status: 'pending' | 'running' | 'completed' | 'failed',
  metadata?: object
): Promise<void> {
  const redis = getRedis();
  await redis.hset(`cfn:agent:${agentId}`, {
    status,
    updatedAt: Date.now(),
    ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
  });
}

export async function getAgentStatus(agentId: string): Promise<{
  status: string;
  updatedAt: number;
  metadata?: object;
} | null> {
  const redis = getRedis();
  const data = await redis.hgetall(`cfn:agent:${agentId}`);

  if (!data || !data.status) {
    return null;
  }

  return {
    status: data.status,
    updatedAt: parseInt(data.updatedAt),
    metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
  };
}

// =============================================
// Task State (for coordinator re-spawn)
// =============================================

export interface TaskState {
  iteration: number;
  phase: string;
  completedPhases: string[];
  coordinatorContext?: object;
}

export async function saveTaskState(taskId: string, state: TaskState): Promise<void> {
  const redis = getRedis();
  await redis.hset(`cfn:state:${taskId}`, {
    iteration: state.iteration.toString(),
    phase: state.phase,
    completedPhases: JSON.stringify(state.completedPhases),
    coordinatorContext: state.coordinatorContext ? JSON.stringify(state.coordinatorContext) : '',
    updatedAt: Date.now().toString(),
  });
}

export async function getTaskState(taskId: string): Promise<TaskState | null> {
  const redis = getRedis();
  const data = await redis.hgetall(`cfn:state:${taskId}`);

  if (!data || !data.iteration) {
    return null;
  }

  return {
    iteration: parseInt(data.iteration),
    phase: data.phase,
    completedPhases: JSON.parse(data.completedPhases),
    coordinatorContext: data.coordinatorContext ? JSON.parse(data.coordinatorContext) : undefined,
  };
}

// =============================================
// Cleanup
// =============================================

export async function cleanupTask(taskId: string): Promise<void> {
  const redis = getRedis();
  const keys = await redis.keys(`cfn:*:${taskId}*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export async function close(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
```

---

## Phase 3: Implement Proper Coordination

**Duration**: 4-6 hours
**Goal**: Orchestrator/Coordinator separation with Redis signaling

### 3.1 Coordinator Task (Strategic)

**File**: `docker/trigger-dev/src/trigger/cfn-coordinator.ts`

```typescript
import { task } from "@trigger.dev/sdk/v3";
import * as db from "../lib/cfn-db";

interface CoordinatorPayload {
  taskId: string;
  iterationId: number;
  taskDescription: string;
  mode: 'mvp' | 'standard' | 'enterprise';
  workDir: string;
  previousResults?: object;
}

interface AgentManifest {
  phases: Phase[];
  dependencies: Record<string, string[]>;
  totalAgents: number;
}

interface Phase {
  phase: number;
  name: string;
  parallel: boolean;
  agents: AgentDefinition[];
}

interface AgentDefinition {
  id: string;
  type: string;
  task: string;
  files: string[];
  tests: string[];
}

export const cfnCoordinatorTask = task({
  id: "cfn-coordinator",
  retry: { maxAttempts: 1 },

  run: async (payload: CoordinatorPayload): Promise<{ manifest: AgentManifest }> => {
    await db.logger.info('coordinator', 'Starting task analysis', {
      taskId: payload.taskId,
      data: { description: payload.taskDescription, mode: payload.mode }
    });

    // Analyze task and create manifest
    // This is where AI-powered decomposition would happen
    // For now, use a simplified rule-based approach

    const manifest = await analyzeAndDecompose(payload);

    await db.logger.info('coordinator', 'Task decomposition complete', {
      taskId: payload.taskId,
      data: {
        totalPhases: manifest.phases.length,
        totalAgents: manifest.totalAgents
      }
    });

    return { manifest };
  }
});

async function analyzeAndDecompose(payload: CoordinatorPayload): Promise<AgentManifest> {
  // Simplified decomposition logic
  // In production, this would use an AI model to analyze the task

  const taskLower = payload.taskDescription.toLowerCase();

  // Detect task type
  const isLibrary = taskLower.includes('library') || taskLower.includes('module');
  const hasTests = taskLower.includes('test') || taskLower.includes('tdd');
  const isRefactor = taskLower.includes('refactor');
  const isFeature = taskLower.includes('feature') || taskLower.includes('implement');

  const phases: Phase[] = [];
  const dependencies: Record<string, string[]> = {};

  if (isLibrary) {
    // Library creation pattern
    phases.push({
      phase: 1,
      name: 'project-setup',
      parallel: false,
      agents: [{
        id: 'setup-1',
        type: 'typescript-specialist',
        task: 'Create project structure: package.json, tsconfig.json, jest.config.js',
        files: ['package.json', 'tsconfig.json', 'jest.config.js'],
        tests: []
      }]
    });

    phases.push({
      phase: 2,
      name: 'types-and-errors',
      parallel: true,
      agents: [
        {
          id: 'types-1',
          type: 'typescript-specialist',
          task: 'Create type definitions',
          files: ['src/types/index.ts'],
          tests: ['src/types/__tests__/index.test.ts']
        },
        {
          id: 'errors-1',
          type: 'typescript-specialist',
          task: 'Create error classes',
          files: ['src/errors/index.ts'],
          tests: ['src/errors/__tests__/index.test.ts']
        }
      ]
    });

    dependencies['types-1'] = ['setup-1'];
    dependencies['errors-1'] = ['setup-1'];

    phases.push({
      phase: 3,
      name: 'core-implementation',
      parallel: true,
      agents: [
        {
          id: 'core-1',
          type: 'typescript-specialist',
          task: 'Implement core functionality',
          files: ['src/core/index.ts'],
          tests: ['src/core/__tests__/index.test.ts']
        }
      ]
    });

    dependencies['core-1'] = ['types-1', 'errors-1'];

    phases.push({
      phase: 4,
      name: 'exports',
      parallel: false,
      agents: [{
        id: 'exports-1',
        type: 'typescript-specialist',
        task: 'Create index.ts with exports',
        files: ['src/index.ts'],
        tests: ['src/__tests__/index.test.ts']
      }]
    });

    dependencies['exports-1'] = ['core-1'];

  } else if (isFeature) {
    // Single feature pattern
    phases.push({
      phase: 1,
      name: 'implementation',
      parallel: false,
      agents: [{
        id: 'impl-1',
        type: 'typescript-specialist',
        task: payload.taskDescription,
        files: [],
        tests: []
      }]
    });
  } else {
    // Default single agent
    phases.push({
      phase: 1,
      name: 'execution',
      parallel: false,
      agents: [{
        id: 'agent-1',
        type: 'typescript-specialist',
        task: payload.taskDescription,
        files: [],
        tests: []
      }]
    });
  }

  const totalAgents = phases.reduce((sum, p) => sum + p.agents.length, 0);

  return { phases, dependencies, totalAgents };
}
```

### 3.2 Orchestrator Task (Deterministic)

**File**: `docker/trigger-dev/src/trigger/cfn-orchestrator-v2.ts`

```typescript
import { task, tasks, runs, batch } from "@trigger.dev/sdk/v3";
import * as db from "../lib/cfn-db";
import * as redis from "../lib/cfn-redis";

interface OrchestratorPayload {
  taskDescription: string;
  workDir: string;
  mode: 'mvp' | 'standard' | 'enterprise';
  maxIterations?: number;
  provider?: string;
  testCommand?: string;
}

interface ModeConfig {
  gateThreshold: number;
  consensusThreshold: number;
  maxIterations: number;
  validatorCount: number;
}

const MODE_CONFIGS: Record<string, ModeConfig> = {
  mvp: { gateThreshold: 0.70, consensusThreshold: 0.80, maxIterations: 5, validatorCount: 2 },
  standard: { gateThreshold: 0.95, consensusThreshold: 0.90, maxIterations: 10, validatorCount: 3 },
  enterprise: { gateThreshold: 0.98, consensusThreshold: 0.95, maxIterations: 15, validatorCount: 5 },
};

export const cfnOrchestratorV2Task = task({
  id: "cfn-orchestrator-v2",
  retry: { maxAttempts: 0 },

  run: async (payload: OrchestratorPayload) => {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const modeConfig = MODE_CONFIGS[payload.mode] || MODE_CONFIGS.standard;
    const maxIterations = payload.maxIterations || modeConfig.maxIterations;

    // Create task record
    await db.createTask({
      id: taskId,
      description: payload.taskDescription,
      mode: payload.mode,
      maxIterations,
      provider: payload.provider,
      workDir: payload.workDir,
    });

    await db.logger.info('orchestrator', 'Starting CFN Loop', {
      taskId,
      data: { mode: payload.mode, maxIterations }
    });

    try {
      await db.updateTaskStatus(taskId, 'running');

      for (let iteration = 1; iteration <= maxIterations; iteration++) {
        await db.updateTaskStatus(taskId, 'running', { currentIteration: iteration });

        // Create iteration record
        const iterRecord = await db.createIteration({
          taskId,
          iterationNumber: iteration,
        });

        await db.logger.info('orchestrator', `Starting iteration ${iteration}`, {
          taskId,
          iterationId: iterRecord.id
        });

        // ========================================
        // Step 1: Spawn Coordinator
        // ========================================
        const coordHandle = await tasks.trigger("cfn-coordinator", {
          taskId,
          iterationId: iterRecord.id,
          taskDescription: payload.taskDescription,
          mode: payload.mode,
          workDir: payload.workDir,
        });

        await db.logger.info('orchestrator', 'Coordinator spawned', {
          taskId,
          data: { triggerRunId: coordHandle.id }
        });

        // Wait for coordinator (SDK polling is fine - it's fast)
        const coordResult = await runs.poll(coordHandle.id, { pollIntervalMs: 2000 });

        if (coordResult.status !== 'COMPLETED') {
          throw new Error(`Coordinator failed: ${coordResult.status}`);
        }

        const manifest = coordResult.output.manifest;

        // Update iteration with manifest
        await db.updateIteration(iterRecord.id, { coordinatorManifest: manifest });

        await db.logger.info('orchestrator', 'Coordinator complete', {
          taskId,
          data: { phases: manifest.phases.length, agents: manifest.totalAgents }
        });

        // ========================================
        // Step 2: Execute Phases
        // ========================================
        for (const phase of manifest.phases) {
          await db.logger.info('orchestrator', `Processing phase ${phase.phase}: ${phase.name}`, {
            taskId,
            data: { parallel: phase.parallel, agentCount: phase.agents.length }
          });

          // Create agent records
          const agentHandles: Array<{ agentId: string; runId: string }> = [];

          for (const agent of phase.agents) {
            const agentId = `${taskId}-${agent.id}`;

            await db.createAgent({
              id: agentId,
              taskId,
              iterationId: iterRecord.id,
              agentType: agent.type,
              role: 'implementer',
              assignedFiles: agent.files,
              assignedTests: agent.tests,
              taskDescription: agent.task,
            });

            // Spawn agent
            const handle = await tasks.trigger("cfn-implementer-v2", {
              taskId,
              agentId,
              iterationId: iterRecord.id,
              agentType: agent.type,
              taskDescription: agent.task,
              workDir: payload.workDir,
              files: agent.files,
              tests: agent.tests,
              provider: payload.provider,
            });

            await db.updateAgentStatus(agentId, 'running');
            agentHandles.push({ agentId, runId: handle.id });
          }

          // ========================================
          // Step 3: Wait for Completions via Redis BLPOP
          // ========================================
          const completions = await redis.waitForCompletions(
            taskId,
            phase.agents.length,
            600  // 10 minute timeout
          );

          // Update agent records with results
          for (const completion of completions) {
            await db.updateAgentStatus(completion.agentId,
              completion.success ? 'completed' : 'failed',
              {
                success: completion.success,
                testsPassed: completion.testsPassed,
                confidence: completion.confidence,
                filesModified: completion.filesModified,
                errorMessage: completion.errorMessage,
                durationMs: completion.durationMs,
              }
            );

            await db.logger.info('orchestrator', `Agent completed: ${completion.agentId}`, {
              taskId,
              agentId: completion.agentId,
              data: { success: completion.success, testsPassed: completion.testsPassed }
            });
          }

          // Check phase success
          const phasePassed = completions.every(c => c.testsPassed);
          if (!phasePassed) {
            await db.logger.warn('orchestrator', `Phase ${phase.phase} had failures`, {
              taskId,
              data: {
                failed: completions.filter(c => !c.testsPassed).map(c => c.agentId)
              }
            });
          }
        }

        // ========================================
        // Step 4: Gate Check
        // ========================================
        await db.logger.info('orchestrator', 'Running gate check', { taskId });

        const gateResult = await runGateCheck(payload.workDir, payload.testCommand || 'npm test');

        await db.updateIteration(iterRecord.id, {
          gatePassRate: gateResult.passRate,
          gatePassed: gateResult.passRate >= modeConfig.gateThreshold,
        });

        await db.recordTestRun({
          taskId,
          iterationId: iterRecord.id,
          testCommand: payload.testCommand || 'npm test',
          workDir: payload.workDir,
          exitCode: gateResult.exitCode,
          durationMs: gateResult.durationMs,
          totalTests: gateResult.totalTests,
          passedTests: gateResult.passedTests,
          failedTests: gateResult.failedTests,
          stdout: gateResult.stdout,
          stderr: gateResult.stderr,
          failedTestNames: gateResult.failedTestNames,
        });

        if (gateResult.passRate < modeConfig.gateThreshold) {
          await db.updateIteration(iterRecord.id, { status: 'completed', decision: 'ITERATE' });
          await db.logger.info('orchestrator', 'Gate check failed, iterating', {
            taskId,
            data: { passRate: gateResult.passRate, threshold: modeConfig.gateThreshold }
          });
          continue;  // Next iteration
        }

        // ========================================
        // Step 5: Spawn Validators (Gate Passed)
        // ========================================
        await db.logger.info('orchestrator', 'Gate passed, spawning validators', {
          taskId,
          data: { passRate: gateResult.passRate }
        });

        const validatorHandles: Array<{ agentId: string; runId: string }> = [];

        for (let i = 0; i < modeConfig.validatorCount; i++) {
          const agentId = `${taskId}-validator-${i + 1}`;

          await db.createAgent({
            id: agentId,
            taskId,
            iterationId: iterRecord.id,
            agentType: 'code-reviewer',
            role: 'validator',
            taskDescription: 'Review implementation quality and suggest improvements',
          });

          const handle = await tasks.trigger("cfn-validator", {
            taskId,
            agentId,
            iterationId: iterRecord.id,
            workDir: payload.workDir,
            provider: payload.provider,
          });

          await db.updateAgentStatus(agentId, 'running');
          validatorHandles.push({ agentId, runId: handle.id });
        }

        // Wait for validator completions
        const validatorCompletions = await redis.waitForCompletions(
          taskId,
          modeConfig.validatorCount,
          300  // 5 minute timeout for validators
        );

        // Calculate consensus
        const avgConfidence = validatorCompletions.reduce((sum, c) => sum + (c.confidence || 0), 0)
          / validatorCompletions.length;

        const consensusPassed = avgConfidence >= modeConfig.consensusThreshold;

        await db.updateIteration(iterRecord.id, {
          consensusScore: avgConfidence,
          consensusPassed,
        });

        // ========================================
        // Step 6: Product Owner Decision
        // ========================================
        let decision: 'PROCEED' | 'ITERATE' | 'ABORT';

        if (consensusPassed) {
          decision = 'PROCEED';
        } else if (iteration >= maxIterations) {
          decision = 'ABORT';
        } else {
          decision = 'ITERATE';
        }

        await db.updateIteration(iterRecord.id, { status: 'completed', decision });

        await db.logger.info('orchestrator', `Decision: ${decision}`, {
          taskId,
          data: { consensus: avgConfidence, threshold: modeConfig.consensusThreshold }
        });

        if (decision === 'PROCEED') {
          await db.updateTaskStatus(taskId, 'completed', {
            finalDecision: 'PROCEED',
            finalPassRate: gateResult.passRate,
            finalConsensus: avgConfidence,
          });

          await redis.cleanupTask(taskId);

          return {
            success: true,
            taskId,
            iterations: iteration,
            passRate: gateResult.passRate,
            consensus: avgConfidence,
          };
        }

        if (decision === 'ABORT') {
          await db.updateTaskStatus(taskId, 'aborted', {
            finalDecision: 'ABORT',
            finalPassRate: gateResult.passRate,
            finalConsensus: avgConfidence,
            errorMessage: 'Max iterations reached without consensus',
          });

          await redis.cleanupTask(taskId);

          return {
            success: false,
            taskId,
            iterations: iteration,
            reason: 'max_iterations',
          };
        }

        // ITERATE - continue to next iteration
      }

      // Should not reach here, but handle gracefully
      await db.updateTaskStatus(taskId, 'completed', { finalDecision: 'ABORT' });
      return { success: false, taskId, reason: 'unknown' };

    } catch (error) {
      await db.logger.error('orchestrator', 'Orchestrator failed', error as Error, { taskId });
      await db.updateTaskStatus(taskId, 'failed', {
        errorMessage: (error as Error).message,
      });
      await redis.cleanupTask(taskId);
      throw error;
    }
  }
});

// =============================================
// Helper Functions
// =============================================

interface GateCheckResult {
  passRate: number;
  exitCode: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  durationMs: number;
  stdout: string;
  stderr: string;
  failedTestNames: string[];
}

async function runGateCheck(workDir: string, testCommand: string): Promise<GateCheckResult> {
  const { execa } = await import('execa');
  const startTime = Date.now();

  try {
    const result = await execa(testCommand, [], {
      cwd: workDir,
      shell: true,
      reject: false,
      timeout: 300000,  // 5 minutes
    });

    const durationMs = Date.now() - startTime;

    // Parse test output (simplified - would need framework-specific parsing)
    const stdout = result.stdout || '';
    const stderr = result.stderr || '';

    // Try to extract test counts from Jest-style output
    const testsMatch = stdout.match(/Tests:\s+(\d+)\s+passed.*?(\d+)\s+total/);
    const failedMatch = stdout.match(/(\d+)\s+failed/);

    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    if (testsMatch) {
      passedTests = parseInt(testsMatch[1]);
      totalTests = parseInt(testsMatch[2]);
      failedTests = failedMatch ? parseInt(failedMatch[1]) : 0;
    } else {
      // Fallback: treat exit code as indicator
      totalTests = 1;
      passedTests = result.exitCode === 0 ? 1 : 0;
      failedTests = result.exitCode === 0 ? 0 : 1;
    }

    const passRate = totalTests > 0 ? passedTests / totalTests : 0;

    // Extract failed test names (Jest-style)
    const failedTestNames: string[] = [];
    const failedMatches = stdout.matchAll(/✕\s+(.+)/g);
    for (const match of failedMatches) {
      failedTestNames.push(match[1].trim());
    }

    return {
      passRate,
      exitCode: result.exitCode || 0,
      totalTests,
      passedTests,
      failedTests,
      durationMs,
      stdout,
      stderr,
      failedTestNames,
    };

  } catch (error) {
    return {
      passRate: 0,
      exitCode: 1,
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      durationMs: Date.now() - startTime,
      stdout: '',
      stderr: (error as Error).message,
      failedTestNames: [],
    };
  }
}
```

### 3.3 Updated Implementer with Redis Signaling

**File**: `docker/trigger-dev/src/trigger/cfn-implementer-v2.ts`

```typescript
import { task } from "@trigger.dev/sdk/v3";
import * as db from "../lib/cfn-db";
import * as redis from "../lib/cfn-redis";
import { executeClaudeCli } from "../lib/cli-executor";

interface ImplementerPayload {
  taskId: string;
  agentId: string;
  iterationId: number;
  agentType: string;
  taskDescription: string;
  workDir: string;
  files: string[];
  tests: string[];
  provider?: string;
  timeout?: number;
}

export const cfnImplementerV2Task = task({
  id: "cfn-implementer-v2",
  retry: { maxAttempts: 2 },

  run: async (payload: ImplementerPayload) => {
    const startTime = Date.now();

    await db.logger.info('implementer', 'Starting implementation', {
      taskId: payload.taskId,
      agentId: payload.agentId,
      data: { agentType: payload.agentType }
    });

    await redis.setAgentStatus(payload.agentId, 'running');

    try {
      // Build CLI environment
      const cliEnv: Record<string, string> = {};

      if (payload.provider === 'zai') {
        cliEnv.ANTHROPIC_API_KEY = process.env.ZAI_API_KEY || '';
        cliEnv.ANTHROPIC_BASE_URL = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/anthropic';
      } else {
        cliEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
      }

      // Build prompt
      const prompt = buildImplementerPrompt(payload);

      // Execute CLI
      const result = await executeClaudeCli(
        ['--print', '--output-format', 'json', '-p', prompt],
        {
          cwd: payload.workDir,
          timeout: payload.timeout || 600000,
          env: cliEnv,
          onTimeout: () => {
            db.logger.warn('implementer', 'CLI execution timed out', {
              taskId: payload.taskId,
              agentId: payload.agentId,
            });
          },
        }
      );

      const durationMs = Date.now() - startTime;

      // Determine success
      const success = result.success && !result.timedOut;

      // Run tests if specified
      let testsPassed = true;
      if (payload.tests.length > 0 && success) {
        const testResult = await runAgentTests(payload.workDir, payload.tests);
        testsPassed = testResult.passed;
      }

      // Calculate confidence
      const confidence = calculateConfidence(success, testsPassed, result);

      // Signal completion via Redis
      await redis.signalCompletion(payload.taskId, {
        agentId: payload.agentId,
        status: success ? 'completed' : 'failed',
        success,
        testsPassed,
        confidence,
        filesModified: payload.files,
        errorMessage: success ? undefined : result.stderr,
        durationMs,
        completedAt: Date.now(),
      });

      await db.logger.info('implementer', 'Implementation complete', {
        taskId: payload.taskId,
        agentId: payload.agentId,
        data: { success, testsPassed, confidence, durationMs }
      });

      // Return result (also stored by Trigger.dev)
      return {
        success,
        testsPassed,
        confidence,
        filesModified: payload.files,
        durationMs,
        output: result.stdout,
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;

      await db.logger.error('implementer', 'Implementation failed', error as Error, {
        taskId: payload.taskId,
        agentId: payload.agentId,
      });

      // Signal failure via Redis
      await redis.signalCompletion(payload.taskId, {
        agentId: payload.agentId,
        status: 'failed',
        success: false,
        testsPassed: false,
        errorMessage: (error as Error).message,
        durationMs,
        completedAt: Date.now(),
      });

      throw error;
    }
  }
});

function buildImplementerPrompt(payload: ImplementerPayload): string {
  let prompt = payload.taskDescription;

  if (payload.files.length > 0) {
    prompt += `\n\nYou should work on these files: ${payload.files.join(', ')}`;
  }

  if (payload.tests.length > 0) {
    prompt += `\n\nMake sure the following tests pass: ${payload.tests.join(', ')}`;
  }

  prompt += `\n\nUse TDD: write tests first, then implement to make them pass.`;
  prompt += `\n\nDo not ask questions - make reasonable decisions and proceed.`;

  return prompt;
}

async function runAgentTests(workDir: string, tests: string[]): Promise<{ passed: boolean }> {
  const { execa } = await import('execa');

  try {
    // Run tests for specific files
    const testPattern = tests.map(t => t.replace(/\\/g, '/')).join('|');
    await execa('npm', ['test', '--', '--testPathPattern', testPattern], {
      cwd: workDir,
      timeout: 120000,
    });
    return { passed: true };
  } catch {
    return { passed: false };
  }
}

function calculateConfidence(
  success: boolean,
  testsPassed: boolean,
  result: { timedOut: boolean }
): number {
  if (!success) return 0.1;
  if (result.timedOut) return 0.3;
  if (!testsPassed) return 0.5;
  return 0.9;
}
```

### 3.4 Validator Task

**File**: `docker/trigger-dev/src/trigger/cfn-validator-v2.ts`

```typescript
import { task } from "@trigger.dev/sdk/v3";
import * as db from "../lib/cfn-db";
import * as redis from "../lib/cfn-redis";
import { executeClaudeCli } from "../lib/cli-executor";

interface ValidatorPayload {
  taskId: string;
  agentId: string;
  iterationId: number;
  workDir: string;
  provider?: string;
}

export const cfnValidatorV2Task = task({
  id: "cfn-validator",
  retry: { maxAttempts: 1 },

  run: async (payload: ValidatorPayload) => {
    const startTime = Date.now();

    await db.logger.info('validator', 'Starting validation', {
      taskId: payload.taskId,
      agentId: payload.agentId,
    });

    await redis.setAgentStatus(payload.agentId, 'running');

    try {
      // Build CLI environment
      const cliEnv: Record<string, string> = {};

      if (payload.provider === 'zai') {
        cliEnv.ANTHROPIC_API_KEY = process.env.ZAI_API_KEY || '';
        cliEnv.ANTHROPIC_BASE_URL = process.env.ZAI_BASE_URL || 'https://api.z.ai/api/anthropic';
      } else {
        cliEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
      }

      const prompt = `
You are a code reviewer. Review the code in this directory and provide:

1. A quality score from 0.0 to 1.0 based on:
   - Code correctness
   - Type safety
   - Test coverage
   - Error handling
   - Documentation

2. A list of issues found (if any)

3. Suggestions for improvement

Format your response as JSON:
{
  "score": 0.85,
  "issues": ["issue1", "issue2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "summary": "Brief overall assessment"
}

Do not make changes - only review and report.
`;

      const result = await executeClaudeCli(
        ['--print', '--output-format', 'json', '-p', prompt],
        {
          cwd: payload.workDir,
          timeout: 300000,  // 5 minutes for review
          env: cliEnv,
        }
      );

      const durationMs = Date.now() - startTime;

      // Parse review output
      let confidence = 0.5;
      let output: object = {};

      try {
        // Try to extract JSON from output
        const jsonMatch = result.stdout.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          output = JSON.parse(jsonMatch[0]);
          confidence = (output as any).score || 0.5;
        }
      } catch {
        // If parsing fails, use default
        confidence = result.success ? 0.7 : 0.3;
      }

      // Signal completion
      await redis.signalCompletion(payload.taskId, {
        agentId: payload.agentId,
        status: 'completed',
        success: true,
        confidence,
        durationMs,
        completedAt: Date.now(),
      });

      await db.updateAgentStatus(payload.agentId, 'completed', {
        success: true,
        confidence,
        durationMs,
        output,
      });

      await db.logger.info('validator', 'Validation complete', {
        taskId: payload.taskId,
        agentId: payload.agentId,
        data: { confidence }
      });

      return { success: true, confidence, output };

    } catch (error) {
      const durationMs = Date.now() - startTime;

      await db.logger.error('validator', 'Validation failed', error as Error, {
        taskId: payload.taskId,
        agentId: payload.agentId,
      });

      await redis.signalCompletion(payload.taskId, {
        agentId: payload.agentId,
        status: 'failed',
        success: false,
        confidence: 0,
        errorMessage: (error as Error).message,
        durationMs,
        completedAt: Date.now(),
      });

      throw error;
    }
  }
});
```

---

## Phase 4: Task Decomposition & Parallelism

**Duration**: 4-6 hours
**Goal**: Smarter coordinator with proper parallel execution

### 4.1 Enhanced Coordinator (Already in Phase 3)

The coordinator in Phase 3 includes basic decomposition. For more sophisticated analysis:

**File**: `docker/trigger-dev/src/lib/task-analyzer.ts`

```typescript
interface TaskAnalysis {
  complexity: 'trivial' | 'simple' | 'medium' | 'complex' | 'critical';
  estimatedAgents: number;
  estimatedDuration: number;
  suggestedPhases: number;
  keywords: string[];
}

export function analyzeTask(description: string): TaskAnalysis {
  const lower = description.toLowerCase();
  const words = lower.split(/\s+/);

  // Keyword detection
  const keywords: string[] = [];
  const keywordPatterns = [
    'library', 'module', 'api', 'feature', 'component',
    'test', 'tdd', 'coverage', 'refactor', 'fix', 'bug',
    'security', 'performance', 'database', 'authentication'
  ];

  for (const pattern of keywordPatterns) {
    if (lower.includes(pattern)) {
      keywords.push(pattern);
    }
  }

  // Complexity estimation
  let complexity: TaskAnalysis['complexity'] = 'simple';
  let estimatedAgents = 1;
  let suggestedPhases = 1;

  if (keywords.includes('library') || keywords.includes('module')) {
    complexity = 'medium';
    estimatedAgents = 4;
    suggestedPhases = 4;
  }

  if (keywords.includes('api') && keywords.includes('database')) {
    complexity = 'complex';
    estimatedAgents = 6;
    suggestedPhases = 5;
  }

  if (keywords.includes('security') || keywords.includes('authentication')) {
    complexity = 'critical';
    estimatedAgents = 8;
    suggestedPhases = 6;
  }

  // Duration estimation (minutes)
  const estimatedDuration = estimatedAgents * 3;  // ~3 minutes per agent

  return {
    complexity,
    estimatedAgents,
    estimatedDuration,
    suggestedPhases,
    keywords,
  };
}
```

---

## Phase 5: MDAP Foundation

**Duration**: 6-8 hours
**Goal**: Add model tier escalation for future MDAP support

### 5.1 Model Tier Configuration

**File**: `docker/trigger-dev/src/lib/model-tiers.ts`

```typescript
export interface ModelTier {
  tier: number;
  model: string;
  provider: 'anthropic' | 'openai' | 'zai';
  costPer1MTokens: number;
  avgLatencyMs: number;
}

export const MODEL_TIERS: ModelTier[] = [
  { tier: 1, model: 'claude-3-haiku', provider: 'anthropic', costPer1MTokens: 0.25, avgLatencyMs: 500 },
  { tier: 2, model: 'gpt-4.1-mini', provider: 'openai', costPer1MTokens: 0.40, avgLatencyMs: 800 },
  { tier: 3, model: 'gpt-4.1', provider: 'openai', costPer1MTokens: 2.00, avgLatencyMs: 1200 },
  { tier: 4, model: 'claude-sonnet-4-5', provider: 'anthropic', costPer1MTokens: 3.00, avgLatencyMs: 1500 },
  { tier: 5, model: 'claude-opus-4', provider: 'anthropic', costPer1MTokens: 15.00, avgLatencyMs: 3000 },
];

export function getTier(tier: number): ModelTier | undefined {
  return MODEL_TIERS.find(t => t.tier === tier);
}

export function selectStartTier(
  complexity: 'trivial' | 'simple' | 'medium' | 'complex' | 'critical',
  profile: 'realtime' | 'balanced' | 'budget' | 'critical'
): number {
  const complexityTier: Record<string, number> = {
    trivial: 1,
    simple: 1,
    medium: 2,
    complex: 3,
    critical: 4,
  };

  const profileTier: Record<string, number> = {
    realtime: 3,
    balanced: 1,
    budget: 1,
    critical: 4,
  };

  return Math.max(complexityTier[complexity] || 1, profileTier[profile] || 1);
}
```

### 5.2 MDAP Database Operations

**File**: `docker/trigger-dev/src/lib/mdap-db.ts`

```typescript
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.CFN_POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.CFN_POSTGRES_PORT || '5435'),
  database: process.env.CFN_POSTGRES_DB || 'cfn_loop',
  user: process.env.CFN_POSTGRES_USER || 'cfn',
  password: process.env.CFN_POSTGRES_PASSWORD || 'cfn_dev_password',
});

export interface MdapExecution {
  taskId: string;
  microTaskId: string;
  profile: string;
  complexity: string;
  attempts: MdapAttempt[];
  finalTier: number;
  finalModel: string;
  success: boolean;
  totalLatencyMs: number;
  totalCostUsd: number;
  testPassRate?: number;
}

export interface MdapAttempt {
  tier: number;
  model: string;
  result: 'success' | 'fail' | 'red_flag' | 'timeout';
  latencyMs: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  errorType?: string;
}

export async function recordMdapExecution(execution: MdapExecution): Promise<void> {
  const escalationCount = execution.attempts.length - 1;
  const redFlagged = execution.attempts.some(a => a.result === 'red_flag');

  await pool.query(
    `INSERT INTO mdap_executions
     (task_id, micro_task_id, profile, complexity, attempts,
      final_tier, final_model, success, red_flagged, escalation_count,
      total_latency_ms, total_cost_usd, test_pass_rate)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [execution.taskId, execution.microTaskId, execution.profile, execution.complexity,
     JSON.stringify(execution.attempts), execution.finalTier, execution.finalModel,
     execution.success, redFlagged, escalationCount, execution.totalLatencyMs,
     execution.totalCostUsd, execution.testPassRate]
  );
}

export async function updateModelStats(
  model: string,
  complexity: string,
  profile: string,
  success: boolean,
  latencyMs: number,
  costUsd: number
): Promise<void> {
  await pool.query(
    `INSERT INTO mdap_model_stats
     (model, complexity, profile, total_attempts, success_count,
      success_rate, avg_latency_ms, avg_cost_usd, updated_at)
     VALUES ($1, $2, $3, 1, $4, $5, $6, $7, NOW())
     ON CONFLICT (model, complexity, profile)
     DO UPDATE SET
       total_attempts = mdap_model_stats.total_attempts + 1,
       success_count = mdap_model_stats.success_count + $4,
       success_rate = (mdap_model_stats.success_count + $4)::decimal / (mdap_model_stats.total_attempts + 1),
       avg_latency_ms = (mdap_model_stats.avg_latency_ms * mdap_model_stats.total_attempts + $6) / (mdap_model_stats.total_attempts + 1),
       avg_cost_usd = (mdap_model_stats.avg_cost_usd * mdap_model_stats.total_attempts + $7) / (mdap_model_stats.total_attempts + 1),
       updated_at = NOW()`,
    [model, complexity, profile, success ? 1 : 0, success ? 1.0 : 0.0, latencyMs, costUsd]
  );
}

export async function getModelStats(): Promise<any[]> {
  const result = await pool.query(
    `SELECT * FROM mdap_model_stats ORDER BY model, complexity, profile`
  );
  return result.rows;
}
```

---

## Phase 6: Testing & Validation

**Duration**: 4-6 hours
**Goal**: End-to-end validation of the new architecture

### 6.1 Integration Test

**File**: `docker/trigger-dev/test-cfn-loop-v2.ts`

```typescript
import { configure, tasks, runs } from "@trigger.dev/sdk/v3";

configure({
  secretKey: process.env.TRIGGER_SECRET_KEY,
  baseURL: process.env.TRIGGER_API_URL || "http://localhost:8030",
});

async function main() {
  console.log("=".repeat(80));
  console.log("CFN Loop v2 Integration Test");
  console.log("=".repeat(80));

  const startTime = Date.now();

  // Test 1: Simple task
  console.log("\n[Test 1] Simple file creation...");
  const handle1 = await tasks.trigger("cfn-orchestrator-v2", {
    taskDescription: "Create a file called hello.ts that exports a function greeting(name: string): string that returns 'Hello, {name}!'",
    workDir: "/tmp/cfn-test-simple-" + Date.now(),
    mode: "mvp",
    provider: "zai",
    testCommand: "echo 'No tests'",
  });

  const result1 = await runs.poll(handle1.id, { pollIntervalMs: 5000 });
  console.log(`  Status: ${result1.status}`);
  console.log(`  Output:`, result1.output);

  // Test 2: Library creation (multi-phase)
  console.log("\n[Test 2] Library creation (multi-phase)...");
  const handle2 = await tasks.trigger("cfn-orchestrator-v2", {
    taskDescription: "Create a TypeScript validation library with basic validators (required, string, number)",
    workDir: "/tmp/cfn-test-library-" + Date.now(),
    mode: "standard",
    provider: "zai",
    testCommand: "npm test",
  });

  const result2 = await runs.poll(handle2.id, { pollIntervalMs: 10000 });
  console.log(`  Status: ${result2.status}`);
  console.log(`  Output:`, result2.output);

  const totalDuration = Date.now() - startTime;

  console.log("\n" + "=".repeat(80));
  console.log(`Total Duration: ${(totalDuration / 1000 / 60).toFixed(1)} minutes`);
  console.log("=".repeat(80));
}

main().catch(console.error);
```

### 6.2 Database Query Test

**File**: `docker/trigger-dev/test-db-queries.ts`

```typescript
import * as db from "./src/lib/cfn-db";

async function main() {
  console.log("Testing database queries...\n");

  // Get recent errors
  console.log("Recent errors:");
  const errors = await db.getRecentErrors(10);
  console.table(errors.map(e => ({
    time: e.timestamp,
    component: e.component,
    message: e.message.slice(0, 50),
  })));

  // Get task summary
  // const taskId = process.argv[2];
  // if (taskId) {
  //   const details = await db.getTaskWithDetails(taskId);
  //   console.log("\nTask details:", details.task);
  //   console.log("Iterations:", details.iterations.length);
  //   console.log("Agents:", details.agents.length);
  // }

  await db.close();
}

main().catch(console.error);
```

---

## File Structure

After implementation, the file structure will be:

```
docker/trigger-dev/
├── docker-compose.cfn.yml          # CFN Postgres + Redis
├── schema/
│   └── init-db.sql                 # Database schema
├── src/
│   ├── lib/
│   │   ├── cfn-db.ts               # Postgres client
│   │   ├── cfn-redis.ts            # Redis coordination
│   │   ├── cli-executor.ts         # CLI execution wrapper
│   │   ├── task-analyzer.ts        # Task complexity analysis
│   │   ├── model-tiers.ts          # MDAP tier config
│   │   └── mdap-db.ts              # MDAP metrics storage
│   └── trigger/
│       ├── cfn-orchestrator-v2.ts  # Deterministic orchestrator
│       ├── cfn-coordinator.ts      # Strategic coordinator
│       ├── cfn-implementer-v2.ts   # Implementer with Redis
│       ├── cfn-validator-v2.ts     # Validator with Redis
│       └── index.ts                # Task exports
├── test-cfn-loop-v2.ts             # Integration test
├── test-cli-execution.ts           # CLI test
├── test-db-queries.ts              # DB query test
└── .env                            # Configuration
```

---

## Success Criteria

### Phase 1 (CLI Fix)
- [ ] CLI completes within 2 minutes for simple tasks
- [ ] No 11-minute hangs
- [ ] forceKillAfterDelay working

### Phase 2 (Infrastructure)
- [ ] CFN Postgres running and accessible
- [ ] CFN Redis running and accessible
- [ ] Schema created successfully
- [ ] Client libraries working

### Phase 3 (Coordination)
- [ ] Orchestrator spawns coordinator
- [ ] Coordinator returns manifest
- [ ] Agents signal completion via Redis
- [ ] Orchestrator receives signals via BLPOP
- [ ] Gate check executes
- [ ] Validators spawn and complete
- [ ] Product Owner decision works

### Phase 4 (Parallelism)
- [ ] Multiple agents spawn in parallel
- [ ] Dependencies respected between phases
- [ ] TDD validation at each agent

### Phase 5 (MDAP Foundation)
- [ ] Model tiers configured
- [ ] MDAP tables populated
- [ ] Metrics collection working

### Phase 6 (Validation)
- [ ] Simple task completes (mvp mode)
- [ ] Library task completes (standard mode)
- [ ] Logs queryable in Postgres
- [ ] No orphaned processes

---

## Estimated Timeline

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 0: Infrastructure | 1-2 hours | None |
| Phase 1: CLI Fix | 1-2 hours | None |
| Phase 2: Postgres/Redis | 2-3 hours | Phase 0 |
| Phase 3: Coordination | 4-6 hours | Phase 1, 2 |
| Phase 4: Parallelism | 4-6 hours | Phase 3 |
| Phase 5: MDAP | 6-8 hours | Phase 3 |
| Phase 6: Testing | 4-6 hours | All previous |

**Total: 22-33 hours (~3-4 days)**

---

## Quick Start Commands

```bash
# 1. Start infrastructure
cd docker/trigger-dev
docker compose -f docker-compose.cfn.yml up -d

# 2. Install dependencies
npm install pg ioredis
npm install -D @types/pg

# 3. Start Trigger.dev dev server
npx trigger.dev@latest dev --profile self-hosted-v4

# 4. Run integration test
TRIGGER_SECRET_KEY=[REDACTED] npx tsx test-cfn-loop-v2.ts

# 5. Check logs
docker exec cfn-postgres psql -U cfn -d cfn_loop -c "SELECT * FROM v_recent_errors;"
```

---

## References

- Original MDAP Plan: `planning/trigger/architecture/MDAP_IMPLEMENTATION_PLAN.md`
- Trigger.dev CLAUDE.md: `docker/trigger-dev/CLAUDE.md`
- CFN Loop Architecture: `docs/CFN_LOOP_ARCHITECTURE.md`
- CLI Mode Coordination: `planning/cli-changes-november/CLI_MODE_REDIS_COORDINATION_HANDOFF.md`
