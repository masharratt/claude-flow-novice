/**
 * CFN Section 4 Validation Script
 * Validates all required elements for CLAUDE.md Section 4 updates
 */

import fs from 'fs';

// Simple test assertion
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test suite runner
function runTests() {
  const results = {
    passed: 0,
    failed: 0,
    total: 0,
    details: [],
    failedTests: []
  };

  function test(name, testFn) {
    results.total++;
    try {
      testFn();
      results.passed++;
      results.details.push(`✅ ${name}`);
      console.log(`✅ ${name}`);
    } catch (error) {
      results.failed++;
      results.details.push(`❌ ${name}: ${error.message}`);
      results.failedTests.push({ name, error: error.message });
      console.log(`❌ ${name}: ${error.message}`);
    }
  }

  // Load CLAUDE.md content
  const claudeMdContent = fs.readFileSync('CLAUDE.md', 'utf8');

  console.log('🧪 Running CFN Section 4 Validation Tests...\n');

  // Test 1: Subsection 4.3 exists
  test('New subsection 4.3 "Dedicated CFN Coordinators" present', () => {
    assert(claudeMdContent.includes('### 4.3 Dedicated CFN Coordinators'), 
           'Section 4.3 not found');
    assert(claudeMdContent.includes('**Mode-Based Coordinator Selection**'), 
           'Mode-Based Coordinator Selection not found');
  });

  // Test 2: Mode-based coordinator table complete
  test('Mode-based coordinator table complete', () => {
    assert(claudeMdContent.includes('cfn-coordinator-mvp'), 'MVP coordinator missing');
    assert(claudeMdContent.includes('cfn-coordinator-standard'), 'Standard coordinator missing');
    assert(claudeMdContent.includes('cfn-coordinator-enterprise'), 'Enterprise coordinator missing');
    assert(claudeMdContent.includes('<$1.00/phase'), 'MVP cost target missing');
    assert(claudeMdContent.includes('$2.00/phase'), 'Standard cost target missing');
    assert(claudeMdContent.includes('$5.00/phase'), 'Enterprise cost target missing');
    assert(claudeMdContent.includes('15 minutes'), 'MVP duration missing');
    assert(claudeMdContent.includes('30 minutes'), 'Standard duration missing');
    assert(claudeMdContent.includes('60 minutes'), 'Enterprise duration missing');
  });

  // Test 3: Coordinator spawning pattern documented
  test('Coordinator spawning pattern documented', () => {
    assert(claudeMdContent.includes('**Coordinator Spawning Pattern**'), 
           'Coordinator Spawning Pattern heading missing');
    assert(claudeMdContent.includes('spawn-coordinator.js'), 
           'spawn-coordinator.js reference missing');
    assert(claudeMdContent.includes('--mode=mvp --sprint-id=auth-sprint-001'), 
           'Coordinator spawn example missing');
  });

  // Test 4: Auto-phase-launch pattern explained
  test('Auto-phase-launch pattern explained', () => {
    assert(claudeMdContent.includes('**Auto-Phase-Launch Pattern**'), 
           'Auto-Phase-Launch Pattern heading missing');
    assert(claudeMdContent.includes('Coordinators autonomously execute Loop 3→2→4'), 
           'Auto-execution description missing');
    assert(claudeMdContent.includes('Loop 3: Spawn workers'), 
           'Loop 3 description missing');
    assert(claudeMdContent.includes('Loop 2: Coordinate validators'), 
           'Loop 2 description missing');
    assert(claudeMdContent.includes('Loop 4: Product Owner decision'), 
           'Loop 4 description missing');
  });

  // Test 5: Single-coordinator-per-sprint documented
  test('Single-coordinator-per-sprint documented', () => {
    assert(claudeMdContent.includes('**Single-Coordinator-Per-Sprint Pattern**'), 
           'Single-Coordinator-Per-Sprint Pattern heading missing');
    assert(claudeMdContent.includes('One coordinator handles entire sprint lifecycle'), 
           'Single coordinator description missing');
    assert(claudeMdContent.includes('Persistent state across all phases'), 
           'Persistent state description missing');
  });

  // Test 6: Return-to-chat triggers clearly listed
  test('Return-to-chat triggers clearly listed', () => {
    assert(claudeMdContent.includes('**Return-to-Chat Triggers**'), 
           'Return-to-Chat Triggers heading missing');
    assert(claudeMdContent.includes('1. **Human Decision Required**'), 
           'Human Decision Required section missing');
    assert(claudeMdContent.includes('2. **Sprint Complete**'), 
           'Sprint Complete section missing');
    assert(claudeMdContent.includes('Major architectural changes'), 
           'Architectural changes trigger missing');
    assert(claudeMdContent.includes('Budget/timeline adjustments'), 
           'Budget trigger missing');
    assert(claudeMdContent.includes('All planned phases executed'), 
           'Sprint complete trigger missing');
  });

  // Test 7: Auto-injection example included
  test('Auto-injection example included', () => {
    assert(claudeMdContent.includes('**Coordinator Auto-Injection**'), 
           'Coordinator Auto-Injection heading missing');
    assert(claudeMdContent.includes('MVP coordinator auto-injection example'), 
           'MVP auto-injection example missing');
    assert(claudeMdContent.includes('## MVP Mode Instructions for Next Phase'), 
           'MVP instructions heading missing');
    assert(claudeMdContent.includes('Speed Over Perfection'), 
           'Speed priority missing');
    assert(claudeMdContent.includes('Phase Budget: <$1.00 total'), 
           'Budget constraint missing');
  });

  // Test 8: Coordinator telemetry example present
  test('Coordinator telemetry example present', () => {
    assert(claudeMdContent.includes('**Coordinator Telemetry**'), 
           'Coordinator Telemetry heading missing');
    assert(claudeMdContent.includes('const coordinatorMetrics'), 
           'Telemetry code example missing');
    assert(claudeMdContent.includes('avgConfidence: 0.75'), 
           'Confidence metric missing');
    assert(claudeMdContent.includes('savingsVsPureClaude: 0.96'), 
           'Savings metric missing');
    assert(claudeMdContent.includes('totalCost'), 
           'Total cost metric missing');
  });

  // Test 9: Detailed Mode Instructions updated
  test('Detailed Mode Instructions updated to reference coordinator profiles', () => {
    assert(claudeMdContent.includes('**Detailed Mode Instructions**'), 
           'Detailed Mode Instructions heading missing');
    assert(claudeMdContent.includes('See coordinator profiles for complete spawn patterns'), 
           'Coordinator profiles reference missing');
    assert(claudeMdContent.includes('Redis pub/sub coordination'), 
           'Redis coordination reference missing');
    assert(claudeMdContent.includes('SQLite memory patterns'), 
           'SQLite memory reference missing');
    assert(claudeMdContent.includes('Each coordinator maintains mode-specific expertise'), 
           'Coordinator expertise description missing');
  });

  // Additional validation tests
  test('Section 4 has proper subsection ordering', () => {
    const section4Match = claudeMdContent.match(/## 4\) CFN Loop [\s\S]*?(?=## 5\))/);
    assert(section4Match, 'Section 4 not found');
    
    const section4Content = section4Match[0];
    const index41 = section4Content.indexOf('### 4.1');
    const index42 = section4Content.indexOf('### 4.2');
    const index43 = section4Content.indexOf('### 4.3');
    
    assert(index41 !== -1, 'Section 4.1 missing');
    assert(index42 !== -1, 'Section 4.2 missing');
    assert(index43 !== -1, 'Section 4.3 missing');
    assert(index41 < index42 && index42 < index43, 'Incorrect subsection ordering');
  });

  test('No placeholder content in section 4.3', () => {
    const section43Match = claudeMdContent.match(/### 4\.3 Dedicated CFN Coordinators([\s\S]*?)(?=###|$)/);
    assert(section43Match, 'Section 4.3 not found');
    
    const section43Content = section43Match[1];
    assert(!section43Content.includes('TODO'), 'TODO placeholders found');
    assert(!section43Content.includes('[PLACEHOLDER]'), 'PLACEHOLDER markers found');
    assert(!section43Content.includes('Coming soon'), 'Coming soon placeholders found');
  });

  test('Code examples present and properly formatted', () => {
    assert(claudeMdContent.includes('```bash'), 'Bash code blocks missing');
    assert(claudeMdContent.includes('```javascript'), 'JavaScript code blocks missing');
    assert(claudeMdContent.includes('spawn-workers.js'), 'spawn-workers.js reference missing');
  });

  test('Integration with existing CFN documentation', () => {
    assert(claudeMdContent.includes('Loop 3: Primary swarm implementation'), 
           'Loop 3 description missing');
    assert(claudeMdContent.includes('Loop 2: Consensus validation'), 
           'Loop 2 description missing');
    assert(claudeMdContent.includes('Loop 4: Product Owner decision gate'), 
           'Loop 4 description missing');
  });

  // Print results
  console.log('\n📊 Test Results:');
  console.log(`Total: ${results.total}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);

  if (results.failed > 0) {
    console.log('\n❌ Failed Tests:');
    results.failedTests.forEach(test => {
      console.log(`  ${test.name}: ${test.error}`);
    });
    return false;
  } else {
    console.log('\n✅ All tests passed!');
    return true;
  }
}

// Run the tests
try {
  const success = runTests();
  
  if (success) {
    console.log('\n🎉 CFN Section 4 validation completed successfully!');
    console.log('All 9 required elements are present and accurate.');
    process.exit(0);
  } else {
    console.log('\n⚠️  CFN Section 4 validation failed - some elements missing or incorrect.');
    process.exit(1);
  }
} catch (error) {
  console.error('\n💥 Validation script error:', error.message);
  process.exit(1);
}