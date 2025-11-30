# Firecrawl Integration Plan for SEO Pipeline

**Version:** 1.0.0
**Created:** 2025-11-29
**Status:** READY FOR IMPLEMENTATION

---

## Executive Summary

Integrate the self-hosted Firecrawl API (`firecrawl-api-ourstories.fly.dev`) into the 11-step SEO pipeline to enable:
- **Competitor content scraping** (Step 2)
- **SERP result content analysis** (Step 3)
- **Research source batch scraping** (Step 4)

This replaces manual WebFetch calls with a structured, rate-limited, SEO-optimized scraping layer.

---

## Current State

### Firecrawl Integration (Complete)
```
Location: .claude/skills/firecrawl-integration/
Files:
  - firecrawl-client.js     # API client (423 lines)
  - test-firecrawl.js       # Integration tests (245 lines)
  - SKILL.md                # Documentation

Status: 5/5 tests passing
  - Health Check: PASS
  - Scrape: PASS
  - Map: PASS
  - Extract: PASS
  - SEO Scrape: PASS
```

### SEO Pipeline (Complete)
```
11-step quality-focused pipeline
6 weighted validators (consensus threshold: 0.85)
Agents: 7 (4 new, 3 enhanced)
Slash command: /seo-blog
```

---

## Integration Points

### Step 2: Competitor Analysis

| Current | With Firecrawl |
|---------|----------------|
| DataForSEO rankings only | Rankings + actual page content |
| No content structure | H1/H2 hierarchy, word count |
| No gap analysis | Content gap identification |

**Agent:** `competitive-seo-analyst`

**Firecrawl Functions:**
```javascript
import { scrapeCompetitors } from '../firecrawl-integration/firecrawl-client.js';

const competitorData = await scrapeCompetitors([
  'https://competitor1.com/article',
  'https://competitor2.com/article',
  // ... top 5 from SERP
]);
```

**Output Enhancement:**
```yaml
# competitor_analysis.yaml
competitors:
  - url: "https://example.com/article"
    scraped_via: "firecrawl"
    scraped_at: "2025-11-29T10:00:00Z"
    content:
      title: "Article Title"
      h1: "Main Heading"
      h2s:
        - "Subheading 1"
        - "Subheading 2"
      word_count: 2500
      reading_time_minutes: 10
    links:
      internal: 15
      external: 8
    structure:
      has_intro: true
      has_conclusion: true
      has_faq: true
      content_type: "how-to-guide"
    key_topics:
      - "topic 1"
      - "topic 2"
```

---

### Step 3: SERP Analysis

| Current | With Firecrawl |
|---------|----------------|
| DataForSEO SERP features | SERP features + page content |
| PAA questions only | PAA + how competitors answer |
| No content comparison | Full content analysis |

**Agent:** `serp-analyst`

**Hybrid Approach:**
1. DataForSEO → SERP structure, rankings, features (PAA, Featured Snippets)
2. Firecrawl → Actual page content from top 5 organic results

**Firecrawl Functions:**
```javascript
import { scrape, batchScrape } from '../firecrawl-integration/firecrawl-client.js';

// Scrape top 5 organic results
const serpContent = await batchScrape(topUrls, {
  formats: ['markdown', 'links'],
  scrapeOptions: { onlyMainContent: true }
});
```

**Output Enhancement:**
```yaml
# serp_analysis.yaml
keyword: "target keyword"
serp_features:
  featured_snippet:
    present: true
    type: "paragraph"
    source_url: "https://..."
  people_also_ask:
    - question: "How do you...?"
      answer_source: "https://..."
      scraped_answer: "The answer is..." # FROM FIRECRAWL
    - question: "What is...?"
      answer_source: "https://..."
      scraped_answer: "..."
organic_results:
  - position: 1
    url: "https://..."
    scraped_content:
      markdown: "Full content..."
      word_count: 2000
      h2_count: 8
    scraped_via: "firecrawl"
```

---

### Step 4: Research with Example Mining

