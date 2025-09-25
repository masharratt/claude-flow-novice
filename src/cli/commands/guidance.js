/**
 * CLI Commands for Guidance System
 * Provides command-line interface for accessing adaptive guidance features
 */

const { Command } = require('commander');
const { GuidanceSystem } = require('../../guidance');
const chalk = require('chalk');
const Table = require('cli-table3');

class GuidanceCommands {
    constructor() {
        this.guidanceSystem = null;
        this.program = new Command();
        this.setupCommands();
    }

    /**
     * Setup all guidance-related commands
     */
    setupCommands() {
        const guidance = this.program
            .command('guidance')
            .alias('guide')
            .description('Adaptive guidance system commands');

        // Initialize guidance system
        guidance
            .command('init')
            .description('Initialize the guidance system')
            .option('--config-dir <dir>', 'Configuration directory path')
            .action(async (options) => {
                await this.initializeGuidance(options);
            });

        // Get guidance for a command
        guidance
            .command('help-with <command>')
            .alias('hw')
            .description('Get contextual help for a specific command')
            .option('--task-type <type>', 'Specify task type for better guidance')
            .option('--complexity <level>', 'Specify complexity level (low, medium, high)')
            .option('--verbose', 'Get detailed explanations')
            .action(async (command, options) => {
                await this.getCommandHelp(command, options);
            });

        // Show user status and experience level
        guidance
            .command('status')
            .alias('st')
            .description('Show your experience level and learning progress')
            .option('--detailed', 'Show detailed statistics')
            .action(async (options) => {
                await this.showUserStatus(options);
            });

        // Get learning recommendations
        guidance
            .command('learn')
            .alias('rec')
            .description('Get personalized learning recommendations')
            .option('--topic <topic>', 'Get recommendations for specific topic')
            .action(async (options) => {
                await this.showLearningRecommendations(options);
            });

        // Show learning path
        guidance
            .command('path')
            .description('Show your learning path and progression')
            .action(async () => {
                await this.showLearningPath();
            });

        // Set experience level
        guidance
            .command('level <level>')
            .description('Set your experience level (novice, intermediate, expert, adaptive)')
            .action(async (level) => {
                await this.setExperienceLevel(level);
            });

        // Update preferences
        guidance
            .command('preferences')
            .alias('prefs')
            .description('Manage guidance preferences')
            .option('--tips <boolean>', 'Enable/disable tips (true/false)')
            .option('--warnings <boolean>', 'Enable/disable safety warnings (true/false)')
            .option('--verbosity <level>', 'Set verbosity level (low, medium, high)')
            .option('--auto-suggest <boolean>', 'Enable/disable auto-suggestions (true/false)')
            .action(async (options) => {
                await this.updatePreferences(options);
            });

        // Get knowledge resources
        guidance
            .command('resources <topic>')
            .alias('res')
            .description('Get learning resources for a specific topic')
            .action(async (topic) => {
                await this.showKnowledgeResources(topic);
            });

        // Get common patterns
        guidance
            .command('patterns <taskType>')
            .alias('pat')
            .description('Show common patterns for a task type')
            .action(async (taskType) => {
                await this.showCommonPatterns(taskType);
            });

        // Analyze current context
        guidance
            .command('analyze')
            .description('Analyze current project context and get suggestions')
            .option('--files <glob>', 'Analyze specific files')
            .option('--errors <file>', 'Include error log for analysis')
            .action(async (options) => {
                await this.analyzeContext(options);
            });

        // Generate tutorial
        guidance
            .command('tutorial <topic>')
            .alias('tut')
            .description('Generate a tutorial for a specific topic')
            .option('--level <level>', 'Target experience level')
            .option('--save <file>', 'Save tutorial to file')
            .action(async (topic, options) => {
                await this.generateTutorial(topic, options);
            });

        // Show system health
        guidance
            .command('health')
            .description('Show guidance system health and statistics')
            .action(async () => {
                await this.showSystemHealth();
            });
    }

