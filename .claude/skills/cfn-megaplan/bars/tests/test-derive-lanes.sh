#!/usr/bin/env bash
# Tests for derive-lanes.sh (mechanical lane + wave derivation for cfn-loop-task PHASE 2).
#
# Why this script exists: measured 2026-08-20, a coordinator re-derived lanes for a
# 165-step plan across 14 python heredocs in main chat, ~53k tokens of context for a
# deterministic graph computation (parse table, cluster by owned file, SCC-merge cycles,
# topological wave order). The rules in cfn-loop-task.md LANE DERIVATION steps 2-6 are
# fully mechanical; this moves them out of the model.
#
# Regression anchors:
#   - escaped pipes (`"a" \| "b"`) inside a Change cell must not shift the Produces and
#     Consumes columns (the awk -F'|' parser in the sibling bars has that bug)
#   - `<br>`-separated File cells are two owned files, not one
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DERIVE="$SCRIPT_DIR/../derive-lanes.sh"
FIX="$SCRIPT_DIR/fixtures-lanes"

PASS=0; FAIL=0

run() { # label args... -- expected_exit [expect_substr]
  local label="$1"; shift
  local args=()
  while [ "$1" != "--" ]; do args+=("$1"); shift; done
  shift
  local exp_exit="$1" substr="${2:-}"
  local out ec
  out="$("$DERIVE" "${args[@]}" 2>&1)"; ec=$?
  local ok=1
  [ "$ec" = "$exp_exit" ] || ok=0
  if [ -n "$substr" ]; then echo "$out" | grep -qF "$substr" || ok=0; fi
  if [ "$ok" = 1 ]; then PASS=$((PASS+1)); printf 'ok   %s\n' "$label"
  else FAIL=$((FAIL+1)); printf 'FAIL %s (exit=%s want=%s)\n     out=%s\n' "$label" "$ec" "$exp_exit" "$out"; fi
}

jqf() { # fixture jq-filter [extra-args...]
  local fx="$1" filt="$2"; shift 2
  "$DERIVE" "$FIX/$fx" "$@" 2>/dev/null | jq -c "$filt"
}

expect_jq() { # label fixture filter expected [extra-args...]
  local label="$1" fx="$2" filt="$3" want="$4"; shift 4
  local got
  got="$(jqf "$fx" "$filt" "$@")"
  if [ "$got" = "$want" ]; then PASS=$((PASS+1)); printf 'ok   %s\n' "$label"
  else FAIL=$((FAIL+1)); printf 'FAIL %s\n     got=%s\n     want=%s\n' "$label" "$got" "$want"; fi
}

# ---- usage / guards ----
"$DERIVE" >/dev/null 2>&1; ec=$?
if [ "$ec" = 2 ]; then PASS=$((PASS+1)); echo "ok   no-arg exits 2"
else FAIL=$((FAIL+1)); echo "FAIL no-arg exits 2 (got $ec)"; fi
run "missing file exits 2" "$FIX/nope.md" -- 2 "not found"
run "no step rows exits 2" "$FIX/plan-lanes-notable.md" -- 2 "no step rows"

# ---- simple: one lane per phase, single wave ----
run "simple plan exits 0" "$FIX/plan-lanes-simple.md" -- 0
expect_jq "simple: 2 lanes"            plan-lanes-simple.md '[.lanes[].id]'        '["2","3"]'
expect_jq "simple: no edges"           plan-lanes-simple.md '.edges'              '[]'
expect_jq "simple: one wave, all lanes" plan-lanes-simple.md '.waves'             '[["2","3"]]'
expect_jq "simple: lane 2 owns 2 files" plan-lanes-simple.md '.lanes[0].files'    '["src/a.ts","src/b.ts"]'
expect_jq "simple: lane 2 has 2 steps"  plan-lanes-simple.md '.lanes[0].steps'    '["2.1","2.2"]'
expect_jq "simple: phase name kept"     plan-lanes-simple.md '.lanes[1].phase'    '"Ops Integration Tasks"'

# ---- edges + waves ----
expect_jq "edges: 2 -> 3"              plan-lanes-edges.md '.edges'    '[["2","3"]]'
expect_jq "edges: two waves in order"  plan-lanes-edges.md '.waves'    '[["2"],["3"]]'

# ---- cycle merge ----
run "cycle plan exits 0" "$FIX/plan-lanes-cycle.md" -- 0 "cycle-merge"
expect_jq "cycle: merged to one lane"  plan-lanes-cycle.md '.lanes|length'  '1'
expect_jq "cycle: merged lane has both steps" plan-lanes-cycle.md '.lanes[0].steps' '["2.1","3.1"]'
expect_jq "cycle: no self edge"        plan-lanes-cycle.md '.edges'         '[]'
expect_jq "cycle: single wave"         plan-lanes-cycle.md '.waves|length'  '1'

