#!/usr/bin/env bash
# tests/test-cfn-fleet-roster.sh
# cfn-fleet roster core (roster CLI subset): init scaffold + duplicate refusal
# (65), add WS pattern validation + uniqueness, claim overlap rules (prefix-dir
# and glob-dir overlap refused, non-overlap accepted), heartbeat ts/note
# replacement, status table + --tsv, router unknown-subcommand 64, run-dir
# resolution (--run-dir flag, $FLEET_RUN_DIR env, walk-up discovery).
# Style: ok/no counters + trap cleanup EXIT per tests/test-brief-size-guard.sh;
# logging helpers from tests/test-utils.sh per tests/CORE_TEST_STANDARDS.md.
set -uo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
# test-utils re-enables `set -e`; drop it so one failed check reports through
# the ok/no counters instead of aborting the suite at the first failure.
set +e

TMP=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/fleet-roster-test-XXXXXX")" && pwd -P)  # macOS: /var is /private/var; fleet prints the physical path
P="$TMP/proj"   # fake target project the fleet commands run against
FLEET="$PROJECT_ROOT/.claude/skills/cfn-fleet/cli/fleet"

PASS=0
FAIL=0
ok(){ echo "PASS: $1"; PASS=$((PASS+1)); }
no(){ echo "FAIL: $1"; FAIL=$((FAIL+1)); }
cleanup(){ rm -rf "$TMP"; }
trap cleanup EXIT

FIXNUM=0
fixture(){
  # fresh project per call: run-dir discovery picks the NEWEST planning/fleet-*
  # per level, so a reused project dir would leak rows across test scenarios
  FIXNUM=$((FIXNUM+1))
  P="$TMP/proj-$FIXNUM"
  mkdir -p "$P/planning"
  git -C "$P" init -q
  git -C "$P" config user.email fleet@example.test
  git -C "$P" config user.name "Fleet Test"
}

# Run fleet with cwd=$1. Captures: OUT (stdout), ERR (stderr), RC.
run_fleet(){
  local dir="$1"; shift
  OUT=$(cd "$dir" && "$FLEET" "$@" 2>"$TMP/stderr.txt")
  RC=$?
  ERR=$(cat "$TMP/stderr.txt")
}

# tsv_field <roster.tsv> <ws_id> <1-based field index> -> value
tsv_field(){
  awk -F'\t' -v ws="$2" -v i="$3" '$1==ws{print $i; exit}' "$1"
}

# ---------------------------------------------------------------------------
test_init_scaffold_and_duplicate_refusal(){
  log_step "GIVEN fresh fake project, WHEN fleet init demo, THEN scaffold complete"
  fixture
  run_fleet "$P" init demo
  [ "$RC" -eq 0 ] && ok "init exits 0" || no "init rc=$RC err=$ERR"
  [ "$OUT" = "$P/planning/fleet-demo" ] && ok "init echoes run dir path" || no "init stdout: '$OUT'"

  local RD="$P/planning/fleet-demo" f
  for f in roster.tsv fleet.env .roster.lock COORDINATION.md RUNBOOK.md \
           briefs/BRIEF_WS.md handoffs/HANDOFF_WS.md; do
    [ -e "$RD/$f" ] && ok "scaffolded $f" || no "missing scaffold file $f"
  done

  # roster: header only, 12 tab-separated columns, canonical names (engine, host appended)
  [ "$(wc -l < "$RD/roster.tsv")" -eq 1 ] && ok "roster header-only" \
    || no "roster has $(wc -l < "$RD/roster.tsv") lines, want 1"
  local hdr
  hdr=$(head -n1 "$RD/roster.tsv")
  [ "$(printf '%s\n' "$hdr" | awk -F'\t' '{print NF}')" -eq 13 ] \
    && ok "header has 13 tab fields" || no "header fields: '$hdr'"
  [ "$(printf '%s\n' "$hdr" | awk -F'\t' '{print $1":"$4":"$9":"$10":"$11":"$12}')" = "ws_id:status:heartbeat:notes:engine:host" ] \
    && ok "header column names" || no "header names: '$hdr'"
  [ -f "$RD/engines.env" ] && ok "init installs engines.env registry copy" \
    || no "engines.env missing from run dir"

  grep -q '^FLEET_WORKTREE=off$' "$RD/fleet.env" && ok "default FLEET_WORKTREE=off" || no "fleet.env worktree default"
  grep -q '^FLEET_DB=none$'      "$RD/fleet.env" && ok "default FLEET_DB=none"      || no "fleet.env db default"

  log_step "WHEN init again with same slug, THEN exit 65 (data error)"
  run_fleet "$P" init demo
  [ "$RC" -eq 65 ] && ok "duplicate init refused with 65" || no "duplicate init rc=$RC"

  log_step "WHEN init --worktree --db docker, THEN flags land in fleet.env"
  run_fleet "$P" init wt --worktree --db docker
  [ "$RC" -eq 0 ] && ok "init wt exits 0" || no "init wt rc=$RC err=$ERR"
  grep -q '^FLEET_WORKTREE=on$'  "$P/planning/fleet-wt/fleet.env" && ok "worktree flag stored" || no "worktree flag"
  grep -q '^FLEET_DB=docker$'    "$P/planning/fleet-wt/fleet.env" && ok "db flag stored"       || no "db flag"
}

