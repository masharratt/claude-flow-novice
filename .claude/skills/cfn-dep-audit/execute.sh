#!/usr/bin/env bash
# cfn-dep-audit - supply-chain gate. Enforces two CLAUDE.md policies:
#   1. ~90-day cooldown on NEW dependencies (the last rung of the build ladder).
#   2. "take CVE fixes immediately" carve-out (CVEs surface as high severity now).
# Degrades gracefully: reports which checks could run, skips the rest. Never fixes.
# Emits a manifest when findings are actionable, otherwise a plain report.
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$PROJECT_ROOT"

COOLDOWN_DAYS="${CFN_DEP_COOLDOWN_DAYS:-90}"
COOLDOWN_SECS=$(( COOLDOWN_DAYS * 86400 ))
NOW=$(date +%s)

# diff base for "newly added" detection: staged, else last commit
if ! git rev-parse --verify -q HEAD >/dev/null 2>&1; then
  DIFFBASE=""
elif ! git diff --cached --quiet 2>/dev/null; then
  DIFFBASE="--cached"
else
  DIFFBASE="HEAD~1"
fi

CHECKS_RAN=()
CHECKS_SKIPPED=()
# findings: each line = "category|severity|name|detail|approach"
FINDINGS_FILE=$(mktemp)
trap 'rm -f "$FINDINGS_FILE"' EXIT
add_finding() { printf '%s|%s|%s|%s|%s\n' "$1" "$2" "$3" "$4" "$5" >> "$FINDINGS_FILE"; }

has() { command -v "$1" >/dev/null 2>&1; }

added_lines() { # added lines for a file in the diff base
  local file="$1"
  [[ -f "$file" ]] || return 0
  if [[ -z "$DIFFBASE" ]]; then return 0; fi
  git diff $DIFFBASE -- "$file" 2>/dev/null | grep -E '^\+' | grep -vE '^\+\+\+' || true
}

# --- npm / pnpm / yarn --------------------------------------------------------
if [[ -f package.json ]]; then
  # vulnerability audit
  if has npm; then
    AUDIT_JSON=$(npm audit --json 2>/dev/null || true)
    if [[ -n "$AUDIT_JSON" ]] && echo "$AUDIT_JSON" | jq -e . >/dev/null 2>&1; then
      CHECKS_RAN+=("npm audit")
      # npm v7+ schema: .vulnerabilities{ name: {severity, via[]} }
      while IFS=$'\t' read -r name sev; do
        [[ -z "$name" ]] && continue
        case "$sev" in
          high|critical)
            add_finding "cve" "high" "$name" "npm audit: $sev severity advisory" \
              "Apply the fix now. CVE fixes are exempt from the cooldown (take immediately)." ;;
        esac
      done < <(echo "$AUDIT_JSON" | jq -r '(.vulnerabilities // {}) | to_entries[] | "\(.key)\t\(.value.severity)"' 2>/dev/null)
    else
      CHECKS_SKIPPED+=("npm audit (no output / offline)")
    fi
  else
    CHECKS_SKIPPED+=("npm audit (npm not installed)")
  fi

  # osv-scanner (optional, broader CVE coverage)
  if has osv-scanner; then
    OSV_JSON=$(osv-scanner --format json --lockfile package-lock.json 2>/dev/null || true)
    if [[ -n "$OSV_JSON" ]] && echo "$OSV_JSON" | jq -e . >/dev/null 2>&1; then
      CHECKS_RAN+=("osv-scanner")
      while IFS= read -r pkg; do
        [[ -z "$pkg" ]] && continue
        add_finding "cve" "high" "$pkg" "osv-scanner reported a known vulnerability" \
          "Apply the upgrade now. CVE fixes bypass the cooldown."
      done < <(echo "$OSV_JSON" | jq -r '[.results[]?.packages[]? | select((.vulnerabilities|length)>0) | .package.name] | unique[]?' 2>/dev/null)
    else
      CHECKS_SKIPPED+=("osv-scanner (no lockfile / no output)")
    fi
  fi

  # cooldown: newly added deps younger than COOLDOWN_DAYS
  if [[ -n "$DIFFBASE" ]]; then
    NEW_DEPS=$(added_lines package.json | grep -oE '"[^"]+"[[:space:]]*:[[:space:]]*"[\^~>=<0-9v][^"]*"' \
      | sed -E 's/^"([^"]+)"[[:space:]]*:[[:space:]]*"(.*)"$/\1 \2/' || true)
    if [[ -n "$NEW_DEPS" ]]; then
      if has npm; then
        CHECKS_RAN+=("npm cooldown")
        while read -r pkg range; do
          [[ -z "$pkg" ]] && continue
          # ignore non-dep keys (name/version/scripts values won't resolve)
          rel=$(npm view "$pkg@$range" time --json 2>/dev/null | jq -r 'to_entries|map(select(.key|test("^[0-9]")))|sort_by(.value)|last.value' 2>/dev/null || true)
          [[ -z "$rel" || "$rel" == "null" ]] && { add_finding "cooldown" "info" "$pkg" "release age unknown (offline or not on registry)" "Verify the package age manually before merging."; continue; }
          rel_secs=$(date -d "$rel" +%s 2>/dev/null || echo 0)
          age=$(( NOW - rel_secs ))
          if (( rel_secs > 0 && age < COOLDOWN_SECS )); then
            days=$(( age / 86400 ))
            add_finding "cooldown" "warn" "$pkg" "added dependency is ${days}d old (< ${COOLDOWN_DAYS}d cooldown)" \
              "Wait out the ~${COOLDOWN_DAYS}-day supply-chain cooldown, or justify an override. CVE-fix deps are exempt."
          fi
        done <<< "$NEW_DEPS"
      else
        CHECKS_SKIPPED+=("npm cooldown (npm not installed)")
      fi
    fi
  else
    CHECKS_SKIPPED+=("cooldown (no git history to diff)")
  fi
