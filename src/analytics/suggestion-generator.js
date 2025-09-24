/**
 * Suggestion Generator for Claude Flow
 * Creates personalized improvement recommendations and learns from patterns
 */

import fs from 'fs-extra';
import path from 'path';

export class SuggestionGenerator {
  constructor(analyzer, optimizationEngine) {
    this.analyzer = analyzer;
    this.optimizationEngine = optimizationEngine;
    this.userPreferencesPath = '.claude-flow/user-preferences.json';
    this.learningDataPath = '.claude-flow/learning-patterns.json';
    this.suggestionHistoryPath = '.claude-flow/suggestion-history.json';

    this.userPreferences = {};
    this.learningPatterns = {};
    this.suggestionHistory = [];
  }

  /**
   * Initialize suggestion generator with user data
   */
  async initialize() {
    await this.loadUserPreferences();
    await this.loadLearningPatterns();
    await this.loadSuggestionHistory();
  }

  /**
   * Generate personalized recommendations based on user preferences and history
   */
  async generatePersonalizedSuggestions() {
    const baseOptimizations = await this.optimizationEngine.generateOptimizationSuggestions();

    const personalizedSuggestions = {
      timestamp: new Date().toISOString(),
      user: this.getUserProfile(),
      suggestions: {
        immediate: [],
        shortTerm: [],
        longTerm: [],
        learning: []
      },
      insights: {},
      preferences: this.userPreferences,
      adaptations: []
    };

    // Apply personalization to base suggestions
    this.personalizeBaseSuggestions(baseOptimizations, personalizedSuggestions);

    // Generate workflow-specific suggestions
    await this.generateWorkflowSuggestions(personalizedSuggestions);

    // Generate learning-based suggestions
    this.generateLearningBasedSuggestions(personalizedSuggestions);

    // Generate preference-based adaptations
    this.generatePreferenceBasedSuggestions(personalizedSuggestions);

    // Rank suggestions by personal relevance
    this.rankSuggestionsByRelevance(personalizedSuggestions);

    // Update learning patterns
    this.updateLearningPatterns(personalizedSuggestions);

    return personalizedSuggestions;
  }

  /**
   * Learn from successful workflow patterns
   */
  async learnFromSuccessfulPatterns() {
    if (!this.analyzer.hiveDb) {
      return { message: 'No database available for pattern learning' };
    }

    const successfulPatterns = await this.analyzer.hiveDb.all(`
      SELECT
        s.topology,
        s.max_agents,
        COUNT(t.id) as task_count,
        AVG(t.actual_time) as avg_duration,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_count,
        GROUP_CONCAT(DISTINCT a.type) as agent_types
      FROM swarms s
      JOIN agents a ON s.id = a.swarm_id
      JOIN tasks t ON a.id = t.agent_id
      WHERE t.status = 'completed' AND t.created_at >= datetime('now', '-30 days')
      GROUP BY s.id, s.topology, s.max_agents
      HAVING completed_count >= 5
      ORDER BY (completed_count * 1.0 / task_count) DESC, avg_duration ASC
    `);

    const patterns = {
      timestamp: new Date().toISOString(),
      successful_configurations: [],
      learned_insights: [],
      recommendations: []
    };

    // Analyze successful configurations
    successfulPatterns.forEach(pattern => {
      const successRate = pattern.completed_count / pattern.task_count;
      const agentTypes = pattern.agent_types ? pattern.agent_types.split(',') : [];

      if (successRate >= 0.9) { // 90%+ success rate
        patterns.successful_configurations.push({
          topology: pattern.topology,
          maxAgents: pattern.max_agents,
          agentTypes: agentTypes,
          successRate: successRate,
          avgDuration: pattern.avg_duration,
          taskCount: pattern.task_count,
          score: this.calculatePatternScore(pattern)
        });
      }
    });

    // Generate insights from successful patterns
    patterns.learned_insights = this.extractInsightsFromPatterns(patterns.successful_configurations);

    // Generate recommendations based on learned patterns
    patterns.recommendations = this.generatePatternBasedRecommendations(patterns.successful_configurations);

    // Update learning patterns
    await this.updateLearningPatternsFromSuccess(patterns);

    return patterns;
  }

