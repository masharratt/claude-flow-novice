#!/usr/bin/env node

/**
 * Release Rollback Script
 * Provides rollback functionality for failed releases
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const currentVersion = packageJson.version;
const packageName = packageJson.name;

class ReleaseRollback {
  constructor() {
    this.packageName = packageName;
    this.currentVersion = currentVersion;
    this.rollbackDataPath = path.join(rootDir, '.rollback-data.json');
  }

  async rollback(options = {}) {
    console.log(`🔄 Rolling back ${this.packageName}@${this.currentVersion}`);
    console.log('='.repeat(50));

    const { version, force, dryRun } = options;

    try {
      // Save rollback data before proceeding
      await this.saveRollbackData();

      if (dryRun) {
        console.log('🔍 DRY RUN MODE - No changes will be made');
      }

      // Determine target version
      const targetVersion = version || await this.getPreviousVersion();
      if (!targetVersion) {
        throw new Error('No previous version found to rollback to');
      }

      console.log(`📦 Rolling back to version: ${targetVersion}`);

      // Validate rollback
      if (!force) {
        await this.validateRollback(targetVersion);
      }

      if (!dryRun) {
        // Perform rollback steps
        await this.rollbackPackageVersion(targetVersion);
        await this.rollbackGitState(targetVersion);
        await this.rollbackNPM(targetVersion);
        await this.cleanupRollback(targetVersion);
      } else {
        console.log('✅ Dry run completed - no changes made');
      }

      console.log(`✅ Rollback to ${targetVersion} completed successfully`);

    } catch (error) {
      console.error(`❌ Rollback failed: ${error.message}`);

      // Attempt to restore state
      if (!dryRun) {
        await this.restoreRollbackData();
      }

      process.exit(1);
    }
  }

  async saveRollbackData() {
    try {
      const rollbackData = {
        timestamp: new Date().toISOString(),
        currentVersion: this.currentVersion,
        packageJson: packageJson,
        gitState: {
          branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', cwd: rootDir }).trim(),
          commit: execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: rootDir }).trim(),
          status: execSync('git status --porcelain', { encoding: 'utf8', cwd: rootDir }).trim()
        }
      };

      fs.writeFileSync(this.rollbackDataPath, JSON.stringify(rollbackData, null, 2), 'utf8');
      console.log('✅ Rollback data saved');
    } catch (error) {
      console.warn('⚠️  Could not save rollback data:', error.message);
    }
  }

  async restoreRollbackData() {
    try {
      if (!fs.existsSync(this.rollbackDataPath)) {
        console.log('⚠️  No rollback data found');
        return;
      }

      const rollbackData = JSON.parse(fs.readFileSync(this.rollbackDataPath, 'utf8'));

      // Restore package.json
      fs.writeFileSync(
        path.join(rootDir, 'package.json'),
        JSON.stringify(rollbackData.packageJson, null, 2),
        'utf8'
      );

      console.log('✅ Rollback data restored');
    } catch (error) {
      console.warn('⚠️  Could not restore rollback data:', error.message);
    }
  }

  async getPreviousVersion() {
    try {
      // Get all git tags
      const tags = execSync('git tag --list --sort=-version:refname', {
        encoding: 'utf8',
        cwd: rootDir
      }).trim().split('\n');

      // Filter version tags and find the one before current
      const versionTags = tags.filter(tag => tag.startsWith('v')).map(tag => tag.substring(1));
      const currentIndex = versionTags.indexOf(this.currentVersion);

      if (currentIndex > 0) {
        return versionTags[currentIndex - 1];
      }

      // If current version not found, return the latest tag
      return versionTags[0];
    } catch (error) {
      console.warn('⚠️  Could not determine previous version:', error.message);
      return null;
    }
  }

  async validateRollback(targetVersion) {
    console.log('🔍 Validating rollback...');

    // Check if target version tag exists
    try {
      execSync(`git rev-parse v${targetVersion}`, {
        encoding: 'utf8',
        cwd: rootDir,
        stdio: 'pipe'
      });
      console.log('✅ Target version tag exists');
    } catch (error) {
      throw new Error(`Git tag v${targetVersion} not found`);
    }

    // Check if target version exists on NPM
    try {
      const response = await fetch(`https://registry.npmjs.org/${this.packageName}/${targetVersion}`);
      if (response.status !== 200) {
        console.warn(`⚠️  Version ${targetVersion} not found on NPM registry`);
      } else {
        console.log('✅ Target version exists on NPM');
      }
    } catch (error) {
      console.warn('⚠️  Could not verify NPM version:', error.message);
    }

    // Check for uncommitted changes
    const status = execSync('git status --porcelain', {
      encoding: 'utf8',
      cwd: rootDir
    }).trim();

    if (status) {
      throw new Error('Working directory has uncommitted changes. Commit or stash them first.');
    }

    console.log('✅ Rollback validation passed');
  }

  async rollbackPackageVersion(targetVersion) {
    console.log(`📦 Rolling back package version to ${targetVersion}...`);

    try {
      // Update package.json version
      const updatedPackageJson = { ...packageJson, version: targetVersion };
      fs.writeFileSync(
        path.join(rootDir, 'package.json'),
        JSON.stringify(updatedPackageJson, null, 2),
        'utf8'
      );

      // Rebuild with target version
      execSync('npm run build', { encoding: 'utf8', cwd: rootDir, stdio: 'pipe' });
      console.log('✅ Package version rolled back');
    } catch (error) {
      throw new Error(`Failed to rollback package version: ${error.message}`);
    }
  }

  async rollbackGitState(targetVersion) {
    console.log(`🔄 Rolling back git state to v${targetVersion}...`);

    try {
      // Checkout the target tag
      execSync(`git checkout v${targetVersion}`, {
        encoding: 'utf8',
        cwd: rootDir,
        stdio: 'pipe'
      });

      console.log('✅ Git state rolled back');
    } catch (error) {
      throw new Error(`Failed to rollback git state: ${error.message}`);
    }
  }

  async rollbackNPM(targetVersion) {
    console.log(`📦 Checking NPM rollback for v${targetVersion}...`);

    try {
      // Note: NPM doesn't allow unpublishing versions older than 24 hours
      // This function provides guidance for NPM rollback scenarios

      console.log('ℹ️  NPM Rollback Information:');
      console.log('   • NPM does not allow unpublishing versions older than 24 hours');
      console.log('   • The package.json version has been rolled back locally');
      console.log('   • To republish the previous version, use: npm publish --tag latest');
      console.log('   • To deprecate the problematic version, use: npm deprecate <package>@<version>');

      // If the problematic version is recent, provide unpublish option
      const canUnpublish = await this.canUnpublishVersion(this.currentVersion);
      if (canUnpublish) {
        console.log(`   • Version ${this.currentVersion} can be unpublished: npm unpublish ${this.packageName}@${this.currentVersion}`);
      }

      console.log('✅ NPM rollback guidance provided');
    } catch (error) {
      console.warn('⚠️  Could not complete NPM rollback:', error.message);
    }
  }

  async canUnpublishVersion(version) {
    try {
      // Check version age on NPM
      const response = await fetch(`https://registry.npmjs.org/${this.packageName}`);
      const data = await response.json();
      const versionData = data.time[version];

      if (versionData) {
        const publishTime = new Date(versionData);
        const now = new Date();
        const hoursDiff = (now - publishTime) / (1000 * 60 * 60);

        return hoursDiff < 24;
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  async cleanupRollback(targetVersion) {
    console.log('🧹 Cleaning up after rollback...');

    try {
      // Clean build artifacts
      execSync('npm run clean', { encoding: 'utf8', cwd: rootDir, stdio: 'pipe' });

      // Remove rollback data
      if (fs.existsSync(this.rollbackDataPath)) {
        fs.unlinkSync(this.rollbackDataPath);
      }

      console.log('✅ Cleanup completed');
    } catch (error) {
      console.warn('⚠️  Cleanup warning:', error.message);
    }
  }

  listRollbackOptions() {
    console.log(`📋 Available rollback options for ${this.packageName}`);
    console.log('='.repeat(50));

    try {
      const tags = execSync('git tag --list --sort=-version:refname', {
        encoding: 'utf8',
        cwd: rootDir
      }).trim().split('\n');

      const versionTags = tags.filter(tag => tag.startsWith('v'));

      console.log('\n📦 Available version tags:');
      versionTags.forEach((tag, index) => {
        const isCurrent = tag === `v${this.currentVersion}`;
        const marker = isCurrent ? ' (current)' : '';
        console.log(`  ${index + 1}. ${tag}${marker}`);
      });

      console.log('\n💡 Rollback commands:');
      console.log(`  node scripts/release-rollback.js --version <version>`);
      console.log(`  node scripts/release-rollback.js --version ${versionTags[1] || 'previous'}`);
      console.log('  node scripts/release-rollback.js --dry-run  # Preview rollback');

    } catch (error) {
      console.error('❌ Could not list rollback options:', error.message);
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--version':
      case '-v':
        options.version = args[++i];
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;
      case '--list':
      case '-l':
        const roller = new ReleaseRollback();
        roller.listRollbackOptions();
        return;
      case '--help':
      case '-h':
        console.log(`
Release Rollback Tool

Usage: node release-rollback.js [options]

Options:
  --version, -v <version>    Target version to rollback to
  --force, -f               Skip validation prompts
  --dry-run, -d             Preview rollback without making changes
  --list, -l                List available rollback options
  --help, -h                Show this help message

Examples:
  node release-rollback.js --version 1.2.3
  node release-rollback.js --version 1.2.3 --force
  node release-rollback.js --dry-run
  node release-rollback.js --list
        `);
        return;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }

  const roller = new ReleaseRollback();
  await roller.rollback(options);
}

main().catch(error => {
  console.error('❌ Rollback failed:', error);
  process.exit(1);
});