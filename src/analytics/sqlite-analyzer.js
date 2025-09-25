/**
 * SQLite Analytics Engine for Claude Flow
 * Analyzes task completion patterns, performance metrics, and agent coordination data
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs-extra';
import path from 'path';

export class SQLiteAnalyzer {
  constructor(options = {}) {
    this.hiveDbPath = options.hiveDbPath || '.hive-mind/hive.db';
    this.swarmDbPath = options.swarmDbPath || '.swarm/memory.db';
    this.metricsPath = options.metricsPath || '.claude-flow/metrics';
    this.hiveDb = null;
    this.swarmDb = null;
  }

  /**
   * Initialize database connections
   */
  async initialize() {
    try {
      // Connect to hive-mind database
      if (await fs.pathExists(this.hiveDbPath)) {
        this.hiveDb = await open({
          filename: this.hiveDbPath,
          driver: sqlite3.Database
        });
      }

      // Connect to swarm memory database
      if (await fs.pathExists(this.swarmDbPath)) {
        this.swarmDb = await open({
          filename: this.swarmDbPath,
          driver: sqlite3.Database
        });
      }

      return { success: true, message: 'Analytics databases connected successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Analyze task completion patterns
   */
  async analyzeTaskPatterns() {
    if (!this.hiveDb) {
      throw new Error('Hive database not available');
    }

    try {
      // Task completion rates by status
      const statusAnalysis = await this.hiveDb.all(`
        SELECT
          status,
          COUNT(*) as count,
          AVG(actual_time) as avg_duration,
          AVG(complexity) as avg_complexity,
          ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM tasks), 2) as percentage
        FROM tasks
        GROUP BY status
        ORDER BY count DESC
      `);

      // Task completion trends over time
      const completionTrends = await this.hiveDb.all(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as total_tasks,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
          AVG(actual_time) as avg_completion_time,
          AVG(complexity) as avg_complexity
        FROM tasks
        WHERE created_at >= datetime('now', '-30 days')
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);

      // Agent performance analysis
      const agentPerformance = await this.hiveDb.all(`
        SELECT
          a.name,
          a.type,
          a.performance_score,
          a.success_rate,
          a.task_count,
          COUNT(t.id) as recent_tasks,
          AVG(t.actual_time) as avg_task_duration
        FROM agents a
        LEFT JOIN tasks t ON a.id = t.agent_id AND t.created_at >= datetime('now', '-7 days')
        GROUP BY a.id, a.name, a.type
        ORDER BY a.performance_score DESC
      `);

      // Task complexity vs success analysis
      const complexityAnalysis = await this.hiveDb.all(`
        SELECT
          CASE
            WHEN complexity <= 0.3 THEN 'Low'
            WHEN complexity <= 0.7 THEN 'Medium'
            ELSE 'High'
          END as complexity_level,
          COUNT(*) as total_tasks,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_tasks,
          AVG(actual_time) as avg_duration,
          ROUND(COUNT(CASE WHEN status = 'completed' THEN 1 END) * 100.0 / COUNT(*), 2) as success_rate
        FROM tasks
        GROUP BY complexity_level
        ORDER BY success_rate DESC
      `);

      return {
        statusAnalysis,
        completionTrends,
        agentPerformance,
        complexityAnalysis,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Task pattern analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze performance metrics and identify bottlenecks
   */
  async analyzePerformanceMetrics() {
    try {
      const metrics = {
        system: await this.loadSystemMetrics(),
        tasks: await this.loadTaskMetrics(),
        performance: await this.loadPerformanceMetrics()
      };

      // Identify performance bottlenecks
      const bottlenecks = await this.identifyBottlenecks(metrics);

      // Calculate performance trends
      const trends = this.calculatePerformanceTrends(metrics);

      // Resource utilization analysis
      const resourceAnalysis = this.analyzeResourceUtilization(metrics.system);

      return {
        metrics,
        bottlenecks,
        trends,
        resourceAnalysis,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Performance metrics analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze agent coordination patterns
   */
  async analyzeCoordinationPatterns() {
    if (!this.hiveDb) {
      throw new Error('Hive database not available');
    }

    try {
      // Swarm topology analysis
      const swarmTopology = await this.hiveDb.all(`
        SELECT
          topology,
          COUNT(*) as swarm_count,
          AVG(max_agents) as avg_agents,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_swarms
        FROM swarms
        GROUP BY topology
      `);

      // Agent collaboration patterns
      const collaborationPatterns = await this.hiveDb.all(`
        SELECT
          sender.type as sender_type,
          recipient.type as recipient_type,
          COUNT(*) as message_count,
          AVG(m.consensus_vote) as avg_consensus
        FROM messages m
        JOIN agents sender ON m.sender_id = sender.id
        JOIN agents recipient ON m.recipient_id = recipient.id
        WHERE m.timestamp >= datetime('now', '-7 days')
        GROUP BY sender.type, recipient.type
        ORDER BY message_count DESC
      `);

      // Consensus effectiveness
      const consensusAnalysis = await this.hiveDb.all(`
        SELECT
          proposal_id,
          COUNT(*) as vote_count,
          AVG(vote) as avg_vote,
          AVG(weight) as avg_weight,
          MIN(vote) as min_vote,
          MAX(vote) as max_vote
        FROM consensus_votes
        WHERE timestamp >= datetime('now', '-7 days')
        GROUP BY proposal_id
        ORDER BY avg_vote DESC
      `);

      // Knowledge sharing patterns
      const knowledgeSharing = await this.hiveDb.all(`
        SELECT
          category,
          COUNT(*) as knowledge_count,
          AVG(confidence) as avg_confidence,
          AVG(access_count) as avg_access_count,
          COUNT(DISTINCT source_agent_id) as contributing_agents
        FROM knowledge_base
        GROUP BY category
        ORDER BY knowledge_count DESC
      `);

      return {
        swarmTopology,
        collaborationPatterns,
        consensusAnalysis,
        knowledgeSharing,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Coordination pattern analysis failed: ${error.message}`);
    }
  }

  /**
   * Analyze memory usage patterns from swarm database
   */
  async analyzeMemoryPatterns() {
    if (!this.swarmDb) {
      return { message: 'Swarm memory database not available' };
    }

    try {
      // Memory usage by namespace
      const namespaceUsage = await this.swarmDb.all(`
        SELECT
          namespace,
          COUNT(*) as entry_count,
          AVG(access_count) as avg_access_count,
          AVG(LENGTH(value)) as avg_value_size,
          SUM(LENGTH(value)) as total_size
        FROM memory_entries
        GROUP BY namespace
        ORDER BY entry_count DESC
      `);

      // Memory access patterns
      const accessPatterns = await this.swarmDb.all(`
        SELECT
          key,
          namespace,
          access_count,
          LENGTH(value) as value_size,
          datetime(created_at, 'unixepoch') as created_date,
          datetime(accessed_at, 'unixepoch') as last_accessed
        FROM memory_entries
        WHERE access_count > 1
        ORDER BY access_count DESC
        LIMIT 50
      `);

      // Memory efficiency analysis
      const efficiencyAnalysis = await this.swarmDb.all(`
        SELECT
          CASE
            WHEN access_count = 0 THEN 'Unused'
            WHEN access_count <= 5 THEN 'Low Usage'
            WHEN access_count <= 20 THEN 'Medium Usage'
            ELSE 'High Usage'
          END as usage_category,
          COUNT(*) as entry_count,
          AVG(LENGTH(value)) as avg_size,
          SUM(LENGTH(value)) as total_size
        FROM memory_entries
        GROUP BY usage_category
        ORDER BY total_size DESC
      `);

      return {
        namespaceUsage,
        accessPatterns,
        efficiencyAnalysis,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Memory pattern analysis failed: ${error.message}`);
    }
  }

  /**
   * Load system metrics from JSON files
   */
  async loadSystemMetrics() {
    try {
      const systemMetricsPath = path.join(this.metricsPath, 'system-metrics.json');
      if (await fs.pathExists(systemMetricsPath)) {
        const data = await fs.readJson(systemMetricsPath);
        return Array.isArray(data) ? data : [data];
      }
      return [];
    } catch (error) {
      console.warn('Failed to load system metrics:', error.message);
      return [];
    }
  }

  /**
   * Load task metrics from JSON files
   */
  async loadTaskMetrics() {
    try {
      const taskMetricsPath = path.join(this.metricsPath, 'task-metrics.json');
      if (await fs.pathExists(taskMetricsPath)) {
        const data = await fs.readJson(taskMetricsPath);
        return Array.isArray(data) ? data : [data];
      }
      return [];
    } catch (error) {
      console.warn('Failed to load task metrics:', error.message);
      return [];
    }
  }

  /**
   * Load performance metrics from JSON files
   */
  async loadPerformanceMetrics() {
    try {
      const perfMetricsPath = path.join(this.metricsPath, 'performance.json');
      if (await fs.pathExists(perfMetricsPath)) {
        return await fs.readJson(perfMetricsPath);
      }
      return {};
    } catch (error) {
      console.warn('Failed to load performance metrics:', error.message);
      return {};
    }
  }

  /**
   * Identify performance bottlenecks
   */
  async identifyBottlenecks(metrics) {
    const bottlenecks = [];

    // Analyze system metrics for bottlenecks
    if (metrics.system && metrics.system.length > 0) {
      const recentMetrics = metrics.system.slice(-10); // Last 10 entries

      const avgMemoryUsage = recentMetrics.reduce((sum, m) => sum + m.memoryUsagePercent, 0) / recentMetrics.length;
      const avgCpuLoad = recentMetrics.reduce((sum, m) => sum + m.cpuLoad, 0) / recentMetrics.length;

      if (avgMemoryUsage > 80) {
        bottlenecks.push({
          type: 'memory',
          severity: 'high',
          value: avgMemoryUsage,
          description: 'High memory usage detected'
        });
      }

      if (avgCpuLoad > metrics.system[0]?.cpuCount * 0.8) {
        bottlenecks.push({
          type: 'cpu',
          severity: 'high',
          value: avgCpuLoad,
          description: 'High CPU load detected'
        });
      }
    }

    // Analyze task performance if available
    if (this.hiveDb) {
      const longRunningTasks = await this.hiveDb.all(`
        SELECT COUNT(*) as count
        FROM tasks
        WHERE actual_time > 300000 AND status = 'completed'
      `);

      if (longRunningTasks[0]?.count > 0) {
        bottlenecks.push({
          type: 'task_duration',
          severity: 'medium',
          value: longRunningTasks[0].count,
          description: `${longRunningTasks[0].count} tasks took longer than 5 minutes`
        });
      }
    }

    return bottlenecks;
  }

  /**
   * Calculate performance trends
   */
  calculatePerformanceTrends(metrics) {
    const trends = {};

    if (metrics.system && metrics.system.length >= 2) {
      const recent = metrics.system.slice(-5);
      const older = metrics.system.slice(-10, -5);

      if (older.length > 0) {
        const recentAvgMemory = recent.reduce((sum, m) => sum + m.memoryUsagePercent, 0) / recent.length;
        const olderAvgMemory = older.reduce((sum, m) => sum + m.memoryUsagePercent, 0) / older.length;

        trends.memoryTrend = recentAvgMemory > olderAvgMemory ? 'increasing' : 'decreasing';
        trends.memoryChange = Math.abs(recentAvgMemory - olderAvgMemory);

        const recentAvgCpu = recent.reduce((sum, m) => sum + m.cpuLoad, 0) / recent.length;
        const olderAvgCpu = older.reduce((sum, m) => sum + m.cpuLoad, 0) / older.length;

        trends.cpuTrend = recentAvgCpu > olderAvgCpu ? 'increasing' : 'decreasing';
        trends.cpuChange = Math.abs(recentAvgCpu - olderAvgCpu);
      }
    }

    return trends;
  }

  /**
   * Analyze resource utilization patterns
   */
  analyzeResourceUtilization(systemMetrics) {
    if (!systemMetrics || systemMetrics.length === 0) {
      return { message: 'No system metrics available' };
    }

    const analysis = {
      memory: {
        peak: Math.max(...systemMetrics.map(m => m.memoryUsagePercent)),
        average: systemMetrics.reduce((sum, m) => sum + m.memoryUsagePercent, 0) / systemMetrics.length,
        minimum: Math.min(...systemMetrics.map(m => m.memoryUsagePercent))
      },
      cpu: {
        peak: Math.max(...systemMetrics.map(m => m.cpuLoad)),
        average: systemMetrics.reduce((sum, m) => sum + m.cpuLoad, 0) / systemMetrics.length,
        minimum: Math.min(...systemMetrics.map(m => m.cpuLoad))
      },
      efficiency: {
        peak: Math.max(...systemMetrics.map(m => m.memoryEfficiency)),
        average: systemMetrics.reduce((sum, m) => sum + m.memoryEfficiency, 0) / systemMetrics.length,
        minimum: Math.min(...systemMetrics.map(m => m.memoryEfficiency))
      }
    };

    return analysis;
  }

  /**
   * Generate comprehensive analytics report
   */
  async generateComprehensiveReport() {
    await this.initialize();

    const report = {
      timestamp: new Date().toISOString(),
      databases: {
        hive: this.hiveDb !== null,
        swarm: this.swarmDb !== null
      },
      analysis: {}
    };

    try {
      // Task pattern analysis
      if (this.hiveDb) {
        report.analysis.taskPatterns = await this.analyzeTaskPatterns();
        report.analysis.coordinationPatterns = await this.analyzeCoordinationPatterns();
      }

      // Performance metrics analysis
      report.analysis.performance = await this.analyzePerformanceMetrics();

      // Memory pattern analysis
      if (this.swarmDb) {
        report.analysis.memoryPatterns = await this.analyzeMemoryPatterns();
      }

      return report;
    } catch (error) {
      report.error = error.message;
      return report;
    }
  }

  /**
   * Close database connections
   */
  async close() {
    try {
      if (this.hiveDb) {
        await this.hiveDb.close();
      }
      if (this.swarmDb) {
        await this.swarmDb.close();
      }
    } catch (error) {
      console.warn('Error closing databases:', error.message);
    }
  }
}

export default SQLiteAnalyzer;