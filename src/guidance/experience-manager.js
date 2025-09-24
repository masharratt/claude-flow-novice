/**
 * Experience Level Management System
 * Manages user experience levels and learning progression
 */

const { EventEmitter } = require('events');

class ExperienceManager extends EventEmitter {
    constructor(adaptiveGuide) {
        super();
        this.adaptiveGuide = adaptiveGuide;

        // Experience level definitions
        this.experienceLevels = {
            novice: {
                name: 'Novice',
                description: 'New to Claude Flow and AI orchestration',
                characteristics: {
                    needsDetailedExplanations: true,
                    requiresSafetyChecks: true,
                    benefitsFromStepByStep: true,
                    prefersGuidedWorkflows: true
                },
                guidance: {
                    verbosity: 'high',
                    showWarnings: true,
                    provideExamples: true,
                    suggestAlternatives: true,
                    includeEducationalContent: true
                },
                thresholds: {
                    maxTotalCommands: 50,
                    maxSuccessfulCommands: 30,
                    maxActiveDays: 7,
                    maxComplexTasks: 5
                }
            },

            intermediate: {
                name: 'Intermediate',
                description: 'Comfortable with basic operations, learning advanced features',
                characteristics: {
                    needsDetailedExplanations: false,
                    requiresSafetyChecks: true,
                    benefitsFromStepByStep: false,
                    prefersGuidedWorkflows: true
                },
                guidance: {
                    verbosity: 'medium',
                    showWarnings: true,
                    provideExamples: false,
                    suggestAlternatives: true,
                    includeEducationalContent: false
                },
                thresholds: {
                    minTotalCommands: 30,
                    maxTotalCommands: 200,
                    minSuccessfulCommands: 20,
                    maxSuccessfulCommands: 150,
                    minActiveDays: 5,
                    maxActiveDays: 30,
                    maxComplexTasks: 15
                }
            },

            expert: {
                name: 'Expert',
                description: 'Proficient with advanced features and complex orchestration',
                characteristics: {
                    needsDetailedExplanations: false,
                    requiresSafetyChecks: false,
                    benefitsFromStepByStep: false,
                    prefersGuidedWorkflows: false
                },
                guidance: {
                    verbosity: 'low',
                    showWarnings: false,
                    provideExamples: false,
                    suggestAlternatives: false,
                    includeEducationalContent: false
                },
                thresholds: {
                    minTotalCommands: 150,
                    minSuccessfulCommands: 120,
                    minActiveDays: 21,
                    minComplexTasks: 10,
                    minSuccessRate: 0.8
                }
            },

            adaptive: {
                name: 'Adaptive',
                description: 'Dynamic level that adjusts based on user behavior and context',
                characteristics: {
                    needsDetailedExplanations: 'contextual',
                    requiresSafetyChecks: 'intelligent',
                    benefitsFromStepByStep: 'situational',
                    prefersGuidedWorkflows: 'taskDependent'
                },
                guidance: {
                    verbosity: 'dynamic',
                    showWarnings: 'smart',
                    provideExamples: 'onDemand',
                    suggestAlternatives: 'intelligent',
                    includeEducationalContent: 'contextual'
                }
            }
        };

        // Learning milestones
        this.learningMilestones = {
            firstSuccessfulSwarm: {
                points: 10,
                description: 'Successfully initialized first swarm',
                unlocks: ['intermediate-topologies']
            },
            firstAgentSpawn: {
                points: 5,
                description: 'Successfully spawned first agent',
                unlocks: ['agent-coordination']
            },
            firstTaskOrchestration: {
                points: 15,
                description: 'Successfully orchestrated complex task',
                unlocks: ['advanced-workflows']
            },
            firstSPARCWorkflow: {
                points: 20,
                description: 'Completed full SPARC methodology workflow',
                unlocks: ['sparc-mastery']
            },
            errorRecoveryMastery: {
                points: 25,
                description: 'Demonstrated ability to recover from errors effectively',
                unlocks: ['advanced-debugging']
            },
            performanceOptimization: {
                points: 30,
                description: 'Successfully optimized system performance',
                unlocks: ['performance-tuning']
            }
        };

        // Skill categories
        this.skillCategories = {
            coordination: {
                name: 'Agent Coordination',
                skills: ['swarm-init', 'agent-spawn', 'task-orchestrate', 'swarm-monitor'],
                weight: 0.3
            },
            development: {
                name: 'Development Workflows',
                skills: ['sparc-methodology', 'tdd-workflow', 'code-review', 'testing'],
                weight: 0.25
            },
            optimization: {
                name: 'Performance Optimization',
                skills: ['bottleneck-analysis', 'resource-management', 'topology-optimization'],
                weight: 0.2
            },
            integration: {
                name: 'System Integration',
                skills: ['github-integration', 'ci-cd', 'deployment-automation'],
                weight: 0.15
            },
            troubleshooting: {
                name: 'Problem Resolution',
                skills: ['error-analysis', 'debugging', 'system-recovery'],
                weight: 0.1
            }
        };
    }

