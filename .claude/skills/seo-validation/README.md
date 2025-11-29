# SEO Article Quality Scorer

Weighted consensus scoring system for SEO article validation pipeline.

## Overview

Calculates quality scores from 6 specialized validators with weighted contributions:

- `depth-quality-validator`: 25% (highest weight)
- `voice-authenticity-validator`: 20%
- `humanizer-validator`: 15%
- `audience-validator`: 15%
- `seo-validator`: 15%
- `branding-validator`: 10%

## Quality Thresholds

- **Exceptional**: >= 0.95
- **High**: >= 0.90
- **Standard**: >= 0.85
- **Minimum**: >= 0.80
- **Individual Pass**: >= 0.75 (per validator)

## Usage

```javascript
import { validateConsensus, generateFeedback } from './quality-scorer.js';

const validatorScores = {
  'humanizer-validator': 0.88,
  'branding-validator': 0.85,
  'audience-validator': 0.90,
  'seo-validator': 0.92,
  'voice-authenticity-validator': 0.89,
  'depth-quality-validator': 0.93
};

const result = validateConsensus(validatorScores);
console.log(result.passed);  // true
console.log(result.score);   // 0.902
console.log(result.tier);    // 'high'

const feedback = generateFeedback(result);
feedback.forEach(line => console.log(line));
```

## Validation Result Structure

```javascript
{
  passed: true,
  score: 0.902,
  tier: 'high',
  breakdown: [
    {
      validator: 'depth-quality-validator',
      weight: 0.25,
      score: 0.93,
      contribution: 0.2325,
      passed: true
    },
    // ... more validators
  ],
  failedValidators: [],
  recommendation: 'Article meets high quality standards. Ready for publication.',
  metadata: {
    totalValidators: 6,
    evaluatedValidators: 6,
    passedValidators: 6,
    thresholds: { exceptional: 0.95, high: 0.90, ... }
  }
}
```

## Pass Criteria

Article passes validation when:

1. Weighted score >= 0.80 (minimum threshold)
2. All individual validators >= 0.75

If either condition fails, article requires revision.

## Testing

```bash
node .claude/skills/seo-validation/quality-scorer.test.js
```

All 21 test cases cover:
- Weighted calculation accuracy
- Quality tier classification
- Individual threshold checking
- Consensus validation logic
- Feedback generation
- Priority ordering for improvements
