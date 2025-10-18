# API Reference

Complete technical reference for Claude Flow Novice APIs, CLI commands, MCP tools, configuration options, and integration interfaces.

## 📚 Reference Categories

```
                    📚 API REFERENCE ARCHITECTURE

    ┌─────────────────────────────────────────────────────────────────┐
    │              CLAUDE FLOW NOVICE API ECOSYSTEM                   │
    └─────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
            ┌─────────────────────────────────────────────────────────┐
            │                API ACCESS LAYERS                       │
            └─────────────────────┬───────────────────────────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                       │                        │
    ┌────▼────┐            ┌─────▼─────┐            ┌────▼────┐
    │   CLI   │            │    MCP    │            │   REST  │
    │COMMANDS │            │   TOOLS   │            │   API   │
    └────┬────┘            └─────┬─────┘            └────┬────┘
         │                       │                        │
         ▼                       ▼                        ▼
    ┌─────────┐            ┌─────────────┐            ┌─────────┐
    │• init   │            │• swarm_init │            │POST     │
    │• agents │            │• agent_spawn│            │/agents  │
    │• sparc  │            │• task_orch  │            │GET      │
    │• config │            │• memory_*   │            │/status  │
    │• doctor │            │• neural_*   │            │PUT/DEL  │
    └─────────┘            └─────────────┘            └─────────┘
         │                       │                        │
         └────────────────────────┼────────────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │    UNIFIED ORCHESTRATION  │
                    │         ENGINE            │
                    │                           │
                    │ 🎭 Agent Management       │
                    │ 🔄 SPARC Workflows        │
                    │ 🕸️ Swarm Coordination     │
                    │ 🧠 Memory System          │
                    │ 🪝 Hooks Automation       │
                    └─────────────┬─────────────┘
                                  │
                ┌─────────────────┼─────────────────┐
                │                 │                 │
        ┌───────▼───────┐ ┌───────▼───────┐ ┌──────▼──────┐
        │ CONFIGURATION │ │ PLUGIN SYSTEM │ │ INTEGRATION │
        │     API       │ │      API      │ │     API     │
        └───────────────┘ └───────────────┘ └─────────────┘

    🔗 API INTERACTION PATTERNS:
    ┌─────────────────────────────────────────────────────────────────┐
    │ Use Case           → Primary API → Secondary APIs → Result      │
    ├─────────────────────────────────────────────────────────────────┤
    │ CLI Development    → CLI Commands → Hooks + Config → Automation │
    │ IDE Integration    → MCP Tools → Memory + Neural → Real-time   │
    │ Enterprise Integration → REST API → WebSocket → Monitoring    │
    │ Custom Development → Plugin API → All Others → Extensions      │
    └─────────────────────────────────────────────────────────────────┘
```

### [CLI Commands](cli-commands/README.md)
Complete command-line interface reference with all parameters and options.

### [MCP Tools](mcp-tools/README.md)
Model Context Protocol tools for Claude Code integration.

### [Hooks System](hooks-system/README.md)
Lifecycle hooks for automation and coordination.

### [Configuration](configuration/README.md)
Configuration file schemas, options, and environment variables.

---

## 🎯 Quick Reference

### Essential CLI Commands
```bash
# Project management
npx claude-flow@alpha init [options]
npx claude-flow@alpha config <command> [options]

# Agent management
npx claude-flow@alpha agents <command> [options]
npx claude-flow@alpha agents spawn <type> "<task>" [options]

# SPARC workflows
npx claude-flow@alpha sparc <command> [options]
npx claude-flow@alpha sparc tdd "<feature>" [options]

# Swarm coordination
npx claude-flow@alpha swarm <command> [options]

# System utilities
npx claude-flow@alpha doctor [options]
npx claude-flow@alpha logs <command> [options]
```

### Essential MCP Tools
```javascript
// Core coordination
mcp__claude-flow__swarm_init(options)
mcp__claude-flow__agent_spawn(options)
mcp__claude-flow__task_orchestrate(options)

// Monitoring
mcp__claude-flow__swarm_status(options)
mcp__claude-flow__agent_metrics(options)
mcp__claude-flow__task_status(options)

// Memory management
mcp__claude-flow__memory_store(options)
mcp__claude-flow__memory_retrieve(options)
mcp__claude-flow__knowledge_share(options)
```

