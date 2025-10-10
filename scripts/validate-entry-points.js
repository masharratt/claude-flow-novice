#!/usr/bin/env node
/**
 * Entry Point Validation Script
 * Validates all package.json entry points work correctly after build
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m'
};

class EntryPointValidator {
  constructor() {
    this.results = {
      passed: [],
      failed: [],
      warnings: []
    };
  }

  log(message, color = 'reset') {
    console.log(colors[color] + message + colors.reset);
  }

  async validatePackageJson() {
    this.log('\n🔍 Reading package.json...', 'blue');

    const pkgPath = path.join(rootDir, 'package.json');
    const pkgContent = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgContent);

    return {
      main: pkg.main,
      types: pkg.types,
      bin: pkg.bin,
      exports: pkg.exports
    };
  }

  async checkFileExists(filePath, description) {
    const fullPath = path.join(rootDir, filePath);

    try {
      await fs.access(fullPath);
      this.log(`  ✓ ${description}: ${filePath}`, 'green');
      this.results.passed.push({ type: 'file-exists', description, path: filePath });
      return true;
    } catch {
      this.log(`  ✗ ${description}: ${filePath}`, 'red');
      this.results.failed.push({ type: 'file-missing', description, path: filePath });
      return false;
    }
  }

  async testImport(filePath, description) {
    const fullPath = path.join(rootDir, filePath);

    try {
      // Convert to file URL for dynamic import
      const fileUrl = pathToFileURL(fullPath).href;
      await import(fileUrl);
      this.log(`  ✓ ${description}: imports successfully`, 'green');
      this.results.passed.push({ type: 'import', description, path: filePath });
      return true;
    } catch (error) {
      this.log(`  ✗ ${description}: ${error.message}`, 'red');
      this.results.failed.push({
        type: 'import-failed',
        description,
        path: filePath,
        error: error.message
      });
      return false;
    }
  }

  async validateMainEntry(pkg) {
    this.log('\n📦 Validating main entry point...', 'blue');

    if (!pkg.main) {
      this.results.warnings.push('No main entry point defined');
      this.log('  ⚠ No main entry point defined', 'yellow');
      return;
    }

    await this.checkFileExists(pkg.main, 'main');
    await this.testImport(pkg.main, 'main');
  }

  async validateTypesEntry(pkg) {
    this.log('\n📘 Validating TypeScript types...', 'blue');

    if (!pkg.types) {
      this.results.warnings.push('No types entry point defined');
      this.log('  ⚠ No types entry point defined', 'yellow');
      return;
    }

    await this.checkFileExists(pkg.types, 'types');
  }

  async validateBinEntries(pkg) {
    this.log('\n🔧 Validating bin entries...', 'blue');

    if (!pkg.bin) {
      this.results.warnings.push('No bin entries defined');
      this.log('  ⚠ No bin entries defined', 'yellow');
      return;
    }

    for (const [name, binPath] of Object.entries(pkg.bin)) {
      await this.checkFileExists(binPath, `bin/${name}`);

      // Check if bin file has shebang
      try {
        const fullPath = path.join(rootDir, binPath);
        const content = await fs.readFile(fullPath, 'utf8');
        const firstLine = content.split('\n')[0];

        if (!firstLine.startsWith('#!')) {
          this.results.warnings.push(`bin/${name} missing shebang: ${binPath}`);
          this.log(`  ⚠ ${name}: missing shebang`, 'yellow');
        } else {
          this.log(`  ✓ ${name}: has shebang`, 'gray');
        }
      } catch {
        // File doesn't exist, already reported above
      }
    }
  }

  async validateExports(pkg) {
    this.log('\n📤 Validating exports...', 'blue');

    if (!pkg.exports) {
      this.results.warnings.push('No exports defined');
      this.log('  ⚠ No exports defined', 'yellow');
      return;
    }

    for (const [exportName, exportPath] of Object.entries(pkg.exports)) {
      const description = exportName === '.' ? 'exports (default)' : `exports (${exportName})`;
      await this.checkFileExists(exportPath, description);
    }
  }

  async validateImportable(pkg) {
    this.log('\n🧪 Testing module imports...', 'blue');

    // Test main entry
    if (pkg.main) {
      await this.testImport(pkg.main, 'main entry');
    }

    // Test key exports
    const criticalExports = [
      { key: '.', name: 'default export' },
      { key: './cli', name: 'CLI export' },
      { key: './mcp', name: 'MCP export' }
    ];

    for (const { key, name } of criticalExports) {
      if (pkg.exports && pkg.exports[key]) {
        await this.testImport(pkg.exports[key], name);
      }
    }
  }

  async validateBuildStructure() {
    this.log('\n🏗️  Validating build structure...', 'blue');

    const criticalPaths = [
      '.claude-flow-novice/dist/src',
      '.claude-flow-novice/dist/src/cli',
      '.claude-flow-novice/dist/src/core',
      '.claude-flow-novice/dist/src/agents'
    ];

    for (const dirPath of criticalPaths) {
      await this.checkFileExists(dirPath, `directory: ${dirPath}`);
    }
  }

  printSummary() {
    this.log('\n' + '='.repeat(60), 'blue');
    this.log('📊 VALIDATION SUMMARY', 'blue');
    this.log('='.repeat(60), 'blue');

    this.log(`\n✓ Passed: ${this.results.passed.length}`, 'green');
    this.log(`✗ Failed: ${this.results.failed.length}`, this.results.failed.length > 0 ? 'red' : 'green');
    this.log(`⚠ Warnings: ${this.results.warnings.length}`, this.results.warnings.length > 0 ? 'yellow' : 'gray');

    if (this.results.failed.length > 0) {
      this.log('\n❌ FAILURES:', 'red');
      this.results.failed.forEach(failure => {
        this.log(`  • ${failure.description}: ${failure.path}`, 'red');
        if (failure.error) {
          this.log(`    ${failure.error}`, 'gray');
        }
      });
    }

    if (this.results.warnings.length > 0) {
      this.log('\n⚠️  WARNINGS:', 'yellow');
      this.results.warnings.forEach(warning => {
        this.log(`  • ${warning}`, 'yellow');
      });
    }

    const confidence = this.calculateConfidence();
    this.log(`\n🎯 Confidence Score: ${(confidence * 100).toFixed(1)}%`,
      confidence >= 0.75 ? 'green' : 'red');

    return {
      passed: this.results.passed.length,
      failed: this.results.failed.length,
      warnings: this.results.warnings.length,
      confidence,
      success: this.results.failed.length === 0
    };
  }

  calculateConfidence() {
    const total = this.results.passed.length + this.results.failed.length;
    if (total === 0) return 0;

    const passRate = this.results.passed.length / total;
    const warningPenalty = Math.min(this.results.warnings.length * 0.02, 0.1);

    return Math.max(0, Math.min(1, passRate - warningPenalty));
  }

  async exportReport() {
    const reportPath = path.join(rootDir, 'entry-points-validation-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        passed: this.results.passed.length,
        failed: this.results.failed.length,
        warnings: this.results.warnings.length,
        confidence: this.calculateConfidence()
      },
      results: this.results
    };

    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    this.log(`\n📄 Report exported to: ${reportPath}`, 'blue');
  }

  async run() {
    this.log('🚀 Entry Point Validation Starting...', 'blue');

    try {
      const pkg = await this.validatePackageJson();

      await this.validateBuildStructure();
      await this.validateMainEntry(pkg);
      await this.validateTypesEntry(pkg);
      await this.validateBinEntries(pkg);
      await this.validateExports(pkg);
      await this.validateImportable(pkg);

      const summary = this.printSummary();
      await this.exportReport();

      // Exit with error code if validation failed
      if (!summary.success) {
        process.exit(1);
      }

      this.log('\n✅ All entry points validated successfully!', 'green');

    } catch (error) {
      this.log(`\n❌ Fatal validation error: ${error.message}`, 'red');
      console.error(error);
      process.exit(1);
    }
  }
}

// Run validation
const validator = new EntryPointValidator();
validator.run().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
