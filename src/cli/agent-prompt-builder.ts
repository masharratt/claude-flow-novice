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

### Step 1: Complete Your Work
Execute your assigned task (implementation, review, testing, etc.)

### Step 2: Calculate Confidence Score
Assess your work quality and assign a confidence score (0.0-1.0):
- 0.90-1.0: Excellent, production-ready
- 0.75-0.89: Good, minor issues possible
- 0.50-0.74: Acceptable, needs review
- 0.0-0.49: Poor, significant issues

### Step 3: Report Completion to Redis
\`\`\`bash
./.claude/skills/cfn-redis-coordination/report-completion.sh \\
  --task-id "${taskId}" \\
  --agent-id "${agentId}" \\
  --confidence [YOUR_CONFIDENCE_SCORE] \\
  --iteration \${ITERATION:-1}
\`\`\`

This script automatically:
- Signals completion via \`swarm:${taskId}:${agentId}:done\`
- Stores confidence in \`swarm:${taskId}:${agentId}:confidence\`
- Creates result hash in \`swarm:${taskId}:${agentId}:result\`
- Updates SQLite persistence layer

### Step 4: Exit Cleanly
After reporting, exit immediately. DO NOT enter waiting mode.

The orchestrator will:
- Collect confidence scores from all agents
- Run gate check (≥0.75 threshold)
- Spawn validators if gate passes
- Spawn fresh agents for iteration N+1 if needed

**Environment Variables Available:**
- TASK_ID: ${taskId}
- AGENT_ID: ${agentId}
- ITERATION: Current iteration number (default: 1)
- CONFIDENCE_SCORE: Your final confidence assessment

**Why This Matters:**
- Enables zero-token coordination (orchestrator uses Redis BLPOP)
- Supports adaptive agent specialization (spawn different specialist for iteration N+1)
- Prevents memory leaks (agents exit after reporting)
- Confidence scores drive gate checks and consensus validation

**CRITICAL:** Report completion before exiting. Orchestrator is waiting for your signal.
`;
}

/**
 * Parse and enrich JSON context into natural language instructions
 */
function enrichJSONContext(jsonObj: any): string {
  const sections: string[] = [];

  // Extract task description
  if (jsonObj.task) {
    sections.push(`**Task:** ${jsonObj.task}`);
  }

  // Parse files - convert comma-separated string to bullet list
  if (jsonObj.files) {
    const fileList = typeof jsonObj.files === 'string'
      ? jsonObj.files.split(',').map(f => f.trim()).filter(f => f)
      : Array.isArray(jsonObj.files) ? jsonObj.files : [];

    if (fileList.length > 0) {
      sections.push('\n**Files to process:**');
      fileList.forEach(file => sections.push(`- ${file}`));
    }
  }

  // Add requirements/deliverables
  if (jsonObj.requirements) {
    const reqs = Array.isArray(jsonObj.requirements) ? jsonObj.requirements : [jsonObj.requirements];
    sections.push('\n**Requirements:**');
    reqs.forEach((req, i) => sections.push(`${i + 1}. ${req}`));
  }

  if (jsonObj.deliverables) {
    const delivs = Array.isArray(jsonObj.deliverables) ? jsonObj.deliverables : [jsonObj.deliverables];
    sections.push('\n**Deliverables:**');
    delivs.forEach(deliv => sections.push(`- ${deliv}`));
  }

  // Add batch information
  if (jsonObj.batch) {
    sections.push(`\n**Batch:** ${jsonObj.batch}`);
  }

  // Add directory context
  if (jsonObj.directory) {
    sections.push(`\n**Working Directory:** ${jsonObj.directory}`);
  }

  // Add acceptance criteria
  if (jsonObj.acceptanceCriteria) {
    const criteria = Array.isArray(jsonObj.acceptanceCriteria)
      ? jsonObj.acceptanceCriteria
      : [jsonObj.acceptanceCriteria];
    sections.push('\n**Acceptance Criteria:**');
    criteria.forEach(criterion => sections.push(`- ${criterion}`));
  }

  // Add explicit instructions if present
  if (jsonObj.instructions) {
    sections.push('\n**Instructions:**');
    const instrs = Array.isArray(jsonObj.instructions) ? jsonObj.instructions : [jsonObj.instructions];
    instrs.forEach((instr, i) => sections.push(`${i + 1}. ${instr}`));
  }

  return sections.join('\n');
}

/**
 * Build task description from context
 */
function buildTaskDescription(agentType: string, context: TaskContext): string {
  let desc = '';

  if (context.context) {
    // Try to parse as JSON first
    let contextStr = context.context.trim();

    // Check if context looks like JSON
    if ((contextStr.startsWith('{') && contextStr.endsWith('}')) ||
        (contextStr.startsWith('[') && contextStr.endsWith(']'))) {
      try {
        const jsonObj = JSON.parse(contextStr);
        desc = enrichJSONContext(jsonObj);

        // Add instruction footer for structured tasks
        if (jsonObj.files || jsonObj.deliverables) {
          desc += '\n\n**Process each item systematically and report confidence when complete.**';
        }
      } catch (e) {
        // Not valid JSON, treat as plain text
        desc = context.context;
      }
    } else {
      // Plain text context
      desc = context.context;
    }
  } else {
    desc = `Execute task as ${agentType} agent`;
  }

  // Add metadata fields
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
  // Use explicit agent ID if provided, otherwise generate from name + iteration
  const agentId = context.agentId || `${definition.name}-${context.iteration || 1}`;

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

  // 5. CFN Loop protocol (ALWAYS inject when taskId present - enables Redis coordination)
  if (context.taskId && agentId) {
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

  // 7a. Pre-edit backup requirement (MANDATORY)
  sections.push('## Pre-Edit Backup Protocol (MANDATORY)');
  sections.push('');
  sections.push('**BEFORE ANY Edit/Write/MultiEdit operation, you MUST create a backup:**');
  sections.push('');
  sections.push('```bash');
  sections.push(`BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "$FILE_TO_EDIT" --agent-id "${agentId}")`);
  sections.push('```');
  sections.push('');
  sections.push('**Why:** Enables safe file revert without git operations during parallel sessions.');
  sections.push('**Location:** `.backups/[agent-id]/[timestamp]_[hash]/`');
  sections.push('**Retention:** 24h TTL (configurable)');
  sections.push('');
  sections.push('**Complete Edit Workflow:**');
  sections.push('```bash');
  sections.push('# 1. Pre-Edit: Create backup');
  sections.push(`BACKUP_PATH=$(./.claude/hooks/cfn-invoke-pre-edit.sh "src/file.ts" --agent-id "${agentId}")`);
  sections.push('');
  sections.push('# 2. Edit: Perform file modification');
  sections.push('Edit: file_path="src/file.ts" old_string="..." new_string="..."');
  sections.push('');
  sections.push('# 3. Post-Edit: Validate changes');
  sections.push(`./.claude/hooks/cfn-invoke-post-edit.sh "src/file.ts" --agent-id "${agentId}"`);
  sections.push('```');
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
