---
name: cfn-product-owner-decision
description: "Strategic decision-making for CFN Loop progression with robust parsing. Use when evaluating validator consensus and determining PROCEED/ITERATE/ABORT outcomes."
version: 2.0.0
tags: [cfn-loop, decision-making, product-owner, typescript, consensus]
status: production
---

# Product Owner Decision Skill

**Version:** 2.0.0
**Purpose:** Strategic decision-making for CFN Loop progression

---

## VERIFIED STATUS (read this first)

**In Task Mode (`/cfn-loop-task`), the `product-owner` AGENT makes the decision.** Spawn it via the Task tool with the consensus numbers, deliverable paths, and tech-debt ledger; it returns PROCEED/ITERATE/ABORT directly in its output. No script is required.

**Verified on disk in this directory:**
- `parse-decision.sh` (legacy bash parser)
- `validate-deliverables.sh`
- `test-backlog-integration.sh`

**Missing on disk (do NOT invoke; referenced sections below are ASPIRATIONAL only):**
- `execute-decision.sh`
- `src/decision-parser.ts`, `src/index.ts`, `dist/cli/parse-decision-cli.js`

**Consolidated elsewhere (these three were folded into parent skills; use the new paths):**
- `.claude/skills/cfn-task-planning/lib/audit/` (was `cfn-task-audit`)
- `.claude/skills/cfn-project-management/lib/backlog/` (was `cfn-backlog-management`)
- `.claude/skills/cfn-loop-orchestration-v2/lib/validation/` (was `cfn-loop-validation`)

---

## Overview

Provides autonomous Product Owner decision execution with:
- **TypeScript + Bash hybrid approach**
- **Robust output parsing** (multiple fallback patterns)
- **Decision validation** (ensures PROCEED/ITERATE/ABORT detection)
- **Consensus on vapor detection** (prevents false completion claims)
- **Audit trail integration** (historical decision analysis)
- **Redis coordination** (orchestrator-controlled)

**Key Principle:** Parse Product Owner agent output, validate deliverables, signal orchestrator.

---

## Architecture

### Skill Components (verified on disk)

```
.claude/skills/cfn-loop-orchestration-v2/lib/decision/
├── SKILL.md                    # This file
├── parse-decision.sh           # Legacy bash parser (exists, verified)
├── validate-deliverables.sh    # Bash deliverable validator (exists, verified)
└── test-backlog-integration.sh # Test script (exists, verified)
```

### Decision Flow (Task Mode)

```
1. Coordinator -> Spawn product-owner agent (Task tool) with:
   consensus score, threshold, iteration/max, deliverable paths,
   tech-debt ledger line
2. product-owner agent -> Returns decision directly in output
   (PROCEED/ITERATE/ABORT with reasoning)
3. Coordinator -> Acts on the decision; no Redis, no scripts
```

---

## Usage

### Task Mode (primary, current)

The **product-owner AGENT makes the decision in Task Mode.** Spawn it with the Task tool; it returns its decision directly in its final output. Do not call any script.

### Legacy bash parser (verified on disk)

If you must mechanically parse a captured product-owner output file:

```bash
$HOME/.claude/skills/cfn-loop-orchestration-v2/lib/decision/parse-decision.sh <output-file>
```

There is no `execute-decision.sh` and no TypeScript CLI on disk; do not invoke them.

---

## Decision Logic (GOAP Framework)

### PROCEED
```
Consensus >= Threshold
AND Deliverables exist (for implementation tasks)
AND Iteration <= Max
AND No consensus on vapor detected
```

### ITERATE
```
Consensus < Threshold
AND Iteration < Max

OR: Consensus >= Threshold BUT consensus on vapor detected
```

### ABORT
```
Iteration >= Max
OR Unrecoverable failure
OR Critical issue detected
```

---

## Output Parsing

**ASPIRATIONAL SECTION: describes a TypeScript parser (`src/decision-parser.ts`) that is missing on disk. Kept as a design reference only. Use the product-owner agent's direct output, or `parse-decision.sh`, instead.**

### Pattern Matching (Robust Fallbacks)

The TypeScript parser implements multiple pattern matching strategies:

