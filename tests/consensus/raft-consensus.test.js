import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
/**
 * Comprehensive Test Suite for Raft Consensus Manager
 * Tests leader election, log replication, resource validation, and fault tolerance
 */

import RaftConsensusManager from '../../src/consensus/raft-consensus.js';

describe('RaftConsensusManager', () => {
    let cluster;
    let leader;

    beforeEach(() => {
        // Create a 5-node cluster for comprehensive testing
        cluster = [];
        const nodeIds = ['node-1', 'node-2', 'node-3', 'node-4', 'node-5'];

        for (const nodeId of nodeIds) {
            const node = new RaftConsensusManager(nodeId, nodeIds, {
                electionTimeout: 100 + Math.random() * 50,
                heartbeatInterval: 25
            });
            cluster.push(node);
        }

        leader = null;
    });

    afterEach(() => {
        cluster.forEach(node => node.destroy());
        cluster = [];
    });

    describe('Leader Election', () => {
        test('should elect a leader within reasonable time', async () => {
            const leaderElectedPromise = new Promise(resolve => {
                cluster.forEach(node => {
                    node.on('leaderElected', (event) => {
                        leader = node;
                        resolve(event);
                    });
                });
            });

            const election = await leaderElectedPromise;

            expect(election.nodeId).toBeDefined();
            expect(election.term).toBeGreaterThan(0);
            expect(leader).toBeTruthy();
            expect(leader.getState().isLeader).toBe(true);
        }, 10000);

        test('should handle leader failure and re-election', async () => {
            // First election
            await new Promise(resolve => {
                cluster[0].on('leaderElected', () => {
                    leader = cluster[0];
                    resolve();
                });
            });

            // Simulate leader failure
            leader.destroy();
            cluster.shift();

            // Wait for re-election
            const newLeaderPromise = new Promise(resolve => {
                cluster.forEach(node => {
                    node.on('leaderElected', (event) => {
                        if (event.nodeId !== leader.nodeId) {
                            resolve(event);
                        }
                    });
                });
            });

            const newElection = await newLeaderPromise;
            expect(newElection.nodeId).not.toBe(leader.nodeId);
        }, 15000);

        test('should maintain single leader per term', async () => {
            const leaders = [];

            await new Promise(resolve => {
                let electionCount = 0;
                cluster.forEach(node => {
                    node.on('leaderElected', (event) => {
                        leaders.push(event);
                        electionCount++;
                        if (electionCount === 1) {
                            setTimeout(resolve, 1000); // Wait for potential split-brain
                        }
                    });
                });
            });

            // Should have exactly one leader for the current term
            const currentTerm = Math.max(...leaders.map(l => l.term));
            const leadersInCurrentTerm = leaders.filter(l => l.term === currentTerm);
            expect(leadersInCurrentTerm).toHaveLength(1);
        });
    });

    describe('Resource Validation', () => {
        beforeEach(async () => {
            // Ensure we have a leader
            await new Promise(resolve => {
                cluster[0].on('leaderElected', () => {
                    leader = cluster[0];
                    resolve();
                });
            });
        });

        test('should validate swarm shutdown and relaunch functionality', async () => {
            const claims = {
                swarmRecovery: true,
                leaderElection: true,
                faultTolerance: true
            };

            const validation = await leader.validateResourceClaims(claims);

            expect(validation.validationId).toBeDefined();
            expect(validation.results.swarmFunctionality).toBeDefined();
            expect(validation.results.swarmFunctionality.shutdownTime).toBeGreaterThan(0);
            expect(validation.results.swarmFunctionality.relaunchTime).toBeGreaterThan(0);
            expect(validation.results.swarmFunctionality.leaderRecovery).toBe(true);
        });

        test('should validate MCP integration functions', async () => {
            const claims = {
                mcpIntegration: true,
                swarmOperations: true,
                agentCoordination: true
            };

            const validation = await leader.validateResourceClaims(claims);

            expect(validation.results.mcpIntegration).toBeDefined();
            expect(validation.results.mcpIntegration.results).toHaveLength(4);
            expect(validation.results.mcpIntegration.successRate).toBeGreaterThan(0);

            const testTypes = validation.results.mcpIntegration.results.map(r => r.test);
            expect(testTypes).toContain('swarm');
            expect(testTypes).toContain('agent');
            expect(testTypes).toContain('memory');
            expect(testTypes).toContain('neural');
        });

        test('should verify performance improvement claims', async () => {
            const claims = {
                performanceImprovements: {
                    solveBenchRate: 84.8,
                    tokenReduction: 32.3,
                    speedImprovement: 3.6
                }
            };

            const validation = await leader.validateResourceClaims(claims);

            expect(validation.results.performanceMetrics).toBeDefined();
            expect(validation.results.performanceMetrics.metrics).toBeDefined();
            expect(validation.results.performanceMetrics.verificationRate).toBeGreaterThan(0);

            const metrics = validation.results.performanceMetrics.metrics;
            expect(metrics.solveBenchRate).toBeDefined();
            expect(metrics.tokenReduction).toBeDefined();
            expect(metrics.speedImprovement).toBeDefined();
            expect(metrics.neuralModels).toBeDefined();
        });

        test('should make consensus decisions based on validation results', async () => {
            const claims = {
                comprehensiveValidation: true
            };

            const validation = await leader.validateResourceClaims(claims);

            expect(validation.results.consensusDecision).toBeDefined();
            expect(validation.results.consensusDecision.approved).toBeDefined();
            expect(validation.results.consensusDecision.score).toBeGreaterThanOrEqual(0);
            expect(validation.results.consensusDecision.recommendation).toMatch(
                /full_approval|conditional_approval|rejection/
            );
        });

        test('should reject validation from non-leader nodes', async () => {
            const follower = cluster.find(node => node.getState().state === 'follower');

            if (follower) {
                await expect(follower.validateResourceClaims({}))
                    .rejects.toThrow('Only leader can validate resource claims');
            }
        });
    });

    describe('Log Replication', () => {
        beforeEach(async () => {
            await new Promise(resolve => {
                cluster[0].on('leaderElected', () => {
                    leader = cluster[0];
                    resolve();
                });
            });
        });

        test('should replicate validation results across cluster', async () => {
            const claims = { testReplication: true };

            const entryCommittedPromise = new Promise(resolve => {
                leader.on('entryCommitted', resolve);
            });

            const validation = await leader.validateResourceClaims(claims);
            const committedEntry = await entryCommittedPromise;

            expect(committedEntry).toBeDefined();
            expect(committedEntry.type).toBe('resource_validation');
            expect(committedEntry.id).toBe(validation.validationId);
            expect(committedEntry.claims).toEqual(claims);
        });

        test('should maintain log consistency across nodes', async () => {
            // Perform multiple validations
            const validations = [];
            for (let i = 0; i < 3; i++) {
                const validation = await leader.validateResourceClaims({ test: i });
                validations.push(validation);
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // Check log consistency
            const leaderState = leader.getState();
            expect(leaderState.logLength).toBeGreaterThanOrEqual(3);
            expect(leaderState.commitIndex).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Fault Tolerance', () => {
        test('should handle network partitions gracefully', async () => {
            // Wait for initial leader election
            await new Promise(resolve => {
                cluster[0].on('leaderElected', () => {
                    leader = cluster[0];
                    resolve();
                });
            });

            // Simulate network partition by removing nodes
            const partitionedNodes = cluster.splice(2); // Remove last 3 nodes

            // Leader should continue operating with majority
            const state = leader.getState();
            expect(state.isLeader).toBe(true);

            // Should still be able to validate with remaining nodes
            const validation = await leader.validateResourceClaims({ partition: true });
            expect(validation.validationId).toBeDefined();
        });

        test('should recover from temporary failures', async () => {
            await new Promise(resolve => {
                cluster[0].on('leaderElected', () => {
                    leader = cluster[0];
                    resolve();
                });
            });

            // Simulate temporary shutdown and restart
            const shutdownPromise = new Promise(resolve => {
                leader.on('swarmShutdown', resolve);
            });

            const relaunchPromise = new Promise(resolve => {
                leader.on('swarmRelaunch', resolve);
            });

            // Trigger validation that includes shutdown/relaunch
            await leader.validateResourceClaims({ recovery: true });

            // Verify shutdown and relaunch events occurred
            await expect(shutdownPromise).resolves.toBeDefined();
            await expect(relaunchPromise).resolves.toBeDefined();
        });
    });

    describe('Performance and Metrics', () => {
        beforeEach(async () => {
            await new Promise(resolve => {
                cluster[0].on('leaderElected', () => {
                    leader = cluster[0];
                    resolve();
                });
            });
        });

        test('should track consensus metrics accurately', async () => {
            const initialMetrics = leader.getState().metrics;

            await leader.validateResourceClaims({ metrics: true });

            const finalMetrics = leader.getState().metrics;

            expect(finalMetrics.elections).toBeGreaterThanOrEqual(initialMetrics.elections);
            expect(finalMetrics.appendEntries).toBeGreaterThan(initialMetrics.appendEntries);
            expect(finalMetrics.validationResults.size).toBeGreaterThan(initialMetrics.validationResults.size);
            expect(finalMetrics.consensusDecisions.length).toBeGreaterThan(initialMetrics.consensusDecisions.length);
        });

        test('should measure validation performance', async () => {
            const start = Date.now();
            const validation = await leader.validateResourceClaims({ performance: true });
            const duration = Date.now() - start;

            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
            expect(validation.results.performanceMetrics).toBeDefined();
            expect(validation.results.swarmFunctionality.totalRecoveryTime).toBeLessThan(1000);
        });
    });

    describe('Cluster Management', () => {
        test('should handle dynamic node addition', () => {
            const newNode = new RaftConsensusManager('node-6', ['node-1', 'node-2', 'node-3']);

            // Add to existing cluster
            cluster.forEach(node => node.addNode('node-6'));
            newNode.clusterNodes = new Set(['node-1', 'node-2', 'node-3', 'node-4', 'node-5', 'node-6']);

            expect(cluster[0].clusterNodes.has('node-6')).toBe(true);

            newNode.destroy();
        });

        test('should handle node removal', () => {
            cluster[0].removeNode('node-5');

            expect(cluster[0].clusterNodes.has('node-5')).toBe(false);
            expect(cluster[0].nextIndex.has('node-5')).toBe(false);
            expect(cluster[0].matchIndex.has('node-5')).toBe(false);
        });
    });
});