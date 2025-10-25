# Bulk Agent Optimization Strategy

**Target:** 83 remaining agents (38,965 lines)
**Goal:** Reduce to 200-250 lines per agent (~16,600-20,750 lines total)
**Expected reduction:** 18,215-22,365 lines (47-57%)

---

## Agent Categories & Priorities

### Priority 1: Large Coordinators/CFN (6 files, 6,267 lines → ~1,500 lines)
**Savings:** ~4,800 lines (77%)

| File | Lines | Target | Templates |
|------|-------|--------|-----------|
| product-owner.md | 1306 | 250 | cfn-loop, redis, memory, team |
| cfn-coordinator-unified.md | 974 | 200 | cfn-loop, redis, memory |
| mesh-coordinator.md | 936 | 200 | redis, team |
| adaptive-coordinator.md | 660 | 200 | redis, team |
| adaptive-coordinator-enhanced.md | 534 | 200 | redis, team |
| hierarchical-coordinator.md | 608 | 200 | redis, team |

### Priority 2: Testing/Validation (8 files, 5,999 lines → ~1,800 lines)
**Savings:** ~4,200 lines (70%)

| File | Lines | Target | Templates |
|------|-------|--------|-----------|
| interaction-tester.md | 1204 | 250 | team, redis, memory, post-edit |
| production-validator.md (2) | 1443 | 500 | team, redis, memory, post-edit |
| tdd-london-swarm.md | 668 | 200 | team, redis, memory |
| interaction-tester.md (testing/) | 533 | 200 | team, redis, memory |

### Priority 3: Analysis/Performance (3 files, 2,437 lines → ~650 lines)
**Savings:** ~1,800 lines (74%)

| File | Lines | Target | Templates |
|------|-------|--------|-----------|
| code-analyzer.md | 1025 | 250 | team, redis, memory, post-edit |
| perf-analyzer.md | 820 | 200 | team, redis, memory |
| context-curator.md | 592 | 200 | team, redis, memory |

### Priority 4: SPARC/Planning (10 files, 6,392 lines → ~2,200 lines)
**Savings:** ~4,200 lines (66%)

| File | Lines | Target | Templates |
|------|-------|--------|-----------|
| refinement.md | 775 | 200 | team, redis, memory, post-edit |
| architecture.md | 715 | 200 | team, redis, memory |
| pseudocode.md | 561 | 200 | team, redis |
| api-designer-persona.md | 752 | 250 | team, redis |
| security-architect-persona.md | 660 | 200 | team, redis |
| system-architect-persona.md | 602 | 200 | team, redis |
| system-architect.md | 642 | 200 | team, redis, memory |
| Others (3 files) | 1685 | 550 | team, redis |

### Priority 5: Consensus/Specialized (8 files, 4,177 lines → ~1,800 lines)
**Savings:** ~2,400 lines (57%)

| File | Lines | Target | Templates |
|------|-------|--------|-----------|
| goal-planner.md | 832 | 250 | team, redis, memory |
| security-manager.md | 556 | 200 | team, redis, memory |
| blocking-coordinator-example (2) | 1508 | 400 | redis, team |
| task-coordinator.md | 681 | 250 | team, redis, memory |
| mobile-dev.md | 548 | 200 | team, redis, memory |
| Others | ~50 | ~250 | team, redis |

### Priority 6: Remaining Workers (46 files, ~13,693 lines → ~10,000 lines)
**Savings:** ~3,700 lines (27%)

Most already <300 lines, quick optimization:
- Add team-dynamics.md reference
- Extract Redis/memory patterns
- Target: 200-250 lines each

---

## Standard Optimization Pattern

### Every Agent Gets

**1. Team Dynamics Section**
```markdown
## Team Role Awareness

→ See: `.claude/templates/team-dynamics.md`

**Your role adapts based on team:**
- **Solo:** [Full responsibility] - confidence ≥0.80
- **With [Specialist]:** [Collaboration pattern]
- **Authority:** [High/Medium/Implementation]

**Communication:**
- Check team: `redis-cli smembers "swarm:${swarm_id}:agents"`
- Questions: `swarm:${swarm_id}:questions`
- Progress: `agent:${AGENT_ID}:progress`
- Completion: `swarm:${swarm_id}:${role}:${AGENT_ID}:done`
```

**2. Redis Coordination Reference**
```markdown
## Redis Coordination

→ See: `.claude/templates/redis-coordination.md`

**Quick reference:**
- Signal progress: `redis-cli publish "swarm:${SWARM_ID}:${AGENT_ID}:progress"`
- Report completion: `redis-cli publish "swarm:${SWARM_ID}:${AGENT_ID}:complete"`
```

**3. Memory Operations Reference**
```markdown
## Memory Management

→ See: `.claude/templates/memory-operations.md`

**Quick reference:**
- SQLite: `memory.set(key, value, {agentId, aclLevel})`
- Redis: `redis-cli setex "key" 3600 "value"`
```

**4. Post-Edit Validation Reference**
```markdown
## Post-Edit Validation

→ See: `.claude/templates/post-edit-validation.md`

**Critical:** Run hook after every Edit/Write operation
```

**5. CFN Loop Reference (if applicable)**
```markdown
## CFN Loop Integration

→ See: `.claude/templates/cfn-loop-mechanics.md`

**Mode:** [MVP/Standard/Enterprise]
- Gate: [threshold]
- Consensus: [threshold]
```

---

## Extraction Rules

### Remove (Extract to Templates)

1. **Redis patterns** (200-400 lines typically)
   - LPUSH/BLPOP mechanics
   - Channel patterns
   - Message formats
   - Error handling

