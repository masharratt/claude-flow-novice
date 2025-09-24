/**
 * Adaptive Guidance System - Main Entry Point
 * Coordinates all guidance components for intelligent user assistance
 */

const AdaptiveGuide = require('./adaptive-guide');
const ContextHelper = require('./context-helper');
const ExperienceManager = require('./experience-manager');
const { EventEmitter } = require('events');

class GuidanceSystem extends EventEmitter {
    constructor(options = {}) {
        super();

        // Initialize components
        this.adaptiveGuide = new AdaptiveGuide(options);
        this.contextHelper = new ContextHelper(this.adaptiveGuide);
        this.experienceManager = new ExperienceManager(this.adaptiveGuide);

        this.isInitialized = false;
        this.options = options;

        // Setup event forwarding
        this.setupEventForwarding();
    }

    /**
     * Initialize the guidance system
     */
    async initialize() {
        try {
            // Initialize adaptive guide first
            const initialized = await this.adaptiveGuide.initialize();
            if (!initialized) {
                throw new Error('Failed to initialize adaptive guide');
            }

            // Load context helper knowledge base
            await this.contextHelper.loadKnowledgeBase();

            this.isInitialized = true;
            this.emit('initialized', { success: true });

            return true;
        } catch (error) {
            console.error('Failed to initialize guidance system:', error);
            this.emit('error', { error, context: 'initialization' });
            return false;
        }
    }

    /**
     * Setup event forwarding from child components
     */
    setupEventForwarding() {
        // Forward adaptive guide events
        this.adaptiveGuide.on('guidanceProvided', (data) => {
            this.emit('guidanceProvided', data);
        });

        this.adaptiveGuide.on('experienceLevelChanged', (data) => {
            this.emit('experienceLevelChanged', data);
        });

        // Forward experience manager events
        this.experienceManager.on('milestoneAchieved', (data) => {
            this.emit('milestoneAchieved', data);
        });

        this.experienceManager.on('experienceLevelChanged', (data) => {
            this.emit('experienceLevelChanged', data);
        });
    }

    /**
     * Get comprehensive guidance for a command or task
     */
    async getGuidance(context) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // Get context analysis
            const contextAnalysis = await this.contextHelper.analyzeContext(context);

            // Get adaptive guidance
            const adaptiveGuidance = await this.adaptiveGuide.provideGuidance({
                ...context,
                taskType: contextAnalysis.taskType,
                complexity: contextAnalysis.complexity
            });

            // Get just-in-time help
            const justInTimeHelp = await this.contextHelper.provideJustInTimeHelp(
                context.command,
                context
            );

            // Combine all guidance
            const comprehensiveGuidance = {
                context: contextAnalysis,
                adaptive: adaptiveGuidance,
                justInTime: justInTimeHelp,
                experienceLevel: this.adaptiveGuide.getExperienceLevel(),
                timestamp: new Date().toISOString()
            };

