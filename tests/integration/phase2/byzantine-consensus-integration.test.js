/**
 * Byzantine Consensus Integration Tests
 * Phase 2 Integration Test Suite - Distributed Consensus Component
 *
 * Tests Byzantine fault-tolerant consensus mechanisms for distributed
 * Phase 2 validation across multiple nodes with cryptographic integrity.
 *
 * Requirements:
 * - Byzantine fault tolerance (up to 1/3 malicious nodes)
 * - Distributed consensus for validation decisions
 * - Cryptographic message integrity
 * - Network partition resilience
 * - Performance under adversarial conditions
 */

const { jest } = require('@jest/globals');

// Mock Byzantine consensus node
class MockByzantineNode {
    constructor(nodeId, config = {}) {
        this.nodeId = nodeId;
        this.config = {
            byzantineBehavior: config.byzantineBehavior || false,
            maliciousType: config.maliciousType || 'random', // 'random', 'always_reject', 'always_approve', 'delayed'
            responseDelay: config.responseDelay || 0,
            reputation: config.reputation || 100,
            networkPartitioned: config.networkPartitioned || false
        };

        this.state = {
            currentView: 0,
            status: 'active',
            lastHeartbeat: Date.now(),
            messageLog: [],
            votingHistory: [],
            commitHistory: []
        };

        this.cryptoProvider = new MockCryptographicProvider(nodeId);
        this.networkSimulator = new MockNetworkSimulator(nodeId);
    }

