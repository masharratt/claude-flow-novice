import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
/**
 * Tests for Adaptive Guidance System
 */

const AdaptiveGuide = require('../../src/guidance/adaptive-guide');
const fs = require('fs').promises;
const path = require('path');

describe('AdaptiveGuide', () => {
    let guide;
    let tempDir;

    beforeEach(async () => {
        tempDir = path.join(__dirname, '../../tmp/test-config');
        guide = new AdaptiveGuide({ configDir: tempDir });

        // Clean up test directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Directory might not exist
        }
    });

    afterEach(async () => {
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            const result = await guide.initialize();
            expect(result).toBe(true);
            expect(guide.userProfile).toBeTruthy();
        });

        test('should create default user profile for new user', async () => {
            await guide.initialize();

            expect(guide.userProfile).toEqual(
                expect.objectContaining({
                    experienceLevel: 'novice',
                    preferences: expect.objectContaining({
                        guidanceLevel: 'adaptive',
                        showTips: true,
                        autoSuggest: true,
                        safetyMode: true
                    }),
                    stats: expect.objectContaining({
                        totalCommands: 0,
                        successfulCommands: 0,
                        failedCommands: 0
                    })
                })
            );
        });

        test('should load existing user profile', async () => {
            // Create a pre-existing profile
            await guide.ensureConfigDirectory();
            const profilePath = path.join(tempDir, 'guidance', 'user-profile.json');
            const existingProfile = {
                userId: 'test-user',
                experienceLevel: 'intermediate',
                stats: {
                    totalCommands: 100,
                    successfulCommands: 80,
                    failedCommands: 20
                }
            };

            await fs.writeFile(profilePath, JSON.stringify(existingProfile));

            await guide.initialize();

            expect(guide.userProfile.userId).toBe('test-user');
            expect(guide.userProfile.stats.totalCommands).toBe(100);
        });
    });

    describe('Experience Level Calculation', () => {
        beforeEach(async () => {
            await guide.initialize();
        });

        test('should identify novice users correctly', () => {
            const profile = {
                preferences: { guidanceLevel: 'adaptive' },
                stats: {
                    totalCommands: 10,
                    successfulCommands: 5,
                    daysActive: 2
                },
                taskHistory: []
            };

            const level = guide.calculateExperienceLevel(profile);
            expect(level).toBe('novice');
        });

        test('should identify expert users correctly', () => {
            const profile = {
                preferences: { guidanceLevel: 'adaptive' },
                stats: {
                    totalCommands: 300,
                    successfulCommands: 270,
                    daysActive: 50,
                    firstUseDate: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString()
                },
                taskHistory: [
                    { command: 'task-orchestrate', outcome: 'success' },
                    { command: 'sparc', outcome: 'success' },
                    { command: 'task-orchestrate', outcome: 'success' }
                ]
            };

            // Mock complex task counting
            guide.countComplexTasks = jest.fn().mockReturnValue(15);

            const level = guide.calculateExperienceLevel(profile);
            expect(level).toBe('expert');
        });

        test('should respect manual experience level setting', () => {
            const profile = {
                preferences: { guidanceLevel: 'expert' },
                stats: {
                    totalCommands: 10,
                    successfulCommands: 5
                }
            };

            const level = guide.calculateExperienceLevel(profile);
            expect(level).toBe('expert');
        });
    });

    describe('Guidance Generation', () => {
        beforeEach(async () => {
            await guide.initialize();
        });

        test('should generate appropriate guidance for novice users', async () => {
            guide.userProfile.experienceLevel = 'novice';

            const context = {
                command: 'swarm-init',
                taskType: 'coordination',
                userInput: 'swarm-init mesh'
            };

            const guidance = await guide.provideGuidance(context);

            expect(guidance).toEqual(
                expect.objectContaining({
                    level: 'novice',
                    suggestions: expect.any(Array),
                    warnings: expect.any(Array),
                    tips: expect.any(Array)
                })
            );

            // Novice users should get more guidance
            expect(guidance.suggestions.length).toBeGreaterThan(0);
        });

        test('should generate minimal guidance for expert users', async () => {
            guide.userProfile.experienceLevel = 'expert';

            const context = {
                command: 'swarm-init',
                taskType: 'coordination',
                userInput: 'swarm-init mesh'
            };

            const guidance = await guide.provideGuidance(context);

            expect(guidance.level).toBe('expert');
            // Expert users should get less guidance
            expect(guidance.tips.length).toBe(0);
            expect(guidance.warnings.length).toBe(0);
        });

        test('should provide context-aware suggestions', async () => {
            const context = {
                command: 'agent-spawn',
                taskType: 'development',
                parameters: { maxAgents: 15 }
            };

            const guidance = await guide.provideGuidance(context);

            // Should warn about high agent count
            const hasResourceWarning = guidance.warnings.some(w =>
                w.type === 'resource' && w.message.includes('performance')
            );
            expect(hasResourceWarning).toBe(true);
        });
    });

    describe('Learning and Adaptation', () => {
        beforeEach(async () => {
            await guide.initialize();
        });

        test('should learn from successful interactions', async () => {
            const initialStats = { ...guide.userProfile.stats };

            await guide.learnFromInteraction({
                command: 'swarm-init',
                outcome: 'success',
                timeSpent: 30,
                guidanceUsed: false
            });

            expect(guide.userProfile.stats.totalCommands).toBe(initialStats.totalCommands + 1);
            expect(guide.userProfile.stats.successfulCommands).toBe(initialStats.successfulCommands + 1);
        });

        test('should learn from failed interactions', async () => {
            const initialStats = { ...guide.userProfile.stats };

            await guide.learnFromInteraction({
                command: 'agent-spawn',
                outcome: 'failure',
                timeSpent: 120,
                guidanceUsed: true
            });

            expect(guide.userProfile.stats.totalCommands).toBe(initialStats.totalCommands + 1);
            expect(guide.userProfile.stats.failedCommands).toBe(initialStats.failedCommands + 1);
        });

        test('should adapt verbosity based on user behavior', async () => {
            guide.userProfile.experienceLevel = 'adaptive';
            const initialVerbosity = guide.userProfile.adaptiveSettings.preferredVerbosity;

            // Simulate successful interaction without guidance
            await guide.learnFromInteraction({
                command: 'test-command',
                outcome: 'success',
                timeSpent: 15,
                guidanceUsed: false
            });

            // Should reduce verbosity for users who succeed without help
            const adaptedVerbosity = guide.userProfile.adaptiveSettings.preferredVerbosity;
            expect(adaptedVerbosity).not.toBe(initialVerbosity);
        });
    });

    describe('Preference Management', () => {
        beforeEach(async () => {
            await guide.initialize();
        });

        test('should update user preferences', async () => {
            const newPreferences = {
                showTips: false,
                autoSuggest: false,
                safetyMode: false
            };

            const result = await guide.updatePreferences(newPreferences);
            expect(result).toBe(true);

            expect(guide.userProfile.preferences).toEqual(
                expect.objectContaining(newPreferences)
            );
        });

        test('should set experience level', async () => {
            await guide.setExperienceLevel('expert');

            expect(guide.userProfile.experienceLevel).toBe('expert');
            expect(guide.userProfile.preferences.guidanceLevel).toBe('expert');
        });

        test('should reject invalid experience levels', async () => {
            await expect(guide.setExperienceLevel('invalid')).rejects.toThrow('Invalid experience level');
        });
    });

    describe('Error Rate Calculation', () => {
        beforeEach(async () => {
            await guide.initialize();
        });

        test('should calculate recent error rate correctly', () => {
            guide.userProfile.taskHistory = [
                { command: 'test1', outcome: 'success' },
                { command: 'test2', outcome: 'failure' },
                { command: 'test3', outcome: 'success' },
                { command: 'test4', outcome: 'failure' },
                { command: 'test5', outcome: 'success' }
            ];

            const errorRate = guide.calculateRecentErrorRate();
            expect(errorRate).toBe(0.4); // 2 failures out of 5 tasks
        });

        test('should return 0 for empty task history', () => {
            guide.userProfile.taskHistory = [];
            const errorRate = guide.calculateRecentErrorRate();
            expect(errorRate).toBe(0);
        });
    });

    describe('Learning Progress Tracking', () => {
        beforeEach(async () => {
            await guide.initialize();
        });

        test('should track mastered concepts', () => {
            guide.userProfile.taskHistory = [
                { command: 'swarm-init', outcome: 'success' },
                { command: 'swarm-init', outcome: 'success' },
                { command: 'swarm-init', outcome: 'success' }
            ];

            guide.updateLearningProgress('swarm-init', 'success');

            expect(guide.userProfile.learningProgress.masteredConcepts).toContain('swarm-coordination');
        });

        test('should track struggling areas', () => {
            guide.userProfile.taskHistory = [
                { command: 'agent-spawn', outcome: 'failure' },
                { command: 'agent-spawn', outcome: 'failure' }
            ];

            guide.updateLearningProgress('agent-spawn', 'failure');

            expect(guide.userProfile.learningProgress.strugglingAreas).toContain('agent-management');
        });

        test('should limit task history size', () => {
            // Fill history with more than 100 items
            guide.userProfile.taskHistory = Array(120).fill().map((_, i) => ({
                command: `test${i}`,
                outcome: 'success',
                timestamp: new Date().toISOString()
            }));

            guide.updateLearningProgress('new-command', 'success');

            expect(guide.userProfile.taskHistory.length).toBe(100);
        });
    });

    describe('Guidance Templates', () => {
        beforeEach(async () => {
            await guide.initialize();
        });

        test('should use appropriate template for experience level', () => {
            const noviceTemplate = guide.guidanceTemplates.novice;
            expect(noviceTemplate).toEqual({
                verbosity: 'high',
                includeExplanations: true,
                showSafetyWarnings: true,
                provideExamples: true,
                suggestAlternatives: true
            });

            const expertTemplate = guide.guidanceTemplates.expert;
            expect(expertTemplate).toEqual({
                verbosity: 'low',
                includeExplanations: false,
                showSafetyWarnings: false,
                provideExamples: false,
                suggestAlternatives: false
            });
        });
    });

    describe('Event Emission', () => {
        beforeEach(async () => {
            await guide.initialize();
        });

        test('should emit events when providing guidance', async () => {
            const guidanceProvidedSpy = jest.fn();
            guide.on('guidanceProvided', guidanceProvidedSpy);

            await guide.provideGuidance({
                command: 'test-command',
                taskType: 'testing'
            });

            expect(guidanceProvidedSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    timestamp: expect.any(String),
                    context: expect.objectContaining({
                        command: 'test-command',
                        taskType: 'testing'
                    })
                })
            );
        });

        test('should emit events when experience level changes', async () => {
            const experienceLevelChangedSpy = jest.fn();
            guide.on('experienceLevelChanged', experienceLevelChangedSpy);

            await guide.setExperienceLevel('expert');

            expect(experienceLevelChangedSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    level: 'expert',
                    profile: guide.userProfile
                })
            );
        });
    });

    describe('Data Persistence', () => {
        test('should save user profile', async () => {
            await guide.initialize();

            guide.userProfile.stats.totalCommands = 42;
            await guide.saveUserProfile();

            // Create new instance and check if profile was loaded
            const newGuide = new AdaptiveGuide({ configDir: tempDir });
            await newGuide.initialize();

            expect(newGuide.userProfile.stats.totalCommands).toBe(42);
        });

        test('should save behavior patterns', async () => {
            await guide.initialize();

            guide.behaviorPatterns.set('test-pattern', { value: 'test' });
            await guide.saveBehaviorPatterns();

            // Create new instance and check if patterns were loaded
            const newGuide = new AdaptiveGuide({ configDir: tempDir });
            await newGuide.initialize();

            expect(newGuide.behaviorPatterns.get('test-pattern')).toEqual({ value: 'test' });
        });
    });
});