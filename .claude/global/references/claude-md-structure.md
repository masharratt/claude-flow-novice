# CLAUDE.md Authoring & Structure

How to write a project's `CLAUDE.md` so it stays small, high-signal, and cheap. A `CLAUDE.md` loads into **every** turn of **every** session for that project. Tokens here are a permanent tax, not a one-time cost.

## Token Budget (hard rules)

| Scope | Target | Ceiling | Action if over |
|-------|--------|---------|----------------|
| Project `CLAUDE.md` | < 1,500 tokens (~1,100 words) | 2,500 tokens | Break out to reference files |
| Nested `CLAUDE.md` (subdir) | < 500 tokens | 1,000 tokens | Fold into parent or reference |
| Any single reference file | < 3,000 tokens | 5,000 tokens | Split by topic |

15k tokens in one `CLAUDE.md` is a bug. That is a book loaded on every keystroke.

Quick check: `wc -w CLAUDE.md` — words × ~1.3 ≈ tokens.

## The Load-Cost Test (apply to every line)

Before a line earns a spot in `CLAUDE.md`, it must pass ALL of:

1. **Non-derivable** — Claude cannot get it from reading the code, `package.json`, config, or git history. ("Runs on port 3000" is derivable from config. "Port 3000 conflicts with the SEO blog, use 3007" is not.)
2. **High-frequency OR high-blast-radius** — either needed most sessions, or the cost of not knowing it is severe (data loss, prod breakage, security hole).
3. **Stable** — won't be stale in a month. Volatile facts (current sprint, open PR, today's bug) belong in task docs, not `CLAUDE.md`.

Fails any test → it goes in a reference file, a doc, or nowhere.

## What Belongs In CLAUDE.md

- **Non-obvious constraints**: "never source .env, it breaks bash", "DB is shared with prod, no unscoped deletes".
- **Project-specific commands** that aren't discoverable: the one test command, the deploy command, a required env setup.
- **Landmarks**: where the important dirs are, the one-line "what is this project".
- **Pointers**: a table of reference files with *load-when* triggers (see below).
- **Overrides**: where this project deviates from global defaults.

## What Does NOT Belong

- **Explanations of how the code works** — that's what reading the code is for. Point to the file, don't narrate it.
- **Full API docs, schema dumps, endpoint lists** → reference file or generated doc.
- **Long examples / code blocks** → reference file, or a real example file in the repo.
- **Tutorials, onboarding prose, history, rationale essays** → `docs/`.
- **Volatile state** (sprint, backlog, in-flight work) → task/planning docs.
- **Anything duplicated** from global `~/.claude/CLAUDE.md` or another CLAUDE.md — state it once, in the widest-applicable scope.
- **Aspirational rules nobody enforces** — dead weight.

## When To Break Out Into A Reference File

Break a section out when ANY holds:

- The section is **> ~40 lines** or covers a topic used in a minority of sessions.
- It's **conditionally relevant** — only matters when deploying, only when touching the DB, only for frontend work.
- It's a **lookup table** (ports, sites, pricing, schema) consulted occasionally, not reasoned-with constantly.
- It contains **examples or long code**.

Pattern (this is the global CLAUDE.md's own model):

```markdown
## References (load on demand)

| Topic | Path | Load when |
|-------|------|-----------|
| Deploy steps | `docs/deploy.md` | deploying |
| DB schema | `.claude/skills/db-query/SKILL.md` | writing queries |
```

The `CLAUDE.md` keeps only the **trigger + path**. The bulk lives in the reference and costs zero tokens until a session actually needs it. A good *load-when* trigger is concrete enough that Claude knows to open the file without being told.

## Structure Template

```markdown
# <Project> — one line: what it is

## Critical Rules
- Non-obvious constraints, gotchas, safety rules. Bullets, terse.

## Commands
- test: <cmd>
- deploy: <cmd>
- <anything not discoverable from package.json/Makefile>

## Landmarks
- Key dirs and what lives where. Cite paths.

## References (load on demand)
| Topic | Path | Load when |
```

Order: rules first (highest blast radius), pointers last. Keep sections flat — deep nesting wastes tokens.

## Style

- Bullets and tables over prose. Sparse language: 20 words not 50.
- Cite paths with line numbers (`src/app.ts:42`), don't paste the code.
- One fact, one place. If two CLAUDE.md files or a rule file already say it, don't repeat.
- Imperative and testable: "never X", "always Y", not "we generally prefer".

## Maintenance

- Every few weeks, `wc -w` the file. Growth = review.
- On each edit, ask: did this fact go stale? Delete stale rules — a wrong rule is worse than a missing one.
- When a section crosses the break-out thresholds above, move it to a reference and leave a pointer.

## Subfolder (nested) CLAUDE.md files

### How they load

A subdir `CLAUDE.md` loads **in addition to** the root when Claude reads or edits a file in that subtree — not instead of it. Root always applies. So a nested file is a **delta**: only what's different or extra for this subtree. The moment you copy a root rule down, you've paid for it twice on every turn in that subtree.

Budget: < 500 tokens target, 1,000 ceiling (the size guard enforces this). Most good nested files are 5–20 lines.

### When a subfolder earns its own CLAUDE.md

Create one ONLY when the subtree has rules that are BOTH:
1. **Local** — apply here and nowhere else (would be wrong or noise at the root), and
2. **Non-derivable** — not obvious from the code/config already in that folder.

Good candidates:
- `tests/CLAUDE.md` — test command, fixture conventions, "never hit the real DB", how to run one test.
- `packages/<x>/CLAUDE.md` in a monorepo — this package's build/publish quirks, its public API boundary.
- `infra/` or `migrations/` — safety rules that only bite in that dir (migration up+down rule, no unscoped deletes).
- A generated/vendored dir — "do not edit by hand, regenerate with `<cmd>`".

If you can't name a rule that is both local and non-derivable, **don't create the file.** An empty-calorie nested CLAUDE.md is pure tax.

### What goes in one

- The subtree's **one-line purpose** if not obvious from the path.
- **Local commands** — the test/build/generate command specific to here.
- **Local gotchas & safety rules** — the thing that breaks if you don't know it.
- **Local pointers** — reference files or docs relevant only to this subtree.
- **Deltas from root** — "root says X; here, do Y because Z." Make the override explicit.

### What must NOT go in one

- **Any rule already stated at the root or a parent.** State each fact in the widest scope where it's true, once. Never restate downward.
- **Generic advice** ("write clean code", "add tests") — belongs nowhere, least of all duplicated per folder.
- **Bulk content** (schemas, API lists, examples) → reference file, pointed to from here.
- **Whole-project context** — that's the root's job.

### Template

```markdown
# <subtree> — one line if path isn't self-explanatory

## Rules (local only)
- <gotcha/safety rule that only applies here>
- Override: root says <X>, here do <Y> because <Z>.

## Commands
- <test/build/gen command specific to this dir>
```

### The one test before writing a subfolder CLAUDE.md

For every line ask: *"Is this already true at the root, or derivable from the files in this folder?"* If yes to either, delete the line. If nothing survives, delete the file.
