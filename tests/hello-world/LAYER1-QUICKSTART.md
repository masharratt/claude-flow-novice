# Layer 1 Mesh Coordination - Quick Start

## 🚀 Run the Test (3 Steps)

```bash
# 1. Ensure Redis is running
redis-cli ping  # Should return: PONG

# 2. Set Z.ai API key (if not already in .env)
export Z_AI_API_KEY="your_key_here"

# 3. Run the test
node tests/hello-world/layer1-mesh-coordination.js
```

**Duration:** 10-15 minutes

## ✅ Expected Output

```
🚀 Starting Layer 1: Mesh Coordination Test (Redis Pub/Sub)

Test Configuration:
  - Coordinators: 2 (mesh topology)
  - Sub-agents per coordinator: 35
  - Total agents: 72 (2 + 70)
  - Combinations: 70 (7 languages × 10 translations)
  - Provider: Z.ai (glm-4.6)
  - Coordination: Redis Pub/Sub

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1: INITIALIZE MESH COORDINATORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Coordinator-A: Connected to Redis (pub/sub clients)
Coordinator-A: Subscribed to coordination:claims:channel
Coordinator-B: Connected to Redis (pub/sub clients)
Coordinator-B: Subscribed to coordination:claims:channel
✅ Mesh coordinators initialized with Redis pub/sub

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2: CLAIM COMBINATIONS (Redis Pub/Sub)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Coordinator-A: Starting to claim 35 combinations...
Coordinator-B: Starting to claim 35 combinations...
Coordinator-A: Published claim for JavaScript:English
Coordinator-B: Received message from Coordinator-A - claim JavaScript:English
Coordinator-B: Skipping JavaScript:English (peer Coordinator-A has it)
Coordinator-A: Confirmed claim for JavaScript:English
...

✅ Coordinator-A claimed: 35 combinations
✅ Coordinator-B claimed: 35 combinations
✅ No overlaps detected

📊 Coordination Stats:
   Coordinator-A: 70 sent, 70 received
   Coordinator-B: 70 sent, 70 received
   Total messages: 280

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 3: SPAWN SUB-AGENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Coordinator-A: Spawning 35 sub-agents...
Coordinator-A: Added 35 tasks to swarm coordinator
Coordinator-B: Spawning 35 sub-agents...
Coordinator-B: Added 35 tasks to swarm coordinator

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 4: WAIT FOR COMPLETION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⏳ Waiting for all 70 agents to complete...
   (This may take 10-15 minutes with Z.ai)

📊 Progress: 15/70 tasks completed
   - Coordinator-A: 8/35
   - Coordinator-B: 7/35
...
📊 Progress: 70/70 tasks completed
   - Coordinator-A: 35/35
   - Coordinator-B: 35/35

✅ All agents completed!
⏱️  Total duration: 847s

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 5: VALIDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 Files created: 70/70
✅ All 70 files created

📊 Redis Validation:
   - Claims: 70/70
   - Coordinator-A messages: 70
   - Coordinator-B messages: 70
   - Total coordination messages: 140
   - Conflicts detected: 0
   - Timeline events: 70

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TEST RESULTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Coordinators: 2
✅ Sub-agents: 70
✅ Total agents: 72
✅ Files created: 70/70
✅ Redis claims: 70/70
✅ Coordination messages: 140
✅ Conflicts: 0
✅ Overlaps: NO ✅
✅ Duration: 847s

🎉 LAYER 1 TEST PASSED!

💡 Key Success Metrics:
   - 72 agents spawned (2 coordinators + 70 sub-agents)
   - 70 files created (0 overlaps)
   - 140+ coordination messages via Redis pub/sub
   - Full audit trail in Redis

💰 Check Z.ai billing dashboard for 70+ transactions
```

## 🔍 Validate Results

```bash
node tests/hello-world/validate-layer1.js
```

Expected output:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Layer 1: Mesh Coordination Validation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 FILE VALIDATION
────────────────────────────────────────────────────────────
   Total files: 70/70
   ✅ No duplicate files
   ✅ All 70 combinations present
   Files with valid metadata: 70/70
   Overall: ✅ PASS

