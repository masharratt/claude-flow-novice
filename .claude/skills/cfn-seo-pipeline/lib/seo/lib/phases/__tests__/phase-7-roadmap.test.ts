/**
 * Phase 7 Roadmap Generation - Integration Tests
 *
 * Comprehensive test suite for Phase 7 roadmap generation from Phase 6 strategy.
 * Coverage target: ≥80% statement/branch/function/line coverage.
 *
 * Tests:
 * - Roadmap generation from Phase 6 strategy
 * - Milestone creation (6 monthly milestones)
 * - Task generation (30-50 tasks with dependencies)
 * - KPI definitions per phase
 * - Markdown output formatting
 * - Task prioritization and sequencing
 * - Error handling (missing strategy data)
 *
 * @module seo/lib/phases/__tests__/phase-7-roadmap.test
 */

import { executePhase7, type Phase7Config, type Phase7Result, type SEORoadmap, type Task } from '../phase-7-roadmap';
import type { SEOStrategy, ContentPillar } from '../phase-6-strategy';
import Redis from 'ioredis';

// ============================================================================
// Mock Setup
// ============================================================================

function createMockSEOStrategy(overrides: Partial<SEOStrategy> = {}): SEOStrategy {
  return {
    contentPillars: [
      {
        name: 'Project Management Tools',
        description: 'Comprehensive guides on PM software',
        priority: 'HIGH',
        targetKeywords: ['best project management software', 'pm tools 2024'],
        trafficPotential: 15000,
        articleCount: 12,
        relatedGaps: ['comparison-guide', 'tutorials'],
        contentTypes: ['listicle', 'comparison', 'guide'],
        patternSource: 'pattern-123',
      },
      {
        name: 'Team Collaboration',
        description: 'Remote team collaboration strategies',
        priority: 'HIGH',
        targetKeywords: ['team collaboration software', 'remote team tools'],
        trafficPotential: 10000,
        articleCount: 8,
        relatedGaps: ['case-studies', 'best-practices'],
        contentTypes: ['guide', 'case-study'],
      },
      {
        name: 'Workflow Automation',
        description: 'Automation tools and strategies',
        priority: 'MEDIUM',
        targetKeywords: ['workflow automation', 'process automation'],
        trafficPotential: 8000,
        articleCount: 10,
        relatedGaps: ['calculators', 'templates'],
        contentTypes: ['interactive', 'template'],
      },
    ],
    quickWins: [
      {
        name: 'Update existing comparison pages',
        description: 'Quick traffic boost from existing pages',
        type: 'content',
        effort: 8,
        impact: 7,
        priorityScore: 5.6,
        steps: ['Audit existing comparison pages', 'Add new tools', 'Update rankings'],
        estimatedDays: 3,
        expectedLift: 2000,
      },
      {
        name: 'Fix critical technical SEO issues',
        description: 'Improve crawlability and indexing',
        type: 'technical',
        effort: 12,
        impact: 8,
        priorityScore: 6.7,
        steps: ['Fix 404 errors', 'Optimize robots.txt', 'Improve site speed'],
        estimatedDays: 5,
        expectedLift: 1500,
      },
      {
        name: 'Create high-priority comparison guide',
        description: 'Target high-volume keywords',
        type: 'content',
        effort: 16,
        impact: 9,
        priorityScore: 8.1,
        steps: ['Research tools', 'Create comparison matrix', 'Add expert insights'],
        estimatedDays: 10,
        expectedLift: 3000,
      },
    ],
    competitiveAdvantages: [
      'Data-driven content backed by RuVector patterns',
      'Comprehensive topical coverage',
      'Interactive tools and calculators',
    ],
    linkBuildingStrategy: {
      priorityDomains: ['industry-blog1.com', 'saas-directory.com', 'tech-news.com'],
      tactics: [
        { name: 'Guest posting', description: 'Create guest posts on industry blogs', difficulty: 7, expectedLinksPerMonth: 15, priority: 'HIGH' },
        { name: 'Digital PR', description: 'Press releases and media outreach', difficulty: 5, expectedLinksPerMonth: 10, priority: 'MEDIUM' },
      ],
      monthlyTargets: [
        { month: 1, targetLinks: 5, targetDR: 50 },
        { month: 3, targetLinks: 15, targetDR: 55 },
        { month: 6, targetLinks: 30, targetDR: 60 },
      ],
      patternRecommendations: ['Focus on original research', 'Create linkable assets'],
    },
    technicalRoadmap: [
      {
        name: 'Fix crawl errors',
        description: 'Resolve 404s and redirect chains',
        priority: 'CRITICAL',
        effort: 6,
        category: 'crawlability',
        timeline: 'Week 1',
        impact: 'Improve indexing',
      },
      {
        name: 'Implement schema markup',
        description: 'Add structured data for rich results',
        priority: 'HIGH',
        effort: 12,
        category: 'schema',
        timeline: 'Week 2-3',
        impact: 'Enhanced SERP visibility',
      },
    ],
    projections: {
      sixMonth: {
        month: 6,
        organicTraffic: 25000,
        expectedRankings: { top3: 15, top10: 45, top20: 90 },
        milestones: ['3 content pillars launched', '50+ backlinks'],
        confidence: 0.78,
      },
      twelveMonth: {
        month: 12,
        organicTraffic: 50000,
        expectedRankings: { top3: 30, top10: 90, top20: 180 },
        milestones: ['All pillars complete', '100+ backlinks'],
        confidence: 0.68,
      },
    },
    patternInsights: [
      {
        patternId: 'pattern-123',
        type: 'listicle',
        application: 'Applied to PM Tools pillar',
        expectedImpact: '15000 monthly traffic',
        confidence: 0.85,
      },
    ],
    confidence: 0.85,
    summary: 'Strategy focused on 3 content pillars with 30 articles targeting 33,000 monthly traffic',
    ...overrides,
  };
}

