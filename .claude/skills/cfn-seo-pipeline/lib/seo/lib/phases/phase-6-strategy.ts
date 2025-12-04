/**
 * Phase 6: Strategy Creation - SEO Site Onboarding
 *
 * @module seo/lib/phases/phase-6-strategy
 * @description Create actionable SEO strategy using RuVector pattern intelligence
 *
 * Sprint 1.4 - Loop 3 Iteration 1
 * Part of SEO Site Onboarding Design (Day 5-6)
 */

import type { Redis } from 'ioredis';
import type { ContentPatternEntry, CompetitorIntelligenceEntry } from '../ruvector/schemas';

// Collection interfaces (will be provided by caller)
export interface ContentPatternsCollection {
  search(params: {
    queryText: string;
    limit?: number;
    minConfidence?: number;
  }): Promise<ContentPatternEntry[]>;
}

export interface CompetitorIntelligenceCollection {
  search(params: {
    queryText: string;
    limit?: number;
    minFreshnessScore?: number;
  }): Promise<CompetitorIntelligenceEntry[]>;
}

/**
 * Configuration for Phase 6
 */
export interface Phase6Config {
  /** Redis client for reading Phase 1-5 data and writing Phase 6 output */
  redis: Redis;

  /** Content patterns collection for RuVector queries */
  contentPatterns: ContentPatternsCollection;

  /** Competitor intelligence collection for RuVector queries */
  competitorIntelligence: CompetitorIntelligenceCollection;

  /** Task ID for Redis key namespacing */
  taskId: string;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Site domain being analyzed */
  siteDomain: string;

  /** Industry/niche for pattern matching */
  industry: string;

  /** Current monthly traffic (if known) */
  currentTraffic?: number;

  /** Target traffic timeline (months) */
  targetTimelineMonths?: number;
}

/**
 * Content pillar definition
 */
export interface ContentPillar {
  /** Pillar name/topic */
  name: string;

  /** Description of the pillar */
  description: string;

  /** Priority level */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';

  /** Target keywords for this pillar */
  targetKeywords: string[];

  /** Estimated traffic potential */
  trafficPotential: number;

  /** Number of articles needed */
  articleCount: number;

  /** RuVector pattern that influenced this pillar */
  patternSource?: string;

  /** Related content gaps from Phase 5 */
  relatedGaps: string[];

  /** Suggested content types */
  contentTypes: string[];
}

/**
 * Quick win opportunity
 */
export interface QuickWin {
  /** Quick win name */
  name: string;

  /** Description of the opportunity */
  description: string;

  /** Effort level (1-10, 1 = easy) */
  effort: number;

  /** Impact level (1-10, 10 = high) */
  impact: number;

  /** Priority score (calculated from effort/impact) */
  priorityScore: number;

  /** Type of quick win */
  type: 'technical' | 'content' | 'on-page' | 'backlink';

  /** Implementation steps */
  steps: string[];

  /** Expected timeline (days) */
  estimatedDays: number;

  /** Expected traffic lift */
  expectedLift?: number;
}

/**
 * Link building strategy
 */
export interface LinkStrategy {
  /** Priority domains to target */
  priorityDomains: string[];

  /** Link building tactics */
  tactics: LinkTactic[];

  /** Monthly link acquisition targets */
  monthlyTargets: {
    month: number;
    targetLinks: number;
    targetDR: number;
  }[];

  /** Pattern-based recommendations */
  patternRecommendations: string[];
}

/**
 * Link building tactic
 */
export interface LinkTactic {
  /** Tactic name */
  name: string;

  /** Description */
  description: string;

  /** Difficulty (1-10) */
  difficulty: number;

  /** Expected links per month */
  expectedLinksPerMonth: number;

  /** Priority level */
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Technical task
 */
export interface TechnicalTask {
  /** Task name */
  name: string;

  /** Description */
  description: string;

  /** Priority level */
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

  /** Estimated effort (hours) */
  effort: number;

  /** Category */
  category: 'performance' | 'crawlability' | 'indexability' | 'schema' | 'security' | 'mobile';

  /** Implementation timeline */
  timeline: 'Week 1' | 'Week 2-3' | 'Week 4+' | 'Month 2+';

