#!/usr/bin/env bash
# Tests for the nitpicky skill lib scripts.
# Run: bash "$HOME/.claude/skills/nitpicky/tests/test-nitpicky.sh"
set -uo pipefail

SKILL_DIR="${HOME}/.claude/skills/nitpicky"
PY=python3
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PASS=0
FAIL=0
ok() { PASS=$((PASS + 1)); }
fail() { FAIL=$((FAIL + 1)); echo "FAIL: $*"; }
assert_eq() { # actual expected label
  if [ "$1" = "$2" ]; then ok; else fail "$3: expected [$2] got [$1]"; fi
}
assert_contains() { # haystack needle label
  if grep -qF -- "$2" <<<"$1"; then ok; else fail "$3: missing [$2]"; fi
}

# ---------------------------------------------------------------- fixtures
make_run() { # project_dir app_url -> echoes run dir
  mkdir -p "$1"
  "$SKILL_DIR/lib/new-run.sh" "$1" "$2"
}

write_lens() { # run_dir lens finding_json_array [coverage_json_array]
  local dir="$1/findings"
  mkdir -p "$dir"
  "$PY" - "$dir/$2.json" "$2" "$3" "${4:-}" <<'EOF'
import json, sys
path, lens, arr = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
doc = {"lens": lens, "findings": arr}
if len(sys.argv) > 4 and sys.argv[4]:
    doc["coverage"] = json.loads(sys.argv[4])
with open(path, "w") as f:
    json.dump(doc, f, indent=2)
EOF
}

finding() { # screenshot what expected  (url/severity defaults)
  printf '{"what": "%s", "expected": "%s", "url": "http://app.test/cart", "severity": "medium", "screenshot": "%s"}' \
    "$2" "$3" "$1"
}

# T9: new-run.sh scaffolds the run directory
RUN_A="$(make_run "$TMP/proj" 'http://localhost:3000')"
[ -n "$RUN_A" ] && [ -d "$RUN_A" ] && ok || fail "T9 new-run.sh did not echo a run dir"
if [ -d "$RUN_A/findings" ] && [ -d "$RUN_A/screenshots" ]; then ok; else fail "T9 findings/ + screenshots/ dirs missing"; fi
grep -q 'http://localhost:3000' "$RUN_A/run.json" && ok || fail "T9 run.json missing app_url"

# T1: merge happy path — merges lenses, writes findings.json + review.html
write_lens "$RUN_A" consistency "[$(finding 'screenshots/consistency-cart.png' 'Cart says Remove item' 'Cart says Delete item')]"
write_lens "$RUN_A" friction "[$(finding 'screenshots/friction-checkout.png' 'Checkout needs 6 clicks' 'Checkout needs 3 clicks')]"
MERGE_OUT="$("$PY" "$SKILL_DIR/lib/merge-findings.py" --run-dir "$RUN_A" 2>&1)"
MERGE_RC=$?
assert_eq "$MERGE_RC" "0" "T1 merge exit code"
[ -f "$RUN_A/findings.json" ] && ok || fail "T1 findings.json not written"
[ -f "$RUN_A/review.html" ] && ok || fail "T1 review.html not written"

# T4: payload inlined into review.html (works from file://, no fetch)
HTML="$(cat "$RUN_A/review.html")"
assert_contains "$HTML" '"NP-' "T4 ids inlined in html"
assert_contains "$HTML" 'Cart says Remove item' "T4 finding text inlined in html"
assert_contains "$HTML" 'screenshots/consistency-cart.png' "T4 screenshot path inlined in html"
if grep -q '__NITPICKY_PAYLOAD__' "$RUN_A/review.html"; then fail "T4 placeholder left in html"; else ok; fi

