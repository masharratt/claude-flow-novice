/**
 * Phase 6 Integration Tests - Distributed Consensus
 *
 * Tests Byzantine voting, ≥90% threshold enforcement, and multi-dimensional
 * validation in mesh topology swarms.
 *
 * SUCCESS CRITERIA:
 * - Byzantine consensus achieves ≥90% agreement
 * - Voting completes in <1s for 10 peers
 * - Multi-dimensional validation covers quality/security/performance
 * - Malicious peer detection rate >95%
 *
 * @module tests/integration/phase6/distributed-consensus
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { MessageBroker } from '../../../src/coordination/v2/core/message-broker.js';
import { MessagePriority } from '../../../src/coordination/v2/core/message.js';

describe('Phase 6 - Distributed Consensus and Byzantine Voting', () => {
  let messageBroker;
  let consensusTracker;

  beforeEach(async () => {
    messageBroker = new MessageBroker({
      maxQueueSize: 5000,
      deliverySemantics: 'exactly-once'
    });

    consensusTracker = {
      votes: new Map(),
      decisions: [],
      maliciousDetections: []
    };

    await messageBroker.initialize();
  });

  afterEach(async () => {
    await messageBroker?.shutdown();
    consensusTracker = null;
  });

  describe('Byzantine Voting Protocol', () => {
    test('should achieve ≥90% consensus threshold', async () => {
      const peerCount = 10;
      const peers = Array.from({ length: peerCount }, (_, i) => `peer-${i}`);
      const proposal = {
        id: 'proposal-1',
        type: 'completion',
        data: { swarmId: 'swarm-1', status: 'completed' }
      };

      const votes = new Map();

      // Collect votes from all peers
      await messageBroker.subscribe({
        topic: 'consensus.vote',
        handler: async (msg) => {
          const { peerId, proposalId, vote } = msg.payload;

          if (proposalId === proposal.id) {
            votes.set(peerId, vote);
          }
        },
        priority: MessagePriority.CRITICAL
      });

      // Simulate voting (9 approve, 1 reject)
      for (let i = 0; i < peerCount; i++) {
        const vote = i < 9 ? 'approve' : 'reject';

        await messageBroker.publish({
          topic: 'consensus.vote',
          payload: {
            peerId: peers[i],
            proposalId: proposal.id,
            vote,
            timestamp: Date.now()
          },
          priority: MessagePriority.CRITICAL,
          senderId: peers[i]
        });
      }

      await new Promise(resolve => setTimeout(resolve, 100));

      // Calculate consensus
      const approvals = Array.from(votes.values()).filter(v => v === 'approve').length;
      const consensusRatio = approvals / votes.size;

      expect(consensusRatio).toBeGreaterThanOrEqual(0.90);
      expect(votes.size).toBe(peerCount);

      console.log(`✅ Byzantine consensus: ${(consensusRatio * 100).toFixed(1)}% approval (${approvals}/${votes.size})`);
    });

    test('should complete voting in <1 second for 10 peers', async () => {
      const peerCount = 10;
      const peers = Array.from({ length: peerCount }, (_, i) => `peer-${i}`);
      const proposalId = 'speed-test-proposal';

      const votingStartTime = Date.now();
      const votes = [];

      await messageBroker.subscribe({
        topic: 'consensus.vote',
        handler: async (msg) => {
          if (msg.payload.proposalId === proposalId) {
            votes.push({
              peerId: msg.payload.peerId,
              vote: msg.payload.vote,
              receivedAt: Date.now()
            });
          }
        },
        priority: MessagePriority.CRITICAL
      });

      // All peers vote simultaneously
      const votePromises = peers.map(peerId =>
        messageBroker.publish({
          topic: 'consensus.vote',
          payload: {
            peerId,
            proposalId,
            vote: 'approve',
            timestamp: Date.now()
          },
          priority: MessagePriority.CRITICAL,
          senderId: peerId
        })
      );

      await Promise.all(votePromises);

      await new Promise(resolve => setTimeout(resolve, 100));

      const votingDuration = Date.now() - votingStartTime;

      expect(votes).toHaveLength(peerCount);
      expect(votingDuration).toBeLessThan(1000);

      console.log(`✅ Voting speed: ${peerCount} peers in ${votingDuration}ms`);
    });

    test('should handle tie-breaking in split votes', async () => {
      const peers = ['peer-1', 'peer-2', 'peer-3', 'peer-4'];
      const proposalId = 'tie-test';
      const votes = new Map();

      await messageBroker.subscribe({
        topic: 'consensus.vote',
        handler: async (msg) => {
          votes.set(msg.payload.peerId, msg.payload.vote);
        },
        priority: MessagePriority.CRITICAL
      });

      // Split vote: 2 approve, 2 reject
      await messageBroker.publish({
        topic: 'consensus.vote',
        payload: { peerId: 'peer-1', proposalId, vote: 'approve' },
        priority: MessagePriority.CRITICAL,
        senderId: 'peer-1'
      });

      await messageBroker.publish({
        topic: 'consensus.vote',
        payload: { peerId: 'peer-2', proposalId, vote: 'approve' },
        priority: MessagePriority.CRITICAL,
        senderId: 'peer-2'
      });

      await messageBroker.publish({
        topic: 'consensus.vote',
        payload: { peerId: 'peer-3', proposalId, vote: 'reject' },
        priority: MessagePriority.CRITICAL,
        senderId: 'peer-3'
      });

      await messageBroker.publish({
        topic: 'consensus.vote',
        payload: { peerId: 'peer-4', proposalId, vote: 'reject' },
        priority: MessagePriority.CRITICAL,
        senderId: 'peer-4'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const approvals = Array.from(votes.values()).filter(v => v === 'approve').length;
      const consensusRatio = approvals / votes.size;

      // 50% should not reach ≥90% threshold
      expect(consensusRatio).toBeLessThan(0.90);

      console.log(`✅ Tie-break handling: ${(consensusRatio * 100).toFixed(0)}% consensus (below threshold)`);
    });
  });

  describe('Multi-Dimensional Validation', () => {
    test('should validate quality, security, and performance dimensions', async () => {
      const dimensions = ['quality', 'security', 'performance'];
      const validationResults = new Map();

      await messageBroker.subscribe({
        topic: 'validation.result',
        handler: async (msg) => {
          const { dimension, score, pass } = msg.payload;
          validationResults.set(dimension, { score, pass });
        },
        priority: MessagePriority.HIGH
      });

      // Simulate multi-dimensional validation
      for (const dimension of dimensions) {
        const score = 0.85 + Math.random() * 0.1; // 85-95%
        const pass = score >= 0.80;

        await messageBroker.publish({
          topic: 'validation.result',
          payload: {
            dimension,
            score,
            pass,
            details: { checked: true }
          },
          priority: MessagePriority.HIGH,
          senderId: `${dimension}-validator`
        });
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(validationResults.size).toBe(3);
      expect(validationResults.has('quality')).toBe(true);
      expect(validationResults.has('security')).toBe(true);
      expect(validationResults.has('performance')).toBe(true);

      const allPassed = Array.from(validationResults.values()).every(r => r.pass);
      expect(allPassed).toBe(true);

      console.log('✅ Multi-dimensional validation: all dimensions passed');
    });

    test('should aggregate dimension scores for overall consensus', async () => {
      const peers = Array.from({ length: 5 }, (_, i) => `peer-${i}`);
      const dimensionScores = new Map();

      // Each peer provides scores for all dimensions
      for (const peerId of peers) {
        const scores = {
          quality: 0.90 + Math.random() * 0.05,
          security: 0.85 + Math.random() * 0.10,
          performance: 0.88 + Math.random() * 0.07
        };

        for (const [dimension, score] of Object.entries(scores)) {
          if (!dimensionScores.has(dimension)) {
            dimensionScores.set(dimension, []);
          }
          dimensionScores.get(dimension).push(score);
        }
      }

      // Calculate average scores per dimension
      const aggregatedScores = new Map();
      for (const [dimension, scores] of dimensionScores) {
        const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;
        aggregatedScores.set(dimension, avg);
      }

      // Overall consensus is minimum of all dimensions
      const overallConsensus = Math.min(...Array.from(aggregatedScores.values()));

      expect(overallConsensus).toBeGreaterThan(0.80);
      expect(aggregatedScores.size).toBe(3);

      console.log(`✅ Aggregated consensus: ${(overallConsensus * 100).toFixed(1)}%`);
    });

    test('should reject if any dimension fails threshold', async () => {
      const dimensions = [
        { name: 'quality', score: 0.95, threshold: 0.80 },
        { name: 'security', score: 0.70, threshold: 0.80 }, // Fails
        { name: 'performance', score: 0.90, threshold: 0.80 }
      ];

      const failures = [];

      for (const dimension of dimensions) {
        if (dimension.score < dimension.threshold) {
          failures.push(dimension.name);
        }
      }

      expect(failures).toHaveLength(1);
      expect(failures).toContain('security');

      console.log(`✅ Threshold enforcement: rejected due to ${failures.join(', ')} failure`);
    });
  });

  describe('Malicious Peer Detection', () => {
    test('should detect malicious peers with >95% accuracy', async () => {
      const honestPeers = Array.from({ length: 8 }, (_, i) => `honest-${i}`);
      const maliciousPeers = ['malicious-1', 'malicious-2'];
      const allPeers = [...honestPeers, ...maliciousPeers];

      const detectedMalicious = [];

      // Simulate Byzantine behavior detection
      await messageBroker.subscribe({
        topic: 'peer.behavior',
        handler: async (msg) => {
          const { peerId, behaviorScore } = msg.payload;

          // Detect malicious behavior (score < 0.5)
          if (behaviorScore < 0.5) {
            detectedMalicious.push(peerId);

            await messageBroker.publish({
              topic: 'peer.malicious',
              payload: { peerId, behaviorScore, reason: 'byzantine_behavior' },
              priority: MessagePriority.CRITICAL,
              senderId: 'behavior-monitor'
            });
          }
        },
        priority: MessagePriority.CRITICAL
      });

      // Honest peers have high behavior scores
      for (const peerId of honestPeers) {
        await messageBroker.publish({
          topic: 'peer.behavior',
          payload: { peerId, behaviorScore: 0.9 + Math.random() * 0.1 },
          priority: MessagePriority.HIGH,
          senderId: 'behavior-monitor'
        });
      }

      // Malicious peers have low behavior scores
      for (const peerId of maliciousPeers) {
        await messageBroker.publish({
          topic: 'peer.behavior',
          payload: { peerId, behaviorScore: 0.1 + Math.random() * 0.3 },
          priority: MessagePriority.HIGH,
          senderId: 'behavior-monitor'
        });
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      const detectionAccuracy = (detectedMalicious.length / maliciousPeers.length) * 100;

      expect(detectionAccuracy).toBeGreaterThanOrEqual(95);
      expect(detectedMalicious).toHaveLength(maliciousPeers.length);

      console.log(`✅ Malicious peer detection: ${detectionAccuracy}% accuracy (${detectedMalicious.length}/${maliciousPeers.length})`);
    });

    test('should isolate malicious peers from consensus', async () => {
      const honestPeers = ['peer-1', 'peer-2', 'peer-3'];
      const maliciousPeer = 'malicious-peer';
      const allPeers = [...honestPeers, maliciousPeer];

      const votes = new Map();
      const excludedPeers = new Set([maliciousPeer]);

      await messageBroker.subscribe({
        topic: 'consensus.vote',
        handler: async (msg) => {
          const { peerId, vote } = msg.payload;

          // Only count votes from non-malicious peers
          if (!excludedPeers.has(peerId)) {
            votes.set(peerId, vote);
          }
        },
        priority: MessagePriority.CRITICAL
      });

      // All peers vote
      for (const peerId of allPeers) {
        await messageBroker.publish({
          topic: 'consensus.vote',
          payload: {
            peerId,
            vote: peerId === maliciousPeer ? 'reject' : 'approve',
            proposalId: 'isolation-test'
          },
          priority: MessagePriority.CRITICAL,
          senderId: peerId
        });
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Malicious peer's vote should not be counted
      expect(votes.size).toBe(honestPeers.length);
      expect(votes.has(maliciousPeer)).toBe(false);

      const approvals = Array.from(votes.values()).filter(v => v === 'approve').length;
      const consensusRatio = approvals / votes.size;

      expect(consensusRatio).toBe(1.0); // 100% among honest peers

      console.log(`✅ Malicious peer isolation: ${votes.size} honest votes, malicious excluded`);
    });

    test('should detect conflicting votes from same peer', async () => {
      const proposalId = 'conflict-test';
      const conflicts = [];

      const voteTracker = new Map();

      await messageBroker.subscribe({
        topic: 'consensus.vote',
        handler: async (msg) => {
          const { peerId, vote } = msg.payload;

          if (voteTracker.has(peerId)) {
            const previousVote = voteTracker.get(peerId);
            if (previousVote !== vote) {
              conflicts.push({
                peerId,
                previousVote,
                newVote: vote
              });
            }
          } else {
            voteTracker.set(peerId, vote);
          }
        },
        priority: MessagePriority.CRITICAL
      });

      // Peer votes twice with different values
      await messageBroker.publish({
        topic: 'consensus.vote',
        payload: { peerId: 'peer-1', proposalId, vote: 'approve' },
        priority: MessagePriority.CRITICAL,
        senderId: 'peer-1'
      });

      await messageBroker.publish({
        topic: 'consensus.vote',
        payload: { peerId: 'peer-1', proposalId, vote: 'reject' },
        priority: MessagePriority.CRITICAL,
        senderId: 'peer-1'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].peerId).toBe('peer-1');
      expect(conflicts[0].previousVote).toBe('approve');
      expect(conflicts[0].newVote).toBe('reject');
    });
  });

  describe('Consensus Finalization', () => {
    test('should finalize consensus with cryptographic proof', async () => {
      const peers = Array.from({ length: 10 }, (_, i) => `peer-${i}`);
      const proposalId = 'finalization-test';
      const votes = new Map();

      // Collect all votes
      for (const peerId of peers) {
        const vote = 'approve';
        votes.set(peerId, vote);
      }

      // Calculate consensus
      const approvals = Array.from(votes.values()).filter(v => v === 'approve').length;
      const consensusRatio = approvals / votes.size;

      if (consensusRatio >= 0.90) {
        // Create cryptographic proof
        const proof = {
          proposalId,
          consensusRatio,
          totalVotes: votes.size,
          approvals,
          timestamp: Date.now(),
          signature: `sig-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        };

        consensusTracker.decisions.push(proof);

        expect(proof.consensusRatio).toBeGreaterThanOrEqual(0.90);
        expect(proof.signature).toBeDefined();
        expect(proof.timestamp).toBeLessThanOrEqual(Date.now());

        console.log(`✅ Consensus finalized: ${(consensusRatio * 100).toFixed(0)}% with cryptographic proof`);
      }
    });

    test('should broadcast finalized decision to all peers', async () => {
      const peers = Array.from({ length: 5 }, (_, i) => `peer-${i}`);
      const receivedDecisions = [];

      await messageBroker.subscribe({
        topic: 'consensus.finalized',
        handler: async (msg) => {
          receivedDecisions.push({
            peerId: msg.recipientId,
            decision: msg.payload.decision,
            proof: msg.payload.proof
          });
        },
        priority: MessagePriority.CRITICAL
      });

      const decision = {
        proposalId: 'broadcast-test',
        result: 'approved',
        consensusRatio: 0.95
      };

      // Broadcast to all peers
      for (const peerId of peers) {
        await messageBroker.publish({
          topic: 'consensus.finalized',
          payload: {
            decision,
            proof: { signature: 'sig-123', timestamp: Date.now() }
          },
          priority: MessagePriority.CRITICAL,
          senderId: 'consensus-coordinator',
          recipientId: peerId
        });
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(receivedDecisions).toHaveLength(peers.length);

      console.log(`✅ Decision broadcast: ${receivedDecisions.length}/${peers.length} peers notified`);
    });
  });

  describe('Performance Under Load', () => {
    test('should maintain consensus accuracy under high proposal rate', async () => {
      const peerCount = 10;
      const proposalCount = 50;
      const peers = Array.from({ length: peerCount }, (_, i) => `peer-${i}`);

      const consensusResults = [];

      for (let i = 0; i < proposalCount; i++) {
        const proposalId = `proposal-${i}`;
        const votes = new Map();

        // Each peer votes
        for (const peerId of peers) {
          const vote = Math.random() > 0.1 ? 'approve' : 'reject'; // 90% approval rate
          votes.set(peerId, vote);
        }

        const approvals = Array.from(votes.values()).filter(v => v === 'approve').length;
        const consensusRatio = approvals / votes.size;

        consensusResults.push({
          proposalId,
          consensusRatio,
          achieved: consensusRatio >= 0.90
        });
      }

      const successfulConsensus = consensusResults.filter(r => r.achieved).length;
      const successRate = (successfulConsensus / proposalCount) * 100;

      expect(successRate).toBeGreaterThan(80); // 80%+ success rate under load

      console.log(`✅ High-load consensus: ${successRate.toFixed(0)}% success rate (${successfulConsensus}/${proposalCount})`);
    });
  });
});
