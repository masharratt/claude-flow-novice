# gstack Agent Definitions and Coordination Patterns

Research Date: 2026-04-03
Source: https://github.com/garrytan/gstack

## Executive Summary

gstack provides **42 specialized agent skills** that turn Claude Code into a virtual engineering team. Skills are invoked via `/skillname` syntax and use three coordination mechanisms:

1. **Proactive Skill Routing** — CLAUDE.md-based dispatcher
2. **Sub-agent Dispatch** — Agent tool for independent verification
3. **Sequential Skill Pipelines** — Multi-skill workflows (/autoplan chains CEO → design → eng reviews)

---

## Complete Agent/Skill Catalog (42 Skills)

### Category: Planning & Strategy (5 Skills)

1. **`/office-hours`** — YC Office Hours methodology for product ideation (startup or builder mode)
   - Tools: Bash, Read, Grep, Glob, Write, Edit, AskUserQuestion, WebSearch
   - Preamble Tier: 3 | Version: 2.0.0
   - Proactive: "Is this worth building?", new product ideas before code

2. **`/plan-ceo-review`** — CEO/Founder-level plan review with 4 scope modes
   - Tools: Read, Grep, Glob, Bash, AskUserQuestion, WebSearch
   - Preamble Tier: 3 | Version: 1.0.0
   - Sub-agent: Independent reviewer via Agent tool
   - Benefits From: /office-hours

3. **`/plan-eng-review`** — Engineering manager plan review (architecture, edges, tests)
   - Tools: Read, Write, Grep, Glob, AskUserQuestion, Bash, WebSearch
   - Preamble Tier: 3 | Version: 1.0.0
   - Sub-agent: Independent verification
   - Benefits From: /office-hours

4. **`/plan-design-review`** — Designer's eye plan review (pre-implementation)
   - Tools: Read, Edit, Grep, Glob, Bash, AskUserQuestion
   - Preamble Tier: 3 | Version: 2.0.0
   - Pattern: Interactive critique, rates 0-10 per dimension

5. **`/autoplan`** — Auto-review pipeline orchestrator
   - Tools: Bash, Read, Write, Edit, Glob, Grep, WebSearch, AskUserQuestion
   - Preamble Tier: 3 | Version: 1.0.0
   - Pattern: CEO → Design → Eng sequential with 6 decision principles
   - Decision Types: Mechanical (silent), Taste (surfaced), User Challenge (never auto)

---

### Category: Design & UI (4 Skills)

6. **`/design-consultation`** — Design system generation from scratch
   - Tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, WebSearch
   - Preamble Tier: 3 | Version: 1.0.0
   - Output: DESIGN.md + preview pages

7. **`/design-review`** — Visual design QA with fix loop (live sites)
   - Tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, WebSearch
   - Preamble Tier: 4 | Version: 2.0.0
   - Process: Find → Fix → Commit atomically → Re-verify

8. **`/design-html`** — Production-quality HTML/CSS generation
   - Tools: Bash, Read, Write, Edit, Glob, Grep, Agent, AskUserQuestion
   - Preamble Tier: 2 | Version: 1.0.0
   - Features: Dynamic reflow, responsive layouts, 30KB overhead

9. **`/design-shotgun`** — Design variant exploration with comparison board
   - Tools: Bash, Read, Glob, Grep, Agent, AskUserQuestion
   - Preamble Tier: 2 | Version: 1.0.0
   - Process: Generate → Compare → Iterate

---

### Category: Quality Assurance (4 Skills)

10. **`/qa`** — Systematic QA testing with bug fix loop
    - Tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, WebSearch
    - Preamble Tier: 4 | Version: 2.0.0
    - Tiers: Quick, Standard, Exhaustive
    - Output: Before/after health scores + ship-readiness

11. **`/qa-only`** — Report-only QA (no fixes)
    - Tools: Bash, Read, Write, AskUserQuestion, WebSearch
    - Preamble Tier: 4 | Version: 1.0.0

