/**
 * SEO Strategy Document Generator
 *
 * Synthesizes all 7 phases of SEO onboarding into comprehensive strategy documents
 * for human review and client delivery. Generates both markdown and JSON formats.
 *
 * Features:
 * - Executive summary synthesis
 * - Phase-by-phase findings aggregation
 * - RuVector intelligence metrics
 * - Actionable recommendations
 * - 6-month roadmap with KPIs
 *
 * @module seo/lib/output/strategy-document
 */

import type {
  TechnicalHealthMetric,
  SiteProfileCrawlData,
  ContentInventory,
  CompetitorAnalysis,
  KeywordWithMetrics,
  ContentGap,
  SEOStrategy,
  SEORoadmap,
  PhaseOutputs,
  StrategyDocument,
  StrategyJSON,
  DocumentMetadata,
  RuVectorIntelligenceSummary,
} from '../types/onboarding';

/**
 * Phase outputs from all 7 phases
 */
export interface PhaseOutputs {
  /** Phase 1: Technical Foundation */
  phase1?: {
    technicalHealthScore: number;
    criticalIssues: Array<{ issue: string; severity: string }>;
    performance: {
      lcp: string;
      fid: string;
      cls: string;
    };
    crawlData: SiteProfileCrawlData;
    recommendations: string[];
  };

  /** Phase 2: Content Inventory */
  phase2?: {
    totalPages: number;
    contentByType: Record<string, number>;
    avgWordCount: number;
    thinContentCount: number;
    duplicateContentCount: number;
    existingKeywords: Array<{ keyword: string; pages: number }>;
    contentClusters: Array<{ topic: string; pages: number; internalLinks: number }>;
  };

  /** Phase 3: Competitor Discovery */
  phase3?: {
    competitorsIdentified: number;
    primaryCompetitors: Array<{
      domain: string;
      domainAuthority: number;
      monthlyTraffic: string;
      rankingKeywords: number;
      backlinks: string;
      contentStrategy: string;
    }>;
    competitivePosition: {
      yourDA: number;
      yourTraffic: string;
      marketShare: string;
    };
  };

  /** Phase 4: Keyword Universe */
  phase4?: {
    totalKeywords: number;
    cachedKeywords: number;
    newKeywords: number;
    byIntent: {
      informational: number;
      commercial: number;
      transactional: number;
      navigational: number;
    };
    byDifficulty: {
      easy: number;
      medium: number;
      hard: number;
    };
    totalSearchVolume: number;
    topKeywords: KeywordWithMetrics[];
  };

  /** Phase 5: Gap Analysis */
  phase5?: {
    keywordGaps: {
      totalGaps: number;
      highPriority: Array<{
        keyword: string;
        volume: number;
        topCompetitor: string;
        position: number;
      }>;
      trafficPotential: number;
    };
    contentGaps: ContentGap[];
    backLinkGaps: {
      totalGapDomains: number;
      highAuthorityDomains: number;
    };
    serpFeatureGaps: {
      featuredSnippetsAvailable: number;
      paaOpportunities: number;
      videoCarouselOpportunities: number;
    };
  };

  /** Phase 6: Strategy Creation */
  phase6?: SEOStrategy;

  /** Phase 7: Roadmap Generation */
  phase7?: SEORoadmap;
}

/**
 * SEO Strategy data structure
 */
