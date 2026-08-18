# readme/ Documentation Index

Annotated catalog of docs in `readme/`. Filenames are kebab-case, category-prefixed.

## Core

- **README.md** — v2 system overview, quick start, skills-first architecture, CFN Loop framework, v1 migration notes.
- **log-skills.md** — skills system: available skills (Redis coordination, agent spawning, CFN Loop validation), development/testing/coordination patterns.

## CFN Loop

- **CFN_LOOP_CHEATSHEET.md** — quick reference: Loops 0-4, mode selection (MVP/Standard/Enterprise), iteration limits, Redis patterns, retry strategies.
- **cfn-loop-flow-diagram.md** — visual execution flow: loop transitions, gate checks, validator coordination.
- **cfn-loop-modes.md** — MVP (0.70/0.80), Standard (0.75/0.90), Enterprise (0.75/0.95); comparison, performance/resource impact.
- **CFN_LOOP_PROMPT_INJECTION.md**, **CFN_LOOP_DOCKER_DEPENDENCY_DIAGRAM.txt** — prompt injection notes, Docker dependency diagram.

## Features & Commands

- **logs-features.md** — full feature catalog: CFN Loop, swarm coordination, SQLite memory, integration standardization, config/usage/metrics.
- **additional-commands.md** — specialized/infrequent commands: fullstack, SPARC, fleet, event bus, enterprise ops, recovery.
- **COMPONENT_NPM_STATUS.md** — npm inventory for 200+ components; implementation verification/coverage.

## API & Integration

- **logs-api.md** — REST API, MCP server APIs (30 tools), CLI APIs, web portal (REST + WebSocket), auth, endpoints, error handling.
- **logs-slash-commands.md** — slash command reference: CFN Loop, fullstack, SPARC, swarm, agent lifecycle; syntax/params/examples.
- **logs-hooks.md** — automation hooks: post-edit pipeline (TDD, security scan, format), lifecycle hooks, git integration.
- **logs-functions.md** — utility functions: memory management, coordination helpers, performance.
- **logs-cli-redis.md** — Redis CLI integration: state management, coordination, pub/sub, swarm recovery.
- **deprecated-logs-mcp.md** — DEPRECATED: historical MCP docs (removed in v2.0.0), migration guide to CLI architecture.

## NPM Distribution

- **command-naming.md** — binary naming to avoid `claude-flow` conflict: `claude-flow-novice` (main), `cfn-*` utilities.
- **npm-distribution-summary.md** — package config (15.3MB, 1401 files), publishing workflow, version management.
- **installation-process.md** — install workflow, postinstall hooks, install methods, troubleshooting (permissions, better-sqlite3, Redis).

## Platform

- **macos-setup.md** — porting CFN to macOS: what the clone omits, bash 3.2 and GNU userland gaps, hardcoded-path rewrites, reverse-symlink layout, verification checklist. Unverified on hardware.

## Indexes & Meta

- **logs-documentation-index.md** — master index / documentation map, overlap analysis, merger recommendations.
- **COMPONENT_INVENTORY_TABLE.md** — table of all features, slash commands, hooks, agents; categorization + npm planning.
- **CHANGELOG.md** — version history, release notes (user-facing, in npm package).
- **BACKLOG.md** — project backlog.

## Related (outside readme/)

- `../CLAUDE.md` — root critical rules and workflows.
- `../planning/` — epic configs and CFN Loop strategies.
- `../config/` — CFN Loop criteria and hook configs.
- `../legacy/readme-v1/` — complete v1 documentation.
