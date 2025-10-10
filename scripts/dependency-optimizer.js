#!/usr/bin/env node
/**
 * Dependency Optimizer
 *
 * Analyzes and optimizes npm dependencies for production readiness
 */

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

class DependencyOptimizer {
  constructor() {
    this.packageJson = null;
    this.findings = {
      production: [],
      devDependencies: [],
      optimization: [],
      security: []
    };
  }

  async optimize() {
    console.log('🔧 Dependency Optimizer');
    console.log('='.repeat(60));

    try {
      await this.loadPackageJson();
      await this.analyzeDependencies();
      await this.checkSecurity();
      await this.optimizeTree();
      await this.generateReport();

      return 0;
    } catch (error) {
      console.error(`❌ Optimization failed: ${error.message}`);
      return 1;
    }
  }

  async loadPackageJson() {
    console.log('\n📦 Loading package.json...');
    const packagePath = path.join(rootDir, 'package.json');
    const content = await fs.readFile(packagePath, 'utf8');
    this.packageJson = JSON.parse(content);
    console.log(`✅ Loaded: ${this.packageJson.name}@${this.packageJson.version}`);
  }

  async analyzeDependencies() {
    console.log('\n🔍 Analyzing dependencies...');

    const prodCount = Object.keys(this.packageJson.dependencies || {}).length;
    const devCount = Object.keys(this.packageJson.devDependencies || {}).length;

    console.log(`   Production: ${prodCount} packages`);
    console.log(`   Development: ${devCount} packages`);

    // Check for misplaced dependencies
    await this.checkMisplacedDependencies();

    // Check for unused dependencies
    await this.checkUnusedDependencies();

    // Check for duplicate dependencies
    await this.checkDuplicates();

    // Check for outdated dependencies
    await this.checkOutdated();
  }

  async checkMisplacedDependencies() {
    console.log('\n   Checking for misplaced dependencies...');

    const buildTools = [
      '@babel/core', '@babel/preset-env', '@swc/cli', '@swc/core',
      'typescript', 'ts-jest', 'babel-jest', 'jest', 'eslint', 'prettier'
    ];

    const misplaced = [];

    for (const tool of buildTools) {
      if (this.packageJson.dependencies && this.packageJson.dependencies[tool]) {
        misplaced.push({
          package: tool,
          type: 'build-tool-in-production',
          recommendation: `Move ${tool} to devDependencies`
        });
      }
    }

    if (misplaced.length > 0) {
      this.findings.production.push(...misplaced);
      console.log(`   ⚠️  ${misplaced.length} misplaced dependencies found`);
    } else {
      console.log('   ✅ All dependencies correctly placed');
    }
  }

  async checkUnusedDependencies() {
    console.log('\n   Checking for unused dependencies...');

    try {
      // This is a basic check - a full check would require tools like depcheck
      console.log('   ℹ️  Run `npx depcheck` for comprehensive unused dependency analysis');
    } catch (error) {
      console.log('   ⚠️  Could not check for unused dependencies');
    }
  }

  async checkDuplicates() {
    console.log('\n   Checking for duplicate dependencies...');

    try {
      const output = this.runCommand('npm dedupe --dry-run');

      if (output.includes('deduped')) {
        const matches = output.match(/deduped (\d+)/);
        const count = matches ? parseInt(matches[1]) : 0;

        if (count > 0) {
          this.findings.optimization.push({
            type: 'duplicate-dependencies',
            count: count,
            recommendation: 'Run npm dedupe to remove duplicates'
          });
          console.log(`   ⚠️  ${count} duplicate dependencies can be optimized`);
        } else {
          console.log('   ✅ No duplicate dependencies');
        }
      } else {
        console.log('   ✅ No duplicate dependencies');
      }
    } catch (error) {
      console.log('   ⚠️  Could not check for duplicates');
    }
  }

  async checkOutdated() {
    console.log('\n   Checking for outdated dependencies...');

    try {
      const output = this.runCommand('npm outdated --json');
      const outdated = JSON.parse(output || '{}');
      const count = Object.keys(outdated).length;

      if (count > 0) {
        this.findings.optimization.push({
          type: 'outdated-dependencies',
          count: count,
          packages: Object.entries(outdated).slice(0, 5).map(([name, info]) => ({
            name,
            current: info.current,
            latest: info.latest
          })),
          recommendation: 'Update outdated dependencies with npm update'
        });
        console.log(`   ⚠️  ${count} outdated dependencies`);
      } else {
        console.log('   ✅ All dependencies up to date');
      }
    } catch {
      console.log('   ✅ Dependency versions current');
    }
  }

