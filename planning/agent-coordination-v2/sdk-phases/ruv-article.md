Introducing Agentic Flow — A near-free agent framework for Claude Code and Claude Agent SDK
Reuven Cohen
Reuven Cohen 
♾️ Agentic Engineer / aiCTO / Coach


October 6, 2025
I built Agentic Flow to easily switch between alternative low-cost AI models in Claude Code and Claude Agent SDK. For those comfortable using Claude agents and commands, it lets you take what you’ve created and deploy fully hosted agents for real business purposes. Use Claude Code to get the agent working, then deploy it in your favorite cloud.

Zero-Cost Agent Execution with Intelligent Routing 
Agentic Flow runs Claude Code agents at near zero cost without rewriting a thing. The built-in model optimizer automatically routes every task to the cheapest option that meets your quality requirements, free local models for privacy, OpenRouter for 99% cost savings, Gemini for speed, or Anthropic when quality matters most. 

It analyzes each task and selects the optimal model from 27+ options with a single flag, reducing API costs dramatically compared to using Claude exclusively.

Autonomous Agent Spawning 
The system spawns specialized agents on demand through Claude Code’s Task tool and MCP coordination. It orchestrates swarms of 66+ pre-built Claue Flow agents (researchers, coders, reviewers, testers, architects) that work in parallel, coordinate through shared memory, and auto-scale based on workload. 

Transparent OpenRouter and Gemini proxies translate Anthropic API calls automatically, no code changes needed. Local models run direct without proxies for maximum privacy. Switch providers with environment variables, not refactoring.

Extend Agent Capabilities Instantly 
Add custom tools and integrations through the CLI, weather data, databases, search engines, or any external service, without touching config files. Your agents instantly gain new abilities across all projects. Every tool you add becomes available to the entire agent ecosystem automatically, with full traceability for auditing, debugging, and compliance. Connect proprietary systems, APIs, or internal tools in seconds, not hours.

Flexible Policy Control 
Define routing rules through simple policy modes:

Strict mode: Keep sensitive data offline with local models only
Economy mode: Prefer free models or OpenRouter for 99% savings
Premium mode: Use Anthropic for highest quality
Custom mode: Create your own cost/quality thresholds

OPTIMIZATION BENEFITS:
 💰 Cost Savings: 85-98% cheaper models for same quality tasks

 🎯 Smart Selection: Agent-aware (coder needs quality ≥85, researcher flexible)

 📊 100+ Models: Claude, GPT-4o, Gemini, DeepSeek, Llama, ONNX local

 ⚡ Zero Overhead: <5ms decision time, no API calls during optimization

The policy defines the rules; the swarm enforces them automatically. Runs local for development, Docker for CI/CD, or Flow Nexus for production scale.

Agentic Flow is the framework for autonomous efficiency, one unified runner for every Claude Code agent, self-tuning, self-routing, and built for real-world deployment.

Get Started
# Install 
npx agentic-flow --help
Github:
https://github.com/ruvnet/agentic-flow


Agentic Flow is a framework for running AI agents at scale with intelligent cost optimization. It runs any Claude Code agent through the Claude Agent SDK, automatically routing tasks to the cheapest model that meets quality requirements.

Key Capabilities:

✅ 66 Specialized Agents - Pre-built experts for coding, research, review, testing, DevOps
✅ 213 MCP Tools - Memory, GitHub, neural networks, sandboxes, workflows, payments
✅ Multi-Model Router - Anthropic, OpenRouter (100+ models), Gemini, ONNX (free local)
✅ Cost Optimization - 85-99% savings with DeepSeek, Llama, Gemini vs Claude
✅ Standalone Proxy - Use Gemini/OpenRouter with Claude Code at 85% cost savings

Built On:

Claude Agent SDK by Anthropic
Claude Flow - 101 MCP tools
Flow Nexus - 96 cloud tools
OpenRouter - 100+ LLM models
Agentic Payments - Multi-agent payments

🚀 Quick Start
Option 1: CLI Agent Execution (Fastest)
Run specialized agents for coding, research, testing, and more:

# Install globally
npm install -g agentic-flow

# Run with Claude (Anthropic)
export ANTHROPIC_API_KEY=sk-ant-...
npx agentic-flow --agent coder --task "Build a REST API with authentication"

# Run with OpenRouter (99% cost savings)
export OPENROUTER_API_KEY=sk-or-v1-...
npx agentic-flow --agent coder --task "Build REST API" --model "meta-llama/llama-3.1-8b-instruct"

# Run with Gemini (free tier)
export GOOGLE_GEMINI_API_KEY=AIza...
npx agentic-flow --agent coder --task "Build REST API" --provider gemini

# List all 66 available agents
npx agentic-flow --list
Available Agents:

