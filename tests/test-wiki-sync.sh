#!/usr/bin/env bash
# tests/test-wiki-sync.sh - cfn-wiki Phase 4 harness.
# Covers: lib/sync.sh (drift-detects: sync then --check exit 0, hand-edited
# generated section flips --check to exit 1 with a WIKI STALE line on stderr,
# sync heals it, and --check writes nothing to tracked files; coupling-cap:
# the sync window arg leaves the fingerprint identical to an uncapped
# standalone extract while history is under the cap), .github/workflows/
# wiki-check.yml (ci-shape: YAML parses, job + install/check steps + pinned
# checkout + path filter present), .husky/post-commit (post-commit-fires: a
# fixture clone with the real hook committed to triggers a deterministic
# regen that folds a new source dir into the projections), and
# lib/staleness-notify.sh (sessionstart-warn: stale repo prints the one
# stderr line and exits 0; fresh repo prints nothing). Plan cases
# contract-amended and rollout-list are Phase 7 placeholders. Plan:
# fuzzy-whistling-eich Phase 4.
# Isolation: every case runs in temp dirs; the shipped fixture and this
# repo's tracked files are never written. The post-commit case copies the
# real hook file and relies on the ~/.claude/skills/cfn-wiki reverse link for
# skill discovery, exactly as the hook resolves it in fresh clones.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="$ROOT/.claude/skills/cfn-wiki/lib"
FIXTURE="$ROOT/tests/fixtures/wiki-fixture-repo"
HOOK_FILE="$ROOT/.husky/post-commit"
WORKFLOW="$ROOT/.github/workflows/wiki-check.yml"
NOTIFY="$LIB/staleness-notify.sh"

T="$(mktemp -d "${TMPDIR:-/tmp}/wiki-sync-test-XXXXXX")"
cleanup() { rm -rf "$T"; }
trap cleanup EXIT

PASS=0; FAIL=0; SKIP=0
ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
no()   { echo "FAIL: $1"; FAIL=$((FAIL+1)); }
skip() { echo "SKIP: $1"; SKIP=$((SKIP+1)); }

for dep in bash python3 git mktemp flock; do
    command -v "$dep" >/dev/null 2>&1 || { echo "FATAL: $dep not on PATH"; exit 1; }
done

# Run a lib function in a clean subshell: run_in <lib.sh> <fn> [args...]
run_in() {
    bash -c '
        set -uo pipefail
        source "$1"
        shift
        "$@"
    ' _ "$@"
}

# Store meta.fingerprint: fingerprint <store> -> 64-hex
store_fp() {
    python3 -c '
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    s = json.load(fh)
print(s.get("meta", {}).get("fingerprint", ""))
' "$1"
}

# Temp git repo from the fixture content, minus .wiki and readme (sync
# generates the projections itself). Baseline commit included.
make_git_repo() { # <dest>
    local dest="$1"
    mkdir -p "$dest"
    cp -r "$FIXTURE/." "$dest/"
    rm -rf "$dest/.wiki" "$dest/readme"
    git -C "$dest" init -q
    git -C "$dest" config user.name "wiki-test"
    git -C "$dest" config user.email "wiki-test@example.com"
    git -C "$dest" add -A
    git -C "$dest" commit -qm "baseline"
}

# Hand-edit a generated TABLE cell (not a wiki:enrich block): flip the parsing
# row's Status from dev to beta. A regen must wipe this; --check must see it.
hand_edit_table() { # <feature-status.md>
    python3 - "$1" <<'PY'
import sys
path = sys.argv[1]
with open(path, encoding="utf-8") as fh:
    text = fh.read()
needle = "| parsing | dev |"
assert needle in text, "parsing table row not found for hand edit"
text = text.replace(needle, "| parsing | beta |", 1)
with open(path, "w", encoding="utf-8") as fh:
    fh.write(text)
PY
}

