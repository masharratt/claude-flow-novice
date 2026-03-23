#!/usr/bin/env node
/**
 * Test Manual Override Rate
 * Simulates 100 coordination tasks, tracks skill selection failures
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_SCENARIOS = [
  // 20 Redis coordination scenarios
  { prompt: "Coordinate 3 agents for authentication feature", expected: "redis-coordination" },
  { prompt: "Implement distributed locking for user sessions", expected: "redis-coordination" },
  { prompt: "Setup LPUSH/BLPOP pattern for task queue", expected: "redis-coordination" },
  { prompt: "Create hierarchical broadcast for 5 agents", expected: "redis-coordination" },
  { prompt: "Design mesh topology for agent communication", expected: "redis-coordination" },
  { prompt: "Implement waiting mode with coordinator wake-up", expected: "redis-coordination" },
  { prompt: "Build fault-tolerant messaging system with Redis", expected: "redis-coordination" },
  { prompt: "Create high-performance task queue with blocking lists", expected: "redis-coordination" },
  { prompt: "Setup atomic operations for distributed state", expected: "redis-coordination" },
  { prompt: "Implement pub/sub mechanism for multi-agent sync", expected: "redis-coordination" },
  { prompt: "Design scalable messaging with dynamic topology", expected: "redis-coordination" },
  { prompt: "Create real-time communication channel for agents", expected: "redis-coordination" },
  { prompt: "Implement agent coordination with BLPOP timeout", expected: "redis-coordination" },
  { prompt: "Setup distributed system communication patterns", expected: "redis-coordination" },
  { prompt: "Build complex multi-agent coordination workflow", expected: "redis-coordination" },
  { prompt: "Create Redis-based task synchronization", expected: "redis-coordination" },
  { prompt: "Implement message queue with Redis Lists", expected: "redis-coordination" },
  { prompt: "Design agent dependency graph with Redis", expected: "redis-coordination" },
  { prompt: "Setup coordinator broadcast pattern", expected: "redis-coordination" },
  { prompt: "Create agent wake-up mechanism with Redis", expected: "redis-coordination" },

  // 20 Agent spawning scenarios
  { prompt: "Spawn 5 validators for CFN Loop consensus", expected: "agent-spawning" },
  { prompt: "Deploy mesh topology for 4-agent feature team", expected: "agent-spawning" },
  { prompt: "Initialize 3 agents with dependency-aware spawning", expected: "agent-spawning" },
  { prompt: "Create hierarchical agent structure with coordinator", expected: "agent-spawning" },
  { prompt: "Spawn agents with automatic type selection", expected: "agent-spawning" },
  { prompt: "Deploy agents with context preservation across sessions", expected: "agent-spawning" },
  { prompt: "Initialize multi-agent system with CLI spawning", expected: "agent-spawning" },
  { prompt: "Setup spawn-workers for 6 specialist agents", expected: "agent-spawning" },
  { prompt: "Create scalable agent deployment framework", expected: "agent-spawning" },
  { prompt: "Implement dynamic resource optimization for agents", expected: "agent-spawning" },
  { prompt: "Deploy agents with adaptive allocation strategy", expected: "agent-spawning" },
  { prompt: "Initialize framework with intelligent agent selection", expected: "agent-spawning" },
  { prompt: "Spawn agents for complex system architecture", expected: "agent-spawning" },
  { prompt: "Create dynamic agent deployment with mesh topology", expected: "agent-spawning" },
  { prompt: "Setup intelligent agent orchestration workflow", expected: "agent-spawning" },
  { prompt: "Deploy multi-agent initialization system", expected: "agent-spawning" },
  { prompt: "Spawn agents with dependency resolution", expected: "agent-spawning" },
  { prompt: "Initialize agents with cost optimization ($0 coordinator)", expected: "agent-spawning" },
  { prompt: "Create agent spawning mechanism with type selection", expected: "agent-spawning" },
  { prompt: "Deploy agents with Redis integration patterns", expected: "agent-spawning" },

  // 20 CFN Loop validation scenarios
  { prompt: "Validate consensus with adaptive thresholds", expected: "cfn-loop-validation" },
  { prompt: "Run CFN Loop with MVP mode (0.85 consensus)", expected: "cfn-loop-validation" },
  { prompt: "Execute validation framework for quality assurance", expected: "cfn-loop-validation" },
  { prompt: "Create consensus-driven validation workflow", expected: "cfn-loop-validation" },
  { prompt: "Implement multi-mode validation mechanism", expected: "cfn-loop-validation" },
  { prompt: "Setup machine learning scoring for validators", expected: "cfn-loop-validation" },
  { prompt: "Run iterative quality assessment for complex systems", expected: "cfn-loop-validation" },
  { prompt: "Execute multi-phase validation with feedback cycles", expected: "cfn-loop-validation" },
  { prompt: "Create intelligent feedback system for CFN Loop", expected: "cfn-loop-validation" },
  { prompt: "Implement continuous improvement cycles for validation", expected: "cfn-loop-validation" },
  { prompt: "Validate complex system architecture with CFN Loop", expected: "cfn-loop-validation" },
  { prompt: "Run consensus validation with auto-retry pattern", expected: "cfn-loop-validation" },
  { prompt: "Execute CFN Loop with Enterprise mode (0.95 consensus)", expected: "cfn-loop-validation" },
  { prompt: "Create validation framework with evidence chain", expected: "cfn-loop-validation" },
  { prompt: "Implement mode-dependent threshold enforcement", expected: "cfn-loop-validation" },
  { prompt: "Setup automatic validator spawning based on mode", expected: "cfn-loop-validation" },
  { prompt: "Run quality assurance for multi-phase system", expected: "cfn-loop-validation" },
  { prompt: "Execute consensus calculation with SQLite storage", expected: "cfn-loop-validation" },
  { prompt: "Create adaptive threshold validation workflow", expected: "cfn-loop-validation" },
  { prompt: "Implement CFN Loop with improvement cycles", expected: "cfn-loop-validation" },

  // 20 SQLite memory scenarios
  { prompt: "Store agent state with 5-level ACL", expected: "sqlite-memory" },
  { prompt: "Query encrypted data at ACL Level 1", expected: "sqlite-memory" },
  { prompt: "Implement multi-tier memory access system", expected: "sqlite-memory" },
  { prompt: "Setup Redis session management with SQLite persistence", expected: "sqlite-memory" },
  { prompt: "Create secure data persistence layer with TTL", expected: "sqlite-memory" },
  { prompt: "Implement contextual memory preservation across sessions", expected: "sqlite-memory" },
  { prompt: "Setup encrypted storage with AES-256", expected: "sqlite-memory" },
  { prompt: "Create tiered access control for agent data", expected: "sqlite-memory" },
  { prompt: "Implement secure memory management with ACL", expected: "sqlite-memory" },
  { prompt: "Setup contextual data storage with expiration", expected: "sqlite-memory" },
  { prompt: "Query swarm-level memory (ACL Level 3)", expected: "sqlite-memory" },
  { prompt: "Store project-wide context in SQLite", expected: "sqlite-memory" },
  { prompt: "Implement TTL-based expiration for agent memory", expected: "sqlite-memory" },
  { prompt: "Create 5-level ACL query patterns", expected: "sqlite-memory" },
  { prompt: "Setup encryption enforcement for sensitive data", expected: "sqlite-memory" },
  { prompt: "Implement Redis hot cache with SQLite cold storage", expected: "sqlite-memory" },
  { prompt: "Store team-level memory with encryption (ACL Level 2)", expected: "sqlite-memory" },
  { prompt: "Create system audit trail (ACL Level 5)", expected: "sqlite-memory" },
  { prompt: "Implement memory lifecycle management with TTL", expected: "sqlite-memory" },
  { prompt: "Setup dynamic access control for contextual data", expected: "sqlite-memory" },

  // 20 Hook pipeline scenarios
  { prompt: "Detect ROOT_WARNING in post-edit hook", expected: "hook-pipeline" },
  { prompt: "Auto-resolve file created in root directory", expected: "hook-pipeline" },
  { prompt: "Enforce TDD with automated validation", expected: "hook-pipeline" },
  { prompt: "Run post-edit validation pipeline", expected: "hook-pipeline" },
  { prompt: "Implement real-time code quality enforcement", expected: "hook-pipeline" },
  { prompt: "Create automated code correction workflow", expected: "hook-pipeline" },
  { prompt: "Setup feedback resolution for lint issues", expected: "hook-pipeline" },
  { prompt: "Implement validation hook framework with quality metrics", expected: "hook-pipeline" },
  { prompt: "Run automated post-edit checks", expected: "hook-pipeline" },
  { prompt: "Create ROOT_WARNING detection system", expected: "hook-pipeline" },
  { prompt: "Implement TDD violation handling", expected: "hook-pipeline" },
  { prompt: "Setup low coverage warning with gap reporting", expected: "hook-pipeline" },
  { prompt: "Run Rust quality checks with rustfmt", expected: "hook-pipeline" },
  { prompt: "Create continuous code correction pipeline", expected: "hook-pipeline" },
  { prompt: "Implement Redis feedback integration for CLI agents", expected: "hook-pipeline" },
  { prompt: "Setup automated validation workflow", expected: "hook-pipeline" },
  { prompt: "Run code quality improvement checks", expected: "hook-pipeline" },
  { prompt: "Create post-edit handler with auto-resolution", expected: "hook-pipeline" },
  { prompt: "Implement feedback resolver for all feedback types", expected: "hook-pipeline" },
  { prompt: "Setup validation pipeline with Redis pub/sub", expected: "hook-pipeline" }
];

// Note: Intentionally not including test-execution scenarios
// Total: 100 scenarios across 5 skills

function extractKeywordsFromSkillMd(skillPath) {
  try {
    const content = fs.readFileSync(skillPath, 'utf8');
    // Extract YAML frontmatter
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return [];

    const frontmatter = frontmatterMatch[1];

    // Extract keywords and triggers arrays
    const keywordsMatch = frontmatter.match(/keywords:\s*\[([\s\S]*?)\]/);
    const triggersMatch = frontmatter.match(/triggers:\s*\[([\s\S]*?)\]/);

    const keywords = [];

    if (keywordsMatch) {
      const keywordStr = keywordsMatch[1]
        .split(/[,\n]/)
        .map(k => k.trim().replace(/["']/g, ''))
        .filter(k => k.length > 0);
      keywords.push(...keywordStr);
    }

    if (triggersMatch) {
      const triggerStr = triggersMatch[1]
        .split(/[,\n]/)
        .map(k => k.trim().replace(/["']/g, ''))
        .filter(k => k.length > 0);
      keywords.push(...triggerStr);
    }

    return keywords;
  } catch (e) {
    return [];
  }
}

async function simulateSkillInvocation(prompt) {
  // Read CLAUDE.md to check if skills are referenced
  const claudeMd = fs.readFileSync(
    path.join(process.cwd(), 'CLAUDE.md'),
    'utf8'
  );

  // Read actual keywords from SKILL.md files
  const skillsDir = path.join(process.cwd(), '.claude/skills');

  const keywords = {
    'redis-coordination': extractKeywordsFromSkillMd(path.join(skillsDir, 'redis-coordination/SKILL.md')),
    'agent-spawning': extractKeywordsFromSkillMd(path.join(skillsDir, 'agent-spawning/SKILL.md')),
    'cfn-loop-validation': extractKeywordsFromSkillMd(path.join(skillsDir, 'cfn-loop-validation/SKILL.md')),
    'sqlite-memory': extractKeywordsFromSkillMd(path.join(skillsDir, 'sqlite-memory/SKILL.md')),
    'hook-pipeline': extractKeywordsFromSkillMd(path.join(skillsDir, 'hook-pipeline/SKILL.md'))
  };

  // Score each skill
  const scores = {};
  for (const [skill, skillKeywords] of Object.entries(keywords)) {
    if (!claudeMd.includes(`.claude/skills/${skill}`)) {
      continue; // Skill not referenced in CLAUDE.md
    }

    let score = 0;
    const lowerPrompt = prompt.toLowerCase();

    for (const keyword of skillKeywords) {
      if (lowerPrompt.includes(keyword.toLowerCase())) {
        score += keyword.split(' ').length; // Multi-word keywords score higher
      }
    }

    scores[skill] = score;
  }

  // Select skill with highest score
  const entries = Object.entries(scores);
  if (entries.length === 0) return null;

  const sorted = entries.sort((a, b) => b[1] - a[1]);

  // Require minimum score threshold
  if (sorted[0][1] < 2) return null;

  return sorted[0][0];
}

async function testManualOverrideRate() {
  const results = {
    total: 0,
    skillSelected: 0,
    manualOverride: 0,
    failures: []
  };

  console.log('🧪 Testing Manual Override Rate (100 coordination scenarios)\n');

  for (const scenario of TEST_SCENARIOS) {
    results.total++;

    const skillInvoked = await simulateSkillInvocation(scenario.prompt);

    if (skillInvoked === scenario.expected) {
      results.skillSelected++;
      process.stdout.write('✓');
    } else {
      results.manualOverride++;
      process.stdout.write('✗');
      results.failures.push({
        prompt: scenario.prompt,
        expected: scenario.expected,
        actual: skillInvoked || "MANUAL_COORDINATION_REQUIRED"
      });
    }

    if (results.total % 20 === 0) {
      console.log(` (${results.total}/100)`);
    }
  }

  console.log('\n');

  const overrideRate = (results.manualOverride / results.total) * 100;

  const report = {
    ...results,
    overrideRate: parseFloat(overrideRate.toFixed(2)),
    passed: overrideRate < 5,
    threshold: 5
  };

  console.log('📊 Manual Override Rate Test Results:');
  console.log(`   Total scenarios: ${report.total}`);
  console.log(`   Skills selected: ${report.skillSelected}`);
  console.log(`   Manual override: ${report.manualOverride}`);
  console.log(`   Override rate: ${report.overrideRate}%`);
  console.log(`   Threshold: <${report.threshold}%`);
  console.log(`   Status: ${report.passed ? '✅ PASSED' : '❌ FAILED'}`);

  if (report.failures.length > 0) {
    console.log('\n⚠️  Failed scenarios:');
    report.failures.forEach((failure, idx) => {
      console.log(`   ${idx + 1}. "${failure.prompt}"`);
      console.log(`      Expected: ${failure.expected}`);
      console.log(`      Actual: ${failure.actual}`);
    });
  }

  // Save report
  const reportPath = path.join(process.cwd(), '.artifacts/analytics/manual-override-test.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  return report;
}

const report = await testManualOverrideRate();
process.exit(report.passed ? 0 : 1);
