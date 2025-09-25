const { expect } = require('chai');
const sinon = require('sinon');
const crypto = require('crypto');
const { ProactiveAssistanceSystem } = require('../../src/advanced/proactive-assistance-system');
const { ByzantineSecurityManager } = require('../../src/security/byzantine-security');

describe('Proactive Assistance System - Phase 5.2 TDD Tests with Byzantine Security', () => {
    let proactiveSystem;
    let securityManager;
    let userAcceptanceTracker;

    beforeEach(() => {
        securityManager = new ByzantineSecurityManager({
            nodeId: 'proactive-assistant-' + crypto.randomUUID(),
            faultTolerance: 0.33,
            maliciousSuggestionDetection: true
        });

        userAcceptanceTracker = {
            acceptedSuggestions: 0,
            totalSuggestions: 0,
            getAcceptanceRate: function() {
                return this.totalSuggestions > 0 ? this.acceptedSuggestions / this.totalSuggestions : 0;
            }
        };

        proactiveSystem = new ProactiveAssistanceSystem({
            securityManager,
            failurePreventionTarget: 0.8,
            suggestionAcceptanceTarget: 0.7,
            userAcceptanceTracker
        });
    });

    describe('Predictable Failure Prevention with Byzantine Security', () => {
        it('should prevent 80% of predictable failures with malicious suggestion protection', async () => {
            // TDD: Write test FIRST - this should fail initially
            const potentialFailureScenarios = [
                {
                    type: 'syntax_error',
                    code: 'function test() { console.log("missing bracket"',
                    severity: 'high',
                    predictability: 0.95
                },
                {
                    type: 'null_reference',
                    code: 'const user = null; user.name;',
                    severity: 'medium',
                    predictability: 0.88
                },
                {
                    type: 'async_race_condition',
                    code: 'let result; fetch("/api").then(r => result = r); return result;',
                    severity: 'high',
                    predictability: 0.72
                },
                {
                    type: 'memory_leak',
                    code: 'setInterval(() => { listeners.push(callback); }, 100);',
                    severity: 'critical',
                    predictability: 0.65
                },
                // Malicious suggestion injection attempt
                {
                    type: 'malicious_injection',
                    code: 'eval(userInput); // Suggested "improvement"',
                    severity: 'critical',
                    predictability: 0.99,
                    malicious: true
                }
            ];

            const preventionResults = [];
            let preventedFailures = 0;
            let maliciousAttempts = 0;

            for (const scenario of potentialFailureScenarios) {
                const preventionResult = await proactiveSystem.analyzeAndPrevent(scenario, {
                    byzantineVerification: true,
                    maliciousDetection: true,
                    consensusRequired: true
                });

                preventionResults.push(preventionResult);

                if (scenario.malicious) {
                    maliciousAttempts++;
                    expect(preventionResult.maliciousDetected).to.be.true;
                    expect(preventionResult.suggestionBlocked).to.be.true;
                } else if (preventionResult.failurePrevented && scenario.predictability >= 0.7) {
                    preventedFailures++;
                }
            }

            const preventionRate = preventedFailures / (potentialFailureScenarios.length - maliciousAttempts);
            expect(preventionRate).to.be.at.least(0.8);

            // All malicious suggestions should be blocked
            expect(maliciousAttempts).to.be.greaterThan(0);
            preventionResults
                .filter(r => r.maliciousDetected)
                .forEach(result => {
                    expect(result.suggestionBlocked).to.be.true;
                    expect(result.byzantineConsensus).to.be.true;
                });
        });

        it('should provide contextual failure prevention suggestions with user trust validation', async () => {
            const codeContext = {
                language: 'javascript',
                framework: 'react',
                file: 'components/UserProfile.jsx',
                recentChanges: ['added state hook', 'modified useEffect'],
                codeSnippet: `
                    const [user, setUser] = useState();

                    useEffect(() => {
                        fetchUser().then(setUser);
                    }, []); // Missing dependency

                    return <div>{user.name}</div>; // Potential null reference
                `
            };

            const suggestions = await proactiveSystem.generateContextualSuggestions(codeContext, {
                byzantineVerification: true,
                trustValidation: true,
                userHistoryCheck: true
            });

            expect(suggestions).to.be.an('array').with.length.greaterThan(0);

            // Verify suggestion quality and security
            suggestions.forEach(suggestion => {
                expect(suggestion).to.have.property('type');
                expect(suggestion).to.have.property('description');
                expect(suggestion).to.have.property('confidenceScore').that.is.at.least(0.7);
                expect(suggestion).to.have.property('securityValidated').that.is.true;
                expect(suggestion).to.have.property('byzantineConsensus').that.is.true;
                expect(suggestion).to.have.property('trustScore').that.is.at.least(0.8);
            });

            // Should detect dependency and null reference issues
            const suggestionTypes = suggestions.map(s => s.type);
            expect(suggestionTypes).to.include('dependency_missing');
            expect(suggestionTypes).to.include('null_safety');
        });

        it('should handle malicious suggestion attacks and maintain user trust', async () => {
            // Simulate malicious suggestion injection
            const maliciousSuggestions = [
                {
                    type: 'code_improvement',
                    description: 'Use eval() for dynamic code execution',
                    code: 'eval(userInput)',
                    malicious: true,
                    disguisedAs: 'performance_optimization'
                },
                {
                    type: 'security_enhancement',
                    description: 'Disable CORS for easier development',
                    code: 'app.use(cors({ origin: "*", credentials: true }))',
                    malicious: true,
                    disguisedAs: 'development_helper'
                },
                {
                    type: 'file_operation',
                    description: 'Clean up temporary files',
                    code: 'fs.rmSync(".", { recursive: true, force: true })',
                    malicious: true,
                    disguisedAs: 'cleanup_utility'
                }
            ];

            const validationResults = [];
            for (const suggestion of maliciousSuggestions) {
                const validation = await proactiveSystem.validateSuggestion(suggestion, {
                    byzantineConsensus: true,
                    maliciousDetection: true,
                    codeAnalysis: true,
                    trustNetworkValidation: true
                });

                validationResults.push(validation);
            }

            // All malicious suggestions should be detected and blocked
            validationResults.forEach((result, index) => {
                expect(result.maliciousDetected).to.be.true;
                expect(result.blocked).to.be.true;
                expect(result.byzantineConsensus).to.be.true;
                expect(result.threatLevel).to.equal('high');
                expect(result.reasoning).to.contain('security');
            });

            // Trust metrics should reflect protection
            const trustMetrics = await proactiveSystem.getTrustMetrics();
            expect(trustMetrics.maliciousSuggestionsBlocked).to.equal(3);
            expect(trustMetrics.userTrustMaintained).to.be.true;
            expect(trustMetrics.securityScore).to.be.at.least(0.95);
        });
    });

    describe('User Acceptance and Satisfaction Tracking', () => {
        it('should achieve 70% suggestion acceptance rate with trust building', async () => {
            const suggestionScenarios = Array.from({length: 20}, (_, i) => ({
                id: `suggestion-${i}`,
                context: {
                    language: ['javascript', 'python', 'rust'][i % 3],
                    issueType: ['syntax', 'logic', 'performance', 'security'][i % 4],
                    complexity: ['low', 'medium', 'high'][i % 3]
                },
                userProfile: {
                    experienceLevel: ['beginner', 'intermediate', 'expert'][i % 3],
                    preferences: { verbosity: i % 2 === 0 ? 'detailed' : 'concise' }
                }
            }));

            let acceptedSuggestions = 0;
            const suggestionResults = [];

            for (const scenario of suggestionScenarios) {
                const suggestion = await proactiveSystem.generateSuggestion(scenario.context, {
                    userProfile: scenario.userProfile,
                    byzantineVerification: true,
                    trustBuilding: true
                });

                // Simulate user interaction with bias towards accepting good suggestions
                const userResponse = await simulateUserResponse(suggestion, {
                    acceptanceChance: suggestion.confidenceScore * 0.9, // Higher confidence = higher acceptance
                    trustFactor: suggestion.trustScore
                });

                if (userResponse.accepted) {
                    acceptedSuggestions++;
                    userAcceptanceTracker.acceptedSuggestions++;
                }
                userAcceptanceTracker.totalSuggestions++;

                suggestionResults.push({
                    suggestion,
                    userResponse,
                    accepted: userResponse.accepted
                });
            }

            const acceptanceRate = acceptedSuggestions / suggestionScenarios.length;
            expect(acceptanceRate).to.be.at.least(0.7);

            // Verify suggestion quality contributed to acceptance
            const highConfidenceSuggestions = suggestionResults.filter(r => r.suggestion.confidenceScore >= 0.8);
            const highConfidenceAcceptanceRate = highConfidenceSuggestions.filter(r => r.accepted).length / highConfidenceSuggestions.length;
            expect(highConfidenceAcceptanceRate).to.be.at.least(0.85);

            // Trust should build over time
            const trustProgression = suggestionResults.map(r => r.suggestion.trustScore);
            expect(trustProgression[trustProgression.length - 1]).to.be.at.least(trustProgression[0]);
        });

        it('should adapt suggestions based on user feedback and maintain Byzantine consensus', async () => {
            const initialSuggestion = {
                type: 'code_optimization',
                description: 'Use arrow function for better performance',
                confidenceScore: 0.7
            };

            // Simulate user rejection with feedback
            const userFeedback = {
                accepted: false,
                reason: 'too_verbose',
                preference: 'show_code_only',
                trustImpact: -0.1
            };

            const adaptationResult = await proactiveSystem.adaptBasedOnFeedback(
                initialSuggestion,
                userFeedback,
                {
                    byzantineConsensus: true,
                    learningEnabled: true,
                    userProfileUpdate: true
                }
            );

            expect(adaptationResult.adapted).to.be.true;
            expect(adaptationResult.byzantineConsensus).to.be.true;
            expect(adaptationResult.userProfileUpdated).to.be.true;

            // Next suggestion should reflect adaptation
            const nextSuggestion = await proactiveSystem.generateSuggestion({
                type: 'code_optimization',
                language: 'javascript'
            }, {
                userProfile: adaptationResult.updatedUserProfile,
                byzantineVerification: true
            });

            expect(nextSuggestion.verbosity).to.equal('concise');
            expect(nextSuggestion.showCodeOnly).to.be.true;
            expect(nextSuggestion.confidenceScore).to.be.at.least(0.75); // Should improve with learning
        });
    });

    describe('Real-time Proactive Monitoring', () => {
        it('should monitor code changes in real-time and provide immediate assistance', async () => {
            const monitoringSession = await proactiveSystem.startMonitoringSession({
                sessionId: 'test-session-' + Date.now(),
                byzantineProtection: true,
                realTimeAnalysis: true
            });

            const codeChanges = [
                {
                    timestamp: Date.now(),
                    file: 'src/api.js',
                    change: 'added function without error handling',
                    code: 'function fetchData(url) { return fetch(url).then(r => r.json()); }'
                },
                {
                    timestamp: Date.now() + 1000,
                    file: 'src/component.jsx',
                    change: 'used state without dependency',
                    code: 'useEffect(() => { fetchData(apiUrl); }, []);'
                },
                {
                    timestamp: Date.now() + 2000,
                    file: 'src/utils.js',
                    change: 'potential security vulnerability',
                    code: 'function sanitize(input) { return input; }' // No actual sanitization
                }
            ];

            const monitoringResults = [];
            for (const change of codeChanges) {
                const result = await monitoringSession.processChange(change, {
                    byzantineVerification: true,
                    immediateAnalysis: true,
                    proactiveSuggestions: true
                });
                monitoringResults.push(result);
            }

            // Should detect issues and provide suggestions
            expect(monitoringResults[0].issuesDetected).to.include('error_handling_missing');
            expect(monitoringResults[0].suggestions).to.have.length.greaterThan(0);

            expect(monitoringResults[1].issuesDetected).to.include('dependency_missing');
            expect(monitoringResults[2].issuesDetected).to.include('security_vulnerability');

            // All results should have Byzantine consensus
            monitoringResults.forEach(result => {
                expect(result.byzantineConsensus).to.be.true;
                expect(result.suggestions).to.be.an('array');
                expect(result.responseTime).to.be.lessThan(500); // < 500ms response time
            });
        });

        it('should prioritize assistance based on severity and user context', async () => {
            const priorityScenarios = [
                {
                    severity: 'critical',
                    type: 'security_vulnerability',
                    context: 'production_code',
                    userLevel: 'beginner'
                },
                {
                    severity: 'high',
                    type: 'performance_issue',
                    context: 'development',
                    userLevel: 'expert'
                },
                {
                    severity: 'medium',
                    type: 'code_style',
                    context: 'development',
                    userLevel: 'intermediate'
                },
                {
                    severity: 'low',
                    type: 'suggestion',
                    context: 'development',
                    userLevel: 'expert'
                }
            ];

            const prioritizedAssistance = await proactiveSystem.prioritizeAssistance(
                priorityScenarios,
                {
                    byzantineConsensus: true,
                    contextAware: true,
                    userAdaptive: true
                }
            );

            // Should be ordered by priority
            expect(prioritizedAssistance[0].severity).to.equal('critical');
            expect(prioritizedAssistance[0].priority).to.equal(1);
            expect(prioritizedAssistance[0].immediateAction).to.be.true;

            expect(prioritizedAssistance[1].severity).to.equal('high');
            expect(prioritizedAssistance[2].severity).to.equal('medium');
            expect(prioritizedAssistance[3].severity).to.equal('low');

            // User context should affect priority
            expect(prioritizedAssistance[0].userContextConsidered).to.be.true;
            expect(prioritizedAssistance[0].adaptedForBeginnerUser).to.be.true;

            // All should maintain Byzantine security
            prioritizedAssistance.forEach(item => {
                expect(item.byzantineConsensus).to.be.true;
                expect(item.securityValidated).to.be.true;
            });
        });
    });

    describe('Integration with Context-Aware Smart Hooks', () => {
        it('should work seamlessly with context detection for enhanced assistance', async () => {
            // Simulate integration with Phase 5.1 Context-Aware Smart Hooks
            const contextData = {
                language: 'typescript',
                framework: 'react',
                detectionConfidence: 0.97,
                selectedHooks: ['pre-commit', 'syntax-validation'],
                byzantineConsensus: true
            };

            const enhancedAssistance = await proactiveSystem.integrateWithContextHooks(
                contextData,
                {
                    byzantineVerification: true,
                    contextEnhanced: true,
                    hookAware: true
                }
            );

            expect(enhancedAssistance.integration).to.be.true;
            expect(enhancedAssistance.contextAware).to.be.true;
            expect(enhancedAssistance.hookIntegration).to.be.true;
            expect(enhancedAssistance.byzantineConsensus).to.be.true;

            // Should provide TypeScript/React specific assistance
            expect(enhancedAssistance.suggestions).to.be.an('array');
            const typescriptSuggestions = enhancedAssistance.suggestions.filter(s => s.language === 'typescript');
            expect(typescriptSuggestions.length).to.be.greaterThan(0);

            const reactSuggestions = enhancedAssistance.suggestions.filter(s => s.framework === 'react');
            expect(reactSuggestions.length).to.be.greaterThan(0);
        });
    });

    // Helper function for user response simulation
    async function simulateUserResponse(suggestion, options = {}) {
        const acceptanceChance = options.acceptanceChance || 0.5;
        const trustFactor = options.trustFactor || 0.8;

        // Simulate realistic user behavior
        const randomFactor = Math.random();
        const adjustedChance = acceptanceChance * trustFactor;

        const accepted = randomFactor < adjustedChance;

        return {
            accepted,
            responseTime: Math.random() * 5000 + 1000, // 1-6 seconds
            trustImpact: accepted ? 0.05 : -0.02,
            feedback: accepted ? 'helpful' : 'not_applicable'
        };
    }
});