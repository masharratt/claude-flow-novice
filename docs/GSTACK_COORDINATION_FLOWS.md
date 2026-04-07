# gstack Coordination Flows

## Complete Agent Orchestration Patterns

---

## Flow 1: Idea → Production (Complete Workflow)

```
User: "I have an idea for a SaaS product"
              ↓
/office-hours (YC Office Hours methodology)
  - Startup mode: 6 forcing questions
  - Builder mode: Design thinking brainstorm
  - Output: DESIGN.md
              ↓
User: "Let's build this"
              ↓
/plan-ceo-review (CEO strategy review)
  - Mode 1: SCOPE EXPANSION (dream big)
  - Mode 2: SELECTIVE EXPANSION (hold + cherry-pick)
  - Mode 3: HOLD SCOPE (maximum rigor)
  - Mode 4: SCOPE REDUCTION (strip essentials)
  - Sub-agent: Independent reviewer (fresh context)
  - Output: Strategy-locked plan
              ↓
/plan-eng-review (Eng architecture review)
  - Focus: Architecture, data flow, edge cases, tests
  - Sub-agent: Independent verification
  - Output: Execution plan locked
              ↓
/plan-design-review (Designer's critique)
  - Interactive: Rate each dimension 0-10
  - Output: Design improvements
              ↓
/design-html (Generate production code)
  - Input: Approved design + plan
  - Output: Production HTML/CSS (30KB overhead)
              ↓
[Developer makes functional changes]
              ↓
/ship (Create PR)
  - Fully automated
  - Steps: Merge base → Tests → Review → Version → Changelog → Commit → Push → Create PR
  - Sub-agent: Independent pre-landing reviewer
  - Output: PR URL
              ↓
/land-and-deploy (Merge → Deploy → Verify)
  - Release engineer persona
  - Pre-flight checks
  - Merge PR
  - Wait for CI/deploy
  - Canary verify production
  - Output: Production health verdict
              ↓
/document-release (Update all docs)
  - README, ARCHITECTURE, CONTRIBUTING, CLAUDE.md
  - CHANGELOG polish
  - TODOS cleanup
  - VERSION bump optional
  - Output: Docs synced to shipped code
              ↓
Production ✓
```

---

## Flow 2: /autoplan (Sequential Review Pipeline)

```
User: "auto review", "autoplan", "review this plan automatically"
              ↓
/autoplan (Auto-Review Pipeline Orchestrator)

  Reads: plan file from disk
  Loads: CEO review, design review, eng review SKILL.md templates

              ↓

  PHASE 1: CEO Review (subagent via Agent tool)
  ┌──────────────────────────────────────┐
  │ Run full CEO review logic from disk  │
  │ Apply 6 decision principles:         │
  │  1. Completeness                     │
  │  2. Boil lakes                       │
  │  3. Pragmatic                        │
  │  4. DRY                              │
  │  5. Explicit over clever             │
  │  6. Bias toward action               │
  │                                      │
  │ Decision classification:              │
  │ - Mechanical: auto-decide silently   │
  │ - Taste: auto-decide, surface later  │
  │ - User Challenge: never auto-decide  │
  │                                      │
  │ Conflict resolution (CEO phase):     │
  │ - P1 (completeness) dominates        │
  │ - P2 (boil lakes) dominates          │
  │                                      │
  │ Output: CEO-reviewed plan            │
  └──────────────────────────────────────┘
              ↓

  PHASE 2: Design Review (subagent via Agent tool)
  ┌──────────────────────────────────────┐
  │ Run full design review logic         │
  │ Rate each design dimension 0-10      │
  │                                      │
  │ Decision classification:              │
  │ - Mechanical: auto-decide            │
  │ - Taste: surface at gate             │
  │ - User Challenge: surface at gate    │
  │                                      │
  │ Conflict resolution (Design phase):  │
  │ - P5 (explicit) dominates            │
  │ - P1 (completeness) dominates        │
  │                                      │
  │ Output: Design-approved plan         │
  └──────────────────────────────────────┘
              ↓

  PHASE 3: Eng Review (subagent via Agent tool)
  ┌──────────────────────────────────────┐
  │ Run full eng review logic            │
  │ Lock: Architecture, data flow,       │
  │       edge cases, test plan          │
  │                                      │
  │ Decision classification:              │
  │ - Mechanical: auto-decide            │
  │ - Taste: surface at gate             │
  │ - User Challenge: surface at gate    │
  │                                      │
  │ Conflict resolution (Eng phase):     │
  │ - P5 (explicit) dominates            │
  │ - P3 (pragmatic) dominates           │
  │                                      │
  │ Output: Eng-locked plan              │
  └──────────────────────────────────────┘
              ↓

  FINAL APPROVAL GATE
  ┌──────────────────────────────────────┐
  │ Display decision summary:             │
  │                                      │
  │ Mechanical decisions: (silent, not shown)
  │                                      │
  │ Taste Decisions:                     │
  │  - [Taste 1]: Auto decided as X      │
  │    Alternative: Y                    │
  │  - [Taste 2]: Auto decided as A      │
  │    Alternative: B                    │
  │                                      │
  │ User Challenges:                     │
  │  - Both models recommend: Change X   │
  │    User said: Keep X                 │
  │    Why: [reasoning]                  │
  │                                      │
  │ Ask user: Accept all? Or review?     │
  └──────────────────────────────────────┘
              ↓
        User decision
              ↓
  Fully reviewed plan ✓
```

