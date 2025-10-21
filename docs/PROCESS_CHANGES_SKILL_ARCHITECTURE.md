# Process Changes for Skill-Based Architecture

**Date:** 2025-10-20
**Status:** Implementation Guide
**Impact:** Critical - Changes how we write agent templates and orchestrate workflows

---

## Executive Summary

**BUG #11 revealed a fundamental constraint:** Agent templates cannot force tool execution. Agents interpret instructions autonomously.

**Solution:** Shift from template-based enforcement to skill-based output processing.

**Process Changes Required:**
1. ✅ Agent templates focus on analysis (not execution)
2. ✅ Skills handle coordination (Redis, file operations)
3. ✅ Orchestrators control workflow (parsing, validation)
4. ⚠️ 46+ agent templates need updates (remove bash execution instructions)

---

## What Changed

### Before (Template-Based Enforcement) ❌

```markdown
# Agent Template
## CFN Protocol (Step 4 - Report Confidence)

**Execute this command:**
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report \
  --task-id "$TASK_ID" \
  --agent-id "$AGENT_ID" \
  --confidence 0.85
```
```

**Problem:** Agents document instead of execute → orchestrator blocks/fails

---

### After (Skill-Based Processing) ✅

```markdown
# Agent Template (Simplified)
## Completion Protocol

Provide your analysis with clear confidence assessment.

**Output Format:**
- Confidence: [0.0-1.0]
- Key Findings: [bullet points]
- Recommendations: [specific actions]
```

```bash
# Orchestrator (Skill-Based)
AGENT_OUTPUT=$(npx claude-flow-novice agent coder ...)
CONFIDENCE=$(parse-confidence.sh "$AGENT_OUTPUT")
redis-cli lpush "swarm:${TASK_ID}:confidence" "$CONFIDENCE"
```

**Result:** Orchestrator controls coordination, agent focuses on analysis

---

## Required Process Changes

### 1. Agent Template Simplification

**Action:** Remove bash execution instructions from 46+ agent templates

**Current State:**
```bash
grep -r "invoke-waiting-mode.sh report" .claude/agents/ | wc -l
# Result: 46 files
```

**Files Needing Updates:**
- `.claude/agents/core-agents/coder.md`
- `.claude/agents/core-agents/reviewer.md`
- `.claude/agents/core-agents/tester.md`
- `.claude/agents/core-agents/code-quality-validator.md`
- ... (42 more)

**Before (Remove):**
```markdown
## CFN Protocol

**Step 1:** Complete work
**Step 2:** Signal completion
```bash
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:done" "complete"
```
**Step 3:** Report confidence
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh report ...
```
**Step 4:** Enter waiting mode
```bash
./.claude/skills/redis-coordination/invoke-waiting-mode.sh enter ...
```
```

**After (Replace With):**
```markdown
## Completion Guidelines

Provide clear analysis and confidence assessment in your response.

**Include:**
- **Confidence:** Rate your work quality (0.0-1.0)
- **Key Results:** What you accomplished
- **Concerns:** Issues requiring attention
- **Recommendations:** Next steps if applicable

**Example Output:**
```
Confidence: 0.85

Key Results:
- Implemented authentication module
- Added 15 unit tests
- All tests passing

Concerns:
- Edge case handling for OAuth flow needs review

Recommendations:
- Security review recommended before production
```

**Note:** The orchestrator will handle all Redis coordination automatically.
```

---

### 2. Orchestrator Skill Integration

**Action:** Update orchestrators to use output processing skills

**Currently Implemented:**
- ✅ Product Owner Decision (`.claude/skills/product-owner-decision/`)

**Needs Implementation:**
- ⚠️ Loop 3 Confidence Extraction
- ⚠️ Loop 2 Feedback Extraction
- ⚠️ Deliverable Verification (partially done)

