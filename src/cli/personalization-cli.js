// personalization-cli.js - Unified personalization CLI system
import process from 'process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { PreferenceManager } from '../personalization/preference-manager.js';
import { ResourceDelegation } from '../personalization/resource-delegation.js';
import { ContentFilter } from '../personalization/content-filter.js';
import { WorkflowOptimizer } from '../personalization/workflow-optimizer.js';
import { AnalyticsEngine } from '../personalization/analytics-engine.js';
import { PersonalizationAnalyzer } from '../personalization/analytics/personalization-analyzer.js';
import { PersonalizationDashboard } from '../personalization/analytics/personalization-dashboard.js';
import ora from 'ora';

/**
 * Main personalization CLI handler
 * Provides unified access to all personalization features
 */
export class PersonalizationCLI {
  constructor() {
    this.preferenceManager = new PreferenceManager();
    this.resourceDelegation = new ResourceDelegation(this.preferenceManager);
    this.contentFilter = new ContentFilter(this.preferenceManager);
    this.workflowOptimizer = new WorkflowOptimizer(this.preferenceManager);
    this.analyticsEngine = new AnalyticsEngine(this.preferenceManager);
    this.analyzer = new PersonalizationAnalyzer();
    this.dashboard = new PersonalizationDashboard();
  }

  /**
   * Main command handler
   */
  async handleCommand(args, flags) {
    const subcommand = args[0] || 'help';

    switch (subcommand) {
      case 'setup':
        return this.runSetupWizard(flags);
      case 'status':
        return this.showStatus(flags);
      case 'optimize':
        return this.getOptimizationSuggestions(flags);
      case 'analytics':
        return this.showAnalytics(flags);
      case 'resource':
        return this.handleResourceCommands(args.slice(1), flags);
      case 'preferences':
        return this.handlePreferenceCommands(args.slice(1), flags);
      case 'content':
        return this.handleContentCommands(args.slice(1), flags);
      case 'workflow':
        return this.handleWorkflowCommands(args.slice(1), flags);
      case 'dashboard':
        return this.showDashboard(flags);
      case 'export':
        return this.exportSettings(args.slice(1), flags);
      case 'import':
        return this.importSettings(args.slice(1), flags);
      case 'reset':
        return this.resetSettings(flags);
      case 'help':
      default:
        return this.showHelp();
    }
  }

