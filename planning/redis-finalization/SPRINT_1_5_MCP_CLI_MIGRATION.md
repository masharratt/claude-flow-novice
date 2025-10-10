# Sprint 1.5: Agent Profile MCP → CLI Migration

**Phase:** 1 (Core Fixes - P0)
**Sprint ID:** 1.5
**Duration:** 2 days
**Estimated Agents:** 4 (coder × 2, reviewer, tester)
**Priority:** P0 (Critical Infrastructure)

---

## Context

MCP (Model Context Protocol) was deprecated in v2.0.0 (Oct 9, 2025). All agent profiles must migrate from MCP commands to native CLI commands before Phase 2 integration testing.

**Migration Path:**
- **From:** `mcp__claude-flow__swarm_init`, `mcp__claude-flow__agent_spawn`
- **To:** `node test-swarm-direct.js`, `Task` tool, `/swarm` slash command

---

## Objectives

1. **Audit all agent profiles** for MCP tool usage
2. **Migrate coordinator agents** to CLI-only commands
3. **Update tool lists** in agent frontmatter
4. **Verify integration** with spawning tests

---

## Deliverables

### 1. Audit All Agent Profiles for MCP Command Usage

**Action:** Scan all `.md` files in `.claude/agents/` for MCP references

```bash
# Find all MCP tool references
grep -r "mcp__claude-flow" .claude/agents/

# Expected output: mesh-coordinator, hierarchical-coordinator, adaptive-coordinator
```

**Output:** List of affected agent profiles

---

### 2. Update mesh-coordinator.md: Remove mcp__claude-flow References

**File:** `.claude/agents/swarm/mesh-coordinator.md`

**Current (DEPRECATED):**
```yaml
tools: TodoWrite, Read, Write, Edit, Bash, Glob, Grep, WebSearch, SlashCommand, Task, mcp__claude-flow__swarm_init, mcp__claude-flow__agent_spawn
```

**After Migration:**
```yaml
tools: TodoWrite, Read, Write, Edit, Bash, Glob, Grep, WebSearch, SlashCommand, Task
```

**Tool Usage Guide Updates:**

**BEFORE:**
```javascript
// MCP Tool (DEPRECATED)
mcp__claude-flow__swarm_init({
  objective: "Create distributed authentication system",
  strategy: "development"
})
```

**AFTER:**
```bash
# Bash Tool (RECOMMENDED)
node test-swarm-direct.js "Create distributed authentication system" --executor --max-agents 7

# Or SlashCommand Tool
SlashCommand("/swarm", "Create distributed authentication system")
```

---

### 3. Update All Coordinator Agents: Replace MCP Tools with CLI Equivalents

**Agents to Update:**
- `.claude/agents/swarm/mesh-coordinator.md` ✅
- `.claude/agents/swarm/hierarchical-coordinator.md`
- `.claude/agents/swarm/adaptive-coordinator.md`
- `.claude/agents/swarm/adaptive-coordinator-enhanced.md`

**Migration Table:**

| MCP Command (OLD) | CLI Equivalent (NEW) | Tool |
|-------------------|----------------------|------|
| `mcp__claude-flow__swarm_init` | `node test-swarm-direct.js "objective" --executor` | Bash |
| `mcp__claude-flow__swarm_init` | `SlashCommand("/swarm", "objective")` | SlashCommand |
| `mcp__claude-flow__agent_spawn` | `Task("agent-type", "prompt", "subagent_type")` | Task |

---

### 4. Replace mcp__claude-flow__swarm_init → node test-swarm-direct.js

**Direct Execution Pattern:**

```bash
# Full command with all options
node test-swarm-direct.js "Build REST API with auth" \
  --executor \
  --max-agents 7 \
  --strategy development \
  --mode mesh

# Minimal command
node test-swarm-direct.js "objective" --executor
```

**SlashCommand Pattern (Preferred):**

```javascript
SlashCommand("/swarm", "Build REST API with authentication")

// With options
SlashCommand("/swarm", "Research cloud patterns --strategy research --output-format json")
```

