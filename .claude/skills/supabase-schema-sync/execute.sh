#!/usr/bin/env bash
# supabase-schema-sync - Introspect Supabase DB and update project db-query skill
# Version: 2.0.0
# Reads DATABASE_URL from .env (never sources it), strips pgbouncer params,
# then writes split schema structure to .claude/skills/db-query/
#
# Output structure:
#   .claude/skills/db-query/
#   ├── SKILL.md          - lean index: table names only, no columns
#   ├── execute.sh        - query runner (written only if not present)
#   └── schemas/
#       ├── <schema1>.md  - full column details for schema1
#       ├── <schema2>.md  - full column details for schema2

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR=""
SCHEMAS_ARG=""
INCLUDE_AUTH=0

usage() {
  cat <<EOF
Usage: $0 [--project-dir PATH] [--schemas SCHEMA1,SCHEMA2] [--include-auth] [--help]

Options:
  --project-dir PATH     Project root containing .env (default: current directory)
  --schemas SCHEMA,...   Comma-separated list of schemas to introspect.
                         Default: auto-detect all non-system schemas.
  --include-auth         Include the 'auth' schema (skipped by default).
  --help, -h             Show this help message.

Examples:
  $0
  $0 --project-dir /path/to/project
  $0 --project-dir /path/to/project --schemas public,analytics
  $0 --include-auth
EOF
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --project-dir) PROJECT_DIR="$2"; shift 2 ;;
    --schemas) SCHEMAS_ARG="$2"; shift 2 ;;
    --include-auth) INCLUDE_AUTH=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1"; usage; exit 1 ;;
  esac
done

# Default to current directory if not provided
if [[ -z "$PROJECT_DIR" ]]; then
  PROJECT_DIR="$PWD"
fi

# Normalize to absolute path
PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

echo "Syncing schema for project: $PROJECT_DIR"

# Validate .env exists
ENV_FILE="$PROJECT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env file not found at $ENV_FILE" >&2
  exit 1
fi

# Validate DATABASE_URL present (never source .env)
RAW_URL=$(grep '^DATABASE_URL=' "$ENV_FILE" | cut -d'=' -f2-)
# Strip surrounding single/double quotes (matches db-query/execute.sh behavior).
RAW_URL="${RAW_URL%\"}"; RAW_URL="${RAW_URL#\"}"
RAW_URL="${RAW_URL%\'}"; RAW_URL="${RAW_URL#\'}"
if [[ -z "$RAW_URL" ]]; then
  echo "ERROR: DATABASE_URL not found in $ENV_FILE" >&2
  exit 1
fi

# Validate psql is available
if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found in PATH. Install postgresql-client and retry." >&2
  exit 1
fi

# Strip pgbouncer-incompatible params.
# Handles both ? and & delimiters. sslmode is safe to keep.
clean_url() {
  local url="$1"
  url=$(echo "$url" | sed 's/[?&]pool_size=[^&]*//g')
  url=$(echo "$url" | sed 's/[?&]connection_limit=[^&]*//g')
  url=$(echo "$url" | sed 's/[?&]pgbouncer=[^&]*//g')
  url=$(echo "$url" | sed 's/&&/\&/g')
  url=$(echo "$url" | sed 's/?&/?/g')
  url=$(echo "$url" | sed 's/[?&]$//')
  echo "$url"
}

CLEAN_URL=$(clean_url "$RAW_URL")

# Detect schemas to introspect
if [[ -n "$SCHEMAS_ARG" ]]; then
  IFS=',' read -ra SCHEMAS <<< "$SCHEMAS_ARG"
else
  SCHEMA_QUERY="SELECT schema_name FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast')
    AND schema_name NOT LIKE 'pg_temp_%'
    AND schema_name NOT LIKE 'pg_toast_temp_%'
    ORDER BY schema_name;"

  SCHEMA_LIST=$(psql "$CLEAN_URL" -t -A -c "$SCHEMA_QUERY" 2>&1) || {
    echo "ERROR: Failed to connect to database. Check DATABASE_URL in .env" >&2
    echo "psql output: $SCHEMA_LIST" >&2
    exit 1
  }

  if [[ -z "$SCHEMA_LIST" ]]; then
    echo "ERROR: No non-system schemas detected. Check database permissions." >&2
    exit 1
  fi

  # `read -ra` consumes only the first line; multi-line schema lists were truncated
  # to a single schema (bug surfaced when the first schema, e.g. `auth`, got filtered
  # out, leaving an empty set). mapfile reads every line into the array.
  mapfile -t SCHEMAS <<< "$SCHEMA_LIST"
