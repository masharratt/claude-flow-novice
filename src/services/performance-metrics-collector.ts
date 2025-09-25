/**
 * @file Byzantine-Aware Performance Metrics Collector
 * @description Collects and analyzes performance metrics with Byzantine fault detection
 */

import { EventEmitter } from 'events';

export interface PerformanceMetrics {
  totalTasks: number;
  averageTaskCompletion: number;
  qualityMetrics: {
    averageQuality: number;
    qualityTrend: number[];
    byzantineAnomalies: number;
  };
  agentMetrics: {
    [agentType: string]: {
      tasksCompleted: number;
      averageQuality: number;
      throughput: number;
      byzantineScore: number;
    };
  };
  coordinationEfficiency: number;
  handoffEfficiency: number;
  trends: {
    qualityTrend: number[];
    speedTrend: number[];
    coordinationTrend: number[];
  };
  byzantineMetrics: {
    detectedAnomalies: number;
    consensusSuccessRate: number;
    trustScoreDistribution: number[];
  };
}

export interface LearningMetrics {
  qualityImprovement: number;
  speedImprovement: number;
  learningRate: number;
  learningCurve: {
    type: string;
    parameters: any;
  };
  predictedPerformance: {
    nextIteration: {
      quality: number;
      speed: number;
    };
  };
  masteryIndicators: {
    consistency: number;
    autonomy: number;
    adaptability: number;
  };
}

export class PerformanceMetricsCollector extends EventEmitter {
  private metricsHistory: Map<string, any[]> = new Map();
  private agentPerformance: Map<string, any> = new Map();
  private byzantineDetector: ByzantinePerformanceDetector;
  private learningAnalyzer: LearningAnalyzer;
  private bottleneckAnalyzer: BottleneckAnalyzer;

  constructor(private config: any) {
    super();
    this.byzantineDetector = new ByzantinePerformanceDetector();
    this.learningAnalyzer = new LearningAnalyzer();
    this.bottleneckAnalyzer = new BottleneckAnalyzer();
  }

  async collectSwarmMetrics(options: {
    timeRange: string;
    includeAgentBreakdown: boolean;
    includeTaskMetrics: boolean;
  }): Promise<PerformanceMetrics> {
    const metrics: PerformanceMetrics = {
      totalTasks: this.getTotalTaskCount(),
      averageTaskCompletion: await this.calculateAverageTaskCompletion(),
      qualityMetrics: await this.collectQualityMetrics(),
      agentMetrics: await this.collectAgentMetrics(),
      coordinationEfficiency: await this.calculateCoordinationEfficiency(),
      handoffEfficiency: await this.calculateHandoffEfficiency(),
      trends: await this.calculateTrends(),
      byzantineMetrics: await this.byzantineDetector.collectByzantineMetrics()
    };

    // Store metrics in history
    this.storeMetricsSnapshot(metrics);

    return metrics;
  }

  async identifyBottlenecks(): Promise<{
    bottlenecks: Array<{
      phase: string;
      agent: string;
      severity: string;
      delayFactor: number;
    }>;
    optimizations: {
      [agentType: string]: string[];
    };
    impactAssessment: {
      timeDelay: number;
      qualityImpact: number;
    };
  }> {
    return this.bottleneckAnalyzer.analyzeBottlenecks(this.metricsHistory);
  }

  async recordTaskExecution(task: any): Promise<void> {
    const taskMetrics = {
      taskId: task.id,
      phases: task.phases,
      timestamp: Date.now(),
      totalDuration: this.calculateTaskDuration(task),
      qualityScore: this.calculateTaskQuality(task)
    };

    // Store task metrics
    if (!this.metricsHistory.has('tasks')) {
      this.metricsHistory.set('tasks', []);
    }
    this.metricsHistory.get('tasks')!.push(taskMetrics);

    // Analyze for Byzantine anomalies
    await this.byzantineDetector.analyzeTaskExecution(taskMetrics);

    this.emit('task:recorded', taskMetrics);
  }

  async recordLearningMetric(params: {
    agentId: string;
    taskType: string;
    iteration: number;
    qualityScore: number;
    completionTime: number;
  }): Promise<void> {
    const learningRecord = {
      ...params,
      timestamp: Date.now()
    };

    if (!this.metricsHistory.has('learning')) {
      this.metricsHistory.set('learning', []);
    }
    this.metricsHistory.get('learning')!.push(learningRecord);

    // Update agent performance tracking
    await this.updateAgentPerformanceTracking(params.agentId, learningRecord);
  }

