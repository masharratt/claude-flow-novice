#!/usr/bin/env node
/**
 * cfn-context - ACE context operations
 *
 * Usage:
 *   cfn-context reflect      Run ACE reflection
 *   cfn-context curate       Merge contexts
 *   cfn-context inject       Inject into tasks
 *   cfn-context query        Search contexts
 *   cfn-context stats        Show analytics
 */

import { spawn } from 'child_process';

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
