// E2E TypeScript Stack Validation
console.log('=== E2E TypeScript Orchestration Stack Validation ===\n');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  console.log(`TEST ${totalTests}: ${name}`);
  try {
    fn();
    passedTests++;
    console.log('✅ PASSED\n');
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    console.error(error.stack);
    console.log('');
  }
}

// Test 1: Module Loading
test('Module Loading', () => {
  const orchestrate = require('./dist/orchestrate.js');
  const spawnAgents = require('./dist/helpers/spawn-agents.js');
  const contextInjector = require('./dist/helpers/context-injector.js');
  const validator = require('./dist/helpers/validator.js');
  const contextLookup = require('./dist/helpers/context-lookup.js');
  const aggregator = require('./dist/helpers/confidence-aggregator.js');
  const gateCheck = require('./dist/helpers/gate-check.js');
  const iterationManager = require('./dist/helpers/iteration-manager.js');
  const consensus = require('./dist/helpers/consensus.js');
  const parseTestResults = require('./dist/helpers/parse-test-results.js');

  console.log('  - orchestrate.js:', typeof orchestrate.Orchestrator);
  console.log('  - spawn-agents.js:', typeof spawnAgents.spawnAgents);
  console.log('  - context-injector.js:', typeof contextInjector.buildBroadcastContext);
  console.log('  - validator.js:', typeof validator.ValidatorFactory);
  console.log('  - context-lookup.js:', typeof contextLookup.createContextLookup);
  console.log('  - confidence-aggregator.js:', typeof aggregator.aggregateScores);
  console.log('  - gate-check.js:', Object.keys(gateCheck).join(', '));
  console.log('  - iteration-manager.js:', Object.keys(iterationManager).join(', '));
  console.log('  - consensus.js:', typeof consensus.collectConsensus);
  console.log('  - parse-test-results.js:', typeof parseTestResults.parseTestResults);
});

// Test 2: Orchestrator Instantiation
test('Orchestrator Instantiation', () => {
  const { Orchestrator } = require('./dist/orchestrate.js');

  const config = {
    taskId: 'e2e-test-task-123',
    mode: 'standard',
    maxIterations: 5,
    loop3Agents: ['backend-developer', 'tester'],
    loop2Agents: ['code-reviewer', 'security-specialist']
  };

  const orch = new Orchestrator(config);
  console.log('  - Task ID:', orch.config.taskId);
  console.log('  - Mode:', orch.config.mode);
  console.log('  - Max Iterations:', orch.config.maxIterations);

  if (!orch.config.taskId) throw new Error('Task ID not set');
  if (orch.config.mode !== 'standard') throw new Error('Mode not set correctly');
});

// Test 3: Spawn Agents Helper
test('Spawn Agents Helper', () => {
  const { spawnAgents } = require('./dist/helpers/spawn-agents.js');

  const result = spawnAgents(
    ['backend-developer', 'tester'],
    'test-task-456',
    { iteration: 1, mode: 'standard' }
  );

  console.log('  - Type:', typeof result);
  console.log('  - Is Object:', typeof result === 'object' && result !== null);

  if (typeof result !== 'object') throw new Error('Expected object result');
});

// Test 4: Context Injector
test('Context Injector', () => {
  const { buildBroadcastContext } = require('./dist/helpers/context-injector.js');

  const result = buildBroadcastContext({
    taskId: 'test-task-789',
    iteration: 2,
    phase: 'loop3',
    mode: 'standard',
    agentIds: ['agent-1', 'agent-2']
  });

  console.log('  - Has context:', !!result.context);
  console.log('  - Has JSON:', !!result.json);
  console.log('  - Message count:', result.messageCount);
  console.log('  - Task ID:', result.context.taskId);
  console.log('  - Iteration:', result.context.iteration);

  if (!result.context) throw new Error('No context returned');
  if (!result.json) throw new Error('No JSON returned');
});

