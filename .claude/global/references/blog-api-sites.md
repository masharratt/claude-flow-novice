# Blog API Site Inventory

daily-seo (`/api/v1/blog/*`) is the central content API. Client sites authenticate with `X-API-Key` header (SHA-256 hashed in `daily_seo.project_api_keys`).

## Sites

| Site | Domain | Fly App | Integration | Cache |
|------|--------|---------|-------------|-------|
| daily-seo API | daily-seo.fly.dev | daily-seo | Source of truth | N/A |
| daily-seo marketing | daily-seo-marketing.fly.dev | daily-seo-marketing | Hardcoded static posts | Build-time |
| dailyautomations.ai | dailyautomations.ai | daily-automations | Next.js ISR | 4h |
| dailydashboards.ai | dailydashboards.ai | daily-dashboards | Next.js ISR | 4h |
| dailyreach.ai | dailyreach.ai | dailyreach | Next.js ISR | 4h |
| dailylisten.app | dailylisten.app | daily-listen | Next.js ISR | 4h |
| fireside.family | fireside.family | firesidefamily-web | Rust axum + moka | 72h stale fallback |
| asked.team | asked.team | asked-marketing | Next.js ISR | 4h |
| dailytodos.app | dailytodos.app | (not deployed) | Supabase direct | N/A |

asked.team: site_id `14db3ba5-8250-4de8-b60a-7877ea1e93c0`, project_name `daily-interview` (legacy, from dailyinterview->asked.team rename). Consumer = `apps/marketing` in monorepo `~/projects/asked-team`. 31 articles live since 2026-06-14.

Note: `daily-automations-blog-sync` worker was removed (redundant). dailyautomations uses ISR like other sites.

## API auth

Keys stored as Fly secret `DAILY_SEO_API_KEY`. DB table: `daily_seo.project_api_keys` (hashed with SHA-256). To rotate:

```bash
KEY=$(openssl rand -hex 32)
HASH=$(echo -n "$KEY" | sha256sum | awk '{print $1}')
# Real cols: id, key_hash, site_id, project_name, rate_limit_per_hour, created_at, revoked_at, last_used_at (no key_prefix/name)
# Update DB: UPDATE daily_seo.project_api_keys SET key_hash = '$HASH' WHERE site_id = '...';
# Update Fly: fly secrets set DAILY_SEO_API_KEY="$KEY" --app <app-name>
```

## JSON-LD schema

API generates schema via `buildJsonLd()` in `src/api/blog/blog.types.ts`. Client sites use the API-provided `schema` field with local fallbacks. Google requires: `publisher`, `headline`, `datePublished`, `author`. Recommended: `mainEntityOfPage`, `image`, `wordCount`, `dateModified`.

## Known failure modes

1. **Shared Fly app name**: Two fly.toml with same `app =` overwrites machines on deploy
2. **Invalid API key**: Blog silently shows empty (fix: throw on non-200, not return `[]`)
3. **ISR caches empty responses**: If API is down during ISR revalidation, empty page cached for hours
4. **NEXT_PUBLIC_* in sitemaps**: Build-time inlining ignores runtime secrets. Use `APP_URL` instead
5. **Auth blocking sitemaps**: Middleware must whitelist `/sitemap(.*)` and `/robots.txt`
