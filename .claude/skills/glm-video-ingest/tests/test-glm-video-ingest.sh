#!/usr/bin/env bash
# Offline tests for glm-video-ingest: parsers + guards (no network, no API).
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$HERE/execute.sh"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  \033[0;32mPASS\033[0m %s\n' "$1"; }
no()   { FAIL=$((FAIL+1)); printf '  \033[0;31mFAIL\033[0m %s\n' "$1"; }
check(){ if eval "$2"; then ok "$1"; else no "$1"; fi; }

echo "== syntax =="
check "execute.sh parses" "bash -n '$SCRIPT'"

echo "== arg guards =="
out="$(bash "$SCRIPT" 2>&1)"; check "missing URL exits non-zero" "[ \$? -ne 0 ]"
check "missing URL message"  "echo \"\$out\" | grep -q 'missing input'"
out="$(ZAI_API_KEY=x bash "$SCRIPT" 'http://x' --provider bogus 2>&1)"
check "bad --provider rejected" "echo \"\$out\" | grep -q 'unknown --provider'"
out="$(ZAI_API_KEY=x bash "$SCRIPT" 'http://x' --type bogus 2>&1)"
check "bad --type rejected"  "echo \"\$out\" | grep -q 'unknown --type'"

echo "== loom id parse =="
idp() { echo "$1" | sed -nE 's#.*loom\.com/(share|embed)/([a-f0-9]{16,})\b.*#\2#p'; }
check "share url id"   "[ \"\$(idp 'https://www.loom.com/share/0123456789abcdef0123456789abcdef?t=1')\" = '0123456789abcdef0123456789abcdef' ]"
check "embed url id"   "[ \"\$(idp 'https://loom.com/embed/0123456789abcdef0123456789abcdef')\" = '0123456789abcdef0123456789abcdef' ]"
check "non-loom empty" "[ -z \"\$(idp 'https://youtube.com/watch?v=abc')\" ]"

echo "== vtt -> timestamped =="
vtt() { awk '
  /-->/ { split($1,a,":"); if(length(a)==3){sec=a[1]*3600+a[2]*60+int(a[3])}else{sec=a[1]*60+int(a[2])}; ts=sprintf("%02d:%02d",int(sec/60),sec%60); next }
  /^WEBVTT/||/^NOTE/||/^[0-9]+$/||/^$/ {next}
  {gsub(/<[^>]*>/,""); if(ts!="")printf "[%s] %s\n",ts,$0}'; }
res="$(printf 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.000\nClick <b>Submit</b>\n\n2\n00:01:05.500 --> 00:01:09.000\nIf empty show error\n' | vtt)"
check "strips markup + cue nums" "[ \"\$(echo \"\$res\" | head -1)\" = '[00:01] Click Submit' ]"
check "hh:mm:ss -> mm:ss"        "echo \"\$res\" | grep -q '\[01:05\] If empty show error'"

echo "== jq render (json -> md) =="
echo '{"video_summary":"x","screens":[{"id":"s1","name":"Login","ui_elements":[{"type":"button","label":"Go"}]}],"conditional_logic":[{"t":"01:05","trigger":"click","condition":"empty","action":"error","narration_quote":"if empty error"}],"data_model":[{"entity":"User","fields":["email"],"notes":"n"}],"integrations":[],"build_notes":"bn"}' > /tmp/glmvt-test.json
md="$(jq -r --arg src s --arg vurl v '
  "## Conditional Logic\n",
  ( if ((.conditional_logic // [])|length)==0 then "_none_\n" else
    ( (.conditional_logic // [])[] |
      ( "- **[\(.t // "")] \(.trigger // "")** → IF \(.condition // "") THEN \(.action // "")"
        + ( if (.narration_quote // "")!="" then "\n  > " + (.narration_quote) else "" end ) ) ) end ),
  ( (.data_model // [])[] |
      ( "- **\(.entity)**: " + ((.fields // [])|join(", "))
        + ( if (.notes // "")!="" then " — " + (.notes) else "" end ) ) )
' /tmp/glmvt-test.json 2>&1)"
check "jq render compiles"     "[ \$? -eq 0 ]"
check "renders logic line"     "echo \"\$md\" | grep -q 'IF empty THEN error'"
check "renders narration quote" "echo \"\$md\" | grep -q '> if empty error'"
check "renders data model"     "echo \"\$md\" | grep -q '\*\*User\*\*: email — n'"
rm -f /tmp/glmvt-test.json

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
