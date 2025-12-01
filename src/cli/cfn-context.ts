#!/usr/bin/env node
/**
 * cfn-context - Epic context operations for CLI agents
 *
 * Provides functions to:
 * 1. Load epic/phase context from Redis
 * 2. Store epic/phase context to Redis
 * 3. Format context for agent system prompts
 *
 * Also provides ACE context operations CLI:
 *   cfn-context reflect      Run ACE reflection
 *   cfn-context curate       Merge contexts
 *   cfn-context inject       Inject into tasks
 *   cfn-context query        Search contexts
 *   cfn-context stats        Show analytics
 */

import { spawn } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Bug #6 Fix: Read Redis connection parameters from process.env
// FIX: Default to 'localhost' for CLI mode (host execution), not 'cfn-redis' (Docker)
const redisHost = process.env.CFN_REDIS_HOST || 'localhost';
const redisPort = process.env.CFN_REDIS_PORT || '6379';

// ============================================================================
// Epic Context Interfaces (for CLI Agent System Prompts)
// ============================================================================

export interface EpicContextData {
  epicGoal?: string;
  epicName?: string;
  inScope?: string[];
  outOfScope?: string[];
  phases?: string[];
  currentPhase?: string;
  riskProfile?: string;
  stakeholders?: string[];
  references?: string[];
  timeline?: {
    start?: string;
    end?: string;
    milestones?: Array<{ phase: string; date: string }>;
  };
}

export interface PhaseContextData {
  phaseName?: string;
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

export interface SuccessCriteriaData {
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

// ============================================================================
// Redis Epic Context Functions
// ============================================================================

/**
 * Load epic context from Redis
 *
 * Redis key: swarm:{taskId}:epic-context
 */
export async function loadEpicContext(taskId: string): Promise<EpicContextData | null> {
  try {
    const { stdout } = await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} get "swarm:${taskId}:epic-context"`);
    const result = stdout.trim();

    if (result === '(nil)' || !result) {
      return null;
    }

    return JSON.parse(result) as EpicContextData;
  } catch (error) {
    console.warn(`[cfn-context] Failed to load epic context for task ${taskId}:`, error);
    return null;
  }
}

/**
 * Load phase context from Redis
 *
 * Redis key: swarm:{taskId}:phase-context
 */
export async function loadPhaseContext(taskId: string): Promise<PhaseContextData | null> {
  try {
    const { stdout } = await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} get "swarm:${taskId}:phase-context"`);
    const result = stdout.trim();

    if (result === '(nil)' || !result) {
      return null;
    }

    return JSON.parse(result) as PhaseContextData;
  } catch (error) {
    console.warn(`[cfn-context] Failed to load phase context for task ${taskId}:`, error);
    return null;
  }
}

/**
 * Load success criteria from Redis
 *
 * Redis key: swarm:{taskId}:success-criteria
 */
export async function loadSuccessCriteria(taskId: string): Promise<SuccessCriteriaData | null> {
  try {
    const { stdout } = await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} get "swarm:${taskId}:success-criteria"`);
    const result = stdout.trim();

    if (result === '(nil)' || !result) {
      return null;
    }

    return JSON.parse(result) as SuccessCriteriaData;
  } catch (error) {
    console.warn(`[cfn-context] Failed to load success criteria for task ${taskId}:`, error);
    return null;
  }
}

/**
 * Store epic context to Redis
 *
 * Redis key: swarm:{taskId}:epic-context
 * TTL: 7 days
 */
export async function storeEpicContext(taskId: string, context: EpicContextData): Promise<boolean> {
  try {
    const contextJson = JSON.stringify(context);
    await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} setex "swarm:${taskId}:epic-context" 604800 '${contextJson.replace(/'/g, "\\'")}'`);
    console.log(`[cfn-context] Stored epic context for task ${taskId}`);
    return true;
  } catch (error) {
    console.error(`[cfn-context] Failed to store epic context for task ${taskId}:`, error);
    return false;
  }
}

/**
 * Store phase context to Redis
 *
 * Redis key: swarm:{taskId}:phase-context
 * TTL: 7 days
 */
export async function storePhaseContext(taskId: string, context: PhaseContextData): Promise<boolean> {
  try {
    const contextJson = JSON.stringify(context);
    await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} setex "swarm:${taskId}:phase-context" 604800 '${contextJson.replace(/'/g, "\\'")}'`);
    console.log(`[cfn-context] Stored phase context for task ${taskId}`);
    return true;
  } catch (error) {
    console.error(`[cfn-context] Failed to store phase context for task ${taskId}:`, error);
    return false;
  }
}

/**
 * Store success criteria to Redis
 *
 * Redis key: swarm:{taskId}:success-criteria
 * TTL: 7 days
 */
export async function storeSuccessCriteria(taskId: string, criteria: SuccessCriteriaData): Promise<boolean> {
  try {
    const criteriaJson = JSON.stringify(criteria);
    await execAsync(`redis-cli -h ${redisHost} -p ${redisPort} setex "swarm:${taskId}:success-criteria" 604800 '${criteriaJson.replace(/'/g, "\\'")}'`);
    console.log(`[cfn-context] Stored success criteria for task ${taskId}`);
    return true;
  } catch (error) {
    console.error(`[cfn-context] Failed to store success criteria for task ${taskId}:`, error);
    return false;
  }
}

