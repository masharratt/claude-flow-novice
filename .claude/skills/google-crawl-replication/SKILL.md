---
name: google-crawl-replication
version: 1.0.0
tags: [seo, crawl, googlebot, validation, sitemap, schema, indexability]
status: production
description: "Replicates Googlebot crawl against a live site. Validates robots.txt, sitemap, canonical, schema.org, redirect chains, indexability headers. Catches GSC failures before deploy."
---

# google-crawl-replication

## Purpose

Simulates a Googlebot crawl against a deployed site and reports pass/fail per URL with reason. Replicates the checks Search Console runs so failures surface locally instead of in GSC two weeks after the fact.

Catches the high-recurrence SEO regressions the CFN guide already documents:
- `trailingSlash: true` canonical drift (canonical `/path` vs served `/path/`)
- Orphaned slugs (404 / 410 / "page with redirect")
- Sitemap URL mismatch with custom domain (`*.fly.dev` leaking)
- Auth middleware blocking `/sitemap.xml` / `/robots.txt`
- Schema.org JSON-LD parse failures
- Redirect chains >2 hops (Google stops following at 5; flag at 2)
- Empty pages rendering 200 with "No posts yet" (env var miss)

## Usage

```bash
# Crawl one site (auto-discovers sitemap)
~/.claude/skills/google-crawl-replication/execute.sh --url https://daily-seo.fly.dev

# Crawl with custom sitemap path
~/.claude/skills/google-crawl-replication/execute.sh \
  --url https://dailyseo.ai \
  --sitemap /sitemap.xml

# Crawl a specific URL list (skip sitemap discovery)
~/.claude/skills/google-crawl-replication/execute.sh \
  --url https://dailyseo.ai \
  --urls "/blog/,/about,/pricing"

# Limit URLs sampled from sitemap (default 50)
~/.claude/skills/google-crawl-replication/execute.sh \
  --url https://dailyseo.ai \
  --max-urls 200

# Strict mode: exit non-zero on ANY warning (default exits non-zero only on hard fails)
~/.claude/skills/google-crawl-replication/execute.sh \
  --url https://dailyseo.ai \
  --strict

# JSON output for CI piping
~/.claude/skills/google-crawl-replication/execute.sh \
  --url https://dailyseo.ai \
  --json > crawl-report.json
```

## Checks Performed

| Check | Severity | What It Catches |
|-------|----------|-----------------|
| robots.txt fetchable + parseable | FAIL | Auth middleware blocking SEO routes |
| robots.txt allows Googlebot on sampled URLs | FAIL | Accidental disallow |
| sitemap.xml fetchable + parses | FAIL | Sitemap 404 / malformed XML |
| Sitemap `<loc>` URLs use canonical domain (not `*.fly.dev`) | FAIL | GSC property mismatch |
| URL returns expected status (200 for indexable) | FAIL | Orphaned slugs |
| Redirect chain ≤ 2 hops | WARN | Crawl budget waste |
| Canonical `<link rel="canonical">` present | FAIL | Missing canonical |
| Canonical matches served URL exactly (incl trailing slash) | FAIL | `trailingSlash: true` drift |
| No `<meta name="robots" content="noindex">` on indexable URL | FAIL | Accidental noindex |
| No `X-Robots-Tag: noindex` header | FAIL | Header-level noindex |
| JSON-LD `<script type="application/ld+json">` parses | WARN | Schema syntax errors |
| Page content > 500 bytes (empty page detection) | WARN | "No posts yet" stub renders |
| TTFB < 800ms | WARN | Crawl budget pressure |
| HTTPS (no mixed content in canonical/og:url) | FAIL | Mixed-content downgrade |

Hard FAIL = exit 1 (default). WARN = exit 0 unless `--strict`.

## Output Format

Text mode (default):
```
[PASS] https://daily-seo.fly.dev/                  (200, 240ms, canonical OK)
[FAIL] https://daily-seo.fly.dev/blog/old-slug     (404, expected 200)
       reason: orphaned slug, no redirect in url_redirects
[WARN] https://daily-seo.fly.dev/about             (200, 920ms TTFB, canonical OK)
       reason: TTFB > 800ms

Summary: 47 PASS / 2 FAIL / 1 WARN  (50 URLs / 8.2s)
```

JSON mode: array of `{url, status, ttfb, canonical, expected, actual, severity, reasons[]}`.

## Implementation Notes

- Pure Node, no heavy deps. Uses native `fetch` + minimal regex HTML parsing for canonical/meta/JSON-LD. Adequate for SEO checks; not a full DOM.
- Concurrency: 6 parallel requests (Googlebot polite default).
- User-Agent: `Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)` to replicate cache behavior and Cloudflare bot rules.
- `Accept-Language: en-US,en;q=0.9` to match US desktop crawl.
- Follows redirects manually (max 5) to count chain length.
- Respects robots.txt `Disallow:` rules per User-Agent.

## When to Run

- Before any blog/marketing deploy
- After slug rename or redirect changes
- Before triggering GSC "Validate Fix" (replaces the trial-and-error loop)
- In CI on PRs touching `pages/`, `app/`, sitemap, or redirects

## Hooking Into Deploy Workflow

Add post-deploy step:
```bash
fly deploy && \
sleep 30 && \
~/.claude/skills/google-crawl-replication/execute.sh --url https://<domain> --strict || \
  (echo "Crawl regressed, rolling back"; fly releases rollback)
```

## Related

- `~/.claude/CLAUDE.md` section 4 covers the deploy gotchas this skill validates
- `daily_seo.url_redirects` is the canonical redirect source — orphaned slug FAILs cross-reference against it