    /**
     * Initialize guidance system
     */
    async initializeGuidance(options) {
        try {
            console.log(chalk.blue('🚀 Initializing adaptive guidance system...'));

            this.guidanceSystem = new GuidanceSystem(options);

            // Setup event listeners
            this.guidanceSystem.on('initialized', () => {
                console.log(chalk.green('✅ Guidance system initialized successfully'));
            });

            this.guidanceSystem.on('error', ({ error, context }) => {
                console.error(chalk.red(`❌ Error in ${context}:`, error.message));
            });

            const initialized = await this.guidanceSystem.initialize();

            if (initialized) {
                const status = this.guidanceSystem.getUserStatus();
                console.log(chalk.cyan(`\n👤 Experience Level: ${status?.experienceLevel || 'novice'}`));
                console.log(chalk.gray('💡 Use "claude-flow guidance help-with <command>" for contextual help'));
            } else {
                console.error(chalk.red('❌ Failed to initialize guidance system'));
                process.exit(1);
            }
        } catch (error) {
            console.error(chalk.red('❌ Initialization failed:', error.message));
            process.exit(1);
        }
    }

    /**
     * Get contextual help for a command
     */
    async getCommandHelp(command, options) {
        await this.ensureInitialized();

        try {
            const context = {
                command,
                taskType: options.taskType,
                complexity: options.complexity,
                userInput: command
            };

            const guidance = await this.guidanceSystem.getCommandGuidance(command, [], context);

            if (!guidance) {
                console.log(chalk.yellow('⚠️  No specific guidance available for this command'));
                return;
            }

            this.displayGuidance(guidance, options.verbose);
        } catch (error) {
            console.error(chalk.red('❌ Failed to get command help:', error.message));
        }
    }

    /**
     * Display guidance information
     */
    displayGuidance(guidance, verbose = false) {
        console.log(chalk.blue.bold(`\n📚 Guidance for: ${guidance.context.taskType || 'general'}`));
        console.log(chalk.gray(`Experience Level: ${guidance.experienceLevel}`));

        // Context information
        if (guidance.context) {
            console.log(chalk.cyan('\n🎯 Context Analysis:'));
            console.log(`  Task Type: ${guidance.context.taskType}`);
            console.log(`  Complexity: ${guidance.context.complexity}`);
            console.log(`  Urgency: ${guidance.context.urgency}`);

            if (guidance.context.recommendedAgents?.length > 0) {
                console.log(`  Recommended Agents: ${guidance.context.recommendedAgents.join(', ')}`);
            }
        }

        // Adaptive guidance
        if (guidance.adaptive) {
            const adaptive = guidance.adaptive;

            // Suggestions
            if (adaptive.suggestions?.length > 0) {
                console.log(chalk.green('\n💡 Suggestions:'));
                adaptive.suggestions.forEach((suggestion, index) => {
                    const priority = suggestion.priority === 'high' ? '🔴' :
                                   suggestion.priority === 'medium' ? '🟡' : '🟢';
                    console.log(`  ${index + 1}. ${priority} ${suggestion.message}`);

                    if (suggestion.action) {
                        console.log(`     Command: ${chalk.cyan(suggestion.action)}`);
                    }
                });
            }

            // Warnings
            if (adaptive.warnings?.length > 0) {
                console.log(chalk.yellow('\n⚠️  Warnings:'));
                adaptive.warnings.forEach((warning, index) => {
                    console.log(`  ${index + 1}. ${warning.message}`);
                    if (warning.suggestion) {
                        console.log(`     Suggestion: ${warning.suggestion}`);
                    }
                });
            }

            // Tips
            if (adaptive.tips?.length > 0 && verbose) {
                console.log(chalk.blue('\n💡 Tips:'));
                adaptive.tips.forEach((tip, index) => {
                    console.log(`  ${index + 1}. ${tip.message}`);
                });
            }

            // Examples
            if (adaptive.examples?.length > 0 && verbose) {
                console.log(chalk.magenta('\n📝 Examples:'));
                adaptive.examples.forEach((example, index) => {
                    console.log(`  ${index + 1}. ${example.title}`);
                    console.log(`     ${chalk.cyan(example.command)}`);
                    console.log(`     ${example.description}`);
                });
            }

            // Next steps
            if (adaptive.nextSteps?.length > 0) {
                console.log(chalk.cyan('\n🔄 Next Steps:'));
                adaptive.nextSteps.forEach((step, index) => {
                    console.log(`  ${index + 1}. ${step.description}`);
                    if (step.command) {
                        console.log(`     Command: ${chalk.cyan(step.command)}`);
                    }
                });
            }
        }

        // Just-in-time help
        if (guidance.justInTime && verbose) {
            const jit = guidance.justInTime;

            if (jit.quickTips?.length > 0) {
                console.log(chalk.blue('\n⚡ Quick Tips:'));
                jit.quickTips.forEach(tip => console.log(`  • ${tip}`));
            }

            if (jit.commonMistakes?.length > 0) {
                console.log(chalk.red('\n🚫 Common Mistakes to Avoid:'));
                jit.commonMistakes.forEach(mistake => console.log(`  • ${mistake}`));
            }
        }
    }

