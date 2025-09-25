/**
 * Phase 4 CLI Interface
 * Command-line interface for managing feature flag deployment
 */

import { Command } from 'commander';
import chalk from 'chalk';
import {
  Phase4FeatureFlagSystem,
  getPhase4System,
  PHASE4_PRESETS
} from '../index.js';

export class Phase4CLI {
  private program: Command;
  private system: Phase4FeatureFlagSystem;

  constructor() {
    this.program = new Command();
    this.system = getPhase4System();
    this.setupCommands();
  }

  private setupCommands(): void {
    this.program
      .name('phase4')
      .description('Phase 4 Feature Flag Deployment Manager')
      .version('1.0.0');

    // System management commands
    this.program
      .command('init')
      .description('Initialize Phase 4 feature flag system')
      .option('-e, --environment <env>', 'Environment (development, staging, production)', 'development')
      .option('--preset <preset>', 'Use configuration preset (conservative, aggressive, testing)')
      .action(this.initSystem.bind(this));

    this.program
      .command('status')
      .description('Show system status and health')
      .option('--json', 'Output as JSON')
      .action(this.showStatus.bind(this));

    this.program
      .command('shutdown')
      .description('Gracefully shutdown the system')
      .action(this.shutdownSystem.bind(this));

    // Flag management commands
    this.program
      .command('flags')
      .description('Manage feature flags')
      .addCommand(this.createFlagCommands());

    // Rollout management commands
    this.program
      .command('rollout')
      .description('Manage rollout plans')
      .addCommand(this.createRolloutCommands());

    // Monitoring commands
    this.program
      .command('monitor')
      .description('Monitoring and alerting')
      .addCommand(this.createMonitorCommands());

    // Emergency commands
    this.program
      .command('emergency')
      .description('Emergency management')
      .addCommand(this.createEmergencyCommands());

    // Validation commands
    this.program
      .command('validate')
      .description('Validation operations')
      .addCommand(this.createValidationCommands());
  }

  private createFlagCommands(): Command {
    const flagCmd = new Command('flags');

    flagCmd
      .command('list')
      .description('List all feature flags')
      .option('--enabled', 'Show only enabled flags')
      .option('--disabled', 'Show only disabled flags')
      .action(this.listFlags.bind(this));

    flagCmd
      .command('enable <flagName>')
      .description('Enable a feature flag')
      .action(this.enableFlag.bind(this));

    flagCmd
      .command('disable <flagName>')
      .description('Disable a feature flag')
      .action(this.disableFlag.bind(this));

    flagCmd
      .command('rollout <flagName> <percentage>')
      .description('Set rollout percentage for a flag')
      .action(this.setRolloutPercentage.bind(this));

    flagCmd
      .command('check <flagName>')
      .description('Check if flag is enabled for user')
      .option('-u, --user <userId>', 'User ID to check')
      .action(this.checkFlag.bind(this));

    return flagCmd;
  }

  private createRolloutCommands(): Command {
    const rolloutCmd = new Command('rollout');

    rolloutCmd
      .command('create <flagName>')
      .description('Create Phase 4 rollout plan')
      .action(this.createRolloutPlan.bind(this));

    rolloutCmd
      .command('start <planId>')
      .description('Start rollout execution')
      .action(this.startRollout.bind(this));

    rolloutCmd
      .command('status [planId]')
      .description('Show rollout status')
      .action(this.showRolloutStatus.bind(this));

    rolloutCmd
      .command('approve <planId>')
      .description('Approve next stage of rollout')
      .action(this.approveStage.bind(this));

    rolloutCmd
      .command('rollback <planId> [reason]')
      .description('Rollback a deployment')
      .action(this.rollbackDeployment.bind(this));

    rolloutCmd
      .command('history [flagName]')
      .description('Show rollout history')
      .action(this.showRolloutHistory.bind(this));

    return rolloutCmd;
  }

