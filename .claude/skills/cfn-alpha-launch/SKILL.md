---
name: cfn-alpha-launch
description: "MUST BE USED before any alpha or production release. Do not deploy without passing this check. Alpha readiness analysis plus fix execution: scores 8 readiness areas in parallel, delegates fixes to cfn-parallel-execute. Use when preparing to ship."
version: 1.7.0
tags: [alpha, launch, readiness, gap-analysis, tdd, parallel, supabase, contract, consistency, scoring, regression]
status: production
---

# CFN Alpha Launch

## Overview

Analyzes alpha readiness gaps and executes priority fixes using parallel subagents with TDD protocols. Features:
- **Explicit scoring formulas** - Consistent, documented readiness calculation
- **Regression detection** - Tracks score changes between runs
- **Auto-archive** - Previous fix-list.md preserved with timestamps
- **Cold start analysis** - Evaluates current state, ignores previous reports

## Usage

### Phase 1: Readiness Analysis

```bash
/cfn-alpha-launch:analyze
```

Spawns 8 agents in parallel to analyze:
- **Test readiness**: Test coverage, failing tests, type safety, build
- **Frontend readiness**: UI functionality, UX readiness, performance
- **Backend readiness**: API functionality, data integrity, business logic
- **Security readiness**: Auth, RLS, secrets, CORS
- **Architect readiness**: Scalability, technical debt, data model
- **Supabase readiness**: Database, storage, real-time, edge functions
- **Contract readiness**: API contracts, GraphQL schema, types
- **Consistency readiness**: Naming, conventions, code patterns

**Output:** After analysis, creates `docs/alpha/fix-list.md` with prioritized fixes.

### Phase 2a: Manifest Emission (optional, routes through voting)

```bash
/cfn-alpha-launch:manifest
```

Converts `docs/alpha/fix-list.md` into a `cfn-vote-implement`-compatible JSON manifest at `<project-root>/.cfn-cache/manifests/cfn-review-alpha-<ts>.json`. Use when you want 3-agent consensus voting on findings before implementation, instead of direct parallel-execute.

**Manifest schema:** matches `cfn-dry-review` output — see `cfn-vote-implement` SKILL.md.

**Field mapping from fix-list.md:**
| Source | Manifest field |
|--------|----------------|
| `## Critical` section | `impact: high`, `priority: critical` |
| `## High Priority` section | `impact: high`, `priority: high` |
| `## Medium Priority` section | `impact: medium`, `priority: medium` |
| `- Agent: <type>` | `category: <type>` |
| `- File: <path>` | `files: ["<path>"]` |
| Item text | `title` + `description` |

Then run:
```bash
/cfn-vote-implement latest
```

### Phase 2b: Fix Execution (direct)

```bash
/cfn-alpha-launch:fix [--agents=N]
```

Delegates to `cfn-parallel-execute` for parallel task execution.

**Pipeline maintenance**:
- Spawns N agents (default: 3) to work through fix-list.md
- When 1 agent finishes, spawns 1 replacement
- **CRITICAL**: After each spawn, STOP and wait for exit notifications
- Exit notifications drive execution - no polling, preserves context

See `cfn-parallel-execute` documentation for full execution protocol.

## Mode: Analysis (cfn-alpha-launch:analyze)

### Parallel Agent Spawn

Main chat spawns 8 analysis agents simultaneously:

```typescript
// Agent 1: Test Readiness
Task(subagent_type="tester", prompt="Analyze test readiness...", run_in_background=false)

// Agent 2: Frontend Readiness
Task(subagent_type="react-frontend-engineer", prompt="Analyze frontend readiness...", run_in_background=false)

// Agent 3: Backend Readiness
Task(subagent_type="backend-developer", prompt="Analyze backend readiness...", run_in_background=false)

// Agent 4: Security Readiness
Task(subagent_type="security-specialist", prompt="Analyze security readiness...", run_in_background=false)

// Agent 5: Architect Readiness
Task(subagent_type="system-architect", prompt="Analyze architectural readiness...", run_in_background=false)

// Agent 6: Supabase Readiness
Task(subagent_type="supabase-specialist", prompt="Analyze Supabase readiness...", run_in_background=false)

// Agent 7: Contract Readiness
Task(subagent_type="code-standards-reviewer", prompt="Analyze contract readiness...", run_in_background=false)

// Agent 8: Consistency Readiness
Task(subagent_type="code-standards-reviewer", prompt="Analyze consistency readiness...", run_in_background=false)
```

### Analysis Outputs

Each agent writes to `docs/alpha/readiness-[area].md` with gaps prioritized.

**After all agents complete**, create `docs/alpha/fix-list.md`:

