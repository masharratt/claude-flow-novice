/**
 * Adaptive Guidance System
 * Provides intelligent, progressive assistance based on user experience and behavior patterns
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class AdaptiveGuide extends EventEmitter {
    constructor(options = {}) {
        super();
        this.configDir = options.configDir || path.join(process.cwd(), '.claude-flow');
        this.userProfile = null;
        this.behaviorPatterns = new Map();
        this.sessionContext = {
            taskType: null,
            complexity: 'medium',
            timeSpent: 0,
            errorsCount: 0,
            successfulCommands: 0
        };

        // Experience level thresholds
        this.experienceThresholds = {
            novice: { maxCommands: 50, maxSuccess: 30, maxDays: 7 },
            intermediate: { maxCommands: 200, maxSuccess: 150, maxDays: 30 },
            expert: { minCommands: 300, minSuccess: 250, minDays: 45 }
        };

        this.guidanceTemplates = {
            novice: {
                verbosity: 'high',
                includeExplanations: true,
                showSafetyWarnings: true,
                provideExamples: true,
                suggestAlternatives: true
            },
            intermediate: {
                verbosity: 'medium',
                includeExplanations: false,
                showSafetyWarnings: true,
                provideExamples: false,
                suggestAlternatives: true
            },
            expert: {
                verbosity: 'low',
                includeExplanations: false,
                showSafetyWarnings: false,
                provideExamples: false,
                suggestAlternatives: false
            },
            adaptive: {
                verbosity: 'dynamic',
                includeExplanations: 'contextual',
                showSafetyWarnings: 'smart',
                provideExamples: 'onDemand',
                suggestAlternatives: 'intelligent'
            }
        };
    }

    /**
     * Initialize the adaptive guidance system
     */
    async initialize() {
        try {
            await this.ensureConfigDirectory();
            await this.loadUserProfile();
            await this.loadBehaviorPatterns();
            this.emit('initialized', { profile: this.userProfile });
            return true;
        } catch (error) {
            console.error('Failed to initialize adaptive guidance:', error);
            return false;
        }
    }

    /**
     * Ensure configuration directory exists
     */
    async ensureConfigDirectory() {
        try {
            await fs.mkdir(this.configDir, { recursive: true });
            await fs.mkdir(path.join(this.configDir, 'guidance'), { recursive: true });
        } catch (error) {
            if (error.code !== 'EEXIST') {
                throw error;
            }
        }
    }

    /**
     * Load or create user profile
     */
    async loadUserProfile() {
        const profilePath = path.join(this.configDir, 'guidance', 'user-profile.json');

        try {
            const profileData = await fs.readFile(profilePath, 'utf8');
            this.userProfile = JSON.parse(profileData);

            // Update experience level based on current stats
            this.userProfile.experienceLevel = this.calculateExperienceLevel(this.userProfile);
        } catch (error) {
            // Create new profile for first-time user
            this.userProfile = this.createDefaultProfile();
            await this.saveUserProfile();
        }
    }

    /**
     * Create default user profile
     */
    createDefaultProfile() {
        return {
            userId: this.generateUserId(),
            experienceLevel: 'novice',
            preferences: {
                guidanceLevel: 'adaptive',
                showTips: true,
                autoSuggest: true,
                safetyMode: true
            },
            stats: {
                totalCommands: 0,
                successfulCommands: 0,
                failedCommands: 0,
                daysActive: 0,
                lastActiveDate: new Date().toISOString(),
                firstUseDate: new Date().toISOString()
            },
            taskHistory: [],
            learningProgress: {
                completedTutorials: [],
                masteredConcepts: [],
                strugglingAreas: []
            },
            adaptiveSettings: {
                preferredVerbosity: 'medium',
                contextualHelpFrequency: 0.7,
                errorToleranceLevel: 0.3
            }
        };
    }

    /**
     * Calculate experience level based on user statistics
     */
    calculateExperienceLevel(profile) {
        const { totalCommands, successfulCommands, daysActive } = profile.stats;
        const successRate = totalCommands > 0 ? successfulCommands / totalCommands : 0;

        // Adaptive level calculation
        if (profile.preferences.guidanceLevel === 'adaptive') {
            if (totalCommands < this.experienceThresholds.novice.maxCommands ||
                successfulCommands < this.experienceThresholds.novice.maxSuccess ||
                daysActive < this.experienceThresholds.novice.maxDays) {
                return 'novice';
            }

            if (totalCommands >= this.experienceThresholds.expert.minCommands &&
                successfulCommands >= this.experienceThresholds.expert.minSuccess &&
                daysActive >= this.experienceThresholds.expert.minDays &&
                successRate > 0.85) {
                return 'expert';
            }

            return 'intermediate';
        }

        return profile.preferences.guidanceLevel;
    }

    /**
     * Provide context-aware guidance for a command or task
     */
    async provideGuidance(context) {
        const { command, taskType, userInput, currentState } = context;

        // Update session context
        this.updateSessionContext(context);

        // Get appropriate guidance based on experience level
        const guidanceLevel = this.userProfile.experienceLevel;
        const template = this.guidanceTemplates[guidanceLevel];

        const guidance = {
            level: guidanceLevel,
            suggestions: await this.generateSuggestions(context, template),
            warnings: await this.generateWarnings(context, template),
            tips: await this.generateTips(context, template),
            alternatives: await this.generateAlternatives(context, template),
            examples: template.provideExamples ? await this.generateExamples(context) : null,
            nextSteps: await this.suggestNextSteps(context)
        };

        // Track guidance interaction
        this.trackGuidanceUsage(context, guidance);

        return guidance;
    }

    /**
     * Generate contextual suggestions
     */
    async generateSuggestions(context, template) {
        const suggestions = [];
        const { command, taskType } = context;

        // Command-specific suggestions
        if (command === 'swarm-init' && template.verbosity !== 'low') {
            suggestions.push({
                type: 'optimization',
                message: 'Consider starting with a mesh topology for balanced coordination',
                priority: 'medium',
                learnMore: 'topology-selection-guide'
            });
        }

        if (command === 'agent-spawn' && this.userProfile.experienceLevel === 'novice') {
            suggestions.push({
                type: 'safety',
                message: 'Start with 2-3 agents to avoid overwhelming your system',
                priority: 'high',
                learnMore: 'agent-management-basics'
            });
        }

        // Task-type suggestions
        if (taskType === 'development' && template.suggestAlternatives) {
            suggestions.push({
                type: 'workflow',
                message: 'Consider using TDD workflow for better code quality',
                priority: 'medium',
                action: 'claude-flow sparc tdd'
            });
        }

        return suggestions;
    }

    /**
     * Generate contextual warnings
     */
    async generateWarnings(context, template) {
        if (!template.showSafetyWarnings && template.showSafetyWarnings !== 'smart') {
            return [];
        }

        const warnings = [];
        const { command, parameters } = context;

        // Smart warnings for adaptive mode
        if (template.showSafetyWarnings === 'smart') {
            const errorRate = this.calculateRecentErrorRate();
            if (errorRate > 0.3) {
                warnings.push({
                    type: 'caution',
                    message: 'High error rate detected. Consider reviewing the documentation',
                    severity: 'medium'
                });
            }
        }

        // Resource warnings
        if (parameters && parameters.maxAgents > 10) {
            warnings.push({
                type: 'resource',
                message: 'Large agent count may impact performance',
                severity: 'low',
                suggestion: 'Start with fewer agents and scale up'
            });
        }

        return warnings;
    }

    /**
     * Generate contextual tips
     */
    async generateTips(context, template) {
        if (!this.userProfile.preferences.showTips) {
            return [];
        }

        const tips = [];
        const { command, taskType, userInput } = context;

        // Experience-based tips
        if (this.userProfile.experienceLevel === 'novice') {
            tips.push({
                type: 'learning',
                message: 'Pro tip: Use "claude-flow help <command>" for detailed information',
                category: 'navigation'
            });
        }

        // Context-specific tips
        if (taskType === 'debugging' && this.userProfile.stats.successfulCommands > 20) {
            tips.push({
                type: 'efficiency',
                message: 'Try using the reviewer agent for systematic code analysis',
                category: 'workflow'
            });
        }

        return tips;
    }

    /**
     * Generate alternative approaches
     */
    async generateAlternatives(context, template) {
        if (!template.suggestAlternatives) {
            return [];
        }

        const alternatives = [];
        const { command, taskType, parameters } = context;

        if (command === 'swarm-init') {
            alternatives.push({
                approach: 'hierarchical',
                description: 'Better for complex, multi-stage tasks',
                command: 'claude-flow swarm-init hierarchical'
            });

            alternatives.push({
                approach: 'star',
                description: 'Optimal for centralized coordination',
                command: 'claude-flow swarm-init star'
            });
        }

        return alternatives;
    }

    /**
     * Generate examples
     */
    async generateExamples(context) {
        const { command, taskType } = context;
        const examples = [];

        if (command === 'task-orchestrate') {
            examples.push({
                title: 'Simple API Development',
                command: 'claude-flow task-orchestrate "Build REST API with authentication"',
                description: 'Coordinates multiple agents to build a complete API'
            });
        }

        return examples;
    }

    /**
     * Suggest next steps
     */
    async suggestNextSteps(context) {
        const suggestions = [];
        const { command, currentState } = context;

        if (command === 'swarm-init') {
            suggestions.push({
                action: 'spawn-agents',
                description: 'Spawn specialized agents for your task',
                command: 'claude-flow agent-spawn <type>'
            });
        }

        if (currentState && currentState.activeAgents > 0) {
            suggestions.push({
                action: 'monitor-progress',
                description: 'Monitor swarm activity and performance',
                command: 'claude-flow swarm-status'
            });
        }

        return suggestions;
    }

    /**
     * Update session context
     */
    updateSessionContext(context) {
        this.sessionContext.taskType = context.taskType || this.sessionContext.taskType;
        this.sessionContext.complexity = context.complexity || this.sessionContext.complexity;

        if (context.error) {
            this.sessionContext.errorsCount++;
        }
        if (context.success) {
            this.sessionContext.successfulCommands++;
        }
    }

    /**
     * Track guidance usage and effectiveness
     */
    trackGuidanceUsage(context, guidance) {
        const usage = {
            timestamp: new Date().toISOString(),
            context: {
                command: context.command,
                taskType: context.taskType,
                experienceLevel: this.userProfile.experienceLevel
            },
            guidance: {
                suggestionsCount: guidance.suggestions.length,
                warningsCount: guidance.warnings.length,
                tipsCount: guidance.tips.length
            }
        };

        // Store for pattern analysis
        this.behaviorPatterns.set(`guidance-${Date.now()}`, usage);

        this.emit('guidanceProvided', usage);
    }

    /**
     * Learn from user behavior and adapt guidance
     */
    async learnFromInteraction(interaction) {
        const { command, outcome, timeSpent, guidanceUsed } = interaction;

        // Update user stats
        this.userProfile.stats.totalCommands++;
        if (outcome === 'success') {
            this.userProfile.stats.successfulCommands++;
        } else {
            this.userProfile.stats.failedCommands++;
        }

        // Analyze patterns for adaptive improvements
        if (this.userProfile.experienceLevel === 'adaptive') {
            await this.analyzeAndAdaptSettings(interaction);
        }

        // Update learning progress
        this.updateLearningProgress(command, outcome);

        await this.saveUserProfile();
    }

    /**
     * Analyze interaction patterns and adapt settings
     */
    async analyzeAndAdaptSettings(interaction) {
        const { timeSpent, guidanceUsed, outcome } = interaction;

        // Adapt verbosity based on guidance usage
        if (!guidanceUsed && outcome === 'success') {
            // User succeeded without guidance, reduce verbosity
            this.userProfile.adaptiveSettings.preferredVerbosity = this.reduceVerbosity(
                this.userProfile.adaptiveSettings.preferredVerbosity
            );
        } else if (guidanceUsed && outcome === 'failure') {
            // Guidance didn't help, increase verbosity
            this.userProfile.adaptiveSettings.preferredVerbosity = this.increaseVerbosity(
                this.userProfile.adaptiveSettings.preferredVerbosity
            );
        }

        // Adapt help frequency based on usage patterns
        if (timeSpent > 60 && !guidanceUsed) {
            // User spent long time without asking for help
            this.userProfile.adaptiveSettings.contextualHelpFrequency = Math.min(
                this.userProfile.adaptiveSettings.contextualHelpFrequency + 0.1,
                1.0
            );
        }
    }

    /**
     * Update learning progress
     */
    updateLearningProgress(command, outcome) {
        if (outcome === 'success') {
            const concept = this.commandToConcept(command);
            if (concept && !this.userProfile.learningProgress.masteredConcepts.includes(concept)) {
                const successCount = this.userProfile.taskHistory.filter(
                    task => task.command === command && task.outcome === 'success'
                ).length;

                if (successCount >= 3) {
                    this.userProfile.learningProgress.masteredConcepts.push(concept);
                }
            }
        } else {
            const concept = this.commandToConcept(command);
            if (concept && !this.userProfile.learningProgress.strugglingAreas.includes(concept)) {
                const failureCount = this.userProfile.taskHistory.filter(
                    task => task.command === command && task.outcome === 'failure'
                ).length;

                if (failureCount >= 2) {
                    this.userProfile.learningProgress.strugglingAreas.push(concept);
                }
            }
        }

        // Add to task history
        this.userProfile.taskHistory.push({
            command,
            outcome,
            timestamp: new Date().toISOString()
        });

        // Keep only last 100 entries
        if (this.userProfile.taskHistory.length > 100) {
            this.userProfile.taskHistory = this.userProfile.taskHistory.slice(-100);
        }
    }

    /**
     * Map command to learning concept
     */
    commandToConcept(command) {
        const conceptMap = {
            'swarm-init': 'swarm-coordination',
            'agent-spawn': 'agent-management',
            'task-orchestrate': 'task-orchestration',
            'sparc': 'sparc-methodology',
            'github': 'github-integration'
        };

        return conceptMap[command] || command;
    }

    /**
     * Calculate recent error rate
     */
    calculateRecentErrorRate() {
        const recentTasks = this.userProfile.taskHistory.slice(-10);
        if (recentTasks.length === 0) return 0;

        const failures = recentTasks.filter(task => task.outcome === 'failure').length;
        return failures / recentTasks.length;
    }

    /**
     * Adjust verbosity levels
     */
    reduceVerbosity(current) {
        const levels = ['low', 'medium', 'high'];
        const currentIndex = levels.indexOf(current);
        return currentIndex > 0 ? levels[currentIndex - 1] : current;
    }

    increaseVerbosity(current) {
        const levels = ['low', 'medium', 'high'];
        const currentIndex = levels.indexOf(current);
        return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : current;
    }

    /**
     * Load behavior patterns from storage
     */
    async loadBehaviorPatterns() {
        const patternsPath = path.join(this.configDir, 'guidance', 'behavior-patterns.json');

        try {
            const patternsData = await fs.readFile(patternsPath, 'utf8');
            const patterns = JSON.parse(patternsData);

            for (const [key, value] of Object.entries(patterns)) {
                this.behaviorPatterns.set(key, value);
            }
        } catch (error) {
            // No existing patterns, start fresh
            this.behaviorPatterns.clear();
        }
    }

    /**
     * Save user profile to storage
     */
    async saveUserProfile() {
        const profilePath = path.join(this.configDir, 'guidance', 'user-profile.json');

        try {
            await fs.writeFile(profilePath, JSON.stringify(this.userProfile, null, 2));
        } catch (error) {
            console.error('Failed to save user profile:', error);
        }
    }

    /**
     * Save behavior patterns to storage
     */
    async saveBehaviorPatterns() {
        const patternsPath = path.join(this.configDir, 'guidance', 'behavior-patterns.json');
        const patterns = Object.fromEntries(this.behaviorPatterns);

        try {
            await fs.writeFile(patternsPath, JSON.stringify(patterns, null, 2));
        } catch (error) {
            console.error('Failed to save behavior patterns:', error);
        }
    }

    /**
     * Generate unique user ID
     */
    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    }

    /**
     * Get user's current experience level
     */
    getExperienceLevel() {
        return this.userProfile?.experienceLevel || 'novice';
    }

    /**
     * Get guidance preferences
     */
    getGuidancePreferences() {
        return this.userProfile?.preferences || {};
    }

    /**
     * Update user preferences
     */
    async updatePreferences(newPreferences) {
        if (this.userProfile) {
            this.userProfile.preferences = { ...this.userProfile.preferences, ...newPreferences };
            await this.saveUserProfile();
            return true;
        }
        return false;
    }

    /**
     * Force experience level change
     */
    async setExperienceLevel(level) {
        const validLevels = ['novice', 'intermediate', 'expert', 'adaptive'];
        if (!validLevels.includes(level)) {
            throw new Error(`Invalid experience level: ${level}`);
        }

        this.userProfile.preferences.guidanceLevel = level;
        this.userProfile.experienceLevel = level;
        await this.saveUserProfile();

        this.emit('experienceLevelChanged', { level, profile: this.userProfile });
    }

    /**
     * Get learning recommendations
     */
    getLearningRecommendations() {
        const recommendations = [];
        const { strugglingAreas, masteredConcepts } = this.userProfile.learningProgress;

        // Recommend tutorials for struggling areas
        strugglingAreas.forEach(area => {
            recommendations.push({
                type: 'tutorial',
                area,
                priority: 'high',
                description: `Focused tutorial on ${area}`
            });
        });

        // Recommend advanced topics for mastered concepts
        masteredConcepts.forEach(concept => {
            recommendations.push({
                type: 'advanced',
                area: concept,
                priority: 'low',
                description: `Advanced techniques in ${concept}`
            });
        });

        return recommendations;
    }
}

module.exports = AdaptiveGuide;