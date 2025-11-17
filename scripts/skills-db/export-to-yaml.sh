#!/usr/bin/env bash
# ============================================================================
# Skills Database YAML Export Tool
# ============================================================================
# Exports Skills Database to human-readable YAML format for code review
# and cross-environment deployment.
#
# Usage:
#   ./export-to-yaml.sh [OPTIONS]
#
# Options:
#   --output=<file>          Output file (default: .claude/skills-database/snapshot.yaml)
#   --include-history        Include approval_history table
#   --include-usage          Include skill_usage_log data
#   --filter-category=<cat>  Export only specific category
#   --filter-status=<status> Export only active/deprecated/archived
#   --pretty                 Pretty-print with comments
#   --help                   Show this help message
# ============================================================================

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DB_PATH="${PROJECT_ROOT}/.claude/skills-database/skills.db"
DEFAULT_OUTPUT="${PROJECT_ROOT}/.claude/skills-database/snapshot.yaml"

OUTPUT_FILE="$DEFAULT_OUTPUT"
INCLUDE_HISTORY=0
INCLUDE_USAGE=0
FILTER_CATEGORY=""
FILTER_STATUS=""
PRETTY_PRINT=0

# ============================================================================
# Helper Functions
# ============================================================================

log_info() {
  echo "[INFO] $*" >&2
}

log_error() {
  echo "[ERROR] $*" >&2
}

log_success() {
  echo "[SUCCESS] $*" >&2
}

show_help() {
  sed -n '2,/^# ====/p' "$0" | sed 's/^# \?//'
  exit 0
}

# ============================================================================
# Parse Arguments
# ============================================================================

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --output=*)
        OUTPUT_FILE="${1#*=}"
        ;;
      --include-history)
        INCLUDE_HISTORY=1
        ;;
      --include-usage)
        INCLUDE_USAGE=1
        ;;
      --filter-category=*)
        FILTER_CATEGORY="${1#*=}"
        ;;
      --filter-status=*)
        FILTER_STATUS="${1#*=}"
        ;;
      --pretty)
        PRETTY_PRINT=1
        ;;
      --help|-h)
        show_help
        ;;
      *)
        log_error "Unknown option: $1"
        echo "Use --help for usage information"
        exit 1
        ;;
    esac
    shift
  done
}

# ============================================================================
# Validation
# ============================================================================

validate_environment() {
  # Check database exists
  if [[ ! -f "$DB_PATH" ]]; then
    log_error "Database not found: $DB_PATH"
    exit 1
  fi

  # Check sqlite3 available
  if ! command -v sqlite3 &> /dev/null; then
    log_error "sqlite3 command not found. Please install SQLite3."
    exit 1
  fi

  # Test database connection
  if ! sqlite3 "$DB_PATH" "SELECT 1;" &> /dev/null; then
    log_error "Cannot connect to database: $DB_PATH"
    exit 1
  fi

  # Check Python available for YAML generation
  if ! command -v python3 &> /dev/null; then
    log_error "python3 not found. Required for YAML generation."
    exit 1
  fi

  # Verify output directory exists or can be created
  local output_dir
  output_dir="$(dirname "$OUTPUT_FILE")"
  if [[ ! -d "$output_dir" ]]; then
    mkdir -p "$output_dir" || {
      log_error "Cannot create output directory: $output_dir"
      exit 1
    }
  fi
}

# ============================================================================
# YAML Generation
# ============================================================================

