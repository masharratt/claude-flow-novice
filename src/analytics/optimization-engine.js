/**
 * Optimization Engine for Claude Flow
 * Generates workflow optimization suggestions based on analytics data
 */

export class OptimizationEngine {
  constructor(analyzer) {
    this.analyzer = analyzer;
    this.optimizationRules = this.initializeOptimizationRules();
  }

  /**
   * Initialize optimization rules based on best practices
   */
  initializeOptimizationRules() {
    return {
      performance: {
        highMemoryUsage: {
          threshold: 75,
          priority: 'high',
          suggestions: [
            'Consider reducing concurrent agent count',
            'Implement memory cleanup routines',
            'Use memory-efficient data structures',
            'Add garbage collection optimization'
          ]
        },
        highCpuLoad: {
          threshold: 2.0, // Per core
          priority: 'high',
          suggestions: [
            'Distribute tasks across more time intervals',
            'Optimize algorithm complexity',
            'Use asynchronous processing where possible',
            'Consider task batching strategies'
          ]
        },
        longTaskDuration: {
          threshold: 300000, // 5 minutes in ms
          priority: 'medium',
          suggestions: [
            'Break down complex tasks into smaller subtasks',
            'Implement task parallelization',
            'Add progress checkpoints',
            'Consider timeout mechanisms'
          ]
        }
      },
      coordination: {
        lowConsensusVotes: {
          threshold: 0.6,
          priority: 'medium',
          suggestions: [
            'Improve agent communication protocols',
            'Add consensus weight balancing',
            'Implement better conflict resolution',
            'Review agent role assignments'
          ]
        },
        unbalancedAgentTypes: {
          threshold: 0.3, // 30% variance
          priority: 'low',
          suggestions: [
            'Rebalance agent type distribution',
            'Consider specialized agent roles',
            'Optimize agent skill matching',
            'Implement dynamic agent allocation'
          ]
        },
        lowKnowledgeSharing: {
          threshold: 2, // Average access count
          priority: 'medium',
          suggestions: [
            'Improve knowledge discovery mechanisms',
            'Add knowledge recommendation systems',
            'Implement cross-agent learning',
            'Enhance knowledge tagging and categorization'
          ]
        }
      },
      workflow: {
        lowSuccessRate: {
          threshold: 0.8,
          priority: 'high',
          suggestions: [
            'Analyze failed task patterns',
            'Implement retry mechanisms',
            'Add task validation steps',
            'Improve error handling'
          ]
        },
        inefficientMemoryUsage: {
          threshold: 5, // Low access count
          priority: 'low',
          suggestions: [
            'Implement memory cleanup for unused entries',
            'Add TTL (Time To Live) for temporary data',
            'Optimize data structure sizes',
            'Use compression for large values'
          ]
        }
      }
    };
  }

  /**
   * Generate comprehensive optimization suggestions
   */
  async generateOptimizationSuggestions() {
    const report = await this.analyzer.generateComprehensiveReport();
    const suggestions = {
      timestamp: new Date().toISOString(),
      priority: { high: [], medium: [], low: [] },
      categories: {
        performance: [],
        coordination: [],
        workflow: [],
        automation: []
      },
      recommendations: [],
      metrics: this.extractKeyMetrics(report)
    };

    // Analyze performance metrics
    if (report.analysis.performance) {
      this.analyzePerformanceOptimizations(report.analysis.performance, suggestions);
    }

    // Analyze coordination patterns
    if (report.analysis.coordinationPatterns) {
      this.analyzeCoordinationOptimizations(report.analysis.coordinationPatterns, suggestions);
    }

    // Analyze task patterns
    if (report.analysis.taskPatterns) {
      this.analyzeWorkflowOptimizations(report.analysis.taskPatterns, suggestions);
    }

    // Analyze memory patterns
    if (report.analysis.memoryPatterns) {
      this.analyzeMemoryOptimizations(report.analysis.memoryPatterns, suggestions);
    }

    // Generate automation recommendations
    this.generateAutomationRecommendations(report, suggestions);

    // Sort suggestions by priority
    this.prioritizeSuggestions(suggestions);

    return suggestions;
  }

