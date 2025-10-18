#!/usr/bin/env node
/**
 * List TypeScript Error Files
 *
 * Analyzes TypeScript compilation output and generates a summary of files with errors.
 *
 * Usage:
 *   node scripts/list-typescript-errors.js [--format=json|csv|markdown]
 *   npm run build:types 2>&1 | node scripts/list-typescript-errors.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const format = args.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'markdown';
const outputFile = args.find(arg => arg.startsWith('--output='))?.split('=')[1];
const minErrors = parseInt(args.find(arg => arg.startsWith('--min-errors='))?.split('=')[1] || '0');

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

/**
 * Run TypeScript compiler and capture errors
 */
function getTypeScriptErrors() {
  try {
    // Run tsc and capture stderr (where errors go)
    execSync('npm run build:types 2>&1', {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024 // 50MB buffer
    });
    return '';
  } catch (error) {
    // tsc exits with error code when there are type errors
    return error.stdout || '';
  }
}

/**
 * Parse TypeScript error output
 */
function parseErrors(output) {
  const lines = output.split('\n');
  const fileErrors = new Map();
  const errorTypes = new Map();

  // Pattern: src/path/file.ts(123,45): error TS1234: Message
  const errorPattern = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.+)$/;

  for (const line of lines) {
    const match = line.match(errorPattern);
    if (match) {
      const [, filePath, lineNum, colNum, errorCode, message] = match;

      // Normalize file path
      const normalizedPath = filePath.replace(/\\/g, '/');

      // Track errors per file
      if (!fileErrors.has(normalizedPath)) {
        fileErrors.set(normalizedPath, []);
      }
      fileErrors.get(normalizedPath).push({
        line: parseInt(lineNum),
        column: parseInt(colNum),
        code: errorCode,
        message: message.trim()
      });

      // Track error types
      const count = errorTypes.get(errorCode) || 0;
      errorTypes.set(errorCode, count + 1);
    }
  }

  return { fileErrors, errorTypes };
}

/**
 * Categorize files by directory
 */
function categorizeFiles(fileErrors) {
  const categories = new Map();

  for (const [filePath] of fileErrors) {
    const parts = filePath.split('/');
    const category = parts.slice(0, 2).join('/'); // e.g., "src/agents"

    if (!categories.has(category)) {
      categories.set(category, []);
    }
    categories.get(category).push(filePath);
  }

  return categories;
}

/**
 * Generate Markdown report
 */
