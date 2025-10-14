#!/usr/bin/env node

/**
 * Pre-Agent Spawn Context Hook
 *
 * Automatically injects relevant adaptive context bullets into agent instructions
 * before agent spawn, based on agent type, task tags, and phase context.
 *
 * Usage: Configured in Claude Code hooks settings
 * Trigger: Before agent spawn (auto)
 *
 * Environment Variables:
 * - AGENT_TYPE: Type of agent being spawned
 * - TASK_TAGS: Comma-separated task tags
 * - PHASE: Current CFN Loop phase
 * - SWARM_ID: Current swarm ID
 * - AGENT_INSTRUCTION_FILE: Path to agent instruction file
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  minConfidence: 0.7,
  minHelpful: 3,
  maxBullets: 15,
  priorityMin: 6,
  injectionMode: 'merge',

  // Agent-specific context mappings
  agentContextMappings: {
    'coder': { categories: ['pattern', 'strategy'], tags: ['coding', 'best-practices'] },
    'architect': { categories: ['strategy', 'domain_insight'], tags: ['architecture', 'design'] },
    'security-specialist': { categories: ['pattern', 'edge_case'], tags: ['security', 'acl', 'validation'] },
    'tester': { categories: ['pattern', 'edge_case'], tags: ['testing', 'validation'] },
    'perf-analyzer': { categories: ['optimization', 'pattern'], tags: ['performance', 'optimization'] },
    'devops-engineer': { categories: ['strategy', 'pattern'], tags: ['deployment', 'ci-cd', 'infrastructure'] },
  },

  // Phase-specific tags
  phaseTags: {
    'phase-0-foundation': ['architecture', 'foundation', 'setup'],
    'phase-1-implementation': ['coding', 'patterns', 'testing'],
    'phase-2-security': ['security', 'acl', 'validation'],
    'phase-3-deployment': ['deployment', 'monitoring', 'ci-cd'],
  },
};

/**
 * Main hook execution
 */
