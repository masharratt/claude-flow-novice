# Agent Profile Optimization Plan

**Goal:** Reduce 49 agent profiles from 500+ lines to 300-400 lines (60% reduction)

**Status:** Ready for implementation

---

## Current State Analysis

### Critical Bloat Files
```
coordinator.md:                  1929 lines → Target: 400 lines (79% reduction)
coordinator-hybrid.md:           1790 lines → Target: 400 lines (78% reduction)
cfn-coordinator-enterprise.md:   1303 lines → Target: 350 lines (73% reduction)
product-owner.md:                1306 lines → Target: 350 lines (73% reduction)
cfn-coordinator-standard.md:     1062 lines → Target: 350 lines (67% reduction)
CLAUDE.md (agent guidelines):    1036 lines → Target: 300 lines (71% reduction)
```

### Duplication Analysis
- **Redis patterns**: Duplicated ~1104 times across 82 files (avg 13.5/file)
- **Memory operations**: Duplicated in every coordinator/worker
- **Post-edit hooks**: Duplicated in 60+ agents
- **CFN Loop mechanics**: Duplicated in all CFN coordinators

---

## Optimization Strategy

### Phase 1: Template Extraction (HIGH PRIORITY)

#### 1.1 Create Reusable Templates

**New Templates to Create:**

```
.claude/templates/
├── redis-coordination.md         (EXISTS - 478 lines)
├── memory-operations.md           (NEW - extract from agents)
├── post-edit-validation.md        (NEW - extract hook patterns)
├── cfn-loop-mechanics.md          (NEW - extract loop patterns)
├── agent-communication.md         (NEW - extract Redis pub/sub)
└── consensus-validation.md        (NEW - extract validator patterns)
```

#### 1.2 Memory Operations Template (NEW)

**Extract from:** coordinator.md, coordinator-hybrid.md, all workers

**Template content:**
```markdown
# Memory Operations Template

**Auto-inject:** Include via `<!-- @template memory-operations.md -->`

## SQLite Memory Pattern

```javascript
const memory = new SQLiteMemorySystem({
  swarmId,
  agentId,
  dbPath: '.artifacts/memory.db'
});

await memory.initialize();

// Write (5-level ACL)
await memory.memoryAdapter.set(key, value, {
  agentId,
  aclLevel: 1-5,  // 1=Agent, 2=Team, 3=Swarm, 4=Project, 5=System
  namespace
});

// Read
const data = await memory.memoryAdapter.get(key, { agentId });
```

## Redis Hot Cache Pattern

```bash
# Write to Redis (1h TTL)
redis-cli setex "swarm:${agentId}:${key}" 3600 "$value"

# Read from Redis
value=$(redis-cli get "swarm:${agentId}:${key}")

# Fallback to SQLite if Redis miss
if [ -z "$value" ]; then
  value=$(node -e "console.log(await memory.get('$key'))")
fi
```

**Performance:** Write <60ms, Read <5ms (Redis) / <20ms (SQLite)
**Retention:** Redis 1h, SQLite 30-365d (ACL-dependent)

→ Full architecture: CLAUDE.md Section 8
```

#### 1.3 Post-Edit Validation Template (NEW)

**Extract from:** All agents with post-edit hooks

**Template content:**
```markdown
# Post-Edit Validation Template

**Auto-inject:** All agents with Edit/Write/MultiEdit tools

## Mandatory Post-Edit Hook

After **EVERY** Edit/Write/MultiEdit operation:

```bash
node config/hooks/post-edit-pipeline.js "$FILE_PATH" \
  --memory-key "swarm/$AGENT_ID/$STEP"
```

## Feedback Handling

### CLI Mode (Direct Subscription)
- Auto-subscribe to `agent:${agentId}:feedback`
- Feedback delivered <100ms
- Read from `.artifacts/agents/${agentId}/pending-feedback.json`

### Task Mode (Coordinator-Mediated)
- Coordinator polls `coordinator:${id}:feedback` every 5s
- Coordinator wakes agent via system reminder

### Feedback Response Pattern

```bash
# Check for feedback
feedback=$(cat .artifacts/agents/$AGENT_ID/pending-feedback.json 2>/dev/null)