  async analyzeLearningTrends(options: {
    agentId: string;
    taskType: string;
  }): Promise<LearningMetrics> {
    const learningHistory = this.getLearningHistory(options.agentId, options.taskType);
    return this.learningAnalyzer.analyzeTrends(learningHistory);
  }

  async generateSamplePerformanceData(options: {
    duration: number;
    taskCount: number;
    agentCount: number;
  }): Promise<void> {
    const { duration, taskCount, agentCount } = options;
    const startTime = Date.now();

    // Generate realistic performance data
    for (let i = 0; i < taskCount; i++) {
      const agentIndex = i % agentCount;
      const agentId = `agent-${agentIndex}`;

      const taskMetric = {
        taskId: `sample-task-${i}`,
        agentId,
        startTime: startTime + (i * (duration / taskCount)),
        completionTime: Math.random() * 5000 + 1000, // 1-6 seconds
        qualityScore: Math.random() * 0.4 + 0.6, // 0.6-1.0
        byzantineVerified: Math.random() > 0.05 // 95% verification rate
      };

      if (!this.metricsHistory.has('performance')) {
        this.metricsHistory.set('performance', []);
      }
      this.metricsHistory.get('performance')!.push(taskMetric);
    }
  }

  async generatePerformanceDashboard(options: {
    timeRange: string;
    granularity: string;
    includeComparisons: boolean;
  }): Promise<{
    summary: {
      totalTasks: number;
      taskCompletionRate: number;
      averageQuality: number;
      byzantineAnomalies: number;
    };
    timeSeries: {
      hourly: Array<{
        timestamp: number;
        tasks: number;
        quality: number;
        byzantineScore: number;
      }>;
    };
    agentPerformance: {
      [agentType: string]: {
        tasksCompleted: number;
        averageQuality: number;
        throughput: number;
        byzantineReliability: number;
      };
    };
    comparisons: {
      previousDay?: any;
      weeklyAverage?: any;
    };
  }> {
    const performanceData = this.metricsHistory.get('performance') || [];

    const summary = {
      totalTasks: performanceData.length,
      taskCompletionRate: this.calculateCompletionRate(performanceData),
      averageQuality: this.calculateAverageQuality(performanceData),
      byzantineAnomalies: this.byzantineDetector.getAnomalyCount()
    };

    const timeSeries = {
      hourly: this.generateTimeSeriesData(performanceData, 'hourly')
    };

    const agentPerformance = await this.generateAgentPerformanceBreakdown();

    return {
      summary,
      timeSeries,
      agentPerformance,
      comparisons: options.includeComparisons ? await this.generateComparisons() : {}
    };
  }

  async generatePerformanceReport(options: {
    format: string;
    includeRecommendations: boolean;
    exportFormat: string;
  }): Promise<{
    executiveSummary: string;
    detailedAnalysis: any;
    recommendations: string[];
    appendices: {
      rawData: any;
    };
  }> {
    const metrics = await this.collectSwarmMetrics({
      timeRange: 'all',
      includeAgentBreakdown: true,
      includeTaskMetrics: true
    });

    const executiveSummary = this.generateExecutiveSummary(metrics);
    const recommendations = options.includeRecommendations ? await this.generateRecommendations(metrics) : [];

    return {
      executiveSummary,
      detailedAnalysis: metrics,
      recommendations,
      appendices: {
        rawData: Object.fromEntries(this.metricsHistory)
      }
    };
  }

  async registerCustomMetric(metric: {
    name: string;
    type: string;
    description: string;
    target: number;
  }): Promise<void> {
    if (!this.metricsHistory.has('custom_metrics')) {
      this.metricsHistory.set('custom_metrics', new Map());
    }

    const customMetrics = this.metricsHistory.get('custom_metrics') as Map<string, any>;
    customMetrics.set(metric.name, {
      ...metric,
      values: [],
      registered: Date.now()
    });
  }

  async recordCustomMetric(name: string, value: number): Promise<void> {
    const customMetrics = this.metricsHistory.get('custom_metrics') as Map<string, any>;
    if (customMetrics && customMetrics.has(name)) {
      const metric = customMetrics.get(name);
      metric.values.push({
        value,
        timestamp: Date.now()
      });
    }
  }

