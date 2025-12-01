# Competitor Deep Analyst Agent - Architecture Design

**Phase:** 2 Sprint 1 (P2-S1)
**Status:** Architecture & Design
**Confidence:** 0.88
**Date:** 2025-12-01

---

## Executive Summary

The Competitor Deep Analyst Agent performs site-wide competitor analysis to extract replicable patterns across 50+ pages. Unlike single-page SERP analysis, this agent identifies systematic patterns in site architecture, content strategy, and technical implementation that compound across thousands of pages.

**Key Capabilities:**
- Deep crawl 50+ pages per competitor domain
- Extract site architecture patterns (URL structure, navigation, internal linking)
- Identify content strategy patterns (topics, formats, hub pages)
- Discover technical patterns (schema, performance, structure)
- Store patterns in knowledge base for Pattern Manager integration

**Integration Points:**
- **Input:** ResearchService (SERP results for competitor discovery)
- **Crawling:** Firecrawl API for deep site crawling
- **Storage:** Knowledge Store (competitive intelligence from Phase 1)
- **Output:** Pattern Manager (structured patterns with confidence scores)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│              Competitor Deep Analyst Agent                       │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 1: Competitor Discovery                               │ │
│  │ ┌──────────────┐    ┌──────────────┐                      │ │
│  │ │ Research     │ -> │ Domain       │                      │ │
│  │ │ Service      │    │ Selector     │                      │ │
│  │ └──────────────┘    └──────────────┘                      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 2: Site Crawling (Firecrawl)                         │ │
│  │ ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │ │
│  │ │ URL          │ -> │ Content      │ -> │ Link         │ │ │
│  │ │ Discovery    │    │ Extraction   │    │ Analysis     │ │ │
│  │ └──────────────┘    └──────────────┘    └──────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 3: Pattern Extraction                                 │ │
│  │ ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │ │
│  │ │ Architecture │    │ Content      │    │ Technical    │ │ │
│  │ │ Patterns     │    │ Patterns     │    │ Patterns     │ │ │
│  │ └──────────────┘    └──────────────┘    └──────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
│                           ↓                                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Step 4: Pattern Storage                                    │ │
│  │ ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │ │
│  │ │ Intelligence │    │ Pattern      │    │ Confidence   │ │ │
│  │ │ Curator      │    │ Manager      │    │ Scoring      │ │ │
│  │ └──────────────┘    └──────────────┘    └──────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Component Breakdown

### 2.1 Competitor Discovery Module

**Purpose:** Identify top competitor domains from SERP results

**Inputs:**
- Target keyword (from pipeline orchestrator)
- Industry context (optional)
- Existing competitive intelligence (from Knowledge Store)

**Logic:**
```typescript
interface CompetitorDiscoveryInput {
  targetKeyword: string;
  industry?: string;
  maxCompetitors?: number; // default: 5
  excludeDomains?: string[]; // exclude own domain
}

interface DiscoveredCompetitor {
  domain: string;
  url: string;
  serpPosition: number;
  estimatedAuthority: number; // 0-100
  reason: string; // why selected
}

async function discoverCompetitors(
  input: CompetitorDiscoveryInput
): Promise<DiscoveredCompetitor[]> {
  // 1. Query ResearchService for SERP results
  const serpResults = await researchService.execute({
    type: 'serp',
    query: input.targetKeyword,
    options: { maxResults: 20 }
  });

  // 2. Extract unique domains from top 20 results
  const domains = serpResults.data.serp.results
    .map(r => extractDomain(r.url))
    .filter(d => !input.excludeDomains?.includes(d));

  // 3. Deduplicate and score
  const scored = await scoreCompetitors(domains, serpResults);

  // 4. Select top N competitors
  return scored
    .sort((a, b) => b.estimatedAuthority - a.estimatedAuthority)
    .slice(0, input.maxCompetitors || 5);
}
```

**Outputs:**
- Array of 3-5 competitor domains with context
- SERP positions for ranking correlation
- Selection rationale for documentation

---

### 2.2 Site Crawling Module (Firecrawl Integration)

**Purpose:** Deep crawl competitor sites to discover URL structure and content

**Firecrawl SDK Features Needed:**

| Feature | Firecrawl Endpoint | Purpose | Priority |
|---------|-------------------|---------|----------|
| URL Mapping | `POST /v2/map` | Discover all URLs on site | P0 |
| Deep Crawl | `POST /v2/crawl` | Scrape 50+ pages with content | P0 |
| Batch Scrape | `POST /v2/batch/scrape` | Parallel page scraping | P1 |
| Content Extraction | Built into scrape | Extract markdown, links, metadata | P0 |
| Job Status Polling | `GET /v2/crawl/{jobId}` | Monitor long-running crawls | P0 |
| Rate Limiting | Client-side | Respect competitor site limits | P1 |

**Implementation:**

