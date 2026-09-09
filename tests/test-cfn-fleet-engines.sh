#!/usr/bin/env bash
# tests/test-cfn-fleet-engines.sh
# cfn-fleet engine registry + roster engine column
# (planning/HANDOFF_cfn-fleet-engines.md). Covers the no-spawn half of the
# handoff cases:
#   1  add --engine stores col 11, status renders it, old-header rosters read
#      claude-sub and migrate-on-first-write (header upgrade under the roster
#      lock, rows padded, no data loss)
#   2 (partial) registry fields parse per engine: bin/args/set/unset/
#      trust_keys/banner_regex for claude-sub, glm, codex
#   4 (partial) fleet_engine_resolve_set dies 66 naming FLEET_ZAI_TOKEN when
#      the source var is unset or empty; roster untouched
#   9 (partial) engines.env stores the $FLEET_ZAI_TOKEN reference, never a
#      resolved value, in template and run-dir copy alike
#  10  after add/resolve/status operations, grep -r of a planted token value
#      in the run dir finds nothing
# spawn-side assertions (stub tmux, PLAN lines) belong to the spawn agent and
# tests/test-cfn-fleet-spawn-watch.sh. No real engines, no tmux, no network.
# Style: ok/no counters + trap cleanup EXIT per tests/test-brief-size-guard.sh;
# helpers from tests/test-utils.sh per tests/CORE_TEST_STANDARDS.md.
set -uo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"
# test-utils re-enables `set -e`; drop it so one failed check reports through
# the ok/no counters instead of aborting the suite at the first failure.
set +e

# Sanitize: the suite must not inherit a caller's run dir or credentials.
unset FLEET_RUN_DIR FLEET_ZAI_TOKEN FLEET_DEFAULT_ENGINE 2>/dev/null || true

SKILL="$PROJECT_ROOT/.claude/skills/cfn-fleet"
FLEET="$SKILL/cli/fleet"
# Engine helpers are exercised in-process (they are pure functions over the
# registry + roster files); fleet_die inside a $() subshell cannot kill the
# suite, so exit codes stay observable.
source "$SKILL/lib/common.sh"

TMP=$(mktemp -d "${TMPDIR:-/tmp}/fleet-engines-test-XXXXXX")
P="$TMP/proj"   # fake target project the fleet commands run against

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
}

# Run fleet with cwd=$1. Captures: OUT (stdout), ERR (stderr), RC.
run_fleet(){
  local dir="$1"; shift
  OUT=$(cd "$dir" && "$FLEET" "$@" 2>"$TMP/stderr.txt")
  RC=$?
  ERR=$(cat "$TMP/stderr.txt")
}

# Call an in-process fleet helper. Captures OUT/ERR/RC like run_fleet.
call_fn(){
  local fn="$1"; shift
  OUT=$("$fn" "$@" 2>"$TMP/stderr.txt")
  RC=$?
  ERR=$(cat "$TMP/stderr.txt")
}

# tsv_field <roster.tsv> <ws_id> <1-based field index> -> value
tsv_field(){
  awk -F'\t' -v ws="$2" -v i="$3" '$1==ws{print $i; exit}' "$1"
}

# tsv_nf <roster.tsv> <ws_id> -> tab-field count of that row
tsv_nf(){
  awk -F'\t' -v ws="$2" '$1==ws{print NF; exit}' "$1"
}

# use_demo <proj-dir>: init run dir 'demo' and pin FLEET_RUN_DIR at it so the
# in-process helper calls below resolve to the same run dir as the CLI calls.
use_demo(){
  run_fleet "$1" init demo
  [ "$RC" -eq 0 ] || { no "fixture init failed rc=$RC err=$ERR"; return 1; }
  FLEET_RUN_DIR="$1/planning/fleet-demo"
  return 0
}

# Pre-engine (10-column) roster, as older run dirs have on disk.
write_old_roster(){
  local rd="$1"
  printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\n' > "$rd/roster.tsv"
  printf 'WS01\talpha\tlegacy task\tpending\t\t\t\t\t0\told note\n' >> "$rd/roster.tsv"
}