    /**
     * Calculate current experience level based on user profile
     */
    calculateExperienceLevel(userProfile) {
        if (!userProfile || !userProfile.stats) {
            return 'novice';
        }

        // If user explicitly set a non-adaptive level, respect it
        if (userProfile.preferences.guidanceLevel !== 'adaptive') {
            return userProfile.preferences.guidanceLevel;
        }

        const stats = userProfile.stats;
        const activeDays = this.calculateActiveDays(userProfile);
        const successRate = stats.totalCommands > 0 ? stats.successfulCommands / stats.totalCommands : 0;
        const complexTasksCompleted = this.countComplexTasks(userProfile);

        // Check expert criteria
        if (this.meetsExpertCriteria(stats, activeDays, successRate, complexTasksCompleted)) {
            return 'expert';
        }

        // Check novice criteria
        if (this.meetsNoviceCriteria(stats, activeDays, complexTasksCompleted)) {
            return 'novice';
        }

        // Default to intermediate
        return 'intermediate';
    }

    /**
     * Check if user meets expert criteria
     */
    meetsExpertCriteria(stats, activeDays, successRate, complexTasks) {
        const expertThresholds = this.experienceLevels.expert.thresholds;

        return stats.totalCommands >= expertThresholds.minTotalCommands &&
               stats.successfulCommands >= expertThresholds.minSuccessfulCommands &&
               activeDays >= expertThresholds.minActiveDays &&
               complexTasks >= expertThresholds.minComplexTasks &&
               successRate >= expertThresholds.minSuccessRate;
    }

    /**
     * Check if user meets novice criteria
     */
    meetsNoviceCriteria(stats, activeDays, complexTasks) {
        const noviceThresholds = this.experienceLevels.novice.thresholds;

        return stats.totalCommands <= noviceThresholds.maxTotalCommands ||
               stats.successfulCommands <= noviceThresholds.maxSuccessfulCommands ||
               activeDays <= noviceThresholds.maxActiveDays ||
               complexTasks <= noviceThresholds.maxComplexTasks;
    }

    /**
     * Calculate number of active days
     */
    calculateActiveDays(userProfile) {
        if (!userProfile.stats.firstUseDate) {
            return 0;
        }

        const firstUse = new Date(userProfile.stats.firstUseDate);
        const now = new Date();
        return Math.floor((now - firstUse) / (1000 * 60 * 60 * 24));
    }

    /**
     * Count complex tasks completed
     */
    countComplexTasks(userProfile) {
        if (!userProfile.taskHistory) {
            return 0;
        }

        const complexCommands = ['task-orchestrate', 'sparc', 'swarm-coordination', 'performance-optimization'];
        return userProfile.taskHistory.filter(task =>
            complexCommands.some(cmd => task.command.includes(cmd)) && task.outcome === 'success'
        ).length;
    }

