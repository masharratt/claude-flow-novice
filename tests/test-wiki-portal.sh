#!/usr/bin/env bash
# tests/test-wiki-portal.sh - cfn-wiki Phase 6 harness.
# Covers the portal deliverables and their contracts:
#   no-external-refs:     template + built output contain zero <link> tags and
#                         zero src=/href= pointing at http(s); no @import or
#                         url(http in CSS (self-contained HTML contract).
#   payload-inlined:      wiki_build_portal inlines a valid payload into the
#                         __WIKI_PAYLOAD__ slot (placeholder absent afterwards),
#                         payload parses as one JSON object with the six
#                         documented keys, view content is real (fixture
#                         features parsing/reporting), stale flips false when
#                         the wiki-fp marker matches, output write is atomic.
#   annotation-roundtrip: server.py POST /api/annotations then GET round-trips
#                         against a live server on an EPHEMERAL port; origin +
#                         content-type + body validation; malformed or
#                         wrong-shape annotations.json refuses startup WITHOUT
#                         replacing the file.
#   serve-lifecycle:      wiki_serve start -> HTTP 200 -> --stop -> pidfile
#                         gone and port closed. Ports: always 0 (ephemeral);
#                         4885 is never touched by tests.
# Plan: fuzzy-whistling-eich Phase 6.
# Isolation: every case runs in temp dirs; the shipped fixture is never written.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIB="$ROOT/.claude/skills/cfn-wiki/lib"
PORTAL="$ROOT/.claude/skills/cfn-wiki/portal"

T="$(mktemp -d "${TMPDIR:-/tmp}/wiki-portal-test-XXXXXX")"
cleanup() { rm -rf "$T"; }
trap cleanup EXIT

PASS=0; FAIL=0; SKIP=0
ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
no()   { echo "FAIL: $1"; FAIL=$((FAIL+1)); }
skip() { echo "SKIP: $1"; SKIP=$((SKIP+1)); }

for dep in bash python3 git mktemp; do
    command -v "$dep" >/dev/null 2>&1 || { echo "FATAL: $dep not on PATH"; exit 1; }
done
for f in "$PORTAL/template.html" "$PORTAL/build-portal.sh" "$PORTAL/server.py" "$PORTAL/serve.sh"; do
    [ -f "$f" ] || { echo "FATAL: missing portal file: $f"; exit 1; }
done

bash -n "$PORTAL/build-portal.sh" && ok "syntax: build-portal.sh parses" \
    || no "syntax: build-portal.sh fails bash -n"
bash -n "$PORTAL/serve.sh" && ok "syntax: serve.sh parses" \
    || no "syntax: serve.sh fails bash -n"
python3 -m py_compile "$PORTAL/server.py" 2>/dev/null \
    && ok "syntax: server.py compiles" \
    || no "syntax: server.py fails py_compile"

# Evaluate a python expression over JSON saved at $1: json_get <file> <expr>
json_get() {
    python3 -c '
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    d = json.load(fh)
print(eval(sys.argv[2]))
' "$1" "$2"
}

# Extract the inlined payload from a built portal: extract_payload <html> <out.json>
extract_payload() {
    python3 -c '
import json, re, sys
html = open(sys.argv[1], encoding="utf-8").read()
m = re.search(
    r"<script type=\"application/json\" id=\"wiki-payload\">(.*?)</script>",
    html, re.S)
if not m:
    sys.exit("no payload script tag in built portal")
open(sys.argv[2], "w", encoding="utf-8").write(m.group(1))
' "$1" "$2"
}

# HTTP status helper. Prints the status code, 000 on connection error.
# http_code <port> <path> [method] [json-body] [origin]
http_code() {
    python3 - "$@" <<'PY'
import sys
import urllib.error
import urllib.request

port, path = sys.argv[1], sys.argv[2]
method = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else "GET"
body = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None
origin = sys.argv[5] if len(sys.argv) > 5 and sys.argv[5] else None
req = urllib.request.Request(
    "http://127.0.0.1:%s%s" % (port, path), method=method,
    data=body.encode("utf-8") if body is not None else None,
    headers={"Content-Type": "application/json",
             **({"Origin": origin} if origin else {})})
try:
    with urllib.request.urlopen(req, timeout=5) as resp:
        print(resp.status)
except urllib.error.HTTPError as exc:
    print(exc.code)
except Exception:
    print("000")
PY
}