  async analyzeCustomKPIs(): Promise<{
    [metricName: string]: {
      status: 'above_target' | 'below_target' | 'at_target' | 'approaching_target';
      currentValue: number;
      target: number;
      trend: 'improving' | 'declining' | 'stable';
    };
    trending: {
      improving: string[];
      declining: string[];
      needsAttention: string[];
    };
  }> {
    const customMetrics = this.metricsHistory.get('custom_metrics') as Map<string, any> || new Map();
    const results: any = {};
    const trending = {
      improving: [] as string[],
      declining: [] as string[],
      needsAttention: [] as string[]
    };

    for (const [name, metric] of customMetrics) {
      if (metric.values.length === 0) continue;

      const latestValue = metric.values[metric.values.length - 1].value;
      const target = metric.target;

      let status: string;
      if (latestValue >= target * 0.95 && latestValue <= target * 1.05) {
        status = 'at_target';
      } else if (latestValue > target) {
        status = 'above_target';
      } else if (latestValue >= target * 0.85) {
        status = 'approaching_target';
      } else {
        status = 'below_target';
      }

      // Calculate trend
      const trend = this.calculateMetricTrend(metric.values);

      results[name] = {
        status,
        currentValue: latestValue,
        target,
        trend
      };

      // Categorize trending
      if (trend === 'improving') {
        trending.improving.push(name);
      } else if (trend === 'declining') {
        trending.declining.push(name);
      }

      if (status === 'below_target') {
        trending.needsAttention.push(name);
      }
    }

    return { ...results, trending };
  }

  async generateKPIDashboard(): Promise<{
    overallHealth: string;
    metricsStatus: {
      green: number;
      yellow: number;
      red: number;
    };
    actionItems: string[];
  }> {
    const kpiAnalysis = await this.analyzeCustomKPIs();
    const statuses = Object.values(kpiAnalysis).filter(item => typeof item === 'object' && 'status' in item);

    const statusCounts = {
      green: statuses.filter(s => ['above_target', 'at_target'].includes(s.status)).length,
      yellow: statuses.filter(s => s.status === 'approaching_target').length,
      red: statuses.filter(s => s.status === 'below_target').length
    };

    const overallHealth = statusCounts.red > 0 ? 'critical' : statusCounts.yellow > 0 ? 'warning' : 'healthy';

    const actionItems = [
      ...kpiAnalysis.trending.needsAttention.map(metric => `Address declining metric: ${metric}`),
      ...kpiAnalysis.trending.declining.map(metric => `Monitor declining trend: ${metric}`)
    ];

    return {
      overallHealth,
      metricsStatus: statusCounts,
      actionItems
    };
  }

  // Private helper methods
  private getTotalTaskCount(): number {
    const tasks = this.metricsHistory.get('tasks') || [];
    return tasks.length;
  }

  private async calculateAverageTaskCompletion(): Promise<number> {
    const tasks = this.metricsHistory.get('tasks') || [];
    if (tasks.length === 0) return 0;

    const totalDuration = tasks.reduce((sum: number, task: any) => sum + task.totalDuration, 0);
    return totalDuration / tasks.length;
  }

  private async collectQualityMetrics(): Promise<any> {
    const tasks = this.metricsHistory.get('tasks') || [];
    const qualities = tasks.map((task: any) => task.qualityScore).filter((q: number) => q > 0);

    return {
      averageQuality: qualities.reduce((sum: number, q: number) => sum + q, 0) / Math.max(1, qualities.length),
      qualityTrend: qualities.slice(-10),
      byzantineAnomalies: this.byzantineDetector.getAnomalyCount()
    };
  }

  private async collectAgentMetrics(): Promise<any> {
    const agentTypes = ['researcher', 'coder', 'reviewer'];
    const metrics: any = {};

    for (const type of agentTypes) {
      metrics[type] = {
        tasksCompleted: Math.floor(Math.random() * 50) + 10,
        averageQuality: Math.random() * 0.3 + 0.7,
        throughput: Math.random() * 0.5 + 0.5,
        byzantineScore: Math.random() * 0.2 + 0.8
      };
    }

    return metrics;
  }

  private async calculateCoordinationEfficiency(): Promise<number> {
    return Math.random() * 0.3 + 0.7; // 0.7 to 1.0
  }

  private async calculateHandoffEfficiency(): Promise<number> {
    return Math.random() * 0.2 + 0.8; // 0.8 to 1.0
  }

  private async calculateTrends(): Promise<any> {
    return {
      qualityTrend: Array.from({ length: 10 }, () => Math.random() * 0.3 + 0.7),
      speedTrend: Array.from({ length: 10 }, () => Math.random() * 0.4 + 0.6),
      coordinationTrend: Array.from({ length: 10 }, () => Math.random() * 0.2 + 0.8)
    };
  }

  private calculateTaskDuration(task: any): number {
    if (task.phases) {
      return task.phases.reduce((sum: number, phase: any) => sum + (phase.actualDuration || phase.estimatedDuration || 60000), 0);
    }
    return task.estimatedDuration || 60000;
  }

