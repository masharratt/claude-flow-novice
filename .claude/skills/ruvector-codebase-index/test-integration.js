#!/usr/bin/env node
import { storeErrorPattern, queryErrorPatterns, storeLearning, queryLearnings } from './ruvector-learning.js';

async function test() {
  console.log('Testing RuVector Learning Integration...\n');

  // Test 1: Store error pattern
  console.log('1. Storing error pattern...');
  const errorResult = await storeErrorPattern({
    task_id: 'test-001',
    error_type: 'TypeScript compilation',
    pattern: 'Missing type imports in multi-file refactor',
    context: 'Files: auth.ts, types.ts. Forgot to add import { User }',
    solution: 'Always add type imports before interface usage',
    timestamp: new Date().toISOString()
  });
  console.log('   Result:', errorResult);

  // Test 2: Store learning
  console.log('\n2. Storing learning...');
  const learningResult = await storeLearning({
    task_id: 'test-002',
    category: 'PATTERN',
    title: 'Authentication middleware composition',
    description: 'Middleware stack: validateToken → enrichContext → checkPermissions',
    confidence: 0.92,
    tags: 'auth,middleware,express',
    timestamp: new Date().toISOString()
  });
  console.log('   Result:', learningResult);

  // Test 3: Query error patterns
  console.log('\n3. Querying error patterns for "TypeScript type errors"...');
  const errors = await queryErrorPatterns('TypeScript type errors', 5);
  console.log(`   Found ${errors.length} error pattern(s):`);
  errors.forEach((e, i) => {
    const sim = e.similarity ? e.similarity.toFixed(3) : 'N/A';
    console.log(`   ${i+1}. ${e.error_type}: ${e.pattern} (similarity: ${sim})`);
  });

  // Test 4: Query learnings
  console.log('\n4. Querying learnings for "authentication implementation"...');
  const learnings = await queryLearnings('authentication implementation', 'PATTERN', 5);
  console.log(`   Found ${learnings.length} learning(s):`);
  learnings.forEach((l, i) => {
    const sim = l.similarity ? l.similarity.toFixed(3) : 'N/A';
    console.log(`   ${i+1}. [${l.category}] ${l.title} (confidence: ${l.confidence}, similarity: ${sim})`);
  });

  console.log('\n✅ Integration test complete!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
