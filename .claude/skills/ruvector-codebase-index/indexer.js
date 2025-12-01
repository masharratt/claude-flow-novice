#!/usr/bin/env node
/**
 * RuVector Indexer - Inserts file embeddings into RuVector database
 *
 * Usage: node indexer.js <file_path> <embedding_json> <metadata_json>
 */

import { getCollection, COLLECTIONS } from '../../docker/trigger-dev/src/lib/ruvector-init.ts';

async function indexFile(filePath, embedding, metadata) {
  try {
    const collection = getCollection(COLLECTIONS.CODEBASE_INDEX);

    // Parse inputs
    const embeddingArray = JSON.parse(embedding);
    const metadataObj = JSON.parse(metadata);

    // Create embedding text for search
    const embeddingText = `${metadataObj.purpose || ''} ${(metadataObj.exports || []).join(' ')}`.trim();

    // Insert into RuVector
    await collection.insert({
      id: filePath,
      vector: new Float32Array(embeddingArray),
      metadata: {
        text: embeddingText,
        metadata: metadataObj
      }
    });

    console.log('SUCCESS');
    return true;
  } catch (error) {
    console.error('Error inserting into RuVector:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const [filePath, embedding, metadata] = process.argv.slice(2);

if (!filePath || !embedding || !metadata) {
  console.error('Usage: node indexer.js <file_path> <embedding_json> <metadata_json>');
  process.exit(1);
}

indexFile(filePath, embedding, metadata);