# ---------------------------------------------------------------------------
test_add_validation_and_uniqueness(){
  log_step "GIVEN initialized run dir, WHEN add with bad/valid WS ids"
  fixture
  run_fleet "$P" init demo
  local R="$P/planning/fleet-demo/roster.tsv"

  run_fleet "$P" add WS1 "single digit id"
  [ "$RC" -eq 65 ] && ok "add WS1 rejected (needs 2+ digits)" || no "add WS1 rc=$RC"
  run_fleet "$P" add FLEET02 "wrong prefix"
  [ "$RC" -eq 65 ] && ok "add FLEET02 rejected (prefix)" || no "add FLEET02 rc=$RC"
  run_fleet "$P" add ws01 "lowercase id"
  [ "$RC" -eq 65 ] && ok "add ws01 rejected (case)" || no "add ws01 rc=$RC"

  run_fleet "$P" add WS001 "three digits ok"
  [ "$RC" -eq 0 ] && ok "add WS001 accepted (2+ digits)" || no "add WS001 rc=$RC err=$ERR"

  run_fleet "$P" add WS01 "build parser module" --name alpha --claims src/parser.ts,src/lexer.ts
  [ "$RC" -eq 0 ] && ok "add WS01 accepted" || no "add WS01 rc=$RC err=$ERR"

  [ "$(tsv_field "$R" WS01 2)" = "alpha" ] && ok "--name stored" \
    || no "name: '$(tsv_field "$R" WS01 2)'"
  [ "$(tsv_field "$R" WS01 3)" = "build parser module" ] && ok "task stored" \
    || no "task: '$(tsv_field "$R" WS01 3)'"
  [ "$(tsv_field "$R" WS01 4)" = "pending" ] && ok "status defaults to pending" \
    || no "status: '$(tsv_field "$R" WS01 4)'"
  [ "$(tsv_field "$R" WS01 5)" = "src/parser.ts src/lexer.ts" ] && ok "claims comma-split space-joined" \
    || no "claims: '$(tsv_field "$R" WS01 5)'"
  [ "$(tsv_field "$R" WS01 9)" = "0" ] && ok "heartbeat defaults to 0" \
    || no "heartbeat: '$(tsv_field "$R" WS01 9)'"
  [ -z "$(tsv_field "$R" WS01 6)" ] && ok "landed_sha starts empty" \
    || no "landed_sha: '$(tsv_field "$R" WS01 6)'"
  # default name when --name omitted: lowercased ws id
  [ "$(tsv_field "$R" WS001 2)" = "ws001" ] && ok "default name is lowercased ws id" \
    || no "WS001 name: '$(tsv_field "$R" WS001 2)'"

  log_step "WHEN add duplicate WS id, THEN exit 65"
  run_fleet "$P" add WS01 "duplicate"
  [ "$RC" -eq 65 ] && ok "duplicate ws refused with 65" || no "duplicate add rc=$RC"
}

