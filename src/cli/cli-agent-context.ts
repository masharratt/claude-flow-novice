/**
 * CLI Agent Context Builder
 *
 * Builds natural language system prompts for CLI-spawned agents.
 * Converts JSON context from Redis into readable markdown format.
 *
 * Phase 1: System Prompts Enhancement (Sprint 2)
 * - Load CLAUDE.md (project rules)
 * - Load agent markdown template
 * - Format epic/phase/success criteria as natural language
 * - Build comprehensive system prompt for API execution
 */

import fs from 'fs/promises';
import path from 'path';

export interface EpicContext {
  epicGoal?: string;
  inScope?: string[];
  outOfScope?: string[];
  phases?: string[];
  riskProfile?: string;
  stakeholders?: string[];
  timeline?: {
    start?: string;
    end?: string;
    milestones?: Array<{ phase: string; date: string }>;
  };
}

export interface PhaseContext {
  currentPhase?: string;
  phaseNumber?: number;
  dependencies?: string[];
  deliverables?: string[];
  blockers?: string[];
  resources?: {
    agentCount?: number;
    estimatedDuration?: number;
    costBudget?: number;
  };
}

export interface SuccessCriteria {
  acceptanceCriteria?: string[];
  gateThreshold?: number;
  consensusThreshold?: number;
  qualityGates?: {
    testCoverage?: number;
    securityScore?: number;
    performanceBudget?: number;
  };
  definitionOfDone?: string[];
  nonFunctionalRequirements?: string[];
}

export interface ContextBuilderOptions {
  agentType: string;
  taskId?: string;
  iteration?: number;
  epicContext?: string; // JSON string
  phaseContext?: string; // JSON string
  successCriteria?: string; // JSON string
}

/**
 * Load CLAUDE.md project rules
 */
async function loadProjectRules(): Promise<string> {
  try {
    // Try current working directory
    const cwdPath = path.join(process.cwd(), 'CLAUDE.md');
    const content = await fs.readFile(cwdPath, 'utf-8');
    return content;
  } catch (error) {
    console.warn('[cli-agent-context] Could not load CLAUDE.md:', error);
    return '';
  }
}

/**
 * Load agent markdown template
 */
async function loadAgentTemplate(agentType: string): Promise<string> {
  try {
    // Search in .claude/agents/ subdirectories
    const searchPaths = [
      path.join(process.cwd(), '.claude', 'agents', 'coordinators', `${agentType}.md`),
      path.join(process.cwd(), '.claude', 'agents', 'core-agents', `${agentType}.md`),
      path.join(process.cwd(), '.claude', 'agents', 'developers', `${agentType}.md`),
      path.join(process.cwd(), '.claude', 'agents', 'specialists', `${agentType}.md`),
      path.join(process.cwd(), '.claude', 'agents', 'testers', `${agentType}.md`),
      path.join(process.cwd(), '.claude', 'agents', 'planners', `${agentType}.md`),
      path.join(process.cwd(), '.claude', 'agents', 'frontend', `${agentType}.md`),
      path.join(process.cwd(), '.claude', 'agents', 'security', `${agentType}.md`),
      path.join(process.cwd(), '.claude', 'agents', 'custom', `${agentType}.md`),
      path.join(process.cwd(), '.claude', 'agents', `${agentType}.md`),
    ];

    for (const searchPath of searchPaths) {
      try {
        const content = await fs.readFile(searchPath, 'utf-8');
        return content;
      } catch {
        // Continue to next path
      }
    }

    console.warn(`[cli-agent-context] Could not find agent template: ${agentType}.md`);
    return '';
  } catch (error) {
    console.warn('[cli-agent-context] Error loading agent template:', error);
    return '';
  }
}

/**
 * Parse JSON string safely
 */
function parseJSON<T>(jsonString: string | undefined, fallback: T): T {
  if (!jsonString || jsonString.trim() === '' || jsonString === '(nil)') {
    return fallback;
  }

  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.warn('[cli-agent-context] Failed to parse JSON:', error);
    return fallback;
  }
}

/**
 * Format epic context as natural language
 */