| Current | With Firecrawl |
|---------|----------------|
| WebFetch individual URLs | Batch scraping (15+ URLs) |
| Manual quote extraction | AI-powered extraction |
| Limited source coverage | Comprehensive source mining |

**Agent:** `research-specialist`

**Firecrawl Functions:**
```javascript
import { batchScrape, extract } from '../firecrawl-integration/firecrawl-client.js';

// Batch scrape research sources
const sources = await batchScrape(researchUrls, {
  formats: ['markdown'],
  scrapeOptions: { onlyMainContent: true, timeout: 45000 }
});

// AI extraction for quotes and statistics
const extracted = await extract(expertUrls, {
  prompt: `Extract:
    1. Direct quotes with speaker name and credentials
    2. Statistics with source and year
    3. Real examples with outcomes
    4. Expert opinions with context`
});
```

**Output Enhancement:**
```yaml
# research_document.yaml
facts:
  - fact: "73% of marketers report increased ROI"
    source: "HubSpot State of Marketing 2024"
    url: "https://hubspot.com/..."
    credibility: 0.95
    scraped_via: "firecrawl"
    extraction_method: "ai_extract"

real_examples:
  - source_platform: "reddit"
    subreddit: "r/marketing"
    story: "User implemented strategy X and saw..."
    outcome: "40% increase in conversions"
    url: "https://reddit.com/r/marketing/..."
    authenticity_score: 0.85
    scraped_via: "firecrawl"
    scraped_at: "2025-11-29T10:00:00Z"

expert_sources:
  - name: "Jane Smith"
    credentials: "VP Marketing, Fortune 500"
    expertise_area: "content strategy"
    quote: "The key to success is..."
    url: "https://forbes.com/..."
    scraped_via: "firecrawl"
    extraction_method: "ai_extract"

counter_examples:
  - scenario: "Company tried X approach"
    cause: "Ignored mobile users"
    lesson: "Always test on mobile first"
    source: "https://casestudy.com/..."
    scraped_via: "firecrawl"
```

---

## Implementation Architecture

### New Files to Create

```
.claude/skills/seo-firecrawl/
├── seo-scraper.js          # SEO-specific Firecrawl wrapper
├── seo-scraper.test.js     # Integration tests
└── SKILL.md                # Documentation

Key Functions:
- scrapeCompetitorContent(urls) → Competitor analysis format
- scrapeSerpResults(urls) → SERP content format
- scrapeResearchSources(urls) → Research document format
- extractQuotesAndStats(urls) → AI extraction format
```

### Files to Modify

| File | Changes |
|------|---------|
| `competitive-seo-analyst.md` | Add Firecrawl scraping section |
| `serp-analyst.md` | Add hybrid DataForSEO + Firecrawl approach |
| `research-specialist.md` | Add batchScrape for example mining |
| `seo-blog.md` | Add `--scrape` flag, document integration |
| `SPECIFICATION.md` | Update with Firecrawl details |

---

## Rate Limiting Strategy

| Endpoint | Rate Limit | Pipeline Usage | Strategy |
|----------|------------|----------------|----------|
| `/v2/scrape` | 10 req/min | Step 2 (5 URLs) | Sequential with 6s delay |
| `/v2/batch/scrape` | 3 req/min | Step 4 (15 URLs) | Single batch call |
| `/v2/map` | 5 req/min | Optional | Only for site-wide analysis |
| `/v2/extract` | 5 req/min | Step 4 (quotes) | Batch by 3 URLs |

**Implementation:**
```javascript
// Rate-limited scraping
async function scrapWithRateLimit(urls, delayMs = 6000) {
  const results = [];
  for (const url of urls) {
    results.push(await scrape(url));
    await new Promise(r => setTimeout(r, delayMs));
  }
  return results;
}
```

---

## Fallback Strategy

```
Firecrawl Available?
    │
    ├── YES → Use Firecrawl
    │         │
    │         ├── Scrape succeeds → Use scraped content
    │         │
    │         └── Scrape fails (timeout/error)
    │             │
    │             └── Retry once with longer timeout (60s)
    │                 │
    │                 ├── Success → Use content
    │                 │
    │                 └── Fail → Fall back to WebFetch
    │
    └── NO (health check fails)
        │
        └── Use WebFetch for all URLs
            │
            └── Note in output: scraped_via: "webfetch_fallback"
```

