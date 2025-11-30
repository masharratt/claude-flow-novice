# Cross-Domain Learning Architecture

**Purpose:** Share SEO learnings across multiple personal domains while maintaining appropriate isolation.

---

## The Opportunity

When you operate multiple domains, each SEO experiment generates learnings. Without a system, these learnings stay siloed. With cross-domain learning:

- Pattern validated on Domain A can be applied immediately to Domain B
- Failures on Domain C prevent repeating mistakes on Domain D
- Aggregate data reveals patterns invisible in single-domain analysis
- Testing velocity multiplies across your portfolio

---

## Part 1: What to Share vs. Isolate

### Always Share (Global Knowledge)

| Category | Examples | Why Shareable |
|----------|----------|---------------|
| Content structure patterns | "H2 with question format increases featured snippets" | Works universally |
| Technical best practices | "LCP < 2.5s correlates with rankings" | Technical truth |
| Schema implementations | "FAQ schema that triggers rich results" | Platform-level |
| Engagement patterns | "Tables in first 500 words help" | User behavior |
| Algorithm observations | "March update hit thin location pages" | Platform-level |
| Competitive tactics | "Zapier's integration page template" | Industry learning |

### Never Share (Domain-Specific)

| Category | Examples | Why Isolated |
|----------|----------|--------------|
| Specific keywords | "best project management software" | Competitive data |
| Ranking positions | "#3 for [keyword]" | Business-sensitive |
| Traffic data | "10K monthly visits" | Business-sensitive |
| Revenue/conversion | "2.5% conversion rate" | Business-sensitive |
| Specific URLs | "domain.com/page" | Identity |
| Competitor specifics | "Domain X ranks for Y" | Context-specific |

### Conditionally Share (Anonymize First)

| Category | Share As | Original Data |
|----------|----------|---------------|
| Title tag tests | "Template: [Primary KW] - [Benefit] - [Brand]" | Actual titles |
| Content performance | "2000-word guides outperform 1000-word by 34%" | Specific articles |
| Link building results | "Resource page links from .edu convert at 3%" | Specific campaigns |
| A/B test results | "CTA above fold: +15% CTR" | Specific page tests |

---

## Part 2: Knowledge Structure

### Global SEO Knowledge Base

```
~/.cfn/seo/global-knowledge/
├── content-patterns/
│   ├── title-tags.json
│   ├── meta-descriptions.json
│   ├── header-structure.json
│   ├── content-length.json
│   ├── media-usage.json
│   └── engagement-patterns.json
├── technical-patterns/
│   ├── page-speed.json
│   ├── schema-markup.json
│   ├── mobile-optimization.json
│   └── core-web-vitals.json
├── link-patterns/
│   ├── internal-linking.json
│   ├── anchor-text.json
│   └── link-acquisition.json
├── competitive-intelligence/
│   ├── industry-patterns/
│   └── tactic-analysis/
├── algorithm-intelligence/
│   ├── update-history.json
│   ├── risk-scores.json
│   └── predictions.json
└── validated-experiments/
    ├── successful.json
    └── failed.json
```

### Domain-Specific Data

```
project/.cfn/seo/
├── keywords/
│   ├── tracking.json
│   └── opportunities.json
├── content/
│   ├── inventory.json
│   └── performance.json
├── competitors/
│   ├── profiles/
│   └── tracking.json
├── experiments/
│   ├── active.json
│   └── completed.json
└── sync-log.json
```

---

## Part 3: Pattern Promotion Workflow

### When a Pattern is Discovered

**Step 1: Local Validation**
- Pattern observed on specific domain
- Document the pattern and evidence
- Mark as "local hypothesis"

**Step 2: Local Testing**
- Apply pattern to multiple pages on same domain
- Collect performance data
- Calculate confidence score

**Step 3: Promotion Decision**

```
If confidence >= 0.8 AND sample_size >= 5:
    Eligible for global promotion

If 0.6 <= confidence < 0.8:
    Candidate for cross-domain testing

If confidence < 0.6:
    Keep local, gather more data
```

**Step 4: Anonymization**

Before promotion, strip:
- Domain names
- Specific URLs
- Keyword data
- Traffic numbers
- Revenue/conversion data

Keep:
- Pattern description
- Evidence structure
- Confidence score
- Sample size
- Industry/content type context

**Step 5: Global Storage**