---

### 5. Replace mcp__claude-flow__agent_spawn → Task Tool

**GOOD NEWS:** Task tool is already CLI-native (no migration needed)

```javascript
// This already works - no changes needed
Task("coder", "Implement authentication logic", "coder")
Task("mesh-coordinator", "Coordinate distributed system", "mesh-coordinator")
```

**Action:** Just document that Task tool is the standard for spawning sub-agents

---

### 6. Update Tool Lists in Agent Frontmatter

**Pattern for all coordinator agents:**

```yaml
---
name: mesh-coordinator
tools: TodoWrite, Read, Write, Edit, Bash, Glob, Grep, WebSearch, SlashCommand, Task
# REMOVED: mcp__claude-flow__swarm_init, mcp__claude-flow__agent_spawn
---
```

**Verification:**
```bash
# Ensure no MCP tools in frontmatter
grep -A 5 "^tools:" .claude/agents/**/*.md | grep "mcp__"
# Expected: No output (all MCP references removed)
```

---

### 7. Update Example Commands in Agent Documentation

**Section to update in each agent:** `## Tool Usage Guide`

**Template:**

```markdown
## Tool Usage Guide

### SlashCommand Tool
Use for Claude Flow CLI commands:
```javascript
SlashCommand("/swarm", "Create distributed authentication system")
SlashCommand("/cfn-loop", "phase-mesh --max-loop2=10")
SlashCommand("/hooks", "post-edit file.js --memory-key mesh/step")
```

### Bash Tool
Use for Redis coordination, node scripts, and git commands:
```bash
# Redis coordination (with authentication)
redis-cli --pass "$REDIS_PASSWORD" --no-auth-warning setex "mesh:state:${AGENT_ID}" 3600 "active"

# Direct swarm execution (Redis-backed)
node test-swarm-direct.js "objective" --executor --max-agents 7

# Git operations
git add . && git commit -m "feat: mesh coordination complete"
```

### Task Tool
Use for spawning sub-agents:
```javascript
Task("coder", "Implement distributed cache with Redis", "coder")
Task("reviewer", "Review mesh coordination logic", "reviewer")
```

**DEPRECATED:** MCP tools (mcp__claude-flow__*) - Use CLI equivalents above
```

---

### 8. Verify All Agents Use: SlashCommand, Bash, Task (Not MCP Tools)

**Verification Script:**

```bash
#!/bin/bash
# verify-agent-migration.sh

echo "=== Verifying Agent MCP → CLI Migration ==="

# Check for MCP tool references in frontmatter
echo "1. Checking for MCP tools in frontmatter..."
MCP_TOOLS=$(grep -r "mcp__claude-flow" .claude/agents/ | grep "^tools:" || true)
if [ -n "$MCP_TOOLS" ]; then
  echo "❌ FAILED: Found MCP tools in frontmatter:"
  echo "$MCP_TOOLS"
  exit 1
else
  echo "✅ PASSED: No MCP tools in frontmatter"
fi

# Check for MCP usage in examples
echo "2. Checking for MCP usage in documentation examples..."
MCP_EXAMPLES=$(grep -r "mcp__claude-flow__swarm_init\|mcp__claude-flow__agent_spawn" .claude/agents/ || true)
if [ -n "$MCP_EXAMPLES" ]; then
  echo "⚠️  WARNING: Found MCP usage in examples (should have DEPRECATED note):"
  echo "$MCP_EXAMPLES"
else
  echo "✅ PASSED: No MCP usage in examples"
fi

# Verify CLI tools are present
echo "3. Verifying CLI tools are present..."
MISSING_TOOLS=$(grep -L "SlashCommand\|Bash\|Task" .claude/agents/swarm/*.md || true)
if [ -n "$MISSING_TOOLS" ]; then
  echo "❌ FAILED: Some agents missing CLI tools:"
  echo "$MISSING_TOOLS"
  exit 1
else
  echo "✅ PASSED: All agents have CLI tools"
fi

echo ""
echo "✅ All verification checks passed!"
```

**Run:** `bash verify-agent-migration.sh`