# ---- duplicate producer across lanes = blocker, exit 1 ----
run "duplicate producer exits 1" "$FIX/plan-lanes-dupproducer.md" -- 1 "duplicate_producer"
expect_jq "dup: blocker names the identifier" plan-lanes-dupproducer.md '.blockers[0].id' '"src/z.ts:zz"'
expect_jq "dup: blocker names both lanes"     plan-lanes-dupproducer.md '.blockers[0].lanes' '["2","3"]'

# ---- exclusive file ownership: shared file across phases merges the lanes ----
run "shared file merges lanes" "$FIX/plan-lanes-shared-file.md" -- 0 "file-merge"
expect_jq "shared file: one lane"      plan-lanes-shared-file.md '.lanes|length' '1'
expect_jq "no file in two lanes"       plan-lanes-shared-file.md \
  '[.lanes[].files]|flatten|(length == (unique|length))' 'true'

# ---- <br>-separated File cell = two owned files (merges via src/b.ts) ----
expect_jq "br cell yields 2 files"     plan-lanes-brfiles.md '.lanes[0].files' '["src/a.ts","src/b.ts"]'
expect_jq "br cell merge to one lane"  plan-lanes-brfiles.md '.lanes|length'   '1'

# ---- escaped pipe in Change cell must not shift Produces/Consumes ----
expect_jq "escaped pipe: edge still found" plan-lanes-escaped-pipe.md '.edges' '[["2","3"]]'
expect_jq "escaped pipe: two waves"        plan-lanes-escaped-pipe.md '.waves' '[["2"],["3"]]'

# ---- dangling consume: warn, no edge, exit 0 ----
run "dangling consume exits 0" "$FIX/plan-lanes-dangling.md" -- 0 "dangling consume"
expect_jq "dangling: no edges"         plan-lanes-dangling.md '.edges' '[]'

# ---- wide-phase split by file cluster ----
run "wide phase splits" "$FIX/plan-lanes-wide.md" -- 0 "phase-split"
expect_jq "wide: 2 sub-lanes"           plan-lanes-wide.md '[.lanes[].id]'    '["2a","2b"]'
expect_jq "wide: 8 steps each"          plan-lanes-wide.md '[.lanes[].steps|length]' '[8,8]'
expect_jq "wide: sub-lanes disjoint files" plan-lanes-wide.md \
  '[.lanes[].files]|flatten|(length == (unique|length))' 'true'

# ---- unsplittable co-write chain stays one lane and says so ----
run "unsplittable logs reason" "$FIX/plan-lanes-unsplittable.md" -- 0 "unsplittable (co-write chain)"
expect_jq "unsplittable: one lane"      plan-lanes-unsplittable.md '.lanes|length' '1'
expect_jq "unsplittable: keeps 16 steps" plan-lanes-unsplittable.md '.lanes[0].steps|length' '16'

# ---- cluster under MIN_SUBLANE folds into its strongest consume partner ----
run "tiny cluster folds back" "$FIX/plan-lanes-tinycluster.md" -- 0
expect_jq "tiny cluster: single lane of 16" plan-lanes-tinycluster.md '.lanes[0].steps|length' '16'
expect_jq "tiny cluster: no 2-step lane"    plan-lanes-tinycluster.md \
  '[.lanes[]|select((.steps|length) < 5)]|length' '0'

# ---- LANE_CAP: 10 phase lanes merge down to the cap ----
expect_jq "cap: 10 phases -> 8 lanes"   plan-lanes-cap.md '.lanes|length' '8'
run "cap merge is logged" "$FIX/plan-lanes-cap.md" -- 0 "cap-merge"
expect_jq "cap: every step survives merge" plan-lanes-cap.md '[.lanes[].steps]|flatten|length' '10'
expect_jq "cap override respected"      plan-lanes-cap.md '.lanes|length' '4' --lane-cap 4

# ---- hub file: faithful ownership rule collapses lanes, and says why ----
run "hub file reported" "$FIX/plan-lanes-hub.md" -- 0 "hub:"
expect_jq "hub: collapses to one lane"  plan-lanes-hub.md '.lanes|length' '1'
expect_jq "hub: 40 serial steps"        plan-lanes-hub.md '.lanes[0].steps|length' '40'
expect_jq "hub: names the hub file"     plan-lanes-hub.md \
  '[.hubs[].file]' '["scripts/hub.ts"]'