  /**
   * Analyze performance-related optimizations
   */
  analyzePerformanceOptimizations(performanceData, suggestions) {
    const { resourceAnalysis, bottlenecks, trends } = performanceData;

    // Check memory usage
    if (resourceAnalysis && resourceAnalysis.memory) {
      if (resourceAnalysis.memory.average > this.optimizationRules.performance.highMemoryUsage.threshold) {
        const suggestion = {
          category: 'performance',
          type: 'memory_optimization',
          priority: 'high',
          title: 'High Memory Usage Detected',
          description: `Average memory usage is ${resourceAnalysis.memory.average.toFixed(1)}%`,
          suggestions: this.optimizationRules.performance.highMemoryUsage.suggestions,
          impact: 'high',
          effort: 'medium'
        };
        suggestions.categories.performance.push(suggestion);
        suggestions.priority.high.push(suggestion);
      }
    }

    // Check CPU load
    if (resourceAnalysis && resourceAnalysis.cpu) {
      if (resourceAnalysis.cpu.average > this.optimizationRules.performance.highCpuLoad.threshold) {
        const suggestion = {
          category: 'performance',
          type: 'cpu_optimization',
          priority: 'high',
          title: 'High CPU Load Detected',
          description: `Average CPU load is ${resourceAnalysis.cpu.average.toFixed(2)}`,
          suggestions: this.optimizationRules.performance.highCpuLoad.suggestions,
          impact: 'high',
          effort: 'medium'
        };
        suggestions.categories.performance.push(suggestion);
        suggestions.priority.high.push(suggestion);
      }
    }

    // Analyze bottlenecks
    if (bottlenecks && bottlenecks.length > 0) {
      bottlenecks.forEach(bottleneck => {
        const suggestion = {
          category: 'performance',
          type: 'bottleneck_resolution',
          priority: bottleneck.severity,
          title: `${bottleneck.type} Bottleneck`,
          description: bottleneck.description,
          suggestions: this.generateBottleneckSuggestions(bottleneck.type),
          impact: bottleneck.severity,
          effort: 'medium'
        };
        suggestions.categories.performance.push(suggestion);
        suggestions.priority[bottleneck.severity].push(suggestion);
      });
    }

    // Analyze trends
    if (trends) {
      if (trends.memoryTrend === 'increasing' && trends.memoryChange > 10) {
        const suggestion = {
          category: 'performance',
          type: 'memory_trend',
          priority: 'medium',
          title: 'Increasing Memory Usage Trend',
          description: `Memory usage increased by ${trends.memoryChange.toFixed(1)}%`,
          suggestions: [
            'Monitor memory usage patterns',
            'Implement proactive memory management',
            'Consider memory usage alerts',
            'Review memory-intensive operations'
          ],
          impact: 'medium',
          effort: 'low'
        };
        suggestions.categories.performance.push(suggestion);
        suggestions.priority.medium.push(suggestion);
      }
    }
  }

  /**
   * Analyze coordination-related optimizations
   */
  analyzeCoordinationOptimizations(coordinationData, suggestions) {
    const { consensusAnalysis, collaborationPatterns, knowledgeSharing, swarmTopology } = coordinationData;

    // Check consensus effectiveness
    if (consensusAnalysis && consensusAnalysis.length > 0) {
      const avgConsensus = consensusAnalysis.reduce((sum, item) => sum + item.avg_vote, 0) / consensusAnalysis.length;

      if (avgConsensus < this.optimizationRules.coordination.lowConsensusVotes.threshold) {
        const suggestion = {
          category: 'coordination',
          type: 'consensus_improvement',
          priority: 'medium',
          title: 'Low Consensus Effectiveness',
          description: `Average consensus vote is ${avgConsensus.toFixed(2)}`,
          suggestions: this.optimizationRules.coordination.lowConsensusVotes.suggestions,
          impact: 'medium',
          effort: 'high'
        };
        suggestions.categories.coordination.push(suggestion);
        suggestions.priority.medium.push(suggestion);
      }
    }

    // Check knowledge sharing patterns
    if (knowledgeSharing && knowledgeSharing.length > 0) {
      const lowAccessItems = knowledgeSharing.filter(item =>
        item.avg_access_count < this.optimizationRules.coordination.lowKnowledgeSharing.threshold
      );

      if (lowAccessItems.length > knowledgeSharing.length * 0.5) {
        const suggestion = {
          category: 'coordination',
          type: 'knowledge_sharing',
          priority: 'medium',
          title: 'Low Knowledge Sharing Activity',
          description: `${lowAccessItems.length} knowledge categories have low access rates`,
          suggestions: this.optimizationRules.coordination.lowKnowledgeSharing.suggestions,
          impact: 'medium',
          effort: 'medium'
        };
        suggestions.categories.coordination.push(suggestion);
        suggestions.priority.medium.push(suggestion);
      }
    }

    // Analyze swarm topology effectiveness
    if (swarmTopology && swarmTopology.length > 0) {
      const topologyEfficiency = this.analyzeTopologyEfficiency(swarmTopology);

      if (topologyEfficiency.needsOptimization) {
        const suggestion = {
          category: 'coordination',
          type: 'topology_optimization',
          priority: 'medium',
          title: 'Swarm Topology Optimization',
          description: topologyEfficiency.description,
          suggestions: topologyEfficiency.suggestions,
          impact: 'medium',
          effort: 'high'
        };
        suggestions.categories.coordination.push(suggestion);
        suggestions.priority.medium.push(suggestion);
      }
    }
  }

