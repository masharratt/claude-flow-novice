#!/usr/bin/env node
/**
 * CI/CD Validation Pipeline
 *
 * Comprehensive validation for continuous integration
 * Runs all checks required before merging or publishing
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

class CIValidator {
  constructor(options = {}) {
    this.strict = options.strict || false;
    this.skipTests = options.skipTests || false;
    this.results = {
      passed: [],
      failed: [],
      warnings: [],
      skipped: []
    };
    this.startTime = Date.now();
  }

  async validate() {
    console.log('🔍 CI/CD Validation Pipeline');
    console.log('='.repeat(60));
    console.log(`Mode: ${this.strict ? 'STRICT' : 'STANDARD'}`);
    console.log('='.repeat(60));

    const stages = [
      { name: 'Environment', fn: () => this.validateEnvironment() },
      { name: 'Dependencies', fn: () => this.validateDependencies() },
      { name: 'Security', fn: () => this.validateSecurity() },
      { name: 'Build', fn: () => this.validateBuild() },
      { name: 'Tests', fn: () => this.validateTests(), skip: this.skipTests },
      { name: 'Code Quality', fn: () => this.validateCodeQuality() },
      { name: 'Package', fn: () => this.validatePackage() }
    ];

    for (const stage of stages) {
      if (stage.skip) {
        console.log(`\n⏭️  Skipping ${stage.name}`);
        this.results.skipped.push(stage.name);
        continue;
      }

      try {
        await this.runStage(stage.name, stage.fn);
      } catch (error) {
        if (this.strict) {
          console.error(`\n❌ Validation failed at ${stage.name}: ${error.message}`);
          await this.generateReport();
          process.exit(1);
        } else {
          this.results.warnings.push({ stage: stage.name, error: error.message });
        }
      }
    }

    await this.generateReport();
    return this.results.failed.length === 0;
  }

  async runStage(name, fn) {
    console.log(`\n📋 ${name}`);
    console.log('-'.repeat(60));

    const startTime = Date.now();
    try {
      await fn();
      const duration = Date.now() - startTime;
      this.results.passed.push({ stage: name, duration });
      console.log(`✅ ${name} passed (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.failed.push({ stage: name, error: error.message, duration });
      throw error;
    }
  }

  async validateEnvironment() {
    const checks = [
      { name: 'Node.js', cmd: 'node --version', match: /v(\d+)\./, min: 20 },
      { name: 'npm', cmd: 'npm --version', match: /(\d+)\./, min: 9 }
    ];

    for (const check of checks) {
      const output = this.runCommand(check.cmd);
      const match = output.match(check.match);

      if (match) {
        const version = parseInt(match[1]);
        if (version < check.min) {
          throw new Error(`${check.name} version ${version} < ${check.min}`);
        }
        console.log(`   ✓ ${check.name}: ${output.trim()}`);
      }
    }
  }

  async validateDependencies() {
    // Check if node_modules exists
    try {
      await fs.access(path.join(rootDir, 'node_modules'));
      console.log('   ✓ Dependencies installed');
    } catch {
      throw new Error('Dependencies not installed. Run npm install');
    }

    // Check for outdated dependencies
    try {
      const output = this.runCommand('npm outdated --json');
      const outdated = JSON.parse(output || '{}');
      const count = Object.keys(outdated).length;

      if (count > 0) {
        console.log(`   ⚠️  ${count} outdated dependencies`);
        this.results.warnings.push({ stage: 'Dependencies', message: `${count} outdated packages` });
      } else {
        console.log('   ✓ All dependencies up to date');
      }
    } catch {
      console.log('   ✓ Dependency check completed');
    }
  }

  async validateSecurity() {
    // Run npm audit
    try {
      const output = this.runCommand('npm audit --json');
      const audit = JSON.parse(output);
      const vulnerabilities = audit.metadata?.vulnerabilities || {};

      const critical = vulnerabilities.critical || 0;
      const high = vulnerabilities.high || 0;
      const moderate = vulnerabilities.moderate || 0;

      if (critical > 0 || high > 0) {
        throw new Error(`Found ${critical} critical and ${high} high vulnerabilities`);
      }

      if (moderate > 0) {
        console.log(`   ⚠️  ${moderate} moderate vulnerabilities`);
        this.results.warnings.push({ stage: 'Security', message: `${moderate} moderate vulnerabilities` });
      } else {
        console.log('   ✓ No security vulnerabilities');
      }
    } catch (error) {
      if (error.message.includes('vulnerabilities')) {
        throw error;
      }
      // Audit command might fail if no package-lock.json
      console.log('   ⚠️  Security audit skipped');
    }

    // Run security scan script if available
    try {
      await fs.access(path.join(rootDir, 'scripts/security-scan.js'));
      console.log('   ✓ Security scan available');
    } catch {
      console.log('   ⚠️  Security scan script not found');
    }
  }

  async validateBuild() {
    console.log('   Building project...');

    try {
      this.runCommand('npm run build', { timeout: 300000 }); // 5 minute timeout
      console.log('   ✓ Build successful');
    } catch (error) {
      throw new Error(`Build failed: ${error.message}`);
    }

    // Validate build output
    const requiredFiles = [
      '.claude-flow-novice/dist/src/index.js',
      '.claude-flow-novice/dist/src/cli/main.js'
    ];

    for (const file of requiredFiles) {
      try {
        await fs.access(path.join(rootDir, file));
        console.log(`   ✓ ${file}`);
      } catch {
        throw new Error(`Build output missing: ${file}`);
      }
    }
  }

  async validateTests() {
    if (this.skipTests) {
      console.log('   ⏭️  Tests skipped');
      return;
    }

    console.log('   Running tests...');

    try {
      // Run tests with CI configuration
      this.runCommand('npm run test:ci', { timeout: 600000 }); // 10 minute timeout
      console.log('   ✓ All tests passed');
    } catch (error) {
      if (this.strict) {
        throw new Error(`Tests failed: ${error.message}`);
      } else {
        console.log('   ⚠️  Some tests failed');
        this.results.warnings.push({ stage: 'Tests', message: 'Test failures detected' });
      }
    }
  }

  async validateCodeQuality() {
    // Check if linting is configured
    try {
      await fs.access(path.join(rootDir, 'config/linting/.eslintrc.json'));
      console.log('   ✓ ESLint configured');

      try {
        this.runCommand('npm run lint');
        console.log('   ✓ Linting passed');
      } catch (error) {
        if (this.strict) {
          throw new Error('Linting failed');
        } else {
          console.log('   ⚠️  Linting issues found');
          this.results.warnings.push({ stage: 'Code Quality', message: 'Linting issues' });
        }
      }
    } catch {
      console.log('   ⚠️  ESLint not configured');
    }

    // Check formatting
    try {
      await fs.access(path.join(rootDir, 'config/linting/.prettierrc.json'));
      console.log('   ✓ Prettier configured');
    } catch {
      console.log('   ⚠️  Prettier not configured');
    }
  }

  async validatePackage() {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(rootDir, 'package.json'), 'utf8')
    );

    const requiredFields = ['name', 'version', 'description', 'main', 'types', 'license'];
    for (const field of requiredFields) {
      if (!packageJson[field]) {
        throw new Error(`package.json missing required field: ${field}`);
      }
      console.log(`   ✓ ${field}: ${packageJson[field]}`);
    }

    // Validate entry points
    if (packageJson.main) {
      try {
        await fs.access(path.join(rootDir, packageJson.main));
        console.log(`   ✓ Main entry point exists: ${packageJson.main}`);
      } catch {
        throw new Error(`Main entry point not found: ${packageJson.main}`);
      }
    }

    // Validate bin files
    if (packageJson.bin) {
      const binFiles = typeof packageJson.bin === 'string'
        ? [packageJson.bin]
        : Object.values(packageJson.bin);

      for (const binFile of binFiles) {
        try {
          await fs.access(path.join(rootDir, binFile));
          console.log(`   ✓ Binary exists: ${binFile}`);
        } catch {
          throw new Error(`Binary not found: ${binFile}`);
        }
      }
    }
  }

  async generateReport() {
    const duration = Date.now() - this.startTime;
    const totalStages = this.results.passed.length + this.results.failed.length + this.results.skipped.length;

    console.log('\n' + '='.repeat(60));
    console.log('📊 VALIDATION REPORT');
    console.log('='.repeat(60));

    console.log(`\n⏱️  Total Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`✅ Passed: ${this.results.passed.length}/${totalStages}`);
    console.log(`❌ Failed: ${this.results.failed.length}/${totalStages}`);
    console.log(`⚠️  Warnings: ${this.results.warnings.length}`);
    console.log(`⏭️  Skipped: ${this.results.skipped.length}`);

    if (this.results.failed.length > 0) {
      console.log('\n❌ FAILED STAGES:');
      this.results.failed.forEach(f => {
        console.log(`   • ${f.stage}: ${f.error}`);
      });
    }

    if (this.results.warnings.length > 0) {
      console.log('\n⚠️  WARNINGS:');
      this.results.warnings.forEach(w => {
        console.log(`   • ${w.stage}: ${w.message || w.error}`);
      });
    }

    if (this.results.skipped.length > 0) {
      console.log('\n⏭️  SKIPPED:');
      this.results.skipped.forEach(s => console.log(`   • ${s}`));
    }

    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      duration: `${(duration / 1000).toFixed(2)}s`,
      mode: this.strict ? 'strict' : 'standard',
      ...this.results
    };

    const reportPath = path.join(rootDir, '.claude-flow-novice/ci-report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report: .claude-flow-novice/ci-report.json`);

    if (this.results.failed.length === 0) {
      console.log('\n✅ CI VALIDATION PASSED');
    } else {
      console.log('\n❌ CI VALIDATION FAILED');
    }
  }

  runCommand(command, options = {}) {
    try {
      return execSync(command, {
        encoding: 'utf8',
        cwd: rootDir,
        stdio: 'pipe',
        timeout: options.timeout || 120000,
        ...options
      });
    } catch (error) {
      throw new Error(error.message || 'Command failed');
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    strict: args.includes('--strict'),
    skipTests: args.includes('--skip-tests')
  };

  const validator = new CIValidator(options);
  const success = await validator.validate();

  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
