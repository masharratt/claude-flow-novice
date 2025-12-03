/**
 * Phase 1: Technical Foundation
 *
 * Analyzes site technical health: crawl site, assess Core Web Vitals, audit indexability.
 * Part of Sprint 1.2 - 7-phase SEO onboarding pipeline.
 *
 * Pipeline Steps:
 * - Step 0: Query RuVector for existing site profile (cache check)
 * - Step 1: Crawl site (sitemap + discovery)
 * - Step 2: Assess Core Web Vitals via PageSpeed Insights API
 * - Step 3: Audit indexability (robots.txt, meta robots, canonicals)
 * - Step 4: Calculate technical health score
 * - Step 4.5: Store results in RuVector
 *
 * Blocking Condition: health_score < 0.50 fails pipeline
 *
 * @module seo/phases/phase-1-technical
 */

import { upsertSiteProfile, queryCrossSitePatterns } from '../ruvector/ruvector-client';
import { sanitizeRedisKey } from '../ruvector/onboarding-schemas';

// =============================================
// Input/Output Interfaces
// =============================================

/**
 * Phase 1 input parameters
 */
export interface TechnicalFoundationInput {
  /** Domain to analyze (e.g., 'example.com') */
  domain: string;

  /** Industry/vertical for pattern matching (optional) */
  industry?: string;

  /** Skip RuVector cache check (default false) */
  skipCache?: boolean;
}

/**
 * Phase 1 output results
 */
export interface TechnicalFoundationOutput {
  /** Sanitized domain name */
  domain: string;

  /** Technical health score (0.0-1.0) */
  technical_health_score: number;

  /** Site crawl results */
  crawl_results: CrawlResults;

  /** Core Web Vitals assessment */
  core_web_vitals: CoreWebVitals;

  /** Indexability audit results */
  indexability: IndexabilityAudit;

  /** Whether results came from cache */
  cached: boolean;

  /** ISO timestamp of analysis */
  timestamp: string;

  /** Blocking issues (if health_score < 0.50) */
  blocking_issues?: string[];
}

/**
 * Site crawl results
 */
export interface CrawlResults {
  /** Total pages discovered */
  total_pages: number;

  /** Pages discoverable via navigation */
  discoverable_pages: number;

  /** Sitemap URL (null if not found) */
  sitemap_url: string | null;

  /** Robots.txt URL (null if not found) */
  robots_txt_url: string | null;
}

/**
 * Core Web Vitals metrics
 */
export interface CoreWebVitals {
  /** Largest Contentful Paint in milliseconds */
  lcp: number;

  /** First Input Delay in milliseconds */
  fid: number;

  /** Cumulative Layout Shift (0.0-1.0) */
  cls: number;

  /** Overall performance score (0-100) */
  performance_score: number;
}

/**
 * Indexability audit results
 */
export interface IndexabilityAudit {
  /** Pages indexable by search engines */
  indexable_pages: number;

  /** Pages with noindex directive */
  noindex_pages: number;

  /** Pages with canonical issues */
  canonical_issues: number;

  /** Pages blocked by robots.txt */
  robots_blocked: number;
}

// =============================================
// Main Phase Execution
// =============================================

/**
 * Execute Phase 1: Technical Foundation analysis
 *
 * Performs comprehensive technical health assessment of a website, including
 * crawl analysis, Core Web Vitals, and indexability audit. Results are cached
 * in RuVector for future reference and pattern matching.
 *
 * @param input - Phase 1 input parameters
 * @returns Promise resolving to technical foundation output
 * @throws Error if health score < 0.50 (blocking condition)
 *
 * @example
 * ```typescript
 * const result = await executePhase1({
 *   domain: 'example.com',
 *   industry: 'healthcare',
 *   skipCache: false
 * });
 *
 * console.log(`Health score: ${result.technical_health_score.toFixed(2)}`);
 * console.log(`Total pages: ${result.crawl_results.total_pages}`);
 * console.log(`Performance: ${result.core_web_vitals.performance_score}`);
 * ```
 */