# Handle ROOT_WARNING
if echo "$feedback" | grep -q "ROOT_WARNING"; then
  suggested=$(echo "$feedback" | jq -r '.rootWarning.suggestions[0].location')
  mv "$ROOT_FILE" "$suggested"
fi

# Handle TDD_VIOLATION
if echo "$feedback" | grep -q "TDD_VIOLATION"; then
  # Write tests before continuing
fi
```

→ Full patterns: `.claude/coordinator-feedback-pattern.md`
```

#### 1.4 CFN Loop Mechanics Template (NEW)

**Extract from:** All CFN coordinators

**Template content:**
```markdown
# CFN Loop Mechanics Template

**Auto-inject:** CFN coordinator agents only

## Loop Structure

```
Loop 0:   Epic/Sprint orchestration → no iteration limit
Loop 0.5: Planning consensus (Enterprise only) → ≥0.85
Loop 1:   Phase execution → no limit
Loop 2:   Consensus validation → max 5-15/phase
Loop 3:   Primary swarm implementation → max 5-15/subtask
Loop 4:   Product Owner decision gate
```

## Decision Framework

| Decision | Criteria | Action |
|----------|----------|--------|
| **PROCEED** | Consensus ≥ threshold | Advance to next phase |
| **LOOP** | Consensus < threshold, fixable | Relaunch Loop 3 with fixes |
| **DEFER** | Out-of-scope, low priority | Add to backlog, proceed |
| **ESCALATE** | Blocked, critical conflict | Halt, require human decision |

## Mode-Specific Thresholds

| Mode | Gate | Consensus | Validators | Max Iterations |
|------|------|-----------|------------|----------------|
| MVP | ≥0.65 | ≥0.85 | 2 | 5 |
| Standard | ≥0.75 | ≥0.90 | 4 | 10 |
| Enterprise | ≥0.85 | ≥0.95 | 5 | 15 |

## Auto-Progression Rules

**FORBIDDEN:**
- ❌ Asking "Should I retry?"
- ❌ Waiting for approval during cycles
- ❌ Stopping at iteration limits without ESCALATE

**REQUIRED:**
- ✅ Relaunch immediately when consensus < threshold
- ✅ Continue until max iterations OR PROCEED
- ✅ Only return to chat for ESCALATE triggers

→ Full rules: `.claude/cfn-loop-rules.md` (auto-injected)
```

---

### Phase 2: Agent Profile Refactoring

#### 2.1 Standard Agent Structure (300-400 lines)

```markdown
---
name: agent-name
description: |
  MUST BE USED when [triggers].
  Keywords - [searchable terms]
tools: [Read, Write, Edit, Bash, TodoWrite]
model: sonnet
provider: zai
---

# Agent Name

[2-3 sentence overview]

## Core Responsibilities

- Bullet 1
- Bullet 2
- Bullet 3

## Execution Pattern

<!-- @template redis-coordination.md -->
<!-- @template memory-operations.md -->
<!-- @template post-edit-validation.md -->

## Agent-Specific Logic

[Only unique logic here - 100-150 lines max]

## Output Format

```json
{
  "confidence": 0.85,
  "reasoning": "brief explanation",
  "blockers": []
}
```

→ Additional context: [reference external docs]
```

#### 2.2 Coordinator Structure (350-400 lines)

```markdown
---
name: coordinator-name
type: coordinator
---

# Coordinator Name

[Overview]

## Topology Selection

<!-- @template redis-coordination.md -->

## CFN Integration (if applicable)

<!-- @template cfn-loop-mechanics.md -->

## Memory Management

<!-- @template memory-operations.md -->

## Coordinator-Specific Logic

[150-200 lines max]

## Worker Spawning Pattern

```bash
npx claude-flow-spawn \
  "Task description" \
  --agents=analyst,architect,coder \
  --provider zai
```

→ Worker coordination: `.claude/templates/redis-coordination.md`
```

---

### Phase 3: Template Injection System

#### 3.1 Build-Time Injection

