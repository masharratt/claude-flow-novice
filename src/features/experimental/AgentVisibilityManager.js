/**
 * Agent Visibility Manager - User Experience Patterns
 * Checkpoint 1.4 - Progressive Disclosure and UI Integration
 */

import { FeatureClassification } from './FeatureClassification.js';
import { ExperimentalConfig } from '../config/features/ExperimentalConfig.js';

export class AgentVisibilityManager {
  constructor(configManager, userManager) {
    this.configManager = configManager;
    this.userManager = userManager;
    this.experimentalConfig = new ExperimentalConfig(configManager);
    this.visibilityFilters = new Map();
    this.uiPatterns = this.initializeUIPatterns();
  }

  /**
   * Initialize UI patterns for different user experience levels
   */
  initializeUIPatterns() {
    return {
      // Novice users - Clean and simple interface
      [FeatureClassification.USER_LEVELS.NOVICE]: {
        showExperimentalSection: false,
        showStabilityBadges: false,
        showWarningsInline: false,
        groupByCategory: false,
        enableAdvancedOptions: false,
        filterByStability: ['stable'],
        ui: {
          theme: 'simple',
          complexityLevel: 'minimal',
          helpText: 'comprehensive',
          confirmationDialogs: 'verbose'
        }
      },

      // Intermediate users - Balanced feature exposure
      [FeatureClassification.USER_LEVELS.INTERMEDIATE]: {
        showExperimentalSection: true,
        showStabilityBadges: true,
        showWarningsInline: true,
        groupByCategory: true,
        enableAdvancedOptions: false,
        filterByStability: ['stable', 'beta'],
        ui: {
          theme: 'balanced',
          complexityLevel: 'moderate',
          helpText: 'contextual',
          confirmationDialogs: 'standard'
        }
      },

      // Advanced users - Full feature access with safety indicators
      [FeatureClassification.USER_LEVELS.ADVANCED]: {
        showExperimentalSection: true,
        showStabilityBadges: true,
        showWarningsInline: true,
        groupByCategory: true,
        enableAdvancedOptions: true,
        filterByStability: ['stable', 'beta', 'alpha'],
        ui: {
          theme: 'advanced',
          complexityLevel: 'full',
          helpText: 'minimal',
          confirmationDialogs: 'concise'
        }
      },

      // Enterprise users - All features with detailed controls
      [FeatureClassification.USER_LEVELS.ENTERPRISE]: {
        showExperimentalSection: true,
        showStabilityBadges: true,
        showWarningsInline: true,
        groupByCategory: true,
        enableAdvancedOptions: true,
        filterByStability: ['stable', 'beta', 'alpha', 'research'],
        ui: {
          theme: 'enterprise',
          complexityLevel: 'expert',
          helpText: 'technical',
          confirmationDialogs: 'detailed'
        }
      }
    };
  }

  /**
   * Get agent list tailored for user's experience level
   */
  async getVisibleAgents(userId, context = {}) {
    const user = await this.userManager.getUser(userId);
    const userLevel = user.experienceLevel || FeatureClassification.USER_LEVELS.NOVICE;
    const userConfig = await this.experimentalConfig.getUserConfig(userId);

    // Get all available agents
    const allAgents = await this.getAllAvailableAgents();

    // Apply user level filtering
    const enabledFeatures = await this.getEnabledFeatureFlags();

    // Filter based on visibility rules
    const visibleAgents = allAgents.filter(agent =>
      this.isAgentVisibleToUser(agent, userLevel, enabledFeatures, userConfig, context)
    );

    // Apply UI patterns and organize agents
    return this.organizeAgentsForUI(visibleAgents, userLevel, userConfig, context);
  }