coder, reviewer, tester, planner, researcher
backend-dev, mobile-dev, ml-developer, cicd-engineer
pr-manager, code-review-swarm, release-manager
perf-analyzer, production-validator, system-architect
And 50+ more...

Option 2: MCP Tools (Direct Access)
Access 213 MCP tools for memory, swarms, GitHub, neural networks, and cloud sandboxes:

# Start all MCP servers (213 tools) - stdio transport
npx agentic-flow mcp start

# List all available tools
npx agentic-flow mcp list

# Check server status
npx agentic-flow mcp status

# Use tools in any agent automatically
export ENABLE_CLAUDE_FLOW_SDK=true
npx agentic-flow --agent coder --task "Store config in memory using memory_store"
MCP Transports:

stdio (default): Standard input/output for Claude Desktop integration
HTTP/SSE (new): HTTP server with Server-Sent Events for web apps

# Start HTTP/SSE server on port 8080
npm run mcp:http
# Endpoints:
# - HTTP: http://localhost:8080/mcp
# - SSE: http://localhost:8080/sse
# - Health: http://localhost:8080/health

# Start stdio server (default)
npm run mcp:stdio
MCP Tool Categories:

Agentic Flow (6 tools): Agent execution, creation, optimization, model selection
Claude Flow SDK (6 tools): In-process memory and swarm coordination
Claude Flow (101 tools): Neural networks, GitHub, workflows, performance, DAA
Flow Nexus (96 tools): E2B sandboxes, distributed swarms, templates, storage
Agentic Payments (10 tools): Payment authorization, Ed25519 signatures, consensus

Option 3: Claude Code Integration (NEW in v1.1.13)
Auto-start proxy + spawn Claude Code with one command:

# OpenRouter (99% cost savings)
npx agentic-flow claude-code --provider openrouter "Write a Python function"

# Gemini (FREE tier)
npx agentic-flow claude-code --provider gemini "Create a REST API"

# Anthropic (direct, no proxy)
npx agentic-flow claude-code --provider anthropic "Help me debug"
How it works:

✅ Auto-detects if proxy is running
✅ Auto-starts proxy if needed (background)
✅ Sets ANTHROPIC_BASE_URL to proxy endpoint
✅ Configures provider-specific API keys
✅ Spawns Claude Code with environment configured
✅ Cleans up proxy on exit (optional)

Alternative: Manual Proxy (v1.1.11)

# Terminal 1: Start proxy server
export GOOGLE_GEMINI_API_KEY=your-key-here
npx agentic-flow proxy

# Terminal 2: Use Claude Code with proxy
export ANTHROPIC_BASE_URL=http://localhost:3000
export ANTHROPIC_API_KEY=sk-ant-proxy-dummy-key
claude  # Now uses Gemini instead of Anthropic!

# Or use OpenRouter (90% savings)
npx agentic-flow proxy --provider openrouter --model "openai/gpt-4o-mini"
Features:

✅ MCP tools work through proxy (all 213 tools)
✅ Compatible with Claude Code official CLI
✅ Context-aware instruction injection (v1.1.13)
✅ Model-specific max_tokens optimization
✅ Future Cursor IDE support (waiting for ANTHROPIC_BASE_URL)
✅ 85-90% cost savings vs direct Anthropic API

Article content
📚 Tutorial: Agent Execution
1. Basic Agent Usage
What it does: Runs a specialized agent with Claude SDK and all 213 MCP tools.

When to use: Quick tasks that need one expert (code review, API generation, testing).

# Code generation
npx agentic-flow --agent coder --task "Create a REST API with OAuth2 authentication"

# Security review
npx agentic-flow --agent reviewer --task "Review this code for security vulnerabilities"

# Test generation
npx agentic-flow --agent tester --task "Write comprehensive tests for this API"
Technical Details:

Uses Claude Agent SDK's query() function
Automatically loads agent's system prompt from .claude/agents/
All 213 MCP tools available via mcpServers configuration
Streams output in real-time with --stream flag

2. Multi-Agent Swarms
What it does: Runs 3 agents in parallel for complex workflows.

When to use: Multi-faceted tasks requiring research + coding + analysis.

# Set environment variables
export TOPIC="API security best practices"
export DIFF="feat: add OAuth2 authentication"
export DATASET="API response times last 30 days"

# Run parallel swarm (researcher + code-reviewer + data-analyst)
npx agentic-flow
Technical Details:

Spawns 3 agents concurrently: researcher, code-review, data-analyst
Agents coordinate via Claude Flow memory tools
Each agent has access to all 213 MCP tools
Results aggregated and returned together

3. Cost Optimization with OpenRouter
What it does: Uses OpenRouter models for 90-99% cost savings vs Claude.

