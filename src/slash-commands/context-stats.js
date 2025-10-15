#!/usr/bin/env node

/**
 * Context Stats Slash Command
 *
 * Display context statistics and metrics
 */

export class ContextStatsCommand {
  constructor() {
    this.name = 'context-stats';
    this.description = 'Display context statistics and metrics';
    this.usage = '/context-stats [--level acl] [--pattern pattern] [--format table|json]';
  }

  /**
   * Execute the context stats command
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
        agentId: context.agentId || 'context-stats',
        dbPath: context.dbPath || './swarm-memory.db'
      });
      await memory.initialize();

      const pattern = options.pattern || '*';
      const data = await memory.memoryAdapter.getPattern(pattern, {
        agentId: context.agentId || 'context-stats',
        aclLevel: this.getAclLevel(options.level) || 4
      });

      const stats = this.calculateStats(data);
      const formatted = this.formatStats(stats, options.format);

      return {
        success: true,
        stats: stats,
        formatted: formatted,
        pattern: pattern,
        level: options.level,
        format: options.format,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: `Context stats failed: ${error.message}`,
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
      level: null,
      pattern: null,
      format: 'table'
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (key === 'level') {
          options.level = value;
        } else if (key === 'pattern') {
          options.pattern = value;
        } else if (key === 'format') {
          options.format = value || 'table';
        }
      }
    }

    return options;
  }

  /**
   * Calculate statistics from data
   * @param {Array} data - Context data
   */
  calculateStats(data) {
    const stats = {
      overview: {
        totalEntries: data.length,
        totalSize: 0
      },
      distribution: {
        phases: new Map(),
        loops: new Map(),
        agents: new Map(),
        namespaces: new Map()
      },
      metrics: {
        confidenceScores: [],
        timestamps: [],
        ageDistribution: {
          under1h: 0,
          under24h: 0,
          under7d: 0,
          under30d: 0,
          over30d: 0
        }
      },
      patterns: {
        commonPrefixes: new Map(),
        keyDepth: new Map()
      }
    };

    const now = Date.now();

    for (const item of data) {
      // Overview metrics
      stats.overview.totalSize += JSON.stringify(item).length;

      // Extract distribution information
      this.extractDistributionInfo(item, stats.distribution);

      // Extract metrics
      this.extractMetrics(item, stats.metrics, now);

      // Extract patterns
      this.extractPatterns(item, stats.patterns);
    }

    // Convert Maps to sorted arrays and calculate derived metrics
    this.finalizeStats(stats);

    return stats;
  }

  /**
   * Extract distribution information from item
   * @param {Object} item - Context item
   * @param {Object} distribution - Distribution stats
   */
  extractDistributionInfo(item, distribution) {
    const key = item.key;

    // Extract phase
    const phaseMatch = key.match(/phase-([^\/]+)/);
    if (phaseMatch) {
      const phase = phaseMatch[1];
      distribution.phases.set(phase, (distribution.phases.get(phase) || 0) + 1);
    }

    // Extract loop
    const loopMatch = key.match(/loop(\d+)/);
    if (loopMatch) {
      const loop = loopMatch[1];
      distribution.loops.set(loop, (distribution.loops.get(loop) || 0) + 1);
    }

    // Extract agent
    const agentMatch = key.match(/\/([^\/]+)\/[^\/]*$/);
    if (agentMatch) {
      const agent = agentMatch[1];
      distribution.agents.set(agent, (distribution.agents.get(agent) || 0) + 1);
    }

    // Extract namespace
    if (item.namespace) {
      distribution.namespaces.set(item.namespace, (distribution.namespaces.get(item.namespace) || 0) + 1);
    }
  }