fi

# --- cargo --------------------------------------------------------------------
if [[ -f Cargo.toml ]]; then
  if has cargo-audit || cargo audit --version >/dev/null 2>&1; then
    CARGO_JSON=$(cargo audit --json 2>/dev/null || true)
    if [[ -n "$CARGO_JSON" ]] && echo "$CARGO_JSON" | jq -e . >/dev/null 2>&1; then
      CHECKS_RAN+=("cargo audit")
      while IFS= read -r crate; do
        [[ -z "$crate" ]] && continue
        add_finding "cve" "high" "$crate" "cargo audit reported a RUSTSEC advisory" \
          "Apply the upgrade now. CVE fixes bypass the cooldown."
      done < <(echo "$CARGO_JSON" | jq -r '[.vulnerabilities.list[]?.package.name] | unique[]?' 2>/dev/null)
    else
      CHECKS_SKIPPED+=("cargo audit (no output)")
    fi
  else
    CHECKS_SKIPPED+=("cargo audit (cargo-audit not installed)")
  fi

  # cargo cooldown: newly added crates, age via crates.io API (best effort)
  if [[ -n "$DIFFBASE" ]]; then
    NEW_CRATES=$(added_lines Cargo.toml | grep -oE '^\+[[:space:]]*[a-zA-Z0-9_-]+[[:space:]]*=' \
      | sed -E 's/^\+[[:space:]]*([a-zA-Z0-9_-]+)[[:space:]]*=.*/\1/' || true)
    if [[ -n "$NEW_CRATES" ]] && has curl; then
      CHECKS_RAN+=("cargo cooldown")
      while read -r crate; do
        [[ -z "$crate" ]] && continue
        rel=$(curl -fsSL --max-time 8 "https://crates.io/api/v1/crates/${crate}" 2>/dev/null | jq -r '.versions[0].created_at' 2>/dev/null || true)
        [[ -z "$rel" || "$rel" == "null" ]] && continue
        rel_secs=$(date -d "$rel" +%s 2>/dev/null || echo 0)
        age=$(( NOW - rel_secs ))
        if (( rel_secs > 0 && age < COOLDOWN_SECS )); then
          days=$(( age / 86400 ))
          add_finding "cooldown" "warn" "$crate" "added crate is ${days}d old (< ${COOLDOWN_DAYS}d cooldown)" \
            "Wait out the ~${COOLDOWN_DAYS}-day cooldown, or justify an override. CVE-fix deps are exempt."
        fi
      done <<< "$NEW_CRATES"
    elif [[ -n "$NEW_CRATES" ]]; then
      CHECKS_SKIPPED+=("cargo cooldown (curl not installed)")
    fi
  fi
