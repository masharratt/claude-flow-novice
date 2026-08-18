#!/usr/bin/env bash
# Reap orphaned MCP server processes left over from dead claude sessions.
#
# Each `claude` session spawns its own MCP stack (playwright-mcp, supabase-mcp,
# sequential-thinking, etc). When a claude session dies without clean shutdown,
# those MCP node procs reparent to init (PPID 1) and hold 100-200MB each. Over
# a day of opening/closing terminals, this stacks to 1-3GB of pure leak.
#
# Rule: an MCP node proc whose PPID is 1 is orphaned by definition — its parent
# claude died. Kill on sight (after a short grace period for reparent race).
#
# Match against /proc/PID/cmdline (full args), since basename is always "node".

set -euo pipefail

AGE_MIN=${REAP_MCP_AGE_SECONDS:-60}  # 60s grace for legitimate reparent race
LOG="/tmp/reap-orphan-mcp.log"

# Signatures for MCP servers we know launch as node + npx pkgs.
# Add new MCP server packages here as they appear.
MCP_REGEX='@modelcontextprotocol/server-sequential-thinking|@playwright/mcp|playwright-mcp|@supabase/mcp-server-supabase|mcp-server-supabase|mcp-server-sequential-thinking|@modelcontextprotocol/server-'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

killed=0
while read -r pid ppid etimes; do
    [ "$ppid" = "1" ] || continue
    [ "$etimes" -gt "$AGE_MIN" ] || continue

    cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || echo "")
    [ -z "$cmdline" ] && continue

    if echo "$cmdline" | grep -qE "$MCP_REGEX"; then
        log "KILL orphan MCP pid=$pid age=${etimes}s args=${cmdline:0:160}"
        kill -9 "$pid" 2>/dev/null && killed=$((killed + 1)) || true
    fi
done < <(ps -eo pid=,ppid=,etimes=)

[ "$killed" -gt 0 ] && log "Reaped $killed orphan MCP proc(s)"
exit 0
