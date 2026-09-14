# cfn-wiki Rollout

Adopt per repo by config only. The skill lives in this repo (`.claude/skills/cfn-wiki/`) and is reachable in every project via the `~/.claude/skills` reverse symlink.

## Per-repo adoption

1. Create `.wiki/config.json` in the target repo:

   ```json
   {
     "cbm_binary": "/tmp/cbm-test/codebase-memory-mcp",
     "features_glob": "apps/*",
     "features_dir": "readme/wiki/",
     "browser": "vscode",
     "coupling_commits": 500,
     "include_data_in_md": true
   }
   ```

   Only `cbm_binary` is normally needed (doctor finds the binary; other keys
   default). `browser` defaults to VS Code Simple Browser; `"system"` opens
   the OS default browser instead. `include_data_in_md: false` keeps ERD/RLS
   detail out of the committed md (for any repo that may go public).
   `features_glob` (monorepos): re-roots features at the matching dirs
   (fnmatch, shallowest match wins; e.g. `"apps/*"` -> fid `apps-attendee`)
   instead of top-level dirs; unset = top-level rule.

Large repos: the default single-file portal grows roughly 6.5x per 10x
tracked files (measured in `planning/cfn-wiki/SCALE_report.md`; 1.2 MB at
10k files). Switch big repos to `wiki build <repo> --paged` (small shell
plus per-view and per-feature pages; navigable from `file://` without a
server) and benchmark adoption first with `tests/wiki-scale-bench.sh`
(defaults to 1k/10k tiers; `WIKI_SCALE_MAX=100000` enables the top tier).

2. Install the CBM binary once per machine: `wiki doctor --install`
   (pinned v0.10.8, portable linux-amd64 build into `~/.local/share/cfn-wiki/`).

3. First sync — ORDER MATTERS (import refuses GENERATED files):

   ```bash
   WIKI_DOCTOR_REPO=<repo> bash $HOME/.claude/skills/cfn-wiki/lib/wiki.sh doctor
   bash $HOME/.claude/skills/cfn-wiki/lib/wiki.sh import-existing <repo>
   bash $HOME/.claude/skills/cfn-wiki/lib/wiki.sh sync <repo> --enrich
   bash $HOME/.claude/skills/cfn-wiki/lib/wiki.sh build <repo>
   bash $HOME/.claude/skills/cfn-wiki/lib/wiki.sh serve <repo>
   ```

   Import converts hand-written `readme/feature-status.md` /
   `readme/state-machines.md` rows into `wiki:enrich` blocks (unmatched rows
   land in an "Imported notes" appendix — zero content loss). Run it BEFORE
   the first sync, on clean git tree.

4. Hooks (optional per repo): add a `hooks.SessionStart` warn entry to the
   repo's `.claude/settings.json` running
   `.claude/skills/cfn-wiki/lib/staleness-notify.sh`. Note:
   `.claude/hooks.json` is inert — never wire hooks there (verified: zero
   consumers). This repo's `.claude/settings.json` is gitignored, so the hook
   entry is per-machine; add it manually on new machines.

## Next repos (proposed)

| Repo | Notes |
|---|---|
| `~/projects/daily-agents` | has db-query skill; data view will be live immediately |
| `~/projects/fireside-family` | nitpicky precedent; largest readme set |
| `~/projects/keystone` | |

## Rollback runbook

| Layer | Undo |
|---|---|
| Generated md | Restore the pre-edit backup; preserve authored knowledge and reader notes. |
| Working state | `rm -rf <repo>/.wiki` |
| Skill | remove `.claude/skills/cfn-wiki/` in this repo (global symlink means every project loses it) |
| CBM | `rm -rf ~/.cache/codebase-memory-mcp ~/.local/share/cfn-wiki` |
| Hooks | remove the SessionStart entry from `.claude/settings.json`; drop the husky append block |

## Known wart

A commit that adds/renames a feature dir flips the fingerprint, so CI runs
red on that exact commit until the follow-up `wiki sync` commit — the husky
regen is post-commit by design (it can never block or rewrite a commit).
Run `wiki sync` and review the generated diff. Commit only when the task authorizes it.

## Deferred decisions (from planning/cfn-wiki/REVIEW_cfn-wiki.md)

- Authoring: read AUTHORING.md and track capabilities in readme/wiki/knowledge.json. Manual enrichment remains a source-review task.
- CBM pinned v0.10.8; upgrade trigger: CVE in its parsing stack or a needed graph feature; re-run `wiki doctor` after.
- CodeSearch join deferred; trigger: entity-level pages need richer symbols than CBM nodes.
- `include_data_in_md` flips if any wiki'd repo becomes public.