# GET-body helper: prints the response body of GET <path> on <port>.
http_get_body() {
    python3 - "$@" <<'PY'
import sys
import urllib.request

with urllib.request.urlopen(
        "http://127.0.0.1:%s%s" % (sys.argv[1], sys.argv[2]), timeout=5) as r:
    sys.stdout.write(r.read().decode("utf-8"))
PY
}

# Build the shared fixture repo: a git repo with a hand-written store (the
# documented view contracts), enrich blocks with REAL fixture content (the
# fixture repo's parsing/reporting features), a generated-shape
# state-machines.md, no .env (data view degrades), and a wiki-fp marker only
# when asked. write_fixture_repo <dest> [marker]
write_fixture_repo() {
    local dest="$1" marker="${2:-}"
    mkdir -p "$dest/.wiki/enrich/blocks" "$dest/readme"
    cat >"$dest/parsing_parser.py" <<'EOF'
def tokenize(line):
    return line.split()
EOF
    cat >"$dest/reporting_reporter.py" <<'EOF'
def render(rows):
    return "\n".join(rows)
EOF
    git -C "$dest" init -q
    git -C "$dest" config user.email wiki-portal@example.com
    git -C "$dest" config user.name "Wiki Portal"
    git -C "$dest" add -A
    git -C "$dest" commit -qm "feat: parsing and reporting fixture"
    cat >"$dest/.wiki/store.json" <<'EOF'
{
  "features": [
    {"fid": "parsing", "name": "parsing",
     "files": ["parsing/parser.py"], "edges": 3},
    {"fid": "reporting", "name": "reporting",
     "files": ["reporting/reporter.py"], "edges": 1}
  ],
  "modules": [
    {"name": "parsing", "files": ["parsing/parser.py"], "nodes": 1},
    {"name": "reporting", "files": ["reporting/reporter.py"], "nodes": 1}
  ],
  "edges": [
    {"source": "reporting", "target": "parsing", "type": "IMPORTS", "count": 2}
  ],
  "coupling": [
    {"files": ["parsing/parser.py", "reporting/reporter.py"], "count": 2}
  ],
  "meta": {"repo": "fixture", "cbm_mode": "none",
           "generated_at": "2026-01-01T00:00:00Z", "fingerprint": "0"}
}
EOF
    # real fingerprint over the store (fingerprint.sh strips meta.fingerprint)
    local fp
    fp="$(bash -c 'source "$1" && wiki_fingerprint "$2"' _ "$LIB/fingerprint.sh" \
        "$dest/.wiki/store.json")"
    python3 - "$dest/.wiki/store.json" "$fp" <<'PY'
import json
import sys

path, fp = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as fh:
    store = json.load(fh)
store["meta"]["fingerprint"] = fp
with open(path, "w", encoding="utf-8") as fh:
    json.dump(store, fh, indent=2)
    fh.write("\n")
PY
    cat >"$dest/.wiki/enrich/blocks/parsing.md" <<'EOF'
**Status:** prod

**Description:** Tokenizes raw lines into records.
EOF
    cat >"$dest/.wiki/enrich/blocks/reporting.md" <<'EOF'
**Status:** dev

**Description:** Renders records as summary tables.
EOF
    cat >"$dest/readme/state-machines.md" <<'EOF'
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

### Diagram

```mermaid
stateDiagram-v2
    [*] --> dev
    dev --> prod: promote
```
EOF
    if [ -n "$marker" ]; then
        printf '# Features\n\n<!-- wiki-fp: %s -->\n' "$fp" \
            >"$dest/readme/feature-status.md"
    fi
}

# Build a portal for <repo> in a subshell. BUILD_RC/BUILD_OUT/BUILD_LOG set.
BUILD_RC=0; BUILD_OUT=""; BUILD_LOG=""
build_portal() { # <repo> [out]
    local repo="$1"
    BUILD_OUT="${2:-$repo/.wiki/portal/index.html}"
    BUILD_RC=0
    BUILD_LOG="$(bash -c '
        set -uo pipefail
        source "$1"
        wiki_build_portal "$2" "$3" "$4"
    ' _ "$PORTAL/build-portal.sh" "$repo/.wiki/store.json" "$repo" "$BUILD_OUT" 2>&1)" \
        || BUILD_RC=$?
}