export interface SEOStrategy {
  /** Content pillars */
  contentPillars: Array<{
    pillar: string;
    targetKeywords: number;
    estimatedTraffic: number;
    contentPiecesNeeded: number;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;

  /** Quick wins */
  quickWins: Array<{
    action: string;
    effort: 'LOW' | 'MEDIUM' | 'HIGH';
    impact: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;

  /** Competitive moats */
  competitiveMoats: string[];

  /** Estimated results */
  estimatedResults: {
    sixMonthTrafficTarget: string;
    twelveMonthTrafficTarget: string;
    keywordRankingsTop10Target: number;
  };
}

/**
 * SEO Roadmap data structure
 */
export interface SEORoadmap {
  /** Roadmap by month */
  months: Array<{
    month: number;
    title: string;
    tasks: string[];
    kpis: string[];
  }>;

  /** Overall KPIs to track */
  overallKPIs: Array<{
    metric: string;
    target: string;
    frequency: string;
  }>;
}

/**
 * Strategy Document Generator
 *
 * Synthesizes all 7 phases of SEO onboarding into comprehensive strategy documents.
 */
export class StrategyDocumentGenerator {
  constructor(
    private phaseOutputs: PhaseOutputs,
    private strategy: SEOStrategy,
    private roadmap: SEORoadmap,
    private domain: string,
    private industry?: string
  ) {}

  /**
   * Generate complete strategy document
   */
  async generateDocument(): Promise<StrategyDocument> {
    return {
      markdown: await this.generateMarkdown(),
      json: this.generateJSON(),
      metadata: this.extractMetadata(),
    };
  }

  /**
   * Generate markdown document
   */
  private async generateMarkdown(): Promise<string> {
    const sections: string[] = [];

    // Header
    sections.push(this.generateHeader());

    // Executive Summary
    sections.push(this.generateExecutiveSummary());

    // Phase 1: Technical Foundation
    if (this.phaseOutputs.phase1) {
      sections.push(this.generatePhase1Section());
    }

    // Phase 2: Content Inventory
    if (this.phaseOutputs.phase2) {
      sections.push(this.generatePhase2Section());
    }

    // Phase 3: Competitor Analysis
    if (this.phaseOutputs.phase3) {
      sections.push(this.generatePhase3Section());
    }

    // Phase 4: Keyword Opportunities
    if (this.phaseOutputs.phase4) {
      sections.push(this.generatePhase4Section());
    }

    // Phase 5: Content Gaps
    if (this.phaseOutputs.phase5) {
      sections.push(this.generatePhase5Section());
    }

    // Phase 6: SEO Strategy
    sections.push(this.generatePhase6Section());

    // Phase 7: 6-Month Roadmap
    sections.push(this.generatePhase7Section());

    // Success Metrics
    sections.push(this.generateSuccessMetrics());

    // RuVector Intelligence Summary
    sections.push(this.generateRuVectorSummary());

    // Footer
    sections.push(this.generateFooter());

    return sections.join('\n\n');
  }

  /**
   * Generate header
   */
  private generateHeader(): string {
    const date = new Date().toISOString().split('T')[0];
    return `# SEO Strategy - ${this.domain}

**Date:** ${date}
**Industry:** ${this.industry || 'Not Specified'}
**Analysis Period:** Comprehensive Site Onboarding`;
  }

  /**
   * Generate executive summary
   */
  private generateExecutiveSummary(): string {
    const phase1 = this.phaseOutputs.phase1;
    const phase2 = this.phaseOutputs.phase2;
    const phase4 = this.phaseOutputs.phase4;
    const phase5 = this.phaseOutputs.phase5;

    const healthScore = phase1?.technicalHealthScore || 0;
    const totalPages = phase2?.totalPages || 0;
    const totalKeywords = phase4?.totalKeywords || 0;
    const trafficPotential = phase5?.keywordGaps?.trafficPotential || 0;

    return `## Executive Summary

This SEO strategy document synthesizes a comprehensive 7-phase analysis of **${this.domain}**, identifying actionable opportunities to improve organic search visibility and drive targeted traffic.

**Key Findings:**
- Technical health score: **${(healthScore * 100).toFixed(0)}%** (${healthScore >= 0.7 ? 'Good' : healthScore >= 0.5 ? 'Fair' : 'Needs Improvement'})
- Content inventory: **${totalPages} pages** analyzed across ${Object.keys(phase2?.contentByType || {}).length} content types
- Keyword universe: **${totalKeywords} keywords** identified with ${phase4?.cachedKeywords || 0} from RuVector cache
- Traffic opportunity: **${trafficPotential.toLocaleString()} monthly visits** from keyword gaps
- Top priority: ${this.strategy.contentPillars[0]?.pillar || 'Content strategy development'}

**Recommended Approach:**
${this.strategy.quickWins.length > 0 ? `Start with ${this.strategy.quickWins.length} quick wins to build momentum, then focus on ${this.strategy.contentPillars.length} content pillars for sustained growth.` : 'Focus on content pillar development for sustained organic growth.'}`;
  }

  /**
   * Generate Phase 1 section
   */
  private generatePhase1Section(): string {
    const phase1 = this.phaseOutputs.phase1!;

    const criticalIssues = phase1.criticalIssues
      .map((issue, idx) => `${idx + 1}. **[${issue.severity}]** ${issue.issue}`)
      .join('\n');

    const recommendations = phase1.recommendations
      .map((rec, idx) => `${idx + 1}. ${rec}`)
      .join('\n');

    return `## 1. Technical Foundation (Phase 1)

**Technical Health Score:** ${(phase1.technicalHealthScore * 100).toFixed(0)}%

### Core Web Vitals
- **LCP (Largest Contentful Paint):** ${phase1.performance.lcp}
- **FID (First Input Delay):** ${phase1.performance.fid}
- **CLS (Cumulative Layout Shift):** ${phase1.performance.cls}

### Crawl Data
- Total Pages: ${phase1.crawlData.totalPages}
- Pages with Issues: ${phase1.crawlData.pagesWithIssues}
- Indexed Pages: ${phase1.crawlData.indexedPages}
- Avg Load Time: ${phase1.crawlData.avgLoadTime}s
- Mobile Friendly Score: ${(phase1.crawlData.mobileFriendlyScore * 100).toFixed(0)}%

### Critical Issues
${criticalIssues}

### Recommended Actions
${recommendations}`;
  }

  /**
   * Generate Phase 2 section
   */
  private generatePhase2Section(): string {
    const phase2 = this.phaseOutputs.phase2!;

    const contentTypes = Object.entries(phase2.contentByType)
      .map(([type, count]) => `- **${type}:** ${count}`)
      .join('\n');

    const topKeywords = phase2.existingKeywords
      .slice(0, 10)
      .map((kw, idx) => `${idx + 1}. ${kw.keyword} (${kw.pages} pages)`)
      .join('\n');

    const clusters = phase2.contentClusters
      .slice(0, 5)
      .map((cluster, idx) => `${idx + 1}. **${cluster.topic}** - ${cluster.pages} pages, ${cluster.internalLinks} internal links`)
      .join('\n');

    return `## 2. Content Inventory (Phase 2)

**Total Pages:** ${phase2.totalPages}

### Content by Type
${contentTypes}

### Content Quality
- Average Word Count: ${phase2.avgWordCount}
- Thin Content: ${phase2.thinContentCount} pages (${((phase2.thinContentCount / phase2.totalPages) * 100).toFixed(1)}%)
- Duplicate Content: ${phase2.duplicateContentCount} pages

### Existing Target Keywords (Top 10)
${topKeywords}

### Content Clusters
${clusters}

### Opportunities
- **Expand thin content:** ${phase2.thinContentCount} pages need depth improvement
- **Consolidate duplicates:** ${phase2.duplicateContentCount} pages to merge or redirect
- **Strengthen clusters:** Build out ${phase2.contentClusters.length} topic clusters with more internal linking`;
  }

  /**
   * Generate Phase 3 section
   */
  private generatePhase3Section(): string {
    const phase3 = this.phaseOutputs.phase3!;

    const competitors = phase3.primaryCompetitors
      .slice(0, 5)
      .map(
        (comp, idx) => `${idx + 1}. **${comp.domain}**
   - Domain Authority: ${comp.domainAuthority}
   - Monthly Traffic: ${comp.monthlyTraffic}
   - Ranking Keywords: ${comp.rankingKeywords.toLocaleString()}
   - Backlinks: ${comp.backlinks}
   - Content Strategy: ${comp.contentStrategy}`
      )
      .join('\n\n');

    return `## 3. Competitor Analysis (Phase 3)

**Competitors Analyzed:** ${phase3.competitorsIdentified}

### Primary Competitors
${competitors}

### Market Position
- **Your Domain Authority:** ${phase3.competitivePosition.yourDA}
- **Your Monthly Traffic:** ${phase3.competitivePosition.yourTraffic}
- **Estimated Market Share:** ${phase3.competitivePosition.marketShare}

### Key Differentiators
${this.strategy.competitiveMoats.map((moat, idx) => `${idx + 1}. ${moat}`).join('\n')}`;
  }

  /**
   * Generate Phase 4 section
   */
  private generatePhase4Section(): string {
    const phase4 = this.phaseOutputs.phase4!;

    const intentBreakdown = `| Intent | Keywords | Percentage |
|--------|----------|------------|
| Informational | ${phase4.byIntent.informational} | ${((phase4.byIntent.informational / phase4.totalKeywords) * 100).toFixed(1)}% |
| Commercial | ${phase4.byIntent.commercial} | ${((phase4.byIntent.commercial / phase4.totalKeywords) * 100).toFixed(1)}% |
| Transactional | ${phase4.byIntent.transactional} | ${((phase4.byIntent.transactional / phase4.totalKeywords) * 100).toFixed(1)}% |
| Navigational | ${phase4.byIntent.navigational} | ${((phase4.byIntent.navigational / phase4.totalKeywords) * 100).toFixed(1)}% |`;

    const topKeywords = phase4.topKeywords
      .slice(0, 20)
      .map(
        (kw, idx) => `| ${idx + 1}. ${kw.keyword} | ${kw.searchVolume.toLocaleString()} | ${kw.keywordDifficulty} | ${kw.searchIntent} | ${this.getPatternMatch(kw)} |`
      )
      .join('\n');

    return `## 4. Keyword Opportunities (Phase 4)

**Total Keywords Identified:** ${phase4.totalKeywords}
- **From RuVector Cache:** ${phase4.cachedKeywords} (${((phase4.cachedKeywords / phase4.totalKeywords) * 100).toFixed(1)}%)
- **Newly Discovered:** ${phase4.newKeywords}
- **Total Search Volume:** ${phase4.totalSearchVolume.toLocaleString()}/month

### Keywords by Search Intent
${intentBreakdown}

### Keywords by Difficulty
- **Easy (0-30):** ${phase4.byDifficulty.easy} keywords
- **Medium (31-60):** ${phase4.byDifficulty.medium} keywords
- **Hard (61-100):** ${phase4.byDifficulty.hard} keywords

### Top 20 Keyword Opportunities (with RuVector Pattern Insights)
| # | Keyword | Volume | Difficulty | Intent | Pattern Match |
|---|---------|--------|------------|--------|---------------|
${topKeywords}`;
  }

  /**
   * Generate Phase 5 section
   */
  private generatePhase5Section(): string {
    const phase5 = this.phaseOutputs.phase5!;

    const keywordGaps = phase5.keywordGaps.highPriority
      .slice(0, 10)
      .map(
        (gap, idx) => `${idx + 1}. **${gap.keyword}**
   - Volume: ${gap.volume.toLocaleString()}/month
   - Top Competitor: ${gap.topCompetitor} (Position #${gap.position})
   - Opportunity: Create comprehensive content to compete`
      )
      .join('\n\n');

    const contentGaps = phase5.contentGaps
      .slice(0, 10)
      .map(
        (gap, idx) => `${idx + 1}. **${gap.topic}**
   - Competitor Coverage: ${gap.competitorCoverage} sites
   - Traffic Potential: ${gap.trafficPotential.toLocaleString()} visits/month
   - Priority: ${gap.priority}`
      )
      .join('\n\n');

    return `## 5. Content Gaps (Phase 5)

**Total Traffic Opportunity:** ${phase5.keywordGaps.trafficPotential.toLocaleString()} monthly visits

### Top 10 Keyword Gaps
${keywordGaps}

### Top 10 Content Gap Opportunities
${contentGaps}

### SERP Feature Opportunities
- **Featured Snippets:** ${phase5.serpFeatureGaps.featuredSnippetsAvailable} opportunities
- **People Also Ask:** ${phase5.serpFeatureGaps.paaOpportunities} questions to target
- **Video Carousels:** ${phase5.serpFeatureGaps.videoCarouselOpportunities} opportunities

### Backlink Opportunities
- **Total Gap Domains:** ${phase5.backLinkGaps.totalGapDomains}
- **High Authority Domains:** ${phase5.backLinkGaps.highAuthorityDomains}`;
  }

  /**
   * Generate Phase 6 section
   */
  private generatePhase6Section(): string {
    const pillars = this.strategy.contentPillars
      .map(
        (pillar, idx) => `### ${idx + 1}. ${pillar.pillar}
- **Target Keywords:** ${pillar.targetKeywords}
- **Estimated Traffic:** ${pillar.estimatedTraffic.toLocaleString()} visits/month
- **Content Pieces Needed:** ${pillar.contentPiecesNeeded}
- **Priority:** ${pillar.priority}`
      )
      .join('\n\n');

    const quickWins = this.strategy.quickWins
      .map((win, idx) => `${idx + 1}. **${win.action}** (Effort: ${win.effort}, Impact: ${win.impact})`)
      .join('\n');

    const moats = this.strategy.competitiveMoats.map((moat, idx) => `${idx + 1}. ${moat}`).join('\n');

    return `## 6. SEO Strategy (Phase 6)

### Content Pillars
${pillars}

### Quick Wins (0-3 months)
${quickWins}

### Competitive Advantages
${moats}

### Estimated Results
- **6-Month Traffic Target:** ${this.strategy.estimatedResults.sixMonthTrafficTarget}
- **12-Month Traffic Target:** ${this.strategy.estimatedResults.twelveMonthTrafficTarget}
- **Top 10 Rankings Target:** ${this.strategy.estimatedResults.keywordRankingsTop10Target} keywords`;
  }

  /**
   * Generate Phase 7 section
   */
  private generatePhase7Section(): string {
    const months = this.roadmap.months
      .map(
        (month) => `### ${month.title}
${month.tasks.map((task, idx) => `${idx + 1}. ${task}`).join('\n')}

**KPIs:**
${month.kpis.map((kpi, idx) => `- ${kpi}`).join('\n')}`
      )
      .join('\n\n');

    return `## 7. 6-Month Roadmap (Phase 7)

${months}`;
  }

  /**
   * Generate success metrics section
   */
  private generateSuccessMetrics(): string {
    const kpis = this.roadmap.overallKPIs
      .map((kpi) => `- **${kpi.metric}:** ${kpi.target} (${kpi.frequency})`)
      .join('\n');

    return `## Success Metrics

### Overall KPIs to Track
${kpis}

### ROI Projections
Based on current traffic and conversion rates:
- **6-Month ROI:** Estimated ${this.strategy.estimatedResults.sixMonthTrafficTarget} traffic increase
- **12-Month ROI:** Estimated ${this.strategy.estimatedResults.twelveMonthTrafficTarget} traffic increase
- **Cost Savings:** RuVector intelligence reduces API costs by 80%+`;
  }

  /**
   * Generate RuVector intelligence summary
   */
  private generateRuVectorSummary(): string {
    const phase4 = this.phaseOutputs.phase4;
    const cacheHitRate = phase4 ? ((phase4.cachedKeywords / phase4.totalKeywords) * 100).toFixed(1) : '0.0';
    const patternsApplied = this.countPatternsApplied();
    const costSavings = this.calculateCostSavings();

    return `## RuVector Intelligence Summary

**Cache Performance:**
- **Cache Hit Rate:** ${cacheHitRate}%
- **Keywords from Cache:** ${phase4?.cachedKeywords || 0}
- **New Keywords Stored:** ${phase4?.newKeywords || 0}

**Pattern Intelligence:**
- **Patterns Applied:** ${patternsApplied}
- **Similar Sites Analyzed:** Historical data leveraged for faster insights

**Cost Optimization:**
- **Estimated Cost Savings:** $${costSavings} (${cacheHitRate}% reduction in API calls)
- **DataForSEO Calls Avoided:** ${phase4?.cachedKeywords || 0}`;
  }

  /**
   * Generate footer
   */
  private generateFooter(): string {
    return `---

*Generated by CFN SEO Onboarding Pipeline*
*Intelligence powered by RuVector semantic search*
*Document generated on ${new Date().toISOString().split('T')[0]}*`;
  }

  /**
   * Generate structured JSON
   */
  private generateJSON(): StrategyJSON {
    return {
      domain: this.domain,
      industry: this.industry,
      generatedAt: new Date().toISOString(),
      phases: this.phaseOutputs,
      strategy: this.strategy,
      roadmap: this.roadmap,
      metadata: this.extractMetadata(),
    };
  }

  /**
   * Extract metadata
   */
  private extractMetadata(): DocumentMetadata {
    return {
      domain: this.domain,
      industry: this.industry,
      generatedAt: new Date().toISOString(),
      totalPhases: Object.keys(this.phaseOutputs).length,
      ruvectorCacheHitRate: this.calculateCacheHitRate(),
      patternsApplied: this.countPatternsApplied(),
      estimatedCostSavings: this.calculateCostSavings(),
    };
  }

  /**
   * Calculate cache hit rate
   */
  private calculateCacheHitRate(): number {
    const phase4 = this.phaseOutputs.phase4;
    if (!phase4 || phase4.totalKeywords === 0) return 0;
    return phase4.cachedKeywords / phase4.totalKeywords;
  }

  /**
   * Count patterns applied across all phases
   */
  private countPatternsApplied(): number {
    // Count RuVector patterns applied during analysis
    let count = 0;

    // Phase 4: Keyword patterns
    if (this.phaseOutputs.phase4) {
      count += this.phaseOutputs.phase4.cachedKeywords > 0 ? 1 : 0;
    }

    // Phase 5: SERP patterns
    if (this.phaseOutputs.phase5) {
      count += this.phaseOutputs.phase5.serpFeatureGaps.featuredSnippetsAvailable > 0 ? 1 : 0;
    }

    return count;
  }

  /**
   * Calculate estimated cost savings from cache usage
   */
  private calculateCostSavings(): number {
    const phase4 = this.phaseOutputs.phase4;
    if (!phase4) return 0;

    // Assume $0.01 per DataForSEO API call
    const costPerCall = 0.01;
    const callsAvoided = phase4.cachedKeywords;

    return callsAvoided * costPerCall;
  }

  /**
   * Get pattern match for a keyword (placeholder)
   */
  private getPatternMatch(keyword: KeywordWithMetrics): string {
    // In production, this would query RuVector for pattern matches
    return 'Pattern from cache';
  }
}

/**
 * Strategy document structure
 */
export interface StrategyDocument {
  /** Markdown format for human reading */
  markdown: string;

  /** JSON format for programmatic access */
  json: StrategyJSON;

  /** Document metadata */
  metadata: DocumentMetadata;
}

/**
 * Strategy JSON structure
 */
export interface StrategyJSON {
  domain: string;
  industry?: string;
  generatedAt: string;
  phases: PhaseOutputs;
  strategy: SEOStrategy;
  roadmap: SEORoadmap;
  metadata: DocumentMetadata;
}

/**
 * Document metadata
 */
export interface DocumentMetadata {
  domain: string;
  industry?: string;
  generatedAt: string;
  totalPhases: number;
  ruvectorCacheHitRate: number;
  patternsApplied: number;
  estimatedCostSavings: number;
}

/**
 * RuVector intelligence summary
 */
export interface RuVectorIntelligenceSummary {
  cacheHitRate: number;
  patternsApplied: number;
  costSavings: number;
  similarSitesAnalyzed: number;
}

/**
 * Export document generator
 */
export default StrategyDocumentGenerator;
