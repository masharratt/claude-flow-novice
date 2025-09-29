// MCP Troubleshooting Command
// Provides diagnostic and repair tools for MCP configuration issues
// Can be used standalone: npx claude-flow-novice mcp troubleshoot

import { McpConfigurationManager } from '../../mcp/mcp-config-manager.js';
import { McpUserExperience } from '../mcp-user-experience.js';
import { printSuccess, printWarning, printError } from '../utils.js';

export async function mcpTroubleshootCommand(subArgs = [], flags = {}) {
  const action = subArgs[0] || 'diagnose';
  const options = {
    verbose: flags.verbose || flags.v,
    autoFix: flags.autoFix || flags.fix,
    dryRun: flags.dryRun || flags.d,
    interactive: flags.interactive !== false
  };

  console.log('🔧 MCP Troubleshooting Tool');
  console.log('===========================\n');

  const manager = new McpConfigurationManager(options);
  const ux = new McpUserExperience(options);

  try {
    switch (action) {
      case 'diagnose':
        await diagnoseConfiguration(manager, ux, options);
        break;

      case 'fix':
        await fixConfiguration(manager, ux, options);
        break;

      case 'reset':
        await resetConfiguration(manager, ux, options);
        break;

      case 'guide':
        ux.displayTroubleshootingGuide();
        break;

      case 'education':
        ux.displayMcpEducation();
        break;

      case 'status':
        await showConfigurationStatus(manager, ux);
        break;

      default:
        showTroubleshootHelp();
    }

  } catch (error) {
    const recoveryOptions = ux.generateRecoveryOptions(error);
    ux.displayErrorRecovery(error, recoveryOptions);
    process.exit(1);
  }
}

/**
 * Diagnose current MCP configuration
 */
async function diagnoseConfiguration(manager, ux, options) {
  console.log('🔍 Diagnosing MCP configuration...\n');

  const state = await manager.detectConfigurationState();
  const audit = await manager.performPreInitAudit();

  // Display comprehensive analysis
  ux.displayConfigurationAnalysis({ ...state, hasIssues: audit.hasIssues });

  if (audit.hasIssues) {
    console.log('\n🔧 Available Fixes:');

    if (audit.autoFixable.length > 0) {
      console.log('\n✅ Auto-fixable issues:');
      audit.autoFixable.forEach((fix, index) => {
        console.log(`  ${index + 1}. ${fix.description}`);
      });
    }

    if (audit.requiresConfirmation.length > 0) {
      console.log('\n⚠️  Issues requiring confirmation:');
      audit.requiresConfirmation.forEach((fix, index) => {
        console.log(`  ${index + 1}. ${fix.description}`);
        console.log(`     Recommendation: ${fix.recommendation}`);
      });
    }

    console.log('\n💡 To fix automatically, run:');
    console.log('   npx claude-flow-novice mcp troubleshoot fix');
  } else {
    printSuccess('✅ No MCP configuration issues found!');
  }
}

/**
 * Fix configuration issues
 */
async function fixConfiguration(manager, ux, options) {
  console.log('🔧 Fixing MCP configuration issues...\n');

  const audit = await manager.performPreInitAudit();

  if (!audit.hasIssues) {
    printSuccess('✅ No issues found to fix!');
    return;
  }

  console.log(`Found ${audit.autoFixable.length + audit.requiresConfirmation.length} issue(s) to fix\n`);

  // Auto-fix what we can
  for (const fix of audit.autoFixable) {
    if (!options.dryRun) {
      console.log(`🔄 ${fix.description}...`);
      await fix.action();
      printSuccess(`✅ ${fix.description}`);
    } else {
      console.log(`[DRY RUN] Would ${fix.description}`);
    }
  }

  // Handle confirmation required fixes
  for (const fix of audit.requiresConfirmation) {
    if (options.autoFix) {
      if (!options.dryRun) {
        console.log(`🔄 ${fix.description}...`);
        await fix.action();
        printSuccess(`✅ ${fix.description}`);
      } else {
        console.log(`[DRY RUN] Would ${fix.description}`);
      }
    } else {
      const confirmed = await ux.promptForConfirmation(
        `Apply fix: ${fix.description}?`,
        true
      );

      if (confirmed && !options.dryRun) {
        console.log(`🔄 ${fix.description}...`);
        await fix.action();
        printSuccess(`✅ ${fix.description}`);
      } else if (!confirmed) {
        console.log(`⏭️  Skipped: ${fix.description}`);
      }
    }
  }

  if (!options.dryRun) {
    printSuccess('\n🎉 Configuration fixes completed!');
    console.log('\n💡 Run the following to verify:');
    console.log('   claude mcp list');
  }
}

