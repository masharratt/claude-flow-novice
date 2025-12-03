#!/usr/bin/env node
/**
 * RuVector Indexer - Inserts file embeddings into RuVector database
 *
 * Usage: npx tsx indexer.js <file_path> <embedding_json> <metadata_json>
 */

// Dynamic import for TypeScript module (requires tsx runtime)
const { initializeRuVector, getCollection, COLLECTIONS } = await import('../../../docker/trigger-dev/src/lib/ruvector-init.ts');

async function indexFile(filePath, embedding, metadata) {
  try {
    // Initialize RuVector if not already initialized
    await initializeRuVector();

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

// Use top-level await (ESM modules support this)
await indexFile(filePath, embedding, metadata);
process.exit(0);
