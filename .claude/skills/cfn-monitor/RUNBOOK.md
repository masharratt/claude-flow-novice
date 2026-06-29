# CFN Monitor: Incident Triage Runbook

Use this runbook when `execute.sh` exits nonzero or when a deploy health gate fails.
Steps are ordered. Work top to bottom. Stop when you find the cause.

---

## Step 1: Confirm Scope

**Goal:** Is this one endpoint, one service, or widespread?

```bash
# Re-run the health check against all known targets
./.claude/skills/cfn-monitor/execute.sh \
  --target https://<app>.fly.dev/health:200:3000 \
  --target https://<app>.fly.dev/api/status:200:3000 \
  | jq '.'
```

- Only one target failing: likely an endpoint-level bug or a missing route.
- All targets failing on the same host: likely a deploy failure, crash loop, or network issue.
- Multiple unrelated hosts failing: check your network/DNS, not the app.

**Decision point:**
- Scope is a single broken route: jump to Step 4 (check logs for the specific handler).
- Scope is the whole app: continue to Step 2.

---

## Step 2: Check Recent Deploy and Rollback Option

**Goal:** Was the failure introduced by the latest deploy?

```bash
# View recent deploys for this app
fly releases list -a <app-name>

# View current running image
fly status -a <app-name>
```

If the failure started right after a deploy, rollback is the fastest path to recovery.

**Fly.io rollback (use backup scripts, not git checkout per CLAUDE.md):**
```bash
# Roll back to the previous release
fly releases rollback <version> -a <app-name>

# Verify rollback
fly status -a <app-name>
```

After rollback, re-run the health check gate. If healthy: the latest deploy caused it.
File a bug and fix forward before next deploy attempt.

If rollback does not help: the issue predates the deploy (infra or dependency). Continue.

---

## Step 3: Check Application Logs

**Goal:** Find the error at the application level.

```bash
# Stream live logs
fly logs -a <app-name>

# Fetch recent logs (last N lines)
fly logs -a <app-name> | head -100
```

Look for:
- Panic, crash, or unhandled exception at startup (process restarts in a loop).
- 5xx error messages with stack traces.
- "missing env var" or secret-not-found errors (see next step).
- DB connection refused or pool exhausted.

For blog/content services: check for "Missing required Fly secrets" on startup
(per deploy-fly-blog.md conventions: DAILY_SEO_API_URL, DAILY_SEO_API_KEY).

---

## Step 4: Check Configuration and Secrets

**Goal:** Is the app missing required runtime configuration?

```bash
# List secrets set on the app
fly secrets list -a <app-name>

# Check running env (health endpoint often exposes safe config info)
curl -s https://<app-name>.fly.dev/health | jq '.'
```

Common issues:
- Secret set under wrong key name (case-sensitive).
- Secret set at project level but not on the correct app.
- Static-export app: `NEXT_PUBLIC_*` secrets must be build args, not runtime secrets
  (they are baked at build time and runtime secrets have no effect).

Fix:
```bash
fly secrets set KEY=VALUE -a <app-name>
# Fly automatically restarts the app after secrets are set.
```

---

## Step 5: Check Dependencies (DB, Upstream APIs)

**Goal:** Is the problem inside the app or in a service it depends on?

**Database (Supabase/Postgres):**
```bash
# Use the project DB query skill, never raw psql
./.claude/skills/db-query/execute.sh --sql "SELECT 1"
```

If the DB is unreachable, the app is not the primary suspect.

**Upstash Redis:**
- Redis credentials are set as Fly secrets (our own Upstash instance per deploy-fly-blog.md,
  NOT Fly-managed Redis addons).
- Check secret names match what the app expects.

**Upstream API (daily-seo API for blog client sites):**
```bash
# Verify API key is active
./.claude/skills/db-query/execute.sh \
  --sql "SELECT revoked_at FROM daily_seo.project_api_keys WHERE site_id = '<site-id>'"
```

---

## Step 6: Decide: Rollback vs Forward-Fix

Use this decision matrix:

| Situation | Action |
|-----------|--------|
| Failure caused by latest deploy, rollback restores health | Rollback now, fix forward in a new deploy. |
| Failure predates the deploy, DB or infra issue | Do not rollback (won't help). Fix the dependency. |
| App is up but one endpoint is broken | Forward-fix preferred (targeted, no service disruption). |
| Crash loop on startup, unknown cause | Rollback first to restore service, then diagnose offline. |
| Secret or config missing | Add secret via `fly secrets set`, no code deploy needed. |

**Rollback reminder (from CLAUDE.md):** Use backup scripts for code rollback, not `git checkout`.
For Fly deploys, `fly releases rollback <version> -a <app-name>` is the correct path.

---

## Step 7: Post-Incident Comms and Cleanup

**When to communicate:**
- Service was down for more than a few minutes.
- External users were affected.
- A DB migration ran (even if the service recovered).

**Comms checklist:**
- State the impact window (start time to recovery time, UTC).
- State root cause in one sentence.
- State what was done to recover.
- State what is being done to prevent recurrence.

**After recovery:**
```bash
# Run a full health check to confirm clean state
./.claude/skills/cfn-monitor/execute.sh \
  --target https://<app>.fly.dev/health:200:2000 \
  | jq '.targets_fail'
# Must be 0

# Verify blog/content pages if applicable (health alone is insufficient)
curl -s https://<app>.fly.dev/blog | grep -c '<article'
```

**Blameless postmortem:**
- What monitoring gap let this get to production?
- Should the health gate (`cfn-monitor`) have caught it earlier?
- Should additional targets be added to the gate config?
- Update the target list in your deploy script accordingly.

---

## Quick Reference

| Symptom | Most likely cause | First command |
|---------|------------------|---------------|
| All endpoints returning 503 | Crash loop or VM down | `fly logs -a <app>` |
| Correct status but wrong content | Missing env secret | `fly secrets list -a <app>` |
| Only /health passes, API routes fail | Route-level bug in latest deploy | `fly releases rollback` |
| Latency budget breach only | DB slow query or pool exhaustion | DB query skill: `SELECT 1` latency |
| DNS/connection error | Network, not app | Test from a different host |
| Health passes but blog empty | DAILY_SEO_API_URL/KEY missing | `fly secrets list`, then check API key active |