```typescript
interface CrawlConfig {
  domain: string;
  maxPages: number; // default: 50
  maxDepth: number; // default: 3
  includePaths?: string[]; // e.g., ['/blog', '/products']
  excludePaths?: string[]; // e.g., ['/login', '/cart']
  timeout: number; // milliseconds
}

interface CrawlResult {
  domain: string;
  urls: string[];
  pages: CrawledPage[];
  crawlStats: {
    totalUrls: number;
    crawledPages: number;
    failedPages: number;
    avgCrawlTime: number;
    discoveredSections: string[]; // e.g., ['blog', 'products', 'resources']
  };
}

interface CrawledPage {
  url: string;
  title: string;
  headings: {
    h1: string[];
    h2: string[];
    h3: string[];
  };
  wordCount: number;
  internalLinks: Link[];
  externalLinks: Link[];
  schema: SchemaType[];
  metadata: {
    description?: string;
    author?: string;
    publishDate?: Date;
    updateDate?: Date;
  };
  contentSummary: string; // first 500 chars of markdown
}

interface Link {
  href: string;
  text: string;
  context: string; // surrounding text
}

class SiteCrawler {
  constructor(
    private firecrawlClient: FirecrawlClient,
    private rateLimiter: RateLimiter
  ) {}

  async crawlSite(config: CrawlConfig): Promise<CrawlResult> {
    // Step 1: Map all URLs
    const urlMap = await this.firecrawlClient.mapUrls(
      `https://${config.domain}`,
      {
        limit: 1000,
        includeSubdomains: false
      }
    );

    // Step 2: Filter URLs by include/exclude paths
    const filteredUrls = this.filterUrls(
      urlMap.data.urls,
      config.includePaths,
      config.excludePaths
    );

    // Step 3: Select top N URLs to crawl (prioritize by depth and type)
    const selectedUrls = this.selectUrlsToCrawl(
      filteredUrls,
      config.maxPages
    );

    // Step 4: Batch scrape selected URLs
    const crawlJob = await this.firecrawlClient.crawl(
      `https://${config.domain}`,
      {
        limit: config.maxPages,
        maxDepth: config.maxDepth,
        includePaths: config.includePaths,
        excludePaths: config.excludePaths,
        scrapeOptions: {
          onlyMainContent: true,
          formats: ['markdown', 'links'],
          timeout: 45000
        }
      }
    );

    // Step 5: Poll for completion
    const result = await this.pollCrawlStatus(crawlJob.id, config.timeout);

    // Step 6: Parse and structure results
    return this.parseCrawlResult(result, config.domain);
  }

  private async pollCrawlStatus(
    jobId: string,
    timeout: number
  ): Promise<FirecrawlCrawlResult> {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    while (Date.now() - startTime < timeout) {
      const status = await this.firecrawlClient.getCrawlStatus(jobId);

      if (status.status === 'completed') {
        return status;
      }

      if (status.status === 'failed') {
        throw new Error(`Crawl failed: ${status.error}`);
      }

      // Still running, wait and retry
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Crawl timeout after ${timeout}ms`);
  }

  private selectUrlsToCrawl(
    urls: string[],
    maxPages: number
  ): string[] {
    // Priority scoring:
    // 1. Shallower depth (closer to homepage)
    // 2. Content-rich sections (blog, resources, guides)
    // 3. Hub pages (many internal links to them)
    // 4. Recently updated (from sitemap last-mod)

    return urls
      .map(url => ({
        url,
        score: this.calculateUrlPriority(url)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPages)
      .map(item => item.url);
  }

  private calculateUrlPriority(url: string): number {
    let score = 100;

    // Depth penalty: -10 per level
    const depth = url.split('/').length - 3; // exclude protocol and domain
    score -= depth * 10;

    // Content section bonus
    if (url.includes('/blog')) score += 20;
    if (url.includes('/guide')) score += 20;
    if (url.includes('/resource')) score += 15;
    if (url.includes('/product')) score += 10;

    // Homepage bonus
    if (url.endsWith('.com') || url.endsWith('.com/')) score += 50;

    return Math.max(0, score);
  }
}
```

**Error Handling:**
```typescript
interface CrawlError {
  type: 'TIMEOUT' | 'RATE_LIMIT' | 'NETWORK' | 'PARSE_ERROR';
  domain: string;
  failedUrls: string[];
  partialResults?: CrawlResult;
  retryable: boolean;
}

async function crawlWithRetry(
  config: CrawlConfig,
  maxRetries: number = 3
): Promise<CrawlResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await crawler.crawlSite(config);
    } catch (error) {
      if (error.type === 'RATE_LIMIT') {
        // Exponential backoff
        await sleep(Math.pow(2, attempt) * 1000);
        continue;
      }

      if (!error.retryable || attempt === maxRetries) {
        throw error;
      }
    }
  }
}
```

---

### 2.3 Pattern Extraction Module

**Purpose:** Analyze crawled data to identify replicable patterns

#### 2.3.1 Architecture Pattern Extraction

**Patterns to Identify:**

1. **URL Structure Patterns**
```typescript
interface UrlStructurePattern {
  type: 'url-structure';
  domain: string;
  patterns: {
    blog: string; // e.g., '/blog/{slug}'
    product: string; // e.g., '/products/{category}/{slug}'
    resource: string;
    landing: string;
  };
  consistency: number; // 0-1, how consistent across site
  evidence: string[]; // example URLs
}

function extractUrlPatterns(crawlResult: CrawlResult): UrlStructurePattern {
  const urls = crawlResult.urls;
  const grouped = groupUrlsBySection(urls);

  return {
    type: 'url-structure',
    domain: crawlResult.domain,
    patterns: {
      blog: detectPattern(grouped.blog),
      product: detectPattern(grouped.product),
      resource: detectPattern(grouped.resource),
      landing: detectPattern(grouped.landing)
    },
    consistency: calculateConsistency(grouped),
    evidence: urls.slice(0, 10)
  };
}

function detectPattern(urls: string[]): string {
  // Extract common structure
  // Example: ['/blog/post-1', '/blog/post-2'] -> '/blog/{slug}'
  if (urls.length === 0) return '';

  const parts = urls.map(url => url.split('/'));
  const pattern = [];

  for (let i = 0; i < parts[0].length; i++) {
    const values = parts.map(p => p[i]).filter(Boolean);
    const uniqueValues = new Set(values);

    if (uniqueValues.size === 1) {
      // Constant segment
      pattern.push(values[0]);
    } else {
      // Variable segment
      pattern.push(`{${inferSegmentName(values)}}`);
    }
  }

  return pattern.join('/');
}
```

2. **Internal Linking Patterns**
```typescript
interface InternalLinkingPattern {
  type: 'internal-linking';
  domain: string;
  hubPages: HubPage[];
  linkDensity: {
    avgLinksPerPage: number;
    byPageType: Record<string, number>; // e.g., { blog: 8, product: 5 }
  };
  crossLinkingPatterns: CrossLinkPattern[];
  confidence: number; // 0-1
}

interface HubPage {
  url: string;
  inboundLinks: number;
  reason: string; // 'navigation hub', 'content pillar', 'category page'
  linkedFromTypes: string[]; // ['blog', 'product', 'resource']
}

interface CrossLinkPattern {
  from: string; // page type
  to: string; // page type
  frequency: number; // how often this pattern appears
  example: { fromUrl: string; toUrl: string; anchorText: string };
}

function extractLinkingPatterns(
  crawlResult: CrawlResult
): InternalLinkingPattern {
  // Build link graph
  const linkGraph = buildLinkGraph(crawlResult.pages);

  // Identify hub pages (most inbound links)
  const hubPages = identifyHubPages(linkGraph, 5); // top 5

  // Calculate link density by page type
  const linkDensity = calculateLinkDensity(crawlResult.pages);

  // Identify cross-linking patterns
  const crossLinkPatterns = identifyCrossLinkPatterns(crawlResult.pages);

  return {
    type: 'internal-linking',
    domain: crawlResult.domain,
    hubPages,
    linkDensity,
    crossLinkingPatterns,
    confidence: calculateConfidence(crawlResult.pages.length, 50)
  };
}
```

3. **Site Architecture Pattern**
```typescript
interface SiteArchitecturePattern {
  type: 'site-architecture';
  domain: string;
  maxDepth: number;
  sectionsDiscovered: SiteSection[];
  navigationStructure: 'flat' | 'hierarchical' | 'hub-spoke' | 'mixed';
  orphanedPages: number; // pages with no navigation links
  confidence: number;
}

interface SiteSection {
  name: string; // 'blog', 'products', 'resources'
  urlPattern: string;
  estimatedPageCount: number;
  avgDepth: number;
  prominent: boolean; // linked from homepage or main nav
}
```

#### 2.3.2 Content Pattern Extraction

**Patterns to Identify:**

1. **Topic Coverage Pattern**
```typescript
interface TopicCoveragePattern {
  type: 'topic-coverage';
  domain: string;
  topics: TopicCluster[];
  contentTypes: ContentTypeDistribution;
  avgWordCount: Record<string, number>; // by content type
  confidence: number;
}

interface TopicCluster {
  name: string; // inferred from headings and keywords
  pageCount: number;
  keywords: string[]; // top keywords in cluster
  depthScore: number; // 1-5, how thoroughly covered
  exampleUrls: string[];
}

interface ContentTypeDistribution {
  blog: number; // % of crawled pages
  guide: number;
  landing: number;
  product: number;
  comparison: number;
  other: number;
}

function extractTopicPatterns(
  crawlResult: CrawlResult
): TopicCoveragePattern {
  // Cluster pages by topic using heading analysis
  const clusters = clusterPagesByTopic(crawlResult.pages);

  // Calculate content type distribution
  const contentTypes = classifyContentTypes(crawlResult.pages);

  // Calculate avg word count by type
  const avgWordCount = calculateAvgWordCount(crawlResult.pages);

  return {
    type: 'topic-coverage',
    domain: crawlResult.domain,
    topics: clusters,
    contentTypes,
    avgWordCount,
    confidence: calculateConfidence(crawlResult.pages.length, 50)
  };
}
```

2. **Content Structure Pattern**
```typescript
interface ContentStructurePattern {
  type: 'content-structure';
  domain: string;
  headingHierarchy: HeadingPattern;
  introPattern: string; // common intro structure
  conclusionPattern: string;
  listUsage: number; // % of pages with lists
  tableUsage: number;
  faqPresence: number; // % of pages with FAQ
  confidence: number;
}

interface HeadingPattern {
  avgH1Count: number;
  avgH2Count: number;
  avgH3Count: number;
  h1Format: string; // 'question', 'statement', 'how-to'
  h2Spacing: number; // avg words between H2s
}
```

#### 2.3.3 Technical Pattern Extraction

**Patterns to Identify:**

1. **Schema Implementation Pattern**
```typescript
interface SchemaPattern {
  type: 'schema-implementation';
  domain: string;
  schemaTypes: SchemaUsage[];
  coverage: number; // % of pages with schema
  richResultsObserved: string[]; // 'faq', 'how-to', 'article'
  confidence: number;
}

interface SchemaUsage {
  type: string; // 'FAQPage', 'Article', 'Product'
  pageCount: number;
  exampleUrls: string[];
  completeness: number; // 0-1, are all required fields filled
}
```

2. **Performance Pattern**
```typescript
interface PerformancePattern {
  type: 'performance';
  domain: string;
  avgLoadTime: number;
  coreWebVitals: {
    lcp: number; // Largest Contentful Paint
    fid: number; // First Input Delay
    cls: number; // Cumulative Layout Shift
  };
  optimizationTechniques: string[]; // 'lazy-loading', 'code-splitting', 'cdn'
  confidence: number;
}
```

---

### 2.4 Pattern Storage Module

**Purpose:** Store extracted patterns in knowledge base for future use

**Integration with Phase 1 Components:**

```typescript
interface PatternStorageConfig {
  competitiveDomain: string;
  targetKeyword: string;
  industry?: string;
}

class CompetitorPatternStorage {
  constructor(
    private intelligenceCurator: IntelligenceCurator,
    private patternManager: PatternManager
  ) {}

  async storeCompetitorPatterns(
    patterns: ExtractedPattern[],
    config: PatternStorageConfig
  ): Promise<StorageResult> {
    // Step 1: Store competitive intelligence
    await this.storeCompetitiveIntelligence(patterns, config);

    // Step 2: Convert to Pattern Manager format
    const formattedPatterns = this.convertToPatternFormat(patterns);

    // Step 3: Store in Pattern Manager with initial confidence
    for (const pattern of formattedPatterns) {
      await this.patternManager.addPattern(pattern);
    }

    return {
      stored: patterns.length,
      domain: config.competitiveDomain,
      keyword: config.targetKeyword
    };
  }

  private async storeCompetitiveIntelligence(
    patterns: ExtractedPattern[],
    config: PatternStorageConfig
  ): Promise<void> {
    // Store in knowledge-store/competitive-intelligence/{domain}/
    const intelligence: CompetitiveIntelligence = {
      domain: config.competitiveDomain,
      contentStrategy: this.extractContentStrategy(patterns),
      keywordTargeting: {
        primaryKeywords: [config.targetKeyword],
        secondaryKeywords: this.extractKeywords(patterns),
        searchVolumes: {}
      },
      backlinks: {
        total: 0, // to be filled by separate backlink analysis
        domainAuthority: 0,
        topReferrers: []
      },
      analyzedAt: new Date()
    };

    await this.intelligenceCurator.storeCompetitiveIntelligence(intelligence);
  }

  private convertToPatternFormat(
    patterns: ExtractedPattern[]
  ): Pattern[] {
    return patterns.map(p => ({
      id: generatePatternId(p),
      type: this.mapToPatternType(p.type),
      category: this.inferCategory(p),
      name: this.generatePatternName(p),
      description: this.generateDescription(p),
      confidence: this.calculateInitialConfidence(p),
      lifecycle: 'discovery' as const, // new patterns start in discovery
      evidence: [{
        source: p.domain,
        outcome: 'unknown', // not yet applied
        capturedAt: new Date(),
        metrics: {},
        notes: `Discovered from competitor analysis of ${p.domain}`
      }],
      metadata: {
        discoveredFrom: p.domain,
        targetKeyword: p.keyword,
        industry: p.industry,
        competitorAuthority: p.domainAuthority
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0'
    }));
  }

  private calculateInitialConfidence(pattern: ExtractedPattern): number {
    // Initial confidence based on:
    // 1. Sample size (how many pages show this pattern)
    // 2. Consistency (how reliably pattern appears)
    // 3. Competitor authority (higher authority = more trust)

    let confidence = 0.0;

    // Sample size factor (max 0.4)
    const sampleFactor = Math.min(pattern.sampleSize / 50, 1.0) * 0.4;
    confidence += sampleFactor;

    // Consistency factor (max 0.4)
    confidence += pattern.consistency * 0.4;

    // Authority factor (max 0.2)
    const authorityFactor = (pattern.domainAuthority || 50) / 100 * 0.2;
    confidence += authorityFactor;

    return Math.min(Math.max(confidence, 0.0), 1.0);
  }
}
```

---

## 3. Data Flow Diagrams

### 3.1 Complete Workflow

```
User Input (Keyword)
        ↓
┌───────────────────────────────────────────────────────────┐
│ Step 1: Competitor Discovery                              │
│ - Query ResearchService for SERP results                  │
│ - Extract top 5 competitor domains                        │
│ - Score by authority and relevance                        │
└───────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────┐
│ Step 2: Site Crawling (per competitor)                    │
│ - Firecrawl: Map all URLs on domain                       │
│ - Select top 50 URLs by priority                          │
│ - Batch scrape with content extraction                    │
│ - Parse: headings, links, schema, metadata                │
└───────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────┐
│ Step 3: Pattern Extraction                                │
│ - Architecture: URL structure, linking, site map          │
│ - Content: Topics, structure, quality indicators          │
│ - Technical: Schema, performance, optimizations           │
│ - Calculate confidence based on sample size               │
└───────────────────────────────────────────────────────────┘
        ↓
┌───────────────────────────────────────────────────────────┐
│ Step 4: Pattern Storage                                   │
│ - Store in Intelligence Curator (competitive data)        │
│ - Convert to Pattern Manager format                       │
│ - Add patterns with 'discovery' lifecycle                 │
│ - Initial confidence: 0.3-0.6 (needs validation)          │
└───────────────────────────────────────────────────────────┘
        ↓
Output: Stored Patterns (available for pipeline Step 0)
```

### 3.2 Rate Limiting Flow

```
Crawl Request
     ↓
Rate Limiter Check
     ↓
┌─────────────────┐
│ Tokens Available│ Yes → Execute Crawl
└─────────────────┘       ↓
     ↓ No                 Parse Result
     ↓                    ↓
Priority Queue            Store Pattern
     ↓
Wait for Token Refill
     ↓
Execute when available
```

---

## 4. API Surface Design

### 4.1 Main Agent Interface

```typescript
interface CompetitorDeepAnalystAgent {
  /**
   * Analyze competitors for target keyword
   *
   * @param config Analysis configuration
   * @returns Analysis results with extracted patterns
   */
  analyzeCompetitors(
    config: AnalysisConfig
  ): Promise<AnalysisResult>;

  /**
   * Analyze single competitor domain
   *
   * @param domain Competitor domain
   * @param options Crawl and analysis options
   * @returns Competitor analysis with patterns
   */
  analyzeDomain(
    domain: string,
    options: DomainAnalysisOptions
  ): Promise<DomainAnalysisResult>;

  /**
   * Get cached competitor analysis
   *
   * @param domain Competitor domain
   * @param maxAge Max age in days (default: 30)
   * @returns Cached analysis or null
   */
  getCachedAnalysis(
    domain: string,
    maxAge?: number
  ): Promise<DomainAnalysisResult | null>;

  /**
   * Extract patterns from crawl results
   *
   * @param crawlResult Firecrawl crawl results
   * @returns Extracted patterns
   */
  extractPatterns(
    crawlResult: CrawlResult
  ): ExtractedPattern[];

  /**
   * Store patterns in knowledge base
   *
   * @param patterns Extracted patterns
   * @param config Storage configuration
   * @returns Storage confirmation
   */
  storePatterns(
    patterns: ExtractedPattern[],
    config: PatternStorageConfig
  ): Promise<StorageResult>;
}
```

### 4.2 Configuration Types

```typescript
interface AnalysisConfig {
  targetKeyword: string;
  industry?: string;
  maxCompetitors?: number; // default: 5
  pagesPerCompetitor?: number; // default: 50
  excludeDomains?: string[]; // exclude own domain
  crawlTimeout?: number; // milliseconds, default: 300000 (5 min)
  useCache?: boolean; // default: true
  cacheMaxAge?: number; // days, default: 30
}

interface DomainAnalysisOptions {
  maxPages?: number;
  maxDepth?: number;
  includePaths?: string[];
  excludePaths?: string[];
  extractSchema?: boolean;
  analyzePerformance?: boolean;
  timeout?: number;
}
```

### 4.3 Result Types

```typescript
interface AnalysisResult {
  targetKeyword: string;
  competitors: CompetitorAnalysis[];
  patterns: ExtractedPattern[];
  summary: {
    totalCompetitors: number;
    totalPagesCrawled: number;
    patternsExtracted: number;
    avgConfidence: number;
    executionTime: number; // milliseconds
  };
  timestamp: Date;
}

interface CompetitorAnalysis {
  domain: string;
  serpPosition: number;
  crawlResult: CrawlResult;
  patterns: ExtractedPattern[];
  gaps: ContentGap[]; // opportunities
}

interface ExtractedPattern {
  id: string;
  type: PatternType;
  domain: string;
  keyword: string;
  sampleSize: number; // how many pages show this
  consistency: number; // 0-1
  confidence: number; // initial confidence 0-1
  data: unknown; // pattern-specific data
  evidence: string[]; // example URLs
}

interface ContentGap {
  topic: string;
  competitorCoverage: number; // 0-1
  yourCoverage: number; // 0-1
  opportunity: 'high' | 'medium' | 'low';
  estimatedSearchVolume?: number;
}
```

---

## 5. Algorithm Design

### 5.1 Pattern Identification Algorithm

```typescript
/**
 * Multi-stage pattern identification
 *
 * Stage 1: Data Collection
 * - Crawl 50+ pages per competitor
 * - Extract structured data (headings, links, schema)
 *
 * Stage 2: Clustering
 * - Group pages by type (blog, product, landing)
 * - Cluster by topic using heading similarity
 *
 * Stage 3: Pattern Extraction
 * - For each cluster, identify common elements
 * - Calculate frequency and consistency
 *
 * Stage 4: Confidence Scoring
 * - Sample size factor (more pages = higher confidence)
 * - Consistency factor (how reliably pattern appears)
 * - Authority factor (competitor domain authority)
 *
 * Stage 5: Validation
 * - Flag patterns below confidence threshold (0.3)
 * - Recommend additional sampling if needed
 */

class PatternIdentificationEngine {
  async identifyPatterns(
    crawlResults: CrawlResult[]
  ): Promise<ExtractedPattern[]> {
    const patterns: ExtractedPattern[] = [];

    // Stage 1: Collect and normalize data
    const normalized = this.normalizeData(crawlResults);

    // Stage 2: Cluster pages
    const clusters = this.clusterPages(normalized);

    // Stage 3: Extract patterns from clusters
    for (const cluster of clusters) {
      const clusterPatterns = this.extractClusterPatterns(cluster);
      patterns.push(...clusterPatterns);
    }

    // Stage 4: Score confidence
    const scoredPatterns = patterns.map(p =>
      this.scorePatternConfidence(p, normalized.length)
    );

    // Stage 5: Filter low-confidence patterns
    return scoredPatterns.filter(p => p.confidence >= 0.3);
  }

  private clusterPages(pages: NormalizedPage[]): PageCluster[] {
    // K-means clustering based on:
    // 1. URL path similarity
    // 2. Heading similarity (TF-IDF)
    // 3. Content length similarity
    // 4. Schema type similarity

    const features = pages.map(p => this.extractFeatures(p));
    const clusters = kMeansClustering(features, {
      k: Math.min(10, Math.floor(pages.length / 5)),
      maxIterations: 50
    });

    return clusters;
  }

  private extractFeatures(page: NormalizedPage): FeatureVector {
    return {
      urlDepth: page.url.split('/').length - 3,
      urlSection: this.extractSection(page.url),
      headingVector: this.createTfidfVector(page.headings),
      wordCount: page.wordCount,
      linkDensity: page.internalLinks.length / page.wordCount,
      schemaTypes: page.schema.map(s => s.type)
    };
  }

  private scorePatternConfidence(
    pattern: ExtractedPattern,
    totalPages: number
  ): ExtractedPattern {
    // Confidence = f(sample size, consistency, authority)

    const sampleSizeFactor = Math.min(pattern.sampleSize / 50, 1.0) * 0.4;
    const consistencyFactor = pattern.consistency * 0.4;
    const authorityFactor = 0.2; // assume medium authority initially

    const confidence = sampleSizeFactor + consistencyFactor + authorityFactor;

    return {
      ...pattern,
      confidence: Math.min(Math.max(confidence, 0.0), 1.0)
    };
  }
}
```

### 5.2 Hub Page Identification

```typescript
/**
 * Identify hub pages using PageRank-like algorithm
 *
 * Hub pages have:
 * 1. High inbound link count
 * 2. Links from diverse page types
 * 3. Prominent navigation placement
 */

function identifyHubPages(
  linkGraph: LinkGraph,
  topN: number = 5
): HubPage[] {
  // Build adjacency matrix
  const pages = linkGraph.nodes;
  const matrix = buildAdjacencyMatrix(linkGraph);

  // Run PageRank algorithm
  const pageRankScores = pageRank(matrix, {
    dampingFactor: 0.85,
    maxIterations: 100,
    tolerance: 0.0001
  });

  // Sort by score and select top N
  const sortedPages = pages
    .map((page, idx) => ({
      url: page.url,
      score: pageRankScores[idx],
      inboundLinks: countInboundLinks(linkGraph, page.url),
      linkedFromTypes: getLinkedFromTypes(linkGraph, page.url)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return sortedPages.map(p => ({
    url: p.url,
    inboundLinks: p.inboundLinks,
    reason: inferHubReason(p),
    linkedFromTypes: p.linkedFromTypes
  }));
}

function inferHubReason(hubData: {
  url: string;
  inboundLinks: number;
  linkedFromTypes: string[];
}): string {
  if (hubData.url.endsWith('/') || hubData.url.endsWith('.com')) {
    return 'navigation hub (homepage)';
  }

  if (hubData.linkedFromTypes.length >= 3) {
    return 'content pillar (cross-section hub)';
  }

  if (hubData.url.includes('/category') || hubData.url.includes('/topic')) {
    return 'category page';
  }

  return 'high-authority page';
}
```

---

## 6. Integration Interfaces

### 6.1 ResearchService Integration

```typescript
// Input: Use ResearchService to discover competitors
const serpResults = await researchService.execute({
  type: 'serp',
  query: targetKeyword,
  options: { maxResults: 20 }
});

const competitors = extractCompetitors(serpResults);
```

### 6.2 Firecrawl Integration

```typescript
// Crawl competitor site
import { FirecrawlClient } from '@claude/firecrawl-integration';

const firecrawl = new FirecrawlClient({
  apiKey: process.env.FIRECRAWL_API_KEY,
  baseUrl: 'https://firecrawl-api-ourstories.fly.dev'
});

const crawlJob = await firecrawl.crawl(competitorUrl, {
  limit: 50,
  maxDepth: 3,
  scrapeOptions: {
    onlyMainContent: true,
    formats: ['markdown', 'links']
  }
});

const result = await firecrawl.getCrawlStatus(crawlJob.id);
```

### 6.3 Pattern Manager Integration

```typescript
// Store extracted patterns
import { PatternManager } from '@cfn/seo-research-service';

const patternManager = new PatternManager({
  knowledgeStorePath: './knowledge-store'
});

for (const pattern of extractedPatterns) {
  await patternManager.addPattern({
    id: pattern.id,
    type: pattern.type,
    category: pattern.category,
    name: pattern.name,
    description: pattern.description,
    confidence: pattern.confidence,
    lifecycle: 'discovery',
    evidence: pattern.evidence,
    metadata: pattern.metadata,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: '1.0.0'
  });
}
```

### 6.4 Intelligence Curator Integration

```typescript
// Store competitive intelligence
import { IntelligenceCurator } from '@cfn/seo-research-service';

const curator = new IntelligenceCurator({
  knowledgeStorePath: './knowledge-store'
});

await curator.storeCompetitiveIntelligence({
  domain: competitor.domain,
  contentStrategy: {
    averageWordCount: avgWordCount,
    keywordDensity: keywordDensity,
    contentTypes: contentTypes
  },
  keywordTargeting: {
    primaryKeywords: primaryKeywords,
    secondaryKeywords: secondaryKeywords,
    searchVolumes: {}
  },
  backlinks: {
    total: 0,
    domainAuthority: 0,
    topReferrers: []
  },
  analyzedAt: new Date()
});
```

---

## 7. Performance Considerations

### 7.1 Crawl Performance

| Metric | Target | Notes |
|--------|--------|-------|
| Pages per competitor | 50 | Configurable, balance coverage vs time |
| Crawl time per competitor | 2-5 minutes | Depends on site speed and Firecrawl rate limits |
| Total analysis time (5 competitors) | 10-30 minutes | Parallelizable |
| Pattern extraction time | 30-60 seconds | CPU-bound, local processing |
| Storage time | 5-10 seconds | File I/O for knowledge store |

### 7.2 Rate Limiting

```typescript
// Firecrawl rate limits (estimated):
// - Map: 10 requests/minute
// - Crawl: 5 jobs/minute
// - Batch scrape: 20 requests/minute

const rateLimiter = new RateLimiter({
  'firecrawl:map': { requestsPerMinute: 10, queueEnabled: true },
  'firecrawl:crawl': { requestsPerMinute: 5, queueEnabled: true },
  'firecrawl:scrape': { requestsPerMinute: 20, queueEnabled: true }
});
```

### 7.3 Caching Strategy

```typescript
// Cache crawl results for 30 days
const cacheConfig = {
  ttl: 30 * 24 * 60 * 60, // 30 days in seconds
  location: './knowledge-store/cache/crawl-results'
};

// Check cache before crawling
const cachedResult = await getCachedCrawl(domain, cacheConfig.ttl);
if (cachedResult) {
  return cachedResult;
}

// Crawl and cache
const result = await crawler.crawlSite(config);
await cacheCrawlResult(domain, result);
```

---

## 8. Error Handling

### 8.1 Crawl Failures

```typescript
interface CrawlFailureStrategy {
  type: 'PARTIAL_SUCCESS' | 'RETRY' | 'SKIP' | 'FALLBACK';
  action: string;
}

function handleCrawlFailure(
  error: CrawlError,
  config: CrawlConfig
): CrawlFailureStrategy {
  switch (error.type) {
    case 'TIMEOUT':
      // Return partial results if >20 pages crawled
      if (error.partialResults && error.partialResults.pages.length >= 20) {
        return {
          type: 'PARTIAL_SUCCESS',
          action: 'Use partial results, flag low confidence'
        };
      }
      return { type: 'RETRY', action: 'Retry with reduced page limit' };

    case 'RATE_LIMIT':
      return {
        type: 'RETRY',
        action: 'Exponential backoff, retry after delay'
      };

    case 'NETWORK':
      return {
        type: 'SKIP',
        action: 'Skip this competitor, continue with others'
      };

    case 'PARSE_ERROR':
      return {
        type: 'PARTIAL_SUCCESS',
        action: 'Use successfully parsed pages'
      };

    default:
      return { type: 'SKIP', action: 'Skip and log error' };
  }
}
```

### 8.2 Pattern Extraction Failures

```typescript
// Graceful degradation: extract what's possible
function extractPatternsWithFallback(
  crawlResult: CrawlResult
): ExtractedPattern[] {
  const patterns: ExtractedPattern[] = [];

  try {
    patterns.push(...extractArchitecturePatterns(crawlResult));
  } catch (error) {
    console.warn('Architecture pattern extraction failed:', error);
  }

  try {
    patterns.push(...extractContentPatterns(crawlResult));
  } catch (error) {
    console.warn('Content pattern extraction failed:', error);
  }

  try {
    patterns.push(...extractTechnicalPatterns(crawlResult));
  } catch (error) {
    console.warn('Technical pattern extraction failed:', error);
  }

  return patterns;
}
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

```typescript
// Test pattern extraction algorithms
describe('PatternIdentificationEngine', () => {
  it('should cluster pages by type', () => {
    const pages = mockCrawlPages(50);
    const clusters = engine.clusterPages(pages);
    expect(clusters.length).toBeGreaterThan(0);
  });

  it('should identify hub pages', () => {
    const linkGraph = mockLinkGraph(50);
    const hubs = identifyHubPages(linkGraph, 5);
    expect(hubs).toHaveLength(5);
    expect(hubs[0].inboundLinks).toBeGreaterThan(10);
  });

  it('should calculate pattern confidence', () => {
    const pattern = mockPattern({ sampleSize: 30, consistency: 0.9 });
    const scored = engine.scorePatternConfidence(pattern, 50);
    expect(scored.confidence).toBeGreaterThan(0.5);
  });
});
```

### 9.2 Integration Tests

```typescript
// Test Firecrawl integration
describe('SiteCrawler', () => {
  it('should crawl competitor site', async () => {
    const result = await crawler.crawlSite({
      domain: 'example.com',
      maxPages: 10,
      maxDepth: 2,
      timeout: 60000
    });

    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.crawlStats.totalUrls).toBeGreaterThan(10);
  });

  it('should handle rate limits gracefully', async () => {
    // Simulate rate limit error
    firecrawlClient.crawl = jest.fn().mockRejectedValue({
      type: 'RATE_LIMIT'
    });

    await expect(
      crawler.crawlSite({ domain: 'example.com', maxPages: 50 })
    ).rejects.toThrow('RATE_LIMIT');
  });
});
```

### 9.3 End-to-End Tests

```typescript
// Test complete workflow
describe('CompetitorDeepAnalystAgent E2E', () => {
  it('should analyze competitors and store patterns', async () => {
    const agent = new CompetitorDeepAnalystAgent({
      researchService,
      firecrawlClient,
      intelligenceCurator,
      patternManager
    });

    const result = await agent.analyzeCompetitors({
      targetKeyword: 'typescript tutorial',
      maxCompetitors: 2,
      pagesPerCompetitor: 10
    });

    expect(result.competitors.length).toBe(2);
    expect(result.patterns.length).toBeGreaterThan(0);
    expect(result.summary.patternsExtracted).toBeGreaterThan(0);
  });
});
```

---

## 10. Deployment Checklist

- [ ] Firecrawl API credentials configured
- [ ] ResearchService available and tested
- [ ] Intelligence Curator storage directory exists
- [ ] Pattern Manager initialized with seed patterns
- [ ] Rate limiter configured for Firecrawl endpoints
- [ ] Cache directory created with proper permissions
- [ ] Error logging configured
- [ ] Monitoring metrics defined
- [ ] Documentation complete
- [ ] Unit tests passing (>90% coverage)
- [ ] Integration tests passing
- [ ] E2E test with real competitor passing

---

## 11. Future Enhancements

### Phase 3+

1. **Backlink Analysis Integration**
   - Use backlink data to enhance pattern confidence
   - Identify linkable asset patterns

2. **Performance Profiling**
   - Measure Core Web Vitals for competitor pages
   - Extract performance optimization patterns

3. **Visual Analysis**
   - Screenshot capture for layout patterns
   - Image analysis for visual trends

4. **Semantic Similarity**
   - RuVector integration for semantic pattern matching
   - Cross-domain pattern transfer learning

5. **Real-time Monitoring**
   - Periodic re-crawl to detect pattern changes
   - Competitive intelligence alerts

---

## 12. Confidence Assessment

**Overall Design Confidence:** 0.88

**Breakdown:**
- Architecture clarity: 0.95 (well-defined components and flow)
- Firecrawl integration: 0.85 (existing client available, needs TypeScript wrapper)
- Pattern extraction algorithms: 0.80 (need production validation)
- Integration points: 0.90 (Phase 1 components well-defined)
- Performance estimates: 0.85 (depend on Firecrawl API performance)
- Error handling: 0.90 (comprehensive strategies defined)

**Confidence Reduced By:**
- Firecrawl API performance unknowns (-0.05)
- Pattern extraction algorithm validation needed (-0.05)
- Rate limit impacts on crawl time (-0.02)

**Confidence Would Increase To 0.95+ With:**
- Firecrawl load testing (10+ competitor crawls)
- Pattern extraction validation with real competitor data
- Production deployment and monitoring for 2+ weeks

---

## 13. Next Steps

**Immediate (Phase 2 Sprint 1):**
1. Create TypeScript wrapper for Firecrawl client
2. Implement SiteCrawler class with rate limiting
3. Implement PatternIdentificationEngine core algorithms
4. Write unit tests for pattern extraction
5. Integration test with 1-2 real competitors

**Follow-up (Phase 2 Sprint 2):**
1. Optimize crawl performance and parallelization
2. Add caching layer for crawl results
3. Integrate with Pipeline Orchestrator Step 0
4. Production testing with 20+ competitors
5. Monitoring and metrics dashboard

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-01
**Next Review:** After Phase 2 Sprint 1 implementation

**Confidence Score:** 0.88
