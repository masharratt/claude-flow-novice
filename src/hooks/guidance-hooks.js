/**
 * Guidance System Hooks Integration
 * Integrates adaptive guidance with the existing hook system
 */

const { GuidanceSystem } = require('../guidance');
const path = require('path');

class GuidanceHooks {
    constructor(options = {}) {
        this.guidanceSystem = new GuidanceSystem(options);
        this.isInitialized = false;
        this.sessionContext = {
            currentTask: null,
            commandHistory: [],
            errorCount: 0,
            startTime: Date.now()
        };
    }

    /**
     * Initialize guidance hooks
     */
    async initialize() {
        if (this.isInitialized) {
            return true;
        }

        try {
            const initialized = await this.guidanceSystem.initialize();
            if (initialized) {
                this.isInitialized = true;
                this.setupEventHandlers();
                return true;
            }
            return false;
        } catch (error) {
            console.warn('Guidance hooks initialization failed:', error.message);
            return false;
        }
    }

    /**
     * Setup event handlers for guidance system
     */
    setupEventHandlers() {
        this.guidanceSystem.on('milestoneAchieved', (data) => {
            this.celebrateMilestone(data);
        });

        this.guidanceSystem.on('experienceLevelChanged', (data) => {
            this.announceExperienceLevelChange(data);
        });

        this.guidanceSystem.on('error', (data) => {
            console.warn('Guidance system error:', data.error.message);
        });
    }

    /**
     * Pre-task hook - provides guidance before task execution
     */
    async preTaskHook(context) {
        await this.initialize();

        const { command, args, taskDescription, options = {} } = context;

        try {
            // Update session context
            this.sessionContext.currentTask = {
                command,
                args,
                description: taskDescription,
                startTime: Date.now()
            };

            // Get guidance for the command
            const guidance = await this.guidanceSystem.getCommandGuidance(command, args, {
                taskDescription,
                currentFiles: await this.getCurrentProjectFiles(),
                ...context
            });

            // Provide guidance based on user's experience level
            if (guidance && this.shouldShowGuidance(guidance, options)) {
                this.displayPreTaskGuidance(guidance, options);
            }

            // Track command start
            this.sessionContext.commandHistory.push({
                command,
                args,
                startTime: Date.now(),
                status: 'started'
            });

            return {
                guidance,
                shouldProceed: true,
                modifiedContext: context
            };

        } catch (error) {
            console.warn('Pre-task guidance failed:', error.message);
            return { shouldProceed: true, modifiedContext: context };
        }
    }

    /**
     * Post-task hook - learns from task execution and provides follow-up guidance
     */
    async postTaskHook(context) {
        if (!this.isInitialized) {
            return;
        }

        const { command, args, outcome, error, duration, output } = context;

        try {
            // Update command history
            const lastCommand = this.sessionContext.commandHistory[this.sessionContext.commandHistory.length - 1];
            if (lastCommand && lastCommand.command === command) {
                lastCommand.status = outcome;
                lastCommand.duration = duration;
                lastCommand.error = error;
                lastCommand.endTime = Date.now();
            }

            // Process command execution for learning
            await this.guidanceSystem.processCommandExecution({
                command,
                outcome,
                timeSpent: duration,
                errorMessages: error ? [error.message] : [],
                guidanceUsed: Boolean(context.guidanceUsed),
                context: {
                    args,
                    output,
                    sessionDuration: Date.now() - this.sessionContext.startTime
                }
            });

            // Provide post-execution guidance
            await this.providePostExecutionGuidance(context);

            // Update error count
            if (outcome === 'failure') {
                this.sessionContext.errorCount++;
            }

        } catch (error) {
            console.warn('Post-task guidance failed:', error.message);
        }
    }