async function main() {
  const agentType = process.env.AGENT_TYPE || process.argv[2];
  const taskTags = (process.env.TASK_TAGS || process.argv[3] || '').split(',').filter(Boolean);
  const phase = process.env.PHASE || process.argv[4];
  const swarmId = process.env.SWARM_ID || process.argv[5];
  const instructionFile = process.env.AGENT_INSTRUCTION_FILE || process.argv[6];

  if (!agentType) {
    console.error('❌ PRE-AGENT-SPAWN-CONTEXT: No agent type provided');
    process.exit(1);
  }

  console.log(`🔄 PRE-AGENT-SPAWN-CONTEXT: Agent ${agentType}`);
  console.log(`   Tags: ${taskTags.join(', ') || '(none)'}`);
  console.log(`   Phase: ${phase || '(none)'}`);

  try {
    // Build context query
    const queryParams = buildContextQuery({
      agentType,
      taskTags,
      phase,
      swarmId,
    });

    console.log(`🔍 Querying adaptive context: ${JSON.stringify(queryParams)}`);

    // Query adaptive context
    const bullets = await queryContext(queryParams);

    if (bullets.length === 0) {
      console.log('ℹ️  No relevant context bullets found, skipping injection');
      process.exit(0);
    }

    console.log(`📚 Found ${bullets.length} relevant bullets`);

    // Inject bullets into agent instruction file
    const targetFile = instructionFile || getAgentInstructionFile(agentType);

    if (!targetFile) {
      console.log('⚠️  No instruction file specified, injecting inline instead');
      // Return bullets for inline injection
      console.log('\n--- ADAPTIVE CONTEXT BULLETS ---');
      bullets.forEach(bullet => {
        console.log(`\n[${bullet.bullet_id}] ${bullet.content}`);
        console.log(`Confidence: ${bullet.confidence_score} | Helpful: ${bullet.helpful_count}`);
      });
      console.log('--- END ADAPTIVE CONTEXT ---\n');
      process.exit(0);
    }

    // Inject into file
    await injectContextIntoFile(targetFile, bullets, {
      mode: CONFIG.injectionMode,
      agentType,
      phase,
    });

    console.log(`✅ Context injected into ${targetFile}`);
    console.log(`📊 Injected ${bullets.length} bullets`);

    // Log usage for tracking
    await logContextUsage(bullets, { agentType, swarmId, phase });

    process.exit(0);

  } catch (error) {
    console.error(`❌ PRE-AGENT-SPAWN-CONTEXT ERROR: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * Build context query parameters
 */
function buildContextQuery(options) {
  const { agentType, taskTags, phase, swarmId } = options;

  // Start with agent-specific mappings
  const mapping = CONFIG.agentContextMappings[agentType] || {};

  // Combine tags from multiple sources
  const allTags = [
    ...(mapping.tags || []),
    ...taskTags,
    ...(CONFIG.phaseTags[phase] || []),
  ];

  // Remove duplicates
  const uniqueTags = [...new Set(allTags)];

  return {
    categories: mapping.categories,
    tags: uniqueTags,
    minConfidence: CONFIG.minConfidence,
    minHelpful: CONFIG.minHelpful,
    priorityMin: CONFIG.priorityMin,
    limit: CONFIG.maxBullets,
    swarmId,
  };
}

/**
 * Query adaptive context via slash command
 */
async function queryContext(params) {
  const args = ['/context-query'];

  if (params.categories?.length) {
    args.push(`--category=${params.categories.join(',')}`);
  }

  if (params.tags?.length) {
    args.push(`--tags=${params.tags.join(',')}`);
  }

  args.push(`--min-confidence=${params.minConfidence}`);
  args.push(`--min-helpful=${params.minHelpful}`);
  args.push(`--priority-min=${params.priorityMin}`);
  args.push(`--limit=${params.limit}`);
  args.push('--output=json');

  if (params.swarmId) {
    args.push(`--swarm-id=${params.swarmId}`);
  }

  try {
    const result = execSync(`claude-flow-novice ${args.join(' ')}`, {
      cwd: path.join(__dirname, '../..'),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const data = JSON.parse(result);
    return data.results || [];

  } catch (error) {
    console.error(`⚠️  Failed to query context: ${error.message}`);
    return [];
  }
}

/**
 * Get agent instruction file path
 */
function getAgentInstructionFile(agentType) {
  const agentFile = path.join(__dirname, '../../.claude/agents', `${agentType}.md`);

  if (fs.existsSync(agentFile)) {
    return agentFile;
  }

  // Try core agents subdirectory
  const coreAgentFile = path.join(__dirname, '../../.claude/agents/core-agents', `${agentType}.md`);

  if (fs.existsSync(coreAgentFile)) {
    return coreAgentFile;
  }

  return null;
}

/**
 * Inject context bullets into file
 */
async function injectContextIntoFile(targetFile, bullets, options) {
  const { mode, agentType, phase } = options;

  // Read current file content
  let content = '';
  if (fs.existsSync(targetFile)) {
    content = fs.readFileSync(targetFile, 'utf-8');
  }

  // Generate injection content
  const injectionContent = generateInjectionContent(bullets, { agentType, phase });

  // Find or create adaptive context section
  const sectionHeader = '## 📘 Adaptive Context (Auto-Injected)';
  const sectionStart = content.indexOf(sectionHeader);

  if (mode === 'merge' && sectionStart !== -1) {
    // Replace existing section
    const sectionEnd = content.indexOf('\n## ', sectionStart + 1);
    const beforeSection = content.substring(0, sectionStart);
    const afterSection = sectionEnd !== -1 ? content.substring(sectionEnd) : '';

    content = beforeSection + injectionContent + afterSection;

  } else if (mode === 'append') {
    // Append to end
    content += '\n\n' + injectionContent;

  } else {
    // Insert before first section or at beginning
    const firstSection = content.indexOf('\n## ');
    if (firstSection !== -1) {
      content = injectionContent + '\n\n' + content;
    } else {
      content = injectionContent + '\n\n' + content;
    }
  }

  // Write back to file
  fs.writeFileSync(targetFile, content, 'utf-8');
}

/**
 * Generate injection content
 */
function generateInjectionContent(bullets, options) {
  const { agentType, phase } = options;

  const timestamp = new Date().toISOString();

  let content = `## 📘 Adaptive Context (Auto-Injected)\n\n`;
  content += `**Last Updated:** ${timestamp}\n`;
  content += `**Agent Type:** ${agentType}\n`;
  if (phase) content += `**Phase:** ${phase}\n`;
  content += `**Bullets Injected:** ${bullets.length}\n`;
  content += `**Avg Confidence:** ${(bullets.reduce((sum, b) => sum + b.confidence_score, 0) / bullets.length).toFixed(2)}\n\n`;
  content += `---\n\n`;

  // Group bullets by category
  const byCategory = {};
  bullets.forEach(bullet => {
    const cat = bullet.category;
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(bullet);
  });

  // Generate content for each category
  Object.entries(byCategory).forEach(([category, categoryBullets]) => {
    const categoryTitle = category.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    content += `### ${categoryTitle}\n\n`;

    categoryBullets.forEach(bullet => {
      content += `**[${bullet.bullet_id}]** ${bullet.content}\n`;
      content += `*Confidence: ${bullet.confidence_score.toFixed(2)} | `;
      content += `Helpful: ${bullet.helpful_count} | `;
      content += `Priority: ${bullet.priority}*\n`;
      if (bullet.tags?.length) {
        content += `**Tags:** ${bullet.tags.join(', ')}\n`;
      }
      content += `\n`;
    });

    content += `---\n\n`;
  });

  content += `*💡 This section is auto-managed. Run \`/context-query\` to explore more bullets.*\n\n`;

  return content;
}

/**
 * Log context usage for tracking
 */
async function logContextUsage(bullets, context) {
  // Log to SQLite via CLI or direct DB access
  console.log(`📊 Logging usage for ${bullets.length} bullets...`);

  // This would insert into context_usage_log table
  // Placeholder for actual implementation
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