# Start server.py on an ephemeral port. SERVER_PORT/SERVER_PID set.
# Removes any stale server.json first: a leftover from a previous run would
# otherwise make a refused restart look like a success.
SERVER_PORT=""; SERVER_PID=""
start_server() { # <wiki-dir> [extra args...]
    local wiki_dir="$1"; shift
    SERVER_PID=""
    SERVER_PORT=""
    rm -f "$wiki_dir/portal/server.json"
    python3 "$PORTAL/server.py" --wiki-dir "$wiki_dir" --port 0 "$@" \
        >"$T/server-$$.out" 2>"$T/server-$$.err" &
    SERVER_PID=$!
    local i
    for i in $(seq 1 50); do
        if [ -f "$wiki_dir/portal/server.json" ]; then
            SERVER_PORT="$(json_get "$wiki_dir/portal/server.json" "d['port']")"
            [ -n "$SERVER_PORT" ] && return 0
        fi
        kill -0 "$SERVER_PID" 2>/dev/null || return 1
        sleep 0.2
    done
    return 1
}

stop_server() {
    [ -n "$SERVER_PID" ] || return 0
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
}

# ---------------------------------------------------------------------------
case_no_external_refs() {
    local template="$PORTAL/template.html"
    local hits
    hits="$(grep -Ec '<link|src="http|href="http' "$template" 2>/dev/null)" || hits=0
    [ "${hits:-0}" -eq 0 ] \
        && ok "no-external-refs: template has zero <link>/http src/href" \
        || no "no-external-refs: template external refs=$hits"
    if grep -Eq '@import|url\(\s*["'"'"']?https?:' "$template"; then
        no "no-external-refs: template CSS pulls remote styles"
    else
        ok "no-external-refs: template CSS has no remote @import/url()"
    fi

    local REPO="$T/ext"
    write_fixture_repo "$REPO"
    build_portal "$REPO"
    [ "$BUILD_RC" -eq 0 ] \
        && ok "no-external-refs: build exit 0" \
        || { no "no-external-refs: build rc=$BUILD_RC: $(tail -3 <<<"$BUILD_LOG")"; return; }
    [ -f "$BUILD_OUT" ] && ok "no-external-refs: output written at default path" \
        || { no "no-external-refs: output missing at $BUILD_OUT"; return; }
    hits="$(grep -Ec '<link|src="http|href="http' "$BUILD_OUT")" || hits=0
    [ "${hits:-0}" -eq 0 ] \
        && ok "no-external-refs: built output has zero external refs" \
        || no "no-external-refs: built output external refs=$hits"
    if grep -Eq '@import|url\(\s*["'"'"']?https?:' "$BUILD_OUT"; then
        no "no-external-refs: built CSS pulls remote styles"
    else
        ok "no-external-refs: built CSS has no remote @import/url()"
    fi
}