# ---------------------------------------------------------------------------
# Handoff case 2 (registry fields parse per engine)
test_registry_seed_and_fields(){
  log_step "GIVEN shipped template (no run-dir copy), WHEN reading fields"
  fixture
  use_demo "$P" || return 0

  call_fn fleet_engine_list
  [ "$RC" -eq 0 ] && ok "fleet_engine_list exits 0" || no "list rc=$RC err=$ERR"
  [ "$OUT" = "$(printf 'claude-sub\nglm\ncodex')" ] \
    && ok "registry seeds exactly claude-sub/glm/codex" || no "list: '$OUT'"

  local bin args set unset trust banner
  # handoff "Design to implement" 1, verbatim names/flags; $VAR refs stored
  # unresolved (no values on disk)
  bin=$(fleet_engine_get bin claude-sub 2>/dev/null) \
    && [ "$bin" = "claude" ] && ok "claude-sub bin" || no "claude-sub bin: '$bin'"
  args=$(fleet_engine_get args claude-sub 2>/dev/null) \
    && [ "$args" = "--model sonnet --permission-mode bypassPermissions" ] \
    && ok "claude-sub args" || no "claude-sub args: '$args'"
  unset=$(fleet_engine_get unset claude-sub 2>/dev/null) \
    && [ "$unset" = "ANTHROPIC_AUTH_TOKEN,ANTHROPIC_API_KEY,ANTHROPIC_BASE_URL,ANTHROPIC_DEFAULT_SONNET_MODEL,ANTHROPIC_DEFAULT_OPUS_MODEL,ANTHROPIC_DEFAULT_HAIKU_MODEL,ANTHROPIC_DEFAULT_FABLE_MODEL" ] \
    && ok "claude-sub unset list (full 7-var relay scrub)" || no "claude-sub unset: '$unset'"
  trust=$(fleet_engine_get trust_keys claude-sub 2>/dev/null) \
    && [ "$trust" = "Down,Enter" ] && ok "claude-sub trust_keys Down,Enter" \
    || no "claude-sub trust: '$trust'"
  banner=$(fleet_engine_get banner_regex claude-sub 2>/dev/null) \
    && [ "$banner" = "Claude Team|Claude Pro|Claude Max" ] \
    && ok "claude-sub banner_regex (unspaced | survives the split)" || no "claude-sub banner: '$banner'"
  set=$(fleet_engine_get set claude-sub 2>/dev/null) \
    && [ -z "$set" ] && ok "claude-sub set field empty" || no "claude-sub set: '$set'"

  bin=$(fleet_engine_get bin glm 2>/dev/null) \
    && [ "$bin" = "claude" ] && ok "glm bin" || no "glm bin: '$bin'"
  args=$(fleet_engine_get args glm 2>/dev/null) \
    && [ "$args" = "--model glm-5.3-flash --permission-mode bypassPermissions" ] \
    && ok "glm args" || no "glm args: '$args'"
  set=$(fleet_engine_get set glm 2>/dev/null) \
    && [ "$set" = "ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic,ANTHROPIC_AUTH_TOKEN=\$FLEET_ZAI_TOKEN,CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1" ] \
    && ok "glm set list keeps \$FLEET_ZAI_TOKEN reference + z.ai endpoint" \
    || no "glm set: '$set'"
  unset=$(fleet_engine_get unset glm 2>/dev/null) \
    && [ "$unset" = "ANTHROPIC_API_KEY,ANTHROPIC_DEFAULT_SONNET_MODEL,ANTHROPIC_DEFAULT_OPUS_MODEL,ANTHROPIC_DEFAULT_HAIKU_MODEL,ANTHROPIC_DEFAULT_FABLE_MODEL,AIRTABLE_API_KEY,AIRTABLE_TOKEN,ATTIO_API_KEY,DATABASE_URL,POSTGRES_URL,SUPABASE_URL,SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY" ] \
    && ok "glm unset list (relay vars + data-system creds: gg-projects no-data-access rule)" \
    || no "glm unset: '$unset'"
  # Policy regression (2026-09-09): glm panes must never carry live
  # Airtable/Attio/DB credentials, even if the master shell exports them.
  [ -n "${unset#*AIRTABLE_API_KEY}" ] && [ -n "${unset#*ATTIO_API_KEY}" ] \
    && [ -n "${unset#*DATABASE_URL}" ] \
    && ok "glm unset includes AIRTABLE_API_KEY, ATTIO_API_KEY, DATABASE_URL" \
    || no "glm unset missing data-system creds: '$unset'"
  trust=$(fleet_engine_get trust_keys glm 2>/dev/null) \
    && [ "$trust" = "Down,Enter" ] && ok "glm trust_keys Down,Enter" \
    || no "glm trust: '$trust'"
  banner=$(fleet_engine_get banner_regex glm 2>/dev/null) \
    && [ "$banner" = "glm-" ] && ok "glm banner_regex" || no "glm banner: '$banner'"

  bin=$(fleet_engine_get bin codex 2>/dev/null) \
    && [ "$bin" = "codex" ] && ok "codex bin" || no "codex bin: '$bin'"
  args=$(fleet_engine_get args codex 2>/dev/null) \
    && [ "$args" = "--sandbox workspace-write --ask-for-approval never" ] \
    && ok "codex args" || no "codex args: '$args'"
  unset=$(fleet_engine_get unset codex 2>/dev/null) \
    && [ "$unset" = "OPENAI_API_KEY" ] && ok "codex unset OPENAI_API_KEY" \
    || no "codex unset: '$unset'"
  trust=$(fleet_engine_get trust_keys codex 2>/dev/null) \
    && [ "$trust" = "Enter" ] && ok "codex trust_keys Enter" \
    || no "codex trust: '$trust'"
  banner=$(fleet_engine_get banner_regex codex 2>/dev/null) \
    && [ "$banner" = "provider: openai|OpenAI Codex" ] && ok "codex banner_regex" \
    || no "codex banner: '$banner'"

  log_step "WHEN unknown field or engine, THEN exit 65"
  call_fn fleet_engine_get model glm
  [ "$RC" -eq 65 ] && ok "unknown field -> 65" || no "unknown field rc=$RC"
  call_fn fleet_engine_get bin gpt5
  [ "$RC" -eq 65 ] && ok "unknown engine -> 65" || no "unknown engine rc=$RC"
}