When to use: Development, testing, or budget-conscious production workloads.

# Ultra-low cost with Llama 3.1 8B (99% savings)
export OPENROUTER_API_KEY=sk-or-v1-...
npx agentic-flow --agent coder --task "Build REST API" --model "meta-llama/llama-3.1-8b-instruct"

# Balanced cost/quality with DeepSeek (97% savings)
npx agentic-flow --agent coder --task "Production code" --model "deepseek/deepseek-chat-v3.1"

# Fast responses with Gemini (95% savings)
npx agentic-flow --agent researcher --task "Analyze trends" --model "google/gemini-2.5-flash-preview"
Technical Details:

Proxy auto-starts on port 3000 when OpenRouter model detected
Translates Anthropic Messages API ↔ OpenAI Chat Completions API
All 213 MCP tools work through proxy
No code changes needed - transparent to Claude SDK

Cost Comparison:

Task: Generate 100K tokens (200 functions)

Anthropic Claude Sonnet 4.5: $1.80
DeepSeek V3 (OpenRouter):    $0.028  (98% savings)
Llama 3.1 8B (OpenRouter):   $0.011  (99% savings) 
4. Free Local Inference with ONNX
What it does: Runs agents completely offline with zero API costs.

When to use: Privacy-sensitive data, air-gapped environments, development without API costs.

# Auto-downloads Phi-4 model (~4.9GB one-time)
npx agentic-flow --agent coder --task "Build REST API" --provider onnx

# Privacy-first routing (auto-selects ONNX)
npx agentic-flow --agent researcher --task "Analyze medical records" --privacy high --local-only
Technical Details:

Uses Microsoft Phi-4 (INT4 quantized) via ONNX Runtime
CPU: ~6 tokens/sec, GPU: 60-300 tokens/sec
100% offline after model download
Limited to 6 in-SDK tools (no subprocess MCP servers)
Zero API costs forever

5. Model Optimization (Auto-Select Best Model)
What it does: Automatically picks optimal model based on task complexity and priorities.

When to use: You want best quality/cost/speed balance without manual selection.

# Let optimizer choose (balanced quality vs cost)
npx agentic-flow --agent coder --task "Build REST API" --optimize

# Optimize for lowest cost
npx agentic-flow --agent coder --task "Simple function" --optimize --priority cost

# Optimize for highest quality
npx agentic-flow --agent reviewer --task "Security audit" --optimize --priority quality

# Set budget cap ($0.001 per task max)
npx agentic-flow --agent coder --task "Code cleanup" --optimize --max-cost 0.001
Technical Details:

Analyzes agent requirements (coder needs 85+ quality score)
Evaluates task complexity via keyword analysis
Scores 10+ models across quality, cost, speed, privacy
Returns recommendation with reasoning

Optimization Priorities:

quality - Best results (70% quality, 20% speed, 10% cost)
balanced - Default mix (40% quality, 40% cost, 20% speed)
cost - Cheapest (70% cost, 20% quality, 10% speed)
speed - Fastest (70% speed, 20% quality, 10% cost)
privacy - Local-only (ONNX models, zero cloud API calls)

📚 Tutorial: MCP Tools
What are MCP Tools?
MCP (Model Context Protocol) tools extend agent capabilities beyond text generation. They provide:

Memory - Persistent storage across sessions
GitHub - Repository operations, PR management, code review
Sandboxes - Isolated execution environments in the cloud
Neural Networks - Training, inference, model management
Workflows - Event-driven automation with message queues
Payments - Multi-agent payment authorization

Starting MCP Servers
stdio Transport (default for Claude Desktop):

# Start all 213 tools (4 servers)
npx agentic-flow mcp start

# Start specific server
npx agentic-flow mcp start claude-flow      # 101 tools
npx agentic-flow mcp start flow-nexus       # 96 tools (requires registration)
npx agentic-flow mcp start agentic-payments # 10 tools

# List all tools
npx agentic-flow mcp list

# Check status
npx agentic-flow mcp status

# Stop servers
npx agentic-flow mcp stop
HTTP/SSE Transport (new for web applications):

# Start HTTP/SSE MCP server on port 8080
npm run mcp:http

# Or manually:
node dist/mcp/fastmcp/servers/http-sse.js

# Server provides 3 endpoints:
# - http://localhost:8080/mcp (MCP protocol)
# - http://localhost:8080/sse (Server-Sent Events)
# - http://localhost:8080/health (health check)
When to use each transport:

stdio: Claude Desktop, Cursor IDE, command-line tools
HTTP/SSE: Web apps, browser extensions, REST APIs, mobile apps

Using MCP Tools in Agents
Automatic (Recommended):

