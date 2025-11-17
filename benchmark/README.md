# Rust Migration Benchmark Suite

Comprehensive benchmarks to evaluate whether migrating parts of the CFN Loop system to Rust provides meaningful benefits.

## Overview

This benchmark suite tests the critical decision points for Rust migration:

1. **Test 2: WebSocket Message Bus** - Compares Node.js vs Rust for persistent agent communication
2. **Test 3: Spawn Pattern Comparison** - Evaluates spawn-kill vs persistent agent architectures
3. **Test 4: AI SDK Streaming** - Determines if Rust helps with AI response processing
4. **Test 5: Agent-to-Agent Messaging** - Validates persistent agent communication patterns

## Quick Start

### Prerequisites

**Required:**
- Node.js 18+ and npm
- jq (JSON processor)

**Optional:**
- Rust/Cargo (for Rust comparisons, skip with `--skip-rust`)
- Docker (for Docker tests, skip with `--skip-docker`)
- k6 (for load testing, install: `brew install k6` or `npm install -g k6`)

### Installation

```bash
cd benchmark
npm install
```

### Run All Tests

```bash
# Full test suite (recommended)
bash run-all.sh

# Quick mode (reduced iterations, faster)
bash run-all.sh --quick

# Skip Rust tests (if Rust not installed)
bash run-all.sh --skip-rust

# Use mock AI responses (no API key required)
bash run-all.sh --mock
```

### Run Individual Tests

```bash
# Test 2: WebSocket Message Bus
node node-message-bus.js --port 8080 &
k6 run load-test.js
curl http://localhost:8080/metrics

# Test 3: Spawn Patterns
bash spawn-cost.sh --iterations 100 --agents 10

# Test 4: AI Streaming
node ai-streaming.js --mock --concurrent 10 --iterations 5

# Test 5: Agent Messaging
node node-message-bus.js --port 8080 &
node agent-messaging.js --agents 10 --conversations 5
```

## Test Descriptions

### Test 2: WebSocket Message Bus

**What it tests:** Concurrent connection handling, message routing throughput, memory usage

**Node.js implementation:** `node-message-bus.js`
- Single-threaded event loop
- WebSocket server with agent registry
- Message routing between connected agents

**Rust implementation:** `rust-message-bus/`
- Multi-threaded async (tokio)
- WebSocket server with concurrent handling
- Zero-copy message routing where possible

**Load test:** `load-test.js` (k6)
- Simulates 100-1000 concurrent agents
- Tests 3 messaging patterns: broadcast, targeted, round-robin
- Measures latency, throughput, connection stability

**Key metrics:**
- Active connections supported
- Messages per second
- P95/P99 latency
- Memory per connection

### Test 3: Spawn Pattern Comparison

**What it tests:** Cost of different agent lifecycle patterns

**Patterns tested:**
1. **Spawn-Kill CLI** - Current CFN approach (npx spawn → execute → kill)
2. **Persistent Node.js** - Long-running Node.js agents receiving messages
3. **Spawn-Kill Docker** - Containerized spawn-execute-kill
4. **Persistent Docker** - Containerized persistent agents

**Key metrics:**
- Time per operation
- Memory baseline and delta
- Overhead comparison

**Decision point:** If persistent saves >50% time AND memory is stable → architectural shift justified

### Test 4: AI SDK Streaming Performance

**What it tests:** Whether Rust optimizations help with streaming AI responses

**Measures:**
- Token processing throughput
- Streaming latency (P50/P95/P99)
- Memory usage during streaming
- Concurrent stream handling

**Modes:**
- `--mock` - Simulated responses (no API key)
- Live API - Actual Anthropic API calls (requires `ANTHROPIC_API_KEY`)

**Key metrics:**
- Tokens per second
- Average token processing time
- Heap delta per stream

**Interpretation:**
- Token processing <1ms → Rust adds no value (network-bound)
- Token processing 1-5ms → Rust could provide 2-3x speedup
- Token processing >5ms → Rust recommended for token layer

### Test 5: Agent-to-Agent Messaging

**What it tests:** Persistent agents communicating like Slack users

**Conversation patterns:**
1. **Direct** - Agent A ↔ Agent B (ping-pong)
2. **Group** - Agent A → B → C → A (round-robin)
3. **Parallel** - Multiple simultaneous conversations

**Key metrics:**
- Message success rate
- Message latency (P50/P95/P99)
- Conversation turn throughput
- Error rate

**Validates:**
- Reliability of persistent architecture
- Conversation context preservation
- Multi-agent coordination stability

**Interpretation:**
- Success rate >95% → Architecture is viable
- P95 latency <100ms → Feels instant (Slack-like)
- Errors = 0 → System is stable

## Results Interpretation

### Decision Tree

Results are saved to `./results/final-report.json`. Use this decision tree:

```
1. WebSocket Message Bus (Test 2)
   ├─ Node.js handles 1000 agents with P95 <50ms?
   │  ├─ YES → Stick with Node.js
   │  └─ NO → Rust provides 2-5x improvement?
   │     ├─ YES → Build Rust message bus
   │     └─ NO → Optimize Node.js first
   │
   └─ Memory: Rust uses <50% of Node.js memory?
      └─ YES → Strong case for Rust (cost savings)

2. Spawn Patterns (Test 3)
   ├─ Persistent saves >50% time vs spawn-kill?
   │  ├─ YES → Move to persistent architecture
   │  └─ NO → Keep current spawn-kill
   │
   └─ Persistent memory stable over time?
      ├─ YES → Safe to use persistent agents
      └─ NO → Memory leak detected, fix before migrating

3. AI Streaming (Test 4)
   ├─ Token processing <1ms?
   │  └─ YES → Network-bound, Rust adds no value
   ├─ Token processing 1-5ms?
   │  └─ YES → Rust could help (2-3x speedup)
   └─ Token processing >5ms?
      └─ YES → Rust recommended

4. Agent Messaging (Test 5)
   ├─ Success rate >95%?
   │  ├─ YES → Persistent agents viable
   │  └─ NO → Architecture needs fixes
   │
   ├─ P95 latency <100ms?
   │  ├─ YES → Excellent UX (Slack-like)
   │  └─ NO → Optimize routing
   │
   └─ Zero errors?
      ├─ YES → Production-ready
      └─ NO → Review error logs
```

