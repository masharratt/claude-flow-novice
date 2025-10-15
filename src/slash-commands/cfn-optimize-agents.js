#!/usr/bin/env node

/**
 * CFN Optimize Agents Slash Command
 * Usage: /cfn-optimize-agents [options]
 *
 * Triggers CFN coordinators to launch cli-agent-optimizer agents
 * to review and optimize existing agent profiles for:
 * - CFN loop participation
 * - CLI command effectiveness
 * - Redis coordination patterns
 * - Swarm workflow optimization
 *
 * Features:
 * - Autonomous CFN Loop execution for agent optimization
 * - Multi-agent optimization in parallel
 * - Comprehensive agent profile analysis
 * - Swarm coordination improvements
 * - Performance optimization recommendations
 */

import { SlashCommand } from "../core/slash-command.js";
import { spawn } from "child_process";
import * as path from "path";

export class CfnOptimizeAgentsCommand extends SlashCommand {
  constructor() {
    super(
      "cfn-optimize-agents",
      "Optimize agent profiles for CFN loops, CLI commands, and swarm coordination using cli-agent-optimizer agents"
    );
  }

  getUsage() {
    return "/cfn-optimize-agents [--scope=all|core|specialized] [--agents=<agent-types>] [--parallel=<count>]";
  }

  getExamples() {
    return [
      '/cfn-optimize-agents',
      '/cfn-optimize-agents --scope=all',
      '/cfn-optimize-agents --scope=core --parallel=3',
      '/cfn-optimize-agents --agents=coder,architect,tester --parallel=5',
      '/cfn-optimize-agents --scope=specialized --parallel=5'
    ];
  }

  validateArgs(args) {
    const validScopes = ['all', 'core', 'specialized'];

    const options = {
      scope: 'all',
      agents: null,
      parallel: 3
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('--scope=')) {
        const scope = arg.split('=')[1];
        if (!validScopes.includes(scope)) {
          return {
            valid: false,
            error: `Invalid scope: ${scope}. Valid scopes: ${validScopes.join(', ')}`
          };
        }
        options.scope = scope;
      } else if (arg.startsWith('--agents=')) {
        const agents = arg.split('=')[1];
        if (!agents || agents.trim() === '') {
          return {
            valid: false,
            error: 'Agents parameter cannot be empty. Use comma-separated agent types.'
          };
        }
        options.agents = agents.split(',').map(a => a.trim());
      } else if (arg.startsWith('--parallel=')) {
        const parallel = parseInt(arg.split('=')[1]);
        if (isNaN(parallel) || parallel < 1 || parallel > 10) {
          return {
            valid: false,
            error: 'Parallel must be a number between 1 and 10'
          };
        }
        options.parallel = parallel;
      } else if (arg === '--help' || arg === '-h') {
        return {
          valid: false,
          error: 'See usage information above',
          showHelp: true
        };
      } else {
        return {
          valid: false,
          error: `Unknown option: ${arg}`
        };
      }
    }