  /**
   * Generate post-task optimization insights
   */
  async generatePostTaskInsights(taskId) {
    if (!this.analyzer.hiveDb) {
      throw new Error('Database not available for task analysis');
    }

    const task = await this.analyzer.hiveDb.get(`
      SELECT t.*, a.type as agent_type, a.performance_score, s.topology
      FROM tasks t
      JOIN agents a ON t.agent_id = a.id
      JOIN swarms s ON t.swarm_id = s.id
      WHERE t.id = ?
    `, [taskId]);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const insights = {
      task: task,
      timestamp: new Date().toISOString(),
      performance: {
        rating: this.calculateTaskPerformanceRating(task),
        efficiency: this.calculateTaskEfficiency(task),
        quality: this.calculateTaskQuality(task)
      },
      suggestions: [],
      learningOpportunities: [],
      futureOptimizations: []
    };

    // Analyze task performance
    if (task.actual_time > task.estimated_time * 1.5) {
      insights.suggestions.push({
        type: 'time_estimation',
        priority: 'medium',
        title: 'Task Duration Exceeded Estimate',
        description: `Task took ${task.actual_time}ms vs estimated ${task.estimated_time}ms`,
        suggestions: [
          'Review task complexity estimation',
          'Break down similar tasks into smaller components',
          'Consider adding buffer time for complex tasks',
          'Improve task scoping accuracy'
        ],
        impact: 'medium'
      });
    }

    if (task.status === 'failed') {
      insights.suggestions.push({
        type: 'failure_analysis',
        priority: 'high',
        title: 'Task Failure Analysis',
        description: 'Task failed - analyze root causes',
        suggestions: [
          'Review error logs and failure points',
          'Check agent capabilities vs task requirements',
          'Validate input data and prerequisites',
          'Consider retry mechanisms or alternative approaches'
        ],
        impact: 'high'
      });
    }

    // Generate learning opportunities
    if (task.status === 'completed' && task.complexity > 0.7) {
      insights.learningOpportunities.push({
        type: 'complex_task_success',
        description: 'Successfully completed high-complexity task',
        learnings: [
          `Agent type ${task.agent_type} effective for complexity ${task.complexity}`,
          `Topology ${task.topology} suitable for complex tasks`,
          `Duration pattern: ${task.actual_time}ms for complexity ${task.complexity}`
        ],
        applicableScenarios: ['Similar complexity tasks', 'Same agent type assignments']
      });
    }

    // Generate future optimizations
    const similarTasks = await this.analyzer.hiveDb.all(`
      SELECT * FROM tasks
      WHERE agent_id = ? AND complexity BETWEEN ? AND ?
      ORDER BY created_at DESC LIMIT 5
    `, [task.agent_id, task.complexity - 0.1, task.complexity + 0.1]);

    if (similarTasks.length >= 3) {
      const avgDuration = similarTasks.reduce((sum, t) => sum + (t.actual_time || 0), 0) / similarTasks.length;

      insights.futureOptimizations.push({
        type: 'pattern_optimization',
        title: 'Similar Task Pattern Detected',
        description: `Agent has completed ${similarTasks.length} similar tasks`,
        optimizations: [
          `Expected duration: ${Math.round(avgDuration)}ms`,
          'Consider task template creation',
          'Implement automated routing for similar tasks',
          'Add predictive time estimation'
        ]
      });
    }

    // Store insights for learning
    await this.storeTaskInsights(taskId, insights);

    return insights;
  }