---

## Flow 3: Pre-Landing Code Review (Specialist Dispatch)

```
User: "review this PR", "code review", "check my diff"
              ↓
/review (Pre-Landing PR Review)

  Analyze diff against base branch
              ↓

  Launch ALL subagents in parallel (one message, 4 Agent calls):

  ┌─────────────────────────────────┐
  │ SPECIALIST 1: SQL Safety        │
  │ - SQL injection patterns         │
  │ - Dynamic queries                │
  │ - Parameterized statements       │
  │ Output: SQL safety verdict       │
  └─────────────────────────────────┘

  ┌─────────────────────────────────┐
  │ SPECIALIST 2: LLM Trust Boundary│
  │ - LLM output handling            │
  │ - Injection vectors              │
  │ - Trust boundary violations      │
  │ Output: Trust boundary verdict   │
  └─────────────────────────────────┘

  ┌─────────────────────────────────┐
  │ SPECIALIST 3: Side Effects      │
  │ - Conditional state mutations    │
  │ - Error handling paths           │
  │ - Cleanup guarantees             │
  │ Output: Side effect verdict      │
  └─────────────────────────────────┘

  ┌─────────────────────────────────┐
  │ SPECIALIST 4: Pattern Analysis  │
  │ - Fresh context (doesn't see     │
  │   other specialists' reasoning)  │
  │ - N+1 queries                    │
  │ - Dead code                      │
  │ - Stale comments                 │
  │ Output: Pattern findings         │
  └─────────────────────────────────┘

  ┌─────────────────────────────────┐
  │ SPECIALIST 5: Independent       │
  │ - Fresh context                  │
  │ - No anchoring bias              │
  │ - Cross-functional review        │
  │ Output: Independent verdict      │
  └─────────────────────────────────┘

              ↓

  Consolidate findings:
  - ASK items (needs user judgment)
  - FIX items (auto-fixable, listed)
  - PASS (no issues)
              ↓

  Output: Structured review with PR readiness
```

---

## Flow 4: Bug → Fix → Verify (Systematic Debugging)

```
User: "This is broken", stack trace, "500 error", "why is this broken?"
              ↓
/investigate (Systematic Root Cause Analysis)

  PHASE 1: Investigate
  ├─ Reproduce the issue
  ├─ Gather context (logs, metrics, recent changes)
  ├─ Scope the blast radius
  └─ Collect evidence
              ↓

  PHASE 2: Analyze
  ├─ Compare before/after
  ├─ Identify patterns
  ├─ Rule out red herrings
  └─ Focus on likely causes
              ↓

  PHASE 3: Hypothesize
  ├─ Generate root cause candidates
  ├─ Rank by likelihood
  ├─ Design tests for each
  └─ Select most likely
              ↓

  PHASE 4: Implement
  ├─ Fix root cause
  ├─ Verify fix works
  ├─ Test edge cases
  └─ Prevent regression

  Freeze Integration: Scope edits to affected files
              ↓

  Tests pass ✓
              ↓

[Code ready for /ship]
```

---

## Flow 5: QA Testing (Test → Fix → Re-verify)