# ---------------------------------------------------------------------------
case_drift_detects() {
    if [ ! -f "$LIB/sync.sh" ]; then no "drift-detects: lib/sync.sh exists"; return; fi
    ok "drift-detects: lib/sync.sh exists"

    local REPO="$T/drift"
    make_git_repo "$REPO"

    if run_in "$LIB/sync.sh" wiki_sync "$REPO" >"$T/sync1.log" 2>&1; then
        ok "drift-detects: wiki_sync exit 0"
    else
        no "drift-detects: wiki_sync failed: $(tail -3 "$T/sync1.log")"
        return
    fi
    [ -f "$REPO/readme/feature-status.md" ] \
        && ok "drift-detects: sync generated feature-status.md" \
        || { no "drift-detects: feature-status.md missing after sync"; return; }
    grep -q "wiki-fp:" "$REPO/readme/feature-status.md" \
        && ok "drift-detects: generated file carries the wiki-fp marker" \
        || no "drift-detects: wiki-fp marker missing"

    git -C "$REPO" add -A
    git -C "$REPO" commit -qm "sync output"

    if run_in "$LIB/sync.sh" wiki_sync --check "$REPO" >"$T/check1.log" 2>&1; then
        ok "drift-detects: --check exit 0 right after sync"
    else
        no "drift-detects: --check flagged a fresh sync as stale: $(tail -3 "$T/check1.log")"
    fi

    # --check must not write: tracked tree identical before/after
    local before after
    before="$(git -C "$REPO" status --porcelain)"
    run_in "$LIB/sync.sh" wiki_sync --check "$REPO" >/dev/null 2>&1 || true
    after="$(git -C "$REPO" status --porcelain)"
    [ "$before" = "$after" ] \
        && ok "drift-detects: --check wrote nothing (git status unchanged)" \
        || no "drift-detects: --check dirtied the tree:\nbefore: $before\nafter:  $after"

    hand_edit_table "$REPO/readme/feature-status.md" \
        && ok "drift-detects: generated section hand-edited" \
        || { no "drift-detects: hand edit failed"; return; }

    local rc=0
    run_in "$LIB/sync.sh" wiki_sync --check "$REPO" >"$T/check2.log" 2>&1 || rc=$?
    if [ "$rc" -eq 1 ]; then
        ok "drift-detects: --check exit 1 on hand-edited generated section"
    else
        no "drift-detects: --check exit=$rc on hand-edited file (want 1)"
    fi
    grep -q "WIKI STALE" "$T/check2.log" \
        && ok "drift-detects: WIKI STALE reported on stderr" \
        || no "drift-detects: no WIKI STALE line in check output"

    if run_in "$LIB/sync.sh" wiki_sync "$REPO" >"$T/sync2.log" 2>&1; then
        ok "drift-detects: healing sync exit 0"
    else
        no "drift-detects: healing sync failed: $(tail -3 "$T/sync2.log")"
        return
    fi
    if run_in "$LIB/sync.sh" wiki_sync --check "$REPO" >/dev/null 2>&1; then
        ok "drift-detects: --check exit 0 after healing sync"
    else
        no "drift-detects: --check still red after sync"
    fi
    if grep -q "| parsing | beta |" "$REPO/readme/feature-status.md"; then
        no "drift-detects: hand edit survived regeneration"
    else
        ok "drift-detects: regeneration wiped the hand edit"
    fi

    # PERF deviation (plan Phase 4): sync caps the coupling window; standalone
    # extract stays uncapped. While history is under the cap both must agree.
    local REPO2="$T/cap"
    cp -r "$REPO/." "$REPO2/"
    rm -rf "$REPO2/.wiki"
    if run_in "$LIB/extract-features.sh" wiki_extract "$REPO2" >/dev/null 2>&1 \
        && [ -f "$REPO2/.wiki/store.json" ]; then
        ok "coupling-cap: standalone extract without the arg still works"
    else
        no "coupling-cap: uncapped standalone extract failed"
    fi
    local fp_synced fp_uncapped
    fp_synced="$(store_fp "$REPO/.wiki/store.json")"
    fp_uncapped="$(store_fp "$REPO2/.wiki/store.json")"
    if [ -n "$fp_synced" ] && [ "$fp_synced" = "$fp_uncapped" ]; then
        ok "coupling-cap: capped sync store matches uncapped extract fingerprint"
    else
        no "coupling-cap: fingerprint drift capped=$fp_synced uncapped=$fp_uncapped"
    fi
}

