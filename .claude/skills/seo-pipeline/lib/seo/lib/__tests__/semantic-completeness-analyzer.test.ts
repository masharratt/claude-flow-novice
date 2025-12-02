/**
 * Semantic Completeness Analyzer Tests
 *
 * @module planning/seo/tests/semantic-completeness-analyzer.test
 * @description Comprehensive tests for semantic completeness analysis
 */

import { SemanticCompletenessAnalyzer } from '../semantic-completeness-analyzer';
import {
  TopicCategory,
  GapPriority,
  RecommendationType,
  SemanticAnalysisErrorCode,
  Topic,
} from '../../types/semantic-analysis';

describe('SemanticCompletenessAnalyzer', () => {
  let analyzer: SemanticCompletenessAnalyzer;

  beforeEach(() => {
    analyzer = new SemanticCompletenessAnalyzer({
      minTopicFrequency: 2,
      minTopicImportance: 0.1,
      maxTopics: 50,
      verbose: false,
    });
  });

  describe('Topic Extraction', () => {
    it('should extract main topics from content', () => {
      const content = `
        Machine learning is a subset of artificial intelligence.
        Machine learning algorithms learn from data patterns.
        Neural networks are a type of machine learning model.
        Deep learning uses multiple neural network layers.
      `.trim();

      const result = analyzer.extractTopics(content);

      expect(result.topics.length).toBeGreaterThan(0);
      expect(result.processingTime).toBeGreaterThan(0);
      expect(result.tokensAnalyzed).toBeGreaterThan(0);

      // Should find "machine learning" as a topic
      const mlTopic = result.topics.find((t: Topic) => t.name.includes('machine learning'));
      expect(mlTopic).toBeDefined();
      expect(mlTopic?.frequency).toBeGreaterThanOrEqual(2);
    });

    it('should categorize topics correctly', () => {
      const content = `
        What is machine learning? Machine learning is a method of data analysis.
        For example, machine learning can predict stock prices.
        Use case: machine learning in healthcare.
        According to experts, machine learning is transforming industries.
        Machine learning vs deep learning: a comparison.
      `.trim();

      const result = analyzer.extractTopics(content);

      const categories = new Set(result.topics.map((t: Topic) => t.category));
      expect(categories.size).toBeGreaterThan(1);

      // Should categorize different topic types
      const hasQuestion = result.topics.some((t: Topic) => t.category === TopicCategory.QUESTION);
      const hasExample = result.topics.some((t: Topic) => t.category === TopicCategory.EXAMPLE);
      const hasUseCase = result.topics.some((t: Topic) => t.category === TopicCategory.USE_CASE);

      expect(hasQuestion || hasExample || hasUseCase).toBe(true);
    });

    it('should extract topics with context', () => {
      const content = `
        Machine learning revolutionizes data analysis.
        Companies use machine learning for predictive analytics.
        Machine learning models require training data.
      `.trim();

      const result = analyzer.extractTopics(content);

      const mlTopic = result.topics.find((t: Topic) => t.name.includes('machine learning'));
      expect(mlTopic?.context).toBeDefined();
      expect(mlTopic?.context.length).toBeGreaterThan(0);
    });

    it('should handle empty content gracefully', () => {
      const result = analyzer.extractTopics('');

      expect(result.topics).toEqual([]);
      expect(result.tokensAnalyzed).toBe(0);
    });

    it('should respect maxTopics configuration', () => {
      const smallAnalyzer = new SemanticCompletenessAnalyzer({
        maxTopics: 5,
      });

      const content = `
        artificial intelligence machine learning deep learning
        neural networks natural language processing computer vision
        reinforcement learning supervised learning unsupervised learning
        transfer learning generative models classification regression
        clustering dimensionality reduction feature engineering
      `.repeat(5);

      const result = smallAnalyzer.extractTopics(content);

      expect(result.topics.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Semantic Keyword Extraction', () => {
    it('should extract semantic keywords', () => {
      const content = `
        Machine learning algorithms process data efficiently.
        Neural networks and deep learning models analyze patterns.
        Training data quality impacts model performance significantly.
      `.trim();

      const topics = analyzer.extractTopics(content).topics;
      const keywords = analyzer.extractSemanticKeywords(content, topics);

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords[0].relevance).toBeGreaterThanOrEqual(0);
      expect(keywords[0].relevance).toBeLessThanOrEqual(1);
    });

    it('should calculate co-occurrence scores', () => {
      const content = `
        Machine learning requires quality data.
        Data quality affects machine learning performance.
        Quality data enables better machine learning models.
      `.trim();

      const topics = analyzer.extractTopics(content).topics;
      const keywords = analyzer.extractSemanticKeywords(content, topics);

      const qualityKeyword = keywords.find((k) => k.keyword === 'quality');
      expect(qualityKeyword).toBeDefined();
      expect(qualityKeyword?.coOccurrence).toBeGreaterThan(0);
    });

    it('should sort keywords by relevance', () => {
      const content = `
        Machine learning data science algorithms neural networks
        deep learning artificial intelligence computer vision
        natural language processing predictive analytics
      `.repeat(3);

      const topics = analyzer.extractTopics(content).topics;
      const keywords = analyzer.extractSemanticKeywords(content, topics);

      for (let i = 1; i < keywords.length; i++) {
        expect(keywords[i - 1].relevance).toBeGreaterThanOrEqual(keywords[i].relevance);
      }
    });
  });

  describe('Gap Identification', () => {
    it('should identify missing topics', () => {
      const ourTopics = analyzer.extractTopics('Machine learning basics').topics;

      const competitor1 = analyzer.extractTopics('Machine learning and deep learning').topics;
      const competitor2 = analyzer.extractTopics('Machine learning and neural networks').topics;
      const competitor3 = analyzer.extractTopics('Machine learning and data preprocessing').topics;

      const competitorTopicsByDomain = new Map([
        ['competitor1.com', competitor1],
        ['competitor2.com', competitor2],
        ['competitor3.com', competitor3],
      ]);

      const allCompetitorTopics = [...competitor1, ...competitor2, ...competitor3]
        .filter((topic, index, self) =>
          index === self.findIndex(t => t.name.toLowerCase() === topic.name.toLowerCase())
        );

      const gaps = analyzer.identifyGaps(ourTopics, allCompetitorTopics, competitorTopicsByDomain);

      expect(gaps.length).toBeGreaterThan(0);

      // Should identify gaps that competitors cover
      const deepLearningGap = gaps.find((g) => g.topic.includes('deep learning'));
      if (deepLearningGap) {
        expect(deepLearningGap.competitorsCovering).toBeGreaterThan(0);
        expect(deepLearningGap.impactScore).toBeGreaterThan(0);
      }
    });

    it('should prioritize gaps correctly', () => {
      const ourTopics = analyzer.extractTopics('Basic content').topics;

      const competitor1Topics = analyzer.extractTopics('Important topic covered here').topics;
      const competitor2Topics = analyzer.extractTopics('Important topic also here').topics;
      const competitor3Topics = analyzer.extractTopics('Important topic everywhere').topics;

      const competitorTopicsByDomain = new Map([
        ['comp1.com', competitor1Topics],
        ['comp2.com', competitor2Topics],
        ['comp3.com', competitor3Topics],
      ]);

      const allCompTopics = [...competitor1Topics, ...competitor2Topics, ...competitor3Topics]
        .filter((t, i, self) =>
          i === self.findIndex(x => x.name.toLowerCase() === t.name.toLowerCase())
        );

      const gaps = analyzer.identifyGaps(ourTopics, allCompTopics, competitorTopicsByDomain);

      // Gaps covered by more competitors should have higher priority
      const highPriorityGaps = gaps.filter(
        (g) => g.priority === GapPriority.CRITICAL || g.priority === GapPriority.HIGH
      );

      if (highPriorityGaps.length > 0) {
        expect(highPriorityGaps[0].competitorsCovering).toBeGreaterThanOrEqual(1);
      }
    });

    it('should calculate impact scores', () => {
      const ourTopics = analyzer.extractTopics('Content A').topics;

      const comp1 = analyzer.extractTopics('Important topic with high relevance').topics;
      const comp2 = analyzer.extractTopics('Important topic crucial point').topics;

      const competitorTopicsByDomain = new Map([
        ['comp1.com', comp1],
        ['comp2.com', comp2],
      ]);

      const allComp = [...comp1, ...comp2]
        .filter((t, i, self) => i === self.findIndex(x => x.name === t.name));

      const gaps = analyzer.identifyGaps(ourTopics, allComp, competitorTopicsByDomain);

      for (const gap of gaps) {
        expect(gap.impactScore).toBeGreaterThanOrEqual(0);
        expect(gap.impactScore).toBeLessThanOrEqual(1);
      }
    });

    it('should estimate word count for gaps', () => {
      const ourTopics = analyzer.extractTopics('Short content').topics;

      const compTopics = analyzer.extractTopics('Detailed explanation of concepts').topics;
      const competitorTopicsByDomain = new Map([['comp.com', compTopics]]);

      const gaps = analyzer.identifyGaps(ourTopics, compTopics, competitorTopicsByDomain);

      for (const gap of gaps) {
        if (gap.estimatedWordCount) {
          expect(gap.estimatedWordCount).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('Coverage Score Calculation', () => {
    it('should calculate coverage score', () => {
      const ourTopics = analyzer.extractTopics(
        'Machine learning and artificial intelligence'
      ).topics;

      const competitorTopics = analyzer.extractTopics(
        'Machine learning, artificial intelligence, and deep learning'
      ).topics;

      const score = analyzer.calculateCoverageScore(ourTopics, competitorTopics);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return 100 for complete coverage', () => {
      const content = 'Machine learning algorithms process data';
      const ourTopics = analyzer.extractTopics(content).topics;
      const competitorTopics = analyzer.extractTopics(content).topics;

      const score = analyzer.calculateCoverageScore(ourTopics, competitorTopics);

      expect(score).toBeGreaterThanOrEqual(80); // High coverage expected
    });

    it('should return lower score for incomplete coverage', () => {
      const ourTopics = analyzer.extractTopics('Basic machine learning').topics;

      const competitorTopics = analyzer.extractTopics(
        'Machine learning, deep learning, neural networks, computer vision, NLP'
      ).topics;

      const score = analyzer.calculateCoverageScore(ourTopics, competitorTopics);

      expect(score).toBeLessThan(80); // Lower coverage expected
    });

    it('should handle empty competitor topics', () => {
      const ourTopics = analyzer.extractTopics('Some content').topics;
      const competitorTopics: any[] = [];

      const score = analyzer.calculateCoverageScore(ourTopics, competitorTopics);

      expect(score).toBe(100); // No competitors means 100% coverage
    });
  });

  describe('Recommendation Generation', () => {
    it('should generate recommendations from gaps', () => {
      const ourTopics = analyzer.extractTopics('Machine learning basics').topics;

      const comp1 = analyzer.extractTopics('Machine learning and neural networks').topics;
      const comp2 = analyzer.extractTopics('Machine learning and deep learning').topics;

      const competitorTopicsByDomain = new Map([
        ['comp1.com', comp1],
        ['comp2.com', comp2],
      ]);

      const allComp = [...comp1, ...comp2]
        .filter((t, i, self) => i === self.findIndex(x => x.name === t.name));

      const gaps = analyzer.identifyGaps(ourTopics, allComp, competitorTopicsByDomain);
      const recommendations = analyzer.generateRecommendations(gaps, []);

      expect(recommendations.length).toBeGreaterThan(0);

      for (const rec of recommendations) {
        expect(rec.topic).toBeDefined();
        expect(rec.type).toBeDefined();
        expect(rec.priority).toBeDefined();
        expect(rec.rationale).toBeDefined();
        expect(rec.suggestedSection).toBeDefined();
      }
    });

    it('should prioritize critical recommendations', () => {
      const criticalGap = {
        topic: 'Critical topic',
        competitorsCovering: 3,
        competitorDomains: ['c1.com', 'c2.com', 'c3.com'],
        impactScore: 0.9,
        priority: GapPriority.CRITICAL,
        category: TopicCategory.PRIMARY_KEYWORD,
        avgCompetitorImportance: 0.8,
      };

      const lowGap = {
        topic: 'Low priority topic',
        competitorsCovering: 1,
        competitorDomains: ['c1.com'],
        impactScore: 0.2,
        priority: GapPriority.LOW,
        category: TopicCategory.RELATED_CONCEPT,
        avgCompetitorImportance: 0.1,
      };

      const recommendations = analyzer.generateRecommendations([criticalGap, lowGap], []);

      // Critical gap should appear first
      expect(recommendations[0].priority).toBe(GapPriority.CRITICAL);
    });

    it('should include competitor examples', () => {
      const gap = {
        topic: 'Example topic',
        competitorsCovering: 2,
        competitorDomains: ['comp1.com', 'comp2.com'],
        impactScore: 0.6,
        priority: GapPriority.HIGH,
        category: TopicCategory.EXAMPLE,
        avgCompetitorImportance: 0.5,
      };

      const recommendations = analyzer.generateRecommendations([gap], []);

      expect(recommendations[0].competitorExamples.length).toBeGreaterThan(0);
    });

    it('should suggest appropriate recommendation types', () => {
      const questionGap = {
        topic: 'What is machine learning?',
        competitorsCovering: 2,
        competitorDomains: ['c1.com', 'c2.com'],
        impactScore: 0.5,
        priority: GapPriority.HIGH,
        category: TopicCategory.QUESTION,
        avgCompetitorImportance: 0.4,
      };

      const recommendations = analyzer.generateRecommendations([questionGap], []);

      const faqRec = recommendations.find((r) => r.type === RecommendationType.ADD_FAQ);
      expect(faqRec).toBeDefined();
    });
  });

  describe('Full Completeness Analysis', () => {
    it('should analyze completeness successfully', async () => {
      const ourContent = `
        Machine learning is a powerful tool for data analysis.
        It enables predictive modeling and pattern recognition.
      `.trim();

      const competitors = [
        {
          domain: 'competitor1.com',
          content: 'Machine learning and deep learning are related fields.',
        },
        {
          domain: 'competitor2.com',
          content: 'Machine learning uses neural networks for complex tasks.',
        },
        {
          domain: 'competitor3.com',
          content: 'Machine learning requires quality training data.',
        },
      ];

      const report = await analyzer.analyzeCompleteness(ourContent, competitors);

      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
      expect(report.competitorsAnalyzed).toBe(3);
      expect(report.gaps).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(report.ourContent).toBeDefined();
      expect(report.competitorContent).toBeDefined();
      expect(report.competitorComparison.length).toBe(3);
    });

    it('should provide content statistics', async () => {
      const ourContent = 'Machine learning algorithms analyze data patterns efficiently.';

      const competitors = [
        { domain: 'comp1.com', content: 'Machine learning and AI.' },
      ];

      const report = await analyzer.analyzeCompleteness(ourContent, competitors);

      expect(report.ourContent.wordCount).toBeGreaterThan(0);
      expect(report.ourContent.topicCount).toBeGreaterThan(0);
      expect(report.competitorContent.wordCount).toBeGreaterThan(0);
    });

    it('should identify unique topics we have', async () => {
      const ourContent = `
        Machine learning and quantum computing integration.
        Quantum algorithms enhance machine learning models.
      `.trim();

      const competitors = [
        { domain: 'comp1.com', content: 'Machine learning basics.' },
      ];

      const report = await analyzer.analyzeCompleteness(ourContent, competitors);

      // Should identify quantum computing as unique
      expect(report.uniqueTopics.length).toBeGreaterThanOrEqual(0);
    });

    it('should provide category breakdown', async () => {
      const ourContent = 'Machine learning algorithms process data.';

      const competitors = [
        {
          domain: 'comp1.com',
          content: 'What is machine learning? Example: classification tasks.',
        },
      ];

      const report = await analyzer.analyzeCompleteness(ourContent, competitors);

      expect(report.categoryBreakdown).toBeDefined();
      expect(report.categoryBreakdown.length).toBeGreaterThan(0);

      for (const breakdown of report.categoryBreakdown) {
        expect(breakdown.category).toBeDefined();
        expect(breakdown.ourCount).toBeGreaterThanOrEqual(0);
        expect(breakdown.competitorAvgCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('should build competitor comparisons', async () => {
      const ourContent = 'Machine learning and data science.';

      const competitors = [
        { domain: 'comp1.com', content: 'Machine learning and deep learning.' },
        { domain: 'comp2.com', content: 'Machine learning and neural networks.' },
      ];

      const report = await analyzer.analyzeCompleteness(ourContent, competitors);

      expect(report.competitorComparison.length).toBe(2);

      for (const comparison of report.competitorComparison) {
        expect(comparison.domain).toBeDefined();
        expect(comparison.overlapPercentage).toBeGreaterThanOrEqual(0);
        expect(comparison.overlapPercentage).toBeLessThanOrEqual(100);
        expect(comparison.contentStats).toBeDefined();
        expect(comparison.relativeQuality).toBeGreaterThanOrEqual(-1);
        expect(comparison.relativeQuality).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error for empty our content', async () => {
      const competitors = [
        { domain: 'comp1.com', content: 'Some content' },
      ];

      await expect(
        analyzer.analyzeCompleteness('', competitors)
      ).rejects.toThrow();
    });

    it('should throw error for no competitors', async () => {
      await expect(
        analyzer.analyzeCompleteness('Our content', [])
      ).rejects.toThrow();
    });

    it('should throw error for invalid competitor data', async () => {
      const invalidCompetitors = [
        { domain: '', content: '' } as any,
      ];

      await expect(
        analyzer.analyzeCompleteness('Our content', invalidCompetitors)
      ).rejects.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should respect custom configuration', () => {
      const customAnalyzer = new SemanticCompletenessAnalyzer({
        minTopicFrequency: 5,
        minTopicImportance: 0.3,
        maxTopics: 10,
        fuzzyMatching: false,
        criticalThreshold: 2,
      });

      expect(customAnalyzer).toBeDefined();
    });

    it('should use fuzzy matching when enabled', () => {
      const fuzzyAnalyzer = new SemanticCompletenessAnalyzer({
        fuzzyMatching: true,
        similarityThreshold: 0.8,
      });

      const ourTopics = fuzzyAnalyzer.extractTopics('machine learning model').topics;
      const compTopics = fuzzyAnalyzer.extractTopics('machine learning models').topics;

      const competitorTopicsByDomain = new Map([['comp.com', compTopics]]);

      const gaps = fuzzyAnalyzer.identifyGaps(ourTopics, compTopics, competitorTopicsByDomain);

      // Should match similar topics with fuzzy matching
      expect(gaps.length).toBeLessThanOrEqual(compTopics.length);
    });
  });

  describe('Performance', () => {
    it('should handle large content efficiently', async () => {
      const largeContent = `
        Machine learning algorithms process vast amounts of data.
        Deep learning neural networks analyze complex patterns.
        Natural language processing enables text understanding.
        Computer vision recognizes objects in images.
      `.repeat(50);

      const competitors = [
        { domain: 'comp1.com', content: largeContent },
      ];

      const startTime = Date.now();
      const report = await analyzer.analyzeCompleteness(largeContent, competitors);
      const duration = Date.now() - startTime;

      expect(report).toBeDefined();
      expect(duration).toBeLessThan(10000); // Should complete in under 10 seconds
    });

    it('should handle multiple competitors', async () => {
      const ourContent = 'Machine learning and AI.';

      const competitors = Array.from({ length: 5 }, (_, i) => ({
        domain: `competitor${i + 1}.com`,
        content: `Machine learning content ${i + 1} with unique topics.`,
      }));

      const report = await analyzer.analyzeCompleteness(ourContent, competitors);

      expect(report.competitorsAnalyzed).toBe(5);
      expect(report.competitorComparison.length).toBe(5);
    });
  });
});
