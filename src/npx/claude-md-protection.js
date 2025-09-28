/**
 * NPX CLAUDE.md Protection System
 *
 * Prevents NPX installs from overwriting user's customized CLAUDE.md files
 * Creates claude-copy-to-main.md for safe manual merging
 */

import { ClaudeMdSlashCommand } from '../slash-commands/claude-md.js';
import fs from 'fs/promises';
import path from 'path';

export class NpxClaudeMdProtection {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    this.packageJsonPath = path.join(projectPath, 'package.json');
  }

  /**
   * Main NPX protection workflow
   */
  async protectAndGenerate() {
    try {
      console.log('🛡️ NPX CLAUDE.md Protection Active...');

      // Check if this is an NPX environment
      const isNpxInstall = await this.detectNpxInstall();

      if (!isNpxInstall) {
        console.log('ℹ️ Not an NPX install - proceeding normally');
        return await this.generateNormal();
      }

      // Check if user has existing CLAUDE.md
      const hasExistingClaude = await this.hasExistingClaudeMd();

      if (!hasExistingClaude) {
        console.log('📄 No existing CLAUDE.md - safe to create new one');
        return await this.generateNormal();
      }

      // Protection scenario: Generate claude-copy-to-main.md
      console.log('🔒 Existing CLAUDE.md detected - activating protection');
      return await this.generateProtected();

    } catch (error) {
      console.error('❌ NPX protection failed:', error.message);
      throw error;
    }
  }

  /**
   * Detect if this is running in NPX context
   */
  async detectNpxInstall() {
    // Check environment variables
    if (process.env.NPX_INSTALL === 'true' || process.env.npm_command === 'exec') {
      return true;
    }

    // Check if we're in a temporary NPX directory
    if (this.projectPath.includes('/.npm/_npx/') || this.projectPath.includes('\\.npm\\_npx\\')) {
      return true;
    }

    // Check if package.json indicates fresh install
    try {
      const packageJson = await fs.readFile(this.packageJsonPath, 'utf8');
      const pkg = JSON.parse(packageJson);

      // If claude-flow-novice was just installed
      if (pkg.dependencies?.['claude-flow-novice'] || pkg.devDependencies?.['claude-flow-novice']) {
        return true;
      }
    } catch {
      // No package.json or parsing error - probably not NPX
    }

    return false;
  }

  /**
   * Check if user has existing CLAUDE.md with customizations
   */
  async hasExistingClaudeMd() {
    try {
      const content = await fs.readFile(this.claudeMdPath, 'utf8');

      // Simple heuristic: if file is longer than default template,
      // it probably has customizations
      return content.length > 1000;
    } catch {
      return false;
    }
  }

  /**
   * Generate CLAUDE.md normally (no protection needed)
   */
  async generateNormal() {
    const command = new ClaudeMdSlashCommand(this.projectPath);
    return await command.execute({
      backup: true,
      force: false,
      isNpxInstall: false
    });
  }

  /**
   * Generate with protection (create claude-copy-to-main.md)
   */
  async generateProtected() {
    const command = new ClaudeMdSlashCommand(this.projectPath);
    const result = await command.execute({
      backup: false, // Don't backup since we're not overwriting
      force: false,
      isNpxInstall: true // This triggers the protection
    });

    // Show user-friendly instructions
    this.showProtectionInstructions();

    return result;
  }

  /**
   * Show clear instructions to user about the protection
   */
  showProtectionInstructions() {
    console.log('\n🎉 Your CLAUDE.md is protected!');
    console.log('━'.repeat(50));
    console.log('📋 What happened:');
    console.log('  • NPX detected an existing CLAUDE.md file');
    console.log('  • To protect your customizations, we created:');
    console.log('    → claude-copy-to-main.md');
    console.log('');
    console.log('🔄 Next steps:');
    console.log('  1. Review: cat claude-copy-to-main.md');
    console.log('  2. Merge desired changes into your CLAUDE.md');
    console.log('  3. Delete: rm claude-copy-to-main.md');
    console.log('');
    console.log('💡 Your original CLAUDE.md remains untouched!');
    console.log('━'.repeat(50));
  }

  /**
   * Hook for package.json postinstall script
   */
  static async postInstallHook(projectPath) {
    try {
      const protection = new NpxClaudeMdProtection(projectPath);
      await protection.protectAndGenerate();
    } catch (error) {
      console.warn('⚠️ CLAUDE.md protection failed:', error.message);
      // Don't fail the install if this fails
    }
  }
}

/**
 * CLI entry point for NPX protection
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const projectPath = process.argv[2] || process.cwd();

  NpxClaudeMdProtection.postInstallHook(projectPath)
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}