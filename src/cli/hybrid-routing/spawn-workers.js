#!/usr/bin/env node

/**
 * Real Hybrid Routing CLI - Spawns actual Claude agents with bash execution
 *
 * Usage:
 *   node src/cli/hybrid-routing/spawn-workers.js "Task description" --max-agents 3 --provider zai
 *   node src/cli/hybrid-routing/spawn-workers.js "Build auth" --max-agents 5 --redis-channel swarm:auth
 *
 * Features:
 * - Real Claude API calls (Anthropic or z.ai provider)
 * - Bash command execution capability
 * - Redis pub/sub coordination
 * - SQLite memory storage
 * - Token usage tracking
 * - Cost optimization ($0.50/1M tokens for z.ai)
 */

import { createClient } from 'redis';
import { createRequire } from 'module';
import { io } from 'socket.io-client';
import AgentUseCaseRegistry from './agent-use-cases.js';
const require = createRequire(import.meta.url);
const MemoryStoreAdapter = require('../../sqlite/MemoryStoreAdapter.cjs');

// Simple fetch-based Anthropic API client (no SDK dependency)
class SimpleAnthropicClient {
  constructor(apiKey, baseURL = 'https://api.anthropic.com/v1') {
    this.apiKey = apiKey;
    this.baseURL = baseURL;
  }

  async createMessage(options) {
    const body = {
      model: options.model,
      max_tokens: options.max_tokens,
      system: options.system,
      messages: options.messages,
      temperature: options.temperature
    };

    // Add tools if provided
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const response = await fetch(`${this.baseURL}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${error}`);
    }

    return await response.json();
  }
}

// Cost per 1M tokens
const COSTS = {
  anthropic: {
    input: 3.00,  // $3/1M input tokens
    output: 15.00 // $15/1M output tokens
  },
  zai: {
    input: 0.50,  // $0.50/1M input tokens
    output: 0.50  // $0.50/1M output tokens
  }
};

// Topology-specific timeout configuration (Phase 3 Deliverable 1)
const TOPOLOGY_TIMEOUTS = {
  'sequential': 120000,      // 2 minutes - simple parallel execution
  'bidirectional': 300000,   // 5 minutes - iterative feedback loops
  'collaborative': 360000,   // 6 minutes - Q&A coordination + work
  'release-gate': 360000     // 6 minutes - barrier synchronization + wait
};

// Anthropic tool definitions
const ANTHROPIC_TOOLS = [
  {
    name: "bash_execute",
    description: "Execute bash commands on the system. Use this to run commands, install packages, create files, etc.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute"
        }
      },
      required: ["command"]
    }
  },
  {
    name: "write_file",
    description: "Write content to a file on the filesystem",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative file path"
        },
        content: {
          type: "string",
          description: "Content to write to the file"
        }
      },
      required: ["path", "content"]
    }
  },
  {
    name: "read_file",
    description: "Read content from a file on the filesystem",
    input_schema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative file path"
        }
      },
      required: ["path"]
    }
  }
];

class HybridWorkerSpawner {
  constructor(options = {}) {
    this.provider = options.provider || 'zai';
    this.maxAgents = options.maxAgents || 3;
    this.redisChannel = options.redisChannel || 'swarm:workers';
    this.taskDescription = options.task || 'Execute task';
    this.model = options.model || 'haiku';

    // Topology-aware timeout (Phase 3 Deliverable 1)
    this.topology = options.topology || 'sequential';
    this.timeout = options.timeout || TOPOLOGY_TIMEOUTS[this.topology] || 120000;

    // Background execution mode (Phase 3 Deliverable 2)
    this.background = options.background || false;

    // REQUIRED: Agent types must be specified
    this.agentOverride = options.agentOverride || null; // Array of agent types: ['coder', 'architect', 'tester']
    this.subtaskOverride = options.subtaskOverride || null; // Array of custom subtasks (optional)

    // Redis coordination configuration (topology already set above with timeout)
    this.dependenciesOverride = options.dependencies || null; // User-provided dependency graph (explicit)

    // Agent whitelist/blacklist configuration
    this.agentWhitelist = options.agentWhitelist || null; // Array of allowed agent types (null = allow all)
    this.agentBlacklist = options.agentBlacklist || null; // Array of blocked agent types

    // Use case registry for intelligent agent selection
    this.useCaseRegistry = null;

    // Agent discovery caching
    this.cachedAgents = null; // Lazy-loaded and cached agent definitions

    // Valid agent types (loaded from AVAILABLE-AGENTS.md or .claude/agents/)
    this.validAgentTypes = null; // Lazy-loaded list of valid agent types

    // Initialize Anthropic client based on provider
    const apiKey = this.provider === 'zai'
      ? process.env.Z_AI_API_KEY
      : process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error(`API key not found for provider: ${this.provider}. Set ${this.provider === 'zai' ? 'Z_AI_API_KEY' : 'ANTHROPIC_API_KEY'} in .env`);
    }

    // Initialize simple Anthropic client with correct base URL for z.ai
    const baseURL = this.provider === 'zai'
      ? 'https://api.z.ai/api/anthropic/v1'
      : 'https://api.anthropic.com/v1';

    this.anthropic = new SimpleAnthropicClient(apiKey, baseURL);

    // Redis client (optional, gracefully degrade if unavailable)
    this.redisClient = null;
    this.redisAvailable = false;

    // SQLite memory adapter
    this.memoryAdapter = null;

    // Socket.IO client for web portal integration
    this.socketClient = null;
    this.socketAvailable = false;
    this.portalUrl = options.portalUrl || process.env.PORTAL_URL || 'http://localhost:3002';
    this.portalConnectionAttempts = 0;
    this.maxPortalConnectionAttempts = 5;