**Agent Instruction Addition:**
```markdown
## Fallback Behavior

If Firecrawl is unavailable or times out:
1. Use WebFetch tool as fallback
2. Mark sources with `scraped_via: "webfetch_fallback"`
3. Continue pipeline - do not abort
4. Log warning for pipeline summary
```

---

## Phased Implementation

### Phase 1: SEO Wrapper Skill (Sprint 1)

**Deliverables:**
- [ ] Create `.claude/skills/seo-firecrawl/seo-scraper.js`
- [ ] Create `.claude/skills/seo-firecrawl/seo-scraper.test.js`
- [ ] Create `.claude/skills/seo-firecrawl/SKILL.md`
- [ ] Verify rate limit handling
- [ ] Verify fallback to WebFetch

**Tests:**
```javascript
// seo-scraper.test.js
describe('SEO Scraper', () => {
  test('scrapeCompetitorContent extracts structure', async () => {...});
  test('scrapeSerpResults includes markdown', async () => {...});
  test('scrapeResearchSources handles batch', async () => {...});
  test('extractQuotesAndStats uses AI extraction', async () => {...});
  test('fallback to WebFetch when Firecrawl fails', async () => {...});
});
```

### Phase 2: Agent Integration (Sprint 2)

**Deliverables:**
- [ ] Update `competitive-seo-analyst.md` with Firecrawl section
- [ ] Update `serp-analyst.md` with hybrid approach
- [ ] Update `research-specialist.md` with batchScrape
- [ ] Add Firecrawl instructions template to all 3 agents

**Agent Section Template:**
```markdown
## Firecrawl Integration

### Available Functions
- `scrapeCompetitorContent(urls)` - Competitor page analysis
- `scrapeSerpResults(urls)` - SERP content extraction
- `scrapeResearchSources(urls)` - Batch source scraping
- `extractQuotesAndStats(urls)` - AI-powered extraction

### Usage
\`\`\`javascript
import { scrapeCompetitorContent } from '.claude/skills/seo-firecrawl/seo-scraper.js';
const data = await scrapeCompetitorContent(competitorUrls);
\`\`\`

### Rate Limits
- Scrape: 10 req/min (use 6s delay between calls)
- Batch: 3 req/min (group URLs into batches of 15)
- Extract: 5 req/min (group URLs into batches of 3)

### Fallback
If Firecrawl unavailable, use WebFetch and mark `scraped_via: "webfetch_fallback"`
```

### Phase 3: Orchestration (Sprint 3)

**Deliverables:**
- [ ] Update `seo-blog.md` with Firecrawl flags
- [ ] Add health check at pipeline start
- [ ] Create artifact paths for scraped content
- [ ] Implement pipeline-level error handling

**Slash Command Updates:**
```markdown
## Arguments
- `--scrape` (default: true) - Enable Firecrawl scraping
- `--scrape-timeout` (default: 45) - Timeout in seconds
- `--scrape-fallback` (default: webfetch) - Fallback method

## Example
/seo-blog "best project management tools" --scrape --scrape-timeout=60
```

**Artifact Paths:**
```
.artifacts/seo-pipeline/{task-id}/
├── scraped-competitors.json
├── scraped-serp.json
├── scraped-research.json
└── pipeline-summary.json
```

### Phase 4: End-to-End Testing (Sprint 4)

**Test Cases:**
1. Full pipeline with scraping enabled
2. Full pipeline with scraping disabled (baseline)
3. Pipeline with Firecrawl timeout (fallback test)
4. Pipeline with Firecrawl unavailable (degradation test)
5. Rate limit stress test (20 URLs)

**Success Criteria:**
- [ ] Pipeline completes with scraping in < 10 minutes
- [ ] Research document has >= 5 sources with `scraped_via: "firecrawl"`
- [ ] Competitor analysis includes content structure for 5 URLs
- [ ] Fallback works within 30 seconds of failure detection
- [ ] No rate limit errors in logs

