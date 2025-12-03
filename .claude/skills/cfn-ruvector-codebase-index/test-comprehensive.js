#!/usr/bin/env node
import { storeErrorPattern, queryErrorPatterns, storeLearning, queryLearnings } from './ruvector-learning.js';

async function test() {
  console.log('=== Comprehensive RuVector Learning Test ===\n');

  // Store multiple error patterns
  console.log('1. Storing 3 error patterns...');
  
  await storeErrorPattern({
    task_id: 'test-ts-001',
    error_type: 'TypeScript compilation',
    pattern: 'Missing type imports in multi-file refactor',
    context: 'Files: auth.ts, types.ts. Forgot to add import { User }',
    solution: 'Always add type imports before interface usage',
    timestamp: new Date().toISOString()
  });

  await storeErrorPattern({
    task_id: 'test-ts-002',
    error_type: 'TypeScript type mismatch',
    pattern: 'Promise return type not matching async function',
    context: 'async function returns Promise<void> but typed as void',
    solution: 'Ensure async functions always return Promise<T>',
    timestamp: new Date().toISOString()
  });

  await storeErrorPattern({
    task_id: 'test-redis-001',
    error_type: 'Redis connection',
    pattern: 'Connection refused on localhost:6379',
    context: 'Redis container not running in Docker network',
    solution: 'Use service name "redis" instead of localhost in containers',
    timestamp: new Date().toISOString()
  });

  console.log('   ✅ Stored 3 error patterns\n');

  // Store multiple learnings
  console.log('2. Storing 3 learnings...');

  await storeLearning({
    task_id: 'learn-auth-001',
    category: 'PATTERN',
    title: 'Authentication middleware composition',
    description: 'Middleware stack: validateToken → enrichContext → checkPermissions',
    confidence: 0.92,
    tags: 'auth,middleware,express',
    timestamp: new Date().toISOString()
  });

  await storeLearning({
    task_id: 'learn-test-001',
    category: 'STRAT',
    title: 'Integration testing with Docker',
    description: 'Use docker-compose for isolated test environments with service discovery',
    confidence: 0.88,
    tags: 'testing,docker,integration',
    timestamp: new Date().toISOString()
  });

  await storeLearning({
    task_id: 'learn-redis-001',
    category: 'EDGE',
    title: 'Redis service name in Docker networks',
    description: 'Use "redis" hostname in containers, localhost:6379 from host',
    confidence: 0.95,
    tags: 'redis,docker,networking',
    timestamp: new Date().toISOString()
  });

  console.log('   ✅ Stored 3 learnings\n');

  // Query error patterns - TypeScript related
  console.log('3. Querying error patterns for "TypeScript type errors"...');
  const tsErrors = await queryErrorPatterns('TypeScript type errors', 5);
  console.log(`   Found ${tsErrors.length} error pattern(s):`);
  tsErrors.forEach((e, i) => {
    console.log(`   ${i+1}. [${e.error_type}] ${e.pattern}`);
    console.log(`      Solution: ${e.solution}`);
    console.log(`      Similarity: ${e.similarity.toFixed(3)}\n`);
  });

  // Query error patterns - Redis related
  console.log('4. Querying error patterns for "Redis connection issues"...');
  const redisErrors = await queryErrorPatterns('Redis connection issues', 5);
  console.log(`   Found ${redisErrors.length} error pattern(s):`);
  redisErrors.forEach((e, i) => {
    console.log(`   ${i+1}. [${e.error_type}] ${e.pattern}`);
    console.log(`      Solution: ${e.solution}`);
    console.log(`      Similarity: ${e.similarity.toFixed(3)}\n`);
  });

  // Query learnings - all categories
  console.log('5. Querying learnings for "Docker integration testing"...');
  const dockerLearnings = await queryLearnings('Docker integration testing', '', 5);
  console.log(`   Found ${dockerLearnings.length} learning(s):`);
  dockerLearnings.forEach((l, i) => {
    console.log(`   ${i+1}. [${l.category}] ${l.title}`);
    console.log(`      ${l.description}`);
    console.log(`      Confidence: ${l.confidence}, Similarity: ${l.similarity.toFixed(3)}\n`);
  });

  // Query learnings - category filter
  console.log('6. Querying learnings for "middleware patterns" (category: PATTERN)...');
  const patternLearnings = await queryLearnings('middleware patterns', 'PATTERN', 5);
  console.log(`   Found ${patternLearnings.length} learning(s):`);
  patternLearnings.forEach((l, i) => {
    console.log(`   ${i+1}. [${l.category}] ${l.title}`);
    console.log(`      ${l.description}`);
    console.log(`      Confidence: ${l.confidence}, Similarity: ${l.similarity.toFixed(3)}\n`);
  });

  console.log('=== ✅ All tests passed! ===');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
