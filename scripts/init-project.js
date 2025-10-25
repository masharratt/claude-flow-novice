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

// Find the CFN package root (works both in dev and installed contexts)
const cfnRoot = path.resolve(process.cwd(), 'node_modules', 'claude-flow-novice');

// Configuration for CFN initialization paths
const CFN_PATHS = {
  agents: {
    src: path.join(cfnRoot, '.claude/agents/cfn-dev-team'),
    dest: '.claude/agents/cfn-dev-team'
  },
  skills: {
    src: path.join(cfnRoot, '.claude/skills'),
    dest: '.claude/skills',
    pattern: 'cfn-*'
  },
  hooks: {
    src: path.join(cfnRoot, '.claude/hooks'),
    dest: '.claude/hooks',
    pattern: 'cfn-*'
  },
  commands: {
    src: path.join(cfnRoot, '.claude/commands/cfn'),
    dest: '.claude/commands/cfn'
  },
  cfnData: {
    src: path.join(cfnRoot, '.claude/cfn-data'),
    dest: '.claude/cfn-data'
  },
  cfnAgentsIgnore: {
    src: path.join(cfnRoot, '.claude/cfn-agents-ignore'),
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
  const cfnPath = path.resolve(process.cwd(), 'node_modules', 'claude-flow-novice');
  if (!fs.existsSync(cfnPath)) {
    console.error(chalk.red('❌ claude-flow-novice not installed. Please run: npm install claude-flow-novice'));
    process.exit(1);
  }
}

async function copyFiles(src, dest, pattern) {
  try {
    if (!fs.existsSync(src)) {
      console.warn(chalk.yellow(`⚠️ Source not found: ${src}`));
      return false;
    }

    if (pattern) {
      // Copy only files/dirs matching pattern (e.g., cfn-*)
      const items = fs.readdirSync(src);
      const matched = items.filter(item => item.startsWith(pattern.replace('*', '')));

      for (const item of matched) {
        const itemSrc = path.join(src, item);
        const itemDest = path.join(dest, item);
        await mkdirAsync(path.dirname(itemDest), { recursive: true });
        await cpAsync(itemSrc, itemDest, { recursive: true, force: true });
      }
      console.log(chalk.green(`✅ Copied ${matched.length} ${pattern} items from ${src}`));
    } else {
      // Copy entire directory
      await mkdirAsync(path.dirname(dest), { recursive: true });
      await cpAsync(src, dest, { recursive: true, force: true });
      console.log(chalk.green(`✅ Copied ${src} → ${dest}`));
    }
    return true;
  } catch (error) {
    console.error(chalk.red(`❌ Error copying ${src}: ${error.message}`));
    return false;
  }
}

async function copyCfnClaudeMarkdown() {
  const cfnClaudeMdPath = path.join(cfnRoot, 'CFN-CLAUDE.md');
  const destPath = path.resolve(process.cwd(), 'CFN-CLAUDE.md');

  if (fs.existsSync(cfnClaudeMdPath)) {
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
  console.log(chalk.blue('\n🚀 Claude Flow Novice CFN Initialization\n'));

  try {
    // Verify prerequisites
    await verifyCfnInstallation();
    await ensureDirectories();

    // Track copied files/directories
    const copyResults = [];

    // Copy CFN files
    for (const [key, config] of Object.entries(CFN_PATHS)) {
      const result = await copyFiles(config.src, config.dest, config.pattern);
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
    console.log('   1. Review CFN-CLAUDE.md in project root');
    console.log('   2. Run your first CFN Loop: npx cfn-loop "Task description"');
    console.log('   3. Check available agents: ls .claude/agents/cfn-dev-team/*/\n');

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