# ---------------------------------------------------------------------------
test_registry_malformed_line_refused(){
  log_step "GIVEN a run-dir registry line without 7 fields, THEN 65 (loud, not silent)"
  fixture
  use_demo "$P" || return 0
  call_fn fleet_engines_install
  printf '\nbroken | only-three\n' >> "$FLEET_RUN_DIR/engines.env"
  call_fn fleet_engine_list
  [ "$RC" -eq 65 ] && ok "malformed engine line -> 65" || no "malformed line rc=$RC out='$OUT'"
}

# ---------------------------------------------------------------------------
# Handoff cases 2/4/9 (resolve semantics)
test_resolve_set(){
  log_step "GIVEN FLEET_ZAI_TOKEN set, WHEN resolving glm set list"
  fixture
  use_demo "$P" || return 0
  FLEET_ZAI_TOKEN="zai-test-tok-123"

  call_fn fleet_engine_resolve_set glm
  [ "$RC" -eq 0 ] && ok "glm resolve exits 0" || no "glm resolve rc=$RC err=$ERR"
  [ "$OUT" = "$(printf 'ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic\nANTHROPIC_AUTH_TOKEN=zai-test-tok-123\nCLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1')" ] \
    && ok "glm resolve: literal endpoint + resolved token + flag, registry order" \
    || no "glm resolve out: '$OUT'"

  call_fn fleet_engine_resolve_set claude-sub
  [ "$RC" -eq 0 ] && [ -z "$OUT" ] && ok "claude-sub resolve: empty set -> no output" \
    || no "claude-sub resolve rc=$RC out='$OUT'"
  call_fn fleet_engine_resolve_set codex
  [ "$RC" -eq 0 ] && [ -z "$OUT" ] && ok "codex resolve: empty set -> no output" \
    || no "codex resolve rc=$RC out='$OUT'"

  log_step "GIVEN FLEET_ZAI_TOKEN unset/empty, WHEN resolving glm, THEN 66 naming the var (case 4)"
  unset FLEET_ZAI_TOKEN
  local rbefore
  rbefore=$(cat "$FLEET_RUN_DIR/roster.tsv")
  call_fn fleet_engine_resolve_set glm
  [ "$RC" -eq 66 ] && ok "unset source var -> exit 66" || no "unset resolve rc=$RC"
  printf '%s' "$ERR" | grep -q 'FLEET_ZAI_TOKEN' \
    && ok "stderr names FLEET_ZAI_TOKEN" || no "stderr: '$ERR'"
  [ "$(cat "$FLEET_RUN_DIR/roster.tsv")" = "$rbefore" ] \
    && ok "failed resolve leaves roster untouched" || no "roster changed"

  FLEET_ZAI_TOKEN=""
  call_fn fleet_engine_resolve_set glm
  [ "$RC" -eq 66 ] && ok "empty source var -> exit 66" || no "empty resolve rc=$RC"
  printf '%s' "$ERR" | grep -q 'FLEET_ZAI_TOKEN' \
    && ok "empty-var stderr names FLEET_ZAI_TOKEN" || no "stderr: '$ERR'"
  unset FLEET_ZAI_TOKEN
}

