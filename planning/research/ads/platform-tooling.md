# Platform Tooling — Meta / TikTok / LinkedIn (June 2026)

**Hard truth:** No OSS MCP does full create-and-launch (campaign → adset → creative upload → launch) for any platform. MCPs = read/analytics + partial write. Real ad creation drops to the official SDK. Pattern: SDK = execution backbone, MCP = conversational read layer, Claude skill = strategy/audit.

---

## Meta (Facebook/Instagram)

### Official Meta MCP + Ads CLI (NEW, April 2026)
- "Meta Ads AI Connectors" — official MCP + Ads CLI, open beta 2026-04-29
- Meta-authenticated, no dev app / API keys / app review needed
- Campaign create/edit, reporting, catalog, signal diagnostics via NL
- Endpoint referenced as `https://mcp.facebook.com/ads` (confirm in Meta setup docs)
- Closed source, Meta-controlled, beta. Lowest-friction entry; dodges App Review.

### MCP servers (verified GitHub)
| Tool | Repo | Stars | Lang | Tools | Auth |
|------|------|-------|------|-------|------|
| Pipeboard (top pick) | https://github.com/pipeboard-co/meta-ads-mcp | ~1k | Python | 42 | Pipeboard token or OAuth; launches PAUSED, confirm-on-write; BSL-1.1→Apache 2029 |
| mikusnuz (widest surface) | https://github.com/mikusnuz/meta-ads-mcp | 53 | TS | 135 (API v25) | env token, MIT |
| GoMarble | https://github.com/gomarble-ai/facebook-ads-mcp-server | 332 | Python | 22 (read-heavy) | user token or broker |
| serkanhaslak | https://github.com/serkanhaslak/meta-mcp | 4 | TS | 77 | dual-header; BUC rate limiting built in |
| hashcott | https://github.com/hashcott/meta-ads-mcp-server | — | — | 54 (opt-in write), Graph v22 | user token |
| ScaleForge | https://github.com/Mike25app/scaleforge-mcp-meta-ads | — | — | 32, Graph v24 | bulk-campaign focused |

### Official SDK (the foundation)
- Python: https://github.com/facebook/facebook-python-business-sdk — `pip install facebook-business` v25.0.0
- Node: https://github.com/facebook/facebook-nodejs-business-sdk

### Gotchas
- **Advantage+ Shopping/App campaigns NO LONGER creatable via API** (v25, all versions by May 19 2026)
- **100 QPS mutation cap** per app+account, independent of tier
- Access tiers: Dev = 300 calls/hr/acct (useless at scale); Standard (App Review) = 100k/hr; Full = enterprise
- Use **non-expiring System User token** (Business Manager) for unattended automation
- "Ads Management Standard Access" renamed → "Marketing API Access Tier" (May 2026)

---

## TikTok

### Reality
**No verified OSS MCP does full ad write.** Ads API ≠ Content Posting API = two separate apps, two creds.

### MCP servers (verified)
| Tool | Repo | Stars | Lang | Scope |
|------|------|-------|------|-------|
| AdsMCP | https://github.com/AdsMCP/tiktok-ads-mcp-server | 38 | Python | OAuth+refresh; README claims write but exposed tools read-leaning — test before relying |
| ysntony (clean read) | https://github.com/ysntony/tiktok-ads-mcp | 36 | Python | read-only, static token, 6 tools |
| caspercrause | https://github.com/caspercrause/TikTokMarketing | 5 | Python | NL query, stale |
| Seym0n (content only) | https://github.com/Seym0n/tiktok-mcp | 172 | JS | subtitles/metadata, NOT ads |

### Official SDK (real write)
- https://github.com/tiktok/tiktok-business-api-sdk — `pip install tiktok-business-api-sdk-official` (`business_api_client`)
- Full write: campaign/adgroup/ACO ad create, creative/video upload, Spark Ads, reporting
- Community wrapper: https://github.com/sns-sdks/python-tiktok

### Hosted posting (not OSS)
- Upload-Post: https://www.upload-post.com/mcp/tiktok/
- Composio: https://composio.dev/toolkits/tiktok

### Gotchas
- **Content Posting API "unaudited" trap:** before ToS audit, max 5 users, all posts forced PRIVATE regardless of request
- Video: MP4/WebM, 3-600s, ~4GB, chunked 5-64MB
- Rate: Content Posting ~6 req/min, 25 posts/day/account
- **Spark Ads auth = creator-generated code (7/30/60/180/365 day), NOT OAuth, expires** — creator must refresh
- No hard delete of creatives (state-change only)

---

## LinkedIn

### Reality
Thinnest/most immature. **Exactly one** actively-maintained OSS MCP does real ads write. Official Marketing API capable but strict approval gate.

### MCP servers
| Tool | Repo | Stars | Scope |
|------|------|-------|-------|
| danielpopamd (best, write-capable) | https://github.com/danielpopamd/linkedin-ads-mcp | 20 | 25 tools, campaign/creative CRUD, lead-gen, analytics; OAuth `rw_ads` |
| insightfulpipe | https://github.com/insightfulpipe/linkedin-ads-mcp-server | 1 | very new |
| radiateb2b (read-only) | https://github.com/radiateb2b/mcp-linkedin-ads | 1 | analytics, vendor-hosted token |

### Official SDK
- Python: https://github.com/linkedin-developers/linkedin-api-python-client (259★, canonical, slow maintenance)
- JS: https://github.com/linkedin-developers/linkedin-api-js-client
- ETL (read): https://github.com/singer-io/tap-linkedin-ads (Singer/Meltano, analytics extraction)

### ⚠️ ToS RISK
- **Scraper libs violate LinkedIn ToS → account ban.** Includes 2.5k-star https://github.com/stickerdaniel/linkedin-mcp-server and the now-deleted `adhikasp/mcp-linkedin`. Useless for ads anyway (no Campaign Manager access). NEVER use on a business account.
- **Marketing Developer Platform approval mandatory + strict** — separate application, verified Company Page, business justification. Weeks; frequently rejected. Apply EARLY.
- `rw_ads` token spends real budget — treat as high-value secret.

### Organic-posting MCPs (NOT ads, wrong API surface)
- https://github.com/Dishant27/linkedin-mcp-server (official API, read-focused) — OK
- https://github.com/souravdasbiswas/linkedin-mcp-server (post creation) — OK

---

## Cross-platform audit skill
- `AgriciDaniel/claude-ads` — https://github.com/AgriciDaniel/claude-ads — 6.5k★, 250+ checks across 7 platforms, advisory only (no API writes)