  /**
   * Analyze workflow-related optimizations
   */
  analyzeWorkflowOptimizations(taskData, suggestions) {
    const { statusAnalysis, agentPerformance, complexityAnalysis } = taskData;

    // Check task success rates
    if (statusAnalysis) {
      const completedTasks = statusAnalysis.find(item => item.status === 'completed');
      const totalTasks = statusAnalysis.reduce((sum, item) => sum + item.count, 0);
      const successRate = completedTasks ? completedTasks.count / totalTasks : 0;

      if (successRate < this.optimizationRules.workflow.lowSuccessRate.threshold) {
        const suggestion = {
          category: 'workflow',
          type: 'success_rate_improvement',
          priority: 'high',
          title: 'Low Task Success Rate',
          description: `Task success rate is ${(successRate * 100).toFixed(1)}%`,
          suggestions: this.optimizationRules.workflow.lowSuccessRate.suggestions,
          impact: 'high',
          effort: 'high'
        };
        suggestions.categories.workflow.push(suggestion);
        suggestions.priority.high.push(suggestion);
      }
    }

    // Analyze agent performance disparities
    if (agentPerformance && agentPerformance.length > 0) {
      const performanceVariance = this.calculateAgentPerformanceVariance(agentPerformance);

      if (performanceVariance > this.optimizationRules.coordination.unbalancedAgentTypes.threshold) {
        const suggestion = {
          category: 'workflow',
          type: 'agent_balancing',
          priority: 'medium',
          title: 'Unbalanced Agent Performance',
          description: `High variance in agent performance detected (${(performanceVariance * 100).toFixed(1)}%)`,
          suggestions: this.optimizationRules.coordination.unbalancedAgentTypes.suggestions,
          impact: 'medium',
          effort: 'medium'
        };
        suggestions.categories.workflow.push(suggestion);
        suggestions.priority.medium.push(suggestion);
      }
    }

    // Analyze task complexity vs success rates
    if (complexityAnalysis) {
      const problematicComplexity = complexityAnalysis.find(item =>
        item.complexity_level === 'High' && item.success_rate < 60
      );

      if (problematicComplexity) {
        const suggestion = {
          category: 'workflow',
          type: 'complexity_management',
          priority: 'high',
          title: 'High-Complexity Task Issues',
          description: `High complexity tasks have ${problematicComplexity.success_rate}% success rate`,
          suggestions: [
            'Break down high-complexity tasks into smaller components',
            'Add complexity-based task routing',
            'Implement specialized agents for complex tasks',
            'Add task complexity estimation improvements'
          ],
          impact: 'high',
          effort: 'high'
        };
        suggestions.categories.workflow.push(suggestion);
        suggestions.priority.high.push(suggestion);
      }
    }
  }

  /**
   * Analyze memory usage optimizations
   */
  analyzeMemoryOptimizations(memoryData, suggestions) {
    const { efficiencyAnalysis, accessPatterns } = memoryData;

    // Check for unused memory entries
    if (efficiencyAnalysis) {
      const unusedEntry = efficiencyAnalysis.find(item => item.usage_category === 'Unused');

      if (unusedEntry && unusedEntry.entry_count > 50) {
        const suggestion = {
          category: 'performance',
          type: 'memory_cleanup',
          priority: 'medium',
          title: 'Unused Memory Entries Detected',
          description: `${unusedEntry.entry_count} unused memory entries consuming ${this.formatBytes(unusedEntry.total_size)}`,
          suggestions: this.optimizationRules.workflow.inefficientMemoryUsage.suggestions,
          impact: 'medium',
          effort: 'low'
        };
        suggestions.categories.performance.push(suggestion);
        suggestions.priority.medium.push(suggestion);
      }
    }

    // Analyze access patterns for optimization opportunities
    if (accessPatterns && accessPatterns.length > 0) {
      const hotData = accessPatterns.slice(0, 10); // Top 10 most accessed
      const totalSize = hotData.reduce((sum, item) => sum + item.value_size, 0);

      if (totalSize > 1024 * 1024) { // > 1MB
        const suggestion = {
          category: 'performance',
          type: 'memory_caching',
          priority: 'low',
          title: 'Memory Caching Optimization Opportunity',
          description: `Top 10 accessed entries consume ${this.formatBytes(totalSize)}`,
          suggestions: [
            'Implement intelligent caching for frequently accessed data',
            'Consider data compression for large values',
            'Add memory pooling for common data structures',
            'Implement lazy loading for infrequently accessed data'
          ],
          impact: 'medium',
          effort: 'medium'
        };
        suggestions.categories.performance.push(suggestion);
        suggestions.priority.low.push(suggestion);
      }
    }
  }

