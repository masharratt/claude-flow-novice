# planning/ — CFN Loop planning artifacts

Execution reports and planning docs. Swept 2026-09-25: everything completed
or superseded moved to `archive/` (see below); root now holds only active work.

## Current layout

```
planning/
├── fleet-jev-shadow/, fleet-jev-batch2/  # active cfn-fleet run dirs (briefs/,
│   # goal.txt, roster.tsv tracked; .roster.lock, .watch.state, files/,
│   # handoffs/ are untracked runtime, gitignored)
├── cfn-wiki/                             # SCALE_report.md cited by the cfn-wiki skill
├── *decisions_ledger*                    # live manifest-track artifacts (PLAN/SPEC/ARCH/
│   # PSEUDO/TEST/VERIFY/OPS/MEGAPLAN/REVIEW/DECISIONS + bless/verify sidecars)
├── SPEC-cfn-fleet.md, HANDOFF_cfn-fleet-engines.md, local.md
└── archive/                              # the one canonical archive root
    └── completed/                        # folded 2024-2025 era dir (was planning/completed/)
```

Gitignored legacy dumps still on disk, not in git: `global/`, `legion/`,
`side-projects/`.

## Archive policy

- **Archive** (move to `archive/`, keep filename and internal structure): superseded,
  outdated, `.backup-*`, or unreferenced files, plus finished work once its
  handoff/reports are distilled into tracked docs. Never archive active run dirs,
  live manifest tracks (decisions_ledger family), or reports cited by live
  skills/tests.
- **Delete immediately:** verified duplicates, empty/placeholder files, test
  artifacts not in a reports dir.
- **Never delete without review:** Loop 2 validations, Loop 4 decisions, security
  audits, performance baselines.
- The pre-2026 phase > sprint > loop hierarchy (phases/, sprints/, reports/,
  guides/, documentation/) lives on under `archive/`; historical placement rules
  for those artifacts applied only to that era and are preserved in
  `archive/README.md`.
