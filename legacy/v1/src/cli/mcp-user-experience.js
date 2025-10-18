// Enhanced MCP User Experience Module
// Provides bulletproof feedback, automated error recovery, and comprehensive user guidance
// Integrates with bulletproof MCP configuration manager for seamless experience

import { printSuccess, printWarning, printError } from './utils.js';
import boxen from 'boxen';
import chalk from 'chalk';
import readline from 'readline';

export class McpUserExperience {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.interactive = options.interactive !== false; // Default to true
    this.colorSupport = this.detectColorSupport();
    this.rl = null;
    this.progressState = null;
  }

  /**
   * Detect if terminal supports colors
   */
  detectColorSupport() {
    return process.stdout.isTTY &&
           (process.env.TERM !== 'dumb') &&
           !process.env.NO_COLOR;
  }

  /**
   * Enhanced color support with fallbacks
   */
  colorize(text, color) {
    if (!this.colorSupport) return text;

    // Use chalk for better color support
    const colorMap = {
      red: chalk.red,
      green: chalk.green,
      yellow: chalk.yellow,
      blue: chalk.blue,
      magenta: chalk.magenta,
      cyan: chalk.cyan,
      gray: chalk.gray,
      bold: chalk.bold,
      dim: chalk.dim
    };

    const colorFn = colorMap[color];
    return colorFn ? colorFn(text) : text;
  }

  /**
   * Enhanced configuration analysis with health scoring and detailed breakdown
   */
  displayConfigurationAnalysis(state) {
    console.log('\n' + chalk.bold('📊 MCP Configuration Analysis'));
    console.log('━'.repeat(50));

    // Health score with visual indicator
    const healthScore = state.healthScore || this.calculateHealthScore(state);
    const healthColor = healthScore >= 80 ? 'green' : healthScore >= 60 ? 'yellow' : 'red';
    const healthBar = this.generateHealthBar(healthScore);

    console.log(`\nHealth Score: ${this.colorize(`${healthScore}/100`, healthColor)} ${healthBar}`);

    // Environment status
    console.log('\n' + chalk.cyan('Environment Status:'));
    console.log(`• Claude Code: ${state.claudeCodeInstalled ? chalk.green('✅ Installed') : chalk.red('❌ Not Found')}`);
    console.log(`• Local Config: ${state.hasLocalConfig ? chalk.green('✅ Found') : chalk.gray('ℹ️ Not Found')}`);
    console.log(`• Project Config: ${state.hasProjectConfig ? chalk.green('✅ Found') : chalk.gray('ℹ️ Will Create')}`);

    // Server breakdown
    if (state.localServers?.length > 0 || state.projectServers?.length > 0) {
      console.log('\n' + chalk.cyan('MCP Servers:'));
      console.log(`• Local Servers: ${state.localServers?.length || 0}`);
      console.log(`• Project Servers: ${state.projectServers?.length || 0}`);

      // Show broken servers specifically
      if (state.brokenPaths?.length > 0) {
        console.log(chalk.red(`• Broken Configurations: ${state.brokenPaths.length}`));
        state.brokenPaths.forEach(broken => {
          console.log(chalk.red(`  - ${broken.serverName}: ${broken.issues?.join(', ') || 'Issues detected'}`));
        });
      }
    }

    // Critical issues
    if (state.criticalIssues && state.criticalIssues.length > 0) {
      console.log('\n' + chalk.red('❌ Critical Issues:'));
      state.criticalIssues.forEach(issue => {
        console.log(chalk.red(`  • ${issue}`));
      });
    }

    // Warnings
    if (state.warnings && state.warnings.length > 0) {
      console.log('\n' + chalk.yellow('⚠️ Warnings:'));
      state.warnings.forEach(warning => {
        console.log(chalk.yellow(`  • ${warning}`));
      });
    }

    // Recommendations
    if (state.recommendations && state.recommendations.length > 0) {
      console.log('\n' + chalk.cyan('💡 Recommendations:'));
      state.recommendations.forEach((rec, index) => {
        const priority = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        console.log(`  ${priority} ${rec.description}`);
        if (rec.action) {
          console.log(`     ${chalk.gray('Action:')} ${rec.action}`);
        }
      });
    }

    // Auto-fix notification
    const issueCount = (state.brokenPaths?.length || 0) + (state.conflictingServers?.length || 0);
    if (issueCount > 0) {
      console.log('\n' + chalk.green('🔧 All detected issues will be automatically resolved'));
    } else {
      console.log('\n' + chalk.green('✅ No issues detected - configuration is healthy'));
    }

    console.log('━'.repeat(50));
  }

  /**
   * Calculate health score based on state
   */
  calculateHealthScore(state) {
    let score = 100;

    if (!state.claudeCodeInstalled) score -= 30;
    if (state.brokenPaths && state.brokenPaths.length > 0) score -= (state.brokenPaths.length * 25);
    if (state.conflictingServers && state.conflictingServers.length > 0) score -= (state.conflictingServers.length * 15);
    if (state.criticalIssues && state.criticalIssues.length > 0) score -= (state.criticalIssues.length * 20);

    return Math.max(0, score);
  }

  /**
   * Generate visual health bar
   */
  generateHealthBar(score) {
    const width = 20;
    const filled = Math.round((score / 100) * width);
    const empty = width - filled;

    const filledBar = '█'.repeat(filled);
    const emptyBar = '░'.repeat(empty);

    if (score >= 80) {
      return chalk.green(filledBar) + chalk.gray(emptyBar);
    } else if (score >= 60) {
      return chalk.yellow(filledBar) + chalk.gray(emptyBar);
    } else {
      return chalk.red(filledBar) + chalk.gray(emptyBar);
    }
  }

  /**
   * Generate user-friendly analysis message
   */
  generateAnalysisMessage(state) {
    let message = '';

    // Configuration status
    message += `${chalk.bold('Configuration Status:')}\n`;
    message += `  Local config (~/.claude.json): ${state.hasLocalConfig ? '✅ Found' : '❌ Not found'}\n`;
    message += `  Project config (.mcp.json): ${state.hasProjectConfig ? '✅ Found' : '❌ Not found'}\n\n`;

    // Server analysis
    if (state.localServers && state.localServers.length > 0) {
      message += `${chalk.bold('Local MCP Servers:')}\n`;
      state.localServers.forEach(server => {
        const status = state.brokenPaths.some(bp => bp.serverName === server.name) ? '🔴 Broken' : '✅ OK';
        message += `  • ${server.name}: ${status}\n`;
      });
      message += '\n';
    }

    if (state.projectServers && state.projectServers.length > 0) {
      message += `${chalk.bold('Project MCP Servers:')}\n`;
      state.projectServers.forEach(server => {
        message += `  • ${server.name}: ✅ Configured\n`;
      });
      message += '\n';
    }

    // Issues summary
    const issueCount = (state.conflictingServers?.length || 0) + (state.brokenPaths?.length || 0);
    if (issueCount > 0) {
      message += `${chalk.bold('Issues Found:')}\n`;
      message += `  🔴 ${state.brokenPaths?.length || 0} broken server path(s)\n`;
      message += `  🟡 ${state.conflictingServers?.length || 0} configuration conflict(s)\n\n`;
      message += `${chalk.yellow('These issues will be automatically resolved during setup.')}\n`;
    } else {
      message += `${chalk.green('✅ No configuration issues detected')}\n`;
    }

    return message;
  }

  /**
   * Enhanced setup progress with visual indicators and detailed feedback
   */
  displaySetupProgress(stage, details = {}) {
    const stages = {
      'pre-audit': {
        emoji: '🔍',
        name: 'Pre-Audit',
        description: 'Analyzing existing configuration state',
        color: 'cyan'
      },
      'backup': {
        emoji: '💾',
        name: 'Backup',
        description: 'Creating safety backups of configurations',
        color: 'blue'
      },
      'cleanup': {
        emoji: '🧹',
        name: 'Cleanup',
        description: 'Fixing broken and conflicting configurations',
        color: 'yellow'
      },
      'project-config': {
        emoji: '⚙️',
        name: 'Project Config',
        description: 'Setting up optimal project configuration',
        color: 'magenta'
      },
      'verification': {
        emoji: '✅',
        name: 'Verification',
        description: 'Testing configuration integrity',
        color: 'green'
      },
      'complete': {
        emoji: '🎉',
        name: 'Complete',
        description: 'Setup finished successfully',
        color: 'green'
      }
    };

    const stageInfo = stages[stage] || {
      emoji: '⚡',
      name: stage,
      description: 'Processing...',
      color: 'white'
    };

    const statusLine = `${stageInfo.emoji} ${chalk.bold(stageInfo.name)}: ${stageInfo.description}`;

    if (stage === 'complete') {
      console.log('\n' + chalk.green(statusLine));
    } else {
      console.log('\n' + this.colorize(statusLine, stageInfo.color));
    }

    // Store progress state for potential rollback display
    this.progressState = { stage, timestamp: Date.now(), details };

    // Display additional details with enhanced formatting
    if (details.autoFixed && details.autoFixed.length > 0) {
      console.log(chalk.gray('   ✅ Auto-fixed issues:'));
      details.autoFixed.forEach(fix => {
        console.log(chalk.gray(`     • ${fix}`));
      });
    }

    if (details.warnings && details.warnings.length > 0) {
      console.log(chalk.yellow('   ⚠️  Warnings:'));
      details.warnings.forEach(warning => {
        console.log(chalk.yellow(`     • ${warning}`));
      });
    }

    if (details.backupsCreated && details.backupsCreated > 0) {
      console.log(chalk.blue(`   💾 Created ${details.backupsCreated} backup(s)`));
    }
  }

  /**
   * Enhanced error recovery with comprehensive guidance and automatic rollback info
   */
  displayErrorRecovery(error, recovery = {}) {
    console.log('\n' + chalk.red.bold('❌ Setup Failed - Recovery Information'));
    console.log('━'.repeat(60));

    // Error details with analysis
    console.log('\n' + chalk.cyan('Error Details:'));
    console.log(`• Type: ${chalk.yellow(recovery.errorAnalysis?.type || 'unknown')}`);
    console.log(`• Severity: ${this.getSeverityColor(recovery.errorAnalysis?.severity || 'medium', recovery.errorAnalysis?.severity || 'medium')}`);
    console.log(`• Message: ${error.message}`);

    if (recovery.errorAnalysis?.category) {
      console.log(`• Category: ${chalk.magenta(recovery.errorAnalysis.category)}`);
    }

    // Automatic recovery status
    if (recovery.rollbackPerformed) {
      console.log('\n' + chalk.cyan('🔄 Automatic Recovery:'));
      console.log(chalk.green(`• Rollback completed: ${recovery.operationsRolledBack || 0} operations reversed`));
      console.log(chalk.green('• System restored to previous state'));

      if (recovery.rollbackError) {
        console.log(chalk.red(`• Rollback warning: ${recovery.rollbackError}`));
      }
    }

    // Backup information
    if (recovery.backupsAvailable) {
      console.log('\n' + chalk.cyan('💾 Backup Information:'));
      console.log(chalk.blue('• Configuration backups are available'));
      console.log(chalk.blue('• Manual restoration possible if needed'));
    }

    // Enhanced recovery recommendations
    if (recovery.recommendedActions && recovery.recommendedActions.length > 0) {
      console.log('\n' + chalk.cyan('🛠️  Recommended Actions:'));
      recovery.recommendedActions.forEach((action, i) => {
        console.log(`${chalk.yellow((i + 1) + '.')} ${action}`);
      });
    }

    // Recoverability assessment
    const recoverable = recovery.errorAnalysis?.recoverable !== false;
    if (recoverable) {
      console.log('\n' + chalk.green('✅ This issue is recoverable'));
      console.log(chalk.green('• Follow the recommended actions above'));
      console.log(chalk.green('• Re-run the setup after addressing the issue'));
    } else {
      console.log('\n' + chalk.yellow('⚠️  Manual intervention required'));
      console.log(chalk.yellow('• This issue requires manual resolution'));
      console.log(chalk.yellow('• Please follow the recommended actions carefully'));
    }

    // Emergency recovery options
    console.log('\n' + chalk.cyan('🆘 Emergency Recovery Options:'));
    console.log(`• Clean slate: ${chalk.cyan('claude mcp remove claude-flow-novice -s local')}`);
    console.log(`• Verify removal: ${chalk.cyan('claude mcp list')}`);
    console.log(`• Health check: ${chalk.cyan('npx claude-flow-novice mcp health')}`);
    console.log(`• Re-initialize: ${chalk.cyan('npx claude-flow-novice init --force')}`);

    console.log('━'.repeat(60));
  }

  /**
   * Get color for severity levels
   */
  getSeverityColor(severity, text) {
    switch (severity) {
      case 'critical':
        return chalk.red(text);
      case 'high':
        return chalk.red(text);
      case 'medium':
        return chalk.yellow(text);
      case 'low':
        return chalk.green(text);
      default:
        return chalk.gray(text);
    }
  }

  /**
   * Enhanced success summary with comprehensive information
   */
  displaySuccessSummary(setupDetails) {
    console.log('\n' + chalk.green.bold('🎉 Bulletproof MCP Setup Complete!'));
    console.log('━'.repeat(60));

    // Setup statistics
    console.log('\n' + chalk.cyan('Setup Statistics:'));
    console.log(`• Duration: ${chalk.blue((setupDetails.duration || 0) + 'ms')}`);
    console.log(`• Issues Fixed: ${chalk.green(setupDetails.issuesFixed || 0)}`);
    console.log(`• Backups Created: ${chalk.blue(setupDetails.backupsCreated || 0)}`);
    console.log(`• Operations Performed: ${chalk.blue(setupDetails.operationsPerformed || 0)}`);

    if (setupDetails.healthScore) {
      const healthColor = setupDetails.healthScore >= 80 ? 'green' : setupDetails.healthScore >= 60 ? 'yellow' : 'red';
      console.log(`• Final Health Score: ${this.colorize(`${setupDetails.healthScore}/100`, healthColor)}`);
    }

    // What was configured
    console.log('\n' + chalk.cyan('Configuration Created:'));
    console.log(chalk.green('• Project MCP configuration (.mcp.json)'));
    console.log(chalk.green('• claude-flow-novice MCP server'));
    console.log(chalk.green('• Automated conflict resolution'));

    if (setupDetails.verificationPassed) {
      console.log(chalk.green('• Setup verification passed'));
    }

    // Server details
    console.log('\n' + chalk.cyan('MCP Server Details:'));
    console.log(`• Name: ${chalk.yellow('claude-flow-novice')}`);
    console.log(`• Command: ${chalk.cyan('npx claude-flow-novice mcp start')}`);
    console.log(`• Scope: ${chalk.magenta('Project-specific')}`);
    console.log(`• Tools: ${chalk.blue('30+ essential development tools')}`);

    // Next steps
    console.log('\n' + chalk.cyan('Next Steps:'));
    console.log(`1. Verify setup: ${chalk.cyan('claude mcp list')}`);
    console.log(`2. Test MCP tools in Claude Code`);
    console.log(`3. Use project commands: ${chalk.cyan('./claude-flow')}`);
    console.log(`4. Check health anytime: ${chalk.cyan('npx claude-flow-novice mcp health')}`);

    // Tips and best practices
    console.log('\n' + chalk.cyan('💡 Tips:'));
    console.log(chalk.gray('• This configuration is project-specific and won\'t conflict'));
    console.log(chalk.gray('• Backup files are available for manual recovery'));
    console.log(chalk.gray('• Use --verbose flag for detailed output'));
    console.log(chalk.gray('• MCP tools will be available immediately in Claude Code'));

    console.log('━'.repeat(60));
  }

  /**
   * Generate success summary message
   */
  generateSuccessSummary(details) {
    let summary = `${chalk.green.bold('🎉 MCP Configuration Successful!')}\n\n`;

    summary += `${chalk.bold('What was configured:')}\n`;
    summary += `  ✅ Project MCP configuration (.mcp.json)\n`;
    summary += `  ✅ Claude Flow Novice MCP server\n`;

    if (details.cleanedUp && details.cleanedUp.length > 0) {
      summary += `  ✅ Cleaned up ${details.cleanedUp.length} conflicting configuration(s)\n`;
    }

    summary += `\n${chalk.bold('MCP Server Details:')}\n`;
    summary += `  • Name: claude-flow-novice\n`;
    summary += `  • Command: npx claude-flow-novice mcp start\n`;
    summary += `  • Scope: Project-specific\n`;

    summary += `\n${chalk.bold('Next Steps:')}\n`;
    summary += `  1. Verify setup: ${chalk.cyan('claude mcp list')}\n`;
    summary += `  2. Test MCP tools in Claude Code\n`;
    summary += `  3. Use project commands: ${chalk.cyan('./claude-flow')}\n`;

    summary += `\n${chalk.gray('💡 Tip: This configuration is project-specific and won\'t conflict with other projects')}\n`;

    return summary;
  }

  /**
   * Display troubleshooting guide
   */
  displayTroubleshootingGuide() {
    const guide = `
${chalk.bold.yellow('🔧 MCP Troubleshooting Guide')}

${chalk.bold('Common Issues & Solutions:')}

${chalk.yellow('1. "Server not found" errors:')}
   • Run: ${chalk.cyan('claude mcp remove claude-flow-novice -s local')}
   • Then re-run: ${chalk.cyan('npx claude-flow-novice init')}

${chalk.yellow('2. "Permission denied" errors:')}
   • Check Claude Code installation: ${chalk.cyan('claude --version')}
   • Reinstall if needed: ${chalk.cyan('npm install -g @anthropic-ai/claude-code')}

${chalk.yellow('3. "Path not found" errors:')}
   • This happens when local config points to old paths
   • Automatic cleanup will resolve this

${chalk.yellow('4. Multiple server instances:')}
   • Check both scopes: ${chalk.cyan('claude mcp list')}
   • Remove local duplicates: ${chalk.cyan('claude mcp remove <name> -s local')}

${chalk.bold('Configuration Scopes:')}
  • ${chalk.cyan('Local')} (~/.claude.json): User-global, takes precedence
  • ${chalk.cyan('Project')} (.mcp.json): Project-specific, recommended

${chalk.bold('Best Practices:')}
  • Use project scope for project-specific tools
  • Keep local scope for global utilities only
  • Let the init command handle configuration automatically

${chalk.gray('For more help: https://github.com/masharratt/claude-flow-novice/issues')}
`;

    console.log(boxen(guide.trim(), {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'yellow'
    }));
  }

  /**
   * Enhanced interactive prompt with proper readline support
   */
  async promptForConfirmation(message, defaultValue = true) {
    if (!this.interactive) {
      if (this.verbose) {
        console.log(`${chalk.yellow('⚠️')} ${message}`);
        console.log(`   ${chalk.gray(`(Auto-confirming: ${defaultValue ? 'yes' : 'no'})`)}`);
      }
      return defaultValue;
    }

    const prompt = `${chalk.yellow('❓')} ${message} ${chalk.gray(defaultValue ? '[Y/n]' : '[y/N]')}: `;

    return new Promise((resolve) => {
      if (!this.rl) {
        this.rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
      }

      this.rl.question(prompt, (answer) => {
        const response = answer.trim().toLowerCase();

        if (response === '') {
          resolve(defaultValue);
        } else if (response === 'y' || response === 'yes') {
          resolve(true);
        } else if (response === 'n' || response === 'no') {
          resolve(false);
        } else {
          console.log(chalk.yellow('Please answer y/yes or n/no'));
          resolve(this.promptForConfirmation(message, defaultValue));
        }
      });
    });
  }

  /**
   * Clean up readline interface
   */
  cleanup() {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  /**
   * Enhanced error analysis for better recovery recommendations
   */
  analyzeError(error) {
    const analysis = {
      type: 'unknown',
      severity: 'medium',
      recoverable: true,
      category: 'general'
    };

    const message = error.message.toLowerCase();

    if (message.includes('permission denied') || message.includes('eacces')) {
      analysis.type = 'permission';
      analysis.severity = 'high';
      analysis.category = 'filesystem';
    } else if (message.includes('not found') || message.includes('enoent')) {
      analysis.type = 'missing-file';
      analysis.severity = 'high';
      analysis.category = 'filesystem';
    } else if (message.includes('claude') && message.includes('not installed')) {
      analysis.type = 'missing-dependency';
      analysis.severity = 'critical';
      analysis.category = 'environment';
      analysis.recoverable = false;
    } else if (message.includes('timeout') || message.includes('timed out')) {
      analysis.type = 'timeout';
      analysis.severity = 'medium';
      analysis.category = 'network';
    } else if (message.includes('json') || message.includes('parse')) {
      analysis.type = 'config-corruption';
      analysis.severity = 'high';
      analysis.category = 'configuration';
    }

    return analysis;
  }

  /**
   * Enhanced error recovery options based on comprehensive analysis
   */
  generateRecoveryOptions(error) {
    const options = [];
    const analysis = this.analyzeError(error);

    switch (analysis.type) {
      case 'permission':
        options.push({
          description: 'Check file permissions on configuration files',
          command: 'ls -la ~/.claude.json && ls -la .mcp.json'
        });
        options.push({
          description: 'Run with appropriate user privileges',
          command: 'sudo chown $USER ~/.claude.json'
        });
        break;

      case 'missing-file':
        options.push({
          description: 'Verify Claude Code installation',
          command: 'claude --version'
        });
        options.push({
          description: 'Reinstall Claude Code if needed',
          command: 'npm install -g @anthropic-ai/claude-code'
        });
        break;

      case 'missing-dependency':
        options.push({
          description: 'Install Claude Code CLI',
          command: 'npm install -g @anthropic-ai/claude-code'
        });
        options.push({
          description: 'Verify installation',
          command: 'claude --version'
        });
        break;

      case 'timeout':
        options.push({
          description: 'Retry with increased timeout',
          command: 'npx claude-flow-novice init --timeout 60000'
        });
        options.push({
          description: 'Check network connectivity',
          command: 'ping -c 3 registry.npmjs.org'
        });
        break;

      case 'config-corruption':
        options.push({
          description: 'Backup and reset configuration',
          command: 'cp ~/.claude.json ~/.claude.json.backup && rm ~/.claude.json'
        });
        options.push({
          description: 'Validate JSON syntax',
          command: 'python -m json.tool ~/.claude.json'
        });
        break;

      default:
        options.push({
          description: 'Clean up broken server configurations',
          command: 'claude mcp remove claude-flow-novice -s local'
        });
        options.push({
          description: 'Run health check for detailed analysis',
          command: 'npx claude-flow-novice mcp health --verbose'
        });
    }

    // Always include the emergency reset option
    options.push({
      description: 'Emergency reset (removes all MCP configurations)',
      command: 'claude mcp remove --all && rm -f .mcp.json'
    });

    return options;
  }

  /**
   * Enhanced educational content with bulletproof approach explanation
   */
  displayMcpEducation() {
    console.log('\n' + chalk.blue.bold('📚 Understanding MCP Configuration'));
    console.log('━'.repeat(60));

    console.log('\n' + chalk.cyan.bold('What is MCP?'));
    console.log('Model Context Protocol (MCP) allows Claude Code to use external tools');
    console.log('and services. Each MCP server provides a set of capabilities.');
    console.log('');
    console.log('Think of it as a secure bridge between Claude and your development environment.');

    console.log('\n' + chalk.cyan.bold('Configuration Scopes:'));
    console.log('');
    console.log(chalk.yellow('Local Scope') + ' (~/.claude.json):');
    console.log('  • User-global configuration');
    console.log('  • Takes precedence over project config');
    console.log('  • Use for tools you want available everywhere');
    console.log('  • ' + chalk.red('Can cause conflicts between projects'));
    console.log('');
    console.log(chalk.yellow('Project Scope') + ' (.mcp.json):');
    console.log('  • Project-specific configuration');
    console.log('  • Recommended for project tools');
    console.log('  • Doesn\'t affect other projects');
    console.log('  • ' + chalk.green('Isolated and conflict-free'));

    console.log('\n' + chalk.cyan.bold('Why Our Bulletproof Approach Works:'));
    console.log(chalk.green('  ✅ Automatically detects and fixes broken configurations'));
    console.log(chalk.green('  ✅ Creates safety backups before making changes'));
    console.log(chalk.green('  ✅ Uses project scope to avoid conflicts'));
    console.log(chalk.green('  ✅ Provides rollback capability if anything goes wrong'));
    console.log(chalk.green('  ✅ Comprehensive verification testing'));
    console.log(chalk.green('  ✅ Clear error recovery guidance'));

    console.log('\n' + chalk.cyan.bold('Claude Flow Novice Setup Process:'));
    console.log('  1. ' + chalk.blue('Health Check') + ' - Analyze current configuration state');
    console.log('  2. ' + chalk.blue('Backup') + ' - Create safety backups of existing configs');
    console.log('  3. ' + chalk.blue('Cleanup') + ' - Fix broken and conflicting configurations');
    console.log('  4. ' + chalk.blue('Configure') + ' - Set up optimal project configuration');
    console.log('  5. ' + chalk.blue('Verify') + ' - Test configuration integrity');
    console.log('  6. ' + chalk.blue('Rollback') + ' - Automatic recovery if verification fails');

    console.log('\n' + chalk.cyan.bold('What You Get:'));
    console.log(chalk.magenta('  🛠️  30+ essential development tools for Claude Code'));
    console.log(chalk.magenta('  🔧 Automated project setup and configuration'));
    console.log(chalk.magenta('  📊 Real-time system monitoring and health checks'));
    console.log(chalk.magenta('  🚀 Performance optimization and bottleneck analysis'));
    console.log(chalk.magenta('  🧠 AI-powered development assistance'));
    console.log(chalk.magenta('  🔄 Automated backup and recovery systems'));

    console.log('\n' + chalk.gray('This bulletproof approach ensures a smooth, conflict-free experience'));
    console.log(chalk.gray('with automatic error recovery and comprehensive user guidance.'));
    console.log('━'.repeat(60));
  }
}

