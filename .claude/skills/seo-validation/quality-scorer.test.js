/**
 * Tests for SEO Article Quality Scorer
 */

import {
  WEIGHTS,
  THRESHOLDS,
  INDIVIDUAL_PASS_THRESHOLD,
  calculateQualityScore,
  getQualityTier,
  checkIndividualPasses,
  validateConsensus,
  generateFeedback
} from './quality-scorer.js';

// Test helper
function assertApproxEqual(actual, expected, tolerance = 0.0001) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Test suite
const tests = {
  'calculateQualityScore - perfect scores': () => {
    const scores = {
      'humanizer-validator': 1.0,
      'branding-validator': 1.0,
      'audience-validator': 1.0,
      'seo-validator': 1.0,
      'voice-authenticity-validator': 1.0,
      'depth-quality-validator': 1.0
    };

    const result = calculateQualityScore(scores);
    assertApproxEqual(result, 1.0);
  },

  'calculateQualityScore - weighted calculation': () => {
    const scores = {
      'humanizer-validator': 0.8,        // 0.8 × 0.15 = 0.12
      'branding-validator': 0.9,         // 0.9 × 0.10 = 0.09
      'audience-validator': 0.85,        // 0.85 × 0.15 = 0.1275
      'seo-validator': 0.88,             // 0.88 × 0.15 = 0.132
      'voice-authenticity-validator': 0.92, // 0.92 × 0.20 = 0.184
      'depth-quality-validator': 0.95    // 0.95 × 0.25 = 0.2375
    };

    // Total: 0.12 + 0.09 + 0.1275 + 0.132 + 0.184 + 0.2375 = 0.891
    const result = calculateQualityScore(scores);
    assertApproxEqual(result, 0.891);
  },

  'calculateQualityScore - missing validators normalized': () => {
    const scores = {
      'depth-quality-validator': 0.8,
      'voice-authenticity-validator': 0.9
    };

    // Only 0.25 + 0.20 = 0.45 total weight
    // (0.8 × 0.25 + 0.9 × 0.20) / 0.45 = (0.2 + 0.18) / 0.45 = 0.844...
    const result = calculateQualityScore(scores);
    assertApproxEqual(result, 0.8444, 0.0001);
  },

  'calculateQualityScore - invalid input throws': () => {
    try {
      calculateQualityScore(null);
      throw new Error('Should have thrown');
    } catch (e) {
      assert(e.message.includes('must be an object'), 'Expected object error');
    }
  },

  'calculateQualityScore - invalid score throws': () => {
    try {
      calculateQualityScore({ 'humanizer-validator': 1.5 });
      throw new Error('Should have thrown');
    } catch (e) {
      assert(e.message.includes('between 0 and 1'), 'Expected range error');
    }
  },

  'getQualityTier - exceptional': () => {
    assertEqual(getQualityTier(0.98), 'exceptional');
    assertEqual(getQualityTier(0.95), 'exceptional');
  },

  'getQualityTier - high': () => {
    assertEqual(getQualityTier(0.94), 'high');
    assertEqual(getQualityTier(0.90), 'high');
  },

  'getQualityTier - standard': () => {
    assertEqual(getQualityTier(0.89), 'standard');
    assertEqual(getQualityTier(0.85), 'standard');
  },

  'getQualityTier - minimum': () => {
    assertEqual(getQualityTier(0.84), 'minimum');
    assertEqual(getQualityTier(0.80), 'minimum');
  },

  'getQualityTier - below minimum': () => {
    assertEqual(getQualityTier(0.79), 'below-minimum');
    assertEqual(getQualityTier(0.50), 'below-minimum');
  },

  'checkIndividualPasses - all pass': () => {
    const scores = {
      'humanizer-validator': 0.80,
      'branding-validator': 0.85,
      'audience-validator': 0.90,
      'seo-validator': 0.88,
      'voice-authenticity-validator': 0.92,
      'depth-quality-validator': 0.95
    };

    const result = checkIndividualPasses(scores);
    assert(result['humanizer-validator'] === true, 'humanizer should pass');
    assert(result['branding-validator'] === true, 'branding should pass');
    assert(Object.values(result).every(v => v === true), 'all should pass');
  },

  'checkIndividualPasses - some fail': () => {
    const scores = {
      'humanizer-validator': 0.70,  // Below 0.75
      'branding-validator': 0.80,   // Above 0.75
      'audience-validator': 0.74,   // Below 0.75
      'seo-validator': 0.85,
      'voice-authenticity-validator': 0.90,
      'depth-quality-validator': 0.88
    };

    const result = checkIndividualPasses(scores);
    assertEqual(result['humanizer-validator'], false, 'humanizer should fail');
    assertEqual(result['audience-validator'], false, 'audience should fail');
    assertEqual(result['branding-validator'], true, 'branding should pass');
  },

  'checkIndividualPasses - missing validators': () => {
    const scores = {
      'depth-quality-validator': 0.90
    };

    const result = checkIndividualPasses(scores);
    assertEqual(result['depth-quality-validator'], true);
    assertEqual(result['humanizer-validator'], null, 'missing should be null');
  },

  'validateConsensus - full pass': () => {
    const scores = {
      'humanizer-validator': 0.90,
      'branding-validator': 0.88,
      'audience-validator': 0.92,
      'seo-validator': 0.91,
      'voice-authenticity-validator': 0.93,
      'depth-quality-validator': 0.94
    };

    const result = validateConsensus(scores);
    assert(result.passed, 'should pass');
    assert(result.score >= 0.90, 'score should be high');
    assertEqual(result.tier, 'high');
    assertEqual(result.failedValidators.length, 0, 'no failed validators');
    assert(result.recommendation.includes('Ready for publication'), 'should recommend publication');
  },

  'validateConsensus - fail individual threshold': () => {
    const scores = {
      'humanizer-validator': 0.70,  // Fails individual threshold
      'branding-validator': 0.95,
      'audience-validator': 0.95,
      'seo-validator': 0.95,
      'voice-authenticity-validator': 0.95,
      'depth-quality-validator': 0.95
    };

    const result = validateConsensus(scores);
    assertEqual(result.passed, false, 'should fail due to individual threshold');
    assertEqual(result.failedValidators.length, 1);
    assertEqual(result.failedValidators[0].name, 'humanizer-validator');
    assert(result.recommendation.includes('requires revision'), 'should recommend revision');
  },

  'validateConsensus - fail weighted score': () => {
    const scores = {
      'humanizer-validator': 0.76,
      'branding-validator': 0.76,
      'audience-validator': 0.76,
      'seo-validator': 0.76,
      'voice-authenticity-validator': 0.76,
      'depth-quality-validator': 0.76
    };

    const result = validateConsensus(scores);
    // All pass individual (>= 0.75) but weighted average is 0.76 < 0.80
    assertEqual(result.passed, false, 'should fail weighted threshold');
    assertEqual(result.failedValidators.length, 0, 'no individual failures');
    assert(result.score < THRESHOLDS.minimum, 'score below minimum');
  },

  'validateConsensus - metadata correctness': () => {
    const scores = {
      'humanizer-validator': 0.90,
      'seo-validator': 0.85,
      'depth-quality-validator': 0.92
    };

    const result = validateConsensus(scores);
    assertEqual(result.metadata.totalValidators, 6);
    assertEqual(result.metadata.evaluatedValidators, 3);
    assertEqual(result.metadata.passedValidators, 3);
  },

  'validateConsensus - breakdown structure': () => {
    const scores = {
      'humanizer-validator': 0.85,
      'depth-quality-validator': 0.90
    };

    const result = validateConsensus(scores);
    assert(Array.isArray(result.breakdown), 'breakdown should be array');
    assertEqual(result.breakdown.length, 6, 'should have all validators');

    const depthEntry = result.breakdown.find(b => b.validator === 'depth-quality-validator');
    assertEqual(depthEntry.weight, 0.25);
    assertEqual(depthEntry.score, 0.90);
    assertApproxEqual(depthEntry.contribution, 0.225);
    assertEqual(depthEntry.passed, true);
  },

  'generateFeedback - pass scenario': () => {
    const validationResult = {
      passed: true,
      score: 0.92,
      tier: 'high',
      breakdown: [
        { validator: 'depth-quality-validator', weight: 0.25, score: 0.94, contribution: 0.235, passed: true },
        { validator: 'humanizer-validator', weight: 0.15, score: 0.90, contribution: 0.135, passed: true }
      ],
      failedValidators: [],
      recommendation: 'Article meets high quality standards. Ready for publication.',
      metadata: { totalValidators: 6, evaluatedValidators: 2, passedValidators: 2 }
    };

    const feedback = generateFeedback(validationResult);
    assert(Array.isArray(feedback), 'should return array');
    assert(feedback[0].includes('PASSED'), 'should indicate pass');
    assert(feedback.some(line => line.includes('Ready for publication')), 'should include recommendation');
  },

  'generateFeedback - fail scenario': () => {
    const validationResult = {
      passed: false,
      score: 0.78,
      tier: 'below-minimum',
      breakdown: [
        { validator: 'depth-quality-validator', weight: 0.25, score: 0.70, contribution: 0.175, passed: false },
        { validator: 'humanizer-validator', weight: 0.15, score: 0.85, contribution: 0.1275, passed: true }
      ],
      failedValidators: [
        { name: 'depth-quality-validator', score: 0.70, weight: 0.25, threshold: 0.75 }
      ],
      recommendation: 'Article requires revision. Failed validators: depth-quality-validator. Address feedback and revalidate.',
      metadata: { totalValidators: 6, evaluatedValidators: 2, passedValidators: 1 }
    };

    const feedback = generateFeedback(validationResult);
    assert(feedback[0].includes('FAILED'), 'should indicate failure');
    assert(feedback.some(line => line.includes('Critical Issues')), 'should list critical issues');
    assert(feedback.some(line => line.includes('depth-quality-validator')), 'should mention failed validator');
    assert(feedback.some(line => line.includes('Recommended Action Items')), 'should provide action items');
  },

  'generateFeedback - priority ordering': () => {
    const validationResult = {
      passed: false,
      score: 0.75,
      tier: 'below-minimum',
      breakdown: [],
      failedValidators: [
        { name: 'branding-validator', score: 0.60, weight: 0.10, threshold: 0.75 },
        { name: 'depth-quality-validator', score: 0.65, weight: 0.25, threshold: 0.75 }
      ],
      recommendation: 'Article requires revision.',
      metadata: { totalValidators: 6, evaluatedValidators: 2, passedValidators: 0 }
    };

    const feedback = generateFeedback(validationResult);
    const actionSection = feedback.findIndex(line => line.includes('Recommended Action Items'));
    assert(actionSection !== -1, 'should have action items');

    // depth-quality should be priority 1 (higher weight × larger deficit)
    const firstAction = feedback[actionSection + 1];
    assert(firstAction.includes('1.'), 'should have priority 1');
    assert(firstAction.includes('depth-quality-validator'), 'depth should be first priority');
  }
};

// Run tests
console.log('Running SEO Quality Scorer Tests...\n');

let passed = 0;
let failed = 0;

for (const [name, test] of Object.entries(tests)) {
  try {
    test();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${error.message}`);
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
