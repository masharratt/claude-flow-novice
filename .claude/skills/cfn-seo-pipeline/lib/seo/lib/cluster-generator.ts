/**
 * SEO Content Cluster Generator
 * Branches after research phase to generate multiple coordinated content pieces
 *
 * @module .claude/skills/cfn-seo-pipeline/lib/seo/lib/cluster-generator
 * @description Maximizes research investment by generating persona variants,
 *              pillar + supporting content, and pre-planned internal linking
 * @version 1.0.0
 */

import { ClusterResearchContextBuilder, ClusterResearchContext, ClusterContextQuery } from './cluster-research-context';
import type { SEOQueryManager } from './ruvector/queries';

/**
 * Cluster generation mode
 */
export type ClusterMode =
  | 'persona-variants'      // Same topic, different audience angles
  | 'pillar-cluster'        // Hub page + supporting articles
  | 'format-variants'       // Same research, different content formats
  | 'comprehensive';        // All of the above combined

/**
 * Persona definition for variant generation
 */
export interface PersonaDefinition {
  /** Unique persona identifier */
  id: string;

  /** Persona name (e.g., "busy-parent", "genealogist", "tech-millennial") */
  name: string;

  /** Persona description */
  description: string;

  /** Pain points this persona has */
  painPoints: string[];

  /** Goals this persona wants to achieve */
  goals: string[];

  /** Preferred content tone */
  preferredTone: 'casual' | 'professional' | 'technical' | 'emotional' | 'practical';

  /** Preferred content depth */
  preferredDepth: 'quick-tips' | 'moderate' | 'comprehensive' | 'expert';

  /** Keywords that resonate with this persona */
  resonantKeywords: string[];

  /** Content format preferences */
  formatPreferences: ContentFormat[];
}

/**
 * Content format types
 */
export type ContentFormat =
  | 'pillar-guide'          // Comprehensive guide (2500-4000 words)
  | 'how-to'                // Step-by-step tutorial (1500-2000 words)
  | 'listicle'              // List-based article (1200-1800 words)
  | 'comparison'            // X vs Y comparison (1500-2000 words)
  | 'faq'                   // FAQ page (800-1200 words)
  | 'case-study'            // Real example deep-dive (1500-2500 words)
  | 'checklist'             // Actionable checklist (600-1000 words)
  | 'glossary'              // Term definitions (variable)
  | 'resource-roundup';     // Curated resources (1000-1500 words)

/**
 * Pillar-cluster relationship
 */
export interface PillarClusterPlan {
  /** Pillar article definition */
  pillar: {
    /** Target keyword for pillar */
    keyword: string;
    /** Pillar title */
    title: string;
    /** Target word count (typically 2500-4000) */
    wordCount: number;
    /** URL slug */
    slug: string;
    /** Sections that will link to supporting content */
    linkableSections: string[];
  };

  /** Supporting articles */
  supporting: SupportingArticle[];

  /** Internal linking matrix */
  linkingStrategy: InternalLinkMatrix;

  /** Estimated total word count */
  totalWordCount: number;

  /** Estimated research reuse percentage */
  researchReusePercentage: number;
}

/**
 * Supporting article in a cluster
 */
export interface SupportingArticle {
  /** Article ID */
  id: string;

  /** Target keyword (typically long-tail from research) */
  keyword: string;

  /** Article title */
  title: string;

  /** Content format */
  format: ContentFormat;

  /** Target word count */
  wordCount: number;

  /** URL slug */
  slug: string;

  /** Which pillar section this supports */
  supportsPillarSection: string;

  /** Search intent this targets */
  searchIntent: 'informational' | 'navigational' | 'transactional' | 'commercial';

  /** Persona this is optimized for (optional) */
  targetPersona?: string;

  /** Priority in creation order */
  priority: 'high' | 'medium' | 'low';

  /** Dependencies (articles that should be created first) */
  dependencies: string[];
}

/**
 * Internal linking matrix
 */
export interface InternalLinkMatrix {
  /** Links from pillar to supporting */
  pillarToSupporting: LinkDefinition[];

  /** Links from supporting to pillar */
  supportingToPillar: LinkDefinition[];

  /** Cross-links between supporting articles */
  supportingToSupporting: LinkDefinition[];

  /** Suggested anchor text variations */
  anchorTextVariations: Map<string, string[]>;
}

/**
 * Link definition
 */
export interface LinkDefinition {
  /** Source article ID */
  from: string;

  /** Target article ID */
  to: string;

  /** Suggested anchor text */
  anchorText: string;

  /** Context where link should appear */
  contextHint: string;

  /** Link priority */
  priority: 'required' | 'recommended' | 'optional';
}

/**
 * Cluster generation configuration
 */
export interface ClusterGeneratorConfig {
  /** Primary topic/keyword from research */
  primaryKeyword: string;

  /** Cluster generation mode */
  mode: ClusterMode;

  /** Persona definitions (for persona-variants mode) */
  personas?: PersonaDefinition[];

  /** Maximum articles to generate */
  maxArticles?: number;

  /** Minimum word count per article */
  minWordCount?: number;

  /** Target total cluster word count */
  targetTotalWordCount?: number;

  /** Brand voice guidelines */
  brandVoice?: string;

  /** Content formats to include */
  allowedFormats?: ContentFormat[];

  /** Enable verbose logging */
  verbose?: boolean;

  /** SEO Query Manager for RuVector operations */
  seoQueryManager?: SEOQueryManager;

  /** Cluster Research Context Builder */
  contextBuilder?: ClusterResearchContextBuilder;

