import { initializeRuVector, getCollection, COLLECTIONS } from '../../../docker/trigger-dev/src/lib/ruvector-init.ts';

async function main() {
  console.log("ENV RUVECTOR_DB_PATH:", process.env.RUVECTOR_DB_PATH);
  
  await initializeRuVector();
  const coll = getCollection(COLLECTIONS.CODEBASE_INDEX);
  console.log("Got collection:", COLLECTIONS.CODEBASE_INDEX);

  // Try a search with a simple vector
  const results = await coll.search({
    vector: new Float32Array(1536).fill(0.01),
    k: 5,
  });
  console.log("Results count:", results.length);
  console.log("Results:", JSON.stringify(results, null, 2));
}

main().catch(console.error);
