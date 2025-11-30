# SEO Intelligence System: Cross-Domain Learning Architecture

**Status:** Planning
**Scope:** Multi-project SEO intelligence with shared learnings and competitor analysis
**Integration:** RuVector-powered pattern recognition and knowledge transfer

---

## Executive Summary

This system enables SEO intelligence sharing across multiple personal projects/domains while maintaining project isolation where needed. It combines:

1. **SERP Analysis Engine** - Systematic analysis of ranking pages
2. **Competitor Deep Analysis** - Site-wide pattern extraction from winners
3. **Cross-Project Learning** - Shared patterns across your domains
4. **Algorithm Prediction** - Forward-looking strategy based on historical patterns

---

## Part 1: Architecture

### Storage Model

```
~/.cfn/seo/                              # Global SEO intelligence
├── global-seo.ruvector.db              # Cross-project learnings
├── serp-snapshots/                      # Historical SERP data
├── competitor-profiles/                 # Deep site analyses
└── algorithm-history/                   # Update tracking

project-a/.cfn/seo/                      # Project-specific
├── local-seo.ruvector.db               # This domain's data
├── competitors.json                     # Project-specific competitors
└── keyword-tracking/                    # Rank tracking for this site
```

### Collection Schema

#### Global Collections (Shared Across Projects)

**serp_analysis**
- Query patterns and ranking correlations
- What page features correlate with positions 1-10
- Updated continuously as analysis runs

**content_patterns**
- Title tag structures that perform well
- H1/H2 hierarchy patterns
- Content length by query type
- Freshness signals and their impact

**technical_patterns**
- Page speed thresholds by industry
- Schema implementations that win rich snippets
- Mobile experience patterns
- Core Web Vitals correlations

**competitor_profiles**
- Site-wide architectural patterns
- Content strategy breakdowns
- Link architecture analysis
- Gap analysis templates

**algorithm_signals**
- Historical update patterns
- Deprecation trajectories
- Promotion signals
- Risk scoring for tactics

#### Project-Specific Collections

**keyword_rankings**
- This domain's position tracking
- Competitor position tracking
- Movement correlations with changes made

**content_inventory**
- Pages on this domain
- SEO attributes of each
- Internal link structure
- Update history

**local_experiments**
- A/B tests run on this domain
- Results and learnings
- What worked/didn't for this specific site

---

## Part 2: SERP Analysis Engine

### Data Collection Process

#### Step 1: Query Selection

For each project, define query categories:

| Category | Example Queries | Purpose |
|----------|-----------------|---------|
| Head terms | Primary product/service keywords | Track main rankings |
| Long-tail | Specific feature/use case queries | Find opportunities |
| Informational | How-to, what-is queries | Content strategy |
| Competitor brand | "[Competitor] alternative" | Capture switching intent |
| Industry | Broader topic queries | Authority building |

#### Step 2: SERP Capture

For each query, capture:

- Positions 1-100 URLs
- Title tags and meta descriptions
- Rich snippet presence (type, content)
- SERP features present (PAA, featured snippet, video, etc.)
- Domain authority signals
- Timestamp for temporal analysis

#### Step 3: Page Analysis

For each ranking page, extract:

**On-Page Factors**
- Title tag (length, keyword position, modifiers)
- Meta description (length, CTA presence)
- H1 (match to title, keyword presence)
- H2/H3 structure (count, keyword usage)
- Content length (word count by section)
- Internal links (count, anchor text)
- External links (count, authority of targets)
- Images (count, alt text patterns)
- Video presence

**Technical Factors**
- Page speed (LCP, FID, CLS)
- Mobile responsiveness
- HTTPS
- Schema markup (types, completeness)
- Canonical setup
- Index directives

**Content Factors**
- Reading level
- Freshness (publish date, update date)
- Author presence and credentials
- E-E-A-T signals
- Unique data/research presence
- Multimedia depth

#### Step 4: Pattern Extraction

Compare position 1-3 vs position 50+:

- Which factors show strongest correlation with ranking?
- What's the threshold (e.g., word count > 1500 correlates, but > 3000 doesn't help more)
- What combinations appear together in winners?
- What's present in losers that might be negative signals?

### Output: Ranking Factor Model

For each query category:

