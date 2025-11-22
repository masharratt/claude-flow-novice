/**
 * Agent Prompt Builder
 *
 * Builds comprehensive prompts for CLI-spawned agents by combining:
 * - Agent definition (YAML + markdown)
 * - Task context (taskId, iteration, mode)
 * - CFN Loop protocol (if applicable)
 * - Iteration history (Sprint 3 - Phase 2)
 * - Environment variables
 * - Skills (Phase 5 - Skills Database integration)
 */

import { AgentDefinition, hasCFNLoopProtocol } from './agent-definition-parser.js';
import { loadIterationHistory, formatIterationHistory } from './iteration-history.js';
import { SkillLoader, Skill } from './skill-loader.js';

export interface TaskContext {
  taskId?: string;
  iteration?: number;
  context?: string;
  mode?: string;
  priority?: number;
  parentTaskId?: string;
  agentId?: string;
  keywords?: string; // Phase 5: For skill filtering
  phase?: string;    // Phase 5: CFN Loop phase (loop1, loop2, loop3)
}

/**
 * Build CFN Loop Redis Completion Protocol for CLI Mode
 */
function buildCFNLoopProtocol(taskId: string, agentId: string): string {
  return `
## CLI Mode Redis Completion Protocol

You are running in CLI Mode with Main Chat coordination. Follow this protocol EXACTLY:

### Step 1: Complete Your Work
Execute your assigned task (implementation, review, testing, etc.)

### Step 2: Signal Completion to Main Chat
Send a Redis signal to notify Main Chat that you're finished:

\`\`\`bash
# Use Node.js for Redis communication
node -e "
const { createClient } = require('redis');
const signal = {
  agentId: '${agentId}',
  taskId: '${taskId}',
  status: 'completed',
  timestamp: new Date().toISOString(),
  provider: process.env.PROVIDER || 'unknown',
  model: process.env.MODEL || 'unknown',
  confidence: 0.90, // Replace with your actual confidence
  metadata: {
    iteration: process.env.ITERATION || 1,
    mode: process.env.MODE || 'standard'
  }
};

(async () => {
  const client = createClient({ url: 'redis://localhost:6379' });
  await client.connect();

  const signalKey = \`cfn:mainchat:signal:\${process.env.TASK_ID}\`;
  await client.lPush(signalKey, JSON.stringify(signal));

  console.log(\`✅ Completion signal sent to Main Chat via Redis\`);
  await client.disconnect();
})();
"
\`\`\`

### Step 3: Exit Cleanly
After sending the signal, exit immediately. Main Chat is waiting for your Redis signal.

**Why This Protocol:**
- Main Chat uses Redis BLPOP to wait for your completion signal
- Enables simple 2-layer coordination (Main Chat → CLI agents)
- No complex orchestrator needed for CLI mode
- Supports different AI providers via environment variables

**Environment Variables Available:**
- TASK_ID: ${taskId}
- AGENT_ID: ${agentId}
- PROVIDER: AI provider (zai, kimi, anthropic, etc.)
- MODEL: Specific model being used
- ITERATION: Current iteration number
- MODE: Execution mode (mvp, standard, enterprise)

**Main Chat Workflow:**
1. Spawns you via CLI with specific provider/model
2. Waits via \`redis-cli BLPOP cfn:mainchat:signal:${taskId}\`
3. Processes your completion signal when received
4. Continues with next task or spawns additional agents

**CRITICAL:** Send Redis signal before exiting. Main Chat cannot proceed without your completion signal.
`;
}

/**
 * Parse shell variable format into JSON object
 * Example: "WORKSPACE='/tmp/test' MODE='standard'" -> {WORKSPACE: '/tmp/test', MODE: 'standard'}
 */
function parseShellVariables(shellContext: string): any {
  const jsonObj: any = {};
  const regex = /([A-Z_]+)='([^']*)'/g;
  let match;
  while ((match = regex.exec(shellContext)) !== null) {
    jsonObj[match[1]] = match[2];
  }
  return jsonObj;
}

/**
 * Parse and enrich JSON context into natural language instructions
 */