```json
{
  "pattern_id": "title-tag-003",
  "pattern": "Including current year in title for 'best X' queries",
  "evidence": {
    "domains_tested": 3,
    "pages_tested": 47,
    "success_rate": 0.87,
    "average_improvement": "+12% CTR"
  },
  "context": {
    "industries": ["saas", "ecommerce"],
    "content_types": ["listicle", "comparison"],
    "query_types": ["best X", "top X"]
  },
  "confidence": 0.87,
  "last_validated": "2024-11-28",
  "notes": "Works for annual update content; may hurt evergreen"
}
```

### When Starting Work on a Domain

**Step 1: Query Global Patterns**
- Pull patterns relevant to this domain's industry
- Pull patterns relevant to content types planned
- Pull high-confidence patterns (> 0.8)

**Step 2: Apply Validated Patterns**
- Use proven patterns as defaults
- Skip re-testing validated basics
- Focus testing budget on new hypotheses

**Step 3: Track Pattern Application**
- Mark which global patterns were applied
- Track results on this domain
- Feed results back to global confidence scores

---

## Part 4: Cross-Domain Testing Protocol

For patterns with medium confidence (0.6-0.8), run coordinated tests:

### Multi-Domain Test Design

```
Pattern to test: "Adding video increases time-on-page for how-to content"

Domain A: Control group (no video)
Domain B: Test group (add video)
Domain C: Test group (add video)

Duration: 30 days
Metric: Average time-on-page for how-to articles
Sample: 10+ articles per domain
```

### Aggregated Results

```
Results after 30 days:

Domain A (control): 2:15 avg time-on-page
Domain B (video): 3:42 avg time-on-page (+64%)
Domain C (video): 3:28 avg time-on-page (+54%)

Combined effect: +59% time-on-page with video
Statistical significance: p < 0.01
New confidence score: 0.91

Action: Promote to global with high confidence
```

### Test Coordination Dashboard

| Pattern | Status | Domains | Start Date | End Date | Current Confidence |
|---------|--------|---------|------------|----------|-------------------|
| Video in how-to | Active | A, B, C | 2024-11-01 | 2024-12-01 | 0.72 |
| FAQ schema | Complete | B, C, D | 2024-10-01 | 2024-11-01 | 0.89 |
| Author bio | Planned | A, D | - | - | 0.55 |

---

## Part 5: Learning Categories

### Category 1: Content Patterns

**What to track:**
- Title tag structures that perform
- Meta description patterns
- Header hierarchy approaches
- Content length by type
- Media inclusion patterns
- Internal linking structures

**Promotion criteria:**
- Tested on 2+ domains
- 5+ pages per domain
- Measurable ranking or CTR improvement
- Confidence > 0.75

### Category 2: Technical Patterns

**What to track:**
- Page speed targets that matter
- Schema implementations that work
- Mobile optimization techniques
- Core Web Vitals optimizations
- Crawl budget optimization

**Promotion criteria:**
- Tested on 2+ domains
- Before/after measurement
- Technical validation (not just ranking correlation)
- Confidence > 0.8

### Category 3: Link Patterns

**What to track:**
- Internal link density sweet spots
- Anchor text distributions
- Hub page strategies
- Cross-linking approaches

**Promotion criteria:**
- Tested on 2+ domains
- 30+ pages affected
- Measurable impact on linked page rankings
- Confidence > 0.7

### Category 4: Competitive Intelligence

**What to track:**
- Industry-wide patterns
- Competitor tactics that work
- Market-level trends
- Seasonal patterns

**Promotion criteria:**
- Observed across 3+ competitors
- Validated with your own testing
- Generalizable beyond specific industry

### Category 5: Algorithm Intelligence

**What to track:**
- Update impact observations
- Recovery patterns
- Risk factor validations
- Emerging signals

**Promotion criteria:**
- Observed across 2+ domains
- Consistent with broader industry observations
- Validated with ranking data

---

## Part 6: Confidence Decay Model

Pattern confidence degrades over time:

```
Confidence decay function:
C(t) = C_original × (0.95 ^ months_since_validation)

Example:
Original confidence: 0.90
After 6 months: 0.90 × 0.95^6 = 0.66
After 12 months: 0.90 × 0.95^12 = 0.49
```

### Revalidation Triggers

| Confidence Level | Action |
|------------------|--------|
| > 0.8 | Use with confidence |
| 0.6 - 0.8 | Use but monitor closely |
| 0.4 - 0.6 | Revalidate before use |
| < 0.4 | Archive, don't use |