# ---------------------------------------------------------------------------
# Handoff case 1 (add --engine stores, status renders)
test_add_engine_flag(){
  log_step "GIVEN initialized run dir, WHEN add --engine glm"
  fixture
  use_demo "$P" || return 0
  local R="$FLEET_RUN_DIR/roster.tsv"

  run_fleet "$P" add WS01 "glm task" --engine glm
  [ "$RC" -eq 0 ] && ok "add --engine glm accepted" || no "add rc=$RC err=$ERR"
  [ "$(tsv_field "$R" WS01 11)" = "glm" ] && ok "engine stored in col 11" \
    || no "engine col: '$(tsv_field "$R" WS01 11)'"
  [ "$(tsv_nf "$R" WS01)" = "11" ] && ok "row has 11 tab fields" \
    || no "WS01 NF=$(tsv_nf "$R" WS01)"
  [ "$(head -n1 "$R" | awk -F'\t' '{print $11}')" = "engine" ] \
    && ok "header col 11 is 'engine'" || no "header: '$(head -n1 "$R")'"

  log_step "WHEN add without --engine, THEN default engine written"
  run_fleet "$P" add WS02 "default task"
  [ "$(tsv_field "$R" WS02 11)" = "claude-sub" ] \
    && ok "default engine is claude-sub" || no "WS02 engine: '$(tsv_field "$R" WS02 11)'"

  log_step "GIVEN FLEET_DEFAULT_ENGINE=glm in fleet.env, WHEN add without flag"
  printf 'FLEET_DEFAULT_ENGINE=glm\n' >> "$FLEET_RUN_DIR/fleet.env"
  run_fleet "$P" add WS03 "override task"
  [ "$(tsv_field "$R" WS03 11)" = "glm" ] \
    && ok "FLEET_DEFAULT_ENGINE overrides add default" \
    || no "WS03 engine: '$(tsv_field "$R" WS03 11)'"

  log_step "WHEN --engine unknown, THEN 65"
  run_fleet "$P" add WS04 "nope" --engine gpt5
  [ "$RC" -eq 65 ] && ok "unknown --engine refused with 65" || no "rc=$RC"
  printf '%s' "$ERR" | grep -q 'gpt5' && ok "refusal names the engine" || no "stderr: '$ERR'"
  grep -q '^WS04' "$R" && no "refused add wrote a row" || ok "refused add writes nothing"

  run_fleet "$P" add WS05 "eq form" --engine=codex
  [ "$RC" -eq 0 ] && [ "$(tsv_field "$R" WS05 11)" = "codex" ] \
    && ok "--engine= form accepted" || no "eq form rc=$RC err=$ERR"

  log_step "WHEN status, THEN engine rendered compact on the right (case 1)"
  run_fleet "$P" status
  [ "$RC" -eq 0 ] && ok "status exits 0" || no "status rc=$RC err=$ERR"
  printf '%s\n' "$OUT" | grep -q 'engine' && ok "table header shows engine" \
    || no "no engine header: $OUT"
  local line
  line=$(printf '%s\n' "$OUT" | awk '$1=="WS01"')
  printf '%s\n' "$line" | grep -q 'glm' && ok "WS01 row renders glm" || no "row: '$line'"

  run_fleet "$P" status --tsv
  [ "$(printf '%s\n' "$OUT" | awk -F'\t' 'NR==1{print NF":"$NF}')" = "11:engine" ] \
    && ok "tsv header 11 fields, engine last" || no "tsv header: $(printf '%s\n' "$OUT" | head -n1)"
  [ "$(printf '%s\n' "$OUT" | awk -F'\t' '$1=="WS05"{print NF}')" = "11" ] \
    && ok "tsv rows carry 11 fields" || no "tsv WS05 NF"
}