    /**
     * Show user status and experience level
     */
    async showUserStatus(options) {
        await this.ensureInitialized();

        try {
            const status = this.guidanceSystem.getUserStatus();

            if (!status) {
                console.log(chalk.yellow('⚠️  No user profile found'));
                return;
            }

            console.log(chalk.blue.bold('\n👤 User Status\n'));

            // Basic info
            console.log(`Experience Level: ${chalk.cyan(status.experienceLevel)}`);
            console.log(`Progress to Next: ${chalk.green(Math.round(status.progressToNext * 100))}%`);

            // Statistics
            if (options.detailed) {
                const table = new Table({
                    head: ['Metric', 'Value'],
                    colWidths: [25, 15]
                });

                table.push(
                    ['Total Commands', status.stats.totalCommands],
                    ['Successful Commands', status.stats.successfulCommands],
                    ['Failed Commands', status.stats.failedCommands],
                    ['Success Rate', `${Math.round((status.stats.successfulCommands / status.stats.totalCommands) * 100)}%`],
                    ['Days Active', status.stats.daysActive || 0]
                );

                console.log('\n📊 Statistics:');
                console.log(table.toString());

                // Skill proficiency
                if (status.skillProficiency) {
                    console.log(chalk.blue('\n🎯 Skill Proficiency:'));
                    Object.entries(status.skillProficiency).forEach(([skill, score]) => {
                        const percentage = Math.round(score * 100);
                        const bar = '█'.repeat(Math.floor(percentage / 10)) + '░'.repeat(10 - Math.floor(percentage / 10));
                        console.log(`  ${skill}: ${chalk.cyan(bar)} ${percentage}%`);
                    });
                }

                // Learning progress
                if (status.learningProgress) {
                    console.log(chalk.green('\n🏆 Achievements:'));
                    console.log(`  Completed Tutorials: ${status.learningProgress.completedTutorials?.length || 0}`);
                    console.log(`  Mastered Concepts: ${status.learningProgress.masteredConcepts?.length || 0}`);

                    if (status.learningProgress.strugglingAreas?.length > 0) {
                        console.log(chalk.yellow('  Areas for Improvement:'));
                        status.learningProgress.strugglingAreas.forEach(area => {
                            console.log(`    • ${area}`);
                        });
                    }
                }
            }

        } catch (error) {
            console.error(chalk.red('❌ Failed to get user status:', error.message));
        }
    }

    /**
     * Show learning recommendations
     */
    async showLearningRecommendations(options) {
        await this.ensureInitialized();

        try {
            const recommendations = this.guidanceSystem.getLearningRecommendations();

            if (recommendations.combined.length === 0) {
                console.log(chalk.green('🎉 Great! No specific recommendations at the moment.'));
                return;
            }

            console.log(chalk.blue.bold('\n📚 Learning Recommendations\n'));

            recommendations.combined.forEach((rec, index) => {
                const priority = rec.priority === 'high' ? '🔴' :
                               rec.priority === 'medium' ? '🟡' : '🟢';

                console.log(`${index + 1}. ${priority} ${chalk.cyan(rec.title)}`);
                console.log(`   ${rec.description}`);

                if (rec.estimatedTime) {
                    console.log(`   ⏱️  Estimated time: ${rec.estimatedTime}`);
                }

                if (rec.prerequisite) {
                    console.log(`   📋 Prerequisite: ${rec.prerequisite}`);
                }

                console.log('');
            });

            console.log(chalk.gray('💡 Use "claude-flow guidance tutorial <topic>" to start learning'));

        } catch (error) {
            console.error(chalk.red('❌ Failed to get recommendations:', error.message));
        }
    }