```
Query Type: "how to [action]" (informational)
Sample Size: 2,847 pages analyzed

Positive Correlations (p < 0.05):
- Step-by-step structure: +34% likelihood of top 10
- Video embed: +28% likelihood
- Table/list presence: +23% likelihood
- Author bio with credentials: +19% likelihood
- Page speed < 2s: +15% likelihood

Negative Correlations:
- Aggressive interstitials: -41% likelihood
- Thin content (< 500 words): -38% likelihood
- No images: -22% likelihood
- Outdated content (> 2 years): -18% likelihood

Threshold Effects:
- Word count: Positive up to 2,000, diminishing after
- Internal links: Positive up to 10, negative after 30
- H2 count: Optimal range 4-8
```

---

## Part 3: Competitor Deep Analysis

### Site-Wide Analysis Framework

For each major competitor, conduct full-site analysis:

#### Architecture Analysis

**URL Structure**
- Pattern recognition (how do they structure URLs?)
- Hierarchy depth (how many levels?)
- Consistency (same pattern across site?)

**Internal Linking**
- Link density (links per page average)
- Hub pages (what pages have most internal links?)
- Orphan pages (pages with few/no internal links)
- Cross-linking patterns (how do sections connect?)

**Site Sections**
- What major sections exist?
- Estimated page count per section
- Which sections rank best?

#### Content Strategy Analysis

**Content Types**
- Blog posts (count, frequency, topics)
- Product/service pages
- Resource pages (guides, tools, templates)
- Programmatic pages (location pages, integration pages, etc.)
- User-generated content

**Topic Coverage**
- What topics do they cover comprehensively?
- What topics are thin or missing?
- How do they cluster related content?

**Content Quality Signals**
- Author attribution patterns
- Update frequency
- Depth indicators (word count, multimedia, data)

#### Technical Analysis

**Performance**
- Average page speed across site
- Core Web Vitals distribution
- Mobile experience quality

**Schema Implementation**
- Which schema types used?
- Coverage (% of pages with schema)
- Richness (how complete is implementation?)

**Crawlability**
- Robots.txt rules
- Sitemap structure
- Pagination handling
- JavaScript rendering requirements

### Competitor Comparison Matrix

For your domain vs each competitor:

| Dimension | Your Site | Competitor A | Competitor B | Gap/Opportunity |
|-----------|-----------|--------------|--------------|-----------------|
| Total indexed pages | X | Y | Z | Need +N pages |
| Blog post count | X | Y | Z | Content gap |
| Avg page speed | X | Y | Z | Technical priority |
| Schema coverage | X% | Y% | Z% | Implementation gap |
| Referring domains | X | Y | Z | Link building need |
| Topic: [specific] | Coverage % | Coverage % | Coverage % | Content opportunity |

### Gap Analysis Output

For each competitor analyzed:

```
Competitor: [Name]
Domain Authority: XX
Indexed Pages: XX,XXX

What They Do Well:
- [Pattern 1]: Description and evidence
- [Pattern 2]: Description and evidence
- [Pattern 3]: Description and evidence

What They Don't Do:
- [Gap 1]: Opportunity for you
- [Gap 2]: Opportunity for you

Replicable Patterns (do this):
- [Specific tactic with implementation notes]

Non-Replicable Advantages (don't try):
- [Advantage they have you can't easily get]

Your Potential Advantages:
- [What you could do that they can't/won't]
```

---

## Part 4: Cross-Project Learning

### Pattern Promotion Protocol

When a pattern proves successful on one of your domains:

#### Eligibility Criteria
- Pattern applied on at least 5 pages
- Measurable positive outcome (ranking improvement, traffic increase)
- Reproducible (not dependent on domain-specific factors)

#### Anonymization
- Remove domain-specific references
- Generalize industry-specific elements
- Abstract to pattern, not specific implementation

#### Storage in Global Collection

```
Pattern: [Title tag structure]
Evidence: Applied on 47 pages across 3 domains, 34 showed ranking improvement
Confidence: 0.87
Industries Tested: [list]
Constraints: Works best for [query type], less effective for [other type]
Implementation Notes: [How to apply]
```

### Pattern Application to New Projects

When starting SEO work on a new domain:

1. **Query global patterns** for relevant industry/content type
2. **Filter by confidence** (> 0.8 for new projects)
3. **Check constraints** (does this pattern apply to this context?)
4. **Apply with tracking** (mark as "pattern-derived" for later analysis)
5. **Report results back** (did it work on this new domain?)

