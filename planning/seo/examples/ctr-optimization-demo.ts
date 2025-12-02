/**
 * CTR Optimization Engine Demo
 *
 * Demonstrates the capabilities of the CTR optimization engine
 */

import { CTROptimizationEngine } from '../lib/ctr-optimization-engine';

const engine = new CTROptimizationEngine();

console.log('=== CTR Optimization Engine Demo ===\n');

// Example 1: Title Optimization
console.log('1. TITLE OPTIMIZATION');
console.log('-------------------');
const titleResult = engine.optimizeTitle(
  'JavaScript Tutorial',
  'JavaScript',
  { includeYear: true, maxVariations: 3 }
);

console.log(`Original: "${titleResult.original}"`);
console.log(`Optimized: "${titleResult.optimized}"`);
console.log(`Score Improvement: +${titleResult.score_improvement.toFixed(1)} points`);
console.log(`Changes Made: ${titleResult.changes_made.join(', ')}`);
console.log('\nTop 3 Variations:');
titleResult.variations.forEach((variation, index) => {
  console.log(`  ${index + 1}. "${variation.title}" (Score: ${variation.score})`);
  console.log(`     Triggers: ${variation.triggers_used.join(', ')}`);
});
console.log('');

// Example 2: Meta Description Optimization
console.log('2. META DESCRIPTION OPTIMIZATION');
console.log('--------------------------------');
const metaResult = engine.optimizeMeta(
  'Learn JavaScript programming basics',
  'JavaScript'
);

console.log(`Original: "${metaResult.original}"`);
console.log(`Optimized: "${metaResult.optimized}"`);
console.log(`Score: ${metaResult.score}/100`);
console.log(`CTA Added: ${metaResult.cta_added ? 'Yes' : 'No'}`);
console.log(`Emotional Trigger: ${metaResult.emotional_trigger || 'None'}`);
console.log(`Changes Made: ${metaResult.changes_made.join(', ')}`);
console.log('');

// Example 3: CTR Scoring
console.log('3. CTR POTENTIAL SCORING');
console.log('------------------------');
const score = engine.scoreCTRPotential(
  titleResult.optimized,
  metaResult.optimized
);

console.log(`Overall Score: ${score.score}/100`);
console.log(`Estimated Impact: ${score.estimatedImpact.toUpperCase()}`);
console.log('\nScoring Factors:');
console.log(`  ✓ Length Optimal: ${score.factors.lengthOptimal ? 'Yes' : 'No'}`);
console.log(`  ✓ Keyword Present: ${score.factors.keywordPresent ? 'Yes' : 'No'}`);
console.log(`  ✓ Power Word: ${score.factors.powerWordPresent ? 'Yes' : 'No'}`);
console.log(`  ✓ Number: ${score.factors.numberPresent ? 'Yes' : 'No'}`);
console.log(`  ✓ Year: ${score.factors.yearPresent ? 'Yes' : 'No'}`);
console.log(`  ✓ Brackets: ${score.factors.bracketsPresent ? 'Yes' : 'No'}`);
console.log(`  ✓ CTA: ${score.factors.ctaPresent ? 'Yes' : 'No'}`);
console.log(`  ✓ Emotion: ${score.factors.emotionPresent ? 'Yes' : 'No'}`);
console.log(`  ✓ Uniqueness: ${score.factors.uniqueness}%`);

if (score.recommendations.length > 0) {
  console.log('\nRecommendations:');
  score.recommendations.forEach(rec => console.log(`  - ${rec}`));
}
console.log('');

// Example 4: Psychological Trigger Analysis
console.log('4. PSYCHOLOGICAL TRIGGER ANALYSIS');
console.log('---------------------------------');
const text = 'Discover 10 secret JavaScript techniques proven to boost your skills instantly';
const analysis = engine.analyzePsychologicalTriggers(text);

console.log(`Text: "${text}"`);
console.log('\nTrigger Scores (0-100):');
console.log(`  Curiosity: ${analysis.curiosity}`);
console.log(`  Urgency: ${analysis.urgency}`);
console.log(`  Benefit: ${analysis.benefit}`);
console.log(`  Emotion: ${analysis.emotion}`);
console.log(`  Social Proof: ${analysis.social_proof}`);
console.log(`\nDominant Trigger: ${analysis.dominant_trigger || 'None'}`);
console.log(`Total Triggers: ${analysis.trigger_count}`);
console.log('');

// Example 5: Before/After Comparison
console.log('5. BEFORE/AFTER COMPARISON');
console.log('--------------------------');
const poorTitle = 'JS Guide';
const poorMeta = 'Info about JS';

const poorScore = engine.scoreCTRPotential(poorTitle, poorMeta);
const goodScore = engine.scoreCTRPotential(
  titleResult.optimized,
  metaResult.optimized
);

console.log('BEFORE:');
console.log(`  Title: "${poorTitle}"`);
console.log(`  Meta: "${poorMeta}"`);
console.log(`  Score: ${poorScore.score}/100 (${poorScore.estimatedImpact} impact)`);
console.log('');
console.log('AFTER:');
console.log(`  Title: "${titleResult.optimized}"`);
console.log(`  Meta: "${metaResult.optimized}"`);
console.log(`  Score: ${goodScore.score}/100 (${goodScore.estimatedImpact} impact)`);
console.log(`  Improvement: +${(goodScore.score - poorScore.score).toFixed(1)} points`);
console.log('');

console.log('=== Demo Complete ===');