---

## 📖 API Documentation Structure

### Command Reference Format
Each command includes:
- **Syntax** - Exact command syntax with parameters
- **Description** - What the command does
- **Parameters** - Required and optional parameters
- **Options** - Available flags and options
- **Examples** - Practical usage examples
- **Exit Codes** - Return codes and their meanings
- **Related Commands** - Associated commands

### MCP Tool Reference Format
Each tool includes:
- **Function Signature** - TypeScript interface
- **Parameters** - Input parameter specifications
- **Return Type** - Output format and structure
- **Usage Examples** - Real-world usage patterns
- **Error Handling** - Possible errors and responses
- **Integration Patterns** - How to use with Claude Code Task tool

---

## 🔧 Integration APIs

```
                    🔧 AGENT SPECIALIZATION & INTEGRATION FLOW

    ┌─────────────────────────────────────────────────────────────────┐
    │                AGENT TYPE SPECIALIZATION MATRIX                 │
    └─────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
    ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
    │   CORE AGENTS    │ │  DOMAIN EXPERTS  │ │   COORDINATORS   │
    │   (Universal)    │ │   (Specialized)  │ │  (Orchestration) │
    └─────────┬────────┘ └─────────┬────────┘ └─────────┬────────┘
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │• coder          │  │• backend-dev    │  │• sparc-coord    │
    │• reviewer       │  │• frontend-dev   │  │• task-orch      │
    │• tester         │  │• mobile-dev     │  │• swarm-init     │
    │• planner        │  │• ml-developer   │  │• ai-coordinator │
    │• researcher     │  │• security-mgr   │  │• system-arch    │
    │• architect      │  │• perf-optimizer │  │• workflow-mgr   │
    └─────────────────┘  └─────────────────┘  └─────────────────┘
              │                    │                    │
              ▼                    ▼                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                  INTEGRATION WORKFLOW                           │
    │                                                                 │
    │  Task Input → Agent Selection → Specialization → Coordination  │
    │      ↓             ↓               ↓                ↓          │
    │  Requirements   Best Fit       Domain Config     Multi-Agent   │
    │  Analysis       Algorithm      Apply Skills      Orchestration │
    │  Task Break     Capability     Use Patterns      Monitor Prog  │
    │  Validation     Matching       Optimize Perf     Handle Errors │
    └─────────────────────────────────────────────────────────────────┘

    🎯 AGENT SELECTION ALGORITHM:
    ┌─────────────────────────────────────────────────────────────────┐
    │ Task Type → Agent Priority → Backup Options → Coordinator       │
    ├─────────────────────────────────────────────────────────────────┤
    │ "Code feature" → coder (90%) → backend-dev → system-architect   │
    │ "Review code" → reviewer (95%) → sec-mgr → code-analyzer        │
    │ "Write tests" → tester (85%) → coder → quality-assurance       │
    │ "Plan project" → planner (80%) → architect → project-manager   │
    │ "Research tech" → researcher (90%) → specialist → data-analyst │
    │ "Build API" → backend-dev (95%) → coder → api-architect        │
    │ "Mobile app" → mobile-dev (98%) → frontend → ui-specialist     │
    │ "Security audit" → security-mgr (99%) → reviewer → sec-expert  │
    └─────────────────────────────────────────────────────────────────┘
```

### Node.js Library API
```javascript
// Import the library
const ClaudeFlow = require('claude-flow-novice');

// Initialize client
const client = new ClaudeFlow({
  apiKey: process.env.CLAUDE_FLOW_API_KEY,
  model: 'claude-3.5-sonnet'
});

// Spawn agent programmatically
const agent = await client.agents.spawn({
  type: 'coder',
  task: 'implement user authentication',
  options: {
    language: 'javascript',
    framework: 'express'
  }
});

// Monitor agent progress
const status = await client.agents.status(agent.id);

// Execute SPARC workflow
const workflow = await client.sparc.execute({
  mode: 'tdd',
  feature: 'user management system',
  agents: ['coder', 'tester', 'reviewer']
});
```

