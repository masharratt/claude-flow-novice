import { Pool } from 'pg';

export const pool = new Pool({
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
    complexityAnalysis?: object;
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
      } else if (key === 'complexityAnalysis') {
        setClauses.push(`complexity_analysis = $${paramIndex++}`);
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
