#!/usr/bin/env bash
#
# fixlist-to-manifest.sh
#
# Convert an alpha-launch fix-list markdown file into a cfn-vote-implement
# compatible JSON manifest.
#
# Schema (matches cfn-dry-review output, consumed by cfn-vote-implement):
#   {
#     "review_id":   "alpha-review-<ts>",
#     "scope":       "<fix-list path>",
#     "source":      "cfn-alpha-launch" | "cfn-alpha-launch-v2",
#     "generated_at": "<ISO-8601>",
#     "suggestions": [
#       {
#         "id":                  "S001",
#         "category":            "<agent-type or feature-name>",
#         "title":               "<first line of finding>",
#         "description":         "<finding body>",
#         "files":               ["<path>"],
#         "impact":              "high | medium | low",
#         "priority":            "critical | high | medium | low",
#         "effort":              "unknown",
#         "suggested_approach":  "See readiness report",
#         "related_suggestions": []
#       }
#     ]
#   }
#
# Usage:
#   fixlist-to-manifest.sh <fix-list.md> [--source <label>] [--out <path>]
#
# Defaults:
#   --source: auto-detected from path (cfn-alpha-launch vs cfn-alpha-launch-v2)
#   --out:    <project-root>/.cfn-cache/manifests/cfn-review-alpha-<ts>.json (v1) or
#             <project-root>/.cfn-cache/manifests/cfn-review-alpha-v2-<PRIORITY>-<ts>.json (v2)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../cfn-utilities/lib/manifest-path.sh
source "${SCRIPT_DIR}/../../cfn-utilities/lib/manifest-path.sh"

if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq required but not installed" >&2
    exit 1
fi

FIXLIST=""
SOURCE_LABEL=""
OUT_PATH=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --source) SOURCE_LABEL="$2"; shift 2 ;;
        --out)    OUT_PATH="$2";    shift 2 ;;
        -h|--help)
            sed -n '1,40p' "$0"
            exit 0
            ;;
        *)
            if [[ -z "$FIXLIST" ]]; then
                FIXLIST="$1"
            else
                echo "ERROR: unexpected arg: $1" >&2
                exit 2
            fi
            shift
            ;;
    esac
done

[[ -z "$FIXLIST" ]] && { echo "ERROR: fix-list path required" >&2; exit 2; }
[[ -f "$FIXLIST" ]] || { echo "ERROR: fix-list not found: $FIXLIST" >&2; exit 2; }

# Auto-detect source + group priority from filename
BASENAME=$(basename "$FIXLIST")
GROUP_PRIORITY=""
if [[ -z "$SOURCE_LABEL" ]]; then
    if [[ "$FIXLIST" == *"fixes-by-priority"* ]] || [[ "$BASENAME" =~ fix-list-(CRITICAL|HIGH|MEDIUM|LOW) ]]; then
        SOURCE_LABEL="cfn-alpha-launch-v2"
    else
        SOURCE_LABEL="cfn-alpha-launch"
    fi
fi
if [[ "$BASENAME" =~ fix-list-(CRITICAL|HIGH|MEDIUM|LOW) ]]; then
    GROUP_PRIORITY="${BASH_REMATCH[1]}"
fi

# Nanosecond-precision timestamp avoids collisions on same-second invocations.
# date may not support %N (e.g. BSD); fall back to seconds + PID.
TS=$(date +%s%N 2>/dev/null)
if [[ -z "$TS" || "$TS" == *N ]]; then
    TS="$(date +%s)-$$"
fi
ISO_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
REVIEW_ID="alpha-review-${TS}"

if [[ -z "$OUT_PATH" ]]; then
    if [[ -n "$GROUP_PRIORITY" ]]; then
        OUT_PATH=$(cfn_manifest_path "cfn-review-alpha-v2-${GROUP_PRIORITY}-${TS}.json")
    else
        OUT_PATH=$(cfn_manifest_path "cfn-review-alpha-${TS}.json")
    fi
fi

# Map section header -> (impact, priority)
section_to_priority() {
    case "$1" in
        *Critical*|*CRITICAL*) echo "high|critical" ;;
        *"High Priority"*|*HIGH*) echo "high|high" ;;
        *"Medium Priority"*|*MEDIUM*) echo "medium|medium" ;;
        *"Low Priority"*|*LOW*) echo "low|low" ;;
        *) echo "medium|medium" ;;
    esac
}

# Parse fix list into newline-separated TSV records:
#   <impact>\t<priority>\t<category>\t<title>\t<files-csv>
# Format of items (both v1 and v2):
#   N. <description> - Agent: <type> - File: <path>
# Multiple files separated by `, ` or `;` allowed.

CUR_IMPACT="medium"
CUR_PRIORITY="medium"
CUR_FEATURE=""
SUGGESTION_COUNT=0
TMP_TSV=$(mktemp)
trap 'rm -f "$TMP_TSV"' EXIT

