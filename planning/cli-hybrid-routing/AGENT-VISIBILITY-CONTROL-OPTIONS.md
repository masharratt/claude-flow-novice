# Agent Visibility Control Options

## Problem Statement

**Goal:** Restrict Claude Code Task tool to show only coordinator agents in main chat, while CLI executor can spawn all agent types (coordinators + workers).

**Current State:** All agents in `.claude/agents/` are visible to both:
- Claude Code Task tool (main chat dropdown)
- CLI executor (`AgentLoader` in `src/agents/agent-loader.ts`)

**Desired State:**
- Task tool shows: Only coordinators (`core-agents/`)
- CLI executor spawns: All agents (coordinators + workers)

---

## Option 1: `.claudeignore` Pattern (Recommended)

### Overview

Use a `.claudeignore` file to hide specific agent directories from Claude Code Task tool, while `AgentLoader` ignores the ignore file and reads everything.

### Implementation

**Step 1: Create `.claudeignore` file**

```bash
# File: .claude/agents/.claudeignore

# Hide worker agents from Task tool (main chat visibility)
development/**
testing/**
security/**
frontend/**
analysis/**
optimization/**

# Only core-agents/ will be visible to Task tool
# CLI AgentLoader ignores this file and reads ALL agents
```

**Step 2: Verify Claude Code behavior**

Test if Claude Code respects `.claudeignore`:
```bash
# Before: Task tool shows all agents
# After: Task tool should only show core-agents/

# Check Task tool dropdown in main chat
# Should see: coordinator, coordinator-hybrid, product-owner
# Should NOT see: coder, tester, security-specialist, etc.
```

**Step 3: Verify CLI executor still reads all agents**

```bash
# CLI should ignore .claudeignore and read everything
node tests/manual/test-swarm-direct.js "Build API" --max-agents 5

# AgentLoader should find:
# - coordinator (from core-agents/)
# - coder (from development/)
# - tester (from testing/)
# - security-specialist (from security/)
```

### Directory Structure

```
.claude/agents/
├── .claudeignore           # ← NEW: Hides workers from Task tool
├── core-agents/            # ✅ Visible to Task tool
│   ├── coordinator.md
│   ├── coordinator-hybrid.md
│   └── product-owner.md
├── development/            # ❌ Hidden from Task tool (via .claudeignore)
│   ├── coder.md            # ✅ Visible to CLI executor
│   ├── architect.md
│   └── backend-dev.md
├── testing/                # ❌ Hidden from Task tool
│   ├── tester.md           # ✅ Visible to CLI executor
│   └── production-validator.md
└── security/               # ❌ Hidden from Task tool
    └── security-specialist.md  # ✅ Visible to CLI executor
```

### Code Changes

**No code changes required** if Claude Code respects `.claudeignore`.

If Claude Code doesn't respect `.claudeignore`, `AgentLoader` continues to work as-is (reads all `.md` files recursively).

### Pros

✅ **Zero duplication** - Single source of truth (`.claude/agents/`)
✅ **No code changes** - Uses existing ignore pattern
✅ **DRY principle** - Agent definitions used by both contexts
✅ **Easy maintenance** - One file to control visibility
✅ **Flexible** - Easy to show/hide agent categories

### Cons

⚠️ **Unverified** - Need to test if Claude Code respects `.claudeignore` for agents
⚠️ **Assumption** - Relies on Claude Code implementing ignore pattern

### Testing Required

```bash
# Test 1: Create .claudeignore
echo "development/**" > .claude/agents/.claudeignore
echo "testing/**" >> .claude/agents/.claudeignore

# Test 2: Open Claude Code main chat
# Check Task tool dropdown - should only show core-agents/

# Test 3: Verify CLI still works
node tests/manual/test-swarm-direct.js "Test" --agent coder
# Should succeed (AgentLoader ignores .claudeignore)
```

### Rollback Plan

If `.claudeignore` doesn't work:
1. Delete `.claude/agents/.claudeignore`
2. Implement Option 2 (Separate directories)

---

## Option 2: Separate Directories (Fallback)

### Overview

Create two directories:
- `.claude/agents/` - Only coordinators (visible to Task tool)
- `.claude/agents-cli/` - All agents (read by CLI executor)

Update `AgentLoader` to search both directories.

