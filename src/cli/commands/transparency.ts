/**
 * Transparency CLI Command
 *
 * Provides command-line interface for V2 coordination system transparency.
 * Enables real-time monitoring, hierarchy visualization, and event streaming.
 *
 * @module cli/commands/transparency
 */

import { Command } from 'commander';
import { table } from 'console-table-printer';
import chalk from 'chalk';
import type { TransparencySystem } from '../../coordination/shared/transparency/transparency-system.js';
import type {
  AgentHierarchyNode,
  AgentStatus,
  AgentLifecycleEvent,
  TransparencyMetrics
} from '../../coordination/shared/transparency/interfaces/transparency-system.js';

/**
 * Transparency CLI configuration
 */
interface TransparencyOptions {
  /** Show real-time updates */
  watch?: boolean;
  /** Update interval for watch mode (seconds) */
  interval?: number;
  /** Filter by agent type */
  type?: string;
  /** Filter by hierarchy level */
  level?: number;
  /** Filter by agent state */
  state?: string;
  /** Show performance metrics */
  performance?: boolean;
  /** Show recent events */
  events?: number;
  /** Export to JSON */
  json?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format duration to human readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

/**
 * Get state color for terminal output
 */
function getStateColor(state: string): chalk.ChalkFunction {
  const stateColors: Record<string, chalk.ChalkFunction> = {
    idle: chalk.gray,
    active: chalk.green,
    paused: chalk.yellow,
    terminated: chalk.red,
    error: chalk.red.bold,
    completing: chalk.blue,
    checkpointing: chalk.cyan,
    waiting_for_dependency: chalk.magenta,
  };
  return stateColors[state] || chalk.white;
}

/**
 * Get performance indicator
 */
function getPerformanceIndicator(value: number, threshold: number, unit: string): string {
  const percentage = (value / threshold) * 100;
  if (percentage < 50) return chalk.green(`● ${value}${unit}`);
  if (percentage < 80) return chalk.yellow(`● ${value}${unit}`);
  return chalk.red(`● ${value}${unit}`);
}

/**
 * Display agent hierarchy tree
 */
async function displayHierarchy(transparency: TransparencySystem, options: TransparencyOptions): Promise<void> {
  const hierarchy = await transparency.getAgentHierarchy();

  if (options.level !== undefined) {
    hierarchy.filter(node => node.level === options.level);
  }
  if (options.type) {
    hierarchy.filter(node => node.type === options.type);
  }
  if (options.state) {
    hierarchy.filter(node => node.state === options.state);
  }

  if (hierarchy.length === 0) {
    console.log(chalk.yellow('No agents found matching criteria'));
    return;
  }

  console.log(chalk.bold.blue('\n📊 Agent Hierarchy'));
  console.log(chalk.gray('─'.repeat(80)));

  // Group by level for tree display
  const byLevel = new Map<number, AgentHierarchyNode[]>();
  hierarchy.forEach(node => {
    if (!byLevel.has(node.level)) {
      byLevel.set(node.level, []);
    }
    byLevel.get(node.level)!.push(node);
  });

  // Display hierarchy tree
  const maxLevel = Math.max(...Array.from(byLevel.keys()));
  for (let level = 1; level <= maxLevel; level++) {
    const agents = byLevel.get(level) || [];
    if (agents.length === 0) continue;

    console.log(chalk.bold(`\nLevel ${level} (${agents.length} agents):`));

    agents.forEach(agent => {
      const indent = '  '.repeat(level - 1);
      const stateColor = getStateColor(agent.state);
      const agentIcon = agent.isPaused ? '⏸️' : '▶️';

      console.log(`${indent}${agentIcon} ${chalk.cyan(agent.agentId)} (${agent.type})`);
      console.log(`${indent}   State: ${stateColor(agent.state)}`);
      console.log(`${indent}   Tokens: ${agent.tokensUsed}/${agent.tokenBudget}`);
      console.log(`${indent}   Created: ${formatDuration(Date.now() - agent.createdAt.getTime())} ago`);

      if (agent.currentTask) {
        console.log(`${indent}   Task: ${agent.currentTask}`);
      }

      if (agent.childAgentIds.length > 0) {
        console.log(`${indent}   Children: ${agent.childAgentIds.length}`);
      }

      if (options.verbose && agent.waitingFor.length > 0) {
        console.log(`${indent}   Waiting for: ${agent.waitingFor.join(', ')}`);
      }
    });
  }

  // Summary statistics
  const totalTokens = hierarchy.reduce((sum, agent) => sum + agent.tokensUsed, 0);
  const totalBudget = hierarchy.reduce((sum, agent) => sum + agent.tokenBudget, 0);
  const activeCount = hierarchy.filter(agent => !agent.isPaused && agent.state !== 'terminated').length;
  const pausedCount = hierarchy.filter(agent => agent.isPaused).length;

  console.log(chalk.bold('\n📈 Summary:'));
  console.log(`Total Agents: ${hierarchy.length}`);
  console.log(`Active: ${chalk.green(activeCount)} | Paused: ${chalk.yellow(pausedCount)}`);
  console.log(`Token Usage: ${totalTokens.toLocaleString()} / ${totalBudget.toLocaleString()} (${((totalTokens/totalBudget) * 100).toFixed(1)}%)`);
}

/**
 * Display real-time agent status
 */
async function displayAgentStatus(transparency: TransparencySystem, options: TransparencyOptions): Promise<void> {
  const statuses = await transparency.getAllAgentStatuses();

  if (options.type) {
    statuses.filter(status => status.agentId.includes(options.type!));
  }
  if (options.state) {
    statuses.filter(status => status.state === options.state);
  }

  if (statuses.length === 0) {
    console.log(chalk.yellow('No agents found'));
    return;
  }

  console.log(chalk.bold.blue('\n🔍 Agent Status'));
  console.log(chalk.gray('─'.repeat(120)));

  // Prepare table data
  const tableData = statuses.map(status => ({
    'Agent ID': chalk.cyan(status.agentId),
    'State': getStateColor(status.state)(status.state),
    'Activity': status.activity,
    'Progress': `${status.progress}%`,
    'Tokens': status.tokensUsed.toLocaleString(),
    'Rate': `${status.tokenUsageRate.toFixed(1)}/s`,
    'Memory': formatBytes(status.memoryUsage),
    'CPU': `${status.cpuUsage.toFixed(1)}%`,
    'Last Seen': formatDuration(Date.now() - status.lastHeartbeat.getTime()) + ' ago',
    'Errors': status.recentErrors.length > 0 ? chalk.red(status.recentErrors.length) : '0',
  }));

  // Display table
  table(tableData, {
    columns: [
      { name: 'Agent ID', alignment: 'left' },
      { name: 'State', alignment: 'center' },
      { name: 'Activity', alignment: 'left' },
      { name: 'Progress', alignment: 'center' },
      { name: 'Tokens', alignment: 'right' },
      { name: 'Rate', alignment: 'right' },
      { name: 'Memory', alignment: 'right' },
      { name: 'CPU', alignment: 'right' },
      { name: 'Last Seen', alignment: 'right' },
      { name: 'Errors', alignment: 'center' },
    ],
  });

  // Performance alerts
  const performanceAlerts = statuses.filter(status =>
    status.tokenUsageRate > 50 ||
    status.memoryUsage > 100 * 1024 * 1024 ||
    status.cpuUsage > 80
  );

  if (performanceAlerts.length > 0) {
    console.log(chalk.bold.red('\n⚠️  Performance Alerts:'));
    performanceAlerts.forEach(status => {
      console.log(chalk.red(`  ${status.agentId}:`));
      if (status.tokenUsageRate > 50) {
        console.log(`    High token rate: ${getPerformanceIndicator(status.tokenUsageRate, 100, '/s')}`);
      }
      if (status.memoryUsage > 100 * 1024 * 1024) {
        console.log(`    High memory: ${getPerformanceIndicator(status.memoryUsage, 512 * 1024 * 1024, '')}`);
      }
      if (status.cpuUsage > 80) {
        console.log(`    High CPU: ${getPerformanceIndicator(status.cpuUsage, 100, '%')}`);
      }
    });
  }
}

/**
 * Display recent events
 */
async function displayEvents(transparency: TransparencySystem, options: TransparencyOptions): Promise<void> {
  const limit = options.events || 20;
  const events = await transparency.getRecentEvents(limit);

  if (events.length === 0) {
    console.log(chalk.yellow('No recent events'));
    return;
  }

  console.log(chalk.bold.blue(`\n📋 Recent Events (Last ${limit})`));
  console.log(chalk.gray('─'.repeat(100)));

  events.forEach(event => {
    const timeAgo = formatDuration(Date.now() - event.timestamp.getTime()) + ' ago';
    const eventTypeColor = getEventTypeColor(event.eventType);

    console.log(`${chalk.gray(timeAgo)} ${eventTypeColor(event.eventType.toUpperCase())} ${chalk.cyan(event.agentId)}`);

    if (event.eventData.reason) {
      console.log(`  Reason: ${event.eventData.reason}`);
    }
    if (event.eventData.taskDescription) {
      console.log(`  Task: ${event.eventData.taskDescription}`);
    }
    if (event.eventData.errorMessage) {
      console.log(`  Error: ${chalk.red(event.eventData.errorMessage)}`);
    }

    if (options.verbose) {
      console.log(`  Level: ${event.level} | Session: ${event.sessionId}`);
      if (event.performanceImpact.duration) {
        console.log(`  Duration: ${formatDuration(event.performanceImpact.duration)}`);
      }
      if (event.performanceImpact.tokenCost) {
        console.log(`  Token Cost: ${event.performanceImpact.tokenCost}`);
      }
    }
    console.log();
  });
}

/**
 * Display transparency metrics
 */
async function displayMetrics(transparency: TransparencySystem, options: TransparencyOptions): Promise<void> {
  const metrics = await transparency.getTransparencyMetrics();
  const hierarchyAnalytics = await transparency.getHierarchyAnalytics();

  console.log(chalk.bold.blue('\n📊 Transparency Metrics'));
  console.log(chalk.gray('─'.repeat(80)));

  // Overview metrics
  console.log(chalk.bold('\n🎯 Overview:'));
  console.log(`Total Agents: ${metrics.totalAgents}`);
  console.log(`Hierarchy Depth: ${hierarchyAnalytics.depth} levels`);
  console.log(`Branching Factor: ${hierarchyAnalytics.branchingFactor.toFixed(1)}`);
  console.log(`Hierarchy Balance: ${hierarchyAnalytics.balance.toFixed(1)}%`);
  console.log(`System Efficiency: ${hierarchyAnalytics.efficiency.toFixed(1)}%`);

  // Agent distribution
  console.log(chalk.bold('\n👥 Agent Distribution:'));
  Object.entries(metrics.agentsByState).forEach(([state, count]) => {
    const stateColor = getStateColor(state);
    console.log(`  ${stateColor(state)}: ${count}`);
  });

  Object.entries(metrics.agentsByLevel).forEach(([level, count]) => {
    console.log(`  Level ${level}: ${count}`);
  });

  Object.entries(metrics.agentsByType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  // Performance metrics
  console.log(chalk.bold('\n⚡ Performance:'));
  console.log(`Average Execution Time: ${formatDuration(metrics.averageExecutionTimeMs)}`);
  console.log(`Failure Rate: ${metrics.failureRate.toFixed(1)}%`);
  console.log(`Dependency Resolution Rate: ${metrics.dependencyResolutionRate.toFixed(1)}%`);
  console.log(`Average Pause/Resume Latency: ${formatDuration(metrics.averagePauseResumeLatencyMs)}`);

  // Token metrics
  console.log(chalk.bold('\n💰 Token Usage:'));
  console.log(`Total Consumed: ${metrics.totalTokensConsumed.toLocaleString()}`);
  console.log(`Total Saved: ${chalk.green(metrics.totalTokensSaved.toLocaleString())}`);
  console.log(`Event Stream: ${metrics.eventStreamStats.eventsPerSecond.toFixed(1)} events/sec`);

  // Event statistics
  if (options.verbose) {
    console.log(chalk.bold('\n📈 Event Statistics:'));
    console.log(`Total Events: ${metrics.eventStreamStats.totalEvents}`);
    Object.entries(metrics.eventStreamStats.eventTypes).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
  }
}

/**
 * Get color for event type
 */
function getEventTypeColor(eventType: string): chalk.ChalkFunction {
  const eventColors: Record<string, chalk.ChalkFunction> = {
    spawned: chalk.green,
    paused: chalk.yellow,
    resumed: chalk.blue,
    terminated: chalk.red,
    checkpoint_created: chalk.cyan,
    checkpoint_restored: chalk.blue,
    state_changed: chalk.magenta,
    task_assigned: chalk.green,
    task_completed: chalk.green,
    error_occurred: chalk.red.bold,
  };
  return eventColors[eventType] || chalk.white;
}

/**
 * Export data to JSON
 */
async function exportToJson(transparency: TransparencySystem, options: TransparencyOptions): Promise<void> {
  const data: any = {
    timestamp: new Date().toISOString(),
    hierarchy: await transparency.getAgentHierarchy(),
    statuses: await transparency.getAllAgentStatuses(),
    metrics: await transparency.getTransparencyMetrics(),
    events: await transparency.getRecentEvents(options.events || 100),
  };

  if (options.performance) {
    // Add performance metrics for each agent
    data.performance = {};
    for (const agent of data.hierarchy) {
      data.performance[agent.agentId] = await transparency.getAgentPerformanceMetrics(agent.agentId);
    }
  }

  console.log(JSON.stringify(data, null, 2));
}

/**
 * Watch mode - real-time updates
 */
async function watchMode(transparency: TransparencySystem, options: TransparencyOptions): Promise<void> {
  const interval = (options.interval || 5) * 1000;

  console.log(chalk.bold.blue(`\n🔍 Transparency Watch Mode (Update every ${options.interval}s)`));
  console.log(chalk.gray('Press Ctrl+C to exit\n'));

  const display = async () => {
    // Clear screen
    console.clear();

    // Display timestamp
    console.log(chalk.bold(`Last Updated: ${new Date().toLocaleString()}`));

    // Show all views
    await displayHierarchy(transparency, options);
    await displayAgentStatus(transparency, options);
    if (options.events) {
      await displayEvents(transparency, options);
    }
    if (options.performance) {
      await displayMetrics(transparency, options);
    }
  };

  // Initial display
  await display();

  // Set up interval for updates
  const updateInterval = setInterval(display, interval);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(updateInterval);
    console.log(chalk.yellow('\n\n👋 Transparency watch mode stopped'));
    process.exit(0);
  });
}

