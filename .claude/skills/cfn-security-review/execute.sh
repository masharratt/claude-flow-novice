#!/usr/bin/env bash
# cfn-security-review - gather the working diff and scaffold a security-review
# manifest in the shared cfn-vote-implement schema. This script does NOT analyse
# code and does NOT fix anything. It captures the diff + writes a manifest
# skeleton; a security-specialist agent (spawned per SKILL.md) fills suggestions.
set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$PROJECT_ROOT"

# --- arg parsing --------------------------------------------------------------
# default: working-tree changes vs HEAD (staged + unstaged)
# --staged       : staged changes only
# --diff=<ref>   : changes since <ref>
# <path>         : restrict diff to a path
MODE="working"
REF=""
PATHSPEC=""
for arg in "$@"; do
  case "$arg" in
    --staged)   MODE="staged" ;;
    --diff=*)   MODE="ref"; REF="${arg#--diff=}" ;;
    --diff)     MODE="working" ;;
    --*)        : ;;  # ignore unknown flags
    *)          PATHSPEC="$arg" ;;
  esac
done

# --- manifest dir + gitignore -------------------------------------------------
MANIFEST_DIR="${PROJECT_ROOT}/.cfn-cache/manifests"
DIFF_DIR="${PROJECT_ROOT}/.cfn-cache/diffs"
mkdir -p "$MANIFEST_DIR" "$DIFF_DIR"
GITIGNORE="${PROJECT_ROOT}/.gitignore"
grep -qxE '\.cfn-cache/?' "$GITIGNORE" 2>/dev/null || printf '\n# CFN local cache\n.cfn-cache/\n' >> "$GITIGNORE"

TS=$(date +%s%N 2>/dev/null || echo "$(date +%s)-$$")
MANIFEST_PATH="${MANIFEST_DIR}/cfn-security-review-${TS}.json"
DIFF_PATH="${DIFF_DIR}/cfn-security-review-${TS}.diff"

# --- gather diff --------------------------------------------------------------
case "$MODE" in
  staged)  git diff --staged ${PATHSPEC:+-- "$PATHSPEC"} > "$DIFF_PATH" 2>/dev/null || true
           SCOPE="git diff --staged${PATHSPEC:+ $PATHSPEC}" ;;
  ref)     git diff "${REF}...HEAD" ${PATHSPEC:+-- "$PATHSPEC"} > "$DIFF_PATH" 2>/dev/null || true
           SCOPE="git diff ${REF}...HEAD${PATHSPEC:+ $PATHSPEC}" ;;
  *)       git diff HEAD ${PATHSPEC:+-- "$PATHSPEC"} > "$DIFF_PATH" 2>/dev/null || true
           # include untracked files (new migrations/handlers are often untracked)
           while IFS= read -r f; do
             [[ -n "$f" ]] || continue
             git diff --no-index -- /dev/null "$f" >> "$DIFF_PATH" 2>/dev/null || true
           done < <(git ls-files --others --exclude-standard ${PATHSPEC:+-- "$PATHSPEC"} 2>/dev/null)
           SCOPE="git diff HEAD + untracked (working tree)${PATHSPEC:+ $PATHSPEC}" ;;
esac

# changed files (filter out lock/binary/generated noise)
mapfile -t CHANGED < <(
  grep -E '^\+\+\+ b/' "$DIFF_PATH" 2>/dev/null \
    | sed 's#^+++ b/##' \
    | grep -vE '(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|\.min\.(js|css)$|node_modules/|dist/|\.next/|^\.gitignore$|\.cfn-cache/)' \
    || true
)
FILE_COUNT="${#CHANGED[@]}"

# detect security-relevant surfaces to flag in the manifest hints
HINTS=()
git_grep_diff() { grep -iqE "$1" "$DIFF_PATH" 2>/dev/null; }
git_grep_diff 'create table|alter table.*add|create policy|rls|row level security' && HINTS+=("db_schema")
git_grep_diff 'req\.(body|query|params)|request\.(form|args|json)|process\.argv|input\(' && HINTS+=("input_handling")
git_grep_diff 'password|secret|api[_-]?key|token|authorization|bearer|private[_-]?key' && HINTS+=("secret_or_auth")
git_grep_diff 'delete from|truncate ' && HINTS+=("destructive_sql")
git_grep_diff 'res\.(set|header)|helmet|content-security-policy|x-frame-options|hsts' && HINTS+=("http_headers")

# --- write manifest skeleton (shared schema, empty suggestions) ---------------
changed_json=$([[ "${#CHANGED[@]}" -eq 0 ]] && printf '[]' || { printf '%s\n' "${CHANGED[@]}" | jq -R . | jq -s '.'; })
hints_json=$([[ "${#HINTS[@]}" -eq 0 ]] && printf '[]' || { printf '%s\n' "${HINTS[@]}" | jq -R . | jq -s 'unique'; })

jq -n \
  --arg review_id "security-review-${TS}" \
  --arg source "cfn-security-review" \
  --arg scope "$SCOPE" \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg diff_file "$DIFF_PATH" \
  --argjson file_count "$FILE_COUNT" \
  --argjson changed_files "$changed_json" \
  --argjson surface_hints "$hints_json" \
  '{
    review_id: $review_id,
    source: $source,
    scope: $scope,
    generated_at: $generated_at,
    status: "pending_review",
    diff_file: $diff_file,
    file_count: $file_count,
    changed_files: $changed_files,
    surface_hints: $surface_hints,
    categories: [
      "injection","authz_authn","secret_exposure","missing_rls",
      "missing_security_headers","unscoped_destructive_sql","unsafe_input"
    ],
    suggestions: []
  }' > "$MANIFEST_PATH"

# --- summary ------------------------------------------------------------------
echo "cfn-security-review scaffold complete"
echo "  scope:        $SCOPE"
echo "  files:        $FILE_COUNT"
echo "  surface hints: ${HINTS[*]:-none}"
echo "  diff:         $DIFF_PATH"
echo "  manifest:     $MANIFEST_PATH"
echo
if [[ "$FILE_COUNT" -eq 0 ]]; then
  echo "Empty diff. Skeleton manifest written with zero suggestions. Nothing to review."
else
  echo "Next: spawn a security-specialist agent (see SKILL.md), have it append findings"
  echo "to the 'suggestions' array in the manifest, then run /cfn-vote-implement latest."
fi