  /**
   * Check if specific agent is visible to user
   */
  isAgentVisibleToUser(agent, userLevel, enabledFeatures, userConfig, context) {
    // Check basic visibility rules
    const isVisible = FeatureClassification.isAgentVisible(agent.name, userLevel, enabledFeatures);

    if (!isVisible) {
      return false;
    }

    // Apply user preferences
    if (userConfig.ui && userConfig.ui.hideExperimentalFeatures) {
      const agentConfig = FeatureClassification.EXPERIMENTAL_AGENTS[agent.name];
      if (agentConfig) {
        return false;
      }
    }

    // Apply context-based filtering
    if (context.hideAlpha && agent.stability === 'alpha') {
      return false;
    }

    if (context.hideResearch && agent.stability === 'research') {
      return false;
    }

    if (context.categoryFilter && agent.category !== context.categoryFilter) {
      return false;
    }

    return true;
  }

  /**
   * Organize agents for UI display based on user level
   */
  organizeAgentsForUI(agents, userLevel, userConfig, context) {
    const pattern = this.uiPatterns[userLevel];
    const organized = {
      userLevel,
      pattern,
      agents: [],
      categories: {},
      stability: {},
      recommendations: []
    };

    // Process each agent with metadata
    for (const agent of agents) {
      const agentMetadata = FeatureClassification.getAgentMetadata(
        agent.name,
        userLevel,
        await this.getEnabledFeatureFlags()
      );

      const enrichedAgent = {
        ...agent,
        ...agentMetadata,
        ui: this.getAgentUIConfig(agent, userLevel, pattern),
        actions: this.getAvailableActions(agent, userLevel, agentMetadata)
      };

      organized.agents.push(enrichedAgent);

      // Group by category if enabled
      if (pattern.groupByCategory && enrichedAgent.category) {
        if (!organized.categories[enrichedAgent.category]) {
          organized.categories[enrichedAgent.category] = {
            name: enrichedAgent.category,
            agents: [],
            description: this.getCategoryDescription(enrichedAgent.category),
            riskLevel: 'low'
          };
        }
        organized.categories[enrichedAgent.category].agents.push(enrichedAgent);

        // Update category risk level
        if (this.getRiskPriority(enrichedAgent.riskLevel) >
            this.getRiskPriority(organized.categories[enrichedAgent.category].riskLevel)) {
          organized.categories[enrichedAgent.category].riskLevel = enrichedAgent.riskLevel;
        }
      }

      // Group by stability if needed
      if (enrichedAgent.stability) {
        if (!organized.stability[enrichedAgent.stability]) {
          organized.stability[enrichedAgent.stability] = [];
        }
        organized.stability[enrichedAgent.stability].push(enrichedAgent);
      }
    }

    // Generate recommendations for the user
    organized.recommendations = this.generateUserRecommendations(organized, userLevel, userConfig);

    return organized;
  }

  /**
   * Get UI configuration for specific agent
   */
  getAgentUIConfig(agent, userLevel, pattern) {
    const agentConfig = FeatureClassification.EXPERIMENTAL_AGENTS[agent.name];
    const isExperimental = !!agentConfig;

    return {
      showBadge: pattern.showStabilityBadges && isExperimental,
      showWarnings: pattern.showWarningsInline && isExperimental,
      showDescription: true,
      showAdvancedOptions: pattern.enableAdvancedOptions,
      theme: pattern.ui.theme,
      complexity: pattern.ui.complexityLevel,
      helpLevel: pattern.ui.helpText,

      // Visual indicators
      indicators: {
        experimental: isExperimental,
        stability: isExperimental ? agentConfig.stability : 'stable',
        riskLevel: isExperimental ? FeatureClassification.STABILITY_LEVELS[agentConfig.stability.toUpperCase()].riskLevel : 'none',
        hasWarnings: isExperimental && (agentConfig.warnings?.length > 0),
        hasDependencies: isExperimental && (agentConfig.dependencies?.length > 0)
      },

      // Interactive elements
      interactions: {
        enableOnClick: this.canEnableAgent(agent, userLevel),
        showMoreInfo: true,
        expandable: pattern.ui.complexityLevel === 'full' || pattern.ui.complexityLevel === 'expert',
        confirmationRequired: isExperimental
      }
    };
  }