  /**
   * Run the comprehensive setup wizard
   */
  async runSetupWizard(flags) {
    console.log(chalk.blue.bold('\n🧙‍♂️ Claude Flow Novice Personalization Setup Wizard'));
    console.log(chalk.gray('This wizard will help you configure personalized settings for your development workflow.\n'));

    try {
      const spinner = ora('Initializing personalization systems...').start();

      // Initialize all systems
      await this.preferenceManager.initialize();
      await this.analyticsEngine.initialize();

      spinner.succeed('Systems initialized');

      // Run the full setup wizard
      const wizardQuestions = [
        {
          type: 'list',
          name: 'experience',
          message: 'What is your experience level with AI development tools?',
          choices: [
            { name: '🌱 Beginner - New to AI tools and development workflows', value: 'beginner' },
            { name: '📈 Intermediate - Familiar with development, learning AI tools', value: 'intermediate' },
            { name: '🚀 Advanced - Experienced with AI tools and complex workflows', value: 'advanced' },
            { name: '👑 Expert - Deep expertise in AI development and optimization', value: 'expert' }
          ]
        },
        {
          type: 'list',
          name: 'projectType',
          message: 'What type of projects do you primarily work on?',
          choices: [
            'Web Development (Frontend/Backend)',
            'Data Science & Machine Learning',
            'DevOps & Infrastructure',
            'Research & Documentation',
            'Full-Stack Applications',
            'API & Microservices',
            'Mobile Development',
            'Mixed/Other'
          ]
        },
        {
          type: 'list',
          name: 'verbosity',
          message: 'How detailed should explanations and feedback be?',
          choices: [
            { name: '📝 Minimal - Just the essentials', value: 'minimal' },
            { name: '📋 Concise - Key points with brief explanations', value: 'concise' },
            { name: '📖 Detailed - Comprehensive explanations and context', value: 'detailed' },
            { name: '🔍 Verbose - In-depth analysis and educational content', value: 'verbose' }
          ]
        },
        {
          type: 'list',
          name: 'communicationStyle',
          message: 'What communication tone do you prefer?',
          choices: [
            { name: '🤖 Technical - Direct, precise, no fluff', value: 'technical' },
            { name: '👥 Friendly - Approachable with helpful guidance', value: 'friendly' },
            { name: '🎯 Professional - Balanced, clear, business-focused', value: 'professional' },
            { name: '🎓 Educational - Teaching-focused with explanations', value: 'educational' }
          ]
        },
        {
          type: 'checkbox',
          name: 'workflowFeatures',
          message: 'Which workflow features would you like enabled?',
          choices: [
            { name: 'Auto-agent spawning based on task complexity', value: 'autoSpawning' },
            { name: 'Intelligent resource allocation', value: 'resourceOptimization' },
            { name: 'Content filtering and prioritization', value: 'contentFiltering' },
            { name: 'Performance analytics and insights', value: 'analytics' },
            { name: 'Workflow optimization suggestions', value: 'workflowOptimization' },
            { name: 'Cross-session learning and adaptation', value: 'learning' }
          ]
        },
        {
          type: 'number',
          name: 'maxAgents',
          message: 'Maximum number of agents to spawn concurrently (1-16):',
          default: 4,
          validate: (input) => {
            const num = parseInt(input);
            return num >= 1 && num <= 16 || 'Please enter a number between 1 and 16';
          }
        },
        {
          type: 'list',
          name: 'errorHandling',
          message: 'How should errors and failures be handled?',
          choices: [
            { name: '🔄 Auto-retry with progressive backoff', value: 'autoRetry' },
            { name: '⚠️ Prompt for manual intervention', value: 'interactive' },
            { name: '📋 Log and continue with fallback', value: 'logAndContinue' },
            { name: '⛔ Stop and require manual resolution', value: 'stopOnError' }
          ]
        },
        {
          type: 'confirm',
          name: 'analyticsEnabled',
          message: 'Enable usage analytics to help improve your workflow?',
          default: true
        }
      ];

      const answers = await inquirer.prompt(wizardQuestions);

      // Build comprehensive preference configuration
      const preferences = {
        experience: {
          level: answers.experience,
          projectType: answers.projectType
        },
        communication: {
          verbosity: answers.verbosity,
          style: answers.communicationStyle
        },
        workflow: {
          maxAgents: answers.maxAgents,
          features: answers.workflowFeatures.reduce((acc, feature) => {
            acc[feature] = true;
            return acc;
          }, {}),
          errorHandling: answers.errorHandling
        },
        analytics: {
          enabled: answers.analyticsEnabled,
          collectUsageData: answers.analyticsEnabled,
          shareInsights: false // Privacy-first default
        },
        personalization: {
          setupCompleted: true,
          setupDate: new Date().toISOString(),
          version: '1.0.0'
        }
      };

      // Apply all preferences
      const saveSpinner = ora('Saving personalization settings...').start();
      await this.preferenceManager.setPreferences(preferences);

      // Initialize systems with new preferences
      await this.resourceDelegation.initialize();
      await this.contentFilter.initialize();
      await this.workflowOptimizer.initialize();

      saveSpinner.succeed('Personalization settings saved successfully!');

      // Show summary
      console.log(chalk.green.bold('\n✅ Setup Complete!'));
      console.log(chalk.gray('Your personalized configuration has been applied.\n'));

      console.log(chalk.blue('📋 Summary of your settings:'));
      console.log(`  Experience Level: ${chalk.cyan(answers.experience)}`);
      console.log(`  Project Focus: ${chalk.cyan(answers.projectType)}`);
      console.log(`  Communication: ${chalk.cyan(answers.verbosity)} ${chalk.cyan(answers.communicationStyle)}`);
      console.log(`  Max Agents: ${chalk.cyan(answers.maxAgents)}`);
      console.log(`  Features Enabled: ${chalk.cyan(answers.workflowFeatures.length)} features`);

      console.log(chalk.yellow('\n🚀 Next Steps:'));
      console.log('  • Run your first personalized command: claude-flow-novice task create');
      console.log('  • Check your status: claude-flow-novice personalize status');
      console.log('  • Get optimization tips: claude-flow-novice personalize optimize');

      if (flags.immediate) {
        console.log(chalk.blue('\n🎯 Running immediate optimization...'));
        await this.getOptimizationSuggestions({ immediate: true });
      }

    } catch (error) {
      console.error(chalk.red('❌ Setup failed:'), error.message);
      throw error;
    }
  }

