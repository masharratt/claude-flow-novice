#!/usr/bin/env node
/**
 * Standalone RuVector Indexer - Direct indexing without external dependencies
 */

import { VectorDB } from '@ruvector/core';
import * as path from 'path';
import * as fs from 'fs';
import { parseFile, createEmbeddingText } from './parser.js';
import { generateEmbedding } from './embeddings.js';

async function createIndex(dbPath, files) {
  try {
    // Initialize database
    const db = new VectorDB({
      dimensions: 1536,
      storagePath: dbPath
    });

    console.error(`[INFO] Starting to index ${files.length} files...`);

    let indexed = 0;
    let failed = 0;

    for (const filePath of files) {
      try {
        // Skip if file doesn't exist or is too large
        if (!fs.existsSync(filePath)) {
          console.warn(`[WARN] File not found: ${filePath}`);
          continue;
        }

        const stats = fs.statSync(filePath);
        if (stats.size > 1048576) { // 1MB limit
          console.warn(`[WARN] File too large (>1MB): ${filePath}`);
          continue;
        }

        // Parse file metadata
        const metadata = parseFile(filePath);

        // Create embedding text
        const embeddingText = createEmbeddingText(filePath, metadata);

        // Generate embedding
        console.error(`[INFO] Generating embedding for: ${filePath}`);
        const embedding = await generateEmbedding(embeddingText);

        if (!embedding || embedding.length === 0) {
          console.warn(`[WARN] No embedding generated for: ${filePath}`);
          failed++;
          continue;
        }

        // Insert into database
        await db.insert({
          id: filePath,
          vector: new Float32Array(embedding),
          metadata: {
            text: embeddingText,
            metadata: metadata
          }
        });

        indexed++;
        if (indexed % 10 === 0) {
          console.error(`[INFO] Indexed ${indexed} files...`);
        }
      } catch (error) {
        console.error(`[ERROR] Failed to index ${filePath}: ${error.message}`);
        failed++;
      }
    }

    console.error(`[SUCCESS] Indexing complete: ${indexed} files indexed, ${failed} failed`);

    // Close database
    await db.close();

    return { indexed, failed };
  } catch (error) {
    console.error('[ERROR] Failed to create index:', error.message);
    process.exit(1);
  }
}

// Main execution
async function main() {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const dbPath = path.join(dataDir, 'codebase_index.db');

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Read file list from stdin
    const files = [];
    const { createInterface } = await import('readline');
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    for await (const line of rl) {
      const file = line.trim();
      if (file) {
        files.push(file);
      }
    }

    if (files.length === 0) {
      console.error('[ERROR] No files to index');
      process.exit(1);
    }

    // Create index
    const result = await createIndex(dbPath, files);

    console.log(JSON.stringify(result));
  } catch (error) {
    console.error('[ERROR]', error.message);
    process.exit(1);
  }
}

main();