# Programmatic SEO Implementation Guide

**Version:** 1.0.0
**Last Updated:** 2025-11-27
**Status:** Planning

---

## Executive Summary

Programmatic SEO in 2024-2025 requires a fundamental shift from **content generation** to **data + utility delivery**. This document outlines a data-first implementation approach based on what's actually working post-Helpful Content Update.

### Key Insight

> "The template is just the container—the unique data is the ranking signal."

**What's getting penalized:** Template + generic filler + no utility
**What's working:** Template + unique proprietary data + actual utility

---

## Pre-Implementation Decision Gate

Before starting ANY programmatic SEO project, answer these questions:

### Gate 1: Data Asset Check

| Question | Required Answer |
|----------|-----------------|
| Do we have proprietary data competitors can't replicate? | YES |
| Can we get unique data per page (not just variable swaps)? | YES |
| Is the data real-time or frequently updated? | Ideally YES |
| Do we have user-generated content potential? | Bonus |

**If all answers are NO → Do not proceed. Write quality articles instead.**

### Gate 2: Utility Check

| Question | Required Answer |
|----------|-----------------|
| Can each page DO something (calculator, tool, comparison)? | YES |
| Would users bookmark/return to the page for the tool? | YES |
| Does the utility solve a specific user problem? | YES |

**If NO utility possible → Do not proceed.**

### Gate 3: Scale Justification

| Question | Threshold |
|----------|-----------|
| How many unique entities/pages? | Minimum 100 |
| What's the long-tail keyword volume? | >10 searches/month per page avg |
| Can we maintain/update all pages? | YES with automation |

---

## Success Case Studies (What We're Modeling)

### Wise (Currency Pages)
- **Pages:** 1M+ currency conversion pages
- **Traffic:** 60M+ monthly visits
- **Data:** Real-time exchange rates (proprietary feed)
- **Utility:** Live calculator, historical charts, fee comparison
- **Why it works:** Every page has live data + functional tool

### Zapier (Integration Pages)
- **Pages:** 800K+ app integration pages
- **Traffic:** 5.8M monthly visits
- **Data:** Proprietary integration templates, triggers, workflows
- **Utility:** Actual working integrations users can deploy
- **Why it works:** Proprietary data + immediate utility

### TripAdvisor (Location Pages)
- **Pages:** 75M+ pages
- **Traffic:** 226M+ monthly visits
- **Data:** User-generated reviews (millions of unique data points)
- **Utility:** Booking, comparison, saved lists
- **Why it works:** UGC keeps pages unique and fresh

### Common Pattern
```
Proprietary Data + Interactive Utility + Template = Rankings
```

---

## 7-Phase Implementation Pipeline

### Phase 0: Data Foundation (CRITICAL)

**Purpose:** Establish unique data assets before any SEO work.

#### 0.1 Data Asset Inventory

Catalog available data sources:

```yaml
proprietary_data:
  - source: "internal_database"
    type: "product_catalog"
    update_frequency: "daily"
    unique_fields: ["pricing", "availability", "specs"]

  - source: "customer_reviews"
    type: "ugc"
    update_frequency: "real-time"
    unique_fields: ["ratings", "review_text", "verified_purchase"]

external_data:
  - source: "google_places_api"
    type: "location"
    fields: ["address", "hours", "ratings", "photos"]
    cost: "$0.017/request"

  - source: "census_api"
    type: "demographics"
    fields: ["population", "income", "age_distribution"]
    cost: "free"

aggregated_data:
  - name: "cost_of_living_index"
    sources: ["rent_api", "groceries_api", "transport_api"]
    calculation: "weighted_average"
    update_frequency: "monthly"
```

#### 0.2 Data Uniqueness Validation

For each page type, verify unique data availability:

```bash
# Minimum uniqueness requirements
per_page_unique_data_points: >= 5
per_page_unique_words: >= 200 (from data, not template)
data_freshness: <= 30 days old
```

**Example - Location Pages:**
| Field | Source | Unique Per Page? |
|-------|--------|------------------|
| City name | Input | Yes |
| Population | Census API | Yes |
| Median income | Census API | Yes |
| Cost of living | Aggregated | Yes |
| Local businesses | Google Places | Yes |
| User reviews | Internal UGC | Yes |
| Weather data | Weather API | Yes |

#### 0.3 Data Pipeline Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Data Sources   │────▶│  ETL Pipeline   │────▶│  Data Lake      │
│  (APIs, DBs)    │     │  (Transform)    │     │  (Normalized)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Page Generator │◀────│  Data Enricher  │◀────│  Entity Store   │
│  (Templates)    │     │  (Per-Entity)   │     │  (Page Data)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

#### Gate Check: Phase 0