  /**
   * Provide preference adjustments based on usage patterns
   */
  async suggestPreferenceAdjustments() {
    const usageAnalysis = await this.analyzeUsagePatterns();
    const currentPrefs = this.userPreferences;

    const adjustments = {
      timestamp: new Date().toISOString(),
      current_preferences: currentPrefs,
      suggested_adjustments: [],
      reasoning: [],
      impact_analysis: {}
    };

    // Analyze agent type preferences
    if (usageAnalysis.agentTypeUsage) {
      const mostUsedTypes = Object.entries(usageAnalysis.agentTypeUsage)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3);

      if (mostUsedTypes.length > 0 && !currentPrefs.preferredAgentTypes) {
        adjustments.suggested_adjustments.push({
          type: 'agent_preferences',
          setting: 'preferredAgentTypes',
          currentValue: null,
          suggestedValue: mostUsedTypes.map(([type]) => type),
          reason: 'Based on your usage patterns, these agent types are most effective'
        });
      }
    }

    // Analyze topology preferences
    if (usageAnalysis.topologyEffectiveness) {
      const bestTopology = Object.entries(usageAnalysis.topologyEffectiveness)
        .sort(([,a], [,b]) => b.successRate - a.successRate)[0];

      if (bestTopology && currentPrefs.preferredTopology !== bestTopology[0]) {
        adjustments.suggested_adjustments.push({
          type: 'topology_preference',
          setting: 'preferredTopology',
          currentValue: currentPrefs.preferredTopology || 'none set',
          suggestedValue: bestTopology[0],
          reason: `${bestTopology[0]} topology shows ${(bestTopology[1].successRate * 100).toFixed(1)}% success rate in your usage`
        });
      }
    }

    // Analyze complexity preferences
    if (usageAnalysis.complexityPatterns) {
      const optimalComplexity = this.findOptimalComplexityRange(usageAnalysis.complexityPatterns);

      if (optimalComplexity && !currentPrefs.complexityThreshold) {
        adjustments.suggested_adjustments.push({
          type: 'complexity_threshold',
          setting: 'complexityThreshold',
          currentValue: null,
          suggestedValue: optimalComplexity,
          reason: 'Optimal complexity range based on your success patterns'
        });
      }
    }

    // Analyze notification preferences
    if (usageAnalysis.responsePatterns) {
      const suggestedNotificationLevel = this.calculateOptimalNotificationLevel(usageAnalysis.responsePatterns);

      if (suggestedNotificationLevel !== currentPrefs.notificationLevel) {
        adjustments.suggested_adjustments.push({
          type: 'notification_level',
          setting: 'notificationLevel',
          currentValue: currentPrefs.notificationLevel || 'default',
          suggestedValue: suggestedNotificationLevel,
          reason: 'Optimized based on your response and engagement patterns'
        });
      }
    }