1. **Explicit Label:** `Decision: PROCEED` (case-insensitive)
2. **Standalone Keyword:** First line starting with decision (case-insensitive)
3. **Parentheses:** `(PROCEED)` anywhere in text
4. **JSON Format:** `{"decision": "PROCEED"}`
5. **First Keyword:** First occurrence of `PROCEED|ITERATE|ABORT`

**Example:**
```typescript
// All these formats are parsed correctly:
"Decision: PROCEED"              // Pattern 1
"PROCEED with deployment"        // Pattern 2
"My recommendation is (PROCEED)" // Pattern 3
'{"decision": "PROCEED"}'        // Pattern 4
"We should proceed..."           // Pattern 5 (case-insensitive)
```

### Confidence Extraction

Supports multiple formats:
```typescript
"Confidence: 0.95"        // Decimal
"Confidence: 95%"         // Percentage
'{"confidence": 0.92}'    // JSON
```

Clamped to 0.0-1.0 range. Default: 0.75

### Reasoning Extraction

Searches for:
- `Reasoning: ...`
- `Because: ...`
- `Explanation: ...`
- JSON `reasoning` field
- Paragraph after decision

### Deliverable Extraction

Parses bulleted lists:
```
Deliverables:
- Feature A
- Feature B
* Feature C
• Feature D
```

Also supports JSON arrays:
```json
{"deliverables": ["Feature A", "Feature B"]}
```

---

## Consensus on Vapor Detection

### What is "Consensus on Vapor"?

When agents agree quality threshold is met but **no actual code was created**.

Example: "Decision: PROCEED - all validators agreed" (but zero files changed)

### Detection

The parser checks:

1. **Task requires implementation?**
   - Keywords: `create|build|implement|generate|write|add|code|file|component|module|test`

2. **Actual files changed in git?**
   - Executes: `git status --short | grep -E "^(A|M|\?\?)" | wc -l`
   - If count = 0 AND deliverables claimed → **VAPOR**

3. **Response:**
   - Strict mode: Override PROCEED → ITERATE
   - Non-strict mode: Warn in validation errors

### Example

```
Input:  "Decision: PROCEED - Great planning!"
Task:   "Create TypeScript decision parser"
Git:    No files changed
Result: Decision overridden from PROCEED → ITERATE
Reason: "No files created despite implementation task"
```

---

## Audit Trail Integration

**The former `cfn-task-audit` skill was folded into `.claude/skills/cfn-task-planning/lib/audit/`. `get-audit-data.sh` exists there; the wiring described below is a design reference and is not called automatically.**

### Audit Data Retrieval

The skill retrieves historical data from `.claude/skills/cfn-task-planning/lib/audit/`:

```bash
AUDIT_DATA=$($HOME/.claude/skills/cfn-task-planning/lib/audit/get-audit-data.sh \
  --task-id "$TASK_ID" \
  --mode combined \
  --format json)
```

### Extracted Insights

Product Owner receives:

- **Previous Decisions:** Earlier POD outcomes
- **Agent Performance:** Top-performing teams from history
- **Repeating Concerns:** Patterns in reviewer/tester feedback
- **Audit Records:** Full history count

### Impact

Product Owner can:
- Detect repeating issues (systematic problems)
- Recommend agents based on past performance
- Recognize when consensus is justified (strong history)
- Escalate if warnings repeat (e.g., security)

---

## Validation Rules

### Decision-Specific

| Decision | Requirements | Auto-Correction |
|----------|--------------|-----------------|
| **PROCEED** | Confidence ≥ 0.6, Deliverables verified | Vapor → ITERATE |
| **ITERATE** | Must provide reasoning for improvements | Warn if missing |
| **ABORT** | Confidence < 0.5 (indicates critical issue) | Warn if high confidence |

### Cross-Cutting

- Invalid confidence (< 0 or > 1): Clamped
- Empty output: Throws error
- Malformed output: Pattern fallbacks applied
- No decision found: Strict mode throws, non-strict defaults to ITERATE

---

## Return Value

**ASPIRATIONAL SECTION: the bash wrapper (`execute-decision.sh`), TypeScript parser, and CLI below are missing on disk. Kept as a design reference only. Everything from here through "Performance" describes the missing implementations.**

