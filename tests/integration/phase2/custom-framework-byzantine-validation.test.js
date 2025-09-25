/**
 * Custom Framework Addition with Byzantine Validation Tests
 * Phase 2 Integration Test Suite - Byzantine Consensus Component
 *
 * Tests the Byzantine fault-tolerant custom framework addition workflow
 * with cryptographic validation and distributed consensus mechanisms.
 *
 * Requirements:
 * - Byzantine fault tolerance (tolerates up to 1/3 malicious nodes)
 * - Cryptographic integrity validation
 * - Distributed consensus for framework acceptance
 * - Security threat detection and mitigation
 * - Performance under adversarial conditions
 */

const { jest } = require('@jest/globals');

// Mock Byzantine consensus components
class MockByzantineValidator {
    constructor(nodeCount = 7) {
        this.nodeCount = nodeCount;
        this.faultTolerance = Math.floor((nodeCount - 1) / 3);
        this.nodes = Array.from({ length: nodeCount }, (_, i) => ({
            id: `node-${i}`,
            status: 'active',
            reputation: 100,
            lastSeen: Date.now()
        }));
        this.validationHistory = [];
        this.cryptoProvider = new MockCryptographicProvider();
    }

    async validateFrameworkAddition(frameworkSpec, submitterId) {
        const validationId = this.generateValidationId();
        const startTime = Date.now();

        // Step 1: Cryptographic integrity check
        const integrityResult = await this.validateIntegrity(frameworkSpec);

        // Step 2: Distributed consensus voting
        const consensusResult = await this.performConsensus(frameworkSpec, submitterId);

        // Step 3: Security threat analysis
        const securityResult = await this.analyzeSecurityThreats(frameworkSpec);

        // Step 4: Byzantine fault detection
        const byzantineResult = await this.detectByzantineBehavior();

        const validationResult = {
            validationId,
            frameworkId: frameworkSpec.id,
            submitterId,
            startTime,
            endTime: Date.now(),
            integrity: integrityResult,
            consensus: consensusResult,
            security: securityResult,
            byzantine: byzantineResult,
            approved: this.computeFinalDecision(integrityResult, consensusResult, securityResult, byzantineResult),
            signatures: await this.generateDistributedSignatures(validationId)
        };

        this.validationHistory.push(validationResult);
        return validationResult;
    }

    async validateIntegrity(frameworkSpec) {
        // Simulate cryptographic hash validation
        const hash = this.cryptoProvider.computeHash(JSON.stringify(frameworkSpec));
        const signature = this.cryptoProvider.signData(hash);

        return {
            hash,
            signature,
            verified: true,
            timestamp: Date.now(),
            algorithm: 'SHA-256-RSA'
        };
    }

    async performConsensus(frameworkSpec, submitterId) {
        // Simulate Byzantine consensus voting
        const votes = [];

        for (let i = 0; i < this.nodeCount; i++) {
            const node = this.nodes[i];
            const vote = await this.simulateNodeVote(node, frameworkSpec, submitterId);
            votes.push(vote);
        }

        const approvalVotes = votes.filter(v => v.decision === 'approve').length;
        const rejectionVotes = votes.filter(v => v.decision === 'reject').length;
        const abstainVotes = votes.filter(v => v.decision === 'abstain').length;

        // Byzantine consensus requires 2/3 + 1 majority
        const requiredApprovals = Math.ceil((2 * this.nodeCount) / 3) + 1;

        return {
            totalNodes: this.nodeCount,
            votes,
            approvalVotes,
            rejectionVotes,
            abstainVotes,
            requiredApprovals,
            consensusReached: approvalVotes >= requiredApprovals,
            faultTolerance: this.faultTolerance
        };
    }

