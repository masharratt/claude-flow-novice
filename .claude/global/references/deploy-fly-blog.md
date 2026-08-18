# Fly.io Deployment + Blog System

Load when deploying to Fly.io, touching the daily-seo blog pipeline, or doing cross-project SEO work. Extracted from `~/.claude/CLAUDE.md` to keep the global guide lean.

## Fly.io Deployment (All Projects)

- **Deploy:** `fly deploy` (or `fly deploy -a <app-name>`)
- **Logs:** `fly logs --app <app-name>`
- **Health:** `curl https://<app-name>.fly.dev/health`
- **Secrets:** `fly secrets set KEY=VALUE -a <app-name>` — runtime env vars only
- **Static builds (Next.js export, Expo web):** `NEXT_PUBLIC_*` / `EXPO_PUBLIC_*` vars must be Docker build args (`ARG`+`ENV` in Dockerfile, `[build.args]` in `fly.toml`). Runtime secrets don't work — static export bakes them at build time.
- Fly retries failed builds automatically. Check build logs, not just exit code.
- **Post-deploy verification is MANDATORY.** `curl` key pages (especially `/blog`) and verify real content. Health checks alone are insufficient — blog pages return 200 OK with "No posts yet" when env vars are missing.
- **No Fly Redis / Fly Upstash addons.** We use our own Upstash instance directly (`trusty-barnacle-5963.upstash.io`). Never provision Fly-managed Redis or Upstash addons. If a project needs Redis, add our Upstash credentials as Fly secrets.

### WSL2 Port Forwarding

WSL2 `localhostForwarding` is unreliable. Use `netsh portproxy`:
```bash
hostname -I | awk '{print $1}'  # Get WSL IP
```
```cmd
netsh interface portproxy add v4tov4 listenport=PORT listenaddress=127.0.0.1 connectport=PORT connectaddress=WSL_IP
netsh interface portproxy show all
netsh interface portproxy delete v4tov4 listenport=PORT listenaddress=127.0.0.1
```
WSL IP changes on restart.

## Cross-Project Deployment Rules

**Blog content flows from daily-seo API to client sites.** The daily-seo project hosts the content pipeline and serves published articles via `/api/v1/blog/*` (API key auth). Client sites fetch and cache via ISR or Rust moka. See `~/.claude/references/blog-api-sites.md` for site inventory and integration details.

**Fly.io app names must be globally unique across all repos.** Never reuse an `app = "..."` value in multiple fly.toml files. Deploying overwrites the existing machine with no warning.

**Trigger.dev project IDs must be unique per repo.** Each repo needs its own `project:` value in `trigger.config.ts`. Deploying from repo A wipes all tasks from repo B if they share a project ID — no warning, instant data loss.

**Auth middleware must exempt SEO routes.** `/sitemap(.*)` and `/robots.txt` must be public. Search engines cannot authenticate.

**Sitemap domain must match GSC property.** `<loc>` URLs must use the custom domain, not `*.fly.dev`.

**`trailingSlash: true` requires canonical normalization.** Next.js with `trailingSlash: true` serves pages at `/path/` but does NOT auto-append the slash to `alternates.canonical` or JSON-LD `url` fields. Mismatched canonical (`/path`) vs served URL (`/path/`) = Google treats the page as non-canonical = "Crawled - currently not indexed" in GSC. Fix: normalize `path` to always end with `/` before building canonical URLs. Affects every `buildPageMetadata` call and any JSON-LD `url` field. Only applies when `trailingSlash: true` — `false` (default) has no issue. Current affected site: `dailylisten.app` (daily-coverage). Fixed in `apps/web/lib/metadata.ts`.

**Never trigger GSC "Validate Fix" the same day as a deploy.** Google crawls within hours and fails validation against a not-yet-recrawled or mid-deploy target. Deploy first, wait 3-4 days for recrawl, then validate. The daily-seo team owns GSC validation across all client sites — coordinate timing with whoever shipped the fix.

**Renaming or deleting a published URL slug requires a redirect entry in the same commit** (301 if moved, 410 if gone). Orphaned slugs are the top recurring SEO regression — they surface in GSC as "page with redirect", "404", or "crawled - not indexed" weeks later. Treat slug edits like schema migrations. The shared `daily_seo.url_redirects` table (nullable `to_path` for 410 since migration 124) is the intended single source of truth; client sites with hand-maintained redirect map files (e.g. daily-coverage `apps/web/lib/*-redirects.ts`) WILL drift until the slug-rename path auto-writes to that table.

## Blog System (ISR + daily-seo API)

Client sites fetch from `daily-seo.fly.dev/api/v1/blog/*` via ISR. Build-time vs runtime env var split breaks silently depending on rendering mode.

- **SSR/ISR apps (`daily-listen-web`):** `DAILY_SEO_API_URL` and `DAILY_SEO_API_KEY` are **runtime Fly secrets** — fetches happen at request time. Set via `fly secrets set ... -a daily-listen-web`. Missing = blog throws at request time (visible in `fly logs`).
- **Static export apps:** `DAILY_SEO_API_URL` and `DAILY_SEO_API_KEY` must be Docker build args. Missing at build time = blog pre-rendered empty. Fix: add to `[build.args]` in `fly.toml` AND as `ARG`/`ENV` in Dockerfile builder stage.
- **Empty blog = silent failure for static sites.** `getAllPosts()` returns `[]` when env vars missing. Page renders "No posts yet" with no error in logs. (SSR apps throw instead — louder, easier to catch.)
- **ISR revalidation is 4h (14400s).** Bad first render caches for 4h. Deploy alone does not bust ISR cache. Force refresh: redeploy with correct build args or use on-demand revalidation. Never increase above 4h without approval.

**Blog deploy checklist (`daily-listen-web` — SSR/ISR):**
1. `fly secrets list -a daily-listen-web` confirms `DAILY_SEO_API_URL` and `DAILY_SEO_API_KEY` are set
2. `curl https://dailylisten.app/blog/` after deploy — confirm articles appear (not "No posts yet")
3. `fly logs -a daily-listen-web` — confirm no "Missing required Fly secrets" errors on startup
4. Verify API key active: `SELECT revoked_at FROM daily_seo.project_api_keys WHERE site_id = '...'`

**Blog deploy checklist (static export sites):**
1. `fly.toml` has both vars in `[build.args]`
2. Dockerfile builder stage has matching `ARG` + `ENV`
3. `curl /blog` after deploy — confirm articles appear
4. Verify API key active: `SELECT revoked_at FROM daily_seo.project_api_keys WHERE site_id = '...'`
