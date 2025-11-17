#!/usr/bin/env node
/**
 * Validate All Skills
 *
 * Scans all skill files in .claude/skills/ and validates them against
 * the skill markdown schema (v1.0).
 *
 * Usage:
 *   npm run validate-skills                 # Validate all skills
 *   npm run validate-skills -- --fix        # Auto-fix simple violations
 *   npm run validate-skills -- --report=json  # JSON output
 *   npm run validate-skills -- --report=html  # HTML report
 *
 * Exit Codes:
 *   0 - All skills valid
 *   1 - Validation failures found
 *
 * @see schemas/skill-markdown-v1.schema.json
 * @see docs/SKILL_MARKDOWN_FORMAT_SPECIFICATION.md
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import chalk from 'chalk';

// ============================================================================
// Types and Interfaces
// ============================================================================

interface SkillFrontmatter {
  name: string;
  version: string;
  category: string;
  status: 'active' | 'deprecated' | 'experimental';
  author?: string;
  tags?: string[];
  dependencies?: string[];
  deprecated_by?: string;
}

interface SkillSections {
  overview?: string;
  usage?: string;
  examples?: string;
  implementation?: string;
  testing?: string;
  troubleshooting?: string;
  migration?: string;
}

interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  sections: SkillSections;
  rawContent: string;
}

interface ValidationError {
  type: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  suggestion?: string;
}

interface ValidationResult {
  file: string;
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  fixed: boolean;
  fixedIssues?: string[];
}

interface ComplianceReport {
  totalSkills: number;
  validSkills: number;
  invalidSkills: number;
  compliancePercentage: number;
  commonIssues: Record<string, number>;
  results: ValidationResult[];
  migrationNeeded: Array<{
    file: string;
    issues: string[];
    priority: 'high' | 'medium' | 'low';
  }>;
  timestamp: string;
  generatedBy: string;
}

interface CLIOptions {
  fix: boolean;
  report: 'text' | 'json' | 'html';
  skillPath?: string;
}

// ============================================================================
// Constants
// ============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(PROJECT_ROOT, 'schemas/skill-markdown-v1.schema.json');
const SKILLS_DIR = path.join(PROJECT_ROOT, '.claude/skills');
const REQUIRED_SECTIONS = ['overview', 'usage', 'examples', 'implementation', 'testing'];

// ============================================================================
// Parsing Functions
// ============================================================================

function parseSkillMarkdown(content: string, filePath: string): ParsedSkill {
  // Extract frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
  if (!frontmatterMatch) {
    throw new Error('No frontmatter found');
  }

  let frontmatter: SkillFrontmatter;
  try {
    frontmatter = yaml.load(frontmatterMatch[1]) as SkillFrontmatter;
  } catch (error) {
    throw new Error(`Invalid YAML frontmatter: ${(error as Error).message}`);
  }

  // Extract sections
  const sections: SkillSections = {};

  // Helper to extract section content
  const extractSection = (sectionName: string): string | undefined => {
    const regex = new RegExp(
      `##\\s+${sectionName}\\s*\\n([\\s\\S]+?)(?=\\n##\\s|\\n#\\s|$)`,
      'i'
    );
    const match = content.match(regex);
    return match ? match[1].trim() : undefined;
  };

  sections.overview = extractSection('Overview');
  sections.usage = extractSection('Usage');
  sections.examples = extractSection('Examples?'); // Allow singular or plural
  sections.implementation = extractSection('Implementation');
  sections.testing = extractSection('Testing');
  sections.troubleshooting = extractSection('Troubleshooting');
  sections.migration = extractSection('Migration');

  return {
    frontmatter,
    sections,
    rawContent: content
  };
}

// ============================================================================
// Validation Functions
// ============================================================================

function validateFrontmatter(
  frontmatter: SkillFrontmatter,
  filePath: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Required fields
  if (!frontmatter.name) {
    errors.push({
      type: 'missing_frontmatter_field',
      severity: 'error',
      message: 'Missing required field: name',
      suggestion: 'Add "name: your-skill-name" to frontmatter'
    });
  }

  if (!frontmatter.version) {
    errors.push({
      type: 'missing_frontmatter_field',
      severity: 'error',
      message: 'Missing required field: version',
      suggestion: 'Add "version: 1.0.0" to frontmatter'
    });
  }

  if (!frontmatter.category) {
    errors.push({
      type: 'missing_frontmatter_field',
      severity: 'error',
      message: 'Missing required field: category',
      suggestion: 'Add "category: appropriate-category" to frontmatter'
    });
  }

  if (!frontmatter.status) {
    errors.push({
      type: 'missing_frontmatter_field',
      severity: 'error',
      message: 'Missing required field: status',
      suggestion: 'Add "status: active" to frontmatter'
    });
  }

  // Validate name format (kebab-case)
  if (frontmatter.name && !/^[a-z0-9-]+$/.test(frontmatter.name)) {
    errors.push({
      type: 'invalid_name_format',
      severity: 'error',
      message: `Invalid name format: "${frontmatter.name}". Must be kebab-case (lowercase with hyphens)`,
      suggestion: `Change to: ${frontmatter.name.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`
    });
  }

  // Validate version format (semver)
  if (frontmatter.version && !/^\d+\.\d+\.\d+$/.test(frontmatter.version)) {
    errors.push({
      type: 'invalid_version',
      severity: 'error',
      message: `Invalid version format: "${frontmatter.version}". Must follow semver (MAJOR.MINOR.PATCH)`,
      suggestion: 'Use format like "1.0.0"'
    });
  }

  // Validate status enum
  const validStatuses = ['active', 'deprecated', 'experimental'];
  if (frontmatter.status && !validStatuses.includes(frontmatter.status)) {
    errors.push({
      type: 'invalid_status',
      severity: 'error',
      message: `Invalid status: "${frontmatter.status}". Must be one of: ${validStatuses.join(', ')}`,
      suggestion: 'Use "active", "deprecated", or "experimental"'
    });
  }

  // Validate tags format
  if (frontmatter.tags) {
    if (!Array.isArray(frontmatter.tags)) {
      errors.push({
        type: 'invalid_tags_format',
        severity: 'error',
        message: 'Tags must be an array',
        suggestion: 'Use format: tags: [tag1, tag2]'
      });
    } else {
      frontmatter.tags.forEach((tag, index) => {
        if (!/^[a-z0-9-]+$/.test(tag)) {
          errors.push({
            type: 'invalid_tag_format',
            severity: 'warning',
            message: `Invalid tag format: "${tag}". Tags should be kebab-case`,
            suggestion: `tags[${index}]: ${tag.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`
          });
        }
      });

      // Check for duplicate tags
      const uniqueTags = new Set(frontmatter.tags);
      if (uniqueTags.size !== frontmatter.tags.length) {
        errors.push({
          type: 'duplicate_tags',
          severity: 'warning',
          message: 'Duplicate tags found',
          suggestion: 'Remove duplicate tags'
        });
      }
    }
  }

  return errors;
}

function validateSections(sections: SkillSections, filePath: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check required sections
  REQUIRED_SECTIONS.forEach(sectionName => {
    const sectionContent = sections[sectionName as keyof SkillSections];

    if (!sectionContent) {
      errors.push({
        type: 'missing_section',
        severity: 'error',
        message: `Missing required section: ${sectionName}`,
        suggestion: `Add ## ${sectionName.charAt(0).toUpperCase() + sectionName.slice(1)} section`
      });
    } else if (sectionContent.length < 10) {
      errors.push({
        type: 'section_too_short',
        severity: 'warning',
        message: `Section "${sectionName}" is too short (${sectionContent.length} characters, minimum 10)`,
        suggestion: 'Add more content to this section'
      });
    }
  });

  return errors;
}

function validateCodeBlocks(content: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = content.split('\n');

  let inBlock = false;
  let blockStartLine = 0;

  lines.forEach((line, index) => {
    if (line.startsWith('```')) {
      if (!inBlock) {
        // Starting a code block
        inBlock = true;
        blockStartLine = index + 1;

        // Check if language specified (anything after ```)
        const language = line.substring(3).trim();
        if (!language) {
          errors.push({
            type: 'code_block_no_language',
            severity: 'warning',
            message: 'Code block without language specifier',
            line: blockStartLine,
            suggestion: 'Add language after ``` (e.g., ```bash)'
          });
        }
      } else {
        // Ending a code block
        inBlock = false;
      }
    }
  });

  return errors;
}

function validateHeadingHierarchy(content: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const lines = content.split('\n');

  let prevLevel = 0;
  lines.forEach((line, index) => {
    const headingMatch = line.match(/^(#+)\s/);
    if (headingMatch) {
      const level = headingMatch[1].length;

      // Check for skipped levels (e.g., h1 -> h3)
      if (level > prevLevel + 1) {
        errors.push({
          type: 'invalid_heading_hierarchy',
          severity: 'warning',
          message: `Heading hierarchy skip: h${prevLevel} to h${level}`,
          line: index + 1,
          suggestion: `Use h${prevLevel + 1} instead of h${level}`
        });
      }

      prevLevel = level;
    }
  });

  return errors;
}

function validateInternalLinks(content: string, skillsDir: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkPattern.exec(content)) !== null) {
    const linkPath = match[2];

    // Only check internal links (not http/https/mailto/etc)
    if (
      !linkPath.startsWith('http://') &&
      !linkPath.startsWith('https://') &&
      !linkPath.startsWith('mailto:') &&
      !linkPath.startsWith('#')
    ) {
      // Resolve relative path
      const absolutePath = path.resolve(skillsDir, linkPath);
      if (!fs.existsSync(absolutePath)) {
        const lines = content.substring(0, match.index).split('\n');
        errors.push({
          type: 'broken_link',
          severity: 'warning',
          message: `Broken internal link: ${linkPath}`,
          line: lines.length,
          suggestion: 'Fix the link path or remove it'
        });
      }
    }
  }

  return errors;
}

// ============================================================================
// Auto-Fix Functions
// ============================================================================

function autoFixSkill(content: string, errors: ValidationError[]): {
  fixed: string;
  fixedIssues: string[];
} {
  let fixed = content;
  const fixedIssues: string[] = [];

  // Fix code blocks without language specifiers
  errors.forEach(error => {
    if (error.type === 'code_block_no_language') {
      // Add 'bash' as default language for unlabeled blocks
      fixed = fixed.replace(/\n```\n/g, '\n```bash\n');
      fixedIssues.push('Added language specifiers to code blocks');
    }
  });

  // Normalize line endings to LF
  if (fixed.includes('\r\n')) {
    fixed = fixed.replace(/\r\n/g, '\n');
    fixedIssues.push('Normalized line endings to LF');
  }

  // Remove trailing whitespace
  const linesWithTrailingSpace = fixed.split('\n').filter(line => /\s+$/.test(line)).length;
  if (linesWithTrailingSpace > 0) {
    fixed = fixed.split('\n').map(line => line.replace(/\s+$/, '')).join('\n');
    fixedIssues.push(`Removed trailing whitespace from ${linesWithTrailingSpace} lines`);
  }

  return { fixed, fixedIssues: Array.from(new Set(fixedIssues)) };
}

// ============================================================================
// Validation Orchestration
// ============================================================================

async function validateSkill(
  filePath: string,
  options: CLIOptions
): Promise<ValidationResult> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  try {
    // Parse skill
    const parsed = parseSkillMarkdown(content, filePath);

    // Validate frontmatter
    const frontmatterErrors = validateFrontmatter(parsed.frontmatter, filePath);
    frontmatterErrors.forEach(err => {
      if (err.severity === 'error') {
        errors.push(err);
      } else {
        warnings.push(err);
      }
    });

    // Validate sections
    const sectionErrors = validateSections(parsed.sections, filePath);
    sectionErrors.forEach(err => {
      if (err.severity === 'error') {
        errors.push(err);
      } else {
        warnings.push(err);
      }
    });

    // Validate code blocks
    const codeBlockErrors = validateCodeBlocks(content);
    warnings.push(...codeBlockErrors);

    // Validate heading hierarchy
    const headingErrors = validateHeadingHierarchy(content);
    warnings.push(...headingErrors);

    // Validate internal links
    const linkErrors = validateInternalLinks(content, path.dirname(filePath));
    warnings.push(...linkErrors);

  } catch (error) {
    errors.push({
      type: 'parse_error',
      severity: 'error',
      message: (error as Error).message,
      suggestion: 'Fix syntax errors in the skill file'
    });
  }

  // Auto-fix if requested
  let fixed = false;
  let fixedIssues: string[] = [];

  if (options.fix && warnings.length > 0) {
    const result = autoFixSkill(content, warnings);
    if (result.fixedIssues.length > 0) {
      fs.writeFileSync(filePath, result.fixed, 'utf-8');
      fixed = true;
      fixedIssues = result.fixedIssues;
    }
  }

  return {
    file: filePath,
    valid: errors.length === 0,
    errors,
    warnings,
    fixed,
    fixedIssues
  };
}

async function validateAllSkills(options: CLIOptions): Promise<ComplianceReport> {
  const pattern = options.skillPath || `${SKILLS_DIR}/*/SKILL.md`;
  const skillFiles = await glob(pattern);

  console.log(chalk.blue(`\nValidating ${skillFiles.length} skill files...\n`));

  const results: ValidationResult[] = [];
  const commonIssues: Record<string, number> = {};

  for (const file of skillFiles) {
    const result = await validateSkill(file, options);
    results.push(result);

    // Count common issues
    [...result.errors, ...result.warnings].forEach(issue => {
      commonIssues[issue.type] = (commonIssues[issue.type] || 0) + 1;
    });
  }

  const validSkills = results.filter(r => r.valid).length;
  const invalidSkills = results.length - validSkills;
  const compliancePercentage = (validSkills / results.length) * 100;

  // Identify skills needing migration
  const migrationNeeded = results
    .filter(r => !r.valid)
    .map(r => {
      const highPriorityTypes = ['missing_frontmatter', 'missing_section', 'invalid_version'];
      const mediumPriorityTypes = ['invalid_name_format', 'invalid_status'];

      const hasHighPriority = r.errors.some(e => highPriorityTypes.includes(e.type));
      const hasMediumPriority = r.errors.some(e => mediumPriorityTypes.includes(e.type));

      return {
        file: r.file,
        issues: r.errors.map(e => e.message),
        priority: hasHighPriority ? 'high' as const : hasMediumPriority ? 'medium' as const : 'low' as const
      };
    });

  return {
    totalSkills: results.length,
    validSkills,
    invalidSkills,
    compliancePercentage,
    commonIssues,
    results,
    migrationNeeded,
    timestamp: new Date().toISOString(),
    generatedBy: 'validate-all-skills v1.0.0'
  };
}

// ============================================================================
// Reporting Functions
// ============================================================================

function printTextReport(report: ComplianceReport): void {
  console.log(chalk.bold('\n' + '='.repeat(70)));
  console.log(chalk.bold.cyan('  SKILL VALIDATION REPORT'));
  console.log(chalk.bold('='.repeat(70) + '\n'));

  // Summary
  console.log(chalk.bold('Summary:'));
  console.log(`  Total Skills: ${report.totalSkills}`);
  console.log(`  Valid Skills: ${chalk.green(report.validSkills)}`);
  console.log(`  Invalid Skills: ${chalk.red(report.invalidSkills)}`);
  console.log(`  Compliance: ${report.compliancePercentage.toFixed(1)}%\n`);

  // Common Issues
  if (Object.keys(report.commonIssues).length > 0) {
    console.log(chalk.bold('Common Issues:'));
    Object.entries(report.commonIssues)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([issue, count]) => {
        console.log(`  ${chalk.yellow(issue)}: ${count}`);
      });
    console.log('');
  }

  // Invalid Skills Details
  const invalidResults = report.results.filter(r => !r.valid);
  if (invalidResults.length > 0) {
    console.log(chalk.bold.red(`\nInvalid Skills (${invalidResults.length}):\n`));

    invalidResults.slice(0, 20).forEach(result => {
      const skillName = path.basename(path.dirname(result.file));
      console.log(chalk.bold(`  ${skillName}:`));

      result.errors.forEach(error => {
        console.log(chalk.red(`    ✗ ${error.message}`));
        if (error.suggestion) {
          console.log(chalk.dim(`      Suggestion: ${error.suggestion}`));
        }
      });

      if (result.warnings.length > 0 && result.warnings.length <= 3) {
        result.warnings.forEach(warning => {
          console.log(chalk.yellow(`    ⚠ ${warning.message}`));
        });
      } else if (result.warnings.length > 3) {
        console.log(chalk.yellow(`    ⚠ ${result.warnings.length} warnings`));
      }

      console.log('');
    });

    if (invalidResults.length > 20) {
      console.log(chalk.dim(`  ... and ${invalidResults.length - 20} more\n`));
    }
  }

  // Migration Needed
  if (report.migrationNeeded.length > 0) {
    console.log(chalk.bold.yellow(`\nMigration Needed (${report.migrationNeeded.length}):\n`));

    const highPriority = report.migrationNeeded.filter(m => m.priority === 'high');
    const mediumPriority = report.migrationNeeded.filter(m => m.priority === 'medium');

    if (highPriority.length > 0) {
      console.log(chalk.red.bold('  High Priority:'));
      highPriority.slice(0, 5).forEach(m => {
        const skillName = path.basename(path.dirname(m.file));
        console.log(`    ${skillName}: ${m.issues.join(', ')}`);
      });
      console.log('');
    }

    if (mediumPriority.length > 0) {
      console.log(chalk.yellow.bold('  Medium Priority:'));
      mediumPriority.slice(0, 5).forEach(m => {
        const skillName = path.basename(path.dirname(m.file));
        console.log(`    ${skillName}: ${m.issues.join(', ')}`);
      });
      console.log('');
    }
  }

  // Success
  if (report.validSkills === report.totalSkills) {
    console.log(chalk.green.bold('✅ All skills are valid!\n'));
  } else {
    console.log(chalk.yellow.bold(`⚠️  ${report.invalidSkills} skill(s) need attention\n`));
  }

  console.log(chalk.dim(`Generated: ${report.timestamp}`));
  console.log(chalk.dim(`By: ${report.generatedBy}\n`));
}

function writeJsonReport(report: ComplianceReport, outputPath: string): void {
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(chalk.green(`\n✅ JSON report written to: ${outputPath}\n`));
}

function writeHtmlReport(report: ComplianceReport, outputPath: string): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Skill Validation Report</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 20px; background: #f5f5f5; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
    .summary { display: flex; gap: 20px; margin: 20px 0; }
    .stat { flex: 1; padding: 20px; background: #f9f9f9; border-radius: 4px; text-align: center; }
    .stat .number { font-size: 2em; font-weight: bold; }
    .stat.valid .number { color: #4CAF50; }
    .stat.invalid .number { color: #f44336; }
    .stat.compliance .number { color: #2196F3; }
    .issues { margin: 20px 0; }
    .issue { margin: 10px 0; padding: 10px; background: #fff3cd; border-left: 4px solid #ffc107; }
    .error { background: #f8d7da; border-color: #f44336; }
    .warning { background: #fff3cd; border-color: #ffc107; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background: #4CAF50; color: white; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Skill Validation Report</h1>

    <div class="summary">
      <div class="stat">
        <div class="label">Total Skills</div>
        <div class="number">${report.totalSkills}</div>
      </div>
      <div class="stat valid">
        <div class="label">Valid Skills</div>
        <div class="number">${report.validSkills}</div>
      </div>
      <div class="stat invalid">
        <div class="label">Invalid Skills</div>
        <div class="number">${report.invalidSkills}</div>
      </div>
      <div class="stat compliance">
        <div class="label">Compliance</div>
        <div class="number">${report.compliancePercentage.toFixed(1)}%</div>
      </div>
    </div>

    <h2>Common Issues</h2>
    <table>
      <tr><th>Issue Type</th><th>Count</th></tr>
      ${Object.entries(report.commonIssues)
        .sort((a, b) => b[1] - a[1])
        .map(([issue, count]) => `<tr><td>${issue}</td><td>${count}</td></tr>`)
        .join('')}
    </table>

    ${
      report.invalidSkills > 0
        ? `
    <h2>Invalid Skills</h2>
    ${report.results
      .filter(r => !r.valid)
      .map(
        r => `
      <div class="issue error">
        <strong>${path.basename(path.dirname(r.file))}</strong>
        <ul>
          ${r.errors.map(e => `<li>${e.message}</li>`).join('')}
        </ul>
      </div>
    `
      )
      .join('')}
    `
        : '<h2>✅ All Skills Valid</h2>'
    }

    <div class="footer">
      <p>Generated: ${report.timestamp}</p>
      <p>By: ${report.generatedBy}</p>
    </div>
  </div>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf-8');
  console.log(chalk.green(`\n✅ HTML report written to: ${outputPath}\n`));
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  const options: CLIOptions = {
    fix: args.includes('--fix'),
    report: args.includes('--report=json')
      ? 'json'
      : args.includes('--report=html')
      ? 'html'
      : 'text',
    skillPath: args.find(arg => !arg.startsWith('--'))
  };

  console.log(chalk.cyan.bold('\n🔍 CFN Skill Validator v1.0.0\n'));

  // Validate all skills
  const report = await validateAllSkills(options);

  // Generate report
  if (options.report === 'json') {
    const outputPath = path.join(PROJECT_ROOT, 'skill-compliance-report.json');
    writeJsonReport(report, outputPath);
  } else if (options.report === 'html') {
    const outputPath = path.join(PROJECT_ROOT, 'skill-compliance-report.html');
    writeHtmlReport(report, outputPath);
  } else {
    printTextReport(report);
  }

  // Exit code
  process.exit(report.invalidSkills > 0 ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('\n❌ Error:'), error.message);
    process.exit(1);
  });
}

// Export for testing
export { validateSkill, validateAllSkills, parseSkillMarkdown };