  /**
   * Generate automation recommendations
   */
  generateAutomationRecommendations(report, suggestions) {
    const automationOpportunities = [];

    // Analyze patterns for automation opportunities
    if (report.analysis.taskPatterns) {
      const { statusAnalysis, completionTrends } = report.analysis.taskPatterns;

      // Suggest automation for repetitive tasks
      if (completionTrends && completionTrends.length >= 7) {
        const consistentPatterns = this.identifyConsistentPatterns(completionTrends);

        if (consistentPatterns.length > 0) {
          automationOpportunities.push({
            type: 'task_automation',
            title: 'Repetitive Task Automation',
            description: 'Consistent task patterns detected that could be automated',
            suggestions: [
              'Implement task templates for common patterns',
              'Add automated task scheduling',
              'Create workflow presets',
              'Implement smart task routing'
            ],
            impact: 'high',
            effort: 'high'
          });
        }
      }
    }

    // Suggest monitoring automation
    if (report.analysis.performance && report.analysis.performance.bottlenecks.length > 0) {
      automationOpportunities.push({
        type: 'monitoring_automation',
        title: 'Performance Monitoring Automation',
        description: 'Automated alerts and responses for performance issues',
        suggestions: [
          'Implement automated performance alerts',
          'Add self-healing mechanisms for common issues',
          'Create performance baseline monitoring',
          'Implement predictive performance analysis'
        ],
        impact: 'medium',
        effort: 'medium'
      });
    }

    // Add automation suggestions to the recommendations
    automationOpportunities.forEach(opportunity => {
      const suggestion = {
        category: 'automation',
        type: opportunity.type,
        priority: 'medium',
        title: opportunity.title,
        description: opportunity.description,
        suggestions: opportunity.suggestions,
        impact: opportunity.impact,
        effort: opportunity.effort
      };

      suggestions.categories.automation.push(suggestion);
      suggestions.priority.medium.push(suggestion);
    });
  }

  /**
   * Extract key metrics for reporting
   */
  extractKeyMetrics(report) {
    const metrics = {};

    if (report.analysis.performance) {
      const { resourceAnalysis } = report.analysis.performance;
      if (resourceAnalysis) {
        metrics.memory = {
          usage: resourceAnalysis.memory?.average,
          efficiency: resourceAnalysis.efficiency?.average
        };
        metrics.cpu = {
          load: resourceAnalysis.cpu?.average
        };
      }
    }

    if (report.analysis.taskPatterns) {
      const { statusAnalysis } = report.analysis.taskPatterns;
      if (statusAnalysis) {
        const completed = statusAnalysis.find(s => s.status === 'completed');
        const total = statusAnalysis.reduce((sum, s) => sum + s.count, 0);
        metrics.tasks = {
          successRate: completed ? completed.count / total : 0,
          total: total
        };
      }
    }

    return metrics;
  }

  /**
   * Generate suggestions for specific bottleneck types
   */
  generateBottleneckSuggestions(bottleneckType) {
    const suggestions = {
      memory: [
        'Implement memory pooling',
        'Add garbage collection optimization',
        'Use streaming for large data processing',
        'Implement data compression'
      ],
      cpu: [
        'Optimize algorithm complexity',
        'Implement task batching',
        'Use worker threads for CPU-intensive tasks',
        'Add task prioritization'
      ],
      task_duration: [
        'Break tasks into smaller chunks',
        'Add progress checkpoints',
        'Implement task timeouts',
        'Use parallel processing where possible'
      ]
    };

    return suggestions[bottleneckType] || ['Review and optimize the identified bottleneck'];
  }

