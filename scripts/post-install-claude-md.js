#!/usr/bin/env node

/**
 * Post-Install Script for CLAUDE.md Protection
 *
 * This script runs after NPX install to safely handle CLAUDE.md generation
 * without overwriting user customizations
 */

import { NpxClaudeMdProtection } from '../src/npx/claude-md-protection.js';
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

  } catch (error) {
    console.error('❌ Post-install failed:', error.message);
    // Don't fail the entire install if this fails
    process.exit(0);
  }
}

// Execute if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  postInstall();
}

export default postInstall;