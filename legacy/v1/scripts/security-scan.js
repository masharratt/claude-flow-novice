#!/usr/bin/env node

/**
 * Security Scan Script
 * Scans codebase for security vulnerabilities and hardcoded secrets
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

class SecurityScanner {
  constructor() {
    this.issues = [];
    this.warnings = [];
    this.startMemory = process.memoryUsage();
    this.fileHandles = new Set();
    this.sensitivePatterns = [
      // API Keys and Tokens
      {
        name: 'API Key',
        pattern: /api[_-]?key\s*[:=]\s*['"]([a-zA-Z0-9]{20,})['"]/gi,
        severity: 'high'
      },
      {
        name: 'Secret Token',
        pattern: /secret[_-]?token\s*[:=]\s*['"]([a-zA-Z0-9]{20,})['"]/gi,
        severity: 'high'
      },
      {
        name: 'Access Token',
        pattern: /access[_-]?token\s*[:=]\s*['"]([a-zA-Z0-9]{20,})['"]/gi,
        severity: 'high'
      },
      {
        name: 'JWT Secret',
        pattern: /jwt[_-]?secret\s*[:=]\s*['"]([a-zA-Z0-9+/]{32,})['"]/gi,
        severity: 'high'
      },

      // Passwords
      {
        name: 'Password',
        pattern: /password\s*[:=]\s*['"]([^'"]{8,})['"]/gi,
        severity: 'critical'
      },
      {
        name: 'Database Password',
        pattern: /(db|database)[_-]?password\s*[:=]\s*['"]([^'"]+)['"]/gi,
        severity: 'critical'
      },

      // Private Keys and Certificates
      {
        name: 'Private Key',
        pattern: /-----BEGIN (RSA )?PRIVATE KEY-----/g,
        severity: 'critical'
      },
      {
        name: 'Certificate',
        pattern: /-----BEGIN CERTIFICATE-----/g,
        severity: 'medium'
      },

      // URLs and Endpoints
      {
        name: 'Internal URL',
        pattern: /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.|172\.1[6-9]\.|172\.2[0-9]\.|172\.3[0-1]\.)/gi,
        severity: 'medium'
      },

      // Database Connection Strings
      {
        name: 'Database URL',
        pattern: /(mongodb|mysql|postgresql|redis):\/\/[^:]+:[^@]+@/gi,
        severity: 'high'
      },

      // Cloud Provider Secrets
      {
        name: 'AWS Access Key',
        pattern: /AKIA[0-9A-Z]{16}/g,
        severity: 'critical'
      },
      {
        name: 'AWS Secret Key',
        pattern: /aws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*['"]([a-zA-Z0-9+/]{40})['"]/gi,
        severity: 'critical'
      },
      {
        name: 'Google API Key',
        pattern: /AIza[0-9A-Za-z_-]{35}/g,
        severity: 'high'
      }
    ];

    this.insecurePatterns = [
      {
        name: 'Eval Usage',
        pattern: /eval\s*\(/g,
        severity: 'high',
        recommendation: 'Avoid using eval() as it can execute arbitrary code'
      },
      {
        name: 'Function Constructor',
        pattern: /Function\s*\(/g,
        severity: 'high',
        recommendation: 'Avoid using Function() constructor as it can execute arbitrary code'
      },
      {
        name: 'innerHTML Usage',
        pattern: /\.innerHTML\s*=/g,
        severity: 'medium',
        recommendation: 'Use textContent or DOM methods instead of innerHTML to prevent XSS'
      },
      {
        name: 'document.write',
        pattern: /document\.write\s*\(/g,
        severity: 'medium',
        recommendation: 'Avoid document.write() as it can introduce XSS vulnerabilities'
      },
      {
        name: 'Unsafe Regex',
        pattern: /new RegExp\s*\([^)]*\+/g,
        severity: 'medium',
        recommendation: 'Be careful with regex patterns that could lead to ReDoS attacks'
      }
    ];

    this.excludedDirectories = [
      'node_modules',
      '.git',
      'dist',
      'build',
      'coverage',
      '.nyc_output',
      '.claude-flow-novice/dist'
    ];

    this.excludedFiles = [
      '*.min.js',
      '*.bundle.js',
      'package-lock.json',
      'yarn.lock'
    ];
  }

  async scan() {
    console.log('🔒 Starting security scan...');
    console.log('='.repeat(50));

    try {
      await Promise.race([
        this.runScans(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Security scan timeout after 5 minutes')), 300000)
        )
      ]);
    } catch (error) {
      console.error(`❌ Scan failed: ${error.message}`);
      throw error;
    } finally {
      await this.cleanup();
    }

    this.generateReport();
  }

  async runScans() {
    await this.scanFiles();
    await this.scanDependencies();
    await this.scanPermissions();
  }

  async cleanup() {
    // Close any open file handles
    this.fileHandles.forEach(handle => {
      try {
        if (handle && typeof handle.close === 'function') {
          handle.close();
        }
      } catch (err) {
        // Ignore cleanup errors
      }
    });
    this.fileHandles.clear();

    // Log memory usage
    const endMemory = process.memoryUsage();
    const memoryDelta = (endMemory.heapUsed - this.startMemory.heapUsed) / 1024 / 1024;
    if (memoryDelta > 100) {
      console.warn(`⚠️  Memory delta: ${memoryDelta.toFixed(2)}MB (potential leak)`);
    }
  }

  async scanFiles() {
    console.log('📁 Scanning source files...');

    const files = this.getSourceFiles();
    let scannedCount = 0;
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit

    for (const file of files) {
      try {
        // Check file size before reading
        const stats = fs.statSync(file);
        if (stats.size > MAX_FILE_SIZE) {
          this.warnings.push(`Skipping large file: ${file} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
          continue;
        }

        const content = await this.readFileAsync(file);
        this.scanFileContent(file, content);
        scannedCount++;

        // Force garbage collection hint every 100 files
        if (scannedCount % 100 === 0 && global.gc) {
          global.gc();
        }
      } catch (error) {
        // Skip files that can't be read
      }
    }

    console.log(`✅ Scanned ${scannedCount} files`);
  }

  async readFileAsync(filePath) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 });

      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(chunks.join('')));
      stream.on('error', reject);

      this.fileHandles.add(stream);
      stream.on('close', () => this.fileHandles.delete(stream));
    });
  }

  scanFileContent(filePath, content) {
    const lines = content.split('\n');

    // Check for sensitive information
    this.sensitivePatterns.forEach(pattern => {
      // Reset regex lastIndex to prevent state leaks
      pattern.pattern.lastIndex = 0;
      let match;
      let matchCount = 0;
      const MAX_MATCHES = 1000; // Prevent regex DoS

      while ((match = pattern.pattern.exec(content)) !== null && matchCount < MAX_MATCHES) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const lineContent = lines[lineNumber - 1] || '';

        this.issues.push({
          type: 'sensitive_data',
          severity: pattern.severity,
          rule: pattern.name,
          file: filePath,
          line: lineNumber,
          content: lineContent.trim(),
          match: match[0],
          recommendation: 'Remove hardcoded secrets and use environment variables or secure configuration'
        });
        matchCount++;
      }
    });

    // Check for insecure patterns
    this.insecurePatterns.forEach(pattern => {
      // Reset regex lastIndex to prevent state leaks
      pattern.pattern.lastIndex = 0;
      let match;
      let matchCount = 0;
      const MAX_MATCHES = 1000; // Prevent regex DoS

      while ((match = pattern.pattern.exec(content)) !== null && matchCount < MAX_MATCHES) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const lineContent = lines[lineNumber - 1] || '';

        this.issues.push({
          type: 'insecure_pattern',
          severity: pattern.severity,
          rule: pattern.name,
          file: filePath,
          line: lineNumber,
          content: lineContent.trim(),
          match: match[0],
          recommendation: pattern.recommendation
        });
        matchCount++;
      }
    });
  }

  async scanDependencies() {
    console.log('📦 Scanning dependencies...');

    try {
      // Run npm audit
      const auditOutput = execSync('npm audit --json', {
        encoding: 'utf8',
        cwd: rootDir,
        stdio: 'pipe'
      });

      const auditResult = JSON.parse(auditOutput);
      const vulnerabilities = auditResult.vulnerabilities || {};

      Object.values(vulnerabilities).forEach(vuln => {
        this.issues.push({
          type: 'dependency_vulnerability',
          severity: this.mapNpmSeverity(vuln.severity),
          rule: 'Dependency Vulnerability',
          file: 'package.json',
          package: vuln.name,
          version: vuln.version,
          severity: vuln.severity,
          title: vuln.title,
          url: vuln.url,
          recommendation: `Update ${vuln.name} to a fixed version`
        });
      });

      console.log('✅ Dependency scan completed');
    } catch (error) {
      this.warnings.push(`Could not run npm audit: ${error.message}`);
    }
  }

  async scanPermissions() {
    console.log('🔐 Scanning file permissions...');

    const files = this.getSourceFiles();
    let permissionIssues = 0;

    for (const file of files) {
      try {
        const stats = fs.statSync(file);
        const mode = stats.mode;

        // Check for overly permissive file permissions
        if ((mode & 0o777) > 0o644) {
          this.warnings.push({
            type: 'file_permissions',
            severity: 'low',
            rule: 'File Permissions',
            file: file,
            mode: mode.toString(8),
            recommendation: 'Consider restricting file permissions to 644 or less'
          });
          permissionIssues++;
        }
      } catch (error) {
        // Skip files that can't be accessed
      }
    }

    console.log(`✅ Permission scan completed (${permissionIssues} issues found)`);
  }

  getSourceFiles() {
    const extensions = ['.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.yml', '.yaml'];
    const sourceFiles = [];

    function scanDirectory(dir) {
      try {
        const files = fs.readdirSync(dir);

        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            if (!this.excludedDirectories.includes(file) && !file.startsWith('.')) {
              scanDirectory(fullPath);
            }
          } else if (stat.isFile()) {
            const isExcluded = this.excludedFiles.some(pattern => {
              const regex = new RegExp(pattern.replace('*', '.*'));
              return regex.test(file);
            });

            if (!isExcluded && extensions.some(ext => file.endsWith(ext))) {
              sourceFiles.push(fullPath);
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be accessed
      }
    }

    scanDirectory.call(this, rootDir);
    return sourceFiles;
  }

  mapNpmSeverity(npmSeverity) {
    const mapping = {
      'low': 'low',
      'moderate': 'medium',
      'high': 'high',
      'critical': 'critical'
    };
    return mapping[npmSeverity] || 'medium';
  }

  generateReport() {
    console.log('\n🔒 Security Scan Report');
    console.log('='.repeat(50));

    // Count issues by severity
    const severityCount = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    this.issues.forEach(issue => {
      severityCount[issue.severity]++;
    });

    // Summary
    console.log(`\n📊 Summary:`);
    console.log(`  Critical: ${severityCount.critical}`);
    console.log(`  High: ${severityCount.high}`);
    console.log(`  Medium: ${severityCount.medium}`);
    console.log(`  Low: ${severityCount.low}`);
    console.log(`  Warnings: ${this.warnings.length}`);

    const totalIssues = this.issues.length;
    const criticalOrHigh = severityCount.critical + severityCount.high;

    if (criticalOrHigh > 0) {
      console.log(`\n🚫 ${criticalOrHigh} critical/high severity issues found!`);
    } else if (totalIssues > 0) {
      console.log(`\n⚠️  ${totalIssues} security issues found`);
    } else {
      console.log('\n✅ No security issues found!');
    }

    // Group issues by type
    const issuesByType = {};
    this.issues.forEach(issue => {
      if (!issuesByType[issue.type]) {
        issuesByType[issue.type] = [];
      }
      issuesByType[issue.type].push(issue);
    });

    // Detailed findings
    if (totalIssues > 0) {
      console.log('\n🔍 Detailed Findings:');
      console.log('-'.repeat(50));

      Object.entries(issuesByType).forEach(([type, issues]) => {
        console.log(`\n${this.formatIssueType(type)} (${issues.length} issues):`);

        // Show only first 5 issues of each type to avoid flooding output
        issues.slice(0, 5).forEach(issue => {
          const icon = this.getSeverityIcon(issue.severity);
          console.log(`  ${icon} ${issue.rule}`);
          console.log(`     File: ${issue.file}:${issue.line || 'N/A'}`);
          console.log(`     Content: ${issue.content || issue.match || issue.package}`);
          if (issue.recommendation) {
            console.log(`     Recommendation: ${issue.recommendation}`);
          }
          console.log('');
        });

        if (issues.length > 5) {
          console.log(`     ... and ${issues.length - 5} more ${type} issues`);
        }
      });
    }

    // Warnings
    if (this.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      this.warnings.forEach(warning => {
        if (typeof warning === 'string') {
          console.log(`   • ${warning}`);
        } else {
          console.log(`   • ${warning.rule}: ${warning.file}`);
        }
      });
    }

    // Recommendations
    this.generateRecommendations(severityCount);

    // Exit code
    process.exit(criticalOrHigh > 0 ? 1 : 0);
  }

  formatIssueType(type) {
    return type.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  getSeverityIcon(severity) {
    const icons = {
      critical: '🚨',
      high: '🔴',
      medium: '🟡',
      low: '🟢'
    };
    return icons[severity] || '⚪';
  }

  generateRecommendations(severityCount) {
    console.log('\n💡 Recommendations:');
    console.log('-'.repeat(50));

    if (severityCount.critical > 0) {
      console.log('🚨 CRITICAL: Address immediately');
      console.log('   • Remove all hardcoded secrets and keys');
      console.log('   • Use environment variables or secret management');
      console.log('   • Update vulnerable dependencies');
    }

    if (severityCount.high > 0) {
      console.log('🔴 HIGH: Fix before next release');
      console.log('   • Review and remove sensitive data');
      console.log('   • Replace insecure coding patterns');
      console.log('   • Audit dependency versions');
    }

    if (severityCount.medium > 0) {
      console.log('🟡 MEDIUM: Address soon');
      console.log('   • Improve secure coding practices');
      console.log('   • Add input validation and sanitization');
      console.log('   • Review file permissions');
    }

    if (severityCount.low > 0) {
      console.log('🟢 LOW: Good to fix');
      console.log('   • Follow security best practices');
      console.log('   • Add security testing to CI pipeline');
    }

    if (this.issues.length === 0) {
      console.log('✅ Great job! Continue following security best practices:');
      console.log('   • Regularly update dependencies');
      console.log('   • Use environment variables for secrets');
      console.log('   • Implement security testing in CI/CD');
      console.log('   • Regular security audits');
    }
  }
}

// CLI Interface
async function main() {
  const scanner = new SecurityScanner();
  await scanner.scan();
}

main().catch(error => {
  console.error('❌ Security scan failed:', error);
  process.exit(1);
});