/**
 * Format epic context as markdown for system prompt
 */
export function formatEpicContextForPrompt(epic: EpicContextData): string {
  if (!epic.epicGoal && !epic.inScope && !epic.outOfScope) {
    return '';
  }

  const sections: string[] = [];

  sections.push('## Epic Context');
  sections.push('');

  if (epic.epicName) {
    sections.push(`**Epic:** ${epic.epicName}`);
    sections.push('');
  }

  if (epic.epicGoal) {
    sections.push('**Goal:**');
    sections.push(epic.epicGoal);
    sections.push('');
  }

  if (epic.currentPhase) {
    sections.push(`**Current Phase:** ${epic.currentPhase}`);
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

  if (epic.references && epic.references.length > 0) {
    sections.push('**References:**');
    for (const ref of epic.references) {
      sections.push(`- ${ref}`);
    }
    sections.push('');
  }

  return sections.join('\n');
}

// ============================================================================
// ACE Context Operations CLI (Original Functionality)
// ============================================================================

interface ContextOptions {
  category?: string;
  tags?: string;
  confidence?: number;
  limit?: number;
  taskId?: string;
  phase?: string;
}

function parseArgs(args: string[]): { subcommand: string; query?: string; options: ContextOptions } {
  const subcommand = args[0] || 'stats';
  let query: string | undefined;
  const options: ContextOptions = {};

  // For query subcommand, first arg after subcommand is the query
  if (subcommand === 'query' && args[1] && !args[1].startsWith('--')) {
    query = args[1];
  }

  for (let i = 1; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    switch (key) {
      case '--category':
        options.category = value;
        break;
      case '--tags':
        options.tags = value;
        break;
      case '--confidence':
        options.confidence = parseFloat(value);
        break;
      case '--limit':
        options.limit = parseInt(value, 10);
        break;
      case '--task-id':
        options.taskId = value;
        break;
      case '--phase':
        options.phase = value;
        break;
    }
  }

  return { subcommand, query, options };
}

async function executeContext(subcommand: string, query: string | undefined, options: ContextOptions): Promise<void> {
  let slashCommand: string;

  switch (subcommand) {
    case 'reflect':
      slashCommand = '/context-reflect';
      if (options.taskId) slashCommand += ` --task-id ${options.taskId}`;
      break;

    case 'curate':
      slashCommand = '/context-curate';
      break;

    case 'inject':
      slashCommand = '/context-inject';
      if (options.taskId) slashCommand += ` --task-id ${options.taskId}`;
      if (options.phase) slashCommand += ` --phase ${options.phase}`;
      break;

    case 'query':
      if (!query) {
        console.error('Error: Query string required for query subcommand');
        console.error('Usage: cfn-context query <search-term> [options]');
        process.exit(1);
      }
      slashCommand = `/context-query "${query}"`;
      if (options.category) slashCommand += ` --category ${options.category}`;
      if (options.tags) slashCommand += ` --tags ${options.tags}`;
      if (options.confidence) slashCommand += ` --confidence ${options.confidence}`;
      break;

    case 'stats':
      slashCommand = '/context-stats';
      break;

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error('Valid subcommands: reflect, curate, inject, query, stats');
      process.exit(1);
  }

  console.log(`[cfn-context] Executing: ${slashCommand}`);
  console.log('[cfn-context] Note: This delegates to claude-flow-novice slash commands');
  console.log('[cfn-context] Use Claude Code CLI for actual execution\n');

  console.log('To execute this context operation, run in Claude Code:');
  console.log(`  ${slashCommand}`);
}

function showHelp(): void {
  console.log(`
cfn-context - ACE Context Operations CLI

Usage:
  cfn-context reflect [options]       Run ACE reflection on recent tasks
  cfn-context curate                  Merge reflection deltas into context
  cfn-context inject [options]        Inject context into tasks
  cfn-context query <term> [options]  Search contexts
  cfn-context stats                   Show context analytics

Options (reflect):
  --task-id <id>        Reflect on specific task

Options (inject):
  --task-id <id>        Inject into specific task
  --phase <name>        Inject based on phase

Options (query):
  --category <cat>      Filter by category
  --tags <tags>         Filter by tags (comma-separated)
  --confidence <n>      Minimum confidence score (0-1)
  --limit <n>           Max results

Examples:
  cfn-context reflect --task-id task-123
  cfn-context curate
  cfn-context inject --phase implementation
  cfn-context query "redis coordination" --category technical
  cfn-context stats

Context Categories:
  technical      Technical patterns and solutions
  architectural  Design decisions and patterns
  operational    Deployment and operations
  quality        Testing and quality practices

For more info: https://docs.claude.com/cfn-context
  `);
}

async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }

  const { subcommand, query, options } = parseArgs(args);
  await executeContext(subcommand, query, options);
}

// Run if called directly
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '');
if (isMainModule) {
  main().catch((err) => {
    console.error('[cfn-context] Fatal error:', err);
    process.exit(1);
  });
}

export { main };
