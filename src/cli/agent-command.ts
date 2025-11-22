/**
 * Agent Command Handler
 *
 * Handles `npx claude-flow-novice agent <type> [options]` commands.
 * Orchestrates agent definition parsing, prompt building, and execution.
 */

import { parseAgentDefinition, listAgentDefinitions } from './agent-definition-parser.js';
import { buildAgentPrompt, TaskContext } from './agent-prompt-builder.js';
import { executeAgent } from './agent-executor.js';

export interface AgentCommandOptions {
  taskId?: string;
  iteration?: number;
  context?: string;
  mode?: string;
  priority?: number;
  parentTaskId?: string;
  agentId?: string;
  list?: boolean;
  help?: boolean;
  memoryLimit?: number;
  enableProfiling?: boolean;
  debug?: boolean;
}

/**
 * Display agent command help
 */
export function displayAgentHelp(): void {
  console.log(`
Claude Flow Novice - Agent Spawning

Usage:
  npx claude-flow-novice agent <type> [options]

Arguments:
  <type>                 Agent type (e.g., rust-enterprise-developer, coder, reviewer)

Options:
  --task-id <id>         Task identifier for CFN Loop coordination
  --iteration <n>        Iteration number (default: 1)
  --agent-id <id>        Explicit agent ID (overrides auto-generated ID)
  --context <text>       Task context/description
  --mode <mode>          Execution mode (cli, api, hybrid)
  --priority <n>         Task priority (1-10)
  --parent-task-id <id>  Parent task identifier
  --memory-limit <mb>    Set memory limit in MB (default: 8192)
  --enable-profiling     Enable heap profiling for debugging
  --debug                Enable debug mode with profiling
  --list                 List all available agents
  --help                 Show this help message

Examples:
  # Simple agent spawn
  npx claude-flow-novice agent coder --context "Implement JWT auth"

  # CFN Loop agent with memory limits
  npx claude-flow-novice agent rust-enterprise-developer \\
    --task-id task-123 \\
    --iteration 1 \\
    --mode standard \\
    --memory-limit 4096

  # Debug mode with profiling
  npx claude-flow-novice agent tester \\
    --context "Test authentication system" \\
    --debug \\
    --enable-profiling

  # List available agents
  npx claude-flow-novice agent --list

Memory Management:
  Claude automatically applies memory limits to prevent leaks:
  - Default limit: 8GB (reduced from 16GB)
  - Use --memory-limit to set custom limits
  - Use --debug to enable profiling and monitoring
  - Memory profiles saved to /tmp/claude-memory-profiles/

  For advanced memory management:
  ./scripts/memory-leak-prevention.sh --help

Available Agents:
  Agents are defined in .claude/agents/ directory:
  - core-agents/      Production-ready core agents
  - specialized/      Domain-specific specialists
  - development/      Development-focused agents
  - security/         Security-focused agents
  - custom/           Your custom agents

Documentation:
  See .claude/agents/CLAUDE.md for agent creation guide
`);
}

/**
 * List all available agent definitions
 */
export async function listAgents(): Promise<void> {
  console.log('Searching for agent definitions...\n');

  const agents = await listAgentDefinitions();

  if (agents.length === 0) {
    console.log('No agent definitions found in .claude/agents/');
    console.log('\nTo create agents, see: .claude/agents/CLAUDE.md');
    return;
  }

  console.log(`Found ${agents.length} agent(s):\n`);

  // Group by category
  const grouped: Record<string, string[]> = {};

  for (const agent of agents) {
    const parts = agent.split('/');
    const category = parts.length > 1 ? parts[0] : 'root';
    const name = parts.length > 1 ? parts.slice(1).join('/') : parts[0];

    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push(name);
  }

  // Display grouped agents
  for (const [category, names] of Object.entries(grouped).sort()) {
    console.log(`${category}/`);
    for (const name of names.sort()) {
      console.log(`  - ${name}`);
    }
    console.log('');
  }

  console.log('Usage:');
  console.log('  npx claude-flow-novice agent <name> [options]');
}

/**
 * Execute agent command
 */
export async function agentCommand(
  agentType: string | undefined,
  options: AgentCommandOptions
): Promise<void> {
  // Handle --list flag
  if (options.list) {
    await listAgents();
    return;
  }

  // Handle --help flag
  if (options.help || !agentType) {
    displayAgentHelp();
    return;
  }

  try {
    // Apply memory management options
    if (options.memoryLimit) {
      console.log(`[agent-command] Setting memory limit: ${options.memoryLimit}MB`);
      const currentOptions = process.env.NODE_OPTIONS || '';
      const newOptions = currentOptions.replace(/--max-old-space-size=\d+/, `--max-old-space-size=${options.memoryLimit}`);
      process.env.NODE_OPTIONS = newOptions || `--max-old-space-size=${options.memoryLimit}`;
    }

    if (options.enableProfiling || options.debug) {
      console.log(`[agent-command] Enabling memory profiling`);
      if (!process.env.NODE_OPTIONS.includes('heap-prof')) {
        process.env.NODE_OPTIONS += ' --heap-prof';
      }
      if (!process.env.NODE_OPTIONS.includes('inspect') && options.debug) {
        process.env.NODE_OPTIONS += ' --inspect=0.0.0.0:9229';
      }
    }

    if (options.debug) {
      console.log(`[agent-command] Debug mode enabled`);
      process.env.CLAUDE_DEBUG = 'true';
      process.env.CLAUDE_MEMORY_MONITORING = 'true';
    }

    console.log(`[agent-command] Spawning agent: ${agentType}`);
    console.log(`[agent-command] Memory settings: ${process.env.NODE_OPTIONS}`);
    console.log('');

    // Step 1: Parse agent definition
    console.log('[1/3] Parsing agent definition...');
    const definition = await parseAgentDefinition(agentType);
    console.log(`  ✓ Found: ${definition.name}`);
    console.log(`  ✓ Type: ${definition.type || 'specialist'}`);
    console.log(`  ✓ Model: ${definition.model}`);
    console.log(`  ✓ Tools: ${definition.tools.join(', ')}`);
    console.log('');

    // Step 2: Build agent prompt
    console.log('[2/3] Building agent prompt...');
    const taskContext: TaskContext = {
      taskId: options.taskId,
      iteration: options.iteration,
      agentId: options.agentId,
      context: options.context,
      mode: options.mode,
      priority: options.priority,
      parentTaskId: options.parentTaskId,
    };

    const prompt = await buildAgentPrompt(definition, taskContext);
    console.log(`  ✓ Prompt size: ${prompt.length} characters`);
    console.log(`  ✓ CFN Loop protocol: ${prompt.includes('CLI Mode Redis Completion Protocol') ? 'included' : 'not applicable'}`);
    console.log(`  ✓ Iteration history: ${prompt.includes('## Iteration History') ? 'included' : 'not applicable'}`);
    console.log('');

    // Step 3: Execute agent
    console.log('[3/3] Executing agent...');
    const result = await executeAgent(definition, prompt, taskContext);

    console.log('');
    console.log('=== Execution Result ===');
    console.log(`Agent ID: ${result.agentId}`);
    console.log(`Status: ${result.success ? '✓ Success' : '✗ Failed'}`);
    console.log(`Exit Code: ${result.exitCode}`);

    if (result.error) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    if (result.output) {
      console.log('\nOutput:');
      console.log(result.output);
    }

    process.exit(result.exitCode);
  } catch (error) {
    console.error('\n[agent-command] Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
