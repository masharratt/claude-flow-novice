#!/usr/bin/env node

/**
 * Swarm Management Slash Command
 * Usage: /swarm <action> [options]
 */

import { SlashCommand } from '../core/slash-command.js';

export class SwarmCommand extends SlashCommand {
  constructor() {
    super('swarm', 'Manage AI agent swarms with various topologies and coordination patterns');
  }

  getUsage() {
    return '/swarm <action> [options]';
  }

  getExamples() {
    return [
      '/swarm init mesh 8 - Initialize mesh topology with 8 agents',
      '/swarm status - Get current swarm status',
      '/swarm spawn researcher - Spawn a researcher agent',
      '/swarm orchestrate "Build REST API" - Orchestrate a task',
      '/swarm monitor - Monitor swarm activity',
      '/swarm scale 12 - Scale swarm to 12 agents',
      '/swarm destroy - Gracefully shutdown swarm'
    ];
  }

  async execute(args, context) {
    const [action, ...params] = args;

    if (!action) {
      return this.formatResponse({
        success: false,
        error: 'Action required',
        usage: this.getUsage(),
        availableActions: [
          'init', 'status', 'spawn', 'orchestrate', 'monitor', 'scale', 'destroy'
        ]
      });
    }

    try {
      let result;

      switch (action.toLowerCase()) {
        case 'init':
          result = await this.initSwarm(params);
          break;
        
        case 'status':
          result = await this.getStatus(params);
          break;
        
        case 'spawn':
          result = await this.spawnAgent(params);
          break;
        
        case 'orchestrate':
          result = await this.orchestrateTask(params);
          break;
        
        case 'monitor':
          result = await this.monitorSwarm(params);
          break;
        
        case 'scale':
          result = await this.scaleSwarm(params);
          break;
        
        case 'destroy':
          result = await this.destroySwarm(params);
          break;
        
        default:
          result = {
            success: false,
            error: `Unknown action: ${action}`,
            availableActions: [
              'init', 'status', 'spawn', 'orchestrate', 'monitor', 'scale', 'destroy'
            ]
          };
      }

      return this.formatResponse(result);
    } catch (error) {
      return this.formatResponse({
        success: false,
        error: error.message,
        action: action
      });
    }
  }

  async initSwarm(params) {
    const [topology = 'mesh', maxAgents = '8', strategy = 'balanced'] = params;

    const validTopologies = ['mesh', 'hierarchical', 'ring', 'star'];
    if (!validTopologies.includes(topology)) {
      return {
        success: false,
        error: `Invalid topology. Valid options: ${validTopologies.join(', ')}`
      };
    }

    const agentCount = parseInt(maxAgents);
    if (isNaN(agentCount) || agentCount < 1 || agentCount > 100) {
      return {
        success: false,
        error: 'Agent count must be between 1 and 100'
      };
    }

    console.log(`🚀 Initializing ${topology} swarm with ${agentCount} agents...`);

    const prompt = `
🚀 **SWARM INITIALIZATION**

**Configuration:**
- Topology: ${topology}
- Max Agents: ${agentCount}
- Strategy: ${strategy}

**Initialize the swarm with MCP tools:**

\`\`\`javascript
// Step 1: Initialize swarm coordination
mcp__claude-flow__swarm_init({
  topology: "${topology}",
  maxAgents: ${agentCount},
  strategy: "${strategy}"
});

// Step 2: Set up agent coordination patterns
mcp__claude-flow__coordination_sync({ swarmId: "swarm-${Date.now()}" });
\`\`\`

**Then use Claude Code's Task tool to spawn actual working agents:**
\`\`\`javascript
Task("Coordinator Agent", "Coordinate swarm activities and task distribution", "coordinator")
Task("Research Agent", "Analyze requirements and gather information", "researcher")
Task("Coder Agent", "Implement code and solutions", "coder")
Task("Tester Agent", "Create and run comprehensive tests", "tester")
\`\`\`

**Execute this swarm initialization now**:
`;

    return {
      success: true,
      prompt: prompt,
      topology: topology,
      maxAgents: agentCount,
      strategy: strategy,
      swarmId: `swarm-${Date.now()}`
    };
  }

  async getStatus(params) {
    const [verbose = 'false'] = params;
    const isVerbose = verbose.toLowerCase() === 'true';

    console.log('📊 Getting swarm status...');

    const prompt = `
📊 **SWARM STATUS CHECK**

**Get current swarm information:**

\`\`\`javascript
// Check swarm status with MCP tools
mcp__claude-flow__swarm_status({ verbose: ${isVerbose} });

// Get agent metrics
mcp__claude-flow__agent_metrics({ metric: "all" });

// Check active tasks
mcp__claude-flow__task_status({ detailed: ${isVerbose} });
\`\`\`

**Execute this status check now**:
`;

    return {
      success: true,
      prompt: prompt,
      verbose: isVerbose
    };
  }