### Phase 5: Documentation (Sprint 5)

**Deliverables:**
- [ ] Update `SPECIFICATION.md` with Firecrawl sections
- [ ] Update `SEO_TASK_MODE.md` with scraping instructions
- [ ] Create troubleshooting guide
- [ ] Update agent READMEs

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                         SEO PIPELINE                              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Keyword Research                                         │
│ Agent: seo-analytics-specialist                                  │
│ APIs: DataForSEO                                                 │
│ Output: keyword_research.yaml                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Competitor Analysis                                      │
│ Agent: competitive-seo-analyst                                   │
│ APIs: DataForSEO + FIRECRAWL (scrapeCompetitors)                │
│ Input: Top 5 SERP URLs                                          │
│ Output: competitor_analysis.yaml (with scraped content)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: SERP Analysis                                            │
│ Agent: serp-analyst                                              │
│ APIs: DataForSEO (features) + FIRECRAWL (content)               │
│ Input: Keyword, Top 5 URLs                                       │
│ Output: serp_analysis.yaml (features + scraped content)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Research                                                 │
│ Agent: research-specialist                                       │
│ APIs: WebSearch + FIRECRAWL (batchScrape, extract)              │
│ Sources: Reddit, Quora, blogs, podcasts, news                   │
│ Output: research_document.yaml (with scraped examples)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ STEPS 5-11: Angle → Outline → Write → Depth → Validate → Publish│
│ (No Firecrawl needed - content creation and validation)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Environment Configuration

### Required Variables
```bash
# .env
FIRECRAWL_API_KEY=cf-2d9b68acc32900ca0228ab3cc06761763fc41a616d5d77da00ba647a18ff1a0d
FIRECRAWL_BASE_URL=https://firecrawl-api-ourstories.fly.dev
FIRECRAWL_PROJECT_ID=claude-flow-novice
FIRECRAWL_TEAM_ID=2260a711-047c-4bf9-81b7-5bb50e2dbf67
```

### Agent Environment Access
```javascript
// Agents access via process.env
const apiKey = process.env.FIRECRAWL_API_KEY;
const baseUrl = process.env.FIRECRAWL_BASE_URL;
```

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Scraping success rate | >= 90% | URLs successfully scraped / total URLs |
| Pipeline completion | 100% | Full pipeline completes with scraping |
| Fallback activation | < 10% | Fallback triggered / total attempts |
| Research source coverage | >= 10 | Sources with `scraped_via: "firecrawl"` |
| Competitor content extraction | 5/5 | Competitors with full structure |
| Rate limit errors | 0 | Errors due to rate limiting |

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Firecrawl API down | Low | High | WebFetch fallback, health check at start |
| Rate limit exceeded | Medium | Medium | Request queuing, delays between calls |
| Slow scraping (>60s) | Medium | Low | Longer timeouts, async processing |
| Content extraction fails | Low | Medium | AI extraction backup, manual note |
| Self-hosted server issues | Medium | High | Monitor Fly.io, consider managed fallback |

---

## Appendix: Agent Modification Checklist

### competitive-seo-analyst.md
- [ ] Add "Firecrawl Integration" section
- [ ] Add scrapeCompetitors usage example
- [ ] Add output format with `scraped_via` field
- [ ] Add fallback instructions
- [ ] Add rate limit awareness

### serp-analyst.md
- [ ] Add "Hybrid Scraping Approach" section
- [ ] Document DataForSEO vs Firecrawl responsibilities
- [ ] Add batchScrape usage for top results
- [ ] Add output format with scraped content
- [ ] Add fallback instructions

### research-specialist.md
- [ ] Add "Source Scraping" section
- [ ] Add batchScrape usage for research URLs
- [ ] Add extract() usage for quotes/stats
- [ ] Add output format with `scraped_via` field
- [ ] Add authenticity scoring for scraped examples
- [ ] Add rate limit batching (15 URLs max)
- [ ] Add fallback instructions

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-11-29 | Initial implementation plan |