### REST API Endpoints
```http
# Agent management
POST   /api/v1/agents
GET    /api/v1/agents
GET    /api/v1/agents/{id}
PUT    /api/v1/agents/{id}
DELETE /api/v1/agents/{id}

# SPARC workflows
POST   /api/v1/sparc/workflows
GET    /api/v1/sparc/workflows/{id}
GET    /api/v1/sparc/workflows/{id}/status

# Swarm coordination
POST   /api/v1/swarms
GET    /api/v1/swarms/{id}
POST   /api/v1/swarms/{id}/orchestrate

# Memory management
POST   /api/v1/memory
GET    /api/v1/memory/{key}
PUT    /api/v1/memory/{key}
DELETE /api/v1/memory/{key}
```

### WebSocket API
```javascript
// Real-time agent monitoring
const ws = new WebSocket('wss://api.claude-flow.ai/v1/ws');

// Subscribe to agent events
ws.send(JSON.stringify({
  action: 'subscribe',
  topics: ['agent.status', 'sparc.progress', 'swarm.coordination']
}));

// Handle real-time updates
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'agent.status':
      updateAgentStatus(data.payload);
      break;
    case 'sparc.progress':
      updateWorkflowProgress(data.payload);
      break;
    case 'swarm.coordination':
      updateSwarmStatus(data.payload);
      break;
  }
};
```

---

## 📊 Data Schemas

### Agent Schema
```typescript
interface Agent {
  id: string;
  type: AgentType;
  status: AgentStatus;
  task: string;
  config: AgentConfig;
  metrics: AgentMetrics;
  createdAt: Date;
  updatedAt: Date;
}

type AgentType =
  | 'coder' | 'reviewer' | 'tester' | 'planner'
  | 'backend-dev' | 'frontend-dev' | 'mobile-dev'
  | 'security-manager' | 'performance-optimizer'
  | 'ml-developer' | 'data-scientist' | 'api-docs'
  | string; // Custom agent types

type AgentStatus =
  | 'spawning' | 'ready' | 'working' | 'waiting'
  | 'completed' | 'failed' | 'stopped';

interface AgentConfig {
  language?: string;
  framework?: string;
  timeout?: number;
  memory?: MemoryConfig;
  hooks?: HookConfig[];
}
```

### SPARC Workflow Schema
```typescript
interface SPARCWorkflow {
  id: string;
  feature: string;
  mode: SPARCMode;
  phases: SPARCPhase[];
  agents: AgentAssignment[];
  status: WorkflowStatus;
  progress: WorkflowProgress;
  deliverables: Deliverable[];
  metrics: WorkflowMetrics;
  createdAt: Date;
  completedAt?: Date;
}

type SPARCMode = 'tdd' | 'standard' | 'rapid' | 'thorough';

interface SPARCPhase {
  name: 'specification' | 'pseudocode' | 'architecture' | 'refinement' | 'completion';
  status: PhaseStatus;
  agent?: string;
  startTime?: Date;
  endTime?: Date;
  deliverables: string[];
}
```

### Swarm Schema
```typescript
interface Swarm {
  id: string;
  topology: SwarmTopology;
  coordinator?: string;
  agents: string[];
  maxAgents: number;
  status: SwarmStatus;
  coordination: CoordinationMetrics;
  createdAt: Date;
}

type SwarmTopology = 'mesh' | 'hierarchical' | 'ring' | 'star' | 'adaptive';

interface CoordinationMetrics {
  efficiency: number;
  communicationRate: number;
  resourceUtilization: number;
  taskDistribution: Record<string, number>;
}
```

---

## 🔒 Authentication and Security

### API Authentication
```http
# Header-based authentication
Authorization: Bearer <api-token>

# Query parameter authentication (for WebSockets)
wss://api.claude-flow.ai/v1/ws?token=<api-token>
```

### API Key Management
```bash
# Set API key via CLI
npx claude-flow@alpha auth set-key <api-key>

# Rotate API key
npx claude-flow@alpha auth rotate-key

# View key info (masked)
npx claude-flow@alpha auth key-info
```

### Security Best Practices
- Store API keys in environment variables
- Use least-privilege access principles
- Rotate keys regularly
- Monitor API usage and access logs
- Implement proper CORS policies for web applications

---

## 📈 Rate Limiting and Quotas

### Rate Limits
| Endpoint Category | Rate Limit | Burst Limit |
|------------------|------------|-------------|
| Agent Operations | 60/minute | 10/second |
| SPARC Workflows | 20/minute | 5/second |
| Memory Operations | 120/minute | 20/second |
| Monitoring | 300/minute | 50/second |

