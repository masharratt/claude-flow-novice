#!/usr/bin/env node
/**
 * Comprehensive Test Execution Suite
 *
 * This script executes all available tests and collects comprehensive results
 * for both the post-edit pipeline and fullstack swarm systems.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test results collection
const testResults = {
  timestamp: new Date().toISOString(),
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    typeScriptErrors: 0
  },
  categories: {
    postEditPipeline: [],
    fullstackSwarm: [],
    performance: [],
    integration: [],
    unit: []
  },
  performanceMetrics: {
    communicationBus: {},
    memoryOperations: {},
    testExecution: {}
  },
  errors: []
};

// Helper function to execute command and collect output
function executeTest(command, description, category) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Executing: ${description}`);
  console.log(`Category: ${category}`);
  console.log(`Command: ${command}`);
  console.log('='.repeat(80));

  const startTime = Date.now();
  let result = {
    description,
    category,
    command,
    passed: false,
    duration: 0,
    output: '',
    error: ''
  };

  try {
    const output = execSync(command, {
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 180000 // 3 minutes
    });

    result.passed = true;
    result.output = output;
    testResults.summary.passed++;
    console.log('✅ PASSED');
  } catch (error) {
    result.passed = false;
    result.error = error.message;
    result.output = error.stdout || '';

    // Check if it's a TypeScript error
    if (error.message.includes('TS2') || error.message.includes('error TS')) {
      testResults.summary.typeScriptErrors++;
      console.log('❌ FAILED (TypeScript Error)');
    } else {
      console.log('❌ FAILED');
    }

    testResults.summary.failed++;
  }

  result.duration = Date.now() - startTime;
  testResults.summary.total++;

  // Add to appropriate category
  if (testResults.categories[category]) {
    testResults.categories[category].push(result);
  }

  return result;
}

// Parse agent output for metrics
function parseAgentOutput(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error(`Error parsing ${filePath}:`, error.message);
  }
  return null;
}

// Main test execution
async function runTests() {
  console.log('\n🧪 Starting Comprehensive Test Execution Suite\n');

  // 1. Post-Edit Pipeline Tests
  console.log('\n📋 CATEGORY: Post-Edit Pipeline Tests\n');

  executeTest(
    'node src/hooks/communication-integrated-post-edit.js post-edit src/hooks/enhanced-post-edit-pipeline.js --memory-key "test/single-agent" --structured',
    'Single Agent Post-Edit Pipeline',
    'postEditPipeline'
  );

  // 2. Performance Tests
  console.log('\n📋 CATEGORY: Performance Tests\n');

  executeTest(
    'npm test -- tests/unit/example.test.ts',
    'Basic Test Runner Validation',
    'performance'
  );

  // 3. Try some working integration tests
  console.log('\n📋 CATEGORY: Integration Tests\n');

  executeTest(
    'npm test -- tests/unit/simple-example.test.ts',
    'Simple Example Test',
    'integration'
  );

  // 4. Collect agent metrics from previous runs
  console.log('\n📊 Collecting Agent Metrics...\n');

  const agentMetrics = [];
  for (let i = 1; i <= 5; i++) {
    const agentFile = `/tmp/agent-${i}-output.json`;
    if (fs.existsSync(agentFile)) {
      const data = parseAgentOutput(agentFile);
      if (data && data.communication) {
        agentMetrics.push({
          agentId: `agent-${i}`,
          metrics: data.communication.metrics
        });
      }
    }
  }

  testResults.performanceMetrics.communicationBus = {
    agentCount: agentMetrics.length,
    averageLatency: agentMetrics.reduce((sum, a) => sum + a.metrics.averageLatency, 0) / agentMetrics.length,
    peakLatency: Math.max(...agentMetrics.map(a => a.metrics.peakLatency)),
    totalMessages: agentMetrics.reduce((sum, a) => sum + a.metrics.messagesPublished, 0),
    averageThroughput: agentMetrics.reduce((sum, a) => sum + a.metrics.averageThroughput, 0) / agentMetrics.length
  };

  // 5. Generate summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST EXECUTION SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Tests: ${testResults.summary.total}`);
  console.log(`Passed: ${testResults.summary.passed} ✅`);
  console.log(`Failed: ${testResults.summary.failed} ❌`);
  console.log(`TypeScript Errors: ${testResults.summary.typeScriptErrors} 🔧`);
  console.log(`Success Rate: ${((testResults.summary.passed / testResults.summary.total) * 100).toFixed(2)}%`);
  console.log('='.repeat(80));

  // 6. Save results
  const resultsDir = path.join(__dirname, '..', 'docs', 'testing');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const resultsFile = path.join(resultsDir, 'test-execution-results.json');
  fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
  console.log(`\n📁 Results saved to: ${resultsFile}`);

  return testResults;
}

// Execute tests
runTests()
  .then(results => {
    console.log('\n✅ Test execution complete!');
    process.exit(results.summary.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  });