- [ ] Minimum 5 unique data points per page identified
- [ ] Data sources accessible and tested
- [ ] Update frequency defined and achievable
- [ ] Data pipeline architecture documented
- [ ] Cost model validated (API costs at scale)

**DO NOT PROCEED without passing Gate 0.**

---

### Phase 1: Utility Design

**Purpose:** Define and build the interactive tool that makes each page valuable.

#### 1.1 Utility Type Selection

| Page Type | Recommended Utility | User Value |
|-----------|---------------------|------------|
| Product comparison | Interactive comparison table | Side-by-side evaluation |
| Location/city | Cost calculator | Personalized estimates |
| Service | Eligibility checker | Instant qualification |
| Pricing | Quote generator | Custom pricing |
| How-to | Interactive checklist | Progress tracking |
| Reviews | Filter/sort tool | Find relevant reviews |

#### 1.2 Utility Specification Template

```yaml
utility:
  name: "Cost of Living Calculator"
  type: "calculator"

  inputs:
    - field: "income"
      type: "currency"
      required: true
      default: 50000

    - field: "household_size"
      type: "select"
      options: [1, 2, 3, 4, "5+"]
      required: true

  outputs:
    - field: "monthly_budget"
      calculation: "income / 12 * location_factor"
      display: "currency"

    - field: "affordability_score"
      calculation: "compare_to_median(income, location)"
      display: "percentage"

    - field: "recommendation"
      logic: "if affordability > 0.8 then 'comfortable' else 'tight'"
      display: "text"

  data_dependencies:
    - "median_rent[location]"
    - "median_income[location]"
    - "cost_index[location]"
```

#### 1.3 Utility Implementation

Build utility as standalone component before template integration:

```javascript
// utilities/cost-calculator.js
export function calculateCostOfLiving(inputs, locationData) {
  const { income, householdSize } = inputs;
  const { medianRent, costIndex, medianIncome } = locationData;

  const adjustedIncome = income / householdSize;
  const monthlyBudget = adjustedIncome / 12;
  const rentBurden = medianRent / monthlyBudget;
  const affordabilityScore = (adjustedIncome / medianIncome) * 100;

  return {
    monthlyBudget: formatCurrency(monthlyBudget),
    rentBurden: formatPercentage(rentBurden),
    affordabilityScore: Math.round(affordabilityScore),
    recommendation: getRecommendation(affordabilityScore, rentBurden),
    comparison: {
      vsNational: compareToNational(costIndex),
      vsState: compareToState(costIndex, locationData.state)
    }
  };
}
```

#### 1.4 Utility Testing

```bash
# Test utility independently
npm run test:utilities

# Required test coverage
- Input validation (edge cases, invalid inputs)
- Calculation accuracy (known values)
- Output formatting (display requirements)
- Performance (<100ms response time)
- Accessibility (keyboard navigation, screen readers)
```

#### Gate Check: Phase 1

- [ ] Utility type defined for each page category
- [ ] Utility specification documented
- [ ] Standalone utility implemented and tested
- [ ] Performance benchmarks met (<100ms)
- [ ] Accessibility requirements validated
- [ ] Utility provides clear user value (not just SEO decoration)

---

### Phase 2: Template Engineering

**Purpose:** Design minimal templates that showcase data and utility.

#### 2.1 Template Philosophy

**Wrong approach:**
```
[500 words of SEO content]
[Small data widget]
[More SEO content]
```

**Right approach:**
```
[Brief intro - 50 words]
[UTILITY TOOL - prominent, above fold]
[Data visualization/table]
[Supporting data context - 200 words from data]
[FAQ from real questions]
[Related entities - internal links]
```

#### 2.2 Template Structure

```html
<!-- Template: location-page.html -->
<article class="programmatic-page" data-entity-type="location">

  <!-- Above Fold: Utility First -->
  <header>
    <h1>{{utility_headline}}: {{entity.name}}</h1>
    <p class="subtitle">{{data.quick_stat}} | Updated {{data.last_updated}}</p>
  </header>

  <section class="utility-primary">
    <!-- Interactive tool component -->
    {{> utility/cost-calculator entity=entity }}
  </section>

  <!-- Data Visualization -->
  <section class="data-display">
    <h2>{{entity.name}} at a Glance</h2>
    {{> components/data-table data=entity.stats }}
    {{> components/comparison-chart data=entity.comparisons }}
  </section>

  <!-- Data-Driven Content (NOT LLM-generated filler) -->
  <section class="data-context">
    <h2>Understanding {{entity.metric}} in {{entity.name}}</h2>
    <p>
      The average {{entity.metric}} in {{entity.name}} is
      <strong>{{entity.value}}</strong>, which is
      {{entity.comparison_text}} the {{entity.comparison_baseline}}
      average of {{entity.baseline_value}}.
    </p>
    <!-- More data-driven paragraphs -->
    {{#each entity.data_paragraphs}}
      <p>{{this}}</p>
    {{/each}}
  </section>

  <!-- User-Generated Content (if available) -->
  {{#if entity.reviews}}
  <section class="ugc-section">
    <h2>What People Say About {{entity.name}}</h2>
    {{> components/reviews reviews=entity.reviews limit=5 }}
  </section>
  {{/if}}

  <!-- FAQ from Real Search Queries -->
  <section class="faq-section" itemscope itemtype="https://schema.org/FAQPage">
    <h2>Frequently Asked Questions</h2>
    {{#each entity.faqs}}
      {{> components/faq-item question=this.q answer=this.a }}
    {{/each}}
  </section>

  <!-- Internal Linking -->
  <section class="related-entities">
    <h2>Compare with Similar {{entity.type_plural}}</h2>
    {{> components/entity-cards entities=entity.related limit=6 }}
  </section>

</article>
```

