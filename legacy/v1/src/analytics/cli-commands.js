/**
 * CLI Analytics Commands for Claude Flow
 * Provides command-line interface for analytics and reporting
 */

import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';

export class AnalyticsCLI {
  constructor(analyzer, optimizationEngine, suggestionGenerator) {
    this.analyzer = analyzer;
    this.optimizationEngine = optimizationEngine;
    this.suggestionGenerator = suggestionGenerator;
  }

  /**
   * Display analytics summary in CLI
   */
  async showAnalyticsSummary(options = {}) {
    console.log(chalk.blue.bold('\n🔍 Claude Flow Analytics Summary\n'));

    try {
      await this.analyzer.initialize();
      const report = await this.analyzer.generateComprehensiveReport();

      // System Health
      this.displaySystemHealth(report.analysis.performance);

      // Task Performance
      if (report.analysis.taskPatterns) {
        this.displayTaskPerformance(report.analysis.taskPatterns);
      }

      // Agent Status
      if (report.analysis.taskPatterns && report.analysis.taskPatterns.agentPerformance) {
        this.displayAgentStatus(report.analysis.taskPatterns.agentPerformance);
      }

      // Coordination Health
      if (report.analysis.coordinationPatterns) {
        this.displayCoordinationHealth(report.analysis.coordinationPatterns);
      }

      // Memory Usage
      if (report.analysis.memoryPatterns) {
        this.displayMemoryUsage(report.analysis.memoryPatterns);
      }

      if (options.verbose) {
        await this.showDetailedMetrics(report);
      }
    } catch (error) {
      console.error(chalk.red('❌ Error generating analytics:'), error.message);
      if (options.debug) {
        console.error(error.stack);
      }
    }
  }

  /**
   * Display system health metrics
   */
  displaySystemHealth(performanceAnalysis) {
    console.log(chalk.yellow.bold('📊 System Health'));

    if (!performanceAnalysis || !performanceAnalysis.resourceAnalysis) {
      console.log(chalk.gray('   No system metrics available\n'));
      return;
    }

    const { resourceAnalysis, bottlenecks } = performanceAnalysis;

    // Memory metrics
    if (resourceAnalysis.memory) {
      const memUsage = resourceAnalysis.memory.average;
      const memEfficiency = resourceAnalysis.efficiency?.average;

      console.log(`   Memory Usage:    ${this.formatMetric(memUsage, '%', 75, 90)}`);
      console.log(`   Memory Efficiency: ${this.formatMetric(memEfficiency, '%', 60, 40, true)}`);
    }

    // CPU metrics
    if (resourceAnalysis.cpu) {
      const cpuLoad = resourceAnalysis.cpu.average;
      console.log(`   CPU Load:        ${this.formatMetric(cpuLoad, '', 2.0, 4.0)}`);
    }

    // Bottlenecks
    if (bottlenecks && bottlenecks.length > 0) {
      console.log(chalk.red('   ⚠️  Bottlenecks detected:'));
      bottlenecks.forEach((bottleneck) => {
        const severity =
          bottleneck.severity === 'high'
            ? chalk.red('HIGH')
            : bottleneck.severity === 'medium'
              ? chalk.yellow('MED')
              : chalk.gray('LOW');
        console.log(`      ${severity}: ${bottleneck.description}`);
      });
    } else {
      console.log(chalk.green('   ✅ No performance bottlenecks detected'));
    }

    console.log();
  }