  /**
   * Get available actions for agent based on user level
   */
  getAvailableActions(agent, userLevel, agentMetadata) {
    const actions = ['info'];

    const agentConfig = FeatureClassification.EXPERIMENTAL_AGENTS[agent.name];

    if (!agentConfig) {
      // Non-experimental agent
      actions.push('enable', 'configure');
      return actions;
    }

    // Experimental agent actions based on user level and permissions
    const stability = FeatureClassification.STABILITY_LEVELS[agentConfig.stability.toUpperCase()];
    const canSee = FeatureClassification.canUserSeeStabilityLevel(userLevel, stability.visibility);

    if (canSee) {
      if (agentMetadata.visible) {
        actions.push('enable');

        if (userLevel !== FeatureClassification.USER_LEVELS.NOVICE) {
          actions.push('configure');
        }

        if (userLevel === FeatureClassification.USER_LEVELS.ADVANCED ||
            userLevel === FeatureClassification.USER_LEVELS.ENTERPRISE) {
          actions.push('monitor', 'debug');
        }

        if (userLevel === FeatureClassification.USER_LEVELS.ENTERPRISE) {
          actions.push('export-config', 'clone');
        }
      }
    }

    return actions;
  }

  /**
   * Get category description
   */
  getCategoryDescription(category) {
    const descriptions = {
      'consensus': 'Advanced consensus and distributed coordination mechanisms',
      'neural': 'AI and neural network processing capabilities',
      'security': 'Enhanced security and access control features',
      'performance': 'High-precision performance and optimization tools',
      'math': 'Advanced mathematical computation engines',
      'data': 'Data synchronization and management systems',
      'analysis': 'Advanced analysis and pattern recognition tools'
    };

    return descriptions[category] || `${category} related features`;
  }

  /**
   * Get risk priority for comparison
   */
  getRiskPriority(riskLevel) {
    const priorities = { 'none': 0, 'low': 1, 'medium': 2, 'high': 3 };
    return priorities[riskLevel] || 0;
  }

  /**
   * Generate user-specific recommendations
   */
  generateUserRecommendations(organized, userLevel, userConfig) {
    const recommendations = [];

    // Recommend stable features for novice users
    if (userLevel === FeatureClassification.USER_LEVELS.NOVICE) {
      const stableAgents = organized.agents.filter(a => a.stability === 'stable' || !a.isExperimental);

      if (stableAgents.length > 0) {
        recommendations.push({
          type: 'suggestion',
          title: 'Recommended Features',
          message: 'These stable features are safe to use and provide reliable functionality.',
          agents: stableAgents.slice(0, 3).map(a => a.name),
          priority: 'high'
        });
      }

      // Suggest experience level upgrade if they use many features
      if (organized.agents.length > 5) {
        recommendations.push({
          type: 'upgrade',
          title: 'Consider Intermediate Level',
          message: 'You might benefit from intermediate user features. This will unlock beta features with safety warnings.',
          action: 'upgrade-level',
          targetLevel: FeatureClassification.USER_LEVELS.INTERMEDIATE,
          priority: 'medium'
        });
      }
    }

    // Recommend beta features for intermediate users
    if (userLevel === FeatureClassification.USER_LEVELS.INTERMEDIATE) {
      const betaAgents = organized.agents.filter(a => a.stability === 'beta');

      if (betaAgents.length > 0) {
        recommendations.push({
          type: 'exploration',
          title: 'Try Beta Features',
          message: 'These beta features are stable enough for testing with appropriate safeguards.',
          agents: betaAgents.slice(0, 2).map(a => a.name),
          priority: 'medium'
        });
      }
    }

    // Advanced feature recommendations for advanced users
    if (userLevel === FeatureClassification.USER_LEVELS.ADVANCED) {
      const alphaAgents = organized.agents.filter(a => a.stability === 'alpha');

      if (alphaAgents.length > 0) {
        recommendations.push({
          type: 'experimental',
          title: 'Alpha Features Available',
          message: 'Advanced experimental features are available. Please review warnings carefully.',
          agents: alphaAgents.slice(0, 3).map(a => a.name),
          priority: 'low'
        });
      }
    }

    // Research features for enterprise users
    if (userLevel === FeatureClassification.USER_LEVELS.ENTERPRISE) {
      const researchAgents = organized.agents.filter(a => a.stability === 'research');

      if (researchAgents.length > 0) {
        recommendations.push({
          type: 'research',
          title: 'Research Features',
          message: 'Cutting-edge research features for enterprise evaluation. Use with extreme caution.',
          agents: researchAgents.map(a => a.name),
          priority: 'low'
        });
      }
    }

    // Performance recommendations
    const enabledExperimental = organized.agents.filter(a => a.enabled && a.isExperimental);
    if (enabledExperimental.length > 3) {
      recommendations.push({
        type: 'performance',
        title: 'Monitor Performance',
        message: `You have ${enabledExperimental.length} experimental features enabled. Monitor system performance.`,
        action: 'open-monitoring',
        priority: 'medium'
      });
    }

    return recommendations;
  }