---

### 9. Integration Tests: Spawn Agents, Verify No MCP Command Errors

**Test 1: Spawn Mesh Coordinator**

```javascript
// test/integration/agent-spawn-mcp-migration.test.js

describe('Agent Spawning Post-MCP Migration', () => {
  it('should spawn mesh-coordinator without MCP errors', async () => {
    const result = await Task(
      "mesh-coordinator",
      "Test spawn: Create simple coordination pattern",
      "mesh-coordinator"
    );

    // Should complete without MCP-related errors
    expect(result).not.toContain('mcp__claude-flow');
    expect(result).not.toContain('MCP server not found');
    expect(result.status).toBe('success');
  });

  it('should execute swarm init via CLI', async () => {
    const result = await exec(
      'node test-swarm-direct.js "Test objective" --executor --max-agents 3'
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain('mcp');
  });

  it('should execute swarm via slash command', async () => {
    const result = await SlashCommand("/swarm", "Test objective");

    expect(result).toContain('Swarm initialized');
    expect(result).not.toContain('MCP');
  });
});
```

**Run:** `npm test -- agent-spawn-mcp-migration.test.js`

---

## Success Criteria

- ✅ All agent profiles audited (list of affected agents documented)
- ✅ mesh-coordinator.md updated (MCP tools removed from frontmatter)
- ✅ All coordinator agents updated (4 agents migrated)
- ✅ Tool lists contain only CLI tools (SlashCommand, Bash, Task)
- ✅ Example commands use CLI patterns (no MCP examples without DEPRECATED note)
- ✅ Verification script passes (0 MCP frontmatter references)
- ✅ Integration tests pass (no MCP errors during spawn)

---

## Affected Files

1. `.claude/agents/swarm/mesh-coordinator.md`
2. `.claude/agents/swarm/hierarchical-coordinator.md`
3. `.claude/agents/swarm/adaptive-coordinator.md`
4. `.claude/agents/swarm/adaptive-coordinator-enhanced.md`
5. `test/integration/agent-spawn-mcp-migration.test.js` (new)
6. `scripts/verify-agent-migration.sh` (new)

---

## Migration Reference Documents

- `MCP_DEPRECATION_NOTICE.md` - Official deprecation notice
- `MCP_DEPRECATION_COMPLETE.md` - Implementation details
- `V2_MIGRATION_GUIDE.md` - Step-by-step migration guide
- `src/CLAUDE.md` (lines 44-69) - ESM module resolution and MCP deprecation

---

## Timeline

**Day 1:**
- Audit all agent profiles (1 hour)
- Update mesh-coordinator.md (2 hours)
- Update hierarchical-coordinator.md (2 hours)
- Update adaptive-coordinator.md (2 hours)

**Day 2:**
- Update adaptive-coordinator-enhanced.md (2 hours)
- Create verification script (1 hour)
- Create integration tests (2 hours)
- Run verification and tests (1 hour)
- Documentation review (1 hour)

**Total:** 14 hours (2 days with 4 agents)

---

## Notes

- **Critical for Phase 2:** Integration tests in Phase 2 will fail if agents still reference MCP
- **Backward compatibility:** MCP tools still throw errors (not silent fallback), so migration is mandatory
- **CLI reliability:** Native CLI commands are more reliable than MCP (no server dependencies)
- **Coordination patterns:** Mesh/hierarchical coordinators are primary users of swarm initialization

---

## Post-Sprint Validation

After completing Sprint 1.5, run:

```bash
# 1. Verification script
bash scripts/verify-agent-migration.sh

# 2. Integration tests
npm test -- agent-spawn-mcp-migration.test.js

# 3. Manual spawn test
npx claude-flow-novice swarm "Test coordination pattern" --strategy development

# 4. Check agent profile load
npx claude-flow-novice status

# Expected: All checks pass, no MCP errors
```

---

**Sprint Status:** READY FOR EXECUTION
**Dependencies:** None (foundational infrastructure work)
**Blocks:** Phase 2 Integration (agents must use correct tools)
