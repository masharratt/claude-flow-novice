#!/usr/bin/env node

/**
 * CFN Post-install Script
 *
 * This script runs after npm install to properly set up CFN structure.
 * It handles:
 * 1. Preserving existing custom agents in the target project
 * 2. Only updating/replacing the cfn-dev-team folder
 * 3. Setting up local-ruvector for semantic code search
 * 4. Installing git hooks for auto-indexing on commit (handles deleted/renamed files)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function copyCFNDevTeam(targetDir) {
  const sourceAgentsDir = path.join(projectRoot, '.claude', 'agents');
  const targetAgentsDir = path.join(targetDir, '.claude', 'agents');

  // Skip if we're in the npm package itself
  if (targetDir === projectRoot) {
    log('Skipping CFN setup in npm package directory', 'yellow');
    return;
  }

  // Ensure .claude/agents directory exists
  fs.mkdirSync(targetAgentsDir, { recursive: true });

  const sourceCFNDir = path.join(sourceAgentsDir, 'cfn-dev-team');
  const targetCFNDir = path.join(targetAgentsDir, 'cfn-dev-team');

  // Remove existing cfn-dev-team if it exists
  if (fs.existsSync(targetCFNDir)) {
    log(`Removing existing cfn-dev-team in ${targetDir}`, 'yellow');
    fs.rmSync(targetCFNDir, { recursive: true, force: true });
  }

  // Copy new cfn-dev-team
  if (fs.existsSync(sourceCFNDir)) {
    log(`Copying cfn-dev-team to ${targetDir}`, 'cyan');
    fs.cpSync(sourceCFNDir, targetCFNDir, { recursive: true });
    log('✓ cfn-dev-team agents updated successfully', 'green');
  } else {
    log(`Warning: cfn-dev-team not found in ${sourceCFNDir}`, 'yellow');
  }
}

function updateSkillsAndCommands(targetDir) {
  const sourceDir = path.join(projectRoot, '.claude');
  const targetClaudeDir = path.join(targetDir, '.claude');

  // Update skills (preserve existing)
  const sourceSkillsDir = path.join(sourceDir, 'skills');
  const targetSkillsDir = path.join(targetClaudeDir, 'skills');

  if (fs.existsSync(sourceSkillsDir)) {
    if (!fs.existsSync(targetSkillsDir)) {
      fs.mkdirSync(targetSkillsDir, { recursive: true });
    }

    // Copy new/updated skills
    const skills = fs.readdirSync(sourceSkillsDir);
    for (const skill of skills) {
      const sourceSkill = path.join(sourceSkillsDir, skill);
      const targetSkill = path.join(targetSkillsDir, skill);

      if (fs.statSync(sourceSkill).isDirectory()) {
        if (fs.existsSync(targetSkill)) {
          fs.rmSync(targetSkill, { recursive: true, force: true });
        }
        fs.cpSync(sourceSkill, targetSkill, { recursive: true });
      }
    }
    log('✓ CFN skills updated', 'green');
  }

  // Update commands
  const sourceCommandsDir = path.join(sourceDir, 'commands');
  const targetCommandsDir = path.join(targetClaudeDir, 'commands');

  if (fs.existsSync(sourceCommandsDir)) {
    if (fs.existsSync(targetCommandsDir)) {
      fs.rmSync(targetCommandsDir, { recursive: true, force: true });
    }
    fs.cpSync(sourceCommandsDir, targetCommandsDir, { recursive: true });
    log('✓ CFN commands updated', 'green');
  }
}

function installGitHooks(targetDir) {
  const gitDir = path.join(targetDir, '.git');
  const hooksDir = path.join(gitDir, 'hooks');

  // Only install if this is a git repo
  if (!fs.existsSync(gitDir)) {
    log('Not a git repository - skipping hook installation', 'yellow');
    return;
  }

  // Ensure hooks directory exists
  fs.mkdirSync(hooksDir, { recursive: true });

  // Install post-commit hook for RuVector indexing
  const hookSource = path.join(targetDir, '.claude', 'hooks', 'post-commit-codebase-index');
  const hookDest = path.join(hooksDir, 'post-commit');

  if (fs.existsSync(hookSource)) {
    // Check if existing hook is not ours
    if (fs.existsSync(hookDest)) {
      const existingContent = fs.readFileSync(hookDest, 'utf-8');
      if (!existingContent.includes('RuVector')) {
        // Backup existing hook and append ours
        const backupPath = path.join(hooksDir, 'post-commit.backup');
        fs.copyFileSync(hookDest, backupPath);
        log(`Backed up existing post-commit hook to ${backupPath}`, 'yellow');

        // Append our hook call to existing
        const appendContent = `\n\n# CFN RuVector indexing (added by claude-flow-novice)\n${hookSource}\n`;
        fs.appendFileSync(hookDest, appendContent);
        log('✓ Appended RuVector hook to existing post-commit', 'green');
      } else {
        // Already has our hook, update it
        fs.copyFileSync(hookSource, hookDest);
        fs.chmodSync(hookDest, 0o755);
        log('✓ Updated post-commit hook', 'green');
      }
    } else {
      // No existing hook, install ours
      fs.copyFileSync(hookSource, hookDest);
      fs.chmodSync(hookDest, 0o755);
      log('✓ Installed post-commit hook for RuVector indexing', 'green');
    }
  }
}

function setupLocalRuvector(targetDir) {
  const ruvectorSkillDir = path.join(targetDir, '.claude', 'skills', 'cfn-local-ruvector-accelerator');

  // Check if local-ruvector binary is available in PATH or ~/.local/bin
  const homeBin = process.env.HOME
    ? path.join(process.env.HOME, '.local', 'bin', 'local-ruvector')
    : null;

  // Check if binary exists in PATH
  let binaryInPath = false;
  try {
    execSync('which local-ruvector', { stdio: 'ignore' });
    binaryInPath = true;
  } catch {
    binaryInPath = false;
  }

  if (binaryInPath || (homeBin && fs.existsSync(homeBin))) {
    log('✓ local-ruvector binary found', 'green');
    return;
  }

  // Check if Rust is available for building
  let hasRust = false;
  try {
    execSync('cargo --version', { stdio: 'ignore' });
    hasRust = true;
  } catch {
    hasRust = false;
  }

  if (hasRust && fs.existsSync(ruvectorSkillDir)) {
    log('Building local-ruvector binary (this may take a minute)...', 'cyan');
    try {
      execSync('cargo build --release', {
        cwd: ruvectorSkillDir,
        stdio: 'inherit'
      });

      // Install to ~/.local/bin
      const targetBinary = path.join(ruvectorSkillDir, 'target', 'release', 'local-ruvector');
      if (fs.existsSync(targetBinary) && process.env.HOME) {
        const installDir = path.join(process.env.HOME, '.local', 'bin');
        fs.mkdirSync(installDir, { recursive: true });
        fs.copyFileSync(targetBinary, path.join(installDir, 'local-ruvector'));
        fs.chmodSync(path.join(installDir, 'local-ruvector'), 0o755);
        log('✓ local-ruvector installed to ~/.local/bin/', 'green');
        log('  Ensure ~/.local/bin is in your PATH', 'cyan');
      }
    } catch (err) {
      log('Warning: Failed to build local-ruvector: ' + err.message, 'yellow');
    }
  } else {
    log('Note: local-ruvector binary not found.', 'yellow');
    log('To enable fast semantic code search:', 'cyan');
    log('  1. Install Rust: curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh', 'white');
    log('  2. Build ruvector: npm run ruvector:local:build', 'white');
    log('  3. Install binary: cp .claude/skills/cfn-local-ruvector-accelerator/target/release/local-ruvector ~/.local/bin/', 'white');
  }
}

// Main execution
function main() {
  log('CFN Post-install Script', 'cyan');
  log('========================', 'cyan');

  // Check if we're in a project that needs CFN setup
  const packageJsonPath = path.join(process.cwd(), 'package.json');

  // Only run if not in the CFN package itself
  if (process.cwd() !== projectRoot && fs.existsSync(packageJsonPath)) {
    log(`Setting up CFN in: ${process.cwd()}`, 'cyan');

    // Initialize .claude directory if it doesn't exist
    const claudeDir = path.join(process.cwd(), '.claude');
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    // Copy cfn-dev-team agents
    copyCFNDevTeam(process.cwd());

    // Update skills and commands
    updateSkillsAndCommands(process.cwd());

    // Setup local-ruvector binary
    setupLocalRuvector(process.cwd());

    // Install git hooks for auto-indexing
    installGitHooks(process.cwd());

    // Create .cfn-initialized marker
    fs.writeFileSync(path.join(claudeDir, '.cfn-initialized'), new Date().toISOString());

    log('\nCFN setup complete! 🎉', 'green');
    log('You can now use CFN commands like:', 'cyan');
    log('  /cfn-loop-cli "Task description" --mode=standard', 'white');
    log('  /cfn-loop-task "Task description" --mode=standard', 'white');
  }
}

// Run the script
try {
  main();
} catch (error) {
  console.error('CFN post-install failed:', error);
  process.exit(1);
}