# T3: id stability — adding a third lens must not shift existing ids
ID_BEFORE="$("$PY" -c "import json;d=json.load(open('$RUN_A/findings.json'));print(sorted(f['id'] for f in d['findings']))")"
write_lens "$RUN_A" accessibility "[$(finding 'screenshots/a11y-form.png' 'Input has no label' 'Input has aria-label')]"
"$PY" "$SKILL_DIR/lib/merge-findings.py" --run-dir "$RUN_A" >/dev/null 2>&1 || fail "T3 remerge failed"
ID_AFTER="$("$PY" -c "import json;d=json.load(open('$RUN_A/findings.json'));print(sorted(f['id'] for f in d['findings']))")"
if [[ "$ID_AFTER" == *"$ID_BEFORE"* ]] || [ "$(comm -12 <(echo "$ID_BEFORE" | tr -d '[](),' | tr ' ' '\n' | grep -v '^$' | sort) <(echo "$ID_AFTER" | tr -d '[](),' | tr ' ' '\n' | grep -v '^$' | sort) | wc -l)" = "2" ]; then ok; else fail "T3 old ids shifted: before=$ID_BEFORE after=$ID_AFTER"; fi

# T5: missing screenshot named, not silent; finding kept with proof_ok false
RUN_B="$(make_run "$TMP/proj2" 'http://localhost:3001')"
write_lens "$RUN_B" visual-polish "[$(finding 'screenshots/gone.png' 'Button radius 4px here 8px there' 'One radius token')]"
MERGE_B="$("$PY" "$SKILL_DIR/lib/merge-findings.py" --run-dir "$RUN_B" 2>&1)"
assert_eq "$?" "0" "T5 merge exit with missing proof"
assert_contains "$MERGE_B" "missing-screenshots=[" "T5 missing proof named in output"
"$PY" -c "import json;d=json.load(open('$RUN_B/findings.json'));assert d['findings'][0]['proof_ok'] is False" &&
  ok || fail "T5 proof_ok not set false"

# T6: zero findings anywhere -> exit 2 with read-count named
RUN_C="$(make_run "$TMP/proj3" 'http://localhost:3002')"
write_lens "$RUN_C" consistency "[]"
write_lens "$RUN_C" friction "[]"
MERGE_C="$("$PY" "$SKILL_DIR/lib/merge-findings.py" --run-dir "$RUN_C" 2>&1)"
assert_eq "$?" "2" "T6 zero-findings exit code"
assert_contains "$MERGE_C" "read 0 findings" "T6 zero verdict names population size"

# T7: invalid JSON -> exit 1, names the file
RUN_D="$(make_run "$TMP/proj4" 'http://localhost:3003')"
mkdir -p "$RUN_D/findings"
echo '{broken' >"$RUN_D/findings/consistency.json"
MERGE_D="$("$PY" "$SKILL_DIR/lib/merge-findings.py" --run-dir "$RUN_D" 2>&1)"
assert_eq "$?" "1" "T7 invalid json exit code"
assert_contains "$MERGE_D" "consistency.json" "T7 names the broken file"

# T8: export-checklist.py — fix/defer/deny sections, notes, counts, undecided excluded
DEC="$RUN_A/decisions.json"
IDS="$("$PY" -c "import json;d=json.load(open('$RUN_A/findings.json'));print(' '.join(f['id'] for f in d['findings']))")"
read -r ID1 ID2 ID3 <<<"$IDS"
"$PY" - "$DEC" "$ID1" "$ID2" "$ID3" <<'EOF'
import json, sys
path, i1, i2, i3 = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
dec = {
    i1: {"decision": "fix", "explanation": "align the button labels"},
    i2: {"decision": "defer", "explanation": "post-launch cleanup"},
    i3: {"decision": "deny", "explanation": "works as designed"},
}
with open(path, "w") as f:
    json.dump(dec, f)