#### 2.3 Content Generation Rules

| Content Type | Generation Method | LLM Usage |
|--------------|-------------------|-----------|
| Headlines | Template + data | NO |
| Data paragraphs | Template + data | NO |
| Comparisons | Calculated from data | NO |
| Intro sentences | Variation bank (pre-generated) | One-time |
| Transitions | Variation bank | One-time |
| FAQ answers | Template + data | Minimal |
| CTA text | Variation bank | One-time |

**LLM Budget per 1000 pages:** ~$10-20 (variation bank generation only)

#### 2.4 Variation Banks

Pre-generate variations to avoid per-page LLM calls:

```yaml
# variations/intros.yaml
location_intro:
  - "Looking to understand the cost of living in {city}? Here's what the data shows."
  - "Considering a move to {city}? Let's break down the real costs."
  - "{city} attracts thousands of new residents each year. Here's why—and what it costs."
  - "The cost of living in {city} might surprise you. Here are the facts."
  # ... 20+ variations

comparison_phrases:
  higher:
    - "{percentage} higher than"
    - "{percentage} above"
    - "exceeds by {percentage}"
  lower:
    - "{percentage} lower than"
    - "{percentage} below"
    - "{percentage} less than"
  similar:
    - "roughly comparable to"
    - "in line with"
    - "similar to"
```

#### 2.5 Template Validation

Before generating ANY pages, validate template quality:

```bash
# Template validation requirements
npx cfn-spawn template-validator --template location-page.html

Checks:
- [ ] Data binding coverage (all {{}} resolved)
- [ ] Utility integration (tool renders and functions)
- [ ] Schema markup (valid JSON-LD)
- [ ] Mobile responsiveness
- [ ] Accessibility (WCAG 2.1 AA)
- [ ] Page speed (Core Web Vitals targets)
```

**Full validation with 4 validators on 5 sample entities:**
- humanizer-validator: ≥0.98
- seo-validator: ≥0.98
- utility-validator: ≥0.98
- data-validator: ≥0.98

**Consensus threshold for template approval: 0.98**

#### Gate Check: Phase 2

- [ ] Template prioritizes utility above fold
- [ ] Minimal LLM content (variation banks only)
- [ ] All data bindings documented
- [ ] Schema markup integrated
- [ ] Template validated (0.98 consensus)
- [ ] Mobile and accessibility tested

---

### Phase 3: Data Assembly

**Purpose:** Generate pages by injecting data into templates.

#### 3.1 Entity Data Structure

```typescript
interface EntityData {
  // Identity
  id: string;
  slug: string;
  name: string;
  type: 'location' | 'product' | 'service';

  // Core Data (unique per entity)
  stats: {
    [key: string]: {
      value: number | string;
      formatted: string;
      source: string;
      lastUpdated: Date;
    }
  };

  // Computed Comparisons
  comparisons: {
    vsNational: ComparisonData;
    vsCategory: ComparisonData;
    vsNeighbors: ComparisonData[];
  };

  // Generated Content (from data, not LLM)
  dataParagraphs: string[];

  // UGC (if available)
  reviews?: Review[];
  ratings?: AggregateRating;

  // FAQs (from real search queries)
  faqs: FAQ[];

  // Internal Linking
  related: EntityReference[];
  parent?: EntityReference;
  children?: EntityReference[];

  // SEO
  meta: {
    title: string;        // Formula-generated
    description: string;  // Formula-generated
    canonical: string;
    schema: object;       // Auto-generated from data
  };

  // Freshness
  dataUpdatedAt: Date;
  pageGeneratedAt: Date;
}
```

#### 3.2 Data Assembly Pipeline

