/**
 * Direct test of v3 CFN Loop task logic
 * This bypasses trigger.dev worker and tests our task directly
 */

const { runCfnLoopV3 } = require('./dist/src/v3/cfn-loop.task.js');
const fs = require('fs');
const path = require('path');

async function testV3TaskDirectly() {
  console.log('🧪 Testing v3 CFN Loop task directly...');

  // Test case 1: Should create deliverable (success scenario)
  console.log('\n=== Test 1: Iteration 5 Success Scenario ===');
  const successPayload = {
    taskId: 'direct-test-success-123',
    description: 'Create "Hello, World!" with perfect formatting (should PROCEED)',
    mode: 'standard',
    maxIterations: 5,
    currentIteration: 5,
    startedAt: new Date().toISOString(),
    successCriteria: {
      testCommand: 'test -f /tmp/trigger-dev-deliverables/direct-test-success-123/hello-world.txt && grep -q "Hello, World!" /tmp/trigger-dev-deliverables/direct-test-success-123/hello-world.txt',
      passRateThreshold: 0.95,
      description: 'File must exist and contain "Hello, World!"',
    },
  };

  try {
    const result = await runCfnLoopV3(successPayload);
    console.log('✅ Success Test Result:', {
      taskId: result.taskId,
      decision: result.decision,
      success: result.success,
      finalPassRate: result.finalPassRate,
      iterationsCompleted: result.iterationsCompleted,
      hasDeliverables: result.allAgentResults.some(r => r.deliverables.files.length > 0)
    });

    // Check if deliverable was created
    const deliverablePath = '/tmp/trigger-dev-deliverables/direct-test-success-123/hello-world.txt';
    const fileExists = fs.existsSync(deliverablePath);

    if (fileExists) {
      const content = fs.readFileSync(deliverablePath, 'utf-8');
      console.log('✅ Deliverable created successfully!');
      console.log('📄 Content:', content.trim());
    } else {
      console.log('❌ Deliverable NOT created');
    }
  } catch (error) {
    console.error('❌ Success test failed:', error.message);
  }

  // Test case 2: Should NOT create deliverable (failure scenario)
  console.log('\n=== Test 2: Iteration 1 Failure Scenario ===');
  const failurePayload = {
    taskId: 'direct-test-failure-456',
    description: 'Create basic file without greeting (should fail gate)',
    mode: 'standard',
    maxIterations: 5,
    currentIteration: 1,
    startedAt: new Date().toISOString(),
    successCriteria: {
      testCommand: 'test -f /tmp/trigger-dev-deliverables/direct-test-failure-456/hello-world.txt && grep -q "Hello" /tmp/trigger-dev-deliverables/direct-test-failure-456/hello-world.txt',
      passRateThreshold: 0.95,
      description: 'File must exist and contain "Hello"',
    },
  };

  try {
    const result = await runCfnLoopV3(failurePayload);
    console.log('✅ Failure Test Result:', {
      taskId: result.taskId,
      decision: result.decision,
      success: result.success,
      finalPassRate: result.finalPassRate,
      iterationsCompleted: result.iterationsCompleted,
    });

    // Verify NO deliverable was created
    const failureDeliverablePath = '/tmp/trigger-dev-deliverables/direct-test-failure-456/hello-world.txt';
    const failureFileExists = fs.existsSync(failureDeliverablePath);

    if (!failureFileExists) {
      console.log('✅ Correctly did NOT create deliverable for failure scenario');
    } else {
      console.log('❌ Unexpected: Deliverable created for failure scenario');
      fs.rmSync(failureDeliverablePath, { force: true, recursive: true });
    }
  } catch (error) {
    console.error('❌ Failure test failed:', error.message);
  }
}

// Run the test
testV3TaskDirectly().catch(console.error);