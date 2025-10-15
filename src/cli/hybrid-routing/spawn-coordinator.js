#!/usr/bin/env node

/**
 * Spawn Coordinator for CFN Loop Optimization
 *
 * This script spawns CFN coordinators to manage complex optimization tasks.
 * It supports different coordinator types based on the optimization mode:
 * - cfn-coordinator-mvp: Fast iteration, cost optimization
 * - cfn-coordinator-standard: Balanced quality and speed
 * - cfn-coordinator-enterprise: Full quality gates, compliance
 *
 * Usage:
 *   node spawn-coordinator.js "Task description" --coordinator=cfn-coordinator-standard
 *   node spawn-coordinator.js "Optimize agents" --coordinator=cfn-coordinator-mvp --max-agents=3
 */

import { spawn } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let taskDescription = '';
  let coordinatorType = 'cfn-coordinator-standard';
  let maxAgents = 3;
  let provider = 'zai';
  let redisChannel = 'swarm:optimization';
  let timeout = 1800000; // 30 minutes default

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--coordinator=')) {
      coordinatorType = arg.split('=')[1];
    } else if (arg.startsWith('--max-agents=')) {
      maxAgents = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--provider=')) {
      provider = arg.split('=')[1];
    } else if (arg.startsWith('--redis-channel=')) {
      redisChannel = arg.split('=')[1];
    } else if (arg.startsWith('--timeout=')) {
      timeout = parseInt(arg.split('=')[1]);
    } else if (!arg.startsWith('--')) {
      // Task description (not a flag)
      taskDescription = arg;
    }
  }

  return {
    taskDescription,
    coordinatorType,
    maxAgents,
    provider,
    redisChannel,
    timeout
  };
}

// Validate coordinator type
function validateCoordinator(type) {
  const validTypes = [
    'cfn-coordinator-mvp',
    'cfn-coordinator-standard',
    'cfn-coordinator-enterprise'
  ];

  if (!validTypes.includes(type)) {
    console.error(`❌ Invalid coordinator type: ${type}`);
    console.error(`Valid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }
}

// Get mode-specific configuration
function getModeConfig(coordinatorType) {
  const configs = {
    'cfn-coordinator-mvp': {
      gateThreshold: 0.70,
      consensusThreshold: 0.80,
      validators: 2,
      timeout: 900000, // 15 minutes
      costTarget: 1.00,
      description: 'Fast iteration with cost optimization'
    },
    'cfn-coordinator-standard': {
      gateThreshold: 0.75,
      consensusThreshold: 0.90,
      validators: 4,
      timeout: 1800000, // 30 minutes
      costTarget: 2.00,
      description: 'Balanced quality and speed with comprehensive validation'
    },
    'cfn-coordinator-enterprise': {
      gateThreshold: 0.75,
      consensusThreshold: 0.95,
      validators: 4,
      timeout: 3600000, // 60 minutes
      costTarget: 5.00,
      description: 'Full quality gates with compliance and thorough testing'
    }
  };

  return configs[coordinatorType] || configs['cfn-coordinator-standard'];
}

// Build the agent spawn command
function buildSpawnCommand(options) {
  const {
    taskDescription,
    coordinatorType,
    maxAgents,
    provider,
    redisChannel,
    timeout
  } = options;

  // Get mode-specific configuration
  const modeConfig = getModeConfig(coordinatorType);

  // Create enhanced task description with mode context
  const enhancedTask = buildEnhancedTaskDescription(taskDescription, coordinatorType, modeConfig);

  // Build the spawn-workers command with proper escaping
  const spawnCommandArgs = [
    'node',
    'src/cli/hybrid-routing/spawn-workers.js',
    enhancedTask,
    `--agents=${coordinatorType}`,
    '--max-agents=1', // Always spawn 1 coordinator
    `--provider=${provider}`,
    `--redis-channel=${redisChannel}`,
    `--timeout=${modeConfig.timeout}`
  ];

  return spawnCommandArgs;
}

// Build enhanced task description with mode context
function buildEnhancedTaskDescription(baseTask, coordinatorType, modeConfig) {
  let enhancedTask = baseTask;

  // Add mode-specific context
  enhancedTask += `\n\n**CFN Coordinator Configuration:**\n`;
  enhancedTask += `- Coordinator Type: ${coordinatorType}\n`;
  enhancedTask += `- Mode: ${modeConfig.description}\n`;
  enhancedTask += `- Gate Threshold: ${modeConfig.gateThreshold}\n`;
  enhancedTask += `- Consensus Threshold: ${modeConfig.consensusThreshold}\n`;
  enhancedTask += `- Validators: ${modeConfig.validators}\n`;
  enhancedTask += `- Cost Target: $${modeConfig.costTarget}\n`;

  // Add specific instructions for agent optimization
  if (baseTask.toLowerCase().includes('optimization') || baseTask.toLowerCase().includes('optimize')) {
    enhancedTask += `\n**Agent Optimization Instructions:**\n`;
    enhancedTask += `1. Launch cli-agent-optimizer agents to analyze existing profiles\n`;
    enhancedTask += `2. Review and optimize agent profile structures\n`;
    enhancedTask += `3. Enhance CLI command implementations\n`;
    enhancedTask += `4. Improve Redis coordination patterns\n`;
    enhancedTask += `5. Optimize swarm workflow efficiency\n`;
    enhancedTask += `6. Validate all optimizations with comprehensive testing\n`;
    enhancedTask += `7. Document improvements and best practices\n`;
  }

  return enhancedTask;
}

// Execute the spawn command
function executeSpawnCommand(commandArgs) {
  return new Promise((resolve, reject) => {
    console.log(`🚀 Spawning CFN coordinator...`);
    console.log(`📝 Command: ${commandArgs.join(' ')}`);

    const child = spawn(commandArgs[0], commandArgs.slice(1), {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: {
        ...process.env,
        CFN_COORDINATOR_MODE: 'optimization'
      }
    });

    let output = '';
    let errorOutput = '';

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      errorOutput += text;
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code,
        output,
        errorOutput,
        success: code === 0
      });
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to spawn coordinator: ${error.message}`));
    });
  });
}