```javascript
// assembly/generate-pages.js
async function assemblePages(entities, template) {
  const results = [];

  for (const entity of entities) {
    // 1. Enrich with external data
    const enrichedEntity = await enrichEntity(entity);

    // 2. Calculate comparisons
    enrichedEntity.comparisons = calculateComparisons(enrichedEntity, globalStats);

    // 3. Generate data paragraphs (no LLM)
    enrichedEntity.dataParagraphs = generateDataParagraphs(enrichedEntity);

    // 4. Select variations (from pre-generated bank)
    enrichedEntity.intro = selectVariation('intro', enrichedEntity);
    enrichedEntity.cta = selectVariation('cta', enrichedEntity);

    // 5. Generate SEO meta (formula-based)
    enrichedEntity.meta = generateMeta(enrichedEntity);

    // 6. Generate schema (from data)
    enrichedEntity.schema = generateSchema(enrichedEntity);

    // 7. Render template
    const html = await renderTemplate(template, enrichedEntity);

    results.push({
      entity: enrichedEntity,
      html,
      path: `/${enrichedEntity.type}/${enrichedEntity.slug}`
    });
  }

  return results;
}
```

#### 3.3 Formula-Based SEO

No LLM calls for SEO elements:

```javascript
// seo/meta-generator.js
function generateMeta(entity) {
  const templates = {
    location: {
      title: `Cost of Living in ${entity.name} (${entity.year}) | ${BRAND}`,
      description: `${entity.name} cost of living is ${entity.comparisons.vsNational.text}. ` +
        `Average rent: ${entity.stats.rent.formatted}. ` +
        `Use our calculator to plan your budget.`
    },
    product: {
      title: `${entity.name} Review & Comparison (${entity.year}) | ${BRAND}`,
      description: `${entity.name} rated ${entity.ratings.average}/5 by ${entity.ratings.count} users. ` +
        `Price: ${entity.stats.price.formatted}. Compare features and alternatives.`
    }
  };

  const meta = templates[entity.type];

  // Validate lengths
  if (meta.title.length > 60) {
    meta.title = truncateTitle(meta.title, entity);
  }
  if (meta.description.length > 160) {
    meta.description = truncateDescription(meta.description);
  }

  return meta;
}
```

#### 3.4 Parallel Generation

```javascript
// assembly/batch-generate.js
async function batchGenerate(entities, options = {}) {
  const {
    concurrency = 20,
    batchSize = 100,
    outputDir = 'content/generated'
  } = options;

  const batches = chunk(entities, batchSize);
  const results = [];

  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(entity =>
        limit(() => assemblePages([entity], template), concurrency)
      )
    );

    results.push(...batchResults.flat());

    // Progress logging
    console.log(`Generated ${results.length}/${entities.length} pages`);
  }

  return results;
}

// Performance target: 1000 pages in <5 minutes
```

#### Gate Check: Phase 3

- [ ] All entities have complete data
- [ ] Data paragraphs generated from data (no LLM)
- [ ] Meta tags within length limits
- [ ] Schema markup valid for all pages
- [ ] Generation performance meets target

---

### Phase 4: Quality Assurance

**Purpose:** Validate quality at scale without per-page LLM review.

#### 4.1 Validation Pyramid

```
                    ┌─────────────────┐
                    │  Human Review   │  1-2% (10-20 pages)
                    │  (Spot Check)   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Statistical   │  5-10% (50-100 pages)
                    │   LLM Sampling  │  4 validators
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Embedding     │  100% (all pages)
                    │   Uniqueness    │  <$0.01/page
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Rule-Based    │  100% (all pages)
                    │   Validation    │  $0/page
                    └─────────────────┘
```

#### 4.2 Tier 1: Rule-Based Validation (100%)

```javascript
// validation/rules.js
const rules = {
  dataCompleteness: {
    check: (page) => {
      const required = ['name', 'stats', 'comparisons', 'meta', 'schema'];
      return required.every(field => page.entity[field] != null);
    },
    severity: 'error'
  },

  wordCount: {
    check: (page) => {
      const text = extractText(page.html);
      return text.split(/\s+/).length >= 800;
    },
    severity: 'error'
  },

  metaTitleLength: {
    check: (page) => page.entity.meta.title.length <= 60,
    severity: 'error'
  },

  metaDescriptionLength: {
    check: (page) => {
      const len = page.entity.meta.description.length;
      return len >= 150 && len <= 160;
    },
    severity: 'warning'
  },

  schemaValid: {
    check: (page) => validateJsonLd(page.entity.schema),
    severity: 'error'
  },

  internalLinks: {
    check: (page) => {
      const links = extractInternalLinks(page.html);
      return links.length >= 5;
    },
    severity: 'warning'
  },

  utilityPresent: {
    check: (page) => page.html.includes('data-utility='),
    severity: 'error'
  },

  imagesHaveAlt: {
    check: (page) => {
      const images = extractImages(page.html);
      return images.every(img => img.alt && img.alt.length > 0);
    },
    severity: 'warning'
  },

  noPlaceholders: {
    check: (page) => !page.html.includes('{{') && !page.html.includes('undefined'),
    severity: 'error'
  }
};

async function validateBatch(pages) {
  const results = {
    passed: [],
    failed: [],
    warnings: []
  };

  for (const page of pages) {
    const failures = [];
    const warnings = [];

    for (const [name, rule] of Object.entries(rules)) {
      if (!rule.check(page)) {
        if (rule.severity === 'error') {
          failures.push(name);
        } else {
          warnings.push(name);
        }
      }
    }

    if (failures.length > 0) {
      results.failed.push({ page, failures });
    } else {
      results.passed.push(page);
      if (warnings.length > 0) {
        results.warnings.push({ page, warnings });
      }
    }
  }

  return results;
}
```