    return { valid: true, options };
  }

  async execute(args, context = {}) {
    // Validate arguments
    const validation = this.validateArgs(args);
    if (!validation.valid) {
      if (validation.showHelp) {
        return this.formatResponse({
          success: false,
          help: this.getHelp(),
          usage: this.getUsage(),
          examples: this.getExamples()
        });
      }
      return this.formatResponse({
        success: false,
        error: validation.error,
        usage: this.getUsage()
      });
    }

    const { scope, agents, parallel } = validation.options;

    try {
      console.log(`🔧 Starting agent optimization with scope: ${scope}, parallel: ${parallel}`);

      // Determine optimization target based on scope
      const optimizationTarget = this.getOptimizationTarget(scope, agents);

      // Construct optimization task description
      const taskDescription = this.buildOptimizationTask(optimizationTarget);

      // Execute CFN Loop with coordinator
      const cfnResult = await this.executeCFNLoop(taskDescription, parallel);

      return this.formatResponse({
        success: true,
        message: `Agent optimization completed successfully`,
        results: {
          scope,
          optimizationTarget,
          cfnLoopResult: cfnResult,
          summary: this.generateOptimizationSummary(cfnResult)
        }
      });

    } catch (error) {
      console.error('❌ Agent optimization failed:', error);
      return this.formatResponse({
        success: false,
        error: `Agent optimization failed: ${error.message}`,
        suggestion: 'Check CFN Loop coordinator availability and try again'
      });
    }
  }

  getOptimizationTarget(scope, specificAgents) {
    if (specificAgents) {
      return {
        type: 'specific',
        agents: specificAgents,
        description: `Specific agents: ${specificAgents.join(', ')}`
      };
    }

    switch (scope) {
      case 'core':
        return {
          type: 'category',
          category: 'core-agents',
          description: 'Core agents (coder, architect, analyst, etc.)'
        };
      case 'specialized':
        return {
          type: 'category',
          category: 'specialized',
          description: 'Specialized agents (security, devops, performance, etc.)'
        };
      case 'all':
      default:
        return {
          type: 'all',
          description: 'All agent profiles in the system'
        };
    }
  }

  buildOptimizationTask(target) {
    let taskDescription = `Execute comprehensive agent optimization using unified cli-agent-optimizer agents.\n\n`;

    taskDescription += `**Optimization Target:** ${target.description}\n`;
    taskDescription += `**Mode:** Unified (supports MVP/Standard/Enterprise optimization patterns)\n\n`;

    taskDescription += `**Optimization Phases:**\n`;
    taskDescription += `1. **Discovery**: Analyze existing agent profiles, CLI commands, and Redis patterns\n`;
    taskDescription += `2. **Analysis**: Identify optimization opportunities for CFN loop participation\n`;
    taskDescription += `3. **Implementation**: Apply optimization improvements to agent profiles\n`;
    taskDescription += `4. **Validation**: Test optimized profiles and validate improvements\n`;
    taskDescription += `5. **Documentation**: Update optimization recommendations and patterns\n\n`;

    taskDescription += `**Focus Areas:**\n`;
    taskDescription += `- Agent profile structure and effectiveness\n`;
    taskDescription += `- CLI command performance and coordination\n`;
    taskDescription += `- Redis pub/sub pattern optimization\n`;
    taskDescription += `- Swarm workflow improvements\n`;
    taskDescription += `- CFN Loop integration optimization\n`;
    taskDescription += `- Performance and resource utilization\n\n`;

    taskDescription += `**Expected Deliverables:**\n`;
    taskDescription += `- Optimized agent profiles with improved structure\n`;
    taskDescription += `- Enhanced CLI commands with better error handling\n`;
    taskDescription += `- Improved Redis coordination patterns\n`;
    taskDescription += `- Performance metrics and improvement measurements\n`;
    taskDescription += `- Optimization recommendations and best practices\n\n`;

    taskDescription += `Execute this optimization using multiple cli-agent-optimizer agents in parallel for comprehensive coverage.`;

    return taskDescription;
  }

  async executeCFNLoop(taskDescription, parallelCount) {
    return new Promise((resolve, reject) => {
      console.log(`🚀 Launching coordinator-managed agent optimization with ${parallelCount} parallel optimizers...`);

      // Enhanced task description for coordinator
      const coordinatorTask = `
Lead agent profile optimization using ${parallelCount} parallel cli-agent-optimizer agents.

**Primary Objectives:**
1. **Discover** all agent profiles in .claude/agents/ directory structure
2. **Distribute** profiles evenly among ${parallelCount} optimizers (no overlap)
3. **Coordinate** parallel optimization work via Redis pub/sub messaging
4. **Aggregate** results and ensure complete coverage of all profiles
5. **Validate** all optimizations are completed successfully

**Coordinator Responsibilities:**
- Analyze all 81+ agent profiles and categorize by type/function
- Create non-overlapping work assignments for each optimizer
- Monitor progress via Redis channels: swarm:optimization:optimizer-{N}:status
- Handle failed assignments and re-distribute work as needed
- Provide final completion report with all optimized profiles

**Agent Distribution Strategy:**
- Core agents: coder, architect, analyst, coordinator types (assign 2-3 per optimizer)
- Specialized agents: security, performance, testing, devops (assign 4-5 per optimizer)
- Persona agents: various role-specific profiles (assign 5-6 per optimizer)
- Ensure each optimizer gets ~15-20 profiles for balanced workload

**Redis Coordination Pattern:**
- Publish assignments on: swarm:optimization:assignments
- Monitor progress on: swarm:optimization:optimizer-{1..${parallelCount}}:progress
- Aggregate results on: swarm:optimization:results

**Quality Assurance:**
- Verify no profile duplication across optimizers
- Ensure all discovered profiles are assigned
- Monitor optimizer confidence scores (target: ≥0.75)
- Collect optimization summaries and recommendations

**CLI Spawning Pattern:**
Use Bash tool to spawn ${parallelCount} cli-agent-optimizer agents:
node src/cli/hybrid-routing/spawn-workers.js \\
  "Optimize assigned agent profiles: [specific list]" \\
  --agents=cli-agent-optimizer \\
  --max-agents=1 \\
  --provider=zai \\
  --redis-channel=swarm:optimization:optimizer-{N}

Execute this coordination using Task tool to manage ${parallelCount} parallel cli-agent-optimizer agents, monitor their progress via Redis, and report comprehensive results.`;

      console.log(`📋 Launching Coordinator via CLI...`);
      console.log(`🔄 Coordination: Redis pub/sub for progress tracking`);
      console.log(`📊 Goal: Complete optimization of all agent profiles without overlap\n`);

      // Launch coordinator via CLI (simulating Task tool behavior)
      console.log(`🚀 CLI: Spawning coordinator-hybrid to manage ${parallelCount} optimizers...`);

      const spawnCommand = this.buildCoordinatorSpawnCommand(coordinatorTask, parallelCount);
      console.log(`📝 Command: ${spawnCommand}`);

      // Execute the coordinator via CLI
      const child = spawn('node', spawnCommand.split(' '), {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: {
          ...process.env,
          COORDINATOR_MODE: 'agent-optimization',
          PARALLEL_COUNT: parallelCount.toString(),
          REDIS_CHANNEL: 'swarm:coordination'
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
        console.error(text.trim());
      });

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`\n✅ Coordinator completed successfully`);
          console.log(`📊 Managed ${parallelCount} parallel optimizers`);

          resolve({
            exitCode: code,
            output: 'Coordinator completed optimization via CLI',
            errorOutput,
            duration: Date.now() - performance.now(),
            summary: {
              coordinatorType: 'coordinator-hybrid',
              parallelAgents: parallelCount,
              launchedVia: 'CLI',
              coordinationMethod: 'redis-pub-sub',
              success: true
            }
          });
        } else {
          reject(new Error(`Coordinator process exited with code ${code}: ${errorOutput}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to spawn coordinator: ${error.message}`));
      });

      // Set timeout (30 minutes for coordinator + parallel work)
      const timeout = 30 * 60 * 1000;
      setTimeout(() => {
        reject(new Error(`Coordinator optimization timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  // Simulation removed - now using actual CLI coordinator

  buildCoordinatorSpawnCommand(taskDescription, parallelCount) {
    // Escape the task description for shell
    const escapedTask = taskDescription.replace(/"/g, '\\"').replace(/'/g, "\\'");

    return `src/cli/hybrid-routing/spawn-workers.js "${escapedTask}" --agents=coordinator-hybrid --max-agents=1 --provider=zai --redis-channel=swarm:coordination`;
  }

  generateOptimizationSummary(cfnResult) {
    const summary = {
      duration: cfnResult.duration,
      exitCode: cfnResult.exitCode,
      outputLength: cfnResult.output.length,
      hasErrors: cfnResult.errorOutput.length > 0,
      recommendations: []
    };

    // Analyze output for optimization results
    const output = cfnResult.output.toLowerCase();

    if (output.includes('agent profile') && output.includes('optimized')) {
      summary.recommendations.push('✅ Agent profiles successfully optimized');
    }

    if (output.includes('cli command') && output.includes('improved')) {
      summary.recommendations.push('✅ CLI commands enhanced');
    }

    if (output.includes('redis') && output.includes('coordination')) {
      summary.recommendations.push('✅ Redis coordination patterns improved');
    }

    if (output.includes('performance') && output.includes('improvement')) {
      summary.recommendations.push('✅ Performance optimizations applied');
    }

    if (summary.recommendations.length === 0) {
      summary.recommendations.push('⚠️  Optimization completed - review detailed output for specific changes');
    }

    return summary;
  }
}

// Export for use in other modules
export default CfnOptimizeAgentsCommand;

// Command registration (if needed)
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = new CfnOptimizeAgentsCommand();
  const args = process.argv.slice(2);

  command.execute(args)
    .then(result => {
      console.log('\n✅ Optimization completed:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('\n❌ Optimization failed:', error.message);
      process.exit(1);
    });
}