export async function executePhase1(
  input: TechnicalFoundationInput
): Promise<TechnicalFoundationOutput> {
  const { domain, industry, skipCache = false } = input;
  const sanitizedDomain = sanitizeRedisKey(domain);

  console.log(`[Phase 1] Starting Technical Foundation for ${domain}`);
  console.log(`[Phase 1] Industry: ${industry || 'unknown'}, Skip Cache: ${skipCache}`);

  // Step 0: Check RuVector cache for existing patterns
  let cacheHit = false;
  if (!skipCache && industry) {
    console.log(`[Phase 1 - Step 0] Querying RuVector for cached patterns...`);
    const patterns = await queryCrossSitePatterns(industry, 5);

    if (patterns.length > 0) {
      console.log(`[Phase 1 - Step 0] Cache hit: Found ${patterns.length} patterns for ${industry}`);
      cacheHit = true;
      // TODO: Use cached pattern data to optimize crawl strategy
      // For now, just log that patterns were found
    } else {
      console.log(`[Phase 1 - Step 0] Cache miss: No patterns found for ${industry}`);
    }
  }

  // Step 1: Crawl site
  console.log(`[Phase 1 - Step 1] Crawling site...`);
  const crawlResults = await crawlSite(domain);
  console.log(
    `[Phase 1 - Step 1] Crawl complete: ${crawlResults.total_pages} pages, ` +
      `${crawlResults.discoverable_pages} discoverable`
  );

  // Step 2: Assess Core Web Vitals
  console.log(`[Phase 1 - Step 2] Assessing Core Web Vitals...`);
  const coreWebVitals = await assessCoreWebVitals(domain);
  console.log(
    `[Phase 1 - Step 2] Core Web Vitals: LCP ${coreWebVitals.lcp}ms, ` +
      `FID ${coreWebVitals.fid}ms, CLS ${coreWebVitals.cls.toFixed(3)}, ` +
      `Performance ${coreWebVitals.performance_score}/100`
  );

  // Step 3: Audit indexability
  console.log(`[Phase 1 - Step 3] Auditing indexability...`);
  const indexability = await auditIndexability(domain, crawlResults);
  console.log(
    `[Phase 1 - Step 3] Indexability: ${indexability.indexable_pages} indexable, ` +
      `${indexability.noindex_pages} noindex, ${indexability.canonical_issues} canonical issues, ` +
      `${indexability.robots_blocked} blocked by robots.txt`
  );

  // Step 4: Calculate technical health score
  console.log(`[Phase 1 - Step 4] Calculating technical health score...`);
  const healthScore = calculateHealthScore(crawlResults, coreWebVitals, indexability);
  console.log(`[Phase 1 - Step 4] Technical health score: ${healthScore.toFixed(2)}`);

  // Check blocking condition: health_score < 0.50
  const blockingIssues: string[] = [];
  if (healthScore < 0.5) {
    console.error(`[Phase 1] BLOCKING: Health score ${healthScore.toFixed(2)} is below threshold 0.50`);

    // Identify specific blocking issues
    if (coreWebVitals.performance_score < 50) {
      blockingIssues.push(`Poor performance score: ${coreWebVitals.performance_score}/100`);
    }
    if (indexability.indexable_pages / crawlResults.total_pages < 0.5) {
      blockingIssues.push(
        `Low indexability: ${indexability.indexable_pages}/${crawlResults.total_pages} pages`
      );
    }
    if (crawlResults.discoverable_pages / crawlResults.total_pages < 0.7) {
      blockingIssues.push(
        `Poor discoverability: ${crawlResults.discoverable_pages}/${crawlResults.total_pages} pages`
      );
    }
  }

  // Step 4.5: Store results in RuVector
  console.log(`[Phase 1 - Step 4.5] Storing results in RuVector...`);
  await upsertSiteProfile(domain, {
    domain: sanitizedDomain,
    domainNormalized: sanitizedDomain.replace(/\./g, '-'),
    industry: industry || 'unknown',
    siteSize: crawlResults.total_pages < 100 ? 'small' : crawlResults.total_pages < 1000 ? 'medium' : 'large',
    niche: industry || 'unknown',
    technicalHealthScore: healthScore,
    technicalMetrics: [
      {
        name: 'Core Web Vitals',
        score: coreWebVitals.performance_score / 100,
        status:
          coreWebVitals.performance_score >= 90
            ? 'pass'
            : coreWebVitals.performance_score >= 50
              ? 'warning'
              : 'needs_improvement',
        details: `LCP: ${coreWebVitals.lcp}ms, FID: ${coreWebVitals.fid}ms, CLS: ${coreWebVitals.cls.toFixed(3)}`,
      },
      {
        name: 'Indexability',
        score: indexability.indexable_pages / crawlResults.total_pages,
        status:
          indexability.indexable_pages / crawlResults.total_pages >= 0.9
            ? 'pass'
            : indexability.indexable_pages / crawlResults.total_pages >= 0.7
              ? 'warning'
              : 'needs_improvement',
        details: `${indexability.indexable_pages}/${crawlResults.total_pages} pages indexable`,
      },
      {
        name: 'Discoverability',
        score: crawlResults.discoverable_pages / crawlResults.total_pages,
        status:
          crawlResults.discoverable_pages / crawlResults.total_pages >= 0.9
            ? 'pass'
            : crawlResults.discoverable_pages / crawlResults.total_pages >= 0.7
              ? 'warning'
              : 'needs_improvement',
        details: `${crawlResults.discoverable_pages}/${crawlResults.total_pages} pages discoverable`,
      },
    ],
    crawlData: {
      totalPages: crawlResults.total_pages,
      pagesWithIssues:
        crawlResults.total_pages -
        crawlResults.discoverable_pages +
        indexability.canonical_issues +
        indexability.robots_blocked,
      avgLoadTime: 2.5, // TODO: Implement actual load time measurement
      indexedPages: indexability.indexable_pages,
      robotsTxtStatus: crawlResults.robots_txt_url ? 'valid' : 'missing',
      mobileFriendlyScore: 0.85, // TODO: Implement actual mobile-friendly check
      coreWebVitalsScore: coreWebVitals.performance_score / 100,
    },
    totalPages: crawlResults.total_pages,
    avgWordCount: 500, // TODO: Calculate from crawl data
    thinContentPercent: 0.1, // TODO: Calculate from crawl data
    estimatedOrganicTraffic: undefined,
    estimatedDA: undefined,
    estimatedPA: undefined,
    backlinksCount: undefined,
    blockingConditionScore: healthScore,
    blockingIssues,
    topPriorityIssues: blockingIssues.slice(0, 3),
    quickWins: [],
    firstAnalyzedAt: new Date(),
    lastAnalyzedAt: new Date(),
    analysisCount: 1,
    onboardingRunIds: [],
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days
    freshnessScore: 1.0,
  });
  console.log(`[Phase 1 - Step 4.5] Results stored successfully`);

  // Build output
  const output: TechnicalFoundationOutput = {
    domain: sanitizedDomain,
    technical_health_score: healthScore,
    crawl_results: crawlResults,
    core_web_vitals: coreWebVitals,
    indexability,
    cached: cacheHit,
    timestamp: new Date().toISOString(),
    blocking_issues: blockingIssues.length > 0 ? blockingIssues : undefined,
  };

  // Log completion
  console.log(`[Phase 1] Complete: Health score ${healthScore.toFixed(2)}`);
  if (blockingIssues.length > 0) {
    console.error(`[Phase 1] BLOCKING ISSUES DETECTED:`);
    blockingIssues.forEach((issue, idx) => {
      console.error(`  ${idx + 1}. ${issue}`);
    });
    throw new Error(
      `Phase 1 blocked: Health score ${healthScore.toFixed(2)} < 0.50. ` +
        `Issues: ${blockingIssues.join('; ')}`
    );
  }

  return output;
}