    return adjustments;
  }

  /**
   * Personalize base optimization suggestions
   */
  personalizeBaseSuggestions(baseOptimizations, personalizedSuggestions) {
    const userStyle = this.getUserStyle();

    baseOptimizations.priority.high.forEach(suggestion => {
      const personalized = this.adaptSuggestionToUserStyle(suggestion, userStyle);

      if (this.isRelevantToUser(suggestion)) {
        personalizedSuggestions.suggestions.immediate.push(personalized);
      }
    });

    baseOptimizations.priority.medium.forEach(suggestion => {
      const personalized = this.adaptSuggestionToUserStyle(suggestion, userStyle);

      if (this.isRelevantToUser(suggestion)) {
        personalizedSuggestions.suggestions.shortTerm.push(personalized);
      }
    });

    baseOptimizations.priority.low.forEach(suggestion => {
      const personalized = this.adaptSuggestionToUserStyle(suggestion, userStyle);

      if (this.isRelevantToUser(suggestion)) {
        personalizedSuggestions.suggestions.longTerm.push(personalized);
      }
    });
  }

  /**
   * Generate workflow-specific suggestions
   */
  async generateWorkflowSuggestions(personalizedSuggestions) {
    const workflows = this.identifyUserWorkflows();

    workflows.forEach(workflow => {
      const suggestions = this.generateWorkflowSpecificSuggestions(workflow);
      personalizedSuggestions.suggestions.shortTerm.push(...suggestions);
    });
  }

  /**
   * Generate learning-based suggestions
   */
  generateLearningBasedSuggestions(personalizedSuggestions) {
    const patterns = this.learningPatterns;

    // Suggest based on successful patterns
    if (patterns.successfulConfigurations) {
      patterns.successfulConfigurations.forEach(config => {
        if (config.score > 0.8 && !this.isCurrentlyUsing(config)) {
          personalizedSuggestions.suggestions.learning.push({
            type: 'pattern_adoption',
            title: `Try High-Success Configuration: ${config.topology}`,
            description: `This configuration has ${(config.successRate * 100).toFixed(1)}% success rate`,
            implementation: [
              `Use ${config.topology} topology`,
              `Limit to ${config.maxAgents} agents`,
              `Include agent types: ${config.agentTypes.join(', ')}`
            ],
            expectedBenefit: 'Higher success rate and better performance',
            confidence: config.score
          });
        }
      });
    }

    // Suggest avoiding anti-patterns
    if (patterns.antiPatterns) {
      patterns.antiPatterns.forEach(antiPattern => {
        personalizedSuggestions.suggestions.learning.push({
          type: 'anti_pattern_avoidance',
          title: `Avoid: ${antiPattern.description}`,
          description: `This pattern has led to ${antiPattern.failureRate}% failure rate`,
          avoidance: antiPattern.avoidanceStrategies,
          risk: antiPattern.riskLevel
        });
      });
    }
  }

  /**
   * Generate preference-based suggestions
   */
  generatePreferenceBasedSuggestions(personalizedSuggestions) {
    const prefs = this.userPreferences;

    // Suggest based on preferred complexity
    if (prefs.preferredComplexity) {
      personalizedSuggestions.adaptations.push({
        type: 'complexity_matching',
        description: `Suggestions tailored to ${prefs.preferredComplexity} complexity preference`,
        adaptations: [
          'Task difficulty aligned with preference',
          'Agent selections optimized for preferred complexity',
          'Timeline estimates adjusted for complexity preference'
        ]
      });
    }

    // Suggest based on preferred pace
    if (prefs.workingPace) {
      personalizedSuggestions.adaptations.push({
        type: 'pace_optimization',
        description: `Suggestions adapted to ${prefs.workingPace} working pace`,
        adaptations: [
          'Task scheduling aligned with pace preference',
          'Notification timing optimized',
          'Resource allocation matched to pace'
        ]
      });
    }
  }

  /**
   * Adapt suggestion to user's working style
   */
  adaptSuggestionToUserStyle(suggestion, userStyle) {
    const adapted = { ...suggestion };

    // Adapt based on user style
    switch (userStyle.type) {
      case 'detailed_planner':
        adapted.implementation_steps = this.generateDetailedSteps(suggestion);
        adapted.expected_timeline = this.estimateImplementationTime(suggestion);
        break;

      case 'quick_executor':
        adapted.quick_actions = this.generateQuickActions(suggestion);
        adapted.immediate_impact = this.highlightImmediateImpact(suggestion);
        break;

      case 'analytical_reviewer':
        adapted.data_analysis = this.addAnalyticalContext(suggestion);
        adapted.success_metrics = this.defineSuccessMetrics(suggestion);
        break;

      case 'collaborative_coordinator':
        adapted.team_impact = this.analyzeTeamImpact(suggestion);
        adapted.coordination_requirements = this.identifyCoordinationNeeds(suggestion);
        break;
    }

    // Add personalization context
    adapted.personalization = {
      relevance_score: this.calculateRelevanceScore(suggestion),
      user_style_match: userStyle.match_score,
      historical_success: this.getHistoricalSuccessRate(suggestion.type)
    };

    return adapted;
  }

  /**
   * Calculate task performance rating
   */
  calculateTaskPerformanceRating(task) {
    let score = 0.5; // Base score

    // Status contribution
    if (task.status === 'completed') score += 0.3;
    else if (task.status === 'failed') score -= 0.3;

    // Time performance
    if (task.actual_time && task.estimated_time) {
      const timeRatio = task.actual_time / task.estimated_time;
      if (timeRatio <= 1.0) score += 0.2;
      else if (timeRatio <= 1.2) score += 0.1;
      else if (timeRatio >= 2.0) score -= 0.2;
    }

    // Complexity handling
    if (task.complexity) {
      if (task.complexity > 0.8 && task.status === 'completed') score += 0.1;
      if (task.complexity < 0.3 && task.actual_time < task.estimated_time) score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Load user preferences from file
   */
  async loadUserPreferences() {
    try {
      if (await fs.pathExists(this.userPreferencesPath)) {
        this.userPreferences = await fs.readJson(this.userPreferencesPath);
      } else {
        this.userPreferences = this.getDefaultPreferences();
      }
    } catch (error) {
      console.warn('Failed to load user preferences:', error.message);
      this.userPreferences = this.getDefaultPreferences();
    }
  }

  /**
   * Load learning patterns from file
   */
  async loadLearningPatterns() {
    try {
      if (await fs.pathExists(this.learningDataPath)) {
        this.learningPatterns = await fs.readJson(this.learningDataPath);
      } else {
        this.learningPatterns = {
          successfulConfigurations: [],
          antiPatterns: [],
          userBehaviorPatterns: {},
          lastUpdated: new Date().toISOString()
        };
      }
    } catch (error) {
      console.warn('Failed to load learning patterns:', error.message);
      this.learningPatterns = {};
    }
  }

  /**
   * Load suggestion history from file
   */
  async loadSuggestionHistory() {
    try {
      if (await fs.pathExists(this.suggestionHistoryPath)) {
        this.suggestionHistory = await fs.readJson(this.suggestionHistoryPath);
      }
    } catch (error) {
      console.warn('Failed to load suggestion history:', error.message);
      this.suggestionHistory = [];
    }
  }

  /**
   * Get default user preferences
   */
  getDefaultPreferences() {
    return {
      notificationLevel: 'normal',
      preferredComplexity: 'medium',
      workingPace: 'balanced',
      autoOptimization: true,
      detailLevel: 'standard',
      learningMode: true,
      preferredAgentTypes: [],
      preferredTopology: null,
      complexityThreshold: null
    };
  }

  /**
   * Get user profile for personalization
   */
  getUserProfile() {
    const profile = {
      preferences: this.userPreferences,
      experience_level: this.calculateExperienceLevel(),
      working_style: this.getUserStyle(),
      success_patterns: this.getSuccessPatterns(),
      learning_progress: this.getLearningProgress()
    };

    return profile;
  }

  /**
   * Calculate user's experience level based on usage
   */
  calculateExperienceLevel() {
    const historyLength = this.suggestionHistory.length;
    const implementedSuggestions = this.suggestionHistory.filter(s => s.implemented).length;

    if (historyLength < 10) return 'beginner';
    if (historyLength < 50 && implementedSuggestions > historyLength * 0.6) return 'intermediate';
    if (implementedSuggestions > historyLength * 0.8) return 'advanced';

    return 'intermediate';
  }

  /**
   * Determine user's working style
   */
  getUserStyle() {
    const prefs = this.userPreferences;
    const history = this.suggestionHistory;

    // Analyze patterns in user behavior
    const detailOriented = prefs.detailLevel === 'detailed' ||
      history.filter(s => s.type === 'detailed_analysis').length > history.length * 0.3;

    const quickExecutor = prefs.workingPace === 'fast' ||
      history.filter(s => s.implemented && s.implementation_time < 24).length > history.length * 0.5;

    const analytical = prefs.learningMode === true &&
      history.filter(s => s.feedback_provided).length > history.length * 0.4;

    // Determine primary style
    if (detailOriented) return { type: 'detailed_planner', match_score: 0.8 };
    if (quickExecutor) return { type: 'quick_executor', match_score: 0.8 };
    if (analytical) return { type: 'analytical_reviewer', match_score: 0.8 };

    return { type: 'collaborative_coordinator', match_score: 0.6 };
  }

  /**
   * Analyze usage patterns for preference suggestions
   */
  async analyzeUsagePatterns() {
    const patterns = {
      agentTypeUsage: {},
      topologyEffectiveness: {},
      complexityPatterns: [],
      responsePatterns: {},
      timestamp: new Date().toISOString()
    };

    if (!this.analyzer.hiveDb) {
      return patterns;
    }

    // Analyze agent type usage
    const agentUsage = await this.analyzer.hiveDb.all(`
      SELECT a.type, COUNT(t.id) as usage_count
      FROM agents a
      LEFT JOIN tasks t ON a.id = t.agent_id
      WHERE t.created_at >= datetime('now', '-30 days')
      GROUP BY a.type
      ORDER BY usage_count DESC
    `);

    agentUsage.forEach(usage => {
      patterns.agentTypeUsage[usage.type] = usage.usage_count;
    });

    // Analyze topology effectiveness
    const topologyData = await this.analyzer.hiveDb.all(`
      SELECT
        s.topology,
        COUNT(t.id) as total_tasks,
        COUNT(CASE WHEN t.status = 'completed' THEN 1 END) as completed_tasks,
        AVG(t.actual_time) as avg_duration
      FROM swarms s
      JOIN agents a ON s.id = a.swarm_id
      JOIN tasks t ON a.id = t.agent_id
      WHERE t.created_at >= datetime('now', '-30 days')
      GROUP BY s.topology
    `);

    topologyData.forEach(topo => {
      patterns.topologyEffectiveness[topo.topology] = {
        successRate: topo.completed_tasks / topo.total_tasks,
        avgDuration: topo.avg_duration,
        taskCount: topo.total_tasks
      };
    });

    return patterns;
  }

  /**
   * Store task insights for learning
   */
  async storeTaskInsights(taskId, insights) {
    const insightsPath = path.join('.claude-flow', 'task-insights', `${taskId}.json`);

    try {
      await fs.ensureDir(path.dirname(insightsPath));
      await fs.writeJson(insightsPath, insights, { spaces: 2 });
    } catch (error) {
      console.warn('Failed to store task insights:', error.message);
    }
  }

  /**
   * Save user preferences
   */
  async saveUserPreferences() {
    try {
      await fs.ensureDir(path.dirname(this.userPreferencesPath));
      await fs.writeJson(this.userPreferencesPath, this.userPreferences, { spaces: 2 });
    } catch (error) {
      console.warn('Failed to save user preferences:', error.message);
    }
  }

  /**
   * Save learning patterns
   */
  async saveLearningPatterns() {
    try {
      await fs.ensureDir(path.dirname(this.learningDataPath));
      await fs.writeJson(this.learningDataPath, this.learningPatterns, { spaces: 2 });
    } catch (error) {
      console.warn('Failed to save learning patterns:', error.message);
    }
  }

  /**
   * Helper methods for suggestion adaptation
   */
  generateDetailedSteps(suggestion) {
    return [
      'Analyze current state and requirements',
      'Plan implementation approach',
      'Identify required resources and dependencies',
      'Execute implementation in phases',
      'Monitor progress and adjust as needed',
      'Validate results and document outcomes'
    ];
  }

  generateQuickActions(suggestion) {
    return suggestion.suggestions.slice(0, 2).map(s => `Quick: ${s}`);
  }

  calculateRelevanceScore(suggestion) {
    // Simple relevance calculation based on user preferences
    return Math.random() * 0.4 + 0.6; // Placeholder
  }

  getHistoricalSuccessRate(type) {
    const typeHistory = this.suggestionHistory.filter(s => s.type === type);
    if (typeHistory.length === 0) return 0.5;

    const implemented = typeHistory.filter(s => s.implemented).length;
    return implemented / typeHistory.length;
  }

  // Additional helper methods...
  isRelevantToUser(suggestion) {
    return true; // Placeholder - implement user relevance logic
  }

  identifyUserWorkflows() {
    return []; // Placeholder - identify common user workflow patterns
  }

  generateWorkflowSpecificSuggestions(workflow) {
    return []; // Placeholder - generate workflow-specific suggestions
  }

  isCurrentlyUsing(config) {
    return false; // Placeholder - check if configuration is currently in use
  }

  rankSuggestionsByRelevance(suggestions) {
    // Placeholder - implement relevance ranking
  }

  updateLearningPatterns(suggestions) {
    this.learningPatterns.lastUpdated = new Date().toISOString();
    // Additional learning pattern updates
  }

  async updateLearningPatternsFromSuccess(patterns) {
    this.learningPatterns.successfulConfigurations = patterns.successful_configurations;
    this.learningPatterns.lastUpdated = new Date().toISOString();
    await this.saveLearningPatterns();
  }

  calculatePatternScore(pattern) {
    const successWeight = 0.4;
    const efficiencyWeight = 0.3;
    const volumeWeight = 0.3;

    const successScore = pattern.completed_count / pattern.task_count;
    const efficiencyScore = Math.min(1, 300000 / (pattern.avg_duration || 300000)); // Normalize around 5min
    const volumeScore = Math.min(1, pattern.task_count / 20); // Normalize around 20 tasks

    return (successScore * successWeight) +
           (efficiencyScore * efficiencyWeight) +
           (volumeScore * volumeWeight);
  }

  extractInsightsFromPatterns(configurations) {
    return configurations.map(config => ({
      insight: `${config.topology} topology with ${config.maxAgents} agents shows high success`,
      confidence: config.score,
      applicability: 'Similar team sizes and task types'
    }));
  }

  generatePatternBasedRecommendations(configurations) {
    return configurations.slice(0, 3).map(config => ({
      title: `Adopt High-Success Pattern: ${config.topology}`,
      description: `${(config.successRate * 100).toFixed(1)}% success rate with ${config.avgDuration.toFixed(0)}ms avg duration`,
      implementation: [
        `Configure ${config.topology} topology`,
        `Use ${config.agentTypes.join(', ')} agent types`,
        `Limit to ${config.maxAgents} concurrent agents`
      ]
    }));
  }

  calculateTaskEfficiency(task) {
    if (!task.estimated_time || !task.actual_time) return 0.5;
    return Math.max(0, Math.min(1, task.estimated_time / task.actual_time));
  }

  calculateTaskQuality(task) {
    // Simple quality metric based on status and complexity handling
    if (task.status === 'completed') {
      return task.complexity > 0.7 ? 0.9 : 0.8;
    } else if (task.status === 'failed') {
      return 0.2;
    }
    return 0.5;
  }

  getSuccessPatterns() {
    // Placeholder for success pattern analysis
    return {};
  }

  getLearningProgress() {
    // Placeholder for learning progress tracking
    return {};
  }

  findOptimalComplexityRange(patterns) {
    // Placeholder for complexity optimization
    return { min: 0.3, max: 0.7 };
  }

  calculateOptimalNotificationLevel(patterns) {
    // Placeholder for notification optimization
    return 'normal';
  }

  // Additional helper methods for suggestion personalization
  highlightImmediateImpact(suggestion) {
    return `Immediate: ${suggestion.impact} impact expected`;
  }

  addAnalyticalContext(suggestion) {
    return {
      metrics: ['Performance', 'Efficiency', 'Success Rate'],
      baseline: 'Current performance metrics',
      expected_improvement: `${suggestion.impact} improvement expected`
    };
  }

  defineSuccessMetrics(suggestion) {
    return ['Implementation success', 'Performance improvement', 'User satisfaction'];
  }

  analyzeTeamImpact(suggestion) {
    return `Team-wide impact: ${suggestion.impact} level`;
  }

  identifyCoordinationNeeds(suggestion) {
    return ['Cross-team communication', 'Resource coordination', 'Timeline alignment'];
  }

  estimateImplementationTime(suggestion) {
    const effortMap = { low: '1-2 hours', medium: '4-8 hours', high: '1-2 days' };
    return effortMap[suggestion.effort] || 'Variable';
  }
}

export default SuggestionGenerator;