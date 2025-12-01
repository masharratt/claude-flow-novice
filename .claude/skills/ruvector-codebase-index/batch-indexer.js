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
  let rl;
  try {
    // Initialize RuVector once
    logInfo('Initializing RuVector database...');
    await initializeRuVector();
    const collection = getCollection(COLLECTIONS.CODEBASE_INDEX);
    logSuccess('RuVector database initialized');

    // Read file paths from stdin
    rl = createInterface({
      input: process.stdin,
      terminal: false,
      crlfDelay: Infinity
    });

    let total = 0;
    let success = 0;
    let failed = 0;
    let stdinClosed = false;

    logInfo('Reading file paths from stdin...');

    // Handle stdin events
    process.stdin.on('end', () => {
      stdinClosed = true;
      logInfo('Stdin stream ended');
    });

    process.stdin.on('error', (err) => {
      logWarn(`Stdin error: ${err.message}`);
      stdinClosed = true;
    });

    rl.on('close', () => {
      logInfo('Readline interface closed');
    });

    try {
      for await (const filePath of rl) {
        if (stdinClosed) {
          logWarn('Stdin closed, finishing current batch...');
          break;
        }

        const trimmedPath = filePath.trim();
        if (!trimmedPath) continue;

        total++;

        // Progress indicator every 10 files to reduce I/O overhead
        if (total % 10 === 0) {
          process.stderr.write(`\r${COLORS.BLUE}[PROGRESS]${COLORS.NC} Indexing ${total} files...`);
        }

        if (total % 100 === 0) {
          logInfo(`\nProgress: ${total} files processed (${success} success, ${failed} failed)`);
        }

        if (await indexFile(collection, trimmedPath)) {
          success++;
        } else {
          failed++;
        }
      }
    } catch (readError) {
      if (readError.message.includes('closed')) {
        logWarn(`Readline stream closed after processing ${total} files`);
      } else {
        throw readError;
      }
    }

    console.error(''); // New line after progress

    logSuccess(`Batch indexing completed`);
    logInfo(`Total: ${total} files`);
    logInfo(`Indexed: ${success} files`);
    if (failed > 0) {
      logWarn(`Failed: ${failed} files`);
    }

    // Exit with success code if at least some files were indexed
    // Only fail if NO files were indexed or if more than 50% failed
    const successRate = total > 0 ? success / total : 0;
    if (total === 0 || successRate < 0.5) {
      process.exit(1);
    }
    process.exit(0);

  } catch (error) {
    logError(`Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (rl) {
      rl.close();
    }
  }
}

main();