    /**
     * Pre-edit hook - provides guidance before file modifications
     */
    async preEditHook(context) {
        await this.initialize();

        const { filePath, operation, content } = context;

        try {
            // Analyze file context for guidance
            const fileContext = await this.analyzeFileContext(filePath, operation);

            // Get relevant guidance
            const guidance = await this.guidanceSystem.getGuidance({
                command: 'file-edit',
                taskType: this.inferTaskTypeFromFile(filePath),
                currentFiles: [filePath],
                operation,
                ...fileContext
            });

            if (guidance && guidance.adaptive.suggestions?.length > 0) {
                console.log('\n💡 File Edit Guidance:');
                guidance.adaptive.suggestions.forEach((suggestion, index) => {
                    if (suggestion.type === 'safety' || suggestion.priority === 'high') {
                        console.log(`  ${index + 1}. ⚠️  ${suggestion.message}`);
                    }
                });
            }

            return {
                guidance,
                shouldProceed: true,
                modifiedContext: context
            };

        } catch (error) {
            console.warn('Pre-edit guidance failed:', error.message);
            return { shouldProceed: true, modifiedContext: context };
        }
    }

    /**
     * Post-edit hook - learns from file modifications
     */
    async postEditHook(context) {
        if (!this.isInitialized) {
            return;
        }

        const { filePath, operation, success, error } = context;

        try {
            // Track file edit patterns
            await this.guidanceSystem.processCommandExecution({
                command: 'file-edit',
                outcome: success ? 'success' : 'failure',
                timeSpent: context.duration || 0,
                errorMessages: error ? [error.message] : [],
                context: {
                    filePath,
                    operation,
                    fileType: path.extname(filePath)
                }
            });

            // Provide suggestions for next steps
            if (success) {
                const nextSteps = await this.suggestNextSteps(filePath, operation);
                if (nextSteps.length > 0) {
                    console.log('\n🔄 Suggested next steps:');
                    nextSteps.forEach((step, index) => {
                        console.log(`  ${index + 1}. ${step}`);
                    });
                }
            }

        } catch (error) {
            console.warn('Post-edit guidance failed:', error.message);
        }
    }

    /**
     * Session start hook - initializes session context
     */
    async sessionStartHook(context) {
        await this.initialize();

        const { sessionId, projectPath, user } = context;

        try {
            // Initialize session context
            this.sessionContext = {
                sessionId,
                projectPath,
                user,
                currentTask: null,
                commandHistory: [],
                errorCount: 0,
                startTime: Date.now()
            };

            // Get user status and show welcome guidance
            const userStatus = this.guidanceSystem.getUserStatus();
            if (userStatus) {
                this.showWelcomeGuidance(userStatus);
            }

            // Get learning recommendations for new session
            const recommendations = this.guidanceSystem.getLearningRecommendations();
            if (recommendations.combined.length > 0) {
                console.log('\n📚 Today\'s learning suggestions:');
                recommendations.combined.slice(0, 2).forEach((rec, index) => {
                    console.log(`  ${index + 1}. ${rec.title} (${rec.estimatedTime || '10 min'})`);
                });
                console.log('  Use "claude-flow guidance learn" for more recommendations');
            }

        } catch (error) {
            console.warn('Session start guidance failed:', error.message);
        }
    }

    /**
     * Session end hook - saves learning data and provides session summary
     */
    async sessionEndHook(context) {
        if (!this.isInitialized) {
            return;
        }

        const { sessionId, duration, exportMetrics } = context;

        try {
            // Generate session summary
            const summary = this.generateSessionSummary();

            if (exportMetrics) {
                console.log('\n📊 Session Summary:');
                console.log(`  Commands executed: ${summary.totalCommands}`);
                console.log(`  Success rate: ${summary.successRate}%`);
                console.log(`  Session duration: ${this.formatDuration(duration)}`);

                if (summary.milestonesAchieved > 0) {
                    console.log(`  🏆 Milestones achieved: ${summary.milestonesAchieved}`);
                }

                if (summary.experienceLevelChanged) {
                    console.log(`  🎉 Experience level upgraded to: ${summary.newExperienceLevel}`);
                }
            }

            // Save guidance data
            await this.guidanceSystem.shutdown();

        } catch (error) {
            console.warn('Session end guidance failed:', error.message);
        }
    }

