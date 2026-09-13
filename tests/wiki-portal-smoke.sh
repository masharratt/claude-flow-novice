#!/usr/bin/env bash
# tests/wiki-portal-smoke.sh - headless browser smoke for the cfn-wiki portal.
# Serves the portal on an EPHEMERAL port (never 4885) via portal/serve.sh, then
# drives a real headless Chromium through python playwright:
#   1. the four view tabs render (counted in the DOM)
#   2. one architecture node click opens its detail panel
#   3. one annotation posted through the UI persists to annotations.json
# Skips with a clear line when python playwright is not importable; NEVER
# installs anything. Plan: fuzzy-whistling-eich Phase 6 (frontend-verification
# rule: frontend changes verified in a real browser when playwright exists).
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTAL="$ROOT/.claude/skills/cfn-wiki/portal"
LIB="$ROOT/.claude/skills/cfn-wiki/lib"

PASS=0; FAIL=0; SKIP=0
ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
no()   { echo "FAIL: $1"; FAIL=$((FAIL+1)); }
skip() { echo "SKIP: $1"; SKIP=$((SKIP+1)); }

command -v python3 >/dev/null 2>&1 || { echo "FATAL: python3 not on PATH"; exit 1; }

if ! python3 -c "import playwright" >/dev/null 2>&1; then
    skip "playwright not importable (python3 -c 'import playwright'); \
portal smoke needs it installed to run a real browser"
    echo "wiki-portal-smoke: 0 passed, 0 failed, 1 skipped"
    exit 0
fi

T="$(mktemp -d "${TMPDIR:-/tmp}/wiki-portal-smoke-XXXXXX")"
cleanup() {
    [ -n "${SMOKE_REPO:-}" ] && WIKI_SERVE_OPEN=0 bash "$PORTAL/serve.sh" \
        "$SMOKE_REPO" --stop >/dev/null 2>&1
    rm -rf "$T"
}
trap cleanup EXIT

# fixture repo with a real store (same shape the portal payload documents)
SMOKE_REPO="$T/repo"
mkdir -p "$SMOKE_REPO/.wiki/enrich/blocks" "$SMOKE_REPO/readme"
git -C "$SMOKE_REPO" init -q
git -C "$SMOKE_REPO" config user.email wiki-smoke@example.com
git -C "$SMOKE_REPO" config user.name "Wiki Smoke"
cat >"$SMOKE_REPO/parsing_parser.py" <<'EOF'
def tokenize(line):
    return line.split()
EOF
cat >"$SMOKE_REPO/reporting_reporter.py" <<'EOF'
def render(rows):
    return "\n".join(rows)
EOF
git -C "$SMOKE_REPO" add -A
git -C "$SMOKE_REPO" commit -qm "feat: parsing and reporting"
cat >"$SMOKE_REPO/.wiki/store.json" <<'EOF'
{
  "features": [
    {"fid": "parsing", "name": "parsing",
     "files": ["parsing/parser.py"], "edges": 2},
    {"fid": "reporting", "name": "reporting",
     "files": ["reporting/reporter.py"], "edges": 1}
  ],
  "modules": [
    {"name": "parsing", "files": ["parsing/parser.py"], "nodes": 1},
    {"name": "reporting", "files": ["reporting/reporter.py"], "nodes": 1}
  ],
  "edges": [
    {"source": "reporting", "target": "parsing", "type": "IMPORTS", "count": 1}
  ],
  "coupling": [],
  "meta": {"repo": "smoke", "cbm_mode": "none",
           "generated_at": "2026-01-01T00:00:00Z", "fingerprint": "0"}
}
EOF
cat >"$SMOKE_REPO/.wiki/enrich/blocks/parsing.md" <<'EOF'
**Status:** prod

**Description:** Tokenizes raw lines into records.
EOF
cat >"$SMOKE_REPO/readme/state-machines.md" <<'EOF'
# State machines

## 1. parsing

**Source:** parsing/parser.py:1 (auto-grounded from .wiki/store.json)

### States

| State | Meaning |
|---|---|
| prod | live |
| dev | building |

### Transitions