```markdown
# Alpha Launch Fix List

## Critical (Blockers)
1. [gap description] - Agent: [type] - File: [location]
2. ...

## High Priority (Before Launch)
3. [gap description] - Agent: [type] - File: [location]
4. ...

## Medium Priority (Post-Launch)
5. [gap description] - Agent: [type] - File: [location]
6. ...
```

This fix-list is the source of truth for fix execution.

## Readiness Scoring

### Agent-Level Scoring

Each agent calculates readiness using a **deterministic formula**:

| Agent | Formula | Critical | High | Medium |
|-------|---------|----------|------|--------|
| **test** | `100 - (c×20 + h×10 + m×5)` | 20% | 10% | 5% |
| **frontend** | `100 - (c×15 + h×8 + m×4)` | 15% | 8% | 4% |
| **backend** | `100 - (c×20 + h×10 + m×5)` | 20% | 10% | 5% |
| **security** | `100 - (c×25 + h×10 + m×5)` | 25% | 10% | 5% |
| **architect** | `100 - (c×15 + h×8 + m×4)` | 15% | 8% | 4% |
| **supabase** | `100 - (c×15 + h×8 + m×4)` | 15% | 8% | 4% |
| **contract** | `100 - (c×15 + h×8 + m×4)` | 15% | 8% | 4% |
| **consistency** | `100 - (c×10 + h×5 + m×2)` | 10% | 5% | 2% |

**Key**: `c` = critical count, `h` = high count, `m` = medium count

**Example** (test agent):
- 2 critical issues (broken test suite, build failure) = 2 × 20 = 40%
- 3 high issues (failing tests, type errors) = 3 × 10 = 30%
- Final score: 100 - 40 - 30 = **30%**

### Overall Readiness Score

**Overall = Average of all 8 agent scores**

```
overall = (test + frontend + backend + security + architect + supabase + contract + consistency) / 8
```

**Example**:
```
test: 35%, frontend: 68%, backend: 45%, security: 70%
architect: 72%, supabase: 68%, contract: 90%, consistency: 80%

overall = (35 + 68 + 45 + 70 + 72 + 68 + 90 + 80) / 8 = 66%
```

### Regression Detection

**Automatic regression tracking**:

1. **Before analysis**: Previous fix-list.md is archived to `fix-list-YYYYMMDD-HHMMSS.md`
2. **Score extracted**: Previous overall score stored in `.readiness-scores-history.json.tmp`
3. **After analysis**: New score compared to previous
4. **Regression threshold**: Decrease of ≥10% triggers warning

**Example regression**:
```
Previous: 70% on 2026-01-17
Current: 55% on 2026-01-18
Change: -15% (REGRESSION DETECTED)
```

Regression warnings appear in fix-list.md header:
```markdown
**Overall Readiness**: 55% (Target: 85%+)
**Regression**: DETECTED (Previous: 70% on 2026-01-17, Δ: -15%)
```

### Fix List Archive

Each analysis run archives the previous fix-list:

```bash
docs/alpha/fix-list.md                    # Current
docs/alpha/fix-list-20260117-143022.md    # Previous run
docs/alpha/fix-list-20260116-091545.md    # Two runs ago
```

**Benefits**:
- Historical audit trail
- Can compare fix lists across runs
- Prevents accidental data loss
- Supports git-based diffing

## Mode: Fix Execution (cfn-alpha-launch:fix)

**Delegates to `cfn-parallel-execute`** for parallel task execution.

After analysis creates `docs/alpha/fix-list.md`, fix mode:
1. Validates fix-list.md exists
2. Delegates to `cfn-parallel-execute --tasks=fix-list.md --agents=N`
3. Follows pipeline maintenance protocol (exit notifications drive execution)

**See `cfn-parallel-execute` skill documentation for:**
- Agent lifecycle management
- TDD protocol
- Pipeline maintenance (STOP/wait pattern)
- Task assignment strategy

## Task Assignment Strategy

**Handled by `cfn-parallel-execute`.**

Tasks in fix-list.md must follow this format:
```markdown
## Critical
1. Fix auth RLS - Agent: security-specialist - File: src/auth/users.ts

## High Priority
2. Add login test - Agent: tester - File: src/auth/login.test.ts
3. Type check exports - Agent: typescript-specialist - File: src/api/index.ts
```

**See `cfn-parallel-execute` for:**
- Small task definition
- Priority order
- Agent assignment

## Output Files

| File | Purpose |
|------|---------|
| `docs/alpha/readiness-test.md` | Test coverage, type safety, build |
| `docs/alpha/readiness-frontend.md` | UI functionality, UX readiness |
| `docs/alpha/readiness-backend.md` | API functionality, data integrity |
| `docs/alpha/readiness-security.md` | Auth, RLS, secrets, CORS |
| `docs/alpha/readiness-architect.md` | System design, scalability, tech debt |
| `docs/alpha/readiness-supabase.md` | Database, storage, real-time, edge functions |
| `docs/alpha/readiness-contract.md` | API contracts, GraphQL schema, types |
| `docs/alpha/readiness-consistency.md` | Naming, conventions, code patterns |
| `docs/alpha/fix-list.md` | Prioritized list of required fixes |
| `<project-root>/.cfn-cache/manifests/cfn-review-alpha-<ts>.json` | cfn-vote-implement JSON manifest (emitted by `manifest` mode) |

