/**
 * Gossip Protocol Coordinator
 * Implements epidemic dissemination and anti-entropy protocols for distributed verification
 */

const EventEmitter = require('events');
const crypto = require('crypto');

class GossipCoordinator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.nodeId = options.nodeId || crypto.randomUUID();
    this.peers = new Map(); // nodeId -> PeerInfo
    this.vectorClock = new Map(); // nodeId -> timestamp
    this.state = new Map(); // key -> { value, version, timestamp }
    this.rumor = new Map(); // messageId -> RumorInfo

    // Configuration
    this.config = {
      gossipInterval: options.gossipInterval || 1000,
      fanout: options.fanout || 3,
      rumorLifetime: options.rumorLifetime || 30000,
      antiEntropyInterval: options.antiEntropyInterval || 5000,
      maxRetransmissions: options.maxRetransmissions || 3,
      ...options.config,
    };

    this.isRunning = false;
    this.intervals = {
      gossip: null,
      antiEntropy: null,
      cleanup: null,
    };

    // Initialize vector clock for this node
    this.vectorClock.set(this.nodeId, 0);

    console.log(`🗣️  Gossip Coordinator initialized: ${this.nodeId}`);
  }

  /**
   * Start the gossip protocol
   */
  start() {
    if (this.isRunning) return;

    this.isRunning = true;

    // Start periodic gossip rounds
    this.intervals.gossip = setInterval(() => {
      this.performGossipRound();
    }, this.config.gossipInterval);

    // Start anti-entropy protocol
    this.intervals.antiEntropy = setInterval(() => {
      this.performAntiEntropy();
    }, this.config.antiEntropyInterval);

    // Start cleanup of old rumors
    this.intervals.cleanup = setInterval(() => {
      this.cleanupOldRumors();
    }, this.config.rumorLifetime / 2);

    this.emit('started', { nodeId: this.nodeId });
    console.log(`🚀 Gossip protocol started on node ${this.nodeId}`);
  }

  /**
   * Stop the gossip protocol
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    Object.values(this.intervals).forEach((interval) => {
      if (interval) clearInterval(interval);
    });

    this.intervals = { gossip: null, antiEntropy: null, cleanup: null };

    this.emit('stopped', { nodeId: this.nodeId });
    console.log(`🛑 Gossip protocol stopped on node ${this.nodeId}`);
  }

  /**
   * Add a peer to the gossip network
   */
  addPeer(nodeId, endpoint) {
    if (nodeId === this.nodeId) return;

    this.peers.set(nodeId, {
      nodeId,
      endpoint,
      lastSeen: Date.now(),
      failureCount: 0,
      isActive: true,
    });

    // Initialize vector clock entry for new peer
    if (!this.vectorClock.has(nodeId)) {
      this.vectorClock.set(nodeId, 0);
    }

    this.emit('peerAdded', { nodeId, endpoint });
    console.log(`👥 Added peer: ${nodeId} at ${endpoint}`);
  }

  /**
   * Remove a peer from the gossip network
   */
  removePeer(nodeId) {
    if (this.peers.delete(nodeId)) {
      this.emit('peerRemoved', { nodeId });
      console.log(`👤 Removed peer: ${nodeId}`);
    }
  }

  /**
   * Spread information via push gossip
   */
  async spreadVerificationTask(taskId, taskData, priority = 'medium') {
    const messageId = crypto.randomUUID();
    const timestamp = this.incrementVectorClock();

    const message = {
      id: messageId,
      type: 'verification_task',
      taskId,
      data: taskData,
      priority,
      sourceNode: this.nodeId,
      timestamp,
      vectorClock: new Map(this.vectorClock),
      ttl: this.config.maxRetransmissions,
    };

    // Store as rumor for tracking
    this.rumor.set(messageId, {
      message,
      created: Date.now(),
      spread: new Set([this.nodeId]),
      retransmissions: 0,
    });

    // Immediately push to selected peers
    await this.pushGossip(message);

    this.emit('taskSpread', { taskId, messageId, peers: this.peers.size });
    console.log(`📢 Spreading verification task ${taskId} to ${this.peers.size} peers`);

    return messageId;
  }

  /**
   * Perform a gossip round (push protocol)
   */
  async performGossipRound() {
    if (this.peers.size === 0) return;

    const activePeers = Array.from(this.peers.values()).filter((p) => p.isActive);
    if (activePeers.length === 0) return;

    // Select random peers for gossip (fanout)
    const selectedPeers = this.selectRandomPeers(activePeers, this.config.fanout);

    // Get recent rumors to spread
    const recentRumors = this.getRecentRumors();

    if (recentRumors.length > 0) {
      for (const peer of selectedPeers) {
        try {
          await this.sendGossipMessage(peer, {
            type: 'push_gossip',
            rumors: recentRumors,
            vectorClock: new Map(this.vectorClock),
            sourceNode: this.nodeId,
          });
        } catch (error) {
          this.handlePeerFailure(peer.nodeId, error);
        }
      }
    }
  }

  /**
   * Perform anti-entropy protocol for state synchronization
   */
  async performAntiEntropy() {
    if (this.peers.size === 0) return;

    const activePeers = Array.from(this.peers.values()).filter((p) => p.isActive);
    if (activePeers.length === 0) return;

    // Select a random peer for anti-entropy
    const peer = activePeers[Math.floor(Math.random() * activePeers.length)];

    try {
      await this.sendGossipMessage(peer, {
        type: 'anti_entropy_request',
        vectorClock: new Map(this.vectorClock),
        stateDigest: this.computeStateDigest(),
        sourceNode: this.nodeId,
      });
    } catch (error) {
      this.handlePeerFailure(peer.nodeId, error);
    }
  }

  /**
   * Handle incoming gossip messages
   */
  async handleGossipMessage(message, fromPeer) {
    switch (message.type) {
      case 'push_gossip':
        await this.handlePushGossip(message, fromPeer);
        break;
      case 'pull_request':
        await this.handlePullRequest(message, fromPeer);
        break;
      case 'anti_entropy_request':
        await this.handleAntiEntropyRequest(message, fromPeer);
        break;
      case 'anti_entropy_response':
        await this.handleAntiEntropyResponse(message, fromPeer);
        break;
      case 'verification_result':
        await this.handleVerificationResult(message, fromPeer);
        break;
      default:
        console.warn(`⚠️  Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle push gossip messages
   */
  async handlePushGossip(message, fromPeer) {
    const newRumors = [];

    for (const rumor of message.rumors) {
      if (!this.rumor.has(rumor.id) && this.shouldAcceptRumor(rumor)) {
        this.rumor.set(rumor.id, {
          message: rumor,
          created: Date.now(),
          spread: new Set([fromPeer]),
          retransmissions: 0,
        });

        newRumors.push(rumor);
        this.updateVectorClock(rumor.vectorClock);

        // Process verification task
        if (rumor.type === 'verification_task') {
          this.emit('verificationTaskReceived', {
            taskId: rumor.taskId,
            data: rumor.data,
            priority: rumor.priority,
            source: rumor.sourceNode,
          });
        }
      }
    }

    // Update peer information
    this.updatePeerInfo(fromPeer, message.vectorClock);

    // Probabilistically continue spreading new rumors
    if (newRumors.length > 0) {
      setTimeout(() => this.continueRumorSpread(newRumors), 100);
    }
  }

  /**
   * Continue spreading rumors with probability
   */
  async continueRumorSpread(rumors) {
    const spreadProbability = 0.7; // 70% chance to continue spreading

    for (const rumor of rumors) {
      if (Math.random() < spreadProbability && rumor.ttl > 0) {
        const updatedRumor = { ...rumor, ttl: rumor.ttl - 1 };
        await this.pushGossip(updatedRumor);
      }
    }
  }

  /**
   * Push gossip to selected peers
   */
  async pushGossip(message) {
    const activePeers = Array.from(this.peers.values()).filter((p) => p.isActive);
    const selectedPeers = this.selectRandomPeers(activePeers, this.config.fanout);

    for (const peer of selectedPeers) {
      try {
        await this.sendGossipMessage(peer, {
          type: 'push_gossip',
          rumors: [message],
          vectorClock: new Map(this.vectorClock),
          sourceNode: this.nodeId,
        });

        // Track spread
        const rumorInfo = this.rumor.get(message.id);
        if (rumorInfo) {
          rumorInfo.spread.add(peer.nodeId);
        }
      } catch (error) {
        this.handlePeerFailure(peer.nodeId, error);
      }
    }
  }

  /**
   * Propagate verification results
   */
  async propagateVerificationResult(taskId, result, status) {
    const messageId = crypto.randomUUID();
    const timestamp = this.incrementVectorClock();

    const message = {
      id: messageId,
      type: 'verification_result',
      taskId,
      result,
      status,
      sourceNode: this.nodeId,
      timestamp,
      vectorClock: new Map(this.vectorClock),
    };

    await this.pushGossip(message);

    this.emit('resultPropagated', { taskId, messageId, status });
    console.log(`✅ Propagated verification result for task ${taskId}: ${status}`);
  }

  /**
   * Vector clock operations
   */
  incrementVectorClock() {
    const current = this.vectorClock.get(this.nodeId) || 0;
    this.vectorClock.set(this.nodeId, current + 1);
    return current + 1;
  }

  updateVectorClock(otherClock) {
    for (const [nodeId, timestamp] of otherClock) {
      const current = this.vectorClock.get(nodeId) || 0;
      this.vectorClock.set(nodeId, Math.max(current, timestamp));
    }
    this.incrementVectorClock(); // Increment own clock
  }

  /**
   * Utility methods
   */
  selectRandomPeers(peers, count) {
    if (peers.length <= count) return peers;

    const shuffled = [...peers].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  getRecentRumors() {
    const now = Date.now();
    const recent = [];

    for (const [id, rumorInfo] of this.rumor) {
      if (now - rumorInfo.created < this.config.rumorLifetime) {
        recent.push(rumorInfo.message);
      }
    }

    return recent;
  }

  shouldAcceptRumor(rumor) {
    // Check if we've already seen this rumor
    if (this.rumor.has(rumor.id)) return false;

    // Check TTL
    if (rumor.ttl <= 0) return false;

    // Check vector clock causality
    return this.isCausallyConsistent(rumor.vectorClock);
  }

  isCausallyConsistent(otherClock) {
    // Simple causality check - in practice, this would be more sophisticated
    for (const [nodeId, timestamp] of otherClock) {
      const ourTimestamp = this.vectorClock.get(nodeId) || 0;
      if (timestamp > ourTimestamp + 1) {
        return false; // Too far ahead
      }
    }
    return true;
  }

  updatePeerInfo(nodeId, vectorClock) {
    const peer = this.peers.get(nodeId);
    if (peer) {
      peer.lastSeen = Date.now();
      peer.failureCount = 0;
      peer.isActive = true;
    }
  }

  handlePeerFailure(nodeId, error) {
    const peer = this.peers.get(nodeId);
    if (peer) {
      peer.failureCount++;
      if (peer.failureCount >= 3) {
        peer.isActive = false;
        this.emit('peerFailed', { nodeId, error: error.message });
        console.warn(`⚠️  Peer ${nodeId} marked as inactive after ${peer.failureCount} failures`);
      }
    }
  }

  cleanupOldRumors() {
    const now = Date.now();
    for (const [id, rumorInfo] of this.rumor) {
      if (now - rumorInfo.created > this.config.rumorLifetime) {
        this.rumor.delete(id);
      }
    }
  }

  computeStateDigest() {
    // Simple digest of current state for anti-entropy
    const stateKeys = Array.from(this.state.keys()).sort();
    const digest = crypto.createHash('sha256');

    for (const key of stateKeys) {
      const value = this.state.get(key);
      digest.update(`${key}:${value.version}:${value.timestamp}`);
    }

    return digest.digest('hex');
  }

  async sendGossipMessage(peer, message) {
    // Simulation of network communication
    // In practice, this would use HTTP, TCP, or other protocols
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (Math.random() < 0.95) {
          // 95% success rate
          resolve();
        } else {
          reject(new Error('Network failure'));
        }
      }, Math.random() * 100); // Random latency
    });
  }

  /**
   * Get current status and metrics
   */
  getStatus() {
    return {
      nodeId: this.nodeId,
      isRunning: this.isRunning,
      peers: this.peers.size,
      activePeers: Array.from(this.peers.values()).filter((p) => p.isActive).length,
      rumors: this.rumor.size,
      vectorClock: Object.fromEntries(this.vectorClock),
      config: this.config,
    };
  }

  /**
   * Get convergence metrics
   */
  getConvergenceMetrics() {
    const totalPeers = this.peers.size;
    const activePeers = Array.from(this.peers.values()).filter((p) => p.isActive).length;
    const rumorCoverage = new Map();

    for (const [id, rumorInfo] of this.rumor) {
      rumorCoverage.set(id, {
        spread: rumorInfo.spread.size,
        coverage: totalPeers > 0 ? rumorInfo.spread.size / totalPeers : 0,
        age: Date.now() - rumorInfo.created,
      });
    }

    return {
      networkSize: totalPeers,
      activeNodes: activePeers,
      convergenceRatio: totalPeers > 0 ? activePeers / totalPeers : 0,
      rumorCoverage: Object.fromEntries(rumorCoverage),
      averageDeliveryTime: this.calculateAverageDeliveryTime(),
    };
  }

  calculateAverageDeliveryTime() {
    // Simplified calculation - in practice would track actual delivery times
    return this.config.gossipInterval * Math.log(this.peers.size || 1);
  }
}

module.exports = GossipCoordinator;
