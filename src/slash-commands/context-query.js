#!/usr/bin/env node

/**
 * Context Query Slash Command
 *
 * Query and retrieve project context information
 */

export class ContextQueryCommand {
  constructor() {
    this.name = 'context-query';
    this.description = 'Query project context information and memory';
    this.usage = '/context-query [key] [--format json|table] [--level agent|team|swarm|project|system]';
  }

  /**
   * Execute the context query command
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
        agentId: context.agentId || 'context-query',
        dbPath: context.dbPath || './swarm-memory.db'
      });
      await memory.initialize();

      let results;

      if (options.key) {
        // Query specific key
        results = await memory.memoryAdapter.get(options.key, {
          agentId: context.agentId,
          aclLevel: this.getAclLevel(options.level)
        });
      } else {
        // List all keys for the level
        const pattern = options.level ?
          `cfn/phase-${context.phaseId || '*'}/loop*/*` :
          '*';
        results = await memory.memoryAdapter.getPattern(pattern, {
          agentId: context.agentId,
          aclLevel: this.getAclLevel(options.level)
        });
      }

      return {
        success: true,
        query: {
          key: options.key,
          level: options.level,
          format: options.format
        },
        results: results,
        count: Array.isArray(results) ? results.length : 1,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: `Context query failed: ${error.message}`,
        query: options
      };
    }
  }

  /**
   * Parse command arguments
   * @param {Array<string>} args - Command arguments
   */
  parseArgs(args) {
    const options = {
      key: null,
      format: 'table',
      level: 'project'
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (key === 'format') {
          options.format = value || 'table';
        } else if (key === 'level') {
          options.level = value || 'project';
        }
      } else if (!options.key) {
        options.key = arg;
      }
    }

    return options;
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
   * Get help information
   */
  getHelp() {
    return {
      name: this.name,
      description: this.description,
      usage: this.usage,
      examples: [
        '/context-query',
        '/context-query cfn/phase-auth/loop3/coder-1/confidence',
        '/context-query --format json',
        '/context-query --level agent "swarm-state"',
        '/context-query "user-preferences" --format table --level project'
      ],
      options: [
        {
          name: 'key',
          description: 'Specific context key to query (optional, queries all if not provided)'
        },
        {
          name: '--format',
          description: 'Output format: json or table (default: table)'
        },
        {
          name: '--level',
          description: 'ACL level: agent, team, swarm, project, system (default: project)'
        }
      ]
    };
  }
}

export default ContextQueryCommand;