/**
 * Phase 7: Roadmap Generation - SEO Site Onboarding
 *
 * @module seo/lib/phases/phase-7-roadmap
 * @description Generate 6-month actionable roadmap from strategy
 *
 * Sprint 1.4 - Loop 3 Iteration 1
 * Part of SEO Site Onboarding Design (Day 5-6)
 */

import type { Redis } from 'ioredis';
import type { SEOStrategy } from './phase-6-strategy';

/**
 * Configuration for Phase 7
 */
export interface Phase7Config {
  /** Redis client for reading Phase 6 and writing Phase 7 output */
  redis: Redis;

  /** Task ID for Redis key namespacing */
  taskId: string;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Site domain being analyzed */
  siteDomain: string;

  /** Output directory for markdown file (optional) */
  outputDir?: string;
}

/**
 * Task definition
 */
export interface Task {
  /** Unique task ID */
  id: string;

  /** Task name */
  name: string;

  /** Detailed description */
  description: string;

  /** Task type */
  type: 'technical' | 'content' | 'link-building' | 'analytics' | 'optimization';

  /** Priority level */
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

  /** Estimated effort (hours) */
  effort: number;

  /** Expected impact */
  impact: string;

  /** Month when task should be started */
  startMonth: number;

  /** Month when task should be completed */
  endMonth: number;

  /** Task dependencies (IDs of tasks that must complete first) */
  dependencies: string[];

  /** Assigned to (role or person) */
  assignedTo?: string;

  /** Success metrics */
  successMetrics: string[];

  /** Status */
  status: 'pending' | 'in-progress' | 'completed';
}

/**
 * KPI definition
 */
export interface KPI {
  /** KPI name */
  name: string;

  /** Description */
  description: string;

  /** Metric type */
  metricType: 'traffic' | 'rankings' | 'conversions' | 'engagement' | 'technical';

  /** Target value */
  target: number;

  /** Current baseline */
  baseline: number;

  /** Measurement frequency */
  frequency: 'daily' | 'weekly' | 'monthly';

  /** Target month to achieve */
  targetMonth: number;
}

/**
 * Task dependency
 */
export interface Dependency {
  /** Task ID that depends */
  taskId: string;

  /** Task ID that is required */
  dependsOn: string;

  /** Dependency type */
  type: 'blocks' | 'enhances';

  /** Reason for dependency */
  reason: string;
}

/**
 * Milestone definition
 */
export interface Milestone {
  /** Month number (1-6) */
  month: number;

  /** Milestone name */
  name: string;

  /** Focus area */
  focus: 'Foundation' | 'Content' | 'Scale' | 'Optimization';

  /** Tasks in this milestone */
  tasks: Task[];

  /** Expected impact */
  expectedImpact: string;

  /** Key deliverables */
  deliverables: string[];

  /** Success criteria */
  successCriteria: string[];
}

/**
 * Complete SEO roadmap
 */
export interface SEORoadmap {
  /** 6 monthly milestones */
  milestones: Milestone[];

  /** All tasks across timeline */
  tasks: Task[];

  /** KPIs to track */
  kpis: KPI[];

  /** Task dependencies */
  dependencies: Dependency[];

  /** Human-readable markdown document */
  markdown: string;

  /** Overall roadmap summary */
  summary: string;
}

/**
 * Phase 7 result
 */
export interface Phase7Result {
  /** SEO roadmap */
  roadmap: SEORoadmap;

  /** Processing metadata */
  metadata: {
    processedAt: Date;
    phaseVersion: string;
    processingTime: number;
    totalTasks: number;
    totalKPIs: number;
  };
}

/**
 * Execute Phase 7: Roadmap Generation
 *
 * @param config - Phase 7 configuration
 * @returns 6-month SEO roadmap with tasks, milestones, and KPIs
 */
