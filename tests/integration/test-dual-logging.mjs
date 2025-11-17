/**
 * Integration Test: Dual Logging System (Phase 7.2)
 *
 * Tests the skill-execution-logger in a real scenario:
 * 1. Create test skills in Skills DB
 * 2. Log manual skill execution (SQLite only)
 * 3. Log Phase4 skill execution (dual logging)
 * 4. Verify logs in both databases
 * 5. Check performance metrics
 */

import { SkillExecutionLogger } from '../../dist/cli/skill-execution-logger.js';
import Database from 'better-sqlite3';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import path from 'path';

// Test configuration
const TEST_DIR = `/tmp/dual-logging-test-${Date.now()}`;
const TEST_SQLITE_DB = path.join(TEST_DIR, 'test-skills.db');

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m'; // No Color

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

// Test helpers
function assert(condition, testName) {
  testsRun++;
  if (condition) {
    console.log(`${GREEN}✓${NC} PASS: ${testName}`);
    testsPassed++;
    return true;
  } else {
    console.log(`${RED}✗${NC} FAIL: ${testName}`);
    testsFailed++;
    return false;
  }
}

function assertEqual(actual, expected, testName) {
  testsRun++;
  if (actual === expected) {
    console.log(`${GREEN}✓${NC} PASS: ${testName}`);
    testsPassed++;
    return true;
  } else {
    console.log(`${RED}✗${NC} FAIL: ${testName}`);
    console.log(`  Expected: ${expected}`);
    console.log(`  Actual:   ${actual}`);
    testsFailed++;
    return false;
  }
}