# ---------------------------------------------------------------------------
test_add_refuses_placeholder_overwrite_and_next_id(){
  log_step "GIVEN a QUEUED placeholder row, WHEN add on its id, THEN 65 naming the task (MDTWII overwrite bug)"
  fixture
  run_fleet "$P" init nid
  run_fleet "$P" next-id
  [ "$RC" -eq 0 ] && [ "$OUT" = "WS01" ] && ok "next-id on empty roster is WS01" || no "next-id empty rc=$RC out='$OUT'"

  run_fleet "$P" add WS260 "QUEUED: Campaign: WS76 guilds"
  run_fleet "$P" add WS05 "real work"
  local R
  R=$(ls -d "$P"/planning/fleet-nid)/roster.tsv

  run_fleet "$P" add WS260 "new task"
  [ "$RC" -eq 65 ] && ok "add over placeholder refused with 65" || no "placeholder add rc=$RC"
  printf '%s' "$ERR" | grep -q "QUEUED: Campaign: WS76 guilds" && ok "message names existing task" || no "msg: $ERR"
  printf '%s' "$ERR" | grep -qi "placeholder" && ok "message says placeholder" || no "no placeholder word: $ERR"
  [ "$(tsv_field "$R" WS260 3)" = "QUEUED: Campaign: WS76 guilds" ] && ok "placeholder row untouched" || no "row changed: $(tsv_field "$R" WS260 3)"

  run_fleet "$P" add WS05 "second"
  [ "$RC" -eq 65 ] && printf '%s' "$ERR" | grep -q "real work" && ! printf '%s' "$ERR" | grep -qi placeholder \
    && ok "non-placeholder dup names task, no placeholder word" || no "dup msg rc=$RC err=$ERR"

  run_fleet "$P" add WS260 "forced task" --force
  [ "$RC" -eq 0 ] && [ "$(tsv_field "$R" WS260 3)" = "forced task" ] && ok "--force overwrites the row" || no "force rc=$RC task=$(tsv_field "$R" WS260 3)"
  [ "$(grep -c '^WS260	' "$R")" -eq 1 ] && ok "--force leaves exactly one WS260 row" || no "WS260 row count"

  log_step "WHEN next-id on roster with WS05 and WS260, THEN WS261 (above every row)"
  run_fleet "$P" next-id
  [ "$RC" -eq 0 ] && [ "$OUT" = "WS261" ] && ok "next-id is WS261" || no "next-id rc=$RC out='$OUT'"

  fixture
  run_fleet "$P" init nid2
  run_fleet "$P" add WS09 "nine"
  run_fleet "$P" next-id
  [ "$OUT" = "WS10" ] && ok "next-id zero-pads to existing width (WS10)" || no "next-id pad: '$OUT'"
  run_fleet "$P" add WS001 "three wide"
  run_fleet "$P" next-id
  [ "$OUT" = "WS010" ] && ok "next-id keeps widest existing width (WS010)" || no "next-id wide: '$OUT'"

  log_step "WHEN add a fresh id then spawn --dry-run, THEN no overwrite/placeholder warning"
  fixture
  run_fleet "$P" init nid3
  run_fleet "$P" add WS05 "task"
  [ "$RC" -eq 0 ] && ok "fresh add exits 0" || no "fresh add rc=$RC"
  run_fleet "$P" spawn WS05 --dry-run
  ! printf '%s' "$ERR" | grep -qiE "placeholder|already exists" && ok "spawn after fresh add has no placeholder warning" || no "spawn warned: $ERR"
}

