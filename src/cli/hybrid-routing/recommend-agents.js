#!/usr/bin/env node

/**
 * Agent Recommendation CLI
 *
 * Test the intelligent agent selection system
 *
 * Usage:
 *   node recommend-agents.js "Build user authentication system"
 *   node recommend-agents.js "Conduct security audit"
 *   node recommend-agents.js "Design microservices architecture"
 */

import AgentUseCaseRegistry from './agent-use-cases.js';

async function main() {
  const task = process.argv[2];

  if (!task) {
    console.log('Usage: node recommend-agents.js "task description"');
    console.log('');
    console.log('Examples:');
    console.log('  node recommend-agents.js "Build user authentication system"');
    console.log('  node recommend-agents.js "Conduct security audit"');
    console.log('  node recommend-agents.js "Design microservices architecture"');
    console.log('  node recommend-agents.js "Optimize database performance"');
    process.exit(1);
  }

  try {
    console.log('🎯 Loading Agent Use Case Registry...');
    const registry = await AgentUseCaseRegistry.load();

    console.log('🔍 Analyzing task...');
    const recommendations = registry.recommendAgents(task);

    registry.printRecommendations(task, recommendations);

    // Show CLI command for spawning
    if (recommendations.primary.length > 0) {
      const agentList = [...recommendations.primary, ...recommendations.secondary].slice(0, 5);
      console.log('\n🚀 Spawn command:');
      console.log(`node spawn-workers.js "${task}" --agents ${agentList.join(',')}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();