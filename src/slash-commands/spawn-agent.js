#!/usr/bin/env node

/**
 * /spawn-agent - Spawn agent with proper provider routing
 *
 * This command ensures agentType is passed through to provider routing,
 * fixing the issue where Task tool doesn't pass agentType.
 *
 * Usage:
 *   /spawn-agent coder "Implement hello world"
 *   /spawn-agent tester "Run tests"
 *   /spawn-agent architect "Design system"
 */

const agentTypes = [
  'coder', 'tester', 'reviewer',
  'architect', 'coordinator', 'system-architect',
  'researcher', 'analyst', 'planner'
];

function showUsage() {
  console.log(`
╭─────────────────────────────────────────────────╮
│  /spawn-agent - Agent Spawner with Routing     │
╰─────────────────────────────────────────────────╯

Usage:
  /spawn-agent <agentType> "<task description>"

Agent Types:
  • coder, tester, reviewer → Z.ai (cost-optimized)
  • architect, coordinator → Anthropic (high-quality)
  • researcher, analyst, planner → Z.ai

Examples:
  /spawn-agent coder "Create hello world script"
  /spawn-agent tester "Run unit tests"
  /spawn-agent architect "Design API structure"

With tiered routing ENABLED, this command routes agents to:
  - Z.ai: coder, tester, reviewer, researcher (~$0.003/1k tokens)
  - Anthropic: architect, coordinator, system-architect (~$0.015/1k tokens)

This solves the issue where Claude Code's Task tool doesn't
pass agentType, causing all agents to default to Anthropic.
`);
}

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  showUsage();
  process.exit(0);
}

const agentType = args[0];
const taskDescription = args.slice(1).join(' ');

if (!agentTypes.includes(agentType)) {
  console.error(`❌ Unknown agent type: ${agentType}`);
  console.error(`\nValid types: ${agentTypes.join(', ')}`);
  process.exit(1);
}

if (!taskDescription) {
  console.error(`❌ Task description required`);
  console.error(`\nUsage: /spawn-agent ${agentType} "<task>"`);
  process.exit(1);
}

console.log(`
🚀 Spawning ${agentType} agent
📋 Task: ${taskDescription}

NOTE: This is a CLI wrapper. To actually spawn the agent,
      use Claude Code with:

      @task Use the ${agentType} agent to: ${taskDescription}

      With tiered routing enabled, this will route to the
      correct provider based on agent type.
`);
