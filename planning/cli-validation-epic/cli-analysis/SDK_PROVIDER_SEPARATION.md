# SDK Provider Separation Analysis

## Executive Summary

**Answer: Hybrid architecture is FEASIBLE but LIMITED**

The Claude Code SDK can be used for coordination features (session forking, pause/resume) while using alternative inference providers, BUT with significant architectural constraints. The SDK spawns the Claude CLI as a subprocess, which performs BOTH coordination AND inference. Provider swapping requires either:

1. **Proxy/Router approach** (community-proven): Intercept API calls via `ANTHROPIC_BASE_URL`
2. **CLI forking** (theoretical): Modify CLI to separate coordination from inference

**Key Finding**: `pathToClaudeCodeExecutable` only changes WHICH executable spawns - it does NOT separate coordination from inference within that executable.

---

## 1. What Requires Anthropic API (Unavoidable Dependencies)

### Hard Dependencies on Anthropic Infrastructure

1. **Model Inference Calls** (lines 1027-1120 in cli.js)
   - Direct imports from `@anthropic-ai/sdk`
   - API calls to `https://api.anthropic.com/v1/messages`
   - Beta message streaming via `BetaRawMessageStreamEvent`
   - Usage tracking tied to Anthropic's usage structures

2. **Authentication System**
   - OAuth tokens (`ANTHROPIC_AUTH_TOKEN`)
   - API keys (`ANTHROPIC_API_KEY`, `x-api-key` header)
   - Bearer token authentication for Claude AI subscribers
   - Organization UUID validation

3. **Rate Limiting & Quota Management** (cli.js lines 976-1120)
   - `anthropic-ratelimit-unified-status` headers
   - Spending cap enforcement
   - Weekly/hourly limits tied to Anthropic accounts
   - Overage detection (`anthropic-ratelimit-unified-overage-status`)

4. **Session State (Server-Side)**
   - Message UUIDs generated server-side
   - Usage statistics (`ModelUsage`, cost calculations)
   - Context window enforcement (model-specific)

---

## 2. What Can Use Alternative Providers

### Separable Components (Via Proxy/Router)

1. **Inference API Calls** (via `ANTHROPIC_BASE_URL`)
   ```typescript
   // Environment variable interception
   ANTHROPIC_BASE_URL=http://localhost:8000  // Points to proxy
   ANTHROPIC_API_KEY=your-openrouter-key     // Alternative provider key
   ```

2. **Model Selection** (via `ANTHROPIC_MODEL`)
   ```bash
   # Supported by community routers
   ANTHROPIC_MODEL=openrouter/anthropic/claude-3.5-sonnet
   ANTHROPIC_MODEL=ollama/llama-3.3-70b
   ANTHROPIC_MODEL=deepseek/deepseek-v3
   ```

3. **Custom Provider Translation**
   - Community tools (Claude Code Router, Y-Router, AnyClaude)
   - Translate Anthropic API → OpenAI-compatible APIs
   - Map rate limit headers to generic equivalents

### Non-Separable (Tightly Coupled)

1. **Session Coordination** - Uses CLI subprocess state
2. **Tool Execution** - Handled by CLI process directly
3. **MCP Server Management** - CLI-managed connections
4. **Permission System** - CLI-enforced security model

---

## 3. Hybrid Architecture Possibility

### Option A: SDK Coordination + Proxy Inference ✅ FEASIBLE (Community-Proven)

**Architecture:**
```
SDK (Node.js)
  ↓ spawns subprocess
Claude CLI (pathToClaudeCodeExecutable)
  ↓ API calls intercepted
Claude Code Router/Y-Router (localhost proxy)
  ↓ translates API format
OpenRouter / Ollama / DeepSeek / etc.
```

**How It Works:**
1. SDK spawns Claude CLI via `spawn(pathToClaudeCodeExecutable, args)`
2. CLI reads `ANTHROPIC_BASE_URL=http://localhost:8000`
3. Proxy intercepts all `/v1/messages` calls
4. Proxy translates to OpenAI-compatible format
5. SDK receives responses in Anthropic format (translated back)

**Coordination Features Retained:**
- ✅ Session forking (`forkSession: true`)
- ✅ Pause/Resume (`query.interrupt()`)
- ✅ Checkpoints (`resumeSessionAt: messageId`)
- ✅ Tool execution (MCP servers)
- ✅ Permission management

**Inference Features Swapped:**
- ✅ Model provider (OpenRouter, Ollama, DeepSeek, etc.)
- ✅ Custom models (Llama, Gemini, GPT, etc.)
- ⚠️ Rate limits (must mock Anthropic headers)
- ⚠️ Usage tracking (requires translation layer)