function enrichJSONContext(jsonObj: any): string {
  const sections: string[] = [];

  // Extract task description (support both 'task' and 'taskDescription' keys)
  const taskText = jsonObj.task || jsonObj.taskDescription;
  if (taskText) {
    sections.push(`**Task:** ${taskText}`);
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

  // Add directory context - support 'directory', 'WORKSPACE', and 'workspace' keys
  const workspacePath = jsonObj.directory || jsonObj.WORKSPACE || jsonObj.workspace;
  if (workspacePath) {
    sections.push(`\n**Working Directory:** ${workspacePath}`);
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
    // Try to parse context in multiple formats
    let contextStr = context.context.trim();

    // Parse shell variables BEFORE attempting JSON parse
    if (contextStr.includes('=') && !contextStr.startsWith('{')) {
      const jsonObj = parseShellVariables(contextStr);
      desc = enrichJSONContext(jsonObj);

      // Add instruction footer for structured tasks
      if (jsonObj.files || jsonObj.deliverables) {
        desc += '\n\n**Process each item systematically and report confidence when complete.**';
      }
    }
    // Check if context looks like JSON
    else if ((contextStr.startsWith('{') && contextStr.endsWith('}')) ||
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

  // Docker workspace detection
  const isDockerEnv = process.env.DOCKER_AGENT === 'true' || process.env.WORKSPACE_ROOT;
  const workspaceRoot = process.env.WORKSPACE_ROOT || '/workspace';

  if (isDockerEnv) {
    env.push(`WORKSPACE_ROOT=${workspaceRoot}`);
  }

  // Always include Docker context if detected, even if env array is empty
  if (isDockerEnv && env.length === 0) {
    env.push(`WORKSPACE_ROOT=${workspaceRoot}`);
  }

  if (env.length === 0 && !isDockerEnv) return '';

  let contextText = `
## Environment Variables

\`\`\`bash
${env.join('\n')}
\`\`\`
`;

  // Add Docker workspace notice if detected
  if (isDockerEnv) {
    contextText += `

## Docker Container Environment

**CRITICAL:** You are running inside a Docker container.

- **Working Directory:** \`${workspaceRoot}\`
- **File Paths:** All file operations use \`${workspaceRoot}/\` prefix
- **Example:** To read \`src/file.ts\`, use \`${workspaceRoot}/src/file.ts\`

**DO NOT** use paths from your training data or Main Chat context. Use \`${workspaceRoot}/\` for all file operations.
`;
  }

  return contextText;
}

/**
 * Load skills for agent (Phase 5: Skills Database Integration)
 */
async function loadSkillsForAgent(
  agentType: string,
  context: TaskContext
): Promise<Skill[]> {
  // Feature flag check
  if (process.env.CFN_SKILLS_DATABASE !== 'true') {
    return [];
  }

  try {
    const dbPath = process.env.CFN_SKILLS_DB_PATH || './.claude/skills-database/skills.db';
    const skillLoader = new SkillLoader(dbPath, {
      enableCache: true,
      cacheMaxSize: 100,
      cacheTTL: 60000 // 1 minute
    });

    // Extract keywords from context for filtering
    const keywords = context.keywords || context.context?.toLowerCase() || '';

    const skills = await skillLoader.loadSkillsForAgent(agentType, {
      taskId: context.taskId,
      keywords,
      phase: context.phase,
      mode: context.mode,
      iteration: context.iteration
    });

    skillLoader.close();
    return skills;
  } catch (error) {
    console.warn(`[agent-prompt-builder] Failed to load skills: ${error}`);
    return [];
  }
}

/**
 * Format skills for prompt injection
 */
function formatSkillsForPrompt(skills: Skill[]): string {
  if (skills.length === 0) {
    return '';
  }

  const sections: string[] = [];

  sections.push('## Applicable Skills');
  sections.push('');
  sections.push('The following skills have been loaded based on your agent type and task context:');
  sections.push('');

  for (const skill of skills) {
    const approvalBadge = skill.approvalLevel === 'auto' ? '✓' :
                         skill.approvalLevel === 'escalate' ? '⚠' : '✋';
    sections.push(`### ${skill.name} (v${skill.version}) [${approvalBadge} ${skill.approvalLevel}]`);
    sections.push('');
    if (skill.content) {
      sections.push(skill.content);
    } else {
      sections.push(`*Skill content not available*`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Build complete prompt for agent execution (async for iteration history + skills)
 */
export async function buildAgentPrompt(
  definition: AgentDefinition,
  context: TaskContext
): Promise<string> {
  // Use explicit agent ID if provided, otherwise generate from name + iteration
  const agentId = context.agentId || `${definition.name}-${context.iteration || 1}`;
  const startTime = Date.now();

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

  // 4a. Load and inject skills (Phase 5: Skills Database Integration)
  try {
    const skills = await loadSkillsForAgent(definition.type || definition.name, context);

    if (skills.length > 0) {
      const skillsText = formatSkillsForPrompt(skills);
      sections.push(skillsText);
      sections.push('');

      // Log skill usage for analytics (Phase 5)
      if (process.env.CFN_SKILLS_DATABASE === 'true' && context.taskId) {
        try {
          const dbPath = process.env.CFN_SKILLS_DB_PATH || './.claude/skills-database/skills.db';
          const skillLoader = new SkillLoader(dbPath);

          await skillLoader.logSkillUsage({
            agentId: agentId,
            agentType: definition.type || definition.name,
            skillIds: skills.map(s => s.id).filter(id => id > 0), // Exclude bootstrap skills (negative IDs)
            taskId: context.taskId,
            phase: context.phase,
            loadedAt: new Date(),
            executionTimeMs: Date.now() - startTime
          });

          skillLoader.close();
        } catch (logError) {
          console.warn(`[agent-prompt-builder] Failed to log skill usage: ${logError}`);
        }
      }
    }
  } catch (skillError) {
    console.warn(`[agent-prompt-builder] Skill loading failed: ${skillError}`);
    // Continue without skills
  }

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