export async function executePhase7(config: Phase7Config): Promise<Phase7Result> {
  const startTime = Date.now();
  const { redis, taskId, siteDomain, verbose } = config;

  if (verbose) {
    console.log(`[Phase 7] Starting roadmap generation for ${siteDomain}`);
  }

  // Step 1: Load Phase 6 strategy from Redis
  const strategyKey = `seo:task:${taskId}:phase6:strategy`;
  const strategyData = await redis.get(strategyKey);

  if (!strategyData) {
    throw new Error('Phase 6 strategy not found. Run Phase 6 first.');
  }

  const strategy: SEOStrategy = JSON.parse(strategyData);

  // Step 2: Generate tasks from strategy
  const tasks = await generateTasks(strategy, verbose);

  // Step 3: Define KPIs
  const kpis = await defineKPIs(strategy, verbose);

  // Step 4: Extract dependencies
  const dependencies = extractDependencies(tasks);

  // Step 5: Create monthly milestones
  const milestones = await createMilestones(tasks, strategy, verbose);

  // Step 6: Generate markdown document
  const markdown = generateMarkdown(siteDomain, milestones, tasks, kpis, strategy);

  // Step 7: Create summary
  const summary = generateRoadmapSummary(milestones, tasks, kpis);

  const roadmap: SEORoadmap = {
    milestones,
    tasks,
    kpis,
    dependencies,
    markdown,
    summary,
  };

  // Step 8: Save roadmap to Redis
  const roadmapKey = `seo:task:${taskId}:phase7:roadmap`;
  await redis.set(roadmapKey, JSON.stringify(roadmap), 'EX', 7 * 24 * 3600); // 7 day TTL

  // Step 9: Save markdown to filesystem (optional)
  if (config.outputDir) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const markdownPath = path.join(config.outputDir, `seo-roadmap-${siteDomain}.md`);
    await fs.writeFile(markdownPath, markdown, 'utf-8');
    if (verbose) {
      console.log(`[Phase 7] Markdown saved to ${markdownPath}`);
    }
  }

  const result: Phase7Result = {
    roadmap,
    metadata: {
      processedAt: new Date(),
      phaseVersion: '1.0.0',
      processingTime: Date.now() - startTime,
      totalTasks: tasks.length,
      totalKPIs: kpis.length,
    },
  };

  if (verbose) {
    console.log(`[Phase 7] Roadmap created with ${milestones.length} milestones, ${tasks.length} tasks`);
  }

  return result;
}

/**
 * Generate all tasks from strategy
 */
