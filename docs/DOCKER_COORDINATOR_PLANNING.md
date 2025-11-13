# Docker Coordinator Planning Phase

## Overview

The Docker coordinator now includes a **mandatory planning phase** that decomposes tasks into atomic units before spawning agents. This ensures agents receive clear, scoped work (15-30 min each) rather than ambiguous full task descriptions.

## Key Principles

1. **1 atomic task per agent** (occasionally 2-3 if shared context helps)
2. **15-30 minute scopes** - perfect for Docker's quick execution model
3. **Same prompting for all models** - no special adaptations needed
4. **Clear instructions** - eliminates need for examples

## How It Works

### 1. User Invokes CFN Loop

```bash
/cfn-docker-loop "Implement user authentication" --mode=standard
```

### 2. Coordinator Performs Planning

The coordinator agent (cfn-docker-v3-coordinator) MUST create an execution plan:

**Planning Requirements:**
- Decompose into atomic tasks (15-30 min each)
- Identify dependencies (A → B means A blocks B)
- Group independent tasks for parallel execution
- Assign 1 atomic task per agent

**Output Format:**
```json
{
  "atomic_tasks": [
    {
      "id": "task-1",
      "description": "Implement JWT token generation middleware",
      "estimated_time": "20 min",
      "dependencies": [],
      "agent_type": "backend-developer",
      "deliverables": ["src/middleware/jwt-generator.ts", "unit tests"]
    },
    {
      "id": "task-2",
      "description": "Create authentication guard for route protection",
      "estimated_time": "25 min",
      "dependencies": ["task-1"],
      "agent_type": "backend-developer",
      "deliverables": ["src/guards/auth.guard.ts", "integration tests"]
    },
    {
      "id": "task-3",
      "description": "Add login UI component with form validation",
      "estimated_time": "30 min",
      "dependencies": [],
      "agent_type": "react-frontend-engineer",
      "deliverables": ["src/components/LoginForm.tsx", "Storybook stories"]
    }
  ],
  "execution_phases": {
    "phase_1_parallel": ["task-1", "task-3"],
    "phase_2_sequential": ["task-2"],
    "verification_points": ["verify_auth_flow_integration"]
  }
}
```

**Coordinator writes plan to:**
```bash
/tmp/cfn-docker-plan-${task_id}.json
```

### 3. Orchestrator Executes Plan

The orchestration script (`orchestrate.sh`) now:

1. **Checks for plan file** (`/tmp/cfn-docker-plan-${task_id}.json`)
2. **Extracts atomic task assignments** for each agent type
3. **Spawns agents with specific scopes**
4. **Provides clear context per agent**

**Agent Context Example:**
```json
{
  "task_id": "task-auth-12345",
  "loop_number": 3,
  "iteration": 1,
  "agent_type": "backend-developer",
  "atomic_task": "Implement JWT token generation middleware",
  "expected_deliverables": "src/middleware/jwt-generator.ts, unit tests",
  "instructions": "Complete your assigned atomic task (15-30 min scope). Focus on: Implement JWT token generation middleware. Deliver working, tested code. Report confidence (0.0-1.0)."
}
```

### 4. Agents Execute Atomic Tasks

Each agent receives:
- ✅ Clear, scoped task description (not entire project requirement)
- ✅ Expected deliverables (specific files)
- ✅ Time boundary (15-30 min)
- ✅ Single responsibility

**Result:** Agents understand exactly what to build, reducing confusion and iteration count.

## Fallback Behavior

If planning fails or no plan file exists:
- Orchestrator falls back to keyword-based agent selection
- Agents receive full task description (legacy behavior)
- Warning logged: "Using fallback keyword-based agent selection"

## Benefits

### For Lower-End Models
- **Clear scopes** prevent overwhelm
- **Atomic tasks** match model capabilities
- **Reduced ambiguity** improves success rate

### For Cost Optimization
- **Fewer iterations** due to better initial planning
- **30-50% reduction** in wasted work
- **Better parallelization** of independent tasks

### For Docker Efficiency
- **Quick execution** matches Docker's strength (15-30 min tasks)
- **Clean containers** per atomic task
- **Better resource utilization**

## Example: Authentication System

**User Request:**
```bash
/cfn-docker-loop "Build complete authentication system with JWT" --mode=standard
```

**Coordinator Planning Output:**
```json
{
  "atomic_tasks": [
    {
      "id": "t1",
      "description": "Setup JWT token generation with secret key rotation",
      "estimated_time": "25 min",
      "dependencies": [],
      "agent_type": "backend-developer",
      "deliverables": ["src/auth/jwt.service.ts", "tests"]
    },
    {
      "id": "t2",
      "description": "Implement password hashing with bcrypt",
      "estimated_time": "20 min",
      "dependencies": [],
      "agent_type": "security-specialist",
      "deliverables": ["src/auth/password.service.ts", "security tests"]
    },
    {
      "id": "t3",
      "description": "Create authentication middleware for route protection",
      "estimated_time": "30 min",
      "dependencies": ["t1"],
      "agent_type": "backend-developer",
      "deliverables": ["src/middleware/auth.middleware.ts", "integration tests"]
    },
    {
      "id": "t4",
      "description": "Build login UI with form validation and error handling",
      "estimated_time": "30 min",
      "dependencies": [],
      "agent_type": "react-frontend-engineer",
      "deliverables": ["src/components/Login.tsx", "tests", "Storybook"]
    }
  ],
  "execution_phases": {
    "phase_1_parallel": ["t1", "t2", "t4"],
    "phase_2_sequential": ["t3"],
    "verification_points": ["verify_end_to_end_auth_flow"]
  }
}
```

**Execution:**
1. **Phase 1 (Parallel):** Spawn 3 agents simultaneously
   - backend-developer → JWT token generation (t1)
   - security-specialist → Password hashing (t2)
   - react-frontend-engineer → Login UI (t4)
2. **Phase 2 (Sequential):** After phase 1 completes
   - backend-developer → Auth middleware (t3, depends on t1)
3. **Verification:** Check end-to-end auth flow integration

## Implementation Files

### Updated Files
- `.claude/agents/docker-coordinators/cfn-docker-v3-coordinator.md` - Planning instructions
- `.claude/skills/cfn-docker-loop-orchestration/orchestrate.sh` - Planning invocation and execution

### Key Functions
- `plan_task()` - Waits for coordinator plan file and validates structure
- `analyze_task()` - Tries planning first, falls back to keyword matching
- `spawn_loop3()` - Reads plan and assigns atomic tasks to agents

## Testing

```bash
# Test with simple task
/cfn-docker-loop "Add user profile endpoint" --mode=mvp

# Check for plan file
cat /tmp/cfn-docker-plan-*.json | jq .

# Verify atomic task assignments
grep "atomic_task" /tmp/task-context-*.json
```

## Migration Notes

**Backward Compatible:**
- Existing workflows continue to work (fallback to keyword matching)
- No breaking changes to agent interfaces
- Plan file is optional (but recommended)

**Recommended Migration:**
- Update coordinator prompts to emphasize planning phase
- Monitor plan file creation in logs
- Validate atomic task quality with sample runs
- Iterate on planning prompts based on results
