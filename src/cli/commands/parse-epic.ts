#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { Command } from 'commander';
import chalk from 'chalk';
import { EpicParser } from '../../parsers/epic-parser.js';
import type { EpicConfig } from '../../parsers/epic-parser-types.js';

/**
 * CLI command for parsing epic markdown files into structured JSON configuration
 *
 * Features:
 * - Converts natural language epic documents to structured JSON
 * - Validates epic structure and dependencies
 * - Detects dependency cycles
 * - Reports comprehensive parsing statistics
 */

interface ParseEpicOptions {
  output?: string;
  validate?: boolean;
}

export const parseEpicCommand = new Command()
  .name('parse-epic')
  .description('Parse epic markdown files into structured JSON configuration')
  .argument('<epic-directory>', 'Path to epic directory containing EPIC_OVERVIEW.md and phase files')
  .option('-o, --output <file>', 'Output file path (default: <epic-name>-config.json)')
  .option('-v, --validate', 'Run validation and report errors without generating output')
  .action(async (epicDirectory: string, options: ParseEpicOptions) => {
    await executeParseEpic(epicDirectory, options);
  });

async function executeParseEpic(
  epicDirectory: string,
  options: ParseEpicOptions
): Promise<void> {
  console.log(chalk.cyan.bold('🔍 Epic Parser - Natural Language to Structured JSON\n'));

  try {
    // Resolve epic directory path
    const absoluteEpicDir = path.resolve(process.cwd(), epicDirectory);

    // Display directory info
    console.log(chalk.white('📂 Epic directory:'), chalk.gray(absoluteEpicDir));

    // Check if directory exists
    try {
      await fs.access(absoluteEpicDir);
    } catch {
      console.error(chalk.red('✗ Epic directory not found:'), absoluteEpicDir);
      process.exit(1);
    }

    // Check for overview file
    const overviewPath = path.join(absoluteEpicDir, 'EPIC_OVERVIEW.md');
    try {
      await fs.access(overviewPath);
      console.log(chalk.white('📄 Overview file:'), chalk.gray('EPIC_OVERVIEW.md'));
    } catch {
      console.error(chalk.red('✗ EPIC_OVERVIEW.md not found in directory'));
      process.exit(1);
    }

    console.log(); // Empty line for spacing

    // Initialize parser
    const parser = new EpicParser({ epicDirectory: absoluteEpicDir });

    // Parse epic configuration
    let epicConfig: EpicConfig;
    try {
      epicConfig = parser.parse();
    } catch (error) {
      console.error(chalk.red('✗ Parsing failed:'));
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }

    // Get validation result with stats
    const validation = parser.getValidationResult();

    // Display parsing results
    if (validation.valid) {
      console.log(chalk.green('✅ Parsed successfully:'));
      console.log(chalk.white('   - Epic:'), chalk.cyan(epicConfig.epicId));
      console.log(chalk.white('   - Phases:'), chalk.cyan(validation.stats?.totalPhases || 0));
      console.log(chalk.white('   - Total Sprints:'), chalk.cyan(validation.stats?.totalSprints || 0));
      console.log(chalk.white('   - Scope boundaries:'), chalk.green('✓'));
      console.log(chalk.white('   - Dependencies:'), chalk.green('✓'));

      if (validation.stats?.completedSprints) {
        console.log(
          chalk.white('   - Completed:'),
          chalk.cyan(`${validation.stats.completedSprints}/${validation.stats.totalSprints}`)
        );
      }

      if (validation.stats?.dependencyCount) {
        console.log(
          chalk.white('   - Dependency count:'),
          chalk.cyan(validation.stats.dependencyCount)
        );
      }
    }

    console.log(); // Empty line

    // Display warnings if any
    if (validation.warnings.length > 0) {
      console.log(chalk.yellow(`⚠️  ${validation.warnings.length} warning(s):`));
      validation.warnings.forEach((warn) => {
        const location = warn.location ? ` (${warn.location.file})` : '';
        console.log(chalk.yellow(`   - [${warn.type}] ${warn.message}${location}`));
      });
      console.log(); // Empty line
    }

    // Validation-only mode
    if (options.validate) {
      if (validation.valid) {
        console.log(chalk.green('✅ Validation: PASSED\n'));
        process.exit(0);
      } else {
        console.log(chalk.red('✗ Validation: FAILED\n'));
        console.error(chalk.red('Errors:'));
        validation.errors.forEach((err) => {
          const location = err.location ? ` at ${err.location.file}` : '';
          console.error(chalk.red(`   - [${err.type}] ${err.message}${location}`));
        });
        process.exit(1);
      }
    }

    // Generate output file path
    const defaultOutputName = `${epicConfig.epicId}-config.json`;
    const outputPath = options.output
      ? path.resolve(process.cwd(), options.output)
      : path.join(absoluteEpicDir, defaultOutputName);

    // Write JSON to output file
    try {
      await fs.writeFile(outputPath, JSON.stringify(epicConfig, null, 2), 'utf-8');
      const relativeOutput = path.relative(process.cwd(), outputPath);
      console.log(chalk.white('📄 Output:'), chalk.cyan(relativeOutput));
    } catch (error) {
      console.error(chalk.red('✗ Failed to write output file:'), (error as Error).message);
      process.exit(1);
    }

    // Final status
    if (validation.valid) {
      console.log(chalk.green('✅ Validation: PASSED\n'));
      console.log(chalk.cyan('Ready for CFN Loop execution!'));
      process.exit(0);
    } else {
      console.log(chalk.red('✗ Validation: FAILED (but config generated)\n'));
      console.error(chalk.red('Errors:'));
      validation.errors.forEach((err) => {
        const location = err.location ? ` at ${err.location.file}` : '';
        console.error(chalk.red(`   - [${err.type}] ${err.message}${location}`));
      });
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red('\n✗ Unexpected error:'), (error as Error).message);
    if ((error as any).stack) {
      console.error(chalk.gray((error as any).stack));
    }
    process.exit(1);
  }
}

// CLI execution when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  parseEpicCommand.parse(process.argv);
}

export default parseEpicCommand;