```
User: "QA", "test this site", "find bugs", "does this work?"
              ↓
/qa (Systematic QA with Fix Loop)

  TIER 1: Quick Mode
  ├─ Test critical paths only
  ├─ Log issues found
  ├─ Triage severity
  └─ Fix high/critical only
              ↓

  TIER 2: Standard Mode (default)
  ├─ Test all features
  ├─ Find bugs across severity
  ├─ Fix atomically (1 fix = 1 commit)
  ├─ Re-verify after each fix
  └─ Update health score
              ↓

  TIER 3: Exhaustive Mode
  ├─ Test edge cases
  ├─ Check responsive layouts
  ├─ Verify a11y
  ├─ Test interactions
  ├─ Fix all issues
  └─ Polish cosmetics
              ↓

  For each bug found:
  ┌──────────────────────────────┐
  │ Before screenshot            │
  │         ↓                    │
  │ Apply fix to source          │
  │         ↓                    │
  │ git commit -m "fix: ..."     │
  │         ↓                    │
  │ Rebuild/test                 │
  │         ↓                    │
  │ After screenshot             │
  │         ↓                    │
  │ Assert: [before] → [after]   │
  └──────────────────────────────┘
              ↓

  Output:
  - Before/after health scores
  - Fix evidence (screenshots)
  - Ship-readiness summary
```

Alternative: `/qa-only` (report only, no fixes)

---

## Flow 6: Shipping Pipeline (/ship → /land-and-deploy)

```
User: "ship it", "deploy", "push", "create a PR"
              ↓
/ship (Fully Automated Ship Workflow)

  STEP 1: Pre-flight
  ├─ Check not on base branch
  ├─ Stage uncommitted changes
  ├─ Review diff size
  └─ Check prior reviews (CEO, eng, design)
              ↓

  STEP 2: Merge Base Branch
  ├─ Detect base (main/master/primary)
  ├─ Rebase or merge
  ├─ Abort if conflicts
  └─ Pull latest
              ↓

  STEP 3: Run Tests
  ├─ Execute test suite
  ├─ Fail if new failures
  ├─ Continue on pre-existing
  └─ Generate coverage report
              ↓

  STEP 4: Review Diff
  ├─ Dispatch independent reviewer (subagent via Agent tool)
  ├─ Check for:
  │  - SQL safety
  │  - LLM trust boundaries
  │  - Side effects
  │  - Pattern issues
  └─ Ask user to fix ASK items
              ↓

  STEP 5: Version & Changelog
  ├─ Detect MICRO vs PATCH bump
  ├─ Update VERSION file
  ├─ Generate CHANGELOG from diff
  ├─ Polish voice
  └─ Commit
              ↓

  STEP 6: Push & Create PR
  ├─ git push origin HEAD
  ├─ gh pr create --...
  ├─ Set title/body
  ├─ Add labels
  └─ Output PR URL
              ↓

  Output: PR URL

  Philosophy: Non-interactive, fully automated ("DO IT")
  Only stop for: merge conflicts, test failures, ASK items, version choices
              ↓

User: "merge it", "land and deploy", "ship it to production"
              ↓
/land-and-deploy (Release Engineer Persona)

  STEP 1: Pre-flight
  ├─ Auth: gh auth status
  ├─ Find PR (auto or #123)
  ├─ Validate PR state
  ├─ Check readiness:
  │  - Reviews passed?
  │  - Tests passed?
  │  - Docs updated?
  └─ First-run: Show deploy infrastructure
              ↓

  STEP 2: Merge
  ├─ Detect merge method (squash/merge/rebase)
  ├─ Run merge
  ├─ Verify on main
  └─ Delete branch
              ↓

  STEP 3: Wait for Deploy
  ├─ Watch CI status
  ├─ Poll deploy workflow
  ├─ Timeout gracefully
  ├─ Alert on failure (offer revert)
  └─ Success: Proceed
              ↓

  STEP 4: Canary Verify
  ├─ Health check endpoint
  ├─ Check error rate
  ├─ Performance baseline
  ├─ Error logs scan
  └─ Alert on issues (offer revert)
              ↓

  Output:
  - "Deploy successful ✓"
  - Production health: Green
  - Rollback available if needed
```

---

## Flow 7: Design Review (Audit → Fix → Verify)

```
User: "audit the design", "visual QA", "design polish"
              ↓
/design-review (Designer's Eye Audit with Fix Loop)

  STEP 1: Audit Live Site
  ├─ Take baseline screenshot
  ├─ Check:
  │  - Spacing consistency
  │  - Typography hierarchy
  │  - Color usage
  │  - Alignment
  │  - Interactive states
  │  - Responsive layouts
  │  - AI slop patterns
  └─ Identify issues (visual not functional)
              ↓

  STEP 2: Fix & Re-verify Loop
  For each issue:
  ┌─────────────────────────────┐
  │ Before screenshot           │
  │         ↓                   │
  │ Identify fix location       │
  │         ↓                   │
  │ Edit CSS/HTML               │
  │         ↓                   │
  │ git commit -m "style: ..." │
  │         ↓                   │
  │ After screenshot            │
  │         ↓                   │
  │ Verify: issue resolved?     │
  └─────────────────────────────┘
              ↓

  STEP 3: Final Verification
  ├─ Compare before/after
  ├─ Check no regressions
  ├─ Verify on all breakpoints
  └─ Output: Design health improved
```