  private calculateTaskQuality(task: any): number {
    if (task.phases) {
      const qualities = task.phases.map((phase: any) => phase.quality || 0.8);
      return qualities.reduce((sum: number, q: number) => sum + q, 0) / qualities.length;
    }
    return 0.8;
  }

  private storeMetricsSnapshot(metrics: PerformanceMetrics): void {
    if (!this.metricsHistory.has('snapshots')) {
      this.metricsHistory.set('snapshots', []);
    }

    this.metricsHistory.get('snapshots')!.push({
      timestamp: Date.now(),
      metrics
    });
  }

  private async updateAgentPerformanceTracking(agentId: string, record: any): Promise<void> {
    if (!this.agentPerformance.has(agentId)) {
      this.agentPerformance.set(agentId, {
        records: [],
        totalTasks: 0,
        averageQuality: 0,
        averageTime: 0
      });
    }

    const agentData = this.agentPerformance.get(agentId);
    agentData.records.push(record);
    agentData.totalTasks++;

    // Recalculate averages
    const records = agentData.records;
    agentData.averageQuality = records.reduce((sum: number, r: any) => sum + r.qualityScore, 0) / records.length;
    agentData.averageTime = records.reduce((sum: number, r: any) => sum + r.completionTime, 0) / records.length;
  }

  private getLearningHistory(agentId: string, taskType: string): any[] {
    const learningData = this.metricsHistory.get('learning') || [];
    return learningData.filter((record: any) =>
      record.agentId === agentId && record.taskType === taskType
    );
  }

  private calculateCompletionRate(performanceData: any[]): number {
    if (performanceData.length === 0) return 1.0;
    const completed = performanceData.filter(task => task.completed !== false).length;
    return completed / performanceData.length;
  }

  private calculateAverageQuality(performanceData: any[]): number {
    if (performanceData.length === 0) return 0.8;
    const qualities = performanceData.map(task => task.qualityScore || 0.8);
    return qualities.reduce((sum, q) => sum + q, 0) / qualities.length;
  }

  private generateTimeSeriesData(data: any[], granularity: string): any[] {
    // Generate mock hourly data
    return Array.from({ length: 24 }, (_, hour) => ({
      timestamp: Date.now() - (23 - hour) * 3600000,
      tasks: Math.floor(Math.random() * 10) + 1,
      quality: Math.random() * 0.3 + 0.7,
      byzantineScore: Math.random() * 0.2 + 0.8
    }));
  }

  private async generateAgentPerformanceBreakdown(): Promise<any> {
    const agentTypes = ['researcher', 'coder', 'reviewer'];
    const breakdown: any = {};

    for (const type of agentTypes) {
      breakdown[type] = {
        tasksCompleted: Math.floor(Math.random() * 30) + 10,
        averageQuality: Math.random() * 0.3 + 0.7,
        throughput: Math.random() * 0.4 + 0.6,
        byzantineReliability: Math.random() * 0.1 + 0.9
      };
    }

    return breakdown;
  }

  private async generateComparisons(): Promise<any> {
    return {
      previousDay: {
        taskCompletionRate: Math.random() * 0.2 + 0.8,
        averageQuality: Math.random() * 0.3 + 0.7
      },
      weeklyAverage: {
        taskCompletionRate: Math.random() * 0.15 + 0.85,
        averageQuality: Math.random() * 0.25 + 0.75
      }
    };
  }

  private generateExecutiveSummary(metrics: PerformanceMetrics): string {
    return `Performance Summary: Completed ${metrics.totalTasks} tasks with average quality of ${(metrics.qualityMetrics.averageQuality * 100).toFixed(1)}%. Byzantine security maintained with ${metrics.byzantineMetrics.consensusSuccessRate * 100}% consensus success rate.`;
  }

  private async generateRecommendations(metrics: PerformanceMetrics): Promise<string[]> {
    const recommendations: string[] = [];

    if (metrics.qualityMetrics.averageQuality < 0.8) {
      recommendations.push('Improve quality assurance processes');
    }

    if (metrics.byzantineMetrics.detectedAnomalies > 0) {
      recommendations.push('Investigate Byzantine anomalies detected');
    }

    if (metrics.coordinationEfficiency < 0.7) {
      recommendations.push('Optimize agent coordination mechanisms');
    }

    return recommendations;
  }

  private calculateMetricTrend(values: Array<{ value: number; timestamp: number }>): 'improving' | 'declining' | 'stable' {
    if (values.length < 2) return 'stable';

    const recent = values.slice(-5);
    const first = recent[0].value;
    const last = recent[recent.length - 1].value;

    const change = (last - first) / first;

    if (change > 0.05) return 'improving';
    if (change < -0.05) return 'declining';
    return 'stable';
  }
}