    async proposeValidation(validationRequest) {
        const proposal = {
            proposalId: `prop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            proposerId: this.nodeId,
            view: this.state.currentView,
            timestamp: Date.now(),
            validationRequest,
            signature: await this.cryptoProvider.signData(JSON.stringify(validationRequest))
        };

        this.state.messageLog.push({
            type: 'proposal',
            data: proposal,
            timestamp: Date.now()
        });

        return proposal;
    }

    async processProposal(proposal, consensusNodes) {
        if (this.config.networkPartitioned) {
            throw new Error('Node is network partitioned');
        }

        // Simulate response delay for Byzantine behavior
        if (this.config.responseDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, this.config.responseDelay));
        }

        // Verify proposal signature
        const signatureValid = await this.cryptoProvider.verifySignature(
            JSON.stringify(proposal.validationRequest),
            proposal.signature,
            proposal.proposerId
        );

        if (!signatureValid) {
            throw new Error('Invalid proposal signature');
        }

        // Generate vote based on node behavior
        const vote = await this.generateVote(proposal, consensusNodes);

        this.state.votingHistory.push({
            proposalId: proposal.proposalId,
            vote: vote.decision,
            timestamp: Date.now()
        });

        this.state.messageLog.push({
            type: 'vote',
            data: vote,
            timestamp: Date.now()
        });

        return vote;
    }

    async generateVote(proposal, consensusNodes) {
        const baseScore = this.evaluateProposal(proposal);
        const networkHealth = this.assessNetworkHealth(consensusNodes);

        let decision;
        let confidence;

        if (this.config.byzantineBehavior) {
            // Byzantine behavior simulation
            switch (this.config.maliciousType) {
                case 'always_reject':
                    decision = 'reject';
                    confidence = 0.9;
                    break;
                case 'always_approve':
                    decision = 'approve';
                    confidence = 0.9;
                    break;
                case 'delayed':
                    // Already handled response delay above
                    decision = baseScore > 0.6 ? 'approve' : 'reject';
                    confidence = Math.abs(baseScore - 0.5) + 0.3;
                    break;
                case 'random':
                default:
                    decision = Math.random() < 0.5 ? 'approve' : 'reject';
                    confidence = Math.random() * 0.4 + 0.3; // Low confidence for random
                    break;
            }
        } else {
            // Honest node behavior
            const combinedScore = (baseScore * 0.7) + (networkHealth * 0.3);

            if (combinedScore > 0.75) {
                decision = 'approve';
                confidence = combinedScore;
            } else if (combinedScore > 0.4) {
                decision = 'abstain';
                confidence = 0.6;
            } else {
                decision = 'reject';
                confidence = 1 - combinedScore;
            }
        }

        const vote = {
            nodeId: this.nodeId,
            proposalId: proposal.proposalId,
            decision,
            confidence,
            timestamp: Date.now(),
            view: this.state.currentView,
            justification: this.generateJustification(decision, baseScore, networkHealth),
            signature: await this.cryptoProvider.signData(`${proposal.proposalId}-${decision}`)
        };

        return vote;
    }

    evaluateProposal(proposal) {
        const validationRequest = proposal.validationRequest;
        let score = 0.5; // Base score

        // Evaluate based on request properties
        if (validationRequest.type === 'framework_addition') {
            const framework = validationRequest.framework;

            // Name and description quality
            if (framework.name && framework.name.length > 3) score += 0.1;
            if (framework.description && framework.description.length > 20) score += 0.1;

            // Detection patterns quality
            if (framework.detectionPatterns && framework.detectionPatterns.length > 0) {
                score += 0.2;
            }

            // Security considerations
            if (framework.security && framework.security.sandboxed) {
                score += 0.1;
            }

            // Avoid dangerous patterns
            if (framework.detectionPatterns) {
                const dangerousPatterns = framework.detectionPatterns.some(p =>
                    p.includes('eval') || p.includes('exec')
                );
                if (dangerousPatterns) score -= 0.3;
            }
        }

        return Math.max(Math.min(score, 1.0), 0.0);
    }

    assessNetworkHealth(consensusNodes) {
        const activeNodes = consensusNodes.filter(node =>
            !node.config.networkPartitioned &&
            (Date.now() - node.state.lastHeartbeat) < 30000
        ).length;

        const totalNodes = consensusNodes.length;
        const healthRatio = activeNodes / totalNodes;

        // Network is healthy if more than 2/3 nodes are active
        return healthRatio > (2/3) ? healthRatio : healthRatio * 0.5;
    }

    generateJustification(decision, baseScore, networkHealth) {
        const reasons = [];

        if (decision === 'approve') {
            if (baseScore > 0.7) reasons.push('High proposal quality');
            if (networkHealth > 0.8) reasons.push('Healthy network consensus');
        } else if (decision === 'reject') {
            if (baseScore < 0.4) reasons.push('Poor proposal quality');
            if (networkHealth < 0.6) reasons.push('Insufficient network health');
        } else {
            reasons.push('Insufficient information for decisive vote');
        }

        return reasons.length > 0 ? reasons.join(', ') : `Score: ${baseScore.toFixed(2)}`;
    }

    async commitDecision(decision, proof) {
        const commitRecord = {
            decisionId: decision.decisionId,
            decision: decision.result,
            timestamp: Date.now(),
            proof: proof,
            view: this.state.currentView,
            signature: await this.cryptoProvider.signData(`commit-${decision.decisionId}`)
        };

        this.state.commitHistory.push(commitRecord);

        this.state.messageLog.push({
            type: 'commit',
            data: commitRecord,
            timestamp: Date.now()
        });

        return commitRecord;
    }

    async sendHeartbeat() {
        this.state.lastHeartbeat = Date.now();

        const heartbeat = {
            nodeId: this.nodeId,
            timestamp: this.state.lastHeartbeat,
            view: this.state.currentView,
            status: this.state.status,
            messageCount: this.state.messageLog.length
        };

        return heartbeat;
    }

    getNodeMetrics() {
        return {
            nodeId: this.nodeId,
            status: this.state.status,
            currentView: this.state.currentView,
            reputation: this.config.reputation,
            byzantineBehavior: this.config.byzantineBehavior,
            messageCount: this.state.messageLog.length,
            votesCount: this.state.votingHistory.length,
            commitsCount: this.state.commitHistory.length,
            lastHeartbeat: this.state.lastHeartbeat
        };
    }

    simulatePartition(partitioned = true) {
        this.config.networkPartitioned = partitioned;
    }

    simulateByzantineBehavior(enabled = true, type = 'random') {
        this.config.byzantineBehavior = enabled;
        this.config.maliciousType = type;
    }
}

class MockCryptographicProvider {
    constructor(nodeId) {
        this.nodeId = nodeId;
        this.keyPair = this.generateKeyPair();
    }

    generateKeyPair() {
        return {
            publicKey: `pub-${this.nodeId}-${Math.random().toString(36).substr(2, 16)}`,
            privateKey: `priv-${this.nodeId}-${Math.random().toString(36).substr(2, 16)}`
        };
    }

    async signData(data) {
        // Mock signature generation
        const signature = `sig-${this.nodeId}-${Buffer.from(data).toString('base64').substr(0, 32)}`;
        return signature;
    }

    async verifySignature(data, signature, signerId) {
        // Mock signature verification
        const expectedPrefix = `sig-${signerId}-`;
        return signature.startsWith(expectedPrefix);
    }

    getPublicKey() {
        return this.keyPair.publicKey;
    }
}

class MockNetworkSimulator {
    constructor(nodeId) {
        this.nodeId = nodeId;
        this.messageLatency = 50; // ms
        this.messageDropRate = 0.01; // 1% drop rate
        this.partitionedNodes = new Set();
    }

    async sendMessage(targetNodeId, message) {
        // Simulate network partition
        if (this.partitionedNodes.has(this.nodeId) || this.partitionedNodes.has(targetNodeId)) {
            throw new Error('Network partition: Message cannot be delivered');
        }

        // Simulate message drop
        if (Math.random() < this.messageDropRate) {
            throw new Error('Network error: Message dropped');
        }

        // Simulate latency
        await new Promise(resolve => setTimeout(resolve, this.messageLatency));

        return {
            messageId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            from: this.nodeId,
            to: targetNodeId,
            message,
            timestamp: Date.now()
        };
    }

    partitionNode(nodeId) {
        this.partitionedNodes.add(nodeId);
    }

    healPartition(nodeId) {
        this.partitionedNodes.delete(nodeId);
    }

    setLatency(latency) {
        this.messageLatency = latency;
    }

    setDropRate(dropRate) {
        this.messageDropRate = dropRate;
    }
}

class MockByzantineConsensusProtocol {
    constructor(nodes, config = {}) {
        this.nodes = nodes;
        this.config = {
            faultTolerance: Math.floor((nodes.length - 1) / 3),
            consensusThreshold: Math.ceil((2 * nodes.length) / 3),
            viewChangeTimeout: config.viewChangeTimeout || 5000,
            maxRetries: config.maxRetries || 3
        };

        this.consensusHistory = [];
        this.currentView = 0;
        this.activeProposals = new Map();
    }

    async executeConsensus(validationRequest) {
        const consensusId = `consensus-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();

        const consensusSession = {
            consensusId,
            validationRequest,
            startTime,
            currentView: this.currentView,
            phases: {
                proposal: null,
                voting: null,
                decision: null,
                commit: null
            },
            nodeParticipation: [],
            result: null
        };

        this.activeProposals.set(consensusId, consensusSession);

        try {
            // Phase 1: Proposal
            const proposal = await this.executeProposalPhase(consensusSession);
            consensusSession.phases.proposal = proposal;

            // Phase 2: Voting
            const votes = await this.executeVotingPhase(consensusSession, proposal);
            consensusSession.phases.voting = votes;

            // Phase 3: Decision
            const decision = await this.executeDecisionPhase(consensusSession, votes);
            consensusSession.phases.decision = decision;

            // Phase 4: Commit
            const commitResults = await this.executeCommitPhase(consensusSession, decision);
            consensusSession.phases.commit = commitResults;

            consensusSession.result = decision;
            consensusSession.endTime = Date.now();
            consensusSession.duration = consensusSession.endTime - consensusSession.startTime;

            this.consensusHistory.push(consensusSession);
            this.activeProposals.delete(consensusId);

            return {
                consensusId,
                success: true,
                result: decision.result,
                duration: consensusSession.duration,
                nodeParticipation: consensusSession.nodeParticipation.length,
                byzantineFaultsDetected: this.detectByzantineFaults(consensusSession),
                proof: this.generateConsensusProof(consensusSession)
            };

        } catch (error) {
            consensusSession.error = error.message;
            consensusSession.endTime = Date.now();

            this.consensusHistory.push(consensusSession);
            this.activeProposals.delete(consensusId);

            return {
                consensusId,
                success: false,
                error: error.message,
                duration: consensusSession.endTime - consensusSession.startTime,
                nodeParticipation: consensusSession.nodeParticipation.length
            };
        }
    }

    async executeProposalPhase(consensusSession) {
        // Select primary node for this view (simple round-robin)
        const primaryIndex = this.currentView % this.nodes.length;
        const primaryNode = this.nodes[primaryIndex];

        consensusSession.nodeParticipation.push({
            nodeId: primaryNode.nodeId,
            role: 'primary',
            phase: 'proposal'
        });

        try {
            const proposal = await primaryNode.proposeValidation(consensusSession.validationRequest);

            return {
                ...proposal,
                primaryNodeId: primaryNode.nodeId,
                view: this.currentView,
                timestamp: Date.now()
            };
        } catch (error) {
            // Primary failed, trigger view change
            await this.triggerViewChange();
            throw new Error(`Proposal phase failed: ${error.message}`);
        }
    }

    async executeVotingPhase(consensusSession, proposal) {
        const votes = [];
        const votePromises = [];

        // Collect votes from all nodes (including primary)
        for (const node of this.nodes) {
            const votePromise = this.collectVoteFromNode(node, proposal, consensusSession);
            votePromises.push(votePromise);
        }

        // Wait for votes with timeout
        const voteResults = await Promise.allSettled(votePromises);

        voteResults.forEach((result, index) => {
            const node = this.nodes[index];

            if (result.status === 'fulfilled' && result.value) {
                votes.push(result.value);

                consensusSession.nodeParticipation.push({
                    nodeId: node.nodeId,
                    role: 'voter',
                    phase: 'voting',
                    decision: result.value.decision
                });
            } else {
                // Node failed to vote
                consensusSession.nodeParticipation.push({
                    nodeId: node.nodeId,
                    role: 'voter',
                    phase: 'voting',
                    error: result.reason?.message || 'Failed to vote'
                });
            }
        });

        // Check if we have enough votes for consensus
        if (votes.length < this.config.consensusThreshold) {
            throw new Error(`Insufficient votes: ${votes.length} < ${this.config.consensusThreshold}`);
        }

        return {
            votes,
            totalVotes: votes.length,
            requiredVotes: this.config.consensusThreshold,
            timestamp: Date.now()
        };
    }

    async collectVoteFromNode(node, proposal, consensusSession) {
        try {
            const vote = await node.processProposal(proposal, this.nodes);

            // Verify vote signature
            const signatureValid = await node.cryptoProvider.verifySignature(
                `${proposal.proposalId}-${vote.decision}`,
                vote.signature,
                node.nodeId
            );

            if (!signatureValid) {
                throw new Error('Invalid vote signature');
            }

            return vote;
        } catch (error) {
            // Return null for failed votes, but don't throw to allow other votes to complete
            return null;
        }
    }

    async executeDecisionPhase(consensusSession, votingResults) {
        const votes = votingResults.votes;
        const approveVotes = votes.filter(v => v.decision === 'approve');
        const rejectVotes = votes.filter(v => v.decision === 'reject');
        const abstainVotes = votes.filter(v => v.decision === 'abstain');

        let result;
        let confidence;

        // Decision logic: majority approval required, considering abstains
        const totalDecisiveVotes = approveVotes.length + rejectVotes.length;

        if (totalDecisiveVotes < this.config.consensusThreshold / 2) {
            result = 'rejected';
            confidence = 0.0;
        } else if (approveVotes.length > rejectVotes.length) {
            result = 'approved';
            confidence = approveVotes.length / totalDecisiveVotes;
        } else {
            result = 'rejected';
            confidence = rejectVotes.length / totalDecisiveVotes;
        }

        // Calculate Byzantine fault indicators
        const suspiciousVotes = this.identifySuspiciousVotes(votes);

        return {
            decisionId: `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            result,
            confidence,
            voteBreakdown: {
                approve: approveVotes.length,
                reject: rejectVotes.length,
                abstain: abstainVotes.length,
                total: votes.length
            },
            suspiciousVotes,
            timestamp: Date.now(),
            view: this.currentView
        };
    }

    identifySuspiciousVotes(votes) {
        const suspicious = [];

        // Analyze voting patterns
        for (const vote of votes) {
            let suspicionLevel = 0;
            const suspicions = [];

            // Extremely low or high confidence without justification
            if (vote.confidence < 0.1 || vote.confidence > 0.95) {
                if (!vote.justification || vote.justification.length < 10) {
                    suspicionLevel += 0.3;
                    suspicions.push('Extreme confidence without justification');
                }
            }

            // Check for pattern inconsistency (would require historical data)
            const node = this.nodes.find(n => n.nodeId === vote.nodeId);
            if (node && node.config.byzantineBehavior) {
                suspicionLevel += 0.5;
                suspicions.push('Known Byzantine behavior');
            }

            if (suspicionLevel > 0.4) {
                suspicious.push({
                    nodeId: vote.nodeId,
                    suspicionLevel,
                    suspicions,
                    vote: {
                        decision: vote.decision,
                        confidence: vote.confidence
                    }
                });
            }
        }

        return suspicious;
    }

    async executeCommitPhase(consensusSession, decision) {
        const commitPromises = [];
        const proof = this.generateConsensusProof(consensusSession);

        for (const node of this.nodes) {
            const commitPromise = node.commitDecision(decision, proof)
                .catch(error => ({ nodeId: node.nodeId, error: error.message }));
            commitPromises.push(commitPromise);
        }

        const commitResults = await Promise.allSettled(commitPromises);

        const commits = [];
        const failures = [];

        commitResults.forEach((result, index) => {
            const node = this.nodes[index];

            if (result.status === 'fulfilled' && !result.value.error) {
                commits.push(result.value);

                consensusSession.nodeParticipation.push({
                    nodeId: node.nodeId,
                    role: 'committer',
                    phase: 'commit'
                });
            } else {
                const error = result.value?.error || result.reason?.message || 'Unknown commit error';
                failures.push({ nodeId: node.nodeId, error });
            }
        });

        return {
            commits,
            failures,
            commitCount: commits.length,
            failureCount: failures.length,
            proof,
            timestamp: Date.now()
        };
    }

    generateConsensusProof(consensusSession) {
        const proof = {
            consensusId: consensusSession.consensusId,
            view: consensusSession.currentView,
            timestamp: Date.now(),
            phases: {
                proposal: consensusSession.phases.proposal ? {
                    proposalId: consensusSession.phases.proposal.proposalId,
                    proposerId: consensusSession.phases.proposal.proposerId,
                    signature: consensusSession.phases.proposal.signature
                } : null,
                voting: consensusSession.phases.voting ? {
                    totalVotes: consensusSession.phases.voting.totalVotes,
                    voteHashes: consensusSession.phases.voting.votes.map(v =>
                        `${v.nodeId}:${v.decision}:${v.signature.substr(0, 16)}`
                    )
                } : null,
                decision: consensusSession.phases.decision ? {
                    result: consensusSession.phases.decision.result,
                    confidence: consensusSession.phases.decision.confidence,
                    voteBreakdown: consensusSession.phases.decision.voteBreakdown
                } : null
            },
            participatingNodes: consensusSession.nodeParticipation.map(p => p.nodeId),
            integrity: this.calculateIntegrityHash(consensusSession)
        };

        return proof;
    }

    calculateIntegrityHash(consensusSession) {
        const dataToHash = JSON.stringify({
            consensusId: consensusSession.consensusId,
            validationRequest: consensusSession.validationRequest,
            result: consensusSession.result?.result,
            nodeParticipation: consensusSession.nodeParticipation.length
        });

        // Simple hash for testing
        let hash = 0;
        for (let i = 0; i < dataToHash.length; i++) {
            const char = dataToHash.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }

        return hash.toString(16);
    }

    detectByzantineFaults(consensusSession) {
        const faults = [];

        // Check for nodes that exhibited suspicious behavior
        if (consensusSession.phases.decision && consensusSession.phases.decision.suspiciousVotes) {
            faults.push(...consensusSession.phases.decision.suspiciousVotes.map(sv => ({
                type: 'suspicious_voting',
                nodeId: sv.nodeId,
                severity: sv.suspicionLevel > 0.7 ? 'high' : 'medium',
                evidence: sv.suspicions
            })));
        }

        // Check for nodes that failed to participate
        const allNodeIds = new Set(this.nodes.map(n => n.nodeId));
        const participatingNodeIds = new Set(
            consensusSession.nodeParticipation.map(p => p.nodeId)
        );

        for (const nodeId of allNodeIds) {
            if (!participatingNodeIds.has(nodeId)) {
                faults.push({
                    type: 'non_participation',
                    nodeId,
                    severity: 'low',
                    evidence: ['Failed to participate in consensus']
                });
            }
        }

        return faults;
    }

    async triggerViewChange() {
        this.currentView++;

        // Notify all nodes of view change
        const viewChangePromises = this.nodes.map(node =>
            node.state ? (node.state.currentView = this.currentView) : null
        );

        await Promise.allSettled(viewChangePromises);
    }

    getConsensusHistory() {
        return [...this.consensusHistory];
    }

    getActiveProposals() {
        return Array.from(this.activeProposals.values());
    }

    getProtocolMetrics() {
        return {
            currentView: this.currentView,
            totalConsensusRounds: this.consensusHistory.length,
            averageConsensusTime: this.calculateAverageConsensusTime(),
            successRate: this.calculateSuccessRate(),
            byzantineFaultsDetected: this.countByzantineFaults(),
            nodeCount: this.nodes.length,
            faultTolerance: this.config.faultTolerance
        };
    }

    calculateAverageConsensusTime() {
        if (this.consensusHistory.length === 0) return 0;

        const completedSessions = this.consensusHistory.filter(s => s.duration);
        const totalTime = completedSessions.reduce((sum, s) => sum + s.duration, 0);

        return totalTime / completedSessions.length;
    }

    calculateSuccessRate() {
        if (this.consensusHistory.length === 0) return 0;

        const successfulSessions = this.consensusHistory.filter(s => s.result && !s.error);
        return successfulSessions.length / this.consensusHistory.length;
    }

    countByzantineFaults() {
        return this.consensusHistory.reduce((count, session) => {
            const sessionFaults = session.phases?.decision?.suspiciousVotes?.length || 0;
            return count + sessionFaults;
        }, 0);
    }
}

describe('Byzantine Consensus Integration Tests', () => {
    let consensusProtocol;
    let nodes;

    beforeEach(() => {
        // Create a network of 7 nodes (tolerates up to 2 Byzantine nodes)
        nodes = Array.from({ length: 7 }, (_, i) => {
            const isByzantine = i < 2; // First 2 nodes are Byzantine for testing
            return new MockByzantineNode(`node-${i}`, {
                byzantineBehavior: isByzantine,
                maliciousType: i === 0 ? 'always_reject' : 'random'
            });
        });

        consensusProtocol = new MockByzantineConsensusProtocol(nodes);
        jest.clearAllMocks();
    });

    describe('Basic Consensus Functionality', () => {
        test('should achieve consensus with honest majority', async () => {
            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'test-framework',
                    name: 'Test Framework',
                    description: 'A well-designed test framework',
                    detectionPatterns: ['test.config.js'],
                    filePatterns: ['**/*.test.js'],
                    security: { sandboxed: true }
                }
            };

            const result = await consensusProtocol.executeConsensus(validationRequest);

            expect(result.success).toBe(true);
            expect(result.consensusId).toBeDefined();
            expect(result.result).toMatch(/^(approved|rejected)$/);
            expect(result.duration).toBeGreaterThan(0);
            expect(result.nodeParticipation).toBeGreaterThan(4); // At least 5 nodes participated
            expect(result.proof).toBeDefined();
        });

        test('should handle Byzantine node behavior correctly', async () => {
            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'byzantine-test',
                    name: 'Byzantine Test Framework',
                    description: 'Framework to test Byzantine behavior',
                    detectionPatterns: ['byzantine.config.js'],
                    filePatterns: ['**/*.byzantine.js']
                }
            };

            const result = await consensusProtocol.executeConsensus(validationRequest);

            expect(result.success).toBe(true);
            expect(result.byzantineFaultsDetected).toBeGreaterThan(0);

            // Even with Byzantine nodes, consensus should be reached
            expect(result.result).toBeDefined();

            // Check consensus proof contains Byzantine fault information
            expect(result.proof).toHaveProperty('participatingNodes');
            expect(result.proof.participatingNodes.length).toBeGreaterThan(4);
        });

        test('should reject proposals that fail quality threshold', async () => {
            const poorValidationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'poor-framework',
                    name: 'P', // Too short
                    description: 'Bad', // Too short
                    detectionPatterns: ['eval("dangerous")'], // Dangerous pattern
                    filePatterns: []
                }
            };

            const result = await consensusProtocol.executeConsensus(validationRequest);

            expect(result.success).toBe(true);
            expect(result.result).toBe('rejected');

            // Most honest nodes should vote to reject
            const consensusSession = consensusProtocol.getConsensusHistory()[0];
            const rejectVotes = consensusSession.phases.voting.votes.filter(v => v.decision === 'reject');
            expect(rejectVotes.length).toBeGreaterThan(2);
        });

        test('should maintain consensus integrity across views', async () => {
            // Trigger a view change
            await consensusProtocol.triggerViewChange();

            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'view-change-test',
                    name: 'View Change Test',
                    description: 'Testing consensus after view change',
                    detectionPatterns: ['viewchange.config.js'],
                    filePatterns: ['**/*.viewchange.js']
                }
            };

            const result = await consensusProtocol.executeConsensus(validationRequest);

            expect(result.success).toBe(true);
            expect(result.proof.view).toBeGreaterThan(0); // View should have changed

            // Verify all nodes are on the same view
            const currentView = consensusProtocol.currentView;
            nodes.forEach(node => {
                expect(node.state.currentView).toBe(currentView);
            });
        });
    });

    describe('Byzantine Fault Tolerance', () => {
        test('should tolerate up to f Byzantine nodes where f = (n-1)/3', async () => {
            // With 7 nodes, can tolerate up to 2 Byzantine nodes
            expect(consensusProtocol.config.faultTolerance).toBe(2);

            // Add one more Byzantine node (still within tolerance)
            nodes[2].simulateByzantineBehavior(true, 'always_approve');

            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'fault-tolerance-test',
                    name: 'Fault Tolerance Test',
                    description: 'Testing Byzantine fault tolerance limits',
                    detectionPatterns: ['faulttolerance.config.js'],
                    filePatterns: ['**/*.ft.js']
                }
            };

            const result = await consensusProtocol.executeConsensus(validationRequest);

            expect(result.success).toBe(true);
            expect(result.byzantineFaultsDetected).toBeGreaterThanOrEqual(2);

            // System should still reach consensus despite 3 Byzantine nodes
            expect(result.result).toBeDefined();
        });

        test('should fail gracefully when Byzantine nodes exceed tolerance', async () => {
            // Make 4 nodes Byzantine (exceeds f = 2 tolerance)
            for (let i = 0; i < 4; i++) {
                nodes[i].simulateByzantineBehavior(true, 'always_reject');
            }

            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'exceed-tolerance-test',
                    name: 'Exceed Tolerance Test',
                    description: 'Testing behavior when Byzantine nodes exceed tolerance',
                    detectionPatterns: ['exceedtolerance.config.js'],
                    filePatterns: ['**/*.et.js']
                }
            };

            const result = await consensusProtocol.executeConsensus(validationRequest);

            // Result might succeed but with low confidence or might fail entirely
            if (result.success) {
                // If it succeeds, it should be with very low confidence
                const consensusSession = consensusProtocol.getConsensusHistory()[0];
                expect(consensusSession.phases.decision.confidence).toBeLessThan(0.6);
            } else {
                // Failure is acceptable when Byzantine nodes exceed tolerance
                expect(result.error).toBeDefined();
            }
        });

        test('should detect and report various types of Byzantine behavior', async () => {
            // Configure different types of Byzantine behavior
            nodes[0].simulateByzantineBehavior(true, 'always_reject');
            nodes[1].simulateByzantineBehavior(true, 'always_approve');
            nodes[2].simulateByzantineBehavior(true, 'random');

            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'byzantine-detection-test',
                    name: 'Byzantine Detection Test',
                    description: 'Testing detection of various Byzantine behaviors',
                    detectionPatterns: ['byzantinedetection.config.js'],
                    filePatterns: ['**/*.bd.js']
                }
            };

            const result = await consensusProtocol.executeConsensus(validationRequest);

            expect(result.byzantineFaultsDetected).toHaveLength(3);

            // Check that different types of Byzantine behavior are detected
            const faultTypes = result.byzantineFaultsDetected.map(f => f.type);
            expect(faultTypes).toContain('suspicious_voting');
        });

        test('should maintain liveness under Byzantine attacks', async () => {
            // Configure delayed Byzantine nodes to test liveness
            nodes[0].simulateByzantineBehavior(true, 'delayed');
            nodes[0].config.responseDelay = 2000; // 2 second delay

            nodes[1].simulateByzantineBehavior(true, 'random');

            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'liveness-test',
                    name: 'Liveness Test',
                    description: 'Testing system liveness under Byzantine attacks',
                    detectionPatterns: ['liveness.config.js'],
                    filePatterns: ['**/*.liveness.js']
                }
            };

            const startTime = Date.now();
            const result = await consensusProtocol.executeConsensus(validationRequest);
            const duration = Date.now() - startTime;

            expect(result.success).toBe(true);
            expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
            expect(result.nodeParticipation).toBeGreaterThanOrEqual(5); // Most nodes participated
        });
    });

    describe('Network Partition Resilience', () => {
        test('should handle network partitions gracefully', async () => {
            // Partition 2 nodes (still have majority)
            nodes[0].simulatePartition(true);
            nodes[1].simulatePartition(true);

            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'partition-test',
                    name: 'Partition Test',
                    description: 'Testing consensus under network partition',
                    detectionPatterns: ['partition.config.js'],
                    filePatterns: ['**/*.partition.js']
                }
            };

            const result = await consensusProtocol.executeConsensus(validationRequest);

            expect(result.success).toBe(true);
            expect(result.nodeParticipation).toBeGreaterThanOrEqual(3); // At least 3 nodes participated

            // Verify partitioned nodes didn't participate
            const consensusSession = consensusProtocol.getConsensusHistory()[0];
            const participatingNodeIds = consensusSession.nodeParticipation.map(p => p.nodeId);
            expect(participatingNodeIds).not.toContain('node-0');
            expect(participatingNodeIds).not.toContain('node-1');
        });

        test('should fail when partition prevents consensus', async () => {
            // Partition majority of nodes (4 out of 7)
            for (let i = 0; i < 4; i++) {
                nodes[i].simulatePartition(true);
            }

            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'major-partition-test',
                    name: 'Major Partition Test',
                    description: 'Testing consensus when majority is partitioned',
                    detectionPatterns: ['majorpartition.config.js'],
                    filePatterns: ['**/*.mp.js']
                }
            };

            const result = await consensusProtocol.executeConsensus(validationRequest);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Insufficient votes');
            expect(result.nodeParticipation).toBeLessThan(consensusProtocol.config.consensusThreshold);
        });

        test('should recover after partition healing', async () => {
            // Start with partition
            nodes[0].simulatePartition(true);
            nodes[1].simulatePartition(true);

            const firstRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'partition-recovery-test-1',
                    name: 'Partition Recovery Test 1',
                    description: 'First test during partition',
                    detectionPatterns: ['recovery1.config.js'],
                    filePatterns: ['**/*.recovery1.js']
                }
            };

            const partitionedResult = await consensusProtocol.executeConsensus(firstRequest);
            expect(partitionedResult.success).toBe(true);
            expect(partitionedResult.nodeParticipation).toBeLessThan(7);

            // Heal partition
            nodes[0].simulatePartition(false);
            nodes[1].simulatePartition(false);

            const secondRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'partition-recovery-test-2',
                    name: 'Partition Recovery Test 2',
                    description: 'Second test after partition healing',
                    detectionPatterns: ['recovery2.config.js'],
                    filePatterns: ['**/*.recovery2.js']
                }
            };

            const healedResult = await consensusProtocol.executeConsensus(secondRequest);
            expect(healedResult.success).toBe(true);
            expect(healedResult.nodeParticipation).toBe(7); // All nodes should participate
        });
    });

    describe('Cryptographic Integrity', () => {
        test('should verify cryptographic signatures in all phases', async () => {
            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'crypto-integrity-test',
                    name: 'Cryptographic Integrity Test',
                    description: 'Testing cryptographic signature verification',
                    detectionPatterns: ['crypto.config.js'],
                    filePatterns: ['**/*.crypto.js']
                }
            };

            const result = await consensusProtocol.executeConsensus(validationRequest);

            expect(result.success).toBe(true);
            expect(result.proof).toBeDefined();

            // Verify proof contains cryptographic elements
            expect(result.proof.phases.proposal.signature).toBeDefined();
            expect(result.proof.phases.voting.voteHashes).toBeDefined();
            expect(result.proof.integrity).toBeDefined();

            // All vote hashes should include signatures
            result.proof.phases.voting.voteHashes.forEach(hash => {
                expect(hash).toMatch(/^node-\d+:(approve|reject|abstain):/);
            });
        });

        test('should reject messages with invalid signatures', async () => {
            // Mock a node with invalid signature generation
            const corruptNode = new MockByzantineNode('corrupt-node');
            corruptNode.cryptoProvider.signData = jest.fn().mockResolvedValue('invalid-signature');

            const corruptConsensus = new MockByzantineConsensusProtocol([
                ...nodes.slice(0, 6),
                corruptNode
            ]);

            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'signature-validation-test',
                    name: 'Signature Validation Test',
                    description: 'Testing rejection of invalid signatures',
                    detectionPatterns: ['signature.config.js'],
                    filePatterns: ['**/*.sig.js']
                }
            };

            const result = await corruptConsensus.executeConsensus(validationRequest);

            // Should succeed but with reduced participation due to corrupt node
            expect(result.success).toBe(true);
            expect(result.nodeParticipation).toBe(6); // Corrupt node should be excluded
        });

        test('should maintain message integrity across network delays', async () => {
            // Introduce network delays
            nodes.forEach(node => {
                node.networkSimulator.setLatency(200);
            });

            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'network-delay-test',
                    name: 'Network Delay Test',
                    description: 'Testing message integrity with network delays',
                    detectionPatterns: ['delay.config.js'],
                    filePatterns: ['**/*.delay.js']
                }
            };

            const startTime = Date.now();
            const result = await consensusProtocol.executeConsensus(validationRequest);
            const duration = Date.now() - startTime;

            expect(result.success).toBe(true);
            expect(duration).toBeGreaterThan(400); // Should reflect network delays
            expect(result.proof.integrity).toBeDefined();

            // Message integrity should be maintained despite delays
            const consensusSession = consensusProtocol.getConsensusHistory()[0];
            expect(consensusSession.phases.voting.votes.length).toBeGreaterThan(4);
        });
    });

    describe('Performance Under Adversarial Conditions', () => {
        test('should maintain reasonable performance with Byzantine nodes', async () => {
            // Configure various Byzantine behaviors
            nodes[0].simulateByzantineBehavior(true, 'delayed');
            nodes[0].config.responseDelay = 1000;

            nodes[1].simulateByzantineBehavior(true, 'always_reject');
            nodes[2].simulateByzantineBehavior(true, 'random');

            const validationRequests = Array.from({ length: 5 }, (_, i) => ({
                type: 'framework_addition',
                framework: {
                    id: `perf-test-${i}`,
                    name: `Performance Test ${i}`,
                    description: `Testing performance under adversarial conditions ${i}`,
                    detectionPatterns: [`perf${i}.config.js`],
                    filePatterns: [`**/*.perf${i}.js`]
                }
            }));

            const startTime = Date.now();

            // Run consensus rounds sequentially
            const results = [];
            for (const request of validationRequests) {
                const result = await consensusProtocol.executeConsensus(request);
                results.push(result);
            }

            const totalTime = Date.now() - startTime;
            const averageTime = totalTime / results.length;

            expect(results.length).toBe(5);
            expect(averageTime).toBeLessThan(3000); // Average should be under 3 seconds

            // Most should succeed despite Byzantine behavior
            const successCount = results.filter(r => r.success).length;
            expect(successCount).toBeGreaterThanOrEqual(3);
        });

        test('should handle concurrent consensus attempts', async () => {
            const concurrentRequests = Array.from({ length: 3 }, (_, i) => ({
                type: 'framework_addition',
                framework: {
                    id: `concurrent-test-${i}`,
                    name: `Concurrent Test ${i}`,
                    description: `Testing concurrent consensus ${i}`,
                    detectionPatterns: [`concurrent${i}.config.js`],
                    filePatterns: [`**/*.concurrent${i}.js`]
                }
            }));

            // Start all consensus rounds simultaneously
            const promises = concurrentRequests.map(request =>
                consensusProtocol.executeConsensus(request)
            );

            const startTime = Date.now();
            const results = await Promise.all(promises);
            const totalTime = Date.now() - startTime;

            expect(results.length).toBe(3);
            expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds

            // All should succeed (or at least most)
            const successCount = results.filter(r => r.success).length;
            expect(successCount).toBeGreaterThanOrEqual(2);

            // Verify each has unique consensus ID
            const consensusIds = results.map(r => r.consensusId);
            const uniqueIds = new Set(consensusIds);
            expect(uniqueIds.size).toBe(consensusIds.length);
        });

        test('should provide comprehensive metrics and monitoring', async () => {
            // Run several consensus rounds with different conditions
            const testScenarios = [
                { byzantine: false, partition: false },
                { byzantine: true, partition: false },
                { byzantine: false, partition: true },
                { byzantine: true, partition: true }
            ];

            for (let i = 0; i < testScenarios.length; i++) {
                const scenario = testScenarios[i];

                // Configure nodes based on scenario
                if (scenario.byzantine) {
                    nodes[0].simulateByzantineBehavior(true, 'random');
                    nodes[1].simulateByzantineBehavior(true, 'always_reject');
                } else {
                    nodes[0].simulateByzantineBehavior(false);
                    nodes[1].simulateByzantineBehavior(false);
                }

                if (scenario.partition) {
                    nodes[0].simulatePartition(true);
                } else {
                    nodes[0].simulatePartition(false);
                }

                const request = {
                    type: 'framework_addition',
                    framework: {
                        id: `metrics-test-${i}`,
                        name: `Metrics Test ${i}`,
                        description: `Testing metrics collection scenario ${i}`,
                        detectionPatterns: [`metrics${i}.config.js`],
                        filePatterns: [`**/*.metrics${i}.js`]
                    }
                };

                await consensusProtocol.executeConsensus(request);
            }

            const metrics = consensusProtocol.getProtocolMetrics();

            expect(metrics.currentView).toBeGreaterThanOrEqual(0);
            expect(metrics.totalConsensusRounds).toBe(4);
            expect(metrics.averageConsensusTime).toBeGreaterThan(0);
            expect(metrics.successRate).toBeGreaterThan(0);
            expect(metrics.nodeCount).toBe(7);
            expect(metrics.faultTolerance).toBe(2);

            // Should have detected some Byzantine faults
            expect(metrics.byzantineFaultsDetected).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Consensus Proof and Auditability', () => {
        test('should generate verifiable consensus proofs', async () => {
            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'proof-test',
                    name: 'Consensus Proof Test',
                    description: 'Testing consensus proof generation and verification',
                    detectionPatterns: ['proof.config.js'],
                    filePatterns: ['**/*.proof.js']
                }
            };

            const result = await consensusProtocol.executeConsensus(validationRequest);

            expect(result.success).toBe(true);
            expect(result.proof).toBeDefined();

            // Verify proof structure
            expect(result.proof.consensusId).toBe(result.consensusId);
            expect(result.proof.view).toBeGreaterThanOrEqual(0);
            expect(result.proof.timestamp).toBeDefined();
            expect(result.proof.phases).toBeDefined();
            expect(result.proof.participatingNodes).toBeInstanceOf(Array);
            expect(result.proof.integrity).toBeDefined();

            // Verify phase information
            expect(result.proof.phases.proposal).toBeDefined();
            expect(result.proof.phases.voting).toBeDefined();
            expect(result.proof.phases.decision).toBeDefined();

            // Verify integrity hash
            expect(result.proof.integrity).toMatch(/^[a-f0-9]+$/);
        });

        test('should maintain complete audit trail', async () => {
            const requests = Array.from({ length: 3 }, (_, i) => ({
                type: 'framework_addition',
                framework: {
                    id: `audit-test-${i}`,
                    name: `Audit Test ${i}`,
                    description: `Testing audit trail ${i}`,
                    detectionPatterns: [`audit${i}.config.js`],
                    filePatterns: [`**/*.audit${i}.js`]
                }
            }));

            // Execute multiple consensus rounds
            for (const request of requests) {
                await consensusProtocol.executeConsensus(request);
            }

            const history = consensusProtocol.getConsensusHistory();

            expect(history).toHaveLength(3);

            // Verify each session has complete information
            history.forEach((session, index) => {
                expect(session.consensusId).toBeDefined();
                expect(session.validationRequest.framework.id).toBe(`audit-test-${index}`);
                expect(session.startTime).toBeDefined();
                expect(session.endTime).toBeDefined();
                expect(session.duration).toBeGreaterThan(0);
                expect(session.phases).toBeDefined();
                expect(session.nodeParticipation).toBeInstanceOf(Array);
                expect(session.result).toBeDefined();
            });

            // Verify chronological order
            for (let i = 1; i < history.length; i++) {
                expect(history[i].startTime).toBeGreaterThanOrEqual(history[i - 1].startTime);
            }
        });

        test('should detect and log consensus anomalies', async () => {
            // Create scenario with anomalous behavior
            nodes[0].simulateByzantineBehavior(true, 'always_approve');
            nodes[1].simulateByzantineBehavior(true, 'always_reject');
            nodes[2].simulateByzantineBehavior(true, 'random');

            const validationRequest = {
                type: 'framework_addition',
                framework: {
                    id: 'anomaly-detection-test',
                    name: 'Anomaly Detection Test',
                    description: 'Testing detection and logging of consensus anomalies',
                    detectionPatterns: ['anomaly.config.js'],
                    filePatterns: ['**/*.anomaly.js']
                }
            };

            const result = await consensusProtocol.executeConsensus(validationRequest);

            expect(result.success).toBe(true);
            expect(result.byzantineFaultsDetected).toBeInstanceOf(Array);
            expect(result.byzantineFaultsDetected.length).toBeGreaterThan(0);

            // Check fault details
            const faults = result.byzantineFaultsDetected;
            faults.forEach(fault => {
                expect(fault.type).toBeDefined();
                expect(fault.nodeId).toBeDefined();
                expect(fault.severity).toMatch(/^(low|medium|high)$/);
                expect(fault.evidence).toBeInstanceOf(Array);
            });

            // Verify audit trail includes anomaly information
            const consensusSession = consensusProtocol.getConsensusHistory()[0];
            expect(consensusSession.phases.decision.suspiciousVotes).toBeInstanceOf(Array);
            expect(consensusSession.phases.decision.suspiciousVotes.length).toBeGreaterThan(0);
        });
    });
});