#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { spawnSync } from 'child_process';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cpAsync = promisify(fs.cp);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);

// Find the CFN package root (works both in dev and installed contexts)
function findCfnRoot() {
  // During postinstall, we're inside the package being installed
  const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (pkg.name === 'claude-flow-novice') {
        // We're running from within the claude-flow-novice package (postinstall)
        return path.resolve(__dirname, '..');
      }
    } catch (e) {
      // Not a valid package.json, continue
    }
  }

  // We're running from a project that has installed claude-flow-novice
  return path.resolve(process.cwd(), 'node_modules', 'claude-flow-novice');
}

const cfnRoot = findCfnRoot();

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
  // Check if cfnRoot exists (works during postinstall and after install)
  if (!fs.existsSync(cfnRoot)) {
    console.error(chalk.red('❌ claude-flow-novice package root not found'));
    console.error(chalk.yellow('cfnRoot:', cfnRoot));
    process.exit(1);
  }

  // Verify critical directories exist
  const criticalPaths = [
    path.join(cfnRoot, '.claude/agents/cfn-dev-team'),
    path.join(cfnRoot, '.claude/skills')
  ];

  for (const p of criticalPaths) {
    if (!fs.existsSync(p)) {
      console.error(chalk.red(`❌ Critical path missing: ${p}`));
      process.exit(1);
    }
  }
}

async function copyFiles(src, dest, pattern, forceOverwrite = true) {
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

        // For cfn-prefixed items, remove existing to ensure clean update
        if (forceOverwrite && fs.existsSync(itemDest)) {
          fs.rmSync(itemDest, { recursive: true, force: true });
        }

        await mkdirAsync(path.dirname(itemDest), { recursive: true });
        await cpAsync(itemSrc, itemDest, { recursive: true, force: true });
      }
      console.log(chalk.green(`✅ Copied ${matched.length} ${pattern} items from ${src} (overwrite: ${forceOverwrite})`));
    } else {
      // Copy entire directory (e.g., cfn-dev-team)
      // Remove existing destination to ensure clean update
      if (forceOverwrite && fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }

      await mkdirAsync(path.dirname(dest), { recursive: true });
      await cpAsync(src, dest, { recursive: true, force: true });
      console.log(chalk.green(`✅ Copied ${src} → ${dest} (overwrite: ${forceOverwrite})`));
    }
    return true;
  } catch (error) {
    console.error(chalk.red(`❌ Error copying ${src}: ${error.message}`));
    return false;
  }
}

async function copyCfnClaudeMarkdown() {
  const cfnClaudeMdPath = path.join(cfnRoot, '.claude/root-claude-distribute/CFN-CLAUDE.md');
  const destPath = path.resolve(process.cwd(), 'CFN-CLAUDE.md');

  if (fs.existsSync(cfnClaudeMdPath)) {
    try {
      await cpAsync(cfnClaudeMdPath, destPath);
      console.log(chalk.green('📄 CFN-CLAUDE.md copied to project root'));
      console.log(chalk.yellow('💡 Activate CFN workflows: cp CFN-CLAUDE.md CLAUDE.md'));
    } catch (error) {
      console.error(chalk.red(`❌ Failed to copy CFN-CLAUDE.md: ${error.message}`));
    }
  } else {
    console.warn(chalk.yellow('⚠️ CFN-CLAUDE.md not found in source'));
  }
}

async function installLizard() {
  console.log(chalk.blue('\n🔧 Installing lizard (complexity analyzer)...'));

  // Check if lizard is already installed
  const checkResult = spawnSync('which', ['lizard'], { encoding: 'utf-8' });
  if (checkResult.status === 0) {
    console.log(chalk.green('✅ Lizard already installed'));
    return;
  }

  // Try to install lizard via pip3
  const pipCommands = [
    ['pip3', 'install', '--user', '--break-system-packages', 'lizard'],
    ['pip3', 'install', '--user', 'lizard'],
    ['pip', 'install', '--user', 'lizard']
  ];

  for (const cmd of pipCommands) {
    const result = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf-8' });
    if (result.status === 0) {
      console.log(chalk.green('✅ Lizard installed successfully'));
      console.log(chalk.yellow('💡 Add to PATH: export PATH="$HOME/.local/bin:$PATH"'));
      return;
    }
  }

  // If all attempts failed, provide instructions
  console.log(chalk.yellow('⚠️ Could not auto-install lizard. Manual installation required:'));
  console.log(chalk.gray('   pip3 install --user lizard'));
  console.log(chalk.gray('   or run: ./tools/install-lizard.sh'));
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

    // Install lizard for complexity analysis
    await installLizard();

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