#### 4.3 Tier 2: Embedding Uniqueness (100%)

```javascript
// validation/uniqueness.js
async function checkUniqueness(pages, threshold = 0.85) {
  // Generate embeddings for all pages
  const embeddings = await Promise.all(
    pages.map(page => embed(extractText(page.html)))
  );

  const duplicatePairs = [];

  // Compare all pairs
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const similarity = cosineSimilarity(embeddings[i], embeddings[j]);

      if (similarity > threshold) {
        duplicatePairs.push({
          page1: pages[i],
          page2: pages[j],
          similarity
        });
      }
    }
  }

  return {
    totalPages: pages.length,
    duplicatePairs,
    uniquenessScore: 1 - (duplicatePairs.length / pages.length)
  };
}

// Remediation for duplicates
async function remediateDuplicates(pairs) {
  for (const pair of pairs) {
    // Option 1: Add more unique data
    const enriched = await enrichWithMoreData(pair.page2);

    // Option 2: Use different template variation
    if (stillTooSimilar(enriched, pair.page1)) {
      enriched = applyDifferentTemplate(pair.page2);
    }

    // Option 3: Flag for manual review
    if (stillTooSimilar(enriched, pair.page1)) {
      flagForReview(pair);
    }
  }
}
```

#### 4.4 Tier 3: Statistical LLM Sampling (5-10%)

```javascript
// validation/statistical-sample.js
async function statisticalValidation(pages, sampleRate = 0.05) {
  const sampleSize = Math.max(50, Math.ceil(pages.length * sampleRate));
  const sample = randomSample(pages, sampleSize);

  const validators = [
    'humanizer-validator',
    'seo-validator',
    'data-accuracy-validator',
    'utility-validator'
  ];

  const scores = [];

  for (const page of sample) {
    const pageScores = await Promise.all(
      validators.map(v => runValidator(v, page))
    );

    scores.push({
      page,
      scores: Object.fromEntries(validators.map((v, i) => [v, pageScores[i]])),
      consensus: average(pageScores)
    });
  }

  const averageConsensus = average(scores.map(s => s.consensus));

  return {
    sampleSize,
    averageConsensus,
    passRate: scores.filter(s => s.consensus >= 0.90).length / sampleSize,
    failedPages: scores.filter(s => s.consensus < 0.90),
    recommendation: averageConsensus >= 0.92 ? 'APPROVE_BATCH' : 'FIX_TEMPLATE'
  };
}
```

#### 4.5 Tier 4: Human Spot Check (1-2%)

```javascript
// validation/human-review.js
function selectForHumanReview(pages, validationResults) {
  const reviewQueue = [];

  // Edge cases
  reviewQueue.push(...validationResults.warnings.slice(0, 5));

  // Random sample
  const randomPages = randomSample(
    validationResults.passed,
    Math.ceil(pages.length * 0.01)
  );
  reviewQueue.push(...randomPages);

  // Statistical outliers
  const outliers = validationResults.scores
    .filter(s => s.consensus < 0.95 && s.consensus >= 0.90)
    .slice(0, 5);
  reviewQueue.push(...outliers.map(o => o.page));

  return {
    reviewQueue,
    checklist: [
      'Data accuracy spot check',
      'Utility functionality test',
      'Mobile rendering check',
      'User value assessment',
      'Competitor comparison'
    ]
  };
}
```

#### Gate Check: Phase 4

- [ ] Rule-based validation: 100% pass rate (errors)
- [ ] Uniqueness score: ≥0.95 (max 5% similar pairs)
- [ ] Statistical sample consensus: ≥0.92
- [ ] Human review: No critical issues
- [ ] Duplicate pairs remediated or flagged

---

### Phase 5: Link Architecture

**Purpose:** Build intelligent internal linking at scale.

#### 5.1 Link Graph Construction