  /** Expected impact */
  impact: string;
}

/**
 * Traffic projection
 */
export interface TrafficProjection {
  /** Month number */
  month: number;

  /** Projected organic traffic */
  organicTraffic: number;

  /** Projected rankings */
  expectedRankings: {
    top3: number;
    top10: number;
    top20: number;
  };

  /** Key milestones */
  milestones: string[];

  /** Confidence level (0.0-1.0) */
  confidence: number;
}

/**
 * Pattern application record
 */
export interface PatternApplication {
  /** Pattern ID from RuVector */
  patternId: string;

  /** Pattern type */
  type: string;

  /** How pattern was applied */
  application: string;

  /** Expected impact */
  expectedImpact: string;

  /** Confidence in pattern (0.0-1.0) */
  confidence: number;
}

/**
 * Complete SEO strategy
 */
export interface SEOStrategy {
  /** Content pillars */
  contentPillars: ContentPillar[];

  /** Quick wins */
  quickWins: QuickWin[];

  /** Competitive advantages/moats */
  competitiveAdvantages: string[];

  /** Link building strategy */
  linkBuildingStrategy: LinkStrategy;

  /** Technical roadmap */
  technicalRoadmap: TechnicalTask[];

  /** Traffic projections */
  projections: {
    sixMonth: TrafficProjection;
    twelveMonth: TrafficProjection;
  };

  /** Pattern insights */
  patternInsights: PatternApplication[];

  /** Overall confidence (0.0-1.0) */
  confidence: number;

  /** Strategy summary */
  summary: string;
}

/**
 * Phase 6 result
 */
export interface Phase6Result {
  /** SEO strategy */
  strategy: SEOStrategy;

