# SKILL.md Analysis Report
**Date:** December 9, 2025  
**Status:** Comprehensive Audit of 92 SKILL.md files

---

## Executive Summary

**Overall Pass Rate:** 7.6% (7 of 92 skills)  
**Compliance Issue:** 85 skills (92.4%) fail one or more checklist items  
**Critical Blocker:** Missing YAML frontmatter opening `---` delimiter in 82 skills  

This analysis reveals systematic issues across the skill library that prevent proper discoverability, context injection, and usage guidance. The primary issue is a missing frontmatter opener that is a quick fix with high impact.

---

## Analysis Checklist

Each SKILL.md file was evaluated against 6 best practices:

| # | Check | Purpose |
|---|-------|---------|
| 1 | **YAML Frontmatter** | Opening `---` delimiter required for metadata parsing |
| 2 | **Name & Description** | Required frontmatter fields for skill identification |
| 3 | **Trigger Pattern** | "Use when..." language describes conditions for skill use |
| 4 | **Specific Description** | Avoids vague language like "helps with" or "processes data" |
| 5 | **Body Length** | Under 500 lines keeps skills focused and maintainable |
| 6 | **Quick Start/Examples** | Concrete usage patterns or Quick Start section |

---

## Summary Results

### By The Numbers

- **Total Skills Analyzed:** 92
- **Passing All 6 Checks:** 7 (7.6%)
- **Needing Updates:** 85 (92.4%)
- **Average Checks Passed:** 4.1 / 6

### Most Common Issues

| Issue | Count | Impact |
|-------|-------|--------|
| NO_FRONTMATTER | 82 | Blocks metadata parsing, discoverability |
| NO_EXAMPLES | 54 | Reduces usability, increases learning curve |
| NO_TRIGGER_PATTERN | 47 | Unclear when/why to use skill |
| VAGUE_DESC | ~15 | Reduces clarity on scope |
| TOO_LONG | 5 | Harder to maintain |

---

## Passing Skills (7)

These skills meet all 6 criteria and serve as templates:

1. **cfn-memory-persistence** (main)
   - Path: `./.claude/skills/cfn-memory-persistence/SKILL.md`
   - Example: Has frontmatter, clear triggers, usage section

2. **cfn-validation-framework** (main)
   - Path: `./.claude/skills/cfn-validation-framework/SKILL.md`
   - Example: Complete metadata, specific description

3. **cfn-test-framework** (main)
   - Path: `./.claude/skills/cfn-test-framework/SKILL.md`

4. **cfn-operations** (main)
   - Path: `./.claude/skills/cfn-operations/SKILL.md`

5. **cfn-sprint-execution** (main)
   - Path: `./.claude/skills/cfn-sprint-execution/SKILL.md`

6. **cfn-process-management** (main)
   - Path: `./.claude/skills/cfn-process-management/SKILL.md`

7. **cfn-routing-config** (main)
   - Path: `./.claude/skills/cfn-routing-config/SKILL.md`

---

## Priority Fixes (Top 20)

### Tier 1: Single-Issue Fixes [5/6 checks passing]

These need **only** the frontmatter opener `---` on line 1:

1. **cfn-cerebras-mcp**  
   Path: `./.claude/skills/cfn-cerebras-mcp/SKILL.md`

2. **cfn-utilities**  
   Path: `./.claude/skills/cfn-utilities/SKILL.md`

3. **cfn-transparency-middleware**  
   Path: `./.claude/skills/cfn-transparency-middleware/SKILL.md`

4. **cfn-cerebras-coordinator**  
   Path: `./.claude/skills/cfn-cerebras-coordinator/SKILL.md`

5. **cfn-cerebras-code-generator**  
   Path: `./.claude/skills/cfn-cerebras-code-generator/SKILL.md`

6. **cfn-knowledge-base**  
   Path: `./.claude/skills/cfn-knowledge-base/SKILL.md`

7. **cfn-error-management**  
   Path: `./.claude/skills/cfn-error-management/SKILL.md`

8. **cfn-docker-runtime**  
   Path: `./.claude/skills/cfn-docker-runtime/SKILL.md`

**Impact:** Fixes these 8 in < 5 minutes, bringing each from 5/6 to 6/6 pass rate.

---

### Tier 2: Two-Issue Fixes [4/6 checks passing]

These need frontmatter opener + Quick Start section:

9. **cfn-agent-tooling**  
   Issues: NO_FRONTMATTER, NO_EXAMPLES  
   Path: `./.claude/skills/cfn-agent-tooling/SKILL.md`  
   Action: Add `---` + "Quick Start" section with 2-3 concrete examples

10. **cfn-agent-lifecycle**  
    Issues: NO_FRONTMATTER, NO_EXAMPLES  
    Path: `./.claude/skills/cfn-agent-lifecycle/SKILL.md`  
    Action: Add `---` + complete the existing body with usage patterns

11. **cfn-config**  
    Issues: NO_FRONTMATTER, NO_EXAMPLES  
    Path: `./.claude/skills/cfn-config/SKILL.md`

12. **cfn-compilation-error-fixer** (425 lines - acceptable)  
    Issues: NO_FRONTMATTER, NO_EXAMPLES  
    Path: `./.claude/skills/cfn-compilation-error-fixer/SKILL.md`

13. **cfn-epic-parser**  
    Issues: NO_FRONTMATTER, NO_EXAMPLES  
    Path: `./.claude/skills/cfn-epic-parser/SKILL.md`

14. **cfn-local-ruvector-accelerator** (342 lines - acceptable)  
    Issues: NO_FRONTMATTER, NO_EXAMPLES  
    Path: `./.claude/skills/cfn-local-ruvector-accelerator/SKILL.md`

15. **cfn-parameterized-queries** (367 lines - acceptable)  
    Issues: NO_FRONTMATTER, NO_EXAMPLES  
    Path: `./.claude/skills/cfn-parameterized-queries/SKILL.md`

16. **cfn-conversation-sync**  
    Issues: NO_FRONTMATTER, NO_EXAMPLES  
    Path: `./.claude/skills/cfn-conversation-sync/SKILL.md`

17. **cfn-dependency-management**  
    Issues: NO_FRONTMATTER, NO_EXAMPLES  
    Path: `./.claude/skills/cfn-dependency-management/SKILL.md`

18. **cfn-node-heap-sizer** (312 lines - acceptable)  
    Issues: NO_FRONTMATTER  
    Path: `./.claude/skills/cfn-node-heap-sizer/SKILL.md`  
    Action: Add `---` only (specific, has examples)

19. **cfn-edit-safety**  
    Issues: NO_FRONTMATTER, NO_EXAMPLES  
    Path: `./.claude/skills/cfn-edit-safety/SKILL.md`

20. **equation-solver** (335 lines - acceptable)  
    Issues: NO_FRONTMATTER  
    Path: `./.claude/skills/equation-solver/SKILL.md`  
    Action: Add `---` only

**Impact:** Fixes items 9-20 in ~1 hour, improving 12 more skills to 6/6 pass rate.

---

## Remaining Issues (Skills 21-85)

The remaining 65 skills have **multiple issues** across:
- NO_FRONTMATTER (all)
- NO_EXAMPLES (most)
- NO_TRIGGER_PATTERN (40+ skills)
- VAGUE_DESC (15+ skills)
- Nested reference files and complex structures

Common patterns in failing skills:
- **Mega-skills with lib/ subdirectories:** cfn-agent-lifecycle, cfn-docker-runtime, cfn-loop-orchestration-v2
- **Integration skills:** cfn-planning, cfn-skill-management, cfn-task-planning
- **Data skills:** cfn-memory-persistence (passes), cfn-operations (passes), cfn-validation-framework (passes)

---

## Recommendations

### Option A: Quick Win (30 minutes)

**Target:** Bring pass rate from 7.6% to ~25%

1. Add `---` opener to Tier 1 skills (8 skills)
2. Add `---` + Quick Start to Tier 2 skills (top 8 of 12)

**Result:** 16 skills at 100% compliance

**Effort:** ~30 minutes

---

### Option B: Comprehensive Overhaul (2-4 hours)

**Target:** Bring pass rate to 85%+

1. **Phase 1 (1 hour):** Frontmatter opener on all 82 skills
   - Brings all skills to at least 5/6 compliance
   
2. **Phase 2 (1.5 hours):** Add "Use when..." to descriptions (47 skills)
   - Clarifies trigger conditions
   
3. **Phase 3 (1.5 hours):** Add Quick Start section to 54 skills
   - Provides concrete usage examples
   
4. **Phase 4 (0.5 hours):** Refactor vague descriptions (15 skills)

**Result:** 75+ skills at 6/6 compliance

**Effort:** 2-4 hours (can be parallelized with agents)

---

### Option C: Per-Agent Distributed Fix