### Implementation

**Step 1: Restructure agent directories**

```bash
# Move worker agents to agents-cli/
mkdir -p .claude/agents-cli
mv .claude/agents/development .claude/agents-cli/
mv .claude/agents/testing .claude/agents-cli/
mv .claude/agents/security .claude/agents-cli/
mv .claude/agents/frontend .claude/agents-cli/
mv .claude/agents/analysis .claude/agents-cli/
mv .claude/agents/optimization .claude/agents-cli/

# Keep coordinators in agents/ (visible to Task tool)
# .claude/agents/core-agents/ stays
```

**Step 2: Update `AgentLoader` to search both directories**

```typescript
// File: src/agents/agent-loader.ts

export class AgentLoader {
  private agentCache: Map<string, AgentDefinition> = new Map();
  private categoriesCache: AgentCategory[] = [];
  private lastLoadTime = 0;
  private cacheExpiry = 60000;

  /**
   * Get the .claude/agents directory (Task tool visible)
   */
  private getAgentsDirectory(): string {
    let currentDir = process.cwd();

    while (currentDir !== '/') {
      const claudeAgentsPath = resolve(currentDir, '.claude', 'agents');
      if (existsSync(claudeAgentsPath)) {
        return claudeAgentsPath;
      }
      currentDir = dirname(currentDir);
    }

    return resolve(process.cwd(), '.claude', 'agents');
  }

  /**
   * Get the .claude/agents-cli directory (CLI-only agents)
   * NEW: Added for separate CLI agent directory
   */
  private getCliAgentsDirectory(): string {
    let currentDir = process.cwd();

    while (currentDir !== '/') {
      const claudeAgentsCliPath = resolve(currentDir, '.claude', 'agents-cli');
      if (existsSync(claudeAgentsCliPath)) {
        return claudeAgentsCliPath;
      }
      currentDir = dirname(currentDir);
    }

    return resolve(process.cwd(), '.claude', 'agents-cli');
  }

  /**
   * Load agents from BOTH directories
   * UPDATED: Now searches both .claude/agents and .claude/agents-cli
   */
  private async loadAgents(): Promise<void> {
    const agentsDir = this.getAgentsDirectory();
    const cliAgentsDir = this.getCliAgentsDirectory();

    // Clear cache
    this.agentCache.clear();
    this.categoriesCache = [];

    // Find all .md files in BOTH directories
    const agentFiles: string[] = [];

    // Search main agents directory (Task tool visible)
    if (existsSync(agentsDir)) {
      const mainAgents = await glob('**/*.md', {
        cwd: agentsDir,
        ignore: ['**/README.md', '**/MIGRATION_SUMMARY.md'],
        absolute: true,
      });
      agentFiles.push(...mainAgents);
    }

    // Search CLI agents directory (CLI-only)
    if (existsSync(cliAgentsDir)) {
      const cliAgents = await glob('**/*.md', {
        cwd: cliAgentsDir,
        ignore: ['**/README.md', '**/MIGRATION_SUMMARY.md'],
        absolute: true,
      });
      agentFiles.push(...cliAgents);
    }

    // Track categories
    const categoryMap = new Map<string, AgentDefinition[]>();

    // Parse each agent file
    for (const filePath of agentFiles) {
      const agent = this.parseAgentFile(filePath);
      if (agent) {
        // Prevent duplicates (agents/ takes precedence over agents-cli/)
        if (!this.agentCache.has(agent.name)) {
          this.agentCache.set(agent.name, agent);

          // Determine category from file path
          const relativePath = filePath
            .replace(agentsDir, '')
            .replace(cliAgentsDir, '');
          const pathParts = relativePath.split('/');
          const category = pathParts[1] || 'uncategorized';

          if (!categoryMap.has(category)) {
            categoryMap.set(category, []);
          }
          categoryMap.get(category)!.push(agent);
        }
      }
    }

    // Build categories array
    this.categoriesCache = Array.from(categoryMap.entries()).map(
      ([name, agents]) => ({
        name,
        agents: agents.sort((a, b) => a.name.localeCompare(b.name)),
      })
    );

    this.lastLoadTime = Date.now();
  }

  // ... rest of class methods unchanged ...
}
```

