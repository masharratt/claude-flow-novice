/**
 * Tests for Context Helper System
 */

const ContextHelper = require('../../src/guidance/context-helper');
const AdaptiveGuide = require('../../src/guidance/adaptive-guide');

describe('ContextHelper', () => {
    let contextHelper;
    let mockAdaptiveGuide;

    beforeEach(() => {
        mockAdaptiveGuide = {
            getExperienceLevel: jest.fn().mockReturnValue('intermediate'),
            configDir: '/tmp/test-config'
        };

        contextHelper = new ContextHelper(mockAdaptiveGuide);
    });

    describe('Task Type Identification', () => {
        test('should identify debugging tasks', () => {
            const taskType = contextHelper.identifyTaskType(
                'Fix the bug in user authentication',
                [],
                ['TypeError: Cannot read property']
            );

            expect(taskType).toBe('debugging');
        });

        test('should identify API development tasks', () => {
            const taskType = contextHelper.identifyTaskType(
                'Create REST API endpoints for user management',
                ['api/users.js', 'routes/auth.js']
            );

            expect(taskType).toBe('api-development');
        });

        test('should identify testing tasks', () => {
            const taskType = contextHelper.identifyTaskType(
                'Write comprehensive test coverage',
                ['user.test.js', 'auth.spec.js']
            );

            expect(taskType).toBe('testing');
        });

        test('should identify web development tasks', () => {
            const taskType = contextHelper.identifyTaskType(
                'Build React frontend with responsive design',
                ['App.jsx', 'components/Header.js']
            );

            expect(taskType).toBe('web-development');
        });

        test('should identify performance optimization tasks', () => {
            const taskType = contextHelper.identifyTaskType(
                'Optimize database queries for better performance',
                []
            );

            expect(taskType).toBe('performance-optimization');
        });

        test('should default to general development for unrecognized tasks', () => {
            const taskType = contextHelper.identifyTaskType(
                'Some generic development task',
                []
            );

            expect(taskType).toBe('general-development');
        });
    });

    describe('Complexity Assessment', () => {
        test('should assess low complexity correctly', () => {
            const complexity = contextHelper.assessComplexity(
                'Simple fix for typo in README',
                ['README.md']
            );

            expect(complexity).toBe('low');
        });

        test('should assess high complexity correctly', () => {
            const complexity = contextHelper.assessComplexity(
                'Design distributed microservice architecture with performance optimization and security',
                ['service1.js', 'service2.js', 'auth.js', 'db.js', 'cache.js']
            );

            expect(complexity).toBe('high');
        });

        test('should assess medium complexity correctly', () => {
            const complexity = contextHelper.assessComplexity(
                'Implement user authentication system',
                ['auth.js', 'user.js']
            );

            expect(complexity).toBe('medium');
        });
    });

    describe('Urgency Assessment', () => {
        test('should assess high urgency for errors', () => {
            const urgency = contextHelper.assessUrgency(
                null,
                ['Critical production bug']
            );

            expect(urgency).toBe('high');
        });

        test('should assess high urgency for urgent time constraints', () => {
            const urgency = contextHelper.assessUrgency('urgent deadline');

            expect(urgency).toBe('high');
        });

        test('should assess medium urgency for today deadline', () => {
            const urgency = contextHelper.assessUrgency('needed today');

            expect(urgency).toBe('medium');
        });

        test('should assess low urgency by default', () => {
            const urgency = contextHelper.assessUrgency('sometime next week');

            expect(urgency).toBe('low');
        });
    });

    describe('Agent Recommendations', () => {
        test('should recommend appropriate agents for API development', () => {
            const agents = contextHelper.recommendAgents('api-development', 'high', 'medium');

            expect(agents).toContain('backend-dev');
            expect(agents).toContain('api-docs');
            expect(agents).toContain('tester');
            expect(agents).toContain('reviewer');
        });

        test('should recommend fewer agents for urgent tasks', () => {
            const normalAgents = contextHelper.recommendAgents('web-development', 'medium', 'low');
            const urgentAgents = contextHelper.recommendAgents('web-development', 'medium', 'high');

            expect(urgentAgents.length).toBeLessThanOrEqual(2);
            expect(urgentAgents.length).toBeLessThan(normalAgents.length);
        });

        test('should add planning agents for high complexity', () => {
            const agents = contextHelper.recommendAgents('api-development', 'high', 'low');

            expect(agents).toContain('planner');
            expect(agents).toContain('system-architect');
        });
    });

    describe('Workflow Suggestions', () => {
        test('should suggest appropriate workflow for API development', () => {
            const workflow = contextHelper.suggestWorkflow('api-development', 'high', 'low');

            expect(workflow).toContain('plan');
            expect(workflow).toContain('design-api');
            expect(workflow).toContain('implement');
            expect(workflow).toContain('test');
            expect(workflow).toContain('review');
        });

        test('should suggest shorter workflow for urgent tasks', () => {
            const normalWorkflow = contextHelper.suggestWorkflow('debugging', 'medium', 'low');
            const urgentWorkflow = contextHelper.suggestWorkflow('debugging', 'medium', 'high');

            expect(urgentWorkflow.length).toBeLessThan(normalWorkflow.length);
        });

        test('should suggest comprehensive workflow for testing', () => {
            const workflow = contextHelper.suggestWorkflow('testing', 'high', 'low');

            expect(workflow).toContain('plan-tests');
            expect(workflow).toContain('unit-tests');
            expect(workflow).toContain('integration-tests');
            expect(workflow).toContain('e2e-tests');
        });
    });

    describe('Context Analysis', () => {
        test('should provide comprehensive context analysis', async () => {
            const context = {
                taskDescription: 'Build REST API with authentication',
                currentFiles: ['server.js', 'auth.js'],
                errorMessages: [],
                projectType: 'web-api'
            };

            const analysis = await contextHelper.analyzeContext(context);

            expect(analysis).toEqual(
                expect.objectContaining({
                    taskType: 'api-development',
                    complexity: expect.any(String),
                    urgency: expect.any(String),
                    recommendedAgents: expect.any(Array),
                    suggestedWorkflow: expect.any(Array),
                    potentialPitfalls: expect.any(Array),
                    bestPractices: expect.any(Array),
                    relevantResources: expect.any(Array)
                })
            );
        });

        test('should identify debugging context from errors', async () => {
            const context = {
                taskDescription: 'Fix application issues',
                errorMessages: ['TypeError: Cannot read property of undefined'],
                currentFiles: []
            };

            const analysis = await contextHelper.analyzeContext(context);

            expect(analysis.taskType).toBe('debugging');
            expect(analysis.potentialPitfalls).toContain('Not reproducing the bug consistently');
        });

        test('should provide custom guidance based on context', async () => {
            const context = {
                taskDescription: 'Debug API endpoint',
                errorMessages: ['500 Internal Server Error']
            };

            const analysis = await contextHelper.analyzeContext(context);

            expect(analysis.customGuidance).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        type: 'strategy',
                        message: expect.stringContaining('reproducing the error')
                    })
                ])
            );
        });
    });

    describe('Agent-Specific Guidance', () => {
        test('should provide agent guidance for valid agent types', () => {
            const guidance = contextHelper.getAgentGuidance('coder', {
                taskDescription: 'Implement new feature'
            });

            expect(guidance).toEqual(
                expect.objectContaining({
                    agent: 'coder',
                    capabilities: expect.arrayContaining(['implementation', 'coding']),
                    suitability: expect.any(String),
                    estimatedTime: 'medium',
                    tips: expect.any(Array)
                })
            );
        });

        test('should return null for invalid agent types', () => {
            const guidance = contextHelper.getAgentGuidance('invalid-agent', {});
            expect(guidance).toBeNull();
        });

        test('should assess agent suitability correctly', () => {
            // Test excellent suitability
            const excellent = contextHelper.assessAgentSuitability('backend-dev', {
                taskDescription: 'Build API endpoints'
            });
            expect(excellent).toBe('excellent');

            // Test poor suitability
            const poor = contextHelper.assessAgentSuitability('mobile-dev', {
                taskDescription: 'Database optimization'
            });
            expect(poor).toBe('poor');
        });
    });

    describe('Learning Resources', () => {
        test('should return learning resources for known topics', () => {
            const resources = contextHelper.getLearningResources('api-development');

            expect(resources).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        type: expect.any(String),
                        title: expect.any(String),
                        url: expect.any(String)
                    })
                ])
            );
        });

        test('should return empty array for unknown topics', () => {
            const resources = contextHelper.getLearningResources('unknown-topic');
            expect(resources).toEqual([]);
        });
    });

    describe('Common Patterns', () => {
        test('should return common patterns for API development', () => {
            const patterns = contextHelper.getCommonPatterns('api-development');

            expect(patterns).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: expect.any(String),
                        description: expect.any(String),
                        example: expect.any(String)
                    })
                ])
            );
        });

        test('should return patterns for testing', () => {
            const patterns = contextHelper.getCommonPatterns('testing');

            expect(patterns).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: 'AAA Pattern',
                        description: expect.stringContaining('Arrange, Act, Assert')
                    })
                ])
            );
        });

        test('should return empty array for unknown task types', () => {
            const patterns = contextHelper.getCommonPatterns('unknown-type');
            expect(patterns).toEqual([]);
        });
    });

    describe('Just-in-Time Help', () => {
        test('should provide command-specific help', async () => {
            const help = await contextHelper.provideJustInTimeHelp('swarm-init', {
                taskDescription: 'Initialize swarm for development'
            });

            expect(help).toEqual(
                expect.objectContaining({
                    command: 'swarm-init',
                    context: expect.any(Object),
                    quickTips: expect.arrayContaining([
                        expect.stringContaining('topology')
                    ]),
                    commonMistakes: expect.arrayContaining([
                        expect.stringContaining('too many agents')
                    ]),
                    nextSteps: expect.arrayContaining([
                        expect.stringContaining('agents')
                    ])
                })
            );
        });

        test('should provide agent-spawn specific help', async () => {
            const help = await contextHelper.provideJustInTimeHelp('agent-spawn', {
                taskDescription: 'Spawn development agents'
            });

            expect(help.quickTips).toContain('Match agent type to your specific needs');
            expect(help.nextSteps).toContain('Use task-orchestrate to coordinate agent work');
        });
    });

    describe('Knowledge Base Management', () => {
        test('should update knowledge base with new patterns', async () => {
            const newPattern = {
                name: 'Test Pattern',
                description: 'A new test pattern',
                example: 'example code'
            };

            await contextHelper.updateKnowledgeBase('testing', newPattern);

            const knowledge = contextHelper.knowledgeBase.get('testing');
            expect(knowledge.patterns).toContainEqual(newPattern);
        });

        test('should persist knowledge base changes', async () => {
            // Mock file system operations
            const mockWriteFile = jest.fn().mockResolvedValue(undefined);
            require('fs').promises.writeFile = mockWriteFile;

            await contextHelper.updateKnowledgeBase('testing', { name: 'test' });

            expect(mockWriteFile).toHaveBeenCalled();
        });
    });

    describe('Initiative Knowledge Base', () => {
        test('should have comprehensive knowledge base', () => {
            expect(contextHelper.knowledgeBase.has('web-development')).toBe(true);
            expect(contextHelper.knowledgeBase.has('api-development')).toBe(true);
            expect(contextHelper.knowledgeBase.has('debugging')).toBe(true);
            expect(contextHelper.knowledgeBase.has('testing')).toBe(true);
            expect(contextHelper.knowledgeBase.has('performance-optimization')).toBe(true);
            expect(contextHelper.knowledgeBase.has('deployment')).toBe(true);
        });

        test('should have agent capabilities mapped', () => {
            expect(contextHelper.agentCapabilities.has('coder')).toBe(true);
            expect(contextHelper.agentCapabilities.has('reviewer')).toBe(true);
            expect(contextHelper.agentCapabilities.has('tester')).toBe(true);
            expect(contextHelper.agentCapabilities.has('researcher')).toBe(true);
        });

        test('should provide comprehensive knowledge for each task type', () => {
            const webDev = contextHelper.knowledgeBase.get('web-development');

            expect(webDev).toEqual(
                expect.objectContaining({
                    description: expect.any(String),
                    recommendedAgents: expect.any(Array),
                    commonCommands: expect.any(Array),
                    pitfalls: expect.any(Array),
                    bestPractices: expect.any(Array),
                    resources: expect.any(Array)
                })
            );
        });
    });
});