  private createMonitorCommands(): Command {
    const monitorCmd = new Command('monitor');

    monitorCmd
      .command('dashboard')
      .description('Show monitoring dashboard')
      .option('--port <port>', 'Dashboard port', '3001')
      .action(this.showDashboard.bind(this));

    monitorCmd
      .command('alerts')
      .description('Show active alerts')
      .option('--severity <level>', 'Filter by severity (low, medium, high, critical)')
      .action(this.showAlerts.bind(this));

    monitorCmd
      .command('metrics')
      .description('Show system metrics')
      .option('--flag <flagName>', 'Show metrics for specific flag')
      .action(this.showMetrics.bind(this));

    monitorCmd
      .command('report')
      .description('Generate deployment report')
      .option('-o, --output <file>', 'Output file path')
      .action(this.generateReport.bind(this));

    return monitorCmd;
  }

  private createEmergencyCommands(): Command {
    const emergencyCmd = new Command('emergency');

    emergencyCmd
      .command('disable <reason>')
      .description('Emergency disable all features')
      .action(this.emergencyDisable.bind(this));

    emergencyCmd
      .command('rollback <flagName> <reason>')
      .description('Emergency rollback a specific flag')
      .action(this.emergencyRollback.bind(this));

    return emergencyCmd;
  }

  private createValidationCommands(): Command {
    const validateCmd = new Command('validate');

    validateCmd
      .command('task <taskId>')
      .description('Validate a specific task')
      .option('--description <desc>', 'Task description')
      .option('--user <userId>', 'User ID')
      .action(this.validateTask.bind(this));

    validateCmd
      .command('hook <hookType>')
      .description('Execute hook with validation')
      .option('--command <cmd>', 'Hook command')
      .option('--args <args...>', 'Hook arguments')
      .action(this.executeHook.bind(this));

    return validateCmd;
  }

  // Command implementations
  private async initSystem(options: any): Promise<void> {
    try {
      console.log(chalk.blue('🚀 Initializing Phase 4 Feature Flag System...'));

      if (options.preset) {
        if (!PHASE4_PRESETS[options.preset.toUpperCase()]) {
          console.error(chalk.red(`❌ Unknown preset: ${options.preset}`));
          return;
        }
        console.log(chalk.yellow(`📋 Using preset: ${options.preset}`));
      }

      await this.system.initialize();

      console.log(chalk.green('✅ Phase 4 system initialized successfully'));

      const status = await this.system.getSystemStatus();
      console.log(chalk.cyan(`📊 Environment: ${status.environment}`));
      console.log(chalk.cyan(`🏁 Feature flags: ${status.flags.length}`));
      console.log(chalk.cyan(`📈 Active rollouts: ${status.activeRollouts}`));

    } catch (error) {
      console.error(chalk.red(`❌ Initialization failed: ${error.message}`));
      process.exit(1);
    }
  }

  private async showStatus(options: any): Promise<void> {
    try {
      const status = await this.system.getSystemStatus();

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      console.log(chalk.blue.bold('\n📊 Phase 4 System Status\n'));

      // System health
      const healthColor = status.systemHealth.overallStatus === 'healthy' ? 'green' :
        status.systemHealth.overallStatus === 'warning' ? 'yellow' : 'red';
      console.log(chalk[healthColor](`🏥 Health: ${status.systemHealth.overallStatus.toUpperCase()}`));

      // Feature flags
      console.log(chalk.cyan(`\n🏁 Feature Flags (${status.flags.length}):`));
      status.flags.forEach((flag: any) => {
        const statusIcon = flag.enabled ? '🟢' : '🔴';
        const rolloutText = flag.enabled ? ` (${flag.rolloutPercentage}%)` : '';
        console.log(`  ${statusIcon} ${flag.name}${rolloutText}`);
      });

      // Active rollouts
      if (status.rollouts.length > 0) {
        console.log(chalk.cyan(`\n📈 Active Rollouts (${status.rollouts.length}):`));
        status.rollouts.forEach((rollout: any) => {
          console.log(`  🔄 ${rollout.flagName}: Stage ${rollout.currentStage}/${rollout.totalStages} (${rollout.status})`);
        });
      }

      // Recent alerts
      if (status.alerts.length > 0) {
        console.log(chalk.yellow(`\n⚠️  Recent Alerts (${status.alerts.length}):`));
        status.alerts.slice(0, 5).forEach((alert: any) => {
          const severityColor = alert.severity === 'critical' ? 'red' :
            alert.severity === 'high' ? 'yellow' : 'white';
          console.log(chalk[severityColor](`  ${alert.severity.toUpperCase()}: ${alert.message}`));
        });
      }

    } catch (error) {
      console.error(chalk.red(`❌ Failed to get status: ${error.message}`));
    }
  }

