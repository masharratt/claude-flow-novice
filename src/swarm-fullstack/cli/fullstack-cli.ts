#!/usr/bin/env node

/**
 * Full-Stack Swarm CLI - Command-line interface for full-stack swarm development
 */

import { Command } from 'commander';
import { Chalk } from 'chalk';
const chalk = new Chalk();
import inquirer from 'inquirer';
import ora from 'ora';
import boxen from 'boxen';
import { table } from 'table';
import { FullStackOrchestrator, FeatureRequest } from '../core/fullstack-orchestrator.js';
import { Logger } from '../../core/logger.js';
import { ChromeMCPAdapter } from '../adapters/chrome-mcp-adapter.js';
import { ShadcnMCPAdapter } from '../adapters/shadcn-mcp-adapter.js';

const logger = new Logger({ level: 'info', format: 'text', destination: 'console' }, { service: 'FullStackCLI' });
const program = new Command();

// Global orchestrator instance
let orchestrator: FullStackOrchestrator | null = null;

// CLI Header
const showHeader = () => {
  console.log(
    boxen(
      chalk.bold.blue('🚀 Full-Stack Swarm Development System\n') +
      chalk.gray('Dynamic Agent Teams • Chrome MCP • shadcn/ui • Automated Testing'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'blue'
      }
    )
  );
};

// Initialize orchestrator
const initializeOrchestrator = async () => {
  if (!orchestrator) {
    const spinner = ora('Initializing Full-Stack Orchestrator...').start();

    try {
      orchestrator = new FullStackOrchestrator({
        maxConcurrentSwarms: 5,
        enableAutomatedTesting: true,
        enableUIGeneration: true,
        chromeMCP: { enabled: true, timeout: 30000 },
        shadcnMCP: { enabled: true, defaultTheme: 'default' }
      }, logger);

      spinner.succeed('Orchestrator initialized successfully');
      return orchestrator;
    } catch (error) {
      spinner.fail(`Initialization failed: ${error.message}`);
      process.exit(1);
    }
  }
  return orchestrator;
};

// Command: Develop Feature
program
  .command('develop')
  .description('Start full-stack feature development with dynamic swarm team')
  .option('-i, --interactive', 'Interactive mode for feature specification')
  .option('-f, --file <path>', 'Load feature specification from JSON file')
  .option('--name <name>', 'Feature name')
  .option('--description <description>', 'Feature description')
  .option('--complexity <level>', 'Complexity level: simple, moderate, complex, enterprise')
  .option('--frontend <components...>', 'Frontend components required')
  .option('--backend <services...>', 'Backend services required')
  .option('--ui-theme <theme>', 'UI theme for shadcn components')
  .option('--timeline <days>', 'Development timeline in days', parseInt)
  .option('--quality <level>', 'Quality level: standard, high, enterprise')
  .action(async (options) => {
    showHeader();

    const orchestrator = await initializeOrchestrator();

    let featureSpec: FeatureRequest;

    if (options.interactive || (!options.file && !options.name)) {
      // Interactive mode
      featureSpec = await promptForFeatureSpec();
    } else if (options.file) {
      // Load from file
      const fs = await import('fs-extra');
      featureSpec = await fs.readJson(options.file);
    } else {
      // Command line options
      featureSpec = {
        id: `feature_${Date.now()}`,
        name: options.name,
        description: options.description || 'Feature development',
        requirements: {
          frontend: options.frontend || [],
          backend: options.backend || []
        },
        constraints: {
          timeline: options.timeline,
          quality: options.quality || 'standard'
        },
        uiSpec: options.uiTheme ? {
          components: options.frontend || [],
          theme: options.uiTheme,
          responsive: true,
          accessibility: true
        } : undefined
      };
    }

    // Start development
    const spinner = ora(`Starting feature development: ${featureSpec.name}`).start();

    try {
      const status = await orchestrator.developFeature(featureSpec);
      spinner.succeed(`Feature development started successfully`);

      console.log('\n' + chalk.green('✅ Development Status:'));
      displaySwarmStatus(status);

      // Monitor progress
      await monitorSwarmProgress(status.swarmId, orchestrator);

    } catch (error) {
      spinner.fail(`Feature development failed: ${error.message}`);
      console.error(chalk.red('\n❌ Error Details:'), error);
    }
  });

