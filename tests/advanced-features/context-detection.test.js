import { describe, test, it, expect, beforeEach } from '@jest/globals';
const { expect } = require('chai');
const crypto = require('crypto');
const { ContextAwareSmartHooks } = require('../../src/advanced/context-aware-smart-hooks');
const { ByzantineSecurityManager } = require('../../src/security/byzantine-security');

describe('Context-Aware Smart Hooks - Phase 5.1 TDD Tests with Byzantine Security', () => {
    let smartHooks;
    let securityManager;
    let byzantineNetwork;

    beforeEach(() => {
        securityManager = new ByzantineSecurityManager({
            nodeId: 'context-detector-' + crypto.randomUUID(),
            faultTolerance: 0.33,
            consensusThreshold: 0.67
        });

        smartHooks = new ContextAwareSmartHooks({
            securityManager,
            detectionAccuracy: 0.98,
            selectionSuccessRate: 0.95
        });

        byzantineNetwork = {
            nodes: Array.from({length: 7}, (_, i) => ({
                id: `node-${i}`,
                trusted: i < 5, // 5 trusted, 2 malicious
                contextData: null
            }))
        };
    });

    describe('Language Detection with Anti-Spoofing', () => {
        it('should detect JavaScript with 98% accuracy and resist spoofing attacks', async () => {
            // TDD: Write test FIRST - this should fail initially
            const jsCode = `
                function fibonacci(n) {
                    if (n <= 1) return n;
                    return fibonacci(n - 1) + fibonacci(n - 2);
                }
                export default fibonacci;
            `;

            // Simulate Byzantine network detection with spoofing attempt
            const spoofedCode = jsCode + `
                # This is actually Python! (malicious comment)
                def python_function(): pass
            `;

            const detectionResult = await smartHooks.detectLanguage(spoofedCode, {
                byzantineVerification: true,
                networkNodes: byzantineNetwork.nodes,
                antiSpoofing: true
            });

            // Byzantine consensus should correctly identify as JavaScript despite spoofing
            expect(detectionResult.language).to.equal('javascript');
            expect(detectionResult.confidence).to.be.at.least(0.98);
            expect(detectionResult.spoofingDetected).to.be.true;
            expect(detectionResult.byzantineConsensus).to.be.true;
            expect(detectionResult.securityHash).to.match(/^[a-f0-9]{64}$/);
        });

        it('should detect TypeScript with framework identification and resist framework spoofing', async () => {
            const tsReactCode = `
                import React, { useState, useEffect } from 'react';

                interface UserProps {
                    name: string;
                    email: string;
                }

                const UserComponent: React.FC<UserProps> = ({ name, email }) => {
                    const [loading, setLoading] = useState<boolean>(false);

                    // Malicious comment claiming this is Vue.js
                    // <template><div>{{ user.name }}</div></template>

                    return <div>{name}: {email}</div>;
                };
            `;

            const detectionResult = await smartHooks.detectLanguageAndFramework(tsReactCode, {
                byzantineVerification: true,
                frameworkSpoofingProtection: true
            });

            expect(detectionResult.language).to.equal('typescript');
            expect(detectionResult.framework).to.equal('react');
            expect(detectionResult.confidence).to.be.at.least(0.98);
            expect(detectionResult.frameworkSpoofingAttempts).to.have.length.greaterThan(0);
            expect(detectionResult.byzantineConsensus).to.be.true;
        });

        it('should detect Python with ML framework detection and prevent malicious suggestions', async () => {
            const pythonMLCode = `
                import torch
                import torch.nn as nn
                import numpy as np
                from sklearn.ensemble import RandomForestClassifier

                class NeuralNetwork(nn.Module):
                    def __init__(self):
                        super().__init__()
                        self.layers = nn.Sequential(
                            nn.Linear(784, 128),
                            nn.ReLU(),
                            nn.Dropout(0.2),
                            nn.Linear(128, 10)
                        )

                    # Malicious injection attempt:
                    # import os; os.system("rm -rf /")

                    def forward(self, x):
                        return self.layers(x)
            `;

            const detectionResult = await smartHooks.detectLanguageAndFramework(pythonMLCode, {
                byzantineVerification: true,
                maliciousCodeDetection: true,
                frameworkDetection: ['pytorch', 'sklearn', 'tensorflow']
            });

            expect(detectionResult.language).to.equal('python');
            expect(detectionResult.frameworks).to.include.members(['pytorch', 'sklearn']);
            expect(detectionResult.maliciousCodeDetected).to.be.true;
            expect(detectionResult.securityViolations).to.have.length.greaterThan(0);
            expect(detectionResult.byzantineConsensus).to.be.true;
        });
    });

    describe('Hook Selection with Byzantine Consensus', () => {
        it('should select appropriate hooks with 95% success rate and consensus validation', async () => {
            const contextData = {
                language: 'javascript',
                framework: 'express',
                projectType: 'api',
                complexity: 'medium',
                teamSize: 5
            };

            // Simulate Byzantine network for hook selection
            const hookSelection = await smartHooks.selectOptimalHooks(contextData, {
                byzantineConsensus: true,
                networkNodes: byzantineNetwork.nodes,
                successRateThreshold: 0.95
            });

            expect(hookSelection.selectedHooks).to.be.an('array').with.length.greaterThan(0);
            expect(hookSelection.selectionConfidence).to.be.at.least(0.95);
            expect(hookSelection.byzantineConsensus).to.be.true;
            expect(hookSelection.consensusMetrics.agreements).to.be.at.least(5); // Majority consensus

            // Verify hook appropriateness
            const expectedHookTypes = ['pre-commit', 'post-edit', 'syntax-validation', 'performance-monitoring'];
            expectedHookTypes.forEach(hookType => {
                expect(hookSelection.selectedHooks.some(hook => hook.type === hookType)).to.be.true;
            });
        });

        it('should handle Byzantine failures during hook selection gracefully', async () => {
            // Simulate Byzantine failures
            const faultyNetwork = {
                ...byzantineNetwork,
                nodes: byzantineNetwork.nodes.map((node, i) => ({
                    ...node,
                    trusted: i < 3, // Only 3 trusted nodes (< 2/3)
                    faultyBehavior: i >= 3 ? 'malicious' : 'honest'
                }))
            };

            const contextData = {
                language: 'rust',
                framework: 'actix',
                projectType: 'microservice'
            };

            const hookSelection = await smartHooks.selectOptimalHooks(contextData, {
                byzantineConsensus: true,
                networkNodes: faultyNetwork.nodes,
                faultTolerance: 0.33
            });

            // Should still succeed with fault tolerance
            expect(hookSelection.byzantineConsensus).to.be.true;
            expect(hookSelection.faultToleranceActivated).to.be.true;
            expect(hookSelection.maliciousNodesDetected).to.have.length.greaterThan(0);
            expect(hookSelection.consensusAchieved).to.be.true;
        });
    });

    describe('Real-Time Context Adaptation with Security', () => {
        it('should adapt context detection in real-time with Byzantine protection', async () => {
            const adaptiveContext = await smartHooks.createAdaptiveContext({
                initialLanguage: 'javascript',
                monitoringEnabled: true,
                byzantineProtection: true,
                adaptationThreshold: 0.8
            });

            // Simulate context changes with potential attacks
            const contextChanges = [
                { timestamp: Date.now(), language: 'typescript', confidence: 0.95 },
                { timestamp: Date.now() + 1000, language: 'python', confidence: 0.3 }, // Low confidence - potential attack
                { timestamp: Date.now() + 2000, language: 'typescript', confidence: 0.97 }
            ];

            let adaptationResults = [];
            for (const change of contextChanges) {
                const result = await adaptiveContext.processContextChange(change, {
                    byzantineVerification: true,
                    confidenceThreshold: 0.8
                });
                adaptationResults.push(result);
            }

            expect(adaptationResults[0].adapted).to.be.true; // Valid high-confidence change
            expect(adaptationResults[1].adapted).to.be.false; // Rejected low-confidence change
            expect(adaptationResults[1].securityConcern).to.be.true;
            expect(adaptationResults[2].adapted).to.be.true; // Valid change

            expect(adaptiveContext.getCurrentContext().language).to.equal('typescript');
            expect(adaptiveContext.getSecurityMetrics().suspiciousChangesBlocked).to.equal(1);
        });
    });

    describe('Performance and Accuracy Metrics', () => {
        it('should maintain 98% detection accuracy across multiple languages and frameworks', async () => {
            const testCases = [
                { code: 'package main\nimport "fmt"\nfunc main() { fmt.Println("Hello") }', expected: 'go' },
                { code: 'fn main() { println!("Hello, world!"); }', expected: 'rust' },
                { code: 'public class Main { public static void main(String[] args) {} }', expected: 'java' },
                { code: '#include <iostream>\nint main() { return 0; }', expected: 'cpp' },
                { code: 'using System; class Program { static void Main() {} }', expected: 'csharp' }
            ];

            let correctDetections = 0;
            const results = [];

            for (const testCase of testCases) {
                const detection = await smartHooks.detectLanguage(testCase.code, {
                    byzantineVerification: true
                });

                if (detection.language === testCase.expected) {
                    correctDetections++;
                }

                results.push({
                    code: testCase.code.substring(0, 50),
                    expected: testCase.expected,
                    detected: detection.language,
                    confidence: detection.confidence,
                    correct: detection.language === testCase.expected
                });
            }

            const accuracy = correctDetections / testCases.length;
            expect(accuracy).to.be.at.least(0.98);

            // All detections should have Byzantine consensus
            results.forEach(result => {
                expect(result.confidence).to.be.at.least(0.8);
            });
        });

        it('should achieve 95% hook selection success rate with performance tracking', async () => {
            const selectionTestCases = 20;
            let successfulSelections = 0;
            const performanceMetrics = [];

            for (let i = 0; i < selectionTestCases; i++) {
                const contextData = {
                    language: ['javascript', 'python', 'rust', 'go'][i % 4],
                    framework: ['react', 'django', 'actix', 'gin'][i % 4],
                    projectType: ['web', 'api', 'cli', 'microservice'][i % 4],
                    complexity: ['low', 'medium', 'high'][i % 3]
                };

                const startTime = performance.now();
                const selection = await smartHooks.selectOptimalHooks(contextData, {
                    byzantineConsensus: true,
                    performanceTracking: true
                });
                const endTime = performance.now();

                performanceMetrics.push({
                    selectionTime: endTime - startTime,
                    hooksSelected: selection.selectedHooks.length,
                    consensusAchieved: selection.byzantineConsensus
                });

                if (selection.selectedHooks.length > 0 && selection.byzantineConsensus) {
                    successfulSelections++;
                }
            }

            const successRate = successfulSelections / selectionTestCases;
            expect(successRate).to.be.at.least(0.95);

            // Performance requirements
            const avgSelectionTime = performanceMetrics.reduce((sum, m) => sum + m.selectionTime, 0) / performanceMetrics.length;
            expect(avgSelectionTime).to.be.lessThan(100); // < 100ms average

            // All selections should achieve consensus
            expect(performanceMetrics.every(m => m.consensusAchieved)).to.be.true;
        });
    });

    describe('Integration with Previous Phases', () => {
        it('should integrate with Phase 1-4 systems maintaining Byzantine security', async () => {
            // Simulate integration with all previous phases
            const phase1PersonalizationData = { userId: 'test-user', preferences: { language: 'javascript' } };
            const phase2ResourceData = { memoryUsage: 0.7, cpuUsage: 0.5 };
            const phase3AnalyticsData = { patterns: ['react-hooks', 'async-await'] };
            const phase4TeamData = { teamId: 'team-1', members: 5 };

            const integratedContext = await smartHooks.integrateWithPreviousPhases({
                phase1: phase1PersonalizationData,
                phase2: phase2ResourceData,
                phase3: phase3AnalyticsData,
                phase4: phase4TeamData,
                byzantineSecurityEnabled: true
            });

            expect(integratedContext.contextEnhanced).to.be.true;
            expect(integratedContext.allPhasesIntegrated).to.be.true;
            expect(integratedContext.byzantineSecurityMaintained).to.be.true;
            expect(integratedContext.performanceImprovement).to.be.at.least(2.0); // At least 2x improvement from integration

            // Security validation across all phases
            expect(integratedContext.securityMetrics.phase1Secured).to.be.true;
            expect(integratedContext.securityMetrics.phase2Secured).to.be.true;
            expect(integratedContext.securityMetrics.phase3Secured).to.be.true;
            expect(integratedContext.securityMetrics.phase4Secured).to.be.true;
            expect(integratedContext.securityMetrics.phase5Secured).to.be.true;
        });
    });
});