**Pattern:**
```bash
# orchestrate-cfn-loop.sh

# OLD: Wait for agent Redis push
DECISION=$(redis-cli blpop "swarm:${TASK_ID}:${AGENT_ID}:decision" 3600)

# NEW: Capture output and parse
AGENT_OUTPUT=$(npx claude-flow-novice agent product-owner ...)
DECISION=$(parse-decision.sh "$AGENT_OUTPUT")
redis-cli lpush "swarm:${TASK_ID}:${AGENT_ID}:decision" "$DECISION"
```

---

### 3. Documentation Updates

**Action:** Update all process documentation

**Files Needing Updates:**

#### High Priority
- [x] `CLAUDE.md` - Added skills, updated orchestration flow
- [ ] `.claude/agents/CLAUDE.md` - Agent creation guide (update CFN Protocol section)
- [ ] `.claude/templates/redis-coordination.md` - Remove execution requirements
- [ ] `.claude/templates/cfn-loop-mechanics.md` - Update completion protocol

#### Medium Priority
- [ ] `README.md` - Update architecture overview
- [ ] Slash command documentation (CFN Loop commands)
- [ ] Agent-specific READMEs

---

### 4. Skill Creation (High Priority)

**Action:** Create missing output processing skills

**Priority 1: Loop 3 Confidence Extraction**
```bash
# Location: .claude/skills/loop3-output-processing/

# Components:
├── SKILL.md                          # Documentation
├── extract-confidence.sh             # Parse confidence from text
├── validate-deliverables.sh          # Check file changes
└── calculate-confidence.sh           # Derive confidence if not stated
```

**Usage:**
```bash
RESULT=$(./extract-confidence.sh \
  --agent-output "$CODER_OUTPUT" \
  --task-id "$TASK_ID")

CONFIDENCE=$(echo "$RESULT" | jq -r '.confidence')
FILES_CREATED=$(echo "$RESULT" | jq -r '.filesCreated')
```

**Priority 2: Loop 2 Feedback Extraction**
```bash
# Location: .claude/skills/loop2-output-processing/

# Components:
├── SKILL.md                          # Documentation
├── extract-feedback.sh               # Parse validator feedback
├── categorize-feedback.sh            # Critical/warning/suggestion
└── structure-iteration-plan.sh       # Build targeted feedback
```

**Usage:**
```bash
RESULT=$(./extract-feedback.sh \
  --agent-output "$REVIEWER_OUTPUT" \
  --task-id "$TASK_ID")

CONFIDENCE=$(echo "$RESULT" | jq -r '.confidence')
CRITICAL=$(echo "$RESULT" | jq -r '.feedback.critical[]')
WARNINGS=$(echo "$RESULT" | jq -r '.feedback.warnings[]')
```

---

### 5. Testing Updates

**Action:** Update CFN Loop tests to use skill-based patterns

**Current Tests:**
- `.claude/skills/redis-coordination/test-orchestrator.sh`

**Needs Updates:**
- Test Product Owner decision parsing (not Redis wait)
- Test confidence extraction from implementers
- Test feedback extraction from validators
- Test deliverable verification override

**New Test:**
```bash
# Test: Product Owner decision parsed correctly
test_product_owner_parsing() {
  # Mock Product Owner output
  PO_OUTPUT="After analysis, I recommend we PROCEED with deployment."

  # Parse decision
  DECISION=$(parse-decision.sh --output "$PO_OUTPUT")

  # Verify
  assert_equals "$DECISION" "PROCEED"
}
```

---

## Migration Plan

### Phase 1: Critical Path (Sprint 9)

**Week 1: Skill Creation**
- [ ] Create Loop 3 confidence extraction skill
- [ ] Create Loop 2 feedback extraction skill
- [ ] Test skills with real agent output

**Week 2: Orchestrator Integration**
- [ ] Integrate Loop 3 skill into orchestrator
- [ ] Integrate Loop 2 skill into orchestrator
- [ ] Update deliverable verification

**Week 3: Testing & Validation**
- [ ] Run full CFN Loop test suite
- [ ] Verify confidence scores reliable
- [ ] Confirm no "consensus on vapor"