  /**
   * Extract metrics from item
   * @param {Object} item - Context item
   * @param {Object} metrics - Metrics stats
   * @param {number} now - Current timestamp
   */
  extractMetrics(item, metrics, now) {
    // Confidence scores
    if (item.value && typeof item.value === 'object' && item.value.confidence) {
      metrics.confidenceScores.push(item.value.confidence);
    }

    // Timestamps
    const timestamp = item.value?.timestamp || item.timestamp;
    if (timestamp) {
      metrics.timestamps.push(timestamp);

      // Age distribution
      const age = now - timestamp;
      const oneHour = 60 * 60 * 1000;
      const oneDay = 24 * oneHour;
      const sevenDays = 7 * oneDay;
      const thirtyDays = 30 * oneDay;

      if (age < oneHour) {
        metrics.ageDistribution.under1h++;
      } else if (age < oneDay) {
        metrics.ageDistribution.under24h++;
      } else if (age < sevenDays) {
        metrics.ageDistribution.under7d++;
      } else if (age < thirtyDays) {
        metrics.ageDistribution.under30d++;
      } else {
        metrics.ageDistribution.over30d++;
      }
    }
  }

  /**
   * Extract patterns from item
   * @param {Object} item - Context item
   * @param {Object} patterns - Pattern stats
   */
  extractPatterns(item, patterns) {
    const key = item.key;

    // Common prefixes (first 2 segments)
    const segments = key.split('/');
    if (segments.length >= 2) {
      const prefix = segments.slice(0, 2).join('/');
      patterns.commonPrefixes.set(prefix, (patterns.commonPrefixes.get(prefix) || 0) + 1);
    }

    // Key depth
    const depth = segments.length;
    patterns.keyDepth.set(depth, (patterns.keyDepth.get(depth) || 0) + 1);
  }

  /**
   * Finalize statistics calculations
   * @param {Object} stats - Statistics object
   */
  finalizeStats(stats) {
    // Convert Maps to sorted arrays
    stats.distribution.phases = this.sortMap(stats.distribution.phases);
    stats.distribution.loops = this.sortMap(stats.distribution.loops);
    stats.distribution.agents = this.sortMap(stats.distribution.agents);
    stats.distribution.namespaces = this.sortMap(stats.distribution.namespaces);
    stats.patterns.commonPrefixes = this.sortMap(stats.patterns.commonPrefixes);
    stats.patterns.keyDepth = this.sortMap(stats.patterns.keyDepth);

    // Calculate confidence statistics
    if (stats.metrics.confidenceScores.length > 0) {
      const scores = stats.metrics.confidenceScores;
      stats.metrics.avgConfidence = scores.reduce((a, b) => a + b, 0) / scores.length;
      stats.metrics.minConfidence = Math.min(...scores);
      stats.metrics.maxConfidence = Math.max(...scores);
    }

    // Calculate timestamp statistics
    if (stats.metrics.timestamps.length > 0) {
      const timestamps = stats.metrics.timestamps;
      stats.metrics.oldestEntry = new Date(Math.min(...timestamps)).toISOString();
      stats.metrics.newestEntry = new Date(Math.max(...timestamps)).toISOString();
    }

    // Format size
    stats.overview.totalSize = this.formatBytes(stats.overview.totalSize);

    // Calculate derived metrics
    stats.derived = {
      avgEntriesPerPhase: stats.distribution.phases.length > 0 ?
        stats.overview.totalEntries / stats.distribution.phases.length : 0,
      avgEntriesPerAgent: stats.distribution.agents.length > 0 ?
        stats.overview.totalEntries / stats.distribution.agents.length : 0,
      recentEntriesRate: stats.metrics.ageDistribution.under24h / stats.overview.totalEntries
    };
  }

  /**
   * Sort Map by value (descending) and convert to array
   * @param {Map} map - Map to sort
   */
  sortMap(map) {
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Top 10
      .map(([key, value]) => ({ key, value }));
  }