# ---- --hub-split: hub gets an owner lane, others order behind it ----
run "hub-split exits 0" "$FIX/plan-lanes-hub.md" --hub-split -- 0 "hub-split"
expect_jq "hub-split: more than one lane" plan-lanes-hub.md '(.lanes|length) > 1' 'true' --hub-split
expect_jq "hub-split: hub owned by exactly one lane" plan-lanes-hub.md \
  '[.lanes[]|select(.files|index("scripts/hub.ts"))]|length' '1' --hub-split
expect_jq "hub-split: still acyclic (waves cover all lanes)" plan-lanes-hub.md \
  '([.waves[]]|flatten|length) == (.lanes|length)' 'true' --hub-split
expect_jq "hub-split: every step survives" plan-lanes-hub.md \
  '[.lanes[].steps]|flatten|length' '40' --hub-split

# ---- shape contract: required keys always present ----
expect_jq "output has required keys"    plan-lanes-simple.md \
  '[has("plan"),has("lane_cap"),has("lanes"),has("edges"),has("waves"),has("logs"),has("blockers"),has("hubs")]|all' 'true'
expect_jq "waves partition lanes exactly" plan-lanes-simple.md \
  '([.waves[]]|flatten|sort) == ([.lanes[].id]|sort)' 'true'

# ---- wave slots respect LANE_CAP concurrency ----
expect_jq "no wave slot exceeds cap"    plan-lanes-cap.md \
  '[.waves[]|length]|max <= 4' 'true' --lane-cap 4

# ---- --soft-ownership: one owner per file, writers chained instead of merged ----
run "soft-ownership exits 0" "$FIX/plan-lanes-soft.md" --soft-ownership -- 0 "soft-own"
expect_jq "soft: keeps 3 lanes"          plan-lanes-soft.md '.lanes|length' '3' --soft-ownership
expect_jq "strict: merges to 2 lanes"    plan-lanes-soft.md '.lanes|length' '2'
expect_jq "soft: shared file has one owner" plan-lanes-soft.md \
  '[.lanes[]|select(.files|index("src/shared.ts"))]|length' '1' --soft-ownership
expect_jq "soft: other writer records it as shared" plan-lanes-soft.md \
  '[.lanes[]|select(.shared_files|index("src/shared.ts"))]|length' '1' --soft-ownership
expect_jq "soft: chain edge between the two writers" plan-lanes-soft.md '.edges' '[["2","3"]]' --soft-ownership
expect_jq "soft: independent lane rides wave 1" plan-lanes-soft.md '.waves[0]' '["2","4"]' --soft-ownership
expect_jq "soft: every step survives"    plan-lanes-soft.md '[.lanes[].steps]|flatten|length' '15' --soft-ownership

# co-writers of one file must never be schedulable in the same wave slot
expect_jq "soft: no wave slot holds two writers of shared.ts" plan-lanes-soft.md \
  '[.waves[] as $w | [$w[] as $l | (.lanes[]|select(.id==$l)) | select((.files+.shared_files)|index("src/shared.ts"))] | length] | max' \
  '1' --soft-ownership

# ---- soft chain that contradicts a produce/consume edge collapses via SCC ----
run "soft cycle merges" "$FIX/plan-lanes-softcycle.md" --soft-ownership -- 0 "cycle-merge"
expect_jq "soft cycle: one lane"         plan-lanes-softcycle.md '.lanes|length' '1' --soft-ownership
expect_jq "soft cycle: keeps all 6 steps" plan-lanes-softcycle.md '[.lanes[].steps]|flatten|length' '6' --soft-ownership


# ---- separability advisory: says when lane math cannot help ----
expect_jq "separability block present"   plan-lanes-simple.md 'has("separability")' 'true'
expect_jq "simple plan: no advisory"     plan-lanes-simple.md '.separability.advisory' 'null'
expect_jq "simple plan: critical path is the widest wave" plan-lanes-simple.md \
  '.separability.critical_path_steps' '2'
run "unsplittable 40-step lane warns not separable" "$FIX/plan-lanes-hub.md" -- 0 "not lane-separable"
expect_jq "hub: advisory names the serial critical path" plan-lanes-hub.md \
  '.separability.critical_path_steps' '40'
expect_jq "soft: co-written file listed" plan-lanes-soft.md \
  '.separability.co_written_files' '["src/shared.ts"]' --soft-ownership
expect_jq "soft: speedup beats serial"   plan-lanes-soft.md \
  '.separability.parallel_speedup > 1' 'true' --soft-ownership


echo
echo "derive-lanes: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
