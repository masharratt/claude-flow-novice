#!/usr/bin/env bash
# Reap leaked background workers that hang and burn CPU/RAM.
#
# Two independent leak classes, two rules:
#
# RULE A — orphaned test workers (jest/vitest/playwright):
#   A test worker is ALWAYS a child of its runner; runners never daemonize.
#   A worker whose parent is init (PPID 1) is orphaned -> runner died -> leaked.
#   Require age > TEST_AGE_MIN to avoid a brief reparent race.
#   We match specific worker entrypoints, never plain "node", so an active
#   test run (workers still parented to the runner) is never touched.
#
# RULE B — stuck CodeSearch indexers (local-codesearch ... index):
#   The post-commit hook indexes single dirs incrementally — seconds each.
#   When a backend (qdrant/memgraph) is missing or wrong, the indexer's client
#   blocks forever on connect (futex_wait_queue) and never exits, holding 1GB+.
#   Any indexer older than INDEXER_AGE_MIN is hung by definition (no legitimate
#   single-dir index runs that long; index-all-projects spawns one short proc
#   per dir, so no single process is long-lived either). Parent-agnostic: a
#   stuck indexer may be a child of a hung drain worker, not init.

set -euo pipefail

TEST_AGE_MIN=${REAP_AGE_MIN_SECONDS:-1800}        # 30 min — orphaned test workers
INDEXER_AGE_MIN=${REAP_INDEXER_AGE_SECONDS:-1200} # 20 min — stuck codesearch indexers
LOG="/tmp/reap-orphan-test-workers.log"

# RULE A signatures (specific worker entrypoints, NOT generic node):
#   jest:       jest-worker/build/processChild.js
#   vitest:     vitest/dist/worker  or  tinypool entry under vitest
#   playwright: playwright .../worker  (loaderMain/workerMain)
WORKER_REGEX='jest-worker/build/processChild\.js|vitest/dist/.*worker|tinypool/dist/entry|playwright[^ ]*/(lib|dist)/.*worker'

# RULE B signature: the codesearch binary running an index subcommand.
INDEXER_REGEX='local-codesearch.* index( |$)'

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

killed=0
while read -r pid ppid etimes args; do
    # RULE A: orphaned test worker
    if [ "$ppid" = "1" ] && [ "$etimes" -gt "$TEST_AGE_MIN" ] \
       && echo "$args" | grep -qE "$WORKER_REGEX"; then
        log "KILL orphaned test worker pid=$pid age=${etimes}s args=${args:0:120}"
        kill -9 "$pid" 2>/dev/null && killed=$((killed + 1)) || true
        continue
    fi

    # RULE B: stuck codesearch indexer (parent-agnostic, age is the signal)
    if [ "$etimes" -gt "$INDEXER_AGE_MIN" ] \
       && echo "$args" | grep -qE "$INDEXER_REGEX"; then
        log "KILL stuck codesearch indexer pid=$pid age=${etimes}s args=${args:0:120}"
        kill -9 "$pid" 2>/dev/null && killed=$((killed + 1)) || true
        # Also clear a stale drain lock so the queue can resume after the hang.
        rm -f /tmp/codesearch-post-commit.lock 2>/dev/null || true
        continue
    fi
done < <(ps -eo pid=,ppid=,etimes=,args=)

if [ "$killed" -gt 0 ]; then
    log "Reaped $killed leaked worker(s)"
fi
# Always exit 0 — a reaper must never block session start.
exit 0
