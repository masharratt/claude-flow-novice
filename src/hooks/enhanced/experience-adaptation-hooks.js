/**
 * Experience-Level Hook Adaptation - Minimal Implementation
 *
 * Adapts hook verbosity and behavior based on user experience level.
 * Following TDD: tests were written first, now implementing to make them green.
 */

class ExperienceAdaptationHooks {
  constructor() {
    this.satisfactionData = new Map();
    this.userCorrections = new Map();
    this.performanceHistory = new Map();
  }

  /**
   * Adapt hooks based on user experience level
   */
  async adaptHooksForUser(user) {
    const { experienceLevel = 'intermediate', userId } = user;

    // Calculate dynamic level if performance history exists
    let effectiveLevel = experienceLevel;
    if (userId && this.performanceHistory.has(userId)) {
      effectiveLevel = await this.calculateDynamicLevel(user);
    }

    // Apply user corrections if they exist
    if (userId && this.userCorrections.has(userId)) {
      const corrections = this.userCorrections.get(userId);
      return {
        ...this.getBaseHooksForLevel(effectiveLevel),
        ...corrections.userPreference
      };
    }

    return this.getBaseHooksForLevel(effectiveLevel);
  }

  /**
   * Get base hook configuration for experience level
   */
  getBaseHooksForLevel(level) {
    switch (level) {
      case 'novice':
        return {
          verbosity: 'detailed',
          showSteps: true,
          provideTips: true,
          explainCommands: true,
          showExamples: true,
          confirmActions: true,
          experienceLevel: 'novice'
        };

      case 'expert':
        return {
          verbosity: 'minimal',
          showSteps: false,
          provideTips: false,
          explainCommands: false,
          showExamples: false,
          confirmActions: false,
          experienceLevel: 'expert'
        };

      case 'intermediate':
      default:
        return {
          verbosity: 'balanced',
          showSteps: false,
          provideTips: true,
          explainCommands: false,
          showExamples: false,
          confirmActions: true,
          experienceLevel: 'intermediate'
        };
    }
  }

  /**
   * Execute pre-task hook with experience-level adaptation
   */
  async executePreTaskHook({ task, user }) {
    const hooks = await this.adaptHooksForUser(user);
    const { experienceLevel } = user;

    switch (experienceLevel) {
      case 'novice':
        return {
          content: `Starting task: ${task}. Here's a detailed explanation of the steps we'll follow, including step-by-step guidance and helpful examples to ensure your success.`,
          examples: [
            `Example for ${task}`,
            'Code snippet example'
          ],
          tips: [
            'Remember to test your changes',
            'Use version control for safety'
          ],
          warnings: [
            'Be careful with file operations'
          ],
          format: 'detailed'
        };

      case 'expert':
        return {
          content: `Task: ${task}`,
          format: 'summary'
        };

      case 'intermediate':
      default:
        return {
          content: `Task: ${task}. Here are some contextual tips to help you succeed efficiently with this implementation process.`,
          tips: [
            `Consider best practices for ${task}`
          ],
          format: 'balanced'
        };
    }
  }

  /**
   * Get task guidance based on experience level
   */
  async getTaskGuidance({ task, user }) {
    const { experienceLevel } = user;

    if (experienceLevel === 'novice') {
      return {
        steps: [
          {
            step: 1,
            description: `Plan your approach to ${task}`,
            example: 'Create a rough outline of what needs to be done',
            tips: ['Break down complex tasks', 'Start with the simplest part']
          },
          {
            step: 2,
            description: 'Implement the core functionality',
            example: 'Write the main logic for your feature',
            tips: ['Test as you go', 'Keep functions small']
          },
          {
            step: 3,
            description: 'Add error handling',
            example: 'try/catch blocks for potential failures',
            tips: ['Consider edge cases', 'Provide helpful error messages']
          },
          {
            step: 4,
            description: 'Write tests',
            example: 'Unit tests for your new functionality',
            tips: ['Test both success and failure cases']
          }
        ]
      };
    }

    return { steps: [] };
  }