function formatEpicContext(epic: EpicContext): string {
  if (!epic.epicGoal && !epic.inScope && !epic.outOfScope) {
    return '';
  }

  const sections: string[] = [];

  sections.push('## Epic Context');
  sections.push('');

  if (epic.epicGoal) {
    sections.push('**Epic Goal:**');
    sections.push(epic.epicGoal);
    sections.push('');
  }

  if (epic.riskProfile) {
    sections.push(`**Risk Profile:** ${epic.riskProfile}`);
    sections.push('');
  }

  if (epic.inScope && epic.inScope.length > 0) {
    sections.push('**In Scope:**');
    for (const item of epic.inScope) {
      sections.push(`- ${item}`);
    }
    sections.push('');
  }

  if (epic.outOfScope && epic.outOfScope.length > 0) {
    sections.push('**Out of Scope:**');
    for (const item of epic.outOfScope) {
      sections.push(`- ${item}`);
    }
    sections.push('');
  }

  if (epic.phases && epic.phases.length > 0) {
    sections.push('**Phases:**');
    for (let i = 0; i < epic.phases.length; i++) {
      sections.push(`${i + 1}. ${epic.phases[i]}`);
    }
    sections.push('');
  }

  if (epic.stakeholders && epic.stakeholders.length > 0) {
    sections.push(`**Stakeholders:** ${epic.stakeholders.join(', ')}`);
    sections.push('');
  }

  if (epic.timeline) {
    sections.push('**Timeline:**');
    if (epic.timeline.start) sections.push(`- Start: ${epic.timeline.start}`);
    if (epic.timeline.end) sections.push(`- End: ${epic.timeline.end}`);
    if (epic.timeline.milestones && epic.timeline.milestones.length > 0) {
      sections.push('- Milestones:');
      for (const milestone of epic.timeline.milestones) {
        sections.push(`  - ${milestone.phase}: ${milestone.date}`);
      }
    }
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Format phase context as natural language
 */
function formatPhaseContext(phase: PhaseContext): string {
  if (!phase.currentPhase && !phase.deliverables) {
    return '';
  }

  const sections: string[] = [];

  sections.push('## Current Phase');
  sections.push('');

  if (phase.currentPhase) {
    sections.push(`**Phase:** ${phase.currentPhase}`);
    if (phase.phaseNumber) {
      sections.push(`**Phase Number:** ${phase.phaseNumber}`);
    }
    sections.push('');
  }

  if (phase.dependencies && phase.dependencies.length > 0) {
    sections.push('**Dependencies:**');
    for (const dep of phase.dependencies) {
      sections.push(`- ${dep}`);
    }
    sections.push('');
  }

  if (phase.deliverables && phase.deliverables.length > 0) {
    sections.push('**Deliverables:**');
    for (const deliverable of phase.deliverables) {
      sections.push(`- ${deliverable}`);
    }
    sections.push('');
  }

  if (phase.blockers && phase.blockers.length > 0) {
    sections.push('**Current Blockers:**');
    for (const blocker of phase.blockers) {
      sections.push(`- ${blocker}`);
    }
    sections.push('');
  }

  if (phase.resources) {
    sections.push('**Resources:**');
    if (phase.resources.agentCount) sections.push(`- Agents: ${phase.resources.agentCount}`);
    if (phase.resources.estimatedDuration) sections.push(`- Duration: ${phase.resources.estimatedDuration} hours`);
    if (phase.resources.costBudget) sections.push(`- Budget: $${phase.resources.costBudget.toFixed(2)}`);
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Format success criteria as natural language
 */
function formatSuccessCriteria(criteria: SuccessCriteria): string {
  // Check if any criteria fields are present
  if (
    !criteria.acceptanceCriteria &&
    !criteria.gateThreshold &&
    !criteria.consensusThreshold &&
    !criteria.qualityGates &&
    !criteria.definitionOfDone &&
    !criteria.nonFunctionalRequirements
  ) {
    return '';
  }

  const sections: string[] = [];

  sections.push('## Success Criteria');
  sections.push('');

  if (criteria.acceptanceCriteria && criteria.acceptanceCriteria.length > 0) {
    sections.push('**Acceptance Criteria:**');
    for (const criterion of criteria.acceptanceCriteria) {
      sections.push(`- ${criterion}`);
    }
    sections.push('');
  }

  if (criteria.gateThreshold || criteria.consensusThreshold) {
    sections.push('**Quality Gates:**');
    if (criteria.gateThreshold) {
      sections.push(`- Gate Threshold (Loop 3): ${(criteria.gateThreshold * 100).toFixed(0)}%`);
    }
    if (criteria.consensusThreshold) {
      sections.push(`- Consensus Threshold (Loop 2): ${(criteria.consensusThreshold * 100).toFixed(0)}%`);
    }
    sections.push('');
  }

  if (criteria.qualityGates) {
    sections.push('**Quality Metrics:**');
    if (criteria.qualityGates.testCoverage) {
      sections.push(`- Test Coverage: ${criteria.qualityGates.testCoverage}%`);
    }
    if (criteria.qualityGates.securityScore) {
      sections.push(`- Security Score: ${(criteria.qualityGates.securityScore * 100).toFixed(0)}%`);
    }
    if (criteria.qualityGates.performanceBudget) {
      sections.push(`- Performance Budget: ${criteria.qualityGates.performanceBudget}ms`);
    }
    sections.push('');
  }

  if (criteria.definitionOfDone && criteria.definitionOfDone.length > 0) {
    sections.push('**Definition of Done:**');
    for (const item of criteria.definitionOfDone) {
      sections.push(`- [ ] ${item}`);
    }
    sections.push('');
  }

  if (criteria.nonFunctionalRequirements && criteria.nonFunctionalRequirements.length > 0) {
    sections.push('**Non-Functional Requirements:**');
    for (const req of criteria.nonFunctionalRequirements) {
      sections.push(`- ${req}`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Format iteration context
 */
function formatIterationContext(iteration?: number, taskId?: string): string {
  if (!iteration || iteration === 1) {
    return '';
  }

  return `
## Current Iteration

This is **iteration ${iteration}** of your task.

**Previous Iterations:**
You have completed ${iteration - 1} iteration${iteration > 2 ? 's' : ''} before this one.

**Your Goal:**
Address feedback from previous iterations and improve the quality of your work.

**Feedback Access:**
Check Redis for iteration feedback:
\`\`\`bash
redis-cli get "swarm:${taskId}:\${AGENT_ID}:feedback:iteration-${iteration}"
\`\`\`

`;
}

/**
 * Build comprehensive system prompt for CLI agent
 *
 * Combines:
 * - Project rules (CLAUDE.md)
 * - Agent markdown template
 * - Epic context (formatted)
 * - Phase context (formatted)
 * - Success criteria (formatted)
 * - Iteration context
 */
export async function buildCLIAgentSystemPrompt(options: ContextBuilderOptions): Promise<string> {
  console.log('[cli-agent-context] Building system prompt...');

  const sections: string[] = [];

  // 1. Load and include CLAUDE.md
  console.log('[cli-agent-context]   Loading CLAUDE.md...');
  const projectRules = await loadProjectRules();
  if (projectRules) {
    sections.push('# Project Rules (CLAUDE.md)');
    sections.push('');
    sections.push(projectRules);
    sections.push('');
    sections.push('---');
    sections.push('');
  }

  // 2. Load and include agent markdown template
  console.log(`[cli-agent-context]   Loading agent template: ${options.agentType}`);
  const agentTemplate = await loadAgentTemplate(options.agentType);
  if (agentTemplate) {
    sections.push(`# Agent Definition: ${options.agentType}`);
    sections.push('');
    sections.push(agentTemplate);
    sections.push('');
    sections.push('---');
    sections.push('');
  }

  // 3. Parse and format epic context
  const epicContext = parseJSON<EpicContext>(options.epicContext, {});
  const formattedEpic = formatEpicContext(epicContext);
  if (formattedEpic) {
    sections.push(formattedEpic);
    sections.push('---');
    sections.push('');
  }

  // 4. Parse and format phase context
  const phaseContext = parseJSON<PhaseContext>(options.phaseContext, {});
  const formattedPhase = formatPhaseContext(phaseContext);
  if (formattedPhase) {
    sections.push(formattedPhase);
    sections.push('---');
    sections.push('');
  }

  // 5. Parse and format success criteria
  const successCriteria = parseJSON<SuccessCriteria>(options.successCriteria, {});
  const formattedCriteria = formatSuccessCriteria(successCriteria);
  if (formattedCriteria) {
    sections.push(formattedCriteria);
    sections.push('---');
    sections.push('');
  }

  // 6. Format iteration context
  const iterationContext = formatIterationContext(options.iteration, options.taskId);
  if (iterationContext) {
    sections.push(iterationContext);
    sections.push('---');
    sections.push('');
  }

  // 7. Add execution reminder
  sections.push('## Execution Instructions');
  sections.push('');
  sections.push('You are executing as a CLI-spawned agent with full project context.');
  sections.push('Follow the agent definition, project rules, and success criteria exactly.');
  sections.push('');
  sections.push('**Remember:**');
  sections.push('- Respect scope boundaries (in-scope vs out-of-scope)');
  sections.push('- Meet acceptance criteria and quality gates');
  sections.push('- Follow CFN Loop protocol if task-id is provided');
  sections.push('- Report confidence score when complete');
  sections.push('');

  const fullPrompt = sections.join('\n');

  console.log(`[cli-agent-context] System prompt built: ${fullPrompt.length} characters`);
  console.log(`[cli-agent-context]   - Project rules: ${projectRules ? 'included' : 'not found'}`);
  console.log(`[cli-agent-context]   - Agent template: ${agentTemplate ? 'included' : 'not found'}`);
  console.log(`[cli-agent-context]   - Epic context: ${formattedEpic ? 'formatted' : 'none'}`);
  console.log(`[cli-agent-context]   - Phase context: ${formattedPhase ? 'formatted' : 'none'}`);
  console.log(`[cli-agent-context]   - Success criteria: ${formattedCriteria ? 'formatted' : 'none'}`);

  return fullPrompt;
}

/**
 * Helper: Load context from environment variables
 *
 * Used by agent executor to load context from env vars set by cfn-spawn
 */
export function loadContextFromEnv(): ContextBuilderOptions {
  return {
    agentType: process.env.AGENT_TYPE || 'unknown',
    taskId: process.env.TASK_ID,
    iteration: process.env.ITERATION ? parseInt(process.env.ITERATION, 10) : 1,
    epicContext: process.env.EPIC_CONTEXT,
    phaseContext: process.env.PHASE_CONTEXT,
    successCriteria: process.env.SUCCESS_CRITERIA,
  };
}
