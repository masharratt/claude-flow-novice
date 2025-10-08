# Quick Start Guide: Unified Coordination System

**TL;DR:** Users can switch between CLI and SDK coordination modes with **zero code changes** - just configuration.

---

## 🚀 For End Users

### Option 1: CLI Mode (Free, Zero Config)

**Works with:** Claude Code subscription (no API credits needed)

```bash
# Install package
npm install claude-flow-novice

# Use immediately - no configuration needed
node your-agent-script.js
```

**What you get:**
- ✅ Multi-agent coordination
- ✅ Background execution
- ✅ Checkpointing
- ✅ Agent pooling (10-50ms spawn)
- ✅ Pause via SIGSTOP (instant)
- ✅ Cost: $0

**Configuration file** (`claude-flow-config.json`):
```json
{
  "coordination": {
    "mode": "cli"
  }
}
```

---

### Option 2: SDK Mode (Full Features, Requires API)

**Works with:** Anthropic API credits

```bash
# 1. Install package
npm install claude-flow-novice

# 2. Add API key (one-time setup)
export ANTHROPIC_API_KEY=sk-ant-xxx

# 3. Run same code - automatically uses SDK
node your-agent-script.js
```

**What you get:**
- ✅ All CLI features +
- ✅ True pause/resume (SDK native)
- ✅ Session forking (50-100ms spawn)
- ✅ Message UUIDs for checkpoints
- ✅ Artifact storage
- ⚠️ Cost: ~$3-15 per million tokens

**Configuration:**
```json
{
  "coordination": {
    "mode": "sdk"
  }
}
```

---

### Option 3: Hybrid Mode (Best of Both Worlds)

**Works with:** API credits + proxy setup

```bash
# 1. Install proxy (one-time)
npm install -g claude-code-router

# 2. Start proxy with cheaper provider
claude-router start --port 8000 \
  --provider openrouter \
  --model google/gemini-2.5-pro \
  --api-key $OPENROUTER_KEY

# 3. Configure hybrid mode
export CFN_COORDINATION_MODE=hybrid
export CFN_SDK_BASE_URL=http://localhost:8000

# 4. Run same code - SDK coordination + cheap inference
node your-agent-script.js
```

**What you get:**
- ✅ All SDK coordination features
- ✅ 60-93% cheaper inference (via proxy)
- ✅ Same agent spawning speed
- ✅ Cost: ~$0.30-3 per million tokens

**Configuration:**
```json
{
  "coordination": {
    "mode": "hybrid",
    "sdk": {
      "baseUrl": "http://localhost:8000",
      "model": "openrouter/google/gemini-2.5-pro"
    }
  }
}
```

---

## 📝 Single Code Example - Works for All Modes

```typescript
import { createCoordinator } from 'claude-flow-novice';

async function main() {
  // Auto-detects mode from config/env vars
  const coordinator = await createCoordinator();

  console.log(`Using ${coordinator.mode} coordination`);

  // Spawn agents (works in all modes)
  const agent1 = await coordinator.spawnAgent('backend-dev', 'Design API');
  const agent2 = await coordinator.spawnAgent('frontend-dev', 'Build UI');
  const agent3 = await coordinator.spawnAgent('tester', 'Write tests');

  // Execute in parallel
  const results = await Promise.all([
    agent1.execute(),
    agent2.execute(),
    agent3.execute()
  ]);

  // Pause/resume (degrades gracefully in CLI mode)
  await coordinator.pauseAgent(agent1.id);
  await coordinator.resumeAgent(agent1.id, 'Focus on security');

  // Checkpoint
  const checkpoint = await coordinator.createCheckpoint(agent1.id);

  console.log('Results:', results);
}

main();
```

**This exact same code runs in:**
- ✅ CLI mode (free)
- ✅ SDK mode (full features)
- ✅ Hybrid mode (cost-optimized)

No code changes required - just change configuration!

---

## 🔄 Migration Path

### Phase 1: Start with CLI (Week 1)

```json
{
  "coordination": {
    "mode": "cli"
  }
}
```

**Cost:** $0
**Setup time:** 0 minutes

---

### Phase 2: Upgrade to SDK (When you have API credits)

```bash
# Just add API key - that's it!
export ANTHROPIC_API_KEY=sk-ant-xxx
```

```json
{
  "coordination": {
    "mode": "sdk"
  }
}
```

