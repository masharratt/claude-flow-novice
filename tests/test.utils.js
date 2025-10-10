/**
 * Test Utilities
 * Common utilities and helpers for testing
 */

import { EventEmitter } from 'events';

export class MockAgent extends EventEmitter {
  constructor(id, options = {}) {
    super();
    this.id = id;
    this.status = 'idle';
    this.capabilities = options.capabilities || [];
    this.currentLoad = options.currentLoad || 0;
    this.maxLoad = options.maxLoad || 3;
    this.availability = options.availability || 'available';
    this.priority = options.priority || 5;
    this.expertise = options.expertise || {};
  }

  async executeTask(task) {
    this.status = 'busy';
    this.emit('task:started', { agentId: this.id, task });

    // Simulate task execution
    await new Promise(resolve => setTimeout(resolve, 100));

    this.status = 'idle';
    this.emit('task:completed', { agentId: this.id, task, result: 'success' });

    return { success: true, result: 'Task completed' };
  }

  updateStatus(status) {
    this.status = status;
    this.emit('status:changed', { agentId: this.id, status });
  }

  updateLoad(load) {
    this.currentLoad = load;
    this.emit('load:changed', { agentId: this.id, load });
  }
}

export class MockTask {
  constructor(id, options = {}) {
    this.id = id;
    this.type = options.type || 'test';
    this.priority = options.priority || 5;
    this.payload = options.payload || {};
    this.dependencies = options.dependencies || [];
    this.createdAt = new Date();
  }

  addDependency(taskId) {
    if (!this.dependencies.includes(taskId)) {
      this.dependencies.push(taskId);
    }
  }

  isReady(completedTasks = new Set()) {
    return this.dependencies.every(dep => completedTasks.has(dep));
  }
}

export class MockConsensus extends EventEmitter {
  constructor(options = {}) {
    super();
    this.threshold = options.threshold || 0.75;
    this.participants = new Map();
    this.proposals = new Map();
  }

  addParticipant(id, weight = 1) {
    this.participants.set(id, weight);
  }

  async createProposal(proposal) {
    const proposalId = `proposal-${Date.now()}`;
    this.proposals.set(proposalId, {
      ...proposal,
      id: proposalId,
      votes: new Map(),
      createdAt: new Date()
    });

    this.emit('proposal:created', { proposalId, proposal });
    return proposalId;
  }

  async vote(proposalId, participantId, vote) {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    proposal.votes.set(participantId, vote);
    this.emit('vote:cast', { proposalId, participantId, vote });

    return this.checkConsensus(proposalId);
  }

  async checkConsensus(proposalId) {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    const totalWeight = Array.from(this.participants.values()).reduce((sum, weight) => sum + weight, 0);
    const agreeWeight = Array.from(proposal.votes.entries())
      .filter(([_, vote]) => vote === 'agree')
      .reduce((sum, [participantId]) => sum + (this.participants.get(participantId) || 0), 0);

    const agreementLevel = totalWeight > 0 ? agreeWeight / totalWeight : 0;
    const consensus = agreementLevel >= this.threshold;

    const result = {
      proposalId,
      consensus,
      agreementLevel,
      threshold: this.threshold,
      totalWeight,
      agreeWeight,
      disagreeWeight: totalWeight - agreeWeight
    };

    if (consensus) {
      this.emit('consensus:reached', result);
    }

    return result;
  }
}

export class MockMemoryManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxSize = options.maxSize || 1000;
    this.data = new Map();
    this.accessCount = new Map();
  }

  set(key, value) {
    if (this.data.size >= this.maxSize && !this.data.has(key)) {
      this.evictLRU();
    }

    this.data.set(key, value);
    this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
    this.emit('data:set', { key, value });
  }

  get(key) {
    if (this.data.has(key)) {
      this.accessCount.set(key, (this.accessCount.get(key) || 0) + 1);
      this.emit('data:accessed', { key });
      return this.data.get(key);
    }
    return undefined;
  }

  has(key) {
    return this.data.has(key);
  }

  delete(key) {
    const deleted = this.data.delete(key);
    this.accessCount.delete(key);

    if (deleted) {
      this.emit('data:deleted', { key });
    }

    return deleted;
  }

  evictLRU() {
    let lruKey = null;
    let minAccess = Infinity;

    for (const [key, count] of this.accessCount.entries()) {
      if (count < minAccess) {
        minAccess = count;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.delete(lruKey);
      this.emit('data:evicted', { key: lruKey });
    }
  }

  clear() {
    this.data.clear();
    this.accessCount.clear();
    this.emit('data:cleared');
  }

  size() {
    return this.data.size;
  }

  stats() {
    return {
      size: this.data.size,
      maxSize: this.maxSize,
      keys: Array.from(this.data.keys()),
      accessCounts: Object.fromEntries(this.accessCount)
    };
  }
}

export function createMockAgent(id, options = {}) {
  return new MockAgent(id, options);
}

export function createMockTask(id, options = {}) {
  return new MockTask(id, options);
}

export function createMockConsensus(options = {}) {
  return new MockConsensus(options);
}

export function createMockMemoryManager(options = {}) {
  return new MockMemoryManager(options);
}

export function waitForEvent(emitter, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Event ${event} not received within ${timeout}ms`));
    }, timeout);

    emitter.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default {
  MockAgent,
  MockTask,
  MockConsensus,
  MockMemoryManager,
  createMockAgent,
  createMockTask,
  createMockConsensus,
  createMockMemoryManager,
  waitForEvent,
  delay
};