# ---------------------------------------------------------------------------
test_claim_overlap_rules(){
  log_step "GIVEN WS01-WS03, WHEN claims with overlapping/disjoint paths"
  fixture
  run_fleet "$P" init demo
  local R="$P/planning/fleet-demo/roster.tsv"
  run_fleet "$P" add WS01 "t1"
  run_fleet "$P" add WS02 "t2"
  run_fleet "$P" add WS03 "t3"

  run_fleet "$P" claim WS01 src
  [ "$RC" -eq 0 ] && ok "plain dir claim accepted" || no "claim src rc=$RC err=$ERR"
  [ "$(tsv_field "$R" WS01 5)" = "src" ] && ok "claim stored in row" \
    || no "WS01 claims: '$(tsv_field "$R" WS01 5)'"

  run_fleet "$P" claim WS02 src/app.ts
  [ "$RC" -eq 65 ] && ok "file under another row's dir refused (prefix overlap)" \
    || no "src/app.ts rc=$RC"

  run_fleet "$P" claim WS02 lib
  [ "$RC" -eq 0 ] && ok "sibling dir claim accepted" || no "claim lib rc=$RC"
  run_fleet "$P" claim WS02 lib/util.ts
  [ "$RC" -eq 0 ] && ok "file under own dir accepted" || no "claim lib/util.ts rc=$RC"
  [ "$(tsv_field "$R" WS02 5)" = "lib lib/util.ts" ] && ok "claims accumulate space-joined" \
    || no "WS02 claims: '$(tsv_field "$R" WS02 5)'"

  run_fleet "$P" claim WS01 lib/util.ts
  [ "$RC" -eq 65 ] && ok "exact-path overlap with another row refused" \
    || no "exact overlap rc=$RC"

  run_fleet "$P" claim WS02 'docs/*.md'
  [ "$RC" -eq 0 ] && ok "glob claim accepted" || no "glob claim rc=$RC err=$ERR"
  run_fleet "$P" claim WS03 docs/guide.md
  [ "$RC" -eq 65 ] && ok "file under glob dir refused (glob-expanded overlap)" \
    || no "glob overlap rc=$RC"

  run_fleet "$P" claim WS03 README.md
  [ "$RC" -eq 0 ] && ok "disjoint file claim accepted" || no "README claim rc=$RC"

  run_fleet "$P" claim WS09 nowhere
  [ "$RC" -eq 65 ] && ok "claim on unknown ws refused" || no "WS09 claim rc=$RC"

  run_fleet "$P" claim WS01 src
  [ "$RC" -eq 0 ] && ok "re-claiming own path accepted" || no "re-claim rc=$RC"
  [ "$(tsv_field "$R" WS01 5)" = "src" ] && ok "no self-duplicate claim" \
    || no "self-dup claims: '$(tsv_field "$R" WS01 5)'"
}

# ---------------------------------------------------------------------------
test_heartbeat_updates_ts_and_note(){
  log_step "GIVEN WS01, WHEN heartbeat with/without note"
  fixture
  run_fleet "$P" init demo
  local R="$P/planning/fleet-demo/roster.tsv"
  run_fleet "$P" add WS01 "t"

  run_fleet "$P" heartbeat WS01
  [ "$RC" -eq 0 ] && ok "heartbeat exits 0" || no "heartbeat rc=$RC err=$ERR"
  local hb now
  hb=$(tsv_field "$R" WS01 9)
  now=$(date +%s)
  if [ -n "$hb" ] && [ "$hb" -gt 0 ] && [ $((now - hb)) -le 5 ]; then
    ok "heartbeat ts set to ~now"
  else
    no "heartbeat ts: '$hb' vs now=$now"
  fi
  [ -z "$(tsv_field "$R" WS01 10)" ] && ok "no-note heartbeat leaves notes empty" \
    || no "notes after bare heartbeat: '$(tsv_field "$R" WS01 10)'"

  run_fleet "$P" heartbeat WS01 "first note"
  [ "$(tsv_field "$R" WS01 10)" = "first note" ] && ok "note stored" \
    || no "note: '$(tsv_field "$R" WS01 10)'"

  run_fleet "$P" heartbeat WS01 "second note"
  [ "$(tsv_field "$R" WS01 10)" = "second note" ] && ok "note replaced (last wins)" \
    || no "note after replace: '$(tsv_field "$R" WS01 10)'"

  run_fleet "$P" heartbeat WS01
  [ "$(tsv_field "$R" WS01 10)" = "second note" ] && ok "bare heartbeat keeps existing note" \
    || no "note lost: '$(tsv_field "$R" WS01 10)'"

  run_fleet "$P" heartbeat WS77
  [ "$RC" -eq 65 ] && ok "heartbeat on unknown ws refused" || no "WS77 heartbeat rc=$RC"
}