    /**
     * Get experience level information
     */
    getExperienceLevelInfo(level) {
        return this.experienceLevels[level] || this.experienceLevels.novice;
    }

    /**
     * Get appropriate guidance settings for experience level
     */
    getGuidanceSettings(level) {
        const info = this.getExperienceLevelInfo(level);
        return info.guidance;
    }

    /**
     * Calculate skill proficiency across categories
     */
    calculateSkillProficiency(userProfile) {
        if (!userProfile.taskHistory) {
            return {};
        }

        const proficiency = {};

        for (const [categoryName, category] of Object.entries(this.skillCategories)) {
            let categoryScore = 0;
            let categoryTotal = 0;

            for (const skill of category.skills) {
                const skillTasks = userProfile.taskHistory.filter(task =>
                    task.command.includes(skill.replace('-', ' ')) || task.command.includes(skill)
                );

                if (skillTasks.length > 0) {
                    const successfulTasks = skillTasks.filter(task => task.outcome === 'success');
                    const skillScore = successfulTasks.length / skillTasks.length;
                    categoryScore += skillScore * category.weight;
                    categoryTotal += category.weight;
                }
            }

            proficiency[categoryName] = categoryTotal > 0 ? categoryScore / categoryTotal : 0;
        }

        return proficiency;
    }

    /**
     * Track milestone achievement
     */
    async trackMilestone(userProfile, milestoneKey, context = {}) {
        const milestone = this.learningMilestones[milestoneKey];
        if (!milestone) {
            return false;
        }

        // Check if milestone already achieved
        if (userProfile.learningProgress.completedTutorials.includes(milestoneKey)) {
            return false;
        }

        // Add to completed milestones
        userProfile.learningProgress.completedTutorials.push(milestoneKey);

        // Add experience points (if we implement a points system later)
        if (!userProfile.experiencePoints) {
            userProfile.experiencePoints = 0;
        }
        userProfile.experiencePoints += milestone.points;

        // Unlock new features or capabilities
        if (milestone.unlocks) {
            userProfile.learningProgress.unlockedFeatures = userProfile.learningProgress.unlockedFeatures || [];
            milestone.unlocks.forEach(feature => {
                if (!userProfile.learningProgress.unlockedFeatures.includes(feature)) {
                    userProfile.learningProgress.unlockedFeatures.push(feature);
                }
            });
        }

        // Emit milestone event
        this.emit('milestoneAchieved', {
            milestone: milestoneKey,
            description: milestone.description,
            points: milestone.points,
            unlocks: milestone.unlocks,
            context
        });

        // Check if this milestone achievement changes experience level
        const newLevel = this.calculateExperienceLevel(userProfile);
        const oldLevel = userProfile.experienceLevel;

        if (newLevel !== oldLevel) {
            userProfile.experienceLevel = newLevel;
            this.emit('experienceLevelChanged', {
                oldLevel,
                newLevel,
                trigger: 'milestone',
                milestone: milestoneKey
            });
        }

        return true;
    }

