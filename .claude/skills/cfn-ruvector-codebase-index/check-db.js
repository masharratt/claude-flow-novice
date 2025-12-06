import { VectorDB } from '@ruvector/core';

const db = new VectorDB({ dimensions: 1536, storagePath: './data/codebase_index.db' });

// Try a simple search
const results = await db.search({ vector: new Float32Array(1536).fill(0.01), k: 10 });
console.log('Search result count:', results.length);
console.log('All results:', JSON.stringify(results, null, 2));