    /**
     * Determine if guidance should be shown based on user preferences and context
     */
    shouldShowGuidance(guidance, options) {
        const userStatus = this.guidanceSystem.getUserStatus();
        if (!userStatus) return false;

        const preferences = userStatus.preferences;

        // Respect user's guidance preferences
        if (options.quiet || !preferences.showTips) {
            return false;
        }

        // Always show high-priority guidance
        const hasHighPriority = guidance.adaptive?.suggestions?.some(s => s.priority === 'high') ||
                               guidance.adaptive?.warnings?.length > 0;

        if (hasHighPriority) {
            return true;
        }

        // Show guidance based on experience level
        const experienceLevel = userStatus.experienceLevel;
        if (experienceLevel === 'novice') {
            return true;
        }

        if (experienceLevel === 'intermediate' && Math.random() < 0.5) {
            return true;
        }

        if (experienceLevel === 'expert' && Math.random() < 0.1) {
            return true;
        }

        return false;
    }

    /**
     * Display pre-task guidance
     */
    displayPreTaskGuidance(guidance, options) {
        const suggestions = guidance.adaptive?.suggestions || [];
        const warnings = guidance.adaptive?.warnings || [];

        // Show warnings first
        if (warnings.length > 0) {
            console.log('\n⚠️  Before you proceed:');
            warnings.forEach((warning, index) => {
                console.log(`  ${index + 1}. ${warning.message}`);
            });
        }

        // Show high-priority suggestions
        const highPrioritySuggestions = suggestions.filter(s => s.priority === 'high');
        if (highPrioritySuggestions.length > 0) {
            console.log('\n💡 Important suggestions:');
            highPrioritySuggestions.forEach((suggestion, index) => {
                console.log(`  ${index + 1}. ${suggestion.message}`);
                if (suggestion.action) {
                    console.log(`     Try: ${suggestion.action}`);
                }
            });
        }

        // Show recommended agents if available
        if (guidance.context?.recommendedAgents?.length > 0) {
            console.log(`\n🤖 Recommended agents: ${guidance.context.recommendedAgents.join(', ')}`);
        }
    }

    /**
     * Provide post-execution guidance
     */
    async providePostExecutionGuidance(context) {
        const { command, outcome, error, output } = context;

        // Success guidance
        if (outcome === 'success') {
            await this.provideSuccessGuidance(command, output);
        }

        // Error guidance
        if (outcome === 'failure' && error) {
            await this.provideErrorGuidance(command, error);
        }

        // Suggest optimizations or next steps
        const nextSteps = await this.suggestPostExecutionSteps(command, outcome);
        if (nextSteps.length > 0) {
            console.log('\n🔄 What to do next:');
            nextSteps.slice(0, 2).forEach((step, index) => {
                console.log(`  ${index + 1}. ${step}`);
            });
        }
    }

    /**
     * Provide success guidance
     */
    async provideSuccessGuidance(command, output) {
        const userStatus = this.guidanceSystem.getUserStatus();
        if (!userStatus || userStatus.experienceLevel === 'expert') {
            return;
        }

        // Congratulate novice users
        if (userStatus.experienceLevel === 'novice' && Math.random() < 0.3) {
            console.log('\n🎉 Well done! Command executed successfully.');
        }

        // Provide learning opportunities
        if (command.includes('swarm-init') && userStatus.experienceLevel === 'novice') {
            console.log('\n💡 Next: Try spawning agents with "claude-flow agent-spawn <type>"');
        }
    }

    /**
     * Provide error guidance
     */
    async provideErrorGuidance(command, error) {
        const errorMessage = error.message || String(error);

        // Get contextual error guidance
        const guidance = await this.guidanceSystem.getGuidance({
            command: 'error-recovery',
            taskType: 'debugging',
            errorMessages: [errorMessage],
            currentCommand: command
        });

        if (guidance?.adaptive?.suggestions) {
            console.log('\n🔧 Error recovery suggestions:');
            guidance.adaptive.suggestions.slice(0, 2).forEach((suggestion, index) => {
                console.log(`  ${index + 1}. ${suggestion.message}`);
            });
        }

        // Track repeated errors for learning
        this.sessionContext.errorCount++;
        if (this.sessionContext.errorCount >= 3) {
            console.log('\n💡 Tip: Consider using "claude-flow guidance help-with <command>" for detailed guidance');
        }
    }

