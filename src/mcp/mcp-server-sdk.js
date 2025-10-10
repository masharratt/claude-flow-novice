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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Session timeout prevention - keep connection alive for long CFN loops
let lastActivity = Date.now();
const SESSION_TIMEOUT = 8 * 60 * 60 * 1000; // 8 hours

// Update activity on every tool call
function updateActivity() {
  lastActivity = Date.now();
}

// Heartbeat to prevent timeout
const heartbeat = setInterval(() => {
  const inactiveTime = Date.now() - lastActivity;
  if (inactiveTime < SESSION_TIMEOUT) {
    // Session still active
    console.error(`[${new Date().toISOString()}] DEBUG Session active (${Math.floor(inactiveTime/1000/60)} minutes inactive)`);
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Graceful shutdown handlers
process.stdin.on('end', () => {
  console.error(`[${new Date().toISOString()}] WARN MCP SDK server received stdin close, attempting graceful shutdown...`);

  // Grace period for pending operations (30 seconds)
  setTimeout(() => {
    clearInterval(heartbeat);
    console.error(`[${new Date().toISOString()}] INFO MCP SDK server shutdown complete`);
    process.exit(0);
  }, 30000);
});

process.on('SIGINT', () => {
  console.error(`[${new Date().toISOString()}] INFO Received SIGINT, shutting down gracefully...`);
  clearInterval(heartbeat);
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error(`[${new Date().toISOString()}] INFO Received SIGTERM, shutting down gracefully...`);
  clearInterval(heartbeat);
  process.exit(0);
});

class ClaudeFlowNoviceServer {
  constructor() {
    this.version = '2.0.0-novice-sdk';
    this.sessionId = `session-cfn-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    this.server = new Server(
      {
        name: 'claude-flow-novice',
        version: this.version,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.setupHandlers();
  }

  setupHandlers() {
    // Tool listing - 30 Essential Tools for Novice Users
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // === SWARM COORDINATION (8 tools) ===
          {
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
          {
            name: 'agent_spawn',
            description: 'Create specialized AI agents',
            inputSchema: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['coordinator', 'analyst', 'optimizer', 'documenter', 'researcher', 'coder', 'tester', 'reviewer'] },
                name: { type: 'string' },
                capabilities: { type: 'array' },
                swarmId: { type: 'string' },
              },
              required: ['type'],
            },
          },
          {
            name: 'task_orchestrate',
            description: 'Orchestrate complex task workflows',
            inputSchema: {
              type: 'object',
              properties: {
                task: { type: 'string' },
                strategy: { type: 'string', enum: ['parallel', 'sequential', 'adaptive'] },
                priority: { type: 'string', enum: ['low', 'medium', 'high'] },
              },
              required: ['task'],
            },
          },
          {
            name: 'swarm_status',
            description: 'Monitor swarm health and performance',
            inputSchema: {
              type: 'object',
              properties: { swarmId: { type: 'string' } },
            },
          },
          {
            name: 'agent_list',
            description: 'List active agents & capabilities',
            inputSchema: {
              type: 'object',
              properties: { swarmId: { type: 'string' } },
            },
          },
          {
            name: 'coordination_sync',
            description: 'Sync agent coordination',
            inputSchema: {
              type: 'object',
              properties: { swarmId: { type: 'string' } },
            },
          },
          {
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
          {
            name: 'swarm_destroy',
            description: 'Gracefully shutdown swarm',
            inputSchema: {
              type: 'object',
              properties: { swarmId: { type: 'string' } },
              required: ['swarmId'],
            },
          },

          // === MEMORY MANAGEMENT (7 tools) ===
          {
            name: 'memory_usage',
            description: 'Store/retrieve persistent memory',
            inputSchema: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['store', 'retrieve', 'list', 'delete'] },
                key: { type: 'string' },
                value: { type: 'string' },
                namespace: { type: 'string', default: 'default' },
              },
              required: ['action'],
            },
          },
          {
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
          {
            name: 'memory_persist',
            description: 'Cross-session persistence',
            inputSchema: {
              type: 'object',
              properties: { sessionId: { type: 'string' } },
            },
          },
          {
            name: 'memory_backup',
            description: 'Backup memory stores',
            inputSchema: {
              type: 'object',
              properties: { path: { type: 'string' } },
            },
          },
          {
            name: 'memory_restore',
            description: 'Restore from backups',
            inputSchema: {
              type: 'object',
              properties: { backupPath: { type: 'string' } },
              required: ['backupPath'],
            },
          },
          {
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
          {
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

          // === TASK MANAGEMENT (3 tools) ===
          {
            name: 'task_status',
            description: 'Check task execution status',
            inputSchema: {
              type: 'object',
              properties: { taskId: { type: 'string' } },
              required: ['taskId'],
            },
          },
          {
            name: 'task_results',
            description: 'Get task completion results',
            inputSchema: {
              type: 'object',
              properties: { taskId: { type: 'string' } },
              required: ['taskId'],
            },
          },
          {
            name: 'agent_metrics',
            description: 'Agent performance metrics',
            inputSchema: {
              type: 'object',
              properties: { agentId: { type: 'string' } },
            },
          },

          // === PERFORMANCE MONITORING (5 tools) ===
          {
            name: 'performance_report',
            description: 'Generate performance reports',
            inputSchema: {
              type: 'object',
              properties: {
                format: { type: 'string', enum: ['summary', 'detailed'], default: 'summary' },
                timeframe: { type: 'string', enum: ['24h', '7d'], default: '24h' },
              },
            },
          },
          {
            name: 'bottleneck_analyze',
            description: 'Identify performance bottlenecks',
            inputSchema: {
              type: 'object',
              properties: {
                component: { type: 'string' },
                metrics: { type: 'array' },
              },
            },
          },
          {
            name: 'health_check',
            description: 'System health monitoring',
            inputSchema: {
              type: 'object',
              properties: { components: { type: 'array' } },
            },
          },
          {
            name: 'usage_stats',
            description: 'Usage statistics',
            inputSchema: {
              type: 'object',
              properties: { component: { type: 'string' } },
            },
          },
          {
            name: 'diagnostic_run',
            description: 'System diagnostics',
            inputSchema: {
              type: 'object',
              properties: { components: { type: 'array' } },
            },
          },

          // === PROJECT ANALYSIS (7 tools) ===
          {
            name: 'language_detect',
            description: 'Multi-language project analysis',
            inputSchema: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                includeFrameworks: { type: 'boolean', default: true },
              },
            },
          },
          {
            name: 'framework_detect',
            description: 'Framework detection and analysis',
            inputSchema: {
              type: 'object',
              properties: { path: { type: 'string' } },
            },
          },
          {
            name: 'dependency_analyze',
            description: 'Dependency analysis and validation',
            inputSchema: {
              type: 'object',
              properties: { path: { type: 'string' } },
            },
          },
          {
            name: 'config_validate',
            description: 'Configuration validation',
            inputSchema: {
              type: 'object',
              properties: { configPath: { type: 'string' } },
            },
          },
          {
            name: 'test_detect',
            description: 'Test framework detection',
            inputSchema: {
              type: 'object',
              properties: { path: { type: 'string' } },
            },
          },
          {
            name: 'build_detect',
            description: 'Build system detection',
            inputSchema: {
              type: 'object',
              properties: { path: { type: 'string' } },
            },
          },
          {
            name: 'package_analyze',
            description: 'Package.json analysis',
            inputSchema: {
              type: 'object',
              properties: { path: { type: 'string' } },
            },
          },
        ],
      };
    });

    // Tool execution - Handle all 30 tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      // Track activity on every tool call to prevent session timeout
      updateActivity();

      console.error(`[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${this.sessionId}) Executing tool: ${name}`);

      // Helper function to create standard responses
      const createResponse = (data) => ({
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      });

      switch (name) {
        // === SWARM COORDINATION ===
        case 'swarm_init':
          return createResponse({
            success: true,
            swarmId: `swarm_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
            topology: args.topology,
            maxAgents: args.maxAgents || 8,
            strategy: args.strategy || 'auto',
            status: 'initialized',
            timestamp: new Date().toISOString(),
            message: 'Swarm initialized successfully',
          });

        case 'agent_spawn':
          return createResponse({
            success: true,
            agentId: `agent_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            type: args.type,
            name: args.name || `${args.type}-agent`,
            status: 'active',
            capabilities: args.capabilities || [],
            swarmId: args.swarmId,
            timestamp: new Date().toISOString(),
            message: `Agent ${args.type} spawned successfully`,
          });

        case 'task_orchestrate':
          return createResponse({
            success: true,
            taskId: `task_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
            task: args.task,
            strategy: args.strategy || 'adaptive',
            priority: args.priority || 'medium',
            status: 'orchestrating',
            estimatedAgents: Math.floor(Math.random() * 5) + 2,
            timestamp: new Date().toISOString(),
            message: 'Task orchestration initiated',
          });

        case 'swarm_status':
          return createResponse({
            success: true,
            swarmId: args.swarmId || 'default',
            status: 'active',
            agents: Math.floor(Math.random() * 8) + 2,
            topology: 'mesh',
            health: 'good',
            timestamp: new Date().toISOString(),
          });

        case 'agent_list':
          return createResponse({
            success: true,
            swarmId: args.swarmId || 'default',
            agents: Array.from({ length: Math.floor(Math.random() * 5) + 2 }, (_, i) => ({
              id: `agent_${i + 1}`,
              type: ['researcher', 'coder', 'tester', 'analyst'][i % 4],
              status: 'active',
            })),
            timestamp: new Date().toISOString(),
          });

        case 'coordination_sync':
          return createResponse({
            success: true,
            swarmId: args.swarmId || 'default',
            syncStatus: 'synchronized',
            lastSync: new Date().toISOString(),
            message: 'Agent coordination synchronized',
          });

        case 'swarm_scale':
          return createResponse({
            success: true,
            swarmId: args.swarmId,
            targetSize: args.targetSize,
            currentSize: Math.floor(Math.random() * 10) + 2,
            status: 'scaling',
            timestamp: new Date().toISOString(),
          });

        case 'swarm_destroy':
          return createResponse({
            success: true,
            swarmId: args.swarmId,
            status: 'destroyed',
            agentsTerminated: Math.floor(Math.random() * 8) + 1,
            timestamp: new Date().toISOString(),
            message: 'Swarm destroyed gracefully',
          });

        // === MEMORY MANAGEMENT ===
        case 'memory_usage':
          return createResponse({
            success: true,
            action: args.action,
            key: args.key,
            namespace: args.namespace || 'default',
            result: args.action === 'store' ? 'stored' : args.action === 'retrieve' ? 'mock_value' : 'completed',
            timestamp: new Date().toISOString(),
            message: `Memory ${args.action} operation completed`,
          });

        case 'memory_search':
          return createResponse({
            success: true,
            pattern: args.pattern,
            namespace: args.namespace || 'default',
            results: Array.from({ length: Math.min(args.limit || 10, 5) }, (_, i) => ({
              key: `result_${i + 1}`,
              value: `mock_data_${i + 1}`,
              relevance: Math.random(),
            })),
            timestamp: new Date().toISOString(),
          });

        case 'memory_persist':
        case 'memory_backup':
        case 'memory_restore':
        case 'memory_namespace':
        case 'cache_manage':
          return createResponse({
            success: true,
            operation: name,
            status: 'completed',
            timestamp: new Date().toISOString(),
            message: `${name} operation completed successfully`,
          });

        // === TASK MANAGEMENT ===
        case 'task_status':
          return createResponse({
            success: true,
            taskId: args.taskId,
            status: ['pending', 'running', 'completed'][Math.floor(Math.random() * 3)],
            progress: Math.floor(Math.random() * 100),
            timestamp: new Date().toISOString(),
          });

        case 'task_results':
          return createResponse({
            success: true,
            taskId: args.taskId,
            result: 'Task completed successfully',
            executionTime: Math.floor(Math.random() * 1000) + 100,
            agentsUsed: Math.floor(Math.random() * 5) + 1,
            timestamp: new Date().toISOString(),
          });

        case 'agent_metrics':
          return createResponse({
            success: true,
            agentId: args.agentId || 'default',
            metrics: {
              tasksCompleted: Math.floor(Math.random() * 50) + 10,
              successRate: Math.random() * 0.3 + 0.7,
              avgExecutionTime: Math.random() * 5 + 1,
              uptime: Math.floor(Math.random() * 86400) + 3600,
            },
            timestamp: new Date().toISOString(),
          });

        // === PERFORMANCE MONITORING ===
        case 'performance_report':
          return createResponse({
            success: true,
            timeframe: args.timeframe || '24h',
            format: args.format || 'summary',
            metrics: {
              tasks_executed: Math.floor(Math.random() * 200) + 50,
              success_rate: Math.random() * 0.2 + 0.8,
              avg_execution_time: Math.random() * 10 + 5,
              agents_spawned: Math.floor(Math.random() * 50) + 10,
              memory_efficiency: Math.random() * 0.3 + 0.7,
            },
            timestamp: new Date().toISOString(),
            message: 'Performance report generated',
          });

        case 'bottleneck_analyze':
        case 'health_check':
        case 'usage_stats':
        case 'diagnostic_run':
          return createResponse({
            success: true,
            operation: name,
            status: 'healthy',
            metrics: {
              cpu_usage: Math.random() * 80 + 10,
              memory_usage: Math.random() * 70 + 20,
              response_time: Math.random() * 100 + 50,
            },
            timestamp: new Date().toISOString(),
          });

        // === PROJECT ANALYSIS ===
        case 'language_detect':
          return createResponse({
            success: true,
            path: args.path || '.',
            languages: {
              javascript: 65.2,
              typescript: 20.1,
              json: 8.7,
              markdown: 6.0,
            },
            frameworks: args.includeFrameworks ? ['React', 'Node.js'] : [],
            timestamp: new Date().toISOString(),
          });

        case 'framework_detect':
        case 'dependency_analyze':
        case 'config_validate':
        case 'test_detect':
        case 'build_detect':
        case 'package_analyze':
          return createResponse({
            success: true,
            operation: name,
            path: args.path || '.',
            detected: ['React', 'Jest', 'Webpack', 'ESLint'][Math.floor(Math.random() * 4)],
            confidence: Math.random() * 0.3 + 0.7,
            timestamp: new Date().toISOString(),
          });

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });

    // Resource listing
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: 'swarms://status',
            name: 'Swarm Status',
            description: 'Current swarm configuration and status',
            mimeType: 'application/json',
          },
          {
            uri: 'agents://list',
            name: 'Agent List',
            description: 'Available and active agents',
            mimeType: 'application/json',
          },
        ],
      };
    });

    // Resource reading
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      const mockData = {
        uri,
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: `Mock data for ${uri}`,
      };

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(mockData, null, 2),
          },
        ],
      };
    });
  }

  async start() {
    const toolCount = 30; // Number of tools we defined
    console.error(`[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${this.sessionId}) Claude-Flow Novice MCP server starting (SDK-based)`);
    console.error(`[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${this.sessionId}) Server starting with ${toolCount} essential tools`);

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error(`[${new Date().toISOString()}] INFO [claude-flow-novice-mcp] (${this.sessionId}) Connected via stdio transport`);
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ClaudeFlowNoviceServer();
  server.start().catch(console.error);
}

export { ClaudeFlowNoviceServer };

*/