### Bash (JSON)

```json
{
  "decision": "PROCEED",
  "reasoning": "Quality threshold exceeded",
  "confidence": 0.93,
  "iteration": 2,
  "consensus": 0.92,
  "threshold": 0.90,
  "timestamp": 1634567890,
  "audit_analysis": "Previous iterations showed improvement",
  "agent_performance_observations": "Team performed consistently",
  "audit_records_analyzed": 25,
  "audit_informed": true
}
```

### TypeScript (Structured)

```typescript
interface ParsedDecision {
  decision: 'PROCEED' | 'ITERATE' | 'ABORT';
  reasoning: string;
  deliverables: string[];
  confidence: number;
  validationErrors: string[];
  auditAnalysis?: string;
  agentPerformanceObservations?: string;
  raw: {
    fullOutput: string;
    decisionLine?: string;
  };
}
```

### CLI (Text or JSON)

**Text Format:**
```
Decision: PROCEED
Confidence: 92.5%
Reasoning: All validation gates passed
Deliverables: Module A, Module B
```

**JSON Format:**
```json
{
  "success": true,
  "decision": "PROCEED",
  "confidence": 0.925,
  "reasoning": "All validation gates passed",
  "deliverables": ["Module A", "Module B"],
  "validationErrors": []
}
```

---

## Error Handling

### Bash (execute-decision.sh)

```bash
# Validation failure
❌ ERROR: Could not parse decision from Product Owner output
Expected formats:
  - Decision: PROCEED|ITERATE|ABORT
  - Standalone keyword
  - JSON format

# File error
❌ ERROR: Product Owner output file missing or empty

# Timeout
❌ ERROR: Product Owner timed out after 300s
```

### TypeScript (DecisionParser)

```typescript
throw new DecisionParserError(
  'Could not extract decision from Product Owner output',
  'NO_DECISION_FOUND',
  { availablePatterns: [...], hint: '...' }
);
```

### CLI (parse-decision)

```bash
# Exit code mapping
0 - PROCEED
1 - ITERATE
2 - ABORT
3 - Parse error (malformed input, missing decision, etc.)

# Error output
Error: Could not parse decision (--json for details)
Error Code: NO_DECISION_FOUND
```

---

## Testing

### Unit Tests

```bash
# TypeScript parser tests (90%+ coverage)
npm test -- tests/unit/cfn-loop/product-owner/decision-parser.test.ts

# CLI tests
npm test -- tests/unit/cli/parse-decision-cli.test.ts
```

### Test Coverage

- **Decision Extraction:** All 5 pattern types
- **Confidence Parsing:** Decimal, percentage, JSON
- **Reasoning Extraction:** 4 different formats
- **Deliverable Extraction:** Bullets, JSON
- **Validation:** Type-specific rules
- **Vapor Detection:** Implementation detection, git status
- **Error Handling:** Strict/non-strict modes
- **CLI:** Arguments, formatting, exit codes

### Integration Tests

```bash
# Test with real Product Owner output
echo "Decision: PROCEED
Reasoning: All tests pass.
Deliverables:
- Feature A
- Feature B
Confidence: 0.92" | npx claude-flow-novice parse-decision --json
```

---

## Migration from Bash (v1.x)

### Backward Compatibility

The bash script (`execute-decision.sh`) **still works unchanged**.

Existing orchestrators continue to use bash without modification.

### Opt-In TypeScript Usage

To use TypeScript parsing in orchestrator:

```bash
# Historical (bash): execute-decision.sh was never implemented in this directory.
# Use parse-decision.sh, or the product-owner agent in Task Mode.

# New (TypeScript): Available if needed
npx claude-flow-novice parse-decision --input output.txt --json
```

### New Features (TypeScript Only)

- **Consensus on Vapor Detection:** Automatic override PROCEED → ITERATE
- **Audit Trail Integration:** Historical decision analysis
- **Multiple Output Formats:** Text and JSON
- **CLI Flexibility:** Programmatic and shell integration
- **Better Error Context:** Detailed error codes and suggestions

---