EOF
EXPORT_OUT="$("$PY" "$SKILL_DIR/lib/export-checklist.py" --run-dir "$RUN_A" --decisions "$DEC" 2>&1)"
assert_eq "$?" "0" "T8 export exit code"
[ -f "$RUN_A/CHECKLIST.md" ] && ok || fail "T8 CHECKLIST.md not written"
CK="$(cat "$RUN_A/CHECKLIST.md")"
assert_contains "$CK" "## Fix" "T8 Fix section"
assert_contains "$CK" "- [ ] $ID1" "T8 fix item as checkbox"
assert_contains "$CK" "align the button labels" "T8 user note carried into fix item"
assert_contains "$CK" "## Deferred" "T8 Deferred section"
assert_contains "$CK" "$ID2" "T8 defer item present"
assert_contains "$CK" "## Denied" "T8 Denied appendix"
assert_contains "$CK" "works as designed" "T8 deny reason carried"
assert_contains "$CK" "Fix: 1" "T8 counts line"
assert_contains "$EXPORT_OUT" "undecided=0" "T8 undecided count reported"

# T8b: export with undecided findings -> counted, excluded from sections
RUN_E="$(make_run "$TMP/proj5" 'http://localhost:3004')"
write_lens "$RUN_E" consistency "[$(finding 'screenshots/c.png' 'Two different date formats' 'One date format')]"
"$PY" "$SKILL_DIR/lib/merge-findings.py" --run-dir "$RUN_E" >/dev/null 2>&1
EMPTY="$RUN_E/empty-decisions.json"
echo '{}' >"$EMPTY"
EXPORT_E="$("$PY" "$SKILL_DIR/lib/export-checklist.py" --run-dir "$RUN_E" --decisions "$EMPTY" 2>&1)"
if grep -q "undecided=1" <<<"$EXPORT_E"; then ok; else fail "T8b undecided not counted: $EXPORT_E"; fi
if grep -q "## Fix" "$RUN_E/CHECKLIST.md"; then fail "T8b undecided leaked into Fix"; else ok; fi

# ---------------------------------------------------------------- server.py
# T10: server round-trip — decisions.json on disk, validation, export, traversal
RUN_S="$(make_run "$TMP/srv-proj" 'http://localhost:3000')"
write_lens "$RUN_S" consistency "[$(finding 'screenshots/c1.png' 'Finding one what' 'Finding one expected')]"
write_lens "$RUN_S" friction "[$(finding 'screenshots/f1.png' 'Finding two what' 'Finding two expected')]"
write_lens "$RUN_S" accessibility "[$(finding 'screenshots/a1.png' 'Finding three what' 'Finding three expected')]"
cp "$RUN_S/findings.json" /dev/null 2>/dev/null || true
"$PY" "$SKILL_DIR/lib/merge-findings.py" --run-dir "$RUN_S" >/dev/null 2>&1
# make screenshot files exist so proof_ok is true and static serving is testable
"$PY" - "$RUN_S" <<'EOF'
import base64, pathlib, sys
png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
run = pathlib.Path(sys.argv[1])
for name in ["c1.png", "f1.png", "a1.png"]:
    (run / "screenshots" / name).write_bytes(png)
EOF

SRV_PID=""
SRV_OUT="$TMP/server-out.txt"
"$PY" "$SKILL_DIR/lib/server.py" --run-dir "$RUN_S" --port 0 >"$SRV_OUT" 2>&1 &
SRV_PID=$!
trap 'kill $SRV_PID 2>/dev/null; rm -rf "$TMP"' EXIT

PORT=""
for _ in $(seq 1 50); do
  if grep -q '"port"' "$SRV_OUT" 2>/dev/null; then break; fi
  sleep 0.1
done
PORT="$("$PY" - "$SRV_OUT" <<'EOF'
import json, sys
print(json.loads(open(sys.argv[1]).readline())["port"])
EOF
)"
if [ -n "$PORT" ] && [ "$PORT" != "0" ]; then ok; else fail "T10 server did not report a port: $(cat "$SRV_OUT")"; fi

BASE="http://127.0.0.1:$PORT"
api_post() { # path body expected_code label
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    -H 'Content-Type: application/json' -H "Origin: $BASE" \
    -d "$2" "$BASE$1")"
  assert_eq "$CODE" "$3" "$4"
}
api_get_code() { # path expected_code label
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "$BASE$1")"
  assert_eq "$CODE" "$2" "$3"
}

