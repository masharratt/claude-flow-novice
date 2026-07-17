#!/usr/bin/env bash
# Validates project-local role-<slug>/SKILL.md files against ROLE_SKILL_SCHEMA.md.
# The contract lives in prose in ROLE_SKILL_SCHEMA.md; this makes it mechanical.
#
# Usage: validate-role-skills.sh [skills-dir]      (default: .claude/skills)
# Exit:  0 = all role docs valid (or none found)
#        3 = at least one role doc violates the schema (matches cfn-persona-verify exit 3)
set -uo pipefail

SKILLS_DIR="${1:-.claude/skills}"

# Adopted from the vocabulary already in use, not invented. Allowed/Denied/Landing + shell
# stay prose and stay the decision record; only Capabilities is machine-driven.
REQUIRED_SECTIONS=(
  "## Access"
  "## Capabilities"
  "## Allowed"
  "## Denied"
  "## Landing + shell"
  "## Known-state exceptions"
)

CAP_COLUMNS="Capability | Entry point | Expected affordance | Observable outcome | Ref | Expect | Execute"

# Frontmatter body (between the opening and closing --- fences).
fm() {
  awk 'NR==1 && $0=="---" {inside=1; next} inside && /^---$/ {exit} inside {print}' "$1"
}

# Body of one "## Section", up to the next "## ".
section_body() {
  awk -v sec="$2" '
    $0 == sec {inside=1; next}
    inside && /^## / {inside=0}
    inside {print}
  ' "$1"
}

# Data rows of a markdown table: pipe-led, minus header and separator.
table_rows() {
  grep '^|' <<< "$1" | grep -v '^|[[:space:]]*-\{2,\}' | tail -n +2
}

# Normalize a table header row to "A | B | C" for exact comparison.
norm_header() {
  grep -m1 '^|' <<< "$1" \
    | sed 's/^|//; s/|$//' \
    | awk -F'|' '{for(i=1;i<=NF;i++){gsub(/^[[:space:]]+|[[:space:]]+$/,"",$i); printf "%s%s", $i, (i<NF?" | ":"")}}'
}

# Trim a given pipe-field from a table row.
col() {
  awk -F'|' -v n="$2" '{gsub(/^[[:space:]]+|[[:space:]]+$/,"",$n); print $n}' <<< "$1"
}