    /**
     * Show learning path
     */
    async showLearningPath() {
        await this.ensureInitialized();

        try {
            const path = this.guidanceSystem.getLearningPath();

            console.log(chalk.blue.bold('\n🛣️  Your Learning Path\n'));

            console.log(`Current Level: ${chalk.cyan(path.currentLevel)}`);
            console.log(`Next Level: ${chalk.green(path.nextLevel)}`);
            console.log(`Progress: ${chalk.yellow(Math.round(path.progressToNext * 100))}%`);
            console.log(`Estimated Time to Next: ${path.estimatedTimeToNext}`);

            if (path.recommendedTutorials?.length > 0) {
                console.log(chalk.blue('\n📖 Recommended Tutorials:'));
                path.recommendedTutorials.forEach((tutorial, index) => {
                    console.log(`  ${index + 1}. ${tutorial.title} (${tutorial.estimatedTime})`);
                });
            }

            if (path.focusAreas?.length > 0) {
                console.log(chalk.yellow('\n🎯 Focus Areas:'));
                path.focusAreas.forEach(area => {
                    console.log(`  • ${area}`);
                });
            }

        } catch (error) {
            console.error(chalk.red('❌ Failed to get learning path:', error.message));
        }
    }

    /**
     * Set experience level
     */
    async setExperienceLevel(level) {
        await this.ensureInitialized();

        try {
            await this.guidanceSystem.setExperienceLevel(level);
            console.log(chalk.green(`✅ Experience level set to: ${level}`));

            // Show updated status
            const status = this.guidanceSystem.getUserStatus();
            console.log(chalk.cyan(`Current guidance settings will be adjusted for ${status.experienceLevel} level`));

        } catch (error) {
            console.error(chalk.red('❌ Failed to set experience level:', error.message));
        }
    }

    /**
     * Update preferences
     */
    async updatePreferences(options) {
        await this.ensureInitialized();

        try {
            const updates = {};

            if (options.tips !== undefined) {
                updates.showTips = options.tips === 'true';
            }
            if (options.warnings !== undefined) {
                updates.safetyMode = options.warnings === 'true';
            }
            if (options.verbosity) {
                updates.preferredVerbosity = options.verbosity;
            }
            if (options.autoSuggest !== undefined) {
                updates.autoSuggest = options.autoSuggest === 'true';
            }

            if (Object.keys(updates).length === 0) {
                // Show current preferences
                const status = this.guidanceSystem.getUserStatus();
                console.log(chalk.blue('\n⚙️  Current Preferences:\n'));

                const table = new Table({
                    head: ['Setting', 'Value'],
                    colWidths: [20, 15]
                });

                Object.entries(status.preferences || {}).forEach(([key, value]) => {
                    table.push([key, String(value)]);
                });

                console.log(table.toString());
                return;
            }

            await this.guidanceSystem.updateUserPreferences(updates);
            console.log(chalk.green('✅ Preferences updated successfully'));

            // Show updated preferences
            Object.entries(updates).forEach(([key, value]) => {
                console.log(`  ${key}: ${chalk.cyan(value)}`);
            });

        } catch (error) {
            console.error(chalk.red('❌ Failed to update preferences:', error.message));
        }
    }

    /**
     * Show knowledge resources
     */
    async showKnowledgeResources(topic) {
        await this.ensureInitialized();

        try {
            const resources = this.guidanceSystem.getKnowledgeResources(topic);

            if (resources.length === 0) {
                console.log(chalk.yellow(`⚠️  No resources found for topic: ${topic}`));
                return;
            }

            console.log(chalk.blue.bold(`\n📚 Resources for: ${topic}\n`));

            resources.forEach((resource, index) => {
                const icon = resource.type === 'tutorial' ? '📖' :
                           resource.type === 'guide' ? '📋' :
                           resource.type === 'example' ? '💡' :
                           resource.type === 'tool' ? '🔧' : '📄';

                console.log(`${index + 1}. ${icon} ${chalk.cyan(resource.title)}`);
                if (resource.url) {
                    console.log(`   🔗 ${resource.url}`);
                }
                console.log('');
            });

        } catch (error) {
            console.error(chalk.red('❌ Failed to get resources:', error.message));
        }
    }

