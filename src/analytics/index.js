/**
 * Claude Flow Analytics Pipeline
 * Main entry point for SQLite analytics and optimization suggestions
 */

import SQLiteAnalyzer from './sqlite-analyzer.js';
import OptimizationEngine from './optimization-engine.js';
import SuggestionGenerator from './suggestion-generator.js';
import AnalyticsDashboard from './dashboard-integration.js';
import AnalyticsCLI from './cli-commands.js';
import MonitoringIntegration from './monitoring-integration.js';

/**
 * Complete Analytics Pipeline for Claude Flow
 */
export class AnalyticsPipeline {
  constructor(options = {}) {
    this.options = {
      hiveDbPath: '.hive-mind/hive.db',
      swarmDbPath: '.swarm/memory.db',
      metricsPath: '.claude-flow/metrics',
      enableMonitoring: true,
      enableDashboard: true,
      ...options,
    };

    // Initialize components
    this.analyzer = new SQLiteAnalyzer({
      hiveDbPath: this.options.hiveDbPath,
      swarmDbPath: this.options.swarmDbPath,
      metricsPath: this.options.metricsPath,
    });

    this.optimizationEngine = new OptimizationEngine(this.analyzer);
    this.suggestionGenerator = new SuggestionGenerator(this.analyzer, this.optimizationEngine);
    this.dashboard = new AnalyticsDashboard(
      this.analyzer,
      this.optimizationEngine,
      this.suggestionGenerator,
    );
    this.cli = new AnalyticsCLI(this.analyzer, this.optimizationEngine, this.suggestionGenerator);
    this.monitoring = new MonitoringIntegration(
      this.analyzer,
      this.optimizationEngine,
      this.suggestionGenerator,
    );
  }