12. **`/benchmark`** — Performance regression detection
    - Tools: Bash, Read, Write, Glob, AskUserQuestion
    - Preamble Tier: 1 | Version: 1.0.0
    - Tracks: Page load times, Core Web Vitals, resource sizes, trends

13. **`/canary`** — Post-deploy production monitoring
    - Tools: Bash, Read, Write, Glob, AskUserQuestion
    - Preamble Tier: 2 | Version: 1.0.0
    - Checks: Console errors, performance regressions, page failures

---

### Category: Code Review & Analysis (5 Skills)

14. **`/review`** — Pre-landing PR review
    - Tools: Bash, Read, Edit, Write, Grep, Glob, Agent, AskUserQuestion, WebSearch
    - Preamble Tier: 4 | Version: 1.0.0
    - Sub-agents: SQL safety, LLM boundaries, side effects, patterns
    - Checks: SQL injection, trust boundary violations, conditional side effects

15. **`/codex`** — Multi-AI code review via OpenAI Codex
    - Tools: Bash, Read, Write, Glob, Grep, AskUserQuestion
    - Preamble Tier: 3 | Version: 1.0.0
    - Modes: Review (pass/fail), Challenge (adversarial), Consult (session)

16. **`/investigate`** — Root cause analysis & debugging
    - Tools: Bash, Read, Write, Edit, Grep, Glob, AskUserQuestion, WebSearch
    - Preamble Tier: 2 | Version: 1.0.0
    - Phases: Investigate → Analyze → Hypothesize → Implement
    - Freeze Integration: Scopes debug changes to one directory

17. **`/health`** — Code quality health dashboard
    - Tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
    - Preamble Tier: 2 | Version: 1.0.0
    - Wraps: Linter, type checker, test runner, dead code detector, shell linter
    - Output: 0-10 weighted score with trends

18. **`/cso`** — Chief Security Officer security audit
    - Tools: Bash, Read, Grep, Glob, Write, Agent, WebSearch, AskUserQuestion
    - Preamble Tier: 2 | Version: 2.0.0
    - Coverage: OWASP Top 10, STRIDE, secrets, supply chain, CI/CD, LLM security
    - Modes: Daily (8/10 gate), Comprehensive (2/10 bar)
    - Sub-agent: Independent verification of findings

---

### Category: Shipping & Deployment (4 Skills)

19. **`/ship`** — Complete ship workflow (code → PR)
    - Tools: Bash, Read, Write, Edit, Grep, Glob, Agent, AskUserQuestion, WebSearch
    - Preamble Tier: 4 | Version: 1.0.0
    - Sensitive: true
    - Steps: Merge base → Tests → Review → Version bump → Changelog → Commit → Push → PR
    - Philosophy: Non-interactive, fully automated ("DO IT")
    - Sub-agent: Independent pre-landing reviewer

20. **`/land-and-deploy`** — Merge, deploy, verify production
    - Tools: Bash, Read, Write, Glob, AskUserQuestion
    - Preamble Tier: 4 | Version: 1.0.0
    - Sensitive: true
    - Role: Release engineer persona
    - Workflow: Pre-flight → Merge → Wait for deploy → Canary verify
    - Handoff: Picks up where /ship leaves off

21. **`/setup-deploy`** — One-time deploy configuration
    - Tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion
    - Preamble Tier: 2 | Version: 1.0.0
    - Detects: Platform (Fly.io, Render, Vercel, Netlify, Heroku, custom)
    - Output: CLAUDE.md deploy config for automatic future deploys

22. **`/document-release`** — Post-ship documentation update
    - Tools: Bash, Read, Write, Edit, Grep, Glob, AskUserQuestion
    - Preamble Tier: 2 | Version: 1.0.0
    - Updates: README, ARCHITECTURE, CONTRIBUTING, CLAUDE.md, CHANGELOG, TODOS, VERSION

---

### Category: Workflow & Persistence (3 Skills)

