/**
 * Validate Coordination CLI Command
 *
 * Validates Redis pub/sub coordination during epic execution
 * and generates comprehensive coordination reports.
 *
 * @module cli/commands/validate-coordination
 */

import { Command } from 'commander';
import chalk from 'chalk';
import Table from 'cli-table3';
import Redis from 'ioredis';
import { CoordinationValidator } from '../../cfn-loop/coordination-validator.js';
import { EpicReportGenerator } from '../../cfn-loop/epic-report-generator.js';

/**
 * Validate coordination command
 */
export const validateCoordinationCommand = new Command()
  .name('validate:coordination')
  .description('Validate Redis pub/sub coordination for epic execution')
  .requiredOption('--epic-id <id>', 'Epic ID to validate')
  .option('--redis-url <url>', 'Redis connection URL', 'redis://localhost:6379')
  .option('--full-report', 'Generate full markdown report')
  .option('--save-report', 'Save report to Redis')
  .option('--json', 'Output in JSON format')
  .option(
    '--min-messages <count>',
    'Minimum expected messages',
    (val) => parseInt(val, 10),
    10
  )
  .option(
    '--required-channels <channels>',
    'Required channels (comma-separated)',
    'sprint:coordination,agent:lifecycle,interface:ready'
  )
  .action(async (options: any) => {
    await validateCoordination(options);
  });

/**
 * Validate coordination for epic
 */
async function validateCoordination(options: any): Promise<void> {
  const redis = new Redis(options.redisUrl);
  let exitCode = 0;

  try {
    console.log(chalk.blue('🔍 Coordination Validation\n'));
    console.log(chalk.gray(`Epic: ${options.epicId}`));
    console.log(chalk.gray(`Redis: ${options.redisUrl}`));
    console.log();

    // Create validator
    const requiredChannels = options.requiredChannels.split(',');
    const validator = new CoordinationValidator({
      redis,
      requiredChannels,
      minMessages: options.minMessages,
    });

    // Run validation
    const result = await validator.validateEpicCoordination(options.epicId);

    // Output results
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      displayValidationResults(result);
    }

    // Generate full report if requested
    if (options.fullReport) {
      const generator = new EpicReportGenerator({ redis });
      const report = await generator.generateReport(options.epicId);

      console.log('\n');
      console.log(chalk.blue('📄 Full Epic Report\n'));
      console.log(report.markdown);

      // Save report if requested
      if (options.saveReport) {
        await generator.saveReport(options.epicId, report);
        console.log(
          chalk.green(
            `\n✅ Report saved to Redis (key: epic:${options.epicId}:report)`
          )
        );
      }
    }

    // Set exit code based on validation
    if (!result.valid) {
      exitCode = 1;
      console.log(chalk.red('\n❌ Coordination validation FAILED'));
    } else {
      console.log(chalk.green('\n✅ Coordination validation PASSED'));
    }
  } catch (error) {
    console.error(chalk.red('\n❌ Validation error:'), (error as Error).message);
    exitCode = 1;
  } finally {
    await redis.quit();
    process.exit(exitCode);
  }
}

/**
 * Display validation results in terminal
 */
