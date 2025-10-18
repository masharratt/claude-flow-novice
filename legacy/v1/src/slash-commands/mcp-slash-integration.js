#!/usr/bin/env node

/**
 * MCP Slash Command Integration for Claude Code
 * This integrates slash commands with the MCP server so they appear in Claude Code
 */

import { ClaudeFlowNoviceMCPServer } from '../../dist/mcp/mcp-server-novice.js';

export class MCPSlashCommandIntegration {
  constructor(mcpServer) {
    this.mcpServer = mcpServer;
    this.slashCommands = this.initializeSlashCommands();
  }

  initializeSlashCommands() {
    return {
      'claude-soul': {
        name: 'claude-soul',
        description: 'Engage Claude\'s consciousness and self-awareness capabilities',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Consciousness prompt or question' }
          },
          required: ['prompt']
        }
      },
      'swarm': {
        name: 'swarm',
        description: 'AI swarm management and coordination',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['init', 'status', 'spawn', 'orchestrate', 'monitor', 'scale', 'destroy'] },
            params: { type: 'array', description: 'Additional parameters' }
          },
          required: ['action']
        }
      },
      'sparc': {
        name: 'sparc',
        description: 'Execute SPARC methodology phases',
        inputSchema: {
          type: 'object',
          properties: {
            phase: { type: 'string', enum: ['spec', 'pseudo', 'arch', 'refine', 'complete'] },
            task: { type: 'string', description: 'Task description' }
          },
          required: ['phase', 'task']
        }
      },
      'hooks': {
        name: 'hooks',
        description: 'Automation hooks management',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['enable', 'disable', 'pre-task', 'post-task', 'session-start', 'notify'] },
            params: { type: 'array', description: 'Additional parameters' }
          },
          required: ['action']
        }
      },
      'neural': {
        name: 'neural',
        description: 'Neural network training and management',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['status', 'train', 'patterns', 'predict', 'compress', 'explain'] },
            params: { type: 'array', description: 'Additional parameters' }
          },
          required: ['action']
        }
      },
      'performance': {
        name: 'performance',
        description: 'Performance monitoring and optimization',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['report', 'benchmark', 'bottleneck', 'tokens', 'trends', 'optimize'] },
            params: { type: 'array', description: 'Additional parameters' }
          },
          required: ['action']
        }
      }
    };
  }

  // Add slash commands to the MCP server's tools
  addSlashCommandsToMCPTools(tools) {
    const slashTools = {};

    for (const [commandName, commandDef] of Object.entries(this.slashCommands)) {
      slashTools[`slash_${commandName.replace('-', '_')}`] = {
        name: `slash_${commandName.replace('-', '_')}`,
        description: `Slash command: /${commandName} - ${commandDef.description}`,
        inputSchema: commandDef.inputSchema
      };
    }

    return { ...tools, ...slashTools };
  }

  // Execute slash command
  async executeSlashCommand(commandName, args) {
    const commandPath = `.claude/commands/${commandName}.js`;

    try {
      // Import and execute the command
      const { default: command } = await import(`../../../${commandPath}`);

      if (typeof command === 'function') {
        return await command(args);
      } else if (command && typeof command.execute === 'function') {
        return await command.execute(args);
      } else {
        // Fallback to direct node execution
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const argsList = Array.isArray(args) ? args : [args];
        const cmdArgs = argsList.join(' ');
        const result = await execAsync(`node ${commandPath} ${cmdArgs}`);

        return {
          success: true,
          command: commandName,
          output: result.stdout,
          error: result.stderr || null
        };
      }
    } catch (error) {
      return {
        success: false,
        command: commandName,
        error: error.message
      };
    }
  }
}

export default MCPSlashCommandIntegration;