  /**
   * Analyze topology efficiency
   */
  analyzeTopologyEfficiency(swarmTopology) {
    // Simple heuristic: mesh topology is generally more efficient for small teams,
    // hierarchical for larger teams
    const totalSwarms = swarmTopology.reduce((sum, item) => sum + item.swarm_count, 0);
    const avgAgents = swarmTopology.reduce((sum, item) => sum + item.avg_agents, 0) / swarmTopology.length;

    let needsOptimization = false;
    let description = '';
    let suggestions = [];

    if (avgAgents > 10) {
      // Large teams should prefer hierarchical
      const hierarchical = swarmTopology.find(item => item.topology === 'hierarchical');
      if (!hierarchical || hierarchical.swarm_count < totalSwarms * 0.5) {
        needsOptimization = true;
        description = 'Large agent teams would benefit from hierarchical topology';
        suggestions = [
          'Consider switching to hierarchical topology for large teams',
          'Implement coordinator agents',
          'Add team-based task distribution',
          'Create role-based agent organization'
        ];
      }
    } else if (avgAgents < 5) {
      // Small teams should prefer mesh
      const mesh = swarmTopology.find(item => item.topology === 'mesh');
      if (!mesh || mesh.swarm_count < totalSwarms * 0.5) {
        needsOptimization = true;
        description = 'Small agent teams would benefit from mesh topology';
        suggestions = [
          'Consider switching to mesh topology for small teams',
          'Enable direct agent-to-agent communication',
          'Implement peer-to-peer task sharing',
          'Add collaborative decision making'
        ];
      }
    }

    return { needsOptimization, description, suggestions };
  }

  /**
   * Calculate agent performance variance
   */
  calculateAgentPerformanceVariance(agentPerformance) {
    if (agentPerformance.length === 0) return 0;

    const scores = agentPerformance.map(agent => agent.performance_score);
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;

    return Math.sqrt(variance) / mean; // Coefficient of variation
  }

  /**
   * Identify consistent patterns in completion trends
   */
  identifyConsistentPatterns(trends) {
    const patterns = [];

    // Look for consistent daily task volumes
    const taskCounts = trends.map(t => t.total_tasks);
    const avgTasks = taskCounts.reduce((sum, count) => sum + count, 0) / taskCounts.length;
    const consistency = taskCounts.filter(count => Math.abs(count - avgTasks) < avgTasks * 0.2).length;

    if (consistency / taskCounts.length > 0.7) {
      patterns.push('consistent_daily_volume');
    }

    // Look for consistent completion rates
    const completionRates = trends.map(t => t.completed_tasks / t.total_tasks);
    const avgCompletion = completionRates.reduce((sum, rate) => sum + rate, 0) / completionRates.length;
    const completionConsistency = completionRates.filter(rate => Math.abs(rate - avgCompletion) < 0.1).length;

    if (completionConsistency / completionRates.length > 0.7) {
      patterns.push('consistent_completion_rate');
    }

    return patterns;
  }

  /**
   * Prioritize suggestions based on impact and effort
   */
  prioritizeSuggestions(suggestions) {
    const priorityScore = (suggestion) => {
      const impactScores = { high: 3, medium: 2, low: 1 };
      const effortScores = { low: 3, medium: 2, high: 1 };

      return (impactScores[suggestion.impact] || 2) + (effortScores[suggestion.effort] || 2);
    };

    // Sort each priority level by priority score
    Object.keys(suggestions.priority).forEach(level => {
      suggestions.priority[level].sort((a, b) => priorityScore(b) - priorityScore(a));
    });

    // Generate top recommendations
    const allSuggestions = [
      ...suggestions.priority.high,
      ...suggestions.priority.medium,
      ...suggestions.priority.low
    ];

    suggestions.recommendations = allSuggestions
      .sort((a, b) => priorityScore(b) - priorityScore(a))
      .slice(0, 10); // Top 10 recommendations
  }