/**
 * Enhanced convenience function for bulletproof UX flow
 */
export async function executeWithUserExperience(operation, options = {}) {
  const ux = new McpUserExperience(options);

  try {
    // Show educational content if requested
    if (options.showEducation) {
      ux.displayMcpEducation();
    }

    // Execute the operation with enhanced UX feedback
    const result = await operation(ux);

    if (result.success) {
      ux.displaySuccessSummary(result.details || {});
    } else {
      // Enhanced error recovery with comprehensive information
      const recovery = result.recovery || {
        errorAnalysis: ux.analyzeError(result.error || new Error(result.error || 'Unknown error')),
        recommendedActions: ux.generateRecoveryOptions(result.error || new Error(result.error || 'Unknown error')).map(opt => opt.description),
        rollbackPerformed: false,
        backupsAvailable: false
      };

      ux.displayErrorRecovery(result.error || new Error(result.error || 'Unknown error'), recovery);
    }

    return result;

  } catch (error) {
    const recovery = {
      errorAnalysis: ux.analyzeError(error),
      recommendedActions: ux.generateRecoveryOptions(error).map(opt => opt.description),
      rollbackPerformed: false,
      backupsAvailable: false
    };

    ux.displayErrorRecovery(error, recovery);
    return { success: false, error };
  } finally {
    // Always cleanup readline interface
    ux.cleanup();
  }
}