| From | To | Trigger | Guard |
|---|---|---|---|
| (new) | dev | first sync | none |
| dev | prod | promote | tests green |
EOF

# build + serve on an ephemeral port; the smoke drives the real serve path
# (no --static: the annotation POST needs the read-write server)
if ! WIKI_SERVE_OPEN=0 bash "$PORTAL/serve.sh" "$SMOKE_REPO" --port 0 \
    >"$T/serve.out" 2>"$T/serve.err"; then
    no "serve: portal did not start: $(tail -3 "$T/serve.err")"
    echo "wiki-portal-smoke: $PASS passed, $FAIL failed, $SKIP skipped"
    exit 1
fi
PORT="$(python3 -c '
import json
print(json.load(open("'"$SMOKE_REPO"'/.wiki/portal/server.json"))["port"])
')"
ok "serve: portal up on ephemeral port $PORT"

SMOKE_RC=0
python3 - "$PORT" "$SMOKE_REPO" <<'PY' || SMOKE_RC=$?
import json
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

port, repo = sys.argv[1], sys.argv[2]
url = "http://127.0.0.1:%s/" % port
failures = []


def check(name, cond, detail=""):
    if cond:
        print("PASS: %s" % name)
    else:
        failures.append(name)
        print("FAIL: %s %s" % (name, detail))


with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto(url)

    # wait for the app to finish rendering (body[data-ready] is the hook)
    page.wait_for_selector('body[data-ready="1"]', timeout=15000)

    # 1. four view tabs render
    tabs = page.locator('[role="tab"]')
    check("views-render: four view tabs in DOM", tabs.count() == 4,
          "count=%d" % tabs.count())
    names = page.eval_on_selector_all(
        '[role="tab"]', "els => els.map(e => e.dataset.view)")
    check("views-render: tab names are arch/catalog/data/change",
          sorted(names) == ["arch", "catalog", "change", "data"],
          "got=%r" % (names,))

    # 2. architecture: click a node, detail panel opens
    page.click('[role="tab"][data-view="arch"]')
    page.wait_for_selector("#arch-svg .node-hit", timeout=5000)
    page.locator("#arch-svg .node-hit").first.click()
    detail = page.locator("#arch-detail")
    check("node-click: detail panel visible", detail.is_visible())
    check("node-click: detail names the clicked module",
          "parsing" in (detail.text_content() or ""),
          (detail.text_content() or "")[:80])

    # 3. annotation through the UI on a feature card
    page.click('[role="tab"][data-view="catalog"]')
    page.wait_for_selector('[data-annotate="feature:parsing"]', timeout=5000)
    page.click('[data-annotate="feature:parsing"]')
    page.fill("#anno-note", "smoke: tokenizer edge case noted")
    page.click("#anno-save")

    # poll the API until the note is on disk (the UI POST is async)
    note = None
    for _ in range(40):
        try:
            with urllib.request.urlopen(
                    "http://127.0.0.1:%s/api/annotations" % port,
                    timeout=2) as resp:
                doc = json.loads(resp.read().decode("utf-8"))
            note = (doc.get("annotations") or {}).get(
                "feature:parsing", {}).get("note", "")
            if note:
                break
        except Exception:
            pass
        time.sleep(0.25)
    check("annotation-post: note persisted via UI POST",
          note == "smoke: tokenizer edge case noted", "note=%r" % (note,))

    # the annotation status line confirms the save landed
    status = page.text_content("#anno-status") or ""
    check("annotation-post: UI status reports the save",
          "saved" in status.lower(), "status=%r" % status)

    browser.close()

if failures:
    sys.exit(1)
PY

if [ "$SMOKE_RC" -eq 0 ]; then
    ok "smoke: browser flow green"
else
    no "smoke: browser flow failed (rc=$SMOKE_RC)"
fi

WIKI_SERVE_OPEN=0 bash "$PORTAL/serve.sh" "$SMOKE_REPO" --stop >/dev/null 2>&1 \
    && ok "serve: stopped cleanly" || no "serve: --stop failed"

echo
echo "wiki-portal-smoke: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