# ---------------------------------------------------------------------------
case_ci_shape() {
    if [ ! -f "$WORKFLOW" ]; then no "ci-shape: .github/workflows/wiki-check.yml exists"; return; fi
    ok "ci-shape: .github/workflows/wiki-check.yml exists"

    if ! python3 -c "import yaml" >/dev/null 2>&1; then
        skip "ci-shape: pyyaml unavailable; grep fallback used"
    fi
    if python3 - "$WORKFLOW" <<'PY' >"$T/ci-shape.log" 2>&1
import sys

import yaml

with open(sys.argv[1], encoding="utf-8") as fh:
    doc = yaml.safe_load(fh)

problems = []

on = doc.get("on") or doc.get(True) or {}  # pyyaml parses a bare `on:` as True
push_paths = (on.get("push") or {}).get("paths", [])
pr_paths = (on.get("pull_request") or {}).get("paths", [])
for paths in (push_paths, pr_paths):
    if not any("readme/" in p for p in paths):
        problems.append("paths filter missing readme/: %s" % paths)

jobs = doc.get("jobs") or {}
job = jobs.get("wiki-check")
if not isinstance(job, dict):
    problems.append("jobs.wiki-check missing")
else:
    steps = job.get("steps") or []
    text = " ".join(str(s.get("run", "")) for s in steps if isinstance(s, dict))
    uses = " ".join(str(s.get("uses", "")) for s in steps if isinstance(s, dict))
    if "doctor --install" not in text:
        problems.append("no 'doctor --install' setup step; runs=%s" % text)
    if "sync --check" not in text:
        problems.append("no 'sync --check' gate step; runs=%s" % text)
    if "actions/checkout@" not in uses:
        problems.append("no pinned checkout action; uses=%s" % uses)
    depths = [s.get("with", {}).get("fetch-depth") for s in steps if isinstance(s, dict)]
    if 0 not in depths:
        problems.append("checkout lacks fetch-depth: 0 (coupling walk needs history)")

if problems:
    print("YAML-FAIL: " + "; ".join(problems))
    sys.exit(1)
print("YAML-OK")
PY
    then
        ok "ci-shape: YAML parses; job, install + check steps, pinned checkout, paths filter present"
    else
        no "ci-shape: $(tail -3 "$T/ci-shape.log")"
    fi
}

# ---------------------------------------------------------------------------
case_post_commit_fires() {
    if [ ! -f "$HOOK_FILE" ]; then no "post-commit-fires: .husky/post-commit exists"; return; fi
    ok "post-commit-fires: .husky/post-commit exists"
    grep -q "codesearch" "$HOOK_FILE" \
        && ok "post-commit-fires: existing codesearch line preserved" \
        || no "post-commit-fires: codesearch block lost from post-commit"
    grep -q "wiki_sync_hook" "$HOOK_FILE" \
        && ok "post-commit-fires: wiki-sync block appended" \
        || { no "post-commit-fires: wiki-sync block missing"; return; }

    local REPO="$T/hookrepo"
    make_git_repo "$REPO"
    mkdir -p "$REPO/.husky"
    cp "$HOOK_FILE" "$REPO/.husky/post-commit"
    chmod +x "$REPO/.husky/post-commit"
    git -C "$REPO" config core.hooksPath .husky

    # baseline commit: hook fires but must no-op (no .wiki yet in this clone)
    if git -C "$REPO" commit -qm "hook no-op baseline" --allow-empty >"$T/commit0.log" 2>&1; then
        ok "post-commit-fires: commit succeeds before wiki init (hook guarded)"
    else
        no "post-commit-fires: pre-init commit failed: $(tail -3 "$T/commit0.log")"
    fi

    if run_in "$LIB/sync.sh" wiki_sync "$REPO" >/dev/null 2>&1; then
        ok "post-commit-fires: first sync initialized .wiki"
    else
        no "post-commit-fires: first sync failed"
        return
    fi

    # new top-level source dir + a commit: the hook's deterministic regen must
    # fold the new dir into the projections without any LLM step
    mkdir -p "$REPO/extras"
    printf 'def helper():\n    return 1\n' >"$REPO/extras/helper.py"
    if git -C "$REPO" add -A && git -C "$REPO" commit -qm "add extras" >"$T/commit1.log" 2>&1; then
        ok "post-commit-fires: commit with wiki active succeeds (hook never blocks)"
    else
        no "post-commit-fires: commit failed under the hook: $(tail -5 "$T/commit1.log")"
        return
    fi
    [ -f "$REPO/.wiki/cache/sync.lock" ] \
        && ok "post-commit-fires: hook took the sync.lock guard" \
        || no "post-commit-fires: sync.lock absent (guarded block did not run)"
    grep -q "^| extras |" "$REPO/readme/feature-status.md" \
        && ok "post-commit-fires: post-commit regen folded extras/ into projections" \
        || no "post-commit-fires: regen did not pick up the new source dir"
}

