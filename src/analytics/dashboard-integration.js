/**
 * Analytics Dashboard Integration for Claude Flow
 * Provides web UI components and real-time analytics display
 */

import fs from 'fs-extra';
import path from 'path';

export class AnalyticsDashboard {
  constructor(analyzer, optimizationEngine, suggestionGenerator) {
    this.analyzer = analyzer;
    this.optimizationEngine = optimizationEngine;
    this.suggestionGenerator = suggestionGenerator;
    this.dashboardPath = '.claude-flow/dashboard';
    this.reportsPath = '.claude-flow/reports';
  }

  /**
   * Initialize dashboard components
   */
  async initialize() {
    await fs.ensureDir(this.dashboardPath);
    await fs.ensureDir(this.reportsPath);
    await this.generateDashboardTemplates();
  }

  /**
   * Generate real-time analytics data for dashboard
   */
  async generateDashboardData() {
    const data = {
      timestamp: new Date().toISOString(),
      summary: {},
      charts: {},
      recommendations: {},
      alerts: [],
      status: 'active'
    };

    try {
      // Get comprehensive analytics
      const report = await this.analyzer.generateComprehensiveReport();
      const optimizations = await this.optimizationEngine.generateOptimizationSuggestions();
      const personalizedSuggestions = await this.suggestionGenerator.generatePersonalizedSuggestions();

      // Build summary metrics
      data.summary = this.buildSummaryMetrics(report, optimizations);

      // Generate chart data
      data.charts = this.generateChartData(report);

      // Process recommendations
      data.recommendations = this.processRecommendations(optimizations, personalizedSuggestions);

      // Generate alerts
      data.alerts = this.generateAlerts(report, optimizations);

      // Save dashboard data
      await this.saveDashboardData(data);

      return data;
    } catch (error) {
      data.status = 'error';
      data.error = error.message;
      return data;
    }
  }

  /**
   * Build summary metrics for dashboard overview
   */
  buildSummaryMetrics(report, optimizations) {
    const summary = {
      system: {
        status: 'healthy',
        uptime: 0,
        memory: { usage: 0, efficiency: 0 },
        cpu: { load: 0, utilization: 0 }
      },
      tasks: {
        total: 0,
        completed: 0,
        success_rate: 0,
        avg_duration: 0
      },
      agents: {
        total: 0,
        active: 0,
        avg_performance: 0,
        top_performer: null
      },
      optimization: {
        suggestions: optimizations.priority.high.length + optimizations.priority.medium.length,
        high_priority: optimizations.priority.high.length,
        potential_impact: 'medium'
      }
    };

    // Extract system metrics
    if (report.analysis.performance && report.analysis.performance.resourceAnalysis) {
      const resources = report.analysis.performance.resourceAnalysis;
      summary.system.memory = {
        usage: Math.round(resources.memory?.average || 0),
        efficiency: Math.round(resources.efficiency?.average || 0)
      };
      summary.system.cpu = {
        load: Math.round((resources.cpu?.average || 0) * 100) / 100,
        utilization: Math.round(((resources.cpu?.average || 0) / 8) * 100) // Assuming 8 cores
      };
    }

    // Extract task metrics
    if (report.analysis.taskPatterns) {
      const taskData = report.analysis.taskPatterns;
      if (taskData.statusAnalysis) {
        summary.tasks.total = taskData.statusAnalysis.reduce((sum, s) => sum + s.count, 0);
        const completed = taskData.statusAnalysis.find(s => s.status === 'completed');
        summary.tasks.completed = completed ? completed.count : 0;
        summary.tasks.success_rate = summary.tasks.total > 0
          ? Math.round((summary.tasks.completed / summary.tasks.total) * 100)
          : 0;
        summary.tasks.avg_duration = Math.round(completed?.avg_duration || 0);
      }

      // Agent performance
      if (taskData.agentPerformance) {
        summary.agents.total = taskData.agentPerformance.length;
        summary.agents.active = taskData.agentPerformance.filter(a => a.recent_tasks > 0).length;
        summary.agents.avg_performance = Math.round(
          taskData.agentPerformance.reduce((sum, a) => sum + a.performance_score, 0)
          / taskData.agentPerformance.length * 100
        ) / 100;

        const topAgent = taskData.agentPerformance
          .sort((a, b) => b.performance_score - a.performance_score)[0];
        summary.agents.top_performer = topAgent ? {
          name: topAgent.name,
          type: topAgent.type,
          score: Math.round(topAgent.performance_score * 100) / 100
        } : null;
      }
    }

    // Optimization impact assessment
    const highImpactSuggestions = optimizations.priority.high.filter(s => s.impact === 'high').length;
    if (highImpactSuggestions > 2) {
      summary.optimization.potential_impact = 'high';
    } else if (optimizations.priority.medium.length > 3) {
      summary.optimization.potential_impact = 'medium';
    } else {
      summary.optimization.potential_impact = 'low';
    }

    return summary;
  }