---

### Phase 2: Agent Template Updates (Sprint 10)

**Approach:** Gradual rollout by agent category

**Batch 1: Core CFN Loop Agents**
- [ ] coder.md
- [ ] reviewer.md
- [ ] tester.md
- [ ] code-quality-validator.md
- [ ] product-owner.md (already simplified)

**Batch 2: Specialized Implementers**
- [ ] backend-dev.md
- [ ] frontend-dev.md
- [ ] mobile-dev.md
- [ ] devops-engineer.md

**Batch 3: Validators & Analyzers**
- [ ] security-specialist.md
- [ ] performance-benchmarker.md
- [ ] code-analyzer.md

**Batch 4: Remaining Agents**
- [ ] All other agents with CFN Protocol sections

---

### Phase 3: Documentation (Sprint 11)

- [ ] Update `.claude/agents/CLAUDE.md`
- [ ] Update `.claude/templates/redis-coordination.md`
- [ ] Update `.claude/templates/cfn-loop-mechanics.md`
- [ ] Update `README.md`
- [ ] Update slash command docs

---

## Template Update Script

**Automated batch update for agent templates:**

```bash
#!/bin/bash
# update-agent-templates.sh

AGENTS_DIR=".claude/agents"

# Find all agents with CFN Protocol sections
find "$AGENTS_DIR" -name "*.md" -type f | while read -r agent_file; do
  if grep -q "CFN Protocol" "$agent_file"; then
    echo "Updating: $agent_file"

    # Backup original
    cp "$agent_file" "${agent_file}.backup"

    # Remove old CFN Protocol section
    sed -i '/## CFN Protocol/,/## /{ /## CFN Protocol/d; /## /!d; }' "$agent_file"

    # Add simplified completion guidelines
    cat >> "$agent_file" << 'EOF'

## Completion Guidelines

Provide clear analysis and confidence assessment in your response.

**Include:**
- **Confidence:** Rate your work quality (0.0-1.0)
- **Key Results:** What you accomplished
- **Concerns:** Issues requiring attention
- **Recommendations:** Next steps if applicable

**Note:** The orchestrator handles Redis coordination automatically.
EOF

    echo "  ✅ Updated"
  fi
done

echo "Template updates complete"
```

**Usage:**
```bash
# Dry run (backup only)
./update-agent-templates.sh --dry-run

# Apply updates
./update-agent-templates.sh
```

---

## Validation Checklist

**Before considering Phase 1 complete:**