  private async shutdownSystem(): Promise<void> {
    try {
      console.log(chalk.yellow('🛑 Shutting down Phase 4 system...'));
      await this.system.shutdown();
      console.log(chalk.green('✅ System shutdown complete'));
    } catch (error) {
      console.error(chalk.red(`❌ Shutdown failed: ${error.message}`));
    }
  }

  private async listFlags(options: any): Promise<void> {
    try {
      const flags = this.system.flagManager.getAllFlags();
      let filteredFlags = flags;

      if (options.enabled) {
        filteredFlags = flags.filter(f => f.enabled);
      } else if (options.disabled) {
        filteredFlags = flags.filter(f => !f.enabled);
      }

      console.log(chalk.blue.bold(`\n🏁 Feature Flags (${filteredFlags.length}):\n`));

      filteredFlags.forEach(flag => {
        const statusIcon = flag.enabled ? '🟢' : '🔴';
        const rolloutText = flag.enabled ? ` [${flag.rolloutPercentage}%]` : '';
        console.log(`${statusIcon} ${flag.name}${rolloutText}`);
        console.log(chalk.gray(`   ${flag.metadata.description}`));
        console.log(chalk.gray(`   Category: ${flag.metadata.category} | Phase: ${flag.metadata.phase}`));
        console.log();
      });

    } catch (error) {
      console.error(chalk.red(`❌ Failed to list flags: ${error.message}`));
    }
  }

  private async enableFlag(flagName: string): Promise<void> {
    try {
      await this.system.flagManager.enableFlag(flagName);
      console.log(chalk.green(`✅ Enabled flag: ${flagName}`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to enable flag: ${error.message}`));
    }
  }

  private async disableFlag(flagName: string): Promise<void> {
    try {
      await this.system.flagManager.disableFlag(flagName);
      console.log(chalk.green(`✅ Disabled flag: ${flagName}`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to disable flag: ${error.message}`));
    }
  }

  private async setRolloutPercentage(flagName: string, percentage: string): Promise<void> {
    try {
      const pct = parseInt(percentage, 10);
      if (isNaN(pct) || pct < 0 || pct > 100) {
        console.error(chalk.red('❌ Percentage must be between 0 and 100'));
        return;
      }

      await this.system.flagManager.increaseRollout(flagName, pct);
      console.log(chalk.green(`✅ Set rollout for ${flagName} to ${pct}%`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to set rollout: ${error.message}`));
    }
  }

  private async checkFlag(flagName: string, options: any): Promise<void> {
    try {
      const isEnabled = await this.system.isFeatureEnabled(flagName, options.user);
      const statusText = isEnabled ? 'ENABLED' : 'DISABLED';
      const color = isEnabled ? 'green' : 'red';

      console.log(chalk[color](`🏁 Flag ${flagName} is ${statusText}`));

      if (options.user) {
        console.log(chalk.gray(`   For user: ${options.user}`));
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to check flag: ${error.message}`));
    }
  }