// =============================================
// Helper Functions (Stubs for MVP)
// =============================================

/**
 * Crawl site to discover pages and resources
 *
 * TODO: Implement actual site crawl using:
 * - Sitemap.xml parsing
 * - Robots.txt parsing
 * - Internal link discovery
 * - Page metadata extraction
 *
 * @param domain - Domain to crawl
 * @returns Promise resolving to crawl results
 */
async function crawlSite(domain: string): Promise<CrawlResults> {
  console.log(`[Phase 1] Crawling ${domain}...`);

  // TODO: Implement actual crawl logic
  // Stub implementation for MVP
  await new Promise((resolve) => setTimeout(resolve, 200));

  return {
    total_pages: 100,
    discoverable_pages: 95,
    sitemap_url: `https://${domain}/sitemap.xml`,
    robots_txt_url: `https://${domain}/robots.txt`,
  };
}

/**
 * Assess Core Web Vitals using PageSpeed Insights API
 *
 * TODO: Integrate with Google PageSpeed Insights API:
 * - https://developers.google.com/speed/docs/insights/v5/get-started
 * - Measure LCP (Largest Contentful Paint)
 * - Measure FID (First Input Delay)
 * - Measure CLS (Cumulative Layout Shift)
 * - Calculate overall performance score
 *
 * @param domain - Domain to assess
 * @returns Promise resolving to Core Web Vitals metrics
 */