fi

# Filter out auth schema unless --include-auth is set
FILTERED_SCHEMAS=()
for s in "${SCHEMAS[@]}"; do
  if [[ "$s" == "auth" && "$INCLUDE_AUTH" -eq 0 ]]; then
    echo "Skipping schema: auth (use --include-auth to include it)"
    continue
  fi
  FILTERED_SCHEMAS+=("$s")
done
SCHEMAS=("${FILTERED_SCHEMAS[@]}")

if [[ ${#SCHEMAS[@]} -eq 0 ]]; then
  echo "ERROR: No schemas to introspect after filtering." >&2
  exit 1
fi

echo "Schemas to introspect: $(IFS=', '; echo "${SCHEMAS[*]}")"

# Determine primary schema (first in list, or 'public' if present)
PRIMARY_SCHEMA="${SCHEMAS[0]}"
for s in "${SCHEMAS[@]}"; do
  if [[ "$s" == "public" ]]; then
    PRIMARY_SCHEMA="public"
    break
  fi
done

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Ensure output directories exist
DB_QUERY_DIR="$PROJECT_DIR/.claude/skills/db-query"
SCHEMAS_DIR="$DB_QUERY_DIR/schemas"
mkdir -p "$SCHEMAS_DIR"

# Collect table index data and write per-schema files
# TABLE_INDEX_ENTRIES is an associative array: schema -> "table1, table2, ..."
declare -A TABLE_INDEX_ENTRIES
declare -A TABLE_COUNTS

for SCHEMA in "${SCHEMAS[@]}"; do
  TABLE_QUERY="SELECT DISTINCT table_name FROM information_schema.columns
    WHERE table_schema = '$SCHEMA'
    ORDER BY table_name;"

  TABLE_LIST=$(psql "$CLEAN_URL" -t -A -c "$TABLE_QUERY" 2>&1) || {
    echo "ERROR: Failed to query tables for schema '$SCHEMA'" >&2
    exit 1
  }

  TABLE_COUNT=0
  if [[ -n "$TABLE_LIST" ]]; then
    TABLE_COUNT=$(echo "$TABLE_LIST" | wc -l | tr -d ' ')
  fi

  echo "Writing schema: $SCHEMA ($TABLE_COUNT tables)..."

  TABLE_COUNTS["$SCHEMA"]="$TABLE_COUNT"

  # Build comma-separated table name list for the index
  TABLE_NAMES_CSV=""
  if [[ -n "$TABLE_LIST" ]]; then
    TABLE_NAMES_CSV=$(echo "$TABLE_LIST" | tr '\n' ',' | sed 's/,$//')
  fi
  TABLE_INDEX_ENTRIES["$SCHEMA"]="$TABLE_NAMES_CSV"

  # Write schemas/<schema>.md with full column details
  SCHEMA_FILE="$SCHEMAS_DIR/${SCHEMA}.md"

  {
    echo "# Schema: ${SCHEMA}"
    echo ""

    if [[ -z "$TABLE_LIST" ]]; then
      echo "(No tables found in this schema)"
    else
      while IFS= read -r TABLE_NAME; do
        [[ -z "$TABLE_NAME" ]] && continue

        # pg_description comments are the source of truth for known gotchas
        # (frozen columns, key mismatches, stale/sparse fields, etc). Pull
        # them alongside type info so agents see the trap without a second
        # query. Delimiter is \x01 (not '|') since comment text may itself
        # contain a pipe.
        COL_QUERY="SELECT c.column_name, c.data_type, c.is_nullable, pgd.description
          FROM information_schema.columns c
          LEFT JOIN pg_catalog.pg_statio_all_tables st
            ON st.relname = c.table_name AND st.schemaname = c.table_schema
          LEFT JOIN pg_catalog.pg_description pgd
            ON pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
          WHERE c.table_schema = '$SCHEMA'
          AND c.table_name = '$TABLE_NAME'
          ORDER BY c.ordinal_position;"

        COL_ROWS=$(psql "$CLEAN_URL" -t -A -F $'\x01' -c "$COL_QUERY" 2>&1) || {
          echo "ERROR: Failed to query columns for $SCHEMA.$TABLE_NAME" >&2
          exit 1
        }

        TABLE_COMMENT_QUERY="SELECT obj_description(format('%I.%I', '$SCHEMA', '$TABLE_NAME')::regclass);"
        TABLE_COMMENT=$(psql "$CLEAN_URL" -t -A -c "$TABLE_COMMENT_QUERY" 2>/dev/null || true)

        echo "## ${TABLE_NAME}"
        [[ -n "$TABLE_COMMENT" ]] && echo "> ${TABLE_COMMENT}"
        echo "| column | type | nullable | comment |"
        echo "|--------|------|----------|---------|"

        while IFS=$'\x01' read -r COL_NAME COL_TYPE IS_NULL COL_COMMENT; do
          [[ -z "$COL_NAME" ]] && continue
          echo "| ${COL_NAME} | ${COL_TYPE} | ${IS_NULL} | ${COL_COMMENT} |"
        done <<< "$COL_ROWS"

        echo ""
      done <<< "$TABLE_LIST"
    fi
  } > "$SCHEMA_FILE"
done

# Write SKILL.md as lean index (table names only, no columns)
SKILL_MD_PATH="$DB_QUERY_DIR/SKILL.md"

{
  cat <<FRONTMATTER
---
name: db-query
version: 1.0.0 (auto-updated by supabase-schema-sync)
tags: [postgres, supabase, database, query]
status: production
description: "Project DB query skill. Use --sql for queries. Use --schema-doc to load column details on demand."
---

# DB Query

## IMPORTANT: Read schema before writing SQL

Do NOT guess table or column names. Look up what you need first.

## Column comments = known gotchas

\`--schema-doc\` output includes a \`comment\` column sourced from
\`pg_description\` (COMMENT ON TABLE/COLUMN). A non-empty comment usually
documents a landmine (frozen/stale column, non-obvious join key, dual-shape
sync behavior, sparse-by-design field) that isn't visible in the type alone.
Read it before trusting the column.

If you discover a non-obvious column contract while working (via code, a
migration, or a bug) that isn't already commented, add
\`COMMENT ON TABLE\`/\`COMMENT ON COLUMN\` in the same migration that touches
it, then re-run \`supabase-schema-sync\` to refresh these docs. Comment-only
changes are zero-blast-radius — no reason to skip them.

## Table Index

FRONTMATTER

  for SCHEMA in "${SCHEMAS[@]}"; do
    COUNT="${TABLE_COUNTS[$SCHEMA]}"
    NAMES="${TABLE_INDEX_ENTRIES[$SCHEMA]}"
    echo "### ${SCHEMA} (${COUNT} tables)"
    echo "${NAMES}"
    echo ""
  done

  cat <<USAGESECTION
## Get column details before querying

\`\`\`bash
# All tables in a schema
./.claude/skills/db-query/execute.sh --schema-doc ${PRIMARY_SCHEMA}

# One specific table
./.claude/skills/db-query/execute.sh --schema-doc ${PRIMARY_SCHEMA}.example_table
\`\`\`

## Run a query

\`\`\`bash
./.claude/skills/db-query/execute.sh --sql "SELECT id, topic FROM example_table WHERE status = 'published'"

# Explicit schema
./.claude/skills/db-query/execute.sh --schema ${PRIMARY_SCHEMA} --sql "SELECT ..."
\`\`\`

## Last synced
${TIMESTAMP}
USAGESECTION
} > "$SKILL_MD_PATH"

# Write execute.sh only if it does not already exist (preserve customizations)
EXECUTE_SH_PATH="$DB_QUERY_DIR/execute.sh"

if [[ ! -f "$EXECUTE_SH_PATH" ]]; then
  cat > "$EXECUTE_SH_PATH" <<'EXECUTESH'
#!/usr/bin/env bash
# db-query - Project-local Supabase query skill
# Read SKILL.md for table index. Use --schema-doc to get column details.
# Generated by supabase-schema-sync. Do not edit manually.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SKILL_DIR/../../.." && pwd)"
SCHEMA=""
SQL=""
SCHEMA_DOC=""

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Options:
  --sql "SELECT ..."              Run a query (URL cleanup + search_path handled)
  --schema SCHEMA                 Set search_path for --sql (optional)
  --schema-doc SCHEMA             Show all column details for a schema
  --schema-doc SCHEMA.TABLE       Show column details for one table
  --help, -h                      Show this help

Examples:
  $0 --schema-doc daily_listen
  $0 --schema-doc daily_listen.deep_dives
  $0 --sql "SELECT id, topic FROM deep_dives LIMIT 5"
  $0 --schema daily_listen --sql "SELECT id, topic FROM deep_dives LIMIT 5"
EOF
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --schema) SCHEMA="$2"; shift 2 ;;
    --sql) SQL="$2"; shift 2 ;;
    --schema-doc) SCHEMA_DOC="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 1 ;;
  esac
done

# --schema-doc mode
if [[ -n "$SCHEMA_DOC" ]]; then
  if [[ "$SCHEMA_DOC" == *.* ]]; then
    SCHEMA_NAME="${SCHEMA_DOC%%.*}"
    TABLE_NAME="${SCHEMA_DOC#*.}"
    SCHEMA_FILE="$SKILL_DIR/schemas/${SCHEMA_NAME}.md"
    if [[ ! -f "$SCHEMA_FILE" ]]; then
      echo "ERROR: Schema file not found: $SCHEMA_FILE" >&2
      echo "Run supabase-schema-sync to generate schema docs." >&2
      exit 1
    fi
    # Extract from ## TABLE_NAME to next ## heading or EOF
    awk "/^## ${TABLE_NAME}$/{found=1} found && /^## / && !/^## ${TABLE_NAME}$/{exit} found{print}" "$SCHEMA_FILE"
  else
    SCHEMA_FILE="$SKILL_DIR/schemas/${SCHEMA_DOC}.md"
    if [[ ! -f "$SCHEMA_FILE" ]]; then
      echo "ERROR: Schema file not found: $SCHEMA_FILE" >&2
      echo "Run supabase-schema-sync to generate schema docs." >&2
      exit 1
    fi
    cat "$SCHEMA_FILE"
  fi
  exit 0
fi

# --sql mode
[[ -z "$SQL" ]] && { echo "ERROR: --sql or --schema-doc required"; usage; exit 1; }

RAW_URL=$(grep '^DATABASE_URL=' "$PROJECT_DIR/.env" | cut -d'=' -f2-)
[[ -z "$RAW_URL" ]] && { echo "ERROR: DATABASE_URL not found in $PROJECT_DIR/.env" >&2; exit 1; }

CLEAN_URL=$(echo "$RAW_URL" \
  | sed 's/[?&]pool_size=[^&]*//g' \
  | sed 's/[?&]connection_limit=[^&]*//g' \
  | sed 's/[?&]pgbouncer=[^&]*//g' \
  | sed 's/&&/\&/g' \
  | sed 's/?&/?/g' \
  | sed 's/[?&]$//')

if [[ -n "$SCHEMA" ]]; then
  FULL_SQL="SET search_path = $SCHEMA; $SQL"
else
  FULL_SQL="$SQL"
fi

psql "$CLEAN_URL" -c "$FULL_SQL"
EXECUTESH

  chmod +x "$EXECUTE_SH_PATH"
  echo "  -> $EXECUTE_SH_PATH (created)"
else
  echo "  -> $EXECUTE_SH_PATH (already exists, preserved)"
fi

# Print summary with token estimate
SKILL_MD_SIZE=$(wc -c < "$SKILL_MD_PATH")
SKILL_MD_TOKENS=$(( SKILL_MD_SIZE / 4 ))

echo ""
echo "Schema sync complete."
echo "  -> $SKILL_MD_PATH (~${SKILL_MD_TOKENS} tokens)"
for SCHEMA in "${SCHEMAS[@]}"; do
  SCHEMA_FILE="$SCHEMAS_DIR/${SCHEMA}.md"
  FILE_SIZE=$(wc -c < "$SCHEMA_FILE")
  FILE_TOKENS=$(( FILE_SIZE / 4 ))
  echo "  -> $SCHEMA_FILE (~${FILE_TOKENS} tokens)"
done