/**
 * Quick health check display with UX enhancements
 */
export function displayHealthCheckResults(results, options = {}) {
  const ux = new McpUserExperience(options);

  console.log('\n' + chalk.blue.bold('🏥 MCP Health Check Results'));
  console.log('━'.repeat(50));

  const healthColor = results.healthy ? 'green' : results.needsAttention ? 'yellow' : 'red';
  const healthIcon = results.healthy ? '✅' : results.needsAttention ? '⚠️' : '❌';

  console.log(`\nOverall Status: ${ux.colorize(`${healthIcon} ${results.healthy ? 'Healthy' : 'Needs Attention'}`, healthColor)}`);

  if (results.healthScore !== undefined) {
    console.log(`Health Score: ${ux.colorize(`${results.healthScore}/100`, healthColor)} ${ux.generateHealthBar(results.healthScore)}`);
  }

  if (results.state) {
    ux.displayConfigurationAnalysis(results.state);
  }

  if (results.verification && results.verification.tests) {
    console.log('\n' + chalk.cyan('🧪 Verification Tests:'));
    results.verification.tests.forEach(test => {
      const status = test.passed ? chalk.green('✅') : chalk.red('❌');
      console.log(`  ${status} ${test.name}: ${test.details}`);
    });
  }

  ux.cleanup();
}

export default McpUserExperience;

// Export additional utility functions for enhanced UX
export { executeWithUserExperience, displayHealthCheckResults };