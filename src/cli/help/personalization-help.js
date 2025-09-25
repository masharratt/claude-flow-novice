// personalization-help.js - Comprehensive help system for personalization commands
import chalk from 'chalk';

/**
 * Personalization help formatter
 */
export class PersonalizationHelp {
  static showMainHelp() {
    console.log(chalk.blue.bold('\n🎯 Claude Flow Novice Personalization System'));
    console.log(chalk.gray('═'.repeat(65)));
    console.log(chalk.gray('Adaptive AI workflow optimization tailored to your development style\n'));

    console.log(chalk.yellow.bold('🚀 QUICK START:'));
    console.log(`  ${chalk.cyan('claude-flow-novice personalize setup')}     ${chalk.gray('# Run setup wizard (recommended)')}`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize status')}    ${chalk.gray('# Check current configuration')}`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize optimize')}  ${chalk.gray('# Get optimization suggestions')}`);

    console.log(chalk.yellow.bold('\n📊 MAIN COMMANDS:'));
    console.log(`  ${chalk.cyan('setup')}       Run interactive personalization wizard`);
    console.log(`  ${chalk.cyan('status')}      Show current personalization settings and system status`);
    console.log(`  ${chalk.cyan('optimize')}    Get AI-powered workflow optimization suggestions`);
    console.log(`  ${chalk.cyan('analytics')}   Display usage analytics, insights, and performance metrics`);
    console.log(`  ${chalk.cyan('dashboard')}   Launch interactive real-time personalization dashboard`);

    console.log(chalk.yellow.bold('\n🔧 FEATURE COMMANDS:'));
    console.log(`  ${chalk.cyan('resource')}    Resource delegation and agent assignment management`);
    console.log(`  ${chalk.cyan('preferences')} Basic preference configuration and settings`);
    console.log(`  ${chalk.cyan('content')}     Content filtering and prioritization controls`);
    console.log(`  ${chalk.cyan('workflow')}    Workflow optimization and automation settings`);

    console.log(chalk.yellow.bold('\n💾 DATA MANAGEMENT:'));
    console.log(`  ${chalk.cyan('export')}      Export personalization settings to JSON file`);
    console.log(`  ${chalk.cyan('import')}      Import personalization settings from JSON file`);
    console.log(`  ${chalk.cyan('reset')}       Reset all personalization settings to defaults`);

    console.log(chalk.yellow.bold('\n🎛️ GLOBAL FLAGS:'));
    console.log(`  ${chalk.gray('--verbose      Show detailed information and debug output')}`);
    console.log(`  ${chalk.gray('--json         Output results in JSON format for scripting')}`);
    console.log(`  ${chalk.gray('--force        Skip confirmation prompts (use with caution)')}`);
    console.log(`  ${chalk.gray('--dry-run      Preview changes without applying them')}`);
    console.log(`  ${chalk.gray('--interactive  Force interactive mode (override automation)')}`);

    console.log(chalk.blue.bold('\n💡 WORKFLOW EXAMPLES:'));
    console.log(chalk.gray('  First-time setup:'));
    console.log(`    ${chalk.cyan('claude-flow-novice personalize setup')}`);
    console.log(`    ${chalk.cyan('claude-flow-novice personalize status --verbose')}`);

    console.log(chalk.gray('\n  Daily optimization:'));
    console.log(`    ${chalk.cyan('claude-flow-novice personalize optimize --auto-apply')}`);
    console.log(`    ${chalk.cyan('claude-flow-novice personalize analytics --export daily-report.json')}`);

    console.log(chalk.gray('\n  Resource management:'));
    console.log(`    ${chalk.cyan('claude-flow-novice personalize resource assign coder --priority high')}`);
    console.log(`    ${chalk.cyan('claude-flow-novice personalize resource optimize')}`);

    console.log(chalk.gray('\n  Data management:'));
    console.log(`    ${chalk.cyan('claude-flow-novice personalize export my-settings.json')}`);
    console.log(`    ${chalk.cyan('claude-flow-novice personalize import my-settings.json --verify')}`);

    console.log(chalk.blue.bold('\n🏆 KEY FEATURES:'));
    console.log(`  ${chalk.green('✓')} AI-powered workflow optimization based on your usage patterns`);
    console.log(`  ${chalk.green('✓')} Dynamic resource allocation and intelligent agent assignment`);
    console.log(`  ${chalk.green('✓')} Real-time analytics with performance insights and recommendations`);
    console.log(`  ${chalk.green('✓')} Adaptive content filtering based on experience level and context`);
    console.log(`  ${chalk.green('✓')} Cross-session learning with persistent personalization data`);
    console.log(`  ${chalk.green('✓')} Privacy-first design with user-controlled data collection`);

    console.log(chalk.blue.bold('\n🎯 PERSONALIZATION LEVELS:'));
    console.log(`  ${chalk.cyan('Beginner')}    Guided experience with detailed explanations and safeguards`);
    console.log(`  ${chalk.cyan('Intermediate')} Balanced automation with user oversight and learning tips`);
    console.log(`  ${chalk.cyan('Advanced')}     Streamlined workflows with intelligent agent coordination`);
    console.log(`  ${chalk.cyan('Expert')}       Maximum automation with deep customization options`);

    console.log(chalk.yellow.bold('\n📖 MORE HELP:'));
    console.log(`  Use ${chalk.cyan('claude-flow-novice help personalize <command>')} for command-specific help`);
    console.log(`  Use ${chalk.cyan('claude-flow-novice personalize dashboard')} for interactive exploration`);
    console.log(`  Documentation: https://github.com/masharratt/claude-flow-novice/docs/personalization`);

    console.log(chalk.green.bold('\n🌟 GET STARTED:'));
    console.log(chalk.gray('  Run the setup wizard to begin personalizing your Claude Flow Novice experience:'));
    console.log(`  ${chalk.cyan.bold('claude-flow-novice personalize setup')}\n`);
  }

  static showSetupHelp() {
    console.log(chalk.blue.bold('\n🧙‍♂️ Personalization Setup Wizard'));
    console.log(chalk.gray('Interactive configuration for tailored workflow optimization\n'));

    console.log(chalk.yellow.bold('WHAT IT DOES:'));
    console.log('  • Assesses your development experience and project focus areas');
    console.log('  • Configures communication style and feedback verbosity preferences');
    console.log('  • Sets up intelligent agent coordination and resource allocation');
    console.log('  • Enables analytics tracking and performance monitoring');
    console.log('  • Creates personalized workflow automation rules');

    console.log(chalk.yellow.bold('\nSETUP STEPS:'));
    console.log('  1️⃣  Experience Assessment - Skill level and development background');
    console.log('  2️⃣  Project Configuration - Primary project types and technologies');
    console.log('  3️⃣  Communication Style - Feedback tone and explanation verbosity');
    console.log('  4️⃣  Workflow Features - Automation preferences and agent coordination');
    console.log('  5️⃣  Resource Limits - Maximum agents and performance constraints');
    console.log('  6️⃣  Analytics Setup - Usage tracking and insight generation preferences');

    console.log(chalk.yellow.bold('\nUSAGE:'));
    console.log(`  ${chalk.cyan('claude-flow-novice personalize setup')}                # Full interactive wizard`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize setup --immediate')}    # Run optimization after setup`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize setup --minimal')}      # Quick setup with defaults`);

    console.log(chalk.blue.bold('\n💡 TIPS:'));
    console.log('  • Take time to answer questions thoughtfully - better data = better personalization');
    console.log('  • You can always re-run setup or modify individual preferences later');
    console.log('  • Enable analytics for the best optimization suggestions and insights');
    console.log('  • Start with conservative agent limits and increase based on experience');
  }

