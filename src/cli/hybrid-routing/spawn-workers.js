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
    this.timeout = options.timeout || 1800000; // 1800 seconds (30 minutes) for complex multi-step tasks
    this.model = options.model || 'claude-3-5-sonnet-20241022';

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
   * Initialize Redis and SQLite connections
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
  }

  /**
   * Spawn a single worker agent with bash execution capability
   */
  async spawnWorker(workerId, subtask) {
    const startTime = Date.now();

    console.log(`🤖 Worker ${workerId}: Spawning (provider: ${this.provider})`);

    // Create agent prompt with tool use instructions
    const systemPrompt = `You are worker agent ${workerId} in a hybrid routing system.

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

TASK: ${subtask}

Execute the task using available tools. Report confidence score (0.0-1.0) at the end.`;

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
      const MAX_TOOL_ITERATIONS = 25; // Increased from 10 to allow complex multi-step tasks
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

      return result;
    }
  }

  /**
   * Decompose task into subtasks
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
   * Spawn all workers in parallel
   */
  async spawnAll() {
    console.log(`\n🚀 Spawning ${this.maxAgents} workers for task: "${this.taskDescription}"`);
    console.log(`📡 Provider: ${this.provider}`);
    console.log(`📊 Model: ${this.model}`);
    console.log('');

    // Decompose task into subtasks
    const subtasks = this.decomposeTask(this.taskDescription, this.maxAgents);

    // Spawn workers in parallel
    const workerPromises = subtasks.map((subtask, index) =>
      this.spawnWorker(index + 1, subtask)
    );

    // Wait for all workers with timeout
    try {
      const results = await Promise.race([
        Promise.all(workerPromises),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Workers timed out')), this.timeout)
        )
      ]);

      return results;
    } catch (error) {
      console.log(`\n⚠️  Warning: ${error.message}`);
      return this.results; // Return partial results
    }
  }

  /**
   * Print summary report
   */
  printSummary() {
    const successfulWorkers = this.results.filter(r => r.success);
    const avgConfidence = successfulWorkers.length > 0
      ? successfulWorkers.reduce((sum, r) => sum + r.confidence, 0) / successfulWorkers.length
      : 0;

    console.log('\n' + '='.repeat(60));
    console.log('📊 HYBRID ROUTING SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Workers Completed: ${successfulWorkers.length}/${this.maxAgents}`);
    console.log(`📈 Average Confidence: ${avgConfidence.toFixed(2)}`);
    console.log(`🎯 Total Tokens: ${this.totalTokens.total.toLocaleString()}`);
    console.log(`   - Input: ${this.totalTokens.input.toLocaleString()}`);
    console.log(`   - Output: ${this.totalTokens.output.toLocaleString()}`);
    console.log(`💰 Total Cost: $${this.totalCost.toFixed(4)}`);
    console.log(`📡 Provider: ${this.provider}`);

    if (successfulWorkers.length >= this.maxAgents * 0.75) {
      console.log(`\n✅ SUCCESS - ${Math.round(successfulWorkers.length / this.maxAgents * 100)}% workers completed`);
    } else {
      console.log(`\n⚠️  PARTIAL SUCCESS - Only ${successfulWorkers.length}/${this.maxAgents} workers completed`);
    }

    console.log('='.repeat(60));
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
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
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const task = args.find(arg => !arg.startsWith('--')) || 'Execute task';
  const maxAgents = parseInt(args.find(arg => arg.startsWith('--max-agents='))?.split('=')[1]) || 3;
  const provider = args.find(arg => arg.startsWith('--provider='))?.split('=')[1] || 'zai';
  const redisChannel = args.find(arg => arg.startsWith('--redis-channel='))?.split('=')[1] || 'swarm:workers';
  const model = args.find(arg => arg.startsWith('--model='))?.split('=')[1] || 'claude-3-5-sonnet-20241022';

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🤖 Hybrid Routing CLI - Spawn Real Claude Agents

USAGE:
  node src/cli/hybrid-routing/spawn-workers.js "Task description" [OPTIONS]

OPTIONS:
  --max-agents=N         Number of workers to spawn (default: 3)
  --provider=PROVIDER    Provider: zai or anthropic (default: zai)
  --redis-channel=CH     Redis pub/sub channel (default: swarm:workers)
  --model=MODEL          Model name (default: claude-3-5-sonnet-20241022)
  --help, -h             Show this help message

EXAMPLES:
  # Spawn 3 workers with z.ai provider (cost-optimized)
  node src/cli/hybrid-routing/spawn-workers.js "Build auth system" --max-agents=3

  # Spawn 5 workers with Anthropic provider
  node src/cli/hybrid-routing/spawn-workers.js "Analyze code" --max-agents=5 --provider=anthropic

  # Custom Redis channel for coordination
  node src/cli/hybrid-routing/spawn-workers.js "Create API" --redis-channel=swarm:api:workers

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
    model
  });

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