# ---------------------------------------------------------------------------
test_status_table_and_tsv(){
  log_step "GIVEN rows incl. an over-40-char task, WHEN status"
  fixture
  run_fleet "$P" init demo
  local RD="$P/planning/fleet-demo"
  run_fleet "$P" add WS01 "short task"
  # char 41 must be a letter so the leak check cannot match table padding
  local long="aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddddddddddddddddddddddddddddddddddddd"
  run_fleet "$P" add WS02 "$long"
  run_fleet "$P" claim WS01 a.ts b.ts

  run_fleet "$P" status
  [ "$RC" -eq 0 ] && ok "status exits 0" || no "status rc=$RC err=$ERR"
  printf '%s\n' "$OUT" | grep -q "ws_id"  && ok "table has header" || no "no header in: $OUT"
  printf '%s\n' "$OUT" | grep -q "WS01"   && ok "table lists WS01" || no "WS01 missing"
  printf '%s\n' "$OUT" | grep -q "WS02"   && ok "table lists WS02" || no "WS02 missing"
  printf '%s\n' "$OUT" | grep -q "pending" && ok "status column rendered" || no "no status column"

  # truncation: 40-char prefix present, 41st char absent
  local p40 p41 line
  p40=$(printf '%s' "$long" | cut -c1-40)
  p41=$(printf '%s' "$long" | cut -c1-41)
  line=$(printf '%s\n' "$OUT" | grep -F "$p40" | head -n1)
  [ -n "$line" ] && ok "task truncated to 40 chars (prefix shown)" || no "40-char prefix not found"
  printf '%s\n' "$line" | grep -qF "$p41" && no "task column leaked past 40 chars" \
    || ok "no chars beyond 40 in task column"

  # claims count + heartbeat age parsed from row tail (task has spaces, so use
  # NF; engine column sits last, age second-to-last)
  line=$(printf '%s\n' "$OUT" | grep "^WS01")
  [ "$(printf '%s\n' "$line" | awk '{print $(NF-2)}')" = "2" ] && ok "#claims column counted" \
    || no "#claims: '$line'"
  [ "$(printf '%s\n' "$line" | awk '{print $(NF-1)}')" = "-" ] && ok "zero heartbeat renders '-'" \
    || no "age for hb=0: '$line'"
  [ "$(printf '%s\n' "$line" | awk '{print $NF}')" = "claude-sub" ] && ok "default engine rendered" \
    || no "engine col: '$line'"

  log_step "WHEN heartbeat then status, THEN age renders as seconds"
  run_fleet "$P" heartbeat WS01
  run_fleet "$P" status
  local age
  age=$(printf '%s\n' "$OUT" | awk '$1=="WS01"{print $(NF-1)}')
  if [ -n "$age" ] && [ "$age" != "-" ] && [ "$age" -ge 0 ] 2>/dev/null; then
    ok "heartbeat age rendered numerically ($age)"
  else
    no "age after heartbeat: '$age'"
  fi

  log_step "WHEN status --tsv, THEN raw 13-field TSV rows"
  run_fleet "$P" status --tsv
  [ "$RC" -eq 0 ] && ok "status --tsv exits 0" || no "tsv rc=$RC"
  [ "$(printf '%s\n' "$OUT" | awk -F'\t' 'NR>1{print NF}' | sort -u)" = "13" ] \
    && ok "tsv rows have 13 tab fields" || no "tsv field counts: $(printf '%s\n' "$OUT" | awk -F'\t' 'NR>1{print NF}' | sort -u | tr '\n' ' ')"
  [ "$(printf '%s\n' "$OUT" | awk -F'\t' '$1=="WS02"{print $3}')" = "$long" ] \
    && ok "tsv shows untruncated task" || no "tsv task mangled"
  printf '%s\n' "$OUT" | awk -F'\t' 'NR==1{exit ($1=="ws_id" && NF==13)?0:1}' \
    && ok "tsv includes header" || no "tsv header missing"

  log_step "GIVEN empty roster, WHEN status, THEN header only + exit 0"
  run_fleet "$P" init empty
  run_fleet "$P" status --run-dir "$P/planning/fleet-empty"
  [ "$RC" -eq 0 ] && ok "empty roster status exits 0" || no "empty status rc=$RC"
  [ "$(printf '%s\n' "$OUT" | wc -l)" -eq 1 ] && ok "empty roster renders header only" \
    || no "empty roster lines: $(printf '%s\n' "$OUT" | wc -l)"
}