  /**
   * Display task performance metrics
   */
  displayTaskPerformance(taskPatterns) {
    console.log(chalk.yellow.bold('📋 Task Performance'));

    const { statusAnalysis, complexityAnalysis } = taskPatterns;

    if (statusAnalysis) {
      const total = statusAnalysis.reduce((sum, s) => sum + s.count, 0);
      const completed = statusAnalysis.find((s) => s.status === 'completed')?.count || 0;
      const failed = statusAnalysis.find((s) => s.status === 'failed')?.count || 0;
      const successRate = total > 0 ? (completed / total) * 100 : 0;

      console.log(`   Total Tasks:     ${chalk.cyan(total)}`);
      console.log(`   Completed:       ${chalk.green(completed)}`);
      console.log(`   Failed:          ${chalk.red(failed)}`);
      console.log(`   Success Rate:    ${this.formatMetric(successRate, '%', 80, 60, true)}`);

      // Show status breakdown
      console.log('\n   Status Breakdown:');
      statusAnalysis.forEach((status) => {
        const bar = this.createProgressBar(status.percentage, 20);
        console.log(
          `   ${status.status.padEnd(12)} ${bar} ${status.percentage.toFixed(1)}% (${status.count})`,
        );
      });
    }

    if (complexityAnalysis) {
      console.log('\n   Complexity Analysis:');
      complexityAnalysis.forEach((complexity) => {
        const successRate = complexity.success_rate;
        console.log(
          `   ${complexity.complexity_level.padEnd(8)} ${this.formatMetric(successRate, '%', 80, 60, true)} (${complexity.total_tasks} tasks)`,
        );
      });
    }

    console.log();
  }

  /**
   * Display agent status
   */
  displayAgentStatus(agentPerformance) {
    console.log(chalk.yellow.bold('🤖 Agent Status'));

    const totalAgents = agentPerformance.length;
    const activeAgents = agentPerformance.filter((a) => a.recent_tasks > 0).length;
    const avgPerformance =
      agentPerformance.reduce((sum, a) => sum + a.performance_score, 0) / totalAgents;

    console.log(`   Total Agents:    ${chalk.cyan(totalAgents)}`);
    console.log(`   Active Agents:   ${chalk.green(activeAgents)}`);
    console.log(
      `   Avg Performance: ${this.formatMetric(avgPerformance * 100, '%', 70, 50, true)}`,
    );

    // Top performers
    const topAgents = agentPerformance
      .sort((a, b) => b.performance_score - a.performance_score)
      .slice(0, 3);

    console.log('\n   Top Performers:');
    topAgents.forEach((agent, index) => {
      const score = (agent.performance_score * 100).toFixed(1);
      const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
      console.log(
        `   ${medal} ${agent.name.padEnd(20)} ${this.formatMetric(parseFloat(score), '%', 70, 50, true)} (${agent.task_count} tasks)`,
      );
    });

    // Agent type distribution
    const typeDistribution = agentPerformance.reduce((dist, agent) => {
      dist[agent.type] = (dist[agent.type] || 0) + 1;
      return dist;
    }, {});

    console.log('\n   Agent Types:');
    Object.entries(typeDistribution).forEach(([type, count]) => {
      const percentage = (count / totalAgents) * 100;
      const bar = this.createProgressBar(percentage, 15);
      console.log(`   ${type.padEnd(15)} ${bar} ${count} (${percentage.toFixed(1)}%)`);
    });

    console.log();
  }

  /**
   * Display coordination health
   */
  displayCoordinationHealth(coordinationPatterns) {
    console.log(chalk.yellow.bold('🔗 Coordination Health'));

    const { swarmTopology, consensusAnalysis, knowledgeSharing } = coordinationPatterns;

    // Swarm topology
    if (swarmTopology) {
      console.log('   Swarm Topologies:');
      swarmTopology.forEach((topo) => {
        console.log(
          `   ${topo.topology.padEnd(15)} ${topo.swarm_count} swarms, ${topo.avg_agents.toFixed(1)} avg agents`,
        );
      });
    }

    // Consensus effectiveness
    if (consensusAnalysis && consensusAnalysis.length > 0) {
      const avgConsensus =
        consensusAnalysis.reduce((sum, c) => sum + c.avg_vote, 0) / consensusAnalysis.length;
      console.log(
        `   Consensus Score:  ${this.formatMetric(avgConsensus * 100, '%', 70, 50, true)}`,
      );
    }

    // Knowledge sharing
    if (knowledgeSharing) {
      const totalKnowledge = knowledgeSharing.reduce((sum, k) => sum + k.knowledge_count, 0);
      const avgAccess =
        knowledgeSharing.reduce((sum, k) => sum + k.avg_access_count, 0) / knowledgeSharing.length;

      console.log(`   Knowledge Items:  ${chalk.cyan(totalKnowledge)}`);
      console.log(`   Avg Access Rate:  ${this.formatMetric(avgAccess, '', 5, 2, true)}`);
    }

    console.log();
  }

