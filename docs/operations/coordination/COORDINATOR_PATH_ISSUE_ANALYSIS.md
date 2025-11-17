# Critical Finding: Network Mismatch (Bug #8)

**Date:** 2025-11-14  
**Severity:** CRITICAL  
**Status:** IDENTIFIED  
**Related:** Bug #5 (Image Name Mismatch - FIXED)

## Executive Summary

After applying all 7 fixes from Bug #5 root cause analysis, coordinator still exits silently. New investigation reveals **Bug #8: Network Name Mismatch** - agents spawn on `mcp-network` (hardcoded default) but coordinator/Redis are on `cfn-network` (actual network).

## Root Cause

**orchestrate.sh:622** - Hardcoded wrong network default:
```bash
--network "${NETWORK:-mcp-network}"  # ← BUG: Should be cfn-network
```

**Actual Network:** `cfn-network` (used by coordinator, Redis, all services)  
**Hardcoded Default:** `mcp-network` (doesn't exist)  
**Environment Variable:** `NETWORK` not passed by coordinator-entrypoint.sh

## Required Fix

Update **docker/coordinator-entrypoint.sh:100** to pass network parameter:

```bash
"$ORCHESTRATE_SCRIPT" execute "$TASK_ID" \
    --network "${NETWORK:-cfn-network}" \  # ← ADD THIS LINE
    --redis-host "${CFN_REDIS_HOST:-cfn-redis}" \
    --redis-port "${CFN_REDIS_PORT:-6379}"
```

**IMPORTANT:** Requires coordinator image rebuild after fix.

##Next Steps

1. Fix coordinator-entrypoint.sh
2. Rebuild: `docker build -t cfn-coordinator:v3-alpine-fix -f docker/Dockerfile.coordinator .`
3. Test dashboard build
