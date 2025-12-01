/**
 * CFN Loop Trigger CLI Entry Point
 * Triggers CFN Loop workflow via trigger.dev events
 */

import { sendEvent } from '../../trigger-dev-client';
import { CFNLoopPayload, CFNMode, getThresholdConfig } from '../types/cfn-types';

export interface TriggerCFNLoopOptions {
  taskId: string;
  description: string;
  mode?: CFNMode;
  testCommand?: string;
  passRateThreshold?: number;
  maxIterations?: number;
  metadata?: Record<string, unknown>;
}

export interface TriggerResult {
  eventId: string;
  taskId: string;
  mode: CFNMode;
  timestamp: Date;
}

/**
 * Trigger a CFN Loop workflow programmatically
 */
export async function triggerCFNLoop(options: TriggerCFNLoopOptions): Promise<TriggerResult> {
  const mode = options.mode || 'standard';
  const thresholds = getThresholdConfig(mode);

  const payload: CFNLoopPayload = {
    taskId: options.taskId,
    description: options.description,
    mode,
    maxIterations: options.maxIterations ?? thresholds.maxIterations,
    currentIteration: 0,
    startedAt: new Date().toISOString(),
    successCriteria: {
      testCommand: options.testCommand || 'npm test',
      passRateThreshold: options.passRateThreshold ?? thresholds.loop3PassRateThreshold,
    },
    metadata: options.metadata,
  };

  const result = await sendEvent('cfn.loop.start', payload as unknown as Record<string, unknown>);

  return {
    eventId: result.id,
    taskId: options.taskId,
    mode,
    timestamp: result.timestamp,
  };
}

/**
 * Parse CLI arguments and trigger CFN Loop
 */
export async function runFromCLI(args: string[]): Promise<void> {
  const options: TriggerCFNLoopOptions = {
    taskId: '',
    description: '',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--task-id':
        options.taskId = nextArg;
        i++;
        break;
      case '--description':
        options.description = nextArg;
        i++;
        break;
      case '--mode':
        options.mode = nextArg as CFNMode;
        i++;
        break;
      case '--test-command':
        options.testCommand = nextArg;
        i++;
        break;
      case '--pass-rate':
        options.passRateThreshold = parseFloat(nextArg);
        i++;
        break;
      case '--max-iterations':
        options.maxIterations = parseInt(nextArg, 10);
        i++;
        break;
    }
  }

  if (!options.taskId || !options.description) {
    console.error('Error: --task-id and --description are required');
    process.exit(1);
  }

  try {
    const result = await triggerCFNLoop(options);
    console.log(`CFN Loop triggered successfully`);
    console.log(`Event ID: ${result.eventId}`);
    console.log(`Task ID: ${result.taskId}`);
    console.log(`Mode: ${result.mode}`);
  } catch (error) {
    console.error(`Failed to trigger CFN Loop: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Main entry point when run directly
if (process.argv[1].includes('trigger-cfn-loop')) {
  runFromCLI(process.argv.slice(2));
}