  /**
   * Generate chart data for visualizations
   */
  generateChartData(report) {
    const charts = {
      performance_timeline: [],
      task_distribution: [],
      agent_performance: [],
      memory_usage: [],
      success_trends: []
    };

    // Performance timeline
    if (report.analysis.performance && report.analysis.performance.metrics.system) {
      const systemMetrics = report.analysis.performance.metrics.system.slice(-20); // Last 20 data points

      charts.performance_timeline = systemMetrics.map(metric => ({
        timestamp: new Date(metric.timestamp).toISOString(),
        memory: Math.round(metric.memoryUsagePercent),
        cpu: Math.round(metric.cpuLoad * 100) / 100,
        efficiency: Math.round(metric.memoryEfficiency)
      }));
    }

    // Task distribution
    if (report.analysis.taskPatterns && report.analysis.taskPatterns.statusAnalysis) {
      charts.task_distribution = report.analysis.taskPatterns.statusAnalysis.map(status => ({
        status: status.status,
        count: status.count,
        percentage: status.percentage
      }));
    }

    // Agent performance
    if (report.analysis.taskPatterns && report.analysis.taskPatterns.agentPerformance) {
      charts.agent_performance = report.analysis.taskPatterns.agentPerformance
        .slice(0, 10) // Top 10 agents
        .map(agent => ({
          name: agent.name,
          type: agent.type,
          performance: Math.round(agent.performance_score * 100),
          success_rate: Math.round(agent.success_rate * 100),
          task_count: agent.task_count
        }));
    }

    // Memory usage over time
    if (report.analysis.performance && report.analysis.performance.metrics.system) {
      const memoryData = report.analysis.performance.metrics.system.slice(-10);

      charts.memory_usage = memoryData.map(metric => ({
        timestamp: new Date(metric.timestamp).toISOString(),
        used: Math.round(metric.memoryUsagePercent),
        free: Math.round(100 - metric.memoryUsagePercent),
        efficiency: Math.round(metric.memoryEfficiency)
      }));
    }

    // Success trends
    if (report.analysis.taskPatterns && report.analysis.taskPatterns.completionTrends) {
      charts.success_trends = report.analysis.taskPatterns.completionTrends
        .slice(-7) // Last 7 days
        .map(trend => ({
          date: trend.date,
          total_tasks: trend.total_tasks,
          completed_tasks: trend.completed_tasks,
          success_rate: Math.round((trend.completed_tasks / trend.total_tasks) * 100)
        }));
    }

    return charts;
  }

