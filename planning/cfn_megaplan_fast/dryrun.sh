#!/usr/bin/env bash
# Dry-run for cfn-megaplan-fast (AC-7). Read-only.
#  1. Size verdicts for finished curve2026 megaplan artifacts (B0, B1) under fast caps (expect OVER; that is the point).
#  2. extract-sections.sh runs on the tagged fixture for one part.
#  3. Token projection for the same 7-part program under fast, from measured per-phase means
#     (planning/cfn_megaplan_fast/cost/report.md §4) x explicit factors. Prints PROJECTED_OUTPUT_TOKENS_7_PARTS=<n>.
# Exit: 0 if steps 2 ok and projection <= 1,500,000; 1 otherwise.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
BARS=.claude/skills/cfn-megaplan/bars; LIB=.claude/skills/cfn-megaplan/lib
GG=/home/masha/projects-gg/gg-all-projects/planning
FAIL=0

echo "== 1. size verdicts under fast caps (baseline artifacts; OVER expected)"
for d in b0_ci_monitoring_load_curve2026 b1_identity_access_profiles_curve2026; do
  if [ -d "$GG/$d" ]; then "$BARS/check-size.sh" --all "$GG/$d" | sed "s#$GG/##"; echo "   (exit=$? for $d)"
  else echo "   skip: $GG/$d absent"; fi
done

echo "== 2. extract-sections on fixture"
FIX="$LIB/tests/fixtures-extract/SPEC_prog.md"
if [ -f "$FIX" ]; then
  PARTS=$("$LIB/extract-sections.sh" "$FIX" --list-parts | tr '\n' ' ')
  P1=$(echo "$PARTS" | awk '{print $1}')
  BYTES=$("$LIB/extract-sections.sh" "$FIX" "$P1" | wc -c); EC=$?
  FULL=$(wc -c < "$FIX")
  echo "   parts: $PARTS; extract($P1)=${BYTES}B of ${FULL}B full (exit=$EC)"
  [ "$EC" = 0 ] && [ "$BYTES" -gt 0 ] && [ "$BYTES" -lt "$FULL" ] || { echo "   FAIL extract"; FAIL=1; }
else echo "   FAIL fixture missing $FIX"; FAIL=1; fi

echo "== 3. projection (output tokens, 7 parts)"
# Baseline per-spawn mean output = report.md §4 output/spawns (includes nested grandchildren).
# Factors: CAP=0.50 (artifacts capped 3-5x; reasoning output not all artifact -> conservative half),
#          NONEST=0.80 (no nested spawns; 48 grandchildren in baseline), FOLD=0.30 (a folded phase adds 30% of its old mean
#          to the host), REPAIR_P=0.50 (probability one repair spawn is needed per part), MODEL=1.0 (budget counts tokens, not $).
CAP=0.50; NONEST=0.80; FOLD=0.30; REPAIR_P=0.50
spec=$((895018/9)); decide=$((454486/7)); data=$((535915/7)); arch=$((718610/9)); pseudo=$((882796/8))
ux=$((585534/11)); design=$((316391/6)); review=$((272841/2)); test_plan=$((449801/7))
write_plan=$(((394123+162094)/5)); repair=$((2521607/34))
MAIN_BASE_PER_TURN=$((1466811/1553)); FAST_TURNS=130; MAIN_INFLATE=2
awk -v spec=$spec -v decide=$decide -v data=$data -v arch=$arch -v pseudo=$pseudo -v ux=$ux -v design=$design \
    -v review=$review -v tp=$test_plan -v wp=$write_plan -v rep=$repair -v mpt=$MAIN_BASE_PER_TURN -v ft=$FAST_TURNS -v mi=$MAIN_INFLATE \
    -v CAP=$CAP -v NONEST=$NONEST -v FOLD=$FOLD -v RP=$REPAIR_P -v PARTS=7 'BEGIN{
  f=CAP*NONEST
  p_spec=(spec+FOLD*decide)*f; p_data=data*f; p_arch=(arch+FOLD*pseudo)*f; p_ux=(ux+FOLD*design)*f; p_rev=review*f
  prog=p_spec+p_data+p_arch+p_ux+p_rev
  per=tp*f + wp*f + 5000 + RP*rep*f
  main=mpt*ft*mi
  total=prog+PARTS*per+main
  printf "   program: spec %d data %d arch %d ux %d review %d = %d\n", p_spec,p_data,p_arch,p_ux,p_rev,prog
  printf "   per part: test_plan %d write_plan %d bars-inline 5000 repair-allowance %d = %d  x%d = %d\n", tp*f, wp*f, RP*rep*f, per, PARTS, PARTS*per
  printf "   main chat: %d turns x %d tok x %d = %d\n", ft, mpt, mi, main
  printf "   baseline measured: 10,056,000 output (main 1,466,811 + subagents 8,589,000)\n"
  printf "PROJECTED_OUTPUT_TOKENS_7_PARTS=%d\n", total
  exit (total<=1500000)?0:1 }' || { echo "   FAIL projection over 1.5M"; FAIL=1; }
exit $FAIL