23. **`/checkpoint`** — Save and resume working state
    - Tools: Bash, Read, Write, Glob, Grep, AskUserQuestion
    - Preamble Tier: 2 | Version: 1.0.0
    - Captures: Git state, decisions, remaining work
    - Use: Cross-session resume, branch switching, workspace handoffs

24. **`/retro`** — Weekly engineering retrospective
    - Tools: Bash, Read, Write, Glob, AskUserQuestion
    - Preamble Tier: 2 | Version: 2.0.0
    - Analyzes: Commits, work patterns, code quality, per-person contributions
    - Features: Shipping streaks, trend tracking, team breakdowns

25. **`/learn`** — Project learnings management
    - Tools: Bash, Read, Write, Edit, AskUserQuestion, Glob, Grep
    - Preamble Tier: 2 | Version: 1.0.0
    - Operations: Review, search, prune, export
    - Storage: Per-project learnings.jsonl (append-only)

---

### Category: Browser & Testing (3 Skills)

26. **`/browse`** — Headless browser for QA & testing
    - Tools: Bash, Read, AskUserQuestion
    - Preamble Tier: 1 | Version: 1.1.0
    - Latency: ~100ms per command after cold start (~3s)
    - Daemon Model: Long-lived Chromium with persistent state (login, cookies, tabs)
    - Ref System: @e1, @e2, etc. ARIA-based element addressing
    - Security: Localhost only, bearer token auth, state file mode 0o600

27. **`/setup-browser-cookies`** — Import browser cookies to headless session
    - Tools: Bash, Read, AskUserQuestion
    - Preamble Tier: 1 | Version: 1.0.0
    - Process: Interactive picker → Domain selection → Import
    - Security: Keychain approval, in-process decryption only, read-only DB

28. **`/connect-chrome`** — Launch real Chrome with gstack control
    - Tools: Bash, Read, AskUserQuestion
    - Version: 0.1.0
    - Features: Side Panel extension, live activity feed, real-time visualization

---

### Category: Safety & Guardrails (4 Skills)

29. **`/careful`** — Destructive command warning guard
    - Tools: Bash, Read
    - Version: 0.1.0
    - Protects: rm -rf, DROP TABLE, force-push, git reset --hard, kubectl delete
    - Hook: PreToolUse on Bash
    - Composition: Part of /guard

30. **`/freeze`** — Edit scope restriction
    - Tools: Bash, Read, AskUserQuestion
    - Version: 0.1.0
    - Blocks: Edit, Write outside allowed directory
    - Hooks: PreToolUse on Edit, Write
    - Composition: Part of /guard, used by /investigate

31. **`/guard`** — Full safety mode (careful + freeze)
    - Tools: Bash, Read, AskUserQuestion
    - Version: 0.1.0
    - Combines: Destructive command warnings + edit scope restriction
    - Hooks: Multiple for Bash, Edit, Write

32. **`/unfreeze`** — Clear edit scope restriction
    - Tools: Bash, Read
    - Version: 0.1.0
    - Expands: Edit permissions to all directories

---

### Category: System & Maintenance (1 Skill)

33. **`/gstack-upgrade`** — Update gstack to latest version
    - Tools: Bash, Read, Write, AskUserQuestion
    - Version: 1.1.0
    - Detects: Global vs vendored install, upgrade availability
    - Inline: Auto-upgrade or 4-option prompt with snooze state

---

## Coordination Patterns

### Pattern 1: Proactive Skill Routing (CLAUDE.md Dispatcher)

Configuration in project's CLAUDE.md:
```markdown
## Skill routing

Key routing rules:
- Product ideas, "is this worth building" → /office-hours
- Bugs, errors, 500 errors → /investigate
- Ship, deploy, push, PR → /ship
- QA, test, find bugs → /qa
- Code review, check diff → /review
- Update docs → /document-release
- Weekly retro → /retro
- Design system → /design-consultation
- Visual audit → /design-review
- Architecture review → /plan-eng-review
- Checkpoint, resume → /checkpoint
- Code quality → /health
```