  async spawnAgent(params) {
    const [type, ...nameParams] = params;
    const name = nameParams.join(' ');

    if (!type) {
      return {
        success: false,
        error: 'Agent type required',
        availableTypes: [
          'researcher', 'coder', 'analyst', 'optimizer', 'coordinator',
          'tester', 'reviewer', 'architect', 'documenter'
        ]
      };
    }

    console.log(`🤖 Spawning ${type} agent${name ? ` named "${name}"` : ''}...`);

    const prompt = `
🤖 **SPAWN AGENT**

**Agent Configuration:**
- Type: ${type}
- Name: ${name || `${type}-${Date.now()}`}

**Use both MCP coordination and Claude Code execution:**

\`\`\`javascript
// Step 1: Register agent with MCP coordination
mcp__claude-flow__agent_spawn({
  type: "${type}",
  name: "${name || `${type}-${Date.now()}`}",
  capabilities: ["${type}-specific-capabilities"]
});

// Step 2: Spawn actual working agent with Claude Code's Task tool
Task("${name || `${type} Agent`}", "Execute ${type} tasks with coordination hooks", "${type}")
\`\`\`

**Agent Instructions:**
The agent should use hooks for coordination:
- Pre-task: \`npx claude-flow@alpha hooks pre-task\`
- Post-edit: \`npx claude-flow@alpha hooks post-edit\`
- Post-task: \`npx claude-flow@alpha hooks post-task\`

**Execute this agent spawn now**:
`;

    return {
      success: true,
      prompt: prompt,
      agentType: type,
      agentName: name || `${type}-${Date.now()}`
    };
  }

  async orchestrateTask(params) {
    const task = params.join(' ');

    if (!task) {
      return {
        success: false,
        error: 'Task description required'
      };
    }

    console.log(`🎯 Orchestrating task: ${task}`);

    const prompt = `
🎯 **TASK ORCHESTRATION**

**Task:** ${task}

**Orchestrate with coordinated agents:**

\`\`\`javascript
// Step 1: Set up task orchestration
mcp__claude-flow__task_orchestrate({
  task: "${task}",
  strategy: "adaptive",
  priority: "high"
});

// Step 2: Spawn coordinated agents with Claude Code's Task tool
Task("Task Coordinator", "Break down and coordinate: ${task}", "coordinator")
Task("Implementation Agent", "Execute main implementation for: ${task}", "coder")
Task("Quality Agent", "Ensure quality and testing for: ${task}", "tester")
Task("Review Agent", "Review and validate: ${task}", "reviewer")
\`\`\`

**Coordination Protocol:**
1. Each agent uses hooks for coordination
2. Shared memory for context and progress
3. Automatic load balancing and optimization

**Execute this task orchestration now**:
`;

    return {
      success: true,
      prompt: prompt,
      task: task,
      taskId: `task-${Date.now()}`
    };
  }

  async monitorSwarm(params) {
    const [duration = '30'] = params;
    const monitorDuration = parseInt(duration);

    console.log(`👁️ Monitoring swarm for ${monitorDuration} seconds...`);

    const prompt = `
👁️ **SWARM MONITORING**

**Monitor swarm activity:**

\`\`\`javascript
// Real-time swarm monitoring
mcp__claude-flow__swarm_monitor({
  interval: 5,
  duration: ${monitorDuration}
});

// Performance metrics
mcp__claude-flow__performance_report({ format: "detailed" });

// Agent performance
mcp__claude-flow__agent_metrics({ metric: "performance" });
\`\`\`

**Monitoring Dashboard:**
- Agent status and performance
- Task progress and completion
- Resource utilization
- Coordination efficiency

**Execute this monitoring now**:
`;

    return {
      success: true,
      prompt: prompt,
      duration: monitorDuration
    };
  }

  async scaleSwarm(params) {
    const [targetSize] = params;
    const newSize = parseInt(targetSize);

    if (isNaN(newSize) || newSize < 1 || newSize > 100) {
      return {
        success: false,
        error: 'Target size must be between 1 and 100'
      };
    }

    console.log(`📈 Scaling swarm to ${newSize} agents...`);

    const prompt = `
📈 **SWARM SCALING**

**Scale to ${newSize} agents:**

\`\`\`javascript
// Auto-scale swarm
mcp__claude-flow__swarm_scale({
  targetSize: ${newSize}
});

// Optimize topology for new size
mcp__claude-flow__topology_optimize();

// Rebalance tasks
mcp__claude-flow__load_balance({ tasks: ["current-tasks"] });
\`\`\`

**Scaling Strategy:**
- Graceful addition/removal of agents
- Automatic task redistribution
- Topology optimization
- Performance monitoring

**Execute this scaling now**:
`;

    return {
      success: true,
      prompt: prompt,
      targetSize: newSize
    };
  }

  async destroySwarm(params) {
    console.log('🛑 Destroying swarm...');

    const prompt = `
🛑 **SWARM DESTRUCTION**

**Gracefully shutdown swarm:**

\`\`\`javascript
// Step 1: Complete current tasks
mcp__claude-flow__task_status({ detailed: true });

// Step 2: Save state and metrics
mcp__claude-flow__state_snapshot({ name: "final-state" });

// Step 3: Destroy swarm
mcp__claude-flow__swarm_destroy();
\`\`\`

**Shutdown Checklist:**
- ✅ Complete active tasks
- ✅ Save coordination state
- ✅ Export performance metrics
- ✅ Clean up resources
- ✅ Graceful agent termination

**Execute this shutdown now**:
`;

    return {
      success: true,
      prompt: prompt,
      action: 'destroy'
    };
  }
}

export default SwarmCommand;
