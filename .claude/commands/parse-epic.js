#!/usr/bin/env node

/**
 * Parse Epic Slash Command
 * Converts natural language epic markdown files to structured JSON
 *
 * Usage: /parse-epic <epic-directory> [--output <file>] [--validate]
 *
 * Fixed: Direct import from compiled dist to avoid CLI module resolution issues
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
📖 /parse-epic - Epic Document Parser

**Description**:
  Parses natural language epic markdown documents (EPIC_OVERVIEW.md, phase-*.md)
  into structured JSON configuration for project management and automation.

**Usage**:
  /parse-epic <epic-directory> [options]

**Arguments**:
  <epic-directory>       Path to epic directory containing EPIC_OVERVIEW.md and phase files

**Options**:
  --output, -o <file>    Output JSON file path (default: epic-config.json in epic directory)
  --validate, -v         Validate epic config against schema
  --overview <file>      Custom overview file path (default: EPIC_OVERVIEW.md)

**Examples**:
  /parse-epic planning/example-epic
  /parse-epic planning/auth-system --output config/auth-epic.json
  /parse-epic planning/my-epic --validate
  /parse-epic planning/custom --overview planning/custom/OVERVIEW.md
`);
  process.exit(0);
}

/**
 * Parse epic directly using compiled epic-parser
 */
async function parseEpic() {
  try {
    // Parse arguments
    const epicDir = path.resolve(args[0]);
    const outputFlag = args.indexOf('--output') >= 0 ? args.indexOf('--output') : args.indexOf('-o');
    const validateFlag = args.includes('--validate') || args.includes('-v');
    const overviewFlag = args.indexOf('--overview');

    const outputFile = outputFlag >= 0 ? path.resolve(args[outputFlag + 1]) : path.join(epicDir, 'epic-config.json');
    const overviewFile = overviewFlag >= 0 ? path.resolve(args[overviewFlag + 1]) : undefined;

    console.log(chalk.cyan('🔍 Epic Parser - Natural Language to Structured JSON\n'));
    console.log(chalk.gray(`Epic directory: ${epicDir}`));
    console.log(chalk.gray(`Output file: ${outputFile}`));
    if (overviewFile) {
      console.log(chalk.gray(`Overview file: ${overviewFile}`));
    }
    console.log('');

    // Validate epic directory exists
    try {
      await fs.access(epicDir);
    } catch (err) {
      console.error(chalk.red(`❌ Epic directory not found: ${epicDir}`));
      process.exit(1);
    }

    // Dynamic import of compiled epic-parser
    const distPath = path.join(projectRoot, '.claude-flow-novice/dist/src/parsers/epic-parser.js');

    try {
      await fs.access(distPath);
    } catch (err) {
      console.error(chalk.red(`❌ Epic parser not found. Please build the project first:`));
      console.error(chalk.yellow(`   npm run build`));
      process.exit(1);
    }

    const { EpicParser } = await import(distPath);

    // Parse epic
    console.log(chalk.cyan('📝 Parsing epic markdown files...'));

    const parserOptions = {
      epicDirectory: epicDir
    };

    if (overviewFile) {
      parserOptions.overviewFile = overviewFile;
    }

    const parser = new EpicParser(parserOptions);
    const config = parser.parse();
    const validation = parser.getValidationResult();

    // Display validation results
    if (validation.errors && validation.errors.length > 0) {
      console.error(chalk.red(`\n❌ Parsing errors (${validation.errors.length}):`));
      validation.errors.forEach(err => {
        const location = err.location ? chalk.gray(` (${err.location.file})`) : '';
        console.error(chalk.red(`  - [${err.type}] ${err.message}${location}`));
      });
    }

    if (validation.warnings && validation.warnings.length > 0) {
      console.warn(chalk.yellow(`\n⚠️  Warnings (${validation.warnings.length}):`));
      validation.warnings.forEach(warn => {
        const location = warn.location ? chalk.gray(` (${warn.location.file})`) : '';
        console.warn(chalk.yellow(`  - [${warn.type}] ${warn.message}${location}`));
      });
    }

    // Display statistics
    if (validation.stats) {
      console.log(chalk.green('\n📊 Epic Statistics:'));
      console.log(chalk.cyan(`  Epic ID: ${config.epicId}`));
      console.log(chalk.cyan(`  Name: ${config.name}`));
      console.log(chalk.cyan(`  Status: ${config.status}`));
      console.log(chalk.cyan(`  Phases: ${validation.stats.totalPhases}`));
      console.log(chalk.cyan(`  Sprints: ${validation.stats.totalSprints}`));
      console.log(chalk.cyan(`  Completed: ${validation.stats.completedSprints}/${validation.stats.totalSprints}`));
      console.log(chalk.cyan(`  Dependencies: ${validation.stats.dependencyCount}`));

      if (validation.stats.cyclesDetected > 0) {
        console.log(chalk.red(`  Dependency Cycles: ${validation.stats.cyclesDetected}`));
      }
    }

    // Save output
    await fs.writeFile(outputFile, JSON.stringify(config, null, 2), 'utf-8');
    console.log(chalk.green(`\n✅ Epic config saved: ${outputFile}`));

    // Validate if requested
    if (validateFlag) {
      console.log(chalk.cyan('\n🔍 Running schema validation...'));
      const { default: validateEpicConfig } = await import(path.join(projectRoot, '.claude-flow-novice/dist/src/validators/epic-config-schema.js'));

      const schemaValidation = EpicParser.validate(config);

      if (schemaValidation.valid) {
        console.log(chalk.green('✅ Epic config passes schema validation'));
      } else {
        console.error(chalk.red(`\n❌ Schema validation failed (${schemaValidation.errors.length} errors):`));
        schemaValidation.errors.forEach(err => {
          console.error(chalk.red(`  - ${err}`));
        });
        process.exit(1);
      }
    }

    console.log(chalk.green('\n✅ Epic parsing complete!'));
    process.exit(0);

  } catch (error) {
    console.error(chalk.red('\n❌ Epic parsing failed:'));
    console.error(chalk.red(error.message));

    if (error.stack) {
      console.error(chalk.gray('\nStack trace:'));
      console.error(chalk.gray(error.stack));
    }

    process.exit(1);
  }
}

// Execute
parseEpic();