  /**
   * Format statistics for display
   * @param {Object} stats - Statistics object
   * @param {string} format - Format type (table or json)
   */
  formatStats(stats, format) {
    if (format === 'json') {
      return JSON.stringify(stats, null, 2);
    }

    // Table format
    let output = '';

    // Overview section
    output += '📊 **Context Statistics Overview**\n\n';
    output += `| Metric | Value |\n`;
    output += `|--------|-------|\n`;
    output += `| Total Entries | ${stats.overview.totalEntries} |\n`;
    output += `| Total Size | ${stats.overview.totalSize} |\n`;
    output += `| Unique Phases | ${stats.distribution.phases.length} |\n`;
    output += `| Unique Agents | ${stats.distribution.agents.length} |\n`;
    output += `| Unique Namespaces | ${stats.distribution.namespaces.length} |\n\n`;

    // Confidence metrics
    if (stats.metrics.avgConfidence !== undefined) {
      output += '**Confidence Metrics**\n\n';
      output += `| Metric | Value |\n`;
      output += `|--------|-------|\n`;
      output += `| Average | ${(stats.metrics.avgConfidence * 100).toFixed(1)}% |\n`;
      output += `| Minimum | ${(stats.metrics.minConfidence * 100).toFixed(1)}% |\n`;
      output += `| Maximum | ${(stats.metrics.maxConfidence * 100).toFixed(1)}% |\n\n`;
    }

    // Age distribution
    output += '**Age Distribution**\n\n';
    output += `| Age Range | Count | Percentage |\n`;
    output += `|-----------|-------|------------|\n`;
    const total = stats.overview.totalEntries;
    output += `| < 1 hour | ${stats.metrics.ageDistribution.under1h} | ${(stats.metrics.ageDistribution.under1h / total * 100).toFixed(1)}% |\n`;
    output += `| < 24 hours | ${stats.metrics.ageDistribution.under24h} | ${(stats.metrics.ageDistribution.under24h / total * 100).toFixed(1)}% |\n`;
    output += `| < 7 days | ${stats.metrics.ageDistribution.under7d} | ${(stats.metrics.ageDistribution.under7d / total * 100).toFixed(1)}% |\n`;
    output += `| < 30 days | ${stats.metrics.ageDistribution.under30d} | ${(stats.metrics.ageDistribution.under30d / total * 100).toFixed(1)}% |\n`;
    output += `| > 30 days | ${stats.metrics.ageDistribution.over30d} | ${(stats.metrics.ageDistribution.over30d / total * 100).toFixed(1)}% |\n\n`;

    // Top phases
    if (stats.distribution.phases.length > 0) {
      output += '**Top Phases**\n\n';
      output += `| Phase | Entries |\n`;
      output += `|-------|----------|\n`;
      stats.distribution.phases.slice(0, 5).forEach(item => {
        output += `| ${item.key} | ${item.value} |\n`;
      });
      output += '\n';
    }

    // Top agents
    if (stats.distribution.agents.length > 0) {
      output += '**Top Agents**\n\n';
      output += `| Agent | Entries |\n`;
      output += `|-------|----------|\n`;
      stats.distribution.agents.slice(0, 5).forEach(item => {
        output += `| ${item.key} | ${item.value} |\n`;
      });
      output += '\n';
    }

    // Time range
    if (stats.metrics.oldestEntry && stats.metrics.newestEntry) {
      output += '**Time Range**\n\n';
      output += `- Oldest: ${stats.metrics.oldestEntry}\n`;
      output += `- Newest: ${stats.metrics.newestEntry}\n\n`;
    }

    return output;
  }

  /**
   * Convert level string to ACL level number
   * @param {string} level - Level string
   */
  getAclLevel(level) {
    const levels = {
      'agent': 1,
      'team': 2,
      'swarm': 3,
      'project': 4,
      'system': 5
    };
    return levels[level] || 4;
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes - Bytes
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
        '/context-stats',
        '/context-stats --level project',
        '/context-stats --pattern "cfn/phase-auth/*"',
        '/context-stats --format json',
        '/context-stats --level swarm --pattern "loop3/*"'
      ],
      options: [
        {
          name: '--level',
          description: 'ACL level: agent, team, swarm, project, system (default: project)'
        },
        {
          name: '--pattern',
          description: 'Pattern for matching keys (default: *)'
        },
        {
          name: '--format',
          description: 'Output format: table or json (default: table)'
        }
      ]
    };
  }
}

export default ContextStatsCommand;