# CodeSearch Index Manifest: claude-flow-novice

Project: `/home/masha/projects/claude-flow-novice`
Last updated: 2026-03-23

## Indexed

| Directory | Types | Files | Entities | Notes |
|-----------|-------|-------|----------|-------|
| `.claude/skills/` | md, sh | ~85 | headings + functions | Skill docs + execute scripts |
| `.claude/agents/cfn-dev-team/` | md | ~67 | headings | Agent profiles |
| `.claude/commands/` | md, sh | ~23 | headings + functions | Command docs |
| `.claude/skills/cfn-codesearch/src/` | rs | ~40 | AST (structs, fns, traits) | Rust source |
| `agents/` | md | ~658 | headings | Agent prompt library |
| `docs/` | md | ~679 | headings | Primary documentation |
| `planning/` | md, sh | ~604 | headings + functions | Sprint/phase/research docs |
| `src/` | ts, js | ~94 | AST (classes, fns, interfaces) | Core TypeScript |
| `.claude/cfn-extras/` | md, sh | ~300 | headings + functions | Extra skills, agents |
| `tests/` | md, sh | ~730 | headings + functions | Test docs + shell scripts |
| `scripts/` | sh, ts, md | ~134 | functions + headings | Operational scripts |
| `packages/web-components/src/` | ts, md | ~52 | AST + headings | Web component source |
| `packages/web-portal/src/` | ts, md | ~198 | AST + headings | Web portal source |
| `.claude/hooks/` | sh, md | ~30 | functions + headings | Hook scripts + docs |
| `docker/` | md, sh, yml | ~89 | headings + functions + YAML keys | Container docs + scripts |
| `lib/` | ts, md | ~17 | AST + headings | Shared TypeScript library |
| `deployment/` | sh, md | ~29 | headings + functions | Deploy scripts + runbooks |

**Total: 258 files, 5,654 entities, 5,346 Qdrant vectors**

## Entity Distribution

| Kind | Count | Source |
|------|-------|--------|
| namespace | 3,426 | Markdown H2/H3 headings |
| module | 1,172 | Markdown H1 headings |
| function | 914 | Shell functions, TS/Rust functions |
| variable | 113 | TS/Rust variables (code only) |
| interface | 17 | TypeScript interfaces |
| class | 9 | TypeScript classes |
| struct | 3 | Rust structs |

## To Index — Low Priority

| Directory | Types | Est. Files | Notes |
|-----------|-------|------------|-------|
| `.claude/helpers/` | sh | 6 | Helper scripts |
| `.claude/cfn-scripts/` | sh | 2 | CFN operational scripts |
| `.claude/skills-database/` | md, sql | 9 | Schema docs |
| `readme/` | md | 27 | README variants |
| `legacy/` | md | 18 | Legacy docs |
| `database/` + `migrations/` | sql | 4 | Schema + migrations |
| `monitoring/` | md, sh, yml | 28 | Alert rules + docs |
| `benchmark/` | md, rs, sh, js | 16 | Performance analysis |
| `config/` | yml, js | 14 | Config descriptors |
| `training/` | md, ts | 7 | Training guides |
| `templates/` | ts, md | 2 | Template files |
| `epics/` | md | 3 | Epic planning docs |
| `examples/` | sh, md | 2 | Example scripts |

## Excluded

| Directory | Reason |
|-----------|--------|
| `dist/` | Build output (js + sourcemaps) |
| `.git/` | Git objects |
| `node_modules/` | Dependencies |
| `coverage/` | Generated test coverage |
| `.claude/backups/` | Timestamped file backups (duplicates) |
| `.claude/core/` | Compiled JS + sourcemaps |
| `.claude/cfn-config/` | Single JSON config |
| `.claude/cfn-data/` | Empty / runtime DB |
| `.fastembed_cache/` | Model cache (binary) |
| `.secrets/` | Credentials — never index |
| `.ruvector/` | SQLite binary files |
| `packages/*/dist/` | Built output |
| `shellcheck-v0.8.0/` | Binary distribution |
| `index/` | Vector store binary artifacts |