  /**
   * Check if user can enable specific agent
   */
  canEnableAgent(agent, userLevel) {
    const agentConfig = FeatureClassification.EXPERIMENTAL_AGENTS[agent.name];

    if (!agentConfig) {
      return true; // Non-experimental agents can be enabled
    }

    const stability = FeatureClassification.STABILITY_LEVELS[agentConfig.stability.toUpperCase()];
    return FeatureClassification.canUserSeeStabilityLevel(userLevel, stability.visibility);
  }

  /**
   * Get all available agents from the system
   */
  async getAllAvailableAgents() {
    // This would integrate with the actual agent registry
    // For now, return experimental agents plus some mock stable agents

    const stableAgents = [
      { name: 'coder', category: 'development', stability: 'stable', description: 'Main coding agent' },
      { name: 'tester', category: 'development', stability: 'stable', description: 'Testing specialist' },
      { name: 'reviewer', category: 'development', stability: 'stable', description: 'Code review agent' },
      { name: 'planner', category: 'management', stability: 'stable', description: 'Project planning agent' },
      { name: 'researcher', category: 'analysis', stability: 'stable', description: 'Research specialist' }
    ];

    const experimentalAgents = Object.entries(FeatureClassification.EXPERIMENTAL_AGENTS).map(([name, config]) => ({
      name,
      category: config.category,
      stability: config.stability,
      description: config.description
    }));

    return [...stableAgents, ...experimentalAgents];
  }

  /**
   * Get enabled feature flags
   */
  async getEnabledFeatureFlags() {
    return Array.from(this.experimentalConfig.featureFlags.entries())
      .filter(([flag, value]) => value)
      .map(([flag]) => flag);
  }

  /**
   * Create user experience adaptation based on usage patterns
   */
  async adaptUserExperience(userId, usageData) {
    const user = await this.userManager.getUser(userId);
    const currentLevel = user.experienceLevel || FeatureClassification.USER_LEVELS.NOVICE;

    // Analyze usage patterns
    const analysis = this.analyzeUsagePatterns(usageData);

    // Suggest level changes if appropriate
    const suggestions = [];

    if (analysis.readyForUpgrade && currentLevel === FeatureClassification.USER_LEVELS.NOVICE) {
      suggestions.push({
        type: 'level-upgrade',
        targetLevel: FeatureClassification.USER_LEVELS.INTERMEDIATE,
        reason: 'Consistent usage of stable features suggests readiness for beta features',
        confidence: analysis.confidence
      });
    }

    if (analysis.needsDowngrade && currentLevel !== FeatureClassification.USER_LEVELS.NOVICE) {
      suggestions.push({
        type: 'level-downgrade',
        targetLevel: FeatureClassification.USER_LEVELS.NOVICE,
        reason: 'Multiple experimental feature issues suggest simpler interface would be better',
        confidence: analysis.confidence
      });
    }

    return {
      currentLevel,
      suggestions,
      analysis,
      adaptedUI: this.generateAdaptedUI(currentLevel, analysis)
    };
  }

