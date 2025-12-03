/**
 * Phase 2: Content Inventory
 *
 * Sprint: 1.2
 * Purpose: Analyze content structure, quality, clusters, and internal linking
 */

import { TechnicalFoundationOutput } from './phase-1-technical';

export interface ContentInventoryInput {
  domain: string;
  phase1Output: TechnicalFoundationOutput;
  skipCache?: boolean;
}

export interface ContentInventoryOutput {
  domain: string;
  total_content_pages: number;
  content_by_type: ContentByType;
  content_quality_score: number; // 0.0-1.0
  content_clusters: ContentCluster[];
  internal_linking: InternalLinkingMetrics;
  cached: boolean;
  timestamp: string;
}

export interface ContentByType {
  blog_posts: number;
  product_pages: number;
  category_pages: number;
  landing_pages: number;
  other: number;
}

export interface ContentCluster {
  cluster_id: string;
  theme: string;
  page_count: number;
  avg_word_count: number;
  internal_links: number;
}

export interface InternalLinkingMetrics {
  avg_internal_links_per_page: number;
  orphan_pages: number; // Pages with no internal links
  hub_pages: string[]; // Top 5 most-linked pages
}

/**
 * Execute Phase 2: Content Inventory analysis
 *
 * Step 0: Query RuVector for content patterns (cache check)
 * Step 1: Analyze content structure (H1, meta, word count)
 * Step 2: Detect content clusters (semantic grouping)
 * Step 3: Assess internal linking
 * Step 4: Calculate content quality score
 * Step 4.5: Store patterns in RuVector
 *
 * Blocking Condition: Phase 1 health score must be >= 0.50
 */
export async function executePhase2(
  input: ContentInventoryInput
): Promise<ContentInventoryOutput> {
  const { domain, phase1Output, skipCache = false } = input;

  console.log(`[Phase 2] Starting Content Inventory for ${domain}`);

  // Validate Phase 1 health score (blocking condition from coordinator)
  if (phase1Output.technical_health_score < 0.50) {
    throw new Error(
      `Phase 1 health score too low: ${phase1Output.technical_health_score.toFixed(2)}. ` +
      `Must be >= 0.50 to proceed with content analysis.`
    );
  }

  console.log(
    `[Phase 2] Phase 1 health score validated: ${phase1Output.technical_health_score.toFixed(2)}`
  );

  // Step 0: Check RuVector cache (reuse similar site patterns)
  if (!skipCache) {
    console.log('[Phase 2] Checking RuVector for content patterns...');
    // TODO: Query content_patterns collection
    // const cachedPatterns = await queryCrossSitePatterns('content_inventory', domain);
    // if (cachedPatterns.length > 0) {
    //   console.log(`[Phase 2] Found ${cachedPatterns.length} cached patterns`);
    //   // Return cached results with cached: true
    // }
  }

  // Step 1: Analyze content structure
  console.log('[Phase 2] Analyzing content structure...');
  const contentByType = await analyzeContentStructure(domain, phase1Output);

  // Step 2: Detect content clusters
  console.log('[Phase 2] Detecting content clusters...');
  const clusters = await detectContentClusters(domain, phase1Output);

  // Step 3: Assess internal linking
  console.log('[Phase 2] Assessing internal linking...');
  const internalLinking = await assessInternalLinking(domain, phase1Output);

  // Step 4: Calculate quality score
  console.log('[Phase 2] Calculating content quality score...');
  const qualityScore = calculateContentQualityScore(
    contentByType,
    clusters,
    internalLinking
  );

  const output: ContentInventoryOutput = {
    domain,
    total_content_pages: phase1Output.crawl_results.total_pages,
    content_by_type: contentByType,
    content_quality_score: qualityScore,
    content_clusters: clusters,
    internal_linking: internalLinking,
    cached: false,
    timestamp: new Date().toISOString()
  };

  // Step 4.5: Store patterns in RuVector
  console.log('[Phase 2] Storing content patterns in RuVector...');
  // TODO: Store via logOnboardingResult or upsert pattern
  // await storeContentPatterns(domain, output);

  console.log(
    `[Phase 2] Complete: Quality score ${qualityScore.toFixed(2)}, ` +
    `${clusters.length} clusters, ${internalLinking.orphan_pages} orphan pages`
  );

  return output;
}

/**
 * Analyze content structure: page types, H1 tags, meta descriptions, word counts
 *
 * Stub implementation - will be replaced with actual crawling logic
 */