# If filename pinned a priority (v2), set defaults
if [[ -n "$GROUP_PRIORITY" ]]; then
    IFS='|' read -r CUR_IMPACT CUR_PRIORITY <<< "$(section_to_priority "$GROUP_PRIORITY")"
fi

while IFS= read -r line; do
    # Feature header (v2): "## Feature #N: Title"
    if [[ "$line" =~ ^##[[:space:]]+Feature[[:space:]]+#([0-9]+):[[:space:]]*(.+)$ ]]; then
        CUR_FEATURE="feature-${BASH_REMATCH[1]}-$(echo "${BASH_REMATCH[2]}" | tr '[:upper:] ' '[:lower:]-' | tr -cd '[:alnum:]-')"
        continue
    fi
    # Priority section header (v1 + v2)
    if [[ "$line" =~ ^##[[:space:]]+(Critical|High[[:space:]]Priority|Medium[[:space:]]Priority|Low[[:space:]]Priority|Priority[[:space:]]Issues) ]]; then
        if [[ -z "$GROUP_PRIORITY" ]]; then
            IFS='|' read -r CUR_IMPACT CUR_PRIORITY <<< "$(section_to_priority "${BASH_REMATCH[1]}")"
        fi
        continue
    fi

    # Item line: "N. <desc> - Agent: <type> - File: <path>"
    if [[ "$line" =~ ^[[:space:]]*[0-9]+\.[[:space:]]+(.+)$ ]]; then
        body="${BASH_REMATCH[1]}"
        desc="$body"
        agent_type=""
        files_csv=""

        # Extract Agent (allow hyphens in name) and File. Use separators "- Agent:" / "- File:".
        if [[ "$body" == *" - Agent: "* ]]; then
            desc="${body% - Agent: *}"
            rest="${body#* - Agent: }"
            if [[ "$rest" == *" - File: "* ]]; then
                agent_type="${rest% - File: *}"
                files_csv="${rest#* - File: }"
            else
                agent_type="$rest"
            fi
        elif [[ "$body" == *" - File: "* ]]; then
            desc="${body% - File: *}"
            files_csv="${body#* - File: }"
        fi
        # Strip whitespace
        agent_type="${agent_type#"${agent_type%%[![:space:]]*}"}"
        agent_type="${agent_type%"${agent_type##*[![:space:]]}"}"

        # Category: agent type if present, else feature, else "alpha"
        category="$agent_type"
        [[ -z "$category" ]] && category="$CUR_FEATURE"
        [[ -z "$category" ]] && category="alpha"

        # Title = first 80 chars of description
        title="$desc"
        [[ ${#title} -gt 80 ]] && title="${title:0:77}..."

        printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
            "$CUR_IMPACT" "$CUR_PRIORITY" "$category" "$title" "$desc" "$files_csv" >> "$TMP_TSV"
        SUGGESTION_COUNT=$((SUGGESTION_COUNT + 1))
    fi
done < "$FIXLIST"

if [[ $SUGGESTION_COUNT -eq 0 ]]; then
    echo "WARN: no parseable items found in $FIXLIST" >&2
fi

# Build JSON
SUGGESTIONS=$(awk -F'\t' '
{
    impact=$1; priority=$2; category=$3; title=$4; desc=$5; files=$6
    id=sprintf("S%03d", NR)

    # Split files by comma or semicolon, trim, build JSON array
    n = split(files, parts, /[,;]/)
    farr = "["
    for (i = 1; i <= n; i++) {
        f = parts[i]
        gsub(/^[ \t]+|[ \t]+$/, "", f)
        if (f != "") {
            if (farr != "[") farr = farr ","
            gsub(/\\/, "\\\\", f); gsub(/"/, "\\\"", f)
            farr = farr "\"" f "\""
        }
    }
    farr = farr "]"

    gsub(/\\/, "\\\\", title); gsub(/"/, "\\\"", title)
    gsub(/\\/, "\\\\", desc);  gsub(/"/, "\\\"", desc)
    gsub(/\\/, "\\\\", category); gsub(/"/, "\\\"", category)

    if (NR > 1) printf ","
    printf "{\"id\":\"%s\",\"category\":\"%s\",\"title\":\"%s\",\"description\":\"%s\",\"files\":%s,\"impact\":\"%s\",\"priority\":\"%s\",\"effort\":\"unknown\",\"suggested_approach\":\"See readiness report\",\"related_suggestions\":[]}",
        id, category, title, desc, farr, impact, priority
}
' "$TMP_TSV")

jq -n \
    --arg review_id "$REVIEW_ID" \
    --arg scope "$FIXLIST" \
    --arg source "$SOURCE_LABEL" \
    --arg generated_at "$ISO_TS" \
    --argjson suggestions "[${SUGGESTIONS}]" \
    '{review_id: $review_id, scope: $scope, source: $source, generated_at: $generated_at, suggestions: $suggestions}' \
    > "$OUT_PATH"

echo "Wrote manifest: $OUT_PATH (${SUGGESTION_COUNT} suggestions)"
echo "$OUT_PATH"
