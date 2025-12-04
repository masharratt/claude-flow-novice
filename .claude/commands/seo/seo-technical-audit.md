---
description: Run Phase 1 technical audit independently with RuVector cache-first approach
---

# /seo-technical-audit - Technical SEO Audit Command

**Epic**: SEO Site Onboarding & Keyword Discovery System v2
**Sprint**: 2.2 (Standalone Commands & Performance Feedback)
**Purpose**: Quick technical health check for site diagnostics
**Agent**: `technical-seo-specialist`

---

## Command Syntax

```bash
/seo-technical-audit <domain> [OPTIONS]
```

## Required Parameters

| Parameter | Description | Format |
|-----------|-------------|--------|
| `<domain>` | Domain to audit | Valid domain (e.g., `example.com`) |

## Optional Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `--skip-cache` | Skip RuVector cache lookup | Flag |
| `--verbose` | Enable detailed logging | Flag |
| `--save-profile` | Store results in RuVector | Flag (default: true) |
| `--output-format` | Output format | `json`, `markdown`, `both` (default: `both`) |
| `--include-metrics` | Include Core Web Vitals | Flag (default: true) |

---

## Purpose

Quick technical SEO health check without full onboarding. Use for:
- Initial site assessment before engagement
- Technical health monitoring
- Pre-migration audits
- Quick competitor technical analysis
- Troubleshooting technical issues

This command runs **Phase 1 only** from the onboarding pipeline.

---

## Technical Audit Scope

### Pre-Audit (Step 0): RuVector Cache Lookup

Before running fresh analysis, query RuVector for existing site profile:

```bash
# Check for cached technical audit
./scripts/ruvector/query-site-profile.sh \
  --domain "$DOMAIN" \
  --collection site_profiles \
  --min-freshness 0.5
```

**Cache Hit Behavior**:
- If profile exists and fresh (TTL < 30 days): Return cached results with freshness score
- If profile stale (TTL > 30 days): Run fresh audit and update cache
- If profile missing: Run fresh audit and store in RuVector

**Cache Benefits**:
- Instant results for recently audited sites
- Historical tracking of technical health trends
- Cost savings on repeat audits

### Phase 1 Analysis

#### 1. Site Crawl
- Sitemap discovery (XML sitemaps)
- Robots.txt validation
- Page discovery (internal link following)
- URL structure analysis
- Site architecture depth analysis

#### 2. Core Web Vitals Assessment
Via PageSpeed Insights API:
- Largest Contentful Paint (LCP)
- First Input Delay (FID)
- Cumulative Layout Shift (CLS)
- First Contentful Paint (FCP)
- Time to Interactive (TTI)
- Speed Index

**Performance Thresholds**:
- Good: LCP < 2.5s, FID < 100ms, CLS < 0.1
- Needs Improvement: LCP 2.5-4.0s, FID 100-300ms, CLS 0.1-0.25
- Poor: LCP > 4.0s, FID > 300ms, CLS > 0.25

#### 3. Indexability Audit
- Robots.txt rules analysis
- Meta robots tags (noindex, nofollow)
- Canonical tags validation
- XML sitemap coverage
- Orphan page detection
- Redirect chains (3xx status)
- Broken links (4xx, 5xx)

#### 4. Mobile-Friendliness Check
- Viewport configuration
- Touch target sizing
- Font readability
- Content width
- Mobile usability issues

#### 5. HTTPS/Security Validation
- SSL certificate validity
- Mixed content detection
- HSTS headers
- Security headers (CSP, X-Frame-Options)

#### 6. Schema Markup Inventory
- Schema types present (Organization, Article, Product, etc.)
- Rich snippet eligibility
- Structured data validation
- JSON-LD vs Microdata

#### 7. Technical Health Scoring

Calculate overall score (0.0-1.0):

```typescript
technicalHealthScore = (
  indexabilityScore * 0.30 +
  performanceScore * 0.25 +
  mobileScore * 0.20 +
  securityScore * 0.15 +
  schemaScore * 0.10
)
```

**Score Interpretation**:
- 0.85-1.0: Excellent (green light for content strategy)
- 0.70-0.84: Good (minor fixes recommended)
- 0.50-0.69: Fair (moderate technical debt)
- 0.30-0.49: Poor (significant issues blocking SEO)
- 0.0-0.29: Critical (urgent technical intervention needed)

**Blocking Condition**: If score < 0.50, recommend fixing critical issues before launching content strategy.

### Post-Audit (Step 4.5): RuVector Storage

Store site profile in RuVector for future reference:

```typescript
{
  domain: "example.com",
  technicalHealthScore: 0.82,
  lastAudited: "2025-12-04T10:30:00Z",
  coreWebVitals: {
    lcp: 2.1,
    fid: 85,
    cls: 0.08,
    overallRating: "good"
  },
  criticalIssues: [
    "12 pages with noindex tag",
    "3 redirect chains detected",
    "Mixed content on 5 pages"
  ],
  recommendations: [...],
  ttl: 30 // days
}
```

---

## Usage Examples

### 1. Basic Technical Audit
```bash
/seo-technical-audit example.com

# Behavior:
# - Checks RuVector cache first
# - Runs fresh audit if needed
# - Returns technical health report
# - Stores results in RuVector
# - Outputs JSON + Markdown
```

### 2. Fresh Audit (Skip Cache)
```bash
/seo-technical-audit example.com --skip-cache --verbose

# Behavior:
# - Bypasses RuVector cache
# - Runs fresh analysis
# - Verbose logging for debugging
# - Updates RuVector with fresh data
```

### 3. Audit Without Caching
```bash
/seo-technical-audit competitor.com --save-profile=false

# Behavior:
# - Still checks cache (if available)
# - Does not store results in RuVector
# - Useful for competitor analysis
# - Leaves no trace in RuVector
```

### 4. JSON-Only Output
```bash
/seo-technical-audit example.com --output-format=json

# Behavior:
# - Returns JSON report only
# - Useful for programmatic consumption
# - Stored at: .artifacts/seo/technical-audit/{domain}/report.json
```

### 5. Quick Check (Minimal Metrics)
```bash
/seo-technical-audit example.com --include-metrics=false

# Behavior:
# - Skips PageSpeed Insights API (faster)
# - Focuses on indexability and security
# - Execution time: ~30-60 seconds
# - Cost: Free (no API calls)
```

---

## Expected Outputs

### Immediate (Command Execution)
- Task ID for tracking
- Cache hit status
- Estimated completion time

### Progress Updates
- Page crawl progress (X/Y pages)
- Core Web Vitals API calls
- Indexability checks
- Schema validation

### Final Deliverables

#### Redis Keys
```
seo:technical-audit:{domain}:report
seo:technical-audit:{domain}:health-score
seo:technical-audit:{domain}:critical-issues
```

#### Files Generated
```
.artifacts/seo/technical-audit/{domain}/
  ├── report.json          # Full technical audit report
  ├── report.md            # Human-readable summary
  ├── critical-issues.json # Issues requiring immediate attention
  └── recommendations.json # Prioritized fix recommendations
```

### JSON Output Format

```json
{
  "domain": "example.com",
  "auditDate": "2025-12-04T10:30:00Z",
  "cacheStatus": "cache_hit",
  "dataAge": "12 days",
  "technicalHealthScore": 0.82,
  "scoreBreakdown": {
    "indexability": 0.88,
    "performance": 0.79,
    "mobile": 0.85,
    "security": 0.92,
    "schema": 0.65
  },
  "coreWebVitals": {
    "lcp": 2.1,
    "fid": 85,
    "cls": 0.08,
    "fcp": 1.2,
    "tti": 3.5,
    "speedIndex": 2.8,
    "overallRating": "good"
  },
  "indexability": {
    "crawlablePages": 487,
    "indexablePages": 458,
    "noindexPages": 12,
    "robotsTxtRules": 8,
    "canonicalIssues": 3,
    "redirectChains": 3,
    "brokenLinks": 5,
    "orphanPages": 14
  },
  "mobile": {
    "mobileFriendly": true,
    "viewportConfigured": true,
    "touchTargetIssues": 2,
    "fontReadabilityIssues": 0
  },
  "security": {
    "httpsEnabled": true,
    "sslValid": true,
    "mixedContent": 5,
    "hstsEnabled": false,
    "securityHeaders": {
      "csp": false,
      "xFrameOptions": true,
      "xContentTypeOptions": true
    }
  },
  "schema": {
    "schemaTypes": ["Organization", "Article", "BreadcrumbList"],
    "validSchemas": 3,
    "invalidSchemas": 0,
    "richSnippetEligibility": "partial"
  },
  "criticalIssues": [
    {
      "severity": "high",
      "category": "indexability",
      "issue": "12 pages with noindex tag",
      "impact": "Pages excluded from search results",
      "recommendation": "Review noindex tags, remove if unintended"
    },
    {
      "severity": "medium",
      "category": "security",
      "issue": "Mixed content on 5 pages",
      "impact": "Browser warnings, HTTPS not fully secure",
      "recommendation": "Update HTTP resources to HTTPS"
    },
    {
      "severity": "medium",
      "category": "performance",
      "issue": "3 redirect chains detected",
      "impact": "Slower page loads, wasted crawl budget",
      "recommendation": "Flatten redirects to direct URLs"
    }
  ],
  "recommendations": [
    {
      "priority": "HIGH",
      "category": "indexability",
      "action": "Review and fix noindex tags on 12 pages",
      "estimatedEffort": "1-2 hours",
      "estimatedImpact": "High (12 pages indexable)"
    },
    {
      "priority": "HIGH",
      "category": "security",
      "action": "Update mixed content resources to HTTPS",
      "estimatedEffort": "2-4 hours",
      "estimatedImpact": "Medium (security improvement)"
    },
    {
      "priority": "MEDIUM",
      "category": "performance",
      "action": "Flatten 3 redirect chains",
      "estimatedEffort": "30 minutes",
      "estimatedImpact": "Low (minor speed improvement)"
    },
    {
      "priority": "MEDIUM",
      "category": "security",
      "action": "Enable HSTS headers",
      "estimatedEffort": "15 minutes",
      "estimatedImpact": "Medium (security best practice)"
    },
    {
      "priority": "LOW",
      "category": "schema",
      "action": "Add Product schema for product pages",
      "estimatedEffort": "4-6 hours",
      "estimatedImpact": "Medium (rich snippets in SERP)"
    }
  ],
  "executionMetrics": {
    "executionTime": "2m 15s",
    "pagesAnalyzed": 487,
    "apiCallsMade": 3,
    "costEstimate": "$0.15"
  }
}
```