🔄 REDIS COORDINATION VALIDATION
────────────────────────────────────────────────────────────
   ✅ Connected to Redis
   Claims stored: 70/70
   ✅ All 70 combinations claimed
   Coordinator-A claims: 35
   Coordinator-B claims: 35
   Total claimed: 70/70
   ✅ Claim counts match
   Coordinator-A messages: 70
   Coordinator-B messages: 70
   Total messages: 140
   ✅ Sufficient coordination messages (140 ≥ 140)
   Conflicts detected: 0

   Sample coordination messages:
   [A1] claim JavaScript:English
   [A2] confirmed JavaScript:English
   [A3] claim Python:Spanish
   [B1] claim Ruby:French
   [B2] confirmed Ruby:French
   [B3] claim Go:German

   Overall: ✅ PASS

📊 TEST REPORT VALIDATION
────────────────────────────────────────────────────────────
   Test: Layer 1: Mesh Coordination (Redis Pub/Sub)
   Timestamp: 2025-10-12T18:32:45.123Z
   Duration: 847s

   Overall: ✅ PASS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VALIDATION SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 File Validation:        ✅ PASS
🔄 Redis Coordination:     ✅ PASS
📊 Test Report:            ✅ PASS

🎯 Overall Result:         ✅ PASS

🎉 LAYER 1 VALIDATION PASSED!

Key Achievements:
  ✅ 72 agents spawned (2 coordinators + 70 sub-agents)
  ✅ 70 files created (0 overlaps)
  ✅ 140+ coordination messages via Redis pub/sub
  ✅ Full audit trail in Redis
  ✅ Mesh topology coordination successful
```

## 📊 Inspect Redis Data

```bash
# View all claims
redis-cli keys "coordination:claims:claimed:*"

# Count coordination messages
redis-cli llen "coordination:messages:Coordinator-A"
redis-cli llen "coordination:messages:Coordinator-B"

# View sample messages
redis-cli lrange "coordination:messages:Coordinator-A" 0 4

# View timeline
redis-cli zrange "coordination:timeline" 0 9 WITHSCORES

# Check for conflicts
redis-cli llen "coordination:conflicts:log"
```

## 📁 Output Files

```bash
# View created files
ls -la test-results/hello-world/*.{js,py,rb,go,rs,java,ts}

# Sample file
cat test-results/hello-world/javascript-english.js
```

Expected content:

```javascript
// Agent: agent-Coordinator-A-001
// Coordinator: Coordinator-A
// Language: JavaScript / English
// Message: Hello World

console.log("Hello World");
```

## 🐛 Troubleshooting

### Redis Connection Failed

```bash
# Check Redis status
redis-cli ping

# If not running, start Redis
redis-server
```

### Z.ai API Key Missing

```bash
# Add to .env file
echo "Z_AI_API_KEY=your_key_here" >> .env

# Or export temporarily
export Z_AI_API_KEY="your_key_here"
```

### Test Timeout

**Symptom:** Test hangs after "Waiting for all 70 agents to complete..."

**Solution:** Check Z.ai rate limits or increase timeout in test

```javascript
// In layer1-mesh-coordination.js, line 327
const timeout = 60 * 60 * 1000; // Increase to 60 minutes
```

### Overlaps Detected

**Symptom:** "❌ OVERLAP DETECTED! Test failed."

**Solution:** Clear Redis and retry

```bash
# Clear coordination keys
redis-cli keys "coordination:*" | xargs redis-cli del

# Run test again
node tests/hello-world/layer1-mesh-coordination.js
```

## 📈 Performance Metrics

**Expected:**
- Coordination setup: <5 seconds
- Claim phase: ~7 seconds (70 combinations, 100ms each)
- Agent spawn: <10 seconds
- File creation: 10-15 minutes (Z.ai rate limits)
- Total: 10-15 minutes

**Redis Metrics:**
- Keys created: ~80 (70 claims + coordinators + logs)
- Messages published: 140-280 (claims + confirmations + peer messages)
- Conflicts: 0-5 (resolved via timestamp ordering)

## 💰 Cost Estimate

**Z.ai:**
- 70 sub-agent transactions
- 2 coordinator transactions (minimal)
- ~$0.50-$2.00 total (check Z.ai pricing)

## 🎯 Success Criteria

- ✅ 72 agents spawned
- ✅ 70 files created
- ✅ 0 overlaps
- ✅ ≥140 coordination messages
- ✅ Full Redis audit trail
- ✅ All validations pass

## 📚 More Info

See [README.md](./README.md) for detailed architecture and troubleshooting.