### Forced Revalidation Events

- Major algorithm update (revalidate affected patterns)
- Industry shift (revalidate industry-specific patterns)
- Technology change (revalidate technical patterns)
- 12 months since last validation (all patterns)

---

## Part 7: Practical Workflows

### Starting a New Domain

1. **Pull global patterns** for the industry
2. **Filter by confidence** (> 0.75 for new domain)
3. **Apply foundational patterns** (technical, basic content structure)
4. **Set up tracking** to contribute data back
5. **Plan experiments** for medium-confidence patterns

### Monthly Learning Sync

1. **Review experiment results** on all domains
2. **Calculate new confidence scores**
3. **Promote validated patterns** to global
4. **Archive failed patterns** with learnings
5. **Plan next month's tests**

### After Algorithm Update

1. **Assess impact** on each domain
2. **Correlate with pattern usage**
3. **Identify affected patterns**
4. **Force revalidation** of impacted patterns
5. **Update risk scores** in algorithm model

### Quarterly Pattern Review

1. **Audit all global patterns** for confidence decay
2. **Prioritize revalidation** for important patterns
3. **Archive low-confidence patterns**
4. **Identify gaps** in pattern coverage
5. **Plan strategic tests** to fill gaps

---

## Part 8: Example Scenarios

### Scenario 1: Title Tag Discovery

**Domain A discovers:** Including "[Updated 2024]" in titles increases CTR for list posts.

**Local validation:**
- Applied to 8 list posts
- 6/8 showed CTR improvement (10-25%)
- 2/8 showed no change
- Local confidence: 0.75

**Cross-domain test:**
- Domain B applies to 10 list posts
- Domain C applies to 5 list posts
- Results after 30 days:
  - Domain B: 8/10 improved
  - Domain C: 4/5 improved

**Global promotion:**
- Combined confidence: 0.86
- Pattern promoted with context: "Works for listicles, may hurt evergreen content"

### Scenario 2: Technical Pattern

**Domain B discovers:** Lazy loading images below the fold improves LCP.

**Local validation:**
- Implemented site-wide
- LCP improved from 3.2s to 2.1s
- No ranking change observed yet
- Local confidence: Technical valid, SEO impact unknown

**Cross-domain validation:**
- Domain A, C, D implement
- All show LCP improvement
- Domain D shows ranking improvement after 60 days
- Others inconclusive

**Global promotion:**
- Technical pattern: High confidence (0.95)
- SEO impact pattern: Medium confidence (0.65)
- Note: "Technical improvement validated; direct ranking impact needs more data"

### Scenario 3: Failed Pattern

**Domain C hypothesis:** Adding testimonials to product pages improves rankings.

**Testing:**
- Added testimonials to 15 product pages
- No ranking improvement after 60 days
- Slight increase in time-on-page
- No conversion impact

**Decision:**
- Do not promote to global
- Archive with note: "No ranking benefit observed; may improve engagement metrics"
- Available for others to see as negative result

---

## Part 9: Integration Points

### With Competitor Analysis

- Competitor patterns feed into global knowledge base
- Cross-reference your tests with competitor observations
- Validate competitor tactics before copying

### With Algorithm Prediction

- Pattern performance informs risk/potential scores
- Algorithm updates trigger pattern revalidation
- Predictions guide testing priorities

### With CFN Loop

- Pull global patterns before decomposition
- Apply validated patterns in implementation
- Track results and feed back to knowledge base

---

## Part 10: Getting Started Checklist

### Initial Setup

- [ ] Create global knowledge directory structure
- [ ] Create domain-specific directories for each project
- [ ] Document known patterns from experience
- [ ] Set up confidence scoring system
- [ ] Create sync log structure

### First Month

- [ ] Pull patterns for first domain's industry
- [ ] Apply high-confidence patterns
- [ ] Set up tracking for pattern performance
- [ ] Identify 3-5 patterns to test
- [ ] Begin first cross-domain test

### First Quarter

- [ ] Complete first cross-domain test cycle
- [ ] Promote first validated patterns
- [ ] Archive first failed patterns
- [ ] Review confidence decay
- [ ] Refine process based on learnings

---

*This system compounds over time. Start with high-confidence patterns, validate through testing, and build a personalized knowledge base that makes each new domain easier than the last.*
