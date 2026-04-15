---
name: cfn-plan-review
description: "Post-planning completeness review. Extracts implicit assumptions, traces dependencies, analyzes blast radius, and surfaces gaps before implementation begins. Use after writing any plan that touches data, APIs, or shared state."
version: 1.0.0
tags: [planning, review, completeness, dependencies]
status: production
---

# CFN Plan Review

**Purpose:** Catch what plans miss. Plans fail when they scope from the task description instead of from the system. This skill forces investigation of what the plan takes for granted.

## When to Use

Run after any plan is written and before implementation begins. Especially critical for:
- Database migrations or schema changes
- Cross-project data movement
- API contract changes
- Service decomposition or consolidation
- Any plan where "just move X" is the framing

## Protocol

### Phase 0: DRY & Modularity Check

Before reviewing completeness, apply the DRY and modularity rules from `~/.claude/rules/code-quality.md` (DRY & Modularity section) to the plan:

- Does the plan introduce logic that already exists elsewhere?
- Does it touch 8+ files? If so, pause and verify minimum viable scope.
- Are there shared types, schemas, or constants that need a single source of truth?
- Does any multi-file feature have a shared orchestrator, or are there multiple entry points?

Surface any violations as numbered findings in Phase 5. Do not duplicate the rules here — consult `code-quality.md` directly.

### Phase 1: Assumption Extraction

Before extracting assumptions, query the decision log for prior plans involving the same entities: `~/.claude/skills/decision-log/query.sh '<entity-names>' 5 <project>`. Prior failed assumptions from past plans should be checked first.

Read the plan and extract every implicit assumption into an explicit, testable statement.

Common hidden assumptions:
- "This entity is self-contained" (it almost never is)
- "Nothing else reads/writes this table" (check for views, functions, cron jobs, other services)
- "The schema matches what I expect" (dump it and verify)
- "This API is only called by one consumer" (grep for the endpoint across all projects)
- "The data fits in memory / can be migrated in one pass" (check row counts)
- "Existing data is clean and consistent" (check for nulls, orphans, constraint violations)
- "My custom header reaches the backend" (check proxy/gateway header whitelists; Next.js catch-all routes, nginx, and API gateways silently strip unknown headers)

Output format:
```
## Assumptions
1. [UNTESTED] Listings table has no FK dependencies on other tables
2. [UNTESTED] No other service writes to the golfer_profiles table
3. [VERIFIED] The target database already has the uuid-ossp extension
```

Each assumption is UNTESTED until explicitly verified by querying the system.

### Phase 2: Dependency Trace

For every entity the plan touches (table, API, module, config), trace dependencies in both directions:

**Inbound (what does this entity need to exist?):**
- FK references to other tables
- Required lookup/reference data
- Config values, environment variables
- Shared types or schemas it imports
- Services it calls

**Outbound (what depends on this entity?):**
- Other tables with FKs pointing here
- Views, functions, triggers that reference it
- Services that query or subscribe to it
- Cron jobs, pipelines, background workers
- Frontend code that renders its data
- API consumers (internal and external)

**For API/HTTP changes, also check the request path:**
- Does the request pass through a reverse proxy, API gateway, or frontend proxy before reaching the backend? (e.g., Next.js catch-all route, nginx, Cloudflare Workers)
- Does the proxy have a header whitelist? Custom auth headers (X-Research-Key, X-Custom-Auth, etc.) are silently stripped by proxies that only forward known headers. This causes 401s that are impossible to reproduce when testing the backend directly.
- Are there middleware layers (CORS, CSRF, auth) mounted at the router level in server.ts that don't appear in the route file itself? Check `app.use()` calls, not just per-route middleware.

For database operations, the investigation MUST include:
```sql
-- Trace FKs pointing TO this table
SELECT conrelid::regclass, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE confrelid = 'target_table'::regclass;

-- Trace FKs pointing FROM this table
SELECT confrelid::regclass, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'target_table'::regclass AND contype = 'f';

-- Check for views referencing this table
SELECT viewname FROM pg_views
WHERE definition LIKE '%target_table%';

-- Check for functions referencing this table
SELECT proname FROM pg_proc
WHERE prosrc LIKE '%target_table%';
```

Output format:
```
## Dependency Graph: listings

### Needs (inbound)
- golfer_profiles (FK: listings.golfer_id -> golfer_profiles.id)
- courses (FK: listings.course_id -> courses.id)
- listing_types (FK: listings.type_id -> listing_types.id)
- pricing_tiers (referenced in listings.compute_price())

### Needed By (outbound)
- listing_images (FK: listing_images.listing_id -> listings.id)
- bookings (FK: bookings.listing_id -> listings.id)
- search_index (materialized view, refreshes from listings)
- daily-seo cron job (reads listings for sitemap generation)
```

### Phase 3: Blast Radius

Answer: "If we ship exactly this plan and nothing else, what breaks?"

For each dependency found in Phase 2, evaluate:
1. Is it covered by the plan? (explicitly handled)
2. Is it out of scope but safe? (no impact from this change)
3. Is it a gap? (will break if not addressed)

Output format:
```
## Blast Radius

### Covered by plan
- listings table migration [Phase 2 of plan]
- listing_images migration [Phase 3 of plan]

### Safe (no action needed)
- search_index view (will be recreated in target DB)

### GAPS (will break)
- golfer_profiles table NOT in migration plan but listings FK requires it
- pricing_tiers NOT in plan but listings.compute_price() references it
- bookings table NOT in plan but has FK to listings
```

### Phase 4: Edge Cases

Surface scenarios the plan does not address:
- What happens to in-flight data during migration? (rows written between snapshot and cutover)
- What happens to orphaned records? (FKs that reference deleted rows)
- What is the rollback path if migration fails halfway?
- Are there data volume concerns? (100 rows vs 10M rows changes the approach)
- Are there ordering constraints? (table A must exist before table B due to FKs)
- Does the plan assume downtime? If not, how is consistency maintained?

### Phase 5: Findings Summary

Present all gaps and untested assumptions as numbered questions, one per issue. Each question includes:
- What was found
- Why it matters
- A recommended action

Format:
```
## Plan Review Findings

1. **golfer_profiles table missing from migration**
   The listings table has an FK to golfer_profiles.id. Migrating listings without golfer_profiles will fail on insert due to FK constraint violation.
   Recommendation: Add golfer_profiles to migration scope, execute before listings.

2. **Assumption untested: no other service writes to listings**
   The plan assumes daily-seo is the only writer. If golfer-collective still has write access during migration, data will diverge.
   Recommendation: Verify by checking database connection logs or revoking golfer-collective write access before cutover.
```

## Integration

- Run after `/write-plan` or any Plan Mode session
- Feeds into cfn-investigate if gaps reveal deeper issues
- Log significant findings to cfn-knowledge-base for future reference
- Works with any project type (not database-specific, but database examples are most common)

## What This Skill Does NOT Do

- Does not rewrite the plan. It reviews and surfaces gaps.
- Does not make scope decisions. It presents findings; the user decides.
- Does not run migrations or make changes. It is read-only investigation.
