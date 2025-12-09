#!/usr/bin/env node

/**
 * CFN Post-install Script
 *
 * This script runs after npm install to properly set up CFN structure.
 * It handles the cfn-dev-team agent installation correctly by:
 * 1. Preserving existing custom agents in the target project
 * 2. Only updating/replacing the cfn-dev-team folder
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
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

    // Create .cfn-initialized marker
    fs.writeFileSync(path.join(claudeDir, '.cfn-initialized'), new Date().toISOString());

    log('\nCFN setup complete! 🎉', 'green');
    log('You can now use CFN commands like:', 'cyan');
    log('  /cfn-loop-cli "Task description" --mode=standard', 'white');
    log('  /cfn-loop-task "Task description" --mode=standard', 'white');
  }
}

// Run the script
main().catch(error => {
  console.error('CFN post-install failed:', error);
  process.exit(1);
});