---

## Flow 8: Browser Daemon Persistence

```
User: "test the site", "open in browser"
              ↓
/browse (Headless Browser with Daemon)

  FIRST CALL (Cold Start):
  ├─ Check ~/.gstack/browse.json
  ├─ Not found → Start server
  ├─ Pick random port 10000-60000
  ├─ Spawn Bun server + Chromium
  ├─ Write state file (mode 0o600)
  ├─ ~3 seconds
  └─ Ready
              ↓

  State File (~/.gstack/browse.json):
  {
    "pid": 12345,
    "port": 34567,
    "token": "uuid-v4-bearer-auth",
    "startedAt": "...",
    "binaryVersion": "abc123"
  }
              ↓

  SERVER ARCHITECTURE:
  Claude Code (Bash)
       ↓ HTTP POST + Bearer token
  Bun Server (dispatcher)
       ↓ Chrome DevTools Protocol
  Chromium (persistent tabs, cookies, login)

              ↓

  SUBSEQUENT CALLS (Sub-second):
  User command 1: $B goto https://example.com
              ↓ HTTP POST /command
  Server dispatches to Chromium
              ↓ CDP
  Navigate to URL
              ↓ ~100-200ms
  Return page snapshot

  User command 2: $B click @e3
              ↓
  Resolve ref @e3 → Playwright Locator
  Click element
  Capture after state
              ↓
  Return result

  (Login from command 1 persists, cookies kept, tabs open)
              ↓

  30 MIN IDLE TIMEOUT:
  ├─ After 30 min no commands
  ├─ Server shuts down
  ├─ Remove state file
  ├─ Release port
  └─ Next /browse call: cold start again
```

---

## Flow 9: Security Audit (CSO Mode)

```
User: "security audit", "OWASP", "threat model", "pentest review"
              ↓
/cso (Chief Security Officer Audit)

  MODE 1: Daily Scan (zero-noise, 8/10 confidence gate)
  ├─ Secrets archaeology
  ├─ Dependency supply chain
  ├─ CI/CD pipeline security
  ├─ LLM/AI security
  ├─ High-confidence findings only
  └─ Output: Daily report
              ↓

  MODE 2: Comprehensive Monthly Deep Scan (2/10 bar)
  ├─ OWASP Top 10 coverage
  ├─ STRIDE threat modeling
  ├─ Full dependency audit
  ├─ Secrets+config audit
  ├─ All findings (even low confidence)
  └─ Output: Comprehensive report
              ↓

  For each finding:
  ┌──────────────────────────────┐
  │ Finding detected:            │
  │  "SQL injection in query.ts" │
  │         ↓                    │
  │ Dispatch verifier subagent   │
  │ (Agent tool, fresh context)  │
  │         ↓                    │
  │ Verify: True positive?       │
  │ Filter: False positive?      │
  │         ↓                    │
  │ Confirm: Real vulnerability  │
  └──────────────────────────────┘
              ↓

  Trend Tracking:
  - Compare against previous audits
  - Track fixes
  - Identify patterns
  └─ Output: Security posture graph
```

---

## Flow 10: Session Checkpointing

```
User: "checkpoint", "save progress", "resume", "where was I?"
              ↓
/checkpoint (Save Session State)

  Captures:
  ├─ Git branch + commit
  ├─ Uncommitted changes
  ├─ Decisions made
  ├─ PRs related to this work
  ├─ Issues/TODOs
  └─ Current phase
              ↓

  Saves to:
  ~/.gstack/projects/{slug}/checkpoint.json
  {
    "branch": "feature/x",
    "commit": "abc123",
    "uncommitted_files": [...],
    "phase": "testing",
    "decisions": [...],
    "remaining": [...],
    "timestamp": "..."
  }
              ↓

  Later: User switches workspaces, comes back
              ↓

  /checkpoint --resume
  ├─ Load checkpoint.json
  ├─ Check out branch
  ├─ Show uncommitted files
  ├─ Display previous decisions
  ├─ List remaining work
  └─ User picks up exactly where left off
```

---

## Flow 11: Proactive Skill Invocation

