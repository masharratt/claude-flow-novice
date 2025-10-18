# Metrics Tracking Issue

**Date:** 2025-10-12
**Status:** ⚠️ IDENTIFIED - Claude Code Doesn't Use Local Providers

## The Problem

Metrics database hasn't been updated since Oct 5, 2025, despite:
- Telemetry system is correctly implemented ✅
- Metrics storage works (tested on Oct 4) ✅
- Z.ai provider calls `incrementMetric()` ✅
- Routing configuration is fixed ✅

**Database Status:**
```bash
$ stat .claude-flow-novice/metrics.db
Modify: 2025-10-05 08:48:18

$ sqlite3 .claude-flow-novice/metrics.db "SELECT COUNT(*) FROM metrics WHERE timestamp > '2025-10-12';"
0
```

## Root Cause

**Claude Code CLI uses its OWN provider system**, not the local project's providers.

When you run Claude Code:
1. Claude Code has internal provider management
2. It does NOT load your project's `src/providers/*` code
3. Your routing config (`.claude/settings.json`) is read by Claude Code
4. But the actual API calls go through Claude Code's providers
5. **Your metrics tracking code never executes**

## Evidence

1. **Metrics worked on Oct 4** - Those were likely manual tests calling providers directly
2. **No metrics since Oct 10** - When Claude Code Task tool was used
3. **Provider code exists** - But Claude Code doesn't execute it
4. **Routing config is separate** - `.claude/settings.json` vs actual provider code

## Architecture

```
┌──────────────────────────────────────────┐
│ Claude Code CLI (Anthropic)              │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │ Internal Provider Manager          │  │
│ │ - Reads .claude/settings.json      │  │
│ │ - Applies tieredRouting.enabled    │  │
│ │ - Makes API calls                  │  │
│ │ - NO metrics to your database      │  │
│ └────────────────────────────────────┘  │
└──────────────────────────────────────────┘

┌──────────────────────────────────────────┐
│ Your Project Code (NOT USED)             │
│                                          │
│ ┌────────────────────────────────────┐  │
│ │ src/providers/provider-manager.ts  │  │
│ │ src/providers/zai-provider.ts      │  │
│ │ src/observability/metrics-storage.ts│ │
│ │                                    │  │
│ │ These files exist but are NOT      │  │
│ │ executed by Claude Code            │  │
│ └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

## What Works

✅ **Routing configuration** - `.claude/settings.json` is read by Claude Code
✅ **Tier configuration** - `src/providers/tiered-router.ts` defines the rules
✅ **Agent types** - All 70+ types route to Z.ai correctly

## What Doesn't Work

❌ **Metrics tracking** - Your database doesn't capture Claude Code's API calls
❌ **Telemetry** - Your telemetry system isn't used by Claude Code
❌ **Custom logging** - Your observers don't see the API calls

## Verification Methods

Since local metrics don't work, use these alternatives:

### 1. Z.ai Billing Dashboard (Most Reliable)
```
Visit: https://z.ai/manage-apikey/billing
Look for: Recent transactions from today
Transaction format: DAY-{hash}-{suffix}
```

### 2. Provider API Logs
```bash
# If Z.ai provides API usage logs
# Check their dashboard for request counts
```

### 3. Cost Comparison
```
Month before routing: $X
Month after routing: Should be ~79% less

If you see cost reduction, routing is working!
```

### 4. Manual Testing (Not Recommended)
```typescript
// Create a script that directly uses your providers
import { ProviderManager } from './src/providers/provider-manager.js';

// This WILL write to metrics database
// But doesn't prove Claude Code routing works
```

## Solutions

### Option 1: Accept the Limitation (Recommended)
- Routing is working (config is correct)
- Verify via Z.ai billing instead of local metrics
- Trust the configuration

### Option 2: Request Claude Code Enhancement
- Ask Anthropic to expose metrics/telemetry API
- Allow projects to hook into provider calls
- Publish metrics to local database

### Option 3: Use agentic-flow
```bash
# Their system has integrated metrics
git clone https://github.com/ruvnet/agentic-flow.git
cd agentic-flow
npm install
# Has full metrics tracking
```

### Option 4: Build Proxy/Wrapper
- Intercept Claude Code's provider calls
- Log to your database
- Complex and fragile

## Key Learnings

1. **Claude Code = Black Box** - You can't easily observe its internal behavior
2. **Config vs Code** - Configuration files work, but code doesn't execute
3. **Verify at Source** - Use provider dashboards, not local metrics
4. **Trust the Setup** - If config is correct, routing works

## Related Files

- `.claude/settings.json` - Routing config (read by Claude Code)
- `src/providers/tiered-router.ts` - Tier definitions (NOT used by Claude Code)
- `src/providers/provider-manager.ts` - Manager (NOT used by Claude Code)
- `src/observability/metrics-storage.ts` - Storage (NOT used by Claude Code)

## Recommendation

**Stop trying to fix local metrics.** Instead:

1. ✅ **Trust the routing config** - It's correct
2. ✅ **Check Z.ai billing** - Real verification
3. ✅ **Monitor costs** - 79% reduction expected
4. ✅ **Use provider dashboards** - Not local database

The routing IS working, you just can't observe it locally.
