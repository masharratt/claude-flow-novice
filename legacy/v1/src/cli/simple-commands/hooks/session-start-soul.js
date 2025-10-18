#!/usr/bin/env node

/**
 * Claude Code Session Start Hook - Soul Integration
 *
 * Automatically feeds claude-soul.md content into Claude Code sessions
 * Handles graceful errors when the file is missing
 */

import fs from 'fs/promises';
import path from 'path';
import { printSuccess, printError, printWarning } from '../../utils.js';

export class SessionStartSoulHook {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.claudeSoulPath = path.join(projectPath, 'claude-soul.md');
    this.hookName = 'session-start-soul';
  }

  /**
   * Execute the session start hook
   */
  async execute(options = {}) {
    const {
      silent = false,
      generateMissing = true,
      fallbackToDefault = true
    } = options;

    try {
      if (!silent) {
        console.log('🚀 Session Start: Loading project soul...');
      }

      const soulContent = await this.loadOrGenerateSoul({
        generateMissing,
        fallbackToDefault
      });

      if (soulContent) {
        // Log the soul loading for integration tracking
        await this.logSoulLoad(soulContent, { silent });

        if (!silent) {
          printSuccess('✅ Project soul available for Claude Code session');
          console.log(`📖 Soul file: claude-soul.md (${soulContent.length} chars)`);
        }

        return {
          success: true,
          action: 'soul-loaded',
          contentLength: soulContent.length,
          source: await this.fileExists(this.claudeSoulPath) ? 'file' : 'generated'
        };
      } else {
        if (!silent) {
          printWarning('⚠️ No project soul available - continuing without soul context');
        }

        return {
          success: true,
          action: 'no-soul',
          message: 'Session started without soul context'
        };
      }

    } catch (error) {
      if (!silent) {
        printError(`❌ Session start soul hook failed: ${error.message}`);
      }

      return {
        success: false,
        action: 'error',
        error: error.message
      };
    }
  }

  /**
   * Load existing soul or generate one if missing
   */
  async loadOrGenerateSoul(options = {}) {
    const { generateMissing = true, fallbackToDefault = true } = options;

    try {
      // Try to load existing soul file
      if (await this.fileExists(this.claudeSoulPath)) {
        const content = await fs.readFile(this.claudeSoulPath, 'utf8');
        console.log('📖 Loading existing claude-soul.md');
        return content;
      }

      // File doesn't exist - handle based on options
      if (generateMissing) {
        console.log('🔄 claude-soul.md not found, generating...');
        return await this.generateDefaultSoul();
      }

      if (fallbackToDefault) {
        console.log('🔄 Using minimal project soul...');
        return this.getMinimalSoul();
      }

      return null;

    } catch (error) {
      console.warn(`⚠️ Could not load project soul: ${error.message}`);

      if (fallbackToDefault) {
        return this.getMinimalSoul();
      }

      return null;
    }
  }

  /**
   * Generate a default soul document
   */
  async generateDefaultSoul() {
    try {
      // Import the soul generator
      const { ClaudeSoulSlashCommand } = await import('../../slash-commands/claude-soul.js');
      const generator = new ClaudeSoulSlashCommand(this.projectPath);

      const result = await generator.execute({ backup: false });

      if (result.success) {
        const content = await fs.readFile(this.claudeSoulPath, 'utf8');
        console.log('✅ Generated claude-soul.md for session');
        return content;
      } else {
        throw new Error(`Soul generation failed: ${result.error}`);
      }

    } catch (error) {
      console.warn(`⚠️ Could not generate soul: ${error.message}`);
      return this.getMinimalSoul();
    }
  }

  /**
   * Get minimal soul content as fallback
   */
  getMinimalSoul() {
    const projectName = path.basename(this.projectPath);

    return `# ${projectName} - Project Soul

## WHY - The Purpose
This project aims to solve important problems through software.

## WHAT - The Essence
A software project focused on delivering value through clean, maintainable code.

## HOW - The Approach
Following best practices and iterative development.

## SOUL - The Spirit
Committed to quality, simplicity, and user-centric design.

---
*Minimal soul context - generate full claude-soul.md for complete project essence*
`;
  }

  /**
   * Log soul loading for integration tracking
   */
  async logSoulLoad(soulContent, options = {}) {
    const { silent = false } = options;

    try {
      if (!silent) {
        console.log('📋 Project soul ready for Claude Code session context');
      }

      // Log hook execution for integration with other systems
      await this.logHookExecution(soulContent);

    } catch (error) {
      console.warn(`⚠️ Could not log soul loading: ${error.message}`);
    }
  }

  /**
   * Log hook execution for integration with other systems
   */
  async logHookExecution(soulContent) {
    try {
      // Try to use memory store if available
      const { SqliteMemoryStore } = await import('../../../memory/sqlite-store.js');
      const store = new SqliteMemoryStore();
      await store.initialize();

      const hookData = {
        hookName: this.hookName,
        executedAt: new Date().toISOString(),
        soulContentLength: soulContent.length,
        soulPreview: soulContent.substring(0, 200) + '...',
        projectPath: this.projectPath
      };

      await store.store(`session-start:${Date.now()}`, hookData, {
        namespace: 'session-hooks',
        metadata: { type: 'session-start', hook: this.hookName }
      });

      store.close();

    } catch (error) {
      // Silent fail - memory store is optional
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up (no files to clean since we use claude-soul.md directly)
   */
  async cleanup() {
    // No cleanup needed since we read claude-soul.md directly
    console.log('🧹 Session soul cleanup completed (no temporary files)');
  }
}

/**
 * Execute the session start soul hook
 */
export async function executeSessionStartSoulHook(args = {}) {
  const hook = new SessionStartSoulHook();

  const options = {
    silent: args.silent || args.includes('--silent'),
    generateMissing: !args.includes('--no-generate'),
    fallbackToDefault: !args.includes('--no-fallback')
  };

  return await hook.execute(options);
}

/**
 * Execute session end cleanup
 */
export async function executeSessionEndSoulHook() {
  const hook = new SessionStartSoulHook();
  return await hook.cleanup();
}

// For direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.includes('--cleanup') || args.includes('cleanup')) {
    executeSessionEndSoulHook();
  } else {
    executeSessionStartSoulHook(args);
  }
}