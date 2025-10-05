/**
 * Simple Agent Manager for novice users
 */

import { AgentConfig, AgentType } from '../types/agent-types.js';
import { SimpleAgent } from '../agents/simple-agent.js';
import { incrementMetric, recordTiming } from '../observability/metrics-counter.js';

export class AgentManager {
  private agents: Map<string, AgentConfig> = new Map();

  /**
   * Create a new agent
   */
  createAgent(type: AgentType, task: string): string {
    const id = this.generateId();
    const agent: AgentConfig = {
      id,
      type,
      task,
      status: 'pending',
      created: new Date(),
    };

    this.agents.set(id, agent);
    incrementMetric('agent.created', 1, {
      agentType: type,
      swarmId: 'standalone'
    });
    console.log(`✅ Created ${type} agent: ${id}`);
    return id;
  }

  /**
   * List all agents
   */
  listAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent by ID
   */
  getAgent(id: string): AgentConfig | undefined {
    return this.agents.get(id);
  }

  /**
   * Remove agent
   */
  removeAgent(id: string): boolean {
    const success = this.agents.delete(id);
    if (success) {
      console.log(`🗑️ Removed agent: ${id}`);
    }
    return success;
  }

  /**
   * Run a specific agent
   */
  async runAgent(id: string): Promise<void> {
    const config = this.agents.get(id);
    if (!config) {
      throw new Error(`Agent ${id} not found`);
    }

    const startTime = Date.now();
    console.log(`🚀 Running ${config.type} agent: ${config.task}`);
    config.status = 'running';
    incrementMetric('agent.started', 1, {
      agentType: config.type,
      agentId: id
    });

    try {
      const agent = new SimpleAgent(config);
      const result = await agent.execute();

      config.result = result;
      config.status = 'completed';
      recordTiming('agent.duration', Date.now() - startTime, {
        agentType: config.type,
        status: 'success'
      });
      incrementMetric('agent.completed', 1, {
        agentType: config.type,
        status: 'success'
      });
      console.log(`✅ Agent ${id} completed successfully`);
    } catch (error) {
      config.status = 'failed';
      recordTiming('agent.duration', Date.now() - startTime, {
        agentType: config.type,
        status: 'error'
      });
      incrementMetric('agent.completed', 1, {
        agentType: config.type,
        status: 'error'
      });
      incrementMetric('agent.error', 1, {
        agentType: config.type,
        errorType: (error as Error).name || 'Unknown'
      });
      console.error(`❌ Agent ${id} failed:`, error);
      throw error;
    }
  }

  /**
   * Run all pending agents
   */
  async runAll(): Promise<void> {
    const pendingAgents = Array.from(this.agents.values()).filter(
      (agent) => agent.status === 'pending',
    );

    if (pendingAgents.length === 0) {
      console.log('No pending agents to run');
      return;
    }

    console.log(`🚀 Running ${pendingAgents.length} agents...`);

    for (const agentConfig of pendingAgents) {
      await this.runAgent(agentConfig.id);
    }

    console.log('🎉 All agents completed!');
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}
