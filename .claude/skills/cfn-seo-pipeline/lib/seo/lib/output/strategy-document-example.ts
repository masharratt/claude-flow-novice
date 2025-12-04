/**
 * SEO Strategy Document Generator - Example Usage
 *
 * Demonstrates how to use the StrategyDocumentGenerator to create
 * comprehensive SEO strategy documents from 7-phase onboarding outputs.
 *
 * @module seo/lib/output/strategy-document-example
 */

import StrategyDocumentGenerator from './strategy-document';
import type { PhaseOutputs, SEOStrategy, SEORoadmap } from './strategy-document';

/**
 * Example usage with sample data
 */
async function generateExampleStrategyDocument() {
  // Sample phase outputs
  const phaseOutputs: PhaseOutputs = {
    phase1: {
      technicalHealthScore: 0.78,
      criticalIssues: [
        { issue: '50 pages blocked by robots.txt', severity: 'HIGH' },
        { issue: 'Missing canonical tags on 120 pages', severity: 'HIGH' },
        { issue: 'Mobile-unfriendly navigation on 15 pages', severity: 'MEDIUM' },
      ],
      performance: {
        lcp: '3.2s',
        fid: '180ms',
        cls: '0.15',
      },
      crawlData: {
        totalPages: 450,
        pagesWithIssues: 85,
        avgLoadTime: 2.8,
        indexedPages: 380,
        robotsTxtStatus: 'valid',
        mobileFriendlyScore: 0.85,
        coreWebVitalsScore: 0.72,
      },
      recommendations: [
        'Unblock critical pages in robots.txt',
        'Implement canonical tags site-wide',
        'Optimize Core Web Vitals (target: LCP < 2.5s)',
        'Fix mobile navigation usability issues',
      ],
    },
    phase2: {
      totalPages: 450,
      contentByType: {
        blog: 180,
        product: 75,
        service: 25,
        landing: 40,
        other: 130,
      },
      avgWordCount: 850,
      thinContentCount: 45,
      duplicateContentCount: 12,
      existingKeywords: [
        { keyword: 'family history software', pages: 8 },
        { keyword: 'genealogy research', pages: 12 },
        { keyword: 'dna testing guide', pages: 5 },
      ],
      contentClusters: [
        { topic: 'DNA Testing', pages: 25, internalLinks: 45 },
        { topic: 'Family Trees', pages: 35, internalLinks: 78 },
        { topic: 'Immigration Records', pages: 18, internalLinks: 32 },
      ],
    },
    phase3: {
      competitorsIdentified: 8,
      primaryCompetitors: [
        {
          domain: 'ancestry.com',
          domainAuthority: 92,
          monthlyTraffic: '45M',
          rankingKeywords: 850000,
          backlinks: '12M',
          contentStrategy: 'Comprehensive guides + tools',
        },
        {
          domain: 'familysearch.org',
          domainAuthority: 85,
          monthlyTraffic: '28M',
          rankingKeywords: 420000,
          contentStrategy: 'Educational content + free tools',
        },
      ],
      competitivePosition: {
        yourDA: 45,
        yourTraffic: '50K',
        marketShare: '0.1%',
      },
    },
    phase4: {
      totalKeywords: 2500,
      cachedKeywords: 2100,
      newKeywords: 400,
      byIntent: {
        informational: 1500,
        commercial: 600,
        transactional: 250,
        navigational: 150,
      },
      byDifficulty: {
        easy: 800,
        medium: 1200,
        hard: 500,
      },
      totalSearchVolume: 450000,
      topKeywords: [
        {
          keyword: 'how to build a family tree',
          searchVolume: 12000,
          keywordDifficulty: 45,
          cpc: 1.2,
          searchIntent: 'informational',
          source: 'cache',
        },
        {
          keyword: 'best genealogy software',
          searchVolume: 8500,
          keywordDifficulty: 52,
          cpc: 3.5,
          searchIntent: 'commercial',
          source: 'cache',
        },
      ],
    },
    phase5: {
      keywordGaps: {
        totalGaps: 450,
        highPriority: [
          { keyword: 'dna test comparison', volume: 8500, topCompetitor: 'ancestry.com', position: 3 },
          { keyword: 'free family tree maker', volume: 6200, topCompetitor: 'familysearch.org', position: 2 },
        ],
        trafficPotential: 85000,
      },
      contentGaps: [
        { topic: 'DNA Test Comparison Guides', competitorCoverage: 3, trafficPotential: 15000, priority: 'HIGH' },
        { topic: 'Immigration Records Research', competitorCoverage: 2, trafficPotential: 8000, priority: 'HIGH' },
      ],
      backLinkGaps: {
        totalGapDomains: 250,
        highAuthorityDomains: 45,
      },
      serpFeatureGaps: {
        featuredSnippetsAvailable: 35,
        paaOpportunities: 120,
        videoCarouselOpportunities: 15,
      },
    },
  };

  // SEO strategy
  const strategy: SEOStrategy = {
    contentPillars: [
      {
        pillar: 'Family Tree Building',
        targetKeywords: 85,
        estimatedTraffic: 35000,
        contentPiecesNeeded: 12,
        priority: 'HIGH',
      },
      {
        pillar: 'DNA Testing Guides',
        targetKeywords: 45,
        estimatedTraffic: 28000,
        contentPiecesNeeded: 8,
        priority: 'HIGH',
      },
      {
        pillar: 'Immigration Records Research',
        targetKeywords: 30,
        estimatedTraffic: 15000,
        contentPiecesNeeded: 6,
        priority: 'MEDIUM',
      },
    ],
    quickWins: [
      { action: 'Optimize 10 pages for featured snippets', effort: 'LOW', impact: 'HIGH' },
      { action: 'Fix 50 missing canonical tags', effort: 'LOW', impact: 'MEDIUM' },
      { action: 'Create FAQ schema for 20 high-traffic pages', effort: 'MEDIUM', impact: 'HIGH' },
    ],
    competitiveMoats: [
      'Exclusive expert interviews with genealogists',
      'Interactive family tree builder tool',
      'Video tutorial series (50+ videos)',
      'Community forum with 10K+ active users',
    ],
    estimatedResults: {
      sixMonthTrafficTarget: '+150%',
      twelveMonthTrafficTarget: '+400%',
      keywordRankingsTop10Target: 200,
    },
  };

  // 6-month roadmap
  const roadmap: SEORoadmap = {
    months: [
      {
        month: 1,
        title: 'Month 1: Foundation',
        tasks: [
          'Fix 5 critical technical issues',
          'Optimize Core Web Vitals (target: green scores)',
          'Implement missing schema markup',
          'Create 4 quick-win content pieces',
        ],
        kpis: ['Technical health score > 0.85', 'CWV all green', '10 featured snippets'],
      },
      {
        month: 2,
        title: 'Month 2-3: Content Foundation',
        tasks: [
          'Build Pillar 1: "Family Tree Building" cluster (12 pages)',
          'Optimize 20 existing pages for target keywords',
          'Build 10 high-quality backlinks',
          'Launch featured snippet optimization campaign',
        ],
        kpis: ['Organic traffic +20%', '15 new top 10 rankings', '25 featured snippets'],
      },
      {
        month: 4,
        title: 'Month 4-6: Scale',
        tasks: [
          'Build Pillar 2: "DNA Testing Guides" cluster (8 pages)',
          'Build Pillar 3: "Immigration Records" cluster (6 pages)',
          'Reach 100 pages optimized',
          'Build 30 additional backlinks',
        ],
        kpis: ['Organic traffic +50% (total)', '50 new top 10 rankings', '50 featured snippets'],
      },
    ],
    overallKPIs: [
      { metric: 'Organic traffic growth', target: '+15%/month', frequency: 'Monthly' },
      { metric: 'Keyword rankings top 10', target: '50 by month 3', frequency: 'Weekly' },
      { metric: 'Domain authority growth', target: '+5 points by month 6', frequency: 'Quarterly' },
      { metric: 'Conversion rate', target: 'Maintain or improve', frequency: 'Monthly' },
    ],
  };

  // Generate document
  const generator = new StrategyDocumentGenerator(
    phaseOutputs,
    strategy,
    roadmap,
    'example.com',
    'genealogy'
  );

  const document = await generator.generateDocument();

  console.log('=== STRATEGY DOCUMENT (MARKDOWN) ===');
  console.log(document.markdown);
  console.log('\n=== STRATEGY DOCUMENT (JSON METADATA) ===');
  console.log(JSON.stringify(document.metadata, null, 2));

  return document;
}

// Run example
if (require.main === module) {
  generateExampleStrategyDocument()
    .then(() => console.log('\n✅ Strategy document generated successfully'))
    .catch((error) => console.error('❌ Error:', error));
}

export { generateExampleStrategyDocument };
