#!/usr/bin/env node
/**
 * cfn-loop - CFN Loop orchestration wrapper
 *
 * Usage:
 *   cfn-loop single <task>      Execute single task loop
 *   cfn-loop epic <description> Execute multi-phase epic
 *   cfn-loop sprints <phase>    Execute sprint-based workflow
 */

import { spawn } from 'child_process';

interface LoopOptions {
  mode?: string;
  maxIterations?: number;
  phase?: string;
}

function parseArgs(args: string[]): { subcommand: string; task: string; options: LoopOptions } {
  const subcommand = args[0] || 'single';
  const task = args[1] || '';
  const options: LoopOptions = {};

  for (let i = 2; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    switch (key) {
      case '--mode':
        options.mode = value;
        break;
      case '--max-iterations':
        options.maxIterations = parseInt(value, 10);
        break;
      case '--phase':
        options.phase = value;
        break;
    }
  }

  return { subcommand, task, options };
}

async function executeLoop(subcommand: string, task: string, options: LoopOptions): Promise<void> {
  let slashCommand: string;

  switch (subcommand) {
    case 'single':
      slashCommand = `/cfn-loop-single "${task}"`;
      if (options.mode) slashCommand += ` --mode=${options.mode}`;
      break;
    case 'epic':
      slashCommand = `/cfn-loop-epic "${task}"`;
      if (options.mode) slashCommand += ` --mode=${options.mode}`;
      break;
    case 'sprints':
      slashCommand = `/cfn-loop-sprints "${task}"`;
      if (options.phase) slashCommand += ` --phase=${options.phase}`;
      break;
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error('Valid subcommands: single, epic, sprints');
      process.exit(1);
  }

  console.log(`[cfn-loop] Executing: ${slashCommand}`);
  console.log('[cfn-loop] Note: This delegates to claude-flow-novice slash commands');
  console.log('[cfn-loop] Use Claude Code CLI for actual execution\n');

  // For CLI wrapper, we just show what command would be run
  // Actual execution requires Claude Code context
  console.log('To execute this CFN Loop, run in Claude Code:');
  console.log(`  ${slashCommand}`);
}

function showHelp(): void {
  console.log(`
cfn-loop - CFN Loop Orchestration CLI

Usage:
  cfn-loop single <task> [options]   Execute single task loop
  cfn-loop epic <description>        Execute multi-phase epic
  cfn-loop sprints <phase>           Execute sprint-based workflow

Options:
  --mode <mode>              Execution mode (mvp, standard, enterprise)
  --max-iterations <n>       Maximum iterations per loop
  --phase <name>             Phase name for sprints

Examples:
  cfn-loop single "Implement JWT authentication" --mode=standard
  cfn-loop epic "Build complete auth system"
  cfn-loop sprints "Phase 1: Core implementation" --phase=phase-1

Subcommands:
  single    Execute single task with CFN Loop (no sprint structure)
  epic      Execute multi-phase epic with automatic phase transitions
  sprints   Execute single phase with multiple sprint iterations

For more info: https://docs.claude.com/cfn-loop
  `);
}

async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showHelp();
    return;
  }

  const { subcommand, task, options } = parseArgs(args);

  if (!task) {
    console.error('Error: Task description required');
    showHelp();
    process.exit(1);
  }

  await executeLoop(subcommand, task, options);
}

// Run if called directly
const isMainModule = import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, '/') || '');
if (isMainModule) {
  main().catch((err) => {
    console.error('[cfn-loop] Fatal error:', err);
    process.exit(1);
  });
}

export { main };
