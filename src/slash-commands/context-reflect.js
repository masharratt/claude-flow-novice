#!/usr/bin/env node

/**
 * Context Reflect Slash Command
 *
 * Reflect on and analyze project context patterns
 */

export class ContextReflectCommand {
  constructor() {
    this.name = 'context-reflect';
    this.description = 'Reflect on and analyze project context patterns';
    this.usage = '/context-reflect [--phase id] [--loop number] [--agent id] [--summary]';
  }

  /**
   * Execute the context reflect command
   * @param {Array<string>} args - Command arguments
   * @param {Object} context - Execution context
   */
  async execute(args, context = {}) {
    const options = this.parseArgs(args);

    try {
      // Import dynamically to avoid circular dependencies
      const { SQLiteMemorySystem } = await import('../memory/sqlite-memory-system.js');
      const memory = new SQLiteMemorySystem({
        swarmId: context.swarmId || 'default',
        agentId: context.agentId || 'context-reflect',
        dbPath: context.dbPath || './swarm-memory.db'
      });
      await memory.initialize();

      const reflections = [];

      // Analyze phase patterns
      if (options.phase) {
        const phasePattern = `cfn/phase-${options.phase}/loop*/*`;
        const phaseData = await memory.memoryAdapter.getPattern(phasePattern, {
          agentId: context.agentId,
          aclLevel: 3 // swarm level
        });

        reflections.push(this.analyzePhasePatterns(options.phase, phaseData));
      }

      // Analyze loop patterns
      if (options.loop) {
        const loopPattern = `cfn/phase-*/loop${options.loop}/*`;
        const loopData = await memory.memoryAdapter.getPattern(loopPattern, {
          agentId: context.agentId,
          aclLevel: 3
        });

        reflections.push(this.analyzeLoopPatterns(options.loop, loopData));
      }

      // Analyze agent patterns
      if (options.agent) {
        const agentPattern = `cfn/phase-*/loop*/${options.agent}/*`;
        const agentData = await memory.memoryAdapter.getPattern(agentPattern, {
          agentId: context.agentId,
          aclLevel: 1 // agent level (self-access)
        });

        reflections.push(this.analyzeAgentPatterns(options.agent, agentData));
      }

      // Generate overall summary
      if (options.summary || (!options.phase && !options.loop && !options.agent)) {
        const summaryPattern = 'cfn/phase-*/loop*/*';
        const allData = await memory.memoryAdapter.getPattern(summaryPattern, {
          agentId: context.agentId,
          aclLevel: 3
        });

        reflections.push(this.generateSummary(allData));
      }

      return {
        success: true,
        reflections: reflections,
        options: options,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: `Context reflection failed: ${error.message}`,
        options: options
      };
    }
  }

  /**
   * Parse command arguments
   * @param {Array<string>} args - Command arguments
   */
  parseArgs(args) {
    const options = {
      phase: null,
      loop: null,
      agent: null,
      summary: false
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (key === 'phase') {
          options.phase = value;
        } else if (key === 'loop') {
          options.loop = parseInt(value) || null;
        } else if (key === 'agent') {
          options.agent = value;
        } else if (key === 'summary') {
          options.summary = true;
        }
      }
    }