SID1="$("$PY" -c "import json;d=json.load(open('$RUN_S/findings.json'));print(d['findings'][0]['id'])")"
SID2="$("$PY" -c "import json;d=json.load(open('$RUN_S/findings.json'));print(d['findings'][1]['id'])")"
SID3="$("$PY" -c "import json;d=json.load(open('$RUN_S/findings.json'));print(d['findings'][2]['id'])")"

api_get_code "/api/decisions" 200 "T10 GET decisions"
api_post "/api/decision" "{\"id\":\"$SID1\",\"decision\":\"fix\",\"explanation\":\"note one\"}" 200 "T10 valid patch"
[ -f "$RUN_S/decisions.json" ] && ok || fail "T10 decisions.json not written to disk"
grep -q '"note one"' "$RUN_S/decisions.json" && ok || fail "T10 explanation not in decisions.json"
grep -q '"decision": "fix"' "$RUN_S/decisions.json" && ok || fail "T10 decision not in decisions.json"

api_post "/api/decision" '{"id":"NP-nonexistent","decision":"fix"}' 400 "T10 unknown id rejected"
api_post "/api/decision" "{\"id\":\"$SID1\",\"decision\":\"maybe\"}" 400 "T10 bad enum rejected"
api_post "/api/decision" "{\"id\":\"$SID1\",\"decision\":\"fix\",\"bogus\":1}" 400 "T10 unknown field rejected"
BIG="$("$PY" -c "print('x' * 25000)")"
api_post "/api/decision" "{\"id\":\"$SID1\",\"explanation\":\"$BIG\"}" 400 "T10 oversized explanation rejected"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -H 'Origin: http://evil.example' -d '{}' "$BASE/api/decision")"
assert_eq "$CODE" "403" "T10 foreign origin rejected"

api_post "/api/decision" "{\"id\":\"$SID1\",\"decision\":null}" 200 "T10 clear decision accepted"
"$PY" - "$RUN_S" "$SID1" <<'EOF'
import json, sys
doc = json.load(open(sys.argv[1] + "/decisions.json"))
rec = doc["decisions"][sys.argv[2]]
assert "decision" not in rec, rec
assert rec["explanation"] == "note one", rec
EOF
[ $? = 0 ] && ok || fail "T10 clear did not preserve explanation"

# last-item completion: decide all three, verify count from disk, not the UI
api_post "/api/decision" "{\"id\":\"$SID1\",\"decision\":\"fix\"}" 200 "T10 last-item re-decide"
api_post "/api/decision" "{\"id\":\"$SID2\",\"decision\":\"defer\",\"explanation\":\"later\"}" 200 "T10 second decision"
api_post "/api/decision" "{\"id\":\"$SID3\",\"decision\":\"deny\",\"explanation\":\"as designed\"}" 200 "T10 third decision"
"$PY" - "$RUN_S" <<'EOF'
import json, sys
doc = json.load(open(sys.argv[1] + "/decisions.json"))
assert len(doc["decisions"]) == 3, doc["decisions"]
EOF
[ $? = 0 ] && ok || fail "T10 disk state missing all three decisions"

api_post "/api/export" '{}' 200 "T10 export endpoint"
grep -q '^## Fix (1)' "$RUN_S/CHECKLIST.md" && ok || fail "T10 CHECKLIST.md missing Fix section"
grep -q '^## Denied (1)' "$RUN_S/CHECKLIST.md" && ok || fail "T10 CHECKLIST.md missing Denied section"

api_get_code "/screenshots/c1.png" 200 "T10 screenshot served"
CODE="$(curl -s -o /dev/null -w '%{http_code}' --path-as-is "$BASE/screenshots/../findings.json")"
assert_eq "$CODE" "404" "T10 path traversal blocked"

kill "$SRV_PID" 2>/dev/null
wait "$SRV_PID" 2>/dev/null