# ---------------------------------------------------------------------------
case_payload_inlined() {
    local REPO="$T/payload"
    write_fixture_repo "$REPO"
    build_portal "$REPO"
    [ "$BUILD_RC" -eq 0 ] \
        && ok "payload-inlined: build exit 0" \
        || { no "payload-inlined: build rc=$BUILD_RC: $(tail -3 <<<"$BUILD_LOG")"; return; }

    if grep -q '__WIKI_PAYLOAD__' "$BUILD_OUT"; then
        no "payload-inlined: placeholder still present in output"
    else
        ok "payload-inlined: placeholder fully substituted"
    fi

    extract_payload "$BUILD_OUT" "$T/payload.json" \
        && ok "payload-inlined: payload script tag found" \
        || { no "payload-inlined: payload extraction failed"; return; }
    if python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$T/payload.json" 2>/dev/null; then
        ok "payload-inlined: payload parses as JSON (escaped </ safe)"
    else
        no "payload-inlined: payload does not parse as JSON"
        return
    fi

    local keys
    keys="$(json_get "$T/payload.json" "sorted(d.keys())")"
    [ "$keys" = "['arch', 'catalog', 'change', 'data', 'meta', 'state']" ] \
        && ok "payload-inlined: top-level keys exactly the six contract keys" \
        || no "payload-inlined: keys=$keys"

    # real fixture content, not lorem
    [ "$(json_get "$T/payload.json" "d['catalog']['features'][0]['fid']")" = "parsing" ] \
        && ok "payload-inlined: catalog carries the parsing feature" \
        || no "payload-inlined: parsing feature missing from catalog"
    [ "$(json_get "$T/payload.json" "({f['fid']: f for f in d['catalog']['features']})['parsing']['description']")" \
        = "Tokenizes raw lines into records." ] \
        && ok "payload-inlined: parsing description is the real enrich text" \
        || no "payload-inlined: parsing description wrong"
    [ "$(json_get "$T/payload.json" "len(d['arch']['nodes'])")" -ge 2 ] \
        && ok "payload-inlined: arch has module nodes" \
        || no "payload-inlined: arch nodes empty"
    [ "$(json_get "$T/payload.json" "len(d['change']['commits'])")" -ge 1 ] \
        && ok "payload-inlined: change view has the fixture commit" \
        || no "payload-inlined: change commits empty"
    [ "$(json_get "$T/payload.json" "d['data']['empty']")" = "True" ] \
        && ok "payload-inlined: data view degraded without .env" \
        || no "payload-inlined: data view not degraded"
    [ "$(json_get "$T/payload.json" "d['state']['entities'][0]['name']")" = "parsing" ] \
        && ok "payload-inlined: state entity parsed" \
        || no "payload-inlined: state entity missing"

    # meta: stale true without a marker, degraded true for cbm_mode=none
    [ "$(json_get "$T/payload.json" "d['meta']['stale']")" = "True" ] \
        && ok "payload-inlined: no wiki-fp marker -> meta.stale true" \
        || no "payload-inlined: meta.stale wrong"
    [ -n "$(json_get "$T/payload.json" "d['meta']['degraded']")" ] \
        && ok "payload-inlined: cbm_mode=none -> meta.degraded carries a reason" \
        || no "payload-inlined: meta.degraded empty"
    [ "$(json_get "$T/payload.json" "len(d['meta']['fingerprint'])")" -eq 64 ] \
        && ok "payload-inlined: meta.fingerprint is 64 hex" \
        || no "payload-inlined: meta.fingerprint wrong"

    # matching marker -> stale flips false on rebuild
    write_fixture_repo "$REPO" marker
    build_portal "$REPO"
    [ "$BUILD_RC" -eq 0 ] || { no "payload-inlined: marker rebuild failed"; return; }
    extract_payload "$BUILD_OUT" "$T/payload2.json"
    [ "$(json_get "$T/payload2.json" "d['meta']['stale']")" = "False" ] \
        && ok "payload-inlined: matching wiki-fp marker -> meta.stale false" \
        || no "payload-inlined: meta.stale did not flip false"

    # mermaid pre-render: svg attached when mmdc is available, else payload
    # still carries the transitions fallback (either way the portal renders)
    if command -v mmdc >/dev/null 2>&1; then
        local svg_len
        svg_len="$(json_get "$T/payload2.json" "len(d['state']['entities'][0].get('svg') or '')")"
        if [ "$svg_len" -gt 0 ]; then
            if head -c 200 "$T/payload2.json" >/dev/null \
                && python3 -c '
import json, re, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
svg = d["state"]["entities"][0]["svg"]
assert svg.lstrip().startswith("<svg"), "svg does not start with <svg"
assert not re.search(r"<script\b", svg, re.I), "svg carries a script"
assert not re.search(r"(?:xlink:)?href\s*=\s*[\"\x27]\s*https?:", svg, re.I), \
    "svg carries an http href"
' "$T/payload2.json" 2>/dev/null; then
                ok "payload-inlined: mmdc pre-rendered the state diagram to a clean SVG"
            else
                no "payload-inlined: state svg malformed or has http refs"
            fi
        else
            no "payload-inlined: mmdc on PATH but no svg attached (fallback would hide the failure)"
        fi
    else
        skip "payload-inlined: mmdc not on PATH; transitions fallback covers rendering"
    fi

    # atomic write: output lands via tmp+rename, parent dirs auto-created
    local out2="$T/deep/nested/portal.html"
    build_portal "$REPO" "$out2"
    if [ "$BUILD_RC" -eq 0 ] && [ -f "$out2" ] && [ -z "$(find "$T/deep" -name '*.tmp*' 2>/dev/null)" ]; then
        ok "payload-inlined: custom out path created atomically, no tmp leftovers"
    else
        no "payload-inlined: custom out rc=$BUILD_OUT rc=$BUILD_RC"
    fi

    # missing store -> nonzero, no output
    BUILD_RC=0
    build_portal "$T/never-was" 2>/dev/null
    if [ "$BUILD_RC" -ne 0 ]; then
        ok "payload-inlined: missing store fails loudly"
    else
        no "payload-inlined: missing store exit 0"
    fi
}