  /** Processing metadata */
  metadata: {
    processedAt: Date;
    phaseVersion: string;
    processingTime: number;
    patternsQueried: number;
    patternsApplied: number;
  };
}

/**
 * Execute Phase 6: Strategy Creation
 *
 * @param config - Phase 6 configuration
 * @returns SEO strategy with pattern-based recommendations
 */
export async function executePhase6(config: Phase6Config): Promise<Phase6Result> {
  const startTime = Date.now();
  const { redis, contentPatterns, competitorIntelligence, taskId, siteDomain, industry, verbose } = config;

  if (verbose) {
    console.log(`[Phase 6] Starting strategy creation for ${siteDomain}`);
  }

  // Step 1: Load Phase 1-5 data from Redis
  const phase1Raw = await redis.get(`seo:task:${taskId}:phase1`);
  const phase1Data = phase1Raw ? JSON.parse(phase1Raw) : null;
  const phase2Raw = await redis.get(`seo:task:${taskId}:phase2`);
  const phase2Data = phase2Raw ? JSON.parse(phase2Raw) : null;
  const phase3Raw = await redis.get(`seo:task:${taskId}:phase3`);
  const phase3Data = phase3Raw ? JSON.parse(phase3Raw) : null;
  const phase4Raw = await redis.get(`seo:task:${taskId}:phase4:keyword_universe`);
  const phase4Data = phase4Raw ? JSON.parse(phase4Raw) : null;
  const phase5Raw = await redis.get(`seo:task:${taskId}:phase5:gap_analysis`);
  const phase5Data = phase5Raw ? JSON.parse(phase5Raw) : null;

  if (!phase1Data || !phase4Data || !phase5Data) {
    throw new Error('Missing required phase data. Run Phases 1, 4, and 5 first.');
  }

  // Step 2: Query RuVector for successful content patterns
  const contentPatternResults = await queryContentPatterns(contentPatterns, industry, verbose);
  const competitorIntel = await queryCompetitorIntelligence(competitorIntelligence, industry, verbose);

  // Step 3: Define content pillars using pattern insights
  const pillars = await defineContentPillars(
    phase4Data,
    phase5Data,
    contentPatternResults,
    verbose
  );

  // Step 4: Identify quick wins from Phase 5 gaps
  const quickWins = await identifyQuickWins(phase1Data, phase5Data, verbose);

  // Step 5: Extract competitive advantages
  const competitiveAdvantages = await extractCompetitiveAdvantages(
    competitorIntel,
    contentPatternResults,
    verbose
  );

  // Step 6: Create link building strategy
  const linkBuildingStrategy = await createLinkStrategy(phase3Data, phase5Data, verbose);

  // Step 7: Build technical roadmap from Phase 1
  const technicalRoadmap = await buildTechnicalRoadmap(phase1Data, verbose);

  // Step 8: Estimate traffic projections
  const projections = await estimateProjections(
    config.currentTraffic || 0,
    pillars,
    quickWins,
    config.targetTimelineMonths || 12,
    verbose
  );

  // Step 9: Record pattern applications
  const patternInsights = recordPatternApplications(contentPatternResults, pillars);

  // Step 10: Calculate overall confidence
  const confidence = calculateStrategyConfidence(
    pillars,
    quickWins,
    technicalRoadmap,
    contentPatternResults.length
  );

  // Step 11: Generate strategy summary
  const summary = generateStrategySummary(
    pillars,
    quickWins,
    competitiveAdvantages,
    projections
  );

  const strategy: SEOStrategy = {
    contentPillars: pillars,
    quickWins,
    competitiveAdvantages,
    linkBuildingStrategy,
    technicalRoadmap,
    projections,
    patternInsights,
    confidence,
    summary,
  };

  // Step 12: Save strategy to Redis
  const redisKey = `seo:task:${taskId}:phase6:strategy`;
  await redis.set(redisKey, JSON.stringify(strategy), 'EX', 7 * 24 * 3600); // 7 day TTL

  const result: Phase6Result = {
    strategy,
    metadata: {
      processedAt: new Date(),
      phaseVersion: '1.0.0',
      processingTime: Date.now() - startTime,
      patternsQueried: contentPatternResults.length,
      patternsApplied: patternInsights.length,
    },
  };

  if (verbose) {
    console.log(`[Phase 6] Strategy created with ${pillars.length} pillars, ${quickWins.length} quick wins`);
    console.log(`[Phase 6] Confidence: ${(confidence * 100).toFixed(1)}%`);
  }

  return result;
}

/**
 * Load phase data from Redis (DEPRECATED - use direct redis.get with canonical keys)
 * Keeping for reference only - not used in updated implementation
 */
// async function loadPhaseData(redis: Redis, taskId: string, phase: string): Promise<any> {
//   const key = `seo:task:${taskId}:${phase}`;
//   const data = await redis.get(key);
//   return data ? JSON.parse(data) : null;
// }

/**
 * Query RuVector for content patterns
 */
async function queryContentPatterns(
  collection: ContentPatternsCollection,
  industry: string,
  verbose?: boolean
): Promise<ContentPatternEntry[]> {
  if (verbose) {
    console.log(`[Phase 6] Querying content patterns for industry: ${industry}`);
  }

  // Query for successful patterns in this industry
  const queryText = `Successful content strategies in ${industry}. High confidence patterns with proven results.`;

  try {
    const results = await collection.search({
      queryText,
      limit: 20,
      minConfidence: 0.7,
    });

    if (verbose) {
      console.log(`[Phase 6] Found ${results.length} relevant content patterns`);
    }

    return results;
  } catch (error) {
    if (verbose) {
      console.warn(`[Phase 6] Error querying content patterns:`, error);
    }
    return [];
  }
}

/**
 * Query RuVector for competitor intelligence
 */
async function queryCompetitorIntelligence(
  collection: CompetitorIntelligenceCollection,
  industry: string,
  verbose?: boolean
): Promise<CompetitorIntelligenceEntry[]> {
  if (verbose) {
    console.log(`[Phase 6] Querying competitor intelligence for industry: ${industry}`);
  }

  const queryText = `Competitor strategies and content gaps in ${industry}`;

  try {
    const results = await collection.search({
      queryText,
      limit: 10,
      minFreshnessScore: 0.5,
    });

    if (verbose) {
      console.log(`[Phase 6] Found ${results.length} competitor intelligence entries`);
    }

    return results;
  } catch (error) {
    if (verbose) {
      console.warn(`[Phase 6] Error querying competitor intelligence:`, error);
    }
    return [];
  }
}

/**
 * Define content pillars using pattern insights
 */
async function defineContentPillars(
  phase4Data: any,
  phase5Data: any,
  patterns: ContentPatternEntry[],
  verbose?: boolean
): Promise<ContentPillar[]> {
  const pillars: ContentPillar[] = [];
  const keywords = phase4Data.keywords || [];
  const contentGaps = phase5Data.contentGaps || [];

  // Group keywords into topic clusters
  const topicClusters = clusterKeywordsByTopic(keywords);

  // Create pillars from top clusters
  const topClusters = Object.entries(topicClusters)
    .sort(([, a], [, b]) => (b as any[]).length - (a as any[]).length)
    .slice(0, 5);

  for (const [topic, clusterKeywords] of topClusters) {
    const relatedGaps = contentGaps
      .filter((gap: any) => gap.topic.toLowerCase().includes(topic.toLowerCase()))
      .map((gap: any) => gap.topic);

    // Calculate traffic potential
    const trafficPotential = (clusterKeywords as any[]).reduce(
      (sum, kw) => sum + (kw.trafficPotential || kw.volume * 0.3),
      0
    );

    // Estimate article count
    const articleCount = Math.max(5, Math.min(20, Math.floor((clusterKeywords as any[]).length / 3)));

    // Find relevant patterns
    const relevantPattern = patterns.find((p) =>
      p.metadata.niche?.toLowerCase().includes(topic.toLowerCase())
    );

    // Determine content types from patterns
    const contentTypes = relevantPattern
      ? [relevantPattern.metadata.type.toLowerCase()]
      : ['guide', 'tutorial', 'comparison'];

    const pillar: ContentPillar = {
      name: topic,
      description: `Comprehensive coverage of ${topic} with ${articleCount} articles`,
      priority: trafficPotential > 10000 ? 'HIGH' : trafficPotential > 5000 ? 'MEDIUM' : 'LOW',
      targetKeywords: (clusterKeywords as any[]).slice(0, 10).map((kw) => kw.keyword),
      trafficPotential: Math.round(trafficPotential),
      articleCount,
      patternSource: relevantPattern?.id,
      relatedGaps,
      contentTypes,
    };

    pillars.push(pillar);
  }

  if (verbose) {
    console.log(`[Phase 6] Created ${pillars.length} content pillars`);
  }

  return pillars;
}

/**
 * Cluster keywords by topic
 */
function clusterKeywordsByTopic(keywords: any[]): Record<string, any[]> {
  const clusters: Record<string, any[]> = {};

  for (const keyword of keywords) {
    // Extract topic from keyword (first 2-3 words)
    const words = keyword.keyword.split(' ');
    const topic = words.slice(0, Math.min(3, words.length)).join(' ');

    if (!clusters[topic]) {
      clusters[topic] = [];
    }
    clusters[topic].push(keyword);
  }

  return clusters;
}

/**
 * Identify quick wins from gaps and technical issues
 */
async function identifyQuickWins(
  phase1Data: any,
  phase5Data: any,
  verbose?: boolean
): Promise<QuickWin[]> {
  const quickWins: QuickWin[] = [];

  // Technical quick wins from Phase 1
  const technicalIssues = phase1Data.technicalIssues || [];
  const easyFixes = technicalIssues.filter(
    (issue: any) => issue.severity === 'low' || issue.effort === 'low'
  );

  for (const issue of easyFixes.slice(0, 3)) {
    quickWins.push({
      name: `Fix: ${issue.type}`,
      description: issue.description || `Resolve ${issue.type} issue`,
      effort: 3,
      impact: 6,
      priorityScore: 6 / 3,
      type: 'technical',
      steps: [
        `Identify affected pages`,
        `Apply fix`,
        `Validate with Search Console`,
      ],
      estimatedDays: 2,
      expectedLift: 5,
    });
  }

  // Content quick wins from Phase 5 gaps
  const keywordGaps = phase5Data.keywordGaps || [];
  const lowHangingFruit = keywordGaps
    .filter((gap: any) => gap.difficulty < 30 && gap.volume > 100)
    .slice(0, 5);

  for (const gap of lowHangingFruit) {
    quickWins.push({
      name: `Target: ${gap.keyword}`,
      description: `Create content for low-competition keyword with ${gap.volume} monthly searches`,
      effort: 5,
      impact: 8,
      priorityScore: 8 / 5,
      type: 'content',
      steps: [
        `Research SERP intent`,
        `Create optimized article`,
        `Build internal links`,
      ],
      estimatedDays: 7,
      expectedLift: Math.round(gap.trafficPotential),
    });
  }

  // On-page optimization quick wins
  if (phase1Data.metaTags) {
    const missingMeta = phase1Data.metaTags.missingDescriptions || 0;
    if (missingMeta > 0) {
      quickWins.push({
        name: 'Add missing meta descriptions',
        description: `Write meta descriptions for ${missingMeta} pages`,
        effort: 4,
        impact: 5,
        priorityScore: 5 / 4,
        type: 'on-page',
        steps: [
          `Audit pages missing descriptions`,
          `Write compelling descriptions`,
          `Implement and test`,
        ],
        estimatedDays: 3,
        expectedLift: 3,
      });
    }
  }

  // Sort by priority score
  quickWins.sort((a, b) => b.priorityScore - a.priorityScore);

  if (verbose) {
    console.log(`[Phase 6] Identified ${quickWins.length} quick wins`);
  }

  return quickWins.slice(0, 10);
}

/**
 * Extract competitive advantages from intelligence
 */
async function extractCompetitiveAdvantages(
  competitorIntel: CompetitorIntelligenceEntry[],
  patterns: ContentPatternEntry[],
  verbose?: boolean
): Promise<string[]> {
  const advantages: string[] = [];

  // From competitor gaps
  for (const intel of competitorIntel.slice(0, 3)) {
    const contentGaps = intel.metadata.contentGaps || [];
    for (const gap of contentGaps.slice(0, 2)) {
      if (gap.priority === 'high') {
        advantages.push(`Opportunity: ${gap.opportunity} (competitors are weak here)`);
      }
    }
  }

  // From successful patterns
  const highConfidencePatterns = patterns.filter((p) => p.metadata.confidenceScore > 0.8);
  for (const pattern of highConfidencePatterns.slice(0, 3)) {
    advantages.push(`Apply proven ${pattern.metadata.type.toLowerCase()} pattern: ${pattern.metadata.description}`);
  }

  // Generic strategic advantages
  advantages.push('Focus on long-form, comprehensive content (2000+ words)');
  advantages.push('Build topical authority through content clusters');
  advantages.push('Leverage internal linking to distribute page authority');

  if (verbose) {
    console.log(`[Phase 6] Identified ${advantages.length} competitive advantages`);
  }

  return advantages.slice(0, 8);
}

/**
 * Create link building strategy
 */
async function createLinkStrategy(
  phase3Data: any,
  phase5Data: any,
  verbose?: boolean
): Promise<LinkStrategy> {
  const backlinks = phase3Data?.backlinks || [];
  const backlinkGaps = phase5Data?.backlinkGaps || [];

  // Priority domains from gaps
  const priorityDomains = backlinkGaps
    .filter((gap: any) => gap.linkingCompetitors >= 2)
    .slice(0, 15)
    .map((gap: any) => gap.domain);

  // Define tactics
  const tactics: LinkTactic[] = [
    {
      name: 'Guest posting',
      description: 'Write guest posts for relevant industry blogs',
      difficulty: 6,
      expectedLinksPerMonth: 3,
      priority: 'HIGH',
    },
    {
      name: 'Digital PR',
      description: 'Create newsworthy content and pitch to journalists',
      difficulty: 8,
      expectedLinksPerMonth: 5,
      priority: 'MEDIUM',
    },
    {
      name: 'Resource page outreach',
      description: 'Find resource pages and request inclusion',
      difficulty: 4,
      expectedLinksPerMonth: 4,
      priority: 'HIGH',
    },
    {
      name: 'Broken link building',
      description: 'Find broken links and suggest your content as replacement',
      difficulty: 5,
      expectedLinksPerMonth: 2,
      priority: 'MEDIUM',
    },
    {
      name: 'Unlinked mentions',
      description: 'Convert brand mentions to backlinks',
      difficulty: 3,
      expectedLinksPerMonth: 3,
      priority: 'HIGH',
    },
  ];

  // Monthly targets
  const monthlyTargets = [];
  for (let month = 1; month <= 12; month++) {
    monthlyTargets.push({
      month,
      targetLinks: Math.min(5 + month * 2, 30),
      targetDR: Math.min(30 + month * 2, 60),
    });
  }

  const strategy: LinkStrategy = {
    priorityDomains,
    tactics,
    monthlyTargets,
    patternRecommendations: [
      'Focus on relevance over pure DR/DA metrics',
      'Build links gradually to avoid penalty risk',
      'Diversify anchor text distribution (70% natural, 20% topical, 10% exact match)',
    ],
  };

  if (verbose) {
    console.log(`[Phase 6] Created link building strategy with ${tactics.length} tactics`);
  }

  return strategy;
}

/**
 * Build technical roadmap from Phase 1 issues
 */
async function buildTechnicalRoadmap(phase1Data: any, verbose?: boolean): Promise<TechnicalTask[]> {
  const issues = phase1Data.technicalIssues || [];
  const tasks: TechnicalTask[] = [];

  // Map issues to tasks
  for (const issue of issues) {
    const priority = mapIssuePriority(issue.severity);
    const timeline = mapIssueTimeline(issue.severity, issue.effort);

    tasks.push({
      name: `Fix ${issue.type}`,
      description: issue.description || `Resolve ${issue.type} issue`,
      priority,
      effort: mapEffortToHours(issue.effort),
      category: categorizeIssue(issue.type),
      timeline,
      impact: issue.impact || 'Improved crawlability and indexing',
    });
  }

  // Add standard technical tasks
  tasks.push({
    name: 'Implement schema markup',
    description: 'Add structured data for articles, products, and organization',
    priority: 'HIGH',
    effort: 16,
    category: 'schema',
    timeline: 'Week 2-3',
    impact: 'Enhanced SERP appearance with rich snippets',
  });

  tasks.push({
    name: 'Optimize Core Web Vitals',
    description: 'Improve LCP, FID, and CLS scores',
    priority: 'HIGH',
    effort: 24,
    category: 'performance',
    timeline: 'Week 2-3',
    impact: 'Better user experience and ranking signal',
  });

  // Sort by priority
  const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  if (verbose) {
    console.log(`[Phase 6] Built technical roadmap with ${tasks.length} tasks`);
  }

  return tasks;
}

function mapIssuePriority(severity?: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return 'CRITICAL';
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}

function mapIssueTimeline(
  severity?: string,
  effort?: string
): 'Week 1' | 'Week 2-3' | 'Week 4+' | 'Month 2+' {
  if (severity === 'critical') return 'Week 1';
  if (severity === 'high' && effort === 'low') return 'Week 2-3';
  if (effort === 'high') return 'Month 2+';
  return 'Week 4+';
}

function mapEffortToHours(effort?: string): number {
  switch (effort?.toLowerCase()) {
    case 'low':
      return 4;
    case 'medium':
      return 12;
    case 'high':
      return 24;
    default:
      return 8;
  }
}

function categorizeIssue(
  type: string
): 'performance' | 'crawlability' | 'indexability' | 'schema' | 'security' | 'mobile' {
  const lowerType = type.toLowerCase();
  if (lowerType.includes('speed') || lowerType.includes('performance')) return 'performance';
  if (lowerType.includes('crawl') || lowerType.includes('robots')) return 'crawlability';
  if (lowerType.includes('index') || lowerType.includes('canonical')) return 'indexability';
  if (lowerType.includes('schema') || lowerType.includes('structured')) return 'schema';
  if (lowerType.includes('ssl') || lowerType.includes('https')) return 'security';
  if (lowerType.includes('mobile') || lowerType.includes('responsive')) return 'mobile';
  return 'crawlability';
}

/**
 * Estimate traffic projections
 */
async function estimateProjections(
  currentTraffic: number,
  pillars: ContentPillar[],
  quickWins: QuickWin[],
  timelineMonths: number,
  verbose?: boolean
): Promise<{ sixMonth: TrafficProjection; twelveMonth: TrafficProjection }> {
  // Calculate potential from pillars and quick wins
  const totalPotential = pillars.reduce((sum, p) => sum + p.trafficPotential, 0);
  const quickWinLift = quickWins.reduce((sum, qw) => sum + (qw.expectedLift || 0), 0);

  // Conservative estimates with ramp-up curve
  const sixMonthTraffic = Math.round(currentTraffic + quickWinLift * 0.8 + totalPotential * 0.15);
  const twelveMonthTraffic = Math.round(currentTraffic + quickWinLift + totalPotential * 0.35);

  const sixMonth: TrafficProjection = {
    month: 6,
    organicTraffic: sixMonthTraffic,
    expectedRankings: {
      top3: Math.round(pillars.length * 2),
      top10: Math.round(pillars.length * 5),
      top20: Math.round(pillars.length * 10),
    },
    milestones: [
      'Technical foundation complete',
      'First 2-3 content pillars established',
      'Quick wins implemented',
      '50+ high-quality backlinks acquired',
    ],
    confidence: 0.75,
  };

  const twelveMonth: TrafficProjection = {
    month: 12,
    organicTraffic: twelveMonthTraffic,
    expectedRankings: {
      top3: Math.round(pillars.length * 4),
      top10: Math.round(pillars.length * 12),
      top20: Math.round(pillars.length * 25),
    },
    milestones: [
      'All content pillars fully developed',
      'Established topical authority',
      '100+ high-quality backlinks',
      'Multiple featured snippets and rich results',
    ],
    confidence: 0.65,
  };

  if (verbose) {
    console.log(`[Phase 6] 6-month projection: ${sixMonthTraffic} traffic (${sixMonth.confidence * 100}% confidence)`);
    console.log(`[Phase 6] 12-month projection: ${twelveMonthTraffic} traffic (${twelveMonth.confidence * 100}% confidence)`);
  }

  return { sixMonth, twelveMonth };
}

/**
 * Record which patterns were applied
 */
function recordPatternApplications(
  patterns: ContentPatternEntry[],
  pillars: ContentPillar[]
): PatternApplication[] {
  const applications: PatternApplication[] = [];

  for (const pillar of pillars) {
    if (pillar.patternSource) {
      const pattern = patterns.find((p) => p.id === pillar.patternSource);
      if (pattern) {
        applications.push({
          patternId: pattern.id,
          type: pattern.metadata.type,
          application: `Applied to ${pillar.name} content pillar`,
          expectedImpact: `${pillar.trafficPotential} monthly traffic from ${pillar.articleCount} articles`,
          confidence: pattern.metadata.confidenceScore,
        });
      }
    }
  }

  return applications;
}

/**
 * Calculate overall strategy confidence
 */
function calculateStrategyConfidence(
  pillars: ContentPillar[],
  quickWins: QuickWin[],
  technicalTasks: TechnicalTask[],
  patternCount: number
): number {
  // Base confidence from data quality
  let confidence = 0.7;

  // Boost from pattern intelligence
  if (patternCount >= 10) confidence += 0.1;

  // Boost from diverse quick wins
  if (quickWins.length >= 5) confidence += 0.05;

  // Boost from comprehensive pillars
  if (pillars.length >= 3) confidence += 0.05;

  // Boost from technical foundation
  const criticalTasks = technicalTasks.filter((t) => t.priority === 'CRITICAL');
  if (criticalTasks.length === 0) confidence += 0.05;

  return Math.min(0.95, confidence);
}

/**
 * Generate strategy summary
 */
function generateStrategySummary(
  pillars: ContentPillar[],
  quickWins: QuickWin[],
  advantages: string[],
  projections: { sixMonth: TrafficProjection; twelveMonth: TrafficProjection }
): string {
  const pillarNames = pillars.map((p) => p.name).join(', ');
  const quickWinTypes = Array.from(new Set(quickWins.map((qw) => qw.type))).join(', ');

  return `SEO strategy focused on ${pillars.length} content pillars (${pillarNames}) with ${quickWins.length} quick wins across ${quickWinTypes}. Projected ${projections.sixMonth.organicTraffic} monthly visitors at 6 months, ${projections.twelveMonth.organicTraffic} at 12 months. Key advantages: topical authority, pattern-based content, and systematic link building.`;
}
