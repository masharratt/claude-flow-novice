#!/usr/bin/env node
/**
 * ⚠️ DEPRECATED: MCP server has been removed in v2.0.0
 * Please use: claude-flow-novice start
 * See: MCP_DEPRECATION_NOTICE.md
 */

// Redirect to deprecation notice
import { fileURLToPath } from 'url';
import path from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

require('./DEPRECATED.js');
process.exit(1);

/* LEGACY CODE - NON-FUNCTIONAL

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EnhancedMemory } from '../memory/enhanced-memory.js';
// Use the same memory system that npx commands use - singleton instance
import { memoryStore } from '../memory/fallback-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Legacy agent type mapping for backward compatibility
const LEGACY_AGENT_MAPPING = {
  analyst: 'code-analyzer',
  coordinator: 'hierarchical-coordinator',
  optimizer: 'perf-analyzer',
  documenter: 'api-docs',
  monitor: 'performance-benchmarker',
  specialist: 'system-architect',
  architect: 'system-architect',
};

class ClaudeFlowNoviceMCPServer {
  constructor() {
    this.version = '2.0.0-novice';
    this.memoryStore = memoryStore; // Use shared singleton instance
    this.capabilities = {
      tools: {
        listChanged: true,
      },
      resources: {
        subscribe: true,
        listChanged: true,
      },
    };
    this.sessionId = `session-cfn-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    this.tools = this.initializeTools();
    this.resources = this.initializeResources();

    // Initialize shared memory store (same as npx commands)
    this.initializeMemory().catch((err) => {
      console.error(
        `[${new Date().toISOString()}] ERROR [claude-flow-novice-mcp] Failed to initialize shared memory:`,
        err,
      );
    });
  }

  async initializeMemory() {
    await this.memoryStore.initialize();
    console.error(
      `[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${this.sessionId}) Shared memory store initialized`,
    );
    console.error(
      `[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${this.sessionId}) Using ${this.memoryStore.isUsingFallback() ? 'in-memory' : 'SQLite'} storage`,
    );
  }

  initializeTools() {
    return {
      // Essential Swarm Coordination Tools (8)
      swarm_init: {
        name: 'swarm_init',
        description: 'Initialize swarm with topology and configuration',
        inputSchema: {
          type: 'object',
          properties: {
            topology: { type: 'string', enum: ['hierarchical', 'mesh', 'ring', 'star'] },
            maxAgents: { type: 'number', default: 8 },
            strategy: { type: 'string', default: 'auto' },
          },
          required: ['topology'],
        },
      },
      agent_spawn: {
        name: 'agent_spawn',
        description: 'Create specialized AI agents',
        inputSchema: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['coordinator', 'analyst', 'optimizer', 'documenter', 'monitor', 'specialist', 'architect', 'task-orchestrator', 'code-analyzer', 'perf-analyzer', 'api-docs', 'performance-benchmarker', 'system-architect', 'researcher', 'coder', 'tester', 'reviewer'] },
            name: { type: 'string' },
            capabilities: { type: 'array' },
            swarmId: { type: 'string' },
          },
          required: ['type'],
        },
      },
      task_orchestrate: {
        name: 'task_orchestrate',
        description: 'Orchestrate complex task workflows',
        inputSchema: {
          type: 'object',
          properties: {
            task: { type: 'string' },
            strategy: { type: 'string', enum: ['parallel', 'sequential', 'adaptive', 'balanced'] },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            dependencies: { type: 'array' },
          },
          required: ['task'],
        },
      },
      swarm_status: {
        name: 'swarm_status',
        description: 'Monitor swarm health and performance',
        inputSchema: {
          type: 'object',
          properties: { swarmId: { type: 'string' } },
        },
      },
      swarm_destroy: {
        name: 'swarm_destroy',
        description: 'Gracefully shutdown swarm',
        inputSchema: {
          type: 'object',
          properties: { swarmId: { type: 'string' } },
          required: ['swarmId'],
        },
      },
      swarm_scale: {
        name: 'swarm_scale',
        description: 'Auto-scale agent count',
        inputSchema: {
          type: 'object',
          properties: {
            swarmId: { type: 'string' },
            targetSize: { type: 'number' },
          },
        },
      },
      agent_list: {
        name: 'agent_list',
        description: 'List active agents & capabilities',
        inputSchema: {
          type: 'object',
          properties: { swarmId: { type: 'string' } },
        },
      },
      coordination_sync: {
        name: 'coordination_sync',
        description: 'Sync agent coordination',
        inputSchema: {
          type: 'object',
          properties: { swarmId: { type: 'string' } },
        },
      },
      session_extend: {
        name: 'session_extend',
        description: 'Extend MCP session timeout for long-running CFN loops (prevents disconnection during multi-hour operations)',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string' },
            extensionHours: { type: 'number', default: 4, minimum: 1, maximum: 24 },
          },
          required: ['sessionId'],
        },
      },

      // Essential Memory Management Tools (8)
      memory_usage: {
        name: 'memory_usage',
        description: 'Store/retrieve persistent memory with TTL and namespacing',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['store', 'retrieve', 'list', 'delete', 'search'] },
            key: { type: 'string' },
            value: { type: 'string' },
            namespace: { type: 'string', default: 'default' },
            ttl: { type: 'number' },
          },
          required: ['action'],
        },
      },
      memory_search: {
        name: 'memory_search',
        description: 'Search memory with patterns',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string' },
            namespace: { type: 'string' },
            limit: { type: 'number', default: 10 },
          },
          required: ['pattern'],
        },
      },
      memory_persist: {
        name: 'memory_persist',
        description: 'Cross-session persistence',
        inputSchema: {
          type: 'object',
          properties: { sessionId: { type: 'string' } },
        },
      },
      memory_namespace: {
        name: 'memory_namespace',
        description: 'Namespace management',
        inputSchema: {
          type: 'object',
          properties: {
            namespace: { type: 'string' },
            action: { type: 'string' },
          },
          required: ['namespace', 'action'],
        },
      },
      memory_backup: {
        name: 'memory_backup',
        description: 'Backup memory stores',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
      memory_restore: {
        name: 'memory_restore',
        description: 'Restore from backups',
        inputSchema: {
          type: 'object',
          properties: { backupPath: { type: 'string' } },
          required: ['backupPath'],
        },
      },
      cache_manage: {
        name: 'cache_manage',
        description: 'Manage coordination cache',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            key: { type: 'string' },
          },
          required: ['action'],
        },
      },
      state_snapshot: {
        name: 'state_snapshot',
        description: 'Create state snapshots',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
        },
      },

      // Essential Agent Lifecycle Tools (6)
      agent_metrics: {
        name: 'agent_metrics',
        description: 'Agent performance metrics',
        inputSchema: {
          type: 'object',
          properties: { agentId: { type: 'string' } },
        },
      },
      health_check: {
        name: 'health_check',
        description: 'System health monitoring',
        inputSchema: {
          type: 'object',
          properties: { components: { type: 'array' } },
        },
      },
      load_balance: {
        name: 'load_balance',
        description: 'Distribute tasks efficiently',
        inputSchema: {
          type: 'object',
          properties: {
            swarmId: { type: 'string' },
            tasks: { type: 'array' },
          },
        },
      },
      task_status: {
        name: 'task_status',
        description: 'Check task execution status',
        inputSchema: {
          type: 'object',
          properties: { taskId: { type: 'string' } },
          required: ['taskId'],
        },
      },
      task_results: {
        name: 'task_results',
        description: 'Get task completion results',
        inputSchema: {
          type: 'object',
          properties: { taskId: { type: 'string' } },
          required: ['taskId'],
        },
      },
      features_detect: {
        name: 'features_detect',
        description: 'Detect runtime features and capabilities',
        inputSchema: {
          type: 'object',
          properties: { component: { type: 'string' } },
        },
      },

      // Essential Language & Framework Tools (8)
      language_detect: {
        name: 'language_detect',
        description: 'Multi-language project analysis',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
      framework_detect: {
        name: 'framework_detect',
        description: 'Framework pattern recognition',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
      rust_validate: {
        name: 'rust_validate',
        description: 'Cargo test execution',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
      rust_quality_analyze: {
        name: 'rust_quality_analyze',
        description: 'Clippy/rustfmt/audit integration',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
      typescript_validate: {
        name: 'typescript_validate',
        description: 'TypeScript type safety',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
      dependency_analyze: {
        name: 'dependency_analyze',
        description: 'Dependency security scanning',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
      build_optimize: {
        name: 'build_optimize',
        description: 'Language-specific build optimization',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
      test_coordinate: {
        name: 'test_coordinate',
        description: 'Multi-language test coordination',
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },

      // Essential System Tools (6)
      diagnostic_run: {
        name: 'diagnostic_run',
        description: 'System diagnostics',
        inputSchema: {
          type: 'object',
          properties: { components: { type: 'array' } },
        },
      },
      backup_create: {
        name: 'backup_create',
        description: 'Create system backups',
        inputSchema: {
          type: 'object',
          properties: {
            components: { type: 'array' },
            destination: { type: 'string' },
          },
        },
      },
      restore_system: {
        name: 'restore_system',
        description: 'System restoration',
        inputSchema: {
          type: 'object',
          properties: { backupId: { type: 'string' } },
          required: ['backupId'],
        },
      },
      log_analysis: {
        name: 'log_analysis',
        description: 'Log analysis & insights',
        inputSchema: {
          type: 'object',
          properties: {
            logFile: { type: 'string' },
            patterns: { type: 'array' },
          },
          required: ['logFile'],
        },
      },
      config_manage: {
        name: 'config_manage',
        description: 'Configuration management',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            config: { type: 'object' },
          },
          required: ['action'],
        },
      },
      security_scan: {
        name: 'security_scan',
        description: 'Security scanning',
        inputSchema: {
          type: 'object',
          properties: {
            target: { type: 'string' },
            depth: { type: 'string' },
          },
          required: ['target'],
        },
      },
    };
  }

  initializeResources() {
    return {
      'claude-flow://swarms': {
        uri: 'claude-flow://swarms',
        name: 'Active Swarms',
        description: 'List of active swarm configurations and status',
        mimeType: 'application/json',
      },
      'claude-flow://agents': {
        uri: 'claude-flow://agents',
        name: 'Agent Registry',
        description: 'Registry of available agents and their capabilities',
        mimeType: 'application/json',
      },
      'claude-flow://memory': {
        uri: 'claude-flow://memory',
        name: 'Memory Store',
        description: 'Persistent memory and cache status',
        mimeType: 'application/json',
      },
      'claude-flow://system': {
        uri: 'claude-flow://system',
        name: 'System Status',
        description: 'Health and diagnostic information',
        mimeType: 'application/json',
      },
    };
  }

  async handleMessage(message) {
    try {
      const { id, method, params } = message;

      switch (method) {
        case 'initialize':
          return this.handleInitialize(id, params);
        case 'tools/list':
          return this.handleToolsList(id);
        case 'tools/call':
          return this.handleToolCall(id, params);
        case 'resources/list':
          return this.handleResourcesList(id);
        case 'resources/read':
          return this.handleResourceRead(id, params);
        default:
          return this.createErrorResponse(id, -32601, 'Method not found');
      }
    } catch (error) {
      return this.createErrorResponse(message.id, -32603, 'Internal error', error.message);
    }
  }

  handleInitialize(id, params) {
    console.error(
      `[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${this.sessionId}) 🔌 Connection established: ${this.sessionId}`,
    );

    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: this.capabilities,
        serverInfo: {
          name: 'claude-flow-novice',
          version: this.version,
        },
      },
    };
  }

  handleToolsList(id) {
    const toolsList = Object.values(this.tools);
    console.error(
      `[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${this.sessionId}) 📋 Tools listed: ${toolsList.length} tools available`,
    );
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: toolsList,
      },
    };
  }

  async handleToolCall(id, params) {
    const { name, arguments: args } = params;

    console.error(
      `[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${this.sessionId}) 🔧 Tool called: ${name}`,
    );

    try {
      const result = await this.executeTool(name, args);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        },
      };
    } catch (error) {
      console.error(
        `[${new Date().toISOString()}] ERROR [claude-flow-novice-mcp] (${this.sessionId}) Tool ${name} failed:`,
        error.message,
      );
      return this.createErrorResponse(id, -32000, 'Tool execution failed', error.message);
    }
  }

  async executeTool(name, args) {
    // Simplified tool execution - return success for core functionality
    switch (name) {
      case 'swarm_init':
        return {
          success: true,
          swarmId: `swarm-${Date.now()}`,
          topology: args.topology || 'hierarchical',
          maxAgents: args.maxAgents || 8,
          message: 'Swarm initialized successfully (novice mode)',
        };

      case 'agent_spawn':
        const agentType = LEGACY_AGENT_MAPPING[args.type] || args.type;
        return {
          success: true,
          agentId: `agent-${agentType}-${Date.now()}`,
          type: agentType,
          message: `Agent ${agentType} spawned successfully`,
        };

      case 'memory_usage':
        if (args.action === 'store') {
          await this.memoryStore.set(args.key, args.value, args.namespace, args.ttl);
          return { success: true, action: 'store', key: args.key };
        } else if (args.action === 'retrieve') {
          const value = await this.memoryStore.get(args.key, args.namespace);
          return { success: true, action: 'retrieve', key: args.key, value };
        }
        return { success: true, action: args.action };

      case 'session_extend':
        const extensionHours = args.extensionHours || 4;
        const extensionMs = extensionHours * 60 * 60 * 1000;
        return {
          success: true,
          sessionId: args.sessionId || this.sessionId,
          extensionHours,
          newTimeoutMs: extensionMs,
          message: `Session timeout extended by ${extensionHours} hours (${extensionMs}ms)`,
          note: 'Session timeout configured at server startup (8 hours default). This tool reports extension confirmation.',
        };

      default:
        return {
          success: true,
          tool: name,
          message: `Tool ${name} executed successfully (novice mode)`,
          timestamp: new Date().toISOString(),
        };
    }
  }

  handleResourcesList(id) {
    const resourcesList = Object.values(this.resources);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        resources: resourcesList,
      },
    };
  }

  async handleResourceRead(id, params) {
    const { uri } = params;

    try {
      let content = '';

      switch (uri) {
        case 'claude-flow://swarms':
          content = JSON.stringify({ active_swarms: [], total: 0 }, null, 2);
          break;
        case 'claude-flow://agents':
          content = JSON.stringify({ available_agents: 36, active: 0 }, null, 2);
          break;
        case 'claude-flow://memory':
          content = JSON.stringify({
            memory_usage: await this.memoryStore.getStats(),
            storage_type: this.memoryStore.isUsingFallback() ? 'in-memory' : 'SQLite'
          }, null, 2);
          break;
        case 'claude-flow://system':
          content = JSON.stringify({
            status: 'healthy',
            version: this.version,
            uptime: process.uptime(),
            session: this.sessionId
          }, null, 2);
          break;
        default:
          throw new Error('Resource not found');
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: content,
            },
          ],
        },
      };
    } catch (error) {
      return this.createErrorResponse(id, -32001, 'Resource read failed', error.message);
    }
  }

  createErrorResponse(id, code, message, data = null) {
    const response = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
      },
    };
    if (data) {
      response.error.data = data;
    }
    return response;
  }
}

// Create and start the server
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = new ClaudeFlowNoviceMCPServer();

  console.error(
    `[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${server.sessionId}) 🚀 Claude Flow Novice MCP Server starting...`,
  );
  console.error(
    `[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${server.sessionId}) 📦 ${Object.keys(server.tools).length} essential tools loaded`,
  );

  // Handle stdin for MCP communication
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (data) => {
    const lines = data.toString().split('\n');

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          const response = await server.handleMessage(message);
          if (response) {
            console.log(JSON.stringify(response));
          }
        } catch (error) {
          console.error(
            `[${new Date().toISOString()}] ERROR [claude-flow-novice-mcp] Failed to parse message:`,
            error.message,
          );
        }
      }
    }
  });

  process.stdin.on('end', () => {
    console.error(
      `[${new Date().toISOString()}] WARN [claude-flow-novice-mcp] (${server.sessionId}) MCP server received stdin close, attempting graceful shutdown...`,
    );

    // Grace period for pending operations (30 seconds)
    // Allows CFN loop agents to complete final memory writes before shutdown
    setTimeout(async () => {
      if (server.memoryStore) {
        await server.memoryStore.close();
      }
      console.error(
        `[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${server.sessionId}) 🔌 MCP server shutdown complete: ${server.sessionId}`,
      );
      process.exit(0);
    }, 30000);
  });

  // Handle process termination
  process.on('SIGINT', async () => {
    console.error(
      `[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${server.sessionId}) Received SIGINT, shutting down gracefully...`,
    );
    if (server.memoryStore) {
      await server.memoryStore.close();
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error(
      `[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${server.sessionId}) Received SIGTERM, shutting down gracefully...`,
    );
    if (server.memoryStore) {
      await server.memoryStore.close();
    }
    process.exit(0);
  });
}

*/