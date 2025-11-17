#!/bin/bash

##############################################################################
# Pre-Edit Backup Script - Creates safe file backups before modifications
# Version: 1.0.0
##############################################################################

set -euo pipefail

# Function to create backup of a file before editing
create_backup() {
    local file_path="$1"
    local agent_id="${2:-unknown}"
    local project_root="${3:-$(pwd)}"

    # Validate inputs
    if [[ -z "$file_path" ]]; then
        echo "Error: File path is required" >&2
        exit 1
    fi

    # Check if file exists
    if [[ ! -f "$file_path" ]]; then
        echo "Warning: File does not exist: $file_path" >&2
        # Create empty backup path for new files
        echo "$project_root/.backups/$agent_id/new-file-$(date +%s)-$(echo "$file_path" | tr '/' '_' | tr ' ' '_')"
        return 0
    fi

    # Create backup directory structure
    local backup_dir="$project_root/.backups/$agent_id"
    local timestamp=$(date +%s)
    local file_hash=$(md5sum "$file_path" | cut -d' ' -f1)
    local backup_name="${timestamp}_${file_hash}"

    # Create full backup path
    local full_backup_path="$backup_dir/$backup_name"

    # Create backup directory
    mkdir -p "$full_backup_path"

    # Copy original file to backup location
    cp "$file_path" "$full_backup_path/original"

    # Store backup metadata
    cat > "$full_backup_path/metadata.json" << EOF
{
  "timestamp": "$timestamp",
  "agent_id": "$agent_id",
  "original_file": "$file_path",
  "file_hash": "$file_hash",
  "backup_path": "$full_backup_path",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

    # Create revert script
    cat > "$full_backup_path/revert.sh" << EOF
#!/bin/bash
# Revert script for $file_path
set -euo pipefail

echo "Reverting file: $file_path"
cp "$full_backup_path/original" "$file_path"
echo "✅ File reverted successfully"
EOF

    chmod +x "$full_backup_path/revert.sh"

    # Output backup path for caller
    echo "$full_backup_path"

    echo "✅ Backup created: $full_backup_path" >&2
}

# Main execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Script called directly
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 <file_path> [--agent-id <id>] [--project-root <path>]" >&2
        exit 1
    fi

    file_path="$1"
    agent_id="unknown"
    project_root="$(pwd)"

    # Parse optional arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --agent-id)
                agent_id="$2"
                shift 2
                ;;
            --project-root)
                project_root="$2"
                shift 2
                ;;
            *)
                # Skip unknown arguments
                shift
                ;;
        esac
    done

    create_backup "$file_path" "$agent_id" "$project_root"
fi