## Performance

### Parsing

- **Bash:** ~50ms per parse (regex-heavy)
- **TypeScript:** ~10ms per parse (optimized)
- **CLI (TypeScript):** ~200ms (includes Node startup)

For orchestrator use (bash script), negligible impact on loop timing.

For high-volume parsing, use TypeScript directly.

### Memory

- **Bash:** ~5MB process
- **TypeScript:** ~40MB Node process (startup cost)
- **Shared:** Output analyzed once, results reused

---

## Examples

### Example 1: Simple PROCEED

Input:
```
Decision: PROCEED

The quality threshold has been exceeded at 0.92 (threshold: 0.90).
All validators provided positive feedback.

Confidence: 0.92
```

Output:
```json
{
  "decision": "PROCEED",
  "confidence": 0.92,
  "reasoning": "The quality threshold has been exceeded...",
  "deliverables": [],
  "validationErrors": [],
  "raw": { "decisionLine": "Decision: PROCEED" }
}
```

Exit Code: 0

### Example 2: ITERATE with Warnings

Input:
```
Decision: ITERATE

Reasoning: Security concerns raised by validator.
Test coverage is 85% (need 90%).

Confidence: 0.65
```

Output:
```json
{
  "decision": "ITERATE",
  "confidence": 0.65,
  "reasoning": "Security concerns raised...",
  "deliverables": [],
  "validationErrors": [
    "ITERATE decision should have lower confidence (<0.5)"
  ],
  "raw": { "decisionLine": "Decision: ITERATE" }
}
```

Exit Code: 1

### Example 3: Vapor Detection

Input:
```
Decision: PROCEED
Reasoning: Great planning session!
Deliverables: Comprehensive design documentation

Confidence: 0.85
```

Task Context: `Create TypeScript decision parser module`
Git Status: No files changed

Output:
```json
{
  "decision": "ITERATE",
  "confidence": 0.70,
  "reasoning": "Override PROCEED → ITERATE: No files created despite implementation task",
  "deliverables": [],
  "validationErrors": [
    "No files created despite implementation task - consensus on vapor detected"
  ]
}
```

Exit Code: 1 (overridden)

---

## Troubleshooting

### Decision Not Detected

**Symptom:** `ERROR: Could not parse decision`

**Solution:**
- Check output contains exact keyword: PROCEED, ITERATE, or ABORT
- Verify keyword not inside code block (triple backticks)
- Try non-strict mode: `--no-strict`

### Low Confidence Warnings

**Symptom:** Validation warns about low confidence

**Solution:**
- PROCEED should have confidence ≥ 0.6 (indicates certainty)
- ABORT should have confidence < 0.5 (indicates critical issue)
- Review Product Owner reasoning for concerns

### Vapor Detection False Positives

**Symptom:** PROCEED incorrectly overridden to ITERATE

**Solution:**
- Ensure task description includes implementation keywords
- Check git status reflects actual file changes
- Use `--task-context` CLI option to specify task type

### CLI Timeout

**Symptom:** CLI hangs when reading stdin

**Solution:**
- Pipe input: `cat file | npx claude-flow-novice parse-decision`
- Use file input: `npx claude-flow-novice parse-decision -i file.txt`
- Increase timeout via environment: `STDIN_TIMEOUT=10000` (ms)

---

## Related Skills

The three skills previously listed here were consolidated into parent skills: `cfn-task-audit` into `.claude/skills/cfn-task-planning/lib/audit/`, `cfn-backlog-management` into `.claude/skills/cfn-project-management/lib/backlog/`, and `cfn-loop-validation` into `.claude/skills/cfn-loop-orchestration-v2/lib/validation/SKILL.md` (CLI mode only).

---

## References

- **CFN Loop Architecture:** `docs/CFN_LOOP_ARCHITECTURE.md`
- **Success Criteria:** `docs/guides/SUCCESS_CRITERIA_EXAMPLES.md`
- **Test-Driven Gates:** `docs/guides/TEST_DRIVEN_CFN_LOOP_GUIDE.md`
- **Orchestrator:** `./.claude/skills/cfn-loop-orchestration-v2/cli/orchestrate.sh`