  /**
   * Display memory usage patterns
   */
  displayMemoryUsage(memoryPatterns) {
    console.log(chalk.yellow.bold('💾 Memory Usage'));

    const { namespaceUsage, efficiencyAnalysis } = memoryPatterns;

    if (namespaceUsage) {
      console.log('   Namespace Usage:');
      const sortedNamespaces = namespaceUsage
        .sort((a, b) => b.entry_count - a.entry_count)
        .slice(0, 5);

      sortedNamespaces.forEach((ns) => {
        const size = this.formatBytes(ns.total_size);
        console.log(
          `   ${ns.namespace.padEnd(15)} ${ns.entry_count.toString().padStart(4)} entries, ${size}`,
        );
      });
    }

    if (efficiencyAnalysis) {
      console.log('\n   Usage Efficiency:');
      efficiencyAnalysis.forEach((eff) => {
        const size = this.formatBytes(eff.total_size);
        console.log(
          `   ${eff.usage_category.padEnd(15)} ${eff.entry_count.toString().padStart(4)} entries, ${size}`,
        );
      });
    }

    console.log();
  }

  /**
   * Show optimization suggestions
   */
  async showOptimizationSuggestions(options = {}) {
    console.log(chalk.blue.bold('\n🚀 Optimization Suggestions\n'));

    try {
      const optimizations = await this.optimizationEngine.generateOptimizationSuggestions();

      // High priority suggestions
      if (optimizations.priority.high.length > 0) {
        console.log(chalk.red.bold('🔴 Immediate Actions Required'));
        this.displaySuggestions(optimizations.priority.high, options.detailed);
      }

      // Medium priority suggestions
      if (optimizations.priority.medium.length > 0) {
        console.log(chalk.yellow.bold('🟡 Short-term Improvements'));
        this.displaySuggestions(optimizations.priority.medium.slice(0, 5), options.detailed);
      }

      // Low priority suggestions (only show top 3)
      if (optimizations.priority.low.length > 0 && options.showAll) {
        console.log(chalk.green.bold('🟢 Long-term Optimizations'));
        this.displaySuggestions(optimizations.priority.low.slice(0, 3), options.detailed);
      }

      // Summary
      console.log(chalk.blue.bold('📊 Summary'));
      console.log(`   High Priority: ${chalk.red(optimizations.priority.high.length)} suggestions`);
      console.log(
        `   Medium Priority: ${chalk.yellow(optimizations.priority.medium.length)} suggestions`,
      );
      console.log(`   Low Priority: ${chalk.green(optimizations.priority.low.length)} suggestions`);
    } catch (error) {
      console.error(chalk.red('❌ Error generating optimization suggestions:'), error.message);
    }
  }

  /**
   * Display suggestions list
   */
  displaySuggestions(suggestions, detailed = false) {
    suggestions.forEach((suggestion, index) => {
      console.log(`\n   ${index + 1}. ${chalk.bold(suggestion.title)}`);
      console.log(`      ${suggestion.description}`);
      console.log(
        `      Impact: ${this.formatImpact(suggestion.impact)} | Effort: ${this.formatEffort(suggestion.effort)}`,
      );

      if (detailed && suggestion.suggestions) {
        console.log('      Actions:');
        suggestion.suggestions.slice(0, 3).forEach((action) => {
          console.log(`        • ${action}`);
        });
      }
    });
    console.log();
  }