    /**
     * Get learning recommendations based on current level and progress
     */
    getLearningRecommendations(userProfile) {
        const currentLevel = userProfile.experienceLevel;
        const proficiency = this.calculateSkillProficiency(userProfile);
        const recommendations = [];

        // Level-specific recommendations
        switch (currentLevel) {
            case 'novice':
                recommendations.push({
                    type: 'tutorial',
                    priority: 'high',
                    title: 'Getting Started with Agent Coordination',
                    description: 'Learn the basics of swarm initialization and agent spawning',
                    estimatedTime: '15 minutes',
                    prerequisite: null
                });
                break;

            case 'intermediate':
                recommendations.push({
                    type: 'workflow',
                    priority: 'high',
                    title: 'Advanced SPARC Methodology',
                    description: 'Master the full SPARC workflow for complex projects',
                    estimatedTime: '30 minutes',
                    prerequisite: 'basic-coordination'
                });
                break;

            case 'expert':
                recommendations.push({
                    type: 'optimization',
                    priority: 'medium',
                    title: 'Custom Agent Development',
                    description: 'Learn to create specialized agents for unique use cases',
                    estimatedTime: '45 minutes',
                    prerequisite: 'advanced-workflows'
                });
                break;
        }

        // Skill-based recommendations
        for (const [category, score] of Object.entries(proficiency)) {
            if (score < 0.6) {
                recommendations.push({
                    type: 'skill-improvement',
                    priority: 'medium',
                    title: `Improve ${category} Skills`,
                    description: `Focus on improving ${category.toLowerCase()} proficiency`,
                    estimatedTime: '20 minutes',
                    category
                });
            }
        }

        return recommendations.sort((a, b) => {
            const priorityOrder = { high: 3, medium: 2, low: 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }

    /**
     * Generate personalized learning path
     */
    generateLearningPath(userProfile) {
        const currentLevel = userProfile.experienceLevel;
        const completedTutorials = userProfile.learningProgress.completedTutorials || [];
        const strugglingAreas = userProfile.learningProgress.strugglingAreas || [];

        const learningPath = {
            currentLevel,
            nextLevel: this.getNextLevel(currentLevel),
            progressToNext: this.calculateProgressToNextLevel(userProfile),
            recommendedTutorials: [],
            focusAreas: strugglingAreas,
            estimatedTimeToNext: this.estimateTimeToNextLevel(userProfile)
        };

        // Add level-appropriate tutorials
        const tutorials = this.getTutorialsForLevel(currentLevel);
        learningPath.recommendedTutorials = tutorials.filter(tutorial =>
            !completedTutorials.includes(tutorial.id)
        );

        return learningPath;
    }

    /**
     * Get next experience level
     */
    getNextLevel(currentLevel) {
        const levelOrder = ['novice', 'intermediate', 'expert'];
        const currentIndex = levelOrder.indexOf(currentLevel);

        if (currentIndex < levelOrder.length - 1) {
            return levelOrder[currentIndex + 1];
        }

        return 'expert'; // Already at highest level
    }

    /**
     * Calculate progress towards next level
     */
    calculateProgressToNextLevel(userProfile) {
        const currentLevel = userProfile.experienceLevel;
        const nextLevel = this.getNextLevel(currentLevel);

        if (currentLevel === nextLevel) {
            return 1.0; // Already at highest level
        }

        const nextLevelThresholds = this.experienceLevels[nextLevel].thresholds;
        const stats = userProfile.stats;

        const progress = {
            commands: Math.min(stats.totalCommands / (nextLevelThresholds.minTotalCommands || nextLevelThresholds.maxTotalCommands), 1.0),
            success: Math.min(stats.successfulCommands / (nextLevelThresholds.minSuccessfulCommands || nextLevelThresholds.maxSuccessfulCommands), 1.0),
            days: Math.min(this.calculateActiveDays(userProfile) / (nextLevelThresholds.minActiveDays || nextLevelThresholds.maxActiveDays), 1.0)
        };

        return (progress.commands + progress.success + progress.days) / 3;
    }

    /**
     * Estimate time to reach next level
     */
    estimateTimeToNextLevel(userProfile) {
        const progress = this.calculateProgressToNextLevel(userProfile);
        const currentRate = this.calculateLearningRate(userProfile);

        if (progress >= 1.0) {
            return '0 days';
        }

        if (currentRate === 0) {
            return 'Unknown';
        }

        const remainingProgress = 1.0 - progress;
        const estimatedDays = Math.ceil(remainingProgress / currentRate);

        if (estimatedDays < 7) {
            return `${estimatedDays} days`;
        } else if (estimatedDays < 30) {
            return `${Math.ceil(estimatedDays / 7)} weeks`;
        } else {
            return `${Math.ceil(estimatedDays / 30)} months`;
        }
    }

    /**
     * Calculate learning rate based on recent activity
     */
    calculateLearningRate(userProfile) {
        const recentTasks = userProfile.taskHistory?.slice(-20) || [];
        if (recentTasks.length === 0) {
            return 0;
        }

        const recentSuccesses = recentTasks.filter(task => task.outcome === 'success').length;
        const activeDays = this.calculateActiveDays(userProfile);

        return activeDays > 0 ? recentSuccesses / activeDays : 0;
    }

    /**
     * Get tutorials appropriate for level
     */
    getTutorialsForLevel(level) {
        const tutorials = {
            novice: [
                { id: 'basic-swarm', title: 'Basic Swarm Operations', estimatedTime: '10 min' },
                { id: 'agent-basics', title: 'Understanding Agent Types', estimatedTime: '15 min' },
                { id: 'simple-tasks', title: 'Simple Task Orchestration', estimatedTime: '20 min' }
            ],
            intermediate: [
                { id: 'sparc-workflow', title: 'SPARC Methodology', estimatedTime: '30 min' },
                { id: 'advanced-coordination', title: 'Advanced Agent Coordination', estimatedTime: '25 min' },
                { id: 'performance-basics', title: 'Performance Monitoring', estimatedTime: '20 min' }
            ],
            expert: [
                { id: 'custom-agents', title: 'Custom Agent Development', estimatedTime: '45 min' },
                { id: 'optimization-mastery', title: 'System Optimization Mastery', estimatedTime: '60 min' },
                { id: 'enterprise-patterns', title: 'Enterprise Integration Patterns', estimatedTime: '90 min' }
            ]
        };

        return tutorials[level] || [];
    }

    /**
     * Update experience based on command execution
     */
    async updateExperienceFromCommand(userProfile, command, outcome, context = {}) {
        // Track command in stats
        userProfile.stats.totalCommands++;
        if (outcome === 'success') {
            userProfile.stats.successfulCommands++;
        } else {
            userProfile.stats.failedCommands++;
        }

        // Update last active date
        userProfile.stats.lastActiveDate = new Date().toISOString();

        // Check for milestone achievements
        await this.checkMilestoneAchievements(userProfile, command, outcome, context);

        // Recalculate experience level
        const oldLevel = userProfile.experienceLevel;
        const newLevel = this.calculateExperienceLevel(userProfile);

        if (newLevel !== oldLevel) {
            userProfile.experienceLevel = newLevel;
            this.emit('experienceLevelChanged', {
                oldLevel,
                newLevel,
                trigger: 'command',
                command,
                outcome
            });
        }
    }

    /**
     * Check for milestone achievements based on command
     */
    async checkMilestoneAchievements(userProfile, command, outcome, context) {
        if (outcome !== 'success') {
            return;
        }

        // Check specific milestones based on command
        if (command.includes('swarm-init') || command.includes('swarm init')) {
            await this.trackMilestone(userProfile, 'firstSuccessfulSwarm', { command, context });
        }

        if (command.includes('agent-spawn') || command.includes('agent spawn')) {
            await this.trackMilestone(userProfile, 'firstAgentSpawn', { command, context });
        }

        if (command.includes('task-orchestrate') || command.includes('orchestrate')) {
            await this.trackMilestone(userProfile, 'firstTaskOrchestration', { command, context });
        }

        if (command.includes('sparc')) {
            await this.trackMilestone(userProfile, 'firstSPARCWorkflow', { command, context });
        }

        // Check for error recovery milestone
        if (context.recoveredFromError) {
            await this.trackMilestone(userProfile, 'errorRecoveryMastery', { command, context });
        }

        // Check for performance optimization milestone
        if (command.includes('performance') || command.includes('optimize')) {
            await this.trackMilestone(userProfile, 'performanceOptimization', { command, context });
        }
    }
}

module.exports = ExperienceManager;