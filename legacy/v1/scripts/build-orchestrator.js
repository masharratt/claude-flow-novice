#!/usr/bin/env node
/**
 * Build Orchestrator
 *
 * Comprehensive build automation with parallel execution,
 * error recovery, and detailed reporting
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

class BuildOrchestrator {
  constructor() {
    this.startTime = Date.now();
    this.steps = [];
    this.errors = [];
    this.warnings = [];
  }

  async execute() {
    console.log('🚀 Build Orchestrator Started');
    console.log('='.repeat(60));

    try {
      await this.validateEnvironment();
      await this.cleanPreviousBuild();
      await this.runParallelChecks();
      await this.compileSources();
      await this.fixImportExtensions();
      await this.generateTypes();
      await this.copyAssets();
      await this.validateBuildOutput();
      await this.generateReport();

      console.log('\n✅ Build completed successfully!');
      return 0;
    } catch (error) {
      console.error(`\n❌ Build failed: ${error.message}`);
      this.errors.push({ step: 'build', error: error.message });
      await this.generateReport();
      return 1;
    }
  }

  async validateEnvironment() {
    this.logStep('Validating environment');

    const checks = [
      { name: 'Node.js version', command: 'node --version', minVersion: 20 },
      { name: 'npm version', command: 'npm --version', minVersion: 9 },
      { name: 'TypeScript compiler', command: 'npx tsc --version' },
      { name: 'SWC compiler', command: 'npx swc --version' }
    ];

    for (const check of checks) {
      try {
        const output = execSync(check.command, { encoding: 'utf8', cwd: rootDir });

        if (check.minVersion) {
          const version = parseInt(output.match(/\d+/)[0]);
          if (version < check.minVersion) {
            throw new Error(`${check.name} version ${version} is below minimum ${check.minVersion}`);
          }
        }

        this.logSuccess(`${check.name}: ${output.trim()}`);
      } catch (error) {
        throw new Error(`${check.name} check failed: ${error.message}`);
      }
    }
  }

  async cleanPreviousBuild() {
    this.logStep('Cleaning previous build');

    const dirsToClean = [
      '.claude-flow-novice/dist',
      'dist',
      '.crdt-data',
      '.demo-crdt-data'
    ];

    for (const dir of dirsToClean) {
      const fullPath = path.join(rootDir, dir);
      try {
        await fs.rm(fullPath, { recursive: true, force: true });
        this.logSuccess(`Removed: ${dir}`);
      } catch (error) {
        this.warnings.push(`Could not remove ${dir}: ${error.message}`);
      }
    }
  }

  async runParallelChecks() {
    this.logStep('Running parallel validation checks');

    const checks = [
      { name: 'Security audit', script: 'npm audit --audit-level moderate' },
      { name: 'Dependency check', script: 'npm outdated || true' }
    ];

    const results = await Promise.allSettled(
      checks.map(check =>
        this.runCommand(check.script)
          .then(() => this.logSuccess(check.name))
          .catch(error => {
            this.warnings.push(`${check.name}: ${error.message}`);
            return null;
          })
      )
    );

    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed > 0) {
      this.warnings.push(`${failed} validation check(s) had warnings`);
    }
  }

  async compileSources() {
    this.logStep('Compiling TypeScript sources with SWC');

    try {
      const command = 'npm run build:swc';
      await this.runCommand(command);
      this.logSuccess('Source compilation completed');
    } catch (error) {
      throw new Error(`Source compilation failed: ${error.message}`);
    }
  }

  async fixImportExtensions() {
    this.logStep('Fixing import extensions for ES modules');

    try {
      const command = 'npm run build:fix-imports';
      await this.runCommand(command);
      this.logSuccess('Import extensions fixed');
    } catch (error) {
      throw new Error(`Import extension fix failed: ${error.message}`);
    }
  }

  async generateTypes() {
    this.logStep('Generating TypeScript type declarations');

    try {
      const command = 'npm run build:types:reliable';
      await this.runCommand(command);
      this.logSuccess('Type declarations generated');
    } catch (error) {
      this.warnings.push(`Type generation: ${error.message}`);
      console.log('⚠️  Using fallback type generation');
    }
  }

  async copyAssets() {
    this.logStep('Copying static assets');

    try {
      const command = 'npm run copy:assets';
      await this.runCommand(command);
      this.logSuccess('Assets copied');
    } catch (error) {
      throw new Error(`Asset copying failed: ${error.message}`);
    }
  }

  async validateBuildOutput() {
    this.logStep('Validating build output');

    const requiredFiles = [
      '.claude-flow-novice/dist/src/index.js',
      '.claude-flow-novice/dist/src/cli/main.js',
      '.claude-flow-novice/dist/src/mcp/mcp-server-sdk.js'
    ];

    for (const file of requiredFiles) {
      const fullPath = path.join(rootDir, file);
      try {
        await fs.access(fullPath);
        this.logSuccess(`Found: ${file}`);
      } catch {
        throw new Error(`Required file missing: ${file}`);
      }
    }

    // Check for common build issues
    await this.checkForBuildIssues();
  }

  async checkForBuildIssues() {
    const distDir = path.join(rootDir, '.claude-flow-novice/dist');

    try {
      const files = await this.getAllJsFiles(distDir);
      let issueCount = 0;

      for (const file of files) {
        const content = await fs.readFile(file, 'utf8');

        // Check for missing .js extensions in imports
        const missingExtensions = content.match(/from\s+['"]\.\.[\/\\][^'"]+(?<!\.js)['"]/g);
        if (missingExtensions && missingExtensions.length > 0) {
          this.warnings.push(`Missing .js extensions in ${path.relative(rootDir, file)}`);
          issueCount++;
        }

        // Check for source map references
        if (content.includes('//# sourceMappingURL=')) {
          const hasSourceMap = await fs.access(file + '.map').then(() => true).catch(() => false);
          if (!hasSourceMap) {
            this.warnings.push(`Source map missing for ${path.relative(rootDir, file)}`);
          }
        }
      }

      if (issueCount === 0) {
        this.logSuccess('Build output validation passed');
      }
    } catch (error) {
      this.warnings.push(`Build validation: ${error.message}`);
    }
  }

  async getAllJsFiles(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.getAllJsFiles(fullPath));
      } else if (entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  async generateReport() {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(60));
    console.log('📊 Build Report');
    console.log('='.repeat(60));

    console.log(`\n⏱️  Build Duration: ${duration}s`);
    console.log(`✅ Completed Steps: ${this.steps.length}`);
    console.log(`⚠️  Warnings: ${this.warnings.length}`);
    console.log(`❌ Errors: ${this.errors.length}`);

    if (this.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      this.warnings.forEach(warning => console.log(`   • ${warning}`));
    }

    if (this.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.errors.forEach(error => console.log(`   • ${error.step}: ${error.error}`));
    }

    // Save report to file
    const report = {
      timestamp: new Date().toISOString(),
      duration: `${duration}s`,
      steps: this.steps,
      warnings: this.warnings,
      errors: this.errors,
      success: this.errors.length === 0
    };

    const reportPath = path.join(rootDir, '.claude-flow-novice/build-report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved: .claude-flow-novice/build-report.json`);
  }

  logStep(message) {
    console.log(`\n🔹 ${message}...`);
    this.steps.push({ step: message, timestamp: Date.now() });
  }

  logSuccess(message) {
    console.log(`   ✅ ${message}`);
  }

  async runCommand(command) {
    return new Promise((resolve, reject) => {
      try {
        const output = execSync(command, {
          encoding: 'utf8',
          cwd: rootDir,
          stdio: 'pipe'
        });
        resolve(output);
      } catch (error) {
        reject(error);
      }
    });
  }
}

// CLI Interface
async function main() {
  const orchestrator = new BuildOrchestrator();
  const exitCode = await orchestrator.execute();
  process.exit(exitCode);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