async function generateTasks(strategy: SEOStrategy, verbose?: boolean): Promise<Task[]> {
  const tasks: Task[] = [];
  let taskCounter = 1;

  // Month 1: Foundation tasks
  // Technical fixes
  for (const techTask of strategy.technicalRoadmap.filter((t) => t.timeline === 'Week 1')) {
    tasks.push({
      id: `TASK-${String(taskCounter++).padStart(3, '0')}`,
      name: techTask.name,
      description: techTask.description,
      type: 'technical',
      priority: techTask.priority,
      effort: techTask.effort,
      impact: techTask.impact,
      startMonth: 1,
      endMonth: 1,
      dependencies: [],
      assignedTo: 'Technical Team',
      successMetrics: ['Issue resolved', 'Search Console validation passed'],
      status: 'pending',
    });
  }

  // Quick wins
  for (const quickWin of strategy.quickWins.slice(0, 5)) {
    const month = quickWin.type === 'technical' ? 1 : 2;
    tasks.push({
      id: `TASK-${String(taskCounter++).padStart(3, '0')}`,
      name: quickWin.name,
      description: quickWin.description,
      type: quickWin.type === 'technical' ? 'technical' : 'optimization',
      priority: quickWin.priorityScore > 2 ? 'HIGH' : 'MEDIUM',
      effort: quickWin.effort,
      impact: `Expected lift: ${quickWin.expectedLift}% traffic`,
      startMonth: month,
      endMonth: month,
      dependencies: [],
      assignedTo: quickWin.type === 'technical' ? 'Technical Team' : 'Content Team',
      successMetrics: [`${quickWin.expectedLift}% traffic increase`, 'Implementation complete'],
      status: 'pending',
    });
  }

  // Analytics setup
  tasks.push({
    id: `TASK-${String(taskCounter++).padStart(3, '0')}`,
    name: 'Set up comprehensive analytics tracking',
    description: 'Configure GA4, Search Console, and custom dashboards',
    type: 'analytics',
    priority: 'HIGH',
    effort: 8,
    impact: 'Foundation for data-driven optimization',
    startMonth: 1,
    endMonth: 1,
    dependencies: [],
    assignedTo: 'Analytics Team',
    successMetrics: ['All tracking configured', 'Custom dashboard created', 'Weekly reports automated'],
    status: 'pending',
  });

  // Month 2-3: Content foundation
  for (let i = 0; i < strategy.contentPillars.length; i++) {
    const pillar = strategy.contentPillars[i];
    const startMonth = 2 + Math.floor(i / 2);
    const articlesPerMonth = Math.ceil(pillar.articleCount / 3);

    tasks.push({
      id: `TASK-${String(taskCounter++).padStart(3, '0')}`,
      name: `Create ${pillar.name} pillar content`,
      description: `Develop ${pillar.articleCount} articles covering ${pillar.targetKeywords.length} target keywords`,
      type: 'content',
      priority: pillar.priority,
      effort: pillar.articleCount * 4, // 4 hours per article
      impact: `${pillar.trafficPotential} monthly traffic potential`,
      startMonth,
      endMonth: startMonth + 1,
      dependencies: ['TASK-001'], // Analytics setup
      assignedTo: 'Content Team',
      successMetrics: [
        `${pillar.articleCount} articles published`,
        `${pillar.targetKeywords.length} keywords targeted`,
        'Internal linking implemented',
      ],
      status: 'pending',
    });
  }

  // Month 2-3: Technical improvements
  for (const techTask of strategy.technicalRoadmap.filter((t) => t.timeline === 'Week 2-3')) {
    tasks.push({
      id: `TASK-${String(taskCounter++).padStart(3, '0')}`,
      name: techTask.name,
      description: techTask.description,
      type: 'technical',
      priority: techTask.priority,
      effort: techTask.effort,
      impact: techTask.impact,
      startMonth: 2,
      endMonth: 2,
      dependencies: [],
      assignedTo: 'Technical Team',
      successMetrics: ['Implementation complete', 'Performance metrics improved'],
      status: 'pending',
    });
  }

  // Month 4-6: Link building
  for (let month = 4; month <= 6; month++) {
    for (const tactic of strategy.linkBuildingStrategy.tactics.filter((t) => t.priority === 'HIGH')) {
      tasks.push({
        id: `TASK-${String(taskCounter++).padStart(3, '0')}`,
        name: `Execute ${tactic.name} (Month ${month})`,
        description: tactic.description,
        type: 'link-building',
        priority: 'HIGH',
        effort: 12,
        impact: `${tactic.expectedLinksPerMonth} quality backlinks`,
        startMonth: month,
        endMonth: month,
        dependencies: [], // Link building starts after content is published
        assignedTo: 'SEO Team',
        successMetrics: [
          `${tactic.expectedLinksPerMonth} new backlinks acquired`,
          'Domain Rating increase',
        ],
        status: 'pending',
      });
    }
  }

  // Month 4-6: Content expansion
  tasks.push({
    id: `TASK-${String(taskCounter++).padStart(3, '0')}`,
    name: 'Expand content clusters',
    description: 'Create supporting articles and update existing content',
    type: 'content',
    priority: 'MEDIUM',
    effort: 40,
    impact: 'Strengthen topical authority',
    startMonth: 4,
    endMonth: 6,
    dependencies: [], // Depends on initial pillar content
    assignedTo: 'Content Team',
    successMetrics: ['20+ supporting articles published', 'Internal linking expanded'],
    status: 'pending',
  });

  // Month 5-6: Optimization
  tasks.push({
    id: `TASK-${String(taskCounter++).padStart(3, '0')}`,
    name: 'Optimize top-performing pages',
    description: 'A/B test meta tags, improve CTR, enhance content',
    type: 'optimization',
    priority: 'MEDIUM',
    effort: 16,
    impact: '10-20% CTR improvement',
    startMonth: 5,
    endMonth: 6,
    dependencies: ['TASK-001'], // Analytics setup
    assignedTo: 'SEO Team',
    successMetrics: ['CTR improved by 15%', 'Featured snippets acquired'],
    status: 'pending',
  });

  if (verbose) {
    console.log(`[Phase 7] Generated ${tasks.length} tasks`);
  }

  return tasks;
}

/**
 * Define KPIs to track
 */