// Test 5: Validator Factory
test('Validator Factory', () => {
  const { ValidatorFactory } = require('./dist/helpers/validator.js');

  const factory = new ValidatorFactory();
  const mvpValidator = factory.createValidator('mvp');
  const standardValidator = factory.createValidator('standard');
  const enterpriseValidator = factory.createValidator('enterprise');

  console.log('  - MVP Validator:', typeof mvpValidator.validate);
  console.log('  - Standard Validator:', typeof standardValidator.validate);
  console.log('  - Enterprise Validator:', typeof enterpriseValidator.validate);

  if (typeof mvpValidator.validate !== 'function') throw new Error('MVP validator invalid');
  if (typeof standardValidator.validate !== 'function') throw new Error('Standard validator invalid');
  if (typeof enterpriseValidator.validate !== 'function') throw new Error('Enterprise validator invalid');
});

// Test 6: Context Lookup
test('Context Lookup', () => {
  const { createContextLookup } = require('./dist/helpers/context-lookup.js');

  const lookup = createContextLookup();
  console.log('  - Has getContext:', typeof lookup.getContext);
  console.log('  - Has getPreviousResults:', typeof lookup.getPreviousResults);

  if (typeof lookup.getContext !== 'function') throw new Error('getContext not a function');
});

// Test 7: Confidence Aggregator
test('Confidence Aggregator', () => {
  const { aggregateScores } = require('./dist/helpers/confidence-aggregator.js');

  const mockScores = [
    { agentId: 'agent-1', confidence: 0.95, metadata: {} },
    { agentId: 'agent-2', confidence: 0.88, metadata: {} },
    { agentId: 'agent-3', confidence: 0.92, metadata: {} }
  ];

  const stats = aggregateScores(mockScores);
  console.log('  - Mean:', stats.mean.toFixed(2));
  console.log('  - Median:', stats.median.toFixed(2));
  console.log('  - Min:', stats.min.toFixed(2));
  console.log('  - Max:', stats.max.toFixed(2));

  if (stats.mean < 0.88 || stats.mean > 0.95) throw new Error('Mean calculation incorrect');
});

// Test 8: Parse Test Results
test('Parse Test Results', () => {
  const { parseTestResults } = require('./dist/helpers/parse-test-results.js');

  const mockOutput = `
    Tests: 10 passed, 2 failed, 12 total
    Pass rate: 83.33%
  `;

  const results = parseTestResults(mockOutput);
  console.log('  - Pass rate:', results.passRate.toFixed(2));
  console.log('  - Total tests:', results.total);
  console.log('  - Passed:', results.passed);
  console.log('  - Failed:', results.failed);

  if (results.total !== 12) throw new Error('Total count incorrect');
  if (results.passed !== 10) throw new Error('Passed count incorrect');
  if (results.failed !== 2) throw new Error('Failed count incorrect');
});

// Test 9: Gate Check
test('Gate Check', () => {
  const { gateCheck, getModeThreshold } = require('./dist/helpers/gate-check.js');

  const threshold = getModeThreshold('standard');
  console.log('  - Standard threshold:', threshold);

  const passingGate = gateCheck(0.96, 'standard');
  const failingGate = gateCheck(0.85, 'standard');

  console.log('  - Passing gate (0.96):', passingGate);
  console.log('  - Failing gate (0.85):', failingGate);

  if (!passingGate) throw new Error('Gate should pass for 0.96');
  if (failingGate) throw new Error('Gate should fail for 0.85');
});

// Test 10: Iteration Manager
test('Iteration Manager', () => {
  const { prepareIteration, wakeAgents } = require('./dist/helpers/iteration-manager.js');

  console.log('  - prepareIteration:', typeof prepareIteration);
  console.log('  - wakeAgents:', typeof wakeAgents);

  if (typeof prepareIteration !== 'function') throw new Error('prepareIteration not a function');
  if (typeof wakeAgents !== 'function') throw new Error('wakeAgents not a function');
});

// Summary
console.log('=== E2E Validation Summary ===');
console.log(`Total Tests: ${totalTests}`);
console.log(`Passed: ${passedTests}`);
console.log(`Failed: ${totalTests - passedTests}`);

if (passedTests === totalTests) {
  console.log('\n✅ All tests passed - Stack validated successfully');
  process.exit(0);
} else {
  console.log(`\n❌ ${totalTests - passedTests} test(s) failed`);
  process.exit(1);
}