# T11: malformed decisions.json -> startup refuses, file not clobbered
printf '{broken' >"$RUN_S/decisions.json"
"$PY" "$SKILL_DIR/lib/server.py" --run-dir "$RUN_S" --port 0 >/dev/null 2>&1
RC=$?
assert_eq "$RC" "2" "T11 malformed state exit code"
grep -q '{broken' "$RUN_S/decisions.json" && ok || fail "T11 malformed file was clobbered"
rm -f "$RUN_S/decisions.json"

# ---------------------------------------------------------------- live-run feedback
# T12: duplicate-evidence detection — byte-identical PNGs across lens prefixes flagged
RUN_F="$(make_run "$TMP/proj-dup" 'http://localhost:3000')"
"$PY" - "$RUN_F" <<'EOF'
import base64, pathlib, sys
png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
run = pathlib.Path(sys.argv[1])
(run / "screenshots" / "consistency-shared.png").write_bytes(png)
(run / "screenshots" / "friction-shared.png").write_bytes(png)
(run / "screenshots" / "consistency-unique.png").write_bytes(png + b"\x01")
EOF
write_lens "$RUN_F" consistency "[{\"what\": \"Dup evidence finding A\", \"expected\": \"x\", \"url\": \"http://localhost:3000/a\", \"severity\": \"low\", \"screenshot\": \"screenshots/consistency-shared.png\"},{\"what\": \"Unique evidence finding\", \"expected\": \"x\", \"url\": \"http://localhost:3000/a\", \"severity\": \"low\", \"screenshot\": \"screenshots/consistency-unique.png\"}]"
write_lens "$RUN_F" friction "[{\"what\": \"Dup evidence finding B\", \"expected\": \"y\", \"url\": \"http://localhost:3000/b\", \"severity\": \"low\", \"screenshot\": \"screenshots/friction-shared.png\"}]"
MERGE_F="$("$PY" "$SKILL_DIR/lib/merge-findings.py" --run-dir "$RUN_F" 2>&1)"
assert_eq "$?" "0" "T12 merge exit"
assert_contains "$MERGE_F" "duplicate-evidence" "T12 duplicate evidence named"
"$PY" - "$RUN_F" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1] + "/findings.json"))
flagged = [f["id"] for f in d["findings"] if f.get("evidence_flag") == "duplicate-image"]
assert len(flagged) == 2, flagged
uniq = [f for f in d["findings"] if f["what"].startswith("Unique")]
assert not uniq[0].get("evidence_flag"), "unique-evidence finding wrongly flagged"
EOF
[ $? = 0 ] && ok || fail "T12 flagging wrong (expected exactly the 2 shared-byte findings)"

# T13: cross-lens clustering — near-identical defect from two lenses shares a cluster
RUN_G="$(make_run "$TMP/proj-cluster" 'http://localhost:3000')"
write_lens "$RUN_G" consistency "[{\"what\": \"Privacy policy link leaks draft content to anonymous users\", \"expected\": \"Drafts not public\", \"url\": \"http://localhost:3000/privacy\", \"severity\": \"high\", \"screenshot\": \"screenshots/c-priv.png\"}]"
write_lens "$RUN_G" friction "[{\"what\": \"privacy policy link leaks draft content to anonymous users\", \"expected\": \"Drafts not public\", \"url\": \"http://localhost:3000/privacy\", \"severity\": \"high\", \"screenshot\": \"screenshots/f-priv.png\"}]"
"$PY" -c "import base64,pathlib;p=pathlib.Path('$RUN_G/screenshots');png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');(p/'c-priv.png').write_bytes(png);(p/'f-priv.png').write_bytes(png+b'x')"
"$PY" "$SKILL_DIR/lib/merge-findings.py" --run-dir "$RUN_G" >/dev/null 2>&1
"$PY" - "$RUN_G" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1] + "/findings.json"))
fs = d["findings"]
assert len(fs) == 2
assert fs[0].get("cluster") and fs[0]["cluster"] == fs[1]["cluster"], fs
assert fs[0]["cluster_size"] == 2
assert len(d["clusters"]) == 1
EOF
[ $? = 0 ] && ok || fail "T13 clustering failed"