2. **Memory operations** (150-250 lines typically)
   - SQLite initialization
   - ACL patterns
   - Redis cache
   - Performance metrics

3. **Post-edit hooks** (100-200 lines typically)
   - Hook execution
   - Feedback handling
   - Validation types

4. **CFN Loop mechanics** (300-500 lines typically)
   - Loop structure
   - Decision framework
   - Mode thresholds
   - Auto-progression

5. **Generic patterns** (variable)
   - Error handling boilerplate
   - Standard workflows
   - Common examples

### Keep (Agent-Specific)

1. **Unique specialty** (50-100 lines)
   - What makes this agent different
   - Core algorithm/approach
   - Specialty-specific patterns

2. **Frontmatter** (always)
   - name, description, tools
   - model, provider, capabilities
   - validation_hooks, lifecycle

3. **Role-specific workflows** (50-80 lines)
   - Unique decision logic
   - Specialty algorithms
   - Domain-specific patterns

4. **Success metrics** (10-20 lines)
   - Agent-specific targets
   - Quality thresholds

---

## Batch Processing Strategy

### Batch 1: High-Value Targets (Priority 1-3, 20 files)
**Savings:** ~10,800 lines (72%)
**Time:** 15-20 minutes
**Agents:** 3-4 code-booster agents in parallel

### Batch 2: Medium-Value Targets (Priority 4-5, 18 files)
**Savings:** ~6,600 lines (62%)
**Time:** 10-15 minutes
**Agents:** 3-4 code-booster agents in parallel

### Batch 3: Quick Wins (Priority 6, 46 files)
**Savings:** ~3,700 lines (27%)
**Time:** 20-25 minutes
**Agents:** 4-5 code-booster agents in parallel (10 files each)

**Total Time:** 45-60 minutes
**Total Savings:** ~21,100 lines (54%)

---

## Quality Validation

### Post-Optimization Checks

1. **File size validation**
   ```bash
   find .claude/agents -name "*.md" -exec wc -l {} + | \
     awk '$1 > 300 {print $2": "$1" lines (REVIEW)"}'
   ```

2. **Template reference validation**
   ```bash
   grep -L "team-dynamics.md" .claude/agents/**/*.md | \
     wc -l  # Should be 0 for workers
   ```

3. **Frontmatter validation**
   ```bash
   ./scripts/validate-agent-profiles.sh --check-frontmatter
   ```

4. **Rule-following test**
   - Spawn sample agents
   - Verify team awareness
   - Test Redis communication
   - Validate confidence calibration

---

## Success Metrics

### Target Outcomes

| Metric | Before | Target | Improvement |
|--------|--------|--------|-------------|
| Total agents | 83 | 83 | - |
| Total lines | 38,965 | 17,500 | 55% |
| Avg size | 470 lines | 211 lines | 55% |
| Files >500 lines | 20 | 0 | 100% |
| Files >300 lines | 35 | 5 | 86% |
| Team dynamics | 9/83 (11%) | 83/83 (100%) | 100% |

### Quality Metrics

- **Consistency:** 100% template usage
- **Clarity:** Avg 211 lines per agent
- **Team awareness:** 100% coverage
- **Rule-following:** Improved through brevity
- **Maintainability:** Single source of truth

---

## Execution Plan

### Phase 4A: Batch 1 (High-Value, 20 files)
```bash
# Spawn 4 code-booster agents in parallel
# Each handles 5 files
# Estimated: 15-20 minutes
```

### Phase 4B: Batch 2 (Medium-Value, 18 files)
```bash
# Spawn 3 code-booster agents in parallel
# Each handles 6 files
# Estimated: 10-15 minutes
```

### Phase 4C: Batch 3 (Quick Wins, 46 files)
```bash
# Spawn 5 code-booster agents in parallel
# Each handles 9-10 files
# Estimated: 20-25 minutes
```

### Phase 4D: Validation & Cleanup
```bash
# Run validation scripts
# Fix any outliers
# Generate final report
# Estimated: 5-10 minutes
```

**Total Duration:** ~60 minutes for 83 agents

---

## Agent Assignment Strategy

### Batch 1 Distribution (4 agents)

**Agent 1:** CFN/Coordinators (6 files)
- product-owner.md
- cfn-coordinator-unified.md
- mesh-coordinator.md
- adaptive-coordinator.md
- adaptive-coordinator-enhanced.md
- hierarchical-coordinator.md

**Agent 2:** Testing (4 files)
- interaction-tester.md (frontend)
- production-validator.md (2 files)
- tdd-london-swarm.md

**Agent 3:** Analysis (3 files)
- code-analyzer.md
- perf-analyzer.md
- context-curator.md

**Agent 4:** Large SPARC (4 files)
- refinement.md
- architecture.md
- api-designer-persona.md
- security-architect-persona.md

### Batch 2 Distribution (3 agents)

**Agent 5:** Planning/Persona (6 files)
- system-architect-persona.md
- system-architect.md
- pseudocode.md
- + 3 medium planning agents

**Agent 6:** Consensus/Goal (6 files)
- goal-planner.md
- security-manager.md
- blocking-coordinator examples (2)
- task-coordinator.md
- mobile-dev.md

**Agent 7:** Specialized (6 files)
- Remaining consensus agents
- Remaining specialized workers

### Batch 3 Distribution (5 agents, 10 files each)

**Agents 8-12:** Quick optimization of <300 line agents
- Add team-dynamics reference
- Add template references
- Extract common patterns
- Target: 180-220 lines each

---

**Status:** Strategy ready for execution
**Estimated Total Savings:** 21,100 lines (54% reduction)
**Target Completion:** 60 minutes