```javascript
// linking/graph.js
async function buildLinkGraph(pages) {
  // Generate embeddings
  const embeddings = await Promise.all(
    pages.map(p => embed(p.entity.name + ' ' + p.entity.dataParagraphs.join(' ')))
  );

  // Build k-nearest neighbors graph
  const graph = new Map();

  for (let i = 0; i < pages.length; i++) {
    const neighbors = findKNearest(embeddings, i, k = 10);

    graph.set(pages[i].entity.id, {
      page: pages[i],
      neighbors: neighbors.map(n => ({
        id: pages[n.index].entity.id,
        similarity: n.similarity,
        page: pages[n.index]
      }))
    });
  }

  return graph;
}
```

#### 5.2 Link Injection Rules

```javascript
// linking/inject.js
const linkingRules = {
  // Minimum links per page
  minInternalLinks: 5,
  maxInternalLinks: 15,

  // Link distribution
  distribution: {
    semantic: 3,      // Most similar pages
    hierarchical: 2,  // Parent/child in taxonomy
    categorical: 2,   // Same category siblings
    popular: 1        // High-traffic pages
  },

  // Anchor text rules
  anchorText: {
    exactMatch: 0.2,      // 20% exact keyword match
    partial: 0.4,         // 40% partial match
    branded: 0.2,         // 20% branded
    natural: 0.2          // 20% natural phrases
  }
};

function injectLinks(page, linkGraph, existingContent) {
  const node = linkGraph.get(page.entity.id);
  const linksToAdd = [];

  // Select link targets based on distribution
  const semanticTargets = node.neighbors.slice(0, 3);
  const hierarchicalTargets = getHierarchicalLinks(page);
  const categoryTargets = getCategorySiblings(page, 2);
  const popularTargets = getPopularPages(1);

  const targets = [
    ...semanticTargets,
    ...hierarchicalTargets,
    ...categoryTargets,
    ...popularTargets
  ];

  // Find insertion points and add links
  for (const target of targets) {
    const anchor = selectAnchorText(target, linkingRules.anchorText);
    const position = findBestInsertionPoint(existingContent, anchor, target);

    if (position) {
      linksToAdd.push({ position, anchor, target });
    }
  }

  return applyLinks(existingContent, linksToAdd);
}
```

#### 5.3 Link Validation

```javascript
// linking/validate.js
async function validateLinkGraph(pages, linkGraph) {
  const issues = [];

  // Check for orphan pages (no inbound links)
  const inboundCounts = new Map();
  for (const [id, node] of linkGraph) {
    for (const neighbor of node.neighbors) {
      inboundCounts.set(
        neighbor.id,
        (inboundCounts.get(neighbor.id) || 0) + 1
      );
    }
  }

  const orphans = pages.filter(p => !inboundCounts.has(p.entity.id));
  if (orphans.length > 0) {
    issues.push({ type: 'orphan_pages', count: orphans.length, pages: orphans });
  }

  // Check link counts
  for (const [id, node] of linkGraph) {
    const outbound = node.neighbors.length;
    if (outbound < linkingRules.minInternalLinks) {
      issues.push({
        type: 'insufficient_links',
        page: node.page,
        count: outbound
      });
    }
  }

  // Check for broken links
  const brokenLinks = await checkBrokenLinks(pages);
  if (brokenLinks.length > 0) {
    issues.push({ type: 'broken_links', links: brokenLinks });
  }

  return {
    valid: issues.filter(i => i.type !== 'orphan_pages').length === 0,
    issues
  };
}
```

#### Gate Check: Phase 5

- [ ] All pages have ≥5 internal links
- [ ] No orphan pages
- [ ] No broken links
- [ ] Anchor text distribution within rules
- [ ] Link graph is connected (no isolated clusters)

---

### Phase 6: Schema & Publishing

**Purpose:** Add structured data and prepare for indexing.

#### 6.1 Schema Generation

```javascript
// schema/generator.js
const schemaTemplates = {
  location: (entity) => ({
    "@context": "https://schema.org",
    "@type": "Place",
    "name": entity.name,
    "description": entity.meta.description,
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": entity.stats.latitude.value,
      "longitude": entity.stats.longitude.value
    },
    "aggregateRating": entity.ratings ? {
      "@type": "AggregateRating",
      "ratingValue": entity.ratings.average,
      "reviewCount": entity.ratings.count
    } : undefined
  }),

  product: (entity) => ({
    "@context": "https://schema.org",
    "@type": "Product",
    "name": entity.name,
    "description": entity.meta.description,
    "image": entity.images?.[0],
    "brand": {
      "@type": "Brand",
      "name": entity.brand
    },
    "offers": {
      "@type": "Offer",
      "price": entity.stats.price.value,
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    },
    "aggregateRating": entity.ratings ? {
      "@type": "AggregateRating",
      "ratingValue": entity.ratings.average,
      "reviewCount": entity.ratings.count
    } : undefined
  }),

  faq: (faqs) => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  })
};

function generateSchema(entity) {
  const schemas = [];

  // Main entity schema
  schemas.push(schemaTemplates[entity.type](entity));

  // FAQ schema if FAQs present
  if (entity.faqs?.length > 0) {
    schemas.push(schemaTemplates.faq(entity.faqs));
  }

  // Breadcrumb schema
  schemas.push(generateBreadcrumbSchema(entity));

  return schemas;
}
```