// Command: Status
program
  .command('status')
  .description('Show status of all active swarms')
  .option('-s, --swarm <swarmId>', 'Show specific swarm status')
  .option('-w, --watch', 'Watch mode - continuously update status')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    const orchestrator = await initializeOrchestrator();

    if (options.watch) {
      // Watch mode
      console.clear();
      showHeader();

      const updateStatus = async () => {
        console.log(chalk.yellow('\n📊 Real-time Swarm Status (updating every 5s)\n'));

        if (options.swarm) {
          const status = orchestrator.getSwarmStatus(options.swarm);
          if (status) {
            displaySwarmStatus(status);
          } else {
            console.log(chalk.red(`Swarm ${options.swarm} not found`));
          }
        } else {
          const swarms = orchestrator.getActiveSwarms();
          if (swarms.length === 0) {
            console.log(chalk.gray('No active swarms'));
          } else {
            displaySwarmTable(swarms);
          }
        }
      };

      // Initial update
      await updateStatus();

      // Set interval for updates
      setInterval(async () => {
        console.clear();
        showHeader();
        await updateStatus();
      }, 5000);

    } else {
      // Single status check
      if (options.swarm) {
        const status = orchestrator.getSwarmStatus(options.swarm);
        if (status) {
          if (options.json) {
            console.log(JSON.stringify(status, null, 2));
          } else {
            displaySwarmStatus(status);
          }
        } else {
          console.log(chalk.red(`Swarm ${options.swarm} not found`));
        }
      } else {
        const swarms = orchestrator.getActiveSwarms();
        if (options.json) {
          console.log(JSON.stringify(swarms, null, 2));
        } else {
          if (swarms.length === 0) {
            console.log(chalk.gray('No active swarms'));
          } else {
            displaySwarmTable(swarms);
          }
        }
      }
    }
  });

// Command: Scale
program
  .command('scale')
  .description('Scale existing swarm team')
  .requiredOption('-s, --swarm <swarmId>', 'Swarm ID to scale')
  .requiredOption('-a, --action <action>', 'Scaling action: scale-up, scale-down, rebalance')
  .option('-t, --target <size>', 'Target team size', parseInt)
  .option('-r, --reason <reason>', 'Reason for scaling')
  .action(async (options) => {
    const orchestrator = await initializeOrchestrator();

    const spinner = ora(`Scaling swarm ${options.swarm}...`).start();

    try {
      const updatedStatus = await orchestrator.scaleSwarm(options.swarm, {
        action: options.action,
        targetSize: options.target,
        reason: options.reason || 'Manual scaling request'
      });

      spinner.succeed(`Swarm scaled successfully`);
      console.log('\n' + chalk.green('✅ Updated Status:'));
      displaySwarmStatus(updatedStatus);

    } catch (error) {
      spinner.fail(`Scaling failed: ${error.message}`);
    }
  });

