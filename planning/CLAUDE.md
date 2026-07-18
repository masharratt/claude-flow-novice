# planning/ — CFN Loop planning artifacts

Execution reports and planning docs, organized to mirror the CFN Loop model: **Phase > Sprint > Loop**.

## Directory hierarchy

```
planning/
├── phases/                       # phase reports (PHASE_N_*.md)
│   └── sprints/                  # SPRINT_N.M_*.{md,json}
│       └── loops/
│           ├── loop2-validation/     # LOOP2_*.json validator consensus
│           └── loop4-product-owner/  # loop4-*.md / *_LOOP4_*.json GOAP decisions
├── reports/{completion,validation,performance,security}/
├── guides/                       # implementation/operational guides
├── documentation/                # research, integration, reference
├── cfn-loop/                     # flow diagrams, process docs
└── archive/                      # outdated files, manual review before deletion
```

## File placement (by artifact + producing loop)

| Artifact | Location | Naming |
|----------|----------|--------|
| Phase report (Loop 0/1) | `phases/` | `PHASE_{n}_{desc}.{md,json}` |
| Sprint summary (Loop 1/3) | `phases/sprints/` | `SPRINT_{n}.{i}_{desc}.{md,json}` |
| Loop 2 validation | `phases/sprints/loops/loop2-validation/` | `{PHASE\|SPRINT}_*_LOOP2_*.json` |
| Loop 4 PO decision | `phases/sprints/loops/loop4-product-owner/` | `{PHASE\|SPRINT}_*_LOOP4_*.json` |
| Cross-phase report | `reports/{category}/` | `{SCOPE}_{TYPE}_REPORT.json` |
| Guide | `guides/` | `{TOPIC}_GUIDE.md` |
| Research/docs | `documentation/` | `{TOPIC}_{TYPE}.{md,json}` |
| CFN Loop process | `cfn-loop/` | `cfn-loop-{topic}.md` |

Keep the hierarchy: never place loop artifacts at phase level, never mix phase/sprint/loop in one dir, preserve original hierarchy inside `archive/`.

## Maintenance

- **Archive** (move to `archive/`, keep filename): superseded, outdated, `.backup-*`, or unreferenced files. Never archive active phase/sprint/loop artifacts, current guides, or reports <3 months old.
- **Delete immediately:** verified duplicates, empty/placeholder files, test artifacts not in `reports/`.
- **Never delete without review:** Loop 2 validations, Loop 4 decisions, security audits, performance baselines.
