#!/usr/bin/env bash
# CFN Namespace Restructuring Script
# Version: 1.1.0
# Follows Claude Flow Novice namespace isolation guidelines

set -euo pipefail

# Repo root, derived from this script's own location so the script
# works from any checkout on any machine.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"

# Logging and output functions
log() {
    echo "[CFN RESTRUCTURE] $*" >&2
}

error() {
    echo "[ERROR] $*" >&2
    exit 1
}

# Configuration
BASE_DIR="$PROJECT_ROOT"
BACKUP_DIR="${BASE_DIR}/.claude/backups/namespace-restructure-$(date +%Y%m%d-%H%M%S)"
DRY_RUN=false
VERBOSE=false

# Parse arguments
SKIP_BACKUP=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dry-run)
            DRY_RUN=true
            ;;
        -v|--verbose)
            VERBOSE=true
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            ;;
        *)
            error "Unknown argument: $1"
            ;;
    esac
    shift
done

# Verbose logging
verbose_log() {
    if [[ "$VERBOSE" == "true" ]]; then
        log "$*"
    fi
}

# Dry run safe move
safe_move() {
    local src="$1"
    local dest="$2"

    if [[ ! -e "$src" ]]; then
        verbose_log "Source does not exist: $src"
        return 0
    fi

    verbose_log "Moving: $src → $dest"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would move $src to $dest"
        return 0
    fi

    mkdir -p "$(dirname "$dest")"
    mv "$src" "$dest"
}

# Dry run safe rename
safe_rename() {
    local path="$1"
    local new_name="$2"
    local full_path="$(dirname "$path")/$new_name"

    if [[ ! -e "$path" ]]; then
        verbose_log "Path does not exist: $path"
        return 0
    fi

    verbose_log "Renaming: $path → $full_path"

    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would rename $path to $full_path"
        return 0
    fi

    mv "$path" "$full_path"
}

# Dry run safe prefix rename
safe_prefix_rename() {
    local dir="$1"
    local prefix="$2"

    for file in "$dir"/*; do
        if [[ -f "$file" ]] && [[ "$(basename "$file")" != cfn-* ]]; then
            local new_filename="${prefix}$(basename "$file")"
            safe_rename "$file" "$new_filename"
        fi
    done
}

# Create backup
create_backup() {
    if [[ "$DRY_RUN" == "true" ]]; then
        log "[DRY RUN] Would create backup in $BACKUP_DIR"
        return 0
    fi

    log "Creating backup in $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    cp -R "${BASE_DIR}/.claude" "$BACKUP_DIR/"
}

# Main restructuring function
restructure_namespace() {
    log "Starting CFN namespace restructuring..."

    # 1. Move agents into cfn-dev-team/
    safe_move "${BASE_DIR}/.claude/agents/coordinators" "${BASE_DIR}/.claude/agents/cfn-dev-team/coordinators"
    safe_move "${BASE_DIR}/.claude/agents/developers" "${BASE_DIR}/.claude/agents/cfn-dev-team/developers"
    safe_move "${BASE_DIR}/.claude/agents/reviewers" "${BASE_DIR}/.claude/agents/cfn-dev-team/reviewers"
    safe_move "${BASE_DIR}/.claude/agents/testers" "${BASE_DIR}/.claude/agents/cfn-dev-team/testers"
    safe_rename "${BASE_DIR}/.claude/agents/agents-ignore" "${BASE_DIR}/.claude/agents/cfn-agents-ignore"

    # 2. Rename skills with cfn- prefix
    for skill_dir in "${BASE_DIR}/.claude/skills"/*; do
        if [[ -d "$skill_dir" ]]; then
            skill_name=$(basename "$skill_dir")
            if [[ "$skill_name" != cfn-* ]]; then
                safe_rename "$skill_dir" "cfn-$skill_name"
            fi
        fi
    done

    # 3. Rename hooks with cfn- prefix
    safe_prefix_rename "${BASE_DIR}/.claude/hooks" "cfn-"

    # 4. Rename data folder
    safe_move "${BASE_DIR}/.claude/data" "${BASE_DIR}/.claude/cfn-data"

    # 5. Move commands into cfn/ subfolder
    mkdir -p "${BASE_DIR}/.claude/commands/cfn"
    for cmd_file in "${BASE_DIR}/.claude/commands"/*.md; do
        safe_move "$cmd_file" "${BASE_DIR}/.claude/commands/cfn/"
    done

    # 6. Rename root CLAUDE.md
    safe_rename "${BASE_DIR}/CLAUDE.md" "${BASE_DIR}/CFN-CLAUDE.md"

    log "CFN namespace restructuring complete!"
}

# Run restructuring
if [[ "$SKIP_BACKUP" == "false" ]]; then
    create_backup
fi
restructure_namespace