async function defineKPIs(strategy: SEOStrategy, verbose?: boolean): Promise<KPI[]> {
  const kpis: KPI[] = [];

  // Traffic KPIs
  kpis.push({
    name: 'Organic Traffic',
    description: 'Monthly organic sessions from search engines',
    metricType: 'traffic',
    target: strategy.projections.sixMonth.organicTraffic,
    baseline: 0,
    frequency: 'weekly',
    targetMonth: 6,
  });

  kpis.push({
    name: 'Organic Traffic (12-month)',
    description: 'Monthly organic sessions at 12 months',
    metricType: 'traffic',
    target: strategy.projections.twelveMonth.organicTraffic,
    baseline: 0,
    frequency: 'monthly',
    targetMonth: 12,
  });

  // Rankings KPIs
  kpis.push({
    name: 'Keywords in Top 10',
    description: 'Number of keywords ranking in positions 1-10',
    metricType: 'rankings',
    target: strategy.projections.sixMonth.expectedRankings.top10,
    baseline: 0,
    frequency: 'weekly',
    targetMonth: 6,
  });

  kpis.push({
    name: 'Keywords in Top 3',
    description: 'Number of keywords ranking in positions 1-3',
    metricType: 'rankings',
    target: strategy.projections.sixMonth.expectedRankings.top3,
    baseline: 0,
    frequency: 'weekly',
    targetMonth: 6,
  });

  // Technical KPIs
  kpis.push({
    name: 'Core Web Vitals Score',
    description: 'Percentage of pages passing Core Web Vitals',
    metricType: 'technical',
    target: 90,
    baseline: 50,
    frequency: 'monthly',
    targetMonth: 3,
  });

  kpis.push({
    name: 'Crawl Errors',
    description: 'Number of crawl errors in Search Console',
    metricType: 'technical',
    target: 0,
    baseline: 50,
    frequency: 'weekly',
    targetMonth: 2,
  });

  // Engagement KPIs
  kpis.push({
    name: 'Average Session Duration',
    description: 'Average time users spend on site',
    metricType: 'engagement',
    target: 180,
    baseline: 90,
    frequency: 'weekly',
    targetMonth: 6,
  });

  kpis.push({
    name: 'Bounce Rate',
    description: 'Percentage of single-page sessions',
    metricType: 'engagement',
    target: 45,
    baseline: 65,
    frequency: 'weekly',
    targetMonth: 6,
  });

  // Link building KPIs
  kpis.push({
    name: 'Referring Domains',
    description: 'Number of unique domains linking to site',
    metricType: 'traffic',
    target: 100,
    baseline: 20,
    frequency: 'monthly',
    targetMonth: 6,
  });

  if (verbose) {
    console.log(`[Phase 7] Defined ${kpis.length} KPIs`);
  }

  return kpis;
}

/**
 * Extract task dependencies
 */
function extractDependencies(tasks: Task[]): Dependency[] {
  const dependencies: Dependency[] = [];

  for (const task of tasks) {
    for (const depId of task.dependencies) {
      const dependentTask = tasks.find((t) => t.id === depId);
      if (dependentTask) {
        dependencies.push({
          taskId: task.id,
          dependsOn: depId,
          type: 'blocks',
          reason: `${task.name} requires ${dependentTask.name} to be completed first`,
        });
      }
    }
  }

  return dependencies;
}

/**
 * Create monthly milestones
 */
