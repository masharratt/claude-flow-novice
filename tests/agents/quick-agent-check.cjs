#!/usr/bin/env node

/**
 * Quick Agent Compliance Checker
 *
 * A simple script to quickly check agent compliance without Jest.
 * Run with: node tests/agents/quick-agent-check.js
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const AGENT_BASE_PATH = path.join(process.cwd(), '.claude', 'agents');

// Category requirements
const CATEGORY_REQUIREMENTS = {
  implementer: {
    requiredValidationHooks: ['agent-template-validator', 'cfn-loop-memory-validator', 'test-coverage-validator'],
    requiredACLLevel: 1,
    requiresBlockingCoordination: false
  },
  coordinator: {
    requiredValidationHooks: ['agent-template-validator', 'cfn-loop-memory-validator', 'blocking-coordination-validator'],
    requiredACLLevel: 3,
    requiresBlockingCoordination: true
  },
  validator: {
    requiredValidationHooks: ['agent-template-validator', 'cfn-loop-memory-validator', 'test-coverage-validator'],
    requiredACLLevel: 3,
    requiresBlockingCoordination: false
  },
  strategic: {
    requiredValidationHooks: ['agent-template-validator', 'cfn-loop-memory-validator'],
    requiredACLLevel: 4,
    requiresBlockingCoordination: false
  },
  sparc: {
    requiredValidationHooks: ['agent-template-validator', 'cfn-loop-memory-validator'],
    requiredACLLevel: [1, 3],
    requiresBlockingCoordination: false
  },
  researcher: {
    requiredValidationHooks: ['agent-template-validator'],
    requiredACLLevel: [1, 3],
    requiresBlockingCoordination: false
  },
  documentation: {
    requiredValidationHooks: ['agent-template-validator'],
    requiredACLLevel: 3,
    requiresBlockingCoordination: false
  }
};

// Agent categorization patterns
const CATEGORY_PATTERNS = [
  [/core-agents\/(coder|tester|analyst)\.md/, 'implementer'],
  [/development\/backend\//, 'implementer'],
  [/specialized\/mobile\//, 'implementer'],
  [/testing\//, 'implementer'],
  [/frontend\//, 'implementer'],
  [/core-agents\/(coordinator|task-coordinator)\.md/, 'coordinator'],
  [/swarm\/.*coordinator.*\.md/, 'coordinator'],
  [/consensus\/.*coordinator.*\.md/, 'coordinator'],
  [/core-agents\/reviewer\.md/, 'validator'],
  [/analysis\/code-review\//, 'validator'],
  [/security\//, 'validator'],
  [/testing\/validation\//, 'validator'],
  [/cfn-loop\/product-owner\.md/, 'strategic'],
  [/goal\/goal-planner\.md/, 'strategic'],
  [/sparc\//, 'sparc'],
  [/core-agents\/(researcher|planner)\.md/, 'researcher'],
  [/documentation\//, 'documentation']
];

/**
 * Discover all agent files
 */
function discoverAgentFiles(dir = AGENT_BASE_PATH) {
  const agentFiles = [];
  const skipDirs = ['agent-principles', 'examples', 'predesign-negotiation'];
  const skipFiles = ['README', 'CLAUDE.md', 'GUIDELINES', 'FINDINGS', 'PRINCIPLES', 'VALIDATION'];

  function traverse(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) {
          traverse(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        if (!skipFiles.some(skip => entry.name.includes(skip))) {
          agentFiles.push(fullPath);
        }
      }
    }
  }

  traverse(dir);
  return agentFiles;
}

/**
 * Categorize agent based on file path
 */
function categorizeAgent(relativePath) {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(relativePath)) {
      return category;
    }
  }
  return 'implementer'; // default
}

/**
 * Parse agent file
 */
function parseAgentFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);

    if (!frontmatterMatch) {
      return null;
    }

    const frontmatterYaml = frontmatterMatch[1];
    const frontmatter = yaml.load(frontmatterYaml);
    const body = content.slice(frontmatterMatch[0].length).trim();
    const relativePath = path.relative(AGENT_BASE_PATH, filePath);
    const category = categorizeAgent(relativePath);

    return {
      path: filePath,
      name: frontmatter.name || path.basename(filePath, '.md'),
      frontmatter,
      body,
      category
    };
  } catch (error) {
    console.error(`${colors.red}Error parsing ${filePath}:${colors.reset}`, error.message);
    return null;
  }
}

/**
 * Validate agent
 */
function validateAgent(agent) {
  const violations = [];
  const requirements = CATEGORY_REQUIREMENTS[agent.category];

  // Check frontmatter basics
  if (!agent.frontmatter.name) violations.push('Missing: name');
  if (!agent.frontmatter.description) violations.push('Missing: description');
  if (!agent.frontmatter.tools) violations.push('Missing: tools');
  if (!agent.frontmatter.model) violations.push('Missing: model');
  if (!agent.frontmatter.color) violations.push('Missing: color');

  // Check validation_hooks
  if (!agent.frontmatter.validation_hooks) {
    violations.push('Missing: validation_hooks');
  } else {
    for (const hook of requirements.requiredValidationHooks) {
      if (!agent.frontmatter.validation_hooks.includes(hook)) {
        violations.push(`Missing hook: ${hook}`);
      }
    }
  }

  // Check lifecycle
  if (!agent.frontmatter.lifecycle) {
    violations.push('Missing: lifecycle');
  } else {
    if (!agent.frontmatter.lifecycle.pre_task) {
      violations.push('Missing: lifecycle.pre_task');
    } else if (!agent.frontmatter.lifecycle.pre_task.includes('INSERT INTO agents')) {
      violations.push('Invalid: lifecycle.pre_task (no SQLite INSERT)');
    }

    if (!agent.frontmatter.lifecycle.post_task) {
      violations.push('Missing: lifecycle.post_task');
    } else if (!agent.frontmatter.lifecycle.post_task.includes('UPDATE agents')) {
      violations.push('Invalid: lifecycle.post_task (no SQLite UPDATE)');
    }
  }

  // Check ACL level
  if (agent.frontmatter.acl_level === undefined) {
    violations.push('Missing: acl_level');
  } else {
    const requiredLevel = requirements.requiredACLLevel;
    if (Array.isArray(requiredLevel)) {
      if (!requiredLevel.includes(agent.frontmatter.acl_level)) {
        violations.push(`Invalid ACL: ${agent.frontmatter.acl_level} (expected: ${requiredLevel.join(' or ')})`);
      }
    } else {
      if (agent.frontmatter.acl_level !== requiredLevel) {
        violations.push(`Invalid ACL: ${agent.frontmatter.acl_level} (expected: ${requiredLevel})`);
      }
    }
  }

  // Coordinator-specific checks
  if (requirements.requiresBlockingCoordination) {
    if (!agent.body.includes('BlockingCoordinationSignals')) {
      violations.push('Missing: BlockingCoordinationSignals import');
    }
    if (!agent.body.includes('CoordinatorTimeoutHandler')) {
      violations.push('Missing: CoordinatorTimeoutHandler import');
    }
    if (!agent.body.includes('BLOCKING_COORDINATION_SECRET')) {
      violations.push('Missing: HMAC secret usage');
    }
    if (!agent.body.includes('sendSignal')) {
      violations.push('Missing: sendSignal pattern');
    }
    if (!agent.body.includes('waitForAck')) {
      violations.push('Missing: waitForAck pattern');
    }
  }

  const totalChecks = 10 + (requirements.requiresBlockingCoordination ? 5 : 0);
  const passedChecks = totalChecks - violations.length;
  const score = Math.round((passedChecks / totalChecks) * 100);

  return {
    valid: violations.length === 0,
    violations,
    score
  };
}

/**
 * Main execution
 */
