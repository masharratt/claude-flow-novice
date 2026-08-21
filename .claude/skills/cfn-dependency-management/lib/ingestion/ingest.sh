#!/usr/bin/env bash
# Unified CFN Dependency Ingestion
# Supports both manifest-based and diagram-based ingestion
# Version: 2.0.0
#
# Usage:
#   # Manifest-based (trigger-dev, cli-mode, etc.)
#   ./ingest.sh --manifest trigger-dev --inject-content
#   ./ingest.sh --manifest cli-mode --priority P0
#
#   # Diagram-based (legacy)
#   ./ingest.sh --diagram cli
#   ./ingest.sh --diagram docker

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# This file lives at .claude/skills/cfn-dependency-management/lib/ingestion/, so
# the repo root is FIVE levels up (ingestion -> lib -> cfn-dependency-management
# -> skills -> .claude -> root). The old three-level form landed on
# .claude/skills, and since the script cd's here before reading a manifest, no
# repo-relative manifest path could ever resolve.
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
MANIFESTS_DIR="$SCRIPT_DIR/manifests"

# Default parameters
MANIFEST=""
DIAGRAM=""
PRIORITY_FILTER=""
TYPE_FILTER=""
INJECT_CONTENT=false
SKIP_VALIDATION=false

# Parse command-line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --manifest|-m)
      MANIFEST="$2"
      shift 2
      ;;
    --diagram|-d)
      DIAGRAM="$2"
      shift 2
      ;;
    --priority|-p)
      PRIORITY_FILTER="$2"
      shift 2
      ;;
    --type|-t)
      TYPE_FILTER="$2"
      shift 2
      ;;
    --inject-content|-i)
      INJECT_CONTENT=true
      shift
      ;;
    --skip-validation|-s)
      SKIP_VALIDATION=true
      shift
      ;;
    --list-manifests|-l)
      echo "Available manifests:"
      ls -1 "$MANIFESTS_DIR"/*.txt 2>/dev/null | xargs -n1 basename | sed 's/-dependencies.txt$//' | sed 's/^/  /'
      exit 0
      ;;
    --help|-h)
      cat << 'EOF'
Unified CFN Dependency Ingestion

Usage:
  ./ingest.sh --manifest <name> [options]
  ./ingest.sh --diagram <type> [options]

Manifest Mode (recommended):
  --manifest, -m <name>   Load manifest file (trigger-dev, cli-mode, shared, etc.)

Diagram Mode (legacy):
  --diagram, -d <type>    Parse dependency diagram (cli, docker)

Options:
  --priority, -p <P0,P1,P2>   Filter by priority levels
  --type, -t <TS,SH,MD,YML>   Filter by file type
  --inject-content, -i        Inject file contents directly (vs Read commands)
  --skip-validation, -s       Skip file existence validation
  --list-manifests, -l        List available manifests
  --help, -h                  Show this help

Examples:
  # Trigger.dev infrastructure (P0 only, ~8K tokens)
  ./ingest.sh --manifest trigger-dev --priority P0 --inject-content

  # CLI mode dependencies (all priorities)
  ./ingest.sh --manifest cli-mode --inject-content

  # Legacy diagram parsing
  ./ingest.sh --diagram cli --priority P0
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Use --help for usage information" >&2
      exit 1
      ;;
  esac
done

cd "$PROJECT_ROOT"

# Validate input mode
if [[ -z "$MANIFEST" && -z "$DIAGRAM" ]]; then
  echo "Error: Must specify --manifest or --diagram" >&2
  echo "Use --list-manifests to see available manifests" >&2
  exit 1
fi

# =============================================================================
# MANIFEST-BASED INGESTION
# =============================================================================
if [[ -n "$MANIFEST" ]]; then
  MANIFEST_FILE="$MANIFESTS_DIR/${MANIFEST}-dependencies.txt"

  if [[ ! -f "$MANIFEST_FILE" ]]; then
    echo "Error: Manifest not found: $MANIFEST_FILE" >&2
    echo "Available manifests:" >&2
    ls -1 "$MANIFESTS_DIR"/*.txt 2>/dev/null | xargs -n1 basename | sed 's/-dependencies.txt$//' | sed 's/^/  /' >&2
    exit 1
  fi

  # Build priority regex
  priority_regex=""
  if [[ -n "$PRIORITY_FILTER" ]]; then
    priority_regex=$(echo "$PRIORITY_FILTER" | tr ',' '|')
  fi

  # Build type regex
  type_regex=""
  if [[ -n "$TYPE_FILTER" ]]; then
    type_regex=$(echo "$TYPE_FILTER" | tr ',' '|')
  fi

  # Extract files from manifest
  declare -a files_array=()

  while IFS= read -r line; do
    # Skip empty lines and comments
    [[ -z "$line" || "$line" =~ ^# ]] && continue

    # Must start with priority marker
    [[ ! "$line" =~ ^\[P[0-2]\] ]] && continue

    # Check priority filter
    if [[ -n "$priority_regex" ]]; then
      if ! echo "$line" | grep -qE "\[($priority_regex)\]"; then
        continue
      fi
    fi

    # Check type filter
    if [[ -n "$type_regex" ]]; then
      if ! echo "$line" | grep -qE "\[($type_regex)\]"; then
        continue
      fi
    fi

    # Extract file path (last field)
    filepath=$(echo "$line" | awk '{print $NF}')

    # Validate file exists
    if [[ "$SKIP_VALIDATION" == "false" ]] && [[ ! -f "$filepath" ]]; then
      echo "WARNING: File not found: $filepath" >&2
      continue
    fi

    files_array+=("$filepath")
  done < "$MANIFEST_FILE"

  # Remove duplicates
  mapfile -t unique_files < <(printf '%s\n' "${files_array[@]}" | sort -u)

  # Output
  if [[ "$INJECT_CONTENT" == "true" ]]; then
    echo "# CFN Dependency Context: $MANIFEST"
    echo "# Generated: $(date -Iseconds)"
    echo "# Files: ${#unique_files[@]}"
    echo "# Priority: ${PRIORITY_FILTER:-all}"
    echo "# Type: ${TYPE_FILTER:-all}"
    echo ""

    for file in "${unique_files[@]}"; do
      if [[ -f "$file" ]]; then
        echo "============================================================================"
        echo "FILE: $file"
        echo "============================================================================"
        cat "$file"
        echo ""
        echo ""
      fi
    done
  else
    echo "# CFN Dependency Ingestion: $MANIFEST"
    echo "# Run these Read commands to load context:"
    echo "# Priority: ${PRIORITY_FILTER:-all}"
    echo "# Type: ${TYPE_FILTER:-all}"
    echo ""

    for file in "${unique_files[@]}"; do
      echo "Read: $file"
    done
  fi

  exit 0
fi

# =============================================================================
# DIAGRAM-BASED INGESTION (Legacy)
# =============================================================================
if [[ -n "$DIAGRAM" ]]; then
  case "$DIAGRAM" in
    cli)
      DIAGRAM_FILE="$PROJECT_ROOT/readme/CFN_LOOP_DEPENDENCY_DIAGRAM.txt"
      ;;
    docker)
      DIAGRAM_FILE="$PROJECT_ROOT/readme/CFN_LOOP_DOCKER_DEPENDENCY_DIAGRAM.txt"
      ;;
    *)
      echo "Error: Unknown diagram type: $DIAGRAM (use 'cli' or 'docker')" >&2
      exit 1
      ;;
  esac

  if [[ ! -f "$DIAGRAM_FILE" ]]; then
    echo "Error: Diagram not found: $DIAGRAM_FILE" >&2
    exit 1
  fi

  # Fall back to legacy script for diagram parsing
  exec "$SCRIPT_DIR/ingest-dependencies.sh" \
    ${PRIORITY_FILTER:+--priority "$PRIORITY_FILTER"} \
    ${TYPE_FILTER:+--type "$TYPE_FILTER"} \
    ${SKIP_VALIDATION:+--skip-validation}
fi