## Configuration

### Agent Count

```bash
/cfn-alpha-launch:fix --agents=5  # Use 5 parallel agents (default: 3)
```

### Analysis Scope

By default, analysis is **cold start**:
- Ignores `docs/alpha/*` reports
- Ignores env/key rotation history
- Ignores monitoring setup status
- Evaluates current state only

## Example Session

### Phase 1: Analyze

```bash
/cfn-alpha-launch:analyze
```

Spawns 8 analysis agents in parallel, outputs:
- 8 readiness reports (test, frontend, backend, security, architect, supabase, contract, consistency)
- 1 prioritized fix-list.md

### Phase 2: Fix

```bash
/cfn-alpha-launch:fix
```

Delegates to `cfn-parallel-execute --tasks=fix-list.md --agents=3`

Follows pipeline maintenance protocol:
1. Spawns 3 agents for first 3 tasks
2. **STOP** - wait for exit notifications
3. When agent exits, spawn 1 replacement
4. **STOP** again - wait for next exit
5. Repeat until all fixes addressed

**See `cfn-parallel-execute` documentation for detailed execution protocol.**

## Readiness Criteria

### Test (Target: 90%+)
- All critical paths have test coverage
- Zero failing tests
- Zero type errors
- Production build passes
- CI/CD pipelines passing

### Frontend (Target: 85%+)
- All user-facing features working
- Critical user flows complete
- Frontend performance acceptable
- Responsive design working
- No broken links/views

### Backend (Target: 90%+)
- All API endpoints working
- Data integrity ensured
- Proper error handling
- API response times acceptable
- Critical business flows implemented

### Security (Target: 95%+)
- Auth implemented and tested
- RLS policies applied
- Secrets managed properly
- No hardcoded credentials
- Security scan passes
- CORS configured correctly

### Architect (Target: 85%+)
- System can handle alpha load
- No critical technical debt
- Data model sound for use cases
- External dependencies stable
- Monitoring coverage adequate

### Supabase (Target: 90%+)
- Database schema applied, migrations working
- Storage buckets created, policies configured
- Auth providers configured, email templates working
- Realtime channels configured, permissions set
- Edge functions deployed, environment variables set
- Connection pooling configured
- Automated backups enabled

### Contract (Target: 90%+)
- API contracts properly typed/documented
- GraphQL schema types match resolvers
- TypeScript exports consistent
- Input validation (Zod) matches contracts
- Response types match frontend expectations
- OpenAPI spec generated and current

### Consistency (Target: 85%+)
- Naming conventions followed consistently
- Similar problems solved similarly
- Import structure organized
- Error handling patterns consistent
- Type definitions organized and deduplicated
- File structure follows conventions

## Version History

### 1.7.0 (2026-05-17)
- **Manifest emission mode** - `--mode manifest` converts `fix-list.md` to `<project-root>/.cfn-cache/manifests/cfn-review-alpha-<ts>.json`
- **cfn-vote-implement integration** - manifest matches cfn-dry-review schema; findings can route through 3-agent voting
- **Shared converter** - `lib/fixlist-to-manifest.sh` parses Critical/High/Medium sections + Agent/File metadata

### 1.6.0 (2026-01-18)
- **Explicit scoring formulas** - Each agent uses documented scoring formula
- **Regression detection** - Tracks score changes between runs, warns on ≥10% decrease
- **Auto-archive** - Previous fix-list.md preserved with timestamp before each run
- **Overall score formula** - Average of 8 agent scores (documented)
- **Show calculation** - Agents must display their scoring math in reports

### 1.5.0 (2026-01-17)
- Delegates fix execution to cfn-parallel-execute
- Simplified skill - focus on analysis, delegate execution
- Cleaner separation of concerns

### 1.4.0 (2025-01-16)
- Added contract validator (API contracts, GraphQL schema, types)
- Added consistency checker (naming, conventions, code patterns)
- Expanded to 8 analysis agents total

### 1.3.0 (2025-01-16)
- Simplified: removed fix-log.md, added fix-list.md
- No status tracking in readiness reports
- Git history is audit trail

### 1.2.0 (2025-01-16)
- Added Supabase specialist (6 analysis agents total)

### 1.1.0 (2025-01-16)
- Expanded from 3 to 5 analysis agents
- Added frontend, backend, architect perspectives

### 1.0.0 (2025-01-16)
- Initial alpha launch skill
- Parallel analysis mode
- Background fix execution
- TDD protocol support
