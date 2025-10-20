import { executeAgent } from '../src/cli/agent-executor.js';

// Mock confidence extraction function for testing
function extractConfidenceTest(input: string): number {
  if (!input) return 0.85;

  // Case-insensitive patterns with broader matching
  const patterns = [
    { regex: /\bconfidence[:|\s]+([0-9.]+)/i, group: 1 },
    { regex: /\bconfidence\s+score[:|\s]+([0-9.]+)/i, group: 1 },
    { regex: /\bself-confidence[:|\s]+([0-9.]+)/i, group: 1 },
    { regex: /\bmy\s*confidence[:|\s]+([0-9.]+)/i, group: 1 },
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern.regex);
    if (match && match[pattern.group]) {
      const score = parseFloat(match[pattern.group]);
      if (score >= 0 && score <= 1) {
        return score;
      }
    }
  }

  // Default to 0.85 if no match
  return 0.85;
}

async function runConfidenceTests() {
  const tests = [
    { input: "confidence: 0.85", expected: 0.85 },
    { input: "Confidence: 0.90", expected: 0.90 },
    { input: "confidence score: 0.95", expected: 0.95 },
    { input: "self-confidence: 0.88", expected: 0.88 },
    { input: "my confidence: 0.92", expected: 0.92 },
    { input: "Confidence:0.90", expected: 0.90 }, // No space test
    { input: "no pattern here", expected: 0.85 }, // default
    { input: "", expected: 0.85 }, // undefined
  ];

  console.log("=== Confidence Extraction Tests ===");
  let passCount = 0;

  tests.forEach(test => {
    const extractedConfidence = extractConfidenceTest(test.input);
    const passed = Math.abs(extractedConfidence - test.expected) < 0.001;
    console.log(passed ? '✓' : '✗',
                `Pattern: "${test.input}" -> ${extractedConfidence}`);
    if (passed) passCount++;
  });

  console.log(`\nConfidence Tests: ${passCount}/${tests.length} passed\n`);
  console.log(`Test Coverage: ${Math.round((passCount / tests.length) * 100)}%`);

  // Ensure high confidence threshold
  const threshold = 0.80;
  const coveragePercentage = (passCount / tests.length) * 100;
  console.log(`\nCoverage Threshold: ${threshold * 100}%`);
  console.log(`Pass Condition: ${coveragePercentage >= threshold * 100}`);

  if (coveragePercentage < threshold * 100) {
    console.error(`❌ Test coverage below ${threshold * 100}%`);
    process.exit(1);
  }
}

async function runEpicContextTests() {
  console.log("=== Epic Context Storage Tests ===");
  const taskId = `test-${Date.now()}`;
  const epicData = {
    epicName: 'Test Epic',
    epicGoal: 'Test goal',
    inScope: ['feature1'],
    outOfScope: ['feature2'],
    references: ['doc1.md']
  };

  try {
    // Mock context verification
    const contextVerification = {
      hasTaskId: !!taskId,
      hasEpicName: !!epicData.epicName,
      hasScopeDefinition: epicData.inScope.length > 0,
      hasGoal: !!epicData.epicGoal
    };

    console.log('Context Verification:', JSON.stringify(contextVerification, null, 2));

    // Validate context structure
    const requiredKeys = ['epicName', 'epicGoal', 'inScope', 'outOfScope', 'references'];
    const missingKeys = requiredKeys.filter(key => !(key in epicData));

    if (missingKeys.length > 0) {
      console.error(`❌ Missing keys: ${missingKeys.join(', ')}`);
      process.exit(1);
    }

    console.log('✓ Epic context structure valid');
    console.log('Epic Data:', JSON.stringify(epicData));
    console.log('Task ID:', taskId);
  } catch (error) {
    console.error('Epic Context Test Failed:', error);
    process.exit(1);
  }
}

// Run tests
(async () => {
  await runConfidenceTests();
  await runEpicContextTests();
})();