function generateMarkdown(fileErrors, errorTypes, categories) {
  let output = '# TypeScript Error Report\n\n';

  // Summary
  output += `## Summary\n\n`;
  output += `- **Total Files with Errors:** ${fileErrors.size}\n`;
  output += `- **Total Errors:** ${Array.from(fileErrors.values()).reduce((sum, errs) => sum + errs.length, 0)}\n`;
  output += `- **Unique Error Types:** ${errorTypes.size}\n\n`;

  // Top error types
  output += `## Top 20 Error Types\n\n`;
  output += `| Error Code | Count | Description |\n`;
  output += `|------------|-------|-------------|\n`;

  const sortedErrorTypes = Array.from(errorTypes.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  for (const [code, count] of sortedErrorTypes) {
    const description = getErrorDescription(code);
    output += `| ${code} | ${count} | ${description} |\n`;
  }
  output += '\n';

  // Files by category
  output += `## Files by Category\n\n`;

  const sortedCategories = Array.from(categories.entries())
    .sort((a, b) => b[1].length - a[1].length);

  for (const [category, files] of sortedCategories) {
    const totalErrors = files.reduce((sum, file) =>
      sum + fileErrors.get(file).length, 0
    );

    output += `### ${category} (${files.length} files, ${totalErrors} errors)\n\n`;

    const sortedFiles = files
      .map(file => ({ file, errors: fileErrors.get(file).length }))
      .sort((a, b) => b.errors - a.errors)
      .filter(item => item.errors >= minErrors);

    if (sortedFiles.length > 0) {
      output += `| File | Errors |\n`;
      output += `|------|--------|\n`;

      for (const { file, errors } of sortedFiles) {
        const fileName = file.split('/').pop();
        output += `| ${fileName} | ${errors} |\n`;
      }
      output += '\n';
    }
  }

  // Detailed file list
  output += `## All Files with Errors\n\n`;

  const sortedFiles = Array.from(fileErrors.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .filter(([, errors]) => errors.length >= minErrors);

  for (const [file, errors] of sortedFiles) {
    output += `### ${file} (${errors.length} errors)\n\n`;

    // Group errors by type
    const errorsByType = new Map();
    for (const error of errors) {
      const count = errorsByType.get(error.code) || 0;
      errorsByType.set(error.code, count + 1);
    }

    output += `**Error breakdown:**\n`;
    for (const [code, count] of Array.from(errorsByType.entries()).sort((a, b) => b[1] - a[1])) {
      output += `- ${code}: ${count}\n`;
    }
    output += '\n';
  }

  return output;
}

/**
 * Generate JSON report
 */
function generateJSON(fileErrors, errorTypes, categories) {
  const report = {
    summary: {
      totalFiles: fileErrors.size,
      totalErrors: Array.from(fileErrors.values()).reduce((sum, errs) => sum + errs.length, 0),
      uniqueErrorTypes: errorTypes.size
    },
    errorTypes: Object.fromEntries(
      Array.from(errorTypes.entries()).sort((a, b) => b[1] - a[1])
    ),
    categories: Object.fromEntries(
      Array.from(categories.entries()).map(([cat, files]) => [
        cat,
        {
          fileCount: files.length,
          errorCount: files.reduce((sum, file) => sum + fileErrors.get(file).length, 0),
          files: files.filter(file => fileErrors.get(file).length >= minErrors)
        }
      ])
    ),
    files: Object.fromEntries(
      Array.from(fileErrors.entries())
        .filter(([, errors]) => errors.length >= minErrors)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([file, errors]) => [
          file,
          {
            errorCount: errors.length,
            errors: errors.map(e => ({
              line: e.line,
              column: e.column,
              code: e.code,
              message: e.message
            }))
          }
        ])
    )
  };

  return JSON.stringify(report, null, 2);
}

/**
 * Generate CSV report
 */
function generateCSV(fileErrors, errorTypes) {
  let output = 'File,Line,Column,Error Code,Message\n';

  const sortedFiles = Array.from(fileErrors.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .filter(([, errors]) => errors.length >= minErrors);

  for (const [file, errors] of sortedFiles) {
    for (const error of errors) {
      const message = error.message.replace(/"/g, '""'); // Escape quotes
      output += `"${file}",${error.line},${error.column},${error.code},"${message}"\n`;
    }
  }

  return output;
}

/**
 * Get human-readable error description
 */
function getErrorDescription(code) {
  const descriptions = {
    'TS2307': 'Cannot find module',
    'TS2345': 'Argument type mismatch',
    'TS2532': 'Object is possibly undefined',
    'TS18048': 'Value is possibly undefined',
    'TS6133': 'Unused variable',
    'TS7016': 'Missing type declarations',
    'TS7006': 'Implicit any type',
    'TS2835': 'Missing .js extension',
    'TS2834': 'Missing file extension',
    'TS2322': 'Type assignment error',
    'TS6196': 'Declared but never used',
    'TS2304': 'Cannot find name',
    'TS2339': 'Property does not exist',
    'TS2769': 'No overload matches',
    'TS2571': 'Object is of type unknown',
    'TS2554': 'Expected N arguments',
    'TS2740': 'Missing properties',
    'TS2741': 'Missing properties in type'
  };

  return descriptions[code] || 'TypeScript error';
}

/**
 * Main execution
 */
function main() {
  console.error(`${colors.cyan}Analyzing TypeScript errors...${colors.reset}\n`);

  // Get TypeScript errors
  const output = getTypeScriptErrors();

  // Parse errors
  const { fileErrors, errorTypes } = parseErrors(output);

  if (fileErrors.size === 0) {
    console.log(`${colors.green}✅ No TypeScript errors found!${colors.reset}`);
    return;
  }

  // Categorize files
  const categories = categorizeFiles(fileErrors);

  // Generate report in requested format
  let report;
  switch (format) {
    case 'json':
      report = generateJSON(fileErrors, errorTypes, categories);
      break;
    case 'csv':
      report = generateCSV(fileErrors, errorTypes);
      break;
    case 'markdown':
    default:
      report = generateMarkdown(fileErrors, errorTypes, categories);
      break;
  }

  // Output report
  if (outputFile) {
    fs.writeFileSync(outputFile, report);
    console.error(`${colors.green}✅ Report written to: ${outputFile}${colors.reset}`);
  } else {
    console.log(report);
  }

  // Print summary to stderr
  const totalErrors = Array.from(fileErrors.values()).reduce((sum, errs) => sum + errs.length, 0);
  console.error(`\n${colors.yellow}Summary:${colors.reset}`);
  console.error(`  Files with errors: ${colors.red}${fileErrors.size}${colors.reset}`);
  console.error(`  Total errors: ${colors.red}${totalErrors}${colors.reset}`);
  console.error(`  Error types: ${errorTypes.size}`);
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { parseErrors, categorizeFiles, generateMarkdown, generateJSON, generateCSV };