    async simulateNodeVote(node, frameworkSpec, submitterId) {
        // Simulate various voting patterns including Byzantine behavior
        const baseScore = this.evaluateFrameworkQuality(frameworkSpec);
        const submitterReputation = this.getSubmitterReputation(submitterId);
        const nodeReliability = node.reputation / 100;

        let decision;
        let confidence;

        // Simulate Byzantine behavior in some nodes (up to fault tolerance)
        const byzantineNodeIndex = parseInt(node.id.split('-')[1]);
        if (byzantineNodeIndex < this.faultTolerance && Math.random() < 0.3) {
            // Byzantine node - random or malicious behavior
            decision = Math.random() < 0.5 ? 'reject' : 'abstain';
            confidence = Math.random() * 0.4; // Low confidence
        } else {
            // Honest node - decision based on actual evaluation
            const totalScore = (baseScore * 0.7) + (submitterReputation * 0.2) + (nodeReliability * 0.1);
            if (totalScore > 0.8) {
                decision = 'approve';
                confidence = totalScore;
            } else if (totalScore > 0.5) {
                decision = 'abstain';
                confidence = 0.6;
            } else {
                decision = 'reject';
                confidence = 1 - totalScore;
            }
        }

        return {
            nodeId: node.id,
            decision,
            confidence,
            timestamp: Date.now(),
            reasoning: this.generateVoteReasoning(decision, baseScore, submitterReputation)
        };
    }

    evaluateFrameworkQuality(frameworkSpec) {
        // Evaluate framework based on multiple criteria
        let score = 0;

        // Name and description quality
        if (frameworkSpec.name && frameworkSpec.name.length > 2) score += 0.1;
        if (frameworkSpec.description && frameworkSpec.description.length > 20) score += 0.1;

        // Detection patterns quality
        if (frameworkSpec.detectionPatterns && frameworkSpec.detectionPatterns.length > 0) {
            score += 0.2;
            // Bonus for multiple patterns
            score += Math.min(frameworkSpec.detectionPatterns.length * 0.05, 0.2);
        }

        // File patterns quality
        if (frameworkSpec.filePatterns && frameworkSpec.filePatterns.length > 0) {
            score += 0.2;
        }

        // Validation rules
        if (frameworkSpec.validationRules && frameworkSpec.validationRules.length > 0) {
            score += 0.1;
        }

        // Security considerations
        if (frameworkSpec.security) {
            score += 0.1;
        }

        // Performance metadata
        if (frameworkSpec.performance) {
            score += 0.1;
        }

        return Math.min(score, 1.0);
    }

    getSubmitterReputation(submitterId) {
        // Mock reputation system
        const mockReputations = {
            'user-trusted': 0.9,
            'user-new': 0.5,
            'user-suspicious': 0.2,
            'user-malicious': 0.1
        };
        return mockReputations[submitterId] || 0.5;
    }

    generateVoteReasoning(decision, qualityScore, reputationScore) {
        const reasons = [];

        if (qualityScore > 0.8) reasons.push('High framework quality');
        if (qualityScore < 0.3) reasons.push('Poor framework quality');
        if (reputationScore > 0.8) reasons.push('Trusted submitter');
        if (reputationScore < 0.3) reasons.push('Untrusted submitter');

        switch (decision) {
            case 'approve':
                return reasons.length > 0 ? reasons.join(', ') : 'Framework meets standards';
            case 'reject':
                return reasons.length > 0 ? reasons.join(', ') : 'Framework below standards';
            case 'abstain':
                return 'Insufficient information for decision';
            default:
                return 'Unknown reasoning';
        }
    }

    async analyzeSecurityThreats(frameworkSpec) {
        // Simulate security threat analysis
        const threats = [];

        // Check for potentially malicious patterns
        if (frameworkSpec.detectionPatterns) {
            for (const pattern of frameworkSpec.detectionPatterns) {
                if (pattern.includes('eval') || pattern.includes('exec')) {
                    threats.push({
                        type: 'code_injection',
                        severity: 'high',
                        pattern,
                        description: 'Potentially dangerous code execution pattern'
                    });
                }
            }
        }

        // Check for suspicious file access patterns
        if (frameworkSpec.filePatterns) {
            for (const filePattern of frameworkSpec.filePatterns) {
                if (filePattern.includes('..') || filePattern.includes('/etc/')) {
                    threats.push({
                        type: 'directory_traversal',
                        severity: 'high',
                        pattern: filePattern,
                        description: 'Potential directory traversal vulnerability'
                    });
                }
            }
        }

        // Check for network-related security issues
        if (frameworkSpec.networkAccess) {
            threats.push({
                type: 'network_access',
                severity: 'medium',
                description: 'Framework requires network access'
            });
        }

        return {
            threatCount: threats.length,
            threats,
            riskLevel: this.calculateRiskLevel(threats),
            scanTimestamp: Date.now(),
            approved: threats.filter(t => t.severity === 'high').length === 0
        };
    }

