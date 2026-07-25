#!/usr/bin/env node

/**
 * Migration Utility for Integration Standards
 *
 * Scans codebase for non-compliant patterns and:
 * - Identifies violations
 * - Auto-fixes simple cases
 * - Generates migration checklist
 * - Reports compliance percentage
 *
 * Usage:
 *   npm run migrate:scan               # Scan only
 *   npm run migrate:fix                # Auto-fix
 *   npm run migrate:checklist          # Generate checklist
 *   npm run migrate:report             # Progress report
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// ============================================
// TYPES
// ============================================

interface Violation {
  file: string;
  line: number;
  type: ViolationType;
  message: string;
  autoFixable: boolean;
  oldPattern?: string;
  newPattern?: string;
}

enum ViolationType {
  DIRECT_DATABASE_IMPORT = 'direct-database-import',
  GENERIC_ERROR = 'generic-error',
  MISSING_SCHEMA_VALIDATION = 'missing-schema-validation',
  NO_TRANSACTION = 'no-transaction',
  MISSING_ERROR_CODE = 'missing-error-code',
  DIRECT_REDIS_IMPORT = 'direct-redis-import',
  DIRECT_FS_SKILL = 'direct-fs-skill',
  MISSING_JSDOC = 'missing-jsdoc',
  SQL_INJECTION_RISK = 'sql-injection-risk'
}

interface ComplianceReport {
  totalFiles: number;
  scannedFiles: number;
  violations: Violation[];
  compliancePercentage: number;
  violationsByType: Record<ViolationType, number>;
}

// ============================================
// SCANNER
// ============================================

class MigrationScanner {
  private violations: Violation[] = [];
  private scannedFiles = 0;

  async scan(pattern: string = 'src/**/*.ts'): Promise<ComplianceReport> {
    const files = await glob(pattern, {
      ignore: ['**/*.test.ts', '**/*.spec.ts', '**/*.mock.ts', '**/node_modules/**']
    });

    console.log(`Scanning ${files.length} files...`);

    for (const file of files) {
      await this.scanFile(file);
      this.scannedFiles++;
    }

    return this.generateReport(files.length);
  }

  private async scanFile(filePath: string): Promise<void> {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Check for direct database imports
      if (this.checkDirectDatabaseImport(line)) {
        this.violations.push({
          file: filePath,
          line: index + 1,
          type: ViolationType.DIRECT_DATABASE_IMPORT,
          message: 'Direct database import detected. Use DatabaseService instead.',
          autoFixable: true,
          oldPattern: line.trim(),
          newPattern: "import { DatabaseService } from './services/database-service';"
        });
      }

      // Check for generic Error
      if (this.checkGenericError(line)) {
        this.violations.push({
          file: filePath,
          line: index + 1,
          type: ViolationType.GENERIC_ERROR,
          message: 'Generic Error usage detected. Use StandardError with error code.',
          autoFixable: true,
          oldPattern: line.trim(),
          newPattern: line.trim().replace(
            /new Error\((.*?)\)/,
            "new StandardError($1, ErrorCode.UNKNOWN, {})"
          )
        });
      }

      // Check for direct Redis import
      if (this.checkDirectRedisImport(line)) {
        this.violations.push({
          file: filePath,
          line: index + 1,
          type: ViolationType.DIRECT_REDIS_IMPORT,
          message: 'Direct Redis import detected. Use RedisCoordination instead.',
          autoFixable: true,
          oldPattern: line.trim(),
          newPattern: "import { RedisCoordination } from './services/redis-coordination';"
        });
      }

      // Check for direct fs operations on skills
      if (this.checkDirectFsSkill(line, filePath)) {
        this.violations.push({
          file: filePath,
          line: index + 1,
          type: ViolationType.DIRECT_FS_SKILL,
          message: 'Direct fs operations on skills detected. Use SkillLoader instead.',
          autoFixable: false
        });
      }

      // Check for SQL injection risk
      if (this.checkSqlInjectionRisk(line)) {
        this.violations.push({
          file: filePath,
          line: index + 1,
          type: ViolationType.SQL_INJECTION_RISK,
          message: 'Potential SQL injection via string concatenation. Use parameterized queries.',
          autoFixable: false
        });
      }
    });

    // Check for missing JSDoc on exports
    this.checkMissingJsDoc(content, filePath);

    // Check for multi-step DB operations without transactions
    this.checkMissingTransactions(content, filePath);
  }

  private checkDirectDatabaseImport(line: string): boolean {
    return /import\s+.*\s+from\s+['"](?:sqlite3|pg|mysql|mysql2)['"]/.test(line);
  }

  private checkGenericError(line: string): boolean {
    return /throw\s+new\s+Error\(/.test(line) && !/StandardError/.test(line);
  }

  private checkDirectRedisImport(line: string): boolean {
    return /import\s+.*\s+from\s+['"](?:ioredis|redis)['"]/.test(line);
  }

  private checkDirectFsSkill(line: string, filePath: string): boolean {
    return /fs\.(readFile|writeFile|mkdir|readdir)/.test(line) &&
           /(skills|\.claude)/.test(line);
  }

  private checkSqlInjectionRisk(line: string): boolean {
    // Check for SQL query string concatenation
    return /(?:query|execute)\s*\(\s*[`'"].*?\$\{/.test(line) ||
           /(?:query|execute)\s*\(\s*['"].*?\+/.test(line);
  }

  private checkMissingJsDoc(content: string, filePath: string): void {
    // Find exported functions
    const exportedFunctions = content.match(/^export\s+(async\s+)?function\s+(\w+)/gm);
    const exportedClasses = content.match(/^export\s+class\s+(\w+)/gm);

    const totalExports = (exportedFunctions?.length || 0) + (exportedClasses?.length || 0);

    // Count JSDoc comments
    const jsdocComments = content.match(/\/\*\*[\s\S]*?\*\//g) || [];

    if (totalExports > jsdocComments.length) {
      this.violations.push({
        file: filePath,
        line: 1,
        type: ViolationType.MISSING_JSDOC,
        message: `Missing JSDoc on ${totalExports - jsdocComments.length} exports`,
        autoFixable: false
      });
    }
  }

  private checkMissingTransactions(content: string, filePath: string): void {
    // Look for multiple query() calls without transaction wrapper
    const queryMatches = content.match(/\.query\(/g);
    const transactionMatches = content.match(/\.transaction\(/g);

    if (queryMatches && queryMatches.length >= 2 && !transactionMatches) {
      this.violations.push({
        file: filePath,
        line: 1,
        type: ViolationType.NO_TRANSACTION,
        message: `Multiple DB operations found without transaction wrapper`,
        autoFixable: false
      });
    }
  }

  private generateReport(totalFiles: number): ComplianceReport {
    const violationsByType: Record<ViolationType, number> = {} as any;

    Object.values(ViolationType).forEach(type => {
      violationsByType[type] = this.violations.filter(v => v.type === type).length;
    });

    const violatedFiles = new Set(this.violations.map(v => v.file)).size;
    const compliancePercentage = ((totalFiles - violatedFiles) / totalFiles) * 100;

    return {
      totalFiles,
      scannedFiles: this.scannedFiles,
      violations: this.violations,
      compliancePercentage,
      violationsByType
    };
  }
}

// ============================================
// AUTO-FIXER
// ============================================

class AutoFixer {
  async fix(report: ComplianceReport): Promise<number> {
    const fixableViolations = report.violations.filter(v => v.autoFixable);
    let fixedCount = 0;

    console.log(`Auto-fixing ${fixableViolations.length} violations...`);

    // Group by file
    const violationsByFile = new Map<string, Violation[]>();
    fixableViolations.forEach(v => {
      if (!violationsByFile.has(v.file)) {
        violationsByFile.set(v.file, []);
      }
      violationsByFile.get(v.file)!.push(v);
    });

    // Fix each file
    for (const [file, violations] of violationsByFile) {
      try {
        let content = fs.readFileSync(file, 'utf8');

        violations.forEach(v => {
          if (v.oldPattern && v.newPattern) {
            content = content.replace(v.oldPattern, v.newPattern);
            fixedCount++;
          }
        });

        fs.writeFileSync(file, content, 'utf8');
        console.log(`✓ Fixed ${file}`);
      } catch (error) {
        console.error(`✗ Failed to fix ${file}:`, error);
      }
    }

    return fixedCount;
  }
}

// ============================================
// CHECKLIST GENERATOR
// ============================================

class ChecklistGenerator {
  generate(report: ComplianceReport): string {
    let markdown = '# Migration Checklist\n\n';
    markdown += `**Compliance:** ${report.compliancePercentage.toFixed(1)}%\n`;
    markdown += `**Target:** 90%\n\n`;

    markdown += '## Summary\n\n';
    markdown += `- Total files: ${report.totalFiles}\n`;
    markdown += `- Violations found: ${report.violations.length}\n`;
    markdown += `- Auto-fixable: ${report.violations.filter(v => v.autoFixable).length}\n`;
    markdown += `- Manual review required: ${report.violations.filter(v => !v.autoFixable).length}\n\n`;

    markdown += '## Violations by Type\n\n';
    Object.entries(report.violationsByType).forEach(([type, count]) => {
      if (count > 0) {
        markdown += `- **${type}**: ${count}\n`;
      }
    });

    markdown += '\n## Migration Tasks\n\n';

    // Group violations by file
    const violationsByFile = new Map<string, Violation[]>();
    report.violations.forEach(v => {
      if (!violationsByFile.has(v.file)) {
        violationsByFile.set(v.file, []);
      }
      violationsByFile.get(v.file)!.push(v);
    });

    violationsByFile.forEach((violations, file) => {
      markdown += `### ${file}\n\n`;

      violations.forEach(v => {
        const status = v.autoFixable ? '⚡ Auto-fixable' : '👤 Manual review';
        markdown += `- [ ] **Line ${v.line}** [${status}] - ${v.message}\n`;

        if (v.oldPattern && v.newPattern) {
          markdown += `  - Old: \`${v.oldPattern}\`\n`;
          markdown += `  - New: \`${v.newPattern}\`\n`;
        }
      });

      markdown += '\n';
    });

    return markdown;
  }
}

// ============================================
// CLI COMMANDS
// ============================================

async function scan() {
  console.log('🔍 Scanning codebase for standards violations...\n');

  const scanner = new MigrationScanner();
  const report = await scanner.scan();

  console.log('\n📊 Scan Results:');
  console.log(`  Total files: ${report.totalFiles}`);
  console.log(`  Violations: ${report.violations.length}`);
  console.log(`  Compliance: ${report.compliancePercentage.toFixed(1)}%`);
  console.log(`  Target: 90%\n`);

  if (report.compliancePercentage < 90) {
    console.log('❌ Below compliance target');
  } else {
    console.log('✅ Compliance target met');
  }

  console.log('\nViolations by type:');
  Object.entries(report.violationsByType).forEach(([type, count]) => {
    if (count > 0) {
      console.log(`  ${type}: ${count}`);
    }
  });

  return report;
}

async function fix() {
  console.log('🔧 Auto-fixing violations...\n');

  const scanner = new MigrationScanner();
  const report = await scanner.scan();

  const fixer = new AutoFixer();
  const fixedCount = await fixer.fix(report);

  console.log(`\n✅ Fixed ${fixedCount} violations`);
  console.log(`⚠️  Manual review required for ${report.violations.filter(v => !v.autoFixable).length} violations`);

  return fixedCount;
}

async function checklist() {
  console.log('📝 Generating migration checklist...\n');

  const scanner = new MigrationScanner();
  const report = await scanner.scan();

  const generator = new ChecklistGenerator();
  const markdown = generator.generate(report);

  const outputPath = 'MIGRATION_CHECKLIST.md';
  fs.writeFileSync(outputPath, markdown, 'utf8');

  console.log(`✅ Checklist saved to ${outputPath}`);
  console.log(`\nPreview:\n${markdown.substring(0, 500)}...\n`);

  return outputPath;
}

async function report() {
  console.log('📈 Generating compliance report...\n');

  const scanner = new MigrationScanner();
  const reportData = await scanner.scan();

  const reportPath = 'COMPLIANCE_REPORT.json';
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), 'utf8');

  console.log(`✅ Report saved to ${reportPath}`);

  // Print summary
  console.log('\n📊 Summary:');
  console.log(`  Compliance: ${reportData.compliancePercentage.toFixed(1)}%`);
  console.log(`  Status: ${reportData.compliancePercentage >= 90 ? '✅ PASS' : '❌ FAIL'}`);

  return reportPath;
}

// ============================================
// MAIN
// ============================================

async function main() {
  const command = process.argv[2] || 'scan';

  try {
    switch (command) {
      case 'scan':
        await scan();
        break;

      case 'fix':
        await fix();
        break;

      case 'checklist':
        await checklist();
        break;

      case 'report':
        await report();
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.log('Usage: migrate-to-standards.ts [scan|fix|checklist|report]');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { MigrationScanner, AutoFixer, ChecklistGenerator };