// Command: Terminate
program
  .command('terminate')
  .description('Terminate active swarm')
  .requiredOption('-s, --swarm <swarmId>', 'Swarm ID to terminate')
  .option('-r, --reason <reason>', 'Termination reason')
  .option('-f, --force', 'Force termination without confirmation')
  .action(async (options) => {
    const orchestrator = await initializeOrchestrator();

    // Confirmation unless forced
    if (!options.force) {
      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to terminate swarm ${options.swarm}?`,
          default: false
        }
      ]);

      if (!confirm) {
        console.log(chalk.yellow('Termination cancelled'));
        return;
      }
    }

    const spinner = ora(`Terminating swarm ${options.swarm}...`).start();

    try {
      await orchestrator.terminateSwarm(options.swarm, options.reason || 'Manual termination');
      spinner.succeed(`Swarm terminated successfully`);
    } catch (error) {
      spinner.fail(`Termination failed: ${error.message}`);
    }
  });

// Command: Health
program
  .command('health')
  .description('Show system health and diagnostics')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    const orchestrator = await initializeOrchestrator();

    const health = orchestrator.getOrchestratorStatus();

    if (options.json) {
      console.log(JSON.stringify(health, null, 2));
    } else {
      displaySystemHealth(health);
    }
  });

// Command: Chrome MCP Test
program
  .command('chrome-test')
  .description('Test Chrome MCP integration')
  .option('-u, --url <url>', 'URL to test', 'https://example.com')
  .action(async (options) => {
    const spinner = ora('Testing Chrome MCP integration...').start();

    try {
      const chromeMCP = new ChromeMCPAdapter({
        timeout: 30000,
        retries: 3,
        version: '1.0.0',
        capabilities: []
      }, logger);

      await chromeMCP.connect();

      // Test navigation
      const navResult = await chromeMCP.navigate(options.url);

      if (navResult.success) {
        // Test screenshot
        const screenshotResult = await chromeMCP.screenshot();

        if (screenshotResult.success) {
          spinner.succeed('Chrome MCP integration test passed');
          console.log(chalk.green('✅ Chrome MCP is working correctly'));
          console.log(`📍 Navigated to: ${options.url}`);
          console.log(`📸 Screenshot captured successfully`);
        } else {
          throw new Error('Screenshot test failed');
        }
      } else {
        throw new Error('Navigation test failed');
      }

      await chromeMCP.disconnect();

    } catch (error) {
      spinner.fail(`Chrome MCP test failed: ${error.message}`);
    }
  });

// Command: shadcn Generate
program
  .command('shadcn-generate')
  .description('Generate shadcn/ui components')
  .requiredOption('-c, --component <name>', 'Component name to generate')
  .option('-v, --variant <variant>', 'Component variant')
  .option('-t, --theme <theme>', 'Theme to use', 'default')
  .option('-o, --output <path>', 'Output directory', './components')
  .action(async (options) => {
    const spinner = ora(`Generating ${options.component} component...`).start();

    try {
      const shadcnMCP = new ShadcnMCPAdapter({
        timeout: 30000,
        defaultTheme: options.theme
      }, logger);

      await shadcnMCP.connect();

      const result = await shadcnMCP.generateComponent({
        component: options.component,
        variant: options.variant,
        theme: options.theme
      });

      if (result.success) {
        // Write files
        const fs = await import('fs-extra');
        const path = await import('path');

        await fs.ensureDir(options.output);

        for (const file of result.files) {
          const filePath = path.join(options.output, file.path);
          await fs.ensureDir(path.dirname(filePath));
          await fs.writeFile(filePath, file.content);
        }

        spinner.succeed(`${options.component} component generated successfully`);
        console.log(chalk.green('✅ Component Details:'));
        console.log(`📦 Component: ${result.component.name}`);
        console.log(`📁 Files: ${result.files.length}`);
        console.log(`📋 Dependencies: ${result.component.dependencies.join(', ')}`);

      } else {
        throw new Error(result.error || 'Component generation failed');
      }

      await shadcnMCP.disconnect();

    } catch (error) {
      spinner.fail(`Component generation failed: ${error.message}`);
    }
  });

// Helper Functions

async function promptForFeatureSpec(): Promise<FeatureRequest> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Feature name:',
      validate: (input) => input.length > 0 || 'Feature name is required'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Feature description:',
      default: 'New feature development'
    },
    {
      type: 'list',
      name: 'complexity',
      message: 'Complexity level:',
      choices: ['simple', 'moderate', 'complex', 'enterprise']
    },
    {
      type: 'checkbox',
      name: 'frontend',
      message: 'Frontend requirements:',
      choices: [
        'user-interface',
        'responsive-design',
        'forms',
        'data-visualization',
        'animations',
        'authentication-ui'
      ]
    },
    {
      type: 'checkbox',
      name: 'backend',
      message: 'Backend requirements:',
      choices: [
        'rest-api',
        'graphql-api',
        'database-integration',
        'authentication',
        'file-upload',
        'real-time-updates',
        'background-jobs'
      ]
    },
    {
      type: 'checkbox',
      name: 'testing',
      message: 'Testing requirements:',
      choices: [
        'unit-tests',
        'integration-tests',
        'e2e-tests',
        'performance-tests',
        'security-tests'
      ]
    },
    {
      type: 'number',
      name: 'timeline',
      message: 'Timeline (days):',
      default: 7
    },
    {
      type: 'list',
      name: 'quality',
      message: 'Quality level:',
      choices: ['standard', 'high', 'enterprise'],
      default: 'standard'
    },
    {
      type: 'confirm',
      name: 'includeUI',
      message: 'Include UI component generation?',
      default: true
    }
  ]);

  let uiSpec;
  if (answers.includeUI) {
    const uiAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'theme',
        message: 'UI theme:',
        default: 'default'
      },
      {
        type: 'confirm',
        name: 'responsive',
        message: 'Responsive design?',
        default: true
      },
      {
        type: 'confirm',
        name: 'accessibility',
        message: 'Accessibility features?',
        default: true
      }
    ]);

    uiSpec = {
      components: answers.frontend,
      theme: uiAnswers.theme,
      responsive: uiAnswers.responsive,
      accessibility: uiAnswers.accessibility
    };
  }

  return {
    id: `feature_${Date.now()}`,
    name: answers.name,
    description: answers.description,
    requirements: {
      frontend: answers.frontend,
      backend: answers.backend,
      testing: answers.testing
    },
    constraints: {
      timeline: answers.timeline,
      quality: answers.quality
    },
    uiSpec
  };
}

function displaySwarmStatus(status: any) {
  console.log(boxen(
    `${chalk.bold('Swarm ID:')} ${status.swarmId}\n` +
    `${chalk.bold('Feature:')} ${status.feature.name}\n` +
    `${chalk.bold('Status:')} ${getStatusColor(status.status)}\n` +
    `${chalk.bold('Progress:')} ${status.progress.overallProgress}% (${status.progress.currentPhase})\n` +
    `${chalk.bold('Team Size:')} ${status.team.agents?.length || 0} agents\n` +
    `${chalk.bold('Started:')} ${new Date(status.performance.startTime).toLocaleString()}`,
    {
      padding: 1,
      borderStyle: 'round',
      borderColor: getStatusBorderColor(status.status)
    }
  ));

  // Show team composition if available
  if (status.team.agents && status.team.agents.length > 0) {
    console.log(`\n${chalk.bold('👥 Team Composition:')}`);
    const teamData = status.team.agents.map((agent: any) => [
      agent.type,
      agent.status,
      agent.capabilities?.slice(0, 3).join(', ') || 'N/A'
    ]);

    console.log(table([
      ['Agent Type', 'Status', 'Key Capabilities'],
      ...teamData
    ]));
  }

  // Show issues if any
  if (status.issues.blocking.length > 0 || status.issues.warnings.length > 0) {
    console.log(`\n${chalk.bold('⚠️ Issues:')}`);
    status.issues.blocking.forEach((issue: string) => {
      console.log(chalk.red(`  🔴 ${issue}`));
    });
    status.issues.warnings.forEach((issue: string) => {
      console.log(chalk.yellow(`  🟡 ${issue}`));
    });
  }
}

function displaySwarmTable(swarms: any[]) {
  const data = swarms.map(swarm => [
    swarm.swarmId.substring(0, 12) + '...',
    swarm.feature.name,
    getStatusColor(swarm.status),
    `${swarm.progress.overallProgress}%`,
    `${swarm.team.agents?.length || 0}`,
    new Date(swarm.performance.startTime).toLocaleTimeString()
  ]);

  console.log(table([
    ['Swarm ID', 'Feature', 'Status', 'Progress', 'Agents', 'Started'],
    ...data
  ]));
}

function displaySystemHealth(health: any) {
  console.log(boxen(
    `${chalk.bold('System Status:')} ${getHealthColor(health.status)}\n` +
    `${chalk.bold('Active Swarms:')} ${health.activeSwarms}\n` +
    `${chalk.bold('Total Agents:')} ${health.totalAgents}\n` +
    `${chalk.bold('Success Rate:')} ${(health.performance.successRate * 100).toFixed(1)}%`,
    {
      padding: 1,
      borderStyle: 'round',
      borderColor: getHealthBorderColor(health.status)
    }
  ));

  console.log(`\n${chalk.bold('🔧 Component Health:')}`);
  const healthData = Object.entries(health.systemHealth).map(([component, healthy]) => [
    component,
    healthy ? chalk.green('✅ Healthy') : chalk.red('❌ Unhealthy')
  ]);

  console.log(table([
    ['Component', 'Status'],
    ...healthData
  ]));
}

function getStatusColor(status: string): string {
  const colors: Record<string, any> = {
    'planning': chalk.blue(status),
    'spawning': chalk.yellow(status),
    'developing': chalk.cyan(status),
    'testing': chalk.magenta(status),
    'deploying': chalk.rgb(255, 165, 0)(status),
    'completed': chalk.green(status),
    'failed': chalk.red(status)
  };
  return colors[status] || chalk.gray(status);
}

function getStatusBorderColor(status: string): string {
  const colors: Record<string, string> = {
    'completed': 'green',
    'failed': 'red',
    'developing': 'cyan',
    'testing': 'magenta'
  };
  return colors[status] || 'yellow';
}

function getHealthColor(status: string): string {
  const colors: Record<string, any> = {
    'healthy': chalk.green(status),
    'degraded': chalk.yellow(status),
    'critical': chalk.red(status)
  };
  return colors[status] || chalk.gray(status);
}

function getHealthBorderColor(status: string): string {
  const colors: Record<string, string> = {
    'healthy': 'green',
    'degraded': 'yellow',
    'critical': 'red'
  };
  return colors[status] || 'gray';
}

async function monitorSwarmProgress(swarmId: string, orchestrator: FullStackOrchestrator) {
  const spinner = ora('Monitoring progress...').start();

  let previousProgress = -1;
  const maxWait = 300000; // 5 minutes max wait
  const startTime = Date.now();

  const checkProgress = async (): Promise<boolean> => {
    const status = orchestrator.getSwarmStatus(swarmId);

    if (!status) {
      spinner.fail('Swarm not found');
      return true; // Stop monitoring
    }

    const currentProgress = status.progress.overallProgress;

    if (currentProgress !== previousProgress) {
      spinner.text = `Progress: ${currentProgress}% - ${status.progress.currentPhase}`;
      previousProgress = currentProgress;
    }

    if (status.status === 'completed') {
      spinner.succeed(`Feature development completed! Final progress: ${currentProgress}%`);
      return true; // Stop monitoring
    }

    if (status.status === 'failed') {
      spinner.fail(`Feature development failed at ${currentProgress}%`);
      return true; // Stop monitoring
    }

    // Check for timeout
    if (Date.now() - startTime > maxWait) {
      spinner.warn('Monitoring timeout reached - check status manually');
      return true; // Stop monitoring
    }

    return false; // Continue monitoring
  };

  // Initial check
  if (await checkProgress()) return;

  // Set up interval monitoring
  const interval = setInterval(async () => {
    if (await checkProgress()) {
      clearInterval(interval);
    }
  }, 2000); // Check every 2 seconds
}

// Program configuration
program
  .name('fullstack-cli')
  .description('Full-Stack Swarm Development CLI')
  .version('1.0.0');

// Parse command line arguments
program.parse();

export { program };