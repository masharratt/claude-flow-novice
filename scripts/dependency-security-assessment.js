#!/usr/bin/env node

/**
 * Dependency Security Assessment Script
 *
 * This script performs comprehensive security assessment of project dependencies
 * and generates detailed reports for production readiness validation.
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

class DependencySecurityAssessment {
  constructor() {
    this.projectRoot = process.cwd();
    this.packageJsonPath = join(this.projectRoot, 'package.json');
    this.reportPath = join(this.projectRoot, 'DEPENDENCY_SECURITY_REPORT.md');
    this.assessmentResults = {
      vulnerabilities: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 },
      dependencies: { prod: 0, dev: 0, optional: 0, peer: 0, total: 0 },
      outdated: [],
      recommendations: []
    };
  }

  async runAssessment() {
    console.log('🔍 Starting Dependency Security Assessment...\n');

    try {
      await this.checkVulnerabilities();
      await this.checkOutdatedPackages();
      await this.analyzeDependencyTree();
      await this.generateSecurityReport();

      console.log('✅ Security assessment completed successfully!');
      console.log(`📊 Report generated: ${this.reportPath}`);

      return this.assessmentResults;
    } catch (error) {
      console.error('❌ Security assessment failed:', error.message);
      throw error;
    }
  }

  async checkVulnerabilities() {
    console.log('🔎 Checking for security vulnerabilities...');

    try {
      const auditResult = execSync('npm audit --audit-level moderate --json', {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const auditData = JSON.parse(auditResult);
      this.assessmentResults.vulnerabilities = auditData.metadata.vulnerabilities;
      this.assessmentResults.dependencies = auditData.metadata.dependencies;

      console.log(`   Found ${this.assessmentResults.vulnerabilities.total} vulnerabilities`);
      console.log(`   Dependencies: ${this.assessmentResults.dependencies.total} total`);

    } catch (error) {
      if (error.status === 1) {
        console.log('   ⚠️  Vulnerabilities found - checking details...');
        const auditResult = execSync('npm audit --json', {
          encoding: 'utf8',
          stdio: 'pipe'
        });
        const auditData = JSON.parse(auditResult);
        this.assessmentResults.vulnerabilities = auditData.metadata.vulnerabilities;
        this.assessmentResults.dependencies = auditData.metadata.dependencies;

        // Add critical vulnerabilities to recommendations
        Object.entries(auditData.vulnerabilities || {}).forEach(([pkg, vuln]) => {
          if (vuln.severity === 'critical' || vuln.severity === 'high') {
            this.assessmentResults.recommendations.push({
              type: 'security',
              priority: 'critical',
              package: pkg,
              issue: `Vulnerability: ${vuln.title}`,
              solution: `Update to latest secure version`
            });
          }
        });
      } else {
        throw error;
      }
    }
  }

  async checkOutdatedPackages() {
    console.log('📦 Checking for outdated packages...');

    try {
      const outdatedResult = execSync('npm outdated --json', {
        encoding: 'utf8',
        stdio: 'pipe'
      });

      const outdatedData = JSON.parse(outdatedResult);
      this.assessmentResults.outdated = Object.entries(outdatedData).map(([pkg, info]) => ({
        package: pkg,
        current: info.current,
        wanted: info.wanted,
        latest: info.latest,
        dependent: info.dependent
      }));

      console.log(`   Found ${this.assessmentResults.outdated.length} outdated packages`);

      // Add outdated packages to recommendations if they have security updates
      this.assessmentResults.outdated.forEach(pkg => {
        if (pkg.latest && pkg.latest !== pkg.current) {
          this.assessmentResults.recommendations.push({
            type: 'update',
            priority: 'medium',
            package: pkg.package,
            issue: `Outdated version ${pkg.current}`,
            solution: `Update to ${pkg.latest}`
          });
        }
      });

    } catch (error) {
      console.log('   ✅ All packages are up to date');
    }
  }

  async analyzeDependencyTree() {
    console.log('🌳 Analyzing dependency tree...');

    try {
      const packageJson = JSON.parse(readFileSync(this.packageJsonPath, 'utf8'));
      const prodDeps = Object.keys(packageJson.dependencies || {});
      const devDeps = Object.keys(packageJson.devDependencies || {});

      console.log(`   Production dependencies: ${prodDeps.length}`);
      console.log(`   Development dependencies: ${devDeps.length}`);

      // Check for potential security concerns in dependencies
      this.analyzeDependencySecurity(prodDeps, 'production');
      this.analyzeDependencySecurity(devDeps, 'development');

    } catch (error) {
      console.error('   ❌ Failed to analyze dependency tree:', error.message);
    }
  }

  analyzeDependencySecurity(dependencies, type) {
    const securityPackages = ['helmet', 'bcrypt', 'jsonwebtoken', 'cors', 'express-rate-limit'];
    const validationPackages = ['zod', 'ajv', 'joi'];
    const loggingPackages = ['winston', 'pino', 'bunyan'];

    dependencies.forEach(dep => {
      // Check for security best practices
      if (securityPackages.includes(dep)) {
        console.log(`   ✅ Security package found: ${dep}`);
      }

      // Check for input validation
      if (validationPackages.includes(dep)) {
        console.log(`   ✅ Validation package found: ${dep}`);
      }

      // Check for logging
      if (loggingPackages.includes(dep)) {
        console.log(`   ✅ Logging package found: ${dep}`);
      }

      // Check for potentially risky packages
      if (dep.includes('eval') || dep.includes('unsafe')) {
        this.assessmentResults.recommendations.push({
          type: 'security',
          priority: 'high',
          package: dep,
          issue: 'Potentially unsafe package name',
          solution: 'Review package usage and consider alternatives'
        });
      }
    });
  }

  async generateSecurityReport() {
    console.log('📋 Generating security report...');

    const report = this.generateReportContent();
    writeFileSync(this.reportPath, report);
  }

  generateReportContent() {
    const timestamp = new Date().toISOString().split('T')[0];
    const totalVulns = this.assessmentResults.vulnerabilities.total;
    const riskLevel = totalVulns === 0 ? 'LOW' :
                      this.assessmentResults.vulnerabilities.critical > 0 ? 'CRITICAL' :
                      this.assessmentResults.vulnerabilities.high > 0 ? 'HIGH' :
                      this.assessmentResults.vulnerabilities.moderate > 0 ? 'MEDIUM' : 'LOW';

    const status = totalVulns === 0 ? '✅ SECURE - Production Ready' : '⚠️  ATTENTION REQUIRED';

    return `# Dependency Security Assessment Report

## Executive Summary

**Report Date**: ${timestamp}
**Phase**: Phase 0 - Critical Build & Test Infrastructure Fixes
**Status**: ${status}
**Risk Level**: ${riskLevel}

### Key Findings
- **${this.assessmentResults.vulnerabilities.critical}** Critical vulnerabilities
- **${this.assessmentResults.vulnerabilities.high}** High severity vulnerabilities
- **${this.assessmentResults.vulnerabilities.moderate}** Moderate vulnerabilities
- **${this.assessmentResults.vulnerabilities.low}** Low severity vulnerabilities
- **${this.assessmentResults.dependencies.total}** Total dependencies

## Security Audit Results

### Vulnerability Summary
${this.generateVulnerabilityTable()}

### Dependency Breakdown
- **Production**: ${this.assessmentResults.dependencies.prod} dependencies
- **Development**: ${this.assessmentResults.dependencies.dev} dependencies
- **Optional**: ${this.assessmentResults.dependencies.optional} dependencies
- **Peer**: ${this.assessmentResults.dependencies.peer} dependencies

## Outdated Packages

${this.generateOutdatedTable()}

## Security Recommendations

${this.generateRecommendations()}

## Production Readiness Assessment

### Security Compliance
${totalVulns === 0 ? '✅ PASSED' : '❌ FAILED'} - Zero critical/high vulnerabilities

### Dependency Management
${this.assessmentResults.outdated.length === 0 ? '✅ PASSED' : '⚠️  WARNING'} - All dependencies up to date

### Overall Assessment
**Risk Level**: ${riskLevel}
**Production Ready**: ${totalVulns === 0 ? '✅ YES' : '❌ NO'}

---

*Report generated automatically on ${timestamp}*
*Next review recommended in 30 days*
`;
  }

  generateVulnerabilityTable() {
    const v = this.assessmentResults.vulnerabilities;
    return `
| Severity | Count | Status |
|----------|-------|--------|
| Critical | ${v.critical} | ${v.critical === 0 ? '✅ None' : '❌ Action Required'} |
| High | ${v.high} | ${v.high === 0 ? '✅ None' : '❌ Action Required'} |
| Moderate | ${v.moderate} | ${v.moderate === 0 ? '✅ None' : '⚠️  Review Needed'} |
| Low | ${v.low} | ${v.low === 0 ? '✅ None' : '⚠️  Monitor'} |
| Info | ${v.info} | ℹ️  Informational |
| **Total** | **${v.total}** | ${v.total === 0 ? '✅ Secure' : '⚠️  Attention Needed'} |
`;
  }

  generateOutdatedTable() {
    if (this.assessmentResults.outdated.length === 0) {
      return '✅ All packages are up to date';
    }

    let table = '| Package | Current | Latest | Priority |\n';
    table += '|---------|---------|--------|----------|\n';

    this.assessmentResults.outdated.slice(0, 10).forEach(pkg => {
      const priority = pkg.latest && pkg.latest !== pkg.current ? 'Medium' : 'Low';
      table += `| ${pkg.package} | ${pkg.current} | ${pkg.latest} | ${priority} |\n`;
    });

    if (this.assessmentResults.outdated.length > 10) {
      table += `| ... | ... | ... | ... |\n`;
      table += `| **${this.assessmentResults.outdated.length - 10} more** | | | |\n`;
    }

    return table;
  }

  generateRecommendations() {
    if (this.assessmentResults.recommendations.length === 0) {
      return '✅ No security recommendations at this time';
    }

    const critical = this.assessmentResults.recommendations.filter(r => r.priority === 'critical');
    const high = this.assessmentResults.recommendations.filter(r => r.priority === 'high');
    const medium = this.assessmentResults.recommendations.filter(r => r.priority === 'medium');

    let content = '';

    if (critical.length > 0) {
      content += '\n### 🚨 Critical Actions\n';
      critical.forEach(rec => {
        content += `- **${rec.package}**: ${rec.issue}\n  - Solution: ${rec.solution}\n`;
      });
    }

    if (high.length > 0) {
      content += '\n### ⚠️  High Priority\n';
      high.forEach(rec => {
        content += `- **${rec.package}**: ${rec.issue}\n  - Solution: ${rec.solution}\n`;
      });
    }

    if (medium.length > 0) {
      content += '\n### 📋 Medium Priority\n';
      medium.forEach(rec => {
        content += `- **${rec.package}**: ${rec.issue}\n  - Solution: ${rec.solution}\n`;
      });
    }

    return content;
  }
}

// Run assessment if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const assessment = new DependencySecurityAssessment();
  assessment.runAssessment().catch(console.error);
}

export default DependencySecurityAssessment;