  /**
   * Show personalized suggestions
   */
  async showPersonalizedSuggestions(options = {}) {
    console.log(chalk.blue.bold('\n👤 Personalized Recommendations\n'));

    try {
      await this.suggestionGenerator.initialize();
      const personalizedSuggestions =
        await this.suggestionGenerator.generatePersonalizedSuggestions();

      // User profile
      console.log(chalk.yellow.bold('Your Profile:'));
      const profile = personalizedSuggestions.user;
      console.log(`   Experience Level: ${chalk.cyan(profile.experience_level)}`);
      console.log(`   Working Style:    ${chalk.cyan(profile.working_style.type)}`);

      // Immediate suggestions
      if (personalizedSuggestions.suggestions.immediate.length > 0) {
        console.log(chalk.red.bold('\n🎯 Tailored for You - Immediate'));
        this.displayPersonalizedSuggestions(personalizedSuggestions.suggestions.immediate);
      }

      // Short-term suggestions
      if (personalizedSuggestions.suggestions.shortTerm.length > 0) {
        console.log(chalk.yellow.bold('\n📅 Short-term Goals'));
        this.displayPersonalizedSuggestions(
          personalizedSuggestions.suggestions.shortTerm.slice(0, 3),
        );
      }

      // Learning suggestions
      if (personalizedSuggestions.suggestions.learning.length > 0) {
        console.log(chalk.blue.bold('\n🧠 Learning Opportunities'));
        this.displayPersonalizedSuggestions(
          personalizedSuggestions.suggestions.learning.slice(0, 3),
        );
      }
    } catch (error) {
      console.error(chalk.red('❌ Error generating personalized suggestions:'), error.message);
    }
  }

  /**
   * Display personalized suggestions
   */
  displayPersonalizedSuggestions(suggestions) {
    suggestions.forEach((suggestion, index) => {
      console.log(`\n   ${index + 1}. ${chalk.bold(suggestion.title)}`);
      console.log(`      ${suggestion.description}`);

      if (suggestion.personalization) {
        const relevance = suggestion.personalization.relevance_score;
        console.log(`      Relevance: ${this.formatMetric(relevance * 100, '%', 80, 60, true)}`);
      }

      if (suggestion.implementation_steps) {
        console.log('      Steps:');
        suggestion.implementation_steps.slice(0, 2).forEach((step) => {
          console.log(`        • ${step}`);
        });
      }
    });
    console.log();
  }

