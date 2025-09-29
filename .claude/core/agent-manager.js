/**
 * Simple Agent Manager for novice users
 */ import { SimpleAgent } from '../agents/simple-agent.js';
export class AgentManager {
    agents = new Map();
    /**
   * Create a new agent
   */ createAgent(type, task) {
        const id = this.generateId();
        const agent = {
            id,
            type,
            task,
            status: 'pending',
            created: new Date()
        };
        this.agents.set(id, agent);
        console.log(`✅ Created ${type} agent: ${id}`);
        return id;
    }
    /**
   * List all agents
   */ listAgents() {
        return Array.from(this.agents.values());
    }
    /**
   * Get agent by ID
   */ getAgent(id) {
        return this.agents.get(id);
    }
    /**
   * Remove agent
   */ removeAgent(id) {
        const success = this.agents.delete(id);
        if (success) {
            console.log(`🗑️ Removed agent: ${id}`);
        }
        return success;
    }
    /**
   * Run a specific agent
   */ async runAgent(id) {
        const config = this.agents.get(id);
        if (!config) {
            throw new Error(`Agent ${id} not found`);
        }
        console.log(`🚀 Running ${config.type} agent: ${config.task}`);
        config.status = 'running';
        try {
            const agent = new SimpleAgent(config);
            const result = await agent.execute();
            config.result = result;
            config.status = 'completed';
            console.log(`✅ Agent ${id} completed successfully`);
        } catch (error) {
            config.status = 'failed';
            console.error(`❌ Agent ${id} failed:`, error);
            throw error;
        }
    }
    /**
   * Run all pending agents
   */ async runAll() {
        const pendingAgents = Array.from(this.agents.values()).filter((agent)=>agent.status === 'pending');
        if (pendingAgents.length === 0) {
            console.log('No pending agents to run');
            return;
        }
        console.log(`🚀 Running ${pendingAgents.length} agents...`);
        for (const agentConfig of pendingAgents){
            await this.runAgent(agentConfig.id);
        }
        console.log('🎉 All agents completed!');
    }
    generateId() {
        return Math.random().toString(36).substr(2, 9);
    }
}

//# sourceMappingURL=agent-manager.js.map