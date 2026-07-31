---
name: cfn-dep-audit
description: "Supply-chain gate for new and existing dependencies. Enforces the ~90-day cooldown on NEW deps and the take-CVE-fixes-immediately carve-out. Runs npm audit / osv-scanner / cargo audit when present, flags newly added deps younger than the cooldown, and emits a manifest for cfn-vote-implement. Degrades gracefully when a tool is absent. Never auto-fixes."
version: 1.0.0
tags: [security, supply-chain, dependencies, cve, cooldown, audit]
status: production
---

# CFN Dependency Audit

**Purpose:** Enforce the two dependency policies from CLAUDE.md and code-quality.md:

1. **~90-day cooldown on NEW dependencies.** A new dependency is the last rung of the build ladder (YAGNI to reuse to stdlib to native to installed-dep to one line to minimum new code to NEW dep). When a dep is genuinely new, pin it with a ~90-day supply-chain cooldown, then move forward progressively.
2. **CVE carve-out: take CVE fixes immediately.** The cooldown is overridden by a security patch. Known-vulnerability fixes ship now, no waiting.

This is the supply-chain counterpart to `cfn-security-review`. It does not read your code; it reasons about what you depend on. Findings route through `cfn-vote-implement`. This skill never auto-installs or auto-upgrades.

## What It Checks

| Check | Tool | Result |
|-------|------|--------|
| Known vulnerabilities (npm) | `npm audit --json` | high/critical advisories surface as `cve` findings (high severity, immediate). |
| Known vulnerabilities (broader) | `osv-scanner` (optional) | vulnerable packages surface as `cve` findings. |
| Known vulnerabilities (Rust) | `cargo audit` (optional) | RUSTSEC advisories surface as `cve` findings. |
| Cooldown (npm) | `npm view <pkg> time` | newly added deps younger than the cooldown surface as `cooldown` warnings. |
| Cooldown (Rust) | crates.io API via `curl` | newly added crates younger than the cooldown surface as `cooldown` warnings. |

"Newly added" means added in the staged diff (`--cached`), or failing that the last commit (`HEAD~1`), of `package.json` / `Cargo.toml`.

For npm, "newly added" is computed **structurally**: the dependency key set (`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`) of the current `package.json` is diffed against the base ref (`lib/npm-new-deps.sh`). A `scripts` entry, formatting change, or any non-dependency key can never be flagged as a new package. Dependency gates diff structured dependency keys — never raw file lines.

## Graceful Degradation

Every check is best-effort. If a tool is missing or the network is unavailable, that check is skipped and listed under "checks skipped", not failed. The script always reports which checks actually ran so you know your coverage. With no `package.json` and no `Cargo.toml`, it exits clean with "nothing to audit".

## Severity Model

- **CVE findings = high, immediate.** Tagged `block` in the manifest. The cooldown does not apply to them. Treat as merge blockers.
- **Cooldown violations = warn.** Tagged `cooldown`. A new dep under the threshold is a caution, not a hard block. Wait out the cooldown or justify an override.
- **Age unknown = info.** Registry offline or package not found. Surfaced so a human verifies manually.

## Inputs

- `CFN_DEP_COOLDOWN_DAYS` (env, default `90`): cooldown window in days.

## Outputs

- Summary to stdout (checks ran/skipped, CVE count, cooldown count).
- When findings are actionable: a manifest at `<project-root>/.cfn-cache/manifests/cfn-dep-audit-<ns>.json` in the shared `cfn-vote-implement` schema (auto-gitignored, nanosecond-precision filename).
- When no findings: a plain report, no manifest.

## Usage

```bash
./.claude/skills/cfn-dep-audit/execute.sh
CFN_DEP_COOLDOWN_DAYS=120 ./.claude/skills/cfn-dep-audit/execute.sh

# route any findings through voting
/cfn-vote-implement latest
```

## Manifest Schema (shared with cfn-vote-implement)

```json
{
  "review_id": "dep-audit-<ns>",
  "source": "cfn-dep-audit",
  "generated_at": "ISO-8601",
  "cooldown_days": 90,
  "suggestions": [
    {
      "id": "S001",
      "category": "cve | cooldown",
      "tag": "block | cooldown | info",
      "one_liner": "lodash: npm audit: high severity advisory",
      "title": "cve: lodash",
      "description": "npm audit: high severity advisory",
      "files": ["package.json or Cargo.toml"],
      "impact": "high | medium | low",
      "effort": "low",
      "suggested_approach": "Apply the fix now. CVE fixes are exempt from the cooldown.",
      "related_suggestions": []
    }
  ]
}
```

## Rules

- Never auto-install, auto-upgrade, or modify a manifest file. Route through `/cfn-vote-implement`.
- A NEW dependency is the last rung of the build ladder. Trivial functionality (a few lines) must not pull a dep. The cooldown buys time for supply-chain attacks to surface.
- Security carve-out: never hand-roll crypto, auth, token/JWT parsing, or input sanitization to dodge a dep. A widely-audited dep wins there, cooldown or not.
- CVE fixes override the cooldown. Take them immediately.

## Related

- `cfn-arch` - the build ladder (YAGNI to NEW dep) that decides whether a dep is even warranted.
- `cfn-tech-debt` - tracks `cfn:` shortcut markers, including "added dep, revisit" notes.
- `/cfn-vote-implement` - votes on and routes the findings.
- `cfn-security-review` - the code-level security gate (this skill is the dependency-level gate).
