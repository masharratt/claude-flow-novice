/**
 * SEO Article Quality Scorer
 *
 * Calculates weighted consensus scores from 6 validators:
 * - humanizer-validator (0.15)
 * - branding-validator (0.10)
 * - audience-validator (0.15)
 * - seo-validator (0.15)
 * - voice-authenticity-validator (0.20)
 * - depth-quality-validator (0.25)
 */

const WEIGHTS = {
  'humanizer-validator': 0.15,
  'branding-validator': 0.10,
  'audience-validator': 0.15,
  'seo-validator': 0.15,
  'voice-authenticity-validator': 0.20,
  'depth-quality-validator': 0.25
};

const THRESHOLDS = {
  exceptional: 0.95,
  high: 0.90,
  standard: 0.85,
  minimum: 0.80
};

const INDIVIDUAL_PASS_THRESHOLD = 0.75;

/**
 * Calculate weighted quality score from validator results
 * @param {Object} validatorScores - Map of validator name to score (0.0-1.0)
 * @returns {number} Weighted score (0.0-1.0)
 */
function calculateQualityScore(validatorScores) {
  if (!validatorScores || typeof validatorScores !== 'object') {
    throw new Error('validatorScores must be an object');
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [validator, weight] of Object.entries(WEIGHTS)) {
    if (validatorScores.hasOwnProperty(validator)) {
      const score = validatorScores[validator];

      if (typeof score !== 'number' || score < 0 || score > 1) {
        throw new Error(`Invalid score for ${validator}: must be between 0 and 1`);
      }

      weightedSum += score * weight;
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) {
    throw new Error('No valid validator scores provided');
  }

  // Normalize by actual total weight (in case some validators are missing)
  return weightedSum / totalWeight;
}

/**
 * Determine quality tier based on score
 * @param {number} score - Quality score (0.0-1.0)
 * @returns {string} Tier name
 */
function getQualityTier(score) {
  if (typeof score !== 'number' || score < 0 || score > 1) {
    throw new Error('Score must be a number between 0 and 1');
  }

  if (score >= THRESHOLDS.exceptional) {
    return 'exceptional';
  } else if (score >= THRESHOLDS.high) {
    return 'high';
  } else if (score >= THRESHOLDS.standard) {
    return 'standard';
  } else if (score >= THRESHOLDS.minimum) {
    return 'minimum';
  } else {
    return 'below-minimum';
  }
}

/**
 * Check if individual validators pass minimum threshold
 * @param {Object} scores - Validator scores
 * @returns {Object} Pass status per validator
 */
function checkIndividualPasses(scores) {
  if (!scores || typeof scores !== 'object') {
    throw new Error('scores must be an object');
  }

  const passes = {};

  for (const [validator, weight] of Object.entries(WEIGHTS)) {
    if (scores.hasOwnProperty(validator)) {
      passes[validator] = scores[validator] >= INDIVIDUAL_PASS_THRESHOLD;
    } else {
      passes[validator] = null; // Not evaluated
    }
  }

  return passes;
}

/**
 * Full validation consensus check
 * @param {Object} scores - All validator scores
 * @returns {Object} Complete validation result
 */
function validateConsensus(scores) {
  if (!scores || typeof scores !== 'object') {
    throw new Error('scores must be an object');
  }

  // Calculate weighted score
  const weightedScore = calculateQualityScore(scores);
  const tier = getQualityTier(weightedScore);
  const individualPasses = checkIndividualPasses(scores);

  // Identify failed validators
  const failedValidators = Object.entries(individualPasses)
    .filter(([_, passed]) => passed === false)
    .map(([validator, _]) => ({
      name: validator,
      score: scores[validator],
      weight: WEIGHTS[validator],
      threshold: INDIVIDUAL_PASS_THRESHOLD
    }));

  // Overall pass: weighted score >= minimum AND all individual validators pass
  const passed = weightedScore >= THRESHOLDS.minimum && failedValidators.length === 0;

  // Generate breakdown
  const breakdown = Object.entries(WEIGHTS).map(([validator, weight]) => ({
    validator,
    weight,
    score: scores[validator] !== undefined ? scores[validator] : null,
    contribution: scores[validator] !== undefined ? scores[validator] * weight : null,
    passed: individualPasses[validator]
  }));

  // Generate recommendation
  let recommendation = '';
  if (passed) {
    if (tier === 'exceptional') {
      recommendation = 'Article exceeds all quality standards. Ready for publication.';
    } else if (tier === 'high') {
      recommendation = 'Article meets high quality standards. Ready for publication.';
    } else if (tier === 'standard') {
      recommendation = 'Article meets standard quality requirements. Ready for publication.';
    } else {
      recommendation = 'Article meets minimum quality threshold. Consider minor improvements before publication.';
    }
  } else {
    if (failedValidators.length > 0) {
      const validatorNames = failedValidators.map(v => v.name).join(', ');
      recommendation = `Article requires revision. Failed validators: ${validatorNames}. Address feedback and revalidate.`;
    } else {
      recommendation = `Article weighted score (${weightedScore.toFixed(3)}) below minimum threshold (${THRESHOLDS.minimum}). Comprehensive revision needed.`;
    }
  }

  return {
    passed,
    score: weightedScore,
    tier,
    breakdown,
    failedValidators,
    recommendation,
    metadata: {
      totalValidators: Object.keys(WEIGHTS).length,
      evaluatedValidators: Object.keys(scores).length,
      passedValidators: Object.values(individualPasses).filter(p => p === true).length,
      thresholds: THRESHOLDS
    }
  };
}

/**
 * Generate feedback for failed validation
 * @param {Object} validationResult - Result from validateConsensus
 * @returns {string[]} List of actionable feedback items
 */
function generateFeedback(validationResult) {
  if (!validationResult || typeof validationResult !== 'object') {
    throw new Error('validationResult must be an object');
  }

  const feedback = [];

  // Overall status
  if (validationResult.passed) {
    feedback.push(`PASSED: Quality score ${validationResult.score.toFixed(3)} (${validationResult.tier} tier)`);
  } else {
    feedback.push(`FAILED: Quality score ${validationResult.score.toFixed(3)} (${validationResult.tier} tier)`);
  }

  // Failed validators with priority order (by weight)
  if (validationResult.failedValidators.length > 0) {
    feedback.push('');
    feedback.push('Critical Issues (validators below threshold):');

    const sortedFailed = [...validationResult.failedValidators].sort((a, b) => b.weight - a.weight);

    sortedFailed.forEach(({ name, score, weight, threshold }) => {
      const deficit = threshold - score;
      feedback.push(`  - ${name}: ${score.toFixed(3)} (weight: ${weight}, needs: ${threshold}, deficit: ${deficit.toFixed(3)})`);
    });
  }

  // Breakdown by contribution
  if (validationResult.breakdown) {
    feedback.push('');
    feedback.push('Score Breakdown:');

    const sortedBreakdown = [...validationResult.breakdown].sort((a, b) => b.weight - a.weight);

    sortedBreakdown.forEach(({ validator, weight, score, contribution, passed }) => {
      if (score !== null) {
        const status = passed ? 'PASS' : 'FAIL';
        const contributionStr = contribution !== null ? contribution.toFixed(4) : 'N/A';
        feedback.push(`  - ${validator}: ${score.toFixed(3)} × ${weight} = ${contributionStr} [${status}]`);
      } else {
        feedback.push(`  - ${validator}: NOT EVALUATED`);
      }
    });
  }

  // Improvement priorities
  if (!validationResult.passed && validationResult.failedValidators.length > 0) {
    feedback.push('');
    feedback.push('Recommended Action Items (priority order):');

    const sortedFailed = [...validationResult.failedValidators].sort((a, b) => {
      // Sort by impact (deficit × weight)
      const impactA = (INDIVIDUAL_PASS_THRESHOLD - a.score) * a.weight;
      const impactB = (INDIVIDUAL_PASS_THRESHOLD - b.score) * b.weight;
      return impactB - impactA;
    });

    sortedFailed.forEach(({ name, score, weight }, index) => {
      const impact = (INDIVIDUAL_PASS_THRESHOLD - score) * weight;
      feedback.push(`  ${index + 1}. Address ${name} feedback (impact: ${impact.toFixed(4)})`);
    });
  }

  // Summary recommendation
  feedback.push('');
  feedback.push(validationResult.recommendation);

  return feedback;
}

export {
  WEIGHTS,
  THRESHOLDS,
  INDIVIDUAL_PASS_THRESHOLD,
  calculateQualityScore,
  getQualityTier,
  checkIndividualPasses,
  validateConsensus,
  generateFeedback
};