  private async createRolloutPlan(flagName: string): Promise<void> {
    try {
      const planId = await this.system.startGradualRollout(flagName);
      console.log(chalk.green(`✅ Created rollout plan: ${planId}`));
      console.log(chalk.cyan('📋 Plan stages:'));
      console.log('   Stage 1: 5% (2 days)');
      console.log('   Stage 2: 10% (Week 5)');
      console.log('   Stage 3: 25% (Week 6, requires approval)');
    } catch (error) {
      console.error(chalk.red(`❌ Failed to create rollout plan: ${error.message}`));
    }
  }

  private async startRollout(planId: string): Promise<void> {
    try {
      await this.system.rolloutController.startRollout(planId);
      console.log(chalk.green(`✅ Started rollout: ${planId}`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to start rollout: ${error.message}`));
    }
  }

  private async showRolloutStatus(planId?: string): Promise<void> {
    try {
      if (planId) {
        const plan = this.system.rolloutController.getRolloutStatus(planId);
        if (!plan) {
          console.error(chalk.red(`❌ Plan not found: ${planId}`));
          return;
        }

        console.log(chalk.blue.bold(`\n📈 Rollout Status: ${plan.id}\n`));
        console.log(`Flag: ${plan.flagName}`);
        console.log(`Status: ${plan.status}`);
        console.log(`Current Stage: ${plan.currentStage + 1}/${plan.stages.length}`);

        if (plan.currentStage < plan.stages.length) {
          const stage = plan.stages[plan.currentStage];
          console.log(`Next Target: ${stage.targetPercentage}%`);
          console.log(`Auto Progress: ${stage.autoProgress ? 'Yes' : 'No (requires approval)'}`);
        }
      } else {
        const rollouts = this.system.rolloutController.getActiveRollouts();
        console.log(chalk.blue.bold(`\n📈 Active Rollouts (${rollouts.length}):\n`));

        rollouts.forEach(rollout => {
          console.log(`${rollout.id}`);
          console.log(`  Flag: ${rollout.flagName}`);
          console.log(`  Stage: ${rollout.currentStage + 1}/${rollout.stages.length}`);
          console.log(`  Status: ${rollout.status}`);
          console.log();
        });
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to show rollout status: ${error.message}`));
    }
  }

  private async approveStage(planId: string): Promise<void> {
    try {
      await this.system.rolloutController.approveNextStage(planId);
      console.log(chalk.green(`✅ Approved next stage for plan: ${planId}`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to approve stage: ${error.message}`));
    }
  }

  private async rollbackDeployment(planId: string, reason?: string): Promise<void> {
    try {
      await this.system.rolloutController.rollbackRollout(planId, reason || 'Manual rollback');
      console.log(chalk.yellow(`🔄 Rolled back deployment: ${planId}`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to rollback: ${error.message}`));
    }
  }

  private async showRolloutHistory(flagName?: string): Promise<void> {
    try {
      const history = this.system.rolloutController.getRolloutHistory(flagName);

      console.log(chalk.blue.bold(`\n📚 Rollout History (${history.length}):\n`));

      history.forEach(plan => {
        const statusColor = plan.status === 'completed' ? 'green' :
          plan.status === 'failed' || plan.status === 'rolled_back' ? 'red' : 'yellow';

        console.log(chalk[statusColor](`${plan.id} (${plan.status.toUpperCase()})`));
        console.log(`  Flag: ${plan.flagName}`);
        console.log(`  Created: ${new Date(plan.createdAt).toLocaleString()}`);
        if (plan.completedAt) {
          console.log(`  Completed: ${new Date(plan.completedAt).toLocaleString()}`);
        }
        if (plan.failureReason) {
          console.log(chalk.red(`  Reason: ${plan.failureReason}`));
        }
        console.log();
      });
    } catch (error) {
      console.error(chalk.red(`❌ Failed to show history: ${error.message}`));
    }
  }

