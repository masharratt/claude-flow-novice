#!/usr/bin/env bash

# CFN Expert Update Skill
# Updates CFN system expert agent with relevant git commits

set -euo pipefail

# Check for required commands
check_required_commands() {
    local missing_commands=()
    
    for cmd in git date grep head tail mktemp mv cp wc; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing_commands+=("$cmd")
        fi
    done
    
    if [[ ${#missing_commands[@]} -gt 0 ]]; then
        echo "❌ Missing required commands: ${missing_commands[*]}" >&2
        echo "Please install the missing commands and try again." >&2
        exit 1
    fi
}

# Find project root by searching upward from script location
find_project_root() {
    local start_dir="$1"
    local current_dir="$start_dir"
    
    while [[ "$current_dir" != "/" ]]; do
        # Check for .git directory
        if [[ -d "$current_dir/.git" ]]; then
            echo "$current_dir"
            return 0
        fi
        
        # Check for CLAUDE.md file
        if [[ -f "$current_dir/CLAUDE.md" ]]; then
            echo "$current_dir"
            return 0
        fi
        
        # Move up one directory
        current_dir="$(dirname "$current_dir")"
    done
    
    echo "❌ Could not find project root (no .git directory or CLAUDE.md found)" >&2
    exit 1
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(find_project_root "$SCRIPT_DIR")"
AGENT_FILE="$PROJECT_ROOT/.claude/agents/custom/cfn-system-expert.md"
STATE_FILE="$PROJECT_ROOT/.claude/state/cfn-expert-last-commit"
BACKUP_DIR="$PROJECT_ROOT/.claude/backups/cfn-expert"

# Ensure directories exist with better error handling
ensure_directory() {
    local dir_path="$1"
    local dir_name="$2"
    
    if ! mkdir -p "$dir_path" 2>/dev/null; then
        echo "❌ Failed to create $dir_name directory: $dir_path" >&2
        echo "Please check permissions and try again." >&2
        exit 1
    fi
}

ensure_directory "$(dirname "$STATE_FILE")" "state"
ensure_directory "$BACKUP_DIR" "backup"

# Parse arguments
DRY_RUN=false
FORCE=false
SINCE_COMMIT=""
DEBUG=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --since=*)
            SINCE_COMMIT="${1#*=}"
            shift
            ;;
        --debug)
            DEBUG=true
            shift
            ;;
        *)
            echo "❌ Unknown parameter: $1" >&2
            echo "Usage: $0 [--dry-run] [--force] [--since=commit_hash] [--debug]" >&2
            exit 1
            ;;
    esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}" >&2; }
log_success() { echo -e "${GREEN}✅ $1${NC}" >&2; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}" >&2; }
log_error() { echo -e "${RED}❌ $1${NC}" >&2; }
log_debug() { 
    if [[ "$DEBUG" == "true" ]]; then
        echo -e "${BLUE}🐛 DEBUG: $1${NC}" >&2
    fi
}

# Get last scanned commit
get_last_commit() {
    if [[ -n "$SINCE_COMMIT" ]]; then
        echo "$SINCE_COMMIT"
    elif [[ -f "$STATE_FILE" ]] && ! $FORCE; then
        head -n1 "$STATE_FILE"
    else
        # Default to 10 commits back if no tracking
        git log --format="%H" -n 10 | tail -n1
    fi
}

# Update last commit tracking
update_last_commit() {
    local commit_hash="$1"
    local timestamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    
    if ! echo "$commit_hash" > "$STATE_FILE" 2>/dev/null; then
        log_error "Failed to update state file: $STATE_FILE"
        exit 1
    fi
    
    if ! echo "$timestamp" >> "$STATE_FILE" 2>/dev/null; then
        log_error "Failed to update state file: $STATE_FILE"
        exit 1
    fi
    
    log_success "📝 Last commit updated: $commit_hash"
}

# Create backup of agent file
create_backup() {
    if [[ -f "$AGENT_FILE" ]]; then
        local timestamp=$(date +%Y%m%d_%H%M%S)
        local backup_file="$BACKUP_DIR/${timestamp}_cfn-system-expert.md"
        
        if ! cp "$AGENT_FILE" "$backup_file" 2>/dev/null; then
            log_error "Failed to create backup: $backup_file"
            exit 1
        fi
        
        log_success "📁 Backup created: $backup_file"
        echo "$backup_file"
    fi
}