#### 6.2 Sitemap Generation

```javascript
// publishing/sitemap.js
function generateSitemap(pages) {
  const sitemap = {
    urlset: {
      '@xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9',
      url: pages.map(page => ({
        loc: `${BASE_URL}${page.path}`,
        lastmod: page.entity.dataUpdatedAt.toISOString().split('T')[0],
        changefreq: getChangeFreq(page.entity.type),
        priority: getPriority(page.entity)
      }))
    }
  };

  // Split into multiple sitemaps if >50,000 URLs
  if (pages.length > 50000) {
    return generateSitemapIndex(pages);
  }

  return sitemap;
}
```

#### 6.3 Indexing Request

```javascript
// publishing/index.js
async function requestIndexing(pages, options = {}) {
  const { batchSize = 100, delayMs = 1000 } = options;

  // Use Google Indexing API for eligible pages
  // Or submit sitemap to Search Console

  const batches = chunk(pages, batchSize);

  for (const batch of batches) {
    await submitToSearchConsole(batch.map(p => p.path));
    await delay(delayMs);
  }

  console.log(`Submitted ${pages.length} pages for indexing`);
}
```

#### Gate Check: Phase 6

- [ ] Schema validates (Google Rich Results Test)
- [ ] Sitemap generated and valid
- [ ] Sitemap submitted to Search Console
- [ ] Robots.txt allows crawling
- [ ] Pages accessible (no 404s, 500s)

---

### Phase 7: Freshness & Monitoring

**Purpose:** Keep pages updated and track performance.

#### 7.1 Freshness System

```javascript
// freshness/scheduler.js
const refreshSchedules = {
  realtime: {
    frequency: 'hourly',
    dataTypes: ['prices', 'availability', 'exchange_rates']
  },
  daily: {
    frequency: 'daily',
    dataTypes: ['weather', 'traffic', 'news']
  },
  weekly: {
    frequency: 'weekly',
    dataTypes: ['reviews', 'ratings', 'rankings']
  },
  monthly: {
    frequency: 'monthly',
    dataTypes: ['demographics', 'statistics', 'comparisons']
  }
};

async function refreshPages(schedule) {
  const pagesToRefresh = await getPagesForRefresh(schedule);

  for (const page of pagesToRefresh) {
    // Fetch fresh data
    const freshData = await fetchFreshData(page.entity, schedule.dataTypes);

    // Update entity
    const updatedEntity = mergeData(page.entity, freshData);

    // Regenerate page
    const updatedPage = await assemblePage(updatedEntity);

    // Update timestamp
    updatedPage.entity.dataUpdatedAt = new Date();

    // Publish update
    await publishPage(updatedPage);
  }
}

// Cron job
// 0 * * * * refreshPages(refreshSchedules.realtime)   // Hourly
// 0 0 * * * refreshPages(refreshSchedules.daily)      // Daily
// 0 0 * * 0 refreshPages(refreshSchedules.weekly)     // Weekly
// 0 0 1 * * refreshPages(refreshSchedules.monthly)    // Monthly
```

#### 7.2 Performance Monitoring

```javascript
// monitoring/gsc-integration.js
async function monitorPerformance() {
  const gscData = await fetchSearchConsoleData({
    startDate: '30daysAgo',
    endDate: 'today',
    dimensions: ['page', 'query']
  });

  const alerts = [];

  // Traffic drop detection
  const trafficByPage = aggregateByPage(gscData);
  for (const [page, metrics] of trafficByPage) {
    const weekOverWeek = calculateWoW(metrics.clicks);

    if (weekOverWeek < -0.3) { // 30% drop
      alerts.push({
        type: 'traffic_drop',
        page,
        drop: weekOverWeek,
        action: 'investigate'
      });
    }
  }

  // Position changes
  const positionChanges = detectPositionChanges(gscData);
  alerts.push(...positionChanges.filter(c => c.change > 5));

  // Crawl errors
  const crawlErrors = await fetchCrawlErrors();
  alerts.push(...crawlErrors.map(e => ({ type: 'crawl_error', ...e })));

  return alerts;
}
```

#### 7.3 Content Decay Detection