# ---------------------------------------------------------------------------
case_sessionstart_warn() {
    if [ ! -f "$NOTIFY" ]; then no "sessionstart-warn: lib/staleness-notify.sh exists"; return; fi
    ok "sessionstart-warn: lib/staleness-notify.sh exists"

    local REPO="$T/notify"
    make_git_repo "$REPO"
    run_in "$LIB/sync.sh" wiki_sync "$REPO" >/dev/null 2>&1 || { no "sessionstart-warn: sync failed"; return; }

    # stale the tree behind the store: new source dir, no sync
    mkdir -p "$REPO/fresh"
    printf 'x = 1\n' >"$REPO/fresh/mod.py"
    local out err rc=0
    CLAUDE_PROJECT_DIR="$REPO" bash "$NOTIFY" >"$T/notify.out" 2>"$T/notify.err" || rc=$?
    out="$(cat "$T/notify.out")"; err="$(cat "$T/notify.err")"
    if [ "$rc" -eq 0 ]; then
        ok "sessionstart-warn: stale repo exits 0 (warn-only)"
    else
        no "sessionstart-warn: stale repo exit=$rc (want 0)"
    fi
    printf '%s' "$err" | grep -q "cfn-wiki: wiki stale (run: wiki sync)" \
        && ok "sessionstart-warn: stale repo prints the one notice line" \
        || no "sessionstart-warn: notice line missing (stderr was: $err)"
    [ -z "$out" ] \
        && ok "sessionstart-warn: notice goes to stderr only" \
        || no "sessionstart-warn: unexpected stdout: $out"

    run_in "$LIB/sync.sh" wiki_sync "$REPO" >/dev/null 2>&1 || true
    rc=0
    CLAUDE_PROJECT_DIR="$REPO" bash "$NOTIFY" >"$T/notify2.out" 2>"$T/notify2.err" || rc=$?
    if [ "$rc" -eq 0 ] && [ ! -s "$T/notify2.err" ] && [ ! -s "$T/notify2.out" ]; then
        ok "sessionstart-warn: fresh repo silent, exit 0"
    else
        no "sessionstart-warn: fresh repo not silent (rc=$rc err=$(cat "$T/notify2.err"))"
    fi

    mkdir -p "$T/nowiki"
    rc=0
    CLAUDE_PROJECT_DIR="$T/nowiki" bash "$NOTIFY" >"$T/notify3.out" 2>"$T/notify3.err" || rc=$?
    if [ "$rc" -eq 0 ] && [ ! -s "$T/notify3.err" ] && [ ! -s "$T/notify3.out" ]; then
        ok "sessionstart-warn: repo without a wiki stays silent (never does a first sync)"
    else
        no "sessionstart-warn: wiki-less repo made noise (rc=$rc)"
    fi
}

# ---------------------------------------------------------------------------
case_drift_detects
case_ci_shape
case_post_commit_fires
case_sessionstart_warn
skip "contract-amended: deferred to Phase 7 (amend .claude/global/CLAUDE.md commit-time-docs section)"
skip "rollout-list: deferred to Phase 7 (ROLLOUT.md sibling list + config snippets)"

echo
echo "wiki-sync: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