  /**
   * Analyze usage patterns for experience adaptation
   */
  analyzeUsagePatterns(usageData) {
    const analysis = {
      stableFeatureUsage: 0,
      experimentalFeatureUsage: 0,
      errorRate: 0,
      successfulCompletions: 0,
      helpRequestFrequency: 0,
      confidence: 0,
      readyForUpgrade: false,
      needsDowngrade: false
    };

    if (!usageData || usageData.length === 0) {
      return analysis;
    }

    // Analyze feature usage patterns
    for (const usage of usageData) {
      if (usage.featureStability === 'stable') {
        analysis.stableFeatureUsage++;
      } else {
        analysis.experimentalFeatureUsage++;
      }

      if (usage.hadErrors) {
        analysis.errorRate++;
      } else {
        analysis.successfulCompletions++;
      }

      if (usage.requestedHelp) {
        analysis.helpRequestFrequency++;
      }
    }

    // Calculate percentages
    const total = usageData.length;
    analysis.errorRate = (analysis.errorRate / total) * 100;
    analysis.successfulCompletions = (analysis.successfulCompletions / total) * 100;
    analysis.helpRequestFrequency = (analysis.helpRequestFrequency / total) * 100;

    // Determine readiness for upgrade
    analysis.readyForUpgrade = (
      analysis.stableFeatureUsage >= 10 && // Used stable features at least 10 times
      analysis.successfulCompletions >= 80 && // 80%+ success rate
      analysis.helpRequestFrequency < 20 // Less than 20% help requests
    );

    // Determine need for downgrade
    analysis.needsDowngrade = (
      analysis.experimentalFeatureUsage > 0 &&
      analysis.errorRate > 40 && // High error rate
      analysis.helpRequestFrequency > 50 // Frequent help requests
    );

    // Calculate confidence
    if (total >= 50) {
      analysis.confidence = 'high';
    } else if (total >= 20) {
      analysis.confidence = 'medium';
    } else {
      analysis.confidence = 'low';
    }

    return analysis;
  }

  /**
   * Generate adapted UI configuration
   */
  generateAdaptedUI(currentLevel, analysis) {
    const basePattern = this.uiPatterns[currentLevel];
    const adaptedPattern = { ...basePattern };

    // Reduce complexity if user struggles
    if (analysis.errorRate > 30) {
      adaptedPattern.ui.complexityLevel = 'minimal';
      adaptedPattern.ui.helpText = 'comprehensive';
      adaptedPattern.showAdvancedOptions = false;
    }

    // Increase help if frequently requested
    if (analysis.helpRequestFrequency > 40) {
      adaptedPattern.ui.helpText = 'comprehensive';
      adaptedPattern.ui.confirmationDialogs = 'verbose';
    }

    // Show more features if very successful
    if (analysis.successfulCompletions > 90 && analysis.errorRate < 10) {
      adaptedPattern.enableAdvancedOptions = true;
      adaptedPattern.ui.complexityLevel = 'moderate';
    }

    return adaptedPattern;
  }

  /**
   * Get visibility statistics for monitoring
   */
  async getVisibilityStatistics() {
    const stats = {
      totalAgents: 0,
      visibleByLevel: {},
      hiddenByLevel: {},
      byCategory: {},
      byStability: {}
    };

    const allAgents = await this.getAllAvailableAgents();
    stats.totalAgents = allAgents.length;

    // Calculate visibility for each user level
    for (const level of Object.values(FeatureClassification.USER_LEVELS)) {
      const enabledFeatures = await this.getEnabledFeatureFlags();

      const visible = allAgents.filter(agent =>
        this.isAgentVisibleToUser(agent, level, enabledFeatures, {}, {})
      );

      stats.visibleByLevel[level] = visible.length;
      stats.hiddenByLevel[level] = allAgents.length - visible.length;
    }

    // Count by category and stability
    for (const agent of allAgents) {
      const agentConfig = FeatureClassification.EXPERIMENTAL_AGENTS[agent.name];

      if (!stats.byCategory[agent.category]) {
        stats.byCategory[agent.category] = 0;
      }
      stats.byCategory[agent.category]++;

      const stability = agentConfig ? agentConfig.stability : 'stable';
      if (!stats.byStability[stability]) {
        stats.byStability[stability] = 0;
      }
      stats.byStability[stability]++;
    }

    return stats;
  }

  /**
   * Cleanup and finalize
   */
  cleanup() {
    this.visibilityFilters.clear();
    console.log('[AgentVisibilityManager] Cleanup completed');
  }
}