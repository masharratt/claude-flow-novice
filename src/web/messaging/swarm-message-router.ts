/**
 * Swarm Message Router - Routes and manages messages between agents in swarms
 * Limited to 3 agents maximum for simplicity and focus
 */

import { EventEmitter } from 'events';
import { ILogger } from '../../core/logger.js';

export interface AgentMessage {
  id: string;
  swarmId: string;
  agentId: string;
  agentType: 'researcher' | 'coder' | 'reviewer';
  messageType: 'task-start' | 'progress-update' | 'decision' | 'coordination' | 'completion' | 'error' | 'reasoning';
  content: string;
  metadata?: {
    reasoning?: string;
    alternatives?: string[];
    confidence?: number;
    dependencies?: string[];
    nextSteps?: string[];
    tags?: string[];
  };
  timestamp: string;
  targetAgents?: string[];
  priority: 'low' | 'medium' | 'high' | 'urgent';
  threadId?: string;
  parentMessageId?: string;
}

export interface MessageQuery {
  swarmId?: string;
  agentId?: string;
  messageType?: string;
  limit?: number;
  offset?: number;
  threadId?: string;
  timeRange?: {
    start: string;
    end: string;
  };
}

export interface SwarmState {
  swarmId: string;
  agents: Array<{
    id: string;
    type: 'researcher' | 'coder' | 'reviewer';
    status: 'active' | 'idle' | 'working' | 'blocked' | 'completed';
    currentTask?: string;
  }>;
  messageCount: number;
  coordination: {
    activeThreads: number;
    pendingHandoffs: number;
    blockedTasks: number;
  };
  lastActivity: string;
}

export class SwarmMessageRouter extends EventEmitter {
  private messages = new Map<string, AgentMessage>();
  private messagesBySwarm = new Map<string, string[]>();
  private messagesByAgent = new Map<string, string[]>();
  private messageThreads = new Map<string, string[]>();
  private swarmStates = new Map<string, SwarmState>();
  private MAX_AGENTS_PER_SWARM = 3;

