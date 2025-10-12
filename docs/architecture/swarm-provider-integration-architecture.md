# SwarmCoordinator + ProviderManager Integration Architecture
**Real Z.ai-Powered Agent Execution Design**

**Version:** 1.0
**Date:** 2025-10-12
**Architect:** Claude (Architect Agent)
**Epic:** Swarm Real Execution Integration

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current State Analysis](#current-state-analysis)
3. [Architecture Design](#architecture-design)
4. [Class Diagrams](#class-diagrams)
5. [Data Flow](#data-flow)
6. [Tool Execution Strategy](#tool-execution-strategy)
7. [Implementation Plan](#implementation-plan)
8. [Testing Strategy](#testing-strategy)
9. [Performance Considerations](#performance-considerations)
10. [Security & Compliance](#security--compliance)

---

## Executive Summary

### Problem Statement
SwarmCoordinator currently uses `simulateTaskExecution()` (mock) instead of spawning real Z.ai-powered agents. Need to bridge SwarmCoordinator → ProviderManager → Z.ai to enable:
- Real LLM-powered agent execution
- Tool access (Read, Write, Edit, Bash, Redis pub/sub, SQLite memory)
- 70-agent mesh coordination test capability
- Bi-directional message flow

### Solution Overview
Create an **AgentExecutor** class that acts as an execution bridge between SwarmCoordinator and ProviderManager, with tool provisioning via **AgentToolkit** and conversation management via **ConversationManager**.

**Key Components:**
1. **AgentExecutor**: Orchestrates agent lifecycle and execution
2. **AgentToolkit**: Provides tools with sandboxed execution
3. **ConversationManager**: Manages stateful LLM conversations
4. **AgentPromptBuilder**: Constructs agent-specific prompts
5. **ResponseParser**: Extracts task results from agent responses

### Success Criteria
- ✅ Replace `simulateTaskExecution()` with real Z.ai execution
- ✅ Support 70+ concurrent agents in mesh topology
- ✅ Provide file ops, bash, Redis, SQLite tools to agents
- ✅ <500ms agent spawn time, <2s task completion for simple tasks
- ✅ Full task result extraction and metrics tracking

---

## Current State Analysis

### Existing Components

#### SwarmCoordinator (`src/coordination/swarm-coordinator.ts`)
```typescript
// Current mock execution (lines 424-446)
private async simulateTaskExecution(task: SwarmTask, agent: SwarmAgent): Promise<any> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve({
        taskId: task.id,
        agentId: agent.id,
        result: `Completed ${task.type} task`,
        timestamp: new Date(),
      });
    }, Math.random() * 5000 + 2000);
  });
}
```

**Issues:**
- No real LLM execution
- No tool access
- No conversation context
- No failure handling beyond timeout

#### ProviderManager (`src/providers/provider-manager.ts`)
```typescript
// Already supports real execution
async complete(request: LLMRequest, agentType?: string): Promise<LLMResponse> {
  const provider = await this.selectProvider(request, agentType);
  const response = await provider.complete(request);
  return response;
}
```

**Strengths:**
- Working Z.ai provider integration
- Tiered routing support
- Cost optimization
- Fallback strategies
- Metrics tracking

#### ZaiProvider (`src/providers/zai-provider.ts`)
```typescript
// Anthropic-compatible endpoint
protected async doComplete(request: LLMRequest): Promise<LLMResponse> {
  const response = await this.callZaiAPI<ZaiCompletionResponse>("/messages", payload);
  return {
    content: response.content[0].text,
    usage: { promptTokens, completionTokens, totalTokens },
    cost: { totalCost },
  };
}
```

**Strengths:**
- Full Anthropic Messages API support
- Streaming support
- Cost tracking
- Error handling

### Gap Analysis

| Requirement | Current State | Gap |
|------------|---------------|-----|
| Real agent execution | ❌ Mock simulation | Need AgentExecutor bridge |
| Tool provisioning | ❌ No tools | Need AgentToolkit |
| Conversation state | ❌ Stateless | Need ConversationManager |
| Result extraction | ❌ Mock results | Need ResponseParser |
| Redis pub/sub | ✅ Available | Need tool wrapper |
| SQLite memory | ✅ Available | Need tool wrapper |
| File operations | ✅ Available | Need tool wrapper |
| Bash execution | ✅ Available | Need tool wrapper |

---

## Architecture Design

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      SwarmCoordinator                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  executeTask(task, agent)                                 │  │
│  │    ├─> Create AgentExecutor                              │  │
│  │    ├─> Build AgentToolkit (tools for agent)              │  │
│  │    ├─> Execute via ProviderManager                       │  │
│  │    └─> Parse response & extract results                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       AgentExecutor                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  • Agent lifecycle management                             │  │
│  │  • Tool provisioning via AgentToolkit                    │  │
│  │  • Conversation state via ConversationManager            │  │
│  │  • Prompt building via AgentPromptBuilder                │  │
│  │  • Response parsing via ResponseParser                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ProviderManager                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  complete(request, agentType)                            │  │
│  │    ├─> Select provider (tiered routing)                  │  │
│  │    ├─> Execute via Z.ai provider                         │  │
│  │    └─> Return LLMResponse                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        ZaiProvider                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  doComplete(request)                                      │  │
│  │    └─> POST /api/anthropic/v1/messages                   │  │
│  │         (Anthropic-compatible API)                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

#### 1. AgentExecutor
**Purpose:** Bridge between SwarmCoordinator and ProviderManager

**Responsibilities:**
- Manage agent execution lifecycle
- Provision tools via AgentToolkit
- Maintain conversation state
- Build agent-specific prompts
- Parse responses and extract results
- Handle tool calls during execution
- Report metrics and errors

**Key Methods:**
```typescript
class AgentExecutor {
  async executeTask(
    task: SwarmTask,
    agent: SwarmAgent,
    context: ExecutionContext
  ): Promise<TaskResult>;

  private async handleToolCall(
    toolName: string,
    toolInput: any,
    agent: SwarmAgent
  ): Promise<ToolResult>;

  private async buildPrompt(
    task: SwarmTask,
    agent: SwarmAgent,
    conversationHistory: Message[]
  ): Promise<LLMRequest>;
}
```

#### 2. AgentToolkit
**Purpose:** Provide sandboxed tools to agents

**Available Tools:**
- **File Operations**: Read, Write, Edit
- **Bash Execution**: Sandboxed shell commands
- **Redis Pub/Sub**: Coordination messaging
- **SQLite Memory**: Persistent state storage
- **Memory Operations**: SwarmMemory read/write

**Security:**
- Path validation (prevent directory traversal)
- Command whitelisting for bash
- Resource limits (max file size, execution time)
- ACL enforcement for memory operations

**Key Methods:**
```typescript
class AgentToolkit {
  async executeTool(
    toolName: string,
    input: ToolInput,
    agent: SwarmAgent
  ): Promise<ToolResult>;

  private validateToolAccess(
    tool: string,
    agent: SwarmAgent
  ): boolean;

  private sanitizeInput(input: any): any;
}
```

#### 3. ConversationManager
**Purpose:** Manage stateful LLM conversations

**Features:**
- Multi-turn conversation support
- Tool call history tracking
- Context window management (200K tokens for Claude)
- Conversation replay for debugging

**Key Methods:**
```typescript
class ConversationManager {
  async startConversation(
    agent: SwarmAgent,
    task: SwarmTask
  ): Promise<string>; // conversationId

  async addMessage(
    conversationId: string,
    message: Message
  ): Promise<void>;

  async getHistory(
    conversationId: string,
    maxMessages?: number
  ): Promise<Message[]>;

  async endConversation(conversationId: string): Promise<void>;
}
```

#### 4. AgentPromptBuilder
**Purpose:** Construct agent-specific prompts

**Prompt Structure:**
```
[AGENT IDENTITY]
You are {agent.name}, a {agent.type} agent in swarm {swarmId}.
Agent ID: {agent.id}
Capabilities: {agent.capabilities}

[TASK DEFINITION]
Task: {task.name}
Type: {task.type}
Priority: {task.priority}
Description: {task.description}

[INSTRUCTIONS]
{task.instructions}

[CONTEXT]
{task.context}

[TOOLS AVAILABLE]
{toolDescriptions}

[QUALITY REQUIREMENTS]
- Confidence threshold: {task.requirements.minReliability}
- Testing required: {task.requirements.testingRequired}
- Review required: {task.requirements.reviewRequired}

[OUTPUT FORMAT]
Provide structured JSON response:
{
  "summary": "What was accomplished",
  "confidence": 0.0-1.0,
  "artifacts": ["file1.ts", "file2.ts"],
  "blockers": ["issue1", "issue2"],
  "nextSteps": ["action1", "action2"]
}
```

**Key Methods:**
```typescript
class AgentPromptBuilder {
  buildSystemPrompt(agent: SwarmAgent): string;
  buildTaskPrompt(task: SwarmTask): string;
  buildToolDescriptions(tools: Tool[]): string;
  buildContextPrompt(context: TaskContext): string;
}
```

#### 5. ResponseParser
**Purpose:** Extract task results from agent responses

**Parsing Strategy:**
1. JSON extraction (preferred)
2. Markdown code block extraction
3. Natural language parsing (fallback)

**Key Methods:**
```typescript
class ResponseParser {
  parse(response: LLMResponse): TaskResult;
  extractJSON(text: string): any | null;
  extractCodeBlocks(text: string): CodeBlock[];
  inferResults(text: string): TaskResult; // fallback
}
```

---

## Class Diagrams

### Core Integration Classes

```typescript
// ===== AgentExecutor =====
interface ExecutionContext {
  swarmId: string;
  workingDirectory: string;
  redis: Redis;
  sqliteMemory: SQLiteMemory;
  logger: Logger;
}

class AgentExecutor {
  constructor(
    private providerManager: ProviderManager,
    private toolkit: AgentToolkit,
    private conversationManager: ConversationManager,
    private promptBuilder: AgentPromptBuilder,
    private responseParser: ResponseParser,
    private context: ExecutionContext
  ) {}

  // Main execution method
  async executeTask(
    task: SwarmTask,
    agent: SwarmAgent
  ): Promise<TaskResult> {
    // 1. Start conversation
    const conversationId = await this.conversationManager.startConversation(
      agent,
      task
    );

    // 2. Build initial prompt
    const prompt = await this.promptBuilder.buildPrompt(task, agent, []);

    // 3. Execute conversation loop
    let toolCallsRemaining = 10; // max iterations
    let currentMessages: Message[] = [
      { role: 'user', content: prompt }
    ];

    while (toolCallsRemaining > 0) {
      // 4. Call LLM via ProviderManager
      const request: LLMRequest = {
        messages: currentMessages,
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 8192,
        temperature: 0.7,
      };

      const response = await this.providerManager.complete(
        request,
        agent.type
      );

      // 5. Add response to conversation
      await this.conversationManager.addMessage(conversationId, {
        role: 'assistant',
        content: response.content,
      });

      // 6. Check for tool calls
      const toolCalls = this.extractToolCalls(response.content);

      if (toolCalls.length === 0) {
        // No more tool calls, parse final result
        const result = this.responseParser.parse(response);
        await this.conversationManager.endConversation(conversationId);
        return result;
      }

      // 7. Execute tool calls
      const toolResults = await Promise.all(
        toolCalls.map(call =>
          this.toolkit.executeTool(call.name, call.input, agent)
        )
      );

      // 8. Add tool results to conversation
      const toolResultMessage = this.formatToolResults(toolResults);
      currentMessages.push({
        role: 'user',
        content: toolResultMessage,
      });

      await this.conversationManager.addMessage(
        conversationId,
        { role: 'user', content: toolResultMessage }
      );

      toolCallsRemaining--;
    }

    throw new Error('Tool call limit exceeded');
  }

  private extractToolCalls(content: string): ToolCall[] {
    // Parse tool calls from response
    // Support formats:
    // 1. JSON function calling (Anthropic format)
    // 2. XML tags: <tool>read</tool><input>file.ts</input>
    // 3. Markdown code blocks with tool metadata
  }

  private formatToolResults(results: ToolResult[]): string {
    // Format tool results for next LLM turn
    return results
      .map(r => `Tool: ${r.tool}\nResult: ${r.result}\nStatus: ${r.status}`)
      .join('\n\n');
  }
}

// ===== AgentToolkit =====
interface ToolInput {
  [key: string]: any;
}

interface ToolResult {
  tool: string;
  result: any;
  status: 'success' | 'error';
  error?: string;
  executionTime: number;
}

interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter[];
  execute: (input: ToolInput, agent: SwarmAgent) => Promise<any>;
}

interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
}

class AgentToolkit {
  private tools: Map<string, Tool> = new Map();

  constructor(
    private redis: Redis,
    private sqliteMemory: SQLiteMemory,
    private logger: Logger,
    private workingDir: string
  ) {
    this.registerTools();
  }

  private registerTools() {
    // File operations
    this.tools.set('read', {
      name: 'read',
      description: 'Read file contents',
      parameters: [
        { name: 'path', type: 'string', description: 'File path', required: true },
      ],
      execute: async (input, agent) => {
        const safePath = this.validatePath(input.path);
        return fs.readFile(safePath, 'utf-8');
      },
    });

    this.tools.set('write', {
      name: 'write',
      description: 'Write file contents',
      parameters: [
        { name: 'path', type: 'string', description: 'File path', required: true },
        { name: 'content', type: 'string', description: 'File content', required: true },
      ],
      execute: async (input, agent) => {
        const safePath = this.validatePath(input.path);
        await fs.writeFile(safePath, input.content, 'utf-8');
        return { success: true, path: safePath };
      },
    });

    this.tools.set('edit', {
      name: 'edit',
      description: 'Edit file with search/replace',
      parameters: [
        { name: 'path', type: 'string', description: 'File path', required: true },
        { name: 'search', type: 'string', description: 'Text to find', required: true },
        { name: 'replace', type: 'string', description: 'Replacement text', required: true },
      ],
      execute: async (input, agent) => {
        const safePath = this.validatePath(input.path);
        const content = await fs.readFile(safePath, 'utf-8');
        const updated = content.replace(input.search, input.replace);
        await fs.writeFile(safePath, updated, 'utf-8');
        return { success: true, path: safePath };
      },
    });

    // Bash execution
    this.tools.set('bash', {
      name: 'bash',
      description: 'Execute bash command (sandboxed)',
      parameters: [
        { name: 'command', type: 'string', description: 'Command to execute', required: true },
      ],
      execute: async (input, agent) => {
        const safeCommand = this.validateCommand(input.command);
        const result = await this.executeBash(safeCommand);
        return result;
      },
    });

    // Redis pub/sub
    this.tools.set('redis_publish', {
      name: 'redis_publish',
      description: 'Publish message to Redis channel',
      parameters: [
        { name: 'channel', type: 'string', description: 'Channel name', required: true },
        { name: 'message', type: 'object', description: 'Message payload', required: true },
      ],
      execute: async (input, agent) => {
        await this.redis.publish(
          input.channel,
          JSON.stringify(input.message)
        );
        return { success: true };
      },
    });

    // SQLite memory
    this.tools.set('memory_store', {
      name: 'memory_store',
      description: 'Store data in SQLite memory',
      parameters: [
        { name: 'key', type: 'string', description: 'Memory key', required: true },
        { name: 'value', type: 'object', description: 'Value to store', required: true },
        { name: 'aclLevel', type: 'number', description: 'ACL level (1-5)', required: false },
      ],
      execute: async (input, agent) => {
        await this.sqliteMemory.set(input.key, input.value, {
          agentId: agent.id,
          aclLevel: input.aclLevel || 1,
        });
        return { success: true };
      },
    });

    this.tools.set('memory_get', {
      name: 'memory_get',
      description: 'Retrieve data from SQLite memory',
      parameters: [
        { name: 'key', type: 'string', description: 'Memory key', required: true },
      ],
      execute: async (input, agent) => {
        const value = await this.sqliteMemory.get(input.key, {
          agentId: agent.id,
        });
        return value;
      },
    });
  }

  async executeTool(
    toolName: string,
    input: ToolInput,
    agent: SwarmAgent
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      const tool = this.tools.get(toolName);
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      // Validate tool access
      if (!this.validateToolAccess(toolName, agent)) {
        throw new Error(`Agent ${agent.id} not authorized for tool ${toolName}`);
      }

      // Sanitize input
      const sanitizedInput = this.sanitizeInput(input);

      // Execute tool
      const result = await tool.execute(sanitizedInput, agent);

      return {
        tool: toolName,
        result,
        status: 'success',
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      this.logger.error('Tool execution failed', {
        tool: toolName,
        agent: agent.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        tool: toolName,
        result: null,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
      };
    }
  }

  private validatePath(filePath: string): string {
    // Prevent directory traversal
    const resolved = path.resolve(this.workingDir, filePath);
    if (!resolved.startsWith(this.workingDir)) {
      throw new Error('Path outside working directory');
    }
    return resolved;
  }

  private validateCommand(command: string): string {
    // Whitelist allowed commands
    const allowedCommands = ['ls', 'cat', 'grep', 'find', 'git'];
    const cmd = command.split(' ')[0];

    if (!allowedCommands.includes(cmd)) {
      throw new Error(`Command not allowed: ${cmd}`);
    }

    return command;
  }

  private validateToolAccess(tool: string, agent: SwarmAgent): boolean {
    // Check agent capabilities
    if (tool === 'bash' && !agent.capabilities.canExecuteCode) {
      return false;
    }

    return true;
  }

  private sanitizeInput(input: any): any {
    // Remove potentially dangerous input
    if (typeof input === 'string') {
      return input.replace(/<script|javascript:|onerror=/gi, '');
    }

    return input;
  }

  private async executeBash(command: string): Promise<any> {
    return new Promise((resolve, reject) => {
      exec(command, { timeout: 30000 }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr, exitCode: 0 });
        }
      });
    });
  }
}

// ===== ConversationManager =====
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

class ConversationManager {
  private conversations: Map<string, {
    agentId: string;
    taskId: string;
    messages: Message[];
    startedAt: number;
  }> = new Map();

  async startConversation(
    agent: SwarmAgent,
    task: SwarmTask
  ): Promise<string> {
    const conversationId = generateId('conversation');

    this.conversations.set(conversationId, {
      agentId: agent.id,
      taskId: task.id,
      messages: [],
      startedAt: Date.now(),
    });

    return conversationId;
  }

  async addMessage(
    conversationId: string,
    message: Message
  ): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.messages.push({
      ...message,
      timestamp: Date.now(),
    });
  }

  async getHistory(
    conversationId: string,
    maxMessages?: number
  ): Promise<Message[]> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const messages = conversation.messages;

    if (maxMessages) {
      return messages.slice(-maxMessages);
    }

    return messages;
  }

  async endConversation(conversationId: string): Promise<void> {
    this.conversations.delete(conversationId);
  }
}

// ===== ResponseParser =====
class ResponseParser {
  parse(response: LLMResponse): TaskResult {
    const content = response.content;

    // Try JSON extraction
    const json = this.extractJSON(content);
    if (json && this.isValidTaskResult(json)) {
      return this.formatTaskResult(json);
    }

    // Try code block extraction
    const codeBlocks = this.extractCodeBlocks(content);
    for (const block of codeBlocks) {
      if (block.language === 'json') {
        const json = this.extractJSON(block.code);
        if (json && this.isValidTaskResult(json)) {
          return this.formatTaskResult(json);
        }
      }
    }

    // Fallback to natural language parsing
    return this.inferResults(content);
  }

  private extractJSON(text: string): any | null {
    // Try to find JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    try {
      return JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
  }

  private extractCodeBlocks(text: string): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      blocks.push({
        language: match[1] || 'text',
        code: match[2].trim(),
      });
    }

    return blocks;
  }

  private isValidTaskResult(obj: any): boolean {
    return (
      obj &&
      typeof obj.summary === 'string' &&
      typeof obj.confidence === 'number'
    );
  }

  private formatTaskResult(obj: any): TaskResult {
    return {
      output: obj.summary,
      artifacts: obj.artifacts || {},
      metadata: {
        confidence: obj.confidence,
        blockers: obj.blockers || [],
        nextSteps: obj.nextSteps || [],
      },
      quality: obj.confidence,
      completeness: obj.confidence,
      accuracy: obj.confidence,
      executionTime: 0, // Set by executor
      resourcesUsed: {
        cpuTime: 0,
        maxMemory: 0,
        diskIO: 0,
        networkIO: 0,
        fileHandles: 0,
      },
      validated: true,
    };
  }

  private inferResults(text: string): TaskResult {
    // Fallback: create basic result from text
    return {
      output: text,
      artifacts: {},
      metadata: {},
      quality: 0.5,
      completeness: 0.5,
      accuracy: 0.5,
      executionTime: 0,
      resourcesUsed: {
        cpuTime: 0,
        maxMemory: 0,
        diskIO: 0,
        networkIO: 0,
        fileHandles: 0,
      },
      validated: false,
    };
  }
}
```

---

## Data Flow

### 1. Task Execution Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SwarmCoordinator.assignTask(taskId, agentId)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. SwarmCoordinator.executeTask(task, agent)                    │
│    - Create ExecutionContext                                     │
│    - Initialize AgentExecutor                                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. AgentExecutor.executeTask(task, agent)                       │
│    - Start conversation (ConversationManager)                   │
│    - Build initial prompt (AgentPromptBuilder)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. ProviderManager.complete(request, agentType)                 │
│    - Select provider via tiered routing                         │
│    - Route to Z.ai provider                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. ZaiProvider.doComplete(request)                              │
│    - POST /api/anthropic/v1/messages                            │
│    - Return LLMResponse                                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. AgentExecutor processes response                             │
│    - Extract tool calls                                         │
│    - Execute tools via AgentToolkit                             │
│    - Add tool results to conversation                           │
│    - Loop until no more tool calls                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 7. ResponseParser.parse(finalResponse)                          │
│    - Extract JSON result                                        │
│    - Format as TaskResult                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 8. SwarmCoordinator.handleTaskCompleted(taskId, result)         │
│    - Update task status                                         │
│    - Update agent metrics                                       │
│    - Emit events                                                │
└─────────────────────────────────────────────────────────────────┘
```

### 2. Tool Execution Flow

```
Agent Response: "I need to read config.json"
                              │
                              ▼
AgentExecutor.extractToolCalls(response)
  → Returns: [{ name: 'read', input: { path: 'config.json' } }]
                              │
                              ▼
AgentToolkit.executeTool('read', { path: 'config.json' }, agent)
                              │
                              ▼
AgentToolkit.validatePath('config.json')
  → Returns: '/workspace/config.json'
                              │
                              ▼
fs.readFile('/workspace/config.json', 'utf-8')
  → Returns: { "port": 3000, ... }
                              │
                              ▼
AgentExecutor.formatToolResults([result])
  → Returns: "Tool: read\nResult: {\"port\":3000}\nStatus: success"
                              │
                              ▼
ConversationManager.addMessage(conversationId, {
  role: 'user',
  content: "Tool: read\nResult: {...}\nStatus: success"
})
                              │
                              ▼
Next LLM turn with tool results
```

### 3. Message Flow (70-Agent Mesh)

```
Agent 1 (coder)                Agent 2 (tester)              Agent 3 (reviewer)
      │                               │                              │
      ├─> Redis pub/sub ─────────────┼──────────────────────────────┤
      │   "agent:completed"           │                              │
      │                               │                              │
      ├─> SQLite memory ──────────────┼──────────────────────────────┤
      │   "cfn/phase/loop3/results"   │                              │
      │                               │                              │
      ├─> File system ────────────────┼──────────────────────────────┤
      │   "src/api.ts"                │                              │
      │                               │                              │
      │                               ├─> Read file                  │
      │                               ├─> Run tests                  │
      │                               ├─> Publish results ───────────┤
      │                               │                              │
      │                               │                   ├─> Review code
      │                               │                   ├─> Check coverage
      │                               │                   ├─> Publish consensus
      │                               │                              │
      └───────────────────────────────┴──────────────────────────────┘
                                      │
                                      ▼
                         SwarmCoordinator aggregates results
```

---

## Tool Execution Strategy

### Approach: System Prompts + Structured Output

**Rationale:**
- Z.ai supports Anthropic Messages API but may not support full function calling
- System prompts with structured output format is more robust
- Can later upgrade to native function calling if Z.ai adds support

### Tool Specification Format

```markdown
# TOOLS AVAILABLE

## read
Description: Read file contents
Parameters:
  - path (string, required): File path relative to workspace

Usage:
<tool>read</tool>
<input>{"path": "src/api.ts"}</input>

## write
Description: Write file contents
Parameters:
  - path (string, required): File path
  - content (string, required): File content

Usage:
<tool>write</tool>
<input>{"path": "src/api.ts", "content": "..."}</input>

## edit
Description: Edit file with search/replace
Parameters:
  - path (string, required): File path
  - search (string, required): Text to find
  - replace (string, required): Replacement text

Usage:
<tool>edit</tool>
<input>{"path": "src/api.ts", "search": "old code", "replace": "new code"}</input>

## bash
Description: Execute bash command (sandboxed)
Parameters:
  - command (string, required): Command to execute

Usage:
<tool>bash</tool>
<input>{"command": "npm test"}</input>

## redis_publish
Description: Publish message to Redis channel
Parameters:
  - channel (string, required): Channel name
  - message (object, required): Message payload

Usage:
<tool>redis_publish</tool>
<input>{"channel": "agent:lifecycle", "message": {"status": "complete"}}</input>

## memory_store
Description: Store data in SQLite memory
Parameters:
  - key (string, required): Memory key
  - value (object, required): Value to store
  - aclLevel (number, optional): ACL level (1-5)

Usage:
<tool>memory_store</tool>
<input>{"key": "cfn/phase/loop3/result", "value": {...}, "aclLevel": 1}</input>

## memory_get
Description: Retrieve data from SQLite memory
Parameters:
  - key (string, required): Memory key

Usage:
<tool>memory_get</tool>
<input>{"key": "cfn/phase/loop3/result"}</input>
```

### Tool Call Extraction Regex

```typescript
private extractToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];

  // Pattern 1: XML-style tags
  const xmlPattern = /<tool>(\w+)<\/tool>\s*<input>(.*?)<\/input>/gs;
  let match;

  while ((match = xmlPattern.exec(content)) !== null) {
    const toolName = match[1];
    const input = JSON.parse(match[2]);
    calls.push({ name: toolName, input });
  }

  // Pattern 2: JSON function calling (if supported)
  if (calls.length === 0) {
    const jsonPattern = /"function":\s*"(\w+)",\s*"arguments":\s*({.*?})/gs;
    while ((match = jsonPattern.exec(content)) !== null) {
      const toolName = match[1];
      const input = JSON.parse(match[2]);
      calls.push({ name: toolName, input });
    }
  }

  return calls;
}
```

---

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)
**Tasks:**
1. Create `AgentExecutor` class in `src/coordination/agent-executor.ts`
2. Create `AgentToolkit` class in `src/coordination/agent-toolkit.ts`
3. Create `ConversationManager` class in `src/coordination/conversation-manager.ts`
4. Create `AgentPromptBuilder` class in `src/coordination/agent-prompt-builder.ts`
5. Create `ResponseParser` class in `src/coordination/response-parser.ts`

**Deliverables:**
- 5 new TypeScript classes
- Unit tests for each class
- Integration test skeleton

### Phase 2: SwarmCoordinator Integration (Week 2)
**Tasks:**
1. Replace `simulateTaskExecution()` with real execution
2. Integrate `AgentExecutor` into `executeTask()` method
3. Add error handling and retry logic
4. Implement metrics tracking
5. Add execution context creation

**Deliverables:**
- Updated `SwarmCoordinator` class
- Integration tests passing
- Metrics dashboard updates

### Phase 3: Tool Implementation (Week 3)
**Tasks:**
1. Implement file operation tools (read, write, edit)
2. Implement bash execution with sandboxing
3. Implement Redis pub/sub tools
4. Implement SQLite memory tools
5. Add security validation and sanitization

**Deliverables:**
- Complete `AgentToolkit` with all tools
- Security audit passed
- Tool execution tests

### Phase 4: Testing & Validation (Week 4)
**Tasks:**
1. 70-agent mesh coordination test
2. Performance benchmarks (<500ms spawn, <2s task)
3. Security penetration testing
4. Load testing (sustained 100 agents)
5. Documentation and examples

**Deliverables:**
- All tests passing
- Performance metrics met
- Security report
- Integration documentation

---

## Testing Strategy

### Unit Tests

```typescript
// agent-executor.test.ts
describe('AgentExecutor', () => {
  it('should execute simple task without tools', async () => {
    const executor = new AgentExecutor(/* deps */);
    const result = await executor.executeTask(mockTask, mockAgent);
    expect(result.output).toBeDefined();
    expect(result.quality).toBeGreaterThan(0.7);
  });

  it('should handle tool calls in conversation', async () => {
    const executor = new AgentExecutor(/* deps */);
    const result = await executor.executeTask(fileReadTask, mockAgent);
    expect(result.artifacts).toHaveProperty('filesRead');
  });

  it('should timeout on excessive tool calls', async () => {
    const executor = new AgentExecutor(/* deps */);
    await expect(
      executor.executeTask(infiniteLoopTask, mockAgent)
    ).rejects.toThrow('Tool call limit exceeded');
  });
});

// agent-toolkit.test.ts
describe('AgentToolkit', () => {
  it('should validate file paths', () => {
    const toolkit = new AgentToolkit(/* deps */);
    expect(() => toolkit.validatePath('../../../etc/passwd'))
      .toThrow('Path outside working directory');
  });

  it('should sanitize bash commands', () => {
    const toolkit = new AgentToolkit(/* deps */);
    expect(() => toolkit.validateCommand('rm -rf /'))
      .toThrow('Command not allowed');
  });

  it('should execute read tool successfully', async () => {
    const toolkit = new AgentToolkit(/* deps */);
    const result = await toolkit.executeTool('read', { path: 'test.txt' }, mockAgent);
    expect(result.status).toBe('success');
    expect(result.result).toContain('test content');
  });
});
```

### Integration Tests

```typescript
// swarm-executor-integration.test.ts
describe('SwarmCoordinator + AgentExecutor Integration', () => {
  it('should execute real task via Z.ai', async () => {
    const coordinator = new SwarmCoordinator(/* config */);
    await coordinator.start();

    const objectiveId = await coordinator.createObjective(
      'Create a simple calculator function',
      'development'
    );

    await coordinator.executeObjective(objectiveId);

    const status = coordinator.getSwarmStatus();
    expect(status.tasks.completed).toBeGreaterThan(0);
  });

  it('should handle 70-agent mesh coordination', async () => {
    const coordinator = new SwarmCoordinator({
      maxAgents: 70,
      coordinationStrategy: 'distributed',
    });

    // Register 70 agents
    for (let i = 0; i < 70; i++) {
      await coordinator.registerAgent(`agent-${i}`, 'coder');
    }

    // Execute complex objective
    const objectiveId = await coordinator.createObjective(
      'Build microservices architecture',
      'development'
    );

    const startTime = Date.now();
    await coordinator.executeObjective(objectiveId);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(60000); // < 1 minute
    expect(coordinator.getSwarmStatus().agents.completed).toBe(70);
  });
});
```

### Performance Tests

```typescript
// performance.test.ts
describe('Performance Benchmarks', () => {
  it('should spawn agent in <500ms', async () => {
    const executor = new AgentExecutor(/* deps */);
    const startTime = Date.now();

    await executor.executeTask(simpleTask, mockAgent);

    const spawnTime = Date.now() - startTime;
    expect(spawnTime).toBeLessThan(500);
  });

  it('should complete simple task in <2s', async () => {
    const executor = new AgentExecutor(/* deps */);
    const startTime = Date.now();

    const result = await executor.executeTask(helloWorldTask, mockAgent);

    const executionTime = Date.now() - startTime;
    expect(executionTime).toBeLessThan(2000);
    expect(result.quality).toBeGreaterThan(0.8);
  });

  it('should sustain 100 concurrent agents', async () => {
    const coordinator = new SwarmCoordinator({ maxAgents: 100 });

    const tasks = Array.from({ length: 100 }, (_, i) =>
      coordinator.createObjective(`Task ${i}`, 'development')
    );

    const startTime = Date.now();
    await Promise.all(tasks);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(120000); // < 2 minutes
  });
});
```

---

## Performance Considerations

### Bottlenecks & Optimizations

#### 1. LLM API Latency
**Bottleneck:** Z.ai API calls (100-500ms per request)

**Optimizations:**
- Use streaming for long responses
- Batch tool results in single message
- Implement request caching for similar prompts
- Use connection pooling

#### 2. Tool Execution Time
**Bottleneck:** File I/O, bash execution (10-100ms)

**Optimizations:**
- Async tool execution where possible
- Tool result caching
- Parallel tool execution for independent calls
- Lazy loading for large files

#### 3. Conversation State Management
**Bottleneck:** Memory usage for 70+ conversations

**Optimizations:**
- Sliding window for conversation history (last 10 messages)
- Compress old messages
- Offload to Redis for persistence
- TTL-based cleanup

#### 4. Redis Pub/Sub Throughput
**Bottleneck:** High message volume in 70-agent mesh

**Optimizations:**
- Message batching
- Dedicated subscriber client
- Channel namespacing
- Priority queues

### Target Performance Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Agent spawn time | <500ms | Time from `executeTask()` to first LLM call |
| Simple task completion | <2s | Hello World task end-to-end |
| Tool execution | <100ms | Average per tool call |
| Memory per agent | <50MB | Heap usage per conversation |
| Concurrent agents | 70+ | Sustained without degradation |
| Message throughput | 1000/sec | Redis pub/sub messages |

---

## Security & Compliance

### Security Controls

#### 1. Path Traversal Prevention
```typescript
private validatePath(filePath: string): string {
  const resolved = path.resolve(this.workingDir, filePath);
  if (!resolved.startsWith(this.workingDir)) {
    throw new SecurityError('Path outside working directory');
  }
  return resolved;
}
```

#### 2. Command Injection Prevention
```typescript
private validateCommand(command: string): string {
  const allowedCommands = ['ls', 'cat', 'grep', 'find', 'git'];
  const cmd = command.split(' ')[0];

  if (!allowedCommands.includes(cmd)) {
    throw new SecurityError(`Command not allowed: ${cmd}`);
  }

  // Additional validation: no shell metacharacters
  if (/[;&|`$()]/.test(command)) {
    throw new SecurityError('Shell metacharacters not allowed');
  }

  return command;
}
```

#### 3. Input Sanitization
```typescript
private sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove script injection patterns
    return input.replace(/<script|javascript:|onerror=|eval\(/gi, '');
  }

  if (typeof input === 'object') {
    // Recursively sanitize object properties
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = this.sanitizeInput(value);
    }
    return sanitized;
  }

  return input;
}
```

#### 4. Resource Limits
```typescript
interface ResourceLimits {
  maxFileSize: number; // 10MB
  maxExecutionTime: number; // 30s
  maxToolCalls: number; // 10 per task
  maxMemoryUsage: number; // 100MB per agent
}

private enforceResourceLimits(
  operation: string,
  usage: ResourceUsage
): void {
  if (usage.fileSize > this.limits.maxFileSize) {
    throw new SecurityError('File size limit exceeded');
  }

  if (usage.executionTime > this.limits.maxExecutionTime) {
    throw new SecurityError('Execution time limit exceeded');
  }
}
```

#### 5. ACL Enforcement
```typescript
private validateMemoryAccess(
  key: string,
  agent: SwarmAgent,
  aclLevel: ACLLevel
): boolean {
  // Private: only agent owner can access
  if (aclLevel === ACLLevel.PRIVATE) {
    return key.startsWith(`agent/${agent.id}`);
  }

  // Team: agents in same team
  if (aclLevel === ACLLevel.TEAM) {
    return key.includes(`team/${agent.teamId}`);
  }

  // Swarm: all agents in swarm
  if (aclLevel === ACLLevel.SWARM) {
    return key.includes(`swarm/${agent.swarmId}`);
  }

  return false;
}
```

### Audit Logging

```typescript
class SecurityAuditLogger {
  async logToolExecution(
    agent: SwarmAgent,
    tool: string,
    input: any,
    result: ToolResult
  ): Promise<void> {
    await this.logger.audit('tool_execution', {
      agentId: agent.id,
      tool,
      input: this.sanitizeForLog(input),
      status: result.status,
      executionTime: result.executionTime,
      timestamp: Date.now(),
    });
  }

  async logSecurityViolation(
    agent: SwarmAgent,
    violation: string,
    details: any
  ): Promise<void> {
    await this.logger.audit('security_violation', {
      agentId: agent.id,
      violation,
      details: this.sanitizeForLog(details),
      timestamp: Date.now(),
      severity: 'high',
    });
  }

  private sanitizeForLog(data: any): any {
    // Remove sensitive data from logs
    const sanitized = JSON.stringify(data);
    return sanitized.replace(/password|token|secret/gi, '[REDACTED]');
  }
}
```

---

## Appendix: File Structure

```
src/coordination/
├── swarm-coordinator.ts           # Main coordinator (updated)
├── agent-executor.ts               # NEW: Agent execution bridge
├── agent-toolkit.ts                # NEW: Tool provisioning
├── conversation-manager.ts         # NEW: Conversation state
├── agent-prompt-builder.ts         # NEW: Prompt construction
├── response-parser.ts              # NEW: Result extraction
└── security-audit-logger.ts        # NEW: Security logging

src/providers/
├── provider-manager.ts             # Existing (no changes)
├── zai-provider.ts                 # Existing (no changes)
└── types.ts                        # Existing (no changes)

tests/coordination/
├── agent-executor.test.ts          # NEW: Unit tests
├── agent-toolkit.test.ts           # NEW: Tool tests
├── conversation-manager.test.ts    # NEW: Conversation tests
├── swarm-executor-integration.test.ts  # NEW: Integration tests
└── performance.test.ts             # NEW: Performance benchmarks
```

---

## Summary

This architecture provides a robust, scalable, and secure integration between SwarmCoordinator and ProviderManager, enabling real Z.ai-powered agent execution with:

✅ **Full tool access** (file ops, bash, Redis, SQLite)
✅ **70-agent mesh coordination** capability
✅ **<500ms spawn time, <2s simple task completion**
✅ **Security-first design** with path validation, command whitelisting, ACL enforcement
✅ **Comprehensive testing** strategy with unit, integration, and performance tests

The modular design allows incremental implementation and easy extension for future requirements.
