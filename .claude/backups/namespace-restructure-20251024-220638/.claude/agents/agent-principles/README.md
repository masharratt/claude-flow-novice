# Agent Design Principles - Complete Guide

**Version:** 3.0.0 (Phase 4 Template-Optimized)
**Last Updated:** 2025-10-17
**Status:** Production-Ready

This directory contains the complete guide for designing, optimizing, and validating agent profiles in the Claude Flow ecosystem.

---

## Quick Navigation

### Essential Reading (Start Here)
1. **[Phase 4 Template Optimization](./phase4-template-optimization.md)** - Latest empirical findings (75 agents, 73% reduction)
2. **[Format Selection](./format-selection.md)** - Choose the right format for task complexity
3. **[Agent Type Guidelines](./agent-type-guidelines.md)** - Type-specific recommendations

### Advanced Topics
4. **[Prompt Engineering](./prompt-engineering.md)** - Best practices for effective prompts
5. **[Quality Metrics](./quality-metrics.md)** - Validation and benchmarking

### Legacy Documentation (Pre-Phase 4)
6. **[CLAUDE Agent Design Principles](./CLAUDE_AGENT_DESIGN_PRINCIPLES.md)** - Original comprehensive guide
7. **[Coder Agent Guidelines](./CODER_AGENT_GUIDELINES.md)** - Coder-specific patterns

---

## Phase 4 Template System (Latest)

**Key Innovation:** Template extraction eliminates 73% duplication

### The 5 Core Templates
All new agents should use these templates:

1. **redis-coordination.md** (90 lines) - Pub/sub, Signal ACK, error handling
2. **memory-operations.md** (78 lines) - SQLite + Redis, 5-level ACL
3. **post-edit-validation.md** (121 lines) - Hook integration, 5 feedback types
4. **cfn-loop-mechanics.md** (70 lines) - Loop structure, decision framework
5. **team-dynamics.md** (80 lines) - Role adaptation, collaboration patterns

### Results
- **75 agents optimized** (93% of codebase)
- **Average size:** 137 lines (down from 470)
- **Performance:** 50-66% faster loading
- **Maintenance:** 5× easier

**Full details:** See [phase4-template-optimization.md](./phase4-template-optimization.md)

---

## Quick Start: Creating a New Agent

### Template-First Approach (Recommended)

```markdown
---
name: my-agent
description: |
  MUST BE USED when [use case]
  Keywords - [keywords]
tools: [Read, Write, Edit, Bash, TodoWrite]
model: haiku
type: specialist
acl_level: 1
validation_hooks:
  - agent-template-validator
  - cfn-loop-memory-validator
lifecycle:
  pre_task: "sqlite-cli exec 'INSERT INTO agents...'"
  post_task: "sqlite-cli exec 'UPDATE agents...'"
---

# My Agent

Brief description (2-3 lines)

## 🚨 MANDATORY POST-EDIT VALIDATION

→ See: `.claude/templates/post-edit-validation.md`

## Template References

→ See: `.claude/templates/redis-coordination.md`
→ See: `.claude/templates/memory-operations.md`
→ See: `.claude/templates/team-dynamics.md`
→ See: `.claude/templates/cfn-loop-mechanics.md`

## Core Unique Logic

[50-120 lines of agent-specific domain expertise]

## Success Metrics

- Metric 1: Target value
- Metric 2: Target value
```

**Target:** 100-200 lines total

---

## Document Descriptions

### phase4-template-optimization.md
**What:** Complete Phase 4 optimization guide
**When:** Creating new agents, optimizing existing agents
**Key Content:**
- 5 core templates (detailed documentation)
- Optimization methodology (4 phases, 5 batches)
- Empirical findings (before/after statistics)
- Best practices and validation checklists
- Performance metrics (50-66% faster)

### format-selection.md
**What:** Format selection based on task complexity
**When:** Choosing agent profile format
**Key Content:**
- Complexity-Verbosity Inverse Law
- MINIMAL format (complex tasks)
- METADATA format (medium tasks)
- CODE-HEAVY format (basic tasks)
- Empirical Rust benchmarking results

### agent-type-guidelines.md
**What:** Guidelines by agent type
**When:** Designing type-specific agents
**Key Content:**
- Coder agents (implementers)
- Reviewer agents (validators)
- Architect agents (designers)
- Coordinator agents (orchestrators)
- Tester agents (quality assurance)

### prompt-engineering.md
**What:** Best practices for prompts
**When:** Writing agent descriptions
**Key Content:**
- Clear role definition
- Specific responsibilities
- Tool selection
- Integration points
- Anti-patterns to avoid

### quality-metrics.md
**What:** Validation and benchmarking
**When:** Testing agent effectiveness
**Key Content:**
- Pre-deployment checklist
- Performance metrics
- Benchmark system
- Quality gates

---

## Migration Path

### Optimizing Existing Agents

**Step 1:** Read [phase4-template-optimization.md](./phase4-template-optimization.md) migration guide

**Step 2:** Identify duplicate content
```bash
diff agent-file.md .claude/templates/redis-coordination.md
```

**Step 3:** Replace with template references
```markdown
## Redis Coordination

→ See: `.claude/templates/redis-coordination.md`
```

**Step 4:** Validate <200 lines
```bash
wc -l agent-file.md  # Should be <200
```

---

## Key Metrics

### Agent Size Targets
- **Optimal:** 120-160 lines
- **Maximum:** 200 lines
- **Unique logic:** 50-120 lines
- **Templates:** 3-5 references

### Performance Expectations
- **Loading:** <1s per agent (50-66% faster than pre-Phase 4)
- **Tokens:** ~342 tokens per agent (71% reduction)
- **Maintenance:** 5× easier with templates

---

## Version History

### 3.0.0 (2025-10-17) - Phase 4 Template Optimization
- Added phase4-template-optimization.md
- 75 agents optimized (73% reduction)
- 5 core templates created
- Template-first approach validated

### 2.0.0 (2025-09-30) - Empirical Validation
- Rust benchmarking results
- Format selection principles
- Complexity-Verbosity Inverse Law

### 1.0.0 (2025-08-15) - Initial Release
- Original comprehensive guide
- Agent type guidelines
- Prompt engineering basics

---

## Support

**Questions?**
- Review [phase4-template-optimization.md](./phase4-template-optimization.md) for latest guidance
- Check [CLAUDE.md](../CLAUDE.md) for quick start
- See [templates directory](../../templates/) for examples

**Contributing:**
- All new agents must use template-first approach
- Target 100-200 lines
- Reference templates, don't duplicate
- Validate with hooks before committing