# ---------------------------------------------------------------------------
# Handoff case 1 (old rosters read claude-sub) + migrate-on-first-write policy
test_old_roster_back_compat(){
  log_step "GIVEN a pre-engine 10-column roster, WHEN reading engine"
  fixture
  use_demo "$P" || return 0
  local R="$FLEET_RUN_DIR/roster.tsv"
  write_old_roster "$FLEET_RUN_DIR"

  call_fn roster_get WS01 engine
  [ "$RC" -eq 0 ] && [ -z "$OUT" ] \
    && ok "roster_get engine on old roster reads empty (no 65)" \
    || no "roster_get engine rc=$RC out='$OUT' err='$ERR'"

  call_fn fleet_ws_engine WS01
  [ "$RC" -eq 0 ] && [ "$OUT" = "claude-sub" ] \
    && ok "fleet_ws_engine on old roster -> claude-sub (back-compat)" \
    || no "fleet_ws_engine rc=$RC out='$OUT' err='$ERR'"

  log_step "WHEN first write lands (roster_set), THEN header migrates, rows pad, data survives"
  call_fn roster_set WS01 status started
  [ "$RC" -eq 0 ] && ok "roster_set on old roster exits 0" || no "roster_set rc=$RC err=$ERR"
  [ "$(head -n1 "$R" | awk -F'\t' '{print NF":"$NF}')" = "11:engine" ] \
    && ok "header migrated to 11 cols, engine last" || no "migrated header: '$(head -n1 "$R")'"
  [ "$(tsv_nf "$R" WS01)" = "11" ] && ok "row padded to 11 fields" \
    || no "WS01 NF=$(tsv_nf "$R" WS01)"
  [ "$(tsv_field "$R" WS01 4)" = "started" ] && ok "target cell written" \
    || no "status: '$(tsv_field "$R" WS01 4)'"
  [ "$(tsv_field "$R" WS01 10)" = "old note" ] && ok "notes survive migration" \
    || no "notes: '$(tsv_field "$R" WS01 10)'"
  [ -z "$(tsv_field "$R" WS01 11)" ] && ok "migrated engine cell stays empty" \
    || no "engine: '$(tsv_field "$R" WS01 11)'"
  call_fn fleet_ws_engine WS01
  [ "$OUT" = "claude-sub" ] && ok "fleet_ws_engine still claude-sub after migration" \
    || no "fleet_ws_engine: '$OUT'"

  log_step "WHEN engine is set on the migrated roster, THEN fleet_ws_engine follows"
  call_fn roster_set WS01 engine glm
  [ "$RC" -eq 0 ] && ok "roster_set engine works post-migration" || no "rc=$RC err=$ERR"
  [ "$(tsv_field "$R" WS01 11)" = "glm" ] && ok "engine cell written" \
    || no "engine: '$(tsv_field "$R" WS01 11)'"
  call_fn fleet_ws_engine WS01
  [ "$OUT" = "glm" ] && ok "fleet_ws_engine returns glm" || no "fleet_ws_engine: '$OUT'"
}

