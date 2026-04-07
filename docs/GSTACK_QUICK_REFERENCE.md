# gstack Quick Reference

## Agents by Use Case

### Planning & Ideation
- `/office-hours` — Validate product idea (startup or builder mode)
- `/plan-ceo-review` — Strategy & scope review (4 modes)
- `/plan-eng-review` — Architecture & execution plan
- `/plan-design-review` — Design critique pre-implementation

### Design
- `/design-consultation` — Design system from scratch
- `/design-review` — Visual audit + fixes (live sites)
- `/design-html` — Generate production HTML/CSS
- `/design-shotgun` — Explore multiple design variants

### Testing & QA
- `/qa` — Test + fix bugs (3 tiers: quick, standard, exhaustive)
- `/qa-only` — Report-only testing
- `/benchmark` — Performance regression tracking
- `/canary` — Post-deploy production monitoring

### Code Review
- `/review` — Pre-landing PR review (4 specialist subagents)
- `/codex` — Multi-AI code review (OpenAI)
- `/investigate` — Root cause debugging (4 phases)
- `/health` — Code quality dashboard

### Shipping
- `/ship` — Code → PR (fully automated)
- `/land-and-deploy` — Merge → Deploy → Verify
- `/setup-deploy` — One-time deploy config
- `/document-release` — Post-ship doc updates

### Security
- `/cso` — Security audit (OWASP + STRIDE)

### Workflow
- `/checkpoint` — Save/resume session state
- `/retro` — Weekly retrospective + trends
- `/learn` — Manage project learnings
- `/autoplan` — Auto-review pipeline (CEO → Design → Eng)

### Browser
- `/browse` — Headless browser testing (~100ms/cmd)
- `/setup-browser-cookies` — Import cookies
- `/connect-chrome` — Real Chrome with side panel

### Safety
- `/careful` — Warn before destructive commands
- `/freeze` — Restrict edits to one directory
- `/guard` — Both careful + freeze
- `/unfreeze` — Clear freeze

---

## Coordination Patterns

### 1. Proactive Routing (CLAUDE.md)
Add to your project's CLAUDE.md:
```markdown
## Skill routing

Key routing rules:
- Product ideas → /office-hours
- Bugs, errors → /investigate
- Ship, deploy → /ship
- QA, test → /qa
- Code review → /review
- Update docs → /document-release
```

Sets: `PROACTIVE=true`, `SKILL_PREFIX=false`, `ROUTING_DECLINED=false`