  /** Enable RuVector research context integration */
  enableRuVectorContext?: boolean;

  /** Cluster ID for tagging research */
  clusterId?: string;

  /** Niche category */
  niche?: string;

  /** Parent niche for cross-niche queries */
  parentNiche?: string;
}

/**
 * Research context passed from Steps 0-4
 */
export interface ResearchContext {
  /** Step 1: Keyword research results */
  keywordResearch: {
    primaryKeyword: string;
    secondaryKeywords: SecondaryKeyword[];
    longTailKeywords: string[];
    peopleAlsoAsk: string[];
    searchIntent: string;
  };

  /** Step 2 + 2.5: Competitor analysis results */
  competitorAnalysis: {
    competitors: string[];
    contentGaps: ContentGap[];
    hubPages: HubPageInfo[];
    architecturePatterns: string[];
    contentLengthPatterns: { min: number; max: number; avg: number };
  };

  /** Step 3 + 3.5: SERP analysis results */
  serpAnalysis: {
    features: SERPFeatureInfo[];
    rankingPatterns: RankingPattern[];
    semanticClusters: SemanticCluster[];
    recommendations: string[];
  };

  /** Step 4: Deep research results */
  deepResearch: {
    sources: ResearchSource[];
    realExamples: RealExample[];
    expertSources: ExpertSource[];
    counterExamples: CounterExample[];
    statistics: Statistic[];
  };

  /** Intelligence loaded from Step 0 */
  intelligence?: {
    patterns: any[];
    riskWarnings: any[];
  };

  /** RuVector cached research context */
  ruVectorContext?: ClusterResearchContext;
}

// Supporting types
interface SecondaryKeyword {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  cpc?: number;
}

interface ContentGap {
  topic: string;
  priority: 'high' | 'medium' | 'low';
  competitorsCovering: number;
  opportunity: string;
}

interface HubPageInfo {
  url: string;
  topic: string;
  internalLinks: number;
}

interface SERPFeatureInfo {
  type: string;
  present: boolean;
  opportunity: boolean;
}

interface RankingPattern {
  factor: string;
  pattern: string;
  importance: 'high' | 'medium' | 'low';
}

interface SemanticCluster {
  topic: string;
  relatedTerms: string[];
  coverage: number;
}

interface ResearchSource {
  url: string;
  title: string;
  credibility: number;
  keyInsights: string[];
}

interface RealExample {
  source: string;
  content: string;
  relevance: number;
}

interface ExpertSource {
  name: string;
  credentials: string;
  quotes: string[];
}

interface CounterExample {
  scenario: string;
  lesson: string;
}

interface Statistic {
  value: string;
  source: string;
  citation: string;
}

/**
 * Cluster generation result
 */
export interface ClusterGenerationResult {
  /** Generation mode used */
  mode: ClusterMode;

  /** Primary keyword */
  primaryKeyword: string;

  /** Pillar-cluster plan (if applicable) */
  pillarPlan?: PillarClusterPlan;

  /** Persona variants generated */
  personaVariants?: PersonaVariant[];

  /** Format variants generated */
  formatVariants?: FormatVariant[];

  /** All articles to be created */
  articles: ArticlePlan[];

  /** Internal linking strategy */
  linkingStrategy: InternalLinkMatrix;

  /** Execution order (respects dependencies) */
  executionOrder: string[];

  /** Estimated metrics */
  estimates: {
    totalArticles: number;
    totalWordCount: number;
    researchReusePercentage: number;
    estimatedCostSavings: string;
    estimatedTimeSavings: string;
  };

  /** Research segments for each article */
  researchAllocation: Map<string, ResearchSegment>;

  /** Cluster ID assigned */
  clusterId: string;

  /** RuVector context used (if enabled) */
  ruVectorContext?: ClusterResearchContext;

  /** Research efficiency metrics */
  researchEfficiency?: {
    /** Percentage of research from cache */
    cacheHitRate: number;
    /** API calls saved */
    apiCallsSaved: number;
    /** Time saved in minutes */
    timeSavedMinutes: number;
    /** Cost saved in USD */
    costSavedUSD: number;
  };
}

/**
 * Persona variant
 */
export interface PersonaVariant {
  /** Persona ID */
  personaId: string;

  /** Article ID */
  articleId: string;

  /** Customized angle for this persona */
  angle: {
    thesis: string;
    voiceProfile: string;
    painPointsAddressed: string[];
    cta: string;
  };

  /** Keywords emphasized for this persona */
  emphasizedKeywords: string[];
}

/**
 * Format variant
 */
export interface FormatVariant {
  /** Format type */
  format: ContentFormat;

  /** Article ID */
  articleId: string;

  /** Format-specific structure */
  structure: string[];

  /** Target keyword (may be long-tail) */
  targetKeyword: string;
}

/**
 * Article plan for generation
 */
export interface ArticlePlan {
  /** Unique article ID */
  id: string;

  /** Article type */
  type: 'pillar' | 'supporting' | 'persona-variant' | 'format-variant';

  /** Target keyword */
  keyword: string;

  /** Planned title */
  title: string;

  /** Content format */
  format: ContentFormat;

  /** Target persona (if applicable) */
  persona?: string;

  /** URL slug */
  slug: string;

  /** Target word count */
  wordCount: number;

  /** Priority */
  priority: number;

  /** Dependencies */
  dependencies: string[];

  /** Research segments to use */
  researchSegments: string[];

  /** Angle customization */
  angleCustomization: {
    thesis: string;
    voice: string;
    depth: string;
  };