```
CLAUDE.md (Project Configuration):
---
## Skill routing

Key routing rules:
- Product ideas, "is this worth building" → /office-hours
- Bugs, errors, 500 errors → /investigate
- Ship, deploy → /ship
- QA, test → /qa
- Code review → /review
- Update docs → /document-release
[... more rules ...]
---
              ↓

When user says: "This is broken"
              ↓
  Preamble detects:
  ├─ PROACTIVE=true (enabled)
  ├─ HAS_ROUTING=yes (found routing rules)
  └─ ROUTING_DECLINED=false (not opted out)
              ↓

  Match user input: "broken" → "bugs, errors"
              ↓

  Auto-invoke: /investigate (no user typing "/investigate")
              ↓

If PROACTIVE=false:
  Instead suggest: "I think /investigate might help here — want me to run it?"
  Wait for user confirmation
```

---

## Pattern Summary

| Pattern | Mechanism | Example |
|---------|-----------|---------|
| Proactive Routing | CLAUDE.md dispatcher | User says "test this", auto-invokes /qa |
| Sub-Agent Dispatch | Agent tool + fresh context | /review spawns 4+ specialist subagents |
| Sequential Pipeline | Multi-skill handoff | /office-hours → /plan-ceo-review → /ship |
| Browser Daemon | Long-lived Chromium | /browse: 3s cold start, 100ms subsequent |
| Decision Automation | 6 principles + classification | /autoplan: mechanical/taste/user challenge |
| Hook Safety | PreToolUse hooks | /freeze blocks Edit outside directory |
| Config Detection | Read CLAUDE.md | /land-and-deploy auto-detects platform |
| Persistent State | .jsonl append-only | ~/gstack/projects/{slug}/learnings.jsonl |

---

## Agent Composition Examples

### Example 1: Complete /ship Invocation

```bash
# Prerequisites
git status                    # Uncommitted changes
git diff main...HEAD --stat   # Diff size check
[review status if available]  # Prior reviews

# /ship execution
/ship
  ├─ Merge main
  ├─ Run tests
  ├─ Run /review (subagent dispatch)
  │  └─ 4 specialist subagents in parallel
  ├─ Bump version (MICRO auto-choose)
  ├─ Update CHANGELOG
  ├─ Make commit
  ├─ Push origin
  └─ Create PR → Output URL

User now has PR URL ready for /land-and-deploy
```

### Example 2: Design System Creation

```bash
/design-consultation
  ├─ Understand product context
  ├─ Research design landscape
  ├─ Propose:
  │  ├─ Aesthetic direction
  │  ├─ Typography
  │  ├─ Color system
  │  ├─ Spacing scale
  │  └─ Component patterns
  ├─ Generate DESIGN.md
  └─ Output: Font + color preview pages

Later:

/design-html
  ├─ Read DESIGN.md
  ├─ Generate production HTML/CSS
  └─ Output: 30KB overhead, zero deps

Then:

/design-review (on live implementation)
  ├─ Audit visual consistency
  ├─ Fix spacing, hierarchy, interactions
  └─ Output: Design health improved
```

### Example 3: /autoplan Full Execution

```bash
/autoplan
  ├─ Load plan.md from disk
  ├─ Load 3 review SKILL.md templates
  │
  ├─ PHASE 1: CEO Review (subagent)
  │  ├─ Apply completeness principle
  │  ├─ Apply boil-lakes principle
  │  ├─ Surface taste decisions
  │  └─ Output: CEO decisions + recommendations
  │
  ├─ PHASE 2: Design Review (subagent)
  │  ├─ Rate each dimension 0-10
  │  ├─ Apply design conflict rules
  │  └─ Output: Design decisions + recommendations
  │
  ├─ PHASE 3: Eng Review (subagent)
  │  ├─ Lock architecture + edges + tests
  │  ├─ Apply eng conflict rules
  │  └─ Output: Eng decisions + recommendations
  │
  └─ Final Approval Gate
     ├─ Display all taste decisions
     ├─ Display all user challenges
     ├─ Ask user: Accept all or review?
     └─ Output: Fully reviewed plan ready to implement
```

---

## Coordination State Management

Each skill coordination involves:

1. **Pre-preamble**: Check gstack version, update if needed
2. **Preamble (Tier 1-4)**: Load config, detect repo mode, load learnings
3. **Routing**: Check CLAUDE.md for routing rules, dispatch as needed
4. **Execution**: Run skill with available tool access
5. **Sub-dispatch**: Launch subagents (Agent tool) if needed
6. **Post-execution**: Save learnings, log telemetry, cleanup

All state persisted to `~/.gstack/projects/{slug}/`
