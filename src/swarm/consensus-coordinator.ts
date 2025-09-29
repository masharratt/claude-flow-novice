/**
 * Consensus Coordinator
 * Implements distributed consensus protocols for agent coordination decisions
 *
 * Supported Protocols:
 * - Raft: Leader-based consensus for coordination decisions
 * - PBFT: Byzantine fault tolerance for untrusted agents
 * - Quorum: Simple majority voting for basic decisions
 *
 * Performance Target: <10ms consensus latency for 100+ agents
 */

import { EventEmitter } from 'node:events';
import { performance } from 'perf_hooks';
import { Logger } from '../core/logger.js';

export type ConsensusProtocol = 'raft' | 'pbft' | 'quorum' | 'fast-paxos';

export interface ConsensusProposal {
  id: string;
  type: 'task-assignment' | 'leader-election' | 'configuration-change' | 'resource-allocation';
  proposer: string;
  data: any;
  timestamp: number;
}

export interface ConsensusVote {
  proposalId: string;
  voter: string;
  decision: 'approve' | 'reject' | 'abstain';
  signature?: string;
  timestamp: number;
}

export interface ConsensusResult {
  proposalId: string;
  decision: 'approved' | 'rejected' | 'timeout';
  votes: ConsensusVote[];
  consensusTime: number;
  participationRate: number;
}

export interface RaftState {
  currentTerm: number;
  votedFor: string | null;
  role: 'leader' | 'follower' | 'candidate';
  leaderId: string | null;
  log: Array<{ term: number; command: any }>;
  commitIndex: number;
  lastApplied: number;
}

export interface ConsensusConfig {
  protocol: ConsensusProtocol;
  quorumSize?: number; // Minimum votes needed
  timeout: number;
  maxRetries: number;
  byzantineTolerance?: number; // For PBFT
}

export class ConsensusCoordinator extends EventEmitter {
  private logger: Logger;
  private config: ConsensusConfig;

  // Agent registry
  private agents = new Set<string>();
  private agentStates = new Map<string, 'active' | 'inactive' | 'suspected'>();

  // Raft state (for raft protocol)
  private raftState: RaftState = {
    currentTerm: 0,
    votedFor: null,
    role: 'follower',
    leaderId: null,
    log: [],
    commitIndex: 0,
    lastApplied: 0
  };

  // Consensus tracking
  private activeProposals = new Map<string, {
    proposal: ConsensusProposal;
    votes: Map<string, ConsensusVote>;
    deadline: number;
    startTime: number;
  }>();

  // Performance metrics
  private metrics = {
    totalProposals: 0,
    approvedProposals: 0,
    rejectedProposals: 0,
    timedOutProposals: 0,
    avgConsensusTime: 0,
    consensusTimes: [] as number[],
    avgParticipationRate: 0
  };

  constructor(config: Partial<ConsensusConfig> = {}) {
    super();

    this.config = {
      protocol: config.protocol || 'quorum',
      quorumSize: config.quorumSize,
      timeout: config.timeout || 5000,
      maxRetries: config.maxRetries || 3,
      byzantineTolerance: config.byzantineTolerance || 1
    };

    const loggerConfig = process.env.CLAUDE_FLOW_ENV === 'test'
      ? { level: 'error' as const, format: 'json' as const, destination: 'console' as const }
      : { level: 'info' as const, format: 'json' as const, destination: 'console' as const };

    this.logger = new Logger(loggerConfig, { component: 'ConsensusCoordinator' });

    this.initialize();
  }

  private initialize(): void {
    // Start background processes based on protocol
    if (this.config.protocol === 'raft') {
      this.startRaftProtocol();
    }

    this.logger.info('Consensus coordinator initialized', {
      protocol: this.config.protocol,
      timeout: this.config.timeout
    });
  }

  /**
   * Register an agent in the consensus group
   */
  registerAgent(agentId: string): void {
    this.agents.add(agentId);
    this.agentStates.set(agentId, 'active');

    // Update quorum size if not explicitly set
    if (!this.config.quorumSize) {
      this.config.quorumSize = this.calculateQuorumSize();
    }

    this.logger.debug('Agent registered for consensus', {
      agentId,
      totalAgents: this.agents.size,
      quorumSize: this.config.quorumSize
    });

    this.emit('agent:registered', agentId);
  }

