#!/usr/bin/env node

/**
 * Release Validation Script
 * Comprehensive pre-release validation to ensure package quality
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;
const packageName = packageJson.name;

class ReleaseValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    this.checks = [];
  }

  async runAllChecks() {
    console.log(`🚀 Validating release for ${packageName}@${version}`);
    console.log('='.repeat(50));

    await this.validateVersionFormat();
    await this.validateDependencies();
    await this.validateTests();
    await this.validateLinting();
    await this.validateSecurity();
    await this.validateChangelog();
    await this.validateBuild();
    await this.validateGitStatus();
    await this.validatePackageJson();
    await this.validateNPMRegistry();

    this.generateReport();
  }

  addCheck(name, success, message, details = null) {
    this.checks.push({ name, success, message, details });
    if (!success) {
      this.errors.push(message);
    }
  }

  addWarning(message) {
    this.warnings.push(message);
  }

  async validateVersionFormat() {
    try {
      const semverRegex = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;
      const isValid = semverRegex.test(version);

      this.addCheck(
        'Version Format',
        isValid,
        isValid ? '✅ Version follows semver format' : `❌ Invalid version format: ${version}`,
        { version }
      );
    } catch (error) {
      this.addCheck('Version Format', false, `❌ Error validating version: ${error.message}`);
    }
  }

  async validateDependencies() {
    try {
      // Check for outdated dependencies
      try {
        const outdated = execSync('npm outdated --json', {
          encoding: 'utf8',
          cwd: rootDir,
          stdio: 'pipe'
        });

        if (outdated.trim()) {
          const outdatedPackages = Object.keys(JSON.parse(outdated));
          this.addWarning(`Outdated dependencies found: ${outdatedPackages.join(', ')}`);
          this.addCheck('Dependencies', true, '⚠️ Dependencies checked (some outdated)', { outdated: outdatedPackages });
        } else {
          this.addCheck('Dependencies', true, '✅ All dependencies up to date');
        }
      } catch (error) {
        // npm outdated exits with code 1 when dependencies are outdated
        if (error.stdout) {
          const outdated = JSON.parse(error.stdout);
          const outdatedPackages = Object.keys(outdated);
          this.addWarning(`Outdated dependencies found: ${outdatedPackages.join(', ')}`);
          this.addCheck('Dependencies', true, '⚠️ Dependencies checked (some outdated)', { outdated: outdatedPackages });
        } else {
          throw error;
        }
      }

      // Check for security vulnerabilities
      try {
        const audit = execSync('npm audit --json', {
          encoding: 'utf8',
          cwd: rootDir,
          stdio: 'pipe'
        });
        const auditResult = JSON.parse(audit);

        const vulns = auditResult.vulnerabilities || {};
        const highVulns = Object.values(vulns).filter(v => v.severity === 'high' || v.severity === 'critical');

        if (highVulns.length > 0) {
          this.addCheck('Security Audit', false, `❌ High/critical vulnerabilities found: ${highVulns.length}`, { vulnerabilities: highVulns });
        } else {
          this.addCheck('Security Audit', true, '✅ No high/critical vulnerabilities found');
        }
      } catch (error) {
        this.addCheck('Security Audit', false, `❌ Security audit failed: ${error.message}`);
      }
    } catch (error) {
      this.addCheck('Dependencies', false, `❌ Error validating dependencies: ${error.message}`);
    }
  }

  async validateTests() {
    try {
      console.log('🧪 Running tests...');
      const testOutput = execSync('npm test', {
        encoding: 'utf8',
        cwd: rootDir,
        stdio: 'pipe'
      });

      // Check if tests passed (basic check - could be enhanced with test result parsing)
      const passed = !testOutput.includes('FAIL') && !testOutput.includes('Error:');

      this.addCheck(
        'Tests',
        passed,
        passed ? '✅ All tests passed' : '❌ Some tests failed',
        { output: testOutput.substring(0, 500) + '...' }
      );
    } catch (error) {
      this.addCheck('Tests', false, `❌ Tests failed: ${error.message}`, { output: error.stdout || error.stderr });
    }
  }

  async validateLinting() {
    try {
      console.log('🔍 Running linting...');
      const lintOutput = execSync('npm run lint', {
        encoding: 'utf8',
        cwd: rootDir,
        stdio: 'pipe'
      });

      this.addCheck('Linting', true, '✅ Linting passed');
    } catch (error) {
      this.addCheck('Linting', false, `❌ Linting failed: ${error.message}`, { output: error.stdout || error.stderr });
    }
  }

  async validateSecurity() {
    try {
      console.log('🔒 Running security checks...');

      // Check for hardcoded secrets
      const sensitivePatterns = [
        /password\s*=\s*['"][^'"]+['"]/gi,
        /api[_-]?key\s*=\s*['"][^'"]+['"]/gi,
        /secret\s*=\s*['"][^'"]+['"]/gi,
        /token\s*=\s*['"][^'"]+['"]/gi
      ];

      const sensitiveFiles = [];
      const sourceFiles = this.getSourceFiles();

      for (const file of sourceFiles) {
        const content = fs.readFileSync(file, 'utf8');
        for (const pattern of sensitivePatterns) {
          if (pattern.test(content)) {
            sensitiveFiles.push(file);
            break;
          }
        }
      }

      if (sensitiveFiles.length > 0) {
        this.addWarning(`Potential hardcoded secrets found in: ${sensitiveFiles.join(', ')}`);
        this.addCheck('Security Scan', true, '⚠️ Security scan completed with warnings', { sensitiveFiles });
      } else {
        this.addCheck('Security Scan', true, '✅ No obvious security issues found');
      }
    } catch (error) {
      this.addCheck('Security Scan', false, `❌ Security scan failed: ${error.message}`);
    }
  }

  async validateChangelog() {
    try {
      console.log('📝 Validating changelog...');
      const changelogPath = path.join(rootDir, 'CHANGELOG.md');

      if (!fs.existsSync(changelogPath)) {
        this.addCheck('Changelog', false, '❌ CHANGELOG.md not found');
        return;
      }

      const content = fs.readFileSync(changelogPath, 'utf8');

      // Check if current version is mentioned in changelog
      const versionMentioned = content.includes(`[${version}]`);

      if (!versionMentioned) {
        this.addWarning(`Version ${version} not found in CHANGELOG.md`);
        this.addCheck('Changelog', true, '⚠️ Changelog exists but version not mentioned', { version });
      } else {
        this.addCheck('Changelog', true, '✅ Changelog includes current version');
      }

      // Run changelog validation script
      try {
        execSync('node scripts/validate-changelog.js', {
          encoding: 'utf8',
          cwd: rootDir,
          stdio: 'pipe'
        });
        this.addCheck('Changelog Format', true, '✅ Changelog format is valid');
      } catch (error) {
        this.addCheck('Changelog Format', false, `❌ Changelog format invalid: ${error.message}`);
      }
    } catch (error) {
      this.addCheck('Changelog', false, `❌ Error validating changelog: ${error.message}`);
    }
  }

  async validateBuild() {
    try {
      console.log('🔨 Testing build...');
      const buildOutput = execSync('npm run build', {
        encoding: 'utf8',
        cwd: rootDir,
        stdio: 'pipe'
      });

      // Check if dist directory was created
      const distPath = path.join(rootDir, '.claude-flow-novice/dist');
      const distExists = fs.existsSync(distPath);

      this.addCheck(
        'Build',
        distExists,
        distExists ? '✅ Build completed successfully' : '❌ Build failed - no dist directory created',
        { output: buildOutput.substring(0, 500) + '...' }
      );
    } catch (error) {
      this.addCheck('Build', false, `❌ Build failed: ${error.message}`, { output: error.stdout || error.stderr });
    }
  }

  async validateGitStatus() {
    try {
      console.log('📋 Checking git status...');
      const status = execSync('git status --porcelain', {
        encoding: 'utf8',
        cwd: rootDir,
        stdio: 'pipe'
      });

      const hasUncommittedChanges = status.trim().length > 0;

      if (hasUncommittedChanges) {
        this.addWarning('Uncommitted changes detected in git repository');
        this.addCheck('Git Status', true, '⚠️ Git status has uncommitted changes', { changes: status.split('\n').filter(Boolean) });
      } else {
        this.addCheck('Git Status', true, '✅ Working directory is clean');
      }

      // Check if current branch is main/master
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
        cwd: rootDir,
        stdio: 'pipe'
      }).trim();

      if (!['main', 'master'].includes(branch)) {
        this.addWarning(`Not on main/master branch (current: ${branch})`);
        this.addCheck('Git Branch', true, '⚠️ Not on main branch', { branch });
      } else {
        this.addCheck('Git Branch', true, '✅ On main/master branch');
      }
    } catch (error) {
      this.addCheck('Git Status', false, `❌ Error checking git status: ${error.message}`);
    }
  }

  async validatePackageJson() {
    try {
      const requiredFields = ['name', 'version', 'description', 'main', 'scripts'];
      const missingFields = requiredFields.filter(field => !packageJson[field]);

      if (missingFields.length > 0) {
        this.addCheck('Package.json', false, `❌ Missing required fields: ${missingFields.join(', ')}`);
      } else {
        this.addCheck('Package.json', true, '✅ package.json has all required fields');
      }

      // Check if version in package.json matches tag (if exists)
      try {
        const tags = execSync('git tag --list --points-at HEAD', {
          encoding: 'utf8',
          cwd: rootDir,
          stdio: 'pipe'
        }).trim();

        if (tags) {
          const tagList = tags.split('\n');
          const versionTag = tagList.find(tag => tag === `v${version}`);

          if (versionTag) {
            this.addCheck('Version Tag', true, '✅ Git tag matches package version');
          } else {
            this.addWarning(`No git tag v${version} found for current commit`);
            this.addCheck('Version Tag', true, '⚠️ No matching git tag found', { version, tags: tagList });
          }
        }
      } catch (error) {
        // No tags found - that's okay
      }
    } catch (error) {
      this.addCheck('Package.json', false, `❌ Error validating package.json: ${error.message}`);
    }
  }

  async validateNPMRegistry() {
    try {
      console.log('📦 Checking NPM registry...');

      // Check if package name is available on NPM (for new packages)
      return new Promise((resolve) => {
        const url = `https://registry.npmjs.org/${packageName}`;

        https.get(url, (res) => {
          if (res.statusCode === 200) {
            // Package exists
            this.addCheck('NPM Registry', true, '✅ Package exists on NPM registry');
            resolve();
          } else if (res.statusCode === 404) {
            // Package doesn't exist (new package)
            this.addCheck('NPM Registry', true, '✅ Package name is available on NPM');
            resolve();
          } else {
            this.addCheck('NPM Registry', false, `❌ Unexpected NPM registry response: ${res.statusCode}`);
            resolve();
          }
        }).on('error', (error) => {
          this.addCheck('NPM Registry', false, `❌ Error checking NPM registry: ${error.message}`);
          resolve();
        });
      });
    } catch (error) {
      this.addCheck('NPM Registry', false, `❌ Error validating NPM registry: ${error.message}`);
    }
  }

  getSourceFiles() {
    const extensions = ['.js', '.ts', '.jsx', '.tsx', '.json'];
    const sourceFiles = [];

    function scanDirectory(dir) {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          scanDirectory(fullPath);
        } else if (stat.isFile() && extensions.some(ext => file.endsWith(ext))) {
          sourceFiles.push(fullPath);
        }
      }
    }

    scanDirectory(rootDir);
    return sourceFiles;
  }

  generateReport() {
    console.log('\n📊 Release Validation Report');
    console.log('='.repeat(50));

    // Summary
    const passed = this.checks.filter(c => c.success).length;
    const total = this.checks.length;
    const criticalErrors = this.errors.length;

    console.log(`\nSummary: ${passed}/${total} checks passed`);

    if (criticalErrors > 0) {
      console.log(`❌ ${criticalErrors} critical errors found`);
    }

    if (this.warnings.length > 0) {
      console.log(`⚠️  ${this.warnings.length} warnings found`);
    }

    // Detailed results
    console.log('\nDetailed Results:');
    console.log('-'.repeat(30));

    this.checks.forEach(check => {
      const icon = check.success ? '✅' : '❌';
      console.log(`${icon} ${check.name}: ${check.message}`);

      if (check.details) {
        console.log(`   Details: ${JSON.stringify(check.details, null, 2).substring(0, 200)}...`);
      }
    });

    // Warnings
    if (this.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      this.warnings.forEach(warning => {
        console.log(`   • ${warning}`);
      });
    }

    // Final recommendation
    console.log('\n' + '='.repeat(50));

    if (criticalErrors > 0) {
      console.log('🚫 RELEASE NOT READY');
      console.log('Fix critical errors before releasing.');
      process.exit(1);
    } else if (this.warnings.length > 0) {
      console.log('⚠️  RELEASE READY WITH WARNINGS');
      console.log('Consider addressing warnings for best quality.');
      process.exit(0);
    } else {
      console.log('✅ RELEASE READY');
      console.log('All checks passed. Ready to release!');
      process.exit(0);
    }
  }
}

// CLI Interface
async function main() {
  const validator = new ReleaseValidator();
  await validator.runAllChecks();
}

main().catch(error => {
  console.error('❌ Release validation failed:', error);
  process.exit(1);
});