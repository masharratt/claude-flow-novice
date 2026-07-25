#!/usr/bin/env tsx
/**
 * List all available agents discovered from .claude/agents/ directory
 */

import { loadAllAgentDefinitions } from '../src/agents/agent-loader.js';

async function main() {
  const agents = await loadAllAgentDefinitions();
  console.log('🔍 Discovered', agents.length, 'agents\n');

  // Group by category
  const byCategory: Record<string, any[]> = {};

  for (const agent of agents) {
    const category = agent.category || 'uncategorized';
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(agent);
  }

  // Print by category
  const categories = Object.keys(byCategory).sort();
  console.log(`📋 ${categories.length} categories\n`);

  for (const category of categories) {
    const categoryAgents = byCategory[category];
    console.log(`📁 ${category.toUpperCase()} (${categoryAgents.length} agents)`);

    for (const agent of categoryAgents.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`  • ${agent.name}`);

      // Extract keywords from description
      if (agent.description) {
        const keywords = agent.description.match(/Keywords?[\:\s\-]+([^\n]+)/i);
        if (keywords) {
          console.log(`    ${keywords[1].trim()}`);
        }
      }
    }
    console.log('');
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