    /**
     * Show common patterns
     */
    async showCommonPatterns(taskType) {
        await this.ensureInitialized();

        try {
            const patterns = this.guidanceSystem.getCommonPatterns(taskType);

            if (patterns.length === 0) {
                console.log(chalk.yellow(`⚠️  No patterns found for task type: ${taskType}`));
                return;
            }

            console.log(chalk.blue.bold(`\n🏗️  Common Patterns for: ${taskType}\n`));

            patterns.forEach((pattern, index) => {
                console.log(`${index + 1}. ${chalk.cyan(pattern.name)}`);
                console.log(`   ${pattern.description}`);
                if (pattern.example) {
                    console.log(`   Example: ${chalk.gray(pattern.example)}`);
                }
                console.log('');
            });

        } catch (error) {
            console.error(chalk.red('❌ Failed to get patterns:', error.message));
        }
    }

    /**
     * Analyze current context
     */
    async analyzeContext(options) {
        await this.ensureInitialized();

        try {
            // Implementation would gather context from current directory, files, etc.
            console.log(chalk.blue('🔍 Analyzing current context...\n'));

            // Placeholder for actual context analysis
            console.log(chalk.green('Analysis complete! Context-specific guidance would be displayed here.'));
            console.log(chalk.gray('💡 This feature will be enhanced in future versions'));

        } catch (error) {
            console.error(chalk.red('❌ Failed to analyze context:', error.message));
        }
    }

    /**
     * Generate tutorial
     */
    async generateTutorial(topic, options) {
        await this.ensureInitialized();

        try {
            const level = options.level || this.guidanceSystem.adaptiveGuide.getExperienceLevel();
            const tutorial = this.guidanceSystem.generateTutorial(topic, level);

            console.log(chalk.blue.bold(`\n📖 Tutorial: ${tutorial.content.title}\n`));
            console.log(`Level: ${chalk.cyan(tutorial.level)}`);
            console.log(`Estimated Time: ${tutorial.content.estimatedTime}`);

            if (tutorial.content.prerequisites?.length > 0) {
                console.log(`Prerequisites: ${tutorial.content.prerequisites.join(', ')}`);
            }

            console.log(chalk.green('\n📋 Tutorial Sections:'));
            tutorial.content.sections.forEach((section, index) => {
                const icon = section.type === 'explanation' ? '📚' :
                           section.type === 'walkthrough' ? '👣' :
                           section.type === 'exercise' ? '💪' :
                           section.type === 'examples' ? '💡' : '📄';

                console.log(`  ${index + 1}. ${icon} ${section.title}`);
            });

            if (options.save) {
                console.log(chalk.gray(`\n💾 Tutorial content would be saved to: ${options.save}`));
            }

        } catch (error) {
            console.error(chalk.red('❌ Failed to generate tutorial:', error.message));
        }
    }

    /**
     * Show system health
     */
    async showSystemHealth() {
        await this.ensureInitialized();

        try {
            const health = this.guidanceSystem.getSystemHealth();

            console.log(chalk.blue.bold('\n🏥 Guidance System Health\n'));

            const table = new Table({
                head: ['Component', 'Status'],
                colWidths: [30, 20]
            });

            table.push(
                ['Initialized', health.initialized ? '✅ Yes' : '❌ No'],
                ['User Profile', health.userProfileLoaded ? '✅ Loaded' : '❌ Not Loaded'],
                ['Experience Level', health.experienceLevel],
                ['Knowledge Base Size', health.knowledgeBaseSize],
                ['Behavior Patterns', health.behaviorPatternsCount],
                ['System Uptime', `${Math.floor(health.systemUptime / 60)} minutes`]
            );

            console.log(table.toString());

            if (health.memoryUsage) {
                console.log(chalk.blue('\n💾 Memory Usage:'));
                console.log(`  RSS: ${Math.round(health.memoryUsage.rss / 1024 / 1024)} MB`);
                console.log(`  Heap Used: ${Math.round(health.memoryUsage.heapUsed / 1024 / 1024)} MB`);
            }

        } catch (error) {
            console.error(chalk.red('❌ Failed to get system health:', error.message));
        }
    }

    /**
     * Ensure guidance system is initialized
     */
    async ensureInitialized() {
        if (!this.guidanceSystem) {
            this.guidanceSystem = new GuidanceSystem();
            await this.guidanceSystem.initialize();
        }
    }

    /**
     * Get the configured program for CLI integration
     */
    getProgram() {
        return this.program;
    }
}

module.exports = GuidanceCommands;