### Cross-Project Insights

**Questions the system can answer:**

- "What title tag patterns work across all my sites?"
- "Which content length works best for my typical audience?"
- "What schema implementations have I validated?"
- "What technical patterns should I apply to all new projects?"

---

## Part 5: Algorithm Prediction Model

### Historical Pattern Database

Track Google algorithm updates:

| Update | Date | Target | Winners | Losers | Recovery Pattern |
|--------|------|--------|---------|--------|------------------|
| [Name] | YYYY-MM | [What it targeted] | [Who improved] | [Who dropped] | [What fixed it] |

### Trajectory Analysis

For each major ranking factor, track:

- **Introduction**: When did this factor start mattering?
- **Growth**: How has its importance changed?
- **Maturity**: Is it now table stakes?
- **Decline signals**: Any indication it's being devalued?

### Prediction Framework

#### Deprecation Risk Scoring

For current tactics, assess:

| Factor | Weight | Assessment |
|--------|--------|------------|
| Automation ease | 25% | How easily can this be automated/faked? |
| Widespread adoption | 25% | How common is this tactic now? |
| Google warnings | 20% | Has Google hinted against this? |
| Quality correlation | 15% | Does this actually indicate quality? |
| Historical precedent | 15% | Have similar tactics been deprecated? |

**Risk Score**: Low / Medium / High / Critical

#### Promotion Potential Scoring

For emerging tactics:

| Factor | Weight | Assessment |
|--------|--------|------------|
| Difficulty to fake | 30% | Hard to game = likely promoted |
| User value | 25% | Does this help users? |
| Google statements | 20% | Has Google indicated this matters? |
| Technical feasibility | 15% | Can Google measure this? |
| Competitive moat | 10% | Does this create sustainable advantage? |

**Potential Score**: Low / Medium / High / Very High

### Prediction Output

For each project, generate:

```
Current Strategy Risk Assessment:

Low Risk (continue):
- [Tactic]: [Why safe]

Medium Risk (monitor):
- [Tactic]: [Concern] - Review in [timeframe]

High Risk (reduce reliance):
- [Tactic]: [Warning signs] - Develop alternative

Emerging Opportunities:

High Potential (invest now):
- [Opportunity]: [Evidence] - Recommended action

Medium Potential (experiment):
- [Opportunity]: [Evidence] - Test approach

Speculative (watch):
- [Opportunity]: [Early signals] - Monitor for confirmation
```

---

## Part 6: Implementation Phases

### Phase 1: Foundation (Weeks 1-2)

**Setup:**
- Create directory structure
- Initialize RuVector databases (global + per-project)
- Define collection schemas
- Build basic query/insert interfaces

**Initial Data:**
- Manual entry of known patterns from experience
- Import any existing competitor research
- Set up keyword tracking for active projects

### Phase 2: SERP Analysis (Weeks 3-4)

**Build:**
- SERP data collection pipeline
- Page analysis extraction
- Pattern correlation engine

**Populate:**
- Run analysis on 50-100 priority queries
- Extract initial ranking factor model
- Validate against known best practices

### Phase 3: Competitor Analysis (Weeks 5-6)

**Build:**
- Site crawl and analysis pipeline
- Comparison matrix generator
- Gap analysis templating

**Execute:**
- Deep analysis of top 3 competitors per project
- Document patterns and gaps
- Generate actionable recommendations

### Phase 4: Cross-Project Learning (Weeks 7-8)

**Build:**
- Pattern promotion workflow
- Cross-project query interface
- Confidence scoring system

**Enable:**
- Connect all project databases to global
- Begin pattern sharing
- Track pattern performance across domains

### Phase 5: Prediction Model (Weeks 9-10)

**Build:**
- Historical update database
- Risk/potential scoring algorithms
- Prediction report generator

**Calibrate:**
- Back-test against historical updates
- Refine scoring weights
- Generate first predictions

### Phase 6: Continuous Operation (Ongoing)

**Regular Activities:**
- Weekly SERP snapshots for tracked queries
- Monthly competitor position checks
- Quarterly deep competitor analysis
- Continuous pattern learning and promotion

---

## Part 7: Integration with CFN Loop

### SEO Task Enrichment

When an SEO task runs through CFN Loop:

**Before Decomposition:**
1. Query global SEO patterns for relevant context
2. Query competitor analysis for this industry
3. Query algorithm predictions for risk assessment
4. Inject relevant learnings into decomposer context

**During Execution:**
1. Apply validated patterns to implementation
2. Flag high-risk tactics for review
3. Reference competitor gaps as opportunities

**After Completion:**
1. Track changes made
2. Set up ranking monitoring
3. Prepare for pattern promotion (if successful)

### Automated Workflows

**Daily:**
- Rank tracking for priority keywords
- Alert on significant position changes

**Weekly:**
- SERP feature monitoring
- Competitor movement alerts
- New content detection

**Monthly:**
- Full SERP analysis refresh
- Pattern performance review
- Recommendation updates

**Quarterly:**
- Deep competitor re-analysis
- Algorithm prediction refresh
- Strategy review and adjustment

---

## Part 8: Success Metrics

### System Health

| Metric | Target | Measurement |
|--------|--------|-------------|
| Pattern accuracy | > 80% | Patterns that improve rankings when applied |
| Prediction accuracy | > 70% | Predictions validated by subsequent updates |
| Cross-project transfer | > 60% | Patterns that work on multiple domains |
| Coverage | > 90% | Queries with sufficient analysis data |

### SEO Outcomes

| Metric | Baseline | Target | Timeframe |
|--------|----------|--------|-----------|
| Ranking improvements | Current | +20% | 6 months |
| Organic traffic | Current | +30% | 6 months |
| Time to rank | Current | -40% | 6 months |
| Content efficiency | Current | +50% | 6 months |

### Learning Velocity

| Metric | Target |
|--------|--------|
| New patterns discovered | 10+ per month |
| Patterns validated | 5+ per month |
| Competitor insights | 2+ per competitor per quarter |
| Prediction updates | Monthly refresh |

---

## Appendix A: Query Templates

### SERP Analysis Queries

```
// Find patterns for specific query type
Query: "What ranking factors correlate with [query type]?"
Filter: confidence > 0.8, sample_size > 100
Return: factors, correlation_strength, threshold_effects

// Find content patterns
Query: "What content structure works for [topic]?"
Filter: industry = [industry], position <= 10
Return: word_count, header_structure, media_types, schema_types
```

### Competitor Analysis Queries

```
// Compare against competitor
Query: "How does [my domain] compare to [competitor] for [topic]?"
Return: coverage_gap, content_depth_gap, technical_gaps, opportunities

// Find competitor weaknesses
Query: "What does [competitor] not do well?"
Filter: their_ranking > 10, topic_relevance > 0.7
Return: gaps, your_potential_advantage, implementation_approach
```

### Cross-Project Queries

```
// Find validated patterns
Query: "What patterns have worked across multiple domains?"
Filter: domains_tested >= 2, success_rate > 0.7
Return: pattern, evidence, implementation_notes

// Check if pattern applies
Query: "Does [pattern] apply to [industry/content type]?"
Return: applicability_score, constraints, modifications_needed
```

---

## Appendix B: Data Sources

### For SERP Analysis

- Google Search API (or SERP scraping tools)
- Page analysis via headless browser
- Core Web Vitals API
- Schema validation tools

### For Competitor Analysis

- Site crawlers (Screaming Frog, custom)
- Backlink databases (Ahrefs, Moz, Majestic)
- Traffic estimation (SimilarWeb, SEMrush)
- Content analysis tools

### For Algorithm Tracking

- Google Search Central Blog
- Search Engine Land / Search Engine Journal
- Moz Algorithm History
- Google Patents
- Industry discussions and experiments

---

## Appendix C: Privacy and Data Handling

### What Gets Shared (Global)

- Anonymized patterns (no domain names)
- Aggregated statistics
- Generic recommendations
- Industry-level insights

### What Stays Local (Per-Project)

- Specific URLs and pages
- Ranking data for your domains
- Competitor-specific intelligence
- Business-sensitive keyword data

### Data Retention

- SERP snapshots: 12 months rolling
- Pattern data: Indefinite (with confidence decay)
- Competitor profiles: Refresh quarterly, keep history
- Algorithm history: Indefinite

---

*Document created for cross-domain SEO intelligence system. Integrates with RuVector for pattern learning and CFN Loop for task execution.*
