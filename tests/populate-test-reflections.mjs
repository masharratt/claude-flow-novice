#!/usr/bin/env node

/**
 * ACE Context Lookup - Sample Data Population Script
 *
 * Populates the swarm-memory database with sample reflection data
 * for testing the ACE context lookup system.
 *
 * Usage:
 *   node tests/populate-test-reflections.mjs
 */

import ACEReflector from '../dist/ace/ace-reflector.js';

const memoryPath = './.artifacts/database/swarm-memory.db';
const reflector = new ACEReflector(memoryPath);
await reflector.initialize();

// Sample context data representing diverse engineering tasks
const sampleContexts = [
  {
    task: 'Implement JWT authentication',
    domain: 'backend',
    keywords: ['authentication', 'jwt', 'oauth', 'security'],
    constraints: ['Must support refresh tokens', 'Redis session storage'],
    previousResults: ['Basic auth implemented']
  },
  {
    task: 'Build REST API for user management',
    domain: 'backend',
    keywords: ['rest', 'api', 'crud', 'users', 'express'],
    constraints: ['RESTful design', 'Rate limiting'],
    previousResults: null
  },
  {
    task: 'Setup database migrations',
    domain: 'database',
    keywords: ['migrations', 'schema', 'database', 'sqlite'],
    constraints: ['Version controlled', 'Rollback support'],
    previousResults: null
  },
  {
    task: 'Implement ACE context lookup system',
    domain: 'backend',
    keywords: ['ace', 'context', 'reflections', 'cognitive', 'memory'],
    constraints: ['Similarity matching', 'SQLite storage'],
    previousResults: ['Phase 1.1 reflection hook complete']
  },
  {
    task: 'Build frontend dashboard',
    domain: 'frontend',
    keywords: ['react', 'dashboard', 'ui', 'charts', 'visualization'],
    constraints: ['Responsive design', 'Performance optimization'],
    previousResults: null
  },
  {
    task: 'Setup CI/CD pipeline',
    domain: 'devops',
    keywords: ['ci', 'cd', 'docker', 'github-actions', 'automation'],
    constraints: ['Automated testing', 'Blue-green deployment'],
    previousResults: null
  }
];

console.log('Populating test reflection data...');
console.log('');

let successCount = 0;
for (const context of sampleContexts) {
  try {
    const complexity = Math.random() * 5 + 3; // Random complexity 3-8
    const reflection = await reflector.reflect(context, { complexity });

    console.log(`✅ Created reflection: ${reflection.id}`);
    console.log(`   Task: ${context.task}`);
    console.log(`   Domain: ${context.domain}`);
    console.log(`   Complexity: ${complexity.toFixed(2)}`);
    console.log(`   Insights: ${reflection.insights.length}`);
    console.log('');

    successCount++;
  } catch (error) {
    console.error(`❌ Failed to create reflection for: ${context.task}`);
    console.error(`   Error: ${error.message}`);
    console.log('');
  }
}

console.log('========================================');
console.log(`✅ Successfully populated ${successCount}/${sampleContexts.length} reflections`);
console.log('========================================');
console.log('');
console.log('Run test suite with:');
console.log('  ./tests/test-ace-context-lookup.sh');
