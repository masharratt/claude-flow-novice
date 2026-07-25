# CFN Loop Prompt Injection System

## Purpose
Standardized context injection for CFN Loop agents, eliminating need to update individual agent profiles.

## Structure

### Base Context
- **File**: `.claude/prompts/cfn-loop-context.md`
- **Content**: CFN Loop overview, responsibilities by loop, confidence scoring, anti-patterns
- **Injected Into**: All CFN Loop agents (Loop 1-5)

### Loop-Specific Context
- **Files**: `.claude/prompts/loop-specific/*.md`
- **Types**:
  - `loop3-implementation.md` - For implementers (coders, researchers, builders)
  - `loop2-validation.md` - For validators (reviewers, testers, architects)
  - `loop4-product-owner.md` - For product owner decision gate
- **Content**: Role-specific instructions, confidence scoring, example workflows

### Injection Script
- **File**: `.claude/skills/cfn-loop-orchestration/inject-loop-context.sh`
- **Usage**: `./inject-loop-context.sh [loop_type] [agent_context]`
- **Output**: Combined context (base + loop-specific + task-specific)

## Benefits

1. **Centralized Updates**: Update once, affect all agents
2. **Consistent Understanding**: All agents receive same CFN Loop overview
3. **Role-Specific Guidance**: Loop-specific instructions for specialized work
4. **No Agent Profile Changes**: No need to modify individual agent profiles
5. **Easy Maintenance**: Single source of truth for CFN Loop behavior

## Usage

### Automatic Injection (Orchestrator)
Orchestrator automatically injects context when spawning agents:

```bash
# In orchestrate-cfn-loop.sh
INJECTED_CONTEXT=$(./.claude/skills/cfn-loop-orchestration/inject-loop-context.sh \
  "loop3" \
  "Create /tmp/test.sh with echo 'Hello World'")

# Spawn agent with injected context
npx claude-flow-novice agent backend-dev \
  --task-id "$TASK_ID" \
  --agent-id "backend-dev-1" \
  --context "$INJECTED_CONTEXT"
```

### Manual Testing
Test context injection directly:

```bash
# Test Loop 3 context injection
./.claude/skills/cfn-loop-orchestration/inject-loop-context.sh \
  "loop3" \
  "Implement JWT authentication"

# Test Loop 2 context injection
./.claude/skills/cfn-loop-orchestration/inject-loop-context.sh \
  "loop2" \
  "Review authentication implementation"

# Test Loop 4 context injection
./.claude/skills/cfn-loop-orchestration/inject-loop-context.sh \
  "loop4" \
  "Make strategic decision on authentication feature"
```

## Context Structure

### Injected Context Format
```
[BASE CONTEXT: CFN Loop overview, all loops]

---

[LOOP-SPECIFIC CONTEXT: Role-specific instructions]

---

# Your Task

[TASK-SPECIFIC CONTEXT: Deliverables, acceptance criteria, feedback]
```

### Example: Loop 3 Injected Context
```markdown
# CFN Loop Agent Context (Auto-Injected)
[Full CFN Loop overview...]

---

# Loop 3: Implementation Agent Context
You are a Loop 3 implementer. Your job is to CREATE actual deliverables.
[Loop 3 specific instructions...]

---

# Your Task

Create /tmp/test.sh with the following functionality:
- Echo "Hello World"
- Exit with status 0

Deliverables:
- /tmp/test.sh (executable)

Acceptance Criteria:
- File exists at /tmp/test.sh
- File is executable
- Running script outputs "Hello World"
```

## Maintenance

### Adding New Loop Types
1. Create `.claude/prompts/loop-specific/loopN-description.md`
2. Add loop-specific instructions, confidence scoring, examples
3. No changes needed to injection script (automatically loads new file)

### Updating Base Context
1. Edit `.claude/prompts/cfn-loop-context.md`
2. Changes immediately affect all agents in all loops
3. Test with: `./inject-loop-context.sh loop3 "Test task"`

### Updating Loop-Specific Context
1. Edit `.claude/prompts/loop-specific/loop[N]-*.md`
2. Changes affect only agents in that specific loop
3. Test with: `./inject-loop-context.sh loop[N] "Test task"`

## Integration Points

### Orchestrator Integration
- **File**: `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
- **Function**: `build_agent_context()`
- **Injection**: Before spawning Loop 3/Loop 2/Loop 4 agents

### CLI Agent Spawning
- **Command**: `npx claude-flow-novice agent [type] --context "$INJECTED_CONTEXT"`
- **Timing**: Just before CLI spawn command
- **Result**: Agent receives complete context on startup

### Task Mode Integration (Future)
- **Command**: `Task("[agent-type]", "$INJECTED_CONTEXT")`
- **Timing**: In coordinator, before Task() call
- **Result**: Same context structure as CLI mode

## Testing

### Unit Testing
```bash
# Test injection script
./.claude/skills/cfn-loop-orchestration/inject-loop-context.sh loop3 "Test"

# Verify output contains:
# 1. Base context (CFN Loop overview)
# 2. Loop 3 specific context (implementer instructions)
# 3. Task context ("Test")
```

### Integration Testing
```bash
# Test full orchestrator flow
./.claude/skills/redis-coordination/orchestrate-cfn-loop.sh \
  --task-id "test-injection" \
  --mode standard \
  --loop3-agents "backend-dev" \
  --loop2-agents "reviewer" \
  --product-owner "product-owner"

# Verify agents receive injected context
redis-cli GET "cfn_loop:task:test-injection:context"
```

## Troubleshooting

### Agent doesn't understand CFN Loop
- **Check**: Is orchestrator using injection script?
- **Verify**: `redis-cli GET "cfn_loop:task:$TASK_ID:context"` contains base + loop-specific context
- **Fix**: Ensure orchestrator calls `inject-loop-context.sh` before spawning

### Agent creates plans instead of deliverables (Loop 3)
- **Check**: Is Loop 3 specific context being injected?
- **Verify**: Agent context contains "DO NOT just describe what you would do - DO IT"
- **Fix**: Ensure `loop3-implementation.md` exists and is loaded

### Validator implements instead of reviews (Loop 2)
- **Check**: Is Loop 2 specific context being injected?
- **Verify**: Agent context contains "DO NOT: Implement or modify code"
- **Fix**: Ensure `loop2-validation.md` exists and is loaded

## Migration Path

### Phase 1: Manual Injection (Current)
- Orchestrator manually calls injection script
- Context passed via CLI parameter

### Phase 2: Automatic Injection (Future)
- CLI spawning automatically detects CFN Loop tasks
- Injection happens at infrastructure level

### Phase 3: Dynamic Context (Future)
- Context adapts based on iteration number
- Feedback history included automatically

## Performance

### Context Size
- Base context: ~2KB
- Loop-specific context: ~1KB
- Task context: ~0.5-2KB
- **Total**: ~3.5-5KB per agent

### Token Cost
- Injected context: ~1000-1500 tokens
- Cost per agent: ~$0.003-0.005 (Anthropic)
- Cost savings vs. custom agent profiles: 90%+ (reuse, no duplication)

## References

- **CFN Loop Documentation**: `CLAUDE.md` (CFN Loop Overview)
- **Orchestrator**: `.claude/skills/redis-coordination/orchestrate-cfn-loop.sh`
- **Agent Spawning**: `.claude/skills/agent-spawning/SKILL.md`
- **Context Storage**: `.claude/skills/redis-coordination/SKILL.md` (Redis patterns)
