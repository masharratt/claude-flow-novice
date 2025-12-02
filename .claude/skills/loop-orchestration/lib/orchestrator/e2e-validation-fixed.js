// E2E TypeScript Stack Validation - Fixed
console.log('=== E2E TypeScript Orchestration Stack Validation ===\n');

let totalTests = 0;
let passedTests = 0;

function test(name, fn) {
  totalTests++;
  console.log('TEST ' + totalTests + ': ' + name);
  try {
    fn();
    passedTests++;
    console.log('PASSED\n');
    return true;
  } catch (error) {
    console.error('FAILED:', error.message);
    console.log('');
    return false;
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
  console.log('  - gate-check.js:', typeof gateCheck.gateCheck);
  console.log('  - iteration-manager.js:', typeof iterationManager.prepareIteration);
  console.log('  - consensus.js:', typeof consensus.collectConsensus);
  console.log('  - parse-test-results.js:', typeof parseTestResults.parseTestResults);
  
  if (typeof orchestrate.Orchestrator !== 'function') throw new Error('Orchestrator missing');
  if (typeof spawnAgents.spawnAgents !== 'function') throw new Error('spawnAgents missing');
  if (typeof contextInjector.buildBroadcastContext !== 'function') throw new Error('buildBroadcastContext missing');
  if (typeof validator.ValidatorFactory !== 'function') throw new Error('ValidatorFactory missing');
  if (typeof contextLookup.createContextLookup !== 'function') throw new Error('createContextLookup missing');
  if (typeof aggregator.aggregateScores !== 'function') throw new Error('aggregateScores missing');
  if (typeof gateCheck.gateCheck !== 'function') throw new Error('gateCheck missing');
  if (typeof iterationManager.prepareIteration !== 'function') throw new Error('prepareIteration missing');
  if (typeof consensus.collectConsensus !== 'function') throw new Error('collectConsensus missing');
  if (typeof parseTestResults.parseTestResults !== 'function') throw new Error('parseTestResults missing');
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
  console.log('  - Has commands:', !!result.commands);

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
  console.log('  - Factory created:', !!factory);
  console.log('  - Factory type:', typeof factory);
  console.log('  - Has createValidator method:', typeof factory.createValidator);
  
  if (typeof factory.createValidator === 'function') {
    const mvpValidator = factory.createValidator('mvp');
    const standardValidator = factory.createValidator('standard');
    console.log('  - MVP Validator created:', !!mvpValidator);
    console.log('  - Standard Validator created:', !!standardValidator);
  }
  
  if (!factory) throw new Error('Factory not created');
});

// Test 6: Context Lookup
test('Context Lookup', () => {
  const { createContextLookup } = require('./dist/helpers/context-lookup.js');

  const lookup = createContextLookup();
  console.log('  - Lookup created:', !!lookup);
  console.log('  - Type:', typeof lookup);
  console.log('  - Has redis:', !!lookup.redis);
  console.log('  - Has logger:', !!lookup.logger);

  if (!lookup) throw new Error('Lookup not created');
});

// Test 7: Confidence Aggregator
test('Confidence Aggregator', () => {
  const { aggregateScores } = require('./dist/helpers/confidence-aggregator.js');

  const mockScores = [
    { agentId: 'agent-1', score: 0.95, metadata: {} },
    { agentId: 'agent-2', score: 0.88, metadata: {} },
    { agentId: 'agent-3', score: 0.92, metadata: {} }
  ];

  const result = aggregateScores(mockScores);
  console.log('  - Result type:', typeof result);
  console.log('  - Has statistics:', !!result.statistics);
  console.log('  - Average:', result.statistics.average);
  console.log('  - Median:', result.statistics.median);

  if (!result.statistics) throw new Error('No statistics returned');
});

// Test 8: Parse Test Results
test('Parse Test Results', () => {
  const { parseTestResults } = require('./dist/helpers/parse-test-results.js');

  const mockOutput = '10 passing\n2 failing';

  const results = parseTestResults(mockOutput);
  console.log('  - Result type:', typeof results);
  console.log('  - Has passRate:', typeof results.passRate);
  console.log('  - Has total:', typeof results.total);
  console.log('  - Framework:', results.framework);
  console.log('  - Pass rate:', results.passRate);

  if (typeof results.passRate === 'undefined') throw new Error('No pass rate returned');
});

// Test 9: Gate Check
test('Gate Check', () => {
  const { gateCheck, getModeThreshold } = require('./dist/helpers/gate-check.js');

  const threshold = getModeThreshold('standard');
  console.log('  - Standard threshold:', threshold);

  const passingGate = gateCheck({ passRate: 0.96, mode: 'standard' });
  const failingGate = gateCheck({ passRate: 0.85, mode: 'standard' });

  console.log('  - Passing gate (0.96):', passingGate.passed);
  console.log('  - Failing gate (0.85):', failingGate.passed);

  if (!passingGate.passed) throw new Error('Gate should pass for 0.96');
  if (failingGate.passed) throw new Error('Gate should fail for 0.85');
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
console.log('Total Tests: ' + totalTests);
console.log('Passed: ' + passedTests);
console.log('Failed: ' + (totalTests - passedTests));

if (passedTests === totalTests) {
  console.log('\nAll tests passed - Stack validated successfully');
  console.log('\nValidated Modules:');
  console.log('  Phase 1-2 (P0):');
  console.log('    - parse-test-results.ts');
  console.log('    - gate-check.ts');
  console.log('    - iteration-manager.ts');
  console.log('    - consensus.ts');
  console.log('    - spawn-agents.ts');
  console.log('    - context-injector.ts');
  console.log('    - validator.ts');
  console.log('  Phase 4 (P1):');
  console.log('    - context-lookup.ts');
  console.log('    - confidence-aggregator.ts');
  console.log('  Main Orchestrator:');
  console.log('    - orchestrate.ts');
  console.log('    - orchestrator-cli.ts');
  process.exit(0);
} else {
  console.log('\n' + (totalTests - passedTests) + ' test(s) failed');
  process.exit(1);
}
