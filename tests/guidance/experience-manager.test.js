import { describe, test, expect, beforeEach } from '@jest/globals';
/**
 * Tests for Experience Manager System
 */

const ExperienceManager = require('../../src/guidance/experience-manager');

describe('ExperienceManager', () => {
    let experienceManager;
    let mockAdaptiveGuide;

    beforeEach(() => {
        mockAdaptiveGuide = {
            userProfile: {
                userId: 'test-user',
                experienceLevel: 'novice',
                preferences: { guidanceLevel: 'adaptive' },
                stats: {
                    totalCommands: 0,
                    successfulCommands: 0,
                    failedCommands: 0,
                    firstUseDate: new Date().toISOString()
                },
                taskHistory: [],
                learningProgress: {
                    completedTutorials: [],
                    masteredConcepts: [],
                    strugglingAreas: []
                }
            }
        };

        experienceManager = new ExperienceManager(mockAdaptiveGuide);
    });

    describe('Experience Level Calculation', () => {
        test('should calculate novice level for new users', () => {
            const userProfile = {
                preferences: { guidanceLevel: 'adaptive' },
                stats: {
                    totalCommands: 10,
                    successfulCommands: 5,
                    firstUseDate: new Date().toISOString()
                },
                taskHistory: []
            };

            const level = experienceManager.calculateExperienceLevel(userProfile);
            expect(level).toBe('novice');
        });

        test('should calculate intermediate level for moderate users', () => {
            const pastDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000); // 15 days ago
            const userProfile = {
                preferences: { guidanceLevel: 'adaptive' },
                stats: {
                    totalCommands: 80,
                    successfulCommands: 65,
                    firstUseDate: pastDate.toISOString()
                },
                taskHistory: Array(50).fill().map(() => ({ command: 'test', outcome: 'success' }))
            };

            const level = experienceManager.calculateExperienceLevel(userProfile);
            expect(level).toBe('intermediate');
        });

        test('should calculate expert level for experienced users', () => {
            const pastDate = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000); // 50 days ago
            const userProfile = {
                preferences: { guidanceLevel: 'adaptive' },
                stats: {
                    totalCommands: 350,
                    successfulCommands: 320,
                    firstUseDate: pastDate.toISOString()
                },
                taskHistory: [
                    ...Array(10).fill().map(() => ({ command: 'task-orchestrate', outcome: 'success' })),
                    ...Array(5).fill().map(() => ({ command: 'sparc', outcome: 'success' })),
                    ...Array(5).fill().map(() => ({ command: 'swarm-coordination', outcome: 'success' }))
                ]
            };

            const level = experienceManager.calculateExperienceLevel(userProfile);
            expect(level).toBe('expert');
        });

        test('should respect manual experience level setting', () => {
            const userProfile = {
                preferences: { guidanceLevel: 'expert' },
                stats: {
                    totalCommands: 10,
                    successfulCommands: 5
                }
            };

            const level = experienceManager.calculateExperienceLevel(userProfile);
            expect(level).toBe('expert');
        });
    });

    describe('Skill Proficiency Calculation', () => {
        test('should calculate skill proficiency correctly', () => {
            const userProfile = {
                taskHistory: [
                    { command: 'swarm-init', outcome: 'success' },
                    { command: 'swarm-init', outcome: 'success' },
                    { command: 'agent-spawn', outcome: 'failure' },
                    { command: 'sparc tdd', outcome: 'success' },
                    { command: 'sparc methodology', outcome: 'success' }
                ]
            };

            const proficiency = experienceManager.calculateSkillProficiency(userProfile);

            expect(proficiency).toEqual(
                expect.objectContaining({
                    coordination: expect.any(Number),
                    development: expect.any(Number)
                })
            );

            // Coordination should have lower proficiency due to agent-spawn failure
            expect(proficiency.coordination).toBeLessThan(proficiency.development);
        });

        test('should return empty proficiency for users with no task history', () => {
            const userProfile = { taskHistory: [] };
            const proficiency = experienceManager.calculateSkillProficiency(userProfile);

            expect(Object.keys(proficiency)).toHaveLength(0);
        });
    });

    describe('Milestone Tracking', () => {
        test('should track milestone achievement', async () => {
            const milestoneAchievedSpy = jest.fn();
            experienceManager.on('milestoneAchieved', milestoneAchievedSpy);

            const userProfile = mockAdaptiveGuide.userProfile;
            const result = await experienceManager.trackMilestone(
                userProfile,
                'firstSuccessfulSwarm',
                { command: 'swarm-init' }
            );

            expect(result).toBe(true);
            expect(userProfile.learningProgress.completedTutorials).toContain('firstSuccessfulSwarm');
            expect(userProfile.experiencePoints).toBe(10);
            expect(milestoneAchievedSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    milestone: 'firstSuccessfulSwarm',
                    points: 10,
                    unlocks: ['intermediate-topologies']
                })
            );
        });

        test('should not track already achieved milestones', async () => {
            const userProfile = mockAdaptiveGuide.userProfile;
            userProfile.learningProgress.completedTutorials = ['firstSuccessfulSwarm'];

            const result = await experienceManager.trackMilestone(
                userProfile,
                'firstSuccessfulSwarm'
            );

            expect(result).toBe(false);
        });

        test('should emit experience level change when milestone triggers promotion', async () => {
            const experienceLevelChangedSpy = jest.fn();
            experienceManager.on('experienceLevelChanged', experienceLevelChangedSpy);

            // Mock a user on the edge of promotion
            const userProfile = {
                preferences: { guidanceLevel: 'adaptive' },
                stats: {
                    totalCommands: 49,
                    successfulCommands: 30,
                    firstUseDate: new Date().toISOString()
                },
                taskHistory: [],
                learningProgress: { completedTutorials: [] },
                experienceLevel: 'novice'
            };

            // Mock the calculation to return intermediate after milestone
            experienceManager.calculateExperienceLevel = jest.fn()
                .mockReturnValueOnce('novice')  // Current level
                .mockReturnValueOnce('intermediate'); // After milestone

            await experienceManager.trackMilestone(userProfile, 'firstSuccessfulSwarm');

            expect(experienceLevelChangedSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    oldLevel: 'novice',
                    newLevel: 'intermediate',
                    trigger: 'milestone'
                })
            );
        });
    });

    describe('Learning Recommendations', () => {
        test('should provide level-appropriate recommendations', () => {
            const noviceProfile = {
                experienceLevel: 'novice',
                learningProgress: { completedTutorials: [] }
            };

            const recommendations = experienceManager.getLearningRecommendations(noviceProfile);

            expect(recommendations).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        type: 'tutorial',
                        priority: 'high',
                        title: expect.stringContaining('Getting Started')
                    })
                ])
            );
        });

        test('should recommend skill improvements for low proficiency areas', () => {
            const userProfile = {
                experienceLevel: 'intermediate'
            };

            // Mock low proficiency in coordination
            experienceManager.calculateSkillProficiency = jest.fn().mockReturnValue({
                coordination: 0.3,
                development: 0.8
            });

            const recommendations = experienceManager.getLearningRecommendations(userProfile);

            const coordinationRec = recommendations.find(r =>
                r.title.includes('coordination') || r.category === 'coordination'
            );
            expect(coordinationRec).toBeTruthy();
        });

        test('should sort recommendations by priority', () => {
            const userProfile = { experienceLevel: 'intermediate' };
            experienceManager.calculateSkillProficiency = jest.fn().mockReturnValue({
                coordination: 0.3,
                development: 0.4
            });

            const recommendations = experienceManager.getLearningRecommendations(userProfile);

            // High priority recommendations should come first
            for (let i = 0; i < recommendations.length - 1; i++) {
                const current = recommendations[i];
                const next = recommendations[i + 1];

                const priorityOrder = { high: 3, medium: 2, low: 1 };
                expect(priorityOrder[current.priority]).toBeGreaterThanOrEqual(
                    priorityOrder[next.priority]
                );
            }
        });
    });

    describe('Learning Path Generation', () => {
        test('should generate comprehensive learning path', () => {
            const userProfile = {
                experienceLevel: 'intermediate',
                learningProgress: {
                    completedTutorials: ['basic-swarm'],
                    strugglingAreas: ['performance-optimization']
                },
                stats: {
                    totalCommands: 100,
                    successfulCommands: 80,
                    firstUseDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
                }
            };

            const learningPath = experienceManager.generateLearningPath(userProfile);

            expect(learningPath).toEqual(
                expect.objectContaining({
                    currentLevel: 'intermediate',
                    nextLevel: 'expert',
                    progressToNext: expect.any(Number),
                    recommendedTutorials: expect.any(Array),
                    focusAreas: ['performance-optimization'],
                    estimatedTimeToNext: expect.any(String)
                })
            );
        });

        test('should filter out completed tutorials', () => {
            const userProfile = {
                experienceLevel: 'novice',
                learningProgress: {
                    completedTutorials: ['basic-swarm']
                }
            };

            const learningPath = experienceManager.generateLearningPath(userProfile);

            const hasCompletedTutorial = learningPath.recommendedTutorials.some(
                tutorial => tutorial.id === 'basic-swarm'
            );
            expect(hasCompletedTutorial).toBe(false);
        });
    });

    describe('Progress Calculation', () => {
        test('should calculate progress to next level correctly', () => {
            const userProfile = {
                experienceLevel: 'intermediate',
                stats: {
                    totalCommands: 100, // Halfway to expert (need 150)
                    successfulCommands: 75,  // 75% to expert (need 120)
                    firstUseDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days (need 45)
                }
            };

            const progress = experienceManager.calculateProgressToNextLevel(userProfile);

            // Should be average of command progress (~67%), success progress (63%), and days progress (67%)
            expect(progress).toBeCloseTo(0.65, 1);
        });

        test('should return 1.0 for users already at highest level', () => {
            const userProfile = { experienceLevel: 'expert' };
            const progress = experienceManager.calculateProgressToNextLevel(userProfile);

            expect(progress).toBe(1.0);
        });
    });

    describe('Time Estimation', () => {
        test('should estimate time to next level based on learning rate', () => {
            const userProfile = {
                experienceLevel: 'intermediate',
                stats: {
                    totalCommands: 100,
                    successfulCommands: 75,
                    firstUseDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
                },
                taskHistory: Array(10).fill().map(() => ({ outcome: 'success' }))
            };

            experienceManager.calculateProgressToNextLevel = jest.fn().mockReturnValue(0.7);

            const timeEstimate = experienceManager.estimateTimeToNextLevel(userProfile);

            expect(timeEstimate).not.toBe('Unknown');
            expect(typeof timeEstimate).toBe('string');
        });

        test('should return "Unknown" for users with no activity', () => {
            const userProfile = {
                stats: { firstUseDate: new Date().toISOString() },
                taskHistory: []
            };

            const timeEstimate = experienceManager.estimateTimeToNextLevel(userProfile);

            expect(timeEstimate).toBe('Unknown');
        });

        test('should return "0 days" for users ready for promotion', () => {
            const userProfile = { experienceLevel: 'novice' };
            experienceManager.calculateProgressToNextLevel = jest.fn().mockReturnValue(1.0);

            const timeEstimate = experienceManager.estimateTimeToNextLevel(userProfile);

            expect(timeEstimate).toBe('0 days');
        });
    });

    describe('Command-Based Experience Updates', () => {
        test('should update experience from successful command', async () => {
            const userProfile = mockAdaptiveGuide.userProfile;
            const initialStats = { ...userProfile.stats };

            await experienceManager.updateExperienceFromCommand(
                userProfile,
                'swarm-init',
                'success'
            );

            expect(userProfile.stats.totalCommands).toBe(initialStats.totalCommands + 1);
            expect(userProfile.stats.successfulCommands).toBe(initialStats.successfulCommands + 1);
            expect(userProfile.stats.lastActiveDate).toBeTruthy();
        });

        test('should update experience from failed command', async () => {
            const userProfile = mockAdaptiveGuide.userProfile;
            const initialStats = { ...userProfile.stats };

            await experienceManager.updateExperienceFromCommand(
                userProfile,
                'agent-spawn',
                'failure'
            );

            expect(userProfile.stats.totalCommands).toBe(initialStats.totalCommands + 1);
            expect(userProfile.stats.failedCommands).toBe(initialStats.failedCommands + 1);
        });

        test('should check for milestone achievements on command success', async () => {
            const userProfile = mockAdaptiveGuide.userProfile;
            const checkMilestonesSpy = jest.spyOn(experienceManager, 'checkMilestoneAchievements');

            await experienceManager.updateExperienceFromCommand(
                userProfile,
                'swarm-init',
                'success',
                { projectType: 'web-app' }
            );

            expect(checkMilestonesSpy).toHaveBeenCalledWith(
                userProfile,
                'swarm-init',
                'success',
                { projectType: 'web-app' }
            );
        });

        test('should emit experience level change when promotion occurs', async () => {
            const experienceLevelChangedSpy = jest.fn();
            experienceManager.on('experienceLevelChanged', experienceLevelChangedSpy);

            const userProfile = mockAdaptiveGuide.userProfile;
            userProfile.experienceLevel = 'novice';

            // Mock calculation to return intermediate after command
            experienceManager.calculateExperienceLevel = jest.fn()
                .mockReturnValueOnce('novice')        // Current level
                .mockReturnValueOnce('intermediate'); // After command

            await experienceManager.updateExperienceFromCommand(
                userProfile,
                'test-command',
                'success'
            );

            expect(experienceLevelChangedSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    oldLevel: 'novice',
                    newLevel: 'intermediate',
                    trigger: 'command'
                })
            );
        });
    });

    describe('Milestone Achievement Checking', () => {
        test('should achieve swarm milestone on swarm-init success', async () => {
            const userProfile = mockAdaptiveGuide.userProfile;
            const trackMilestoneSpy = jest.spyOn(experienceManager, 'trackMilestone');

            await experienceManager.checkMilestoneAchievements(
                userProfile,
                'swarm-init',
                'success',
                { topology: 'mesh' }
            );

            expect(trackMilestoneSpy).toHaveBeenCalledWith(
                userProfile,
                'firstSuccessfulSwarm',
                expect.objectContaining({
                    command: 'swarm-init',
                    context: { topology: 'mesh' }
                })
            );
        });

        test('should achieve agent milestone on agent-spawn success', async () => {
            const userProfile = mockAdaptiveGuide.userProfile;
            const trackMilestoneSpy = jest.spyOn(experienceManager, 'trackMilestone');

            await experienceManager.checkMilestoneAchievements(
                userProfile,
                'agent-spawn',
                'success',
                { agentType: 'coder' }
            );

            expect(trackMilestoneSpy).toHaveBeenCalledWith(
                userProfile,
                'firstAgentSpawn',
                expect.objectContaining({ command: 'agent-spawn' })
            );
        });

        test('should not check milestones for failed commands', async () => {
            const userProfile = mockAdaptiveGuide.userProfile;
            const trackMilestoneSpy = jest.spyOn(experienceManager, 'trackMilestone');

            await experienceManager.checkMilestoneAchievements(
                userProfile,
                'swarm-init',
                'failure'
            );

            expect(trackMilestoneSpy).not.toHaveBeenCalled();
        });
    });

    describe('Experience Level Information', () => {
        test('should return correct experience level info', () => {
            const noviceInfo = experienceManager.getExperienceLevelInfo('novice');

            expect(noviceInfo).toEqual(
                expect.objectContaining({
                    name: 'Novice',
                    description: expect.any(String),
                    characteristics: expect.objectContaining({
                        needsDetailedExplanations: true,
                        requiresSafetyChecks: true
                    }),
                    guidance: expect.objectContaining({
                        verbosity: 'high',
                        showWarnings: true
                    })
                })
            );
        });

        test('should return guidance settings for experience level', () => {
            const expertSettings = experienceManager.getGuidanceSettings('expert');

            expect(expertSettings).toEqual({
                verbosity: 'low',
                showWarnings: false,
                provideExamples: false,
                suggestAlternatives: false,
                includeEducationalContent: false
            });
        });

        test('should default to novice for unknown levels', () => {
            const unknownInfo = experienceManager.getExperienceLevelInfo('unknown-level');
            const noviceInfo = experienceManager.getExperienceLevelInfo('novice');

            expect(unknownInfo).toEqual(noviceInfo);
        });
    });

    describe('Active Days Calculation', () => {
        test('should calculate active days correctly', () => {
            const pastDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
            const userProfile = {
                stats: {
                    firstUseDate: pastDate.toISOString()
                }
            };

            const activeDays = experienceManager.calculateActiveDays(userProfile);
            expect(activeDays).toBe(30);
        });

        test('should return 0 for users with no first use date', () => {
            const userProfile = { stats: {} };
            const activeDays = experienceManager.calculateActiveDays(userProfile);

            expect(activeDays).toBe(0);
        });
    });

    describe('Complex Task Counting', () => {
        test('should count complex tasks correctly', () => {
            const userProfile = {
                taskHistory: [
                    { command: 'task-orchestrate', outcome: 'success' },
                    { command: 'sparc tdd', outcome: 'success' },
                    { command: 'simple-command', outcome: 'success' },
                    { command: 'task-orchestrate', outcome: 'failure' }, // Should not count
                    { command: 'swarm-coordination', outcome: 'success' }
                ]
            };

            const complexTasks = experienceManager.countComplexTasks(userProfile);
            expect(complexTasks).toBe(3); // Only successful complex commands
        });

        test('should return 0 for users with no task history', () => {
            const userProfile = { taskHistory: undefined };
            const complexTasks = experienceManager.countComplexTasks(userProfile);

            expect(complexTasks).toBe(0);
        });
    });
});