async function assessCoreWebVitals(domain: string): Promise<CoreWebVitals> {
  console.log(`[Phase 1] Assessing Core Web Vitals for ${domain}...`);

  // TODO: Implement PageSpeed Insights API integration
  // Stub implementation for MVP
  await new Promise((resolve) => setTimeout(resolve, 200));

  return {
    lcp: 2400, // Good: < 2500ms
    fid: 80, // Good: < 100ms
    cls: 0.05, // Good: < 0.1
    performance_score: 85, // 0-100
  };
}

/**
 * Audit site indexability
 *
 * TODO: Implement indexability checks:
 * - Parse robots.txt for blocked paths
 * - Detect meta robots noindex directives
 * - Identify canonical tag issues
 * - Check X-Robots-Tag headers
 *
 * @param domain - Domain to audit
 * @param crawlResults - Results from site crawl
 * @returns Promise resolving to indexability audit
 */
async function auditIndexability(
  domain: string,
  crawlResults: CrawlResults
): Promise<IndexabilityAudit> {
  console.log(`[Phase 1] Auditing indexability for ${domain}...`);

  // TODO: Implement indexability checks
  // Stub implementation for MVP
  await new Promise((resolve) => setTimeout(resolve, 200));

  return {
    indexable_pages: 90,
    noindex_pages: 5,
    canonical_issues: 2,
    robots_blocked: 3,
  };
}

/**
 * Calculate overall technical health score
 *
 * Weighted scoring formula:
 * - 30% crawl discoverability (discoverable_pages / total_pages)
 * - 40% Core Web Vitals performance (performance_score / 100)
 * - 30% indexability (indexable_pages / total_pages)
 *
 * @param crawl - Crawl results
 * @param vitals - Core Web Vitals metrics
 * @param indexability - Indexability audit results
 * @returns Health score (0.0-1.0)
 */
function calculateHealthScore(
  crawl: CrawlResults,
  vitals: CoreWebVitals,
  indexability: IndexabilityAudit
): number {
  // Prevent division by zero
  if (crawl.total_pages === 0) {
    return 0.0;
  }

  // Calculate component scores
  const crawlScore = crawl.discoverable_pages / crawl.total_pages;
  const vitalsScore = vitals.performance_score / 100;
  const indexScore = indexability.indexable_pages / crawl.total_pages;

  // Apply weights: 30% crawl, 40% vitals, 30% indexability
  const healthScore = crawlScore * 0.3 + vitalsScore * 0.4 + indexScore * 0.3;

  // Clamp to [0.0, 1.0]
  return Math.max(0.0, Math.min(1.0, healthScore));
}