  /**
   * Process recommendations for dashboard display
   */
  processRecommendations(optimizations, personalizedSuggestions) {
    const recommendations = {
      immediate_actions: [],
      short_term_goals: [],
      long_term_improvements: [],
      personalized: [],
      categories: {
        performance: 0,
        coordination: 0,
        workflow: 0,
        automation: 0
      }
    };

    // Process immediate actions (high priority)
    recommendations.immediate_actions = optimizations.priority.high.slice(0, 5).map(suggestion => ({
      title: suggestion.title,
      description: suggestion.description,
      category: suggestion.category,
      impact: suggestion.impact,
      effort: suggestion.effort,
      actions: suggestion.suggestions.slice(0, 3) // Top 3 actions
    }));

    // Process short-term goals (medium priority)
    recommendations.short_term_goals = optimizations.priority.medium.slice(0, 5).map(suggestion => ({
      title: suggestion.title,
      description: suggestion.description,
      category: suggestion.category,
      impact: suggestion.impact,
      effort: suggestion.effort,
      timeline: this.estimateTimeline(suggestion.effort)
    }));

    // Process long-term improvements (low priority)
    recommendations.long_term_improvements = optimizations.priority.low.slice(0, 3).map(suggestion => ({
      title: suggestion.title,
      description: suggestion.description,
      category: suggestion.category,
      impact: suggestion.impact,
      potential_benefit: this.describeBenefit(suggestion)
    }));

    // Process personalized suggestions
    if (personalizedSuggestions.suggestions) {
      recommendations.personalized = [
        ...personalizedSuggestions.suggestions.immediate.slice(0, 2),
        ...personalizedSuggestions.suggestions.shortTerm.slice(0, 2),
        ...personalizedSuggestions.suggestions.learning.slice(0, 2)
      ].map(suggestion => ({
        title: suggestion.title,
        description: suggestion.description,
        category: suggestion.category,
        personalization_reason: suggestion.personalization ?
          suggestion.personalization.relevance_score > 0.8 ? 'High relevance to your workflow' :
          'Matches your working style' : 'General recommendation'
      }));
    }

    // Count categories
    [...optimizations.priority.high, ...optimizations.priority.medium, ...optimizations.priority.low]
      .forEach(suggestion => {
        if (recommendations.categories.hasOwnProperty(suggestion.category)) {
          recommendations.categories[suggestion.category]++;
        }
      });

    return recommendations;
  }

  /**
   * Generate alerts based on analysis
   */
  generateAlerts(report, optimizations) {
    const alerts = [];

    // System performance alerts
    if (report.analysis.performance && report.analysis.performance.bottlenecks) {
      report.analysis.performance.bottlenecks.forEach(bottleneck => {
        if (bottleneck.severity === 'high') {
          alerts.push({
            type: 'system_alert',
            severity: 'high',
            title: `${bottleneck.type.toUpperCase()} Issue Detected`,
            message: bottleneck.description,
            timestamp: new Date().toISOString(),
            action_required: true,
            suggested_actions: ['Investigate resource usage', 'Consider scaling', 'Review recent changes']
          });
        }
      });
    }

    // Task performance alerts
    if (report.analysis.taskPatterns && report.analysis.taskPatterns.statusAnalysis) {
      const failed = report.analysis.taskPatterns.statusAnalysis.find(s => s.status === 'failed');
      const total = report.analysis.taskPatterns.statusAnalysis.reduce((sum, s) => sum + s.count, 0);

      if (failed && total > 0) {
        const failureRate = (failed.count / total) * 100;
        if (failureRate > 20) {
          alerts.push({
            type: 'task_alert',
            severity: failureRate > 40 ? 'high' : 'medium',
            title: 'High Task Failure Rate',
            message: `${failureRate.toFixed(1)}% of tasks are failing`,
            timestamp: new Date().toISOString(),
            action_required: true,
            suggested_actions: ['Review failed task patterns', 'Check agent configurations', 'Validate task inputs']
          });
        }
      }
    }

    // Coordination alerts
    if (report.analysis.coordinationPatterns && report.analysis.coordinationPatterns.consensusAnalysis) {
      const lowConsensus = report.analysis.coordinationPatterns.consensusAnalysis
        .filter(consensus => consensus.avg_vote < 0.6);

      if (lowConsensus.length > 2) {
        alerts.push({
          type: 'coordination_alert',
          severity: 'medium',
          title: 'Low Consensus Detected',
          message: `${lowConsensus.length} proposals have low consensus scores`,
          timestamp: new Date().toISOString(),
          action_required: false,
          suggested_actions: ['Review agent communication', 'Check decision-making processes', 'Adjust consensus thresholds']
        });
      }
    }

    // Optimization opportunity alerts
    const highImpactOptimizations = optimizations.priority.high.filter(opt => opt.impact === 'high');
    if (highImpactOptimizations.length > 0) {
      alerts.push({
        type: 'opportunity_alert',
        severity: 'low',
        title: 'Optimization Opportunities Available',
        message: `${highImpactOptimizations.length} high-impact optimizations identified`,
        timestamp: new Date().toISOString(),
        action_required: false,
        suggested_actions: ['Review optimization suggestions', 'Plan implementation', 'Prioritize by impact']
      });
    }

    return alerts.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }

  /**
   * Generate dashboard HTML templates
   */
  async generateDashboardTemplates() {
    const templates = {
      'index.html': this.generateMainDashboardTemplate(),
      'analytics.html': this.generateAnalyticsTemplate(),
      'recommendations.html': this.generateRecommendationsTemplate(),
      'style.css': this.generateStylesheet(),
      'script.js': this.generateDashboardScript()
    };

    for (const [filename, content] of Object.entries(templates)) {
      await fs.writeFile(path.join(this.dashboardPath, filename), content);
    }
  }

  /**
   * Generate main dashboard HTML template
   */
  generateMainDashboardTemplate() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Flow Analytics Dashboard</title>
    <link rel="stylesheet" href="style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div class="dashboard">
        <header class="dashboard-header">
            <h1>Claude Flow Analytics</h1>
            <div class="status-indicator">
                <span id="status" class="status-healthy">●</span>
                <span id="last-update">Last updated: --</span>
            </div>
        </header>

        <div class="dashboard-grid">
            <!-- Summary Cards -->
            <div class="card summary-card">
                <h2>System Health</h2>
                <div class="metrics">
                    <div class="metric">
                        <span class="metric-value" id="memory-usage">--</span>
                        <span class="metric-label">Memory Usage</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value" id="cpu-load">--</span>
                        <span class="metric-label">CPU Load</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value" id="memory-efficiency">--</span>
                        <span class="metric-label">Efficiency</span>
                    </div>
                </div>
            </div>

            <div class="card summary-card">
                <h2>Task Performance</h2>
                <div class="metrics">
                    <div class="metric">
                        <span class="metric-value" id="total-tasks">--</span>
                        <span class="metric-label">Total Tasks</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value" id="success-rate">--</span>
                        <span class="metric-label">Success Rate</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value" id="avg-duration">--</span>
                        <span class="metric-label">Avg Duration</span>
                    </div>
                </div>
            </div>

            <div class="card summary-card">
                <h2>Agent Status</h2>
                <div class="metrics">
                    <div class="metric">
                        <span class="metric-value" id="total-agents">--</span>
                        <span class="metric-label">Total Agents</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value" id="active-agents">--</span>
                        <span class="metric-label">Active</span>
                    </div>
                    <div class="metric">
                        <span class="metric-value" id="avg-performance">--</span>
                        <span class="metric-label">Avg Performance</span>
                    </div>
                </div>
            </div>

            <!-- Charts -->
            <div class="card chart-card">
                <h2>Performance Timeline</h2>
                <canvas id="performance-chart"></canvas>
            </div>

            <div class="card chart-card">
                <h2>Task Distribution</h2>
                <canvas id="task-distribution-chart"></canvas>
            </div>

            <div class="card chart-card">
                <h2>Agent Performance</h2>
                <canvas id="agent-performance-chart"></canvas>
            </div>

            <!-- Recommendations -->
            <div class="card recommendations-card">
                <h2>Immediate Actions</h2>
                <div id="immediate-actions" class="recommendations-list">
                    <p>Loading recommendations...</p>
                </div>
            </div>

            <!-- Alerts -->
            <div class="card alerts-card">
                <h2>System Alerts</h2>
                <div id="system-alerts" class="alerts-list">
                    <p>No active alerts</p>
                </div>
            </div>
        </div>
    </div>

