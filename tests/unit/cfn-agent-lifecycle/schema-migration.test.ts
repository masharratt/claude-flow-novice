import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const HOOK_SCRIPT = path.resolve(
  __dirname,
  '../../../.claude/skills/cfn-agent-lifecycle/lib/audit/execute-lifecycle-hook.sh'
);

function makeTempDb(): string {
  return path.join(os.tmpdir(), `test-lifecycle-${process.pid}-${Date.now()}.db`);
}

function sqliteQuery(dbPath: string, sql: string): string {
  return execSync(`sqlite3 "${dbPath}" "${sql}"`, { encoding: 'utf-8' }).trim();
}

function runHook(dbPath: string, args: string): string {
  return execSync(`AGENT_LIFECYCLE_DB="${dbPath}" bash "${HOOK_SCRIPT}" ${args}`, {
    encoding: 'utf-8',
    env: { ...process.env, AGENT_LIFECYCLE_DB: dbPath },
  });
}

function getColumnNames(dbPath: string, table: string): string[] {
  const output = sqliteQuery(dbPath, `PRAGMA table_info(${table});`);
  if (!output) return [];
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('|')[1]);
}

describe('lifecycle_events schema migration', () => {
  let dbPath: string;

  afterEach(() => {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it('fresh DB init creates lifecycle_events with cost tracking columns', () => {
    dbPath = makeTempDb();
    runHook(dbPath, 'spawn --agent-id test-agent-1 --agent-type test-type');

    const columns = getColumnNames(dbPath, 'lifecycle_events');

    expect(columns).toContain('tokens_used');
    expect(columns).toContain('cost_usd');
    expect(columns).toContain('duration_ms');
  });

  it('migration adds cost columns to existing DB that lacks them (idempotent)', () => {
    dbPath = makeTempDb();

    execSync(
      `sqlite3 "${dbPath}" "CREATE TABLE agents (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'spawned', confidence REAL, output TEXT, metadata TEXT, spawned_at TEXT NOT NULL, completed_at TEXT, updated_at TEXT NOT NULL); CREATE TABLE lifecycle_events (id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL, event_type TEXT NOT NULL, confidence REAL, reasoning TEXT, phase TEXT, iteration INTEGER, timestamp TEXT NOT NULL, FOREIGN KEY (agent_id) REFERENCES agents(id));"`,
      { encoding: 'utf-8' }
    );

    const columnsBefore = getColumnNames(dbPath, 'lifecycle_events');
    expect(columnsBefore).not.toContain('tokens_used');
    expect(columnsBefore).not.toContain('cost_usd');
    expect(columnsBefore).not.toContain('duration_ms');

    runHook(dbPath, 'spawn --agent-id test-agent-2 --agent-type test-type');

    const columnsAfter = getColumnNames(dbPath, 'lifecycle_events');
    expect(columnsAfter).toContain('tokens_used');
    expect(columnsAfter).toContain('cost_usd');
    expect(columnsAfter).toContain('duration_ms');

    expect(() => {
      runHook(dbPath, 'spawn --agent-id test-agent-2b --agent-type test-type');
    }).not.toThrow();
  });

  it('INSERT with cost fields succeeds', () => {
    dbPath = makeTempDb();
    runHook(dbPath, 'spawn --agent-id test-agent-3 --agent-type test-type');

    expect(() => {
      sqliteQuery(
        dbPath,
        `INSERT INTO lifecycle_events (agent_id, event_type, tokens_used, cost_usd, duration_ms, timestamp) VALUES ('test-agent-3', 'cost_test', 1500, 0.0045, 3200, datetime('now'));`
      );
    }).not.toThrow();

    const row = sqliteQuery(
      dbPath,
      `SELECT tokens_used, cost_usd, duration_ms FROM lifecycle_events WHERE event_type='cost_test';`
    );
    expect(row).toBe('1500|0.0045|3200');
  });

  it('INSERT without cost fields succeeds (nullable columns)', () => {
    dbPath = makeTempDb();
    runHook(dbPath, 'spawn --agent-id test-agent-4 --agent-type test-type');

    expect(() => {
      sqliteQuery(
        dbPath,
        `INSERT INTO lifecycle_events (agent_id, event_type, timestamp) VALUES ('test-agent-4', 'no_cost_test', datetime('now'));`
      );
    }).not.toThrow();

    const row = sqliteQuery(
      dbPath,
      `SELECT tokens_used, cost_usd, duration_ms FROM lifecycle_events WHERE event_type='no_cost_test';`
    );
    expect(row).toBe('||');
  });
});
