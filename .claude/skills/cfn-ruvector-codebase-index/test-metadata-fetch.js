#!/usr/bin/env node
import { VectorDB, DistanceMetric } from '@ruvector/core';
import { generateEmbedding } from './embeddings.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../../data/ruvector');
const ERROR_PATTERNS_DB = path.join(DATA_DIR, 'error_patterns.db');

async function testMetadataFetch() {
  console.log('Opening database...');

  const db = new VectorDB({
    dimensions: 1536,
    distanceMetric: DistanceMetric.Cosine,
    storagePath: ERROR_PATTERNS_DB,
    hnswConfig: {
      m: 16,
      efConstruction: 200,
      efSearch: 100,
      maxElements: 10000,
    },
  });

  console.log('Searching...');
  const queryText = 'TypeScript type errors';
  const embedding = await generateEmbedding(queryText);
  
  const results = await db.search({
    vector: Float32Array.from(embedding),
    k: 5,
  });

  console.log('\nSearch results:', JSON.stringify(results, null, 2));

  // Try to get full record by ID
  if (results && results.length > 0) {
    const firstId = results[0].id;
    console.log('\nTrying to fetch full record for ID:', firstId);
    
    // Try get() method
    try {
      const record = await db.get(firstId);
      console.log('db.get() result:', JSON.stringify(record, null, 2));
    } catch (err) {
      console.log('db.get() error:', err.message);
    }
  }
}

testMetadataFetch().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
