#!/usr/bin/env bash
# One search entry point for /codebase-search, /cfn-codesearch-search and
# /cfn-codesearch:cfn-codebase-search (they were three drifting copies).
#
# Usage: search.sh "<question or identifier>" [--top N] [--semantic]
#
# Three steps, each printed only when it finds something:
#   1. Files:    `codesearch lexical`, BM25 over file path + entity names +
#                content, markdown down-weighted, one row per file, no model load.
#      Names:    fallback when the installed binary predates `lexical` or the
#                index has no lexical table yet: identifiers pulled out of the
#                question, matched against entity names and file paths.
#   2. Mentions: files that mention those identifiers literally (who uses X).
#   3. Semantic: local embedding model, no API key; only when 1-2 find nothing, or --semantic.
#
# Env: CODESEARCH_DB (index, default ~/.local/share/codesearch/index_v2.db),
#      CODESEARCH_BIN (default ~/.local/bin/local-codesearch),
#      CLAUDE_PROJECT_DIR (project root; else git toplevel; else cwd).
#
# Benchmark 2026-10-30: matching the whole question as a name found 0 of 20,
# and the semantic step only ran when an OpenAI key was present.
set -uo pipefail

QUERY="${1:-}"
shift || true
TOP=5
SEMANTIC=0
while [ $# -gt 0 ]; do
  case "$1" in
    --top) TOP="${2:-5}"; shift 2 || shift ;;
    --semantic) SEMANTIC=1; shift ;;
    *) shift ;;
  esac
done
[[ "$TOP" =~ ^[0-9]+$ ]] && [ "$TOP" -gt 0 ] || TOP=5
if [ -z "$QUERY" ]; then
  echo "usage: search.sh \"<query>\" [--top N]" >&2
  exit 2
fi

DB="${CODESEARCH_DB:-$HOME/.local/share/codesearch/index_v2.db}"
BIN="${CODESEARCH_BIN:-$HOME/.local/bin/local-codesearch}"
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
ROOT="${ROOT%/}"

# Identifiers: tokens holding - _ . / or an inner capital (camelCase), with
# surrounding punctuation stripped. Plain English words are left to step 3.
read -ra WORDS <<< "$QUERY"
mapfile -t TERMS < <(
  printf '%s\n' "${WORDS[@]}" | sed -E "s/^[[\"'\`(<]+//; s/[]\"'\`)>,;:?!]+$//; s/[.]+$//; s/'s$//" |
    grep -E '^[A-Za-z0-9_./-]{3,}$' | grep -E '[-_./]|[a-z][A-Z]' | sort -u
)

sql_quote() { printf "%s" "$1" | sed "s/'/''/g"; }

found=0
# 1. Files (lexical). Fails on old binaries or a pre-lexical index: fall back.
lexical_ok=0
if [ -x "$BIN" ] && [ -f "$DB" ]; then
  # Empty output also falls back: projects not reindexed since `lexical` landed
  # have no rows in its table yet.
  files=$( (cd "$ROOT" && "$BIN" --project-dir "$ROOT" lexical "$QUERY" -n "$TOP" --db "$DB") 2>/dev/null) || files=""
  if [ -n "$files" ]; then
    lexical_ok=1
    echo "=== Files ==="; echo "$files"; echo; found=1
  fi
fi

# 1b. Names (fallback)
if [ "$lexical_ok" = 0 ] && [ "${#TERMS[@]}" -gt 0 ] && [ -f "$DB" ]; then
  root_q=$(sql_quote "$ROOT")
  conds="" order=""
  for t in "${TERMS[@]}"; do
    base="${t##*/}"; stem="${base%.*}"; [ -n "$stem" ] || stem="$base"
    s=$(sql_quote "$stem"); b=$(sql_quote "$base")
    conds="$conds OR name = '$s' OR name LIKE '%$s%' OR file_path LIKE '%/$b' OR file_path LIKE '%$s%'"
    order="$order WHEN name = '$s' THEN 0 WHEN file_path LIKE '%/$b' THEN 1"
  done
  names=$(sqlite3 -separator ' ' "$DB" \
    "SELECT REPLACE(file_path, '$root_q/', '') || ':' || line_number, kind, name FROM entities
     WHERE project_root = '$root_q' AND (0 $conds)
     GROUP BY file_path ORDER BY MIN(CASE $order ELSE 2 END), length(file_path) LIMIT $TOP" 2>/dev/null || true)
  if [ -n "$names" ]; then
    echo "=== Names ==="; echo "$names"; echo; found=1
  fi
fi

# 2. Mentions (literal, tracked + untracked files, archives and vendored dirs skipped)
if [ "${#TERMS[@]}" -gt 0 ]; then
  pats=()
  for t in "${TERMS[@]}"; do pats+=(-e "${t##*/}"); done
  excl=(':!*archive*/**' ':!**/node_modules/**' ':!**/.backups/**' ':!**/backups/**'
        ':!**/*-lock.json' ':!**/*.lock')
  if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    mentions=$(git -C "$ROOT" grep -l -I -F --untracked "${pats[@]}" -- . "${excl[@]}" 2>/dev/null | head -n "$((TOP * 2))")
  else
    mentions=$(grep -rlIF "${pats[@]}" --exclude-dir={node_modules,.git,archive,.archive,backups,.backups} "$ROOT" 2>/dev/null |
      sed "s|^$ROOT/||" | head -n "$((TOP * 2))")
  fi
  if [ -n "$mentions" ]; then
    echo "=== Files mentioning: ${TERMS[*]##*/} ==="; echo "$mentions"; echo; found=1
  fi
fi

# 3. Semantic (local model; never reads or needs an API key). Fallback only:
#    on the 2026-10-30 live rerun, steps 1-2 hit 18/20 in ~35 ms and semantic
#    added ~2 s per query (model load) with no extra hits.
if { [ "$found" = 0 ] || [ "$SEMANTIC" = 1 ]; } && [ -x "$BIN" ] && [ -f "$DB" ]; then
  # The binary prints its log lines on stdout; keep only result lines, paths relative.
  # cfn: wrapper-side filter, drop once the binary logs to stderr
  sem=$( (cd "$ROOT" && env -u OPENAI_API_KEY "$BIN" query "$QUERY" --max-results "$TOP" --threshold 0.1) 2>/dev/null |
    grep -E ' in .+:[0-9]+ \(similarity' | sed "s| in $ROOT/| in |")
  if [ -n "$sem" ]; then
    echo "=== Semantic ==="; echo "$sem"; found=1
  fi
fi

if [ ! -f "$DB" ]; then
  echo "No CodeSearch index found. Run /cfn-codebase-reindex to index this project."
elif [ "$found" = 0 ]; then
  echo "No results. If this project is new, run /cfn-codebase-reindex."
fi
exit 0
