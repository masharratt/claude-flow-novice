#!/usr/bin/env node
/**
 * RuVector Batch Indexer - Processes multiple files in a single Node.js process
 *
 * Usage:
 *   echo -e "file1.ts\nfile2.js" | node batch-indexer.js
 *   printf '%s\n' "${files[@]}" | node batch-indexer.js
 *
 * Advantages over per-file spawning:
 * - Initialize RuVector database once (not N times)
 * - Reuse connection pool and embedding client
 * - 100x+ faster for large codebases
 * - Better error handling and progress tracking
 */

import { createInterface } from 'readline';
import { parseFile, createEmbeddingText } from './parser.js';
import { generateEmbedding } from './embeddings.js';

// Dynamic import for TypeScript module (requires tsx runtime)
const { initializeRuVector, getCollection, COLLECTIONS } = await import('../../../docker/trigger-dev/src/lib/ruvector-init.ts');

// ANSI colors
const COLORS = {
  RED: '\x1b[0;31m',
  GREEN: '\x1b[0;32m',
  YELLOW: '\x1b[1;33m',
  BLUE: '\x1b[0;34m',
  NC: '\x1b[0m'
};

function logInfo(msg) {
  console.error(`${COLORS.BLUE}[INFO]${COLORS.NC} ${msg}`);
}

function logSuccess(msg) {
  console.error(`${COLORS.GREEN}[SUCCESS]${COLORS.NC} ${msg}`);
}

function logError(msg) {
  console.error(`${COLORS.RED}[ERROR]${COLORS.NC} ${msg}`);
}

function logWarn(msg) {
  console.error(`${COLORS.YELLOW}[WARN]${COLORS.NC} ${msg}`);
}

async function indexFile(collection, filePath) {
  try {
    // Parse file metadata
    const metadata = parseFile(filePath);

    // Create embedding text
    const embeddingText = createEmbeddingText(filePath, metadata);

    // Generate embedding
    const embedding = await generateEmbedding(embeddingText);

    if (!embedding || embedding.length === 0) {
      logWarn(`Skipping file with null embedding: ${filePath}`);
      return false;
    }

    // Create combined text for search
    const searchText = `${metadata.purpose || ''} ${(metadata.exports || []).join(' ')}`.trim();

    // Insert into RuVector
    await collection.insert({
      id: filePath,
      vector: new Float32Array(embedding),
      metadata: {
        text: searchText,
        metadata: metadata
      }
    });

    return true;
  } catch (error) {
    logError(`Failed to index ${filePath}: ${error.message}`);
    return false;
  }
}

async function main() {
  try {
    // Initialize RuVector once
    logInfo('Initializing RuVector database...');
    await initializeRuVector();
    const collection = getCollection(COLLECTIONS.CODEBASE_INDEX);
    logSuccess('RuVector database initialized');

    // Read file paths from stdin
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    let total = 0;
    let success = 0;
    let failed = 0;

    logInfo('Reading file paths from stdin...');

    for await (const filePath of rl) {
      const trimmedPath = filePath.trim();
      if (!trimmedPath) continue;

      total++;

      // Progress indicator
      process.stderr.write(`\r${COLORS.BLUE}[PROGRESS]${COLORS.NC} Indexing ${total} files...`);

      logInfo(`\nIndexing: ${trimmedPath}`);

      if (await indexFile(collection, trimmedPath)) {
        success++;
      } else {
        failed++;
      }
    }

    console.error(''); // New line after progress

    logSuccess(`Batch indexing completed`);
    logInfo(`Total: ${total} files`);
    logInfo(`Indexed: ${success} files`);
    if (failed > 0) {
      logWarn(`Failed: ${failed} files`);
    }

    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    logError(`Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
