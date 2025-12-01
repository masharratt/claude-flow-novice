# Conversation Request Extraction

**Purpose:** User request extraction from `.codex/sessions` for decomposition engine training

---

## Files

### 1. USER_REQUESTS_ALL_PROJECTS.md (22KB)
**Complete extraction across all 4 projects**

- 27 conversations analyzed
- 121 substantial user requests
- Projects: claude-flow-novice (81), ourstories-v2 (36), automated-agency (3), NSC (1)
- Date range: 2025-11-06 to 2025-11-24

### 2. CROSS_PROJECT_REQUEST_ANALYSIS.md (6.4KB)
**Cross-project patterns and insights**

- Request complexity analysis (simple/medium/complex)
- Common themes: Diagnostic (30%), Implementation (25%), Verification (20%)
- Decomposition strategies by pattern type
- Training recommendations for RuVector

### 3. CONVERSATION_JSONL_FORMAT_ANALYSIS.md (4.3KB)
**Technical documentation of extraction methodology**

- JSONL format structure
- Extraction patterns using `event_msg.payload.message`
- How to find actual user requests vs IDE context
- Future extraction reference

### 4. USER_REQUESTS_ACTUAL_EXTRACTION.md (18KB)
**claude-flow-novice only (original extraction)**

- 20 conversations
- 103 requests (before cross-project expansion)

---

## Quick Stats

| Project | Conversations | Requests | Avg per Conv |
|---------|--------------|----------|--------------|
| claude-flow-novice | 20 | 81 | 4.05 |
| ourstories-v2 | 5 | 36 | 7.20 |
| automated-agency | 1 | 3 | 3.00 |
| NSC | 1 | 1 | 1.00 |
| **TOTAL** | **27** | **121** | **4.48** |

---

## Usage for Decomposition Engine

Feed `USER_REQUESTS_ALL_PROJECTS.md` into:
- `planning/DECOMPOSITION_SWARM_RUVECTOR_IMPLEMENTATION_PLAN.md`

For pattern analysis, reference:
- `CROSS_PROJECT_REQUEST_ANALYSIS.md`

For extraction methodology:
- `CONVERSATION_JSONL_FORMAT_ANALYSIS.md`

---

## Key Patterns Identified

**Iterative Debugging:**
```
read this doc and help us diagnose
can you run it and diagnose?
keep iterating until you find the root cause
```

**Delegation Verification:**
```
verify these claims
the team claims its now fully integrated. Verify this
```

**Architecture Decisions:**
```
does option 2 negate the need for option 1?
would trigger.dev solve a lot of the problems?
```

---

**Generated:** 2025-11-29 UTC