**Preprocessor script:**
```javascript
// config/preprocess-agents.js

const processTemplate = (content) => {
  const templateRegex = /<!-- @template (.*?) -->/g;

  return content.replace(templateRegex, (_, templatePath) => {
    const template = fs.readFileSync(`.claude/templates/${templatePath}`, 'utf8');
    return `\n${template}\n`;
  });
};

// Run on agent file changes
fs.watch('.claude/agents', (event, filename) => {
  if (filename.endsWith('.md')) {
    const content = fs.readFileSync(filename, 'utf8');
    const processed = processTemplate(content);
    // Agents read processed version at runtime
  }
});
```

#### 3.2 Runtime Reference Pattern

**Alternative: Link-based references**
```markdown
## Memory Operations

→ See: `.claude/templates/memory-operations.md`

**Quick reference:**
- Write: `memory.set(key, value, {agentId, aclLevel})`
- Read: `memory.get(key, {agentId})`
```

---

### Phase 4: Implementation Priority

#### High Priority (Immediate Impact)

1. **coordinator.md** (1929 → 400 lines)
   - Extract Redis patterns → `redis-coordination.md` (EXISTS)
   - Extract memory ops → `memory-operations.md` (NEW)
   - Extract CFN mechanics → reference `.claude/cfn-loop-rules.md`
   - Estimated savings: 1500 lines

2. **coordinator-hybrid.md** (1790 → 400 lines)
   - Same extractions as coordinator.md
   - Add CLI spawning specific patterns
   - Estimated savings: 1400 lines

3. **CFN coordinators** (3 files, avg 1100 lines → 350 lines each)
   - Extract to `cfn-loop-mechanics.md` template
   - Reference mode-specific thresholds
   - Estimated savings: 2250 lines total

#### Medium Priority (Scale Impact)

4. **All workers with Redis** (60+ files)
   - Replace Redis duplication with template reference
   - Estimated savings: 20-30 lines per file = 1200+ lines

5. **All agents with post-edit hooks** (60+ files)
   - Replace hook patterns with template
   - Estimated savings: 15-20 lines per file = 900+ lines

#### Low Priority (Documentation)

6. **Guidelines** (CLAUDE.md, CODER_AGENT_GUIDELINES.md)
   - These can stay comprehensive
   - Move examples to separate files
   - Target: 500-700 lines (still detailed)

---

## Expected Outcomes

### Metrics

**Before:**
- 49 files over 500 lines
- Total bloat: ~50,000 lines
- Duplication: 1104 Redis references across 82 files

**After:**
- 0 files over 500 lines (target: 300-400 max)
- Total reduction: ~25,000 lines (50% codebase reduction)
- Duplication: ~100 template references (90% reduction)

### Benefits

1. **Faster agent loading** (50% token reduction per agent)
2. **Consistent patterns** (single template source of truth)
3. **Easier maintenance** (update template, propagate to all)
4. **Better Redis optimization** (standardized efficient patterns)
5. **Clearer agent focus** (unique logic only, not boilerplate)

---

## Implementation Commands

```bash
# Phase 1: Create templates
mkdir -p .claude/templates
touch .claude/templates/memory-operations.md
touch .claude/templates/post-edit-validation.md
touch .claude/templates/cfn-loop-mechanics.md

# Phase 2: Refactor high-priority agents
# Start with coordinator.md
vim .claude/agents/core-agents/coordinator.md

# Phase 3: Build preprocessor (optional)
npm run agents:preprocess

# Phase 4: Validate
./scripts/validate-agent-profiles.sh --max-lines 500
```

---

## Next Steps

1. ✅ Create memory-operations.md template
2. ✅ Create post-edit-validation.md template
3. ✅ Create cfn-loop-mechanics.md template
4. ⏳ Refactor coordinator.md (HIGH PRIORITY)
5. ⏳ Refactor coordinator-hybrid.md (HIGH PRIORITY)
6. ⏳ Refactor CFN coordinators (3 files)
7. ⏳ Bulk update workers with template references
8. ⏳ Create validation script
9. ⏳ Update CLAUDE.md with template guidance

---

**Status:** Plan complete, ready for execution
**Estimated effort:** 4-6 hours for high-priority files
**Impact:** 50% codebase reduction, 90% duplication elimination