    <script src="script.js"></script>
</body>
</html>`;
  }

  /**
   * Generate CSS stylesheet
   */
  generateStylesheet() {
    return `/* Claude Flow Analytics Dashboard Styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #f5f5f7;
    color: #1d1d1f;
    line-height: 1.6;
}

.dashboard {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
}

.dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
    padding-bottom: 20px;
    border-bottom: 2px solid #e5e5e7;
}

.dashboard-header h1 {
    font-size: 2.5rem;
    font-weight: 600;
    color: #1d1d1f;
}

.status-indicator {
    display: flex;
    align-items: center;
    gap: 10px;
}

.status-healthy { color: #30d158; }
.status-warning { color: #ff9f0a; }
.status-error { color: #ff3b30; }

#last-update {
    font-size: 0.875rem;
    color: #6e6e73;
}

.dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 20px;
}

.card {
    background: white;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.card h2 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 16px;
    color: #1d1d1f;
}

.summary-card .metrics {
    display: flex;
    justify-content: space-between;
    gap: 16px;
}

.metric {
    text-align: center;
    flex: 1;
}

.metric-value {
    display: block;
    font-size: 2rem;
    font-weight: 700;
    color: #007aff;
    margin-bottom: 4px;
}

.metric-label {
    font-size: 0.875rem;
    color: #6e6e73;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.chart-card {
    min-height: 300px;
}

.chart-card canvas {
    max-height: 250px;
}

.recommendations-card {
    grid-column: span 2;
}

.recommendations-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.recommendation-item {
    padding: 16px;
    background: #f8f9fa;
    border-radius: 8px;
    border-left: 4px solid #007aff;
}

.recommendation-item h3 {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 8px;
    color: #1d1d1f;
}

.recommendation-item p {
    font-size: 0.875rem;
    color: #6e6e73;
    margin-bottom: 8px;
}

.recommendation-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.action-tag {
    padding: 4px 12px;
    background: #007aff;
    color: white;
    border-radius: 16px;
    font-size: 0.75rem;
    font-weight: 500;
}

.alerts-card {
    grid-column: span 1;
}

.alert-item {
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 8px;
}

.alert-high {
    background: #ffebee;
    border-left: 4px solid #ff3b30;
}

.alert-medium {
    background: #fff8e1;
    border-left: 4px solid #ff9f0a;
}

.alert-low {
    background: #e8f5e8;
    border-left: 4px solid #30d158;
}

.alert-item h3 {
    font-size: 0.875rem;
    font-weight: 600;
    margin-bottom: 4px;
}

.alert-item p {
    font-size: 0.75rem;
    color: #6e6e73;
}

@media (max-width: 768px) {
    .dashboard-grid {
        grid-template-columns: 1fr;
    }

    .recommendations-card {
        grid-column: span 1;
    }

    .summary-card .metrics {
        flex-direction: column;
        gap: 12px;
    }

    .dashboard-header {
        flex-direction: column;
        align-items: flex-start;
        gap: 16px;
    }
}

/* Loading states */
.loading {
    opacity: 0.6;
    pointer-events: none;
}

.loading::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 20px;
    height: 20px;
    margin: -10px 0 0 -10px;
    border: 2px solid #007aff;
    border-radius: 50%;
    border-top-color: transparent;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}`;
  }

  /**
   * Generate dashboard JavaScript
   */
  generateDashboardScript() {
    return `// Claude Flow Analytics Dashboard Script