fi

# --- no manifests at all ------------------------------------------------------
if [[ ! -f package.json && ! -f Cargo.toml ]]; then
  echo "cfn-dep-audit: no dependency manifests found (package.json / Cargo.toml)."
  echo "Nothing to audit. Exiting clean."
  exit 0
fi

# --- report -------------------------------------------------------------------
CVE_COUNT=$(grep -c '^cve|' "$FINDINGS_FILE" 2>/dev/null || true); CVE_COUNT=${CVE_COUNT:-0}
COOL_COUNT=$(grep -c '^cooldown|' "$FINDINGS_FILE" 2>/dev/null || true); COOL_COUNT=${COOL_COUNT:-0}
TOTAL=$(( CVE_COUNT + COOL_COUNT ))

echo "cfn-dep-audit complete"
echo "  checks ran:     ${CHECKS_RAN[*]:-none}"
echo "  checks skipped: ${CHECKS_SKIPPED[*]:-none}"
echo "  CVE findings:   $CVE_COUNT (high - surface immediately)"
echo "  cooldown flags: $COOL_COUNT (warn)"

if [[ "$TOTAL" -eq 0 ]]; then
  echo
  echo "No actionable findings. No manifest emitted."
  exit 0
fi

# emit manifest in the shared cfn-vote-implement schema
MANIFEST_DIR="${PROJECT_ROOT}/.cfn-cache/manifests"
mkdir -p "$MANIFEST_DIR"
GITIGNORE="${PROJECT_ROOT}/.gitignore"
grep -qxE '\.cfn-cache/?' "$GITIGNORE" 2>/dev/null || printf '\n# CFN local cache\n.cfn-cache/\n' >> "$GITIGNORE"
TS=$(date +%s%N 2>/dev/null || echo "$(date +%s)-$$")
MANIFEST_PATH="${MANIFEST_DIR}/cfn-dep-audit-${TS}.json"

suggestions=$(awk -F'|' '{print}' "$FINDINGS_FILE" | jq -R 'split("|") | {category:.[0], severity:.[1], name:.[2], detail:.[3], approach:.[4]}' | jq -s '
  to_entries | map({
    id: ("S" + (1000 + .key + 1 | tostring | .[1:])),
    category: .value.category,
    tag: (if .value.category=="cve" then "block" elif .value.severity=="warn" then "cooldown" else "info" end),
    one_liner: (.value.name + ": " + .value.detail),
    title: (.value.category + ": " + .value.name),
    description: .value.detail,
    files: ["package.json or Cargo.toml"],
    impact: (if .value.category=="cve" then "high" elif .value.severity=="warn" then "medium" else "low" end),
    effort: "low",
    suggested_approach: .value.approach,
    related_suggestions: []
  })')

jq -n \
  --arg review_id "dep-audit-${TS}" \
  --arg source "cfn-dep-audit" \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson cooldown_days "$COOLDOWN_DAYS" \
  --argjson suggestions "$suggestions" \
  '{
    review_id: $review_id,
    source: $source,
    generated_at: $generated_at,
    cooldown_days: $cooldown_days,
    suggestions: $suggestions
  }' > "$MANIFEST_PATH"

echo
echo "  manifest: $MANIFEST_PATH"
echo
echo "Next: /cfn-vote-implement latest  (CVE items are block-tagged; treat as merge blockers)."