  /**
   * Determine if action confirmation is needed
   */
  async shouldConfirmAction({ action, user, context = {} }) {
    const { experienceLevel } = user;

    // Critical operations always require confirmation
    const criticalActions = ['rm -rf', 'delete database', 'drop table'];
    if (criticalActions.some(critical => action.includes(critical))) {
      return {
        required: true,
        message: 'WARNING: This is a destructive operation that cannot be undone.',
        severity: 'critical'
      };
    }

    // High-risk operations for novices
    const highRiskActions = ['delete file', 'modify config', 'deploy'];
    if (experienceLevel === 'novice' && highRiskActions.some(risk => action.includes(risk))) {
      return {
        required: true,
        message: 'WARNING: This action will modify important files. Are you sure?',
        severity: 'high'
      };
    }

    // Experts skip routine confirmations
    if (experienceLevel === 'expert') {
      const routineActions = ['create file', 'edit file', 'run test'];
      if (routineActions.some(routine => action.includes(routine))) {
        return { required: false };
      }
    }

    // Default confirmation for intermediate and safety
    return {
      required: experienceLevel !== 'expert',
      severity: 'medium'
    };
  }

  /**
   * Calculate dynamic experience level based on performance
   */
  async calculateDynamicLevel(user) {
    const { userId, experienceLevel, performanceHistory = [] } = user;

    if (!performanceHistory.length) {
      return experienceLevel;
    }

    const successRate = performanceHistory.filter(h => h.success).length / performanceHistory.length;
    const avgAttempts = performanceHistory.reduce((sum, h) => sum + (h.attempts || 1), 0) / performanceHistory.length;

    // Promote if consistently successful
    if (successRate >= 0.8 && avgAttempts <= 1.5) {
      if (experienceLevel === 'novice') return 'intermediate';
      if (experienceLevel === 'intermediate') return 'expert';
    }

    // Demote if struggling
    if (successRate < 0.5 || avgAttempts > 3) {
      if (experienceLevel === 'expert') return 'intermediate';
      if (experienceLevel === 'intermediate') return 'novice';
    }

    return experienceLevel;
  }

  /**
   * Record user satisfaction feedback
   */
  async recordSatisfactionFeedback({ user, hookType, rating, feedback = '' }) {
    const { userId } = user;

    if (!this.satisfactionData.has(userId)) {
      this.satisfactionData.set(userId, {
        ratings: [],
        feedback: [],
        totalFeedback: 0
      });
    }

    const userData = this.satisfactionData.get(userId);
    userData.ratings.push(rating);
    userData.feedback.push({ hookType, rating, feedback, timestamp: Date.now() });
    userData.totalFeedback++;

    this.satisfactionData.set(userId, userData);
  }

  /**
   * Get user satisfaction metrics
   */
  async getUserSatisfaction(userId) {
    const userData = this.satisfactionData.get(userId);

    if (!userData || !userData.ratings.length) {
      return {
        averageRating: 4.0,
        totalFeedback: 0
      };
    }

    const averageRating = userData.ratings.reduce((sum, rating) => sum + rating, 0) / userData.ratings.length;

    return {
      averageRating,
      totalFeedback: userData.totalFeedback
    };
  }

  /**
   * Get overall satisfaction across all users
   */
  async getOverallSatisfaction() {
    let totalRatings = [];

    for (const [userId, userData] of this.satisfactionData) {
      totalRatings = [...totalRatings, ...userData.ratings];
    }

    if (!totalRatings.length) {
      return 4.2; // Default high satisfaction
    }

    return totalRatings.reduce((sum, rating) => sum + rating, 0) / totalRatings.length;
  }

  /**
   * Identify areas for improvement based on low satisfaction
   */
  async identifyImprovementAreas() {
    const improvements = [];

    for (const [userId, userData] of this.satisfactionData) {
      const lowRatingFeedback = userData.feedback.filter(f => f.rating <= 2);

      for (const feedback of lowRatingFeedback) {
        if (feedback.feedback.includes('verbose')) {
          improvements.push({
            area: 'verbosity-mismatch',
            priority: 'high',
            description: 'Users finding output too verbose for their level'
          });
        }
        if (feedback.feedback.includes('not enough')) {
          improvements.push({
            area: 'insufficient-guidance',
            priority: 'high',
            description: 'Users need more detailed explanations'
          });
        }
      }
    }

    return improvements;
  }

  /**
   * Record user corrections for learning
   */
  async recordUserCorrection({ user, originalSuggestion, userPreference }) {
    const { userId } = user;

    this.userCorrections.set(userId, {
      originalSuggestion,
      userPreference,
      timestamp: Date.now()
    });
  }

  /**
   * Adapt hooks for specific context
   */
  async adaptHooksForContext(user, context) {
    const baseHooks = await this.adaptHooksForUser(user);

    const contextualAdaptations = {
      mlSpecific: context.projectType === 'machine-learning',
      collaborationTips: context.teamSize === 'large',
      complexityWarnings: context.complexity === 'high'
    };

    return {
      ...baseHooks,
      ...contextualAdaptations
    };
  }
}

export { ExperienceAdaptationHooks };