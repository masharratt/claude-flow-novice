# CFN Loop Task Mode - Quick Reference

**Version:** 1.0.0  |  **Date:** 2025-10-28  |  **Status:** Production Ready

---

## Overview

Task Mode: Main Chat acts as coordinator and spawns agents directly via Task() tool with full context injection and visibility.

| Aspect | Task Mode | CLI Mode |
|--------|-----------|----------|
| **Spawning** | Main Chat spawns agents directly via Task() | Coordinator spawns agents via npx CLI |
| **Visibility** | Full transparency in Main Chat | Background, Redis logs |
| **Provider** | All Anthropic | CLI uses Z.ai routing |
| **Cost** | ~$0.150/iteration | ~$0.054/iteration (64% savings) |
| **Use Case** | Debugging, prototyping, learning | Production, cost optimization |
| **ACE Reflection** | Optional via `--ace-reflect` flag | Always enabled |

### ACE Reflection Flag

```bash
# Enable ACE reflection after each sprint (captures lessons learned)
/cfn-loop "Task description" --spawn-mode=task --ace-reflect

# Without ACE reflection (default for backwards compatibility)
/cfn-loop "Task description" --spawn-mode=task
```

**When to use `--ace-reflect`:**
- Long-running epics (3+ sprints) where learning accumulates
- Complex tasks with multiple iterations
- Teams building organizational knowledge
- Post-mortem analysis and continuous improvement

---

## Task Mode Execution Pattern

**Key Principle: Main Chat IS the coordinator**

In Task Mode, Main Chat directly spawns all agents via Task() tool. No coordinator agent is used.

### Example: Zone A React Router Migration

```javascript
// ✅ CORRECT - Main Chat spawns agents directly
Task("backend-developer", `
  Migrate React Router from v4 to v6 in Zone A components
  Deliverables: Updated Routes, component fixes, tests
  Directory: frontend/src/zone-a/
`);

Task("react-frontend-engineer", `
  Review and fix any component issues after router migration
  Focus on route parameters, navigation, and component integration
`);

Task("tester", `
  Test React Router v6 migration in Zone A
  Verify all routes work, navigation functions, no regressions
`);

// Later: Process outputs, collect confidence, decide next iteration
```

### What NOT to Do in Task Mode

```javascript
// ❌ INCORRECT - Don't spawn coordinator agent
Task("cfn-v3-coordinator", "Coordinate React Router migration");

// ❌ INCORRECT - Don't use CLI commands in Task Mode
Bash("npx claude-flow-novice swarm 'task description'");

// ❌ INCORRECT - Don't nest CFN Loop calls
Task("reviewer", "/cfn-loop 'review this code'");  // Causes infinite loops
```

---

## Agent Specialization

### Loop 3 (Implementation)

| Task Type | Agents | Count |
|-----------|--------|-------|
| Backend API | backend-dev, researcher, devops | 3 |
| Full-Stack | backend-dev, react-frontend-engineer, devops | 3 |
| Mobile | mobile-dev, backend-dev, researcher | 3 |
| Infrastructure | devops, rust-developer, researcher | 2-3 |
| NPM Package | npm-package-specialist, backend-dev, researcher | 3 |
| Documentation | api-documentation, researcher | 2 |

**Available Implementers:** backend-dev, react-frontend-engineer, devops, rust-developer, researcher, mobile-dev, npm-package-specialist, base-template-generator, api-documentation

### Loop 2 (Validation)

| Complexity | Files | LOC | Validators | Agents | Threshold |
|------------|-------|-----|------------|--------|-----------|
| Simple | 1-2 | <200 | 2 | reviewer, tester | 0.85 |
| Standard | 3-5 | 200-500 | 4 | +architect, +security-specialist | 0.90 |
| Complex/Enterprise | >5 | >500 | 5 | +code-analyzer, +perf/ada* | 0.92-0.95 |

*Add performance-benchmarker if perf-critical, accessibility-advocate-persona if frontend

**Adaptive Scaling Logic:**
```javascript
let validators = ['reviewer', 'tester']; // Base (Simple)
// Standard: 3-5 files or 200-500 LOC
if (files >= 3 || LOC >= 200) {
  validators.push('architect', 'security-specialist');
}
// Complex/Enterprise: >5 files or >500 LOC
if (files > 5 || LOC > 500) {
  validators.push('code-analyzer');
  if (keywords.match(/performance|cache|optimization/i)) validators.push('performance-benchmarker');
  if (keywords.match(/frontend|ui|react|vue|angular/i)) validators.push('accessibility-advocate-persona');
}
return validators.slice(0, 6); // Max 6
```

