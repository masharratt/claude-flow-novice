# Nitpicky public repo (masharratt/nitpicky-ui)

The nitpicky skill is a standalone public product, not CFN repo content.

- Source of truth: `~/projects/nitpicky` = `https://github.com/masharratt/nitpicky-ui` (public).
- Claude Flow Novice's `.claude/skills/nitpicky` is only a relative symlink to `~/projects/nitpicky`; `~/.claude/skills/nitpicky` resolves through the whole-dir skills link to the same place. Runtime paths are unchanged.

## Committing

- **Commit code changes inside `~/projects/nitpicky`** — its own git, its own CI (shellcheck + `tests/test-nitpicky.sh` + `tests/test-cli-adapters.sh`; optional browser suite `node tests/test-portal-ui.cjs` with `PLAYWRIGHT_MODULE` / `CHROME_PATH` env hooks pointing at any Playwright install + Chrome).
- The CFN repo commits only if the symlink itself changes — pathspec commit form (`git commit <paths>`, never a bare `git commit` on a shared index).
- Verify before pushing: both suites green, no internal project names, no credentials, em dashes banned in README and portal copy.
- Portal UI work: edit `src/nitpicky/assets/template.html`, then regenerate any served page with `nitpicky merge --run-dir <dir>` — review pages inline the payload at merge time and go stale.

## Layout

- `src/nitpicky/` — implementation package (merge, checklist, portal, scaffold, adapters, cli)
- `lib/` — shims + agent contracts (`lenses.md`, `findings-schema.md`) kept for skill-path compatibility
- `schema/lens-findings.schema.json` — published contract for findings producers
- `examples/demo-run/` — pre-triaged tour run (`nitpicky review examples/demo-run`)
- Version history in `SKILL.md`; user-facing notes in `CHANGELOG.md`