  static showStatusHelp() {
    console.log(chalk.blue.bold('\n📊 Personalization Status'));
    console.log(chalk.gray('Comprehensive overview of your personalization configuration\n'));

    console.log(chalk.yellow.bold('DISPLAYS:'));
    console.log('  • Setup completion status and configuration version');
    console.log('  • User profile information (experience level, project type)');
    console.log('  • Communication and workflow preferences');
    console.log('  • System component status (resource delegation, filtering, optimization)');
    console.log('  • Recent activity and performance metrics');

    console.log(chalk.yellow.bold('\nUSAGE:'));
    console.log(`  ${chalk.cyan('claude-flow-novice personalize status')}               # Basic status overview`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize status --verbose')}     # Detailed information`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize status --json')}        # Machine-readable output`);

    console.log(chalk.blue.bold('\n🔍 STATUS INDICATORS:'));
    console.log(`  ${chalk.green('✅ Active/Complete')}   - Feature is enabled and functioning`);
    console.log(`  ${chalk.yellow('⚠️  Warning/Incomplete')} - Setup needed or configuration issue`);
    console.log(`  ${chalk.red('❌ Inactive/Error')}     - Feature disabled or system error`);
  }

  static showOptimizeHelp() {
    console.log(chalk.blue.bold('\n🔧 Workflow Optimization'));
    console.log(chalk.gray('AI-powered suggestions for improving your development workflow\n'));

    console.log(chalk.yellow.bold('OPTIMIZATION AREAS:'));
    console.log('  • Agent allocation and resource utilization patterns');
    console.log('  • Workflow automation opportunities and efficiency gains');
    console.log('  • Communication settings and feedback optimization');
    console.log('  • Task delegation strategies and completion patterns');
    console.log('  • Performance bottlenecks and resolution suggestions');

    console.log(chalk.yellow.bold('\nSUGGESTION PRIORITIES:'));
    console.log(`  ${chalk.red('🔴 High Priority')}    - Significant impact, immediate attention recommended`);
    console.log(`  ${chalk.yellow('🟡 Medium Priority')}  - Moderate benefit, consider when convenient`);
    console.log(`  ${chalk.blue('🔵 Low Priority')}     - Minor improvements, optional enhancements`);

    console.log(chalk.yellow.bold('\nUSAGE:'));
    console.log(`  ${chalk.cyan('claude-flow-novice personalize optimize')}              # Show all suggestions`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize optimize --auto-apply')} # Apply safe suggestions`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize optimize --verbose')}    # Include low-priority items`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize optimize --dry-run')}    # Preview without applying`);

    console.log(chalk.blue.bold('\n⚡ QUICK WINS:'));
    console.log('  The system identifies high-impact, low-effort optimizations that can');
    console.log('  provide immediate benefits with minimal configuration changes.');
  }

  static showAnalyticsHelp() {
    console.log(chalk.blue.bold('\n📊 Analytics & Insights'));
    console.log(chalk.gray('Usage patterns, performance metrics, and personalization insights\n'));

    console.log(chalk.yellow.bold('ANALYTICS CATEGORIES:'));
    console.log('  📈 Usage Overview - Command frequency, session patterns, feature adoption');
    console.log('  ⚡ Performance Metrics - Task completion times, success rates, efficiency');
    console.log('  🧠 Personalization Insights - Workflow patterns, optimization opportunities');
    console.log('  🤖 Agent Performance - Individual agent statistics and effectiveness');
    console.log('  🔄 Workflow Patterns - Common task sequences and automation opportunities');

    console.log(chalk.yellow.bold('\nUSAGE:'));
    console.log(`  ${chalk.cyan('claude-flow-novice personalize analytics')}              # Standard report`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize analytics --verbose')}   # Include agent details`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize analytics --patterns')}  # Show workflow patterns`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize analytics --time-series')} # Time-based trends`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize analytics --export report.json')} # Export data`);

    console.log(chalk.blue.bold('\n📋 REPORT SECTIONS:'));
    console.log('  • Usage statistics and activity summaries');
    console.log('  • Performance benchmarks and efficiency metrics');
    console.log('  • Personalization effectiveness and adaptation insights');
    console.log('  • Optimization recommendations based on usage patterns');
    console.log('  • Trend analysis and predictive suggestions');
  }

  static showResourceHelp() {
    console.log(chalk.blue.bold('\n⚡ Resource Delegation Commands'));
    console.log(chalk.gray('Intelligent agent assignment and resource optimization\n'));

    console.log(chalk.yellow.bold('SUBCOMMANDS:'));
    console.log(`  ${chalk.cyan('assign')}    Assign agents to specific tasks or roles`);
    console.log(`  ${chalk.cyan('optimize')}  Optimize current resource allocation`);
    console.log(`  ${chalk.cyan('status')}    Show current resource utilization and agent status`);
    console.log(`  ${chalk.cyan('rules')}     Manage resource allocation rules and preferences`);

    console.log(chalk.yellow.bold('\nEXAMPLES:'));
    console.log(`  ${chalk.cyan('claude-flow-novice personalize resource assign coder --priority high')}`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize resource assign researcher --capabilities "ml,data"')}`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize resource optimize --dry-run')}`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize resource status --verbose')}`);

    console.log(chalk.blue.bold('\n🎯 RESOURCE OPTIMIZATION:'));
    console.log('  • Automatic agent selection based on task complexity and requirements');
    console.log('  • Load balancing across available agents for optimal performance');
    console.log('  • Priority-based scheduling with intelligent queue management');
    console.log('  • Performance tracking and adaptive agent assignment');
  }

  static showDashboardHelp() {
    console.log(chalk.blue.bold('\n📊 Interactive Personalization Dashboard'));
    console.log(chalk.gray('Real-time monitoring and interactive personalization management\n'));

    console.log(chalk.yellow.bold('DASHBOARD FEATURES:'));
    console.log('  • Live performance metrics and system status monitoring');
    console.log('  • Interactive preference adjustment and immediate feedback');
    console.log('  • Real-time optimization suggestions and application');
    console.log('  • Agent activity monitoring and resource utilization visualization');
    console.log('  • Historical analytics with trend analysis and insights');

    console.log(chalk.yellow.bold('\nUSAGE:'));
    console.log(`  ${chalk.cyan('claude-flow-novice personalize dashboard')}              # Launch web dashboard`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize dashboard --terminal')}   # Terminal-based UI`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize dashboard --fullscreen')} # Fullscreen mode`);
    console.log(`  ${chalk.cyan('claude-flow-novice personalize dashboard --refresh 1000')} # Custom refresh rate`);

    console.log(chalk.blue.bold('\n🎛️ INTERACTIVE CONTROLS:'));
    console.log('  • Adjust preferences in real-time with immediate effect');
    console.log('  • Apply optimization suggestions with one-click approval');
    console.log('  • Monitor agent performance and make allocation adjustments');
    console.log('  • Export reports and analytics data in various formats');
  }

  static showCommandSpecificHelp(command) {
    switch (command) {
      case 'setup':
        return this.showSetupHelp();
      case 'status':
        return this.showStatusHelp();
      case 'optimize':
        return this.showOptimizeHelp();
      case 'analytics':
        return this.showAnalyticsHelp();
      case 'resource':
        return this.showResourceHelp();
      case 'dashboard':
        return this.showDashboardHelp();
      default:
        console.log(chalk.red(`No specific help available for: ${command}`));
        console.log(chalk.gray('Use "claude-flow-novice personalize help" for general help'));
        return this.showMainHelp();
    }
  }
}

/**
 * Helper function to show contextual tips based on current state
 */
export function showPersonalizationTips(context = {}) {
  const tips = [];

  if (!context.setupCompleted) {
    tips.push('💡 Run "personalize setup" to get started with AI-powered workflow optimization');
  }

  if (context.lowUsage) {
    tips.push('📈 Use the system more to gather data for better personalization suggestions');
  }

  if (context.hasOptimizations) {
    tips.push('⚡ You have pending optimization suggestions - run "personalize optimize" to see them');
  }

  if (context.analyticsDisabled) {
    tips.push('📊 Enable analytics in your preferences to unlock advanced personalization features');
  }

  if (tips.length > 0) {
    console.log(chalk.blue.bold('\n💡 Personalization Tips:'));
    tips.forEach(tip => console.log(`  ${tip}`));
  }
}

export default PersonalizationHelp;