  /**
   * Initialize the entire analytics pipeline
   */
  async initialize() {
    console.log('🔧 Initializing Claude Flow Analytics Pipeline...');

    try {
      // Initialize analyzer
      const analyzerResult = await this.analyzer.initialize();
      if (!analyzerResult.success) {
        console.warn('⚠️  Database connection issues:', analyzerResult.error);
      }

      // Initialize suggestion generator
      await this.suggestionGenerator.initialize();

      // Initialize dashboard if enabled
      if (this.options.enableDashboard) {
        await this.dashboard.initialize();
      }

      // Start monitoring if enabled
      if (this.options.enableMonitoring) {
        await this.monitoring.startMonitoring();
      }

      console.log('✅ Analytics pipeline initialized successfully');
      return { success: true, message: 'Analytics pipeline ready' };
    } catch (error) {
      console.error('❌ Failed to initialize analytics pipeline:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate comprehensive analytics report
   */
  async generateReport(format = 'json') {
    console.log('📊 Generating comprehensive analytics report...');

    try {
      const report = {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        components: {},
      };

      // Database analysis
      report.components.database_analysis = await this.analyzer.generateComprehensiveReport();

      // Optimization suggestions
      report.components.optimizations =
        await this.optimizationEngine.generateOptimizationSuggestions();

      // Personalized suggestions
      report.components.personalized_suggestions =
        await this.suggestionGenerator.generatePersonalizedSuggestions();

      // Success pattern analysis
      report.components.success_patterns =
        await this.suggestionGenerator.learnFromSuccessfulPatterns();

      // Dashboard data
      if (this.options.enableDashboard) {
        report.components.dashboard_data = await this.dashboard.generateDashboardData();
      }

      console.log('✅ Comprehensive report generated');
      return report;
    } catch (error) {
      console.error('❌ Error generating report:', error.message);
      throw error;
    }
  }

  /**
   * Analyze specific task and provide insights
   */
  async analyzeTask(taskId) {
    console.log(`🔍 Analyzing task: ${taskId}`);

    try {
      const insights = await this.suggestionGenerator.generatePostTaskInsights(taskId);
      return insights;
    } catch (error) {
      console.error(`❌ Error analyzing task ${taskId}:`, error.message);
      throw error;
    }
  }

  /**
   * Get real-time system status
   */
  async getSystemStatus() {
    try {
      const status = {
        timestamp: new Date().toISOString(),
        analytics: {
          databases_connected: false,
          monitoring_active: this.monitoring.isMonitoring,
          dashboard_ready: this.options.enableDashboard,
        },
        metrics: {},
        alerts: [],
        recommendations: [],
      };

      // Check database connectivity
      const analyzerResult = await this.analyzer.initialize();
      status.analytics.databases_connected = analyzerResult.success;

      // Get current metrics
      if (analyzerResult.success) {
        const quickReport = await this.analyzer.generateComprehensiveReport();

        if (quickReport.analysis.performance) {
          const perf = quickReport.analysis.performance;
          status.metrics = {
            memory_usage: perf.resourceAnalysis?.memory?.average || 0,
            cpu_load: perf.resourceAnalysis?.cpu?.average || 0,
            memory_efficiency: perf.resourceAnalysis?.efficiency?.average || 0,
            bottlenecks: perf.bottlenecks?.length || 0,
          };

          // Extract alerts from bottlenecks
          if (perf.bottlenecks) {
            status.alerts = perf.bottlenecks.map((bottleneck) => ({
              type: bottleneck.type,
              severity: bottleneck.severity,
              description: bottleneck.description,
            }));
          }
        }

        // Get quick recommendations
        if (quickReport.analysis.taskPatterns) {
          const optimizations = await this.optimizationEngine.generateOptimizationSuggestions();
          status.recommendations = optimizations.priority.high.slice(0, 3).map((opt) => ({
            title: opt.title,
            description: opt.description,
            impact: opt.impact,
          }));
        }
      }

      return status;
    } catch (error) {
      console.error('❌ Error getting system status:', error.message);
      return {
        timestamp: new Date().toISOString(),
        error: error.message,
        analytics: { databases_connected: false, monitoring_active: false },
      };
    }
  }

  /**
   * Start interactive CLI mode
   */
  async startCLI() {
    console.log('🖥️  Starting Claude Flow Analytics CLI...');

    // Show initial summary
    await this.cli.showAnalyticsSummary({ verbose: false });

    console.log('\nAvailable commands:');
    console.log('  analytics summary [--verbose] - Show analytics summary');
    console.log('  analytics optimize [--detailed] - Show optimization suggestions');
    console.log('  analytics personal - Show personalized recommendations');
    console.log('  analytics task <task-id> - Analyze specific task');
    console.log('  analytics export <format> [path] - Export analytics report');
    console.log('  analytics status - Show current system status');

    return {
      analyzer: this.analyzer,
      cli: this.cli,
      optimizationEngine: this.optimizationEngine,
      suggestionGenerator: this.suggestionGenerator,
    };
  }

  /**
   * Start web dashboard
   */
  async startDashboard(port = 3001) {
    if (!this.options.enableDashboard) {
      throw new Error('Dashboard is disabled in configuration');
    }

    console.log(`🌐 Starting analytics dashboard on port ${port}...`);

    // Generate initial dashboard data
    const dashboardData = await this.dashboard.generateDashboardData();

    // In a full implementation, this would start an Express server
    console.log('📊 Dashboard data generated and ready');
    console.log('📁 Dashboard files available in .claude-flow/dashboard/');

    return {
      port: port,
      path: '.claude-flow/dashboard/',
      data: dashboardData,
    };
  }

  /**
   * Export analytics data in various formats
   */
  async exportReport(format = 'json', outputPath = null) {
    return await this.cli.exportAnalyticsReport(format, outputPath);
  }

  /**
   * Get optimization suggestions with filtering
   */
  async getOptimizations(priority = 'all', category = 'all') {
    const optimizations = await this.optimizationEngine.generateOptimizationSuggestions();

    let filtered = [];

    if (priority === 'all') {
      filtered = [
        ...optimizations.priority.high,
        ...optimizations.priority.medium,
        ...optimizations.priority.low,
      ];
    } else {
      filtered = optimizations.priority[priority] || [];
    }

    if (category !== 'all') {
      filtered = filtered.filter((opt) => opt.category === category);
    }

    return {
      total: filtered.length,
      priority: priority,
      category: category,
      suggestions: filtered,
      summary: {
        high: optimizations.priority.high.length,
        medium: optimizations.priority.medium.length,
        low: optimizations.priority.low.length,
      },
    };
  }

  /**
   * Get personalized suggestions for user
   */
  async getPersonalizedSuggestions(userId = 'default') {
    return await this.suggestionGenerator.generatePersonalizedSuggestions();
  }

  /**
   * Learn from task patterns and update suggestions
   */
  async updateLearningPatterns() {
    return await this.suggestionGenerator.learnFromSuccessfulPatterns();
  }

  /**
   * Get agent-specific recommendations
   */
  async getAgentRecommendations(agentId) {
    return await this.optimizationEngine.generateAgentRecommendations(agentId);
  }

  /**
   * Get swarm-specific recommendations
   */
  async getSwarmRecommendations(swarmId) {
    return await this.optimizationEngine.generateSwarmRecommendations(swarmId);
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    console.log('🔄 Shutting down analytics pipeline...');

    try {
      // Stop monitoring
      if (this.monitoring.isMonitoring) {
        await this.monitoring.stopMonitoring();
      }

      // Close database connections
      await this.analyzer.close();

      console.log('✅ Analytics pipeline shut down successfully');
      return { success: true, message: 'Pipeline shut down cleanly' };
    } catch (error) {
      console.error('❌ Error during shutdown:', error.message);
      return { success: false, error: error.message };
    }
  }
}

// Export individual components
export {
  SQLiteAnalyzer,
  OptimizationEngine,
  SuggestionGenerator,
  AnalyticsDashboard,
  AnalyticsCLI,
  MonitoringIntegration,
};

// Export default pipeline
export default AnalyticsPipeline;
