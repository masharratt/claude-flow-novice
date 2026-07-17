#!/usr/bin/env bash
# Enforces the Step 3a model-assignment invariants on profiles/*.json.
# The rules live in prose in SKILL.md Step 3a; this makes them mechanical.
set -uo pipefail

PROFILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); echo "  ok: $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "  FAIL: $1"; }

# Phases whose output every later phase consumes. An error here is the most expensive
# kind, so they are pinned to opus regardless of tier. Keep in sync with SKILL.md Step 3a.
NEVER_DOWNGRADE='["spec","data","arch","ux","ops"]'

# Returns a newline-separated list of violations for one profile file, or empty if clean.
lint_profile() {
  jq -r --argjson pinned "$NEVER_DOWNGRADE" '
    def viol($m): "\(input_filename // "profile"): \($m)";
    [
      # 1. model, when present, must be a real model tier.
      (.phases | to_entries[]
        | select(.value.model != null)
        | select((.value.model | IN("opus","sonnet","haiku")) | not)
        | "phase \(.key): invalid model \"\(.value.model)\""),

      # 2. structure-deciding + floor-carrying phases must not be downgraded.
      (.phases | to_entries[]
        | select(.value.directive != "skip")
        | select(.key | IN($pinned[]))
        | select(.value.model != null and .value.model != "opus")
        | "phase \(.key): pinned to opus by Step 3a but set to \"\(.value.model)\""),

      # 3. decide is only downgradable at directive:light (full decide owns alternatives).
      (.phases | to_entries[]
        | select(.key == "decide")
        | select(.value.directive == "full")
        | select(.value.model != null and .value.model != "opus")
        | "phase decide: directive=full must stay opus, got \"\(.value.model)\""),

      # 4. main-chat steps inherit the session model; assigning one is meaningless.
      (.phases | to_entries[]
        | select(.key | IN("write_plan","plan_review"))
        | select(.value.model != null)
        | "phase \(.key): runs in main chat, must not carry a model key"),

      # 5. every active phase needs a spawn target.
      (.phases | to_entries[]
        | select(.value.directive != "skip")
        | select(.key | IN("write_plan","plan_review") | not)
        | select(.value.agent == null)
        | "phase \(.key): active but has no agent key")
    ] | .[]
  ' "$1" 2>&1
}

echo "== profiles parse and satisfy Step 3a invariants"
for f in "$PROFILE_DIR"/*.json; do
  name="$(basename "$f")"
  if ! jq empty "$f" 2>/dev/null; then
    bad "$name: not valid JSON"
    continue
  fi
  violations="$(lint_profile "$f")"
  if [ -z "$violations" ]; then
    ok "$name"
  else
    while IFS= read -r v; do [ -n "$v" ] && bad "$name: $v"; done <<< "$violations"
  fi
done

# A linter that cannot fail proves nothing. Feed it a known-bad profile and require a catch.
echo "== linter rejects a downgraded structure-deciding phase (negative control)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
jq '.phases.arch.model = "haiku"' "$PROFILE_DIR/beta.json" > "$TMP/bad-arch.json"
if lint_profile "$TMP/bad-arch.json" | grep -q 'phase arch: pinned to opus'; then
  ok "caught arch downgraded to haiku"
else
  bad "linter did NOT catch arch downgraded to haiku — rules 1-5 are not enforcing"
fi

jq '.phases.write_plan.model = "sonnet"' "$PROFILE_DIR/beta.json" > "$TMP/bad-wp.json"
if lint_profile "$TMP/bad-wp.json" | grep -q 'phase write_plan: runs in main chat'; then
  ok "caught model key on main-chat step"
else
  bad "linter did NOT catch a model key on write_plan"
fi

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