  /**
   * Generate and export analytics report
   */
  async exportAnalyticsReport(format = 'json', outputPath = null) {
    console.log(chalk.blue.bold('\n📄 Generating Analytics Report\n'));

    try {
      await this.analyzer.initialize();
      const report = await this.analyzer.generateComprehensiveReport();
      const optimizations = await this.optimizationEngine.generateOptimizationSuggestions();

      const fullReport = {
        timestamp: new Date().toISOString(),
        analytics: report,
        optimizations: optimizations,
        metadata: {
          version: '1.0.0',
          generated_by: 'Claude Flow Analytics CLI',
          format: format,
        },
      };

      // Determine output path
      const reportsDir = '.claude-flow/reports';
      await fs.ensureDir(reportsDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const defaultPath = path.join(reportsDir, `analytics-report-${timestamp}.${format}`);
      const filePath = outputPath || defaultPath;

      // Export in requested format
      switch (format.toLowerCase()) {
        case 'json':
          await fs.writeJson(filePath, fullReport, { spaces: 2 });
          break;
        case 'txt':
          const textReport = this.generateTextReport(fullReport);
          await fs.writeFile(filePath, textReport);
          break;
        case 'csv':
          const csvReport = this.generateCSVReport(fullReport);
          await fs.writeFile(filePath, csvReport);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      console.log(chalk.green(`✅ Report exported to: ${filePath}`));
      console.log(`   Format: ${format.toUpperCase()}`);
      console.log(`   Size: ${this.formatBytes((await fs.stat(filePath)).size)}`);
    } catch (error) {
      console.error(chalk.red('❌ Error exporting report:'), error.message);
    }
  }

  /**
   * Show task insights for specific task
   */
  async showTaskInsights(taskId) {
    console.log(chalk.blue.bold(`\n🔍 Task Insights: ${taskId}\n`));

    try {
      await this.suggestionGenerator.initialize();
      const insights = await this.suggestionGenerator.generatePostTaskInsights(taskId);

      console.log(chalk.yellow.bold('Task Details:'));
      console.log(`   Status: ${this.formatTaskStatus(insights.task.status)}`);
      console.log(
        `   Complexity: ${this.formatMetric(insights.task.complexity * 100, '%', 50, 80)}`,
      );
      console.log(`   Duration: ${insights.task.actual_time || 'N/A'}ms`);
      console.log(`   Agent: ${insights.task.agent_type}`);

      console.log(chalk.yellow.bold('\nPerformance Metrics:'));
      console.log(
        `   Rating: ${this.formatMetric(insights.performance.rating * 100, '%', 70, 50, true)}`,
      );
      console.log(
        `   Efficiency: ${this.formatMetric(insights.performance.efficiency * 100, '%', 70, 50, true)}`,
      );
      console.log(
        `   Quality: ${this.formatMetric(insights.performance.quality * 100, '%', 70, 50, true)}`,
      );

      if (insights.suggestions.length > 0) {
        console.log(chalk.yellow.bold('\nSuggestions:'));
        insights.suggestions.forEach((suggestion, index) => {
          console.log(`\n   ${index + 1}. ${chalk.bold(suggestion.title)}`);
          console.log(`      ${suggestion.description}`);
          if (suggestion.suggestions) {
            suggestion.suggestions.slice(0, 2).forEach((s) => {
              console.log(`        • ${s}`);
            });
          }
        });
      }

      if (insights.learningOpportunities.length > 0) {
        console.log(chalk.blue.bold('\nLearning Opportunities:'));
        insights.learningOpportunities.forEach((opp) => {
          console.log(`   • ${opp.description}`);
        });
      }
    } catch (error) {
      console.error(chalk.red('❌ Error generating task insights:'), error.message);
    }
  }

  /**
   * Helper methods for formatting
   */
  formatMetric(value, unit, goodThreshold, badThreshold, higherIsBetter = false) {
    const numValue = parseFloat(value) || 0;
    const formattedValue = `${numValue.toFixed(1)}${unit}`;

    let color;
    if (higherIsBetter) {
      if (numValue >= goodThreshold) color = chalk.green;
      else if (numValue >= badThreshold) color = chalk.yellow;
      else color = chalk.red;
    } else {
      if (numValue <= goodThreshold) color = chalk.green;
      else if (numValue <= badThreshold) color = chalk.yellow;
      else color = chalk.red;
    }

    return color(formattedValue);
  }

  formatImpact(impact) {
    const colors = {
      high: chalk.red,
      medium: chalk.yellow,
      low: chalk.green,
    };
    return colors[impact]?.(impact.toUpperCase()) || chalk.gray(impact);
  }

  formatEffort(effort) {
    const colors = {
      high: chalk.red,
      medium: chalk.yellow,
      low: chalk.green,
    };
    return colors[effort]?.(effort.toUpperCase()) || chalk.gray(effort);
  }

  formatTaskStatus(status) {
    const colors = {
      completed: chalk.green,
      failed: chalk.red,
      pending: chalk.yellow,
      in_progress: chalk.blue,
    };
    return colors[status]?.(status.toUpperCase()) || chalk.gray(status);
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  createProgressBar(percentage, width = 20) {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }

  generateTextReport(report) {
    let text = 'CLAUDE FLOW ANALYTICS REPORT\n';
    text += '='.repeat(50) + '\n\n';
    text += `Generated: ${report.timestamp}\n\n`;

    // Add summary sections
    text += 'SYSTEM SUMMARY:\n';
    text += '-'.repeat(20) + '\n';
    // Add relevant sections from the report

    return text;
  }

  generateCSVReport(report) {
    let csv = 'Category,Metric,Value,Unit,Timestamp\n';

    // Add data rows
    if (report.analytics.analysis.performance) {
      const perf = report.analytics.analysis.performance;
      if (perf.resourceAnalysis) {
        csv += `System,Memory Usage,${perf.resourceAnalysis.memory?.average || 0},%,${report.timestamp}\n`;
        csv += `System,CPU Load,${perf.resourceAnalysis.cpu?.average || 0},,${report.timestamp}\n`;
      }
    }

    return csv;
  }
}

export default AnalyticsCLI;