# T14: redaction — run.json redactions scrubbed from findings.json AND checklist
mkdir -p "$TMP/proj-redact"
printf 's3cretPW\n' >"$TMP/redact.txt"
printf '/cart\n/missing-page\n' >"$TMP/routes.txt"
RUN_H="$("$SKILL_DIR/lib/new-run.sh" "$TMP/proj-redact" 'http://localhost:3000' --redact-file "$TMP/redact.txt" --routes-file "$TMP/routes.txt")"
grep -q '"s3cretPW"' "$RUN_H/run.json" && ok || fail "T14 run.json carries redactions"
grep -q '"/cart"' "$RUN_H/run.json" && ok || fail "T14 run.json carries coverage.expected"
write_lens "$RUN_H" consistency "[{\"what\": \"Login form uses password s3cretPW in placeholder\", \"expected\": \"No credential in UI\", \"url\": \"http://localhost:3000/login\", \"severity\": \"high\", \"screenshot\": \"screenshots/r.png\"}]" "[{\"path\": \"/cart\", \"status\": \"covered\"},{\"path\": \"/settings\", \"status\": \"blocked\", \"note\": \"503s\"}]"
"$PY" -c "import base64,pathlib;(pathlib.Path('$RUN_H/screenshots')/'r.png').write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='))"
MERGE_H="$("$PY" "$SKILL_DIR/lib/merge-findings.py" --run-dir "$RUN_H" 2>&1)"
assert_eq "$?" "0" "T14 merge exit"
if grep -q "s3cretPW" "$RUN_H/findings.json"; then fail "T14 secret survived in findings.json"; else ok; fi
grep -q "\[REDACTED\]" "$RUN_H/findings.json" && ok || fail "T14 [REDACTED] marker absent"
"$PY" "$SKILL_DIR/lib/export-checklist.py" --run-dir "$RUN_H" --decisions <(echo '{}') >/dev/null 2>&1
if grep -q "s3cretPW" "$RUN_H/CHECKLIST.md" 2>/dev/null; then fail "T14 secret survived in checklist"; else ok; fi

# T15: coverage aggregation + uncovered expected route named (same merge)
assert_contains "$MERGE_H" "uncovered-expected=[/missing-page]" "T15 uncovered expected route named"
assert_contains "$MERGE_H" "blocked=1" "T15 blocked count in run-health"
"$PY" - "$RUN_H" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1] + "/findings.json"))
cov = d["coverage"]
assert cov["covered"] == ["/cart"], cov
assert cov["blocked"][0]["path"] == "/settings", cov
assert cov["uncovered_expected"] == ["/missing-page"], cov
EOF
[ $? = 0 ] && ok || fail "T15 coverage block wrong"

# T16: suspected_env_cause passthrough + run-health summary
write_lens "$RUN_H" friction "[{\"what\": \"Whole analytics page stuck on spinner\", \"expected\": \"Data loads\", \"url\": \"http://localhost:3000/analytics\", \"severity\": \"medium\", \"screenshot\": \"screenshots/e.png\", \"suspected_env_cause\": true}]"
"$PY" -c "import base64,pathlib;(pathlib.Path('$RUN_H/screenshots')/'e.png').write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='))"
MERGE_I="$("$PY" "$SKILL_DIR/lib/merge-findings.py" --run-dir "$RUN_H" 2>&1)"
assert_contains "$MERGE_I" "suspected-env=1" "T16 run-health counts env findings"
"$PY" - "$RUN_H" <<'EOF'
import json, sys
d = json.load(open(sys.argv[1] + "/findings.json"))
envs = [f for f in d["findings"] if f.get("suspected_env_cause")]
assert len(envs) == 1 and d["env_summary"]["suspected_env_findings"] == 1
EOF
[ $? = 0 ] && ok || fail "T16 env passthrough wrong"

echo ""
echo "passed=$PASS failed=$FAIL"
[ "$FAIL" = "0" ]