async function createMilestones(
  tasks: Task[],
  strategy: SEOStrategy,
  verbose?: boolean
): Promise<Milestone[]> {
  const milestones: Milestone[] = [];

  // Month 1: Foundation
  const month1Tasks = tasks.filter((t) => t.startMonth === 1);
  milestones.push({
    month: 1,
    name: 'Foundation Month',
    focus: 'Foundation',
    tasks: month1Tasks,
    expectedImpact: 'Technical foundation established, analytics configured, critical issues resolved',
    deliverables: [
      'Technical audit completed',
      'Critical issues fixed',
      'Analytics tracking configured',
      'First 3-5 quick wins implemented',
    ],
    successCriteria: [
      'Zero critical technical issues',
      'All tracking systems operational',
      'Baseline metrics captured',
    ],
  });

  // Month 2-3: Content Foundation
  const month2Tasks = tasks.filter((t) => t.startMonth === 2);
  const month3Tasks = tasks.filter((t) => t.startMonth === 3);
  milestones.push({
    month: 2,
    name: 'Content Launch',
    focus: 'Content',
    tasks: month2Tasks,
    expectedImpact: 'First content pillars published, initial SEO momentum building',
    deliverables: [
      'First 2 content pillars published',
      'Schema markup implemented',
      'Core Web Vitals optimized',
    ],
    successCriteria: [
      '15+ high-quality articles published',
      'Internal linking structure established',
      'First rankings appearing',
    ],
  });

  milestones.push({
    month: 3,
    name: 'Content Expansion',
    focus: 'Content',
    tasks: month3Tasks,
    expectedImpact: 'Remaining pillars published, topical authority established',
    deliverables: [
      'All content pillars completed',
      'Comprehensive internal linking',
      'Content refresh strategy defined',
    ],
    successCriteria: [
      '40+ articles published',
      'Multiple keywords in top 20',
      'Featured snippet acquisitions',
    ],
  });

  // Month 4-6: Scale
  const month4Tasks = tasks.filter((t) => t.startMonth === 4);
  const month5Tasks = tasks.filter((t) => t.startMonth === 5);
  const month6Tasks = tasks.filter((t) => t.startMonth === 6);

  milestones.push({
    month: 4,
    name: 'Link Building Launch',
    focus: 'Scale',
    tasks: month4Tasks,
    expectedImpact: 'Systematic link acquisition, content cluster expansion',
    deliverables: [
      'Link building campaigns launched',
      '20+ quality backlinks acquired',
      '15+ supporting articles published',
    ],
    successCriteria: [
      'Domain Rating increased by 5+',
      'Traffic growth accelerating',
      'Top 10 rankings increasing',
    ],
  });

  milestones.push({
    month: 5,
    name: 'Optimization Phase',
    focus: 'Optimization',
    tasks: month5Tasks,
    expectedImpact: 'Performance optimization, CTR improvements, ranking gains',
    deliverables: [
      'Top pages optimized',
      'A/B tests running',
      'Content refresh pipeline active',
    ],
    successCriteria: [
      '15% CTR improvement',
      '50% traffic increase vs baseline',
      'Multiple page 1 rankings',
    ],
  });

  milestones.push({
    month: 6,
    name: 'Momentum & Scale',
    focus: 'Scale',
    tasks: month6Tasks,
    expectedImpact: 'Sustained growth, authority established, systematic scaling',
    deliverables: [
      '100+ total backlinks',
      '60+ total articles',
      'Optimization framework implemented',
    ],
    successCriteria: [
      'Traffic targets achieved',
      'Top 3 rankings for priority keywords',
      'Sustainable growth system established',
    ],
  });

  if (verbose) {
    console.log(`[Phase 7] Created ${milestones.length} milestones`);
  }

  return milestones;
}

/**
 * Generate markdown document
 */
