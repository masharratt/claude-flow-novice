#!/usr/bin/env node
import { VectorDB, DistanceMetric } from '@ruvector/core';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../../../data/ruvector');
const ERROR_PATTERNS_DB = path.join(DATA_DIR, 'error_patterns.db');

async function inspect() {
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

  // Get a record
  const record = await db.get('error-test-001-1764565381805');
  
  console.log('Record keys:', Object.keys(record));
  console.log('\nRecord.id:', record.id);
  console.log('\nRecord has metadata property:', 'metadata' in record);
  console.log('\nAll properties (first 10):');
  for (const [key, value] of Object.entries(record).slice(0, 10)) {
    console.log(`  ${key}:`, typeof value, Array.isArray(value) ? `array[${value.length}]` : value);
  }
}

inspect().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