/**
 * Reset MCP configuration (nuclear option)
 */
async function resetConfiguration(manager, ux, options) {
  console.log('💥 Resetting MCP configuration...\n');

  printWarning('⚠️  This will remove ALL MCP server configurations!');

  const confirmed = await ux.promptForConfirmation(
    'Are you sure you want to reset all MCP configurations?',
    false
  );

  if (!confirmed) {
    console.log('❌ Reset cancelled');
    return;
  }

  if (!options.dryRun) {
    try {
      // Remove all local MCP servers
      console.log('🔄 Removing all local MCP servers...');
      const { execSync } = await import('child_process');

      try {
        execSync('claude mcp remove --all -s local', { stdio: 'pipe' });
      } catch (err) {
        // Some might not exist, that's ok
      }

      // Remove project config
      console.log('🔄 Removing project MCP configuration...');
      const { promises: fs } = await import('fs');
      try {
        await fs.unlink('.mcp.json');
      } catch (err) {
        // File might not exist, that's ok
      }

      printSuccess('✅ MCP configuration reset completed');
      console.log('\n💡 To setup MCP again, run:');
      console.log('   npx claude-flow-novice init');

    } catch (error) {
      printError(`Reset failed: ${error.message}`);
    }
  } else {
    console.log('[DRY RUN] Would remove all MCP configurations');
  }
}

/**
 * Show current configuration status
 */
async function showConfigurationStatus(manager, ux) {
  console.log('📊 MCP Configuration Status\n');

  const state = await manager.detectConfigurationState();

  // Simple status display
  console.log(`Local config (~/.claude.json): ${state.hasLocalConfig ? '✅ Found' : '❌ Not found'}`);
  console.log(`Project config (.mcp.json): ${state.hasProjectConfig ? '✅ Found' : '❌ Not found'}`);

  if (state.localServers.length > 0) {
    console.log('\n📋 Local MCP Servers:');
    state.localServers.forEach(server => {
      const broken = state.brokenPaths.some(bp => bp.serverName === server.name);
      const status = broken ? '🔴 Broken' : '✅ OK';
      console.log(`  • ${server.name}: ${status}`);
    });
  }

  if (state.projectServers.length > 0) {
    console.log('\n📋 Project MCP Servers:');
    state.projectServers.forEach(server => {
      console.log(`  • ${server.name}: ✅ Configured`);
    });
  }

  if (state.conflictingServers.length > 0) {
    console.log('\n⚠️  Configuration Conflicts:');
    state.conflictingServers.forEach(conflict => {
      console.log(`  • ${conflict.serverName}: Local config overrides project config`);
    });
  }

  if (state.brokenPaths.length > 0) {
    console.log('\n🔴 Broken Configurations:');
    state.brokenPaths.forEach(broken => {
      console.log(`  • ${broken.serverName}: ${broken.reason}`);
    });
  }

  if (state.conflictingServers.length === 0 && state.brokenPaths.length === 0) {
    printSuccess('\n✅ No configuration issues detected!');
  } else {
    console.log('\n💡 To fix issues automatically, run:');
    console.log('   npx claude-flow-novice mcp troubleshoot fix');
  }
}

/**
 * Show help for troubleshoot command
 */
function showTroubleshootHelp() {
  console.log(`
MCP Troubleshooting Tool

USAGE:
  npx claude-flow-novice mcp troubleshoot [action] [options]

ACTIONS:
  diagnose     Analyze current MCP configuration (default)
  fix          Automatically fix configuration issues
  reset        Remove all MCP configurations (nuclear option)
  guide        Show troubleshooting guide
  education    Learn about MCP configuration
  status       Show current configuration status

OPTIONS:
  --verbose, -v         Show detailed output
  --auto-fix, --fix     Automatically apply fixes without confirmation
  --dry-run, -d         Show what would be done without making changes
  --no-interactive      Disable interactive prompts

EXAMPLES:
  npx claude-flow-novice mcp troubleshoot
  npx claude-flow-novice mcp troubleshoot fix --auto-fix
  npx claude-flow-novice mcp troubleshoot reset --dry-run
  npx claude-flow-novice mcp troubleshoot guide

For more help: https://github.com/masharratt/claude-flow-novice
`);
}

export default mcpTroubleshootCommand;