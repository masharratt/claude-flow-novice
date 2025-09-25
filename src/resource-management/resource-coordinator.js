/**
 * Resource Management Coordinator
 *
 * Manages resource-heavy command execution across swarm agents
 * Provides delegation options: distributed execution vs single-agent delegation
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { performance } from 'perf_hooks';

export class ResourceCoordinator {
  constructor() {
    this.preferences = null;
    this.resourceMonitor = new ResourceMonitor();
    this.delegationStrategies = new Map();
    this.activeCommands = new Map();
    this.commandHistory = [];

    // Initialize delegation strategies
    this.setupDelegationStrategies();
  }

  async initialize() {
    await this.loadPreferences();
    await this.resourceMonitor.initialize();

    // Setup command interceptors
    this.setupCommandInterceptors();
  }

  async loadPreferences() {
    try {
      const prefsPath = join(process.cwd(), '.claude-flow-novice/preferences/user-global.json');
      const data = await readFile(prefsPath, 'utf8');
      const prefs = JSON.parse(data);

      this.preferences = {
        resourceDelegation: prefs.preferences?.resourceDelegation || {
          mode: 'adaptive', // 'distributed', 'single-delegate', 'adaptive'
          heavyCommandThreshold: 5000, // ms
          maxConcurrentHeavyCommands: 2,
          preferredDelegate: 'auto', // 'auto', 'performance-optimized', 'specific-agent'
          resourceLimits: {
            cpu: 80, // percentage
            memory: 75, // percentage
            network: 90 // percentage
          }
        },
        commands: prefs.preferences?.resourceDelegation?.commands || {
          heavyCommands: [
            'npm test',
            'npm run test',
            'jest',
            'vitest',
            'npm run build',
            'tsc',
            'webpack',
            'vite build',
            'cargo build',
            'cargo test',
            'go build',
            'go test',
            'python -m pytest',
            'mvn test',
            'gradle build',
            'docker build'
          ],
          delegationRules: {
            'test': 'single-delegate',
            'build': 'adaptive',
            'compile': 'single-delegate',
            'lint': 'distributed'
          }
        }
      };
    } catch (error) {
      // Use defaults if preferences don't exist
      this.preferences = this.getDefaultPreferences();
    }
  }

  getDefaultPreferences() {
    return {
      resourceDelegation: {
        mode: 'adaptive',
        heavyCommandThreshold: 5000,
        maxConcurrentHeavyCommands: 2,
        preferredDelegate: 'auto',
        resourceLimits: {
          cpu: 80,
          memory: 75,
          network: 90
        }
      },
      commands: {
        heavyCommands: [
          'npm test', 'npm run test', 'jest', 'vitest',
          'npm run build', 'tsc', 'webpack', 'vite build',
          'cargo build', 'cargo test', 'go build', 'go test',
          'python -m pytest', 'mvn test', 'gradle build'
        ],
        delegationRules: {
          'test': 'single-delegate',
          'build': 'adaptive',
          'compile': 'single-delegate',
          'lint': 'distributed'
        }
      }
    };
  }

  setupDelegationStrategies() {
    // Distributed strategy - all agents can execute
    this.delegationStrategies.set('distributed', {
      name: 'Distributed Execution',
      execute: async (command, agents) => {
        return await this.executeDistributed(command, agents);
      },
      shouldUse: (command, systemLoad) => {
        return systemLoad.cpu < 60 && systemLoad.memory < 60;
      }
    });

    // Single delegate strategy - one agent executes, others wait
    this.delegationStrategies.set('single-delegate', {
      name: 'Single Agent Delegation',
      execute: async (command, agents) => {
        return await this.executeSingleDelegate(command, agents);
      },
      shouldUse: (command, systemLoad) => {
        return systemLoad.cpu > 70 || systemLoad.memory > 70;
      }
    });

    // Adaptive strategy - chooses based on current conditions
    this.delegationStrategies.set('adaptive', {
      name: 'Adaptive Resource Management',
      execute: async (command, agents) => {
        return await this.executeAdaptive(command, agents);
      },
      shouldUse: () => true
    });
  }

  async executeCommand(command, agents, options = {}) {
    const isHeavyCommand = this.isHeavyCommand(command);
    const currentLoad = await this.resourceMonitor.getCurrentLoad();

    // Record command start
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const commandInfo = {
      id: commandId,
      command,
      isHeavy: isHeavyCommand,
      agents: agents.map(a => a.id),
      startTime: performance.now(),
      systemLoad: currentLoad
    };

    this.activeCommands.set(commandId, commandInfo);

    try {
      let result;

      if (isHeavyCommand) {
        result = await this.executeHeavyCommand(command, agents, currentLoad);
      } else {
        // Light commands can be distributed freely
        result = await this.executeDistributed(command, agents);
      }

      // Record success
      commandInfo.endTime = performance.now();
      commandInfo.duration = commandInfo.endTime - commandInfo.startTime;
      commandInfo.result = result;
      commandInfo.status = 'success';

      this.commandHistory.push({ ...commandInfo });
      this.activeCommands.delete(commandId);

      return result;

    } catch (error) {
      // Record failure
      commandInfo.endTime = performance.now();
      commandInfo.duration = commandInfo.endTime - commandInfo.startTime;
      commandInfo.error = error.message;
      commandInfo.status = 'failed';

      this.commandHistory.push({ ...commandInfo });
      this.activeCommands.delete(commandId);

      throw error;
    }
  }

  async executeHeavyCommand(command, agents, currentLoad) {
    const mode = this.preferences.resourceDelegation.mode;
    const strategy = this.delegationStrategies.get(mode);

    if (!strategy) {
      throw new Error(`Unknown delegation strategy: ${mode}`);
    }

    // Check if we can execute based on current conditions
    if (mode === 'adaptive') {
      const bestStrategy = this.chooseBestStrategy(command, currentLoad, agents);
      return await bestStrategy.execute(command, agents);
    }

    return await strategy.execute(command, agents);
  }

  chooseBestStrategy(command, currentLoad, agents) {
    const commandType = this.getCommandType(command);
    const specificRule = this.preferences.commands.delegationRules[commandType];

    // Use specific rule if available
    if (specificRule && this.delegationStrategies.has(specificRule)) {
      return this.delegationStrategies.get(specificRule);
    }

    // Adaptive choice based on system conditions
    if (currentLoad.cpu > 75 || currentLoad.memory > 80) {
      return this.delegationStrategies.get('single-delegate');
    }

    if (agents.length > 4 && (currentLoad.cpu > 50 || currentLoad.memory > 60)) {
      return this.delegationStrategies.get('single-delegate');
    }

    return this.delegationStrategies.get('distributed');
  }

  async executeDistributed(command, agents) {
    // All agents execute the command
    const results = await Promise.allSettled(
      agents.map(agent => this.executeOnAgent(command, agent))
    );

    return {
      strategy: 'distributed',
      results: results.map((result, index) => ({
        agent: agents[index].id,
        status: result.status,
        value: result.status === 'fulfilled' ? result.value : null,
        error: result.status === 'rejected' ? result.reason : null
      }))
    };
  }

  async executeSingleDelegate(command, agents) {
    const delegate = await this.selectDelegate(agents);

    try {
      const result = await this.executeOnAgent(command, delegate);

      // Distribute results to other agents
      await this.distributeResults(result, agents.filter(a => a.id !== delegate.id));

      return {
        strategy: 'single-delegate',
        delegate: delegate.id,
        result,
        distributed: true
      };

    } catch (error) {
      // Fallback to distributed execution if delegate fails
      console.warn(`Delegate ${delegate.id} failed, falling back to distributed execution`);
      return await this.executeDistributed(command, agents);
    }
  }

  async executeAdaptive(command, agents) {
    const bestStrategy = this.chooseBestStrategy(command, await this.resourceMonitor.getCurrentLoad(), agents);
    return await bestStrategy.execute(command, agents);
  }

  async selectDelegate(agents) {
    const preference = this.preferences.resourceDelegation.preferredDelegate;

    switch (preference) {
      case 'performance-optimized':
        return this.selectPerformanceOptimizedDelegate(agents);
      case 'specific-agent':
        return this.selectSpecificDelegate(agents);
      default:
        return this.selectAutoDelegate(agents);
    }
  }

  async selectAutoDelegate(agents) {
    // Score agents based on current performance and capabilities
    const scores = await Promise.all(
      agents.map(async (agent) => {
        const performance = await this.getAgentPerformance(agent);
        const load = await this.getAgentLoad(agent);

        return {
          agent,
          score: this.calculateDelegateScore(performance, load, agent)
        };
      })
    );

    // Sort by score and return best candidate
    scores.sort((a, b) => b.score - a.score);
    return scores[0].agent;
  }

  calculateDelegateScore(performance, load, agent) {
    let score = 100;

    // Penalize high CPU/memory usage
    score -= load.cpu * 0.5;
    score -= load.memory * 0.3;

    // Reward good performance history
    score += performance.successRate * 20;
    score += Math.max(0, 10 - performance.averageExecutionTime / 1000);

    // Prefer agents with relevant capabilities
    if (agent.capabilities?.includes('build') || agent.capabilities?.includes('test')) {
      score += 10;
    }

    return Math.max(0, score);
  }

  async distributeResults(result, agents) {
    // Share execution results with other agents via memory or messaging
    const distribution = agents.map(async (agent) => {
      try {
        await this.sendResultToAgent(result, agent);
        return { agent: agent.id, status: 'success' };
      } catch (error) {
        return { agent: agent.id, status: 'failed', error: error.message };
      }
    });

    return await Promise.allSettled(distribution);
  }

  async executeOnAgent(command, agent) {
    // Placeholder for actual agent execution
    // This would integrate with the existing agent system
    return {
      agent: agent.id,
      command,
      output: `Command executed on agent ${agent.id}`,
      exitCode: 0,
      duration: Math.random() * 2000 + 1000
    };
  }

  async sendResultToAgent(result, agent) {
    // Placeholder for result distribution
    // This would use the existing messaging/memory system
    console.log(`Distributing result to agent ${agent.id}`);
  }

  async getAgentPerformance(agent) {
    // Placeholder for performance metrics
    return {
      successRate: 0.85 + Math.random() * 0.15,
      averageExecutionTime: 2000 + Math.random() * 3000,
      errorRate: Math.random() * 0.1
    };
  }

  async getAgentLoad(agent) {
    // Placeholder for agent resource monitoring
    return {
      cpu: Math.random() * 50,
      memory: Math.random() * 40,
      network: Math.random() * 20
    };
  }

  isHeavyCommand(command) {
    const commandStr = command.toLowerCase().trim();

    return this.preferences.commands.heavyCommands.some(heavy =>
      commandStr.includes(heavy.toLowerCase()) ||
      commandStr.startsWith(heavy.toLowerCase())
    );
  }

  getCommandType(command) {
    const cmd = command.toLowerCase();

    if (cmd.includes('test') || cmd.includes('jest') || cmd.includes('pytest')) {
      return 'test';
    }
    if (cmd.includes('build') || cmd.includes('webpack') || cmd.includes('vite')) {
      return 'build';
    }
    if (cmd.includes('tsc') || cmd.includes('compile')) {
      return 'compile';
    }
    if (cmd.includes('lint') || cmd.includes('eslint')) {
      return 'lint';
    }

    return 'other';
  }

  setupCommandInterceptors() {
    // This would integrate with the existing CLI and hook system
    // to intercept commands before execution
  }

  async updatePreferences(newPreferences) {
    this.preferences = { ...this.preferences, ...newPreferences };

    // Save updated preferences
    const prefsPath = join(process.cwd(), '.claude-flow-novice/preferences/user-global.json');
    try {
      const currentData = await readFile(prefsPath, 'utf8');
      const prefs = JSON.parse(currentData);
      prefs.preferences.resourceDelegation = this.preferences.resourceDelegation;
      prefs.preferences.commands = this.preferences.commands;

      await writeFile(prefsPath, JSON.stringify(prefs, null, 2));
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  }

  getStats() {
    const recentHistory = this.commandHistory.slice(-100);
    const heavyCommands = recentHistory.filter(cmd => cmd.isHeavy);

    return {
      totalCommands: recentHistory.length,
      heavyCommands: heavyCommands.length,
      averageDuration: recentHistory.reduce((sum, cmd) => sum + cmd.duration, 0) / recentHistory.length,
      successRate: recentHistory.filter(cmd => cmd.status === 'success').length / recentHistory.length,
      strategiesUsed: this.getStrategyDistribution(heavyCommands),
      currentLoad: this.resourceMonitor.getCurrentLoad(),
      activeCommands: this.activeCommands.size
    };
  }

  getStrategyDistribution(commands) {
    const distribution = {};
    commands.forEach(cmd => {
      const strategy = cmd.result?.strategy || 'unknown';
      distribution[strategy] = (distribution[strategy] || 0) + 1;
    });
    return distribution;
  }
}

class ResourceMonitor {
  constructor() {
    this.currentLoad = {
      cpu: 0,
      memory: 0,
      network: 0
    };
  }

  async initialize() {
    // Start monitoring system resources
    this.startMonitoring();
  }

  startMonitoring() {
    // Simplified resource monitoring
    setInterval(async () => {
      this.currentLoad = await this.measureSystemLoad();
    }, 5000);
  }

  async getCurrentLoad() {
    return { ...this.currentLoad };
  }

  async measureSystemLoad() {
    // Placeholder for actual system monitoring
    // In real implementation, this would use system APIs
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      network: Math.random() * 100,
      timestamp: Date.now()
    };
  }
}

export default ResourceCoordinator;