class AnalyticsDashboard {
    constructor() {
        this.charts = {};
        this.updateInterval = 30000; // 30 seconds
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadData();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        // Refresh button (if added)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F5' || (e.ctrlKey && e.key === 'r')) {
                e.preventDefault();
                this.loadData();
            }
        });
    }

    async loadData() {
        try {
            this.updateStatus('loading');

            // In a real implementation, this would fetch from an API endpoint
            // For now, we'll simulate with localStorage or a mock endpoint
            const data = await this.fetchAnalyticsData();

            if (data) {
                this.updateSummary(data.summary);
                this.updateCharts(data.charts);
                this.updateRecommendations(data.recommendations);
                this.updateAlerts(data.alerts);
                this.updateStatus('healthy');
                this.updateTimestamp();
            }
        } catch (error) {
            console.error('Failed to load analytics data:', error);
            this.updateStatus('error');
        }
    }

    async fetchAnalyticsData() {
        // This would be replaced with actual API call
        // return await fetch('/api/analytics').then(r => r.json());

        // Mock data for demonstration
        return {
            summary: {
                system: {
                    memory: { usage: 45, efficiency: 78 },
                    cpu: { load: 1.2, utilization: 15 }
                },
                tasks: {
                    total: 127,
                    completed: 95,
                    success_rate: 75,
                    avg_duration: 2340
                },
                agents: {
                    total: 8,
                    active: 5,
                    avg_performance: 0.82
                }
            },
            charts: {
                performance_timeline: Array.from({length: 20}, (_, i) => ({
                    timestamp: new Date(Date.now() - (19-i) * 60000).toISOString(),
                    memory: 45 + Math.random() * 10,
                    cpu: 1.2 + Math.random() * 0.8,
                    efficiency: 75 + Math.random() * 15
                })),
                task_distribution: [
                    { status: 'completed', count: 95, percentage: 74.8 },
                    { status: 'failed', count: 12, percentage: 9.4 },
                    { status: 'pending', count: 20, percentage: 15.7 }
                ]
            },
            recommendations: {
                immediate_actions: [
                    {
                        title: 'Memory Usage Optimization',
                        description: 'High memory usage detected in agent coordination',
                        category: 'performance',
                        impact: 'high',
                        actions: ['Reduce concurrent agents', 'Implement memory pooling', 'Add cleanup routines']
                    }
                ]
            },
            alerts: [
                {
                    type: 'system_alert',
                    severity: 'medium',
                    title: 'Memory Usage Warning',
                    message: 'Memory usage is approaching 80% threshold',
                    timestamp: new Date().toISOString()
                }
            ]
        };
    }

    updateSummary(summary) {
        if (summary.system) {
            document.getElementById('memory-usage').textContent =
                \`\${summary.system.memory.usage}%\`;
            document.getElementById('cpu-load').textContent =
                \`\${summary.system.cpu.load}\`;
            document.getElementById('memory-efficiency').textContent =
                \`\${summary.system.memory.efficiency}%\`;
        }

        if (summary.tasks) {
            document.getElementById('total-tasks').textContent = summary.tasks.total;
            document.getElementById('success-rate').textContent =
                \`\${summary.tasks.success_rate}%\`;
            document.getElementById('avg-duration').textContent =
                \`\${Math.round(summary.tasks.avg_duration / 1000)}s\`;
        }

        if (summary.agents) {
            document.getElementById('total-agents').textContent = summary.agents.total;
            document.getElementById('active-agents').textContent = summary.agents.active;
            document.getElementById('avg-performance').textContent =
                \`\${Math.round(summary.agents.avg_performance * 100)}%\`;
        }
    }

    updateCharts(charts) {
        if (charts.performance_timeline) {
            this.updatePerformanceChart(charts.performance_timeline);
        }

        if (charts.task_distribution) {
            this.updateTaskDistributionChart(charts.task_distribution);
        }
    }

    updatePerformanceChart(data) {
        const ctx = document.getElementById('performance-chart').getContext('2d');

        if (this.charts.performance) {
            this.charts.performance.destroy();
        }

        this.charts.performance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.map(d => new Date(d.timestamp).toLocaleTimeString()),
                datasets: [{
                    label: 'Memory %',
                    data: data.map(d => d.memory),
                    borderColor: '#007aff',
                    backgroundColor: 'rgba(0, 122, 255, 0.1)',
                    tension: 0.4
                }, {
                    label: 'CPU Load',
                    data: data.map(d => d.cpu * 10), // Scale for visibility
                    borderColor: '#ff9f0a',
                    backgroundColor: 'rgba(255, 159, 10, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                }
            }
        });
    }

    updateTaskDistributionChart(data) {
        const ctx = document.getElementById('task-distribution-chart').getContext('2d');

        if (this.charts.taskDistribution) {
            this.charts.taskDistribution.destroy();
        }

        this.charts.taskDistribution = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.map(d => d.status.charAt(0).toUpperCase() + d.status.slice(1)),
                datasets: [{
                    data: data.map(d => d.count),
                    backgroundColor: [
                        '#30d158',
                        '#ff3b30',
                        '#ff9f0a',
                        '#007aff'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom'
                    }
                }
            }
        });
    }

    updateRecommendations(recommendations) {
        const container = document.getElementById('immediate-actions');

        if (!recommendations.immediate_actions || recommendations.immediate_actions.length === 0) {
            container.innerHTML = '<p>No immediate actions required</p>';
            return;
        }

        container.innerHTML = recommendations.immediate_actions.map(rec => \`
            <div class="recommendation-item">
                <h3>\${rec.title}</h3>
                <p>\${rec.description}</p>
                <div class="recommendation-actions">
                    \${rec.actions.slice(0, 3).map(action =>
                        \`<span class="action-tag">\${action}</span>\`
                    ).join('')}
                </div>
            </div>
        \`).join('');
    }

    updateAlerts(alerts) {
        const container = document.getElementById('system-alerts');

        if (!alerts || alerts.length === 0) {
            container.innerHTML = '<p>No active alerts</p>';
            return;
        }

        container.innerHTML = alerts.slice(0, 5).map(alert => \`
            <div class="alert-item alert-\${alert.severity}">
                <h3>\${alert.title}</h3>
                <p>\${alert.message}</p>
            </div>
        \`).join('');
    }

    updateStatus(status) {
        const statusElement = document.getElementById('status');
        statusElement.className = \`status-\${status}\`;
    }

    updateTimestamp() {
        document.getElementById('last-update').textContent =
            \`Last updated: \${new Date().toLocaleTimeString()}\`;
    }

    startAutoRefresh() {
        setInterval(() => {
            this.loadData();
        }, this.updateInterval);
    }
}

// Initialize dashboard when page loads
document.addEventListener('DOMContentLoaded', () => {
    new AnalyticsDashboard();
});`;
  }

  /**
   * Save dashboard data to file
   */
  async saveDashboardData(data) {
    const dataPath = path.join(this.dashboardPath, 'data.json');
    await fs.writeJson(dataPath, data, { spaces: 2 });
  }

  /**
   * Helper methods
   */
  estimateTimeline(effort) {
    const timelines = {
      low: '1-2 days',
      medium: '1 week',
      high: '2-4 weeks'
    };
    return timelines[effort] || 'Variable';
  }

  describeBenefit(suggestion) {
    const benefits = {
      performance: 'Improved system performance and resource utilization',
      coordination: 'Better agent collaboration and decision-making',
      workflow: 'Streamlined processes and higher success rates',
      automation: 'Reduced manual effort and faster execution'
    };
    return benefits[suggestion.category] || 'General system improvement';
  }

  /**
   * Generate analytics template
   */
  generateAnalyticsTemplate() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Flow - Detailed Analytics</title>
    <link rel="stylesheet" href="style.css">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div class="dashboard">
        <header class="dashboard-header">
            <h1>Detailed Analytics</h1>
            <nav>
                <a href="index.html">Dashboard</a> |
                <a href="analytics.html" class="active">Analytics</a> |
                <a href="recommendations.html">Recommendations</a>
            </nav>
        </header>

        <div class="analytics-grid">
            <div class="card full-width">
                <h2>Task Analysis</h2>
                <canvas id="task-analysis-chart"></canvas>
            </div>

            <div class="card full-width">
                <h2>Agent Performance Trends</h2>
                <canvas id="agent-trends-chart"></canvas>
            </div>

            <div class="card">
                <h2>Memory Usage Patterns</h2>
                <canvas id="memory-patterns-chart"></canvas>
            </div>

            <div class="card">
                <h2>Success Rate Trends</h2>
                <canvas id="success-trends-chart"></canvas>
            </div>
        </div>
    </div>

    <script>
        // Additional analytics-specific JavaScript would go here
    </script>
</body>
</html>`;
  }

  /**
   * Generate recommendations template
   */
  generateRecommendationsTemplate() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Claude Flow - Recommendations</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="dashboard">
        <header class="dashboard-header">
            <h1>Optimization Recommendations</h1>
            <nav>
                <a href="index.html">Dashboard</a> |
                <a href="analytics.html">Analytics</a> |
                <a href="recommendations.html" class="active">Recommendations</a>
            </nav>
        </header>

        <div class="recommendations-grid">
            <div class="card priority-high">
                <h2>🔴 Immediate Actions</h2>
                <div id="high-priority-recommendations"></div>
            </div>

            <div class="card priority-medium">
                <h2>🟡 Short-term Goals</h2>
                <div id="medium-priority-recommendations"></div>
            </div>

            <div class="card priority-low">
                <h2>🟢 Long-term Improvements</h2>
                <div id="low-priority-recommendations"></div>
            </div>

            <div class="card personalized">
                <h2>👤 Personalized Suggestions</h2>
                <div id="personalized-recommendations"></div>
            </div>
        </div>
    </div>
</body>
</html>`;
  }
}

export default AnalyticsDashboard;