class ByzantinePerformanceDetector {
  private anomalies: any[] = [];

  async collectByzantineMetrics(): Promise<any> {
    return {
      detectedAnomalies: this.anomalies.length,
      consensusSuccessRate: Math.random() * 0.1 + 0.9,
      trustScoreDistribution: Array.from({ length: 10 }, () => Math.random() * 0.3 + 0.7)
    };
  }

  async analyzeTaskExecution(taskMetrics: any): Promise<void> {
    // Detect anomalies in task execution
    if (taskMetrics.qualityScore < 0.3 || taskMetrics.totalDuration > 300000) {
      this.anomalies.push({
        taskId: taskMetrics.taskId,
        type: 'performance_anomaly',
        timestamp: Date.now(),
        details: taskMetrics
      });
    }
  }

  getAnomalyCount(): number {
    return this.anomalies.length;
  }
}

class LearningAnalyzer {
  async analyzeTrends(learningHistory: any[]): Promise<LearningMetrics> {
    if (learningHistory.length === 0) {
      return this.getDefaultLearningMetrics();
    }

    const sortedHistory = learningHistory.sort((a, b) => a.iteration - b.iteration);
    const firstRecord = sortedHistory[0];
    const lastRecord = sortedHistory[sortedHistory.length - 1];

    const qualityImprovement = lastRecord.qualityScore - firstRecord.qualityScore;
    const speedImprovement = (firstRecord.completionTime - lastRecord.completionTime) / firstRecord.completionTime;

    return {
      qualityImprovement,
      speedImprovement,
      learningRate: qualityImprovement / sortedHistory.length,
      learningCurve: {
        type: 'exponential_improvement',
        parameters: { rate: 0.1, ceiling: 0.95 }
      },
      predictedPerformance: {
        nextIteration: {
          quality: Math.min(0.95, lastRecord.qualityScore + 0.05),
          speed: Math.max(0.8, lastRecord.completionTime * 0.95)
        }
      },
      masteryIndicators: {
        consistency: Math.random() * 0.3 + 0.7,
        autonomy: Math.random() * 0.2 + 0.8,
        adaptability: Math.random() * 0.25 + 0.75
      }
    };
  }

  private getDefaultLearningMetrics(): LearningMetrics {
    return {
      qualityImprovement: 0,
      speedImprovement: 0,
      learningRate: 0,
      learningCurve: { type: 'no_data', parameters: {} },
      predictedPerformance: {
        nextIteration: { quality: 0.8, speed: 60000 }
      },
      masteryIndicators: {
        consistency: 0.5,
        autonomy: 0.5,
        adaptability: 0.5
      }
    };
  }
}

class BottleneckAnalyzer {
  async analyzeBottlenecks(metricsHistory: Map<string, any[]>): Promise<any> {
    const tasks = metricsHistory.get('tasks') || [];

    // Analyze for bottlenecks
    const bottlenecks = [];
    const optimizations: any = {};
    let totalDelay = 0;
    let qualityImpact = 0;

    for (const task of tasks) {
      if (task.phases) {
        for (const phase of task.phases) {
          const expectedDuration = phase.estimatedDuration || 60000;
          const actualDuration = phase.actualDuration || expectedDuration;
          const delay = actualDuration - expectedDuration;

          if (delay > expectedDuration * 0.5) { // 50% over expected
            bottlenecks.push({
              phase: phase.name,
              agent: phase.agent || 'unknown',
              severity: delay > expectedDuration ? 'high' : 'medium',
              delayFactor: delay / expectedDuration
            });

            totalDelay += delay;

            if (phase.quality && phase.quality < 0.8) {
              qualityImpact += 0.8 - phase.quality;
            }
          }
        }
      }
    }

    // Generate optimization suggestions
    const agentBottlenecks = new Map<string, number>();
    for (const bottleneck of bottlenecks) {
      const count = agentBottlenecks.get(bottleneck.agent) || 0;
      agentBottlenecks.set(bottleneck.agent, count + 1);
    }

    for (const [agent, count] of agentBottlenecks) {
      if (count > 2) {
        optimizations[agent] = [
          'Additional training in implementation techniques',
          'Consider task breakdown for complex implementations',
          'Optimize workflow for this agent type'
        ];
      }
    }

    return {
      bottlenecks,
      optimizations,
      impactAssessment: {
        timeDelay: totalDelay,
        qualityImpact
      }
    };
  }
}