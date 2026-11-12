# Stack-Specific Rules (Rust, Docker, Supabase)

Load when: building Rust, building or deploying a Docker image / Next.js app, querying or migrating a Supabase database, adding a DB table, writing an HTTP handler, or writing SQL.

## Rust builds go on disk, never in RAM

Never set `CARGO_TARGET_DIR` to `/dev/shm` or `/run/shm` (RAM-backed; debug targets reach 20+ GB and filled WSL RAM + swap on 2026-09-25). Use `/tmp/<name>-target` (Linux ext4). Never `/mnt/d/...` either: slow 9p IO and it has served stale rlibs as fresh (caused a day of false conclusions). `cargo clean` the target dir when a build arc finishes.

## Docker & Build

- Next.js pages that query a database must be marked `force-dynamic` or wrapped in try/catch for Docker builds (no DB at build time).
- Test Docker builds locally before deploying. Never iterate via deploy-fail cycles.
- Alpine images: POSIX sh only. No bash, no GNU sed features.

## Supabase Database Access

- `DATABASE_URL` from `.env` (pooler, IPv4). `SUPABASE_DIRECT_CONNECTION` is IPv6, may fail in WSL2.
- **NEVER `source .env`** (multi-line tokens break bash). Extract: `grep '^DATABASE_URL=' .env | cut -d'=' -f2-`
- **DB queries:** use `./.claude/skills/db-query/execute.sh --sql "..."` (`--schema X` optional). Never raw psql. Handles `pool_size`/`search_path`.
- **Local stacks on a server are published on every address.** `supabase start` binds `0.0.0.0` and `[::]` with the default database login, and Docker-published ports skip ufw. Before calling a server stack exposed or safe, read the `DOCKER-USER` chain (`sudo iptables -S DOCKER-USER`, `ip6tables` too); `/etc/ufw/after*.rules` are root-only, so a non-sudo read prints nothing. Per-server state and the 2026-11-12 check: `project-ports.md`, "Public exposure on the VPS".
- **After every migration:** `db-query` auto-refreshes via the `cfn-post-migration-sync` PostToolUse (Bash) hook, which detects apply commands (`supabase db push`, `psql -f migrations/*`, `prisma`/`alembic`/`rails`/`sqlx` migrate, `manage.py migrate`, golang `migrate ... up|down`) and runs `supabase-schema-sync`. No-ops in projects without `.env` `DATABASE_URL`. Manual fallback: `~/.claude/skills/supabase-schema-sync/execute.sh`.

## Database and HTTP security (moved from CLAUDE.md Security, 2026-10-28)

- New database tables MUST have Row Level Security (RLS) policies before deployment
- HTTP responses must include security headers (HSTS, CSP, X-Frame-Options) via shared middleware
- SQL queries must use explicit schema qualification or connection-level schema setting. Never rely on search_path defaults.

## Cargo flags across shells
- Do not store a multi-package cargo argument list in an unquoted string: zsh does not split it. Use explicit flags or a bash script with an argument array and `"${args[@]}"`.
- Verify the command actually reached its intended tests; an immediate package-ID argument error is not a code failure.
