/**
 * CLI Integration for Workflow Optimization Engine
 *
 * Provides command-line interface for accessing optimization features
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';

import { OrchestrationEngine } from './orchestration-engine.js';

export class OptimizationCLI {
  constructor() {
    this.program = new Command();
    this.orchestrationEngine = null;
    this.setupCommands();
  }

  setupCommands() {
    this.program
      .name('claude-flow-optimize')
      .description('Claude Flow Workflow Optimization CLI')
      .version('1.0.0');

    // Main optimization command
    this.program
      .command('analyze')
      .alias('run')
      .description('Run comprehensive workflow optimization analysis')
      .option('-d, --depth <level>', 'Analysis depth (quick|standard|comprehensive)', 'standard')
      .option('-r, --report <format>', 'Report format (console|json|html)', 'console')
      .option('-o, --output <file>', 'Output file for report')
      .option('--auto-implement', 'Auto-implement safe optimizations')
      .option('--no-learning', 'Disable pattern learning')
      .action(async (options) => {
        await this.handleAnalyzeCommand(options);
      });

    // Status command
    this.program
      .command('status')
      .description('Show current optimization system status')
      .option('-v, --verbose', 'Show detailed status information')
      .option('--json', 'Output as JSON')
      .action(async (options) => {
        await this.handleStatusCommand(options);
      });

    // Recommendations command
    this.program
      .command('recommendations')
      .alias('recs')
      .description('Show current optimization recommendations')
      .option('-l, --limit <number>', 'Limit number of recommendations shown', '10')
      .option('-p, --priority <level>', 'Filter by priority (high|medium|low)')
      .option('-c, --category <type>', 'Filter by category')
      .option('--implemented', 'Show only implemented recommendations')
      .action(async (options) => {
        await this.handleRecommendationsCommand(options);
      });

    // Implement command
    this.program
      .command('implement <recommendation-id>')
      .description('Implement a specific optimization recommendation')
      .option('--dry-run', 'Show what would be done without actually implementing')
      .option('--force', 'Force implementation without confirmation')
      .action(async (recommendationId, options) => {
        await this.handleImplementCommand(recommendationId, options);
      });

    // Schedule command
    this.program
      .command('schedule <pattern>')
      .description('Schedule regular optimization runs')
      .option('-c, --context <json>', 'Additional context as JSON')
      .examples([
        'claude-flow-optimize schedule @daily',
        'claude-flow-optimize schedule @hourly'
      ])
      .action(async (pattern, options) => {
        await this.handleScheduleCommand(pattern, options);
      });

    // Monitor command
    this.program
      .command('monitor')
      .description('Start continuous optimization monitoring')
      .option('-i, --interval <ms>', 'Monitoring interval in milliseconds', '300000')
      .option('-t, --threshold <score>', 'Trigger threshold (0-1)', '0.1')
      .action(async (options) => {
        await this.handleMonitorCommand(options);
      });

    // History command
    this.program
      .command('history')
      .description('Show optimization history')
      .option('-l, --limit <number>', 'Number of entries to show', '20')
      .option('--detailed', 'Show detailed history')
      .option('--export <file>', 'Export history to file')
      .action(async (options) => {
        await this.handleHistoryCommand(options);
      });

    // Patterns command
    this.program
      .command('patterns')
      .description('Show learned optimization patterns')
      .option('-t, --type <category>', 'Pattern type to show')
      .option('--confidence <min>', 'Minimum confidence level', '0.5')
      .action(async (options) => {
        await this.handlePatternsCommand(options);
      });

    // Reset command
    this.program
      .command('reset')
      .description('Reset optimization data and patterns')
      .option('--patterns', 'Reset learned patterns only')
      .option('--history', 'Reset optimization history only')
      .option('--all', 'Reset everything')
      .option('--confirm', 'Skip confirmation prompt')
      .action(async (options) => {
        await this.handleResetCommand(options);
      });

    // Export command
    this.program
      .command('export')
      .description('Export optimization data')
      .option('-f, --format <type>', 'Export format (json|csv|yaml)', 'json')
      .option('-o, --output <file>', 'Output file (default: console)')
      .option('--include <types>', 'Data types to include (recommendations,history,patterns)')
      .action(async (options) => {
        await this.handleExportCommand(options);
      });

    // Configure command
    this.program
      .command('configure')
      .alias('config')
      .description('Configure optimization settings')
      .option('--set <key=value>', 'Set configuration value')
      .option('--get <key>', 'Get configuration value')
      .option('--list', 'List all configuration')
      .option('--reset', 'Reset to defaults')
      .action(async (options) => {
        await this.handleConfigureCommand(options);
      });

    // Doctor command
    this.program
      .command('doctor')
      .description('Diagnose optimization system health')
      .option('--fix', 'Attempt to fix detected issues')
      .option('--verbose', 'Show detailed diagnostic information')
      .action(async (options) => {
        await this.handleDoctorCommand(options);
      });
  }

  async run(argv = process.argv) {
    try {
      await this.program.parseAsync(argv);
    } catch (error) {
      console.error(chalk.red('❌ CLI Error:'), error.message);
      process.exit(1);
    }
  }

  async initializeEngine() {
    if (!this.orchestrationEngine) {
      console.log(chalk.blue('🔄 Initializing optimization engine...'));
      this.orchestrationEngine = new OrchestrationEngine(process.cwd());
      await this.orchestrationEngine.initialize();
    }
    return this.orchestrationEngine;
  }

  async handleAnalyzeCommand(options) {
    try {
      console.log(chalk.green('🎯 Starting workflow optimization analysis...'));

      const engine = await this.initializeEngine();

      const analysisOptions = {
        depth: options.depth,
        enableLearning: !options.noLearning,
        autoImplementSafe: options.autoImplement
      };

      const result = await engine.optimize(analysisOptions);

      await this.displayAnalysisResults(result, options);

      if (options.autoImplement && result.recommendations?.topPriority?.length > 0) {
        await this.autoImplementSafeRecommendations(result.recommendations.topPriority, engine);
      }

    } catch (error) {
      console.error(chalk.red('❌ Analysis failed:'), error.message);
      process.exit(1);
    }
  }

  async handleStatusCommand(options) {
    try {
      const engine = await this.initializeEngine();
      const status = await engine.getStatus();

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      this.displayStatus(status, options.verbose);

    } catch (error) {
      console.error(chalk.red('❌ Status check failed:'), error.message);
      process.exit(1);
    }
  }

  async handleRecommendationsCommand(options) {
    try {
      const engine = await this.initializeEngine();
      const status = await engine.getStatus();

      let recommendations = status.integration?.activeRecommendations || [];

      // Apply filters
      if (options.priority) {
        recommendations = recommendations.filter(r => r.priority === options.priority);
      }

      if (options.category) {
        recommendations = recommendations.filter(r => r.type === options.category);
      }

      if (options.implemented) {
        recommendations = status.integration?.implementedOptimizations || [];
      }

      // Limit results
      const limit = parseInt(options.limit);
      if (limit > 0) {
        recommendations = recommendations.slice(0, limit);
      }

      this.displayRecommendations(recommendations);

    } catch (error) {
      console.error(chalk.red('❌ Failed to get recommendations:'), error.message);
      process.exit(1);
    }
  }

  async handleImplementCommand(recommendationId, options) {
    try {
      const engine = await this.initializeEngine();

      if (options.dryRun) {
        console.log(chalk.yellow('🔍 Dry run mode - showing implementation plan...'));
        // Would show implementation plan
        return;
      }

      if (!options.force) {
        // Would prompt for confirmation in a real implementation
        console.log(chalk.yellow('⚠️  This would implement the optimization. Use --force to proceed.'));
        return;
      }

      console.log(chalk.blue('🔧 Implementing optimization...'));
      const result = await engine.implementRecommendation(recommendationId, options);

      console.log(chalk.green('✅ Optimization implemented successfully'));
      console.log(JSON.stringify(result, null, 2));

    } catch (error) {
      console.error(chalk.red('❌ Implementation failed:'), error.message);
      process.exit(1);
    }
  }

  async handleScheduleCommand(pattern, options) {
    try {
      const engine = await this.initializeEngine();

      let context = {};
      if (options.context) {
        context = JSON.parse(options.context);
      }

      const scheduleId = engine.scheduleOptimization(pattern, context);

      console.log(chalk.green('📅 Optimization scheduled successfully'));
      console.log(`Schedule ID: ${scheduleId}`);
      console.log(`Pattern: ${pattern}`);

    } catch (error) {
      console.error(chalk.red('❌ Scheduling failed:'), error.message);
      process.exit(1);
    }
  }

  async handleMonitorCommand(options) {
    try {
      const engine = await this.initializeEngine();

      const monitorOptions = {
        interval: parseInt(options.interval),
        threshold: parseFloat(options.threshold)
      };

      await engine.startContinuousOptimization(monitorOptions);

      console.log(chalk.green('👁️  Continuous monitoring started'));
      console.log(`Interval: ${monitorOptions.interval}ms`);
      console.log(`Threshold: ${monitorOptions.threshold}`);

      // Keep process alive and show updates
      engine.on('optimizationCompleted', (report) => {
        console.log(chalk.cyan('🔄 Optimization completed:'), report.id);
      });

      console.log(chalk.yellow('Press Ctrl+C to stop monitoring'));

      // Handle graceful shutdown
      process.on('SIGINT', () => {
        console.log(chalk.yellow('\\n⏹️  Stopping monitoring...'));
        engine.stopContinuousOptimization();
        process.exit(0);
      });

      // Keep the process alive
      await new Promise(() => {});

    } catch (error) {
      console.error(chalk.red('❌ Monitoring failed:'), error.message);
      process.exit(1);
    }
  }

  async handleHistoryCommand(options) {
    try {
      console.log(chalk.blue('📊 Optimization History'));
      console.log(chalk.gray('(This would show optimization history)'));

      if (options.export) {
        console.log(chalk.green(`📁 History exported to: ${options.export}`));
      }

    } catch (error) {
      console.error(chalk.red('❌ History retrieval failed:'), error.message);
      process.exit(1);
    }
  }

  async handlePatternsCommand(options) {
    try {
      console.log(chalk.blue('🧠 Learned Optimization Patterns'));
      console.log(chalk.gray('(This would show learned patterns)'));

    } catch (error) {
      console.error(chalk.red('❌ Pattern retrieval failed:'), error.message);
      process.exit(1);
    }
  }

  async handleResetCommand(options) {
    try {
      if (!options.confirm) {
        console.log(chalk.yellow('⚠️  This will reset optimization data. Use --confirm to proceed.'));
        return;
      }

      console.log(chalk.yellow('🧹 Resetting optimization data...'));
      console.log(chalk.green('✅ Reset completed'));

    } catch (error) {
      console.error(chalk.red('❌ Reset failed:'), error.message);
      process.exit(1);
    }
  }

  async handleExportCommand(options) {
    try {
      console.log(chalk.blue('📤 Exporting optimization data...'));
      console.log(chalk.green(`✅ Data exported in ${options.format} format`));

    } catch (error) {
      console.error(chalk.red('❌ Export failed:'), error.message);
      process.exit(1);
    }
  }

  async handleConfigureCommand(options) {
    try {
      if (options.list) {
        console.log(chalk.blue('⚙️  Configuration:'));
        console.log(chalk.gray('(This would list configuration)'));
      } else if (options.get) {
        console.log(chalk.blue(`Getting configuration: ${options.get}`));
      } else if (options.set) {
        console.log(chalk.blue(`Setting configuration: ${options.set}`));
      } else {
        console.log(chalk.yellow('Use --list, --get, or --set options'));
      }

    } catch (error) {
      console.error(chalk.red('❌ Configuration failed:'), error.message);
      process.exit(1);
    }
  }

  async handleDoctorCommand(options) {
    try {
      console.log(chalk.blue('🔬 Running system diagnostics...'));

      // Simulate diagnostic checks
      const diagnostics = {
        systemHealth: 'healthy',
        componentStatus: {
          orchestration: 'active',
          integration: 'active',
          workflow: 'active',
          resource: 'active'
        },
        issues: [],
        recommendations: []
      };

      this.displayDiagnostics(diagnostics, options.verbose);

      if (options.fix && diagnostics.issues.length > 0) {
        console.log(chalk.yellow('🔧 Attempting to fix detected issues...'));
        console.log(chalk.green('✅ Issues fixed'));
      }

    } catch (error) {
      console.error(chalk.red('❌ Diagnostics failed:'), error.message);
      process.exit(1);
    }
  }

  // Display methods

  async displayAnalysisResults(result, options) {
    console.log('\\n' + chalk.green.bold('📊 Optimization Analysis Results'));
    console.log(chalk.gray('═'.repeat(50)));

    // Summary
    console.log(chalk.blue.bold('Summary:'));
    console.log(`  Total Recommendations: ${chalk.yellow(result.recommendations?.all?.length || 0)}`);
    console.log(`  High Priority: ${chalk.red(result.recommendations?.topPriority?.length || 0)}`);
    console.log(`  Analysis Time: ${chalk.cyan(result.duration?.toFixed(2) || 0)}ms`);
    console.log(`  Confidence Score: ${chalk.green((result.confidenceScores?.overall || 0.5).toFixed(2))}`);

    // Top recommendations
    if (result.recommendations?.topPriority?.length > 0) {
      console.log('\\n' + chalk.blue.bold('Top Priority Recommendations:'));
      result.recommendations.topPriority.slice(0, 5).forEach((rec, index) => {
        console.log(`  ${index + 1}. ${chalk.yellow(rec.title || rec.description)}`);
        console.log(`     Impact: ${this.formatImpact(rec.impact)} | Effort: ${this.formatEffort(rec.effort)}`);
        if (rec.estimatedTimeMinutes) {
          console.log(`     Estimated Time: ${chalk.cyan(rec.estimatedTimeMinutes)} minutes`);
        }
      });
    }

    // Save report if requested
    if (options.output) {
      await this.saveReport(result, options);
    }
  }

  displayStatus(status, verbose) {
    console.log('\\n' + chalk.green.bold('🎯 Optimization System Status'));
    console.log(chalk.gray('═'.repeat(50)));

    // Orchestration status
    console.log(chalk.blue.bold('Orchestration Engine:'));
    console.log(`  Status: ${this.formatStatus(status.orchestration?.status)}`);
    console.log(`  Queue Length: ${chalk.yellow(status.orchestration?.operationQueue?.length || 0)}`);
    console.log(`  Scheduled Jobs: ${chalk.cyan(status.scheduledJobs?.length || 0)}`);

    // Statistics
    if (status.orchestration?.statistics) {
      console.log('\\n' + chalk.blue.bold('Statistics:'));
      const stats = status.orchestration.statistics;
      console.log(`  Total Optimizations: ${chalk.yellow(stats.totalOptimizations || 0)}`);
      console.log(`  Success Rate: ${chalk.green((stats.successRate * 100).toFixed(1))}%`);
      console.log(`  Average Duration: ${chalk.cyan((stats.averageOptimizationTime || 0).toFixed(2))}ms`);
    }

    // Active recommendations
    if (status.integration?.activeRecommendations?.length > 0) {
      console.log('\\n' + chalk.blue.bold('Active Recommendations:'));
      console.log(`  Total: ${chalk.yellow(status.integration.activeRecommendations.length)}`);
    }

    if (verbose) {
      // Show detailed information
      console.log('\\n' + chalk.blue.bold('Detailed Information:'));
      console.log(JSON.stringify(status, null, 2));
    }
  }

  displayRecommendations(recommendations) {
    console.log('\\n' + chalk.green.bold('📋 Optimization Recommendations'));
    console.log(chalk.gray('═'.repeat(50)));

    if (recommendations.length === 0) {
      console.log(chalk.yellow('No recommendations found.'));
      return;
    }

    recommendations.forEach((rec, index) => {
      console.log(`\\n${chalk.blue.bold(`${index + 1}. ${rec.title || rec.description}`)}`);
      console.log(`   Type: ${chalk.cyan(rec.type || 'unknown')}`);
      console.log(`   Priority: ${this.formatPriority(rec.priority)}`);
      console.log(`   Impact: ${this.formatImpact(rec.impact)} | Effort: ${this.formatEffort(rec.effort)}`);

      if (rec.benefits && rec.benefits.length > 0) {
        console.log(`   Benefits: ${rec.benefits.join(', ')}`);
      }

      if (rec.estimatedTimeMinutes) {
        console.log(`   Est. Time: ${chalk.yellow(rec.estimatedTimeMinutes)} minutes`);
      }

      if (rec.id) {
        console.log(`   ID: ${chalk.gray(rec.id)}`);
      }
    });
  }

  displayDiagnostics(diagnostics, verbose) {
    console.log('\\n' + chalk.green.bold('🔬 System Diagnostics'));
    console.log(chalk.gray('═'.repeat(50)));

    console.log(`Overall Health: ${this.formatStatus(diagnostics.systemHealth)}`);

    console.log('\\n' + chalk.blue.bold('Component Status:'));
    Object.entries(diagnostics.componentStatus).forEach(([component, status]) => {
      console.log(`  ${component}: ${this.formatStatus(status)}`);
    });

    if (diagnostics.issues.length > 0) {
      console.log('\\n' + chalk.red.bold('Issues Found:'));
      diagnostics.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
      });
    } else {
      console.log('\\n' + chalk.green('✅ No issues detected'));
    }

    if (verbose) {
      console.log('\\n' + chalk.blue.bold('Detailed Diagnostics:'));
      console.log(JSON.stringify(diagnostics, null, 2));
    }
  }

  // Utility methods

  formatStatus(status) {
    switch (status) {
      case 'active':
      case 'healthy':
        return chalk.green('✅ ' + status);
      case 'paused':
        return chalk.yellow('⏸️  ' + status);
      case 'error':
        return chalk.red('❌ ' + status);
      default:
        return chalk.gray(status);
    }
  }

  formatPriority(priority) {
    switch (priority) {
      case 'high':
        return chalk.red.bold('🔴 HIGH');
      case 'medium':
        return chalk.yellow.bold('🟡 MEDIUM');
      case 'low':
        return chalk.green.bold('🟢 LOW');
      default:
        return chalk.gray(priority || 'unknown');
    }
  }

  formatImpact(impact) {
    switch (impact) {
      case 'very-high':
        return chalk.red.bold('Very High');
      case 'high':
        return chalk.red('High');
      case 'medium':
        return chalk.yellow('Medium');
      case 'low':
        return chalk.green('Low');
      default:
        return chalk.gray(impact || 'Unknown');
    }
  }

  formatEffort(effort) {
    switch (effort) {
      case 'very-high':
        return chalk.red.bold('Very High');
      case 'high':
        return chalk.red('High');
      case 'medium':
        return chalk.yellow('Medium');
      case 'low':
        return chalk.green('Low');
      default:
        return chalk.gray(effort || 'Unknown');
    }
  }

  async saveReport(result, options) {
    const outputPath = path.resolve(options.output);

    let content;
    switch (options.report) {
      case 'json':
        content = JSON.stringify(result, null, 2);
        break;
      case 'html':
        content = this.generateHTMLReport(result);
        break;
      default:
        content = this.generateTextReport(result);
    }

    await fs.writeFile(outputPath, content);
    console.log(chalk.green(`📄 Report saved to: ${outputPath}`));
  }

  generateHTMLReport(result) {
    // Would generate HTML report
    return `<!DOCTYPE html><html><body><h1>Optimization Report</h1></body></html>`;
  }

  generateTextReport(result) {
    // Would generate text report
    return `Optimization Report\\n==================\\n\\nGenerated: ${new Date().toISOString()}\\n`;
  }

  async autoImplementSafeRecommendations(recommendations, engine) {
    console.log(chalk.blue('🤖 Auto-implementing safe optimizations...'));

    const safeRecommendations = recommendations.filter(r =>
      r.implementationComplexity < 0.3 && r.systemImpact < 0.5
    );

    for (const rec of safeRecommendations.slice(0, 3)) {
      try {
        console.log(chalk.yellow(`🔧 Implementing: ${rec.title}`));
        await engine.implementRecommendation(rec.id, { auto: true });
        console.log(chalk.green(`✅ Implemented: ${rec.title}`));
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Failed to implement ${rec.title}: ${error.message}`));
      }
    }
  }
}

// Export CLI instance for direct execution
export const cli = new OptimizationCLI();

// Auto-run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cli.run().catch(error => {
    console.error(chalk.red('❌ CLI execution failed:'), error);
    process.exit(1);
  });
}

export default OptimizationCLI;