# ---------------------------------------------------------------------------
test_router_unknown_subcommand(){
  log_step "GIVEN initialized run dir, WHEN unknown/missing subcommand"
  fixture
  run_fleet "$P" init demo

  run_fleet "$P" frobnicate
  [ "$RC" -eq 64 ] && ok "unknown subcommand exits 64" || no "frobnicate rc=$RC"
  printf '%s' "$ERR" | grep -qi "usage" && ok "usage goes to stderr" || no "stderr: '$ERR'"
  # spawn and add accept --engine; the top-level usage must say so
  printf '%s' "$ERR" | grep -qE '^ *spawn WSxx .*--engine e' && ok "usage lists spawn --engine" \
    || no "spawn usage line lacks --engine"
  printf '%s' "$ERR" | grep -qE '^ *add WSxx .*--engine e' && ok "usage lists add --engine" \
    || no "add usage line lacks --engine"

  run_fleet "$P"
  [ "$RC" -eq 64 ] && ok "missing subcommand exits 64" || no "no-subcommand rc=$RC"

  run_fleet "$P" Bad-Sub x
  [ "$RC" -eq 64 ] && ok "uppercase subcommand rejected" || no "Bad-Sub rc=$RC"

  run_fleet "$P" --run-dir
  [ "$RC" -eq 64 ] && ok "--run-dir without value exits 64" || no "--run-dir bare rc=$RC"
}