  /** SEO targets */
  seoTargets: {
    primaryKeyword: string;
    secondaryKeywords: string[];
    serpFeatures: string[];
    internalLinks: LinkDefinition[];
  };
}

/**
 * Research segment allocation
 */
export interface ResearchSegment {
  /** Segment ID */
  id: string;

  /** Segment type */
  type: 'keyword' | 'competitor' | 'serp' | 'example' | 'expert' | 'statistic';

  /** Content of this segment */
  content: any;

  /** Articles using this segment */
  usedBy: string[];

  /** Reuse count */
  reuseCount: number;
}

/**
 * Generate content cluster from research context
 */
export async function generateCluster(
  research: ResearchContext,
  config: ClusterGeneratorConfig
): Promise<ClusterGenerationResult> {
  const startTime = Date.now();

  if (config.verbose) {
    console.log('='.repeat(80));
    console.log('SEO Content Cluster Generator');
    console.log('='.repeat(80));
    console.log(`Mode: ${config.mode}`);
    console.log(`Primary Keyword: ${config.primaryKeyword}`);
    console.log(`Max Articles: ${config.maxArticles || 'unlimited'}`);
    console.log('='.repeat(80));
  }

  // Generate or use cluster ID
  const clusterId = config.clusterId || `cluster-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Query RuVector context before generation (if enabled)
  let ruVectorContext: ClusterResearchContext | undefined;

  if (config.enableRuVectorContext && config.contextBuilder) {
    const contextQuery: ClusterContextQuery = {
      clusterId,
      primaryTopic: config.primaryKeyword,
      niche: config.niche || 'general',
      parentNiche: config.parentNiche,
      includeCrossNiche: true,
    };

    ruVectorContext = await config.contextBuilder.buildContext(contextQuery);

    if (config.verbose) {
      console.log(`[ClusterGenerator] RuVector context loaded:`);
      console.log(`  - Cache completeness: ${(ruVectorContext.cacheStatus.overallCompleteness * 100).toFixed(1)}%`);
      console.log(`  - Experts available: ${ruVectorContext.expertSources.length}`);
      console.log(`  - Statistics available: ${ruVectorContext.statistics.length}`);
      console.log(`  - Research gaps: ${ruVectorContext.researchGaps.length}`);
    }
  }

  // Initialize result
  const result: ClusterGenerationResult = {
    mode: config.mode,
    primaryKeyword: config.primaryKeyword,
    clusterId,
    articles: [],
    linkingStrategy: {
      pillarToSupporting: [],
      supportingToPillar: [],
      supportingToSupporting: [],
      anchorTextVariations: new Map(),
    },
    executionOrder: [],
    estimates: {
      totalArticles: 0,
      totalWordCount: 0,
      researchReusePercentage: 0,
      estimatedCostSavings: '',
      estimatedTimeSavings: '',
    },
    researchAllocation: new Map(),
  };

  // Merge cached research into ResearchContext (if available)
  if (ruVectorContext) {
    // Merge cached experts into research context
    if (ruVectorContext.expertSources.length > 0 && research.deepResearch) {
      const cachedExperts = ruVectorContext.expertSources.map(e => ({
        name: e.metadata.name,
        credentials: e.metadata.credentials,
        quotes: e.metadata.quotes.map(q => q.text),
      }));
      research.deepResearch.expertSources = [
        ...research.deepResearch.expertSources,
        ...cachedExperts,
      ];
    }

    // Merge cached statistics
    if (ruVectorContext.statistics.length > 0 && research.deepResearch) {
      const cachedStats = ruVectorContext.statistics.map(s => ({
        value: s.metadata.statistic,
        source: s.metadata.sourceName,
        citation: s.metadata.sourceUrl,
      }));
      research.deepResearch.statistics = [
        ...research.deepResearch.statistics,
        ...cachedStats,
      ];
    }

    // Store RuVector context in research
    research.ruVectorContext = ruVectorContext;
  }

  // Generate based on mode
  switch (config.mode) {
    case 'pillar-cluster':
      await generatePillarCluster(research, config, result);
      break;

    case 'persona-variants':
      await generatePersonaVariants(research, config, result);
      break;

    case 'format-variants':
      await generateFormatVariants(research, config, result);
      break;

    case 'comprehensive':
      await generateComprehensiveCluster(research, config, result);
      break;
  }

  // Calculate execution order (topological sort based on dependencies)
  result.executionOrder = calculateExecutionOrder(result.articles);

  // Calculate estimates
  result.estimates = calculateEstimates(result, research);

  // Allocate research segments
  result.researchAllocation = allocateResearchSegments(result.articles, research);

  // Calculate research efficiency metrics (if RuVector was used)
  if (ruVectorContext) {
    const totalPossibleCalls = 50; // Estimated API calls for full research
    const callsSaved = ruVectorContext.estimatedSavings.apiCallsSaved;

    result.researchEfficiency = {
      cacheHitRate: ruVectorContext.cacheStatus.overallCompleteness,
      apiCallsSaved: callsSaved,
      timeSavedMinutes: ruVectorContext.estimatedSavings.timeSavedMinutes,
      costSavedUSD: ruVectorContext.estimatedSavings.costSavedUSD,
    };

    result.ruVectorContext = ruVectorContext;
  }

  if (config.verbose) {
    console.log('='.repeat(80));
    console.log('Cluster Generation Complete');
    console.log(`Articles: ${result.estimates.totalArticles}`);
    console.log(`Total Words: ${result.estimates.totalWordCount}`);
    console.log(`Research Reuse: ${result.estimates.researchReusePercentage}%`);
    console.log(`Cost Savings: ${result.estimates.estimatedCostSavings}`);
    console.log(`Time Savings: ${result.estimates.estimatedTimeSavings}`);
    if (result.researchEfficiency) {
      console.log('='.repeat(80));
      console.log('RuVector Research Efficiency:');
      console.log(`Cache Hit Rate: ${(result.researchEfficiency.cacheHitRate * 100).toFixed(1)}%`);
      console.log(`API Calls Saved: ${result.researchEfficiency.apiCallsSaved}`);
      console.log(`Time Saved: ${result.researchEfficiency.timeSavedMinutes.toFixed(1)} minutes`);
      console.log(`Cost Saved: $${result.researchEfficiency.costSavedUSD.toFixed(2)}`);
    }
    console.log('='.repeat(80));
  }

  return result;
}

/**
 * Generate pillar + supporting cluster
 */
async function generatePillarCluster(
  research: ResearchContext,
  config: ClusterGeneratorConfig,
  result: ClusterGenerationResult
): Promise<void> {
  const { primaryKeyword } = config;
  const { keywordResearch, competitorAnalysis, serpAnalysis } = research;

  // Create pillar article plan
  const pillarId = `pillar-${slugify(primaryKeyword)}`;
  const pillarArticle: ArticlePlan = {
    id: pillarId,
    type: 'pillar',
    keyword: primaryKeyword,
    title: `Complete Guide to ${titleCase(primaryKeyword)}: Everything You Need to Know`,
    format: 'pillar-guide',
    slug: slugify(primaryKeyword),
    wordCount: 3500,
    priority: 1,
    dependencies: [],
    researchSegments: ['all'],
    angleCustomization: {
      thesis: `The definitive resource for ${primaryKeyword}`,
      voice: config.brandVoice || 'authoritative yet approachable',
      depth: 'comprehensive',
    },
    seoTargets: {
      primaryKeyword,
      secondaryKeywords: keywordResearch.secondaryKeywords.slice(0, 5).map(k => k.keyword),
      serpFeatures: serpAnalysis.features.filter(f => f.opportunity).map(f => f.type),
      internalLinks: [],
    },
  };

  result.articles.push(pillarArticle);

  // Generate supporting articles from:
  // 1. People Also Ask questions
  // 2. Long-tail keywords
  // 3. Content gaps
  // 4. Semantic clusters

  let supportingPriority = 2;

  // From PAA questions - create FAQ and how-to articles
  for (const question of keywordResearch.peopleAlsoAsk.slice(0, 3)) {
    const articleId = `supporting-paa-${supportingPriority}`;
    const supportingArticle: ArticlePlan = {
      id: articleId,
      type: 'supporting',
      keyword: question,
      title: question.endsWith('?') ? question : `${question}?`,
      format: question.toLowerCase().startsWith('how') ? 'how-to' : 'faq',
      slug: slugify(question),
      wordCount: question.toLowerCase().startsWith('how') ? 1500 : 1000,
      priority: supportingPriority++,
      dependencies: [pillarId],
      researchSegments: ['paa', 'examples', 'experts'],
      angleCustomization: {
        thesis: `Direct answer to: ${question}`,
        voice: config.brandVoice || 'helpful and concise',
        depth: 'focused',
      },
      seoTargets: {
        primaryKeyword: question,
        secondaryKeywords: [],
        serpFeatures: ['featured_snippet', 'people_also_ask'],
        internalLinks: [],
      },
    };

    result.articles.push(supportingArticle);

    // Add linking
    result.linkingStrategy.pillarToSupporting.push({
      from: pillarId,
      to: articleId,
      anchorText: question,
      contextHint: 'In the FAQ or related questions section',
      priority: 'required',
    });

    result.linkingStrategy.supportingToPillar.push({
      from: articleId,
      to: pillarId,
      anchorText: `complete guide to ${primaryKeyword}`,
      contextHint: 'In the introduction or conclusion',
      priority: 'required',
    });
  }

  // From long-tail keywords - create focused articles
  for (const longTail of keywordResearch.longTailKeywords.slice(0, 3)) {
    const articleId = `supporting-longtail-${supportingPriority}`;
    const format = determineFormatFromKeyword(longTail);

    const supportingArticle: ArticlePlan = {
      id: articleId,
      type: 'supporting',
      keyword: longTail,
      title: generateTitleFromKeyword(longTail, format),
      format,
      slug: slugify(longTail),
      wordCount: getWordCountForFormat(format),
      priority: supportingPriority++,
      dependencies: [pillarId],
      researchSegments: ['longtail', 'examples', 'statistics'],
      angleCustomization: {
        thesis: `Focused guide on ${longTail}`,
        voice: config.brandVoice || 'practical and actionable',
        depth: 'moderate',
      },
      seoTargets: {
        primaryKeyword: longTail,
        secondaryKeywords: [primaryKeyword],
        serpFeatures: [],
        internalLinks: [],
      },
    };

    result.articles.push(supportingArticle);

    result.linkingStrategy.pillarToSupporting.push({
      from: pillarId,
      to: articleId,
      anchorText: longTail,
      contextHint: 'Within relevant section of pillar',
      priority: 'recommended',
    });

    result.linkingStrategy.supportingToPillar.push({
      from: articleId,
      to: pillarId,
      anchorText: primaryKeyword,
      contextHint: 'Introduction paragraph',
      priority: 'required',
    });
  }

  // From content gaps - create articles competitors don't have
  for (const gap of competitorAnalysis.contentGaps.filter(g => g.priority === 'high').slice(0, 2)) {
    const articleId = `supporting-gap-${supportingPriority}`;

    const supportingArticle: ArticlePlan = {
      id: articleId,
      type: 'supporting',
      keyword: gap.topic,
      title: `${titleCase(gap.topic)}: ${gap.opportunity}`,
      format: 'how-to',
      slug: slugify(gap.topic),
      wordCount: 1800,
      priority: supportingPriority++,
      dependencies: [pillarId],
      researchSegments: ['gaps', 'examples', 'counterexamples'],
      angleCustomization: {
        thesis: gap.opportunity,
        voice: config.brandVoice || 'expert and thorough',
        depth: 'comprehensive',
      },
      seoTargets: {
        primaryKeyword: gap.topic,
        secondaryKeywords: [primaryKeyword],
        serpFeatures: [],
        internalLinks: [],
      },
    };

    result.articles.push(supportingArticle);

    result.linkingStrategy.pillarToSupporting.push({
      from: pillarId,
      to: articleId,
      anchorText: gap.topic,
      contextHint: 'As a differentiation point',
      priority: 'recommended',
    });
  }

  // Build pillar plan
  result.pillarPlan = {
    pillar: {
      keyword: primaryKeyword,
      title: pillarArticle.title,
      wordCount: pillarArticle.wordCount,
      slug: pillarArticle.slug,
      linkableSections: result.articles
        .filter(a => a.type === 'supporting')
        .map(a => a.keyword),
    },
    supporting: result.articles
      .filter(a => a.type === 'supporting')
      .map(a => ({
        id: a.id,
        keyword: a.keyword,
        title: a.title,
        format: a.format,
        wordCount: a.wordCount,
        slug: a.slug,
        supportsPillarSection: a.keyword,
        searchIntent: 'informational',
        priority: a.priority <= 3 ? 'high' : a.priority <= 5 ? 'medium' : 'low',
        dependencies: a.dependencies,
      })),
    linkingStrategy: result.linkingStrategy,
    totalWordCount: result.articles.reduce((sum, a) => sum + a.wordCount, 0),
    researchReusePercentage: 85,
  };
}

/**
 * Generate persona variants
 */
async function generatePersonaVariants(
  research: ResearchContext,
  config: ClusterGeneratorConfig,
  result: ClusterGenerationResult
): Promise<void> {
  const { primaryKeyword, personas = [] } = config;

  // Use default personas if none provided
  const targetPersonas = personas.length > 0 ? personas : getDefaultPersonas(primaryKeyword);

  result.personaVariants = [];

  let priority = 1;
  for (const persona of targetPersonas) {
    const articleId = `persona-${persona.id}`;

    // Customize angle for persona
    const angle = {
      thesis: generatePersonaThesis(primaryKeyword, persona),
      voiceProfile: `${persona.preferredTone}, addressing ${persona.painPoints[0]}`,
      painPointsAddressed: persona.painPoints,
      cta: generatePersonaCTA(persona),
    };

    const article: ArticlePlan = {
      id: articleId,
      type: 'persona-variant',
      keyword: `${primaryKeyword} for ${persona.name}`,
      title: `${titleCase(primaryKeyword)}: A Guide for ${titleCase(persona.name.replace('-', ' '))}`,
      format: persona.formatPreferences[0] || 'how-to',
      persona: persona.id,
      slug: `${slugify(primaryKeyword)}-for-${persona.id}`,
      wordCount: getWordCountForDepth(persona.preferredDepth),
      priority: priority++,
      dependencies: [],
      researchSegments: ['all'],
      angleCustomization: {
        thesis: angle.thesis,
        voice: angle.voiceProfile,
        depth: persona.preferredDepth,
      },
      seoTargets: {
        primaryKeyword: `${primaryKeyword} for ${persona.name}`,
        secondaryKeywords: persona.resonantKeywords,
        serpFeatures: [],
        internalLinks: [],
      },
    };

    result.articles.push(article);

    result.personaVariants.push({
      personaId: persona.id,
      articleId,
      angle,
      emphasizedKeywords: persona.resonantKeywords,
    });
  }

  // Add cross-links between persona variants
  for (let i = 0; i < result.articles.length; i++) {
    for (let j = i + 1; j < result.articles.length; j++) {
      result.linkingStrategy.supportingToSupporting.push({
        from: result.articles[i].id,
        to: result.articles[j].id,
        anchorText: `guide for ${result.articles[j].persona}`,
        contextHint: 'In a "Related Guides" section',
        priority: 'optional',
      });
    }
  }
}

/**
 * Generate format variants
 */
async function generateFormatVariants(
  research: ResearchContext,
  config: ClusterGeneratorConfig,
  result: ClusterGenerationResult
): Promise<void> {
  const { primaryKeyword, allowedFormats = [] } = config;

  // Use default formats if none specified
  const formats: ContentFormat[] = allowedFormats.length > 0
    ? allowedFormats
    : ['how-to', 'listicle', 'faq', 'checklist', 'comparison'];

  result.formatVariants = [];

  let priority = 1;
  for (const format of formats) {
    const articleId = `format-${format}`;
    const { keyword, title } = getFormatSpecificKeywordAndTitle(primaryKeyword, format, research);

    const article: ArticlePlan = {
      id: articleId,
      type: 'format-variant',
      keyword,
      title,
      format,
      slug: `${slugify(primaryKeyword)}-${format}`,
      wordCount: getWordCountForFormat(format),
      priority: priority++,
      dependencies: [],
      researchSegments: getResearchSegmentsForFormat(format),
      angleCustomization: {
        thesis: getThesisForFormat(primaryKeyword, format),
        voice: getVoiceForFormat(format),
        depth: getDepthForFormat(format),
      },
      seoTargets: {
        primaryKeyword: keyword,
        secondaryKeywords: [primaryKeyword],
        serpFeatures: getSERPFeaturesForFormat(format),
        internalLinks: [],
      },
    };

    result.articles.push(article);

    result.formatVariants.push({
      format,
      articleId,
      structure: getStructureForFormat(format),
      targetKeyword: keyword,
    });
  }

  // Cross-link format variants
  for (let i = 0; i < result.articles.length; i++) {
    for (let j = i + 1; j < result.articles.length; j++) {
      result.linkingStrategy.supportingToSupporting.push({
        from: result.articles[i].id,
        to: result.articles[j].id,
        anchorText: result.articles[j].title,
        contextHint: 'In "Related Resources" section',
        priority: 'optional',
      });
    }
  }
}

/**
 * Generate comprehensive cluster (all modes combined)
 */
async function generateComprehensiveCluster(
  research: ResearchContext,
  config: ClusterGeneratorConfig,
  result: ClusterGenerationResult
): Promise<void> {
  // First, create pillar cluster
  await generatePillarCluster(research, config, result);

  // Then add persona variants for the pillar topic
  const pillarKeyword = config.primaryKeyword;
  const personas = config.personas || getDefaultPersonas(pillarKeyword).slice(0, 2);

  for (const persona of personas) {
    const articleId = `comprehensive-persona-${persona.id}`;

    const article: ArticlePlan = {
      id: articleId,
      type: 'persona-variant',
      keyword: `${pillarKeyword} for ${persona.name}`,
      title: `${titleCase(pillarKeyword)} for ${titleCase(persona.name.replace('-', ' '))}`,
      format: persona.formatPreferences[0] || 'how-to',
      persona: persona.id,
      slug: `${slugify(pillarKeyword)}-for-${persona.id}`,
      wordCount: getWordCountForDepth(persona.preferredDepth),
      priority: result.articles.length + 1,
      dependencies: [result.articles[0].id], // Depends on pillar
      researchSegments: ['all'],
      angleCustomization: {
        thesis: generatePersonaThesis(pillarKeyword, persona),
        voice: persona.preferredTone,
        depth: persona.preferredDepth,
      },
      seoTargets: {
        primaryKeyword: `${pillarKeyword} for ${persona.name}`,
        secondaryKeywords: persona.resonantKeywords,
        serpFeatures: [],
        internalLinks: [],
      },
    };

    result.articles.push(article);

    // Link from pillar to persona variant
    result.linkingStrategy.pillarToSupporting.push({
      from: result.articles[0].id,
      to: articleId,
      anchorText: `guide for ${persona.name}`,
      contextHint: 'In audience-specific section',
      priority: 'recommended',
    });
  }

  // Add key format variants
  const formatVariants: ContentFormat[] = ['checklist', 'faq'];
  for (const format of formatVariants) {
    const articleId = `comprehensive-format-${format}`;
    const { keyword, title } = getFormatSpecificKeywordAndTitle(pillarKeyword, format, research);

    const article: ArticlePlan = {
      id: articleId,
      type: 'format-variant',
      keyword,
      title,
      format,
      slug: `${slugify(pillarKeyword)}-${format}`,
      wordCount: getWordCountForFormat(format),
      priority: result.articles.length + 1,
      dependencies: [result.articles[0].id],
      researchSegments: getResearchSegmentsForFormat(format),
      angleCustomization: {
        thesis: getThesisForFormat(pillarKeyword, format),
        voice: getVoiceForFormat(format),
        depth: getDepthForFormat(format),
      },
      seoTargets: {
        primaryKeyword: keyword,
        secondaryKeywords: [pillarKeyword],
        serpFeatures: getSERPFeaturesForFormat(format),
        internalLinks: [],
      },
    };

    result.articles.push(article);

    result.linkingStrategy.pillarToSupporting.push({
      from: result.articles[0].id,
      to: articleId,
      anchorText: title,
      contextHint: 'In resources section',
      priority: 'recommended',
    });
  }
}

// ============================================
// Helper Functions
// ============================================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function titleCase(text: string): string {
  return text
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function determineFormatFromKeyword(keyword: string): ContentFormat {
  const lower = keyword.toLowerCase();
  if (lower.includes('how to') || lower.includes('steps')) return 'how-to';
  if (lower.includes('best') || lower.includes('top')) return 'listicle';
  if (lower.includes('vs') || lower.includes('versus')) return 'comparison';
  if (lower.includes('what is') || lower.includes('guide')) return 'pillar-guide';
  return 'how-to';
}

function generateTitleFromKeyword(keyword: string, format: ContentFormat): string {
  switch (format) {
    case 'how-to':
      return keyword.toLowerCase().startsWith('how')
        ? titleCase(keyword)
        : `How to ${titleCase(keyword)}`;
    case 'listicle':
      return `10 Best ${titleCase(keyword)} Tips and Strategies`;
    case 'comparison':
      return titleCase(keyword);
    case 'faq':
      return `${titleCase(keyword)}: Frequently Asked Questions`;
    case 'checklist':
      return `${titleCase(keyword)} Checklist: Everything You Need`;
    default:
      return titleCase(keyword);
  }
}

function getWordCountForFormat(format: ContentFormat): number {
  const counts: Record<ContentFormat, number> = {
    'pillar-guide': 3500,
    'how-to': 1500,
    'listicle': 1500,
    'comparison': 1800,
    'faq': 1000,
    'case-study': 2000,
    'checklist': 800,
    'glossary': 1200,
    'resource-roundup': 1200,
  };
  return counts[format] || 1500;
}

function getWordCountForDepth(depth: string): number {
  switch (depth) {
    case 'quick-tips': return 800;
    case 'moderate': return 1500;
    case 'comprehensive': return 2500;
    case 'expert': return 3500;
    default: return 1500;
  }
}

function getDefaultPersonas(keyword: string): PersonaDefinition[] {
  return [
    {
      id: 'beginner',
      name: 'beginner',
      description: 'Someone new to this topic',
      painPoints: ['Overwhelmed by information', 'Not sure where to start'],
      goals: ['Understand basics', 'Take first steps'],
      preferredTone: 'casual',
      preferredDepth: 'moderate',
      resonantKeywords: [`${keyword} for beginners`, `${keyword} basics`, `simple ${keyword}`],
      formatPreferences: ['how-to', 'checklist'],
    },
    {
      id: 'busy-professional',
      name: 'busy-professional',
      description: 'Time-constrained professional',
      painPoints: ['Limited time', 'Need quick results'],
      goals: ['Get efficient solutions', 'Save time'],
      preferredTone: 'practical',
      preferredDepth: 'quick-tips',
      resonantKeywords: [`quick ${keyword}`, `${keyword} in 5 minutes`, `efficient ${keyword}`],
      formatPreferences: ['checklist', 'listicle'],
    },
    {
      id: 'expert',
      name: 'expert',
      description: 'Someone with existing knowledge',
      painPoints: ['Need advanced techniques', 'Want optimization'],
      goals: ['Master advanced topics', 'Optimize results'],
      preferredTone: 'technical',
      preferredDepth: 'expert',
      resonantKeywords: [`advanced ${keyword}`, `${keyword} optimization`, `${keyword} best practices`],
      formatPreferences: ['pillar-guide', 'case-study'],
    },
  ];
}

function generatePersonaThesis(keyword: string, persona: PersonaDefinition): string {
  return `${titleCase(keyword)} specifically designed for ${persona.name}, addressing ${persona.painPoints[0]}`;
}

function generatePersonaCTA(persona: PersonaDefinition): string {
  switch (persona.preferredTone) {
    case 'casual': return 'Get started today';
    case 'professional': return 'Implement these strategies now';
    case 'technical': return 'Apply these advanced techniques';
    case 'emotional': return 'Take the first step on your journey';
    case 'practical': return 'Put these tips into action';
    default: return 'Learn more';
  }
}

function getFormatSpecificKeywordAndTitle(
  keyword: string,
  format: ContentFormat,
  research: ResearchContext
): { keyword: string; title: string } {
  switch (format) {
    case 'how-to':
      return {
        keyword: `how to ${keyword}`,
        title: `How to ${titleCase(keyword)}: Step-by-Step Guide`,
      };
    case 'listicle':
      return {
        keyword: `best ${keyword} tips`,
        title: `15 Best ${titleCase(keyword)} Tips That Actually Work`,
      };
    case 'faq':
      return {
        keyword: `${keyword} questions`,
        title: `${titleCase(keyword)} FAQ: Your Questions Answered`,
      };
    case 'checklist':
      return {
        keyword: `${keyword} checklist`,
        title: `The Ultimate ${titleCase(keyword)} Checklist`,
      };
    case 'comparison':
      return {
        keyword: `${keyword} comparison`,
        title: `${titleCase(keyword)} Methods Compared: Which Is Best?`,
      };
    default:
      return {
        keyword,
        title: titleCase(keyword),
      };
  }
}

function getResearchSegmentsForFormat(format: ContentFormat): string[] {
  switch (format) {
    case 'how-to': return ['examples', 'steps', 'counterexamples'];
    case 'listicle': return ['tips', 'examples', 'statistics'];
    case 'faq': return ['paa', 'experts', 'statistics'];
    case 'checklist': return ['steps', 'tips'];
    case 'comparison': return ['competitors', 'statistics', 'examples'];
    case 'case-study': return ['examples', 'experts', 'statistics'];
    default: return ['all'];
  }
}

function getThesisForFormat(keyword: string, format: ContentFormat): string {
  switch (format) {
    case 'how-to': return `Step-by-step process to ${keyword}`;
    case 'listicle': return `Curated best practices for ${keyword}`;
    case 'faq': return `Answers to common questions about ${keyword}`;
    case 'checklist': return `Actionable checklist for ${keyword}`;
    case 'comparison': return `Objective comparison of ${keyword} approaches`;
    default: return `Guide to ${keyword}`;
  }
}

function getVoiceForFormat(format: ContentFormat): string {
  switch (format) {
    case 'how-to': return 'instructional and clear';
    case 'listicle': return 'engaging and scannable';
    case 'faq': return 'helpful and concise';
    case 'checklist': return 'direct and actionable';
    case 'comparison': return 'objective and analytical';
    default: return 'informative';
  }
}

function getDepthForFormat(format: ContentFormat): string {
  switch (format) {
    case 'pillar-guide': return 'comprehensive';
    case 'how-to': return 'moderate';
    case 'checklist': return 'quick-tips';
    case 'faq': return 'focused';
    default: return 'moderate';
  }
}

function getSERPFeaturesForFormat(format: ContentFormat): string[] {
  switch (format) {
    case 'how-to': return ['featured_snippet', 'how_to_rich_result'];
    case 'faq': return ['faq_rich_result', 'people_also_ask'];
    case 'listicle': return ['featured_snippet'];
    default: return [];
  }
}

function getStructureForFormat(format: ContentFormat): string[] {
  switch (format) {
    case 'how-to':
      return ['Introduction', 'Prerequisites', 'Step 1', 'Step 2', 'Step 3', 'Tips', 'Conclusion'];
    case 'listicle':
      return ['Introduction', 'Item 1-15', 'Summary', 'Next Steps'];
    case 'faq':
      return ['Introduction', 'Question 1-10', 'Additional Resources'];
    case 'checklist':
      return ['Overview', 'Checklist Items', 'Download Link'];
    case 'comparison':
      return ['Introduction', 'Criteria', 'Option A', 'Option B', 'Verdict'];
    default:
      return ['Introduction', 'Main Content', 'Conclusion'];
  }
}

function calculateExecutionOrder(articles: ArticlePlan[]): string[] {
  // Topological sort based on dependencies
  const visited = new Set<string>();
  const order: string[] = [];

  function visit(articleId: string) {
    if (visited.has(articleId)) return;
    visited.add(articleId);

    const article = articles.find(a => a.id === articleId);
    if (article) {
      for (const dep of article.dependencies) {
        visit(dep);
      }
      order.push(articleId);
    }
  }

  // Sort by priority first, then by dependencies
  const sorted = [...articles].sort((a, b) => a.priority - b.priority);
  for (const article of sorted) {
    visit(article.id);
  }

  return order;
}

function calculateEstimates(
  result: ClusterGenerationResult,
  research: ResearchContext
): ClusterGenerationResult['estimates'] {
  const totalArticles = result.articles.length;
  const totalWordCount = result.articles.reduce((sum, a) => sum + a.wordCount, 0);

  // Research reuse calculation
  // Without cluster: each article would need full research (100% per article)
  // With cluster: research done once, reused across all articles
  const researchReusePercentage = Math.round((1 - (1 / totalArticles)) * 100);

  // Cost savings: research phase is ~40% of total cost
  // Savings = (articles - 1) * 40% of single article cost
  const singleArticleCost = 15; // $15 average per article
  const researchCostPerArticle = singleArticleCost * 0.4;
  const costSavings = (totalArticles - 1) * researchCostPerArticle;

  // Time savings: research phase is ~2 hours per article
  const researchTimePerArticle = 2; // hours
  const timeSavings = (totalArticles - 1) * researchTimePerArticle;

  return {
    totalArticles,
    totalWordCount,
    researchReusePercentage,
    estimatedCostSavings: `$${costSavings.toFixed(0)} (${Math.round((costSavings / (totalArticles * singleArticleCost)) * 100)}%)`,
    estimatedTimeSavings: `${timeSavings} hours (${Math.round((timeSavings / (totalArticles * 4)) * 100)}%)`,
  };
}

function allocateResearchSegments(
  articles: ArticlePlan[],
  research: ResearchContext
): Map<string, ResearchSegment> {
  const segments = new Map<string, ResearchSegment>();

  // Create segments from research context
  segments.set('keywords', {
    id: 'keywords',
    type: 'keyword',
    content: research.keywordResearch,
    usedBy: articles.map(a => a.id),
    reuseCount: articles.length,
  });

  segments.set('competitors', {
    id: 'competitors',
    type: 'competitor',
    content: research.competitorAnalysis,
    usedBy: articles.filter(a => a.researchSegments.includes('all') || a.researchSegments.includes('competitors')).map(a => a.id),
    reuseCount: 0,
  });

  segments.set('serp', {
    id: 'serp',
    type: 'serp',
    content: research.serpAnalysis,
    usedBy: articles.filter(a => a.researchSegments.includes('all') || a.researchSegments.includes('serp')).map(a => a.id),
    reuseCount: 0,
  });

  segments.set('examples', {
    id: 'examples',
    type: 'example',
    content: research.deepResearch.realExamples,
    usedBy: articles.filter(a => a.researchSegments.includes('all') || a.researchSegments.includes('examples')).map(a => a.id),
    reuseCount: 0,
  });

  segments.set('experts', {
    id: 'experts',
    type: 'expert',
    content: research.deepResearch.expertSources,
    usedBy: articles.filter(a => a.researchSegments.includes('all') || a.researchSegments.includes('experts')).map(a => a.id),
    reuseCount: 0,
  });

  segments.set('statistics', {
    id: 'statistics',
    type: 'statistic',
    content: research.deepResearch.statistics,
    usedBy: articles.filter(a => a.researchSegments.includes('all') || a.researchSegments.includes('statistics')).map(a => a.id),
    reuseCount: 0,
  });

  // Update reuse counts
  for (const segment of Array.from(segments.values())) {
    segment.reuseCount = segment.usedBy.length;
  }

  return segments;
}

/**
 * Analyze research gaps and recommend actions
 */
function analyzeResearchGaps(context?: ClusterResearchContext): {
  requiresNewResearch: boolean;
  gaps: string[];
  recommendations: string[];
} {
  if (!context) {
    return {
      requiresNewResearch: true,
      gaps: ['No cached research available'],
      recommendations: ['Run full research pipeline'],
    };
  }

  const gaps: string[] = [];
  const recommendations: string[] = [];

  for (const gap of context.researchGaps) {
    gaps.push(gap.description);

    if (gap.priority === 'high') {
      recommendations.push(`Priority: Fill ${gap.type} gap (est. $${gap.estimatedCost})`);
    }
  }

  return {
    requiresNewResearch: context.cacheStatus.overallCompleteness < 0.5,
    gaps,
    recommendations,
  };
}

// ============================================
// Note: Functions are exported inline with their definitions
// ============================================