function generateMarkdown(
  siteDomain: string,
  milestones: Milestone[],
  tasks: Task[],
  kpis: KPI[],
  strategy: SEOStrategy
): string {
  const md: string[] = [];

  md.push(`# SEO Roadmap: ${siteDomain}`);
  md.push('');
  md.push(`**Generated:** ${new Date().toISOString().split('T')[0]}`);
  md.push('');
  md.push('---');
  md.push('');

  // Executive Summary
  md.push('## Executive Summary');
  md.push('');
  md.push(strategy.summary);
  md.push('');
  md.push('### 6-Month Projections');
  md.push('');
  md.push(`- **Organic Traffic:** ${strategy.projections.sixMonth.organicTraffic.toLocaleString()} monthly visitors`);
  md.push(`- **Top 3 Rankings:** ${strategy.projections.sixMonth.expectedRankings.top3} keywords`);
  md.push(`- **Top 10 Rankings:** ${strategy.projections.sixMonth.expectedRankings.top10} keywords`);
  md.push(`- **Confidence:** ${(strategy.projections.sixMonth.confidence * 100).toFixed(0)}%`);
  md.push('');

  // Monthly Milestones
  md.push('---');
  md.push('');
  md.push('## Monthly Milestones');
  md.push('');

  for (const milestone of milestones) {
    md.push(`### Month ${milestone.month}: ${milestone.name}`);
    md.push('');
    md.push(`**Focus:** ${milestone.focus}`);
    md.push('');
    md.push(`**Expected Impact:** ${milestone.expectedImpact}`);
    md.push('');
    md.push('**Deliverables:**');
    md.push('');
    for (const deliverable of milestone.deliverables) {
      md.push(`- ${deliverable}`);
    }
    md.push('');
    md.push('**Success Criteria:**');
    md.push('');
    for (const criteria of milestone.successCriteria) {
      md.push(`- ${criteria}`);
    }
    md.push('');
    md.push(`**Tasks (${milestone.tasks.length}):**`);
    md.push('');

    // Group tasks by type
    const tasksByType = groupBy(milestone.tasks, (t) => t.type);
    for (const [type, typeTasks] of Object.entries(tasksByType)) {
      md.push(`#### ${capitalizeFirst(type.replace(/-/g, ' '))}`);
      md.push('');
      for (const task of typeTasks) {
        md.push(`- **${task.name}** (${task.priority}) - ${task.effort}h`);
        md.push(`  - ${task.description}`);
        md.push(`  - Impact: ${task.impact}`);
      }
      md.push('');
    }
  }

  // KPIs
  md.push('---');
  md.push('');
  md.push('## Key Performance Indicators (KPIs)');
  md.push('');

  const kpisByType = groupBy(kpis, (k) => k.metricType);
  for (const [type, typeKPIs] of Object.entries(kpisByType)) {
    md.push(`### ${capitalizeFirst(type)} Metrics`);
    md.push('');
    md.push('| KPI | Baseline | Target | Target Month | Frequency |');
    md.push('|-----|----------|--------|--------------|-----------|');
    for (const kpi of typeKPIs) {
      md.push(`| ${kpi.name} | ${kpi.baseline.toLocaleString()} | ${kpi.target.toLocaleString()} | Month ${kpi.targetMonth} | ${capitalizeFirst(kpi.frequency)} |`);
    }
    md.push('');
  }

  // Content Strategy
  md.push('---');
  md.push('');
  md.push('## Content Strategy');
  md.push('');
  md.push(`**Total Pillars:** ${strategy.contentPillars.length}`);
  md.push('');

  for (const pillar of strategy.contentPillars) {
    md.push(`### ${pillar.name} (${pillar.priority})`);
    md.push('');
    md.push(pillar.description);
    md.push('');
    md.push(`- **Article Count:** ${pillar.articleCount}`);
    md.push(`- **Traffic Potential:** ${pillar.trafficPotential.toLocaleString()}/month`);
    md.push(`- **Target Keywords:** ${pillar.targetKeywords.slice(0, 5).join(', ')}${pillar.targetKeywords.length > 5 ? '...' : ''}`);
    md.push(`- **Content Types:** ${pillar.contentTypes.join(', ')}`);
    md.push('');
  }

  // Link Building
  md.push('---');
  md.push('');
  md.push('## Link Building Strategy');
  md.push('');
  md.push('### Tactics');
  md.push('');

  for (const tactic of strategy.linkBuildingStrategy.tactics) {
    md.push(`#### ${tactic.name} (${tactic.priority})`);
    md.push('');
    md.push(tactic.description);
    md.push('');
    md.push(`- **Difficulty:** ${tactic.difficulty}/10`);
    md.push(`- **Expected Links/Month:** ${tactic.expectedLinksPerMonth}`);
    md.push('');
  }

  md.push('### Monthly Targets');
  md.push('');
  md.push('| Month | Target Links | Target DR |');
  md.push('|-------|--------------|-----------|');
  for (const target of strategy.linkBuildingStrategy.monthlyTargets.slice(0, 6)) {
    md.push(`| ${target.month} | ${target.targetLinks} | ${target.targetDR}+ |`);
  }
  md.push('');

  // Quick Wins
  md.push('---');
  md.push('');
  md.push('## Quick Wins');
  md.push('');

  for (const qw of strategy.quickWins.slice(0, 10)) {
    md.push(`### ${qw.name}`);
    md.push('');
    md.push(qw.description);
    md.push('');
    md.push(`- **Effort:** ${qw.effort}/10 | **Impact:** ${qw.impact}/10 | **Priority Score:** ${qw.priorityScore.toFixed(1)}`);
    md.push(`- **Timeline:** ${qw.estimatedDays} days`);
    md.push(`- **Expected Lift:** ${qw.expectedLift || 0}%`);
    md.push('');
    md.push('**Steps:**');
    md.push('');
    for (let i = 0; i < qw.steps.length; i++) {
      md.push(`${i + 1}. ${qw.steps[i]}`);
    }
    md.push('');
  }

  md.push('---');
  md.push('');
  md.push('*This roadmap was generated using AI-powered SEO intelligence and industry pattern analysis.*');
  md.push('');

  return md.join('\n');
}

/**
 * Generate roadmap summary
 */
function generateRoadmapSummary(milestones: Milestone[], tasks: Task[], kpis: KPI[]): string {
  const tasksByType = groupBy(tasks, (t) => t.type);
  const types = Object.keys(tasksByType)
    .map((t) => `${tasksByType[t].length} ${t}`)
    .join(', ');

  return `6-month SEO roadmap with ${milestones.length} milestones, ${tasks.length} tasks (${types}), and ${kpis.length} KPIs. Focus progression: Foundation (Month 1) → Content (Months 2-3) → Scale & Optimization (Months 4-6).`;
}

/**
 * Group array items by key function
 */
function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
  }
  return groups;
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