### Markdown Output Format

```markdown
# Technical SEO Audit: example.com

**Audit Date:** 2025-12-04
**Cache Status:** Cache hit (12 days old)
**Overall Health Score:** 0.82 / 1.0 (Good)

## Summary

Your site has good technical SEO health with minor issues to address. Core Web Vitals are in the "good" range, and most pages are indexable. Focus on fixing 12 noindex tags and 5 mixed content issues.

## Score Breakdown

| Category | Score | Rating |
|----------|-------|--------|
| Indexability | 0.88 | Excellent |
| Performance (CWV) | 0.79 | Good |
| Mobile-Friendliness | 0.85 | Excellent |
| Security | 0.92 | Excellent |
| Schema Markup | 0.65 | Fair |

## Core Web Vitals

| Metric | Value | Rating |
|--------|-------|--------|
| Largest Contentful Paint (LCP) | 2.1s | Good |
| First Input Delay (FID) | 85ms | Good |
| Cumulative Layout Shift (CLS) | 0.08 | Good |
| First Contentful Paint (FCP) | 1.2s | Good |
| Time to Interactive (TTI) | 3.5s | Needs Improvement |
| Speed Index | 2.8s | Good |

**Overall Performance:** Good

## Critical Issues (3)

### 1. 12 pages with noindex tag [HIGH]
- **Impact:** Pages excluded from search results
- **Recommendation:** Review noindex tags, remove if unintended
- **Effort:** 1-2 hours

### 2. Mixed content on 5 pages [MEDIUM]
- **Impact:** Browser warnings, HTTPS not fully secure
- **Recommendation:** Update HTTP resources to HTTPS
- **Effort:** 2-4 hours

### 3. 3 redirect chains detected [MEDIUM]
- **Impact:** Slower page loads, wasted crawl budget
- **Recommendation:** Flatten redirects to direct URLs
- **Effort:** 30 minutes

## Recommendations

### High Priority
1. **Review and fix noindex tags** (1-2 hours, high impact)
2. **Update mixed content to HTTPS** (2-4 hours, medium impact)

### Medium Priority
3. **Flatten redirect chains** (30 minutes, low impact)
4. **Enable HSTS headers** (15 minutes, medium impact)

### Low Priority
5. **Add Product schema** (4-6 hours, medium impact)

## Next Steps

1. Fix critical issues (estimated 3-6 hours)
2. Re-run audit to verify fixes: `/seo-technical-audit example.com --skip-cache`
3. If score reaches 0.85+, proceed with content strategy
4. Monitor Core Web Vitals monthly

---

**Execution Time:** 2m 15s
**Cost:** $0.15 (3 API calls)
**Cache Savings:** Reused 12-day-old profile (saved ~$1.50)
```

---

## Domain Validation

Before execution, validate domain format:

**Valid Formats**:
- `example.com`
- `www.example.com`
- `subdomain.example.com`

**Invalid Formats**:
- `http://example.com` (no protocol)
- `example` (incomplete domain)
- `example.com/path` (no path)

**Validation Process**:
1. Strip protocol if present
2. Validate domain format (regex)
3. Check DNS resolution
4. Confirm site is accessible

**Failure Handling**:
- Invalid format: Error with correct format
- DNS failure: Warning, cannot proceed
- Site inaccessible: Error, cannot crawl

---

