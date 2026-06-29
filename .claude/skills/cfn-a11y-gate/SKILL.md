---
name: cfn-a11y-gate
description: "LOCAL accessibility (WCAG) gate. Runs axe-core against rendered pages in a headless browser (Playwright) and emits each violation (contrast, missing label, keyboard trap, ARIA misuse) as a suggestion in the shared cfn-vote-implement manifest. NOT a GitHub Action. Requires axe-core preinstalled; degrades with a clear install instruction. Never auto-fixes."
version: 1.0.0
tags: [accessibility, a11y, wcag, axe, gate, frontend]
status: production
---

# CFN Accessibility Gate

**Purpose:** Local WCAG gate. Renders each target URL in a headless browser, injects axe-core, runs the WCAG ruleset, and turns every violation into a suggestion in the shared `cfn-vote-implement` schema. Findings route through voting. This skill never auto-fixes.

This is the accessibility counterpart to `cfn-security-review` and `cfn-dep-audit`: capture findings, emit a manifest, route through `cfn-vote-implement`. It is NOT a CI job and not a GitHub Action. It runs locally against pages you serve.

## What It Checks

axe-core evaluates rendered DOM against the configured WCAG tags. Typical violations surfaced:

| Class | Example axe rule |
|-------|------------------|
| Color contrast | `color-contrast` |
| Missing labels | `label`, `button-name`, `link-name` |
| Missing alt text | `image-alt` |
| ARIA misuse | `aria-*`, `aria-valid-attr` |
| Keyboard / focus traps | `focus-order-semantics`, `tabindex` |
| Document structure | `document-title`, `html-has-lang`, `landmark-*` |

Each offending node becomes one suggestion (rule id is the `category`).

## Dependency Requirement (axe-core must be preinstalled)

This skill follows the build ladder: it reuses an installed dep and never installs one for you (supply-chain cooldown + user-permission rule). The driver is Node + `@axe-core/playwright` + `playwright`. If they are absent the gate exits `3` and prints the exact install line:

```bash
npm install --save-dev @axe-core/playwright playwright && npx playwright install chromium
```

`cfn:` the gate assumes axe-core is preinstalled. Upgrade trigger: bundle a pinned local copy of axe-core under `lib/` if cross-project install drift becomes a problem.

## Inputs

Target URLs (at least one required):

- `CFN_A11Y_URLS` (env): comma-separated list. Example `http://localhost:3000,http://localhost:3000/about`.
- `--url <url>` (flag, repeatable): one URL per flag. `--url=<url>` form also accepted.

If no URL is provided, the gate exits `2` with usage. URLs are NOT hardcoded; this repo is mostly CLI/scripts and the gate is for frontend projects.

WCAG level:

- `CFN_A11Y_TAGS` (env, default `wcag2a,wcag2aa`): comma-separated axe tags. Use e.g. `wcag2a,wcag2aa,wcag21aa` to widen coverage.

## Outputs

- Summary to stdout (URL count, tags, violation count).
- When violations exist: a manifest at `<project-root>/.cfn-cache/manifests/cfn-a11y-gate-<ns>.json` in the shared schema (auto-gitignored, nanosecond-precision filename).
- When no violations: a plain report, no manifest.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Scan ran, no violations. No manifest. |
| 1 | Violations found. Manifest emitted. |
| 2 | Usage error: no target URLs provided. |
| 3 | Missing dependency: node, `@axe-core/playwright`, or `playwright` absent. Install line printed. |
| 4 | Runtime error: browser launch, navigation, or runner failure. |

## Usage

```bash
# env-driven targets
CFN_A11Y_URLS="http://localhost:3000,http://localhost:3000/about" \
  ./.claude/skills/cfn-a11y-gate/execute.sh

# flag-driven targets
./.claude/skills/cfn-a11y-gate/execute.sh \
  --url http://localhost:3000 --url http://localhost:3000/about

# widen WCAG level
CFN_A11Y_TAGS="wcag2a,wcag2aa,wcag21aa" \
  ./.claude/skills/cfn-a11y-gate/execute.sh --url http://localhost:3000

# route any findings through voting
/cfn-vote-implement latest
```

Serve the site first (dev server, or a static `python -m http.server`). The gate renders whatever the URL returns.

## Manifest Schema (shared with cfn-vote-implement)

```json
{
  "review_id": "a11y-gate-<ns>",
  "source": "cfn-a11y-gate",
  "generated_at": "ISO-8601",
  "status": "pending_review",
  "wcag_tags": "wcag2a,wcag2aa",
  "urls_scanned": ["http://localhost:3000"],
  "suggestions": [
    {
      "id": "S001",
      "category": "image-alt",
      "tag": "block | fix | harden",
      "one_liner": "http://localhost:3000 img: image-alt: Images must have alternate text",
      "title": "image-alt: Images must have alternate text",
      "description": "Ensures <img> elements have alternate text or a role of none/presentation",
      "files": ["http://localhost:3000 :: img"],
      "impact": "high",
      "effort": "low",
      "suggested_approach": "Element has no alt attribute. See https://dequeuniversity.com/rules/axe/4.x/image-alt",
      "status": "pending",
      "related_suggestions": []
    }
  ]
}
```

Mapping: axe rule id -> `category`. axe impact -> `impact` (critical/serious to high, moderate to medium, minor to low) and `tag` (critical/serious to `block`, moderate to `fix`, minor to `harden`). axe help text -> `description`. axe failure summary + helpUrl -> `suggested_approach`. URL + node selector -> `files` locator. Suggestions sorted by impact.

Tags: `block` (serious/critical, treat as merge blockers), `fix` (clear violation), `harden` (minor, defense-in-depth).

## Rules

- Local only. Not a GitHub Action and not CI.
- Never auto-fix. Every finding routes through `/cfn-vote-implement`.
- Never auto-install deps. Missing axe-core exits `3` with the install line.
- `block`-tagged findings are merge blockers regardless of vote outcome.

## Related

- `/cfn-vote-implement` - votes on and routes the findings (never implement manually).
- `cfn-security-review` - the code-level security gate (same emit-manifest flow).
- `cfn-dep-audit` - the dependency-level gate (same exit-code convention).
- `cfn-design` - design-phase accessibility planning (this skill is the post-render check).