  /**
   * Show current personalization status
   */
  async showStatus(flags) {
    console.log(chalk.blue.bold('\n📊 Personalization Status'));
    console.log(chalk.gray('═'.repeat(50)));

    try {
      const spinner = ora('Loading status...').start();

      const preferences = await this.preferenceManager.getPreferences();
      const analytics = await this.analyticsEngine.getAnalytics();
      const resourceStatus = await this.resourceDelegation.getStatus();
      const workflowStatus = await this.workflowOptimizer.getStatus();

      spinner.stop();

      // Setup Status
      const isSetupComplete = preferences.personalization?.setupCompleted || false;
      console.log(`\n${chalk.blue('Setup Status:')} ${isSetupComplete ? chalk.green('✅ Complete') : chalk.yellow('⚠️ Incomplete')}`);

      if (isSetupComplete) {
        const setupDate = preferences.personalization?.setupDate;
        console.log(`  Setup Date: ${chalk.cyan(new Date(setupDate).toLocaleDateString())}`);
        console.log(`  Version: ${chalk.cyan(preferences.personalization?.version || 'Unknown')}`);
      }

      // Experience & Communication
      if (preferences.experience) {
        console.log(`\n${chalk.blue('User Profile:')}`);
        console.log(`  Experience Level: ${chalk.cyan(preferences.experience.level || 'Not set')}`);
        console.log(`  Project Type: ${chalk.cyan(preferences.experience.projectType || 'Not set')}`);
        console.log(`  Communication Style: ${chalk.cyan(preferences.communication?.style || 'Not set')}`);
        console.log(`  Verbosity: ${chalk.cyan(preferences.communication?.verbosity || 'Not set')}`);
      }

      // Workflow Settings
      if (preferences.workflow) {
        console.log(`\n${chalk.blue('Workflow Configuration:')}`);
        console.log(`  Max Agents: ${chalk.cyan(preferences.workflow.maxAgents || 'Default')}`);
        console.log(`  Error Handling: ${chalk.cyan(preferences.workflow.errorHandling || 'Default')}`);

        if (preferences.workflow.features) {
          const enabledFeatures = Object.entries(preferences.workflow.features)
            .filter(([_, enabled]) => enabled)
            .map(([feature, _]) => feature);
          console.log(`  Enabled Features: ${chalk.cyan(enabledFeatures.length)} (${enabledFeatures.join(', ')})`);
        }
      }

      // System Status
      console.log(`\n${chalk.blue('System Status:')}`);
      console.log(`  Resource Delegation: ${resourceStatus.active ? chalk.green('✅ Active') : chalk.red('❌ Inactive')}`);
      console.log(`  Content Filtering: ${this.contentFilter.isActive() ? chalk.green('✅ Active') : chalk.red('❌ Inactive')}`);
      console.log(`  Workflow Optimization: ${workflowStatus.active ? chalk.green('✅ Active') : chalk.red('❌ Inactive')}`);
      console.log(`  Analytics: ${preferences.analytics?.enabled ? chalk.green('✅ Enabled') : chalk.red('❌ Disabled')}`);

      // Recent Activity (if verbose)
      if (flags.verbose && analytics.recentActivity) {
        console.log(`\n${chalk.blue('Recent Activity:')}`);
        const activities = analytics.recentActivity.slice(0, 5);
        activities.forEach(activity => {
          console.log(`  ${chalk.gray(activity.timestamp)} - ${activity.type}: ${chalk.cyan(activity.description)}`);
        });
      }

      // Performance Metrics
      if (analytics.performance) {
        console.log(`\n${chalk.blue('Performance Metrics:')}`);
        console.log(`  Average Task Time: ${chalk.cyan(analytics.performance.averageTaskTime)}ms`);
        console.log(`  Success Rate: ${chalk.cyan(analytics.performance.successRate)}%`);
        console.log(`  Agent Efficiency: ${chalk.cyan(analytics.performance.agentEfficiency)}%`);
      }

      if (!isSetupComplete) {
        console.log(chalk.yellow('\n💡 Run "claude-flow-novice personalize setup" to complete configuration.'));
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to get status:'), error.message);
      throw error;
    }
  }

  /**
   * Get and display optimization suggestions
   */
  async getOptimizationSuggestions(flags) {
    console.log(chalk.blue.bold('\n🔧 Workflow Optimization Suggestions'));
    console.log(chalk.gray('═'.repeat(50)));

    try {
      const spinner = ora('Analyzing your workflow patterns...').start();

      const suggestions = await this.workflowOptimizer.getSuggestions();
      const analytics = await this.analyticsEngine.getAnalytics();
      const resourceInsights = await this.resourceDelegation.getOptimizationInsights();

      spinner.succeed('Analysis complete');

      if (suggestions.length === 0) {
        console.log(chalk.green('\n✅ Your workflow is already well-optimized!'));
        console.log(chalk.gray('Continue using the system to gather more optimization data.'));
        return;
      }

      // Priority suggestions
      const highPriority = suggestions.filter(s => s.priority === 'high');
      const mediumPriority = suggestions.filter(s => s.priority === 'medium');
      const lowPriority = suggestions.filter(s => s.priority === 'low');

      if (highPriority.length > 0) {
        console.log(chalk.red.bold('\n🔴 High Priority Suggestions:'));
        highPriority.forEach((suggestion, i) => {
          console.log(`\n  ${i + 1}. ${chalk.red(suggestion.title)}`);
          console.log(`     ${chalk.gray(suggestion.description)}`);
          console.log(`     ${chalk.yellow('Impact:')} ${suggestion.impact}`);
          if (suggestion.action) {
            console.log(`     ${chalk.blue('Action:')} ${suggestion.action}`);
          }
        });
      }

      if (mediumPriority.length > 0) {
        console.log(chalk.yellow.bold('\n🟡 Medium Priority Suggestions:'));
        mediumPriority.forEach((suggestion, i) => {
          console.log(`\n  ${i + 1}. ${chalk.yellow(suggestion.title)}`);
          console.log(`     ${chalk.gray(suggestion.description)}`);
          if (flags.verbose && suggestion.details) {
            console.log(`     ${chalk.blue('Details:')} ${suggestion.details}`);
          }
        });
      }

      if (lowPriority.length > 0 && flags.verbose) {
        console.log(chalk.blue.bold('\n🔵 Low Priority Suggestions:'));
        lowPriority.forEach((suggestion, i) => {
          console.log(`\n  ${i + 1}. ${chalk.blue(suggestion.title)}`);
          console.log(`     ${chalk.gray(suggestion.description)}`);
        });
      }

      // Resource optimization insights
      if (resourceInsights && resourceInsights.length > 0) {
        console.log(chalk.cyan.bold('\n⚡ Resource Optimization Insights:'));
        resourceInsights.forEach((insight, i) => {
          console.log(`\n  ${i + 1}. ${chalk.cyan(insight.title)}`);
          console.log(`     ${chalk.gray(insight.description)}`);
          if (insight.potentialSavings) {
            console.log(`     ${chalk.green('Potential Savings:')} ${insight.potentialSavings}`);
          }
        });
      }

      // Quick wins
      const quickWins = suggestions.filter(s => s.effort === 'low' && s.impact === 'high');
      if (quickWins.length > 0) {
        console.log(chalk.green.bold('\n🚀 Quick Wins (High Impact, Low Effort):'));
        quickWins.forEach((win, i) => {
          console.log(`  ${i + 1}. ${chalk.green(win.title)}`);
          console.log(`     ${chalk.gray(win.description)}`);
        });
      }

      // Auto-apply option
      if (flags.autoApply && !flags.dryRun) {
        const autoApplicable = suggestions.filter(s => s.autoApplyable);
        if (autoApplicable.length > 0) {
          console.log(chalk.blue.bold('\n🤖 Auto-Applying Suggestions...'));
          for (const suggestion of autoApplicable) {
            const applySpinner = ora(`Applying: ${suggestion.title}`).start();
            try {
              await this.workflowOptimizer.applySuggestion(suggestion.id);
              applySpinner.succeed(`Applied: ${suggestion.title}`);
            } catch (error) {
              applySpinner.fail(`Failed to apply: ${suggestion.title}`);
              console.error(chalk.red(`  Error: ${error.message}`));
            }
          }
        }
      }

      console.log(chalk.blue('\n📈 Next Steps:'));
      console.log('  • Apply high-priority suggestions first');
      console.log('  • Monitor impact with: claude-flow-novice personalize analytics');
      console.log('  • Re-run optimization: claude-flow-novice personalize optimize');

    } catch (error) {
      console.error(chalk.red('❌ Failed to get optimization suggestions:'), error.message);
      throw error;
    }
  }

  /**
   * Show analytics and insights
   */
  async showAnalytics(flags) {
    console.log(chalk.blue.bold('\n📊 Personalization Analytics & Insights'));
    console.log(chalk.gray('═'.repeat(50)));

    try {
      const spinner = ora('Generating analytics report...').start();

      const analytics = await this.analyticsEngine.getAnalytics();
      const insights = await this.analyzer.generateInsights();

      spinner.succeed('Analytics generated');

      // Usage Overview
      if (analytics.usage) {
        console.log(chalk.blue.bold('\n📈 Usage Overview:'));
        console.log(`  Total Commands: ${chalk.cyan(analytics.usage.totalCommands || 0)}`);
        console.log(`  Active Days: ${chalk.cyan(analytics.usage.activeDays || 0)}`);
        console.log(`  Average Session Length: ${chalk.cyan(analytics.usage.avgSessionLength || 0)} minutes`);
        console.log(`  Most Used Features: ${chalk.cyan((analytics.usage.topFeatures || []).slice(0, 3).join(', '))}`);
      }

      // Performance Metrics
      if (analytics.performance) {
        console.log(chalk.blue.bold('\n⚡ Performance Metrics:'));
        console.log(`  Average Task Completion: ${chalk.cyan(analytics.performance.averageTaskTime || 0)}ms`);
        console.log(`  Success Rate: ${chalk.green(analytics.performance.successRate || 0)}%`);
        console.log(`  Error Rate: ${analytics.performance.errorRate > 5 ? chalk.red : chalk.green}(${analytics.performance.errorRate || 0}%)`);
        console.log(`  Agent Utilization: ${chalk.cyan(analytics.performance.agentUtilization || 0)}%`);
      }

      // Personalization Insights
      if (insights && insights.length > 0) {
        console.log(chalk.blue.bold('\n🧠 Personalization Insights:'));
        insights.forEach((insight, i) => {
          console.log(`\n  ${i + 1}. ${chalk.cyan(insight.title)}`);
          console.log(`     ${chalk.gray(insight.description)}`);
          if (insight.recommendation) {
            console.log(`     ${chalk.yellow('Recommendation:')} ${insight.recommendation}`);
          }
        });
      }

      // Agent Performance
      if (analytics.agents && flags.verbose) {
        console.log(chalk.blue.bold('\n🤖 Agent Performance:'));
        Object.entries(analytics.agents).forEach(([agentType, stats]) => {
          console.log(`\n  ${chalk.cyan(agentType)}:`);
          console.log(`    Usage: ${stats.usage || 0} times`);
          console.log(`    Success Rate: ${stats.successRate || 0}%`);
          console.log(`    Avg Time: ${stats.averageTime || 0}ms`);
        });
      }

      // Workflow Patterns (if available)
      if (analytics.patterns && flags.patterns) {
        console.log(chalk.blue.bold('\n🔄 Workflow Patterns:'));
        analytics.patterns.forEach((pattern, i) => {
          console.log(`\n  ${i + 1}. ${chalk.cyan(pattern.name)}`);
          console.log(`     Frequency: ${pattern.frequency} times`);
          console.log(`     Efficiency: ${pattern.efficiency}%`);
          console.log(`     Last Used: ${new Date(pattern.lastUsed).toLocaleDateString()}`);
        });
      }

      // Time Series Data (if requested)
      if (flags.timeSeries) {
        await this.showTimeSeriesAnalytics();
      }

      // Export option
      if (flags.export) {
        const exportPath = flags.export === true ? 'analytics-report.json' : flags.export;
        const exportSpinner = ora(`Exporting analytics to ${exportPath}...`).start();

        const fullReport = {
          generated: new Date().toISOString(),
          analytics,
          insights,
          metadata: {
            version: '1.0.0',
            timeRange: flags.timeRange || '30d'
          }
        };

        await this.exportAnalytics(fullReport, exportPath);
        exportSpinner.succeed(`Analytics exported to ${exportPath}`);
      }

      if (flags.dashboard) {
        console.log(chalk.blue('\n🎯 Opening dashboard...'));
        await this.showDashboard(flags);
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to generate analytics:'), error.message);
      throw error;
    }
  }

  /**
   * Handle resource delegation commands
   */
  async handleResourceCommands(args, flags) {
    const subcommand = args[0] || 'status';

    switch (subcommand) {
      case 'assign':
        return this.assignResources(args.slice(1), flags);
      case 'optimize':
        return this.optimizeResources(flags);
      case 'status':
        return this.showResourceStatus(flags);
      case 'rules':
        return this.manageResourceRules(args.slice(1), flags);
      default:
        console.log(chalk.red(`Unknown resource command: ${subcommand}`));
        console.log('Available commands: assign, optimize, status, rules');
    }
  }

  /**
   * Show interactive dashboard
   */
  async showDashboard(flags) {
    console.log(chalk.blue.bold('\n📊 Personalization Dashboard'));

    try {
      const dashboardData = await this.dashboard.generateDashboard();
      await this.dashboard.display(dashboardData, {
        interactive: !flags.static,
        fullscreen: flags.fullscreen,
        refreshRate: flags.refresh || 5000
      });
    } catch (error) {
      console.error(chalk.red('❌ Failed to show dashboard:'), error.message);
      throw error;
    }
  }

  /**
   * Export personalization settings
   */
  async exportSettings(args, flags) {
    const filename = args[0] || `personalization-export-${Date.now()}.json`;

    try {
      const spinner = ora('Exporting personalization settings...').start();

      const data = {
        preferences: await this.preferenceManager.getPreferences(),
        analytics: await this.analyticsEngine.getAnalytics(),
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      };

      const fs = await import('fs/promises');
      await fs.writeFile(filename, JSON.stringify(data, null, 2));

      spinner.succeed(`Settings exported to ${filename}`);
      console.log(chalk.green('✅ Export complete'));

    } catch (error) {
      console.error(chalk.red('❌ Export failed:'), error.message);
      throw error;
    }
  }

  /**
   * Import personalization settings
   */
  async importSettings(args, flags) {
    const filename = args[0];

    if (!filename) {
      console.error(chalk.red('❌ Please specify a file to import'));
      return;
    }

    try {
      const spinner = ora(`Importing settings from ${filename}...`).start();

      const fs = await import('fs/promises');
      const data = JSON.parse(await fs.readFile(filename, 'utf8'));

      if (data.preferences) {
        await this.preferenceManager.setPreferences(data.preferences);
      }

      spinner.succeed('Settings imported successfully');
      console.log(chalk.green('✅ Import complete'));

      if (flags.verify) {
        console.log(chalk.blue('\n🔍 Verifying imported settings...'));
        await this.showStatus({ verbose: false });
      }

    } catch (error) {
      console.error(chalk.red('❌ Import failed:'), error.message);
      throw error;
    }
  }

  /**
   * Reset personalization settings
   */
  async resetSettings(flags) {
    if (!flags.force) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to reset all personalization settings?',
        default: false
      }]);

