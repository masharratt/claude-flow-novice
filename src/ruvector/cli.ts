#!/usr/bin/env node
/**
 * CFN RuVector CLI - Semantic codebase search
 */

import { Command } from 'commander';
import { RuVectorIndex } from './core/index.js';

const program = new Command();

program
  .name('cfn-ruvector')
  .description('Semantic codebase search using vector embeddings')
  .version('1.0.0');

program
  .command('index')
  .description('Index the codebase')
  .argument('[directory]', 'Directory to index', '.')
  .option('-v, --verbose', 'Verbose output')
  .action(async (directory: string, options: { verbose?: boolean }) => {
    try {
      const index = new RuVectorIndex({ verbose: options.verbose });
      console.log(`Indexing ${directory}...`);
      const stats = await index.indexDirectory(directory);
      console.log(`\nDone: ${stats.indexedFiles}/${stats.totalFiles} indexed, ${stats.failedFiles} failed`);
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('search')
  .description('Search the codebase')
  .argument('<query>', 'Search query')
  .option('-n, --limit <n>', 'Number of results', '10')
  .action(async (query: string, options: { limit?: string }) => {
    try {
      const index = new RuVectorIndex();
      const limit = parseInt(options.limit ?? '10', 10);
      const results = await index.search(query, { limit });
      
      if (results.length === 0) {
        console.log('No results found.');
        return;
      }
      
      console.log(`\nResults for: "${query}"\n`);
      for (const r of results) {
        console.log(`[${(r.score * 100).toFixed(1)}%]  ${r.path}`);
      }
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Show index stats')
  .action(async () => {
    try {
      const index = new RuVectorIndex();
      const stats = await index.getStats();
      console.log(`Indexed files: ${stats.indexedFiles}`);
    } catch (error) {
      console.error('Error:', (error as Error).message);
      process.exit(1);
    }
  });

program
  .command('clear')
  .description('Clear the index')
  .option('-f, --force', 'Force clear')
  .action(async (options: { force?: boolean }) => {
    if (!options.force) {
      console.log('Use --force to confirm.');
      process.exit(1);
    }
    const index = new RuVectorIndex();
    await index.clear();
    console.log('Index cleared.');
  });

program.parse();