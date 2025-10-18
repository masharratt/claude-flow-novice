#!/usr/bin/env node

/**
 * Path Update Automation Script
 *
 * Automated search/replace path updates with validation and safety features.
 * Supports JSON, YAML, JavaScript, and Markdown files with syntax validation.
 *
 * Features:
 * - Regex pattern-based path updates
 * - JSON/YAML/JavaScript syntax validation after updates
 * - Backup creation before modifications
 * - Dry-run mode
 * - File type filtering
 * - Pattern configuration via JSON file or CLI args
 * - Detailed change reporting
 *
 * Usage:
 *   node scripts/migration/update-paths.js --pattern "node test-" --replacement "node tests/manual/test-" --types yml,json,js,md
 *   node scripts/migration/update-paths.js --config patterns.json --dry-run
 *   node scripts/migration/update-paths.js --pattern "\.claude-flow-novice/dist" --replacement "dist/" --regex
 *
 * @module scripts/migration/update-paths
 */

import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import yaml from 'yaml';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

/**
 * Validates JSON syntax by attempting to parse
 * @param {string} content - File content to validate
 * @returns {Object} Validation result with success flag and error if any
 */
function validateJSON(content) {
  try {
    JSON.parse(content);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Validates YAML syntax by attempting to parse
 * @param {string} content - File content to validate
 * @returns {Object} Validation result with success flag and error if any
 */
function validateYAML(content) {
  try {
    yaml.parse(content);
    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Validates JavaScript syntax using basic checks
 * Full AST parsing would require additional dependencies
 * @param {string} content - File content to validate
 * @returns {Object} Validation result with success flag and error if any
 */
function validateJavaScript(content) {
  try {
    // Basic syntax validation - check for common syntax errors
    // This is a simplified check - full AST parsing would be more comprehensive

    // Check for balanced braces/brackets/parentheses
    const braceBalance = (content.match(/\{/g) || []).length - (content.match(/\}/g) || []).length;
    const bracketBalance = (content.match(/\[/g) || []).length - (content.match(/\]/g) || []).length;
    const parenBalance = (content.match(/\(/g) || []).length - (content.match(/\)/g) || []).length;

    if (braceBalance !== 0) {
      return { valid: false, error: 'Unbalanced curly braces' };
    }
    if (bracketBalance !== 0) {
      return { valid: false, error: 'Unbalanced square brackets' };
    }
    if (parenBalance !== 0) {
      return { valid: false, error: 'Unbalanced parentheses' };
    }

    // Try to use Function constructor for basic syntax check (not executed)
    // This is a limited check but catches many syntax errors
    try {
      new Function(content);
    } catch (error) {
      // Function constructor error indicates syntax issue
      return { valid: false, error: error.message };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Validates Markdown syntax (basic structure check)
 * @param {string} content - File content to validate
 * @returns {Object} Validation result with success flag and error if any
 */
function validateMarkdown(content) {
  // Markdown is more forgiving, but we can check for common issues
  try {
    // Check for balanced code fences
    const codeFences = (content.match(/```/g) || []).length;
    if (codeFences % 2 !== 0) {
      return { valid: false, error: 'Unbalanced code fences (```)' };
    }

    // Check for balanced inline code
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip code fence lines
      if (line.trim().startsWith('```')) continue;

      const backticks = (line.match(/`/g) || []).length;
      if (backticks % 2 !== 0) {
        return { valid: false, error: `Unbalanced backticks on line ${i + 1}` };
      }
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Get validator function based on file extension
 * @param {string} filePath - Path to file
 * @returns {Function|null} Validator function or null if no validator
 */
function getValidator(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  const validators = {
    '.json': validateJSON,
    '.yml': validateYAML,
    '.yaml': validateYAML,
    '.js': validateJavaScript,
    '.mjs': validateJavaScript,
    '.cjs': validateJavaScript,
    '.md': validateMarkdown
  };

  return validators[ext] || null;
}

/**
 * Create backup of file before modification
 * @param {string} filePath - Path to file to backup
 * @returns {Promise<string>} Path to backup file
 */
async function createBackup(filePath) {
  const backupPath = `${filePath}.backup-${Date.now()}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

/**
 * Apply pattern replacement to file content
 * @param {string} content - Original file content
 * @param {Object} pattern - Pattern configuration
 * @param {boolean} isRegex - Whether pattern is regex
 * @returns {Object} Result with updated content and match count
 */
function applyPattern(content, pattern, isRegex = false) {
  let updatedContent;
  let matchCount = 0;

  if (isRegex) {
    // Use regex pattern
    const regex = new RegExp(pattern.pattern, 'g');
    const matches = content.match(regex);
    matchCount = matches ? matches.length : 0;
    updatedContent = content.replace(regex, pattern.replacement);
  } else {
    // Use string literal pattern
    const parts = content.split(pattern.pattern);
    matchCount = parts.length - 1;
    updatedContent = parts.join(pattern.replacement);
  }

  return {
    content: updatedContent,
    matchCount,
    changed: matchCount > 0
  };
}

/**
 * Process a single file with pattern updates
 * @param {string} filePath - Path to file to process
 * @param {Array<Object>} patterns - Array of pattern configurations
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processing result
 */
async function processFile(filePath, patterns, options = {}) {
  const { dryRun = false, createBackups = true, verbose = false } = options;

  try {
    // Read original content
    const originalContent = await fs.readFile(filePath, 'utf8');
    let currentContent = originalContent;

    const changes = [];
    let totalMatches = 0;

    // Apply all patterns
    for (const pattern of patterns) {
      const result = applyPattern(currentContent, pattern, options.regex);

      if (result.changed) {
        changes.push({
          pattern: pattern.pattern,
          replacement: pattern.replacement,
          matches: result.matchCount
        });
        totalMatches += result.matchCount;
        currentContent = result.content;
      }
    }

    // If no changes, return early
    if (totalMatches === 0) {
      return {
        filePath,
        processed: true,
        changed: false,
        changes: [],
        validated: true
      };
    }

    // Validate updated content
    const validator = getValidator(filePath);
    let validationResult = { valid: true };

    if (validator) {
      validationResult = validator(currentContent);

      if (!validationResult.valid) {
        return {
          filePath,
          processed: false,
          changed: false,
          changes,
          validated: false,
          error: `Validation failed: ${validationResult.error}`,
          totalMatches
        };
      }
    }

    // Create backup and write updated content (unless dry-run)
    if (!dryRun) {
      if (createBackups) {
        const backupPath = await createBackup(filePath);
        if (verbose) {
          console.log(`${colors.cyan}Backup created: ${backupPath}${colors.reset}`);
        }
      }

      await fs.writeFile(filePath, currentContent, 'utf8');
    }

    return {
      filePath,
      processed: true,
      changed: true,
      changes,
      validated: validationResult.valid,
      totalMatches,
      dryRun
    };

  } catch (error) {
    return {
      filePath,
      processed: false,
      changed: false,
      error: error.message
    };
  }
}

/**
 * Find files matching type filters
 * @param {Array<string>} types - File extensions to include
 * @param {string} basePath - Base directory to search
 * @returns {Promise<Array<string>>} Array of matching file paths
 */
async function findFiles(types, basePath = process.cwd()) {
  const patterns = types.map(type => {
    const ext = type.startsWith('.') ? type : `.${type}`;
    return `**/*${ext}`;
  });

  const allFiles = [];

  for (const pattern of patterns) {
    const files = await glob(pattern, {
      cwd: basePath,
      absolute: true,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/.claude-flow-novice/**',
        '**/backup-*/**',
        '**/*.backup-*'
      ]
    });
    allFiles.push(...files);
  }

  // Remove duplicates
  return [...new Set(allFiles)];
}

/**
 * Generate detailed report of changes
 * @param {Array<Object>} results - Processing results
 * @param {boolean} dryRun - Whether this was a dry run
 */
function generateReport(results, dryRun = false) {
  const processed = results.filter(r => r.processed);
  const changed = results.filter(r => r.changed);
  const errors = results.filter(r => r.error);
  const validationErrors = results.filter(r => !r.validated);

  console.log(`\n${colors.bright}${colors.blue}=== Path Update Report ===${colors.reset}\n`);

  if (dryRun) {
    console.log(`${colors.yellow}${colors.bright}DRY RUN MODE - No files were modified${colors.reset}\n`);
  }

  console.log(`${colors.bright}Summary:${colors.reset}`);
  console.log(`  Total files processed: ${processed.length}`);
  console.log(`  Files with changes: ${changed.length}`);
  console.log(`  Files with errors: ${errors.length}`);
  console.log(`  Validation failures: ${validationErrors.length}`);

  if (changed.length > 0) {
    console.log(`\n${colors.bright}${colors.green}Changed Files:${colors.reset}`);
    changed.forEach(result => {
      console.log(`\n  ${colors.cyan}${result.filePath}${colors.reset}`);
      console.log(`    Total matches: ${result.totalMatches}`);
      result.changes.forEach(change => {
        console.log(`    - "${change.pattern}" → "${change.replacement}" (${change.matches} matches)`);
      });
    });
  }

  if (errors.length > 0) {
    console.log(`\n${colors.bright}${colors.red}Errors:${colors.reset}`);
    errors.forEach(result => {
      console.log(`  ${colors.red}${result.filePath}${colors.reset}`);
      console.log(`    ${result.error}`);
    });
  }

  if (validationErrors.length > 0) {
    console.log(`\n${colors.bright}${colors.yellow}Validation Failures:${colors.reset}`);
    validationErrors.forEach(result => {
      console.log(`  ${colors.yellow}${result.filePath}${colors.reset}`);
      console.log(`    ${result.error}`);
    });
  }

  console.log('');
}

/**
 * Parse command line arguments
 * @param {Array<string>} argv - Command line arguments
 * @returns {Object} Parsed options
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {
    patterns: [],
    types: ['yml', 'yaml', 'json', 'js', 'mjs', 'cjs', 'md'],
    dryRun: false,
    regex: false,
    verbose: false,
    configFile: null,
    createBackups: true
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--pattern':
      case '-p':
        if (i + 1 < args.length) {
          options.patternString = args[++i];
        }
        break;

      case '--replacement':
      case '-r':
        if (i + 1 < args.length) {
          options.replacementString = args[++i];
        }
        break;

      case '--config':
      case '-c':
        if (i + 1 < args.length) {
          options.configFile = args[++i];
        }
        break;

      case '--types':
      case '-t':
        if (i + 1 < args.length) {
          options.types = args[++i].split(',').map(t => t.trim());
        }
        break;

      case '--dry-run':
      case '-d':
        options.dryRun = true;
        break;

      case '--regex':
        options.regex = true;
        break;

      case '--verbose':
      case '-v':
        options.verbose = true;
        break;

      case '--no-backup':
        options.createBackups = false;
        break;

      case '--help':
      case '-h':
        options.showHelp = true;
        break;
    }
  }

  // Build patterns array
  if (options.patternString && options.replacementString) {
    options.patterns.push({
      pattern: options.patternString,
      replacement: options.replacementString
    });
  }

  return options;
}

/**
 * Load patterns from configuration file
 * @param {string} configPath - Path to config file
 * @returns {Promise<Array<Object>>} Array of pattern configurations
 */
async function loadConfig(configPath) {
  try {
    const content = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(content);

    if (!Array.isArray(config.patterns)) {
      throw new Error('Config file must contain a "patterns" array');
    }

    return config.patterns;
  } catch (error) {
    throw new Error(`Failed to load config file: ${error.message}`);
  }
}

/**
 * Display help message
 */
function showHelp() {
  console.log(`
${colors.bright}${colors.blue}Path Update Automation Script${colors.reset}

${colors.bright}Usage:${colors.reset}
  node scripts/migration/update-paths.js [options]

${colors.bright}Options:${colors.reset}
  -p, --pattern <pattern>         Search pattern (string or regex)
  -r, --replacement <replacement> Replacement string
  -c, --config <file>            Load patterns from JSON config file
  -t, --types <types>            Comma-separated file types (default: yml,yaml,json,js,mjs,cjs,md)
  -d, --dry-run                  Preview changes without modifying files
  --regex                        Treat pattern as regex
  -v, --verbose                  Verbose output
  --no-backup                    Skip backup creation
  -h, --help                     Show this help message

${colors.bright}Examples:${colors.reset}
  # Simple string replacement
  node scripts/migration/update-paths.js \\
    --pattern "node test-" \\
    --replacement "node tests/manual/test-" \\
    --types yml,json,js

  # Regex replacement
  node scripts/migration/update-paths.js \\
    --pattern "\\.claude-flow-novice/dist" \\
    --replacement "dist/" \\
    --regex

  # Load patterns from config file
  node scripts/migration/update-paths.js \\
    --config patterns.json \\
    --dry-run

  # Process only YAML files with verbose output
  node scripts/migration/update-paths.js \\
    --pattern "test-results/" \\
    --replacement ".artifacts/test-results/" \\
    --types yml \\
    --verbose

${colors.bright}Config File Format (JSON):${colors.reset}
  {
    "patterns": [
      {
        "pattern": "node test-",
        "replacement": "node tests/manual/test-"
      },
      {
        "pattern": "\\\\.claude-flow-novice/dist",
        "replacement": "dist/"
      }
    ]
  }

${colors.bright}Supported File Types:${colors.reset}
  - .yml, .yaml (YAML validation)
  - .json (JSON validation)
  - .js, .mjs, .cjs (JavaScript validation)
  - .md (Markdown validation)

${colors.bright}Safety Features:${colors.reset}
  - Automatic backups before modification
  - Syntax validation after updates
  - Dry-run mode for preview
  - Detailed change reporting
`);
}

/**
 * Main execution function
 */
async function main() {
  const options = parseArgs(process.argv);

  if (options.showHelp) {
    showHelp();
    process.exit(0);
  }

  try {
    // Load patterns from config file if specified
    if (options.configFile) {
      const configPatterns = await loadConfig(options.configFile);
      options.patterns.push(...configPatterns);
    }

    // Validate we have patterns to apply
    if (options.patterns.length === 0) {
      console.error(`${colors.red}Error: No patterns specified. Use --pattern/--replacement or --config${colors.reset}`);
      console.log(`Run with --help for usage information`);
      process.exit(1);
    }

    console.log(`${colors.bright}${colors.blue}Path Update Automation${colors.reset}\n`);

    if (options.dryRun) {
      console.log(`${colors.yellow}Running in DRY RUN mode - no files will be modified${colors.reset}\n`);
    }

    console.log(`${colors.bright}Configuration:${colors.reset}`);
    console.log(`  File types: ${options.types.join(', ')}`);
    console.log(`  Patterns: ${options.patterns.length}`);
    console.log(`  Regex mode: ${options.regex ? 'enabled' : 'disabled'}`);
    console.log(`  Backups: ${options.createBackups ? 'enabled' : 'disabled'}`);

    // Find files to process
    console.log(`\n${colors.cyan}Scanning for files...${colors.reset}`);
    const files = await findFiles(options.types);
    console.log(`Found ${files.length} files to process\n`);

    // Process all files
    const results = [];
    for (const file of files) {
      if (options.verbose) {
        console.log(`Processing: ${file}`);
      }

      const result = await processFile(file, options.patterns, {
        dryRun: options.dryRun,
        createBackups: options.createBackups,
        verbose: options.verbose,
        regex: options.regex
      });

      results.push(result);
    }

    // Generate report
    generateReport(results, options.dryRun);

    // Exit with error code if there were errors
    const hasErrors = results.some(r => r.error || !r.validated);
    process.exit(hasErrors ? 1 : 0);

  } catch (error) {
    console.error(`${colors.red}${colors.bright}Fatal Error:${colors.reset} ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export for testing
export {
  validateJSON,
  validateYAML,
  validateJavaScript,
  validateMarkdown,
  getValidator,
  createBackup,
  applyPattern,
  processFile,
  findFiles,
  generateReport,
  parseArgs,
  loadConfig
};