# Check if commit is relevant to CFN system
is_relevant_commit() {
    local commit_hash="$1"
    local commit_files
    local commit_msg

    # Get commit message and files
    commit_msg=$(git log --format="%s" -n 1 "$commit_hash" 2>/dev/null) || {
        log_debug "Failed to get commit message for $commit_hash"
        echo "none"
        return 1
    }
    commit_files=$(git show --name-only --format="" "$commit_hash" 2>/dev/null | tr '\n' ' ') || {
        log_debug "Failed to get commit files for $commit_hash"
        echo "none"
        return 1
    }

    log_debug "Analyzing commit $commit_hash: $commit_msg"

    # High relevance patterns
    local high_patterns=(
        "CLAUDE\.md"
        "\.claude/commands/cfn/"
        "cfn-loop"
        "CFN Loop"
        "claude-flow-novice"
    )

    # Medium relevance patterns
    local medium_patterns=(
        "\.claude/skills/cfn-"
        "agent.*coordination"
        "redis.*coordination"
        "cost.*optimization"
        "adaptive.*context"
        "consensus"
        "swarm"
    )

    # Low relevance patterns
    local low_patterns=(
        "\.claude/agents/cfn-"
        "performance"
        "optimization"
        "debugging"
        "troubleshooting"
    )

    # Check relevance
    local relevance=0
    local combined_check="$commit_msg $commit_files"

    # High priority (always relevant)
    for pattern in "${high_patterns[@]}"; do
        if echo "$combined_check" | grep -qE "$pattern" 2>/dev/null; then
            log_debug "High relevance match: $pattern"
            echo "high"
            return 0
        fi
    done

    # Medium priority
    for pattern in "${medium_patterns[@]}"; do
        if echo "$combined_check" | grep -qE "$pattern" 2>/dev/null; then
            log_debug "Medium relevance match: $pattern"
            echo "medium"
            return 0
        fi
    done

    # Low priority
    for pattern in "${low_patterns[@]}"; do
        if echo "$combined_check" | grep -qE "$pattern" 2>/dev/null; then
            log_debug "Low relevance match: $pattern"
            echo "low"
            return 0
        fi
    done

    echo "none"
}

# Extract knowledge from commit
extract_commit_knowledge() {
    local commit_hash="$1"
    local relevance="$2"
    local commit_msg
    local commit_diff
    local knowledge=""

    commit_msg=$(git log --format="%s%n%b" -n 1 "$commit_hash" 2>/dev/null) || {
        log_debug "Failed to get commit details for $commit_hash"
        return 1
    }
    commit_diff=$(git show "$commit_hash" -- . 2>/dev/null | head -200) || {
        log_debug "Failed to get commit diff for $commit_hash"
        return 1
    }

    log_debug "Extracting knowledge from $commit_hash with relevance: $relevance"

    case "$relevance" in
        "high")
            knowledge="# HIGH PRIORITY UPDATE
Commit: $commit_hash
Message: $commit_msg

## System Changes
$commit_diff

## Impact
This commit contains critical system updates that affect CFN Loop methodology, commands, or core rules.
"
            ;;
        "medium")
            knowledge="# MEDIUM PRIORITY UPDATE
Commit: $commit_hash
Message: $commit_msg

## Process Changes
$commit_diff

## Impact
This commit updates coordination patterns, skills, or cost optimization strategies.
"
            ;;
        "low")
            knowledge="# LOW PRIORITY UPDATE
Commit: $commit_hash
Message: $commit_msg

## Informational Changes
$commit_diff

## Impact
This commit contains improvements or additions that may be useful for reference.
"
            ;;
    esac

    echo "$knowledge"
}

# Update agent with new knowledge
update_agent() {
    local new_knowledge="$1"
    local backup_file="$2"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "🔍 DRY RUN: Would update agent with new knowledge"
        echo "$new_knowledge" | head -20 >&2
        log_info "🔍 ... (truncated in dry run)"
        return
    fi

    # Create backup if not already created
    if [[ -z "$backup_file" ]]; then
        backup_file=$(create_backup)
    fi

    # Find insertion point (before "---" at end of file)
    local temp_file
    if ! temp_file=$(mktemp 2>/dev/null); then
        log_error "Failed to create temporary file"
        exit 1
    fi
    
    local inserted=false

    while IFS= read -r line; do
        echo "$line" >> "$temp_file"

        # Insert new knowledge before the closing ---
        if [[ "$line" == "---" ]] && [[ "$inserted" == "false" ]]; then
            echo "" >> "$temp_file"
            echo "$new_knowledge" >> "$temp_file"
            echo "" >> "$temp_file"
            inserted=true
        fi
    done < "$AGENT_FILE"

    # Move temp file to agent location
    if ! mv "$temp_file" "$AGENT_FILE" 2>/dev/null; then
        log_error "Failed to update agent file"
        rm -f "$temp_file"
        exit 1
    fi
    
    log_success "🔄 Expert agent updated successfully"
}