**Step 3: Create README in agents-cli/**

```markdown
<!-- File: .claude/agents-cli/README.md -->

# CLI-Only Agent Definitions

This directory contains agent definitions that are **only accessible via CLI spawning**.

These agents are **NOT visible** in Claude Code Task tool main chat dropdown.

## Purpose

- **CLI Executor**: Reads agents from this directory via `AgentLoader`
- **Task Tool**: Does NOT read this directory (not visible in main chat)

## Directory Structure

```
.claude/agents-cli/
├── development/       # Coder, architect, backend-dev
├── testing/           # Tester, production-validator
├── security/          # Security specialists
├── frontend/          # UI designers, interaction testers
├── analysis/          # Code analyzers, performance analyzers
└── optimization/      # Performance optimizers, refactoring agents
```

## Usage

Coordinators spawn these agents via CLI:

```bash
node tests/manual/test-swarm-direct.js \
  "Implement JWT validation" \
  --executor --max-agents 1 --agent coder
```

AgentLoader reads from both `.claude/agents/` and `.claude/agents-cli/`.

## Visibility

- ❌ NOT visible in Task tool (main chat)
- ✅ Visible to CLI executor (programmatic spawning)
- ✅ Used by coordinators for worker spawning
```

### Directory Structure

```
.claude/
├── agents/                     # Task tool visible (coordinators only)
│   ├── core-agents/
│   │   ├── coordinator.md
│   │   ├── coordinator-hybrid.md
│   │   └── product-owner.md
│   └── README.md
└── agents-cli/                 # CLI-only (worker agents)
    ├── README.md               # ← NEW: Explains CLI-only purpose
    ├── development/
    │   ├── coder.md
    │   ├── architect.md
    │   └── backend-dev.md
    ├── testing/
    │   ├── tester.md
    │   └── production-validator.md
    ├── security/
    │   └── security-specialist.md
    ├── frontend/
    │   ├── ui-designer.md
    │   └── interaction-tester.md
    ├── analysis/
    │   ├── code-analyzer.md
    │   └── perf-analyzer.md
    └── optimization/
        └── code-booster.md
```

### Pros

✅ **Guaranteed visibility control** - Physical separation ensures Task tool only sees agents/
✅ **No Claude Code assumptions** - Works regardless of ignore file support
✅ **Clear intent** - Directory names clarify purpose
✅ **Flexible** - Easy to move agents between directories

### Cons

⚠️ **Minor duplication risk** - If coordinator agents need to be in both directories
⚠️ **Code changes required** - Must update `AgentLoader`
⚠️ **Maintenance overhead** - Two directories to manage

### Migration Steps

```bash
# Step 1: Create new directory
mkdir -p .claude/agents-cli

# Step 2: Move worker agents
mv .claude/agents/development .claude/agents-cli/
mv .claude/agents/testing .claude/agents-cli/
mv .claude/agents/security .claude/agents-cli/
mv .claude/agents/frontend .claude/agents-cli/

# Step 3: Verify structure
tree .claude/agents
tree .claude/agents-cli

# Step 4: Update AgentLoader (apply code changes above)

# Step 5: Test CLI spawning
node tests/manual/test-swarm-direct.js "Test" --agent coder
# Should succeed (reads from agents-cli/)

# Step 6: Test Task tool
# Open Claude Code main chat
# Check Task tool dropdown - should only show core-agents/
```

### Testing

```bash
# Test 1: CLI executor finds all agents
node -e "
  import('./src/agents/agent-loader.js').then(async ({ agentLoader }) => {
    const agents = await agentLoader.getAllAgents();
    console.log('Total agents:', agents.length);
    console.log('Agent types:', agents.map(a => a.name).join(', '));
  });
"

# Expected: coordinator, coder, tester, security-specialist, etc.

# Test 2: Task tool only shows coordinators
# Open Claude Code → Check Task tool dropdown
# Expected: coordinator, coordinator-hybrid, product-owner
# NOT expected: coder, tester, security-specialist

# Test 3: Coordinator can spawn workers via CLI
# In main chat:
Task("coordinator",
  "Spawn 5 workers via CLI using test-swarm-direct.js",
  "coordinator"
)

# Coordinator should successfully spawn coder, tester, etc.
```

---

## Option 3: Frontmatter Visibility Flag (Future Enhancement)

### Overview

Add `visibility` metadata to agent frontmatter to control Task tool visibility.

### Implementation Concept

**Agent frontmatter example:**

```yaml
---
name: coordinator
description: Lead swarm coordination
visibility: task-tool  # Options: task-tool, cli-only, both
tools: [Read, Write, Edit, Bash, Task, TodoWrite]
---
```

**AgentLoader changes:**

```typescript
interface AgentDefinition {
  name: string;
  description: string;
  visibility?: 'task-tool' | 'cli-only' | 'both';  // ← NEW
  // ... other fields
}

async getTaskToolAgents(): Promise<AgentDefinition[]> {
  await this.ensureLoaded();
  return Array.from(this.agentCache.values()).filter(
    agent => agent.visibility === 'task-tool' ||
             agent.visibility === 'both' ||
             !agent.visibility  // Default to visible
  );
}
```

**Claude Code integration:**

Requires Claude Code to call `agentLoader.getTaskToolAgents()` instead of reading files directly. This may not be configurable in current Claude Code versions.

### Pros

✅ **Single directory** - No duplication
✅ **Metadata-driven** - Visibility controlled by frontmatter
✅ **Flexible** - Per-agent visibility control
✅ **Semantic** - Clear intent in agent definition

### Cons

⚠️ **Unknown feasibility** - Requires Claude Code changes or configuration
⚠️ **Not tested** - Would need verification with Claude Code team
⚠️ **Compatibility risk** - May break if Claude Code ignores custom fields

### Status

**Not recommended for immediate use.** Consider as future enhancement if:
1. Claude Code adds support for visibility metadata
2. Claude Code exposes agent loading hooks
3. Community confirms feasibility

---

## Option 4: Symlinks (Not Recommended)

### Overview

Keep all agents in `.claude/agents-cli/` (source of truth), create symlinks in `.claude/agents/` for coordinators.

### Implementation Concept

```bash
# Source of truth
.claude/agents-cli/
├── core-agents/
│   └── coordinator.md       # ← Original file
└── development/
    └── coder.md

# Task tool directory (symlinks only)
.claude/agents/
└── core-agents/
    └── coordinator.md → ../../agents-cli/core-agents/coordinator.md
```

**Create symlinks:**

```bash
mkdir -p .claude/agents/core-agents

ln -s ../../agents-cli/core-agents/coordinator.md \
      .claude/agents/core-agents/coordinator.md

ln -s ../../agents-cli/core-agents/coordinator-hybrid.md \
      .claude/agents/core-agents/coordinator-hybrid.md
```

### Pros

✅ **Single source of truth** - All originals in agents-cli/
✅ **No duplication** - Symlinks reference originals

### Cons

⚠️ **Symlink complexity** - Cross-platform compatibility issues (Windows)
⚠️ **Maintenance overhead** - Must maintain symlink mappings
⚠️ **Git challenges** - Symlinks in repositories can be problematic
⚠️ **Tooling assumptions** - Claude Code must follow symlinks

### Status

**Not recommended.** Complexity outweighs benefits. Use Option 1 or 2 instead.

---

## Recommendation Matrix

| Criterion | Option 1 (.claudeignore) | Option 2 (Separate dirs) | Option 3 (Metadata) | Option 4 (Symlinks) |
|-----------|-------------------------|--------------------------|---------------------|---------------------|
| **Duplication** | ✅ None | ⚠️ Minimal (if any) | ✅ None | ✅ None |
| **Code changes** | ✅ None | ⚠️ AgentLoader update | ❌ Major (Claude Code) | ⚠️ AgentLoader update |
| **Feasibility** | ⚠️ Unverified | ✅ Guaranteed | ❌ Unknown | ⚠️ Platform-dependent |
| **Maintenance** | ✅ Easy | ✅ Easy | ✅ Easy | ❌ Complex |
| **Clarity** | ✅ Clear | ✅ Very clear | ✅ Semantic | ⚠️ Obscure |
| **Flexibility** | ✅ High | ✅ High | ✅ Highest | ⚠️ Low |

---

## Implementation Plan

### Phase 1: Test Option 1

**Week 1 - Validation**

1. Create `.claude/agents/.claudeignore`:
   ```
   development/**
   testing/**
   security/**
   frontend/**
   ```

2. Test Task tool visibility:
   - Open Claude Code main chat
   - Check Task tool dropdown
   - Verify only coordinators visible

3. Test CLI executor:
   ```bash
   node tests/manual/test-swarm-direct.js "Test" --agent coder
   ```
   - Should succeed (ignores .claudeignore)

**Success criteria:**
- Task tool shows only coordinators
- CLI executor spawns all agents

**If successful:** Document and proceed to Phase 3 (Done)

**If unsuccessful:** Proceed to Phase 2

---

### Phase 2: Implement Option 2 (Fallback)

**Week 2 - Migration**

1. Create `.claude/agents-cli/`:
   ```bash
   mkdir -p .claude/agents-cli
   ```

2. Move worker agents:
   ```bash
   mv .claude/agents/development .claude/agents-cli/
   mv .claude/agents/testing .claude/agents-cli/
   mv .claude/agents/security .claude/agents-cli/
   mv .claude/agents/frontend .claude/agents-cli/
   ```

3. Update `AgentLoader` (apply code changes from Option 2)

4. Create README in `.claude/agents-cli/`

5. Test CLI spawning and Task tool visibility

**Success criteria:**
- Task tool shows only coordinators
- CLI executor spawns all agents
- Tests pass

---

### Phase 3: Documentation

1. Update `.claude/agents/README.md`:
   - Explain visibility (Task tool only)
   - Link to agents-cli/ for workers

2. Update `src/agents/agent-loader.ts` JSDoc:
   - Document dual-directory search
   - Explain precedence (agents/ over agents-cli/)

3. Update CLAUDE.md:
   - Document agent visibility architecture
   - Provide coordinator spawning examples

4. Create migration guide:
   - How to add new agents
   - Which directory to use (coordinators vs workers)

---

## Decision Matrix

**Use Option 1 (.claudeignore) if:**
- ✅ You want zero code changes
- ✅ You prefer single directory (DRY)
- ✅ You're willing to test Claude Code behavior

**Use Option 2 (Separate directories) if:**
- ✅ Option 1 doesn't work (Claude Code ignores .claudeignore)
- ✅ You want guaranteed visibility control
- ✅ You're okay with minor AgentLoader changes

**Avoid Option 3 (Metadata) if:**
- ❌ Claude Code doesn't support custom visibility fields
- ❌ You need solution today (not future enhancement)

**Avoid Option 4 (Symlinks) if:**
- ❌ You use Windows (symlink compatibility issues)
- ❌ You want simple maintenance
- ❌ You don't want Git complexity

---

## Testing Checklist

### Option 1 Testing

- [ ] Create `.claude/agents/.claudeignore`
- [ ] Restart Claude Code
- [ ] Open main chat Task tool dropdown
- [ ] Verify only coordinators visible
- [ ] Run CLI executor: `node tests/manual/test-swarm-direct.js "Test" --agent coder`
- [ ] Verify CLI spawns all agents successfully
- [ ] Check AgentLoader logs (if available)

### Option 2 Testing

- [ ] Create `.claude/agents-cli/` directory
- [ ] Move worker agents to agents-cli/
- [ ] Update `AgentLoader` code
- [ ] Rebuild project: `npm run build`
- [ ] Test CLI executor finds all agents
- [ ] Test Task tool shows only coordinators
- [ ] Run integration tests
- [ ] Verify no agent duplication errors

---

## Rollback Plan

**If Option 1 fails:**
1. Delete `.claude/agents/.claudeignore`
2. Verify Task tool shows all agents again
3. Implement Option 2

**If Option 2 causes issues:**
1. Move agents back: `mv .claude/agents-cli/* .claude/agents/`
2. Revert `AgentLoader` changes
3. Rebuild: `npm run build`
4. Verify CLI and Task tool work normally

---

## Summary

**Recommended approach:**
1. **Try Option 1 first** - Simplest, no code changes
2. **Fallback to Option 2** - Guaranteed to work, minimal changes
3. **Document the chosen solution** - Update CLAUDE.md and README files
4. **Avoid Options 3 and 4** - Not practical for current implementation

**Key insight:** Visibility is controlled by access pattern (Task tool vs CLI executor), not by agent definition content. Physical separation (Option 2) or ignore patterns (Option 1) achieve the same goal with different tradeoffs.