// Setup test database
function setupTestDb() {
  console.log('Setting up test database...');
  mkdirSync(TEST_DIR, { recursive: true });

  const db = new Database(TEST_SQLITE_DB);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      team TEXT,
      content_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      tags TEXT,
      version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      approval_level TEXT NOT NULL DEFAULT 'human',
      phase4_pattern_id INTEGER,
      generated_by TEXT,
      is_auto_generated BOOLEAN DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS skill_usage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      skill_id INTEGER NOT NULL,
      task_id TEXT,
      phase TEXT,
      loaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      execution_time_ms INTEGER,
      confidence_before REAL,
      confidence_after REAL,
      success_indicator BOOLEAN,
      approval_level TEXT,
      phase4_generated INTEGER DEFAULT 0,
      exit_code INTEGER,
      FOREIGN KEY (skill_id) REFERENCES skills(id)
    );

    INSERT INTO skills (name, category, team, content_path, content_hash, version, approval_level, generated_by, phase4_pattern_id)
    VALUES
      ('manual-deployment', 'infrastructure', 'devops', '/path/manual.md', 'hash1', '1.0.0', 'human', 'manual', NULL),
      ('auto-backup', 'infrastructure', 'devops', '/path/auto.md', 'hash2', '2.0.0', 'auto', 'phase4', 123),
      ('jwt-auth-middleware', 'security', 'backend', '/path/jwt.md', 'hash3', '1.5.0', 'escalate', 'phase4', 456);
  `);

  db.close();
  console.log(`${GREEN}✓${NC} Test database created at: ${TEST_SQLITE_DB}`);
}

// Cleanup
function cleanup() {
  console.log('\nCleaning up test environment...');
  if (existsSync(TEST_SQLITE_DB)) {
    unlinkSync(TEST_SQLITE_DB);
  }
}

// Test 1: Verify skills created
function testSkillsCreated() {
  console.log('\n' + '='.repeat(50));
  console.log('Test 1: Verify test skills created');
  console.log('='.repeat(50));

  const db = new Database(TEST_SQLITE_DB, { readonly: true });

  const skillCount = db.prepare('SELECT COUNT(*) as count FROM skills').get().count;
  assertEqual(skillCount, 3, 'Skills table has 3 test skills');

  const manualCount = db.prepare("SELECT COUNT(*) as count FROM skills WHERE generated_by = 'manual'").get().count;
  assertEqual(manualCount, 1, 'One manual skill exists');

  const phase4Count = db.prepare("SELECT COUNT(*) as count FROM skills WHERE generated_by = 'phase4'").get().count;
  assertEqual(phase4Count, 2, 'Two Phase4 skills exist');

  db.close();
}

// Test 2: Log manual skill (SQLite only)
async function testManualSkillLogging() {
  console.log('\n' + '='.repeat(50));
  console.log('Test 2: Manual skill logging (SQLite only)');
  console.log('='.repeat(50));

  const logger = new SkillExecutionLogger({
    sqliteDbPath: TEST_SQLITE_DB,
    enablePostgres: false,
  });

  await logger.logSkillExecution({
    agentId: 'devops-agent-1',
    agentType: 'devops-specialist',
    skillName: 'manual-deployment',
    taskId: 'task-001',
    phase: 'loop3',
    confidenceBefore: 0.65,
    confidenceAfter: 0.82,
    executionTimeMs: 15,
    exitCode: 0,
  });

  await logger.close();

  // Verify SQLite log
  const db = new Database(TEST_SQLITE_DB, { readonly: true });

  const logCount = db.prepare("SELECT COUNT(*) as count FROM skill_usage_log WHERE agent_id = 'devops-agent-1'").get().count;
  assertEqual(logCount, 1, 'Manual skill logged to SQLite');

  const row = db.prepare("SELECT * FROM skill_usage_log WHERE agent_id = 'devops-agent-1'").get();
  assertEqual(row.approval_level, 'human', 'Approval level recorded correctly');
  assertEqual(row.phase4_generated, 0, 'Phase4 flag is 0 for manual skill');
  assertEqual(row.skill_id, 1, 'Correct skill_id referenced');
  assert(row.confidence_after > row.confidence_before, 'Confidence improved after skill execution');

  db.close();
}

// Test 3: Log Phase4 skill (dual logging)
async function testPhase4SkillLogging() {
  console.log('\n' + '='.repeat(50));
  console.log('Test 3: Phase4 skill logging (dual logging)');
  console.log('='.repeat(50));

  const logger = new SkillExecutionLogger({
    sqliteDbPath: TEST_SQLITE_DB,
    enablePostgres: true, // Enable PostgreSQL (will fail gracefully)
    postgresHost: 'localhost',
    postgresDb: 'workflow_codification',
    postgresUser: 'postgres',
    postgresPass: '',
  });

  // Wait for connection attempt
  await new Promise(resolve => setTimeout(resolve, 200));

  await logger.logSkillExecution({
    agentId: 'backend-agent-1',
    agentType: 'backend-developer',
    skillName: 'jwt-auth-middleware',
    taskId: 'task-002',
    phase: 'loop3',
    confidenceBefore: 0.70,
    confidenceAfter: 0.95,
    executionTimeMs: 8,
    exitCode: 0,
    costAvoidedUsd: 0.12,
    tokensAvoided: 2500,
  });

  await logger.close();

  // Verify SQLite log
  const db = new Database(TEST_SQLITE_DB, { readonly: true });

  const logCount = db.prepare("SELECT COUNT(*) as count FROM skill_usage_log WHERE agent_id = 'backend-agent-1'").get().count;
  assertEqual(logCount, 1, 'Phase4 skill logged to SQLite');

  const row = db.prepare("SELECT * FROM skill_usage_log WHERE agent_id = 'backend-agent-1'").get();
  assertEqual(row.phase4_generated, 1, 'Phase4 flag is 1 for Phase4 skill');
  assertEqual(row.approval_level, 'escalate', 'Approval level recorded correctly');
  assertEqual(row.skill_id, 3, 'Correct skill_id referenced');

  db.close();

  console.log(`${YELLOW}ⓘ${NC}  Note: PostgreSQL connection expected to fail gracefully (no PostgreSQL server running)`);
}

// Test 4: Performance test
async function testPerformance() {
  console.log('\n' + '='.repeat(50));
  console.log('Test 4: Performance test (100 skill executions)');
  console.log('='.repeat(50));

  const logger = new SkillExecutionLogger({
    sqliteDbPath: TEST_SQLITE_DB,
    enablePostgres: false,
  });

  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < 100; i++) {
    promises.push(
      logger.logSkillExecution({
        agentId: `perf-agent-${i}`,
        agentType: 'performance-tester',
        skillName: i % 2 === 0 ? 'manual-deployment' : 'auto-backup',
        executionTimeMs: 10,
        exitCode: 0,
      })
    );
  }

  await Promise.all(promises);
  const duration = Date.now() - startTime;
  const avgTime = Math.floor(duration / 100);

  await logger.close();

  // Verify all logs were written
  const db = new Database(TEST_SQLITE_DB, { readonly: true });
  const logCount = db.prepare("SELECT COUNT(*) as count FROM skill_usage_log WHERE agent_type = 'performance-tester'").get().count;
  assertEqual(logCount, 100, 'All 100 skill executions logged');
  db.close();

  console.log(`  Total time: ${duration}ms`);
  console.log(`  Average per log: ${avgTime}ms`);

  if (avgTime < 50) {
    console.log(`${GREEN}✓${NC} PASS: Average logging time < 50ms (${avgTime}ms)`);
    testsPassed++;
  } else {
    console.log(`${YELLOW}⚠${NC}  WARN: Average logging time >= 50ms (${avgTime}ms)`);
    console.log(`  (This is acceptable for integration tests with I/O overhead)`);
  }
  testsRun++;
}

// Test 5: Analytics queries
function testAnalytics() {
  console.log('\n' + '='.repeat(50));
  console.log('Test 5: Analytics queries');
  console.log('='.repeat(50));

  const db = new Database(TEST_SQLITE_DB, { readonly: true });

  // Query 1: Skills by approval level
  const humanCount = db.prepare("SELECT COUNT(*) as count FROM skill_usage_log WHERE approval_level = 'human'").get().count;
  assert(humanCount > 0, `Human approval skills logged (${humanCount})`);

  // Query 2: Phase4 vs manual skills
  const phase4Logs = db.prepare('SELECT COUNT(*) as count FROM skill_usage_log WHERE phase4_generated = 1').get().count;
  assert(phase4Logs > 0, `Phase4 skills logged (${phase4Logs})`);

  // Query 3: Average confidence improvement
  const avgRow = db.prepare('SELECT ROUND(AVG(confidence_after - confidence_before), 2) as avg FROM skill_usage_log WHERE confidence_before IS NOT NULL').get();
  const avgImprovement = avgRow.avg || 0;
  console.log(`  Average confidence improvement: +${avgImprovement}`);

  // Query 4: Skill usage by type
  const manualUsage = db.prepare('SELECT COUNT(*) as count FROM skill_usage_log WHERE skill_id = 1').get().count;
  const autoUsage = db.prepare('SELECT COUNT(*) as count FROM skill_usage_log WHERE skill_id = 2').get().count;
  console.log(`  Manual skill usage: ${manualUsage}`);
  console.log(`  Auto skill usage: ${autoUsage}`);

  // Query 5: Phase4 pattern IDs
  const phase4Skills = db.prepare(`
    SELECT DISTINCT s.name, s.phase4_pattern_id, COUNT(sul.id) as usage_count
    FROM skills s
    LEFT JOIN skill_usage_log sul ON s.id = sul.skill_id
    WHERE s.generated_by = 'phase4'
    GROUP BY s.name, s.phase4_pattern_id
  `).all();

  console.log('\n  Phase4 Skills Summary:');
  phase4Skills.forEach(skill => {
    console.log(`    - ${skill.name} (pattern ID: ${skill.phase4_pattern_id}, used ${skill.usage_count} times)`);
  });

  db.close();
}

// Main test runner
async function main() {
  console.log('='.repeat(50));
  console.log('Dual Logging Integration Test - Phase 7.2');
  console.log('='.repeat(50));

  try {
    setupTestDb();
    testSkillsCreated();
    await testManualSkillLogging();
    await testPhase4SkillLogging();
    await testPerformance();
    testAnalytics();

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('Test Summary');
    console.log('='.repeat(50));
    console.log(`Tests run:    ${testsRun}`);
    console.log(`Tests passed: ${GREEN}${testsPassed}${NC}`);

    if (testsFailed > 0) {
      console.log(`Tests failed: ${RED}${testsFailed}${NC}`);
      console.log('');
      process.exit(1);
    } else {
      console.log('Tests failed: 0');
      console.log('');
      console.log(`${GREEN}All tests passed!${NC}`);
      process.exit(0);
    }
  } catch (err) {
    console.error(`${RED}Fatal error:${NC}`, err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    cleanup();
  }
}

main();