# Main execution
main() {
    # Check required commands first
    check_required_commands
    
    log_info "🚀 Starting CFN expert update..."
    log_info "📍 Project root: $PROJECT_ROOT"
    log_info "📍 Script location: $SCRIPT_DIR"

    # Validate we're in a git repo
    if ! git rev-parse --git-dir >/dev/null 2>&1; then
        log_error "Not in a git repository"
        exit 1
    fi

    # Check if agent file exists
    if [[ ! -f "$AGENT_FILE" ]]; then
        log_error "CFN system expert agent not found: $AGENT_FILE"
        exit 1
    fi

    # Get commit range
    local last_commit
    if ! last_commit=$(get_last_commit); then
        log_error "Failed to get last commit"
        exit 1
    fi
    
    local current_head
    if ! current_head=$(git rev-parse HEAD 2>/dev/null); then
        log_error "Failed to get current HEAD"
        exit 1
    fi

    if [[ "$last_commit" == "$current_head" ]] && [[ "$FORCE" != "true" ]]; then
        log_info "ℹ️  No new commits to scan"
        return
    fi

    log_info "🔍 Scanning commits since ${last_commit:0:8}..."

    # Get commits since last scan
    local commits
    if [[ "$FORCE" == "true" ]]; then
        if ! commits=$(git log --format="%H" --since="2 weeks ago" 2>/dev/null | tac); then
            log_error "Failed to get commit history"
            exit 1
        fi
    else
        if ! commits=$(git log --format="%H" "$last_commit..HEAD" 2>/dev/null | tac); then
            log_error "Failed to get commit history"
            exit 1
        fi
    fi

    if [[ -z "$commits" ]]; then
        log_info "ℹ️  No new commits found"
        return
    fi

    local commit_count
    commit_count=$(echo "$commits" | wc -l)
    log_info "📋 Found $commit_count commits to analyze"

    # Process commits
    local relevant_commits=0
    local total_knowledge=""
    local backup_file=""

    while read -r commit_hash; do
        [[ -z "$commit_hash" ]] && continue

        local relevance
        if ! relevance=$(is_relevant_commit "$commit_hash" 2>/dev/null); then
            log_warning "Failed to analyze commit ${commit_hash:0:8}, skipping"
            continue
        fi

        if [[ "$relevance" != "none" ]]; then
            relevant_commits=$((relevant_commits + 1))
            log_info "🎯 Relevant commit found (${relevance}): ${commit_hash:0:8}"

            local knowledge
            if ! knowledge=$(extract_commit_knowledge "$commit_hash" "$relevance" 2>/dev/null); then
                log_warning "Failed to extract knowledge from commit ${commit_hash:0:8}, skipping"
                continue
            fi
            total_knowledge="${total_knowledge}${knowledge}"$'\n'
        fi
    done <<< "$commits"

    # Report results
    if [[ "$relevant_commits" == "0" ]]; then
        log_info "ℹ️  No CFN-relevant changes found"
        return
    fi

    log_info "📊 Found $relevant_commits/$commit_count relevant commits"

    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "🔍 DRY RUN MODE - No changes will be applied"
        log_info "💡 Run without --dry-run to apply updates"
        echo ""
        echo "Sample of updates that would be applied:" >&2
        echo "$total_knowledge" | head -50 >&2
        return
    fi

    # Create backup before updating
    backup_file=$(create_backup)

    # Update agent with new knowledge
    update_agent "$total_knowledge" "$backup_file"

    # Update tracking
    update_last_commit "$current_head"

    log_success "🎉 Update complete!"
    log_info "📊 Processed $relevant_commits relevant commits"
    log_info "📁 Backup available: $backup_file"
}

# Execute main function
main "$@"