  constructor(private logger: ILogger) {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Handle incoming agent message with 3-agent coordination
   */
  public handleAgentMessage(message: AgentMessage): void {
    try {
      // Validate swarm has max 3 agents
      const swarmState = this.getOrCreateSwarmState(message.swarmId);
      if (!swarmState.agents.find(a => a.id === message.agentId)) {
        if (swarmState.agents.length >= this.MAX_AGENTS_PER_SWARM) {
          this.logger.warn('Swarm already has maximum 3 agents', {
            swarmId: message.swarmId,
            agentId: message.agentId
          });
          return;
        }

        // Add new agent to swarm
        swarmState.agents.push({
          id: message.agentId,
          type: message.agentType,
          status: 'active'
        });
      }

      // Store message
      this.messages.set(message.id, message);

      // Update indices
      this.updateMessageIndices(message);

      // Update swarm state
      this.updateSwarmState(message);

      // Handle coordination logic for 3-agent swarms
      this.handleThreeAgentCoordination(message);

      // Emit message event
      this.emit('message', message);

      this.logger.debug('Agent message processed', {
        messageId: message.id,
        swarmId: message.swarmId,
        agentId: message.agentId,
        type: message.messageType
      });

    } catch (error) {
      this.logger.error('Error handling agent message', { error, messageId: message.id });
      throw error;
    }
  }

  /**
   * Specialized coordination logic for 3-agent swarms
   */
  private handleThreeAgentCoordination(message: AgentMessage): void {
    const swarmState = this.swarmStates.get(message.swarmId);
    if (!swarmState) return;

    switch (message.messageType) {
      case 'task-start':
        this.handleTaskStart(message, swarmState);
        break;
      case 'coordination':
        this.handleCoordination(message, swarmState);
        break;
      case 'decision':
        this.handleDecision(message, swarmState);
        break;
      case 'completion':
        this.handleTaskCompletion(message, swarmState);
        break;
    }
  }

  private handleTaskStart(message: AgentMessage, swarmState: SwarmState): void {
    // Notify other agents about new task
    const otherAgents = swarmState.agents.filter(a => a.id !== message.agentId);

    const coordinationMessage: AgentMessage = {
      id: this.generateMessageId(),
      swarmId: message.swarmId,
      agentId: 'system',
      agentType: 'reviewer', // System messages use reviewer type
      messageType: 'coordination',
      content: `Agent ${message.agentId} started: ${message.content}`,
      metadata: {
        reasoning: 'Notifying team of new task initiation',
        dependencies: [message.agentId]
      },
      timestamp: new Date().toISOString(),
      targetAgents: otherAgents.map(a => a.id),
      priority: 'medium',
      threadId: message.threadId || message.id
    };

    this.emit('coordination-message', coordinationMessage);
  }

  private handleCoordination(message: AgentMessage, swarmState: SwarmState): void {
    // Track coordination threads
    const threadId = message.threadId || message.id;
    if (!this.messageThreads.has(threadId)) {
      this.messageThreads.set(threadId, []);
    }
    this.messageThreads.get(threadId)!.push(message.id);

    // Update coordination metrics
    swarmState.coordination.activeThreads = this.messageThreads.size;
  }

  private handleDecision(message: AgentMessage, swarmState: SwarmState): void {
    // Log decision for transparency
    this.emit('decision-logged', {
      swarmId: message.swarmId,
      agentId: message.agentId,
      decision: message.content,
      reasoning: message.metadata?.reasoning,
      alternatives: message.metadata?.alternatives,
      confidence: message.metadata?.confidence,
      timestamp: message.timestamp
    });

    // Check if other agents need to respond to this decision
    if (message.targetAgents && message.targetAgents.length > 0) {
      swarmState.coordination.pendingHandoffs += message.targetAgents.length;
    }
  }

  private handleTaskCompletion(message: AgentMessage, swarmState: SwarmState): void {
    // Update agent status
    const agent = swarmState.agents.find(a => a.id === message.agentId);
    if (agent) {
      agent.status = 'completed';
      agent.currentTask = undefined;
    }

    // Check if all agents are completed
    const allCompleted = swarmState.agents.every(a => a.status === 'completed');
    if (allCompleted) {
      this.emit('swarm-completed', {
        swarmId: message.swarmId,
        completionTime: message.timestamp,
        totalMessages: swarmState.messageCount
      });
    }
  }

  /**
   * Get messages with filtering and pagination
   */
  public async getMessages(query: MessageQuery): Promise<AgentMessage[]> {
    let messageIds: string[] = [];

    if (query.swarmId) {
      messageIds = this.messagesBySwarm.get(query.swarmId) || [];
    } else {
      messageIds = Array.from(this.messages.keys());
    }

    // Apply additional filters
    let filteredMessages = messageIds
      .map(id => this.messages.get(id)!)
      .filter(msg => {
        if (query.agentId && msg.agentId !== query.agentId) return false;
        if (query.messageType && msg.messageType !== query.messageType) return false;
        if (query.threadId && msg.threadId !== query.threadId) return false;

        if (query.timeRange) {
          const msgTime = new Date(msg.timestamp);
          const start = new Date(query.timeRange.start);
          const end = new Date(query.timeRange.end);
          if (msgTime < start || msgTime > end) return false;
        }

        return true;
      });

    // Sort by timestamp (newest first)
    filteredMessages.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    // Apply pagination
    const offset = query.offset || 0;
    const limit = query.limit || 100;

    return filteredMessages.slice(offset, offset + limit);
  }

  /**
   * Get swarm conversation threads
   */
  public getConversationThreads(swarmId: string): any[] {
    const threads = Array.from(this.messageThreads.entries())
      .map(([threadId, messageIds]) => {
        const messages = messageIds.map(id => this.messages.get(id)!);
        const firstMessage = messages[0];

        if (firstMessage?.swarmId !== swarmId) return null;

        return {
          threadId,
          title: firstMessage.content.substring(0, 50) + '...',
          messageCount: messages.length,
          participants: [...new Set(messages.map(m => m.agentId))],
          lastActivity: messages[messages.length - 1]?.timestamp,
          messages: messages.sort((a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          )
        };
      })
      .filter(thread => thread !== null);

    return threads.sort((a, b) =>
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
  }

  /**
   * Get swarm state for 3-agent coordination
   */
  public getSwarmState(swarmId: string): SwarmState | null {
    return this.swarmStates.get(swarmId) || null;
  }

  /**
   * Get all active swarms (limited to 3 agents each)
   */
  public getActiveSwarms(): SwarmState[] {
    return Array.from(this.swarmStates.values())
      .filter(state => state.agents.some(a => a.status === 'active' || a.status === 'working'));
  }

  private getOrCreateSwarmState(swarmId: string): SwarmState {
    if (!this.swarmStates.has(swarmId)) {
      this.swarmStates.set(swarmId, {
        swarmId,
        agents: [],
        messageCount: 0,
        coordination: {
          activeThreads: 0,
          pendingHandoffs: 0,
          blockedTasks: 0
        },
        lastActivity: new Date().toISOString()
      });
    }
    return this.swarmStates.get(swarmId)!;
  }

  private updateMessageIndices(message: AgentMessage): void {
    // Update swarm index
    if (!this.messagesBySwarm.has(message.swarmId)) {
      this.messagesBySwarm.set(message.swarmId, []);
    }
    this.messagesBySwarm.get(message.swarmId)!.push(message.id);

    // Update agent index
    if (!this.messagesByAgent.has(message.agentId)) {
      this.messagesByAgent.set(message.agentId, []);
    }
    this.messagesByAgent.get(message.agentId)!.push(message.id);

    // Update thread index
    if (message.threadId) {
      if (!this.messageThreads.has(message.threadId)) {
        this.messageThreads.set(message.threadId, []);
      }
      this.messageThreads.get(message.threadId)!.push(message.id);
    }
  }

  private updateSwarmState(message: AgentMessage): void {
    const state = this.getOrCreateSwarmState(message.swarmId);
    state.messageCount++;
    state.lastActivity = message.timestamp;

    // Update agent status
    const agent = state.agents.find(a => a.id === message.agentId);
    if (agent) {
      switch (message.messageType) {
        case 'task-start':
          agent.status = 'working';
          agent.currentTask = message.content;
          break;
        case 'completion':
          agent.status = 'completed';
          agent.currentTask = undefined;
          break;
        case 'error':
          agent.status = 'blocked';
          break;
        default:
          if (agent.status === 'idle') {
            agent.status = 'active';
          }
      }
    }
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getMessageCount(): number {
    return this.messages.size;
  }

  public getSwarmCount(): number {
    return this.swarmStates.size;
  }

  /**
   * Clear old messages to prevent memory leaks
   */
  public cleanupOldMessages(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = new Date(Date.now() - maxAge);

    for (const [id, message] of this.messages.entries()) {
      if (new Date(message.timestamp) < cutoff) {
        this.messages.delete(id);
        // Clean up indices too
        this.cleanupMessageFromIndices(id, message);
      }
    }
  }

  private cleanupMessageFromIndices(messageId: string, message: AgentMessage): void {
    // Remove from swarm index
    const swarmMessages = this.messagesBySwarm.get(message.swarmId);
    if (swarmMessages) {
      const index = swarmMessages.indexOf(messageId);
      if (index > -1) {
        swarmMessages.splice(index, 1);
      }
    }

    // Remove from agent index
    const agentMessages = this.messagesByAgent.get(message.agentId);
    if (agentMessages) {
      const index = agentMessages.indexOf(messageId);
      if (index > -1) {
        agentMessages.splice(index, 1);
      }
    }

    // Remove from thread index
    if (message.threadId) {
      const threadMessages = this.messageThreads.get(message.threadId);
      if (threadMessages) {
        const index = threadMessages.indexOf(messageId);
        if (index > -1) {
          threadMessages.splice(index, 1);
        }
        if (threadMessages.length === 0) {
          this.messageThreads.delete(message.threadId);
        }
      }
    }
  }
}