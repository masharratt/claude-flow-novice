# Project Port Assignments

Load when starting a dev server or debugging a port conflict. Extracted from `~/.claude/CLAUDE.md`.

| Project | Frontend Ports | Backend Ports (local) |
|---------|----------------|------------------------|
| fireside-family | 3100-3109 (web), 3002 (mobile Expo) | 8090 gateway, 8082 api-core, 8081 voice, 8085 media, 8087 graph |
| daily-platform | 3200-3209 | |
| daily-interview (asked-team) | n/a | **8092** (orchestrator node; moved off 8080 which the local daily-recall Rust gateway holds). Set via `PORT=8092` in root `.env`. |
| daily-todo | 3300-3309 | |
| daily-automations | 3050-3059 (3050 = Next.js frontend + Playwright) | 8081 (Rust Axum backend) |
| daily-reach | 3070-3079 (Docker) | |
| daily-seo | 3400-3409 | |
| daily-career | 3500-3509 | |
| daily-coverage | 3600-3609 | |
| daily-dashboards | 3700-3709 | |
| keystone | 3810-3819 (3810 = Next.js web) | |
| daily-drones | 3900-3909 (3900 = vite viewer, 3901 = viewer WS / axum) | |
| ggi-work | 4100-4109 (4100 = invite-builder vite + Playwright, 4101 = docs site, 4102 = gg-all-projects apps/attendee + Playwright, 4103 = gg-all-projects apps/internal) | |

## Supabase local stack port bands

`supabase start` claims a contiguous band per project, keyed off `project_id` in that project's `supabase/config.toml`. Two projects sharing a band cannot both run. Observed on this machine 2026-08-19 by scanning running containers and every `config.toml` in `~/projects*`:

| Band | Project | Notes |
|---|---|---|
| 54321-54327 | keystone | default band, claimed by whichever project omits an explicit band |
| 54341-54347 | gg-app (The Loop) | `apps/attendee/supabase/config.toml` in gg-all-projects is a stale copy that also declares this band and would collide |
| 54421-54427 | NYSDRA | |
| 54532 | gg-slack-scratch-pg | bare `postgres:17` container, not a Supabase stack: no auth, storage or extensions schema, no anon/authenticated/service_role roles, no citext. Cannot host a migration rehearsal |
| 54533 | da-scratch | same shape as above |
| 54641-54647 | gg-loop-old | a real local Supabase stack, used to confirm what a full stack provides |
| 54721-54729 | ggi-curve26 (gg-all-projects `packages/db`) | reserved. 54721 api, 54722 db, 54723 studio, 54724 inbucket, 54727 analytics. This is the migration-rehearsal and integration-test target for the Curve 2026 build |

A bare Postgres container is not a substitute for a local Supabase stack when the migration under test creates policies, storage buckets or role grants. It fails on the first statement that names `auth`, `storage` or `service_role`.

## Graph DB (Memgraph) bolt/web port assignments

Multiple projects run their own Memgraph container. Bolt defaults to 7687. Assign distinct host ports to avoid the wrong-DB hang (codesearch silently connected to fireside-memgraph for 7 weeks because both used 7687, leaking memory on every commit).

| Container | Bolt (host) | Web (host) | Owner |
|-----------|-------------|------------|-------|
| fireside-memgraph | **7687** | 7474 (→7474) | rust-services / fireside |
| codesearch-memgraph | **7689** | 7476 (→7474) | CodeSearch indexer |
| seo-memgraph-local | **7691** | 7445 (→7444) | daily-seo |

- CodeSearch hooks/skills point at **7689** (`cfn-post-commit-codesearch-index.sh`, `index-code.sh`, `index-all-projects.sh`, `sync-memgraph.sh`). Override via `CODESEARCH_MEMGRAPH_URL`.
- `daily-seo` memgraph moved 7689→**7691** in `docker-compose.local.yml` (was colliding with codesearch-memgraph). Recreated via `docker compose up`; data volume `daily-seo_memgraph_local_data` preserved.
- CodeSearch Qdrant: REST **6333**, gRPC **6334** (`codesearch-qdrant`).
- CodeSearch backends were stopped ~2026-03-27 and (correctly, per `unless-stopped`) stayed down; the post-commit hook then hung on missing backends for 8 weeks, leaking indexers. Hook now has a `timeout` guard + the session-start reaper kills stuck indexers. If search breaks, first check both backends are up: `docker ps | grep codesearch`.

**Port conflict notes:**
- `daily-automations` had no assigned range and defaulted to Next.js `3000`, which two other local projects also bind. Playwright's `reuseExistingServer` only probes for HTTP 200, so it cannot tell one app from another: on 2026-08-12 the whole lineage e2e suite ran against a different project's static file server. Its "File not found" page has no badges and no table, so the accessibility and contrast specs passed while proving nothing. Moved to `3050` and pinned in `frontend/playwright.config.ts`. Lesson: a project with no assigned port is a silently-wrong-target waiting to happen; assign one before writing e2e specs.
- `8080` held locally by the daily-recall Rust gateway (health body shows `api-core`/`voice-realtime`). `daily-interview`/asked-team orchestrator moved to `8092` (root `.env` `PORT=8092`) to avoid it. Fireside API Gateway is on `8090` locally (prod still binds 8080 inside container). Prod asked-orchestrator (Fly) still listens 8080 inside its container; the `PORT` override is local-dev only.