**Implementation:**
```typescript
import { query } from '@anthropic-ai/claude-code';

// Set environment variables BEFORE spawning SDK
process.env.ANTHROPIC_BASE_URL = 'http://localhost:8000'; // Proxy
process.env.ANTHROPIC_API_KEY = process.env.OPENROUTER_API_KEY; // OpenRouter key from env
process.env.ANTHROPIC_MODEL = 'openrouter/anthropic/claude-3.5-sonnet';

const response = query({
  prompt: "Write a function",
  options: {
    pathToClaudeCodeExecutable: '/usr/local/bin/claude', // Standard CLI
    model: 'openrouter/google/gemini-2.5-pro', // Routed to Gemini
    forkSession: true, // SDK coordination feature
  }
});

for await (const message of response) {
  console.log(message); // Anthropic-formatted, routed through Gemini
}
```

**Proxy Requirements:**
- Translate Anthropic Messages API → OpenAI Chat Completions
- Mock rate limit headers (`anthropic-ratelimit-*`)
- Handle tool use format differences
- Maintain session state locally

**Community Solutions:**
- **Claude Code Router**: 8+ providers, JSON config, `/model` command
- **Y-Router**: Cloudflare Worker, OpenRouter focus
- **AnyClaude**: OpenAI endpoint support, Ollama integration

---

### Option B: SDK Coordination + Local Model Inference ✅ FEASIBLE (Ollama via Proxy)

**Architecture:**
```
SDK → Claude CLI → Proxy (localhost:11434) → Ollama (local models)
```

**Configuration:**
```bash
# Terminal 1: Start Ollama
ollama serve

# Terminal 2: Start Claude Code Router with Ollama config
cat > ~/.claude-code-router/config.json <<EOF
{
  "providers": {
    "ollama": {
      "baseURL": "http://localhost:11434",
      "defaultModel": "llama-3.3-70b"
    }
  }
}
EOF
claude-code-router --port 8000

# Terminal 3: Use SDK with environment variables
export ANTHROPIC_BASE_URL=http://localhost:8000
export ANTHROPIC_MODEL=ollama/llama-3.3-70b
node your-sdk-script.js
```

**Advantages:**
- Zero API costs (fully local)
- Full coordination features (session forking, checkpoints)
- Privacy (no external API calls)

**Limitations:**
- Model quality (local models ≠ Claude quality)
- Performance (depends on local hardware)
- Proxy complexity (must mock Anthropic API format)

---

### Option C: Pure SDK Coordination (No External Inference) ❌ NOT FEASIBLE

**Why This Fails:**
The SDK's `query()` function ALWAYS spawns a Claude CLI subprocess that MUST make inference calls. There is no "coordination-only mode" where inference is fully decoupled.

**Code Evidence (sdk.mjs:6218-6482):**
```typescript
// SDK always spawns CLI as subprocess
this.child = spawn(spawnCommand, spawnArgs, { cwd, ... });

// CLI immediately reads ANTHROPIC_API_KEY and calls API
// No way to disable inference without breaking CLI
```

**Theoretical Workaround (Requires CLI Fork):**
1. Fork Claude CLI source code
2. Add `--inference-provider` flag
3. Implement provider abstraction layer
4. Maintain fork with upstream updates

**Verdict**: Not practical for production use.

---

## 4. Implementation Strategy (Recommended: Option A)

### Phase 1: Setup Proxy Infrastructure

**Choose a Community Router:**
- **Claude Code Router** (recommended): Most mature, 8+ providers
- **Y-Router**: Cloudflare-based, simple setup
- **AnyClaude**: OpenAI-focused, Ollama support

**Installation (Claude Code Router):**
```bash
npm install -g claude-code-router
claude-code-router init  # Creates ~/.claude-code-router/config.json
```

**Configuration:**
```json
{
  "providers": {
    "openrouter": {
      "apiKey": "sk-or-v1-xxx",
      "baseURL": "https://openrouter.ai/api/v1",
      "defaultModel": "anthropic/claude-3.5-sonnet"
    },
    "ollama": {
      "baseURL": "http://localhost:11434",
      "defaultModel": "llama-3.3-70b"
    }
  },
  "proxy": {
    "port": 8000,
    "mockRateLimits": true,  // Mock anthropic-ratelimit-* headers
    "translateToolUse": true  // Convert tool formats
  }
}
```

**Start Proxy:**
```bash
claude-code-router --port 8000
```

---

### Phase 2: Integrate SDK with Proxy