generate_yaml() {
  log_info "Exporting skills from database..."

  # Use Python to export directly to YAML
  python3 - "$DB_PATH" "$FILTER_CATEGORY" "$FILTER_STATUS" "$INCLUDE_HISTORY" "$INCLUDE_USAGE" "$OUTPUT_FILE" << 'PYTHON_EXPORT_SCRIPT'
import sqlite3
import json
import sys
from datetime import datetime

db_path = sys.argv[1]
filter_category = sys.argv[2] if sys.argv[2] else None
filter_status = sys.argv[3] if sys.argv[3] else None
include_history = sys.argv[4] == "1"
include_usage = sys.argv[5] == "1"
output_file = sys.argv[6]

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Export skills
skills_query = """
SELECT
  id, name, category, team, content_path, content_hash, tags,
  version, status, approval_level, approval_criteria,
  last_approved_by, last_approval_date, test_coverage,
  test_suite_path, required_test_pass_rate, phase4_pattern_id,
  generated_by, is_auto_generated, deprecation_note,
  replacement_id, owner, created_at, updated_at
FROM skills WHERE 1=1
"""

if filter_category:
    skills_query += f" AND category = '{filter_category}'"
if filter_status:
    skills_query += f" AND status = '{filter_status}'"

skills_query += " ORDER BY category, name;"

cursor.execute(skills_query)
skills = []
for row in cursor.fetchall():
    skill = dict(row)
    # Parse JSON fields
    if skill.get('tags'):
        try:
            skill['tags'] = json.loads(skill['tags'])
        except:
            skill['tags'] = []
    if skill.get('approval_criteria'):
        try:
            skill['approval_criteria'] = json.loads(skill['approval_criteria'])
        except:
            pass
    # Remove None values for cleaner YAML
    skill = {k: v for k, v in skill.items() if v is not None}
    skills.append(skill)

# Export agent mappings
cursor.execute("""
SELECT
  id, agent_type, skill_id, priority, required,
  conditions, tdd_condition, notes, enabled,
  created_at, updated_at
FROM agent_skill_mappings
WHERE enabled = 1
ORDER BY agent_type, priority;
""")

mappings = []
for row in cursor.fetchall():
    mapping = dict(row)
    # Parse JSON fields
    if mapping.get('conditions'):
        try:
            mapping['conditions'] = json.loads(mapping['conditions'])
        except:
            pass
    if mapping.get('tdd_condition'):
        try:
            mapping['tdd_condition'] = json.loads(mapping['tdd_condition'])
        except:
            pass
    # Remove None values
    mapping = {k: v for k, v in mapping.items() if v is not None}
    mappings.append(mapping)

# Export approval history (if requested)
approval_history = []
if include_history:
    cursor.execute("""
    SELECT
      id, skill_id, version, approval_level, approver,
      decision, reasoning, risk_assessment, test_results,
      approval_criteria_check, escalation_reason, escalated_to,
      escalation_timestamp, timestamp, review_duration_minutes
    FROM approval_history
    ORDER BY skill_id, timestamp DESC;
    """)

    for row in cursor.fetchall():
        history = dict(row)
        # Parse JSON fields
        for field in ['risk_assessment', 'test_results', 'approval_criteria_check']:
            if history.get(field):
                try:
                    history[field] = json.loads(history[field])
                except:
                    pass
        history = {k: v for k, v in history.items() if v is not None}
        approval_history.append(history)

# Export usage stats (if requested)
usage_stats = []
if include_usage:
    cursor.execute("""
    SELECT
      id, agent_id, agent_type, skill_id, task_id, phase,
      loaded_at, execution_time_ms, confidence_before,
      confidence_after, success_indicator, test_suite_executed,
      test_pass_rate
    FROM skill_usage_log
    ORDER BY loaded_at DESC
    LIMIT 1000;
    """)

    for row in cursor.fetchall():
        usage = dict(row)
        usage = {k: v for k, v in usage.items() if v is not None}
        usage_stats.append(usage)

conn.close()

# Build export data structure
export_data = {
    "version": "2.0",
    "exported_at": datetime.utcnow().isoformat() + "Z",
    "schema_version": 2,
    "database_path": ".claude/skills-database/skills.db",
    "export_metadata": {
        "filter_category": filter_category,
        "filter_status": filter_status,
        "total_skills": len(skills),
        "total_mappings": len(mappings),
        "includes_history": include_history,
        "includes_usage": include_usage
    },
    "skills": skills,
    "agent_skill_mappings": mappings
}

if include_history and approval_history:
    export_data["approval_history"] = approval_history

if include_usage and usage_stats:
    export_data["usage_statistics"] = usage_stats

# Simple YAML generation (can use pyyaml if available)
def to_yaml(obj, indent=0):
    """Convert Python object to YAML format"""
    if obj is None:
        return "null"
    elif isinstance(obj, bool):
        return "true" if obj else "false"
    elif isinstance(obj, (int, float)):
        return str(obj)
    elif isinstance(obj, str):
        # Handle strings with special characters
        if '\n' in obj or ':' in obj or '"' in obj:
            escaped = obj.replace('"', '\\"')
            return f'"{escaped}"'
        return obj
    elif isinstance(obj, list):
        if not obj:
            return "[]"
        result = []
        for item in obj:
            yaml_item = to_yaml(item, indent + 2)
            if isinstance(item, dict):
                # Dict in list needs proper formatting
                first_line = True
                for line in yaml_item.split('\n'):
                    if line.strip():
                        if first_line:
                            result.append(f"\n{' ' * indent}- {line.strip()}")
                            first_line = False
                        else:
                            result.append(f"\n{' ' * (indent + 2)}{line.strip()}")
            else:
                result.append(f"\n{' ' * indent}- {yaml_item}")
        return ''.join(result)
    elif isinstance(obj, dict):
        result = []
        for key, value in obj.items():
            yaml_value = to_yaml(value, indent + 2)
            if isinstance(value, (dict, list)) and value:
                if isinstance(value, list) and value and isinstance(value[0], dict):
                    result.append(f"\n{' ' * indent}{key}:{yaml_value}")
                elif isinstance(value, dict):
                    result.append(f"\n{' ' * indent}{key}:{yaml_value}")
                else:
                    result.append(f"\n{' ' * indent}{key}: {yaml_value}")
            else:
                result.append(f"\n{' ' * indent}{key}: {yaml_value}")
        return ''.join(result)
    return str(obj)

# Write YAML to file
with open(output_file, 'w') as f:
    yaml_output = to_yaml(export_data)
    f.write(yaml_output.lstrip() + '\n')

print(f"Exported {len(skills)} skills and {len(mappings)} mappings", file=sys.stderr)
PYTHON_EXPORT_SCRIPT

  log_success "Export complete: $OUTPUT_FILE"
}

# ============================================================================
# Validation and Summary
# ============================================================================

show_summary() {
  local skill_count mapping_count

  skill_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM skills WHERE 1=1 ${FILTER_CATEGORY:+AND category = '$FILTER_CATEGORY'} ${FILTER_STATUS:+AND status = '$FILTER_STATUS'};")
  mapping_count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM agent_skill_mappings WHERE enabled = 1;")

  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_info "Export Summary"
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log_info "Database:        $DB_PATH"
  log_info "Output file:     $OUTPUT_FILE"
  log_info "Skills exported: $skill_count"
  log_info "Mappings:        $mapping_count"
  [[ -n "$FILTER_CATEGORY" ]] && log_info "Category filter: $FILTER_CATEGORY"
  [[ -n "$FILTER_STATUS" ]] && log_info "Status filter:   $FILTER_STATUS"
  [[ $INCLUDE_HISTORY -eq 1 ]] && log_info "Approval history: Included"
  [[ $INCLUDE_USAGE -eq 1 ]] && log_info "Usage stats:     Included"
  log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# ============================================================================
# Main
# ============================================================================

main() {
  parse_args "$@"

  log_info "Skills Database YAML Export Tool"
  log_info "Database: $DB_PATH"

  validate_environment
  generate_yaml
  show_summary
}

main "$@"