// Main execution function
async function main() {
  try {
    console.log('🔧 CFN Coordinator Spawner for Agent Optimization');
    console.log('='.repeat(50));

    // Parse arguments
    const options = parseArgs();

    if (!options.taskDescription) {
      console.error('❌ Task description is required');
      console.log('\nUsage:');
      console.log('  node spawn-coordinator.js "Task description" [options]');
      console.log('\nOptions:');
      console.log('  --coordinator=<type>    Coordinator type (mvp, standard, enterprise)');
      console.log('  --max-agents=<count>     Maximum number of agents to spawn');
      console.log('  --provider=<provider>    AI provider (zai, anthropic)');
      console.log('  --redis-channel=<name>   Redis channel for coordination');
      console.log('  --timeout=<ms>           Timeout in milliseconds');
      process.exit(1);
    }

    // Validate coordinator type
    validateCoordinator(options.coordinatorType);

    console.log(`📋 Task: ${options.taskDescription}`);
    console.log(`🤖 Coordinator: ${options.coordinatorType}`);
    console.log(`🔗 Provider: ${options.provider}`);
    console.log(`📡 Redis Channel: ${options.redisChannel}`);
    console.log('');

    // Build and execute spawn command
    const spawnCommandArgs = buildSpawnCommand(options);
    const result = await executeSpawnCommand(spawnCommandArgs);

    if (result.success) {
      console.log('\n✅ CFN coordinator spawned successfully');
      console.log(`📊 Exit code: ${result.exitCode}`);
      console.log(`📝 Output length: ${result.output.length} characters`);

      if (result.errorOutput.length > 0) {
        console.log(`⚠️  Warnings: ${result.errorOutput.length} characters`);
      }
    } else {
      console.error('\n❌ CFN coordinator spawn failed');
      console.error(`📊 Exit code: ${result.exitCode}`);
      console.error(`📝 Error: ${result.errorOutput}`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n💥 Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main, parseArgs, buildSpawnCommand, getModeConfig };