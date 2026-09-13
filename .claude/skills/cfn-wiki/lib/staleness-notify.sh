#!/usr/bin/env bash
# cfn-wiki SessionStart staleness notice. WARN-ONLY: prints at most one
# stderr line when the wiki is stale and ALWAYS exits 0 — a stale wiki must
# never block a session start. Wired from project .claude/settings.json
# hooks.SessionStart (matcher startup|resume|clear); .claude/hooks.json stays
# untouched (verified inert, plan review).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$DIR/../../.." && pwd)}"

# Silent unless the wiki was initialized in this checkout (a store exists):
# a first sync is an explicit act, never a side effect of opening a session.
[ -f "$ROOT/.wiki/store.json" ] || exit 0
[ -f "$DIR/sync.sh" ] && [ -f "$DIR/wiki.sh" ] || exit 0

# Best-effort with a timeout: drift or failure both reduce to the one notice.
if ! timeout "${WIKI_STALENESS_TIMEOUT:-60}" \
        bash "$DIR/wiki.sh" sync --check "$ROOT" >/dev/null 2>&1; then
    echo "cfn-wiki: wiki stale (run: wiki sync)" >&2
fi
exit 0
