#!/usr/bin/env node
/**
 * Skills Database CLI Tool
 * Phase 4: CLI Tooling with Approval Workflow
 *
 * Commands:
 * - list: List skills with filtering
 * - assign: Assign skills to agents
 * - create: Create new skills
 * - update: Update skill metadata
 * - deprecate: Deprecate skills
 * - approve: Approve pending skills
 * - escalate: Escalate skills for review
 * - pending: List pending approvals
 * - approval-status: Check skill approval status
 * - analytics: Skill effectiveness analytics
 */

import { createRequire } from 'module';
import { existsSync, readFileSync } from 'fs';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

// ============================================================================
// Types and Interfaces
// ============================================================================

interface Skill {
  id: number;
  name: string;
  category: string;
  team: string;
  content_path: string;
  content_hash: string;
  tags: string;
  version: string;
  status: string;
  approval_level: string;
  approval_criteria: string | null;
  owner: string;
  phase4_pattern_id: number | null;
  generated_by: string;
  created_at: string;
  updated_at: string;
}

interface ApprovalHistory {
  id: number;
  skill_id: number;
  version: string;
  approval_level: string;
  approver: string | null;
  decision: string;
  reasoning: string | null;
  timestamp: string;
}

interface AgentMapping {
  id: number;
  agent_type: string;
  skill_id: number;
  priority: number;
  required: number;
  conditions: string | null;
  notes: string | null;
}

// ============================================================================
// ANSI Color Codes
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

const chalk = {
  red: (text: string) => `${colors.red}${text}${colors.reset}`,
  green: (text: string) => `${colors.green}${text}${colors.reset}`,
  yellow: (text: string) => `${colors.yellow}${text}${colors.reset}`,
  blue: (text: string) => `${colors.blue}${text}${colors.reset}`,
  magenta: (text: string) => `${colors.magenta}${text}${colors.reset}`,
  cyan: (text: string) => `${colors.cyan}${text}${colors.reset}`,
  bold: (text: string) => `${colors.bright}${text}${colors.reset}`,
  dim: (text: string) => `${colors.dim}${text}${colors.reset}`
};

// ============================================================================
// Database Connection
// ============================================================================

const DB_PATH = process.env.CFN_SKILLS_DB_PATH || './.claude/skills-database/skills.db';

function getDb(): Database.Database {
  if (!existsSync(DB_PATH)) {
    console.error(chalk.red(`Error: Skills database not found at ${DB_PATH}`));
    process.exit(1);
  }
  return new Database(DB_PATH);
}

// ============================================================================
// Utility Functions
// ============================================================================

function calculateHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// Strip ANSI escape codes for accurate string length measurement
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return 'No results found.';
  }

  // Calculate column widths - strip ANSI codes before measuring
  const colWidths = headers.map((header, i) => {
    const maxDataWidth = Math.max(...rows.map(row => stripAnsi((row[i] || '').toString()).length));
    return Math.max(stripAnsi(header).length, maxDataWidth);
  });

  // Build separator
  const separator = colWidths.map(w => '-'.repeat(w)).join('-+-');

  // Build header - use stripped length for padding calculation
  const headerRow = headers.map((h, i) => {
    const stripped = stripAnsi(h);
    const padding = colWidths[i] - stripped.length;
    return h + ' '.repeat(Math.max(0, padding));
  }).join(' | ');

  // Build data rows - use stripped length for padding calculation
  const dataRows = rows.map(row =>
    row.map((cell, i) => {
      const cellStr = (cell || '').toString();
      const stripped = stripAnsi(cellStr);
      const padding = colWidths[i] - stripped.length;
      return cellStr + ' '.repeat(Math.max(0, padding));
    }).join(' | ')
  );

  return [headerRow, separator, ...dataRows].join('\n');
}

function parseArgs(args: string[]): Record<string, string | boolean> {
  const parsed: Record<string, string | boolean> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      // Handle --key=value format
      if (arg.includes('=')) {
        const [key, ...valueParts] = arg.slice(2).split('=');
        parsed[key] = valueParts.join('='); // Rejoin in case value contains '='
      } else {
        // Handle --key value format
        const key = arg.slice(2);
        const nextArg = args[i + 1];

        if (nextArg && !nextArg.startsWith('--')) {
          parsed[key] = nextArg;
          i++;
        } else {
          parsed[key] = true;
        }
      }
    }
  }

  return parsed;
}

// ============================================================================
// Command: list
// ============================================================================