# ---------------------------------------------------------------------------
test_run_dir_resolution(){
  log_step "GIVEN two run dirs, WHEN selecting via env / flag / walk-up"
  fixture
  run_fleet "$P" init alpha
  run_fleet "$P" init beta
  local RA="$P/planning/fleet-alpha" RB="$P/planning/fleet-beta"
  run_fleet "$P" --run-dir "$RA" add WS91 "in alpha"
  run_fleet "$P" --run-dir "$RB" add WS92 "in beta"
  [ "$RC" -eq 0 ] && ok "flag-selected add works" || no "flag add rc=$RC err=$ERR"

  # $FLEET_RUN_DIR env override
  OUT=$(cd "$P" && FLEET_RUN_DIR="$RA" "$FLEET" status --tsv 2>"$TMP/e"); RC=$?
  [ "$RC" -eq 0 ] && ok "FLEET_RUN_DIR env resolves" || no "env rc=$RC err=$(cat "$TMP/e")"
  printf '%s\n' "$OUT" | grep -q "WS91" && ok "env selects alpha row" || no "WS91 missing under env"
  printf '%s\n' "$OUT" | grep -q "WS92" && no "env override leaked beta row" \
    || ok "env override excludes beta row"

  # --run-dir flag before the subcommand
  OUT=$(cd "$P" && "$FLEET" --run-dir "$RB" status --tsv 2>"$TMP/e"); RC=$?
  [ "$RC" -eq 0 ] && ok "--run-dir before subcommand works" || no "flag-before rc=$RC"
  printf '%s\n' "$OUT" | grep -q "WS92" && ok "flag selects beta row" || no "WS92 missing"
  printf '%s\n' "$OUT" | grep -q "WS91" && no "flag leaked alpha row" || ok "flag excludes alpha row"

  # --run-dir flag after the subcommand
  OUT=$(cd "$P" && "$FLEET" status --tsv --run-dir "$RB" 2>"$TMP/e"); RC=$?
  [ "$RC" -eq 0 ] && ok "--run-dir after subcommand works" || no "flag-after rc=$RC err=$(cat "$TMP/e")"
  printf '%s\n' "$OUT" | grep -q "WS92" && ok "trailing flag selects beta" || no "WS92 missing (trailing)"

  # walk-up discovery from a nested directory, no env, no flag
  mkdir -p "$P/src/deep"
  OUT=$(cd "$P/src/deep" && "$FLEET" status --tsv 2>"$TMP/e"); RC=$?
  [ "$RC" -eq 0 ] && ok "walk-up discovery from nested dir" || no "walk-up rc=$RC err=$(cat "$TMP/e")"
  printf '%s\n' "$OUT" | grep -qE "WS(91|92)" && ok "walk-up found a run dir" || no "walk-up empty: $OUT"

  log_step "GIVEN no run dir anywhere above cwd, THEN exit 64 with hint"
  OUT=$(cd "$TMP" && "$FLEET" status 2>"$TMP/e"); RC=$?
  [ "$RC" -eq 64 ] && ok "no run dir -> 64" || no "no-rundir rc=$RC"
  grep -q "no fleet run dir" "$TMP/e" && ok "error names the fix (fleet init first)" \
    || no "hint: $(cat "$TMP/e")"

  # explicit --run-dir to a nonexistent path -> 64
  OUT=$(cd "$P" && "$FLEET" --run-dir "$TMP/nope" status 2>"$TMP/e"); RC=$?
  [ "$RC" -eq 64 ] && ok "nonexistent --run-dir -> 64" || no "bad rundir rc=$RC"
}

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
test_roster_host_column_appended_and_old_rows_padded(){
  log_step "GIVEN an 11-column pre-host roster, WHEN first write, THEN host column appended and rows padded"
  fixture
  run_fleet "$P" init demo
  local R="$P/planning/fleet-demo/roster.tsv"
  printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\tengine\nWS01\tws01\told\tpending\tsrc\t\t\t\t0\t\tclaude-sub\n' > "$R"
  run_fleet "$P" claim WS01 lib
  [ "$RC" -eq 0 ] && ok "write on old roster succeeds" || no "old-roster write rc=$RC err=$ERR"
  [ "$(head -n1 "$R" | awk -F'\t' '{print $12}')" = "host" ] && ok "header gains host as column 12" \
    || no "header: $(head -n1 "$R")"
  [ "$(awk -F'\t' 'NR==2{print NF}' "$R")" = "13" ] && ok "old row padded to 13 fields" \
    || no "row NF: $(awk -F'\t' 'NR==2{print NF}' "$R")"
  [ -z "$(tsv_field "$R" WS01 12)" ] && ok "padded host cell is empty (local)" || no "host cell not empty"
  run_fleet "$P" add WS02 "fresh"
  [ "$(awk -F'\t' '$1=="WS02"{print NF}' "$R")" = "13" ] && ok "new row written with 13 fields" \
    || no "new row NF"

  local lib="$PROJECT_ROOT/.claude/skills/cfn-fleet/lib/common.sh" h bad=""
  for h in vps my-host.example.com a_b.1; do
    bash -c 'source "$1"; fleet_valid_host "$2"' _ "$lib" "$h" || bad="$bad accept:$h"
  done
  for h in "" "a b" 'a;b' '$(x)' 'a/b' 'a`b'; do
    bash -c 'source "$1"; fleet_valid_host "$2"' _ "$lib" "$h" && bad="$bad reject:[$h]"
  done
  [ -z "$bad" ] && ok "fleet_valid_host accepts safe names, rejects shell metacharacters" \
    || no "fleet_valid_host misjudged:$bad"
}

# ---------------------------------------------------------------------------
test_worktree_path_helper(){
  log_step "WHEN fleet_worktree_path REPO WS, THEN repo/.claude/worktrees/<ws lowercase>"
  local lib="$PROJECT_ROOT/.claude/skills/cfn-fleet/lib/common.sh" got
  got=$(bash -c 'source "$1"; fleet_worktree_path "$2" "$3"' _ "$lib" /tmp/repo WS07)
  [ "$got" = "/tmp/repo/.claude/worktrees/ws07" ] && ok "worktree path lowercases the WS id" \
    || no "worktree path: '$got'"
}