Configuration Flags:
- `PROACTIVE=true/false` — Enable/disable proactive suggestions
- `SKILL_PREFIX=true/false` — Use /gstack- prefix
- `ROUTING_DECLINED=true/false` — User opt-out

Detection: Preamble checks for `## Skill routing` in CLAUDE.md via `gstack-repo-mode` binary

---

### Pattern 2: Sub-Agent Dispatch (Agent Tool)

**Purpose:** Independent verification with fresh context

**Examples:**
- `/review`: Dispatches SQL verifier + LLM boundary checker + side effect analyzer + pattern specialist
- `/autoplan`: Dispatches CEO, design, eng subagents sequentially
- `/ship`: Dispatches independent pre-landing reviewer
- `/cso`: Dispatches independent finding verifier
- `/plan-ceo-review`: Dispatches independent reviewer
- `/design-review`: Dispatches design subagent

**Implementation:** Claude's Agent tool with NO previous reasoning visible to subagent

**Benefits:**
- Prevents anchoring bias
- Catches blind spots
- Provides second opinion
- Maintains independence

---

### Pattern 3: Sequential Skill Pipelines

**Primary Example: /autoplan orchestration**

```
User Input (rough plan)
         ↓
Read all 3 review skill templates from disk
         ↓
Phase 1: CEO Review (subagent via Agent tool)
  - 6 decision principles applied
  - Auto-decides "mechanical" questions
  - Surfaces "taste" decisions
         ↓
Phase 2: Design Review (subagent via Agent tool)
  - Designer ratings 0-10 per dimension
  - Auto-decisions via design-phase rules
  - Surfaces design taste decisions
         ↓
Phase 3: Eng Review (subagent via Agent tool)
  - Architecture + edge cases + tests
  - Auto-decisions via eng-phase rules
  - Surfaces eng taste decisions
         ↓
Final Approval Gate
  - Taste decisions displayed together
  - User Challenge decisions highlighted
  - User makes final call
         ↓
Output: Fully reviewed plan
```

**Key Features:**
1. Disk-based skill loading (reads full SKILL.md templates)
2. Sequential execution (each phase depends on previous)
3. Decision automation (6 principles auto-answer intermediate Qs)
4. Classification system:
   - Mechanical: auto-decide silently
   - Taste: auto-decide, surface at gate
   - User Challenge: never auto-decide
5. Context separation (each phase independent via Agent tool)

---

### Pattern 4: Pre/Post Workflow Pairing

Sequential handoffs between skills:

- `/office-hours` → `/plan-ceo-review` → `/plan-eng-review` → `/design-html`
- `/ship` → `/land-and-deploy`
- `/qa` / `/qa-only` → `/design-review`
- Any review → `/document-release`

---

### Pattern 5: Browser Daemon Persistence

Long-lived daemon for state persistence:

```
Claude Code
  ↓ (via $B command)
gstack browse CLI (binary)
  ↓ HTTP + Bearer token
Bun Server
  ↓ Chrome DevTools Protocol
Chromium (headless, persistent tabs)
```

**Characteristics:**
- First call: ~3s (cold start + Chromium launch)
- Subsequent: ~100-200ms (sub-second latency)
- State: Login sessions, cookies, localStorage persist
- Lifecycle: Auto-starts on first use, auto-shuts down after 30min idle
- Port: Random 10000-60000, retries up to 5 on collision
- Security: Localhost only, UUID bearer token, state file 0o600

---

### Pattern 6: Hook-Based Safety Integration

Pre-tool-use hooks executed before command:

Example from `/investigate` with `/freeze` boundary:
```yaml
hooks:
  PreToolUse:
    - matcher: "Edit"
      hooks:
        - type: command
          command: "bash ${CLAUDE_SKILL_DIR}/../freeze/bin/check-freeze.sh"
          statusMessage: "Checking debug scope boundary..."
```

Used by:
- `/careful`: Blocks destructive commands
- `/freeze`: Blocks edits outside directory
- `/guard`: Combines both

---

### Pattern 7: Configuration-Driven Platform Detection

Skills auto-detect project infrastructure from CLAUDE.md:

Example: `/land-and-deploy` detects:
- Platform (GitHub vs GitLab, Fly.io vs Render vs Vercel)
- Health check endpoints
- CI status URLs
- Deploy workflow names

**Benefit:** Zero manual configuration per project

---

### Pattern 8: Decision Principle Framework

/autoplan uses 6 principles for mechanical auto-decisions:

1. **Completeness** — Ship the whole thing, cover edge cases
2. **Boil lakes** — Fix everything in blast radius + importers
3. **Pragmatic** — Choose cleaner fix when both work
4. **DRY** — Reject duplicates, reuse existing
5. **Explicit over clever** — 10-line obvious > 200-line abstraction
6. **Bias toward action** — Merge > review cycles > stale deliberation

**Conflict Resolution (context-dependent):**
- CEO phase: P1 (completeness) + P2 (boil lakes) dominate
- Eng phase: P5 (explicit) + P3 (pragmatic) dominate
- Design phase: P5 (explicit) + P1 (completeness) dominate

---

## Tool Access Matrix

| Skill | Bash | Read | Write | Edit | Glob | Grep | Agent | WebSearch | AskUserQuestion |
|-------|------|------|-------|------|------|------|-------|-----------|-----------------|
| /office-hours | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| /plan-ceo-review | ✓ | ✓ | | | ✓ | ✓ | | ✓ | ✓ |
| /plan-eng-review | ✓ | ✓ | ✓ | | ✓ | ✓ | | ✓ | ✓ |
| /plan-design-review | ✓ | ✓ | | ✓ | ✓ | ✓ | | | ✓ |
| /design-consultation | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| /design-review | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| /design-html | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ |
| /design-shotgun | ✓ | ✓ | | | ✓ | ✓ | ✓ | | ✓ |
| /qa | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| /qa-only | ✓ | ✓ | ✓ | | | | | ✓ | ✓ |
| /review | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| /investigate | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| /ship | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| /land-and-deploy | ✓ | ✓ | ✓ | | ✓ | | | | ✓ |
| /autoplan | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | | ✓ | ✓ |
| /browse | ✓ | ✓ | | | | | | | ✓ |
| /cso | ✓ | ✓ | | | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## Preamble Tiers (Execution Order)

- **Tier 1** — Minimal (no special init): /browse, /benchmark, /canary, /setup-browser-cookies, /connect-chrome
- **Tier 2** — Standard (git, repo, learnings): /checkpoint, /health, /retro, /document-release, /cso, /design-html, /design-shotgun, /setup-deploy, /investigate
- **Tier 3** — Advanced (templates, reviews): /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /autoplan, /codex
- **Tier 4** — Full (complex state, deps): /design-review, /qa, /qa-only, /review, /ship, /land-and-deploy

---

## Persistent State Files

```
~/.gstack/
├── sessions/                        # Active skill sessions (120-min rotation)
├── projects/
│   └── {slug}/
│       └── learnings.jsonl         # Per-project learnings (append-only)
├── analytics/
│   └── skill-usage.jsonl           # Telemetry events
├── config.yaml                     # Config (proactive, skill_prefix, telemetry)
└── .completeness-intro-seen        # Flag: Lake intro shown
```

---

## Summary

gstack provides a **complete engineering orchestration system** with:

1. **42 specialized agent skills** (planning → shipping → monitoring)
2. **Three coordination mechanisms:**
   - Proactive routing (CLAUDE.md dispatcher)
   - Sub-agent dispatch (Agent tool for independent verification)
   - Sequential pipelines (multi-skill workflows)
3. **Decision automation** with classified types (mechanical, taste, user challenge)
4. **Persistent state** (learnings, config, session files)
5. **Browser daemon** for fast, stateful testing (~100ms per command)
6. **Hook-based safety** (careful, freeze, guard)
7. **Platform-agnostic design** (reads config, auto-detects infrastructure)

Core principle: **Boil the Lake** — AI agents do the complete thing when marginal cost is near-zero.