    return options;
  }

  /**
   * Analyze phase patterns
   * @param {string} phaseId - Phase identifier
   * @param {Array} phaseData - Phase data
   */
  analyzePhasePatterns(phaseId, phaseData) {
    const loops = {};
    let totalConfidence = 0;
    let confidenceCount = 0;

    phaseData.forEach(item => {
      const match = item.key.match(/loop(\d+)/);
      if (match) {
        const loopNum = match[1];
        if (!loops[loopNum]) {
          loops[loopNum] = { count: 0, confidence: 0 };
        }
        loops[loopNum].count++;

        if (item.value && typeof item.value === 'object' && item.value.confidence) {
          loops[loopNum].confidence += item.value.confidence;
          totalConfidence += item.value.confidence;
          confidenceCount++;
        }
      }
    });

    // Calculate averages
    Object.keys(loops).forEach(loop => {
      if (loops[loop].count > 0) {
        loops[loop].avgConfidence = loops[loop].confidence / loops[loop].count;
      }
    });

    return {
      type: 'phase',
      phaseId: phaseId,
      loops: loops,
      totalEntries: phaseData.length,
      avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
      insights: this.generatePhaseInsights(loops)
    };
  }

  /**
   * Analyze loop patterns
   * @param {number} loopNum - Loop number
   * @param {Array} loopData - Loop data
   */
  analyzeLoopPatterns(loopNum, loopData) {
    const phases = {};
    const agents = new Set();
    let totalConfidence = 0;
    let confidenceCount = 0;

    loopData.forEach(item => {
      const phaseMatch = item.key.match(/phase-([^\/]+)/);
      const agentMatch = item.key.match(/\/([^\/]+)\/[^\/]*$/);

      if (phaseMatch) {
        const phaseId = phaseMatch[1];
        if (!phases[phaseId]) {
          phases[phaseId] = { count: 0, confidence: 0 };
        }
        phases[phaseId].count++;

        if (item.value && typeof item.value === 'object' && item.value.confidence) {
          phases[phaseId].confidence += item.value.confidence;
          totalConfidence += item.value.confidence;
          confidenceCount++;
        }
      }

      if (agentMatch) {
        agents.add(agentMatch[1]);
      }
    });

    // Calculate averages
    Object.keys(phases).forEach(phase => {
      if (phases[phase].count > 0) {
        phases[phase].avgConfidence = phases[phase].confidence / phases[phase].count;
      }
    });

    return {
      type: 'loop',
      loopNum: loopNum,
      phases: phases,
      uniqueAgents: Array.from(agents),
      totalEntries: loopData.length,
      avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
      insights: this.generateLoopInsights(phases, agents.size)
    };
  }

  /**
   * Analyze agent patterns
   * @param {string} agentId - Agent identifier
   * @param {Array} agentData - Agent data
   */
  analyzeAgentPatterns(agentId, agentData) {
    const loops = {};
    const phases = new Set();
    let totalConfidence = 0;
    let confidenceCount = 0;

    agentData.forEach(item => {
      const loopMatch = item.key.match(/loop(\d+)/);
      const phaseMatch = item.key.match(/phase-([^\/]+)/);

      if (loopMatch) {
        const loopNum = loopMatch[1];
        if (!loops[loopNum]) {
          loops[loopNum] = { count: 0, confidence: 0 };
        }
        loops[loopNum].count++;

        if (item.value && typeof item.value === 'object' && item.value.confidence) {
          loops[loopNum].confidence += item.value.confidence;
          totalConfidence += item.value.confidence;
          confidenceCount++;
        }
      }

      if (phaseMatch) {
        phases.add(phaseMatch[1]);
      }
    });

    // Calculate averages
    Object.keys(loops).forEach(loop => {
      if (loops[loop].count > 0) {
        loops[loop].avgConfidence = loops[loop].confidence / loops[loop].count;
      }
    });

    return {
      type: 'agent',
      agentId: agentId,
      loops: loops,
      uniquePhases: Array.from(phases),
      totalEntries: agentData.length,
      avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
      insights: this.generateAgentInsights(loops, phases.size)
    };
  }

  /**
   * Generate overall summary
   * @param {Array} allData - All data
   */
  generateSummary(allData) {
    const summary = {
      totalPhases: new Set(),
      totalLoops: new Set(),
      totalAgents: new Set(),
      totalEntries: allData.length,
      confidenceScores: []
    };

    allData.forEach(item => {
      const phaseMatch = item.key.match(/phase-([^\/]+)/);
      const loopMatch = item.key.match(/loop(\d+)/);
      const agentMatch = item.key.match(/\/([^\/]+)\/[^\/]*$/);

      if (phaseMatch) summary.totalPhases.add(phaseMatch[1]);
      if (loopMatch) summary.totalLoops.add(loopMatch[1]);
      if (agentMatch) summary.totalAgents.add(agentMatch[1]);

      if (item.value && typeof item.value === 'object' && item.value.confidence) {
        summary.confidenceScores.push(item.value.confidence);
      }
    });

    summary.avgConfidence = summary.confidenceScores.length > 0 ?
      summary.confidenceScores.reduce((a, b) => a + b, 0) / summary.confidenceScores.length : 0;

    summary.totalPhases = summary.totalPhases.size;
    summary.totalLoops = summary.totalLoops.size;
    summary.totalAgents = summary.totalAgents.size;

    return {
      type: 'summary',
      ...summary,
      insights: this.generateSummaryInsights(summary)
    };
  }

  /**
   * Generate phase insights
   * @param {Object} loops - Loop data
   */
  generatePhaseInsights(loops) {
    const insights = [];
    const loopNumbers = Object.keys(loops).map(Number).sort();

    if (loopNumbers.length > 1) {
      const avgConfidences = loopNumbers.map(loop => loops[loop].avgConfidence || 0);
      const maxConfidence = Math.max(...avgConfidences);
      const minConfidence = Math.min(...avgConfidences);

      if (maxConfidence - minConfidence > 0.2) {
        insights.push(`Significant confidence variation between loops (${(maxConfidence - minConfidence).toFixed(2)})`);
      }

      if (avgConfidences[avgConfidences.length - 1] > avgConfidences[0]) {
        insights.push('Confidence improves through loops - positive progression');
      }
    }

    return insights;
  }

  /**
   * Generate loop insights
   * @param {Object} phases - Phase data
   * @param {number} agentCount - Number of agents
   */
  generateLoopInsights(phases, agentCount) {
    const insights = [];
    const phaseCount = Object.keys(phases).length;

    if (phaseCount > 1) {
      insights.push(`Loop spans ${phaseCount} phases`);
    }

    if (agentCount > 5) {
      insights.push(`High agent participation: ${agentCount} agents`);
    }

    return insights;
  }

  /**
   * Generate agent insights
   * @param {Object} loops - Loop data
   * @param {number} phaseCount - Number of phases
   */
  generateAgentInsights(loops, phaseCount) {
    const insights = [];
    const loopCount = Object.keys(loops).length;

    if (loopCount > 2) {
      insights.push(`Agent participates in ${loopCount} different loops`);
    }

    if (phaseCount > 1) {
      insights.push(`Agent works across ${phaseCount} phases`);
    }

    return insights;
  }

  /**
   * Generate summary insights
   * @param {Object} summary - Summary data
   */
  generateSummaryInsights(summary) {
    const insights = [];

    if (summary.totalPhases > 0) {
      insights.push(`Project spans ${summary.totalPhases} phases`);
    }

    if (summary.totalLoops > 0) {
      insights.push(`Uses ${summary.totalLoops} different loop types`);
    }

    if (summary.totalAgents > 0) {
      insights.push(`Involves ${summary.totalAgents} agents`);
    }

    if (summary.avgConfidence > 0) {
      if (summary.avgConfidence > 0.8) {
        insights.push('High overall confidence (>0.8)');
      } else if (summary.avgConfidence < 0.6) {
        insights.push('Low overall confidence (<0.6) - may need attention');
      } else {
        insights.push('Moderate confidence levels');
      }
    }

    return insights;
  }

  /**
   * Get help information
   */
  getHelp() {
    return {
      name: this.name,
      description: this.description,
      usage: this.usage,
      examples: [
        '/context-reflect --summary',
        '/context-reflect --phase auth',
        '/context-reflect --loop 3',
        '/context-reflect --agent coder-1',
        '/context-reflect --phase auth --loop 3'
      ],
      options: [
        {
          name: '--phase',
          description: 'Analyze specific phase patterns'
        },
        {
          name: '--loop',
          description: 'Analyze specific loop patterns (1, 2, 3, 4)'
        },
        {
          name: '--agent',
          description: 'Analyze specific agent patterns'
        },
        {
          name: '--summary',
          description: 'Generate overall project summary'
        }
      ]
    };
  }
}

export default ContextReflectCommand;