**SDK Wrapper Module (`sdk-hybrid.ts`):**
```typescript
import { query, Options } from '@anthropic-ai/claude-code';

export interface HybridOptions extends Options {
  provider?: 'anthropic' | 'openrouter' | 'ollama' | 'deepseek';
  providerModel?: string;
  proxyPort?: number;
}

export function hybridQuery({
  prompt,
  provider = 'anthropic',
  providerModel,
  proxyPort = 8000,
  ...options
}: {
  prompt: string;
  options?: HybridOptions;
}) {
  // Configure environment based on provider
  if (provider !== 'anthropic') {
    process.env.ANTHROPIC_BASE_URL = `http://localhost:${proxyPort}`;

    if (providerModel) {
      process.env.ANTHROPIC_MODEL = `${provider}/${providerModel}`;
    }
  }

  // SDK coordination features work normally
  return query({
    prompt,
    options: {
      ...options,
      // Session forking works regardless of provider
      forkSession: options.forkSession ?? false,
      // Tool execution works via CLI subprocess
      mcpServers: options.mcpServers,
    }
  });
}
```

**Usage:**
```typescript
import { hybridQuery } from './sdk-hybrid';

// Use Gemini via OpenRouter with SDK coordination
const response = await hybridQuery({
  prompt: "Implement authentication",
  provider: 'openrouter',
  providerModel: 'google/gemini-2.5-pro',
  options: {
    forkSession: true,  // SDK coordination feature
    mcpServers: {
      'memory': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] }
    }
  }
});

for await (const message of response) {
  if (message.type === 'assistant') {
    console.log('Gemini response:', message.message.content);
  }
}
```

---

### Phase 3: Handle Edge Cases

**1. Rate Limit Header Mocking**
Proxy must return mock headers to prevent CLI errors:
```typescript
// In proxy implementation
response.headers['anthropic-ratelimit-unified-status'] = 'allowed';
response.headers['anthropic-ratelimit-unified-reset'] = String(Date.now() / 1000 + 3600);
```

**2. Tool Use Format Translation**
Anthropic uses different tool format than OpenAI:
```typescript
// Anthropic format (CLI expects this)
{
  "type": "tool_use",
  "id": "toolu_xxx",
  "name": "read_file",
  "input": { "path": "file.txt" }
}

// OpenAI format (provider returns this)
{
  "type": "function",
  "function": {
    "name": "read_file",
    "arguments": "{\"path\":\"file.txt\"}"
  }
}
```

Proxy must translate both directions.

**3. Session State Management**
CLI stores sessions locally (`~/.config/claude/sessions/`). Proxy doesn't affect this - coordination features work normally.

---

## 5. Cost Analysis

### Scenario A: Pure Anthropic (Baseline)

**Architecture:** SDK → Claude CLI → Anthropic API

**Costs:**
- **Sonnet 4.5**: $3 input / $15 output per million tokens
- **Opus 4.1**: $15 input / $75 output per million tokens
- **Rate limits**: 5-hour session limits (subscribers), spending caps

**Example (100k input, 20k output tokens):**
- Sonnet: $0.30 + $0.30 = **$0.60 per session**
- Opus: $1.50 + $1.50 = **$3.00 per session**

---

### Scenario B: SDK + OpenRouter Proxy

**Architecture:** SDK → CLI → Proxy → OpenRouter → Alternative Models

**Costs:**
- **Gemini 2.5 Pro**: $1.25 input / $5 output per million tokens (via OpenRouter)
- **DeepSeek V3**: $0.27 input / $1.10 output per million tokens
- **Llama 3.3 70B**: $0.35 input / $0.40 output per million tokens
- **OpenRouter fees**: +10% markup on base pricing

**Example (100k input, 20k output):**
- Gemini 2.5 Pro: $0.125 + $0.10 = **$0.225 per session** (62% savings)
- DeepSeek V3: $0.027 + $0.022 = **$0.049 per session** (92% savings)
- Llama 3.3 70B: $0.035 + $0.008 = **$0.043 per session** (93% savings)

**Additional Costs:**
- Proxy hosting: $0 (local) or $5-20/month (cloud)
- Claude Code Router: Free (open source)

---

### Scenario C: SDK + Ollama (Fully Local)

**Architecture:** SDK → CLI → Proxy → Ollama → Local Models

**Costs:**
- **API costs**: $0 (fully local)
- **Hardware requirements**:
  - 70B models: 48GB+ VRAM (RTX 6000 Ada / A100)
  - 8B models: 8GB+ VRAM (RTX 4060 Ti)
- **Electricity**: ~$0.10-0.30/hour (GPU power consumption)

**Example (100k input, 20k output):**
- Llama 3.3 70B (local): **$0.05 electricity** (99% savings)
- Qwen 2.5 32B (local): **$0.02 electricity** (99.7% savings)

**Trade-offs:**
- Quality: Local models < Claude/Gemini (task-dependent)
- Latency: Local (100-500 tokens/s) vs API (50-200 tokens/s)
- Privacy: 100% (no external API calls)

---

### Scenario D: Pure CLI (No SDK)

**Architecture:** Direct CLI usage (no coordination features)

**Costs:**
- Same API costs as Scenario A
- **Lost features**:
  - No programmatic session forking
  - No pause/resume via API
  - No TypeScript type safety
  - Manual session management

**Verdict**: Not recommended unless avoiding SDK dependency.

---

## 6. Key Constraints & Limitations

### Technical Constraints

1. **`pathToClaudeCodeExecutable` Scope**
   - Only changes WHICH executable spawns
   - Does NOT separate coordination from inference
   - Cannot point to "coordination-only binary"

2. **CLI Subprocess Architecture**
   - SDK spawns CLI as child process
   - CLI performs BOTH coordination AND inference
   - No "headless coordination mode"

3. **API Format Compatibility**
   - Proxy must perfectly emulate Anthropic Messages API
   - Tool use format differences require translation
   - Rate limit headers must be mocked

4. **Session State Storage**
   - Sessions stored in `~/.config/claude/sessions/`
   - Tied to CLI installation
   - Cannot be fully decoupled

### Provider-Specific Limitations

1. **OpenRouter**
   - +10% pricing markup
   - Rate limits vary by model
   - Some models require `:online` suffix for web search

2. **Ollama**
   - Model quality varies significantly
   - Requires powerful local hardware
   - No built-in rate limiting

3. **DeepSeek**
   - Limited model selection
   - Geographic restrictions (China-based)
   - API stability varies

---

## 7. Recommendations

### For Cost-Sensitive Users (Recommended: Option A)

**Use SDK + OpenRouter Proxy:**
- 60-93% cost savings vs Anthropic
- Retains ALL SDK coordination features
- Access to 200+ models
- Minimal complexity (Claude Code Router handles translation)

**Setup:**
```bash
npm install -g claude-code-router
claude-code-router init
# Edit ~/.claude-code-router/config.json with OpenRouter key
claude-code-router --port 8000