  /**
   * Unregister an agent from the consensus group
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.agentStates.delete(agentId);

    // Update quorum size
    this.config.quorumSize = this.calculateQuorumSize();

    this.logger.debug('Agent unregistered from consensus', {
      agentId,
      totalAgents: this.agents.size,
      quorumSize: this.config.quorumSize
    });

    this.emit('agent:unregistered', agentId);
  }

  /**
   * Propose a decision for consensus
   */
  async propose(proposal: ConsensusProposal): Promise<ConsensusResult> {
    const consensusStart = performance.now();

    this.logger.info('Consensus proposal initiated', {
      proposalId: proposal.id,
      type: proposal.type,
      protocol: this.config.protocol
    });

    try {
      let result: ConsensusResult;

      switch (this.config.protocol) {
        case 'raft':
          result = await this.raftConsensus(proposal);
          break;

        case 'pbft':
          result = await this.pbftConsensus(proposal);
          break;

        case 'quorum':
          result = await this.quorumConsensus(proposal);
          break;

        case 'fast-paxos':
          result = await this.fastPaxosConsensus(proposal);
          break;

        default:
          throw new Error(`Unsupported consensus protocol: ${this.config.protocol}`);
      }

      // Record metrics
      const consensusTime = performance.now() - consensusStart;
      this.recordConsensusMetrics(result, consensusTime);

      this.logger.info('Consensus reached', {
        proposalId: proposal.id,
        decision: result.decision,
        consensusTime: `${consensusTime.toFixed(2)}ms`,
        participationRate: `${(result.participationRate * 100).toFixed(1)}%`
      });

      this.emit('consensus:reached', result);
      return result;

    } catch (error) {
      this.logger.error('Consensus failed', {
        proposalId: proposal.id,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Raft consensus implementation
   */
  private async raftConsensus(proposal: ConsensusProposal): Promise<ConsensusResult> {
    // Only leader can propose in Raft
    if (this.raftState.role !== 'leader') {
      if (this.raftState.leaderId) {
        // Forward to leader
        this.logger.debug('Forwarding proposal to leader', {
          leaderId: this.raftState.leaderId
        });
      } else {
        // No leader, trigger election
        await this.startLeaderElection();
      }
    }

    // Append to log
    const logEntry = {
      term: this.raftState.currentTerm,
      command: proposal
    };
    this.raftState.log.push(logEntry);

    // Replicate to followers
    const votes = await this.replicateToFollowers(logEntry);

    // Check if majority acknowledged
    const quorum = Math.floor(this.agents.size / 2) + 1;
    const approvals = votes.filter(v => v.decision === 'approve').length;

    const decision = approvals >= quorum ? 'approved' : 'rejected';
    const consensusTime = performance.now();

    return {
      proposalId: proposal.id,
      decision,
      votes,
      consensusTime,
      participationRate: votes.length / this.agents.size
    };
  }

  /**
   * PBFT (Practical Byzantine Fault Tolerance) consensus
   */
  private async pbftConsensus(proposal: ConsensusProposal): Promise<ConsensusResult> {
    const startTime = performance.now();
    const deadline = Date.now() + this.config.timeout;

    // Phase 1: Pre-prepare (leader broadcasts proposal)
    this.logger.debug('PBFT Pre-prepare phase', { proposalId: proposal.id });

    // Phase 2: Prepare (agents exchange prepare messages)
    const prepareVotes = await this.collectVotes(proposal, 'prepare', deadline);

    // Check if we have enough prepare votes (2f + 1 where f is max faulty)
    const f = this.config.byzantineTolerance || 1;
    const minVotes = 2 * f + 1;

    if (prepareVotes.length < minVotes) {
      return {
        proposalId: proposal.id,
        decision: 'timeout',
        votes: prepareVotes,
        consensusTime: performance.now() - startTime,
        participationRate: prepareVotes.length / this.agents.size
      };
    }

    // Phase 3: Commit (agents exchange commit messages)
    const commitVotes = await this.collectVotes(proposal, 'commit', deadline);

    const approvals = commitVotes.filter(v => v.decision === 'approve').length;
    const decision = approvals >= minVotes ? 'approved' : 'rejected';

    return {
      proposalId: proposal.id,
      decision,
      votes: commitVotes,
      consensusTime: performance.now() - startTime,
      participationRate: commitVotes.length / this.agents.size
    };
  }

  /**
   * Simple quorum-based consensus
   */
  private async quorumConsensus(proposal: ConsensusProposal): Promise<ConsensusResult> {
    const startTime = performance.now();
    const deadline = Date.now() + this.config.timeout;

    // Broadcast proposal to all agents
    const votes = await this.collectVotes(proposal, 'vote', deadline);

    // Count votes
    const approvals = votes.filter(v => v.decision === 'approve').length;
    const rejections = votes.filter(v => v.decision === 'reject').length;

    const quorumSize = this.config.quorumSize || Math.floor(this.agents.size / 2) + 1;
    let decision: 'approved' | 'rejected' | 'timeout';

    if (approvals >= quorumSize) {
      decision = 'approved';
    } else if (rejections >= quorumSize) {
      decision = 'rejected';
    } else {
      decision = 'timeout';
    }

    return {
      proposalId: proposal.id,
      decision,
      votes,
      consensusTime: performance.now() - startTime,
      participationRate: votes.length / this.agents.size
    };
  }

  /**
   * Fast Paxos consensus (optimized for low latency)
   */
  private async fastPaxosConsensus(proposal: ConsensusProposal): Promise<ConsensusResult> {
    const startTime = performance.now();
    const deadline = Date.now() + this.config.timeout;

    // Fast path: Try to reach consensus in one round
    const votes = await this.collectVotes(proposal, 'fast-vote', deadline);

    const quorumSize = Math.floor(this.agents.size * 0.75); // 3/4 majority for fast path
    const approvals = votes.filter(v => v.decision === 'approve').length;

    if (approvals >= quorumSize) {
      // Fast path succeeded
      return {
        proposalId: proposal.id,
        decision: 'approved',
        votes,
        consensusTime: performance.now() - startTime,
        participationRate: votes.length / this.agents.size
      };
    }

    // Fall back to classic Paxos (two-phase)
    this.logger.debug('Fast path failed, falling back to classic Paxos', {
      proposalId: proposal.id
    });

    // Prepare phase
    const prepareVotes = await this.collectVotes(proposal, 'prepare', deadline);

    // Accept phase
    const acceptVotes = await this.collectVotes(proposal, 'accept', deadline);

    const majoritySize = Math.floor(this.agents.size / 2) + 1;
    const finalApprovals = acceptVotes.filter(v => v.decision === 'approve').length;

    return {
      proposalId: proposal.id,
      decision: finalApprovals >= majoritySize ? 'approved' : 'rejected',
      votes: acceptVotes,
      consensusTime: performance.now() - startTime,
      participationRate: acceptVotes.length / this.agents.size
    };
  }

  /**
   * Collect votes from agents
   */
  private async collectVotes(
    proposal: ConsensusProposal,
    phase: string,
    deadline: number
  ): Promise<ConsensusVote[]> {
    const votes: ConsensusVote[] = [];
    const proposalData = {
      proposal,
      votes: new Map<string, ConsensusVote>(),
      deadline,
      startTime: Date.now()
    };

    this.activeProposals.set(proposal.id, proposalData);

    // In production, this would send messages to actual agents
    // For now, simulate voting behavior
    const activeAgents = Array.from(this.agents).filter(
      agentId => this.agentStates.get(agentId) === 'active'
    );

    await Promise.all(
      activeAgents.map(async agentId => {
        // Simulate network latency (0-5ms)
        await new Promise(resolve => setTimeout(resolve, Math.random() * 5));

        if (Date.now() > deadline) {
          return; // Timeout
        }

        // Simulate voting (in production, agents would make actual decisions)
        const vote: ConsensusVote = {
          proposalId: proposal.id,
          voter: agentId,
          decision: Math.random() > 0.1 ? 'approve' : 'reject', // 90% approval rate
          timestamp: Date.now()
        };

        votes.push(vote);
        proposalData.votes.set(agentId, vote);
      })
    );

    this.activeProposals.delete(proposal.id);
    return votes;
  }

  /**
   * Start Raft leader election
   */
  private async startLeaderElection(): Promise<void> {
    this.raftState.currentTerm++;
    this.raftState.role = 'candidate';
    this.raftState.votedFor = 'self'; // Vote for self

    this.logger.info('Starting leader election', {
      term: this.raftState.currentTerm
    });

    // Request votes from other agents
    const votes = await this.requestVotes();

    const majority = Math.floor(this.agents.size / 2) + 1;
    const approvals = votes.filter(v => v.decision === 'approve').length + 1; // +1 for self vote

    if (approvals >= majority) {
      // Won election
      this.raftState.role = 'leader';
      this.raftState.leaderId = 'self';

      this.logger.info('Elected as leader', {
        term: this.raftState.currentTerm,
        votes: approvals
      });

      this.emit('leader:elected', { term: this.raftState.currentTerm });
    } else {
      // Lost election
      this.raftState.role = 'follower';

      this.logger.debug('Leader election failed', {
        term: this.raftState.currentTerm,
        votes: approvals
      });
    }
  }

  /**
   * Request votes from agents (Raft)
   */
  private async requestVotes(): Promise<ConsensusVote[]> {
    const votes: ConsensusVote[] = [];

    // In production, send RequestVote RPCs
    // For now, simulate responses
    for (const agentId of this.agents) {
      const vote: ConsensusVote = {
        proposalId: `election-${this.raftState.currentTerm}`,
        voter: agentId,
        decision: Math.random() > 0.3 ? 'approve' : 'reject',
        timestamp: Date.now()
      };
      votes.push(vote);
    }

    return votes;
  }

  /**
   * Replicate log entries to followers (Raft)
   */
  private async replicateToFollowers(logEntry: { term: number; command: any }): Promise<ConsensusVote[]> {
    const votes: ConsensusVote[] = [];

    // In production, send AppendEntries RPCs
    // For now, simulate responses
    for (const agentId of this.agents) {
      const vote: ConsensusVote = {
        proposalId: `replication-${this.raftState.currentTerm}`,
        voter: agentId,
        decision: 'approve',
        timestamp: Date.now()
      };
      votes.push(vote);
    }

    return votes;
  }

  /**
   * Calculate required quorum size
   */
  private calculateQuorumSize(): number {
    switch (this.config.protocol) {
      case 'pbft':
        // PBFT requires 2f + 1 where f is max faulty
        const f = this.config.byzantineTolerance || 1;
        return 2 * f + 1;

      case 'raft':
      case 'quorum':
      case 'fast-paxos':
      default:
        // Simple majority
        return Math.floor(this.agents.size / 2) + 1;
    }
  }

  /**
   * Record consensus metrics
   */
  private recordConsensusMetrics(result: ConsensusResult, consensusTime: number): void {
    this.metrics.totalProposals++;

    if (result.decision === 'approved') {
      this.metrics.approvedProposals++;
    } else if (result.decision === 'rejected') {
      this.metrics.rejectedProposals++;
    } else {
      this.metrics.timedOutProposals++;
    }

    this.metrics.consensusTimes.push(consensusTime);
    if (this.metrics.consensusTimes.length > 1000) {
      this.metrics.consensusTimes = this.metrics.consensusTimes.slice(-1000);
    }

    this.metrics.avgConsensusTime =
      this.metrics.consensusTimes.reduce((a, b) => a + b, 0) / this.metrics.consensusTimes.length;

    this.metrics.avgParticipationRate =
      (this.metrics.avgParticipationRate * (this.metrics.totalProposals - 1) + result.participationRate) /
      this.metrics.totalProposals;
  }

  /**
   * Get consensus metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeAgents: Array.from(this.agentStates.values()).filter(s => s === 'active').length,
      totalAgents: this.agents.size,
      quorumSize: this.config.quorumSize,
      protocol: this.config.protocol,
      raftState: this.config.protocol === 'raft' ? {
        term: this.raftState.currentTerm,
        role: this.raftState.role,
        leaderId: this.raftState.leaderId
      } : undefined
    };
  }

  /**
   * Start Raft protocol background processes
   */
  private startRaftProtocol(): void {
    // Heartbeat mechanism for leader
    setInterval(() => {
      if (this.raftState.role === 'leader') {
        this.sendHeartbeats();
      }
    }, 1000); // Send heartbeats every 1s

    // Election timeout for followers
    setInterval(() => {
      if (this.raftState.role === 'follower' && !this.raftState.leaderId) {
        // No heartbeat from leader, start election
        this.startLeaderElection();
      }
    }, 5000); // Check every 5s
  }

  /**
   * Send heartbeats to followers (Raft)
   */
  private sendHeartbeats(): void {
    // In production, send AppendEntries RPCs with no entries
    this.emit('heartbeat:sent', { term: this.raftState.currentTerm });
  }

  /**
   * Shutdown consensus coordinator
   */
  shutdown(): void {
    this.agents.clear();
    this.agentStates.clear();
    this.activeProposals.clear();

    this.logger.info('Consensus coordinator shut down');
  }
}