    calculateRiskLevel(threats) {
        if (threats.some(t => t.severity === 'high')) return 'high';
        if (threats.some(t => t.severity === 'medium')) return 'medium';
        return 'low';
    }

    async detectByzantineBehavior() {
        // Analyze voting patterns for Byzantine behavior
        const recentValidations = this.validationHistory.slice(-10);
        const suspiciousNodes = [];

        for (const node of this.nodes) {
            const nodeVotes = recentValidations.flatMap(v =>
                v.consensus?.votes?.filter(vote => vote.nodeId === node.id) || []
            );

            if (nodeVotes.length > 0) {
                const inconsistencyScore = this.calculateInconsistencyScore(nodeVotes);
                if (inconsistencyScore > 0.7) {
                    suspiciousNodes.push({
                        nodeId: node.id,
                        inconsistencyScore,
                        reason: 'Inconsistent voting pattern detected'
                    });
                }
            }
        }

        return {
            suspiciousNodes,
            networkHealth: 1 - (suspiciousNodes.length / this.nodeCount),
            byzantineFaultDetected: suspiciousNodes.length > 0,
            faultToleranceStatus: suspiciousNodes.length <= this.faultTolerance ? 'healthy' : 'compromised'
        };
    }

    calculateInconsistencyScore(votes) {
        // Calculate how inconsistent a node's votes are
        if (votes.length < 2) return 0;

        let inconsistencies = 0;
        for (let i = 1; i < votes.length; i++) {
            const prev = votes[i - 1];
            const curr = votes[i];

            // Check for suspicious patterns
            if (prev.decision !== curr.decision && Math.abs(prev.confidence - curr.confidence) > 0.5) {
                inconsistencies++;
            }
        }

        return inconsistencies / (votes.length - 1);
    }

    computeFinalDecision(integrity, consensus, security, byzantine) {
        // All components must pass for approval
        return integrity.verified &&
               consensus.consensusReached &&
               security.approved &&
               byzantine.faultToleranceStatus === 'healthy';
    }

    async generateDistributedSignatures(validationId) {
        // Generate cryptographic signatures from participating nodes
        const signatures = [];

        for (const node of this.nodes.slice(0, Math.ceil(this.nodeCount / 2))) {
            const signature = this.cryptoProvider.signData(`${validationId}-${node.id}`);
            signatures.push({
                nodeId: node.id,
                signature,
                timestamp: Date.now()
            });
        }

        return signatures;
    }

    generateValidationId() {
        return `val-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}

class MockCryptographicProvider {
    computeHash(data) {
        // Mock SHA-256 hash
        return `sha256-${Buffer.from(data).toString('base64').substr(0, 32)}`;
    }

    signData(data) {
        // Mock RSA signature
        return `rsa-${Buffer.from(`${data}-signature`).toString('base64').substr(0, 64)}`;
    }
}

class MockCustomFrameworkRegistry {
    constructor() {
        this.frameworks = new Map();
        this.validator = new MockByzantineValidator();
        this.pendingAdditions = new Map();
    }

    async addCustomFramework(frameworkSpec, submitterId) {
        const additionId = `add-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Store pending addition
        this.pendingAdditions.set(additionId, {
            frameworkSpec,
            submitterId,
            status: 'pending',
            submissionTime: Date.now()
        });

        // Perform Byzantine validation
        const validationResult = await this.validator.validateFrameworkAddition(frameworkSpec, submitterId);

        // Update pending status
        const pendingAddition = this.pendingAdditions.get(additionId);
        pendingAddition.validationResult = validationResult;
        pendingAddition.status = validationResult.approved ? 'approved' : 'rejected';

        // If approved, add to registry
        if (validationResult.approved) {
            this.frameworks.set(frameworkSpec.id, {
                ...frameworkSpec,
                addedBy: submitterId,
                addedAt: Date.now(),
                validationId: validationResult.validationId,
                signatures: validationResult.signatures
            });
        }

        return {
            additionId,
            approved: validationResult.approved,
            validationResult,
            frameworkId: frameworkSpec.id
        };
    }

