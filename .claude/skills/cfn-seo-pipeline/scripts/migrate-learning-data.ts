#!/usr/bin/env ts-node
/**
 * Migration Script: Index Existing Learning Data
 *
 * Indexes all existing learning JSON files into RuVector for semantic search.
 * This is a one-time migration script to import historical learning data.
 *
 * Usage:
 *   npm run migrate:learning
 *   or
 *   ts-node .claude/skills/cfn-seo-pipeline/scripts/migrate-learning-data.ts
 *
 * Options:
 *   --knowledge-store <path>  Path to knowledge store (default: auto-detect)
 *   --clear                   Clear existing index before migration
 *   --dry-run                 Show what would be indexed without doing it
 *   --verbose                 Show detailed progress
 *
 * @module scripts/migrate-learning-data
 */

import * as path from 'path';
import { LearningIndexer } from '../lib/seo/learning-indexer';

interface MigrationOptions {
  knowledgeStorePath?: string;
  clear?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  keepFiles?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): MigrationOptions {
  const args = process.argv.slice(2);
  const options: MigrationOptions = {
    verbose: false,
    clear: false,
    dryRun: false,
    keepFiles: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--knowledge-store':
        options.knowledgeStorePath = args[++i];
        break;
      case '--clear':
        options.clear = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--keep-files':
        options.keepFiles = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        console.error(`Unknown option: ${arg}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
Migration Script: Index Existing Learning Data

Usage:
  npm run migrate:learning [options]
  ts-node scripts/migrate-learning-data.ts [options]

Options:
  --knowledge-store <path>  Path to knowledge store (default: auto-detect)
  --clear                   Clear existing index before migration
  --dry-run                 Show what would be indexed without doing it
  --verbose                 Show detailed progress
  --keep-files              Keep JSON files after indexing (default: delete)
  --help, -h                Show this help message

Examples:
  # Migrate with default settings
  npm run migrate:learning

  # Clear and rebuild index
  npm run migrate:learning --clear

  # Dry run to see what would be indexed
  npm run migrate:learning --dry-run --verbose

  # Specify custom knowledge store path
  npm run migrate:learning --knowledge-store /path/to/knowledge-store
`);
}

/**
 * Detect knowledge store path
 */
function detectKnowledgeStorePath(): string {
  // Try .claude/skills location first (production)
  const skillPath = path.join(
    __dirname,
    '..',
    'lib',
    'seo',
    'knowledge-store'
  );

  // Fallback to planning location (development)
  const planningPath = path.join(
    process.cwd(),
    'planning',
    'seo',
    'knowledge-store'
  );

  // Use skill path if script is run from skill directory
  return skillPath;
}

/**
 * Main migration function
 */
async function migrate(options: MigrationOptions): Promise<void> {
  const knowledgeStorePath =
    options.knowledgeStorePath || detectKnowledgeStorePath();

  console.log('='.repeat(80));
  console.log('Learning Data Migration to RuVector');
  console.log('='.repeat(80));
  console.log();
  console.log(`Knowledge Store: ${knowledgeStorePath}`);
  console.log(`Clear Index:     ${options.clear ? 'YES' : 'NO'}`);
  console.log(`Dry Run:         ${options.dryRun ? 'YES' : 'NO'}`);
  console.log(`Keep Files:      ${options.keepFiles ? 'YES' : 'NO'}`);
  console.log(`Verbose:         ${options.verbose ? 'YES' : 'NO'}`);
  console.log();

  if (options.dryRun) {
    console.log('DRY RUN MODE - No changes will be made');
    console.log();
  }

  // Create indexer
  const indexer = new LearningIndexer({
    knowledgeStorePath,
    verbose: options.verbose,
  });

  try {
    // Clear index if requested
    if (options.clear && !options.dryRun) {
      console.log('Clearing existing index...');
      await indexer.clearIndex();
      console.log('Index cleared.');
      console.log();
    }

    // Index all learning files
    console.log('Indexing learning files...');
    console.log();

    const stats = options.dryRun
      ? { successCount: 0, failureCount: 0, totalIndexed: 0, deletedCount: 0, errors: [] }
      : await indexer.indexAllLearnings(!options.keepFiles);

    // Print results
    console.log('='.repeat(80));
    console.log('Migration Results');
    console.log('='.repeat(80));
    console.log();
    console.log(`✅ Success files indexed: ${stats.successCount}`);
    console.log(`❌ Failure files indexed: ${stats.failureCount}`);
    console.log(`📊 Total indexed:         ${stats.totalIndexed}`);
    console.log(`🗑️  Files deleted:         ${stats.deletedCount}`);
    console.log(`⚠️  Errors:                ${stats.errors.length}`);
    console.log();

    if (stats.errors.length > 0) {
      console.log('Errors encountered:');
      stats.errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error}`);
      });
      console.log();
    }

    // Get aggregated metrics
    if (!options.dryRun && stats.totalIndexed > 0) {
      console.log('Generating aggregated metrics...');
      const metrics = await indexer.getAggregatedMetrics();

      console.log();
      console.log('Aggregated Metrics:');
      console.log(`  Total Learnings:  ${metrics.totalLearnings}`);
      console.log(`  Success Rate:     ${(metrics.successRate * 100).toFixed(1)}%`);
      console.log();

      if (Object.keys(metrics.avgStepTimings).length > 0) {
        console.log('Average Step Timings:');
        Object.entries(metrics.avgStepTimings)
          .sort(([a], [b]) => a.localeCompare(b))
          .forEach(([step, timing]) => {
            console.log(`  ${step}: ${timing.toFixed(2)}ms`);
          });
        console.log();
      }
    }

    console.log('='.repeat(80));

    if (options.dryRun) {
      console.log('✅ Dry run completed - no changes made');
    } else {
      console.log('✅ Migration completed successfully');
    }

    console.log('='.repeat(80));
  } catch (error) {
    console.error();
    console.error('='.repeat(80));
    console.error('❌ Migration failed');
    console.error('='.repeat(80));
    console.error();
    console.error(`Error: ${error}`);

    if (error instanceof Error && error.stack) {
      console.error();
      console.error('Stack trace:');
      console.error(error.stack);
    }

    process.exit(1);
  }
}

/**
 * Entry point
 */
async function main(): Promise<void> {
  const options = parseArgs();

  try {
    await migrate(options);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { migrate, MigrationOptions };