## Error Handling

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid domain format` | Domain doesn't match regex | Use format `example.com` |
| `Cannot resolve DNS` | Domain doesn't exist | Verify domain spelling |
| `Site not accessible` | HTTP error (4xx, 5xx) | Check site availability |
| `PageSpeed API error` | Rate limit or API key issue | Retry or skip metrics |
| `RuVector connection failed` | Vector DB unavailable | Continue without cache |
| `Crawl timeout` | Site too large or slow | Increase timeout or limit pages |

---

## Performance Metrics

### Expected Duration by Mode

| Mode | Pages | Duration | API Calls | Cost |
|------|-------|----------|-----------|------|
| Quick (no metrics) | Any | 30-60s | 0 | $0 |
| Standard (with CWV) | <500 | 2-3 min | 3-5 | $0.15-0.25 |
| Standard (with CWV) | 500-1000 | 4-6 min | 5-10 | $0.25-0.50 |
| Large site | 1000+ | 8-12 min | 10-20 | $0.50-1.00 |

### Cache Performance

| Scenario | Cache Status | Duration | Cost |
|----------|--------------|----------|------|
| Recent audit (<7 days) | Hit (fresh) | <5s | $0 |
| Older audit (7-30 days) | Hit (acceptable) | <5s | $0 |
| Stale audit (>30 days) | Miss (refresh) | 2-6 min | $0.15-0.50 |
| First audit | Miss (new) | 2-6 min | $0.15-0.50 |

---

## Agent Responsibilities

The `technical-seo-specialist` agent:

1. **Cache Lookup**: Query RuVector for existing site profile
2. **Site Crawling**: Discover and analyze all accessible pages
3. **Metrics Collection**: Gather Core Web Vitals via PageSpeed Insights
4. **Indexability Analysis**: Validate robots.txt, meta tags, canonicals
5. **Security Check**: Assess HTTPS, security headers, vulnerabilities
6. **Schema Validation**: Inventory and validate structured data
7. **Scoring**: Calculate technical health score
8. **Recommendations**: Prioritize fixes by impact and effort
9. **Storage**: Save results to Redis and RuVector
10. **Reporting**: Generate JSON and Markdown outputs

**Agent Spawning**:
```javascript
Task("technical-seo-specialist", `
Execute Phase 1 technical audit for domain: ${domain}

Parameters:
- Skip Cache: ${skipCache ? 'true' : 'false'}
- Include Metrics: ${includeMetrics ? 'true' : 'false'}
- Save Profile: ${saveProfile ? 'true' : 'false'}
- Output Format: ${outputFormat}

Workflow:
1. Query RuVector for cached site profile
2. Run site crawl and technical analysis
3. Collect Core Web Vitals (if enabled)
4. Calculate technical health score
5. Identify critical issues
6. Generate prioritized recommendations
7. Store results in Redis and RuVector (if enabled)
8. Output JSON + Markdown reports

Success Criteria:
- Technical health score calculated (0.0-1.0)
- Critical issues identified and prioritized
- Recommendations include effort estimates
- Reports generated in ${outputFormat} format
- Results stored if --save-profile=true

Report Format:
- JSON: .artifacts/seo/technical-audit/${domain}/report.json
- Markdown: .artifacts/seo/technical-audit/${domain}/report.md
- Critical Issues: .artifacts/seo/technical-audit/${domain}/critical-issues.json
`)
```

---

## Success Criteria

- Technical health score calculated (0.0-1.0)
- Core Web Vitals collected (if enabled)
- Indexability issues identified
- Security issues flagged
- Schema markup inventoried
- Critical issues prioritized by severity
- Recommendations include effort and impact estimates
- Reports generated in specified format(s)
- Results cached in RuVector (if enabled)

---

## Related Documentation

- Epic: `planning/epics/seo-onboarding-discovery/epic.json` (Sprint 2.2)
- Full Onboarding: `/seo-onboard` command
- Phase 1 Implementation: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/phases/phase-1-technical.ts` (future)
- RuVector Schemas: `.claude/skills/cfn-seo-pipeline/lib/seo/lib/ruvector/schemas.ts`
- Agent: `.claude/cfn-extras/agents/cfn-seo-team/technical-seo-specialist.md`

---

## Integration with Other Commands

- `/seo-onboard`: Full 7-phase onboarding includes this audit
- `/seo-gap-analysis`: Gap analysis assumes technical health is adequate

**Recommended Workflow**:
1. Run `/seo-technical-audit` first
2. Fix critical issues (score < 0.50)
3. Re-audit to verify fixes
4. Proceed with `/seo-onboard` or `/seo-gap-analysis`

---

**Version**: 1.0.0
**Last Updated**: 2025-12-04
**Sprint**: 2.2 - Deliverable 2.2.1
**Confidence Score**: 0.90