# Tools available automatically when ENABLE_CLAUDE_FLOW_SDK=true
export ENABLE_CLAUDE_FLOW_SDK=true
npx agentic-flow --agent coder --task "Store config in memory_store"
Manual (Advanced):

import { query } from '@anthropic-ai/claude-agent-sdk';

const result = await query({
  prompt: 'Store API key in memory',
  options: {
    mcpServers: {
      'claude-flow-sdk': {
        command: 'npx',
        args: ['claude-flow', 'mcp', 'start'],
        env: { ENABLE_CLAUDE_FLOW_SDK: 'true' }
      }
    }
  }
});
MCP Tool Categories
1. Memory & Storage (claude-flow-sdk)

memory_store - Store persistent key-value data
memory_retrieve - Retrieve stored data
memory_search - Search memory by pattern
memory_list - List all stored keys
memory_delete - Delete stored data

2. Swarm Coordination (claude-flow)

swarm_init - Initialize multi-agent swarm
agent_spawn - Create specialized agents
task_orchestrate - Distribute work across agents
swarm_status - Monitor swarm health
coordination_sync - Synchronize agent state

3. GitHub Integration (claude-flow)

github_repo_analyze - Repository analysis
github_pr_manage - PR lifecycle management
github_code_review - Automated code review
github_issue_track - Issue triage and tracking
github_workflow_auto - CI/CD automation

4. Cloud Sandboxes (flow-nexus)

sandbox_create - Isolated execution environments
sandbox_execute - Run code in sandbox
sandbox_upload - Upload files to sandbox
sandbox_status - Check sandbox health
sandbox_delete - Cleanup sandbox

5. Neural Networks (claude-flow)

neural_train - Train models with WASM acceleration
neural_predict - Run inference
neural_patterns - Analyze cognitive patterns
neural_status - Model metrics

6. Workflows (flow-nexus)

workflow_create - Event-driven automation
workflow_execute - Run workflow with message queues
workflow_status - Monitor execution
workflow_agent_assign - Optimal agent assignment

7. Payments (agentic-payments)

create_active_mandate - Payment authorization with spend caps
sign_mandate - Ed25519 cryptographic signing
verify_mandate - Signature verification
verify_consensus - Multi-agent Byzantine consensus

📚 Tutorial: Claude Code Integration
What is Claude Code Integration?
One command to use Claude Code with any provider - OpenRouter, Gemini, ONNX, or Anthropic.

No need to manually:

Start proxy servers
Export environment variables
Configure base URLs
Manage API keys

Just run npx agentic-flow claude-code --provider <name> "your task" and everything is handled automatically.

Quick Examples
# OpenRouter - 99% cost savings, wide model selection
npx agentic-flow claude-code --provider openrouter \
  "Write a Python function to parse JSON"

# Gemini - FREE tier available, fast responses
npx agentic-flow claude-code --provider gemini \
  "Create a simple REST API with Flask"

# Anthropic - Direct API, highest quality
npx agentic-flow claude-code --provider anthropic \
  "Help me implement OAuth2 authentication"

# ONNX - 100% offline, no API costs
npx agentic-flow claude-code --provider onnx \
  "Write a sorting algorithm"
How It Works
Behind the scenes:

Checks if proxy is running on port 3000 (or custom --port)
Auto-starts proxy if needed (OpenRouter/Gemini/ONNX)
Sets environment variables:
Spawns Claude Code with configured environment
Cleans up proxy on exit (unless --keep-proxy)

Advanced Options
# Use specific model
npx agentic-flow claude-code \
  --provider openrouter \
  --model "meta-llama/llama-3.3-70b-instruct" \
  "Write complex code"

# Custom proxy port
npx agentic-flow claude-code \
  --provider gemini \
  --port 8080 \
  "Generate code"

# Keep proxy running for multiple sessions
npx agentic-flow claude-code \
  --provider openrouter \
  --keep-proxy \
  "First task"

# Reuse running proxy (no auto-start)
npx agentic-flow claude-code \
  --provider openrouter \
  --no-auto-start \
  "Second task"
Alternative: Bash Wrapper Script
For frequent use, copy the wrapper script to your PATH:

# Install wrapper
cp node_modules/agentic-flow/scripts/claude-code ~/bin/
chmod +x ~/bin/claude-code

# Usage - cleaner syntax
claude-code openrouter "Write a function"
claude-code gemini "Create an API"
claude-code anthropic "Debug my code"
Validation
Test that all providers work correctly:

# Test OpenRouter
npx agentic-flow claude-code --provider openrouter \
  "print hello world in python"

# Test Gemini
npx agentic-flow claude-code --provider gemini \
  "print hello world in python"

# Test Anthropic
npx agentic-flow claude-code --provider anthropic \
  "print hello world in python"
Expected output: Clean Python code with no XML tags:

print("Hello, World!")