### Usage Quotas
```typescript
interface UsageQuota {
  agents: {
    maxConcurrent: number;
    maxDaily: number;
    maxMonthly: number;
  };
  workflows: {
    maxDaily: number;
    maxMonthly: number;
  };
  memory: {
    maxStorage: number; // in MB
    maxOperations: number; // per day
  };
}
```

### Monitoring Usage
```bash
# Check current usage
npx claude-flow@alpha usage show

# Get usage alerts
npx claude-flow@alpha usage alerts

# Export usage data
npx claude-flow@alpha usage export --format json
```

---

## 🔌 Plugin and Extension APIs

### Plugin Development API
```typescript
interface PluginAPI {
  // Agent plugins
  registerAgent(config: AgentPluginConfig): void;

  // Hook plugins
  registerHook(hook: HookPlugin): void;

  // Command plugins
  registerCommand(command: CommandPlugin): void;

  // Integration plugins
  registerIntegration(integration: IntegrationPlugin): void;
}

interface AgentPluginConfig {
  name: string;
  type: string;
  capabilities: string[];
  implementation: AgentImplementation;
}
```

### Custom Agent Development
```typescript
// Base agent interface
interface CustomAgent {
  name: string;
  type: string;
  version: string;

  // Required methods
  initialize(config: AgentConfig): Promise<void>;
  execute(task: Task): Promise<TaskResult>;
  stop(): Promise<void>;

  // Optional methods
  getStatus?(): AgentStatus;
  getMetrics?(): AgentMetrics;
  handleMessage?(message: AgentMessage): Promise<void>;
}

// Agent registration
export function registerAgent(agent: CustomAgent): void {
  // Registration logic
}
```

---

## 🛠️ Development Tools

### SDK and Libraries
```bash
# Official SDKs
npm install @claude-flow/sdk          # Node.js/TypeScript
pip install claude-flow-python        # Python
go get github.com/claude-flow/go-sdk   # Go
cargo add claude-flow-rust             # Rust
```

### CLI Development Tools
```bash
# Plugin development
npx claude-flow@alpha dev create-plugin --type agent
npx claude-flow@alpha dev create-plugin --type hook
npx claude-flow@alpha dev create-plugin --type command

# Testing tools
npx claude-flow@alpha dev test-plugin <plugin-name>
npx claude-flow@alpha dev validate-plugin <plugin-path>

# Publishing tools
npx claude-flow@alpha dev publish-plugin <plugin-path>
```

### Debug and Profiling APIs
```typescript
interface DebugAPI {
  enableDebug(components: string[]): void;
  getTraces(agentId: string): Trace[];
  profileExecution(workflowId: string): ProfileData;
  dumpMemoryUsage(): MemoryDump;
  exportLogs(filter: LogFilter): LogData[];
}
```

---

## 📚 Complete Reference Sections

### Detailed Documentation
- **[CLI Commands Reference](cli-commands/README.md)** - Complete command documentation
- **[MCP Tools Reference](mcp-tools/README.md)** - All MCP tool specifications
- **[Hooks System Reference](hooks-system/README.md)** - Lifecycle hooks documentation
- **[Configuration Reference](configuration/README.md)** - All configuration options

### Code Examples
- **[Integration Examples](../examples/integration-patterns/README.md)** - Real-world integrations
- **[Custom Agent Examples](../examples/advanced-workflows/README.md)** - Agent development
- **[Plugin Examples](../community/contributing/README.md)** - Extension development

### API Clients
- **[Node.js Client](https://github.com/claude-flow/nodejs-client)** - Official Node.js library
- **[Python Client](https://github.com/claude-flow/python-client)** - Official Python library
- **[REST API Docs](https://api.claude-flow.ai/docs)** - OpenAPI specification
- **[GraphQL Schema](https://api.claude-flow.ai/graphql)** - GraphQL API reference

---

**Need specific API details?** Navigate to the appropriate reference section or use the search functionality to find specific commands, tools, or configuration options.

**Building integrations?** Check out our [Integration Patterns](../examples/integration-patterns/README.md) and [SDK documentation](https://docs.claude-flow.ai/sdks) for comprehensive guides.