    /**
     * Suggest next steps after command execution
     */
    async suggestPostExecutionSteps(command, outcome) {
        const steps = [];

        if (outcome === 'success') {
            if (command.includes('swarm-init')) {
                steps.push('Spawn specialized agents for your task');
                steps.push('Monitor swarm status with "claude-flow swarm-status"');
            }

            if (command.includes('agent-spawn')) {
                steps.push('Orchestrate tasks with "claude-flow task-orchestrate"');
                steps.push('Check agent metrics with "claude-flow agent-metrics"');
            }

            if (command.includes('task-orchestrate')) {
                steps.push('Monitor task progress with "claude-flow task-status"');
                steps.push('Review results when complete');
            }
        }

        return steps;
    }

    /**
     * Celebrate milestone achievements
     */
    celebrateMilestone(data) {
        console.log(`\n🏆 Milestone achieved: ${data.description}!`);
        console.log(`   Points earned: ${data.points}`);

        if (data.unlocks?.length > 0) {
            console.log(`   🔓 Unlocked: ${data.unlocks.join(', ')}`);
        }
    }

    /**
     * Announce experience level changes
     */
    announceExperienceLevelChange(data) {
        console.log(`\n🎉 Congratulations! You've advanced to ${data.newLevel} level!`);

        if (data.newLevel === 'intermediate') {
            console.log('   You now have access to more advanced features.');
        } else if (data.newLevel === 'expert') {
            console.log('   You\'re now recognized as an expert user!');
        }
    }

    /**
     * Show welcome guidance for new session
     */
    showWelcomeGuidance(userStatus) {
        const level = userStatus.experienceLevel;

        if (level === 'novice') {
            console.log('\n👋 Welcome! As a novice user, you\'ll receive detailed guidance.');
            console.log('   Use "claude-flow guidance help-with <command>" anytime for help.');
        } else if (level === 'intermediate') {
            console.log(`\n👋 Welcome back! You're ${Math.round(userStatus.progressToNext * 100)}% of the way to expert level.`);
        } else if (level === 'expert') {
            console.log('\n👋 Welcome back, expert! Guidance is minimal but available on demand.');
        }
    }

    /**
     * Analyze file context for guidance
     */
    async analyzeFileContext(filePath, operation) {
        const context = {
            fileType: path.extname(filePath),
            isTestFile: filePath.includes('.test.') || filePath.includes('.spec.'),
            isConfigFile: ['package.json', '.eslintrc', 'tsconfig.json'].some(config => filePath.includes(config)),
            operation
        };

        // Add more context based on file analysis
        return context;
    }

    /**
     * Infer task type from file path
     */
    inferTaskTypeFromFile(filePath) {
        if (filePath.includes('.test.') || filePath.includes('.spec.')) {
            return 'testing';
        }
        if (filePath.includes('package.json') || filePath.includes('config')) {
            return 'configuration';
        }
        if (filePath.includes('.js') || filePath.includes('.ts')) {
            return 'development';
        }
        if (filePath.includes('.md') || filePath.includes('README')) {
            return 'documentation';
        }
        return 'general';
    }

    /**
     * Get current project files for context
     */
    async getCurrentProjectFiles() {
        // Implementation would scan current directory
        // For now, return placeholder
        return [];
    }

    /**
     * Suggest next steps after file editing
     */
    async suggestNextSteps(filePath, operation) {
        const steps = [];

        if (filePath.includes('.test.')) {
            steps.push('Run tests to verify changes');
            steps.push('Check test coverage');
        } else if (filePath.includes('.js') || filePath.includes('.ts')) {
            steps.push('Run linter to check code quality');
            steps.push('Consider writing tests for new functionality');
        }

        return steps;
    }

    /**
     * Generate session summary
     */
    generateSessionSummary() {
        const totalCommands = this.sessionContext.commandHistory.length;
        const successfulCommands = this.sessionContext.commandHistory.filter(cmd => cmd.status === 'success').length;

        return {
            totalCommands,
            successfulCommands,
            successRate: totalCommands > 0 ? Math.round((successfulCommands / totalCommands) * 100) : 0,
            errorCount: this.sessionContext.errorCount,
            milestonesAchieved: 0, // Would track during session
            experienceLevelChanged: false, // Would track during session
            newExperienceLevel: null
        };
    }

    /**
     * Format duration in human-readable format
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
}

module.exports = GuidanceHooks;