async function analyzeContentStructure(
  domain: string,
  phase1: TechnicalFoundationOutput
): Promise<ContentByType> {
  console.log(`[Phase 2] Analyzing content structure for ${domain}...`);

  // Use Phase 1 crawl results as baseline
  // Phase 1 provides total_pages and discoverable_pages counts
  const totalPages = phase1.crawl_results.total_pages;

  // Estimate content type distribution (in real implementation, would parse actual pages)
  // Default distribution: 40% blog, 30% product, 10% category, 15% landing, 5% other
  const contentByType: ContentByType = {
    blog_posts: Math.floor(totalPages * 0.4),
    product_pages: Math.floor(totalPages * 0.3),
    category_pages: Math.floor(totalPages * 0.1),
    landing_pages: Math.floor(totalPages * 0.15),
    other: Math.floor(totalPages * 0.05)
  };

  // TODO: Real implementation would:
  // 1. Extract H1 tags from all pages
  // 2. Extract meta descriptions
  // 3. Calculate word counts
  // 4. Classify pages by content type
  // 5. Identify thin content (<300 words)
  // 6. Identify duplicate content

  console.log(
    `[Phase 2] Content structure: ${contentByType.blog_posts} blog posts, ` +
    `${contentByType.product_pages} product pages, ${contentByType.landing_pages} landing pages`
  );

  return contentByType;
}

/**
 * Detect content clusters using semantic grouping
 *
 * Stub implementation - will be replaced with NLP clustering
 */
async function detectContentClusters(
  domain: string,
  phase1: TechnicalFoundationOutput
): Promise<ContentCluster[]> {
  console.log(`[Phase 2] Detecting content clusters for ${domain}...`);

  // TODO: Real implementation would:
  // 1. Extract keywords from H1/title tags
  // 2. Group pages by semantic similarity (TF-IDF, embeddings)
  // 3. Identify cluster themes
  // 4. Calculate cluster metrics (page count, word count, links)

  // Stub: Return example clusters
  const clusters: ContentCluster[] = [
    {
      cluster_id: 'cluster-1',
      theme: 'Product Features',
      page_count: 15,
      avg_word_count: 800,
      internal_links: 45
    },
    {
      cluster_id: 'cluster-2',
      theme: 'Getting Started',
      page_count: 10,
      avg_word_count: 1200,
      internal_links: 30
    },
    {
      cluster_id: 'cluster-3',
      theme: 'Integration Guides',
      page_count: 8,
      avg_word_count: 1500,
      internal_links: 24
    }
  ];

  console.log(`[Phase 2] Detected ${clusters.length} content clusters`);

  return clusters;
}

/**
 * Assess internal linking structure
 *
 * Stub implementation - will be replaced with graph analysis
 */
async function assessInternalLinking(
  domain: string,
  phase1: TechnicalFoundationOutput
): Promise<InternalLinkingMetrics> {
  console.log(`[Phase 2] Assessing internal linking for ${domain}...`);

  // Phase 2 calculates internal linking metrics (Phase 1 doesn't provide this data)
  const totalPages = phase1.crawl_results.total_pages;

  // Estimate internal linking metrics
  // Default: ~5 internal links per page on average, ~3% orphan pages
  const avgInternalLinksPerPage = 5.2;
  const estimatedOrphanPages = Math.max(0, Math.floor(totalPages * 0.03));

  // TODO: Real implementation would:
  // 1. Build internal link graph
  // 2. Calculate PageRank scores
  // 3. Identify hub pages (most inbound links)
  // 4. Identify orphan pages (no inbound links)
  // 5. Analyze anchor text distribution

  const metrics: InternalLinkingMetrics = {
    avg_internal_links_per_page: avgInternalLinksPerPage,
    orphan_pages: estimatedOrphanPages,
    hub_pages: ['/blog', '/products', '/features', '/pricing', '/docs']
  };

  console.log(
    `[Phase 2] Internal linking: ${metrics.avg_internal_links_per_page.toFixed(1)} avg links/page, ` +
    `${metrics.orphan_pages} orphan pages`
  );

  return metrics;
}

/**
 * Calculate content quality score (0.0-1.0)
 *
 * Weighted scoring:
 * - Content type distribution: 40% (favor blog posts and landing pages)
 * - Content clusters: 30% (more clusters = better organization)
 * - Internal linking: 30% (better linking = better SEO)
 */
function calculateContentQualityScore(
  contentByType: ContentByType,
  clusters: ContentCluster[],
  linking: InternalLinkingMetrics
): number {
  // Type score: favor blog posts and landing pages (content marketing)
  const totalPages = Object.values(contentByType).reduce((a, b) => a + b, 0) || 1;
  const contentMarketingPages = contentByType.blog_posts + contentByType.landing_pages;
  const typeScore = Math.min(contentMarketingPages / totalPages, 1.0);

  // Cluster score: aim for 5-10 clusters (good organization)
  const idealClusters = 7;
  const clusterScore = Math.min(clusters.length / idealClusters, 1.0);

  // Linking score: aim for 10+ avg internal links per page
  const idealLinks = 10;
  const linkingScore = Math.min(linking.avg_internal_links_per_page / idealLinks, 1.0);

  // Orphan page penalty: penalize sites with >5% orphan pages
  const orphanRatio = linking.orphan_pages / totalPages;
  const orphanPenalty = orphanRatio > 0.05 ? 0.8 : 1.0;

  // Weighted total with orphan penalty
  const rawScore = (typeScore * 0.4 + clusterScore * 0.3 + linkingScore * 0.3);
  return rawScore * orphanPenalty;
}