/**
 * Create transparency CLI command
 */
export function createTransparencyCommand(transparency: TransparencySystem): Command {
  const cmd = new Command('transparency')
    .description('V2 Coordination System Transparency Dashboard')
    .alias('trans')
    .option('-w, --watch', 'Enable real-time watch mode')
    .option('-i, --interval <seconds>', 'Update interval for watch mode (default: 5)', '5')
    .option('-t, --type <type>', 'Filter by agent type')
    .option('-l, --level <level>', 'Filter by hierarchy level', parseInt)
    .option('-s, --state <state>', 'Filter by agent state')
    .option('-p, --performance', 'Show performance metrics')
    .option('-e, --events <count>', 'Show recent events (default: 20)', '20')
    .option('-j, --json', 'Export data as JSON')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options: TransparencyOptions) => {
      try {
        if (options.json) {
          await exportToJson(transparency, options);
        } else if (options.watch) {
          await watchMode(transparency, options);
        } else {
          // Default: show hierarchy and status
          await displayHierarchy(transparency, options);
          await displayAgentStatus(transparency, options);

          if (options.events) {
            await displayEvents(transparency, options);
          }

          if (options.performance) {
            await displayMetrics(transparency, options);
          }
        }
      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  // Add subcommands for specific views
  cmd
    .command('hierarchy')
    .description('Show agent hierarchy tree')
    .option('-l, --level <level>', 'Filter by hierarchy level', parseInt)
    .option('-t, --type <type>', 'Filter by agent type')
    .option('-s, --state <state>', 'Filter by agent state')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options: TransparencyOptions) => {
      await displayHierarchy(transparency, options);
    });

  cmd
    .command('status')
    .description('Show real-time agent status')
    .option('-t, --type <type>', 'Filter by agent type')
    .option('-s, --state <state>', 'Filter by agent state')
    .action(async (options: TransparencyOptions) => {
      await displayAgentStatus(transparency, options);
    });

  cmd
    .command('events')
    .description('Show recent agent lifecycle events')
    .option('-n, --number <count>', 'Number of events to show (default: 20)', '20')
    .option('--type <type>', 'Filter by event type')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options: TransparencyOptions) => {
      options.events = parseInt(options.number as any) || 20;
      await displayEvents(transparency, options);
    });

  cmd
    .command('metrics')
    .description('Show transparency and performance metrics')
    .option('-v, --verbose', 'Verbose output')
    .action(async (options: TransparencyOptions) => {
      await displayMetrics(transparency, options);
    });

  cmd
    .command('agent <agentId>')
    .description('Show detailed information for specific agent')
    .option('-p, --performance', 'Include performance metrics')
    .option('-e, --events <count>', 'Show recent events (default: 10)', '10')
    .action(async (agentId: string, options: TransparencyOptions) => {
      try {
        const status = await transparency.getAgentStatus(agentId);
        const performance = options.performance
          ? await transparency.getAgentPerformanceMetrics(agentId)
          : null;
        const events = await transparency.getAgentEvents(agentId, parseInt(options.events as any) || 10);

        console.log(chalk.bold.blue(`\n🔍 Agent Details: ${agentId}`));
        console.log(chalk.gray('─'.repeat(80)));

        // Agent status
        console.log(chalk.bold('\n📊 Status:'));
        console.log(`State: ${getStateColor(status.state)(status.state)}`);
        console.log(`Activity: ${status.activity}`);
        console.log(`Progress: ${status.progress}%`);
        console.log(`Is Paused: ${status.isPaused ? 'Yes' : 'No'}`);
        console.log(`Last Heartbeat: ${status.lastHeartbeat.toLocaleString()}`);

        // Resource usage
        console.log(chalk.bold('\n💻 Resource Usage:'));
        console.log(`Tokens Used: ${status.tokensUsed.toLocaleString()}`);
        console.log(`Token Rate: ${status.tokenUsageRate.toFixed(1)}/s`);
        console.log(`Memory: ${formatBytes(status.memoryUsage)}`);
        console.log(`CPU: ${status.cpuUsage.toFixed(1)}%`);

        // Performance metrics
        if (performance) {
          console.log(chalk.bold('\n⚡ Performance:'));
          console.log(`Execution Time: ${formatDuration(performance.executionMetrics.totalExecutionTimeMs)}`);
          console.log(`Pause Count: ${performance.stateMetrics.pauseCount}`);
          console.log(`Resume Count: ${performance.stateMetrics.resumeCount}`);
          console.log(`Checkpoint Count: ${performance.stateMetrics.checkpointCount}`);
          console.log(`Total Errors: ${performance.errorMetrics.totalErrors}`);
        }

        // Recent errors
        if (status.recentErrors.length > 0) {
          console.log(chalk.bold.red('\n❌ Recent Errors:'));
          status.recentErrors.forEach(error => {
            console.log(`${error.timestamp.toLocaleString()}: ${error.error} (${error.severity})`);
          });
        }

        // Recent events
        if (events.length > 0) {
          console.log(chalk.bold('\n📋 Recent Events:'));
          events.forEach(event => {
            const timeAgo = formatDuration(Date.now() - event.timestamp.getTime()) + ' ago';
            const eventTypeColor = getEventTypeColor(event.eventType);
            console.log(`${chalk.gray(timeAgo)} ${eventTypeColor(event.eventType)}`);
            if (event.eventData.reason) {
              console.log(`  ${event.eventData.reason}`);
            }
          });
        }

      } catch (error) {
        console.error(chalk.red('Error:'), error);
        process.exit(1);
      }
    });

  return cmd;
}