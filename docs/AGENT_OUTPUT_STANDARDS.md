# Agent Output Standards

## Purpose
Standardize where agents write deliverables to ensure persistence, version control, and discoverability.

## File Location Standards

### 1. Bug Investigation & Documentation
**Location:** `docs/BUG_#_*.md`

**Naming Convention:**
- Investigation: `docs/BUG_#_DESCRIPTION.md`
- Fix Summary: `docs/BUG_#_FIX_SUMMARY.md`
- Validation: `docs/BUG_#_VALIDATION_REPORT.md`

**Examples:**
```
docs/BUG_27_PRODUCT_OWNER_DECISION_PARSING.md
docs/BUG_27_FIX_SUMMARY.md
docs/BUG_27_VALIDATION_REPORT.md
```

**Why:**
- Persistence across reboots (not ephemeral like `/tmp`)
- Version controlled with git
- Follows existing project convention (BUG_24, BUG_25, BUG_26, BUG_28)
- Discoverable by team members

### 2. Test Scripts
**Location:** `tests/test-*.sh`

**Naming Convention:**
- Unit tests: `tests/test-<component>-<feature>.sh`
- Integration tests: `tests/integration-test-<system>.sh`
- Validation tests: `tests/test-<bug-fix>-validation.sh`

**Examples:**
```
tests/test-product-owner-decision-fix.sh
tests/test-agent-lifecycle.sh
tests/integration-test-cfn-loop.sh
```

**Why:**
- Persistent test suite
- Version controlled
- Located with other project tests
- Executable bit preserved

### 3. Feature Documentation
**Location:** `docs/` (root level)

**Naming Convention:**
- Feature docs: `docs/FEATURE_NAME.md`
- Architecture: `docs/ARCHITECTURE_*.md`
- Process docs: `docs/PROCESS_*.md`

**Examples:**
```
docs/AGENT_LIFECYCLE_UPDATE.md
docs/CONTEXT_VALIDATION_FRAMEWORK.md
docs/PARAMETER_STANDARDS.md
```

### 4. Implementation Reports
**Location:** `readme/` or `docs/`

**Naming Convention:**
- Implementation: `readme/IMPLEMENTATION_PHASE_#.md`
- Status reports: `docs/STATUS_*.md`

**Examples:**
```
readme/IMPLEMENTATION_PHASE_1_2_3_COMPLETE.md
docs/STATUS_CFN_LOOP_ROBUSTNESS.md
```

### 5. Temporary Test Data (ACCEPTABLE)
**Location:** `/tmp/`

**Use Cases:**
- Test fixtures during test execution
- Ephemeral output files for validation
- Scratch space for benchmarks
- Files that should NOT persist

**Examples:**
```
/tmp/test-redis-key-12345.json
/tmp/benchmark-output-$(date +%s).log
/tmp/validation-scratch-space/
```

**Why:**
- Automatic cleanup on reboot
- No pollution of version control
- Appropriate for truly temporary data

### 6. Planning Documents
**Location:** `planning/`

**Naming Convention:**
- Epic configs: `planning/<epic-name>/<epic-name>-epic.json`
- Phase plans: `planning/<epic-name>/phase-<id>-plan.md`
- Results: `planning/<epic-name>/results/`

**Examples:**
```
planning/cfn-testing/cfn-testing-epic.json
planning/cfn-loop-fixes/phase-1-plan.md
planning/cfn-loop-fixes/results/PHASE_1_RESULTS.md
```

## Anti-Patterns

### ❌ DO NOT Use `/tmp` for:
- Bug investigation reports
- Fix documentation
- Test scripts (non-ephemeral)
- Feature documentation
- Implementation summaries
- Validation reports

### ❌ DO NOT Use Project Root for:
- Test outputs
- Temporary files
- Agent scratch work
- Generated artifacts

### ❌ DO NOT Create New Top-Level Directories Without Discussion:
- Stick to existing conventions: `docs/`, `tests/`, `planning/`, `readme/`
- Avoid: `output/`, `results/`, `reports/`, `artifacts/`

## Agent Prompt Guidelines

When instructing agents to create deliverables, use these patterns:

**Investigation Agent:**
```markdown
Document findings in `docs/BUG_#_DESCRIPTION.md`
```

**Implementation Agent:**
```markdown
Deliverables:
- Modified source files (in place)
- Test script at `tests/test-<feature>.sh`
- Summary at `docs/BUG_#_FIX_SUMMARY.md`
```

**Validation Agent:**
```markdown
Create validation report at `docs/BUG_#_VALIDATION_REPORT.md`
```

**Test Agent:**
```markdown
Create test script at `tests/test-<component>.sh`
Use `/tmp/` for temporary test fixtures only
```

## Migration from `/tmp`

If an agent has already created files in `/tmp/`, move them:

```bash
# Investigation docs
mv /tmp/<investigation>.md docs/BUG_#_DESCRIPTION.md

# Fix summaries
mv /tmp/<fix-summary>.md docs/BUG_#_FIX_SUMMARY.md

# Test scripts
mv /tmp/test-*.sh tests/
chmod +x tests/test-*.sh

# Validation reports
mv /tmp/<validation>.md docs/BUG_#_VALIDATION_REPORT.md
```

## Version Control Integration

All non-temporary deliverables should be:
1. Created in version-controlled directories
2. Committed with meaningful commit messages
3. Documented in project tracking (if applicable)

**Example commit message:**
```
fix(product-owner): Add fallback text parsing for decisions

- Investigation: docs/BUG_27_PRODUCT_OWNER_DECISION_PARSING.md
- Fix: .claude/agents/product-owner.md, orchestrate-cfn-loop.sh
- Tests: tests/test-product-owner-decision-fix.sh
- Summary: docs/BUG_27_FIX_SUMMARY.md
- Validation: docs/BUG_27_VALIDATION_REPORT.md

Fixes #27
```

## Project-Specific Conventions

### Bug Numbering
- Sequential starting from 1
- Referenced in all related files
- Format: `BUG_#` not `bug-#` or `bug#`

### Test Naming
- Prefix: `test-` not `test_` or `Test`
- Use hyphens: `test-agent-lifecycle.sh` not `test_agent_lifecycle.sh`

### Documentation Format
- Markdown (`.md`)
- UPPERCASE for major docs: `AGENT_LIFECYCLE_UPDATE.md`
- Lowercase for minor docs: `architecture-notes.md`

## Rationale

**Persistence:**
- `/tmp` files lost on reboot
- Project directories are permanent

**Version Control:**
- Team can track changes
- History preserved
- Rollback capability

**Discoverability:**
- Consistent locations
- Predictable naming
- Easy search/grep

**Collaboration:**
- Other team members find work
- Prevents duplicate effort
- Enables review process

## References

- Existing bug reports: `docs/BUG_*.md`
- Test suite: `tests/`
- Planning structure: `planning/`
- Documentation: `readme/`, `docs/`
