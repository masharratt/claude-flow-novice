// MCP Health Check Command
// Provides comprehensive health monitoring for MCP configuration
// Uses the bulletproof MCP configuration manager for diagnostics

import { printSuccess, printWarning, printError } from '../utils.js';

/**
 * MCP Health Check Command
 * Provides detailed health assessment of MCP configuration
 */
export async function mcpHealthCommand(subArgs, flags) {
  // Show help if requested
  if (flags.help || flags.h || subArgs.includes('--help') || subArgs.includes('-h')) {
    console.log(`
🏥 MCP Health Check

Usage: claude-flow-novice mcp health [options]

Options:
  --verbose         Show detailed diagnostic information
  --fix             Automatically fix detected issues
  --dry-run         Preview fixes without applying changes
  --help, -h        Show this help message

This command performs a comprehensive health check of your MCP configuration:
  • Detects broken server configurations
  • Identifies conflicts between local and project configs
  • Validates Claude Code CLI installation
  • Tests MCP server connectivity
  • Provides actionable recommendations

The health check is safe and read-only by default. Use --fix to automatically
resolve detected issues with full backup and rollback protection.
    `.trim());
    return;
  }

  const options = {
    verbose: flags.verbose || false,
    autoFix: flags.fix || false,
    dryRun: flags['dry-run'] || false
  };

  console.log('🏥 Running MCP health check...');

  try {
    // Import the bulletproof MCP configuration manager
    const { quickMcpHealthCheck, enhancedMcpInit } = await import('../mcp/mcp-config-manager.js');

    // Run comprehensive health check
    const healthResult = await quickMcpHealthCheck(options);

    // Display results using the enhanced UX
    try {
      const { displayHealthCheckResults } = await import('./mcp-user-experience.js');
      displayHealthCheckResults(healthResult, options);
    } catch (uxError) {
      // Fallback to basic output if UX module isn't available
      displayBasicHealthResults(healthResult, options);
    }

    // If issues were found and fix is requested, run the bulletproof setup
    if (!healthResult.healthy && options.autoFix) {
      console.log('\n🛠️  Attempting to fix detected issues...');

      const fixResult = await enhancedMcpInit({
        verbose: options.verbose,
        autoFix: true,
        dryRun: options.dryRun,
        enhancedUx: true
      });

      if (fixResult.success) {
        printSuccess('🎉 All issues have been automatically resolved!');
        console.log('   • Run health check again to verify: npx claude-flow-novice mcp health');
      } else {
        printWarning('⚠️  Some issues could not be automatically resolved');
        if (fixResult.recovery && fixResult.recovery.recommendedActions) {
          console.log('\n🛠️  Manual actions required:');
          fixResult.recovery.recommendedActions.slice(0, 3).forEach((action, i) => {
            console.log(`   ${i + 1}. ${action}`);
          });
        }
      }
    } else if (!healthResult.healthy && !options.autoFix) {
      console.log('\n💡 To automatically fix issues, run:');
      console.log('   npx claude-flow-novice mcp health --fix');
      console.log('\n   Or preview fixes with:');
      console.log('   npx claude-flow-novice mcp health --fix --dry-run');
    }

    // Exit with appropriate code
    process.exit(healthResult.healthy ? 0 : 1);

  } catch (error) {
    printError(`Health check failed: ${error.message}`);

    if (options.verbose) {
      console.error('\n📋 Stack trace:');
      console.error(error.stack);
    }

    console.log('\n🆘 Troubleshooting:');
    console.log('   • Ensure claude-flow-novice is properly installed');
    console.log('   • Check if Claude Code CLI is installed: claude --version');
    console.log('   • Try running: npx claude-flow-novice init --force');

    process.exit(1);
  }
}

/**
 * Basic health results display (fallback when UX module isn't available)
 */
function displayBasicHealthResults(results, options) {
  console.log('\n📊 Health Check Results:');
  console.log('━'.repeat(40));

  const healthIcon = results.healthy ? '✅' : results.needsAttention ? '⚠️' : '❌';
  const healthStatus = results.healthy ? 'Healthy' : 'Needs Attention';

  console.log(`Overall Status: ${healthIcon} ${healthStatus}`);

  if (results.healthScore !== undefined) {
    console.log(`Health Score: ${results.healthScore}/100`);
  }

  if (results.state) {
    console.log('\nConfiguration Status:');
    console.log(`  Claude Code: ${results.state.claudeCodeInstalled ? '✅' : '❌'}`);
    console.log(`  Local Config: ${results.state.hasLocalConfig ? '✅' : '❌'}`);
    console.log(`  Project Config: ${results.state.hasProjectConfig ? '✅' : '❌'}`);

    if (results.state.brokenPaths && results.state.brokenPaths.length > 0) {
      console.log('\n❌ Issues Found:');
      results.state.brokenPaths.forEach(broken => {
        console.log(`  • ${broken.serverName}: ${broken.issues ? broken.issues.join(', ') : 'Configuration issues'}`);
      });
    }

    if (results.state.conflictingServers && results.state.conflictingServers.length > 0) {
      console.log('\n⚠️  Configuration Conflicts:');
      results.state.conflictingServers.forEach(conflict => {
        console.log(`  • ${conflict.serverName}: Local vs Project configuration`);
      });
    }
  }

  if (results.verification && results.verification.tests) {
    console.log('\n🧪 Verification Tests:');
    results.verification.tests.forEach(test => {
      const status = test.passed ? '✅' : '❌';
      console.log(`  ${status} ${test.name}`);
      if (options.verbose && test.details) {
        console.log(`      ${test.details}`);
      }
    });
  }

  console.log('━'.repeat(40));
}

export default mcpHealthCommand;