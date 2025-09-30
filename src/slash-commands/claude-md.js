#!/usr/bin/env node

/**
 * CLAUDE.md Slash Command
 *
 * Simple wrapper around the existing CLAUDE.md generator with NPX protection
 * Keeps it focused and lightweight - no bloat!
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

export class ClaudeMdSlashCommand {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.claudeMdPath = path.join(projectPath, 'CLAUDE.md');
    this.copyToMainPath = path.join(projectPath, 'claude-copy-to-main.md');

    // Get the directory of this module to find the template
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    this.templatePath = path.join(__dirname, '..', 'cli', 'simple-commands', 'init', 'templates', 'CLAUDE.md');
  }

  /**
   * Read the CLAUDE.md template file
   */
  async readTemplate() {
    try {
      const content = await fs.readFile(this.templatePath, 'utf8');
      console.log('✅ Using CLAUDE.md template');
      return content;
    } catch (error) {
      throw new Error(`CLAUDE.md template not found at ${this.templatePath}`);
    }
  }

  /**
   * Main slash command execution
   */
  async execute(options = {}) {
    const {
      backup = true,
      preview = false,
      force = false,
      isNpxInstall = false
    } = options;

    try {
      console.log('🚀 Generating CLAUDE.md...');

      // Step 1: Detect if this is an NPX install scenario
      const existingClaudeExists = await this.fileExists(this.claudeMdPath);
      const shouldUseNpxProtection = isNpxInstall && existingClaudeExists;

      // Step 2: Read template content (no language detection, just use template)
      const newContent = await this.readTemplate();

      // Step 3: Handle NPX protection
      if (shouldUseNpxProtection) {
        await this.handleNpxProtection(newContent);
        return {
          success: true,
          action: 'npx-protection',
          file: 'claude-copy-to-main.md',
          message: 'Generated claude-copy-to-main.md to protect your existing CLAUDE.md'
        };
      }

      // Step 4: Handle preview mode
      if (preview) {
        return {
          success: true,
          action: 'preview',
          content: newContent,
          message: 'Preview generated successfully'
        };
      }

      // Step 5: Handle force/confirmation for existing files
      if (existingClaudeExists && !force) {
        const shouldOverwrite = await this.confirmOverwrite();
        if (!shouldOverwrite) {
          return {
            success: false,
            action: 'cancelled',
            message: 'Generation cancelled by user'
          };
        }
      }

      // Step 6: Write the file
      await fs.writeFile(this.claudeMdPath, newContent, 'utf8');

      console.log('✅ CLAUDE.md generated successfully');
      return {
        success: true,
        action: 'generated',
        file: 'CLAUDE.md',
        length: newContent.length
      };

    } catch (error) {
      console.error('❌ CLAUDE.md generation failed:', error.message);
      return {
        success: false,
        action: 'error',
        error: error.message
      };
    }
  }

  /**
   * NPX Protection: Generate claude-copy-to-main.md instead of overwriting
   */
  async handleNpxProtection(newContent) {
    const protectedContent = this.createProtectedContent(newContent);

    await fs.writeFile(this.copyToMainPath, protectedContent, 'utf8');

    console.log('🛡️ NPX Protection Activated');
    console.log('📄 Generated: claude-copy-to-main.md');
    console.log('💡 Your existing CLAUDE.md is protected from overwrite');
    console.log('🔄 Review and merge changes manually as needed');
  }

  /**
   * Create content for the protected file with merge instructions
   */
  createProtectedContent(newContent) {
    return `# 🛡️ NPX-Protected CLAUDE.md Content

## 📋 Merge Instructions

This file was generated because you have an existing CLAUDE.md file.
To protect your customizations from being overwritten by NPX installs,
the new content is provided here for manual review and merging.

### 🔄 How to Merge:
1. Review the content below
2. Copy sections you want to your main CLAUDE.md
3. Delete this file when done
4. Your customizations remain safe!

---

# Generated CLAUDE.md Content

${newContent}

---

## 🗑️ Cleanup
Delete this file after merging: \`rm claude-copy-to-main.md\`
`;
  }

  /**
   * Simple confirmation prompt for overwriting existing files
   */
  async confirmOverwrite() {
    // In a real implementation, this would use readline or similar
    // For now, return true (could be enhanced with proper prompting)
    console.log('⚠️ CLAUDE.md exists. Use --force to overwrite or --preview to see changes.');
    return false;
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
   * Show preview of what would be generated
   */
  async showPreview() {
    const result = await this.execute({ preview: true });

    if (result.success) {
      console.log('📄 CLAUDE.md Preview:');
      console.log('━'.repeat(50));
      console.log(result.content.substring(0, 1000) + '...');
      console.log('━'.repeat(50));
      console.log(`📊 Total length: ${result.content.length} characters`);
    }

    return result;
  }

  /**
   * Auto-detect project and suggest generation
   */
  async autoDetectAndSuggest() {
    const detector = new LanguageDetector(this.projectPath);
    const detection = await detector.detectProject();

    console.log('🔍 Project Detection Results:');
    console.log(`  Type: ${detection.projectType}`);
    console.log(`  Confidence: ${(detection.confidence * 100).toFixed(1)}%`);

    if (detection.confidence > 0.7) {
      console.log('💡 High confidence - CLAUDE.md generation recommended');
      return true;
    } else {
      console.log('⚠️ Low confidence - manual review recommended');
      return false;
    }
  }
}

/**
 * CLI Interface for slash command
 */
export async function executeClaudeMdCommand(args = {}) {
  const command = new ClaudeMdSlashCommand();

  // Handle different command modes
  if (args.preview) {
    return await command.showPreview();
  }

  if (args.detect) {
    return await command.autoDetectAndSuggest();
  }

  // Default: generate CLAUDE.md
  return await command.execute(args);
}

// For direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = {
    preview: process.argv.includes('--preview'),
    force: process.argv.includes('--force'),
    backup: !process.argv.includes('--no-backup'),
    detect: process.argv.includes('--detect'),
    isNpxInstall: process.env.NPX_INSTALL === 'true'
  };

  executeClaudeMdCommand(args);
}