# ---------------------------------------------------------------------------
test_add_migrates_old_roster(){
  log_step "GIVEN old 10-column roster, WHEN add --engine, THEN migrate-on-first-write via add"
  fixture
  use_demo "$P" || return 0
  local R="$FLEET_RUN_DIR/roster.tsv"
  write_old_roster "$FLEET_RUN_DIR"

  run_fleet "$P" add WS02 "new work" --engine codex
  [ "$RC" -eq 0 ] && ok "add on old-header roster accepted" || no "add rc=$RC err=$ERR"
  [ "$(head -n1 "$R" | awk -F'\t' '{print NF":"$NF}')" = "11:engine" ] \
    && ok "add migrated the header" || no "header: '$(head -n1 "$R")'"
  [ "$(tsv_nf "$R" WS02)" = "11" ] && ok "new row has 11 fields" \
    || no "WS02 NF=$(tsv_nf "$R" WS02)"
  [ "$(tsv_field "$R" WS02 11)" = "codex" ] && ok "new row engine=codex" \
    || no "WS02 engine: '$(tsv_field "$R" WS02 11)'"
  [ "$(tsv_nf "$R" WS01)" = "11" ] && ok "old row padded to 11" \
    || no "WS01 NF=$(tsv_nf "$R" WS01)"
  [ "$(tsv_field "$R" WS01 10)" = "old note" ] && ok "old row notes intact" \
    || no "WS01 notes: '$(tsv_field "$R" WS01 10)'"
}

# ---------------------------------------------------------------------------
test_empty_engine_cell_falls_back(){
  log_step "GIVEN current-header roster with an empty engine cell, THEN back-compat default"
  fixture
  use_demo "$P" || return 0
  # a row written by a hypothetical writer that skipped the engine default
  printf 'WS09\tghost\ttask\tpending\t\t\t\t\t0\t\t\n' >> "$FLEET_RUN_DIR/roster.tsv"
  call_fn fleet_ws_engine WS09
  [ "$RC" -eq 0 ] && [ "$OUT" = "claude-sub" ] \
    && ok "empty engine cell -> claude-sub" || no "rc=$RC out='$OUT' err='$ERR'"
}

# ---------------------------------------------------------------------------
test_default_engine_fn(){
  log_step "GIVEN fleet.env without/with FLEET_DEFAULT_ENGINE"
  fixture
  use_demo "$P" || return 0
  call_fn fleet_engine_default
  [ "$RC" -eq 0 ] && [ "$OUT" = "claude-sub" ] \
    && ok "default without fleet.env key is claude-sub" || no "rc=$RC out='$OUT'"
  printf 'FLEET_DEFAULT_ENGINE=glm\n' >> "$FLEET_RUN_DIR/fleet.env"
  call_fn fleet_engine_default
  [ "$OUT" = "glm" ] && ok "FLEET_DEFAULT_ENGINE honored" || no "out='$OUT'"
}