async function cmdList(options: Record<string, string | boolean>): Promise<void> {
  const db = getDb();

  let query = 'SELECT * FROM skills WHERE 1=1';
  const params: any[] = [];

  // Filter by approval level
  if (options.approval) {
    query += ' AND approval_level = ?';
    params.push(options.approval);
  }

  // Filter by category
  if (options.category) {
    query += ' AND category = ?';
    params.push(options.category);
  }

  // Filter by team
  if (options.team) {
    query += ' AND team = ?';
    params.push(options.team);
  }

  // Filter by status
  if (options.status) {
    query += ' AND status = ?';
    params.push(options.status);
  } else {
    // Default to active only
    query += ' AND status = ?';
    params.push('active');
  }

  // Filter by pending approval
  if (options['pending-approval']) {
    query = `
      SELECT s.* FROM skills s
      LEFT JOIN approval_history ah ON ah.skill_id = s.id AND ah.version = s.version AND ah.decision = 'approved'
      WHERE ah.id IS NULL
        AND s.approval_level IN ('human', 'escalate')
        AND s.status = 'active'
    `;
    params.length = 0; // Clear params
  }

  // Filter by agent
  if (options.agent) {
    query = `
      SELECT s.* FROM skills s
      JOIN agent_skill_mappings m ON m.skill_id = s.id
      WHERE m.agent_type = ?
        AND s.status = 'active'
    `;
    params.length = 0;
    params.push(options.agent);
  }

  query += ' ORDER BY id ASC';

  const skills = db.prepare(query).all(...params) as Skill[];

  if (skills.length === 0) {
    console.log(chalk.yellow('No skills found matching criteria.'));
    db.close();
    return;
  }

  // Count agents for each skill
  const skillsWithAgentCount = skills.map(skill => {
    const count = db.prepare('SELECT COUNT(*) as count FROM agent_skill_mappings WHERE skill_id = ?')
      .get(skill.id) as { count: number };
    return { ...skill, agent_count: count.count };
  });

  // Format as table
  const headers = ['ID', 'Name', 'Category', 'Approval', 'Version', 'Status', 'Agents'];
  const rows = skillsWithAgentCount.map(s => [
    s.id.toString(),
    s.name,
    s.category,
    s.approval_level === 'auto' ? chalk.green(s.approval_level) :
      s.approval_level === 'escalate' ? chalk.yellow(s.approval_level) :
      chalk.red(s.approval_level),
    s.version,
    s.status === 'active' ? chalk.green(s.status) : chalk.dim(s.status),
    s.agent_count.toString()
  ]);

  console.log(formatTable(headers, rows));
  console.log(`\nTotal: ${skills.length} skill(s)`);

  db.close();
}

// ============================================================================
// Command: assign
// ============================================================================

async function cmdAssign(options: Record<string, string | boolean>): Promise<void> {
  const db = getDb();

  const { agent, skill, priority, required, condition } = options;

  if (!agent || !skill) {
    console.error(chalk.red('Error: --agent and --skill are required'));
    process.exit(1);
  }

  // Get skill ID
  const skillRecord = db.prepare('SELECT id FROM skills WHERE name = ?').get(skill as string) as Skill | undefined;

  if (!skillRecord) {
    console.error(chalk.red(`Error: Skill not found: ${skill}`));
    db.close();
    process.exit(1);
  }

  // Check if mapping already exists
  const existing = db.prepare('SELECT id FROM agent_skill_mappings WHERE agent_type = ? AND skill_id = ?')
    .get(agent, skillRecord.id);

  if (existing) {
    console.error(chalk.yellow(`Warning: Mapping already exists for ${agent} → ${skill}`));
    db.close();
    return;
  }

  // Insert mapping
  db.prepare(`
    INSERT INTO agent_skill_mappings (agent_type, skill_id, priority, required, conditions)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    agent,
    skillRecord.id,
    priority ? parseInt(priority as string) : 5,
    required ? 1 : 0,
    condition ? JSON.stringify({ taskContext: [condition] }) : null
  );

  console.log(chalk.green(`✓ Assigned skill "${skill}" to agent "${agent}"`));
  console.log(`  Priority: ${priority || 5}`);
  console.log(`  Required: ${required ? 'Yes' : 'No'}`);
  if (condition) {
    console.log(`  Condition: taskContext contains "${condition}"`);
  }

  db.close();
}

// ============================================================================
// Command: create
// ============================================================================

async function cmdCreate(options: Record<string, string | boolean>): Promise<void> {
  const db = getDb();

  const { name, category, team, 'content-path': contentPath, tags, version, 'approval-level': approvalLevel, owner } = options;

  if (!name || !category || !contentPath) {
    console.error(chalk.red('Error: --name, --category, and --content-path are required'));
    process.exit(1);
  }

  // Validate content path exists
  const fullPath = path.resolve(contentPath as string);
  if (!existsSync(fullPath)) {
    console.error(chalk.red(`Error: Content file not found: ${fullPath}`));
    process.exit(1);
  }

  // Calculate hash
  const content = readFileSync(fullPath, 'utf-8');
  const hash = calculateHash(content);

  // Parse tags
  const tagArray = tags ? (tags as string).split(',').map(t => t.trim()) : [];

  // Insert skill
  try {
    db.prepare(`
      INSERT INTO skills (
        name, category, team, content_path, content_hash, tags, version, status,
        approval_level, owner, generated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name,
      category,
      team || 'default',
      contentPath,
      hash,
      JSON.stringify(tagArray),
      version || '1.0.0',
      'active',
      approvalLevel || 'human',
      owner || 'unknown',
      'manual'
    );

    console.log(chalk.green(`✓ Created skill: ${name}`));
    console.log(`  Category: ${category}`);
    console.log(`  Version: ${version || '1.0.0'}`);
    console.log(`  Approval: ${approvalLevel || 'human'}`);
    console.log(`  Path: ${contentPath}`);
    console.log(`  Hash: ${hash.slice(0, 16)}...`);
  } catch (error: any) {
    if (error.message.includes('UNIQUE constraint failed')) {
      console.error(chalk.red(`Error: Skill "${name}" already exists`));
    } else {
      console.error(chalk.red(`Error: ${error.message}`));
    }
    db.close();
    process.exit(1);
  }

  db.close();
}