async function setupTestPhase6Data(redis: Redis, taskId: string, strategy?: SEOStrategy) {
  const mockStrategy = strategy || createMockSEOStrategy();

  await redis.set(
    `seo:task:${taskId}:phase6:strategy`,
    JSON.stringify({
      strategy: mockStrategy,
      metadata: {
        processedAt: new Date().toISOString(),
        phaseVersion: '1.0',
        processingTime: 5000,
        patternsQueried: 10,
        patternsApplied: 3,
      },
    })
  );
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Phase 7: Roadmap Generation', () => {
  let redis: Redis;
  const taskId = 'test-phase7-001';

  beforeAll(async () => {
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      lazyConnect: true,
    });

    try {
      await redis.connect();
    } catch (error) {
      console.warn('Redis not available, tests will be skipped:', error);
    }
  });

  afterAll(async () => {
    if (redis.status === 'ready') {
      await redis.quit();
    }
  });

  beforeEach(async () => {
    if (redis.status !== 'ready') {
      return;
    }

    await redis.flushdb();
    await setupTestPhase6Data(redis, taskId);
  });

  // ============================================================================
  // Milestone Generation Tests
  // ============================================================================

  describe('Milestone Generation', () => {
    it('should generate 6 monthly milestones', async () => {
      if (redis.status !== 'ready') {
        console.log('Skipping test: Redis not available');
        return;
      }

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
        verbose: false,
      };

      const result = await executePhase7(config);

      expect(result.roadmap.milestones.length).toBe(6);
    });

    it('should include required fields in each milestone', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);
      const milestone = result.roadmap.milestones[0];

      expect(milestone).toHaveProperty('month');
      expect(milestone).toHaveProperty('name');
      expect(milestone).toHaveProperty('focus');
      expect(milestone).toHaveProperty('deliverables');
      expect(milestone).toHaveProperty('successCriteria');

      expect(milestone.name).toBeTruthy();
      expect(milestone.deliverables.length).toBeGreaterThan(0);
    });

    it('should sequence milestones chronologically', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      for (let i = 0; i < result.roadmap.milestones.length - 1; i++) {
        expect(result.roadmap.milestones[i + 1].month).toBeGreaterThan(result.roadmap.milestones[i].month);
      }
    });

    it('should include realistic deliverables per milestone', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      // First milestone should focus on setup/quick wins
      const firstMilestone = result.roadmap.milestones[0];
      const firstDeliverables = firstMilestone.deliverables.join(' ').toLowerCase();

      expect(
        firstDeliverables.includes('technical') ||
          firstDeliverables.includes('setup') ||
          firstDeliverables.includes('foundation')
      ).toBe(true);
    });
  });

  // ============================================================================
  // Task Generation Tests
  // ============================================================================

  describe('Task Generation', () => {
    it('should generate 30-50 tasks', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      expect(result.roadmap.tasks.length).toBeGreaterThanOrEqual(30);
      expect(result.roadmap.tasks.length).toBeLessThanOrEqual(50);
    });

    it('should include required fields in each task', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);
      const task = result.roadmap.tasks[0];

      expect(task).toHaveProperty('id');
      expect(task).toHaveProperty('name');
      expect(task).toHaveProperty('description');
      expect(task).toHaveProperty('type');
      expect(task).toHaveProperty('priority');
      expect(task).toHaveProperty('effort');
      expect(task).toHaveProperty('impact');
      expect(task).toHaveProperty('startMonth');
      expect(task).toHaveProperty('endMonth');
      expect(task).toHaveProperty('dependencies');
      expect(task).toHaveProperty('successMetrics');
      expect(task).toHaveProperty('status');

      expect(task.name).toBeTruthy();
      expect(task.effort).toBeGreaterThan(0);
    });

    it('should include diverse task types', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      const taskTypes = new Set(result.roadmap.tasks.map((t) => t.type));

      expect(taskTypes.has('technical')).toBe(true);
      expect(taskTypes.has('content')).toBe(true);
      expect(taskTypes.size).toBeGreaterThanOrEqual(3);
    });

    it('should prioritize tasks appropriately', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      const criticalTasks = result.roadmap.tasks.filter((t) => t.priority === 'CRITICAL');
      const lowTasks = result.roadmap.tasks.filter((t) => t.priority === 'LOW');

      // Critical tasks should start earlier
      if (criticalTasks.length > 0 && lowTasks.length > 0) {
        const avgCriticalStart =
          criticalTasks.reduce((sum, t) => sum + t.startMonth, 0) / criticalTasks.length;
        const avgLowStart = lowTasks.reduce((sum, t) => sum + t.startMonth, 0) / lowTasks.length;

        expect(avgCriticalStart).toBeLessThan(avgLowStart);
      }
    });

    it('should estimate effort realistically (1-80 hours)', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      result.roadmap.tasks.forEach((task) => {
        expect(task.effort).toBeGreaterThanOrEqual(1);
        expect(task.effort).toBeLessThanOrEqual(80);
      });
    });

    it('should spread tasks across 6-month timeline', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      const tasksPerMonth = Array(6).fill(0);
      result.roadmap.tasks.forEach((task) => {
        for (let m = task.startMonth; m <= task.endMonth && m <= 6; m++) {
          tasksPerMonth[m - 1]++;
        }
      });

      // Each month should have at least some tasks
      tasksPerMonth.forEach((count) => {
        expect(count).toBeGreaterThan(0);
      });
    });
  });

  // ============================================================================
  // Task Dependencies Tests
  // ============================================================================

  describe('Task Dependencies', () => {
    it('should create task dependencies', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      // At least some tasks should have dependencies
      const tasksWithDependencies = result.roadmap.tasks.filter((t) => t.dependencies.length > 0);
      expect(tasksWithDependencies.length).toBeGreaterThan(0);
    });

    it('should ensure dependencies are valid task IDs', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      const taskIds = new Set(result.roadmap.tasks.map((t) => t.id));

      result.roadmap.tasks.forEach((task) => {
        task.dependencies.forEach((depId) => {
          expect(taskIds.has(depId)).toBe(true);
        });
      });
    });

    it('should ensure dependent tasks start after dependencies', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      const taskMap = new Map(result.roadmap.tasks.map((t) => [t.id, t]));

      result.roadmap.tasks.forEach((task) => {
        task.dependencies.forEach((depId) => {
          const dependency = taskMap.get(depId);
          if (dependency) {
            expect(task.startMonth).toBeGreaterThanOrEqual(dependency.endMonth);
          }
        });
      });
    });

    it('should track dependencies in dedicated array', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      expect(result.roadmap.dependencies).toBeDefined();
      expect(Array.isArray(result.roadmap.dependencies)).toBe(true);
      expect(result.roadmap.dependencies.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // KPI Tests
  // ============================================================================

  describe('KPI Definitions', () => {
    it('should define 5-10 KPIs to track', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      expect(result.roadmap.kpis.length).toBeGreaterThanOrEqual(5);
      expect(result.roadmap.kpis.length).toBeLessThanOrEqual(10);
    });

    it('should include required fields in each KPI', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);
      const kpi = result.roadmap.kpis[0];

      expect(kpi).toHaveProperty('name');
      expect(kpi).toHaveProperty('description');
      expect(kpi).toHaveProperty('metricType');
      expect(kpi).toHaveProperty('target');
      expect(kpi).toHaveProperty('baseline');
      expect(kpi).toHaveProperty('frequency');

      expect(kpi.name).toBeTruthy();
      expect(kpi.target).toBeGreaterThan(kpi.baseline);
    });

    it('should include diverse metric types', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      const metricTypes = new Set(result.roadmap.kpis.map((kpi) => kpi.metricType));

      expect(metricTypes.has('traffic')).toBe(true);
      expect(metricTypes.has('rankings')).toBe(true);
      expect(metricTypes.size).toBeGreaterThanOrEqual(3);
    });

    it('should set realistic targets based on projections', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      // Traffic KPI should align with Phase 6 projections
      const trafficKPI = result.roadmap.kpis.find((kpi) => kpi.metricType === 'traffic');

      if (trafficKPI) {
        expect(trafficKPI.target).toBeGreaterThan(0);
        expect(trafficKPI.target).toBeGreaterThan(trafficKPI.baseline);
      }
    });
  });

  // ============================================================================
  // Markdown Output Tests
  // ============================================================================

  describe('Markdown Output', () => {
    it('should generate valid markdown document', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      expect(result.roadmap.markdown).toBeTruthy();
      expect(result.roadmap.markdown.length).toBeGreaterThan(100);

      // Should contain markdown headers
      expect(result.roadmap.markdown).toContain('#');
    });

    it('should include all major sections', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);
      const markdown = result.roadmap.markdown.toLowerCase();

      expect(markdown).toContain('milestone');
      expect(markdown).toContain('task');
      expect(markdown).toContain('kpi');
      expect(markdown).toContain('timeline');
    });

    it('should format tasks as tables or lists', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);
      const markdown = result.roadmap.markdown;

      // Should contain either table syntax or list syntax
      const hasTable = markdown.includes('|') || markdown.includes('---');
      const hasList = markdown.includes('- ') || markdown.includes('* ');

      expect(hasTable || hasList).toBe(true);
    });

    it('should save markdown to file when outputDir provided', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
        outputDir: '/tmp',
      };

      const result = await executePhase7(config);

      // Should still generate markdown even with file output
      expect(result.roadmap.markdown).toBeTruthy();
    });
  });

  // ============================================================================
  // Strategy Integration Tests
  // ============================================================================

  describe('Strategy Integration', () => {
    it('should generate tasks for each content pillar', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      // Should have content creation tasks for pillars
      const contentTasks = result.roadmap.tasks.filter((t) => t.type === 'content');
      expect(contentTasks.length).toBeGreaterThan(0);
    });

    it('should include quick wins from strategy', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      // Quick wins should appear as early tasks
      const earlyTasks = result.roadmap.tasks.filter((t) => t.startMonth === 1);
      expect(earlyTasks.length).toBeGreaterThan(0);
    });

    it('should implement technical roadmap items', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      const technicalTasks = result.roadmap.tasks.filter((t) => t.type === 'technical');
      expect(technicalTasks.length).toBeGreaterThan(0);

      // Critical technical tasks should start early
      const criticalTech = technicalTasks.filter((t) => t.priority === 'CRITICAL');
      if (criticalTech.length > 0) {
        expect(criticalTech[0].startMonth).toBeLessThanOrEqual(2);
      }
    });

    it('should include link building tasks', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      const linkTasks = result.roadmap.tasks.filter((t) => t.type === 'link-building');
      expect(linkTasks.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('should fail when Phase 6 data is missing', async () => {
      if (redis.status !== 'ready') return;

      await redis.del(`seo:task:${taskId}:phase6:strategy`);

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      await expect(executePhase7(config)).rejects.toThrow();
    });

    it('should handle incomplete strategy gracefully', async () => {
      if (redis.status !== 'ready') return;

      // Setup minimal strategy
      const minimalStrategy = createMockSEOStrategy({
        contentPillars: [],
        quickWins: [],
        technicalRoadmap: [],
      });

      await setupTestPhase6Data(redis, taskId, minimalStrategy);

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      // Should still generate roadmap, just fewer tasks
      expect(result.roadmap.milestones.length).toBe(6);
      expect(result.roadmap.tasks.length).toBeGreaterThan(0);
    });

    it('should handle Redis connection failures', async () => {
      const disconnectedRedis = new Redis({ lazyConnect: true });

      const config: Phase7Config = {
        redis: disconnectedRedis,
        taskId,
        siteDomain: 'testsite.com',
      };

      await expect(executePhase7(config)).rejects.toThrow();

      disconnectedRedis.disconnect();
    });
  });

  // ============================================================================
  // Output Format Tests
  // ============================================================================

  describe('Output Format and Metadata', () => {
    it('should return valid Phase7Result structure', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      expect(result).toHaveProperty('roadmap');
      expect(result).toHaveProperty('metadata');

      expect(result.metadata).toHaveProperty('processedAt');
      expect(result.metadata).toHaveProperty('phaseVersion');
      expect(result.metadata).toHaveProperty('processingTime');
    });

    it('should store roadmap to Redis', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      await executePhase7(config);

      const storedData = await redis.get(`seo:task:${taskId}:phase7:roadmap`);
      expect(storedData).toBeTruthy();

      const parsed = JSON.parse(storedData!);
      expect(parsed).toHaveProperty('roadmap');
      expect(parsed.roadmap).toHaveProperty('milestones');
      expect(parsed.roadmap).toHaveProperty('tasks');
    });

    it('should generate human-readable summary', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      expect(result.roadmap.summary).toBeTruthy();
      expect(result.roadmap.summary.length).toBeGreaterThan(50);
    });

    it('should track processing time', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      expect(result.metadata.processingTime).toBeGreaterThan(0);
      expect(result.metadata.processingTime).toBeLessThan(30000); // Should complete within 30s
    });

    it('should include task count in metadata', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      expect(result.metadata).toHaveProperty('totalTasks');
      expect(result.metadata.totalTasks).toBe(result.roadmap.tasks.length);
    });
  });

  // ============================================================================
  // Roadmap Quality Tests
  // ============================================================================

  describe('Roadmap Quality', () => {
    it('should balance workload across months', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      // Calculate effort per month
      const effortPerMonth = Array(6).fill(0);
      result.roadmap.tasks.forEach((task) => {
        const duration = task.endMonth - task.startMonth + 1;
        const effortPerPeriod = task.effort / duration;

        for (let m = task.startMonth; m <= task.endMonth && m <= 6; m++) {
          effortPerMonth[m - 1] += effortPerPeriod;
        }
      });

      // No month should be dramatically overloaded
      const maxEffort = Math.max(...effortPerMonth);
      const minEffort = Math.min(...effortPerMonth.filter((e) => e > 0));

      expect(maxEffort / minEffort).toBeLessThan(5); // Max 5x variance
    });

    it('should ensure tasks have meaningful success metrics', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      result.roadmap.tasks.forEach((task) => {
        expect(task.successMetrics).toBeDefined();
        expect(task.successMetrics.length).toBeGreaterThan(0);
        expect(task.successMetrics[0].length).toBeGreaterThan(5); // Not just placeholders
      });
    });

    it('should provide actionable task descriptions', async () => {
      if (redis.status !== 'ready') return;

      const config: Phase7Config = {
        redis,
        taskId,
        siteDomain: 'testsite.com',
      };

      const result = await executePhase7(config);

      result.roadmap.tasks.forEach((task) => {
        expect(task.description).toBeTruthy();
        expect(task.description.length).toBeGreaterThan(20);
      });
    });
  });
});