# ---------------------------------------------------------------------------
# Init-wiring helper: coordinator calls this from cmd-init once scaffolded.
test_engines_install(){
  log_step "GIVEN init, WHEN scaffold, THEN engines.env registry copy installed"
  fixture
  use_demo "$P" || return 0
  cmp -s "$SKILL/templates/engines.env" "$FLEET_RUN_DIR/engines.env" \
    && ok "init installs a registry copy" || no "init copy differs from template"

  call_fn fleet_engines_install
  [ "$RC" -eq 65 ] && ok "install after init refuses to overwrite (65)" || no "rc=$RC"

  log_step "GIVEN engines.env removed, WHEN fleet_engines_install, THEN fresh copy"
  rm -f "$FLEET_RUN_DIR/engines.env"
  call_fn fleet_engines_install
  [ "$RC" -eq 0 ] && ok "install exits 0" || no "install rc=$RC err=$ERR"
  [ "$OUT" = "$FLEET_RUN_DIR/engines.env" ] && ok "install echoes installed path" \
    || no "install out: '$OUT'"
  cmp -s "$SKILL/templates/engines.env" "$FLEET_RUN_DIR/engines.env" \
    && ok "installed copy matches template" || no "copy differs from template"

  call_fn fleet_engines_install
  [ "$RC" -eq 65 ] && ok "re-install refuses to overwrite (65)" || no "rc=$RC"

  call_fn fleet_engine_list
  [ "$OUT" = "$(printf 'claude-sub\nglm\ncodex')" ] \
    && ok "list identical via run-dir copy" || no "list via copy: '$OUT'"
}

# ---------------------------------------------------------------------------
# Handoff cases 9 + 10: the resolved value must never reach any run-dir file
test_token_never_lands_on_disk(){
  log_step "GIVEN planted FLEET_ZAI_TOKEN, WHEN add + install + resolve + status run"
  fixture
  use_demo "$P" || return 0
  local SECRET='fleet-zai-secret-0f3a9d'
  FLEET_ZAI_TOKEN="$SECRET"

  run_fleet "$P" add WS01 "glm task" --engine glm
  [ "$RC" -eq 0 ] && ok "add with token in env exits 0" || no "add rc=$RC err=$ERR"
  call_fn fleet_engines_install
  call_fn fleet_engine_resolve_set glm   # value lands in $OUT only (test memory)
  [ "$RC" -eq 0 ] && ok "resolve with token exits 0" || no "resolve rc=$RC err=$ERR"
  printf '%s\n' "$OUT" | grep -qF "$SECRET" \
    && ok "resolve stdout carries the value (spawn feeds it to tmux argv)" \
    || no "resolve stdout missing the value"
  run_fleet "$P" status
  run_fleet "$P" status --tsv
  unset FLEET_ZAI_TOKEN

  log_step "THEN grep -r of the token in the run dir finds nothing (case 10)"
  if grep -rqF "$SECRET" "$FLEET_RUN_DIR"; then
    no "token value found on disk: $(grep -rlF "$SECRET" "$FLEET_RUN_DIR" | tr '\n' ' ')"
  else
    ok "no run-dir file contains the token value"
  fi
  # case 9 partial: the registry files keep the reference, never a value
  grep -qF 'ANTHROPIC_AUTH_TOKEN=$FLEET_ZAI_TOKEN' "$SKILL/templates/engines.env" \
    && ok "template stores the \$FLEET_ZAI_TOKEN reference" || no "template lost the reference"
  grep -qF 'ANTHROPIC_AUTH_TOKEN=$FLEET_ZAI_TOKEN' "$FLEET_RUN_DIR/engines.env" \
    && ok "run-dir copy stores the reference" || no "run-dir copy lost the reference"
  if grep -rE '^ANTHROPIC_AUTH_TOKEN=' "$FLEET_RUN_DIR" "$SKILL/templates/engines.env" \
       | grep -vF '=$FLEET_ZAI_TOKEN' | grep -q .; then
    no "AUTH_TOKEN stored with a literal somewhere"
  else
    ok "no literal ANTHROPIC_AUTH_TOKEN= value anywhere in fleet files"
  fi
}

# ---------------------------------------------------------------------------
test_registry_seed_and_fields
test_registry_malformed_line_refused
test_resolve_set
test_add_engine_flag
test_old_roster_back_compat
test_add_migrates_old_roster
test_empty_engine_cell_falls_back
test_default_engine_fn
test_engines_install
test_token_never_lands_on_disk

echo
echo "cfn-fleet-engines: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