            this.emit('guidanceGenerated', comprehensiveGuidance);
            return comprehensiveGuidance;

        } catch (error) {
            console.error('Failed to generate guidance:', error);
            this.emit('error', { error, context: 'guidance-generation' });
            return null;
        }
    }

    /**
     * Process command execution and learn from it
     */
    async processCommandExecution(execution) {
        if (!this.isInitialized) {
            return;
        }

        const {
            command,
            outcome,
            timeSpent,
            errorMessages,
            guidanceUsed,
            context = {}
        } = execution;

        try {
            // Update experience based on command execution
            await this.experienceManager.updateExperienceFromCommand(
                this.adaptiveGuide.userProfile,
                command,
                outcome,
                {
                    timeSpent,
                    errorMessages,
                    recoveredFromError: outcome === 'success' && errorMessages?.length > 0,
                    ...context
                }
            );

            // Learn from the interaction
            await this.adaptiveGuide.learnFromInteraction({
                command,
                outcome,
                timeSpent,
                guidanceUsed: Boolean(guidanceUsed)
            });

            this.emit('commandProcessed', {
                command,
                outcome,
                experienceLevel: this.adaptiveGuide.getExperienceLevel()
            });

        } catch (error) {
            console.error('Failed to process command execution:', error);
            this.emit('error', { error, context: 'command-processing' });
        }
    }

    /**
     * Get agent-specific guidance
     */
    getAgentGuidance(agentType, context) {
        return this.contextHelper.getAgentGuidance(agentType, context);
    }

    /**
     * Get learning recommendations
     */
    getLearningRecommendations() {
        const adaptiveRecommendations = this.adaptiveGuide.getLearningRecommendations();
        const experienceRecommendations = this.experienceManager.getLearningRecommendations(
            this.adaptiveGuide.userProfile
        );

        return {
            adaptive: adaptiveRecommendations,
            experience: experienceRecommendations,
            combined: [...adaptiveRecommendations, ...experienceRecommendations]
                .sort((a, b) => {
                    const priorityOrder = { high: 3, medium: 2, low: 1 };
                    return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1);
                })
                .slice(0, 5) // Limit to top 5 recommendations
        };
    }

    /**
     * Get learning path for user progression
     */
    getLearningPath() {
        return this.experienceManager.generateLearningPath(this.adaptiveGuide.userProfile);
    }

    /**
     * Get user's current experience level and stats
     */
    getUserStatus() {
        const profile = this.adaptiveGuide.userProfile;
        if (!profile) {
            return null;
        }

        return {
            experienceLevel: profile.experienceLevel,
            preferences: profile.preferences,
            stats: profile.stats,
            learningProgress: profile.learningProgress,
            skillProficiency: this.experienceManager.calculateSkillProficiency(profile),
            progressToNext: this.experienceManager.calculateProgressToNextLevel(profile)
        };
    }

    /**
     * Update user preferences
     */
    async updateUserPreferences(preferences) {
        return await this.adaptiveGuide.updatePreferences(preferences);
    }

    /**
     * Force experience level change
     */
    async setExperienceLevel(level) {
        return await this.adaptiveGuide.setExperienceLevel(level);
    }

    /**
     * Get knowledge base resources for a topic
     */
    getKnowledgeResources(topic) {
        return this.contextHelper.getLearningResources(topic);
    }

    /**
     * Get common patterns for a task type
     */
    getCommonPatterns(taskType) {
        return this.contextHelper.getCommonPatterns(taskType);
    }

    /**
     * Update knowledge base with new pattern
     */
    async updateKnowledgeBase(taskType, pattern) {
        return await this.contextHelper.updateKnowledgeBase(taskType, pattern);
    }

    /**
     * Get guidance for CLI commands
     */
    async getCommandGuidance(command, args = [], context = {}) {
        const guidanceContext = {
            command,
            parameters: args,
            taskType: this.inferTaskTypeFromCommand(command),
            userInput: `${command} ${args.join(' ')}`.trim(),
            ...context
        };

        return await this.getGuidance(guidanceContext);
    }

    /**
     * Infer task type from command
     */
    inferTaskTypeFromCommand(command) {
        const commandMap = {
            'swarm-init': 'coordination',
            'agent-spawn': 'agent-management',
            'task-orchestrate': 'task-orchestration',
            'sparc': 'development',
            'test': 'testing',
            'build': 'deployment',
            'debug': 'debugging',
            'optimize': 'performance-optimization'
        };

        for (const [cmd, type] of Object.entries(commandMap)) {
            if (command.includes(cmd)) {
                return type;
            }
        }

        return 'general';
    }

    /**
     * Generate tutorial content for specific experience level
     */
    generateTutorial(topic, experienceLevel = null) {
        const level = experienceLevel || this.adaptiveGuide.getExperienceLevel();
        const levelInfo = this.experienceManager.getExperienceLevelInfo(level);

        const tutorial = {
            topic,
            level,
            verbosity: levelInfo.guidance.verbosity,
            includeExamples: levelInfo.guidance.provideExamples,
            showWarnings: levelInfo.guidance.showWarnings,
            content: this.generateTutorialContent(topic, level)
        };

        return tutorial;
    }

    /**
     * Generate tutorial content based on topic and level
     */
    generateTutorialContent(topic, level) {
        // This would be expanded with actual tutorial content
        const content = {
            title: `${topic} - ${level} level`,
            sections: [],
            estimatedTime: '15 minutes',
            prerequisites: []
        };

        // Add level-appropriate content structure
        if (level === 'novice') {
            content.sections.push(
                { title: 'Introduction', type: 'explanation' },
                { title: 'Step-by-Step Guide', type: 'walkthrough' },
                { title: 'Common Mistakes', type: 'warnings' },
                { title: 'Practice Exercise', type: 'exercise' }
            );
        } else if (level === 'intermediate') {
            content.sections.push(
                { title: 'Overview', type: 'summary' },
                { title: 'Key Concepts', type: 'explanation' },
                { title: 'Best Practices', type: 'guide' },
                { title: 'Advanced Usage', type: 'examples' }
            );
        } else {
            content.sections.push(
                { title: 'Quick Reference', type: 'reference' },
                { title: 'Advanced Techniques', type: 'guide' },
                { title: 'Optimization Tips', type: 'tips' }
            );
        }

        return content;
    }

    /**
     * Cleanup and save state
     */
    async shutdown() {
        try {
            if (this.adaptiveGuide) {
                await this.adaptiveGuide.saveUserProfile();
                await this.adaptiveGuide.saveBehaviorPatterns();
            }

            if (this.contextHelper) {
                await this.contextHelper.persistKnowledgeBase();
            }

            this.emit('shutdown', { success: true });
        } catch (error) {
            console.error('Error during guidance system shutdown:', error);
            this.emit('error', { error, context: 'shutdown' });
        }
    }

    /**
     * Get system health and statistics
     */
    getSystemHealth() {
        return {
            initialized: this.isInitialized,
            userProfileLoaded: Boolean(this.adaptiveGuide?.userProfile),
            experienceLevel: this.adaptiveGuide?.getExperienceLevel() || 'unknown',
            knowledgeBaseSize: this.contextHelper?.knowledgeBase?.size || 0,
            behaviorPatternsCount: this.adaptiveGuide?.behaviorPatterns?.size || 0,
            systemUptime: process.uptime(),
            memoryUsage: process.memoryUsage()
        };
    }
}

module.exports = {
    GuidanceSystem,
    AdaptiveGuide,
    ContextHelper,
    ExperienceManager
};