# Emits one violation per line for a single role doc; empty output means clean.
lint_role() {
  local f="$1"
  local dir frontmatter name actor kind
  dir="$(basename "$(dirname "$f")")"
  frontmatter="$(fm "$f")"

  # 1. Directory must use the role-<slug> convention.
  if [[ "$dir" != role-* ]]; then
    echo "dir \"$dir\": not a role-<slug> directory"
    return
  fi

  # 2. Frontmatter name must match the directory.
  name="$(grep -m1 '^name:' <<< "$frontmatter" | sed 's/^name:[[:space:]]*//')"
  [ "$name" != "$dir" ] && echo "frontmatter name \"$name\" does not match directory \"$dir\""

  # 3. actor is the join key. Missing means the role is silently never checked.
  actor="$(grep -m1 '^actor:' <<< "$frontmatter" | sed 's/^actor:[[:space:]]*//')"
  [ -z "$actor" ] && echo "frontmatter: missing \"actor:\" (the scoping join key)"

  # 4. kind must match the SPEC 1a vocabulary.
  kind="$(grep -m1 '^kind:' <<< "$frontmatter" | sed 's/^kind:[[:space:]]*//')"
  case "$kind" in
    human-role|service|system) ;;
    "") echo "frontmatter: missing \"kind:\" (human-role|service|system)" ;;
    *)  echo "frontmatter: invalid kind \"$kind\" (want human-role|service|system)" ;;
  esac

  # 5. Required sections. An empty Known-state exceptions is fine ("None known.");
  #    an absent one means nobody considered false positives.
  local sec
  for sec in "${REQUIRED_SECTIONS[@]}"; do
    grep -qxF "$sec" "$f" || echo "missing required section \"$sec\""
  done

  # 5a. The duplicated procedure this skill replaces.
  grep -qE '^## How to verify' "$f" \
    && echo "\"## How to verify\" is the global protocol's job; extract its steps into ## Capabilities and delete it"

  # 6. Capability table columns are the protocol's contract. Drift breaks the walk.
  local caps caps_header
  caps="$(section_body "$f" "## Capabilities")"
  if [ -n "$caps" ]; then
    caps_header="$(norm_header "$caps")"
    if [ "$caps_header" != "$CAP_COLUMNS" ]; then
      echo "## Capabilities: columns are \"$caps_header\", want \"$CAP_COLUMNS\""
    else
      local row cap ref expect exec_mode
      while IFS= read -r row; do
        [ -z "$row" ] && continue
        cap="$(col "$row" 2)"
        ref="$(col "$row" 6)"
        expect="$(col "$row" 7)"
        exec_mode="$(col "$row" 8)"
        # 6a. Any stable project ref. Empty is what turns unbuilt features into regressions.
        if [ -z "$ref" ]; then
          echo "## Capabilities \"$cap\": Ref is empty, cite a stable project ref (FR-12, PR4, C8)"
        elif grep -q '[[:space:]]' <<< "$ref"; then
          echo "## Capabilities \"$cap\": Ref \"$ref\" contains whitespace, want a single stable id"
        fi
        # 6b. Expect drives whether absence is the finding or the pass.
        case "$expect" in
          reachable|denied) ;;
          *) echo "## Capabilities \"$cap\": Expect is \"$expect\", want reachable|denied" ;;
        esac
        # 6c. Execute gates whether the pass may write.
        case "$exec_mode" in
          observe|seeded) ;;
          *) echo "## Capabilities \"$cap\": Execute is \"$exec_mode\", want observe|seeded" ;;
        esac
      done < <(table_rows "$caps")
    fi
  fi

  # 7. Any seeded capability requires a Seed recipes section with all three fields.
  local seeded_count seeds
  seeded_count="$(table_rows "$caps" 2>/dev/null | awk -F'|' '{gsub(/^[[:space:]]+|[[:space:]]+$/,"",$8); if($8=="seeded") c++} END{print c+0}')"
  seeds="$(section_body "$f" "## Seed recipes")"
  if [ "$seeded_count" -gt 0 ]; then
    if [ -z "$seeds" ]; then
      echo "$seeded_count capability(s) marked seeded but no \"## Seed recipes\" section"
    else
      local field
      for field in Marker Create Cleanup; do
        grep -q "\*\*$field:\*\*" <<< "$seeds" \
          || echo "## Seed recipes: missing required field \"$field\""
      done
      # 7a. Cleanup must be scoped. An unscoped delete wipes real data on a shared DB.
      if grep -qiE 'DELETE[[:space:]]+FROM' <<< "$seeds"; then
        grep -iE 'DELETE[[:space:]]+FROM' <<< "$seeds" | grep -qiv 'WHERE' \
          && echo "## Seed recipes: DELETE without a WHERE clause (unscoped delete)"
      fi
      grep -qiE 'TRUNCATE' <<< "$seeds" \
        && echo "## Seed recipes: TRUNCATE is never permitted in a seed cleanup"
      grep -qiE 'session_replication_role' <<< "$seeds" \
        && echo "## Seed recipes: disabling FK checks means the cleanup is too broad"
    fi
  elif [ -n "$seeds" ]; then
    echo "## Seed recipes present but no capability is marked seeded (dead section)"
  fi

  # 8. Role docs are committed. Credentials are cited by env var name, never inline.
  local access
  access="$(section_body "$f" "## Access")"
  if [ -n "$access" ]; then
    while IFS= read -r row; do
      grep -qiE '(password|passwd|token|secret|api[_-]?key|bearer)' <<< "$row" || continue
      grep -q '\$' <<< "$row" && continue
      echo "## Access: possible literal credential, cite an env var instead: ${row:0:60}"
    done <<< "$access"
  fi

  # 9. Freshness (protocol Step 3) needs a date to compare against. Inline dating
  #    inside ## Allowed counts; no new section is required.
  grep -qE '[0-9]{4}-[0-9]{2}-[0-9]{2}' "$f" \
    || echo "no ISO date (YYYY-MM-DD) anywhere in the doc, freshness check cannot run"
}

# Guard: sourcing for tests must not run the scan.
[ "${BASH_SOURCE[0]}" != "${0}" ] && return 0

PASS=0
FAIL=0
shopt -s nullglob
ROLE_DOCS=("$SKILLS_DIR"/role-*/SKILL.md)

if [ ${#ROLE_DOCS[@]} -eq 0 ]; then
  echo "no role-*/SKILL.md found under $SKILLS_DIR"
  exit 0
fi

echo "== role docs satisfy ROLE_SKILL_SCHEMA.md"
for f in "${ROLE_DOCS[@]}"; do
  name="$(basename "$(dirname "$f")")"
  violations="$(lint_role "$f")"
  if [ -z "$violations" ]; then
    PASS=$((PASS + 1))
    echo "  ok: $name"
  else
    while IFS= read -r v; do
      [ -n "$v" ] && { FAIL=$((FAIL + 1)); echo "  FAIL: $name: $v"; }
    done <<< "$violations"
  fi
done

echo
echo "valid: $PASS  violations: $FAIL"
[ "$FAIL" -eq 0 ] || exit 3