```javascript
// monitoring/decay.js
async function detectContentDecay(pages) {
  const decayingPages = [];

  for (const page of pages) {
    const metrics = await getPageMetrics(page.path);

    // Signals of decay
    const signals = {
      trafficDecline: metrics.clicks30d < metrics.clicks90d * 0.5,
      positionDecline: metrics.avgPosition > metrics.avgPosition90d + 5,
      staleData: daysSince(page.entity.dataUpdatedAt) > 90,
      competitorGains: await checkCompetitorRankings(page)
    };

    const decayScore = Object.values(signals).filter(Boolean).length;

    if (decayScore >= 2) {
      decayingPages.push({
        page,
        signals,
        decayScore,
        recommendation: getDecayRecommendation(signals)
      });
    }
  }

  return decayingPages;
}

function getDecayRecommendation(signals) {
  if (signals.staleData) return 'refresh_data';
  if (signals.competitorGains) return 'enhance_content';
  if (signals.positionDecline) return 'check_technical_seo';
  return 'monitor';
}
```

---

## Cost Model

### Per-Project Costs (1000 Pages)

| Phase | Activity | Cost |
|-------|----------|------|
| Phase 0 | Data pipeline setup | $0 (one-time dev) |
| Phase 0 | External API calls | $50-200 (varies) |
| Phase 1 | Utility development | $0 (one-time dev) |
| Phase 2 | Template validation (LLM) | $10-20 |
| Phase 3 | Page generation | $0 (no LLM) |
| Phase 4 | Embedding uniqueness | $5-10 |
| Phase 4 | Statistical sampling (LLM) | $40-50 |
| Phase 5 | Link graph construction | $5-10 |
| Phase 6 | Schema validation | $0 (rule-based) |
| **Total** | | **$110-290** |

**Cost per page: $0.11-0.29**

### Comparison with Article Pipeline

| Metric | Article Pipeline | Programmatic Pipeline |
|--------|------------------|----------------------|
| Pages | 1-10 | 100-10,000 |
| Cost/page | $1-15 | $0.11-0.29 |
| Time/page | 30-60 min | <1 second |
| LLM calls/page | 15-20 | ~0.05 |
| Unique value | LLM content | Data + utility |

---

## Implementation Checklist

### Pre-Launch

- [ ] Gate 0: Data asset validation complete
- [ ] Gate 1: Utility design and implementation complete
- [ ] Gate 2: Template validation (0.98 consensus)
- [ ] Phase 3: All pages generated
- [ ] Phase 4: Quality gates passed
- [ ] Phase 5: Link architecture complete
- [ ] Phase 6: Schema validated, sitemap submitted

### Post-Launch (Week 1)

- [ ] Monitor indexing status
- [ ] Check for crawl errors
- [ ] Verify schema in Rich Results
- [ ] Baseline traffic metrics

### Ongoing

- [ ] Weekly: Performance monitoring
- [ ] Monthly: Content decay check
- [ ] Quarterly: Full corpus validation
- [ ] As needed: Data refresh cycles

---

## Anti-Patterns to Avoid

### 1. Template Without Data
**Wrong:** "[City] is a great place to live. Contact us for more info."
**Right:** "[City] has a population of [X], median income of [Y], and cost of living index of [Z]."

### 2. Data Without Utility
**Wrong:** Display data in a static table.
**Right:** Interactive calculator that uses the data.

### 3. Mass Generation Without Validation
**Wrong:** Generate 10,000 pages, publish immediately.
**Right:** Template validation → batch generation → quality gates → staged rollout.

### 4. One-Time Publish
**Wrong:** Publish pages and forget.
**Right:** Data refresh schedules, performance monitoring, decay detection.

### 5. Ignoring Duplicate Risk
**Wrong:** Trust that variable swaps create unique pages.
**Right:** Embedding-based uniqueness validation, remediation pipeline.

---

## Appendix: Agent Roles

| Agent | Role | Phase |
|-------|------|-------|
| data-engineer | Data pipeline, ETL | Phase 0 |
| programmatic-seo-engineer | Template design, generation | Phase 2-3 |
| seo-validator | SEO rule checks | Phase 4 |
| data-accuracy-validator | Data validation | Phase 4 |
| utility-validator | Tool functionality | Phase 4 |
| humanizer-validator | Content quality | Phase 4 |
| link-building-specialist | Link architecture | Phase 5 |
| schema-markup-engineer | Schema generation | Phase 6 |

---

## References

- [Backlinko - Programmatic SEO Guide](https://backlinko.com/programmatic-seo)
- [Zapier - Programmatic SEO](https://zapier.com/blog/programmatic-seo/)
- [Semrush - What Is Programmatic SEO](https://www.semrush.com/blog/programmatic-seo/)
- [Ahrefs - Programmatic SEO Explained](https://ahrefs.com/blog/programmatic-seo/)
- [Helpful Content Update Impact](https://www.amsive.com/insights/seo/googles-helpful-content-update-ranking-system-what-happened-and-what-changed-in-2024/)