### Migration Recommendations

**Scenario 1: Full Rust Migration**
- WebSocket test shows 3x+ improvement
- Memory savings >60%
- High concurrent agent count (>500)

**Recommendation:** Build Rust message bus, keep Node.js agents
- **Architecture:** Rust core + Node.js application layer
- **Benefit:** Infrastructure efficiency + AI ecosystem advantage

---

**Scenario 2: Hybrid Approach (Recommended)**
- WebSocket test shows 2x improvement
- AI streaming is network-bound
- Persistent pattern saves 50%+ time

**Recommendation:** Rust for message bus, Node.js for agents
- **Architecture:**
  ```
  Rust Message Bus (routing, presence, coordination)
       ↕ (WebSocket/gRPC)
  Node.js Agents (AI calls, business logic, stateful memory)
  ```
- **Benefit:** Best of both worlds

---

**Scenario 3: Stay with Node.js**
- WebSocket test shows <50% improvement
- AI streaming is CPU-efficient
- Spawn-kill pattern is acceptable

**Recommendation:** Optimize Node.js, defer Rust migration
- **Actions:**
  - Optimize WebSocket implementation
  - Add connection pooling
  - Implement caching layers
- **Revisit:** When scaling beyond 1000 concurrent agents

---

**Scenario 4: Persistent Architecture Only**
- Persistent pattern saves >50% time
- Memory is stable
- Agent messaging success >95%

**Recommendation:** Move to persistent agents in Node.js
- **Architecture:** Long-running Node.js agents with message bus
- **Skip:** Rust migration (not needed yet)
- **Benefit:** Faster execution without language migration

## Docker Costs Analysis

Use results to estimate Docker cost savings:

```bash
# Calculate cost reduction
node -e "
const nodeMetrics = require('./results/node-ws-metrics.json');
const rustMetrics = require('./results/rust-ws-metrics.json');

const nodeMem = nodeMetrics.memory_mb.heapUsed;
const rustMem = rustMetrics.memory_mb.rss;

const memSavings = ((nodeMem - rustMem) / nodeMem * 100).toFixed(1);
const costSavings = (memSavings * 0.6).toFixed(0); // Approx 60% of savings translate to cost

console.log(\`Memory Savings: \${memSavings}%\`);
console.log(\`Estimated Docker Cost Reduction: \${costSavings}%\`);
"
```

**Formula:**
- Memory savings directly impact container density
- 50% memory reduction → ~30-40% cost savings
- Cold start improvements → reduced orchestrator wait times

## Troubleshooting

### k6 not found
```bash
# macOS
brew install k6

# Ubuntu/Debian
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# npm (cross-platform)
npm install -g k6
```

### Rust build fails
```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Or skip Rust tests
bash run-all.sh --skip-rust
```

### Port already in use
```bash
# Find and kill process using port 8080
lsof -ti:8080 | xargs kill -9

# Or change port
node node-message-bus.js --port 8082
```

### Out of memory during tests
```bash
# Use quick mode
bash run-all.sh --quick

# Or reduce agent count
node agent-messaging.js --agents 5 --conversations 3
```

## File Structure

```
benchmark/
├── README.md                          # This file
├── package.json                       # Node.js dependencies
├── run-all.sh                         # Orchestrator script
├── node-message-bus.js                # Test 2: Node.js WebSocket server
├── rust-message-bus/                  # Test 2: Rust WebSocket server
│   ├── Cargo.toml
│   └── src/main.rs
├── load-test.js                       # Test 2: k6 load test
├── spawn-cost.sh                      # Test 3: Spawn pattern comparison
├── ai-streaming.js                    # Test 4: AI SDK streaming
├── agent-messaging.js                 # Test 5: Agent-to-agent messaging
└── results/                           # Generated results
    ├── final-report.json              # Comprehensive results
    ├── node-ws-metrics.json           # Node.js WebSocket metrics
    ├── rust-ws-metrics.json           # Rust WebSocket metrics
    ├── spawn-comparison.json          # Spawn pattern comparison
    ├── ai-streaming.json              # AI streaming results
    └── agent-messaging.json           # Agent messaging results
```

## Next Steps

After running benchmarks:

1. **Review `results/final-report.json`**
2. **Apply decision tree above**
3. **Choose migration strategy:**
   - Full Rust migration
   - Hybrid approach (recommended)
   - Stay with Node.js
   - Persistent architecture only

4. **If migrating to Rust:**
   - Start with message bus (high-value, isolated)
   - Keep agents in Node.js (AI ecosystem)
   - Use WebSocket/gRPC boundary

5. **If staying with Node.js:**
   - Optimize WebSocket server
   - Implement connection pooling
   - Add caching layers
   - Monitor for memory leaks

## Cost-Benefit Summary

**Rust Benefits:**
- 40-80% memory reduction
- 2-10x faster cold starts
- Predictable latency (no GC pauses)
- Higher concurrent connections

**Rust Costs:**
- Slower development iteration
- Smaller ecosystem for AI SDKs
- Steeper learning curve
- Longer CI/CD build times

**Recommendation:** Use benchmarks to make data-driven decision. Hybrid approach (Rust infrastructure + Node.js application) often provides best ROI.
