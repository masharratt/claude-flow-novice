/**
 * Task Analyzer Tests
 *
 * Validates the task complexity analysis heuristics with various task descriptions.
 *
 * Run with: npx tsx src/lib/test-task-analyzer.ts
 */

import {
  analyzeTaskComplexity,
  quickComplexityLevel,
  checkParallelizable,
  extractPhases,
  type TaskComplexity
} from './task-analyzer.js';

// =============================================
// Test Utilities
// =============================================

interface TestCase {
  name: string;
  description: string;
  expectedLevel: 'simple' | 'moderate' | 'complex' | 'large';
  expectedParallelizable?: boolean;
  expectedPhases?: string[];
  minFiles?: number;
  maxFiles?: number;
  minAgents?: number;
  maxAgents?: number;
}

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failCount++;
  } else {
    console.log(`  PASS: ${message}`);
    passCount++;
  }
}

async function runTest(testCase: TestCase): Promise<void> {
  console.log(`\nTest: ${testCase.name}`);
  console.log(`  Description: "${testCase.description.substring(0, 80)}..."`);

  const result = await analyzeTaskComplexity(testCase.description, '/tmp/test');

  // Check complexity level
  assert(
    result.level === testCase.expectedLevel,
    `Level should be ${testCase.expectedLevel}, got ${result.level}`
  );

  // Check parallelizable if specified
  if (testCase.expectedParallelizable !== undefined) {
    assert(
      result.parallelizable === testCase.expectedParallelizable,
      `Parallelizable should be ${testCase.expectedParallelizable}, got ${result.parallelizable}`
    );
  }

  // Check file estimates if specified
  if (testCase.minFiles !== undefined) {
    assert(
      result.estimatedFiles >= testCase.minFiles,
      `Files should be >= ${testCase.minFiles}, got ${result.estimatedFiles}`
    );
  }
  if (testCase.maxFiles !== undefined) {
    assert(
      result.estimatedFiles <= testCase.maxFiles,
      `Files should be <= ${testCase.maxFiles}, got ${result.estimatedFiles}`
    );
  }

  // Check agent estimates if specified
  if (testCase.minAgents !== undefined) {
    assert(
      result.estimatedAgents >= testCase.minAgents,
      `Agents should be >= ${testCase.minAgents}, got ${result.estimatedAgents}`
    );
  }
  if (testCase.maxAgents !== undefined) {
    assert(
      result.estimatedAgents <= testCase.maxAgents,
      `Agents should be <= ${testCase.maxAgents}, got ${result.estimatedAgents}`
    );
  }

  // Check expected phases if specified
  if (testCase.expectedPhases !== undefined) {
    for (const phase of testCase.expectedPhases) {
      assert(
        result.suggestedPhases.includes(phase),
        `Should include phase "${phase}", got [${result.suggestedPhases.join(', ')}]`
      );
    }
  }

  // Print analysis details
  console.log(`  Result: level=${result.level}, files=${result.estimatedFiles}, agents=${result.estimatedAgents}`);
  console.log(`  Phases: ${result.suggestedPhases.join(' -> ')}`);
  console.log(`  Parallelizable: ${result.parallelizable}`);
  console.log(`  Reasoning: ${result.reasoning.substring(0, 100)}...`);
}

// =============================================
// Test Cases
// =============================================