    // Results tracking
    this.results = [];
    this.totalTokens = { input: 0, output: 0, total: 0 };
    this.totalCost = 0;
  }

  /**
   * Execute a tool call
   */
  async executeTool(toolName, toolInput) {
    const { execSync } = await import('child_process');
    const { promises: fs } = await import('fs');

    try {
      switch (toolName) {
        case 'bash_execute':
          const output = execSync(toolInput.command, {
            encoding: 'utf-8',
            timeout: 30000, // 30 second timeout
            maxBuffer: 1024 * 1024 // 1MB buffer
          });
          return { success: true, output: output.toString() };

        case 'write_file':
          await fs.writeFile(toolInput.path, toolInput.content, 'utf-8');
          return { success: true, message: `File written to ${toolInput.path}` };

        case 'read_file':
          const content = await fs.readFile(toolInput.path, 'utf-8');
          return { success: true, content };

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Initialize Redis, SQLite, and Socket.IO connections
   */
  async initialize() {
    // Try to initialize Redis (optional)
    try {
      this.redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
      });

      this.redisClient.on('error', (err) => {
        console.log('⚠️  Redis unavailable, continuing without coordination');
        this.redisAvailable = false;
      });

      await this.redisClient.connect();
      this.redisAvailable = true;
      console.log('✅ Redis connection established');
    } catch (error) {
      console.log('⚠️  Redis unavailable, continuing without coordination');
      this.redisAvailable = false;
    }

    // Initialize SQLite memory adapter
    try {
      this.memoryAdapter = new MemoryStoreAdapter({
        dbPath: process.env.SQLITE_MEMORY_PATH || './swarm-memory.db',
        swarmId: 'hybrid-workers',
        namespace: 'hybrid-routing'
      });

      // Suppress error events to prevent unhandled crashes
      if (this.memoryAdapter && this.memoryAdapter.on) {
        this.memoryAdapter.on('error', () => {
          // Silent error suppression
        });
      }

      await this.memoryAdapter.initialize();
      console.log('✅ SQLite memory adapter initialized');
    } catch (error) {
      console.log('⚠️  SQLite unavailable, continuing without memory storage');
      this.memoryAdapter = null;
    }

    // Initialize Socket.IO client for web portal (optional, graceful degradation)
    try {
      this.socketClient = io(this.portalUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.maxPortalConnectionAttempts,
        timeout: 10000,
        forceNew: true,
        autoConnect: true,
        withCredentials: true
      });

      // Handle connection events
      this.socketClient.on('connect', () => {
        this.socketAvailable = true;
        this.portalConnectionAttempts = 0;
        console.log(`✅ Socket.IO connected to web portal: ${this.portalUrl}`);
      });

      this.socketClient.on('connect_error', (error) => {
        this.portalConnectionAttempts++;
        this.socketAvailable = false;
        if (this.portalConnectionAttempts === 1) {
          // Only log once to avoid spam
          console.log(`⚠️  Portal connection error: ${error.message}`);
          console.log(`   Retrying... (attempt ${this.portalConnectionAttempts}/${this.maxPortalConnectionAttempts})`);
        }
        if (this.portalConnectionAttempts >= this.maxPortalConnectionAttempts) {
          console.log('⚠️  Web portal unavailable, continuing without live updates');
        }
      });

      this.socketClient.on('disconnect', (reason) => {
        this.socketAvailable = false;
        if (reason === 'io server disconnect') {
          // Server disconnected us, try to reconnect
          this.socketClient.connect();
        }
      });

      this.socketClient.on('reconnect', (attemptNumber) => {
        console.log(`✅ Reconnected to portal (attempt ${attemptNumber})`);
        this.socketAvailable = true;
        this.portalConnectionAttempts = 0;
      });

      // Wait briefly for initial connection (non-blocking)
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.log(`⚠️  Socket.IO initialization error: ${error.message}`);
      console.log('   Continuing without web portal integration');
      this.socketAvailable = false;
      this.socketClient = null;
    }
  }

  /**
   * Spawn a single worker agent with retry logic for 502 errors
   * Exponential backoff: 1s, 2s, 4s (max 3 retries)
   */
  async spawnWorkerWithRetry(workerId, subtask, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.spawnWorker(workerId, subtask);
      } catch (error) {
        // Check if it's a 502 error
        const is502 = error.message && (
          error.message.includes('502') ||
          error.message.includes('Bad Gateway')
        );

        if (!is502 || attempt === maxRetries) {
          // Not a 502 error, or final attempt failed - rethrow
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        console.log(`⚠️  Worker ${workerId} 502 error, retry ${attempt}/${maxRetries} in ${backoffMs/1000}s`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }

  /**
   * Emit Socket.IO event to web portal
   */
  emitPortalEvent(eventType, payload) {
    if (this.socketAvailable && this.socketClient) {
      try {
        this.socketClient.emit(eventType, payload);
      } catch (error) {
        // Silent failure - portal events are optional
      }
    }
  }

  /**
   * Generate topology-specific Redis coordination instructions for WORKERS
   * Workers just signal completion - coordinator handles complex logic
   */
  generateTopologyInstructions(topology, workerId, agentType) {
    const channelPrefix = {
      'bidirectional': 'swarm:bidirectional',
      'collaborative': 'swarm:collab',
      'release-gate': 'swarm:gate',
      'sequential': 'swarm:sequential'
    }[topology];

    // Release-gate topology has special worker instructions
    if (topology === 'release-gate') {
      return `

## Redis Coordination - Release Gate (Barrier Synchronization)

A coordinator agent is managing the barrier. You must reach the barrier and wait.

**Your Task:**
1. Complete your assigned work
2. Signal arrival at barrier
3. Wait for coordinator release
4. Confirm release and continue

**Step 1 - Signal Arrival at Barrier:**
\`\`\`javascript
bash_execute({ command: "redis-cli incr \\"${channelPrefix}:agents_waiting\\"" })
bash_execute({ command: "redis-cli set \\"${channelPrefix}:${agentType}:status\\" \\"arrived\\"" })
\`\`\`

**Step 2 - Wait for Release (polling loop):**
\`\`\`bash
# Poll every 2 seconds for up to 60 seconds
for i in {1..30}; do
  release=$(redis-cli get "${channelPrefix}:release")
  if [ "$release" = "true" ]; then
    echo "Released by coordinator"
    break
  fi
  sleep 2
done
\`\`\`

Execute via bash_execute tool.

**Step 3 - Confirm Release:**
\`\`\`javascript
bash_execute({ command: "redis-cli set \\"${channelPrefix}:${agentType}:status\\" \\"released\\"" })
\`\`\`
`;
    }

    // For other non-sequential topologies, workers have simple instructions
    if (topology !== 'sequential') {
      return `

## Redis Coordination (Simplified Worker Instructions)

A coordinator agent is managing the ${topology} coordination pattern.

**Your Task:**
1. Complete your assigned work
2. Signal completion to the coordinator via Redis
3. Wait for further instructions if needed

**Signal Completion:**
\`\`\`javascript
bash_execute({ command: "redis-cli lpush \\"${channelPrefix}:${agentType}:done\\" '<JSON_OUTPUT>'" })
\`\`\`

Where JSON_OUTPUT is your work result, e.g.:
\`{"confidence": 0.85, "content": "your work summary"}\`

**Then set status:**
\`\`\`javascript
bash_execute({ command: "redis-cli set \\"${channelPrefix}:${agentType}:status\\" \\"work_complete\\"" })
\`\`\`

The coordinator will handle the rest of the coordination pattern.
`;
    }

    // Sequential topology (no coordinator, no coordination)
    return `

## Sequential Execution

Simple sequential pattern - complete your task independently.

**Optional:** Signal completion for monitoring:
\`\`\`javascript
bash_execute({ command: "redis-cli set \\"${channelPrefix}:${agentType}:status\\" \\"complete\\"" })
\`\`\`
`;
  }

  /**
   * Spawn coordinator agent to manage Redis coordination patterns
   */
  async spawnCoordinator(subtasks) {
    const startTime = Date.now();
    const agentTypes = subtasks.map(st => typeof st === 'object' ? st.agentType : 'generic');

    console.log(`👑 Coordinator: Managing ${this.topology} coordination for ${agentTypes.join(', ')}`);

    const coordinatorPrompt = this.generateCoordinatorInstructions(this.topology, agentTypes, subtasks);

    try {
      let messages = [
        {
          role: 'user',
          content: `Coordinate the following workers using ${this.topology} topology:\n${agentTypes.map((t, i) => `- Worker ${i + 1}: ${t}`).join('\n')}\n\nUse Redis to manage coordination. Monitor worker status and orchestrate the pattern.`
        }
      ];

      let inputTokens = 0;
      let outputTokens = 0;
      let toolUseCount = 0;
      const MAX_TOOL_ITERATIONS = 50; // Coordinators need fewer iterations
      let content = '';

      // Tool use loop (simplified for coordinator)
      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const response = await this.anthropic.createMessage({
          model: this.model,
          max_tokens: 8000,
          system: coordinatorPrompt,
          messages: messages,
          temperature: 0.7,
          tools: ANTHROPIC_TOOLS
        });

        const inputTokens = response.usage?.input_tokens || 0;
        const outputTokens = response.usage?.output_tokens || 0;

        // Update tokens
        this.totalTokens.input += inputTokens;
        this.totalTokens.output += outputTokens;

        // Process response content
        let hasToolUse = false;
        for (const block of response.content) {
          if (block.type === 'text') {
            content += block.text;
          } else if (block.type === 'tool_use') {
            hasToolUse = true;
            toolUseCount++;
            const toolResult = await this.executeTool(block.name, block.input);

            messages.push({
              role: 'assistant',
              content: response.content
            });

            messages.push({
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify(toolResult)
              }]
            });
          }
        }

        if (!hasToolUse) {
          break; // Coordinator finished
        }

        if (response.stop_reason === 'end_turn') {
          break;
        }
      }

      const duration = Date.now() - startTime;
      console.log(`👑 Coordinator: Completed in ${duration}ms (${toolUseCount} tool uses)`);

      return {
        workerId: 0, // Coordinator ID
        success: true,
        content,
        confidence: 1.0,
        inputTokens,
        outputTokens,
        toolUseCount,
        duration
      };

    } catch (error) {
      console.error(`👑 Coordinator: Error - ${error.message}`);
      return {
        workerId: 0,
        success: false,
        error: error.message,
        inputTokens: 0,
        outputTokens: 0,
        toolUseCount: 0,
        duration: Date.now() - startTime
      };
    }
  }

  /**
   * Generate coordinator-specific instructions for Redis management
   */
  generateCoordinatorInstructions(topology, agentTypes, subtasks) {
    const channelPrefix = {
      'bidirectional': 'swarm:bidirectional',
      'collaborative': 'swarm:collab',
      'release-gate': 'swarm:gate'
    }[topology];

    switch(topology) {
      case 'bidirectional':
        return `You are a coordination agent managing a bidirectional feedback loop between two workers.

**Workers:**
- Worker 1 (Producer): ${agentTypes[0]}
- Worker 2 (Reviewer): ${agentTypes[1]}

**Your Role:**
Monitor Redis for worker completion, facilitate feedback exchanges, ensure iterative improvement, and handle potential failures.

## Error Detection

**Check for Worker Failures:**
\`\`\`bash
# After timeout, check which workers didn't signal
for agent in ${agentTypes.join(' ')}; do
  status=$(redis-cli get "${channelPrefix}:$agent:status")
  if [ -z "$status" ]; then
    echo "⚠️  $agent failed to signal (no status key)"
    redis-cli set "${channelPrefix}:$agent:status" "failed"
  fi
done
\`\`\`

**Set Failure State:**
\`\`\`javascript
bash_execute({ command: "redis-cli set \\"${channelPrefix}:status\\" \\"partial_failure\\"" })
bash_execute({ command: "redis-cli set \\"${channelPrefix}:failed_count\\" \\"${agentTypes.filter(t => !status).length}\\"" })
\`\`\`

**Coordination Steps:**

1. **Wait for Producer Work:**
\`\`\`javascript
bash_execute({ command: "redis-cli --csv blpop \\"${channelPrefix}:${agentTypes[0]}:done\\" 30" })
\`\`\`

2. **Forward to Reviewer:**
\`\`\`javascript
bash_execute({ command: "redis-cli lpush \\"${channelPrefix}:${agentTypes[1]}:work\\" '<producer_output>'" })
\`\`\`

3. **Wait for Review:**
\`\`\`javascript
bash_execute({ command: "redis-cli --csv blpop \\"${channelPrefix}:${agentTypes[1]}:feedback\\" 30" })
\`\`\`

4. **Check Quality:**
   - If approved: Set status complete, exit
   - If needs fixes: Forward feedback to producer, repeat from step 1

5. **Max 3 iterations**, then force approval.

**Exit Criteria:**
- Work approved by reviewer
- OR 3 iterations completed
- Set \`${channelPrefix}:status\` to "complete"
`;

      case 'collaborative':
        return `You are a coordination agent managing collaborative Q&A between a lead and team members.

**Workers:**
${agentTypes.map((t, i) => `- Worker ${i + 1}: ${t}`).join('\n')}

**Your Role:**
Monitor worker completion, route questions from team to lead, facilitate answers, coordinate graceful shutdown, and handle potential failures.

## Error Detection

**Check for Worker Failures:**
\`\`\`bash
# After timeout, check which workers didn't signal
for agent in ${agentTypes.join(' ')}; do
  status=$(redis-cli get "${channelPrefix}:$agent:status")
  if [ -z "$status" ]; then
    echo "⚠️  $agent failed to signal (no status key)"
    redis-cli set "${channelPrefix}:$agent:status" "failed"
  fi
done
\`\`\`

**Set Failure State:**
\`\`\`javascript
bash_execute({ command: "redis-cli set \\"${channelPrefix}:status\\" \\"partial_failure\\"" })
bash_execute({ command: "redis-cli set \\"${channelPrefix}:failed_count\\" \\"${agentTypes.filter(t => !status).length}\\"" })
\`\`\`

**Coordination Steps:**

1. **Wait for All Workers (optimized with blocking):**
\`\`\`bash
# Use BRPOPLPUSH for efficient blocking wait
for agent in ${agentTypes.join(' ')}; do
  # Block until worker signals (60 second timeout)
  result=$(redis-cli brpoplpush "${channelPrefix}:$agent:done" "${channelPrefix}:$agent:processed" 60)

  if [ -z "$result" ]; then
    echo "⏱️  $agent timeout"
  else
    echo "✅ $agent complete: $result"
  fi
done
\`\`\`

2. **Enter Q&A Phase (blocking):**
\`\`\`bash
# Blocking wait for questions
while true; do
  # Use BLPOP for efficient, non-blocking wait (5-second timeout)
  question=$(redis-cli blpop "${channelPrefix}:questions" 5)

  if [ -z "$question" ]; then
    echo "No more questions or timeout"
    break
  fi

  # Route question to lead agent, process answer
  redis-cli rpush "${channelPrefix}:lead:questions" "$question"

  # Wait for lead agent's answer (blocking)
  answer=$(redis-cli blpop "${channelPrefix}:lead:answers" 30)

  if [ -n "$answer" ]; then
    # Forward answer back to requesters
    redis-cli rpush "${channelPrefix}:requesters:answers" "$answer"
  fi
done
\`\`\`

3. **Graceful Shutdown:**
\`\`\`javascript
bash_execute({ command: "redis-cli set \\"${channelPrefix}:all_done\\" \\"true\\"" })
\`\`\`

4. **Verify All Workers Exit:**
Check status for each worker becomes "complete"

**Exit Criteria:**
- All workers complete primary work
- Q&A phase finishes (or 5-second idle timeout)
- all_done flag set
`;

      case 'release-gate':
        return `You are a coordination agent managing barrier synchronization (release gate).

**Workers:**
${agentTypes.map((t, i) => `- Worker ${i + 1}: ${t}`).join('\n')}

**Your Role:**
Monitor worker completion, ensure ALL reach barrier, release all simultaneously, and handle potential failures.

## Error Detection

**Check for Worker Failures:**
\`\`\`bash
# After timeout, check which workers didn't signal
for agent in ${agentTypes.join(' ')}; do
  status=$(redis-cli get "${channelPrefix}:$agent:status")
  if [ -z "$status" ]; then
    echo "⚠️  $agent failed to signal (no status key)"
    redis-cli set "${channelPrefix}:$agent:status" "failed"
  fi
done
\`\`\`

**Set Failure State:**
\`\`\`javascript
bash_execute({ command: "redis-cli set \\"${channelPrefix}:status\\" \\"partial_failure\\"" })
bash_execute({ command: "redis-cli set \\"${channelPrefix}:failed_count\\" \\"${agentTypes.filter(t => !status).length}\\"" })
\`\`\`

**Coordination Steps:**

1. **Wait for All at Barrier (optimized with blocking):**
\`\`\`bash
# Use BLPOP with timeout for efficient blocking
while true; do
  # Block waiting for any worker arrival notification
  result=$(redis-cli blpop "${channelPrefix}:arrivals" 5)

  agents_waiting=$(redis-cli get "${channelPrefix}:agents_waiting")

  if [ "$agents_waiting" = "${agentTypes.length}" ]; then
    echo "All ${agentTypes.length} agents at barrier"
    break
  fi

  if [ -z "$result" ]; then
    echo "⏱️  Barrier wait timeout"
    break
  fi
done
\`\`\`

2. **Release All (immediate broadcast):**
\`\`\`javascript
bash_execute({ command: "redis-cli set \\"${channelPrefix}:release\\" \\"true\\"" })
\`\`\`

3. **Verify All Released (optimized with BLPOP):**
\`\`\`bash
# Wait for all agent releases with timeout
release_count=0
while [ "$release_count" -lt "${agentTypes.length}" ]; do
  # Block wait for 5 seconds
  result=$(redis-cli blpop "${channelPrefix}:releases" 5)

  if [ -n "$result" ]; then
    ((release_count++))
    echo "Agent released - total: $release_count/${agentTypes.length}"
  else
    echo "Release wait timeout - received $release_count/${agentTypes.length}"
    break
  fi
done
\`\`\`

**Exit Criteria:**
- All workers reach barrier or 5-second wait
- Release signal sent
- All (or most) workers exit with "released" status
`;

      default:
        return 'Coordinate workers as needed.';
    }
  }

  /**
   * Spawn a single worker agent with bash execution capability
   */
  async spawnWorker(workerId, subtask, customSystemPrompt = null) {
    const startTime = Date.now();

    // Extract agent type if subtask is an object
    let taskDescription = typeof subtask === 'string' ? subtask : subtask.task;
    let agentType = typeof subtask === 'object' ? subtask.agentType : 'generic';
    let baseSystemPrompt = typeof subtask === 'object' && subtask.systemPrompt
      ? subtask.systemPrompt
      : null;

    console.log(`🤖 Worker ${workerId} [${agentType}]: Spawning (provider: ${this.provider})`);

    // Emit agent:spawned event to web portal
    this.emitPortalEvent('agent:spawned', {
      agentId: `hybrid-worker-${workerId}`,
      workerId,
      agentType,
      subtask: taskDescription,
      provider: this.provider,
      model: this.model,
      timestamp: Date.now()
    });

    // Create agent prompt with tool use instructions
    let systemPrompt;

    if (customSystemPrompt) {
      systemPrompt = customSystemPrompt;
    } else if (baseSystemPrompt) {
      // Use specialized agent prompt with tool integration
      systemPrompt = `${baseSystemPrompt}

## Tool Integration for Hybrid Routing

You are worker agent ${workerId} with specialized role: ${agentType}

IMPORTANT: You have access to these tools:
- bash_execute: Run bash commands (npm install, git commands, mkdir, etc.)
- write_file: Create or update files
- read_file: Read file contents

Use these tools to complete your task. Don't just describe what to do - ACTUALLY DO IT.

Example:
To create a test file, use:
write_file({ path: "tests/example.test.js", content: "test code here" })

To install dependencies:
bash_execute({ command: "npm install express" })

TASK: ${taskDescription}

Execute the task using available tools. Report confidence score (0.0-1.0) at the end.`;
    } else {
      // Generic worker prompt (fallback)
      systemPrompt = `You are worker agent ${workerId} in a hybrid routing system.

IMPORTANT: You have access to these tools:
- bash_execute: Run bash commands (npm install, git commands, mkdir, etc.)
- write_file: Create or update files
- read_file: Read file contents

Use these tools to complete your task. Don't just describe what to do - ACTUALLY DO IT.

Example:
To create a test file, use:
write_file({ path: "tests/example.test.js", content: "test code here" })

To install dependencies:
bash_execute({ command: "npm install express" })

TASK: ${taskDescription}

Execute the task using available tools. Report confidence score (0.0-1.0) at the end.`;
    }

    // Inject Redis coordination instructions based on topology
    const topologyInstructions = this.generateTopologyInstructions(this.topology, workerId, agentType);
    systemPrompt = `${systemPrompt}\n${topologyInstructions}`;

    try {
      let messages = [
        {
          role: 'user',
          content: `Execute this task: ${subtask}\n\nUse available tools to complete the task. End with "CONFIDENCE: X.XX" where X.XX is your confidence score (0.0-1.0).`
        }
      ];

      let inputTokens = 0;
      let outputTokens = 0;
      let toolUseCount = 0;
      const MAX_TOOL_ITERATIONS = 1000; // Increased from 25 to allow comprehensive optimization tasks
      let content = '';

      // Tool use loop
      while (toolUseCount < MAX_TOOL_ITERATIONS) {
        const response = await this.anthropic.createMessage({
          model: this.model,
          max_tokens: 8000,
          system: systemPrompt,
          messages: messages,
          temperature: 0.7,
          tools: ANTHROPIC_TOOLS // Add tool definitions
        });

        inputTokens += response.usage?.input_tokens || 0;
        outputTokens += response.usage?.output_tokens || 0;

        // Check if response contains tool use
        const toolUseBlock = response.content.find(block => block.type === 'tool_use');

        if (!toolUseBlock) {
          // No tool use, extract final response
          content = response.content.find(block => block.type === 'text')?.text || '';
          break;
        }

        // Execute tool
        console.log(`  🔧 Worker ${workerId} using tool: ${toolUseBlock.name}`);
        const toolResult = await this.executeTool(toolUseBlock.name, toolUseBlock.input);

        // Emit agent:update event for tool use
        this.emitPortalEvent('agent:update', {
          agentId: `hybrid-worker-${workerId}`,
          workerId,
          progress: toolUseCount / MAX_TOOL_ITERATIONS,
          tool: toolUseBlock.name,
          toolInput: toolUseBlock.input,
          timestamp: Date.now()
        });

        // Add assistant message with tool use
        messages.push({
          role: 'assistant',
          content: response.content
        });

        // Add user message with tool result
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: JSON.stringify(toolResult)
            }
          ]
        });

        toolUseCount++;
      }

      if (toolUseCount >= MAX_TOOL_ITERATIONS) {
        console.log(`  ⚠️  Worker ${workerId} reached max tool iterations (${MAX_TOOL_ITERATIONS})`);
        content = response.content.find(block => block.type === 'text')?.text || 'Task incomplete - max iterations reached';
      }

      // Extract confidence score
      const confidenceMatch = content.match(/CONFIDENCE:\s*([0-9.]+)/i);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5;

      // Calculate tokens and cost (accumulated from loop)
      const totalTokens = inputTokens + outputTokens;

      const costRates = COSTS[this.provider];
      const cost = (inputTokens / 1_000_000) * costRates.input +
                   (outputTokens / 1_000_000) * costRates.output;

      // Update totals
      this.totalTokens.input += inputTokens;
      this.totalTokens.output += outputTokens;
      this.totalTokens.total += totalTokens;
      this.totalCost += cost;

      const duration = Date.now() - startTime;

      // Store result to SQLite if available
      if (this.memoryAdapter) {
        try {
          await this.memoryAdapter.set(
            `worker:${workerId}:result`,
            {
              workerId,
              confidence,
              subtask,
              content: content.substring(0, 500), // First 500 chars
              tokens: { input: inputTokens, output: outputTokens },
              cost,
              duration,
              timestamp: Date.now()
            },
            { agentId: workerId, ttl: 3600 }
          );
        } catch (error) {
          console.log(`⚠️  Worker ${workerId}: Failed to store to SQLite: ${error.message}`);
        }
      }

      // Publish to Redis if available
      if (this.redisAvailable && this.redisClient) {
        try {
          await this.redisClient.publish(
            `${this.redisChannel}:${workerId}:complete`,
            JSON.stringify({
              workerId,
              confidence,
              tokens: totalTokens,
              cost,
              timestamp: Date.now()
            })
          );
        } catch (error) {
          console.log(`⚠️  Worker ${workerId}: Failed to publish to Redis: ${error.message}`);
        }
      }

      const result = {
        workerId,
        confidence,
        content,
        tokens: { input: inputTokens, output: outputTokens, total: totalTokens },
        cost,
        duration,
        success: true
      };

      this.results.push(result);

      console.log(`📥 Worker ${workerId} completed: confidence ${confidence.toFixed(2)} (${totalTokens} tokens, $${cost.toFixed(6)}, ${(duration/1000).toFixed(1)}s)`);

      // Emit agent:completed event to web portal
      this.emitPortalEvent('agent:completed', {
        agentId: `hybrid-worker-${workerId}`,
        workerId,
        confidence,
        tokens: { input: inputTokens, output: outputTokens, total: totalTokens },
        cost,
        duration,
        filesModified: [], // TODO: Extract from tool calls
        success: true,
        timestamp: Date.now()
      });

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      console.log(`❌ Worker ${workerId} failed: ${error.message}`);

      const result = {
        workerId,
        confidence: 0.0,
        error: error.message,
        duration,
        success: false
      };

      this.results.push(result);

      // Emit agent:failed event to web portal
      this.emitPortalEvent('agent:failed', {
        agentId: `hybrid-worker-${workerId}`,
        workerId,
        error: error.message,
        duration,
        timestamp: Date.now()
      });

      return result;
    }
  }

  /**
   * Recursively scan directory for .md files
   */
  async scanAgentFiles(dirPath, basePath) {
    const { promises: fs } = await import('fs');
    const path = await import('path');

    let agentFiles = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subFiles = await this.scanAgentFiles(fullPath, basePath);
          agentFiles = agentFiles.concat(subFiles);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Calculate relative path for category (e.g., "core-agents", "security", "analysis")
          const relativePath = path.relative(basePath, fullPath);
          const category = path.dirname(relativePath).split(path.sep)[0] || 'root';

          agentFiles.push({
            path: fullPath,
            category,
            filename: entry.name
          });
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
    }

    return agentFiles;
  }

  /**
   * Check if agent type is allowed by whitelist/blacklist
   */
  isAgentAllowed(agentType) {
    // Check blacklist first (if configured)
    if (this.agentBlacklist && this.agentBlacklist.length > 0) {
      if (this.agentBlacklist.includes(agentType)) {
        return false;
      }
    }

    // Check whitelist (if configured)
    if (this.agentWhitelist && this.agentWhitelist.length > 0) {
      return this.agentWhitelist.includes(agentType);
    }

    // No restrictions - allow all
    return true;
  }

  /**
   * Get list of valid agent types from AVAILABLE-AGENTS.md or .claude/agents/
   */
  async getValidAgentTypes() {
    // Return cached list if available
    if (this.validAgentTypes) {
      return this.validAgentTypes;
    }

    const agents = await this.loadAgentDefinitions();
    this.validAgentTypes = Object.keys(agents).sort();
    return this.validAgentTypes;
  }

  /**
   * Validate agent types against allowed list
   * Throws error if invalid types are found
   */
  async validateAgentTypes(agentTypes) {
    if (!agentTypes || agentTypes.length === 0) {
      return; // No validation needed if no types specified
    }

    const validTypes = await this.getValidAgentTypes();
    const invalidTypes = agentTypes.filter(type => !validTypes.includes(type));

    if (invalidTypes.length > 0) {
      const errorMsg = [
        `❌ Invalid agent type(s): ${invalidTypes.join(', ')}`,
        '',
        `Valid agent types (${validTypes.length} available):`,
        ...validTypes.map(t => `  • ${t}`),
        '',
        'Use --list-agents to see all available agents'
      ].join('\n');
      throw new Error(errorMsg);
    }
  }

  /**
   * Load specialized agent definitions dynamically from .claude/agents folder
   * Scans recursively and caches results
   */
  async loadAgentDefinitions() {
    // Return cached agents if available
    if (this.cachedAgents) {
      return this.cachedAgents;
    }

    const { promises: fs } = await import('fs');
    const path = await import('path');

    try {
      const agentsPath = path.join(process.cwd(), '.claude', 'agents');

      // Recursively scan all .md files in .claude/agents
      const agentFiles = await this.scanAgentFiles(agentsPath, agentsPath);

      console.log(`🔍 Discovered ${agentFiles.length} agent files in .claude/agents/`);

      const agents = {};
      let loadedCount = 0;
      let skippedCount = 0;

      for (const agentFile of agentFiles) {
        try {
          const content = await fs.readFile(agentFile.path, 'utf-8');

          // Parse YAML frontmatter (handle both Unix \n and Windows \r\n)
          const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
          if (!frontmatterMatch) {
            console.log(`⚠️  No frontmatter in ${agentFile.filename}, skipping`);
            skippedCount++;
            continue;
          }

          const frontmatter = frontmatterMatch[1];

          // Extract agent type from YAML frontmatter 'name' field
          const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
          if (!nameMatch) {
            console.log(`⚠️  No 'name' field in ${agentFile.filename}, skipping`);
            skippedCount++;
            continue;
          }

          const agentType = nameMatch[1].trim();

          // Check whitelist/blacklist
          if (!this.isAgentAllowed(agentType)) {
            skippedCount++;
            continue;
          }

          // Extract description (simplified YAML parsing - handles multiline)
          const descMatch = frontmatter.match(/description:\s*([^\n]+(?:\n(?!\w+:).+)*)/);
          const description = descMatch ? descMatch[1].trim() : '';

          // Extract keywords from description (appears after "Keywords -" or "Keywords:")
          const keywordsMatch = description.match(/Keywords\s*[-:]\s*(.+?)(?:\n|$)/i);
          const keywords = keywordsMatch
            ? keywordsMatch[1].split(/[,;]/).map(k => k.trim().toLowerCase()).filter(k => k.length > 0)
            : [];

          agents[agentType] = {
            type: agentType,
            category: agentFile.category,
            description,
            keywords,
            systemPrompt: content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, ''),
            filePath: agentFile.path
          };

          loadedCount++;
        } catch (error) {
          console.log(`⚠️  Error loading ${agentFile.filename}: ${error.message}`);
          skippedCount++;
        }
      }

      console.log(`✅ Loaded ${loadedCount} agents (${skippedCount} skipped)`);

      // Cache results
      this.cachedAgents = agents;

      return agents;
    } catch (error) {
      console.log(`⚠️  Agent definitions not found, using generic workers`);
      return {};
    }
  }

  /**
   * List all available agents (flat list)
   */
  async listAgents() {
    const agents = await this.loadAgentDefinitions();
    const agentList = Object.values(agents);

    console.log('\n📋 Available Specialized Agents');
    console.log('═'.repeat(60));
    console.log(`Total: ${agentList.length} agents\n`);

    // Sort by type for consistent display
    agentList.sort((a, b) => a.type.localeCompare(b.type));

    for (const agent of agentList) {
      const keywordPreview = agent.keywords.slice(0, 5).join(', ');
      const moreKeywords = agent.keywords.length > 5 ? ` (+${agent.keywords.length - 5} more)` : '';
      console.log(`  • ${agent.type.padEnd(30)} [${agent.category}]`);
      console.log(`    Keywords: ${keywordPreview}${moreKeywords}`);
    }

    console.log('═'.repeat(60));
  }

  /**
   * List agents grouped by category
   */
  async listAgentsByCategory() {
    const agents = await this.loadAgentDefinitions();
    const agentList = Object.values(agents);

    // Group by category
    const byCategory = {};
    for (const agent of agentList) {
      if (!byCategory[agent.category]) {
        byCategory[agent.category] = [];
      }
      byCategory[agent.category].push(agent);
    }

    console.log('\n📋 Available Agents by Category');
    console.log('═'.repeat(60));
    console.log(`Total: ${agentList.length} agents in ${Object.keys(byCategory).length} categories\n`);

    // Sort categories alphabetically
    const sortedCategories = Object.keys(byCategory).sort();

    for (const category of sortedCategories) {
      const categoryAgents = byCategory[category];
      console.log(`\n📁 ${category.toUpperCase()} (${categoryAgents.length} agents)`);
      console.log('─'.repeat(60));

      // Sort agents within category
      categoryAgents.sort((a, b) => a.type.localeCompare(b.type));

      for (const agent of categoryAgents) {
        const keywordPreview = agent.keywords.slice(0, 3).join(', ');
        const moreKeywords = agent.keywords.length > 3 ? ` (+${agent.keywords.length - 3})` : '';
        console.log(`  • ${agent.type}`);
        console.log(`    ${keywordPreview}${moreKeywords}`);
      }
    }

    console.log('\n' + '═'.repeat(60));
  }

  /**
   * Get dependencies (user-provided OR inferred)
   */
  async getDependencies() {
    // Priority 1: User-provided dependencies (explicit)
    if (this.dependenciesOverride) {
      console.log('🎯 Using explicit dependencies from CLI');
      return this.dependenciesOverride;
    }

    // Priority 2: Coordinator infers based on agent types + topology
    const agentTypes = this.agentOverride || [];
    const inferred = this.inferDependencies(agentTypes, this.topology);

    if (inferred) {
      console.log('🤖 Coordinator inferred dependencies:', JSON.stringify(inferred));
      return inferred;
    }

    // Priority 3: No dependencies (parallel execution)
    console.log('⚡ No dependencies - agents execute in parallel');
    return null;
  }

  /**
   * Infer dependencies based on agent types and topology
   */
  inferDependencies(agentTypes, topology) {
    if (!agentTypes || agentTypes.length === 0) {
      return null;
    }

    // Bidirectional: Always 1:1 pairing (first agent produces, second agent reviews)
    if (topology === 'bidirectional') {
      if (agentTypes.length >= 2) {
        return {
          edges: [{ from: agentTypes[0], to: agentTypes[1] }],
          nodes: new Set([agentTypes[0], agentTypes[1]])
        };
      }
      return null; // Not enough agents for bidirectional
    }

    // Collaborative: Architect/lead agent feeds team
    if (topology === 'collaborative') {
      // Look for lead agent (architect, lead, senior, etc.)
      const leadAgent = agentTypes.find(t =>
        t.includes('architect') ||
        t.includes('lead') ||
        t.includes('senior') ||
        t.includes('manager')
      );

      if (leadAgent) {
        const consumers = agentTypes.filter(t => t !== leadAgent);
        if (consumers.length > 0) {
          return {
            edges: consumers.map(to => ({ from: leadAgent, to })),
            nodes: new Set([leadAgent, ...consumers])
          };
        }
      }

      // Fallback: First agent leads
      if (agentTypes.length >= 2) {
        const consumers = agentTypes.slice(1);
        return {
          edges: consumers.map(to => ({ from: agentTypes[0], to })),
          nodes: new Set(agentTypes)
        };
      }
      return null;
    }

    // Release Gate: No dependencies, all wait at barrier
    if (topology === 'release-gate') {
      return null; // All agents independent, coordinator manages barrier
    }

    // Sequential: No dependencies (default)
    return null;
  }

  /**
   * Match task to specialized agents based on keywords
   */
  matchTaskToAgents(task, availableAgents, numAgents) {
    const taskLower = task.toLowerCase();
    const matches = [];

    // Score each agent based on keyword matches
    for (const [type, agent] of Object.entries(availableAgents)) {
      let score = 0;
      for (const keyword of agent.keywords) {
        if (taskLower.includes(keyword)) {
          score++;
        }
      }
      if (score > 0) {
        matches.push({ type, agent, score });
      }
    }

    // Sort by score (highest first)
    matches.sort((a, b) => b.score - a.score);

    // Return top N agents
    return matches.slice(0, numAgents).map(m => ({
      type: m.type,
      agent: m.agent
    }));
  }

  /**
   * Decompose task into subtasks with specialized agent assignment
   */
  async decomposeTaskWithSpecialization(task, numAgents) {
    // Load agent definitions
    const agents = await this.loadAgentDefinitions();

    if (Object.keys(agents).length === 0) {
      // Fallback to generic decomposition
      return this.decomposeTask(task, numAgents);
    }

    // COORDINATOR OVERRIDE: Check if coordinator specified agent types
    if (this.agentOverride && Array.isArray(this.agentOverride) && this.agentOverride.length > 0) {
      console.log('🎯 Using Coordinator Override for agent selection');

      // When coordinator specifies agent types, use THEIR count by default
      // Only use more if subtaskOverride provides more tasks
      // Example: --agents coder → spawn 1 coder
      // Example: --agents coder,tester → spawn 2 agents
      // Example: --agents coder --subtasks="task1|task2|task3" → spawn 3 coders (cycles)
      const subtasks = [];
      const spawnCount = this.subtaskOverride && this.subtaskOverride.length > 0
        ? this.subtaskOverride.length
        : this.agentOverride.length;

      for (let i = 0; i < spawnCount; i++) {
        const agentType = this.agentOverride[i % this.agentOverride.length];
        const agent = agents[agentType];

        if (!agent) {
          console.log(`⚠️  Agent type '${agentType}' not found, falling back to keyword matching`);
          // Fall through to keyword matching below
          break;
        }

        // Use coordinator-provided subtask if available, otherwise generate
        const subtask = this.subtaskOverride && this.subtaskOverride[i]
          ? this.subtaskOverride[i]
          : this.generateSubtaskForAgent(task, agentType, i, spawnCount);

        subtasks.push({
          task: subtask,
          agentType: agentType,
          systemPrompt: agent.systemPrompt
        });
      }

      // If coordinator override succeeded, return
      if (subtasks.length > 0) {
        console.log(`✅ Coordinator override: Spawning ${subtasks.length} agents (${this.agentOverride.join(', ')})`);
        return subtasks;
      }
      // Otherwise fall through to keyword matching
    }

    // INTELLIGENT SELECTION: Use use case registry for agent recommendations
    if (!this.useCaseRegistry) {
      this.useCaseRegistry = await AgentUseCaseRegistry.load();
    }

    const recommendations = this.useCaseRegistry.recommendAgents(task);

    console.log('\n🎯 Intelligent Agent Selection:');
    console.log('Primary agents:', recommendations.primary.join(', ') || 'None');
    console.log('Secondary agents:', recommendations.secondary.join(', ') || 'None');
    console.log('Reasoning:', recommendations.reasoning.join('; ') || 'Default selection');

    // Use recommended agents if available, fallback to keyword matching
    const selectedAgentTypes = recommendations.primary.length > 0
      ? [...recommendations.primary, ...recommendations.secondary].slice(0, numAgents)
      : this.matchTaskToAgents(task, agents, numAgents).map(m => m.type);

    if (selectedAgentTypes.length === 0) {
      // No agents matched, use generic decomposition
      return this.decomposeTask(task, numAgents);
    }

    // Create specialized subtasks using selected agents
    const subtasks = [];
    for (let i = 0; i < numAgents; i++) {
      const agentType = selectedAgentTypes[i % selectedAgentTypes.length];
      const agent = agents[agentType];

      if (!agent) {
        console.log(`⚠️  Agent '${agentType}' not found in loaded agents, skipping`);
        continue;
      }

      subtasks.push({
        task: this.generateSubtaskForAgent(task, agentType, i, numAgents),
        agentType: agentType,
        systemPrompt: agent.systemPrompt
      });
    }

    return subtasks;
  }

  /**
   * Generate agent-specific subtask
   */
  generateSubtaskForAgent(mainTask, agentType, index, total) {
    const taskLower = mainTask.toLowerCase();

    if (agentType === 'coder') {
      return `Implement core functionality for: ${mainTask}`;
    } else if (agentType === 'architect') {
      return `Design system architecture for: ${mainTask}`;
    } else if (agentType === 'tester') {
      return `Create comprehensive tests for: ${mainTask}`;
    } else if (agentType === 'security-specialist') {
      return `Perform security analysis for: ${mainTask}`;
    } else if (agentType === 'analyst') {
      return `Analyze code quality and performance for: ${mainTask}`;
    } else if (agentType === 'reviewer') {
      return `Review implementation of: ${mainTask}`;
    }

    return `${mainTask} (Part ${index + 1}/${total})`;
  }

  /**
   * Decompose task into subtasks (fallback for generic workers)
   */
  decomposeTask(task, numAgents) {
    // Simple decomposition - split task into logical parts
    const keywords = task.toLowerCase();

    if (keywords.includes('auth') || keywords.includes('authentication')) {
      return [
        'Implement JWT token generation and validation',
        'Create user session management with Redis',
        'Add rate limiting and security middleware',
        'Implement password hashing with bcrypt',
        'Create authentication tests'
      ].slice(0, numAgents);
    }

    if (keywords.includes('api') || keywords.includes('rest')) {
      return [
        'Design API endpoint structure and routes',
        'Implement CRUD operations for main resources',
        'Add input validation and error handling',
        'Create API documentation',
        'Write integration tests'
      ].slice(0, numAgents);
    }

    if (keywords.includes('analyze') || keywords.includes('code')) {
      return [
        'Analyze code structure and architecture',
        'Identify security vulnerabilities',
        'Check code quality and best practices',
        'Analyze performance bottlenecks',
        'Generate recommendations'
      ].slice(0, numAgents);
    }

    // Default decomposition
    const subtasks = [];
    for (let i = 0; i < numAgents; i++) {
      subtasks.push(`${task} (Part ${i+1}/${numAgents})`);
    }
    return subtasks;
  }

  /**
   * Spawn all workers in parallel with retry logic
   */
  async spawnAll() {
    // Decompose task into subtasks with specialization (may adjust agent count)
    const subtasks = await this.decomposeTaskWithSpecialization(this.taskDescription, this.maxAgents);

    // Update maxAgents to match actual spawn count (coordinator override may reduce it)
    this.maxAgents = subtasks.length;

    console.log(`\n🚀 Spawning ${this.maxAgents} workers for task: "${this.taskDescription}"`);
    console.log(`📡 Provider: ${this.provider}`);
    console.log(`📊 Model: ${this.model}`);
    console.log(`🔀 Topology: ${this.topology}`);
    console.log(`⏱️  Timeout: ${this.timeout / 1000}s (${this.timeout / 60000}min)`);
    if (this.background) {
      console.log(`🌙 Background Mode: Enabled`);
    }
    console.log('');

    // Spawn coordinator agent for non-sequential topologies
    let coordinatorPromise = null;
    if (this.topology !== 'sequential') {
      console.log(`👑 Spawning coordination agent for ${this.topology} topology...`);
      coordinatorPromise = this.spawnCoordinator(subtasks);
      console.log('');
    }

    // Log agent assignments if specialized
    if (typeof subtasks[0] === 'object' && subtasks[0].agentType) {
      console.log('🎯 Specialized Agent Assignment:');
      subtasks.forEach((st, i) => {
        console.log(`   Worker ${i + 1}: ${st.agentType} - ${st.task}`);
      });
      console.log('');
    }

    // Spawn workers in parallel with retry logic
    const workerPromises = subtasks.map((subtask, index) =>
      this.spawnWorkerWithRetry(index + 1, subtask)
    );

    // Add coordinator to promises if spawned
    const allPromises = coordinatorPromise
      ? [coordinatorPromise, ...workerPromises]
      : workerPromises;

    // Background mode: spawn and return immediately (Phase 3 Deliverable 2)
    if (this.background) {
      console.log('🌙 Background mode enabled - agents will run independently');
      console.log('📊 Monitor progress: redis-cli monitor | grep "swarm:"');
      console.log('📋 Check status: redis-cli keys "swarm:*"');
      console.log('');
      console.log('✅ Agents spawned in background');

      // Don't wait for completion
      return {
        background: true,
        spawned: this.maxAgents + (coordinatorPromise ? 1 : 0),
        message: 'Agents running in background. Monitor via Redis.'
      };
    }

    // Wait for all workers (and coordinator) with timeout
    try {
      const results = await Promise.race([
        Promise.all(allPromises),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), this.timeout)
        )
      ]);

      return results;
    } catch (error) {
      if (error.message === 'TIMEOUT') {
        // Explicit timeout logging
        const completedCount = this.results.filter(r => r.success).length;
        const totalWorkers = this.maxAgents;

        console.log(`\n⏱️  TIMEOUT: Workers exceeded ${this.timeout/60000}-minute limit`);
        console.log(`📊 Workers completed: ${completedCount}/${totalWorkers}`);
        console.log(`💡 Fallback: Check /tmp/ for partial results`);
        console.log(`   - Redis keys: redis-cli keys "swarm:${this.redisChannel}:*"`);
        console.log(`   - SQLite: Check ${process.env.SQLITE_MEMORY_PATH || './swarm-memory.db'}`);
      } else {
        console.log(`\n⚠️  Warning: ${error.message}`);
      }

      return this.results; // Return partial results
    }
  }

  /**
   * Print summary report and emit swarm:completed event
   */
  printSummary() {
    const successfulWorkers = this.results.filter(r => r.success);
    const avgConfidence = successfulWorkers.length > 0
      ? successfulWorkers.reduce((sum, r) => sum + r.confidence, 0) / successfulWorkers.length
      : 0;

    const gateThreshold = 0.75;
    const gateResult = avgConfidence >= gateThreshold ? 'PASS' : 'FAIL';

    // Calculate cost savings vs pure Claude
    const pureClaude = {
      inputCost: 3.00,  // $3/1M input tokens
      outputCost: 15.00 // $15/1M output tokens
    };
    const pureClaudeCost = (this.totalTokens.input / 1_000_000) * pureClaude.inputCost +
                           (this.totalTokens.output / 1_000_000) * pureClaude.outputCost;
    const costSavingsPercent = ((pureClaudeCost - this.totalCost) / pureClaudeCost) * 100;

    console.log('\n' + '='.repeat(60));
    console.log('📊 HYBRID ROUTING SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Workers Completed: ${successfulWorkers.length}/${this.maxAgents}`);
    console.log(`📈 Average Confidence: ${avgConfidence.toFixed(2)}`);
    console.log(`🎯 Total Tokens: ${this.totalTokens.total.toLocaleString()}`);
    console.log(`   - Input: ${this.totalTokens.input.toLocaleString()}`);
    console.log(`   - Output: ${this.totalTokens.output.toLocaleString()}`);
    console.log(`💰 Total Cost: $${this.totalCost.toFixed(4)}`);
    console.log(`💰 Cost Savings: ${costSavingsPercent.toFixed(1)}% vs pure Claude ($${pureClaudeCost.toFixed(4)})`);
    console.log(`📡 Provider: ${this.provider}`);

    if (successfulWorkers.length >= this.maxAgents * 0.75) {
      console.log(`\n✅ SUCCESS - ${Math.round(successfulWorkers.length / this.maxAgents * 100)}% workers completed`);
    } else {
      console.log(`\n⚠️  PARTIAL SUCCESS - Only ${successfulWorkers.length}/${this.maxAgents} workers completed`);
    }

    console.log('='.repeat(60));

    // Emit swarm:completed event to web portal with aggregated metrics
    this.emitPortalEvent('swarm:completed', {
      swarmId: `hybrid-swarm-${Date.now()}`,
      avgConfidence,
      totalTokens: this.totalTokens,
      totalCost: this.totalCost,
      workerCount: this.maxAgents,
      successfulWorkers: successfulWorkers.length,
      gateResult,
      gateThreshold,
      costSavingsPercent,
      pureClaudeCost,
      workers: successfulWorkers.map(w => ({
        agentId: `hybrid-worker-${w.workerId}`,
        workerId: w.workerId,
        confidence: w.confidence,
        tokens: w.tokens,
        cost: w.cost,
        duration: w.duration
      })),
      timestamp: Date.now()
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.socketClient) {
      try {
        this.socketClient.disconnect();
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    if (this.redisClient) {
      try {
        await this.redisClient.quit();
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    if (this.memoryAdapter) {
      try {
        await this.memoryAdapter.close();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * Parse CLI argument supporting both --flag=value and --flag value formats
 */
function parseArg(args, flagName, defaultValue = null) {
  // Try --flag=value format first
  const equalsFormat = args.find(arg => arg.startsWith(`--${flagName}=`));
  if (equalsFormat) {
    return equalsFormat.split('=')[1];
  }

  // Try --flag value format (space-separated)
  const flagIndex = args.findIndex(arg => arg === `--${flagName}`);
  if (flagIndex !== -1 && flagIndex + 1 < args.length && !args[flagIndex + 1].startsWith('--')) {
    return args[flagIndex + 1];
  }

  return defaultValue;
}

/**
 * Parse dependency graph from CLI argument
 * Format: "producer:consumer1,consumer2|agent1:agent2"
 * Example: "architect:coder,tester" or "architect:coder,tester|coder:reviewer"
 */
function parseDependencyGraph(depString) {
  const edges = depString.split('|');
  const graph = { edges: [], nodes: new Set() };

  for (const edge of edges) {
    const [from, toList] = edge.split(':');
    if (!from || !toList) {
      throw new Error(`Invalid dependency format: ${edge}. Expected format: "from:to1,to2"`);
    }

    const toNodes = toList.split(',');
    graph.nodes.add(from.trim());

    for (const to of toNodes) {
      const toTrimmed = to.trim();
      graph.nodes.add(toTrimmed);
      graph.edges.push({ from: from.trim(), to: toTrimmed });
    }
  }

  return graph;
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments (supports both --flag=value and --flag value)
  const task = args.find(arg => !arg.startsWith('--')) || 'Execute task';
  const maxAgents = parseInt(parseArg(args, 'max-agents', '3'));
  const provider = parseArg(args, 'provider', 'zai');
  const redisChannel = parseArg(args, 'redis-channel', 'swarm:workers');
  const model = parseArg(args, 'model', 'haiku');

  // Coordinator override arguments
  const agentOverrideArg = parseArg(args, 'agents');
  const agentOverride = agentOverrideArg ? agentOverrideArg.split(',') : null;
  const subtaskOverrideArg = parseArg(args, 'subtasks');
  const subtaskOverride = subtaskOverrideArg ? subtaskOverrideArg.split('|') : null;

  // Redis coordination arguments
  const topology = parseArg(args, 'topology', 'sequential');
  const dependenciesArg = parseArg(args, 'dependencies');

  // Timeout argument (Phase 3 Deliverable 1)
  const timeoutArg = parseArg(args, 'timeout');
  const timeout = timeoutArg ? parseInt(timeoutArg) : null; // null = use topology-specific default

  // Background mode (Phase 3 Deliverable 2)
  const background = args.includes('--background') || args.includes('--bg');

  // Validate topology
  const validTopologies = ['sequential', 'bidirectional', 'collaborative', 'release-gate'];
  if (!validTopologies.includes(topology)) {
    console.error(`❌ Invalid topology: ${topology}`);
    console.error(`Valid topologies: ${validTopologies.join(', ')}`);
    process.exit(1);
  }

  // Parse dependency graph
  const dependencies = dependenciesArg ? parseDependencyGraph(dependenciesArg) : null;

  // Parse listing flags
  const listAgents = args.includes('--list-agents');
  const listByCategory = args.includes('--agents-by-category');

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🤖 Hybrid Routing CLI - Spawn Real Claude Agents

USAGE:
  node src/cli/hybrid-routing/spawn-workers.js "Task description" --agents=TYPE1,TYPE2 [OPTIONS]

REQUIRED:
  --agents TYPE1,TYPE2   Agent types to spawn (comma-separated, REQUIRED)
  --agents=TYPE1,TYPE2   Must be valid types from AVAILABLE-AGENTS.md
                         Example: --agents=coder → spawns 1 coder
                         Example: --agents=coder,tester → spawns 2 agents

OPTIONS:
  --max-agents N         Number of workers to spawn (default: matches agent count)
  --max-agents=N         Alternate format with equals sign

  --provider PROVIDER    Provider: zai or anthropic (default: zai)
  --provider=PROVIDER    Alternate format with equals sign

  --redis-channel CH     Redis pub/sub channel (default: swarm:workers)
  --redis-channel=CH     Alternate format with equals sign

  --model MODEL          Model name (default: haiku)
  --model=MODEL          Alternate format with equals sign

  --subtasks T1|T2|T3    Custom subtasks (pipe-separated, optional, used with --agents)
  --subtasks=T1|T2|T3    Alternate format with equals sign

  --list-agents          List all available specialized agents (flat list)
  --agents-by-category   List available agents grouped by category
  --help, -h             Show this help message

NOTE: Both --flag value and --flag=value formats are supported

AGENT VALIDATION:
  All agent types are validated against:
  - .claude/agents/ folder (50+ agent definitions)
  - src/cli/hybrid-routing/AVAILABLE-AGENTS.md (documentation)

  Invalid agent types will be rejected with error message showing valid options.

EXAMPLES:
  # List available agents (REQUIRED before first use)
  node src/cli/hybrid-routing/spawn-workers.js --list-agents
  node src/cli/hybrid-routing/spawn-workers.js --agents-by-category

  # Spawn specific agent types
  node src/cli/hybrid-routing/spawn-workers.js "Refactor API" \\
    --agents=architect,coder,reviewer

  # Custom agents + custom subtasks
  node src/cli/hybrid-routing/spawn-workers.js "Security review" \\
    --agents=security-specialist,reviewer \\
    --subtasks="Audit authentication system|Review authorization logic"

  # Use Anthropic provider instead of z.ai
  node src/cli/hybrid-routing/spawn-workers.js "Analyze code" \\
    --agents=analyst,code-analyzer \\
    --provider=anthropic

COORDINATION PATTERNS (Redis Integration):
  --topology PATTERN     Coordination pattern (default: sequential)
    sequential           Simple completion, no coordination (default, 2min timeout)
    bidirectional        Iterative feedback loops (coder ↔ reviewer, 5min timeout)
    collaborative        Q&A waiting state (architect answers questions, 6min timeout)
    release-gate         Barrier synchronization (all agents wait, 6min timeout)

  --timeout MS           Override topology-specific timeout (milliseconds)
                         Defaults: sequential=120s, bidirectional=300s,
                                  collaborative=360s, release-gate=360s
                         Example: --timeout=600000 (10 minutes)

  --background, --bg     Run agents in background, return immediately
                         Monitor: redis-cli monitor | grep "swarm:"
                         Status: redis-cli keys "swarm:*"

  --dependencies GRAPH   Agent dependency graph (optional)
    Format: "producer:consumer1,consumer2|agent1:agent2"
    Example: "architect:coder,tester|coder:reviewer"

COORDINATION EXAMPLES:
  # Bidirectional feedback (code review loop)
  node src/cli/hybrid-routing/spawn-workers.js "Refactor API" \\
    --agents=coder,reviewer \\
    --topology=bidirectional

  # Collaborative waiting (architect Q&A)
  node src/cli/hybrid-routing/spawn-workers.js "Design auth system" \\
    --agents=architect,coder,tester \\
    --topology=collaborative

  # Release gate (barrier synchronization)
  node src/cli/hybrid-routing/spawn-workers.js "Deploy services" \\
    --agents=backend,frontend,database \\
    --topology=release-gate

  # With explicit dependency graph
  node src/cli/hybrid-routing/spawn-workers.js "Build feature" \\
    --agents=architect,coder,tester \\
    --topology=collaborative \\
    --dependencies="architect:coder,tester"

ENVIRONMENT:
  Z_AI_API_KEY          API key for z.ai provider
  ANTHROPIC_API_KEY     API key for Anthropic provider
  REDIS_URL             Redis connection URL (optional)
  SQLITE_MEMORY_PATH    SQLite database path (optional)
`);
    process.exit(0);
  }

  console.log('🤖 Hybrid Routing CLI - Real Claude Agent Spawning\n');

  const spawner = new HybridWorkerSpawner({
    task,
    maxAgents,
    provider,
    redisChannel,
    model,
    agentOverride,
    subtaskOverride,
    topology,
    dependencies,
    timeout,
    background
  });

  // Handle listing commands before initialization
  if (listAgents) {
    await spawner.listAgents();
    process.exit(0);
  }

  if (listByCategory) {
    await spawner.listAgentsByCategory();
    process.exit(0);
  }

  // REQUIRED: Validate that --agents flag is provided
  if (!agentOverride || agentOverride.length === 0) {
    console.error(`❌ ERROR: --agents flag is REQUIRED

Usage:
  node src/cli/hybrid-routing/spawn-workers.js "Task" --agents=TYPE1,TYPE2

Examples:
  --agents=coder
  --agents=architect,coder,tester

To see available agent types:
  --list-agents          (flat list)
  --agents-by-category   (grouped by category)

Run --help for full documentation.
`);
    process.exit(1);
  }

  // Validate agent types against allowed list
  try {
    await spawner.validateAgentTypes(agentOverride);
  } catch (error) {
    console.error(`\n${error.message}\n`);
    process.exit(1);
  }

  try {
    // Initialize connections
    await spawner.initialize();

    // Spawn workers
    await spawner.spawnAll();

    // Print summary
    spawner.printSummary();

    // Calculate final confidence
    const successfulWorkers = spawner.results.filter(r => r.success);
    const avgConfidence = successfulWorkers.length > 0
      ? successfulWorkers.reduce((sum, r) => sum + r.confidence, 0) / successfulWorkers.length
      : 0;

    console.log(`\n🎯 Final Confidence: ${avgConfidence.toFixed(2)}`);

    // Cleanup
    await spawner.cleanup();

    // Exit with appropriate code
    process.exit(avgConfidence >= 0.75 ? 0 : 1);

  } catch (error) {
    console.error(`\n❌ Fatal Error: ${error.message}`);
    console.error(error.stack);

    await spawner.cleanup();
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { HybridWorkerSpawner };