### 2. Sub-Agent Dispatch
Skills use Agent tool for independent verification:
- Fresh context (subagent doesn't see primary reasoning)
- Different perspective (catches blind spots)
- Examples: `/review` (4 specialists), `/autoplan` (3 phases)

### 3. Sequential Pipelines
Multi-skill workflows with clear handoffs:
- `/office-hours` → `/plan-ceo-review` → `/plan-eng-review` → `/design-html`
- `/ship` → `/land-and-deploy`
- `/qa` → `/design-review`

---

## Decision Classification

Used by `/autoplan` for auto-decisions:

**Mechanical** — One right answer
- Auto-decide silently
- Examples: "Run codex?", "Run evals?"

**Taste** — Reasonable disagreement
- Auto-decide + surface at gate
- Examples: Close approaches, borderline scope, codex disagreements

**User Challenge** — Both models recommend user changes direction
- NEVER auto-decided
- Displayed with full context at final gate

6 Decision Principles:
1. Completeness — ship whole thing
2. Boil lakes — fix blast radius
3. Pragmatic — choose cleaner fix
4. DRY — reject duplicates
5. Explicit over clever — obvious > abstract
6. Bias toward action — merge > cycles

---

## Tool Access Summary

High-access skills: `/ship`, `/land-and-deploy`, `/review`, `/qa`
- Can use: Bash, Read, Write, Edit, Glob, Grep, Agent, WebSearch, AskUserQuestion

Read-only skills: `/plan-ceo-review`, `/checkpoint`
- Cannot modify files

Browser skills: `/browse`, `/benchmark`, `/canary`
- ~100ms per command after cold start

Safety skills: `/careful`, `/freeze`, `/guard`
- Hook-based (PreToolUse hooks block operations)

---

## Preamble Tiers

Each skill runs preamble initialization:

1. **Tier 1** — Minimal
2. **Tier 2** — Git + repo detection + learnings
3. **Tier 3** — Template loading + review setup
4. **Tier 4** — Complex state + dependencies

---

## Browser Daemon

Launched by `/browse`, `/benchmark`, `/canary`:

**First call:** ~3s (cold start)
**Subsequent:** ~100-200ms (sub-second)

**Persistent state:**
- Login sessions
- Cookies
- localStorage
- Open tabs

**Lifecycle:** Auto-start on first use, auto-shutdown after 30min idle

**Element Refs:** @e1, @e2, etc. (ARIA-based, no CSS selectors needed)

---

## Persistent State

Located at `~/.gstack/`:

```
sessions/                   # Active sessions (120-min rotation)
projects/{slug}/
  learnings.jsonl          # Append-only learnings
analytics/
  skill-usage.jsonl        # Telemetry events
config.yaml                # User settings
```

---

## Proactive Invocation Triggers

Skills are auto-invoked when:

| Trigger | Skill |
|---------|-------|
| "Is this worth building?", new product idea | `/office-hours` |
| Errors, stack traces, "why is this broken?" | `/investigate` |
| "Ready to test", "does this work?" | `/qa` |
| "Code ready", "deploy", "push" | `/ship` |
| Visual issues, "looks bad" | `/design-review` |
| "Merge and verify", "land it" | `/land-and-deploy` |
| Session ending, switching context | `/checkpoint` |
| "What did we ship?", end of week | `/retro` |
| "Didn't we fix this?", past patterns | `/learn` |

---

## Configuration Files

### Project CLAUDE.md
```markdown
## Skill routing
[routing rules]

## Deploy config
platform: fly.io | render | vercel | netlify | heroku | custom
prod_url: https://...
health_endpoint: /health
deploy_status_cmd: fly status
```

### Global ~/.gstack/config.yaml
```yaml
proactive: true | false         # Enable proactive suggestions
skill_prefix: true | false      # Use /gstack- prefix
telemetry: off | community | anonymous
```

---

## Key Concepts

### Boil the Lake
Core principle: AI agents do the complete thing when marginal cost is near-zero.
- Ship whole features, not partial ones
- Fix blast radius, not just the reported bug
- Update all docs after shipping

### Ref System
Element addressing without CSS selectors:
- `@e1`, `@e2`, etc.
- ARIA tree-based (no DOM mutation, CSP-safe)
- Auto-clears on navigation (staleness detection)

### Benefits From
Skills can declare dependencies:
```yaml
benefits-from: [office-hours]  # Assumes user ran this first
```

### Sensitive Flag
Some skills marked `sensitive: true` (non-interactive, fully automated):
- `/ship` — "DO IT"
- `/land-and-deploy` — Release engineer mode

---

## Invocation

### Direct
```bash
/skillname              # Run with defaults
/skillname arg1 arg2    # Run with arguments
```

### Via CLAUDE.md Routing
Add routing rules, then user requests automatically invoke appropriate skill.

### Voice Triggers
Some skills have speech-to-text aliases:
- `/office-hours` — "office hours"
- `/ship` — "ship it"
- `/qa` — "quality check", "test the app"

---

## Common Workflows

### Idea → Ship
```
/office-hours           # Validate idea
/plan-ceo-review        # Strategy
/plan-eng-review        # Architecture
/plan-design-review     # Design critique
/design-html            # Implement design
/ship                   # Create PR
/land-and-deploy        # Merge & verify
/document-release       # Update docs
```

### Bug → Fix → Ship
```
/investigate            # Root cause
[Make fixes]
/qa                     # Test
/ship                   # PR
/land-and-deploy        # Deploy
```

### Code Review
```
[User creates PR]
/review                 # Pre-landing review (4 specialists)
[Fix issues]
/ship                   # If needed
```

### Post-Deploy
```
/canary                 # Monitor live app
/benchmark              # Check performance
/retro                  # Weekly retrospective
```

---

## Tips & Tricks

1. **CLAUDE.md routing** — Set up once, skills auto-invoke thereafter
2. **Sub-agents** — Fresh context prevents bias (use Agent tool)
3. **Decision principles** — Guide AI choices in /autoplan
4. **Freeze for debugging** — `/freeze /path/to/bug` prevents accidental changes
5. **Learnings** — Accumulate across sessions, search with `/learn`
6. **Browser persistence** — Login once, stay logged in across `/browse` calls
7. **Checkpoint save** — Before long breaks or workspace switches
8. **Boil the lake** — Do the complete thing, not the minimal thing

---

## Differences vs Manual Approach

| Task | Manual | /gstack skill |
|------|--------|---------------|
| PR review | Read diff, check manually | 4 specialist subagents + pattern reviewer |
| Testing | Manual testing | Systematic test + fix loop |
| Debugging | Trial & error | 4-phase root cause investigation |
| Deploy | Manual steps + waiting | Automated merge/deploy/verify |
| Design review | "Looks good" | Designer rating 0-10 per dimension |
| Code quality | Run linter, hope | Composite 0-10 score + trends |
| Shipping | Scattered docs | Automated version, changelog, docs |

---

## Version & Model Info

- gstack version: Read from `VERSION` file
- Skills auto-update: `/gstack-upgrade` handles versioning
- Models used: Claude (default), Codex (for `/codex`), Gemini (for `/design`)
- Reasoning models: Some skills support Claude with extended thinking

---

## Security Model

### Browser Daemon
- Localhost only (not network-reachable)
- UUID bearer token per session
- State file: 0o600 mode (owner-only read)

### Cookie Security
- Keychain permission required (user approval)
- Decryption in-process only
- Read-only database access
- No values in logs

### Command Execution
- Hardcoded browser registry (no shell injection)
- Explicit argument arrays (not string interpolation)
- `/careful` warns before destructive ops
- `/freeze` scopes changes to one directory

---

## Troubleshooting

### Skills won't auto-invoke
- Check `/gstack-upgrade` for updates
- Verify CLAUDE.md has `## Skill routing` section
- Check `PROACTIVE=true` in config

### /browse is slow
- First call cold-starts Chromium (~3s)
- Subsequent calls should be ~100-200ms
- If persistent slowness, restart daemon: `rm ~/.gstack/browse.json`

### Deploy config not working
- Run `/setup-deploy` once to auto-detect infrastructure
- Check CLAUDE.md `## Deploy config` section
- Verify `platform`, `prod_url`, `deploy_status_cmd`

### Cookie import failing
- First import may trigger Keychain dialog (click "Allow")
- Re-run `/setup-browser-cookies` to select domains
- Check browser is Chromium-based (Chrome, Edge, Brave, Arc)