      if (!confirm) {
        console.log(chalk.yellow('Reset cancelled'));
        return;
      }
    }

    try {
      const spinner = ora('Resetting personalization settings...').start();

      await this.preferenceManager.reset();
      await this.analyticsEngine.reset();

      spinner.succeed('Settings reset successfully');
      console.log(chalk.green('✅ All personalization settings have been reset'));
      console.log(chalk.yellow('💡 Run "claude-flow-novice personalize setup" to configure again'));

    } catch (error) {
      console.error(chalk.red('❌ Reset failed:'), error.message);
      throw error;
    }
  }

  /**
   * Show help information
   */
  showHelp() {
    console.log(chalk.blue.bold('\n📚 Claude Flow Novice Personalization CLI'));
    console.log(chalk.gray('Unified access to all personalization features\n'));

    console.log(chalk.yellow.bold('MAIN COMMANDS:'));
    console.log(`  ${chalk.cyan('setup')}       Run interactive setup wizard`);
    console.log(`  ${chalk.cyan('status')}      Show current personalization status`);
    console.log(`  ${chalk.cyan('optimize')}    Get workflow optimization suggestions`);
    console.log(`  ${chalk.cyan('analytics')}   Show usage analytics and insights`);
    console.log(`  ${chalk.cyan('dashboard')}   Open interactive dashboard`);

    console.log(chalk.yellow.bold('\nFEATURE COMMANDS:'));
    console.log(`  ${chalk.cyan('resource')}    Resource delegation commands`);
    console.log(`  ${chalk.cyan('preferences')} Preference management`);
    console.log(`  ${chalk.cyan('content')}     Content filtering`);
    console.log(`  ${chalk.cyan('workflow')}    Workflow optimization`);

    console.log(chalk.yellow.bold('\nDATA COMMANDS:'));
    console.log(`  ${chalk.cyan('export')}      Export settings to file`);
    console.log(`  ${chalk.cyan('import')}      Import settings from file`);
    console.log(`  ${chalk.cyan('reset')}       Reset all settings`);

    console.log(chalk.yellow.bold('\nEXAMPLES:'));
    console.log(`  ${chalk.gray('claude-flow-novice personalize setup')}`);
    console.log(`  ${chalk.gray('claude-flow-novice personalize status --verbose')}`);
    console.log(`  ${chalk.gray('claude-flow-novice personalize optimize --auto-apply')}`);
    console.log(`  ${chalk.gray('claude-flow-novice personalize analytics --export report.json')}`);
    console.log(`  ${chalk.gray('claude-flow-novice personalize resource assign coder --priority high')}`);

    console.log(chalk.yellow.bold('\nGLOBAL FLAGS:'));
    console.log(`  ${chalk.gray('--verbose      Show detailed information')}`);
    console.log(`  ${chalk.gray('--json         Output in JSON format')}`);
    console.log(`  ${chalk.gray('--force        Skip confirmation prompts')}`);
    console.log(`  ${chalk.gray('--dry-run      Preview changes without applying')}`);

    console.log(chalk.blue.bold('\n🚀 Getting Started:'));
    console.log(chalk.gray('1. Run the setup wizard: claude-flow-novice personalize setup'));
    console.log(chalk.gray('2. Check your status: claude-flow-novice personalize status'));
    console.log(chalk.gray('3. Get optimization tips: claude-flow-novice personalize optimize'));
    console.log(chalk.gray('4. Monitor with analytics: claude-flow-novice personalize analytics'));
  }

  // Additional helper methods for specific functionalities
  async assignResources(args, flags) {
    const agentType = args[0];
    if (!agentType) {
      console.error(chalk.red('❌ Please specify an agent type'));
      return;
    }

    try {
      const assignment = await this.resourceDelegation.assignAgent(agentType, {
        priority: flags.priority || 'medium',
        capabilities: flags.capabilities?.split(',') || [],
        constraints: flags.constraints || {}
      });

      console.log(chalk.green(`✅ Assigned ${agentType} agent`));
      console.log(`  Agent ID: ${chalk.cyan(assignment.agentId)}`);
      console.log(`  Estimated Completion: ${chalk.cyan(assignment.estimatedTime)}`);

    } catch (error) {
      console.error(chalk.red('❌ Resource assignment failed:'), error.message);
    }
  }

  async optimizeResources(flags) {
    try {
      const spinner = ora('Optimizing resource allocation...').start();
      const optimization = await this.resourceDelegation.optimize();
      spinner.succeed('Resource optimization complete');

      console.log(chalk.green('✅ Resource Optimization Results:'));
      console.log(`  Efficiency Gain: ${chalk.cyan(optimization.efficiencyGain)}%`);
      console.log(`  Resource Savings: ${chalk.cyan(optimization.resourceSavings)}`);
      console.log(`  Recommendations: ${optimization.recommendations.length} items`);

    } catch (error) {
      console.error(chalk.red('❌ Resource optimization failed:'), error.message);
    }
  }

  async showResourceStatus(flags) {
    try {
      const status = await this.resourceDelegation.getStatus();

      console.log(chalk.blue.bold('\n⚡ Resource Status:'));
      console.log(`  Active Agents: ${chalk.cyan(status.activeAgents)}`);
      console.log(`  Queue Length: ${chalk.cyan(status.queueLength)}`);
      console.log(`  Average Response Time: ${chalk.cyan(status.avgResponseTime)}ms`);
      console.log(`  Resource Utilization: ${chalk.cyan(status.utilization)}%`);

      if (flags.verbose && status.agentDetails) {
        console.log(chalk.blue.bold('\n🤖 Agent Details:'));
        status.agentDetails.forEach(agent => {
          console.log(`  ${chalk.cyan(agent.type)}: ${agent.status} (${agent.load}% load)`);
        });
      }

    } catch (error) {
      console.error(chalk.red('❌ Failed to get resource status:'), error.message);
    }
  }

  async showTimeSeriesAnalytics() {
    console.log(chalk.blue.bold('\n📈 Time Series Analytics:'));

    try {
      const timeSeriesData = await this.analyticsEngine.getTimeSeriesData();

      // Simple ASCII chart for key metrics
      const metrics = ['commands', 'success_rate', 'avg_time'];

      metrics.forEach(metric => {
        const data = timeSeriesData[metric] || [];
        if (data.length > 0) {
          console.log(`\n  ${chalk.cyan(metric.replace('_', ' ').toUpperCase())}:`);
          // Simple sparkline representation
          const max = Math.max(...data.map(d => d.value));
          const min = Math.min(...data.map(d => d.value));
          const range = max - min;

          const sparkline = data.map(d => {
            const normalized = range > 0 ? (d.value - min) / range : 0;
            return '▁▂▃▄▅▆▇█'[Math.floor(normalized * 7)] || '▁';
          }).join('');

          console.log(`    ${sparkline} (${min} - ${max})`);
        }
      });

    } catch (error) {
      console.error(chalk.red('❌ Failed to generate time series:'), error.message);
    }
  }

  async exportAnalytics(data, path) {
    const fs = await import('fs/promises');
    await fs.writeFile(path, JSON.stringify(data, null, 2));
  }
}

/**
 * Main personalization command handler
 */
export async function personalizationCommand(args, flags) {
  const cli = new PersonalizationCLI();
  return cli.handleCommand(args, flags);
}