# ---------------------------------------------------------------------------
test_concurrent_claims_on_same_path_one_wins(){
  log_step "GIVEN two rows racing for one path, THEN exactly one claim wins every round (no double-claim)"
  fixture
  run_fleet "$P" init demo
  local R="$P/planning/fleet-demo/roster.tsv" i bad=0 rcA rcB
  run_fleet "$P" add WS01 "t1"
  run_fleet "$P" add WS02 "t2"
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    run_fleet "$P" add WS01 "t1" --force
    run_fleet "$P" add WS02 "t2" --force
    ( cd "$P" && "$FLEET" claim WS01 "race$i/file.ts" >/dev/null 2>&1; echo $? > "$TMP/rcA" ) &
    ( cd "$P" && "$FLEET" claim WS02 "race$i" >/dev/null 2>&1; echo $? > "$TMP/rcB" ) &
    wait
    rcA=$(cat "$TMP/rcA"); rcB=$(cat "$TMP/rcB")
    if [ "$rcA" = 0 ] && [ "$rcB" = 0 ]; then bad=$((bad+1)); fi
    if [ "$rcA" != 0 ] && [ "$rcB" != 0 ]; then bad=$((bad+1)); fi
  done
  [ "$bad" -eq 0 ] && ok "12 racing rounds: exactly one claim won each" || no "$bad of 12 rounds had zero or two winners"
}

# ---------------------------------------------------------------------------
test_add_refuses_claims_held_by_another_row(){
  log_step "GIVEN WS01 claims src, WHEN add WS02 --claims src/a.ts, THEN refused 65 and no row written"
  fixture
  run_fleet "$P" init demo
  local R="$P/planning/fleet-demo/roster.tsv"
  run_fleet "$P" add WS01 "t1" --claims src
  run_fleet "$P" add WS02 "t2" --claims src/a.ts
  [ "$RC" -eq 65 ] && ok "overlapping --claims refused (65)" || no "add overlap rc=$RC"
  printf '%s' "$ERR" | grep -q "WS01" && ok "error names the owning row" || no "err: $ERR"
  roster_has=$(awk -F'\t' '$1=="WS02"{print 1}' "$R")
  [ -z "$roster_has" ] && ok "refused add leaves no WS02 row" || no "WS02 row written despite refusal"
  run_fleet "$P" add WS03 "t3" --claims lib,docs/*.md
  [ "$RC" -eq 0 ] && ok "disjoint --claims accepted" || no "disjoint add rc=$RC err=$ERR"
  run_fleet "$P" add WS01 "t1b" --claims src/x.ts --force
  [ "$RC" -eq 0 ] && ok "--force replacing own row ignores own old claims" || no "force self rc=$RC err=$ERR"
}

# Regression (MDTWII fleet, 2026-10-14): four merged lanes still held their
# claims after going done and blocked two new lanes from being added.
test_done_rows_release_claims(){
  log_step "GIVEN WS01 claims src and is done, WHEN add/claim under src, THEN accepted; landed still blocks"
  fixture
  run_fleet "$P" init demo
  local R="$P/planning/fleet-demo/roster.tsv"
  run_fleet "$P" add WS01 "t1" --claims src
  run_fleet "$P" add WS04 "t4" --claims lib
  awk -F'\t' -v OFS='\t' '$1=="WS01"{$4="done"} $1=="WS04"{$4="landed"} {print}' "$R" > "$R.tmp" && mv "$R.tmp" "$R"
  run_fleet "$P" add WS02 "t2" --claims src/a.ts
  [ "$RC" -eq 0 ] && ok "add over a done row's claim accepted" || no "add over done rc=$RC err=$ERR"
  run_fleet "$P" claim WS02 src/b.ts
  [ "$RC" -eq 0 ] && ok "claim over a done row's claim accepted" || no "claim over done rc=$RC err=$ERR"
  run_fleet "$P" add WS03 "t3" --claims lib/x.ts
  [ "$RC" -eq 65 ] && ok "landed row still holds its claims (65)" || no "add over landed rc=$RC"
}

test_init_scaffold_and_duplicate_refusal
test_done_rows_release_claims
test_add_validation_and_uniqueness
test_add_refuses_placeholder_overwrite_and_next_id
test_claim_overlap_rules
test_heartbeat_updates_ts_and_note
test_status_table_and_tsv
test_router_unknown_subcommand
test_run_dir_resolution
test_roster_host_column_appended_and_old_rows_padded
test_worktree_path_helper
test_concurrent_claims_on_same_path_one_wins
test_add_refuses_claims_held_by_another_row

echo
echo "cfn-fleet-roster: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