function main() {
  console.log(`${colors.bright}${colors.cyan}\n${'='.repeat(80)}`);
  console.log('🔍 QUICK AGENT COMPLIANCE CHECK');
  console.log(`${'='.repeat(80)}${colors.reset}\n`);

  const agentFiles = discoverAgentFiles();
  console.log(`📊 Discovered ${agentFiles.length} agent files\n`);

  const agents = agentFiles.map(parseAgentFile).filter(a => a !== null);
  const results = agents.map(agent => ({
    agent: agent.name,
    category: agent.category,
    ...validateAgent(agent)
  }));

  // Summary statistics
  const compliant = results.filter(r => r.valid);
  const nonCompliant = results.filter(r => !r.valid);
  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;

  console.log(`${colors.bright}SUMMARY:${colors.reset}`);
  console.log(`  Total Agents: ${agents.length}`);
  console.log(`  Compliant: ${colors.green}${compliant.length}${colors.reset} (${Math.round(compliant.length / agents.length * 100)}%)`);
  console.log(`  Non-Compliant: ${colors.red}${nonCompliant.length}${colors.reset} (${Math.round(nonCompliant.length / agents.length * 100)}%)`);
  console.log(`  Average Score: ${avgScore.toFixed(1)}%\n`);

  // Category breakdown
  const categories = ['implementer', 'coordinator', 'validator', 'strategic', 'sparc', 'researcher', 'documentation'];

  console.log(`${colors.bright}CATEGORY BREAKDOWN:${colors.reset}`);
  for (const category of categories) {
    const categoryResults = results.filter(r => r.category === category);
    if (categoryResults.length === 0) continue;

    const categoryCompliant = categoryResults.filter(r => r.valid).length;
    const categoryAvgScore = categoryResults.reduce((sum, r) => sum + r.score, 0) / categoryResults.length;

    const statusColor = categoryCompliant === categoryResults.length ? colors.green : colors.yellow;

    console.log(`\n  ${colors.bright}${category.toUpperCase()}:${colors.reset}`);
    console.log(`    Total: ${categoryResults.length}`);
    console.log(`    Compliant: ${statusColor}${categoryCompliant}/${categoryResults.length}${colors.reset} (${Math.round(categoryCompliant / categoryResults.length * 100)}%)`);
    console.log(`    Avg Score: ${categoryAvgScore.toFixed(1)}%`);
  }

  // Top violations
  const violationCounts = new Map();
  for (const result of results) {
    for (const violation of result.violations) {
      violationCounts.set(violation, (violationCounts.get(violation) || 0) + 1);
    }
  }

  const topViolations = Array.from(violationCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log(`\n${colors.bright}TOP 10 VIOLATIONS:${colors.reset}`);
  for (const [violation, count] of topViolations) {
    console.log(`  ${colors.red}${count} agents:${colors.reset} ${violation}`);
  }

  // Non-compliant agents detail
  if (nonCompliant.length > 0 && nonCompliant.length <= 20) {
    console.log(`\n${colors.bright}NON-COMPLIANT AGENTS (${nonCompliant.length}):${colors.reset}`);
    for (const result of nonCompliant.sort((a, b) => a.score - b.score).slice(0, 20)) {
      console.log(`\n  ${colors.yellow}${result.agent}${colors.reset} (${result.category}) - Score: ${result.score}%`);
      for (const violation of result.violations.slice(0, 5)) {
        console.log(`    ${colors.red}✗${colors.reset} ${violation}`);
      }
      if (result.violations.length > 5) {
        console.log(`    ${colors.yellow}... and ${result.violations.length - 5} more${colors.reset}`);
      }
    }
  }

  console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);

  // Exit code based on compliance
  if (nonCompliant.length > 0) {
    console.log(`${colors.yellow}⚠️  ${nonCompliant.length} agents need updates${colors.reset}`);
    console.log(`${colors.yellow}   See planning/redis-finalization/AGENT_UPDATE_MASTER_PLAN.md${colors.reset}\n`);
    process.exit(1); // Fail for CI/CD
  } else {
    console.log(`${colors.green}✅ All agents are compliant!${colors.reset}\n`);
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { discoverAgentFiles, parseAgentFile, validateAgent };
