#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cpAsync = promisify(fs.cp);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);

// Configuration for CFN initialization paths
const CFN_PATHS = {
  agents: {
    src: path.resolve(__dirname, '../.claude/agents/cfn-dev-team'),
    dest: '.claude/agents/cfn-dev-team'
  },
  skills: {
    src: path.resolve(__dirname, '../.claude/skills/cfn-*'),
    dest: '.claude/skills/cfn-*'
  },
  hooks: {
    src: path.resolve(__dirname, '../.claude/hooks/cfn-*'),
    dest: '.claude/hooks/cfn-*'
  },
  commands: {
    src: path.resolve(__dirname, '../.claude/commands/cfn'),
    dest: '.claude/commands/cfn'
  },
  cfnData: {
    src: path.resolve(__dirname, '../.claude/cfn-data'),
    dest: '.claude/cfn-data'
  },
  cfnAgentsIgnore: {
    src: path.resolve(__dirname, '../.claude/cfn-agents-ignore'),
    dest: '.claude/cfn-agents-ignore'
  }
};

async function ensureDirectories() {
  const dirs = [
    '.claude/agents/cfn-dev-team',
    '.claude/skills',
    '.claude/hooks',
    '.claude/commands',
    '.claude/cfn-data',
    '.claude/cfn-agents-ignore'
  ];

  for (const dir of dirs) {
    if (!await existsAsync(dir)) {
      await mkdirAsync(dir, { recursive: true });
      console.log(chalk.green(`✅ Created directory: ${dir}`));
    }
  }
}

async function verifyCfnInstallation() {
  try {
    await import('claude-flow-novice');
  } catch (error) {
    console.error(chalk.red('❌ claude-flow-novice not installed. Please run: npm install claude-flow-novice'));
    process.exit(1);
  }
}

async function copyFiles(src, dest, pattern = '*') {
  try {
    await cpAsync(src, dest, {
      recursive: true,
      force: true,
      filter: (source) => {
        // Optional: Add filtering logic if needed
        return true;
      }
    });
    console.log(chalk.green(`✅ Copied ${src} → ${dest}`));
    return true;
  } catch (error) {
    console.error(chalk.red(`❌ Error copying ${src}: ${error.message}`));
    return false;
  }
}

async function copyCfnClaudeMarkdown() {
  const cfnClaudeMdPath = path.resolve(__dirname, '../CFN-CLAUDE.md');
  const destPath = path.resolve(process.cwd(), 'CFN-CLAUDE.md');

  if (await existsAsync(cfnClaudeMdPath)) {
    try {
      await cpAsync(cfnClaudeMdPath, destPath);
      console.log(chalk.green('📄 CFN-CLAUDE.md copied to project root'));
      console.log(chalk.yellow('💡 Use CFN-CLAUDE.md as a reference. Copy to CLAUDE.md if needed.'));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to copy CFN-CLAUDE.md: ${error.message}`));
    }
  } else {
    console.warn(chalk.yellow('⚠️ CFN-CLAUDE.md not found in source'));
  }
}

async function initializeCfnProject() {
  console.log(chalk.blue('🚀 Claude Flow Novice CFN Initialization'));

  try {
    // Verify prerequisites
    await verifyCfnInstallation();
    await ensureDirectories();

    // Track copied files/directories
    const copyResults = [];

    // Copy CFN files
    for (const [key, { src, dest }] of Object.entries(CFN_PATHS)) {
      const result = await copyFiles(src, dest);
      copyResults.push(result);
    }

    // Copy CFN-CLAUDE.md
    await copyCfnClaudeMarkdown();

    // Summary
    const successCount = copyResults.filter(Boolean).length;
    const totalPaths = Object.keys(CFN_PATHS).length;

    console.log(chalk.green(`\n✅ CFN Installation Complete`));
    console.log(chalk.blue(`   Copied ${successCount}/${totalPaths} paths successfully`));
    console.log(chalk.yellow('\n🔍 Next Steps:'));
    console.log('   1. Review CFN-CLAUDE.md');
    console.log('   2. Configure your project');
    console.log('   3. Run initial CFN setup: npx claude-flow-novice init');

  } catch (error) {
    console.error(chalk.red('❌ CFN Initialization Failed'), error);
    process.exit(1);
  }
}

// Make script executable
if (import.meta.url === `file://${__filename}`) {
  initializeCfnProject();
}

export default initializeCfnProject;
