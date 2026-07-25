# Docker Coordinator Architecture - Agent vs Orchestrator

## The Confusion Explained

There are TWO related but different things:

### 1. Coordinator Agent Definition (`.claude/agents/docker-coordinators/cfn-docker-v3-coordinator.md`)
**Purpose:** Tells Main Chat (via Task() tool) how to act as coordinator
**Contains:** Planning phase instructions, responsibilities, execution steps
**Used by:** Main Chat when spawned via `Task("cfn-docker-v3-coordinator")`
**Can't run standalone:** This is a prompt/instruction file, not executable code

### 2. Orchestration Script (`orchestrate.sh`)
**Purpose:** Executable bash script that implements CFN Loop orchestration
**Contains:** `plan_task()`, `spawn_loop3()`, `gate_check()`, etc.
**Used by:** Either Main Chat context (Task mode) or Docker container (Docker mode)
**Can run standalone:** Yes, it's a bash script

## How They Relate

The **agent definition** describes WHAT the coordinator should do.
The **orchestration script** implements HOW to do it.

### Task Mode (Current Default)
```
/cfn-docker-loop
    ↓
Main Chat reads slash command
    ↓
Task("cfn-docker-v3-coordinator") ← Uses agent definition file
    ↓
Agent (running in Main Chat context) executes logic:
    - Reads agent definition instructions
    - Performs planning (via LLM calls)
    - Invokes orchestrate.sh
    - orchestrate.sh spawns workers via Docker
```

### Docker Native Mode (What We Built)
```
/cfn-docker-native
    ↓
docker run cfn-coordinator:v3
    ↓
coordinator-entrypoint.sh validates environment
    ↓
Executes orchestrate.sh directly
    ↓
orchestrate.sh has plan_task() function
    - Waits for plan file OR falls back to keyword matching
    ↓
spawn_loop3() reads plan and assigns atomic tasks
    ↓
spawn-agent.sh creates worker containers
```

## The Problem

**In Docker mode, the coordinator agent definition ISN'T being used.**

The container just runs `orchestrate.sh`, which:
- Has the `plan_task()` function (waits for plan file)
- But has NO LLM to actually generate the plan
- Falls back to keyword-based agent selection

## The Solution

### Option A: Make orchestrate.sh Call LLM for Planning
Modify `plan_task()` in orchestrate.sh to call Anthropic API directly:
```bash
plan_task() {
    # Call Anthropic API with planning prompt
    curl -X POST https://api.anthropic.com/v1/messages \
        -H "x-api-key: $ANTHROPIC_API_KEY" \
        -H "content-type: application/json" \
        -d '{
            "model": "claude-sonnet-4",
            "messages": [{
                "role": "user",
                "content": "Decompose this task into atomic units: '"$task_description"'"
            }]
        }' | jq -r '.content[0].text' > "$plan_file"
}
```

**Pros:** Self-contained, works in Docker
**Cons:** Duplicates planning logic, harder to maintain

### Option B: Hybrid - Use Task for Planning, Docker for Execution
```
/cfn-docker-hybrid
    ↓
Main Chat: Task("cfn-docker-v3-coordinator") for planning ONLY
    ↓
Agent performs planning, writes /tmp/cfn-docker-plan-*.json
    ↓
Main Chat: docker run cfn-coordinator:v3 (with plan file mounted)
    ↓
orchestrate.sh reads existing plan file
    ↓
Spawns workers via Docker
```

**Pros:** Uses agent definition, clean separation
**Cons:** Still requires Main Chat involvement

### Option C: Full Claude Code in Container (Complex)
Install full Claude Code + MCP in container:
```dockerfile
# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code-cli

# Configure Claude Code with MCP servers
COPY .claude /app/.claude

# Entrypoint invokes agent properly
CMD claude-code agent cfn-docker-v3-coordinator
```

**Pros:** True agent invocation with all features
**Cons:** Large image, complex setup, requires API key in container

## Current State (What We Actually Built)

**Docker Native Mode:**
- ✅ Container runs orchestrate.sh
- ✅ orchestrate.sh has `plan_task()` function
- ❌ But `plan_task()` just WAITS for a plan file (doesn't generate it)
- ✅ Falls back to keyword matching if no plan
- ✅ Spawns workers via Docker-in-Docker

**Result:** Works, but doesn't use the full planning capabilities from the agent definition.

## Recommended Approach

**For now: Use Task mode for full planning**
```bash
# This uses the agent definition with planning
/cfn-docker-loop "task" --mode=standard
```

**For future: Implement Option A (LLM in orchestrate.sh)**
Add direct API calls to `plan_task()` so Docker mode gets full planning.

**For production: Implement Option B (Hybrid)**
Best of both worlds - agent plans, Docker executes.

## Summary

**Agent Definition (`.claude/agents/.../cfn-docker-v3-coordinator.md`):**
- Contains planning phase instructions
- Used by Task() tool
- CAN'T run in Docker directly (it's a prompt, not code)

**Orchestration Script (`orchestrate.sh`):**
- Contains planning IMPLEMENTATION (`plan_task()`)
- Runs in both Task and Docker modes
- Currently waits for plan file OR falls back to keywords

**To get full planning in Docker mode:**
Need to add LLM API calls to orchestrate.sh's `plan_task()` function.

**Current workaround:**
Docker mode falls back to keyword-based agent selection (still works, just less intelligent than full planning).