# In your SDK project
export ANTHROPIC_BASE_URL=http://localhost:8000
export ANTHROPIC_MODEL=openrouter/google/gemini-2.5-pro
```

---

### For Privacy-Focused Users (Recommended: Option B)

**Use SDK + Ollama Proxy:**
- Zero API costs
- 100% local (no external calls)
- Full coordination features
- Requires GPU (48GB+ for 70B models)

**Setup:**
```bash
ollama serve
ollama pull llama-3.3-70b
claude-code-router --ollama --port 8000

export ANTHROPIC_BASE_URL=http://localhost:8000
export ANTHROPIC_MODEL=ollama/llama-3.3-70b
```

---

### For Enterprise Users

**Hybrid Multi-Provider Strategy:**
- Anthropic Opus for critical reasoning
- Gemini 2.5 Pro via OpenRouter for general tasks
- Ollama for sensitive/private codebases
- Dynamic provider selection based on task complexity

**Implementation:**
```typescript
function selectProvider(taskComplexity: 'simple' | 'medium' | 'complex', sensitive: boolean) {
  if (sensitive) {
    return { provider: 'ollama', model: 'llama-3.3-70b' };
  }

  switch (taskComplexity) {
    case 'complex':
      return { provider: 'anthropic', model: 'claude-opus-4-1' };
    case 'medium':
      return { provider: 'openrouter', model: 'google/gemini-2.5-pro' };
    case 'simple':
      return { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' };
  }
}
```

---

## 8. Conclusion

**Separation Verdict: FEASIBLE via Proxy Architecture**

The Claude Code SDK CANNOT natively separate coordination from inference, BUT community-developed proxy solutions enable hybrid architectures:

✅ **Coordination Features**: Session forking, pause/resume, checkpoints all work via SDK
✅ **Inference Flexibility**: Route to OpenRouter, Ollama, DeepSeek, etc. via `ANTHROPIC_BASE_URL`
✅ **Cost Savings**: 60-99% depending on provider choice
⚠️ **Complexity**: Requires proxy setup and API format translation
⚠️ **Quality Trade-offs**: Alternative models may not match Claude quality

**Best Approach**: Use Claude Code Router as proxy layer, configure via environment variables, retain all SDK coordination features while swapping inference providers.

**Next Steps**:
1. Install Claude Code Router: `npm install -g claude-code-router`
2. Configure providers in `~/.claude-code-router/config.json`
3. Start proxy: `claude-code-router --port 8000`
4. Set environment variables: `ANTHROPIC_BASE_URL=http://localhost:8000`
5. Use SDK normally - coordination features work, inference routes through proxy