**Available Validators:** reviewer, tester, architect, security-specialist, performance-benchmarker, code-analyzer, accessibility-advocate-persona, playwright-tester, interaction-tester

### Loop 4 (Product Owner)

- **product-owner**: GOAP decision-making, scope enforcement (PROCEED/ITERATE/ABORT)
- **cto-agent**: Epic-level planning, resource allocation, technology decisions

---

## Sprint Completion Workflow

**Key Difference in Task Mode:**
- Product Owner spawned via `Task()` by Main Chat acting as coordinator (NOT via `execute-decision.sh`)
- Use helper scripts for parsing/validation: `parse-decision.sh`, `validate-deliverables.sh`
- CLI Mode uses `execute-decision.sh` which handles spawning + all logic

### 1. Consensus Validation

**Task Mode** - Main Chat (as coordinator) spawns Product Owner via Task():
```javascript
// Main Chat (as coordinator) builds context and spawns PO
const poContext = `
  CFN Loop iteration ${iteration} complete.
  Loop 2 Consensus: ${consensus} (threshold: ${threshold})

  Decision Framework:
  - PROCEED: Consensus >= ${threshold} AND deliverables verified
  - ITERATE: Consensus < ${threshold} AND iteration < ${maxIterations}
  - ABORT: Max iterations reached

  Output format: Decision: [PROCEED|ITERATE|ABORT]
`;

const poOutput = Task("product-owner", poContext);

// Parse decision using helper
const decision = exec(`parse-decision.sh --output "${poOutput}"`);
// Output: PROCEED | ITERATE | ABORT
```

**Note:** Do NOT call `execute-decision.sh` in Task Mode - it spawns PO via CLI, causing duplicate agents.

### 2. Deliverable Verification
```bash
# Verify deliverables exist (prevents "consensus on vapor")
./.claude/skills/cfn-product-owner-decision/validate-deliverables.sh \
  --task-id "$TASK_ID" \
  --expected-files "src/auth.ts,tests/auth.test.ts"

# Returns: SUCCESS | FAILED
# If FAILED + implementation task → override PROCEED to ITERATE
```

### 3. Git Commit & Push
```bash
git add .
git commit -m "$(cat <<'EOF'
feat(sprint-X): [feature name]

Deliverables:
- [files created/modified]

Validation:
- Consensus: [0.XX]
- Tests: [status]

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
git push origin main
```

### 4. Sprint Summary
```bash
cat > "docs/SPRINT_${SPRINT_NUM}_COMPLETE.md" <<EOF
# Sprint ${SPRINT_NUM} Complete
**Date:** $(date +%Y-%m-%d) | **Consensus:** ${CONSENSUS}
## Deliverables
$(git diff HEAD~1 --name-status | awk '{print "- "$2}')
## Validation
Iterations: Loop 3: ${L3}, Loop 2: ${L2} | Decision: PROCEED
EOF
```

### 5. Execute Product Owner Suggested Next Steps

**After PROCEED Decision:**
Product Owner may suggest follow-up tasks (documentation, testing, refactoring). Main Chat (as coordinator) must proceed by spawning specialized agents to execute these tasks:

```javascript
// Parse PO feedback for suggested next steps
const nextSteps = parseFeedback(poOutput, ["documentation", "integration test", "performance optimization"]);

// Spawn agents for each next step
for (const step of nextSteps) {
  if (step.complexity === "simple" && !step.requiresValidation) {
    // Use backlog background worker for simple tasks
    Bash(`
      ./.claude/skills/epic-management/add-backlog-item.sh \
        --epic-id "${EPIC_ID}" \
        --title "${step.title}" \
        --priority "P3" \
        --reason "Post-sprint cleanup - low validation needs"
    `, "Defer to background worker");
  } else {
    // Spawn specialist agents for complex tasks
    Task(step.agent, `
      Execute post-sprint task: ${step.description}

      Context: Sprint ${SPRINT_NUM} completed. ${step.context}

      Deliverables: ${step.deliverables.join(", ")}

      Acceptance: ${step.acceptance}
    `);
  }
}
```

**Strategic Backlog Worker Usage:**
- **Use background worker when:**
  - No overlap with main sprint work (independent tasks)
  - Simple tasks requiring little validation (linting, formatting, simple docs)
  - Tasks validatable via compilation/linting (type fixes, import cleanup)
  - Avoids holding up main CFN Loop (P3 priority items)

- **Use Task() agents when:**
  - Complex tasks requiring validation (API changes, security updates)
  - Tasks with dependencies on sprint deliverables
  - Tasks needing consensus (architectural decisions, breaking changes)