  private async showDashboard(options: any): Promise<void> {
    try {
      const dashboardData = await this.system.monitor.generateDashboardData();

      console.log(chalk.blue.bold('\n📊 Monitoring Dashboard\n'));

      // System health
      const healthColor = dashboardData.systemHealth.overallStatus === 'healthy' ? 'green' :
        dashboardData.systemHealth.overallStatus === 'warning' ? 'yellow' : 'red';
      console.log(chalk[healthColor](`🏥 System Health: ${dashboardData.systemHealth.overallStatus.toUpperCase()}`));

      console.log(`📈 Active Rollouts: ${dashboardData.systemHealth.activeRollouts}`);
      console.log(`📊 Average Error Rate: ${(dashboardData.systemHealth.avgErrorRate * 100).toFixed(2)}%`);
      console.log(`✅ Average Success Rate: ${(dashboardData.systemHealth.avgSuccessRate * 100).toFixed(2)}%`);

      // Performance
      console.log(chalk.cyan('\n⚡ Performance:'));
      console.log(`Response Time: ${dashboardData.performance.responseTime}ms`);
      console.log(`Memory Usage: ${dashboardData.performance.memoryUsage.toFixed(1)}MB`);
      console.log(`CPU Usage: ${dashboardData.performance.cpuUsage.toFixed(1)}s`);

      console.log(chalk.gray(`\n💡 Dashboard would be available at http://localhost:${options.port}`));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to show dashboard: ${error.message}`));
    }
  }

  private async showAlerts(options: any): Promise<void> {
    try {
      const dashboardData = await this.system.monitor.generateDashboardData();
      let alerts = dashboardData.alerts;

      if (options.severity) {
        alerts = alerts.filter(alert => alert.severity === options.severity);
      }

      console.log(chalk.blue.bold(`\n⚠️  Alerts (${alerts.length}):\n`));

      if (alerts.length === 0) {
        console.log(chalk.green('🎉 No active alerts!'));
        return;
      }

      alerts.forEach(alert => {
        const severityColor = alert.severity === 'critical' ? 'red' :
          alert.severity === 'high' ? 'yellow' :
          alert.severity === 'medium' ? 'cyan' : 'white';

        console.log(chalk[severityColor](`${alert.severity.toUpperCase()}: ${alert.message}`));
        console.log(chalk.gray(`  Time: ${new Date(alert.timestamp).toLocaleString()}`));
        if (alert.flagName) {
          console.log(chalk.gray(`  Flag: ${alert.flagName}`));
        }
        console.log();
      });
    } catch (error) {
      console.error(chalk.red(`❌ Failed to show alerts: ${error.message}`));
    }
  }

  private async showMetrics(options: any): Promise<void> {
    try {
      const metrics = this.system.flagManager.getMetrics(options.flag);

      console.log(chalk.blue.bold(`\n📈 Metrics${options.flag ? ` for ${options.flag}` : ''}:\n`));

      metrics.forEach(metric => {
        console.log(chalk.cyan(`🏁 ${metric.flagName}:`));
        console.log(`  Current Rollout: ${metric.currentPercentage}%`);
        console.log(`  Target Rollout: ${metric.targetPercentage}%`);
        console.log(`  Success Rate: ${(metric.successRate * 100).toFixed(2)}%`);
        console.log(`  Error Rate: ${(metric.errorRate * 100).toFixed(2)}%`);
        console.log(`  User Count: ${metric.userCount}`);
        console.log(`  Last Updated: ${new Date(metric.lastUpdated).toLocaleString()}`);
        console.log();
      });

      // System metrics
      const validatorMetrics = this.system.validator.getSystemMetrics();
      const interceptorMetrics = this.system.interceptor.getSystemMetrics();

      console.log(chalk.cyan('🔍 Validation Metrics:'));
      console.log(`  Total Validations: ${validatorMetrics.totalValidations}`);
      console.log(`  Average Truth Score: ${(validatorMetrics.avgTruthScore * 100).toFixed(2)}%`);
      console.log(`  Consensus Nodes: ${validatorMetrics.consensusNodes}`);

      console.log(chalk.cyan('\n🪝 Hook Metrics:'));
      console.log(`  Total Executions: ${interceptorMetrics.totalExecutions}`);
      console.log(`  Running Processes: ${interceptorMetrics.runningProcesses}`);
    } catch (error) {
      console.error(chalk.red(`❌ Failed to show metrics: ${error.message}`));
    }
  }

  private async generateReport(options: any): Promise<void> {
    try {
      const report = await this.system.generateDeploymentReport();

      const output = JSON.stringify(report, null, 2);

      if (options.output) {
        await require('fs').promises.writeFile(options.output, output);
        console.log(chalk.green(`✅ Report saved to: ${options.output}`));
      } else {
        console.log(output);
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to generate report: ${error.message}`));
    }
  }

  private async emergencyDisable(reason: string): Promise<void> {
    try {
      console.log(chalk.red.bold('🚨 EMERGENCY DISABLE INITIATED'));
      await this.system.emergencyDisable(reason);
      console.log(chalk.yellow('⚠️  All features have been disabled'));
      console.log(chalk.gray(`Reason: ${reason}`));
    } catch (error) {
      console.error(chalk.red(`❌ Emergency disable failed: ${error.message}`));
    }
  }

  private async emergencyRollback(flagName: string, reason: string): Promise<void> {
    try {
      console.log(chalk.red.bold(`🚨 EMERGENCY ROLLBACK: ${flagName}`));
      await this.system.flagManager.rollback(flagName, reason);
      console.log(chalk.yellow(`⚠️  Flag ${flagName} has been rolled back`));
      console.log(chalk.gray(`Reason: ${reason}`));
    } catch (error) {
      console.error(chalk.red(`❌ Emergency rollback failed: ${error.message}`));
    }
  }

  private async validateTask(taskId: string, options: any): Promise<void> {
    try {
      const task = {
        id: taskId,
        description: options.description || `Validation for task ${taskId}`,
        context: { timestamp: Date.now() },
        userId: options.user || 'cli-user'
      };

      const result = await this.system.validateTaskCompletion(task);

      console.log(chalk.blue.bold(`\n🔍 Validation Results for ${taskId}:\n`));
      console.log(`Valid: ${result.isValid ? '✅' : '❌'}`);
      console.log(`Truth Score: ${(result.truthScore * 100).toFixed(2)}%`);
      console.log(`Method: ${result.metadata.method}`);
      console.log(`Confidence: ${(result.metadata.confidence * 100).toFixed(2)}%`);
      console.log(`Consensus Nodes: ${result.consensusNodes}`);
      console.log(`Timestamp: ${result.timestamp}`);
    } catch (error) {
      console.error(chalk.red(`❌ Validation failed: ${error.message}`));
    }
  }

  private async executeHook(hookType: string, options: any): Promise<void> {
    try {
      if (!options.command) {
        console.error(chalk.red('❌ Command is required'));
        return;
      }

      const execution = {
        hookType: hookType as any,
        command: options.command,
        args: options.args || [],
        timestamp: new Date().toISOString(),
        userId: 'cli-user'
      };

      console.log(chalk.blue(`🪝 Executing ${hookType} hook...`));
      const result = await this.system.executeHook(execution);

      console.log(`Success: ${result.success ? '✅' : '❌'}`);
      console.log(`Duration: ${result.duration}ms`);
      console.log(`Exit Code: ${result.exitCode}`);

      if (result.relaunchAttempts > 0) {
        console.log(`Relaunch Attempts: ${result.relaunchAttempts}`);
      }

      if (result.output) {
        console.log(chalk.cyan('\n📤 Output:'));
        console.log(result.output);
      }

      if (result.error) {
        console.log(chalk.red('\n❌ Error:'));
        console.log(result.error);
      }
    } catch (error) {
      console.error(chalk.red(`❌ Hook execution failed: ${error.message}`));
    }
  }

  run(argv?: string[]): void {
    this.program.parse(argv);
  }
}

// Export for CLI usage
export default function createCLI(): Phase4CLI {
  return new Phase4CLI();
}