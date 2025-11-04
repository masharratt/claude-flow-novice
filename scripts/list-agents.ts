#!/usr/bin/env tsx
/**
 * List all agents discovered from .claude/agents/ directory
 */

import { getAllAgents, getAgentCategories } from '../src/agents/agent-loader.js';

function main() {
  const agents = getAllAgents();
  const categories = getAgentCategories();

  console.log(`\n📋 Discovered ${agents.length} agents in ${categories.length} categories:\n`);

  // Group by category
  const byCategory = new Map<string, typeof agents>();

  for (const agent of agents) {
    const category = agent.type || 'uncategorized';
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push(agent);
  }

  // Sort and display
  Array.from(byCategory.keys()).sort().forEach(category => {
    const categoryAgents = byCategory.get(category)!;
    console.log(`\n📁 ${category.toUpperCase()} (${categoryAgents.length} agents)`);
    categoryAgents.sort((a, b) => a.name.localeCompare(b.name)).forEach(agent => {
      console.log(`  • ${agent.name}`);
    });
  });

  console.log(`\n✅ Total: ${agents.length} agents\n`);
}

main();