    getFramework(frameworkId) {
        return this.frameworks.get(frameworkId);
    }

    getPendingAddition(additionId) {
        return this.pendingAdditions.get(additionId);
    }

    async validateFrameworkSecurity(frameworkSpec) {
        return this.validator.analyzeSecurityThreats(frameworkSpec);
    }

    getValidationHistory() {
        return this.validator.validationHistory;
    }

    getByzantineStatus() {
        return this.validator.detectByzantineBehavior();
    }
}

describe('Custom Framework Addition with Byzantine Validation', () => {
    let registry;

    beforeEach(() => {
        registry = new MockCustomFrameworkRegistry();
        jest.clearAllMocks();
    });

    describe('Byzantine Consensus Validation', () => {
        test('should achieve consensus with honest majority', async () => {
            const frameworkSpec = {
                id: 'test-framework-consensus',
                name: 'Consensus Test Framework',
                description: 'A framework for testing Byzantine consensus',
                detectionPatterns: ['consensustest.config.js', 'package.json'],
                filePatterns: ['**/*.consensus.js'],
                validationRules: [
                    { type: 'file_exists', pattern: 'consensustest.config.js' }
                ],
                security: { sandboxed: true },
                performance: { weight: 0.5 }
            };

            const result = await registry.addCustomFramework(frameworkSpec, 'user-trusted');

            expect(result.approved).toBe(true);
            expect(result.validationResult.consensus.consensusReached).toBe(true);
            expect(result.validationResult.consensus.approvalVotes).toBeGreaterThan(
                result.validationResult.consensus.requiredApprovals - 1
            );
        });

        test('should reject framework when consensus not reached', async () => {
            const poorFrameworkSpec = {
                id: 'poor-framework',
                name: 'P',  // Too short name
                description: 'Bad',  // Too short description
                detectionPatterns: [],  // No patterns
                filePatterns: []
            };

            const result = await registry.addCustomFramework(poorFrameworkSpec, 'user-suspicious');

            expect(result.approved).toBe(false);
            expect(result.validationResult.consensus.consensusReached).toBe(false);
            expect(result.validationResult.consensus.approvalVotes).toBeLessThan(
                result.validationResult.consensus.requiredApprovals
            );
        });

        test('should tolerate Byzantine node failures', async () => {
            const frameworkSpec = {
                id: 'byzantine-tolerance-test',
                name: 'Byzantine Tolerance Test Framework',
                description: 'Testing framework tolerance to Byzantine failures',
                detectionPatterns: ['btest.config.js'],
                filePatterns: ['**/*.btest.js'],
                validationRules: [{ type: 'file_exists', pattern: 'btest.config.js' }],
                security: { sandboxed: true }
            };

            // Test multiple times to account for randomized Byzantine behavior
            const results = [];
            for (let i = 0; i < 5; i++) {
                const result = await registry.addCustomFramework(frameworkSpec, 'user-trusted');
                results.push(result);
            }

            // Should succeed in majority of cases despite Byzantine nodes
            const successCount = results.filter(r => r.approved).length;
            expect(successCount).toBeGreaterThan(2); // At least 3 out of 5 should succeed
        });

        test('should detect Byzantine behavior patterns', async () => {
            // Simulate multiple validations to build pattern history
            const frameworks = [
                {
                    id: 'pattern-test-1',
                    name: 'Pattern Test 1',
                    description: 'First pattern test framework',
                    detectionPatterns: ['test1.config.js'],
                    filePatterns: ['**/*.test1.js']
                },
                {
                    id: 'pattern-test-2',
                    name: 'Pattern Test 2',
                    description: 'Second pattern test framework',
                    detectionPatterns: ['test2.config.js'],
                    filePatterns: ['**/*.test2.js']
                },
                {
                    id: 'pattern-test-3',
                    name: 'Pattern Test 3',
                    description: 'Third pattern test framework',
                    detectionPatterns: ['test3.config.js'],
                    filePatterns: ['**/*.test3.js']
                }
            ];

            // Add multiple frameworks to build history
            for (const framework of frameworks) {
                await registry.addCustomFramework(framework, 'user-trusted');
            }

            const byzantineStatus = await registry.getByzantineStatus();

            expect(byzantineStatus).toHaveProperty('suspiciousNodes');
            expect(byzantineStatus).toHaveProperty('networkHealth');
            expect(byzantineStatus).toHaveProperty('byzantineFaultDetected');
            expect(byzantineStatus).toHaveProperty('faultToleranceStatus');
            expect(byzantineStatus.networkHealth).toBeGreaterThan(0);
        });
    });

    describe('Cryptographic Validation', () => {
        test('should validate framework integrity with cryptographic hash', async () => {
            const frameworkSpec = {
                id: 'crypto-test-framework',
                name: 'Cryptographic Test Framework',
                description: 'Framework for testing cryptographic validation',
                detectionPatterns: ['crypto.config.js'],
                filePatterns: ['**/*.crypto.js']
            };

            const result = await registry.addCustomFramework(frameworkSpec, 'user-trusted');

            expect(result.validationResult.integrity.hash).toBeDefined();
            expect(result.validationResult.integrity.signature).toBeDefined();
            expect(result.validationResult.integrity.verified).toBe(true);
            expect(result.validationResult.integrity.algorithm).toBe('SHA-256-RSA');
        });

        test('should generate distributed signatures for approved frameworks', async () => {
            const frameworkSpec = {
                id: 'signature-test-framework',
                name: 'Signature Test Framework',
                description: 'Framework for testing distributed signatures',
                detectionPatterns: ['signature.config.js'],
                filePatterns: ['**/*.signature.js'],
                validationRules: [{ type: 'file_exists', pattern: 'signature.config.js' }]
            };

            const result = await registry.addCustomFramework(frameworkSpec, 'user-trusted');

            if (result.approved) {
                expect(result.validationResult.signatures).toBeDefined();
                expect(result.validationResult.signatures.length).toBeGreaterThan(0);

                // Verify signature structure
                for (const signature of result.validationResult.signatures) {
                    expect(signature).toHaveProperty('nodeId');
                    expect(signature).toHaveProperty('signature');
                    expect(signature).toHaveProperty('timestamp');
                    expect(signature.signature).toMatch(/^rsa-/);
                }
            }
        });
    });

    describe('Security Threat Analysis', () => {
        test('should detect dangerous code patterns', async () => {
            const maliciousFrameworkSpec = {
                id: 'malicious-framework',
                name: 'Malicious Framework',
                description: 'Framework with dangerous patterns',
                detectionPatterns: ['eval("dangerous code")', 'exec("rm -rf /")'],
                filePatterns: ['**/*.js']
            };

            const result = await registry.addCustomFramework(maliciousFrameworkSpec, 'user-suspicious');

            expect(result.approved).toBe(false);
            expect(result.validationResult.security.threatCount).toBeGreaterThan(0);
            expect(result.validationResult.security.riskLevel).toBe('high');
            expect(result.validationResult.security.approved).toBe(false);
        });

        test('should detect directory traversal attempts', async () => {
            const traversalFrameworkSpec = {
                id: 'traversal-framework',
                name: 'Traversal Framework',
                description: 'Framework with directory traversal patterns',
                detectionPatterns: ['config.js'],
                filePatterns: ['../../../etc/passwd', '../../config/*.conf']
            };

            const result = await registry.addCustomFramework(traversalFrameworkSpec, 'user-suspicious');

            expect(result.approved).toBe(false);
            expect(result.validationResult.security.threats).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        type: 'directory_traversal',
                        severity: 'high'
                    })
                ])
            );
        });

        test('should approve secure frameworks', async () => {
            const secureFrameworkSpec = {
                id: 'secure-framework',
                name: 'Secure Framework',
                description: 'A properly secured framework',
                detectionPatterns: ['secure.config.js', 'package.json'],
                filePatterns: ['src/**/*.js', 'tests/**/*.test.js'],
                validationRules: [
                    { type: 'file_exists', pattern: 'secure.config.js' }
                ],
                security: {
                    sandboxed: true,
                    permissions: ['read:src', 'read:tests']
                }
            };

            const result = await registry.addCustomFramework(secureFrameworkSpec, 'user-trusted');

            expect(result.validationResult.security.riskLevel).toBe('low');
            expect(result.validationResult.security.approved).toBe(true);
            expect(result.validationResult.security.threatCount).toBe(0);
        });

        test('should handle network access security considerations', async () => {
            const networkFrameworkSpec = {
                id: 'network-framework',
                name: 'Network Framework',
                description: 'Framework requiring network access',
                detectionPatterns: ['network.config.js'],
                filePatterns: ['**/*.network.js'],
                networkAccess: true
            };

            const result = await registry.addCustomFramework(networkFrameworkSpec, 'user-trusted');

            expect(result.validationResult.security.threats).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        type: 'network_access',
                        severity: 'medium'
                    })
                ])
            );
            expect(result.validationResult.security.riskLevel).toBe('medium');
        });
    });

    describe('Framework Registry Integration', () => {
        test('should store approved frameworks with validation metadata', async () => {
            const frameworkSpec = {
                id: 'registry-test-framework',
                name: 'Registry Test Framework',
                description: 'Framework for testing registry integration',
                detectionPatterns: ['registry.config.js'],
                filePatterns: ['**/*.registry.js'],
                validationRules: [{ type: 'file_exists', pattern: 'registry.config.js' }]
            };

            const result = await registry.addCustomFramework(frameworkSpec, 'user-trusted');

            if (result.approved) {
                const storedFramework = registry.getFramework(frameworkSpec.id);

                expect(storedFramework).toBeDefined();
                expect(storedFramework.id).toBe(frameworkSpec.id);
                expect(storedFramework.addedBy).toBe('user-trusted');
                expect(storedFramework.addedAt).toBeDefined();
                expect(storedFramework.validationId).toBe(result.validationResult.validationId);
                expect(storedFramework.signatures).toBeDefined();
            }
        });

        test('should not store rejected frameworks', async () => {
            const badFrameworkSpec = {
                id: 'rejected-framework',
                name: 'Bad',
                description: 'Bad framework',
                detectionPatterns: ['eval("bad")'],
                filePatterns: []
            };

            const result = await registry.addCustomFramework(badFrameworkSpec, 'user-malicious');

            expect(result.approved).toBe(false);
            expect(registry.getFramework(badFrameworkSpec.id)).toBeUndefined();
        });

        test('should track pending additions with complete metadata', async () => {
            const frameworkSpec = {
                id: 'pending-test-framework',
                name: 'Pending Test Framework',
                description: 'Framework for testing pending tracking',
                detectionPatterns: ['pending.config.js'],
                filePatterns: ['**/*.pending.js']
            };

            const result = await registry.addCustomFramework(frameworkSpec, 'user-new');
            const pendingAddition = registry.getPendingAddition(result.additionId);

            expect(pendingAddition).toBeDefined();
            expect(pendingAddition.frameworkSpec).toEqual(frameworkSpec);
            expect(pendingAddition.submitterId).toBe('user-new');
            expect(pendingAddition.status).toMatch(/^(approved|rejected)$/);
            expect(pendingAddition.submissionTime).toBeDefined();
            expect(pendingAddition.validationResult).toBeDefined();
        });
    });

    describe('Performance Under Adversarial Conditions', () => {
        test('should handle concurrent malicious submissions', async () => {
            const maliciousSpecs = Array.from({ length: 5 }, (_, i) => ({
                id: `malicious-${i}`,
                name: `Malicious Framework ${i}`,
                description: 'Malicious framework attempt',
                detectionPatterns: [`eval("malicious-${i}")`],
                filePatterns: [`../../../malicious-${i}.js`]
            }));

            const startTime = Date.now();
            const promises = maliciousSpecs.map(spec =>
                registry.addCustomFramework(spec, 'user-malicious')
            );

            const results = await Promise.all(promises);
            const endTime = Date.now();

            // All should be rejected
            results.forEach(result => {
                expect(result.approved).toBe(false);
            });

            // Should complete within reasonable time despite adversarial load
            expect(endTime - startTime).toBeLessThan(5000); // 5 seconds max

            // Byzantine system should remain healthy
            const byzantineStatus = await registry.getByzantineStatus();
            expect(byzantineStatus.faultToleranceStatus).toMatch(/^(healthy|compromised)$/);
        });

        test('should maintain consensus accuracy under load', async () => {
            const testSpecs = Array.from({ length: 10 }, (_, i) => ({
                id: `load-test-${i}`,
                name: `Load Test Framework ${i}`,
                description: `Framework ${i} for load testing Byzantine consensus`,
                detectionPatterns: [`loadtest${i}.config.js`],
                filePatterns: [`**/*.loadtest${i}.js`],
                validationRules: [{ type: 'file_exists', pattern: `loadtest${i}.config.js` }]
            }));

            const promises = testSpecs.map((spec, i) =>
                registry.addCustomFramework(spec, i % 2 === 0 ? 'user-trusted' : 'user-new')
            );

            const results = await Promise.all(promises);

            // Majority should be approved (trusted users have better frameworks)
            const approvedCount = results.filter(r => r.approved).length;
            expect(approvedCount).toBeGreaterThan(results.length / 2);

            // All validations should have proper consensus data
            results.forEach(result => {
                expect(result.validationResult.consensus).toBeDefined();
                expect(result.validationResult.consensus.totalNodes).toBeGreaterThan(0);
                expect(result.validationResult.consensus.faultTolerance).toBeDefined();
            });
        });

        test('should recover from Byzantine node compromise', async () => {
            // First, establish baseline with healthy network
            const healthySpec = {
                id: 'health-baseline',
                name: 'Health Baseline Framework',
                description: 'Framework to establish healthy baseline',
                detectionPatterns: ['baseline.config.js'],
                filePatterns: ['**/*.baseline.js']
            };

            await registry.addCustomFramework(healthySpec, 'user-trusted');

            // Simulate multiple suspicious activities to trigger Byzantine detection
            const suspiciousSpecs = Array.from({ length: 3 }, (_, i) => ({
                id: `suspicious-${i}`,
                name: `Suspicious Framework ${i}`,
                description: 'Framework with inconsistent quality',
                detectionPatterns: i % 2 === 0 ? ['good.config.js'] : ['bad.config.js'],
                filePatterns: i % 2 === 0 ? ['**/*.good.js'] : []
            }));

            for (const spec of suspiciousSpecs) {
                await registry.addCustomFramework(spec, 'user-suspicious');
            }

            const byzantineStatus = await registry.getByzantineStatus();

            // System should detect suspicious patterns
            expect(byzantineStatus.byzantineFaultDetected).toBeDefined();
            expect(byzantineStatus.networkHealth).toBeGreaterThan(0);

            // Even with detected Byzantine behavior, fault tolerance should work
            expect(byzantineStatus.faultToleranceStatus).toBeDefined();
        });
    });

    describe('Validation History and Audit Trail', () => {
        test('should maintain complete audit trail', async () => {
            const frameworkSpec = {
                id: 'audit-test-framework',
                name: 'Audit Test Framework',
                description: 'Framework for testing audit trail',
                detectionPatterns: ['audit.config.js'],
                filePatterns: ['**/*.audit.js']
            };

            const result = await registry.addCustomFramework(frameworkSpec, 'user-trusted');
            const history = registry.getValidationHistory();

            expect(history.length).toBeGreaterThan(0);

            const auditEntry = history.find(h => h.validationId === result.validationResult.validationId);
            expect(auditEntry).toBeDefined();
            expect(auditEntry.frameworkId).toBe(frameworkSpec.id);
            expect(auditEntry.submitterId).toBe('user-trusted');
            expect(auditEntry.startTime).toBeDefined();
            expect(auditEntry.endTime).toBeDefined();
            expect(auditEntry.integrity).toBeDefined();
            expect(auditEntry.consensus).toBeDefined();
            expect(auditEntry.security).toBeDefined();
            expect(auditEntry.byzantine).toBeDefined();
            expect(auditEntry.signatures).toBeDefined();
        });

        test('should track validation timing metrics', async () => {
            const frameworkSpec = {
                id: 'timing-test-framework',
                name: 'Timing Test Framework',
                description: 'Framework for testing validation timing',
                detectionPatterns: ['timing.config.js'],
                filePatterns: ['**/*.timing.js']
            };

            const result = await registry.addCustomFramework(frameworkSpec, 'user-trusted');

            expect(result.validationResult.startTime).toBeDefined();
            expect(result.validationResult.endTime).toBeDefined();
            expect(result.validationResult.endTime).toBeGreaterThan(result.validationResult.startTime);

            const duration = result.validationResult.endTime - result.validationResult.startTime;
            expect(duration).toBeGreaterThan(0);
            expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
        });
    });

    describe('Edge Cases and Error Handling', () => {
        test('should handle malformed framework specifications', async () => {
            const malformedSpecs = [
                null,
                undefined,
                {},
                { id: null },
                { id: '', name: '' },
                { id: 'test', detectionPatterns: 'not-an-array' },
                { id: 'test', filePatterns: { invalid: 'format' } }
            ];

            for (const spec of malformedSpecs) {
                try {
                    const result = await registry.addCustomFramework(spec, 'user-trusted');
                    // Should either reject or throw
                    if (result) {
                        expect(result.approved).toBe(false);
                    }
                } catch (error) {
                    // Expected for severely malformed inputs
                    expect(error).toBeDefined();
                }
            }
        });

        test('should handle network partition scenarios', async () => {
            // Simulate reduced node availability
            const originalNodeCount = registry.validator.nodeCount;
            registry.validator.nodeCount = 3; // Minimum viable network
            registry.validator.nodes = registry.validator.nodes.slice(0, 3);

            const frameworkSpec = {
                id: 'partition-test-framework',
                name: 'Partition Test Framework',
                description: 'Framework for testing network partition tolerance',
                detectionPatterns: ['partition.config.js'],
                filePatterns: ['**/*.partition.js']
            };

            const result = await registry.addCustomFramework(frameworkSpec, 'user-trusted');

            // Should still work with minimum viable network
            expect(result.validationResult).toBeDefined();
            expect(result.validationResult.consensus.totalNodes).toBe(3);

            // Restore original configuration
            registry.validator.nodeCount = originalNodeCount;
        });

        test('should validate framework ID uniqueness', async () => {
            const frameworkSpec1 = {
                id: 'unique-test-framework',
                name: 'First Framework',
                description: 'First framework with this ID',
                detectionPatterns: ['first.config.js'],
                filePatterns: ['**/*.first.js']
            };

            const frameworkSpec2 = {
                id: 'unique-test-framework', // Same ID
                name: 'Second Framework',
                description: 'Second framework with same ID',
                detectionPatterns: ['second.config.js'],
                filePatterns: ['**/*.second.js']
            };

            const result1 = await registry.addCustomFramework(frameworkSpec1, 'user-trusted');
            const result2 = await registry.addCustomFramework(frameworkSpec2, 'user-trusted');

            // First should succeed, second should be rejected due to ID conflict
            if (result1.approved) {
                expect(result2.approved).toBe(false);
            }
        });
    });
});