### 6. ACE Reflection (Optional - If `--ace-reflect` flag enabled)
```bash
# Only run if --ace-reflect flag was passed to /cfn-loop command
if [[ "$ACE_REFLECT_ENABLED" == "true" ]]; then
  echo "📊 Capturing ACE reflection..."
  ./.claude/skills/cfn-ace-system/invoke-context-reflect.sh \
    --task-id "${TASK_ID}" \
    --sprint-id "${SPRINT_NUM}" \
    --consensus "${CONSENSUS}" \
    --iterations-loop3 "${L3}" \
    --iterations-loop2 "${L2}" \
    --deliverables "$(git diff HEAD~1 --name-only | tr '\n' ',')"

  # Output: Stores reflection in SQLite with tags, confidence, priority
  # Categories: PATTERN, STRAT, ANTI, EDGE
  # Automatic tag extraction and deduplication
  echo "✅ ACE reflection captured: $(sqlite3 .claude/cfn-data/cfn-loop.db 'SELECT COUNT(*) FROM context_reflections WHERE task_id = \"'${TASK_ID}'\"') bullets"
fi
```

**Checklist:**
- [ ] Consensus ≥ threshold | [ ] Product Owner approved | [ ] Deliverables verified
- [ ] Tests passing | [ ] Next steps executed or deferred | [ ] Git committed | [ ] Git pushed
- [ ] Summary generated | [ ] ACE reflection captured (if `--ace-reflect` enabled)

---

## Backlog Mechanism

### Epic Config Structure
```json
{
  "epic_id": "epic-auth-001",
  "phases": [...],
  "backlog": [
    {
      "backlog_id": "backlog-001",
      "title": "Implement OAuth",
      "reason": "Out of scope - deferred by PO",
      "priority": "P2",
      "estimated_complexity": "medium"
    }
  ]
}
```

### Adding Backlog Items

**Manual:**
```bash
./.claude/skills/epic-management/add-backlog-item.sh \
  --epic-id "epic-auth-001" --title "OAuth" --priority "P2"
```

**Auto-Deferral (Product Owner):**
```bash
# CLI Mode: execute-decision.sh handles this automatically
# Task Mode: Coordinator should implement this logic after PO decision
if [[ "$FEEDBACK" == *"out of scope"* ]]; then
  add-backlog-item.sh --epic-id "$EPIC_ID" --title "$ITEM" --auto-deferred
fi
```

### Prioritization
- **P1**: Critical, blocks progress → process immediately by launching agents for loop 3
- **P2**: High value → next sprint
- **P3**: Nice to have → background worker

---

## Adaptive Validator Scaling

### Complexity Scoring
```javascript
let score = 0;
score += (files <= 2) ? 10 : (files <= 5) ? 30 : 60;
score += (LOC <= 200) ? 10 : (LOC <= 500) ? 30 : 60;
if (task.match(/auth|payment|token/i)) score += 40; // Security
if (task.match(/performance|cache/i)) score += 30;   // Performance
if (task.match(/frontend|ui|react|vue|angular/i)) score += 20; // ADA compliance

// Category: simple (≤50), standard (≤100), complex/enterprise (>100)
// Validators: simple=2, standard=4 (arch+sec), complex=5+ (code-analyzer+perf/ada*)
```

### Dynamic Thresholds
```javascript
const base = {simple: 0.85, standard: 0.90, complex: 0.92};
threshold = base[category] + (iteration - 1) * 0.02; // Stricter on retries
threshold = Math.min(threshold, 0.98); // Cap at 0.98
```

---

## Background Backlog Worker

### Architecture
- **Main Chat (as coordinator)**: Spawns Task() agents directly for Sprint N (foreground)
- **Background CLI**: Processes P3 backlog items (detached process)

### Launch Background Worker
```bash
npx claude-flow-novice agent backlog-worker \
  --epic-id "epic-auth-001" --priority "P3" --background \
  --log-file "/tmp/backlog-worker-$(date +%s).log" > /dev/null 2>&1 &
echo $! > /tmp/backlog-worker.pid
```

### Worker Logic
1. Fetch P3 items: `redis-cli SMEMBERS "epic:${EPIC_ID}:backlog:P3"`
2. For each item:
   - Mark in_progress: `redis-cli HSET "backlog:${ID}" status "in_progress"`
   - Spawn CFN Loop: `npx claude-flow-novice swarm "$DESC" --mode mvp --background`
   - Monitor: `redis-cli BLPOP "swarm:${TASK_ID}:complete" 300`
   - Mark complete: `redis-cli HSET "backlog:${ID}" status "complete"`