function displayValidationResults(result: any): void {
  const scorePercent = (result.score * 100).toFixed(1);
  const scoreColor = result.score >= 0.9 ? 'green' : result.score >= 0.75 ? 'yellow' : 'red';

  console.log(chalk.bold('Coordination Validation Report'));
  console.log(
    chalk.gray('='.repeat(60))
  );
  console.log();

  // Overall status
  console.log(chalk.bold('Overall Status:'), result.valid ? chalk.green('PASSED ✅') : chalk.red('FAILED ❌'));
  console.log(chalk.bold('Score:'), chalk[scoreColor](`${scorePercent}%`));
  console.log();

  // Metrics table
  const metricsTable = new Table({
    head: [chalk.cyan('Metric'), chalk.cyan('Value'), chalk.cyan('Status')],
    colWidths: [30, 20, 10],
  });

  metricsTable.push(
    [
      'Total Messages',
      result.metrics.totalMessages.toString(),
      result.metrics.totalMessages >= 10 ? chalk.green('✅') : chalk.red('❌'),
    ],
    [
      'Coordinators',
      result.metrics.coordinators.length.toString(),
      result.metrics.coordinators.length > 0 ? chalk.green('✅') : chalk.red('❌'),
    ],
    [
      'Channels Used',
      result.metrics.channelsUsed.length.toString(),
      result.metrics.channelsUsed.length >= 3 ? chalk.green('✅') : chalk.yellow('⚠️'),
    ],
    [
      'Dependency Waiting',
      result.metrics.dependencyWaiting ? 'Yes' : 'No',
      result.metrics.dependencyWaiting ? chalk.green('✅') : chalk.yellow('⚠️'),
    ],
    [
      'Interface Publishing',
      result.metrics.interfacePublishing ? 'Yes' : 'No',
      result.metrics.interfacePublishing ? chalk.green('✅') : chalk.yellow('⚠️'),
    ],
    [
      'Agent Lifecycle',
      result.metrics.agentLifecycleTracking ? 'Yes' : 'No',
      result.metrics.agentLifecycleTracking ? chalk.green('✅') : chalk.yellow('⚠️'),
    ],
    [
      'Test Coordination',
      result.metrics.testCoordination ? 'Yes' : 'No',
      result.metrics.testCoordination ? chalk.green('✅') : chalk.yellow('ℹ️'),
    ]
  );

  console.log(metricsTable.toString());
  console.log();

  // Coordinators
  if (result.metrics.coordinators.length > 0) {
    console.log(chalk.bold('Coordinators:'));
    console.log(
      chalk.gray('  ' + result.metrics.coordinators.join(', '))
    );
    console.log();
  }

  // Channels
  if (result.metrics.channelsUsed.length > 0) {
    console.log(chalk.bold('Channels Used:'));
    console.log(
      chalk.gray('  ' + result.metrics.channelsUsed.join(', '))
    );
    console.log();
  }

  // Issues
  if (result.issues.length > 0) {
    console.log(chalk.bold('Issues Found:'));
    console.log();

    const issuesTable = new Table({
      head: [chalk.cyan('Severity'), chalk.cyan('Issue'), chalk.cyan('Description')],
      colWidths: [12, 30, 40],
      wordWrap: true,
    });

    for (const issue of result.issues) {
      const severityEmoji =
        issue.severity === 'critical'
          ? '🚨'
          : issue.severity === 'high'
          ? '⚠️'
          : issue.severity === 'medium'
          ? '💡'
          : 'ℹ️';

      const severityColor =
        issue.severity === 'critical'
          ? 'red'
          : issue.severity === 'high'
          ? 'yellow'
          : issue.severity === 'medium'
          ? 'blue'
          : 'gray';

      issuesTable.push([
        chalk[severityColor](`${severityEmoji} ${issue.severity.toUpperCase()}`),
        issue.issue,
        issue.description,
      ]);
    }

    console.log(issuesTable.toString());
    console.log();

    // Recommendations
    const recommendations = result.issues
      .filter((i: any) => i.recommendation)
      .map((i: any) => i.recommendation);

    if (recommendations.length > 0) {
      console.log(chalk.bold('Recommendations:'));
      for (const rec of recommendations) {
        console.log(chalk.yellow(`  • ${rec}`));
      }
      console.log();
    }
  }

  // Timeline sample
  if (result.metrics.timeline.length > 0) {
    console.log(chalk.bold('Timeline Sample (First 5 Events):'));
    console.log();

    const timelineTable = new Table({
      head: [
        chalk.cyan('Timestamp'),
        chalk.cyan('Channel'),
        chalk.cyan('Type'),
        chalk.cyan('Coordinator'),
      ],
      colWidths: [25, 25, 20, 20],
    });

    const sample = result.metrics.timeline.slice(0, 5);
    for (const event of sample) {
      const timestamp = new Date(event.timestamp).toISOString();
      timelineTable.push([
        chalk.gray(timestamp),
        event.channel,
        event.type,
        chalk.blue(event.coordinatorId),
      ]);
    }

    console.log(timelineTable.toString());
  }
}

export default validateCoordinationCommand;