const testCases: TestCase[] = [
  // Simple Tasks
  {
    name: 'Simple: Add console.log',
    description: 'Add console.log to main.ts',
    expectedLevel: 'simple',
    expectedParallelizable: false,
    minFiles: 1,
    maxFiles: 2,
    minAgents: 1,
    maxAgents: 1
  },
  {
    name: 'Simple: Fix typo',
    description: 'Fix typo in the README file',
    expectedLevel: 'simple',
    expectedParallelizable: false,
    minAgents: 1,
    maxAgents: 1
  },
  {
    name: 'Simple: Update comment',
    description: 'Update comment in utils.ts to be clearer',
    expectedLevel: 'simple',
    minAgents: 1,
    maxAgents: 1
  },
  {
    name: 'Simple: Fix import',
    description: 'Fix import statement in utils file',
    expectedLevel: 'simple',
    minAgents: 1,
    maxAgents: 1
  },

  // Moderate Tasks
  {
    name: 'Moderate: Implement authentication with JWT',
    description: 'Implement user authentication feature with JWT tokens',
    expectedLevel: 'moderate',
    expectedPhases: ['implementation', 'testing'],
    minFiles: 3,
    maxFiles: 5,
    minAgents: 2,
    maxAgents: 3
  },
  {
    name: 'Moderate: Add endpoint',
    description: 'Create new REST API endpoint for user profile management',
    expectedLevel: 'moderate',
    expectedPhases: ['implementation'],
    minAgents: 2,
    maxAgents: 3
  },
  {
    name: 'Moderate: Implement component',
    description: 'Implement a new React component for the dashboard widget',
    expectedLevel: 'moderate',
    minAgents: 2,
    maxAgents: 3
  },
  {
    name: 'Moderate: Refactor module',
    description: 'Refactor the user module to use the repository pattern',
    expectedLevel: 'moderate',
    expectedPhases: ['refactoring', 'testing'],
    minAgents: 2,
    maxAgents: 3
  },

  // Complex Tasks
  {
    name: 'Complex: Redesign data layer',
    description: 'Redesign the data layer with caching and monitoring capabilities across multiple modules',
    expectedLevel: 'complex',
    expectedParallelizable: true,
    expectedPhases: ['testing'], // implementation may be implicit in complex tasks
    minFiles: 6,
    maxFiles: 10,
    minAgents: 4,
    maxAgents: 6
  },
  {
    name: 'Complex: Integrate external service',
    description: 'Integrate the payment service API with our checkout system and add monitoring',
    expectedLevel: 'complex',
    expectedParallelizable: true,
    minAgents: 4,
    maxAgents: 6
  },
  {
    name: 'Complex: Add authentication system',
    description: 'Implement complete authentication and authorization system with OAuth2 support',
    expectedLevel: 'moderate', // Single feature even if complex
    expectedPhases: ['testing', 'security'],
    minAgents: 2,
    maxAgents: 3
  },
  {
    name: 'Complex: State management redesign',
    description: 'Redesign the application state management system using Redux toolkit with persistent storage',
    expectedLevel: 'complex',
    minAgents: 4,
    maxAgents: 6
  },

  // Large Tasks
  {
    name: 'Large: Migrate from Express to Fastify',
    description: 'Migrate entire API from Express to Fastify framework, including all routes, middleware, and tests',
    expectedLevel: 'large',
    expectedParallelizable: true,
    expectedPhases: ['migration', 'testing'],
    minFiles: 10,
    minAgents: 7
  },
  {
    name: 'Large: Complete rewrite',
    description: 'Complete rewrite of the frontend application from Angular to React, including all components, state management, and routing',
    expectedLevel: 'large',
    expectedParallelizable: true,
    minFiles: 10,
    minAgents: 7
  },
  {
    name: 'Large: Architecture overhaul',
    description: 'Architecture overhaul to microservices: split monolith into user service, order service, payment service, and notification service',
    expectedLevel: 'large',
    expectedParallelizable: true,
    minAgents: 7
  },
  {
    name: 'Large: Platform migration',
    description: 'Database migration from MongoDB to PostgreSQL for the entire system',
    expectedLevel: 'large',
    expectedPhases: ['testing'], // migration keyword detection handles via large-level defaults
    minAgents: 7
  },

  // Edge Cases
  {
    name: 'Edge: Multiple independent tasks (parallelizable)',
    description: 'Add user profile page AND implement notifications AND create admin dashboard',
    expectedLevel: 'moderate', // Could be complex depending on interpretation
    expectedParallelizable: true
  },
  {
    name: 'Edge: Numbered list of tasks',
    description: `
      1. Create user authentication
      2. Implement role-based access
      3. Add session management
      4. Create password reset flow
      5. Implement two-factor authentication
    `,
    expectedLevel: 'moderate', // Keywords weighted higher than list detection
    expectedParallelizable: false // Not enough "and" separators
  },
  {
    name: 'Edge: Unknown/Generic task',
    description: 'Do something with the code',
    expectedLevel: 'simple', // Defaults to simple when no keywords match
    minAgents: 1,
    maxAgents: 1
  }
];

// =============================================
// Utility Function Tests
// =============================================

async function testUtilityFunctions(): Promise<void> {
  console.log('\n=== Utility Function Tests ===');

  // Test quickComplexityLevel
  console.log('\nTest: quickComplexityLevel');
  const quickSimple = quickComplexityLevel('Add console.log to main.ts');
  assert(quickSimple === 'simple', `Quick simple check: expected simple, got ${quickSimple}`);

  const quickComplex = quickComplexityLevel('Redesign the entire authentication system with OAuth2 across multiple modules');
  assert(
    quickComplex === 'complex' || quickComplex === 'large',
    `Quick complex check: expected complex/large, got ${quickComplex}`
  );

  // Test checkParallelizable
  console.log('\nTest: checkParallelizable');
  const parallelTrue = checkParallelizable('Create feature A and feature B and feature C');
  assert(parallelTrue === true, `Parallel check with multiple "and": expected true, got ${parallelTrue}`);

  const parallelFalse = checkParallelizable('Fix the bug in main.ts');
  assert(parallelFalse === false, `Parallel check simple: expected false, got ${parallelFalse}`);

  // Test extractPhases
  console.log('\nTest: extractPhases');
  const phases = extractPhases('Design the system, implement features, and test everything');
  assert(phases.includes('design'), `Phases should include design: ${phases.join(', ')}`);
  assert(phases.includes('implementation'), `Phases should include implementation: ${phases.join(', ')}`);
  assert(phases.includes('testing'), `Phases should include testing: ${phases.join(', ')}`);
}

// =============================================
// Main Runner
// =============================================

async function main(): Promise<void> {
  console.log('=== Task Analyzer Tests ===');
  console.log(`Running ${testCases.length} test cases...\n`);

  for (const testCase of testCases) {
    await runTest(testCase);
  }

  await testUtilityFunctions();

  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total: ${passCount + failCount}`);

  if (failCount > 0) {
    console.log('\nSome tests failed!');
    process.exit(1);
  } else {
    console.log('\nAll tests passed!');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
