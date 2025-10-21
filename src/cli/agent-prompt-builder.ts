/**
 * Agent Prompt Builder
 *
 * Builds comprehensive prompts for CLI-spawned agents by combining:
 * - Agent definition (YAML + markdown)
 * - Task context (taskId, iteration, mode)
 * - CFN Loop protocol (if applicable)
 * - Iteration history (Sprint 3 - Phase 2)
 * - Environment variables
 */

import { AgentDefinition, hasCFNLoopProtocol } from './agent-definition-parser.js';
import { loadIterationHistory, formatIterationHistory } from './iteration-history.js';

export interface TaskContext {
  taskId?: string;
  iteration?: number;
  context?: string;
  mode?: string;
  priority?: number;
  parentTaskId?: string;
  agentId?: string;
}

/**
 * Build CFN Loop protocol instructions
 */
function buildCFNLoopProtocol(taskId: string, agentId: string): string {
  return `
## CFN Loop Redis Completion Protocol

You are participating in a CFN Loop workflow. Follow this protocol EXACTLY:

### Step 1: Complete Work
Execute your assigned task (implementation, review, testing, etc.)

### Step 2: Signal Completion
\`\`\`bash
redis-cli lpush "swarm:${taskId}:\${AGENT_ID}:done" "complete"
\`\`\`

### Step 3: Report Confidence Score
\`\`\`bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \\
  --task-id "${taskId}" \\
  --agent-id "\${AGENT_ID}" \\
  --confidence [0.0-1.0] \\
  --iteration ${taskId.includes('iteration') ? 'CURRENT_ITERATION' : '1'}
\`\`\`

### Step 4: Enter Waiting Mode (for potential iteration)
\`\`\`bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter \\
  --task-id "${taskId}" \\
  --agent-id "\${AGENT_ID}" \\
  --context "iteration-complete"
\`\`\`

**Critical Context Variables:**
- TASK_ID: ${taskId}
- AGENT_ID: ${agentId} (your unique identifier)
- Confidence: Your self-assessment score (0.0-1.0)

**Why This Matters:**
- Zero-token blocking coordination (BLPOP waits without API calls)
- Orchestrator collects confidence/consensus scores automatically
- Supports autonomous iteration based on quality gates
- Agent woken instantly (<100ms) if iteration needed

**IMPORTANT:** You MUST complete all 4 steps in order. The orchestrator is waiting for your completion signal.
`;
}

/**
 * Build task description from context
 */
function buildTaskDescription(agentType: string, context: TaskContext): string {
  let desc = '';

  if (context.context) {
    desc = context.context;
  } else {
    desc = `Execute task as ${agentType} agent`;
  }

  if (context.taskId) {
    desc += `\n\n**Task ID:** ${context.taskId}`;
  }

  if (context.iteration) {
    desc += `\n**Iteration:** ${context.iteration}`;
  }

  if (context.mode) {
    desc += `\n**Mode:** ${context.mode}`;
  }

  if (context.priority) {
    desc += `\n**Priority:** ${context.priority}`;
  }

  if (context.parentTaskId) {
    desc += `\n**Parent Task:** ${context.parentTaskId}`;
  }

  return desc;
}

/**
 * Build environment context section
 */
function buildEnvironmentContext(context: TaskContext): string {
  const env: string[] = [];

  if (context.taskId) env.push(`TASK_ID=${context.taskId}`);
  if (context.iteration) env.push(`ITERATION=${context.iteration}`);
  if (context.mode) env.push(`MODE=${context.mode}`);
  if (context.priority) env.push(`PRIORITY=${context.priority}`);
  if (context.parentTaskId) env.push(`PARENT_TASK_ID=${context.parentTaskId}`);

  if (env.length === 0) return '';

  return `
## Environment Variables

\`\`\`bash
${env.join('\n')}
\`\`\`
`;
}

/**
 * Build complete prompt for agent execution (async for iteration history)
 */
export async function buildAgentPrompt(
  definition: AgentDefinition,
  context: TaskContext
): Promise<string> {
  const agentId = `${definition.name}-${context.iteration || 1}`;

  const sections: string[] = [];

  // 1. Agent definition header
  sections.push(`# Agent: ${definition.name}`);
  sections.push('');
  sections.push(definition.description);
  sections.push('');

  // 2. Task description
  sections.push('## Task');
  sections.push('');
  sections.push(buildTaskDescription(definition.name, context));
  sections.push('');

  // 3. Iteration history (Sprint 3 - Phase 2)
  // Load and format previous iterations if iteration > 1
  if (context.taskId && context.iteration && context.iteration > 1) {
    try {
      const history = await loadIterationHistory(context.taskId, agentId, context.iteration);
      const historyText = formatIterationHistory(history, context.iteration);
      sections.push(historyText);
      sections.push('');
    } catch (err) {
      console.warn(`[agent-prompt-builder] Failed to load iteration history:`, err);
      // Continue without history
    }
  }

  // 4. Agent definition content (from markdown file)
  sections.push('## Agent Definition');
  sections.push('');
  sections.push(definition.content);
  sections.push('');

  // 5. CFN Loop protocol (if agent supports it AND task context includes taskId)
  if (context.taskId && hasCFNLoopProtocol(definition)) {
    sections.push(buildCFNLoopProtocol(context.taskId, agentId));
    sections.push('');
  }

  // 6. Environment context
  const envContext = buildEnvironmentContext(context);
  if (envContext) {
    sections.push(envContext);
    sections.push('');
  }

  // 7. Execution instructions
  sections.push('## Execution Instructions');
  sections.push('');
  sections.push('1. Read and understand the task requirements');
  if (context.iteration && context.iteration > 1) {
    sections.push('2. Review iteration history and feedback from validators');
    sections.push('3. Address specific feedback points from previous iteration');
    sections.push('4. Execute your core responsibilities as defined above');
  } else {
    sections.push('2. Execute your core responsibilities as defined above');
    sections.push('3. Follow any protocol steps (CFN Loop, validation hooks, etc.)');
  }
  sections.push('4. Provide clear, concise output');
  sections.push('5. Report confidence score if applicable');
  sections.push('');

  // 8. Tool reminder
  if (definition.tools && definition.tools.length > 0) {
    sections.push('## Available Tools');
    sections.push('');
    sections.push(`You have access to: ${definition.tools.join(', ')}`);
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Extract agent ID from context
 * If agentId is explicitly provided in context, use it; otherwise generate from name + iteration
 */
export function getAgentId(definition: AgentDefinition, context: TaskContext): string {
  if (context.agentId) {
    return context.agentId;
  }
  return `${definition.name}-${context.iteration || 1}`;
}

/**
 * Build system prompt for agent (optional, for structured agent behavior)
 */
export function buildSystemPrompt(definition: AgentDefinition): string {
  return `You are ${definition.name}, a specialized AI agent.

Type: ${definition.type || 'specialist'}
Model: ${definition.model}
Tools: ${definition.tools.join(', ')}

Follow your agent definition exactly and complete assigned tasks with high quality.`;
}