Assign skill repairs by domain. Run in parallel:

- **Agent A:** cfn-agent-* skills (9 total)
  - cfn-agent-lifecycle, cfn-agent-tooling, cfn-agent-spawning, etc.
  
- **Agent B:** cfn-docker-* skills (5 total)
  - cfn-docker-runtime and lib/ subdirectories
  
- **Agent C:** cfn-memory-* skills (5 total)
  - cfn-memory-persistence and lib/ subdirectories
  
- **Agent D:** cfn-loop-orchestration-* skills (4 total)
  - cfn-loop-orchestration-v2 and lib/ subdirectories
  
- **Agent E:** cfn-planning-* and cfn-skill-* skills (8 total)

- **Agent F:** Remaining skills (46 total)

**Effort:** 45 minutes to 1.5 hours (parallel execution)

**Advantage:** Distributes work, allows specialized context per domain

---

## Specific Action Items

### Frontmatter Template (for all 82 missing)

Replace first line with:
```yaml
---
name: <skill-name-from-directory>
description: <existing-first-sentence-of-content>
```

Example for cfn-cerebras-mcp:
```yaml
---
name: cfn-cerebras-mcp
description: Coordinates rapid code generation via Z.ai glm-4.6 Cerebras LLM with RuVector pattern learning. Use when agents need fast test generation, bulk boilerplate, or repetitive code tasks.
```

### Use When Pattern (for 47 missing)

Add to description: "Use when..."

Bad:
```
description: Coordinates code generation via Cerebras LLM
```

Good:
```
description: Coordinates code generation via Cerebras LLM. Use when agents need rapid bulk code generation, test scaffolding, or boilerplate code with speed prioritized over nuance.
```

### Quick Start Section Template

Add after overview:

```markdown
## Quick Start

### Basic Usage
```bash
# Command here
```

### When to Use
- Scenario 1: [describe]
- Scenario 2: [describe]
```

---

## Compliance Gaps Analysis

### Why Frontmatter Missing in 82 Skills?

Likely causes:
1. Skills created before YAML requirement was standardized
2. Copy-paste from non-frontmatter templates
3. Incremental skill development without upfront documentation
4. No automated validation/linting in CI/CD

**Solution:** Add pre-commit hook to validate SKILL.md frontmatter

### Why Examples Missing in 54 Skills?

Likely causes:
1. Focus on internal architecture over user guidance
2. Complex skills with no simple "hello world" example
3. Assumed users would read inline code examples

**Solution:** Create example template, enforce in skill builder

### Why Trigger Patterns Missing in 47 Skills?

Likely causes:
1. Descriptions written for developers, not for agent selection
2. No clear decision criteria for when to use vs. similar skills
3. Skill purpose evolved but description not updated

**Solution:** Update descriptions during next round of skill reviews

---

## Technical Debt Assessment

### High Priority (blocks discoverability)
- Frontmatter in 82 skills: **CRITICAL** 
- Examples in 54 skills: **HIGH**

### Medium Priority (reduces utility)
- Trigger patterns in 47 skills: **MEDIUM**
- Description clarity in 15 skills: **MEDIUM**

### Low Priority (nice-to-have)
- Length refactoring in 5 skills: **LOW**
- Nested reference documentation: **LOW**

---

## Metrics Summary

| Metric | Value | Interpretation |
|--------|-------|-----------------|
| Pass Rate | 7.6% | Critical gap in documentation standards |
| Avg Checks Passed | 4.1/6 | Most skills are 67% compliant |
| Max Blockers | 4 (frontmatter + examples + triggers + clarity) | Some skills need comprehensive rework |
| Min Effort (Tier 1) | < 5 min | Quick wins available |
| Full Compliance Target | 4 hours | Achievable in one sprint |

---

## Conclusion

The SKILL.md library shows **systematic standardization issues**, not quality problems with individual skills. The primary blocker—missing YAML frontmatter—is a low-effort, high-impact fix that improves 82 skills in one pass.

### Recommended Path Forward

1. **Immediate (< 10 min):** Add `---` to Tier 1 skills (8 skills) → 100% pass for those 8
2. **Short-term (30 min):** Add `---` to Tier 2 skills (12 skills) → 100% pass for those 12
3. **Medium-term (1-2 hours):** Batch-add examples + trigger patterns to remaining 62 skills
4. **Long-term:** Enforce standards via pre-commit hooks and skill builder templates

**Target completion:** Next sprint  
**Expected final pass rate:** 85-90%

