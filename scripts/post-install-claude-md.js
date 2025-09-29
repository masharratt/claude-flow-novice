#!/usr/bin/env node

/**
 * Post-Install Script for CLAUDE.md Protection
 *
 * This script runs after NPX install to safely handle CLAUDE.md generation
 * without overwriting user customizations
 */

import { NpxClaudeMdProtection } from '../src/npx/claude-md-protection.js';
import { execSync } from 'child_process';
import path from 'path';

async function postInstall() {
  try {
    // Determine the target project path
    // When running via NPX, we want to affect the user's current directory
    const targetPath = process.env.INIT_CWD || process.cwd();

    console.log('🚀 Claude Flow Novice post-install...');
    console.log(`📁 Target directory: ${targetPath}`);

    // Run the protection system
    const protection = new NpxClaudeMdProtection(targetPath);
    const result = await protection.protectAndGenerate();

    if (result.success) {
      console.log('✅ CLAUDE.md setup completed successfully');

      if (result.action === 'npx-protection') {
        console.log('🛡️ Protection mode: Your existing CLAUDE.md is safe');
      } else {
        console.log('📄 New CLAUDE.md created for your project');
      }
    } else {
      console.warn('⚠️ CLAUDE.md setup encountered issues:', result.error);
    }

    // Auto-setup MCP server if Claude Code is installed
    await setupMcpIfAvailable();

  } catch (error) {
    console.error('❌ Post-install failed:', error.message);
    // Don't fail the entire install if this fails
    process.exit(0);
  }
}

async function setupMcpIfAvailable() {
  try {
    // Check if Claude Code CLI is available
    execSync('which claude', { stdio: 'ignore' });

    console.log('\n🔧 Claude Code detected - setting up MCP server...');

    // Add claude-flow-novice MCP server
    execSync('claude mcp add claude-flow-novice npx claude-flow-novice mcp start', {
      stdio: 'inherit'
    });

    console.log('✅ MCP server added successfully!');
    console.log('🎯 You can now use claude-flow-novice tools in Claude Code');

  } catch (error) {
    // Claude Code not installed or MCP add failed - that's fine
    console.log('\n💡 To use claude-flow-novice with Claude Code:');
    console.log('   1. Install Claude Code if you haven\'t: npm install -g @anthropic-ai/claude-code');
    console.log('   2. Add MCP server: claude mcp add claude-flow-novice npx claude-flow-novice mcp start');
    console.log('   3. Or run: npx claude-flow-novice init');
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  postInstall();
}

export default postInstall;