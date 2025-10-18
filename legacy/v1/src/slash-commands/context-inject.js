#!/usr/bin/env node

/**
 * Context Inject Slash Command
 *
 * Inject context data into the memory system
 */

export class ContextInjectCommand {
  constructor() {
    this.name = 'context-inject';
    this.description = 'Inject context data into the memory system';
    this.usage = '/context-inject <key> <value> [--level acl] [--namespace ns] [--ttl duration]';
  }

  /**
   * Execute the context inject command
   * @param {Array<string>} args - Command arguments
   * @param {Object} context - Execution context
   */
  async execute(args, context = {}) {
    if (args.length < 2) {
      return {
        success: false,
        error: 'Key and value required. Usage: /context-inject <key> <value> [options]'
      };
    }

    const key = args[0];
    const value = args[1];
    const options = this.parseArgs(args.slice(2));

    try {
      // Parse value if it's JSON
      let parsedValue;
      try {
        parsedValue = JSON.parse(value);
      } catch {
        parsedValue = value;
      }

      // Add metadata
      const dataToInject = {
        value: parsedValue,
        timestamp: Date.now(),
        injectedBy: context.agentId || 'context-inject',
        ...options.metadata
      };

      // Import dynamically to avoid circular dependencies
      const { SQLiteMemorySystem } = await import('../memory/sqlite-memory-system.js');
      const memory = new SQLiteMemorySystem({
        swarmId: context.swarmId || 'default',
        agentId: context.agentId || 'context-inject',
        dbPath: context.dbPath || './swarm-memory.db'
      });
      await memory.initialize();

      await memory.memoryAdapter.set(key, dataToInject, {
        agentId: context.agentId || 'context-inject',
        aclLevel: this.getAclLevel(options.level) || 4,
        namespace: options.namespace,
        ttl: options.ttl ? this.parseDuration(options.ttl) : undefined
      });

      return {
        success: true,
        key: key,
        value: parsedValue,
        options: options,
        timestamp: new Date().toISOString(),
        message: `Context injected for key: ${key}`
      };
    } catch (error) {
      return {
        success: false,
        error: `Context injection failed: ${error.message}`,
        key: key,
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
      namespace: null,
      ttl: null,
      metadata: {}
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (key === 'level') {
          options.level = value;
        } else if (key === 'namespace') {
          options.namespace = value;
        } else if (key === 'ttl') {
          options.ttl = value;
        } else if (key === 'confidence' && value) {
          options.metadata.confidence = parseFloat(value);
        } else if (key === 'phase' && value) {
          options.metadata.phase = value;
        } else if (key === 'loop' && value) {
          options.metadata.loop = parseInt(value);
        }
      }
    }

    return options;
  }

  /**
   * Parse duration string to milliseconds
   * @param {string} duration - Duration string (e.g., "7d", "24h", "30m")
   */
  parseDuration(duration) {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) return null;

    const [, amount, unit] = match;
    const multipliers = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };

    return parseInt(amount) * multipliers[unit];
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
        '/context-inject "user-preferences" \'{"theme":"dark","lang":"en"}\'',
        '/context-inject "cfn/phase-auth/loop3/coder-1/confidence" 0.85 --level agent',
        '/context-inject "project-status" "in-progress" --namespace status --ttl 1h',
        '/context-inject "agent-result" \'{"files":["auth.js"],"tests":true}\' --confidence 0.9 --phase auth --loop 3'
      ],
      options: [
        {
          name: 'key',
          description: 'Context key to inject'
        },
        {
          name: 'value',
          description: 'Value to inject (JSON or string)'
        },
        {
          name: '--level',
          description: 'ACL level: agent, team, swarm, project, system (default: project)'
        },
        {
          name: '--namespace',
          description: 'Namespace for organization'
        },
        {
          name: '--ttl',
          description: 'Time to live (e.g., 1h, 30m, 7d)'
        },
        {
          name: '--confidence',
          description: 'Confidence score (0-1)'
        },
        {
          name: '--phase',
          description: 'Phase identifier'
        },
        {
          name: '--loop',
          description: 'Loop number'
        }
      ]
    };
  }
}

export default ContextInjectCommand;