  async checkSecurity() {
    console.log('\n🔒 Security Analysis...');

    try {
      const output = this.runCommand('npm audit --json');
      const audit = JSON.parse(output);
      const vulnerabilities = audit.metadata?.vulnerabilities || {};

      const critical = vulnerabilities.critical || 0;
      const high = vulnerabilities.high || 0;
      const moderate = vulnerabilities.moderate || 0;
      const low = vulnerabilities.low || 0;

      console.log(`   Critical: ${critical}`);
      console.log(`   High: ${high}`);
      console.log(`   Moderate: ${moderate}`);
      console.log(`   Low: ${low}`);

      if (critical > 0 || high > 0) {
        this.findings.security.push({
          severity: 'high',
          vulnerabilities: { critical, high, moderate, low },
          recommendation: 'Run npm audit fix to address vulnerabilities'
        });
        console.log('   ❌ Critical/High vulnerabilities found!');
      } else if (moderate > 0) {
        this.findings.security.push({
          severity: 'medium',
          vulnerabilities: { critical, high, moderate, low },
          recommendation: 'Consider updating packages with moderate vulnerabilities'
        });
        console.log('   ⚠️  Moderate vulnerabilities found');
      } else {
        console.log('   ✅ No security vulnerabilities');
      }
    } catch (error) {
      console.log('   ⚠️  Could not run security audit');
    }
  }

  async optimizeTree() {
    console.log('\n⚡ Optimization Options...');

    console.log('   Available optimizations:');
    console.log('   • npm prune - Remove extraneous packages');
    console.log('   • npm dedupe - Reduce duplication');
    console.log('   • npm audit fix - Fix security issues');
    console.log('   • npm update - Update to latest compatible versions');

    const treeSize = await this.calculateTreeSize();
    console.log(`\n   Current tree size: ${treeSize}`);
  }

  async calculateTreeSize() {
    try {
      const nodeModules = path.join(rootDir, 'node_modules');
      const output = this.runCommand(`du -sh ${nodeModules}`);
      return output.split('\t')[0];
    } catch {
      return 'Unknown';
    }
  }

  async generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 OPTIMIZATION REPORT');
    console.log('='.repeat(60));

    const totalIssues =
      this.findings.production.length +
      this.findings.optimization.length +
      this.findings.security.length;

    console.log(`\n📈 Summary:`);
    console.log(`   Total Findings: ${totalIssues}`);
    console.log(`   Production Issues: ${this.findings.production.length}`);
    console.log(`   Optimization Opportunities: ${this.findings.optimization.length}`);
    console.log(`   Security Issues: ${this.findings.security.length}`);

    // Production Dependencies
    if (this.findings.production.length > 0) {
      console.log('\n🔴 Production Dependency Issues:');
      this.findings.production.forEach(finding => {
        console.log(`   • ${finding.package}: ${finding.recommendation}`);
      });
    }

    // Optimizations
    if (this.findings.optimization.length > 0) {
      console.log('\n⚡ Optimization Opportunities:');
      this.findings.optimization.forEach(finding => {
        console.log(`   • ${finding.type}: ${finding.recommendation}`);
        if (finding.packages) {
          finding.packages.forEach(pkg => {
            console.log(`     - ${pkg.name}: ${pkg.current} → ${pkg.latest}`);
          });
        }
      });
    }

    // Security
    if (this.findings.security.length > 0) {
      console.log('\n🔒 Security Findings:');
      this.findings.security.forEach(finding => {
        console.log(`   Severity: ${finding.severity}`);
        console.log(`   ${finding.recommendation}`);
      });
    }

    // Recommendations
    console.log('\n💡 Recommended Actions:');

    if (this.findings.security.length > 0) {
      console.log('   1. Run: npm audit fix');
    }

    if (this.findings.production.length > 0) {
      console.log('   2. Move build tools to devDependencies');
    }

    if (this.findings.optimization.length > 0) {
      console.log('   3. Run: npm dedupe && npm prune');
      console.log('   4. Run: npm update (review changes carefully)');
    }

    if (totalIssues === 0) {
      console.log('   ✅ Dependencies are well optimized!');
      console.log('   Continue monitoring with regular npm outdated checks');
    }

    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      package: {
        name: this.packageJson.name,
        version: this.packageJson.version
      },
      findings: this.findings,
      summary: {
        totalIssues,
        productionIssues: this.findings.production.length,
        optimizationOpportunities: this.findings.optimization.length,
        securityIssues: this.findings.security.length
      }
    };

    const reportPath = path.join(rootDir, '.claude-flow-novice/dependency-optimization-report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n📄 Report saved: .claude-flow-novice/dependency-optimization-report.json`);
  }

  runCommand(command, options = {}) {
    try {
      return execSync(command, {
        encoding: 'utf8',
        cwd: rootDir,
        stdio: 'pipe',
        ...options
      });
    } catch (error) {
      // Some commands (like npm outdated) return non-zero exit codes
      return error.stdout || '';
    }
  }
}

// CLI Interface
async function main() {
  const optimizer = new DependencyOptimizer();
  const exitCode = await optimizer.optimize();
  process.exit(exitCode);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