# ---------------------------------------------------------------------------
case_annotation_roundtrip() {
    local WIKI="$T/anno/.wiki"
    mkdir -p "$WIKI/portal"
    printf '<!doctype html><title>portal</title>' >"$WIKI/portal/index.html"

    start_server "$WIKI" || { no "annotation-roundtrip: server did not start"; return; }
    ok "annotation-roundtrip: server started on ephemeral port $SERVER_PORT"

    # round-trip: POST then GET
    local body='{"id": "feature:parsing", "note": "Tokenizer edge case: blank lines.", "clientTs": "2026-09-12T00:00:00Z"}'
    [ "$(http_code "$SERVER_PORT" /api/annotations POST "$body" "http://127.0.0.1:$SERVER_PORT")" = "200" ] \
        && ok "annotation-roundtrip: POST accepted" \
        || no "annotation-roundtrip: POST not 200"
    local got
    got="$(http_get_body "$SERVER_PORT" /api/annotations)"
    if printf '%s' "$got" | grep -q "Tokenizer edge case"; then
        ok "annotation-roundtrip: GET returns the posted note"
    else
        no "annotation-roundtrip: GET missing the note: $got"
    fi
    if python3 -c '
import json, sys
d = json.load(open(sys.argv[1] + "/annotations.json", encoding="utf-8"))
assert isinstance(d.get("annotations"), dict), "no annotations object"
assert d["annotations"]["feature:parsing"]["note"].startswith("Tokenizer"), "note not on disk"
' "$WIKI"; then
        ok "annotation-roundtrip: note persisted atomically to annotations.json"
    else
        no "annotation-roundtrip: annotations.json wrong on disk"
    fi

    # validation: origin, content-type, body shape
    [ "$(http_code "$SERVER_PORT" /api/annotations POST "$body" "")" = "403" ] \
        && ok "annotation-roundtrip: POST without Origin -> 403" \
        || no "annotation-roundtrip: missing Origin not 403"
    [ "$(http_code "$SERVER_PORT" /api/annotations POST "$body" "http://evil.example:9999")" = "403" ] \
        && ok "annotation-roundtrip: foreign Origin -> 403" \
        || no "annotation-roundtrip: foreign Origin not 403"
    [ "$(http_code "$SERVER_PORT" /api/annotations POST "not json" "http://127.0.0.1:$SERVER_PORT")" = "400" ] \
        && ok "annotation-roundtrip: malformed JSON body -> 400" \
        || no "annotation-roundtrip: malformed body not 400"
    [ "$(http_code "$SERVER_PORT" /api/annotations POST '{"id":"feature:parsing","note":"x","junk":1}' "http://127.0.0.1:$SERVER_PORT")" = "400" ] \
        && ok "annotation-roundtrip: unknown field -> 400" \
        || no "annotation-roundtrip: unknown field not 400"
    [ "$(http_code "$SERVER_PORT" /api/annotations POST '{"note":"no id"}' "http://127.0.0.1:$SERVER_PORT")" = "400" ] \
        && ok "annotation-roundtrip: missing id -> 400" \
        || no "annotation-roundtrip: missing id not 400"

    # empty note deletes the entry
    [ "$(http_code "$SERVER_PORT" /api/annotations POST '{"id":"feature:parsing","note":""}' "http://127.0.0.1:$SERVER_PORT")" = "200" ] \
        && ok "annotation-roundtrip: empty note accepted" \
        || no "annotation-roundtrip: empty note not 200"
    got="$(http_get_body "$SERVER_PORT" /api/annotations)"
    if printf '%s' "$got" | grep -q "feature:parsing"; then
        no "annotation-roundtrip: empty note did not delete the entry"
    else
        ok "annotation-roundtrip: empty note deletes the entry"
    fi

    # static index served at /, api without origin on GET is fine
    [ "$(http_code "$SERVER_PORT" /)" = "200" ] \
        && ok "annotation-roundtrip: GET / serves the portal" \
        || no "annotation-roundtrip: GET / not 200"
    [ "$(http_code "$SERVER_PORT" /api/annotations)" = "200" ] \
        && ok "annotation-roundtrip: GET /api/annotations needs no Origin" \
        || no "annotation-roundtrip: GET /api/annotations not 200"

    stop_server

    # malformed store refuses startup WITHOUT overwriting
    printf '{{{ not json' >"$WIKI/annotations.json"
    local before
    before="$(cat "$WIKI/annotations.json")"
    if start_server "$WIKI"; then
        no "annotation-roundtrip: server started on malformed annotations.json"
        stop_server
    else
        ok "annotation-roundtrip: malformed annotations.json refuses startup"
        local after
        after="$(cat "$WIKI/annotations.json")"
        [ "$before" = "$after" ] \
            && ok "annotation-roundtrip: malformed file left unchanged" \
            || no "annotation-roundtrip: malformed file was overwritten"
    fi

    # wrong shape also refuses
    printf '{"decisions": {}}' >"$WIKI/annotations.json"
    before="$(cat "$WIKI/annotations.json")"
    if start_server "$WIKI"; then
        no "annotation-roundtrip: server started on wrong-shape annotations.json"
        stop_server
    else
        ok "annotation-roundtrip: wrong-shape annotations.json refuses startup"
        after="$(cat "$WIKI/annotations.json")"
        [ "$before" = "$after" ] \
            && ok "annotation-roundtrip: wrong-shape file left unchanged" \
            || no "annotation-roundtrip: wrong-shape file was overwritten"
    fi
}

# ---------------------------------------------------------------------------
case_serve_lifecycle() {
    local REPO="$T/serve"
    write_fixture_repo "$REPO"
    build_portal "$REPO"
    [ "$BUILD_RC" -eq 0 ] || { no "serve-lifecycle: portal build failed"; return; }

    # serve.sh rebuilds the portal first (main path); --static would start the
    # server read-only, so it is exercised implicitly by the build assertions.
    if WIKI_SERVE_OPEN=0 bash "$PORTAL/serve.sh" "$REPO" --port 0 \
        >"$T/serve.out" 2>"$T/serve.err"; then
        ok "serve-lifecycle: serve start exit 0"
    else
        no "serve-lifecycle: serve start rc=$?: $(tail -3 "$T/serve.err")"
        return
    fi
    local pidfile="$REPO/.wiki/cache/serve.pid"
    [ -f "$pidfile" ] && ok "serve-lifecycle: pidfile written" \
        || { no "serve-lifecycle: pidfile missing"; return; }
    [ -f "$REPO/.wiki/portal/server.json" ] \
        && ok "serve-lifecycle: server.json recovery file written" \
        || no "serve-lifecycle: server.json missing"

    local port
    port="$(json_get "$REPO/.wiki/portal/server.json" "d['port']")"
    [ "$(http_code "$port" /)" = "200" ] \
        && ok "serve-lifecycle: portal answers HTTP 200" \
        || no "serve-lifecycle: portal not 200 on port $port"

    # annotation POST works through the served portal
    [ "$(http_code "$port" /api/annotations POST \
        '{"id":"entity:parsing","note":"check the promote guard"}' \
        "http://127.0.0.1:$port")" = "200" ] \
        && ok "serve-lifecycle: annotation POST accepted through serve.sh" \
        || no "serve-lifecycle: annotation POST failed"

    if WIKI_SERVE_OPEN=0 bash "$PORTAL/serve.sh" "$REPO" --stop; then
        ok "serve-lifecycle: --stop exit 0"
    else
        no "serve-lifecycle: --stop rc=$?"
    fi
    [ ! -f "$pidfile" ] && ok "serve-lifecycle: pidfile cleared" \
        || no "serve-lifecycle: pidfile still present"
    [ "$(http_code "$port" /)" = "000" ] \
        && ok "serve-lifecycle: port closed after stop" \
        || no "serve-lifecycle: port still open after stop"

    # stop when not serving: exit 0, says so
    if WIKI_SERVE_OPEN=0 bash "$PORTAL/serve.sh" "$REPO" --stop >/dev/null 2>&1; then
        ok "serve-lifecycle: --stop on a stopped portal exits 0"
    else
        no "serve-lifecycle: --stop on stopped portal rc=$?"
    fi
}

# ---------------------------------------------------------------------------
# Browser open mode: default is VS Code Simple Browser (vscode:// URI via a
# `code` on PATH); .wiki/config.json "browser": "system" (or WIKI_BROWSER env)
# switches to the wslview -> explorer.exe -> cmd.exe chain. Opener stubs are
# put on PATH so the test never opens anything real.
case_browser_open_mode() {
    local B="$T/browser-mode"
    mkdir -p "$B/bin" "$B/repo/.wiki"
    cp -r "$ROOT/tests/fixtures/wiki-fixture-repo/." "$B/repo/" 2>/dev/null || true
    for opener in code wslview; do
        cat >"$B/bin/$opener" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$*" >>"$B/$opener.log"
exit 0
EOF
        chmod +x "$B/bin/$opener"
    done
    # shellcheck disable=SC1090
    source "$PORTAL/serve.sh"

    # Default (no config, no env): VS Code Simple Browser URI.
    ( PATH="$B/bin:$PATH" WIKI_SERVE_OPEN=1 wiki_serve_open_browser "$B/repo" "http://127.0.0.1:4885/" ) >>"$B/default.log" 2>&1
    if grep -q 'vscode://simpleBrowser.show?url=http%3A%2F%2F127.0.0.1%3A4885%2F' "$B/code.log" 2>/dev/null; then
        ok "browser-open-mode: default opens via vscode://simpleBrowser URI"
    else
        no "browser-open-mode: default did not call code with Simple Browser URI: $(cat "$B/code.log" 2>/dev/null)"
    fi

    # config browser=system: wslview gets the raw URL, code is not called.
    printf '%s\n' '{"browser": "system"}' >"$B/repo/.wiki/config.json"
    : >"$B/code.log"
    ( PATH="$B/bin:$PATH" WIKI_SERVE_OPEN=1 wiki_serve_open_browser "$B/repo" "http://127.0.0.1:4885/" ) >>"$B/default.log" 2>&1
    if grep -q '^http://127.0.0.1:4885/$' "$B/wslview.log" 2>/dev/null && [ ! -s "$B/code.log" ]; then
        ok "browser-open-mode: config browser=system uses the system chain, not code"
    else
        no "browser-open-mode: system mode wrong (code.log=$(cat "$B/code.log" 2>/dev/null), wslview.log=$(cat "$B/wslview.log" 2>/dev/null))"
    fi

    # WIKI_BROWSER env beats config back to vscode.
    : >"$B/wslview.log"
    ( PATH="$B/bin:$PATH" WIKI_SERVE_OPEN=1 WIKI_BROWSER=vscode wiki_serve_open_browser "$B/repo" "http://127.0.0.1:4885/" ) >>"$B/default.log" 2>&1
    if grep -q 'vscode://simpleBrowser.show?url=' "$B/code.log" 2>/dev/null && [ ! -s "$B/wslview.log" ]; then
        ok "browser-open-mode: WIKI_BROWSER=vscode env overrides config"
    else
        no "browser-open-mode: env override not honored"
    fi
}

# ---------------------------------------------------------------------------
case_no_external_refs
case_payload_inlined
case_annotation_roundtrip
case_serve_lifecycle
case_browser_open_mode

echo
echo "wiki-portal: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