3. Update Redis every 5 min: `redis-cli HSET "backlog:worker:status" processed "$N"`

### Monitor Progress
```bash
redis-cli HGETALL "backlog:worker:status"  # Check status
tail -f /tmp/backlog-worker-*.log          # View logs
kill $(cat /tmp/backlog-worker.pid)        # Stop worker
```

### Safety Mechanisms
- Max 3 concurrent items, 10-min timeout per item, 2-hour max runtime
- Redis locks: `redis-cli SET "backlog:${ID}:lock" "worker-$$" EX 600 NX`
- Manual recovery: Reset stuck items to "pending"

---

### Background Backlog Example

```javascript
// Background: Process P3 backlog
Bash(`
  npx claude-flow-novice agent backlog-worker \
    --epic-id "epic-auth-001" --priority "P3" --background \
    > /dev/null 2>&1 & echo $! > /tmp/backlog-worker.pid
`, "Launch backlog worker")

// Check progress anytime
Bash(`redis-cli HGETALL "backlog:worker:status"`, "Check progress")
```

---

## Quick Reference

### Validator Selection Heuristics
```
Simple (1-2 files, <200 LOC): reviewer, tester
Standard (3-5 files, 200-500 LOC): +architect, +security-specialist
Complex/Enterprise (>5 files, >500 LOC): +code-analyzer
  IF performance-critical → +performance-benchmarker
  IF frontend (react/vue/angular/ui) → +accessibility-advocate-persona
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Low consensus | Add specialized validator or stricter acceptance criteria |
| Git push fails | Check remote: `git remote -v && git fetch origin` |
| Backlog worker stuck | Reset items: `redis-cli HSET "backlog:${ID}" status "pending"`, restart worker |
| Too many validators | Reduce count to 3-4 or lower threshold by 0.02-0.04 |

### Complexity Analysis CLI
```bash
./.claude/skills/task-complexity/analyze.sh --task "$DESC" --files "$LIST"
# Output: {"score": 85, "category": "standard", "validators": ["reviewer","tester","architect","security-specialist"], "threshold": 0.90}
```

---

## ACE System Integration

### Reflection After Sprint
After each sprint completion, Task Mode should capture lessons learned:

```bash
# Automatic reflection capture (called after git push)
./.claude/skills/cfn-ace-system/invoke-context-reflect.sh \
  --task-id "${TASK_ID}" \
  --sprint-id "${SPRINT_NUM}" \
  --consensus "${CONSENSUS}" \
  --iterations-loop3 "${L3}" \
  --iterations-loop2 "${L2}" \
  --deliverables "$(git diff HEAD~1 --name-only | tr '\n' ',')"
```

**What Gets Captured:**
- Patterns that worked well (consensus ≥0.90, low iterations)
- Anti-patterns that caused issues (high iterations, deliverable failures)
- Strategy patterns (agent selection, validator scaling effectiveness)
- Edge cases (timeout scenarios, race conditions, blocking issues)

**Storage:**
- SQLite database: `.claude/cfn-data/cfn-loop.db`
- Table: `context_reflections`
- Automatic tagging, deduplication, confidence scoring

**Benefits:**
- Future sprints learn from past mistakes
- Adaptive validator scaling improves over time
- Pattern recognition across projects
- Knowledge accumulation (not lost between sessions)

### Optional: Context Injection (Future Enhancement)
Before spawning agents, inject relevant lessons:
```bash
# Not yet implemented in Task Mode, but available:
./.claude/skills/cfn-ace-system/invoke-context-inject.sh \
  --task "${TASK_DESCRIPTION}" \
  --phase "${PHASE_NAME}" \
  --tags "validation,consensus,deliverables"
# Returns: Top N relevant bullets from past reflections
```

### Optional: Context Curation (Periodic Maintenance)
Merge and deduplicate reflection data:
```bash
# Run monthly or after major epics:
./.claude/skills/cfn-ace-system/invoke-context-curate.sh \
  --confidence-threshold 0.85 \
  --merge-similar-patterns
```

---

## Related Documentation

- **CFN Coordinator Parameters**: `.claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md`
- **Redis Coordination**: `.claude/skills/cfn-redis-coordination/SKILL.md`
- **Product Owner Decision**: `.claude/skills/cfn-product-owner-decision/SKILL.md`
- **Agent Output Standards**: `docs/AGENT_OUTPUT_STANDARDS.md`
- **ACE System**: `.claude/skills/cfn-ace-system/SKILL.md`

---

**Version:** 1.0.0 (2025-10-28) - Task mode guide: agent specialization, sprint workflow, backlog, adaptive scaling, background processing
