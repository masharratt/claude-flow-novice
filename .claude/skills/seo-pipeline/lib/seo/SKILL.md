---
name: cfn-seo
description: "SEO intelligence toolkit for 1-2% ranking improvements. Use when optimizing content for search rankings, analyzing SERP features, auditing pre-publication SEO, improving CTR, or detecting content decay. Includes SERP feature optimization, pre-publication audit, semantic completeness analysis, CTR optimization, and content refresh triggers."
version: 1.0.0
author: Claude Flow Novice
category: seo
tags: [seo, serp, optimization, ranking, ctr, schema, content]
---

# CFN SEO Intelligence Skill

Comprehensive SEO optimization toolkit for content ranking improvements. This skill provides a complete pipeline from intelligence gathering to post-publication performance tracking.

## Installation

This is an optional skill in `cfn-extras`. To install, copy to `.claude/skills/`:

```bash
cp -r .claude/cfn-extras/skills/cfn-seo .claude/skills/
```

Then install dependencies:

```bash
cd .claude/cfn-extras/skills/cfn-seo
npm install
npm run build
```

## Features

### 1. SERP Feature Optimizer (Position 0 Targeting)
Win featured snippets, PAA, and other SERP features to bypass organic rankings.

- Featured snippet formatting (40-60 word answer paragraphs)
- FAQ schema generation for PAA targeting
- HowTo, VideoObject, Article schema markup
- Image pack optimization
- Table snippet formatting
- Schema validation against Google requirements

### 2. Pre-Publication SEO Audit (Step 11.5)
Comprehensive checklist before content goes live.

**Audit Categories (Weighted Scoring):**
| Category | Weight | Checks |
|----------|--------|--------|
| Title Tag | 25% | CTR scoring, power words, numbers, year, brackets |
| Schema Markup | 20% | Content-type specific detection and recommendations |
| Internal Linking | 15% | 3-5 contextual links, anchor text quality |
| Meta Description | 15% | CTA, emotional triggers, length validation |
| Readability | 15% | Flesch 60-70, sentence/paragraph length |
| Freshness | 5% | Current year, recent data, publication date |
| Images | 5% | ALT text coverage and quality |

### 3. Semantic Completeness Analyzer
Ensure comprehensive topic coverage vs competitors.

- TF-IDF topic extraction with n-grams
- Competitor gap identification
- Coverage score (0-100)
- Priority recommendations with effort estimates

### 4. CTR Optimization Engine
Maximize click-through rate from SERPs.

- 9-factor CTR scoring system (0-100)
- Title variation generation (8 templates)
- Psychological trigger analysis (7 types)
- Power words database (50+ words across 7 categories)
- Meta description optimization with CTAs

### 5. Content Refresh Trigger
Prevent content from falling off page 1.

- Decay pattern detection (gradual, sudden, seasonal, competitor)
- Priority calculation (URGENT/HIGH/MEDIUM/LOW)
- Freshness opportunity identification
- Redis-backed scheduling
- Integration with performance tracking

### 6. Pipeline Steps

| Step | Name | Purpose |
|------|------|---------|
| 0 | Intelligence Pre-load | Load patterns and algorithm risks |
| 2.5 | Competitor Analysis | Deep competitor content analysis |
| 3.5 | SERP Pattern Analysis | Extract SERP features and patterns |
| 11.5 | Pre-Publication Audit | Final optimization checklist |
| 12 | Learning Capture | Store outcomes for future use |
| 13 | Performance Tracking | Post-publication metrics and refresh triggers |

## Usage

### SERP Feature Optimizer

```typescript
import {
  detectSERPOpportunities,
  formatForFeaturedSnippet,
  generateFAQSchema,
  validateSchema
} from './lib/serp-feature-optimizer';

// Detect opportunities
const opportunities = detectSERPOpportunities(content, serpFeatures);

// Format for featured snippet
const snippet = formatForFeaturedSnippet(content, {
  targetKeyword: 'best project management tools',
  maxWords: 55,
  includeDefinition: true
});

// Generate FAQ schema
const faqSchema = generateFAQSchema([
  { question: 'What is...?', answer: '...' }
]);

// Validate before deployment
const validation = validateSchema(faqSchema, 'FAQPage');
```

### Pre-Publication Audit

```typescript
import { executeStep115 } from './lib/steps/step-11.5-pre-publication-audit';

const auditResult = await executeStep115({
  targetKeyword: 'seo best practices',
  contentHtml: '<article>...</article>',
  titleTag: 'SEO Best Practices Guide [2025]',
  metaDescription: 'Learn proven SEO strategies...',
  contentType: 'guide',
  minAcceptableScore: 75,
  verbose: true
});

if (!auditResult.passed) {
  console.log('Audit failed:', auditResult.overallScore);
  console.log('Critical findings:', auditResult.criticalFindings);
}
```

### CTR Optimization

```typescript
import { CTROptimizationEngine } from './lib/ctr-optimization-engine';

const engine = new CTROptimizationEngine();

// Optimize title
const optimized = engine.optimizeTitle(
  'Project Management Guide',
  'project management',
  { addYear: true, addNumber: true }
);
// Result: "10 Best Project Management Tips [2025]"

// Generate variations
const variations = engine.generateVariations(title, 5);

// Score CTR potential
const score = engine.scoreCTRPotential(title, meta);
```

### Content Refresh

```typescript
import { ContentRefreshTrigger } from './lib/content-refresh-trigger';

const trigger = new ContentRefreshTrigger(redisClient);

// Detect if refresh needed
const recommendation = await trigger.detectRefreshNeed(performance);

if (recommendation.priority === 'URGENT') {
  await trigger.triggerRefreshWorkflow(contentId);
}
```

## Directory Structure

```
cfn-seo/
├── SKILL.md              # This file
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── jest.config.js        # Test config
├── lib/                  # Core implementation
│   ├── __tests__/        # Test files
│   │   └── steps/        # Step tests
│   ├── steps/            # Pipeline steps
│   ├── index.ts          # Main exports
│   ├── serp-feature-optimizer.ts
│   ├── ctr-optimization-engine.ts
│   ├── semantic-completeness-analyzer.ts
│   ├── content-refresh-trigger.ts
│   └── ...
├── types/                # TypeScript definitions
├── docs/                 # Documentation
└── examples/             # Usage examples
```

## Expected Impact

| Component | Ranking Impact |
|-----------|---------------|
| SERP Feature Optimizer | 0.5-1.0% (Position 0) |
| Pre-Publication Audit | 0.5-1.0% |
| Semantic Completeness | 0.3-0.5% |
| CTR Optimization | 0.2-0.4% |
| Content Refresh | 0.2-0.3% |
| **Total** | **1.7-3.2%** |

## Dependencies

- Redis (for caching and scheduling)
- TypeScript 5.x
- Jest (for testing)

## Testing

```bash
cd .claude/cfn-extras/skills/cfn-seo
npm test
```

## Related Agents

- `.claude/agents/cfn-seo-team/serp-feature-optimizer.md`
- `.claude/agents/cfn-seo-team/content-seo-strategist.md`
- `.claude/agents/cfn-seo-team/seo-content-writer.md`
- `.claude/agents/cfn-seo-team/seo-analytics-specialist.md`
