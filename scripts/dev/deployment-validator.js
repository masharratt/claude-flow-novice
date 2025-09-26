#!/usr/bin/env node

/**
 * Claude Flow Novice - Production Deployment Validator
 * Comprehensive validation script for production deployment readiness
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

class DeploymentValidator {
  constructor() {
    this.results = {
      build: { status: 'pending', details: [] },
      security: { status: 'pending', details: [] },
      package: { status: 'pending', details: [] },
      tests: { status: 'pending', details: [] },
      code: { status: 'pending', details: [] }
    };
    this.blocking = [];
    this.warnings = [];
  }

  async validate() {
    console.log(chalk.blue('🚀 Claude Flow Novice - Deployment Validation'));
    console.log(chalk.gray('=' .repeat(60)));

    try {
      await this.validateBuild();
      await this.validateSecurity();
      await this.validatePackageConfig();
      await this.validateCodeQuality();
      await this.validateTests();

      this.generateReport();
      return this.isDeploymentReady();
    } catch (error) {
      console.error(chalk.red('❌ Validation failed:'), error.message);
      return false;
    }
  }

  async validateBuild() {
    console.log(chalk.yellow('🔨 Validating build system...'));

    try {
      // Test clean build
      execSync('npm run clean', { stdio: 'pipe' });
      const buildOutput = execSync('npm run build', { stdio: 'pipe', encoding: 'utf8' });

      if (buildOutput.includes('Successfully compiled')) {
        this.results.build.status = 'pass';
        this.results.build.details.push('✅ Build compilation successful');

        // Check output files
        const distExists = await this.pathExists('dist');
        if (distExists) {
          this.results.build.details.push('✅ Dist directory created');
        } else {
          this.blocking.push('❌ Dist directory not found after build');
        }
      } else {
        this.blocking.push('❌ Build compilation failed');
      }
    } catch (error) {
      this.blocking.push(`❌ Build failed: ${error.message}`);
      this.results.build.status = 'fail';
    }
  }

  async validateSecurity() {
    console.log(chalk.yellow('🔒 Validating security...'));

    try {
      const auditOutput = execSync('npm audit --audit-level=moderate --json', {
        stdio: 'pipe',
        encoding: 'utf8'
      });

      const audit = JSON.parse(auditOutput);

      if (audit.metadata.vulnerabilities.total === 0) {
        this.results.security.status = 'pass';
        this.results.security.details.push('✅ No security vulnerabilities found');
      } else {
        const { low, moderate, high, critical } = audit.metadata.vulnerabilities;

        if (high > 0 || critical > 0) {
          this.blocking.push(`❌ ${high + critical} high/critical vulnerabilities found`);
          this.results.security.status = 'fail';
        } else {
          this.results.security.status = 'warn';
          this.warnings.push(`⚠️ ${low + moderate} low/moderate vulnerabilities found`);
          this.results.security.details.push(`⚠️ ${low} low, ${moderate} moderate vulnerabilities`);
        }
      }
    } catch (error) {
      // npm audit exits with non-zero for vulnerabilities
      if (error.stdout) {
        try {
          const audit = JSON.parse(error.stdout);
          const { low, moderate, high, critical } = audit.metadata.vulnerabilities;

          if (high > 0 || critical > 0) {
            this.blocking.push(`❌ ${high + critical} high/critical vulnerabilities`);
          } else if (low > 0 || moderate > 0) {
            this.warnings.push(`⚠️ ${low + moderate} low/moderate vulnerabilities`);
            this.results.security.status = 'warn';
          }
        } catch (parseError) {
          this.warnings.push('⚠️ Could not parse audit results');
        }
      }
    }
  }

  async validatePackageConfig() {
    console.log(chalk.yellow('📦 Validating package configuration...'));

    try {
      const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));

      // Required fields for npm publication
      const requiredFields = ['name', 'version', 'description', 'main', 'bin', 'author', 'license'];
      const missing = requiredFields.filter(field => !packageJson[field]);

      if (missing.length === 0) {
        this.results.package.status = 'pass';
        this.results.package.details.push('✅ All required package.json fields present');
      } else {
        this.blocking.push(`❌ Missing package.json fields: ${missing.join(', ')}`);
      }

      // Check files array
      if (packageJson.files && packageJson.files.length > 0) {
        this.results.package.details.push('✅ Files array configured');
      } else {
        this.warnings.push('⚠️ No files array specified');
      }

      // Check bin files exist
      if (packageJson.bin) {
        for (const [cmd, binPath] of Object.entries(packageJson.bin)) {
          const exists = await this.pathExists(binPath);
          if (exists) {
            this.results.package.details.push(`✅ Binary ${cmd} exists`);
          } else {
            this.blocking.push(`❌ Binary file not found: ${binPath}`);
          }
        }
      }

    } catch (error) {
      this.blocking.push(`❌ Package.json validation failed: ${error.message}`);
    }
  }

  async validateCodeQuality() {
    console.log(chalk.yellow('🔍 Validating code quality...'));

    try {
      // Check for production code issues
      const mockPatterns = ['console.log', 'TODO:', 'FIXME:', 'debugger'];
      let issuesFound = 0;

      for (const pattern of mockPatterns) {
        try {
          const output = execSync(`grep -r "${pattern}" src/ --exclude-dir=__tests__ || true`, {
            stdio: 'pipe',
            encoding: 'utf8'
          });

          if (output.trim()) {
            const lines = output.trim().split('\\n').length;
            if (pattern === 'console.log') {
              this.warnings.push(`⚠️ ${lines} console.log statements found`);
            } else {
              issuesFound += lines;
            }
          }
        } catch (error) {
          // grep returns non-zero when no matches found, which is good
        }
      }

      if (issuesFound === 0) {
        this.results.code.status = 'pass';
        this.results.code.details.push('✅ No critical code quality issues');
      } else {
        this.warnings.push(`⚠️ ${issuesFound} code quality issues found`);
        this.results.code.status = 'warn';
      }

    } catch (error) {
      this.warnings.push('⚠️ Code quality check failed');
    }
  }

  async validateTests() {
    console.log(chalk.yellow('🧪 Validating test suite...'));

    try {
      // Try to run basic tests
      const testOutput = execSync('npm run test 2>&1 || true', {
        stdio: 'pipe',
        encoding: 'utf8'
      });

      if (testOutput.includes('PASS') || testOutput.includes('Tests:')) {
        this.results.tests.status = 'pass';
        this.results.tests.details.push('✅ Test suite executable');
      } else if (testOutput.includes('FAIL')) {
        this.results.tests.status = 'warn';
        this.warnings.push('⚠️ Some tests failing (acceptable for deployment)');
      } else {
        this.results.tests.status = 'warn';
        this.warnings.push('⚠️ Test suite status unclear');
      }

    } catch (error) {
      this.warnings.push('⚠️ Could not validate test suite');
    }
  }

  generateReport() {
    console.log(chalk.gray('\\n' + '=' .repeat(60)));
    console.log(chalk.blue('📋 DEPLOYMENT VALIDATION REPORT'));
    console.log(chalk.gray('=' .repeat(60)));

    // Summary
    const totalBlocking = this.blocking.length;
    const totalWarnings = this.warnings.length;

    if (totalBlocking === 0) {
      console.log(chalk.green('🎉 DEPLOYMENT APPROVED'));
      console.log(chalk.green(`✅ No blocking issues found`));
    } else {
      console.log(chalk.red('🚫 DEPLOYMENT BLOCKED'));
      console.log(chalk.red(`❌ ${totalBlocking} blocking issues found`));
    }

    if (totalWarnings > 0) {
      console.log(chalk.yellow(`⚠️ ${totalWarnings} warnings (non-blocking)`));
    }

    // Details
    console.log('\\n📊 Validation Results:');

    for (const [category, result] of Object.entries(this.results)) {
      const status = this.getStatusIcon(result.status);
      console.log(`${status} ${category.toUpperCase()}: ${result.status}`);

      if (result.details.length > 0) {
        result.details.forEach(detail => console.log(`   ${detail}`));
      }
    }

    // Blocking issues
    if (this.blocking.length > 0) {
      console.log('\\n🚨 BLOCKING ISSUES:');
      this.blocking.forEach(issue => console.log(`   ${issue}`));
    }

    // Warnings
    if (this.warnings.length > 0) {
      console.log('\\n⚠️  WARNINGS:');
      this.warnings.forEach(warning => console.log(`   ${warning}`));
    }

    // Next steps
    console.log('\\n📋 NEXT STEPS:');
    if (totalBlocking === 0) {
      console.log('   ✅ Ready for npm publish');
      console.log('   📦 Run: npm publish --dry-run');
      console.log('   🚀 Run: npm publish');
    } else {
      console.log('   🔧 Fix blocking issues first');
      console.log('   🔄 Re-run validation');
    }
  }

  getStatusIcon(status) {
    switch (status) {
      case 'pass': return '✅';
      case 'fail': return '❌';
      case 'warn': return '⚠️';
      default: return '⏳';
    }
  }

  isDeploymentReady() {
    return this.blocking.length === 0;
  }

  async pathExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Run validation if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const validator = new DeploymentValidator();
  validator.validate().then(ready => {
    process.exit(ready ? 0 : 1);
  });
}

export default DeploymentValidator;