// ============================================================================
// Command: update
// ============================================================================

async function cmdUpdate(options: Record<string, string | boolean>): Promise<void> {
  const db = getDb();

  const { skill, version, tags, 'recalculate-hash': recalcHash, 'approval-level': approvalLevel } = options;

  if (!skill) {
    console.error(chalk.red('Error: --skill is required'));
    process.exit(1);
  }

  // Get skill
  const skillRecord = db.prepare('SELECT * FROM skills WHERE name = ?').get(skill) as Skill | undefined;

  if (!skillRecord) {
    console.error(chalk.red(`Error: Skill not found: ${skill}`));
    db.close();
    process.exit(1);
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (version) {
    updates.push('version = ?');
    params.push(version);
  }

  if (tags) {
    const tagArray = (tags as string).split(',').map(t => t.trim());
    updates.push('tags = ?');
    params.push(JSON.stringify(tagArray));
  }

  if (approvalLevel) {
    updates.push('approval_level = ?');
    params.push(approvalLevel);
  }

  if (recalcHash) {
    const content = readFileSync(skillRecord.content_path, 'utf-8');
    const newHash = calculateHash(content);
    updates.push('content_hash = ?');
    params.push(newHash);
    console.log(chalk.blue(`New hash: ${newHash.slice(0, 16)}...`));
  }

  if (updates.length === 0) {
    console.log(chalk.yellow('No updates specified'));
    db.close();
    return;
  }

  updates.push('updated_at = datetime(\'now\')');
  params.push(skill);

  db.prepare(`UPDATE skills SET ${updates.join(', ')} WHERE name = ?`).run(...params);

  console.log(chalk.green(`✓ Updated skill: ${skill}`));
  db.close();
}

// ============================================================================
// Command: deprecate
// ============================================================================

async function cmdDeprecate(options: Record<string, string | boolean>): Promise<void> {
  const db = getDb();

  const { skill, replacement, note } = options;

  if (!skill) {
    console.error(chalk.red('Error: --skill is required'));
    process.exit(1);
  }

  // Get skill ID
  const skillRecord = db.prepare('SELECT id FROM skills WHERE name = ?').get(skill) as Skill | undefined;

  if (!skillRecord) {
    console.error(chalk.red(`Error: Skill not found: ${skill}`));
    db.close();
    process.exit(1);
  }

  // Get replacement ID if specified
  let replacementId: number | null = null;
  if (replacement) {
    const replacementRecord = db.prepare('SELECT id FROM skills WHERE name = ?').get(replacement) as Skill | undefined;
    if (replacementRecord) {
      replacementId = replacementRecord.id;
    }
  }

  // Update skill
  db.prepare(`
    UPDATE skills
    SET status = 'deprecated',
        deprecation_note = ?,
        replacement_id = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(note || 'Deprecated', replacementId, skillRecord.id);

  console.log(chalk.yellow(`⚠ Deprecated skill: ${skill}`));
  if (replacement) {
    console.log(`  Replacement: ${replacement}`);
  }
  if (note) {
    console.log(`  Note: ${note}`);
  }

  db.close();
}

// ============================================================================
// Command: approve
// ============================================================================

async function cmdApprove(options: Record<string, string | boolean>): Promise<void> {
  const db = getDb();

  const { skill, version, approver, decision, reasoning } = options;

  if (!skill || !decision) {
    console.error(chalk.red('Error: --skill and --decision are required'));
    process.exit(1);
  }

  if (!['approved', 'rejected'].includes(decision as string)) {
    console.error(chalk.red('Error: --decision must be "approved" or "rejected"'));
    process.exit(1);
  }

  // Get skill
  const skillRecord = db.prepare('SELECT * FROM skills WHERE name = ?').get(skill) as Skill | undefined;

  if (!skillRecord) {
    console.error(chalk.red(`Error: Skill not found: ${skill}`));
    db.close();
    process.exit(1);
  }

  // Record approval
  db.prepare(`
    INSERT INTO approval_history (skill_id, version, approval_level, approver, decision, reasoning, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    skillRecord.id,
    version || skillRecord.version,
    skillRecord.approval_level,
    approver || 'system',
    decision,
    reasoning || null
  );

  // Update skill status
  if (decision === 'approved') {
    db.prepare('UPDATE skills SET status = ? WHERE id = ?').run('active', skillRecord.id);
    console.log(chalk.green(`✓ Skill approved: ${skill} (v${version || skillRecord.version})`));
  } else {
    db.prepare('UPDATE skills SET status = ? WHERE id = ?').run('archived', skillRecord.id);
    console.log(chalk.red(`✗ Skill rejected: ${skill}`));
  }

  if (reasoning) {
    console.log(`  Reasoning: ${reasoning}`);
  }

  db.close();
}

// ============================================================================
// Command: escalate
// ============================================================================

async function cmdEscalate(options: Record<string, string | boolean>): Promise<void> {
  const db = getDb();

  const { skill, version, reason } = options;

  if (!skill || !reason) {
    console.error(chalk.red('Error: --skill and --reason are required'));
    process.exit(1);
  }

  // Get skill
  const skillRecord = db.prepare('SELECT * FROM skills WHERE name = ?').get(skill) as Skill | undefined;

  if (!skillRecord) {
    console.error(chalk.red(`Error: Skill not found: ${skill}`));
    db.close();
    process.exit(1);
  }

  // Update approval level to escalate
  db.prepare('UPDATE skills SET approval_level = ? WHERE id = ?').run('escalate', skillRecord.id);

  // Record escalation in approval history
  db.prepare(`
    INSERT INTO approval_history (skill_id, version, approval_level, approver, decision, reasoning, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    skillRecord.id,
    version || skillRecord.version,
    'escalate',
    'system',
    'escalated',
    reason
  );

  console.log(chalk.yellow(`⚠ Skill escalated: ${skill}`));
  console.log(`  Reason: ${reason}`);
  console.log(`  Awaiting expert review...`);

  db.close();
}

// ============================================================================
// Command: pending
// ============================================================================

async function cmdPending(options: Record<string, string | boolean>): Promise<void> {
  const db = getDb();

  const approvalLevel = options['approval-level'] as string | undefined;

  let query = `
    SELECT s.* FROM skills s
    LEFT JOIN approval_history ah ON ah.skill_id = s.id AND ah.version = s.version AND ah.decision = 'approved'
    WHERE ah.id IS NULL
      AND s.approval_level != 'auto'
      AND s.status = 'active'
  `;

  const params: any[] = [];

  if (approvalLevel) {
    query += ' AND s.approval_level = ?';
    params.push(approvalLevel);
  }

  query += ' ORDER BY s.created_at DESC';

  const skills = db.prepare(query).all(...params) as Skill[];

  if (skills.length === 0) {
    console.log(chalk.green('✓ No pending approvals'));
    db.close();
    return;
  }

  const headers = ['ID', 'Name', 'Category', 'Approval Level', 'Version', 'Created'];
  const rows = skills.map(s => [
    s.id.toString(),
    s.name,
    s.category,
    s.approval_level === 'escalate' ? chalk.yellow(s.approval_level) : chalk.red(s.approval_level),
    s.version,
    s.created_at.split('T')[0]
  ]);

  console.log(formatTable(headers, rows));
  console.log(`\n${chalk.yellow(`Pending: ${skills.length} skill(s)`)}`);

  db.close();
}

// ============================================================================
// Command: approval-status
// ============================================================================

async function cmdApprovalStatus(options: Record<string, string | boolean>): Promise<void> {
  const db = getDb();

  const { skill } = options;

  if (!skill) {
    console.error(chalk.red('Error: --skill is required'));
    process.exit(1);
  }

  // Get skill
  const skillRecord = db.prepare('SELECT * FROM skills WHERE name = ?').get(skill) as Skill | undefined;

  if (!skillRecord) {
    console.error(chalk.red(`Error: Skill not found: ${skill}`));
    db.close();
    process.exit(1);
  }

  console.log(chalk.bold(`\nApproval Status: ${skill}`));
  console.log(`${'─'.repeat(50)}`);
  console.log(`Approval Level: ${skillRecord.approval_level}`);
  console.log(`Current Status: ${skillRecord.status}`);

  // Get approval history
  const history = db.prepare(`
    SELECT * FROM approval_history
    WHERE skill_id = ?
    ORDER BY timestamp DESC
  `).all(skillRecord.id) as ApprovalHistory[];

  if (history.length === 0) {
    console.log(chalk.yellow('\nNo approval history'));
  } else {
    console.log(chalk.bold('\nApproval History:'));
    history.forEach((entry, i) => {
      console.log(`\n${i + 1}. ${entry.decision.toUpperCase()} (${entry.timestamp.split('T')[0]})`);
      console.log(`   Version: ${entry.version}`);
      console.log(`   Approver: ${entry.approver || 'system'}`);
      if (entry.reasoning) {
        console.log(`   Reasoning: ${entry.reasoning}`);
      }
    });
  }

  db.close();
}

// ============================================================================
// Command: analytics
// ============================================================================

async function cmdAnalytics(options: Record<string, string | boolean>, subcommand?: string): Promise<void> {
  const db = getDb();

  if (!subcommand) {
    console.error(chalk.red('Error: Analytics subcommand required'));
    console.log('\nAvailable subcommands:');
    console.log('  effectiveness              - Skill effectiveness by approval level');
    console.log('  velocity                   - Approval velocity and SLA compliance');
    console.log('  bottlenecks                - Identify approval bottlenecks');
    console.log('  by-approval                - Skills grouped by approval level');
    console.log('  effectiveness-by-approval  - Effectiveness metrics grouped by approval level');
    console.log('  phase4-performance         - Performance of Phase4-generated skills');
    console.log('  approval-efficiency        - Approval workflow efficiency metrics');
    process.exit(1);
  }

  switch (subcommand) {
    case 'effectiveness':
      await analyticsEffectiveness(db, options);
      break;
    case 'velocity':
      await analyticsVelocity(db, options);
      break;
    case 'bottlenecks':
      await analyticsBottlenecks(db, options);
      break;
    case 'by-approval':
      await analyticsByApproval(db, options);
      break;
    case 'effectiveness-by-approval':
      await analyticsEffectivenessByApproval(db, options);
      break;
    case 'phase4-performance':
      await analyticsPhase4Performance(db, options);
      break;
    case 'approval-efficiency':
      await analyticsApprovalEfficiency(db, options);
      break;
    default:
      console.error(chalk.red(`Error: Unknown analytics subcommand: ${subcommand}`));
      process.exit(1);
  }

  db.close();
}

async function analyticsEffectiveness(db: Database.Database, options: Record<string, string | boolean>): Promise<void> {
  const days = parseInt(options.days as string || '30');

  console.log(chalk.bold(`\nSkill Effectiveness by Approval Level (${days} days)`));
  console.log(`${'─'.repeat(60)}`);

  const approvalLevels = ['auto', 'escalate', 'human'];

  for (const level of approvalLevels) {
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT sul.skill_id) as skill_count,
        COUNT(*) as usage_count,
        AVG(sul.confidence_after - sul.confidence_before) as avg_impact,
        AVG(sul.execution_time_ms) as avg_time
      FROM skill_usage_log sul
      JOIN skills s ON s.id = sul.skill_id
      WHERE s.approval_level = ?
        AND sul.loaded_at >= datetime('now', '-${days} days')
        AND sul.confidence_before IS NOT NULL
        AND sul.confidence_after IS NOT NULL
    `).get(level) as any;

    console.log(`\n${chalk.bold(level.toUpperCase())} skills:`);
    console.log(`  Skills: ${stats.skill_count || 0}`);
    console.log(`  Usages: ${stats.usage_count || 0}`);
    console.log(`  Avg Confidence Impact: ${stats.avg_impact ? `+${stats.avg_impact.toFixed(3)}` : 'N/A'}`);
    console.log(`  Avg Execution Time: ${stats.avg_time ? `${stats.avg_time.toFixed(1)}ms` : 'N/A'}`);
  }
}

async function analyticsVelocity(db: Database.Database, options: Record<string, string | boolean>): Promise<void> {
  const days = parseInt(options.days as string || '30');

  console.log(chalk.bold(`\nApproval Velocity (${days} days)`));
  console.log(`${'─'.repeat(50)}`);

  const approvals = db.prepare(`
    SELECT approval_level, decision, COUNT(*) as count, AVG(julianday('now') - julianday(timestamp)) as avg_days
    FROM approval_history
    WHERE timestamp >= datetime('now', '-${days} days')
    GROUP BY approval_level, decision
  `).all() as any[];

  if (approvals.length === 0) {
    console.log(chalk.yellow('\nNo approvals in the specified timeframe'));
    return;
  }

  approvals.forEach(stat => {
    console.log(`\n${stat.approval_level.toUpperCase()} - ${stat.decision}:`);
    console.log(`  Count: ${stat.count}`);
    console.log(`  Avg Time: ${stat.avg_days.toFixed(1)} days`);
  });

  // SLA compliance (example: human approvals should be within 7 days)
  const slaTarget = 7;
  const humanApprovals = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN julianday('now') - julianday(timestamp) <= ${slaTarget} THEN 1 ELSE 0 END) as within_sla
    FROM approval_history
    WHERE approval_level = 'human'
      AND timestamp >= datetime('now', '-${days} days')
  `).get() as any;

  if (humanApprovals && humanApprovals.total > 0) {
    const compliance = (humanApprovals.within_sla / humanApprovals.total) * 100;
    console.log(`\n${chalk.bold('SLA Compliance')} (${slaTarget} days):`);
    console.log(`  Human Approvals: ${compliance.toFixed(1)}% (${humanApprovals.within_sla}/${humanApprovals.total})`);
  }
}

async function analyticsBottlenecks(db: Database.Database, options: Record<string, string | boolean>): Promise<void> {
  console.log(chalk.bold('\nApproval Bottlenecks'));
  console.log(`${'─'.repeat(50)}`);

  // Skills waiting longest for approval
  const pending = db.prepare(`
    SELECT s.name, s.approval_level, s.created_at,
           julianday('now') - julianday(s.created_at) as days_waiting
    FROM skills s
    LEFT JOIN approval_history ah ON ah.skill_id = s.id AND ah.version = s.version AND ah.decision = 'approved'
    WHERE ah.id IS NULL
      AND s.approval_level != 'auto'
      AND s.status = 'active'
    ORDER BY days_waiting DESC
    LIMIT 10
  `).all() as any[];

  if (pending.length === 0) {
    console.log(chalk.green('\n✓ No pending approvals'));
    return;
  }

  console.log('\nLongest Pending Approvals:');
  pending.forEach((skill, i) => {
    console.log(`\n${i + 1}. ${skill.name} (${skill.approval_level})`);
    console.log(`   Waiting: ${Math.floor(skill.days_waiting)} days`);
  });
}

async function analyticsByApproval(db: Database.Database, options: Record<string, string | boolean>): Promise<void> {
  console.log(chalk.bold('\nSkills by Approval Level'));
  console.log(`${'─'.repeat(50)}`);

  const stats = db.prepare(`
    SELECT approval_level, status, COUNT(*) as count
    FROM skills
    GROUP BY approval_level, status
    ORDER BY approval_level, status
  `).all() as any[];

  const grouped: Record<string, any[]> = {};
  stats.forEach(stat => {
    if (!grouped[stat.approval_level]) {
      grouped[stat.approval_level] = [];
    }
    grouped[stat.approval_level].push(stat);
  });

  Object.keys(grouped).forEach(level => {
    console.log(`\n${chalk.bold(level.toUpperCase())}:`);
    grouped[level].forEach(stat => {
      console.log(`  ${stat.status}: ${stat.count}`);
    });
  });
}

// ============================================================================
// Command: analytics - Phase 6.2 New Subcommands
// ============================================================================

async function analyticsEffectivenessByApproval(db: Database.Database, options: Record<string, string | boolean>): Promise<void> {
  const days = parseInt(options.days as string || '30');

  console.log(chalk.bold(`\nSkill Effectiveness by Approval Level (${days} days)`));
  console.log(`${'─'.repeat(70)}\n`);

  const approvalLevels = ['auto', 'human', 'escalate'];

  for (const level of approvalLevels) {
    // Get stats for this approval level
    const stats = db.prepare(`
      SELECT
        COUNT(DISTINCT sul.skill_id) as skill_count,
        COUNT(*) as usage_count,
        AVG(sul.confidence_after - sul.confidence_before) as avg_confidence_impact,
        AVG(sul.execution_time_ms) as avg_execution_time,
        SUM(CASE WHEN (sul.confidence_after - sul.confidence_before) > 0.05 THEN 1 ELSE 0 END) as success_count
      FROM skill_usage_log sul
      JOIN skills s ON s.id = sul.skill_id
      WHERE s.approval_level = ?
        AND sul.loaded_at >= datetime('now', '-${days} days')
        AND sul.confidence_before IS NOT NULL
        AND sul.confidence_after IS NOT NULL
    `).get(level) as any;

    if (!stats || stats.usage_count === 0) {
      console.log(chalk.bold(`${level.charAt(0).toUpperCase() + level.slice(1)}-approved skills:`));
      console.log(chalk.dim('  No usage data available\n'));
      continue;
    }

    const successRate = stats.usage_count > 0 ? (stats.success_count / stats.usage_count) * 100 : 0;

    console.log(chalk.bold(`${level.charAt(0).toUpperCase() + level.slice(1)}-approved skills:`));
    console.log(`  Avg confidence impact: ${stats.avg_confidence_impact ? chalk.green(`+${stats.avg_confidence_impact.toFixed(2)}`) : 'N/A'}`);
    console.log(`  Usage count: ${chalk.cyan(stats.usage_count.toLocaleString())}`);
    console.log(`  Success rate: ${chalk.green(`${successRate.toFixed(1)}%`)} (${stats.success_count}/${stats.usage_count} usages)`);
    console.log(`  Avg execution time: ${stats.avg_execution_time ? `${stats.avg_execution_time.toFixed(1)}ms` : 'N/A'}\n`);
  }
}

async function analyticsPhase4Performance(db: Database.Database, options: Record<string, string | boolean>): Promise<void> {
  const days = parseInt(options.days as string || '30');

  console.log(chalk.bold(`\nPhase 4 Generated Skills Performance (${days} days)`));
  console.log(`${'─'.repeat(70)}\n`);

  // Get overall Phase4 stats
  const overallStats = db.prepare(`
    SELECT
      COUNT(DISTINCT sul.skill_id) as skill_count,
      COUNT(*) as total_usages,
      AVG(sul.execution_time_ms) as avg_execution_time,
      AVG(sul.confidence_after - sul.confidence_before) as avg_confidence_impact
    FROM skill_usage_log sul
    JOIN skills s ON s.id = sul.skill_id
    WHERE s.is_auto_generated = 1
      AND s.generated_by = 'phase4'
      AND sul.loaded_at >= datetime('now', '-${days} days')
      AND sul.confidence_before IS NOT NULL
      AND sul.confidence_after IS NOT NULL
  `).get() as any;

  if (!overallStats || overallStats.total_usages === 0) {
    console.log(chalk.yellow('No Phase4 skill usage data found in the specified timeframe.'));
    console.log(chalk.dim('Phase4 skills may not have been used recently, or usage logging may not be enabled.\n'));
    return;
  }

  console.log(chalk.bold('Overall Metrics:'));
  console.log(`  Total Phase4 skill usages: ${chalk.cyan(overallStats.total_usages.toLocaleString())}`);
  console.log(`  Unique Phase4 skills used: ${chalk.cyan(overallStats.skill_count)}`);
  console.log(`  Avg execution time: ${overallStats.avg_execution_time ? `${overallStats.avg_execution_time.toFixed(1)}ms` : 'N/A'}`);
  console.log(`  Avg confidence impact: ${overallStats.avg_confidence_impact ? chalk.green(`+${overallStats.avg_confidence_impact.toFixed(2)}`) : 'N/A'}`);
  console.log(chalk.dim('  Cost savings: N/A (requires cost tracking implementation)\n'));

  // Get top 5 Phase4 skills
  const topSkills = db.prepare(`
    SELECT
      s.name,
      COUNT(*) as usage_count,
      AVG(sul.confidence_after - sul.confidence_before) as avg_confidence_impact,
      AVG(sul.execution_time_ms) as avg_execution_time
    FROM skill_usage_log sul
    JOIN skills s ON s.id = sul.skill_id
    WHERE s.is_auto_generated = 1
      AND s.generated_by = 'phase4'
      AND sul.loaded_at >= datetime('now', '-${days} days')
      AND sul.confidence_before IS NOT NULL
      AND sul.confidence_after IS NOT NULL
    GROUP BY s.id, s.name
    ORDER BY usage_count DESC
    LIMIT 5
  `).all() as any[];

  if (topSkills.length > 0) {
    console.log(chalk.bold('Top 5 Phase4 Skills:'));
    topSkills.forEach((skill, index) => {
      const impact = skill.avg_confidence_impact ? `+${skill.avg_confidence_impact.toFixed(2)}` : 'N/A';
      console.log(`  ${index + 1}. ${chalk.cyan(skill.name)} (${skill.usage_count} uses, ${chalk.green(impact)} confidence)`);
    });
    console.log('');
  }
}

async function analyticsApprovalEfficiency(db: Database.Database, options: Record<string, string | boolean>): Promise<void> {
  console.log(chalk.bold('\nApproval Workflow Efficiency'));
  console.log(`${'─'.repeat(70)}\n`);

  // Get approval counts and timing by level
  const approvalStats = db.prepare(`
    SELECT
      approval_level,
      COUNT(*) as total_count,
      AVG(review_duration_minutes) as avg_review_time_minutes,
      SUM(CASE WHEN decision = 'approved' THEN 1 ELSE 0 END) as approved_count,
      SUM(CASE WHEN decision = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
      SUM(CASE WHEN decision = 'escalated' THEN 1 ELSE 0 END) as escalated_count
    FROM approval_history
    GROUP BY approval_level
    ORDER BY approval_level
  `).all() as any[];

  if (approvalStats.length === 0) {
    console.log(chalk.yellow('No approval history found in the database.'));
    console.log(chalk.dim('Approvals may not have been logged yet.\n'));
    return;
  }

  // Display approval stats by level
  console.log(chalk.bold('Approval Statistics by Level:\n'));

  const slaTargets: Record<string, number> = {
    'auto': 0, // instant
    'human': 10080, // 7 days in minutes
    'escalate': 2880 // 2 days in minutes
  };

  approvalStats.forEach(stat => {
    const approvalRate = stat.total_count > 0 ? (stat.approved_count / stat.total_count) * 100 : 0;
    const rejectionRate = stat.total_count > 0 ? (stat.rejected_count / stat.total_count) * 100 : 0;

    let avgTimeDisplay = 'N/A';
    if (stat.avg_review_time_minutes !== null) {
      if (stat.approval_level === 'auto') {
        avgTimeDisplay = 'instant';
      } else if (stat.avg_review_time_minutes < 60) {
        avgTimeDisplay = `${stat.avg_review_time_minutes.toFixed(1)} minutes`;
      } else if (stat.avg_review_time_minutes < 1440) {
        avgTimeDisplay = `${(stat.avg_review_time_minutes / 60).toFixed(1)} hours`;
      } else {
        avgTimeDisplay = `${(stat.avg_review_time_minutes / 1440).toFixed(1)} days`;
      }
    }

    const slaTarget = slaTargets[stat.approval_level];
    const slaDisplay = stat.approval_level === 'auto' ? 'instant' :
      stat.approval_level === 'human' ? '7 days' : '2 days';

    console.log(chalk.bold(`${stat.approval_level.charAt(0).toUpperCase() + stat.approval_level.slice(1)}-approved:`));
    console.log(`  Total: ${chalk.cyan(stat.total_count.toString())} (avg time: ${avgTimeDisplay}, SLA: ${slaDisplay})`);
    console.log(`  Approval rate: ${chalk.green(`${approvalRate.toFixed(1)}%`)} (${stat.approved_count} approved)`);
    if (stat.rejected_count > 0) {
      console.log(`  Rejection rate: ${chalk.red(`${rejectionRate.toFixed(1)}%`)} (${stat.rejected_count} rejected)`);
    }
    if (stat.escalated_count > 0) {
      console.log(`  Escalated: ${chalk.yellow(stat.escalated_count.toString())}`);
    }
    console.log('');
  });

  // Check for bottlenecks (pending approvals exceeding SLA)
  const bottlenecks = db.prepare(`
    SELECT
      s.name,
      s.approval_level,
      julianday('now') - julianday(s.created_at) as days_pending,
      s.created_at
    FROM skills s
    LEFT JOIN approval_history ah ON ah.skill_id = s.id AND ah.decision = 'approved'
    WHERE ah.id IS NULL
      AND s.approval_level != 'auto'
      AND s.status = 'active'
      AND (
        (s.approval_level = 'human' AND julianday('now') - julianday(s.created_at) > 7)
        OR
        (s.approval_level = 'escalate' AND julianday('now') - julianday(s.created_at) > 2)
      )
    ORDER BY days_pending DESC
  `).all() as any[];

  if (bottlenecks.length > 0) {
    console.log(chalk.bold('Bottlenecks (Approvals Exceeding SLA):\n'));
    bottlenecks.forEach((skill, index) => {
      const daysOver = skill.approval_level === 'human' ? skill.days_pending - 7 : skill.days_pending - 2;
      console.log(`  ${index + 1}. ${chalk.yellow(skill.name)} (${skill.approval_level})`);
      console.log(`     Pending: ${Math.floor(skill.days_pending)} days (${chalk.red(`${daysOver.toFixed(1)} days over SLA`)})`);
    });
    console.log('');

    const humanOverdue = bottlenecks.filter(b => b.approval_level === 'human').length;
    const escalateOverdue = bottlenecks.filter(b => b.approval_level === 'escalate').length;

    if (humanOverdue > 0) {
      console.log(chalk.yellow(`⚠ ${humanOverdue} human approval${humanOverdue > 1 ? 's' : ''} > 7 days (escalate recommended)`));
    }
    if (escalateOverdue > 0) {
      console.log(chalk.red(`⚠ ${escalateOverdue} escalated approval${escalateOverdue > 1 ? 's' : ''} > 2 days (expert review needed)`));
    }
    console.log('');
  } else {
    console.log(chalk.green('✓ No bottlenecks found - all pending approvals are within SLA\n'));
  }
}

// ============================================================================
// Main CLI Entry Point
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
${chalk.bold('Skills Database CLI Tool')}

Usage: npx cfn skill <command> [options]

Commands:
  list              List skills with filtering
  assign            Assign skill to agent
  create            Create new skill
  update            Update skill metadata
  deprecate         Deprecate a skill
  approve           Approve/reject a skill
  escalate          Escalate skill for expert review
  pending           List pending approvals
  approval-status   Check skill approval status
  analytics         Skill analytics and metrics

Examples:
  npx cfn skill list --approval=auto
  npx cfn skill list --pending-approval
  npx cfn skill assign --agent=backend-developer --skill=jwt-auth --priority=3
  npx cfn skill create --name=new-skill --category=domain --content-path=./skill.md
  npx cfn skill approve --skill=jwt-auth --decision=approved --approver=expert@example.com
  npx cfn skill pending --approval-level=human
  npx cfn skill analytics effectiveness --days=30
`);
    process.exit(0);
  }

  const command = args[0];
  const options = parseArgs(args.slice(1));

  try {
    switch (command) {
      case 'list':
        await cmdList(options);
        break;
      case 'assign':
        await cmdAssign(options);
        break;
      case 'create':
        await cmdCreate(options);
        break;
      case 'update':
        await cmdUpdate(options);
        break;
      case 'deprecate':
        await cmdDeprecate(options);
        break;
      case 'approve':
        await cmdApprove(options);
        break;
      case 'escalate':
        await cmdEscalate(options);
        break;
      case 'pending':
        await cmdPending(options);
        break;
      case 'approval-status':
        await cmdApprovalStatus(options);
        break;
      case 'analytics':
        await cmdAnalytics(options, args[1]);
        break;
      default:
        console.error(chalk.red(`Error: Unknown command: ${command}`));
        console.log('Run "npx cfn skill --help" for usage information');
        process.exit(1);
    }
  } catch (error: any) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

// Run CLI (ESM-compatible check)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(chalk.red(`Fatal error: ${error.message}`));
    process.exit(1);
  });
}

export { main };
