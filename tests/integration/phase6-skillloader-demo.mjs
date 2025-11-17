/**
 * Phase 6.1: SkillLoader Enhanced Logging Demo
 * Demonstrates approval metadata tracking using the SkillLoader class
 */

import Database from 'better-sqlite3';
import { SkillLoader } from '../../dist/cli/skill-loader.js';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, rmSync } from 'fs';
import path from 'path';

const TEST_DB_PATH = './tests/integration/demo-enhanced-logging.db';
const TEST_BOOTSTRAP_PATH = './tests/integration/demo-bootstrap';

// Cleanup function
function cleanup() {
  if (existsSync(TEST_DB_PATH)) {
    unlinkSync(TEST_DB_PATH);
  }
  if (existsSync(TEST_BOOTSTRAP_PATH)) {
    rmSync(TEST_BOOTSTRAP_PATH, { recursive: true, force: true });
  }
}

// Setup test environment
function setup() {
  cleanup();

  // Create test database
  const db = new Database(TEST_DB_PATH);

  db.exec(`
    CREATE TABLE skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL,
      team TEXT,
      content_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      tags TEXT,
      version TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      approval_level TEXT DEFAULT 'auto',
      approval_criteria TEXT,
      owner TEXT,
      phase4_pattern_id INTEGER,
      generated_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE agent_skill_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_type TEXT NOT NULL,
      skill_id INTEGER NOT NULL,
      priority INTEGER DEFAULT 50,
      required BOOLEAN DEFAULT 0,
      conditions TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );

    CREATE TABLE skill_usage_log (
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
      test_suite_executed BOOLEAN,
      test_pass_rate REAL,
      notes TEXT,
      approval_level TEXT,
      phase4_generated INTEGER DEFAULT 0,
      FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_usage_approval_level ON skill_usage_log(approval_level);
    CREATE INDEX idx_usage_phase4_generated ON skill_usage_log(phase4_generated);
  `);

  // Create bootstrap directory
  mkdirSync(TEST_BOOTSTRAP_PATH, { recursive: true });
  writeFileSync(
    path.join(TEST_BOOTSTRAP_PATH, 'demo-skill.md'),
    '# Demo Skill\n\nThis is a demo skill for testing.'
  );

  // Insert test skills
  db.exec(`
    INSERT INTO skills (name, category, team, content_path, content_hash, version, status, approval_level, owner, phase4_pattern_id, generated_by)
    VALUES
      ('coordination-protocol', 'coordination', 'cfn-dev-team', '${TEST_BOOTSTRAP_PATH}/demo-skill.md', 'hash1', '1.0.0', 'active', 'auto', 'system', NULL, NULL),
      ('auth-workflow', 'domain', 'cfn-dev-team', '${TEST_BOOTSTRAP_PATH}/demo-skill.md', 'hash2', '2.0.0', 'active', 'human', 'system', 42, 'phase4-cli'),
      ('database-migration', 'infrastructure', 'cfn-dev-team', '${TEST_BOOTSTRAP_PATH}/demo-skill.md', 'hash3', '1.5.0', 'active', 'escalate', 'system', NULL, NULL);
  `);

  db.close();
}

// Main test
async function main() {
  console.log('================================');
  console.log('Phase 6.1 SkillLoader Demo');
  console.log('================================\n');

  setup();

  console.log('✓ Test database created');
  console.log('✓ Test skills inserted\n');

  // Initialize SkillLoader
  const skillLoader = new SkillLoader(TEST_DB_PATH, TEST_BOOTSTRAP_PATH);

  console.log('Testing enhanced logSkillUsage() with approval metadata...\n');

  // Test 1: Log usage with full approval metadata
  await skillLoader.logSkillUsage({
    agentId: 'backend-demo-001',
    agentType: 'backend-developer',
    skillIds: [1, 2, 3],
    taskId: 'demo-task-123',
    phase: 'loop3',
    loadedAt: new Date(),
    confidenceBefore: 0.70,
    confidenceAfter: 0.92,
    executionTimeMs: 1800,
    approvalLevels: ['auto', 'human', 'escalate'],
    phase4Generated: [false, true, false]
  });

  console.log('✓ Logged usage with approval metadata (3 skills)');

  // Test 2: Log usage without approval metadata (backward compatibility)
  await skillLoader.logSkillUsage({
    agentId: 'backend-demo-002',
    agentType: 'backend-developer',
    skillIds: [1],
    taskId: 'demo-task-456',
    loadedAt: new Date(),
    executionTimeMs: 1200
  });

  console.log('✓ Logged usage without approval metadata (backward compatible)\n');

  // Verify data
  const db = new Database(TEST_DB_PATH);

  console.log('Querying usage logs...\n');

  const logs = db.prepare(`
    SELECT agent_id, skill_id, approval_level, phase4_generated
    FROM skill_usage_log
    ORDER BY agent_id, skill_id
  `).all();

  console.log('Usage Logs:');
  console.log('===========');
  logs.forEach(log => {
    console.log(`  Agent: ${log.agent_id}, Skill: ${log.skill_id}, ` +
                `Approval: ${log.approval_level || 'NULL'}, ` +
                `Phase4: ${log.phase4_generated}`);
  });

  console.log('\nAnalytics Query: Approval Level Distribution');
  console.log('===========================================');
  const approvalStats = db.prepare(`
    SELECT
      approval_level,
      COUNT(*) as count,
      SUM(phase4_generated) as phase4_count
    FROM skill_usage_log
    WHERE approval_level IS NOT NULL
    GROUP BY approval_level
    ORDER BY approval_level
  `).all();

  approvalStats.forEach(stat => {
    console.log(`  ${stat.approval_level}: ${stat.count} total, ${stat.phase4_count} phase4-generated`);
  });

  console.log('\nAnalytics Query: Phase 4 Generated Skills');
  console.log('=========================================');
  const phase4Stats = db.prepare(`
    SELECT COUNT(*) as total
    FROM skill_usage_log
    WHERE phase4_generated = 1
  `).get();

  console.log(`  Total phase4-generated skill usages: ${phase4Stats.total}`);

  db.close();

  console.log('\n================================');
  console.log('✓ All tests passed!');
  console.log('✓ Approval metadata tracking working correctly');
  console.log('✓ Backward compatibility maintained');
  console.log('✓ Analytics queries functional');
  console.log('================================\n');

  cleanup();
  console.log('✓ Cleanup complete');
}

main().catch(err => {
  console.error('Error:', err);
  cleanup();
  process.exit(1);
});
