#!/bin/bash

# CFN Expert Update Skill
# Updates CFN system expert agent with relevant git commits

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
AGENT_FILE="$PROJECT_ROOT/.claude/agents/custom/cfn-system-expert.md"
STATE_FILE="$PROJECT_ROOT/.claude/state/cfn-expert-last-commit"
BACKUP_DIR="$PROJECT_ROOT/.claude/backups/cfn-expert"

# Ensure directories exist
mkdir -p "$(dirname "$STATE_FILE")"
mkdir -p "$BACKUP_DIR"

# Parse arguments
DRY_RUN=false
FORCE=false
SINCE_COMMIT=""

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
        *)
            echo "❌ Unknown parameter: $1"
            echo "Usage: $0 [--dry-run] [--force] [--since=commit_hash]"
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
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

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
    echo "$commit_hash" > "$STATE_FILE"
    echo "$timestamp" >> "$STATE_FILE"
    log_success "📝 Last commit updated: $commit_hash"
}

# Create backup of agent file
create_backup() {
    if [[ -f "$AGENT_FILE" ]]; then
        local timestamp=$(date +%Y%m%d_%H%M%S)
        local backup_file="$BACKUP_DIR/${timestamp}_cfn-system-expert.md"
        cp "$AGENT_FILE" "$backup_file"
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
    commit_msg=$(git log --format="%s" -n 1 "$commit_hash")
    commit_files=$(git show --name-only --format="" "$commit_hash" | tr '\n' ' ')

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
        if echo "$combined_check" | grep -qE "$pattern"; then
            echo "high"
            return
        fi
    done

    # Medium priority
    for pattern in "${medium_patterns[@]}"; do
        if echo "$combined_check" | grep -qE "$pattern"; then
            echo "medium"
            return
        fi
    done

    # Low priority
    for pattern in "${low_patterns[@]}"; do
        if echo "$combined_check" | grep -qE "$pattern"; then
            echo "low"
            return
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

    commit_msg=$(git log --format="%s%n%b" -n 1 "$commit_hash")
    commit_diff=$(git show "$commit_hash" -- . | head -200)

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
        echo "$new_knowledge" | head -20
        log_info "🔍 ... (truncated in dry run)"
        return
    fi

    # Create backup if not already created
    if [[ -z "$backup_file" ]]; then
        backup_file=$(create_backup)
    fi

    # Find insertion point (before "---" at end of file)
    local temp_file=$(mktemp)
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
    mv "$temp_file" "$AGENT_FILE"
    log_success "🔄 Expert agent updated successfully"
}

# Main execution
main() {
    log_info "🚀 Starting CFN expert update..."

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
    local last_commit=$(get_last_commit)
    local current_head=$(git rev-parse HEAD)

    if [[ "$last_commit" == "$current_head" ]] && [[ "$FORCE" != "true" ]]; then
        log_info "ℹ️  No new commits to scan"
        return
    fi

    log_info "🔍 Scanning commits since ${last_commit:0:8}..."

    # Get commits since last scan
    local commits
    if [[ "$FORCE" == "true" ]]; then
        commits=$(git log --format="%H" --since="2 weeks ago" | tac)
    else
        commits=$(git log --format="%H" "$last_commit..HEAD" | tac)
    fi

    if [[ -z "$commits" ]]; then
        log_info "ℹ️  No new commits found"
        return
    fi

    local commit_count=$(echo "$commits" | wc -l)
    log_info "📋 Found $commit_count commits to analyze"

    # Process commits
    local relevant_commits=0
    local total_knowledge=""
    local backup_file=""

    while read -r commit_hash; do
        [[ -z "$commit_hash" ]] && continue

        local relevance=$(is_relevant_commit "$commit_hash")

        if [[ "$relevance" != "none" ]]; then
            ((relevant_commits++))
            log_info "🎯 Relevant commit found (${relevance}): ${commit_hash:0:8}"

            local knowledge=$(extract_commit_knowledge "$commit_hash" "$relevance")
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
        echo "Sample of updates that would be applied:"
        echo "$total_knowledge" | head -50
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