- [ ] Product Owner decision parsing works (BUG #11 fix)
- [ ] Loop 3 confidence extraction implemented
- [ ] Loop 2 feedback extraction implemented
- [ ] Deliverable verification prevents "consensus on vapor"
- [ ] Full CFN Loop test passes
- [ ] No 0.0 confidence scores
- [ ] Structured feedback from validators
- [ ] Orchestrator controls all Redis coordination

**Before considering Phase 2 complete:**

- [ ] All core CFN agents updated
- [ ] All specialized agents updated
- [ ] Templates tested with real workflows
- [ ] Agent creation guide updated
- [ ] Zero references to manual bash execution in templates

**Before considering Phase 3 complete:**

- [ ] All documentation reflects skill-based architecture
- [ ] Templates guide simplified (no execution complexity)
- [ ] README architecture section updated
- [ ] Slash command docs accurate

---

## Breaking Changes

### For Existing Agent Templates

**OLD: Agents responsible for Redis coordination**
```markdown
Execute this bash command:
```bash
redis-cli lpush "swarm:..."
```
```

**NEW: Agents provide structured output**
```markdown
Output format:
Confidence: 0.85
Results: [...]
```

**Impact:** Existing custom agents need updates (backward compatible during transition)

---

### For Orchestration Code

**OLD: BLPOP wait for agent Redis push**
```bash
DECISION=$(redis-cli blpop "swarm:${TASK_ID}:decision" 3600)
```

**NEW: Parse agent output**
```bash
AGENT_OUTPUT=$(npx claude-flow-novice agent ...)
DECISION=$(parse-decision.sh "$AGENT_OUTPUT")
redis-cli lpush "swarm:${TASK_ID}:decision" "$DECISION"
```

**Impact:** All coordinators need skill integration

---

## Rollback Plan

If skill-based architecture causes issues:

**Quick Rollback (< 1 hour):**
1. Revert orchestrator changes: `git revert [commit-hash]`
2. Restore agent template backups: `cp .backup/*.md .claude/agents/`
3. Redis state persists (no data loss)

**Graceful Migration (Hybrid Mode):**
1. Support both patterns temporarily
2. Orchestrator tries parsing first, falls back to BLPOP
3. Gradual agent migration
4. Remove legacy support after validation

---

## Communication Plan

**Internal Team:**
- Sprint planning: Review migration timeline
- Daily standups: Track Phase 1 progress
- Weekly retro: Adjust based on learnings

**Documentation:**
- Migration guide: This document
- Agent guide: Updated `.claude/agents/CLAUDE.md`
- Changelog: Document breaking changes

**External (npm users):**
- Release notes: Explain skill-based architecture
- Migration guide: How to update custom agents
- Backward compatibility: Hybrid support period

---

## Success Metrics

**Phase 1 Success:**
- Zero CFN Loop failures due to missing Redis pushes
- 100% confidence score reliability (no 0.0)
- Zero "consensus on vapor" scenarios

**Phase 2 Success:**
- All agent templates simplified
- Agent creation time reduced (simpler templates)
- Developer feedback positive

**Phase 3 Success:**
- Documentation reflects reality
- New developers onboard faster
- Zero template complexity complaints

---

## Related Work

- **BUG #11 Fix:** Product Owner execution (`.claude/skills/product-owner-decision/`)
- **BUG #10 Fix:** Confidence race condition (orchestrator polling)
- **Agent Output Processing:** Universal pattern (`.claude/skills/agent-output-processing/SKILL.md`)
- **Skill Opportunities:** Analysis document (`docs/SKILL_ENFORCEMENT_OPPORTUNITIES.md`)

---

## Next Steps

**Immediate (This Week):**
1. Create Loop 3 confidence extraction skill
2. Create Loop 2 feedback extraction skill
3. Test with real CFN Loop execution

**Short-term (Sprint 9):**
1. Integrate skills into orchestrator
2. Run full test suite
3. Validate metrics

**Medium-term (Sprint 10):**
1. Update all agent templates
2. Simplify agent creation guide
3. Update documentation

**Long-term (Sprint 11):**
1. Expand skill-based pattern to all coordination
2. Simplify agent lifecycle (remove waiting mode)
3. Auto-persistence skill

---

## Questions & Answers

**Q: Do ALL agents need updates?**
A: Only agents with CFN Protocol / Redis coordination instructions (46 identified)

**Q: Will existing agents break?**
A: No - orchestrator handles coordination. Agents just need template cleanup.

**Q: What about custom user agents?**
A: Hybrid support period, then migration guide for updates

**Q: Does this affect non-CFN agents?**
A: No - only affects agents participating in CFN Loops

**Q: Performance impact?**
A: Minimal - output parsing adds <100ms per agent

---

## Conclusion

**Skill-based architecture provides:**
- ✅ Guaranteed execution (orchestrator control)
- ✅ Simpler agent templates (focus on analysis)
- ✅ Robust coordination (multi-pattern parsing)
- ✅ Better testability (skill unit tests)
- ✅ Clear separation of concerns

**Process changes required:**
1. Create Loop 3/Loop 2 output processing skills
2. Update 46 agent templates (remove bash execution)
3. Update documentation to reflect new patterns

**Timeline:** 3 sprints (critical path complete Sprint 9)

**Status:** Ready for implementation