**Cost:** ~$3-15/MTok
**Setup time:** 2 minutes
**Code changes:** **ZERO**

---

### Phase 3: Optimize with Hybrid (When costs matter)

```bash
# Setup proxy once
npm install -g claude-code-router
claude-router start --provider openrouter
```

```json
{
  "coordination": {
    "mode": "hybrid",
    "sdk": {
      "baseUrl": "http://localhost:8000"
    }
  }
}
```

**Cost:** ~$0.30-3/MTok (60-93% savings)
**Setup time:** 10 minutes
**Code changes:** **ZERO**

---

## ⚙️ Configuration Methods

### Method 1: Config File (Recommended)

**File:** `claude-flow-config.json` in project root

```json
{
  "coordination": {
    "mode": "auto"
  }
}
```

---

### Method 2: Environment Variables

```bash
export CFN_COORDINATION_MODE=cli
export CFN_COORDINATION_MODE=sdk
export CFN_COORDINATION_MODE=hybrid
```

---

### Method 3: Programmatic

```typescript
import { createCoordinator } from 'claude-flow-novice';

const coordinator = await createCoordinator({
  mode: 'cli',
  cli: {
    poolSize: 10
  }
});
```

---

### Method 4: Auto-Detection (Default)

```typescript
// No config needed - detects best available mode
const coordinator = await createCoordinator();

// Logs: "Auto-detected SDK mode (API key found)"
//   or: "Auto-detected CLI mode (no API key, using subscription)"
```

---

## 📊 Feature Comparison

| Feature | CLI Mode | SDK Mode | Hybrid Mode |
|---------|----------|----------|-------------|
| **Spawn time** | 50-100ms | 50-100ms | 50-100ms |
| **Pause/Resume** | SIGSTOP (instant) | SDK native | SDK native |
| **Max agents** | 50 | 100+ | 100+ |
| **Checkpoints** | File-based | Message UUIDs | Message UUIDs |
| **Cost** | $0 | $3-15/MTok | $0.30-3/MTok |
| **Requires** | CLI subscription | API credits | API + proxy |
| **Setup** | Zero config | Add API key | Setup proxy |

---

## 🎯 Which Mode Should I Use?

### Use CLI Mode if:
- ✅ You have Claude Code subscription
- ✅ You want zero API costs
- ✅ You don't need sub-second pause/resume
- ✅ Max 20 concurrent agents is enough

### Use SDK Mode if:
- ✅ You have Anthropic API credits
- ✅ You need true pause/resume
- ✅ You want 100+ concurrent agents
- ✅ Cost isn't your primary concern

### Use Hybrid Mode if:
- ✅ You want SDK coordination features
- ✅ You want to minimize costs
- ✅ You're willing to setup a proxy
- ✅ You want 60-93% cost savings

---

## 🔧 Troubleshooting

### "Mode detection failed"

```bash
# Check what's available
npx claude-flow-novice check-capabilities

# Output:
# ✅ CLI: Available (claude command found)
# ❌ SDK: Unavailable (no API key)
# ❌ Hybrid: Unavailable (proxy not running)
#
# Recommended: CLI mode
```

### "SDK mode not working"

```bash
# Verify API key
echo $ANTHROPIC_API_KEY

# Test SDK
npx claude-flow-novice test-sdk

# Expected: "SDK test successful"
```

### "Hybrid mode proxy errors"

```bash
# Check proxy status
curl http://localhost:8000/health

# Restart proxy
claude-router restart
```

---

## 📚 Next Steps

1. **Read:** `/planning/agent-coordination-v2/cli-analysis/UNIFIED_COORDINATION_DESIGN.md`
2. **Review:** Feature compatibility matrix
3. **Implement:** Start with CLI mode
4. **Upgrade:** Add SDK when ready
5. **Optimize:** Setup hybrid for cost savings

---

## 💡 Key Takeaways

1. **Same code works for all modes** - just change config
2. **Start free with CLI** - upgrade later without refactoring
3. **Auto-detection works** - but explicit config is clearer
4. **Hybrid mode saves 60-93%** - SDK features + cheap inference
5. **Migration is seamless** - no breaking changes

**Bottom line:** Build once, deploy with CLI (free), upgrade to SDK (when you have API), optimize with Hybrid (when costs matter). All with zero code changes.