  /**
   * Format bytes for human readability
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Generate agent-specific recommendations
   */
  async generateAgentRecommendations(agentId) {
    if (!this.analyzer.hiveDb) {
      throw new Error('Hive database not available for agent analysis');
    }

    const agent = await this.analyzer.hiveDb.get(`
      SELECT * FROM agents WHERE id = ?
    `, [agentId]);

    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const agentTasks = await this.analyzer.hiveDb.all(`
      SELECT * FROM tasks
      WHERE agent_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `, [agentId]);

    const recommendations = {
      agent: agent,
      performance: {
        score: agent.performance_score,
        successRate: agent.success_rate,
        taskCount: agent.task_count
      },
      suggestions: []
    };

    // Analyze agent performance
    if (agent.performance_score < 0.7) {
      recommendations.suggestions.push({
        type: 'performance_improvement',
        priority: 'high',
        title: 'Low Performance Score',
        description: `Agent performance score is ${agent.performance_score.toFixed(2)}`,
        suggestions: [
          'Review recent task failures and patterns',
          'Consider additional training or capability updates',
          'Analyze task-agent matching effectiveness',
          'Review agent workload distribution'
        ]
      });
    }

    if (agent.success_rate < 0.8) {
      recommendations.suggestions.push({
        type: 'success_rate_improvement',
        priority: 'high',
        title: 'Low Task Success Rate',
        description: `Agent success rate is ${(agent.success_rate * 100).toFixed(1)}%`,
        suggestions: [
          'Implement retry mechanisms for failed tasks',
          'Add task validation and error checking',
          'Review task complexity assignments',
          'Consider agent specialization'
        ]
      });
    }

    // Analyze recent task patterns
    if (agentTasks.length > 0) {
      const recentFailures = agentTasks.filter(t => t.status === 'failed').length;
      const failureRate = recentFailures / agentTasks.length;

      if (failureRate > 0.2) {
        recommendations.suggestions.push({
          type: 'recent_failures',
          priority: 'medium',
          title: 'High Recent Failure Rate',
          description: `${(failureRate * 100).toFixed(1)}% of recent tasks failed`,
          suggestions: [
            'Investigate recent failure patterns',
            'Check for environmental or system issues',
            'Review task assignment criteria',
            'Consider temporary workload reduction'
          ]
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate swarm-specific recommendations
   */
  async generateSwarmRecommendations(swarmId) {
    if (!this.analyzer.hiveDb) {
      throw new Error('Hive database not available for swarm analysis');
    }

    const swarm = await this.analyzer.hiveDb.get(`
      SELECT * FROM swarms WHERE id = ?
    `, [swarmId]);

    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const swarmAgents = await this.analyzer.hiveDb.all(`
      SELECT * FROM agents WHERE swarm_id = ?
    `, [swarmId]);

    const swarmTasks = await this.analyzer.hiveDb.all(`
      SELECT * FROM tasks WHERE swarm_id = ? ORDER BY created_at DESC LIMIT 100
    `, [swarmId]);

    const recommendations = {
      swarm: swarm,
      agents: swarmAgents.length,
      performance: {
        avgAgentScore: swarmAgents.reduce((sum, a) => sum + a.performance_score, 0) / swarmAgents.length,
        totalTasks: swarmTasks.length,
        completedTasks: swarmTasks.filter(t => t.status === 'completed').length
      },
      suggestions: []
    };

    // Analyze swarm composition
    const agentTypes = swarmAgents.reduce((types, agent) => {
      types[agent.type] = (types[agent.type] || 0) + 1;
      return types;
    }, {});

    const typeVariance = Object.values(agentTypes).length / swarmAgents.length;

    if (typeVariance < 0.3 && swarmAgents.length > 3) {
      recommendations.suggestions.push({
        type: 'agent_diversity',
        priority: 'medium',
        title: 'Low Agent Type Diversity',
        description: 'Swarm has limited agent type diversity',
        suggestions: [
          'Add complementary agent types',
          'Implement cross-functional capabilities',
          'Consider specialized roles',
          'Review task requirements vs agent capabilities'
        ]
      });
    }

    // Analyze task distribution
    const taskDistribution = swarmTasks.reduce((dist, task) => {
      const agentId = task.agent_id;
      dist[agentId] = (dist[agentId] || 0) + 1;
      return dist;
    }, {});

    const distributionValues = Object.values(taskDistribution);
    const avgTasks = distributionValues.reduce((sum, count) => sum + count, 0) / distributionValues.length;
    const maxTasks = Math.max(...distributionValues);
    const minTasks = Math.min(...distributionValues);

    if ((maxTasks - minTasks) / avgTasks > 0.5) {
      recommendations.suggestions.push({
        type: 'task_balancing',
        priority: 'medium',
        title: 'Uneven Task Distribution',
        description: 'Tasks are not evenly distributed among agents',
        suggestions: [
          'Implement load balancing mechanisms',
          'Review task assignment algorithms',
          'Consider agent capacity planning',
          'Add dynamic task redistribution'
        ]
      });
    }

    return recommendations;
  }
}

export default OptimizationEngine;