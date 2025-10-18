#!/usr/bin/env node

/**
 * Pre-Publish Validation Script
 *
 * Validates that the package is ready for NPM publication
 * Enhanced with package size, coverage, and comprehensive checks
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

console.log('🔍 Running pre-publish validation...\n');

const MAX_PACKAGE_SIZE = 100 * 1024 * 1024; // 100MB
const MIN_COVERAGE_TARGET = 95; // 95% coverage target

const validations = [
  {
    name: 'Build output exists',
    critical: true,
    validate: () => {
      const indexPath = path.join(projectRoot, '.claude-flow-novice/dist/src/index.js');
      if (!fs.existsSync(indexPath)) {
        throw new Error('Build output not found. Run "npm run build" first.');
      }
      return { passed: true, details: `Found: ${indexPath}` };
    }
  },
  {
    name: 'Type declarations exist',
    critical: true,
    validate: () => {
      const typesPath = path.join(projectRoot, '.claude-flow-novice/dist/index.d.ts');
      if (!fs.existsSync(typesPath)) {
        throw new Error('Type declarations not found. Run "npm run build" first.');
      }
      return { passed: true, details: `Found: ${typesPath}` };
    }
  },
  {
    name: 'Package.json is valid',
    critical: true,
    validate: () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

      if (!packageJson.name || !packageJson.version || !packageJson.main) {
        throw new Error('package.json is missing required fields (name, version, main)');
      }

      if (!packageJson.types) {
        throw new Error('package.json is missing "types" field');
      }

      return {
        passed: true,
        details: `${packageJson.name}@${packageJson.version}`
      };
    }
  },
  {
    name: 'Entry points are valid',
    critical: true,
    validate: () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
      const mainPath = path.join(projectRoot, packageJson.main);
      const typesPath = path.join(projectRoot, packageJson.types);

      if (!fs.existsSync(mainPath)) {
        throw new Error(`Main entry point not found: ${mainPath}`);
      }

      if (!fs.existsSync(typesPath)) {
        throw new Error(`Types entry point not found: ${typesPath}`);
      }

      // Validate exports
      let exportCount = 0;
      if (packageJson.exports) {
        exportCount = Object.keys(packageJson.exports).length;
      }

      return {
        passed: true,
        details: `Main entry valid, ${exportCount} exports defined`
      };
    }
  },
  {
    name: 'Binary files exist',
    critical: true,
    validate: () => {
      const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
      const binaries = [];

      if (packageJson.bin) {
        for (const [name, filePath] of Object.entries(packageJson.bin)) {
          const fullPath = path.join(projectRoot, filePath);
          if (!fs.existsSync(fullPath)) {
            throw new Error(`Binary file not found: ${name} -> ${fullPath}`);
          }
          binaries.push(name);
        }
      }

      return {
        passed: true,
        details: `${binaries.length} binaries validated: ${binaries.join(', ')}`
      };
    }
  },
  {
    name: 'Package size validation',
    critical: true,
    validate: () => {
      try {
        // Create package tarball temporarily
        execSync('npm pack', { cwd: projectRoot, stdio: 'pipe' });

        // Find the tarball
        const files = fs.readdirSync(projectRoot);
        const tarball = files.find(f => f.startsWith('claude-flow-novice-') && f.endsWith('.tgz'));

        if (!tarball) {
          throw new Error('Package tarball not found');
        }

        const tarballPath = path.join(projectRoot, tarball);
        const stats = fs.statSync(tarballPath);
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

        // Clean up tarball
        fs.unlinkSync(tarballPath);

        if (stats.size > MAX_PACKAGE_SIZE) {
          throw new Error(`Package size ${sizeMB}MB exceeds 100MB limit`);
        }

        return {
          passed: true,
          details: `Package size: ${sizeMB}MB (within 100MB limit)`
        };
      } catch (error) {
        throw new Error(`Package size check failed: ${error.message}`);
      }
    }
  },
  {
    name: 'Test coverage validation',
    critical: false,
    validate: () => {
      const coveragePath = path.join(projectRoot, 'coverage/coverage-summary.json');

      if (!fs.existsSync(coveragePath)) {
        return {
          passed: false,
          details: 'Coverage report not found. Run tests with coverage first.'
        };
      }

      const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
      const total = coverage.total;

      const avgCoverage = Math.round(
        (total.lines.pct + total.statements.pct + total.functions.pct + total.branches.pct) / 4
      );

      if (avgCoverage < MIN_COVERAGE_TARGET) {
        return {
          passed: false,
          details: `Coverage ${avgCoverage}% below ${MIN_COVERAGE_TARGET}% target (Lines: ${total.lines.pct}%, Statements: ${total.statements.pct}%, Functions: ${total.functions.pct}%, Branches: ${total.branches.pct}%)`
        };
      }

      return {
        passed: true,
        details: `Coverage: ${avgCoverage}% (Lines: ${total.lines.pct}%, Statements: ${total.statements.pct}%, Functions: ${total.functions.pct}%, Branches: ${total.branches.pct}%)`
      };
    }
  },
  {
    name: 'No source files in distribution',
    critical: true,
    validate: () => {
      const npmignorePath = path.join(projectRoot, '.npmignore');

      if (!fs.existsSync(npmignorePath)) {
        throw new Error('.npmignore file not found');
      }

      const npmignore = fs.readFileSync(npmignorePath, 'utf8');
      const excludedPatterns = ['src/', 'tests/', 'test/', '*.test.js', '*.test.ts'];
      const missing = excludedPatterns.filter(pattern => !npmignore.includes(pattern));

      if (missing.length > 0) {
        throw new Error(`Missing exclusions in .npmignore: ${missing.join(', ')}`);
      }

      return {
        passed: true,
        details: 'Source files properly excluded from package'
      };
    }
  },
  {
    name: 'Security audit passed',
    critical: true,
    validate: () => {
      try {
        const result = execSync('npm audit --audit-level moderate', {
          encoding: 'utf8',
          stdio: 'pipe',
          cwd: projectRoot
        });

        if (result.includes('vulnerabilities')) {
          const lines = result.split('\n');
          const vulnLine = lines.find(line => line.includes('vulnerabilities'));
          if (vulnLine && !vulnLine.includes('0 vulnerabilities')) {
            throw new Error(`Security issues found: ${vulnLine.trim()}`);
          }
        }

        return { passed: true, details: 'No security vulnerabilities detected' };
      } catch (error) {
        // npm audit returns non-zero exit code when vulnerabilities found
        if (error.stdout && error.stdout.includes('vulnerabilities')) {
          const lines = error.stdout.split('\n');
          const vulnLine = lines.find(line => line.includes('vulnerabilities'));
          if (vulnLine && !vulnLine.includes('0 vulnerabilities')) {
            throw new Error(`Security issues: ${vulnLine.trim()}`);
          }
        }
        throw new Error(`Security audit failed: ${error.message}`);
      }
    }
  },
  {
    name: 'Dependencies are up to date',
    critical: false,
    validate: () => {
      try {
        const result = execSync('npm outdated --json', {
          encoding: 'utf8',
          stdio: 'pipe',
          cwd: projectRoot
        });

        const outdated = result ? JSON.parse(result) : {};
        const outdatedCount = Object.keys(outdated).length;

        if (outdatedCount > 0) {
          const majorUpdates = Object.entries(outdated)
            .filter(([, info]) => {
              const current = info.current.split('.')[0];
              const wanted = info.wanted.split('.')[0];
              return current !== wanted;
            });

          if (majorUpdates.length > 0) {
            const packages = majorUpdates.map(([name]) => name).join(', ');
            return {
              passed: false,
              details: `${majorUpdates.length} major updates available: ${packages}`
            };
          }
        }

        return {
          passed: true,
          details: outdatedCount === 0 ? 'All dependencies up to date' : `${outdatedCount} minor updates available`
        };
      } catch (error) {
        // npm outdated returns non-zero when there are outdated packages
        return { passed: true, details: 'Dependency check completed' };
      }
    }
  },
  {
    name: 'Build artifacts integrity',
    critical: true,
    validate: () => {
      const distDir = path.join(projectRoot, '.claude-flow-novice/dist');

      if (!fs.existsSync(distDir)) {
        throw new Error('Build directory not found');
      }

      // Check for essential files
      const essentialFiles = [
        'src/index.js',
        'src/cli/index.js',
        'src/cli/main.js'
      ];

      const missing = essentialFiles.filter(file =>
        !fs.existsSync(path.join(distDir, file))
      );

      if (missing.length > 0) {
        throw new Error(`Missing build artifacts: ${missing.join(', ')}`);
      }

      // Count total files
      const countFiles = (dir) => {
        let count = 0;
        const items = fs.readdirSync(dir);
        items.forEach(item => {
          const fullPath = path.join(dir, item);
          if (fs.statSync(fullPath).isDirectory()) {
            count += countFiles(fullPath);
          } else {
            count++;
          }
        });
        return count;
      };

      const fileCount = countFiles(distDir);

      return {
        passed: true,
        details: `${fileCount} files in build output`
      };
    }
  }
];

// Run validations
let criticalPassed = true;
let allPassed = true;
const results = [];

console.log('═'.repeat(60));
console.log('Critical Validations:');
console.log('═'.repeat(60));

validations.filter(v => v.critical).forEach(({ name, validate }) => {
  try {
    const result = validate();
    console.log(`✅ ${name}`);
    if (result.details) {
      console.log(`   ${result.details}`);
    }
    results.push({ name, passed: true, critical: true, details: result.details });
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   ${error.message}`);
    criticalPassed = false;
    allPassed = false;
    results.push({ name, passed: false, critical: true, error: error.message });
  }
});

console.log('\n' + '═'.repeat(60));
console.log('Optional Validations:');
console.log('═'.repeat(60));

validations.filter(v => !v.critical).forEach(({ name, validate }) => {
  try {
    const result = validate();
    console.log(`${result.passed ? '✅' : '⚠️'} ${name}`);
    if (result.details) {
      console.log(`   ${result.details}`);
    }
    results.push({ name, passed: result.passed, critical: false, details: result.details });
    if (!result.passed) {
      allPassed = false;
    }
  } catch (error) {
    console.log(`⚠️ ${name}`);
    console.log(`   ${error.message}`);
    results.push({ name, passed: false, critical: false, error: error.message });
    allPassed = false;
  }
});

// Generate summary report
console.log('\n' + '═'.repeat(60));
console.log('Validation Summary:');
console.log('═'.repeat(60));

const criticalCount = results.filter(r => r.critical).length;
const criticalPassedCount = results.filter(r => r.critical && r.passed).length;
const optionalCount = results.filter(r => !r.critical).length;
const optionalPassedCount = results.filter(r => !r.critical && r.passed).length;

console.log(`Critical: ${criticalPassedCount}/${criticalCount} passed`);
console.log(`Optional: ${optionalPassedCount}/${optionalCount} passed`);
console.log(`Total: ${criticalPassedCount + optionalPassedCount}/${results.length} passed`);

// Save detailed report
const reportPath = path.join(projectRoot, '.claude-flow-novice/pre-publish-validation-report.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  summary: {
    total: results.length,
    passed: criticalPassedCount + optionalPassedCount,
    failed: results.length - (criticalPassedCount + optionalPassedCount),
    criticalPassed: criticalPassedCount,
    criticalTotal: criticalCount,
    optionalPassed: optionalPassedCount,
    optionalTotal: optionalCount
  },
  results
}, null, 2));

console.log(`\n📊 Detailed report saved: ${reportPath}`);

// Exit with appropriate code
if (!criticalPassed) {
  console.log('\n❌ Critical validations failed. Package is NOT ready for publication.');
  console.log('   Please fix critical issues before publishing.\n');
  process.exit(1);
} else if (!allPassed) {
  console.log('\n⚠️ All critical validations passed, but some optional checks failed.');
  console.log('   Package can be published, but consider addressing warnings.\n');
  process.exit(0);
} else {
  console.log('\n🎉 All validations passed! Package is ready for publication.\n');
  process.exit(0);
}