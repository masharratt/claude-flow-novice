#!/bin/bash

# Post-Edit Hook for CFN Retrospective Skills

# Validate script permissions
validate_script_permissions() {
    local script_path="$1"
    if [[ ! -x "$script_path" ]]; then
        echo "❌ Script is not executable: $script_path"
        chmod +x "$script_path" && echo "✅ Made script executable: $script_path"
    fi
}

# Basic JSON validation
validate_json_syntax() {
    local file_path="$1"
    if ! jq empty "$file_path" >/dev/null 2>&1; then
        echo "❌ Invalid JSON syntax in $file_path"
        return 1
    fi
    echo "✅ JSON syntax valid: $file_path"
}

# Specific validation for retrospective components
validate_retrospective_skills() {
    local base_path="/mnt/c/Users/masha/Documents/claude-flow-novice/.claude/skills"
    local skills=(
        "pattern-extraction/extract-patterns.sh"
        "playbook-auto-update/auto-update-playbook.sh"
        "improvement-recommender/recommend-improvements.sh"
        "retrospective-report/generate-report.sh"
    )

    for skill in "${skills[@]}"; do
        full_path="${base_path}/${skill}"

        # Validate script permissions
        validate_script_permissions "$full_path"

        # Run basic validation for shell scripts
        if ! bash -n "$full_path" >/dev/null 2>&1; then
            echo "❌ Syntax error in shell script: $skill"
            return 1
        fi
    done

    echo "✅ All retrospective skill scripts validated successfully"
}

# Validate playbook JSON
validate_playbook() {
    local playbook_path="/mnt/c/Users/masha/Documents/claude-flow-novice/docs/PLAYBOOK.json"
    validate_json_syntax "$playbook_path"
}

# Main validation function
main() {
    local edited_file="$1"
    echo "🔍 Validating edited file: $edited_file"

    # Determine validation based on file path
    case "$edited_file" in
        *".claude/skills/pattern-extraction"* | \
        *".claude/skills/playbook-auto-update"* | \
        *".claude/skills/improvement-recommender"* | \
        *".claude/skills/retrospective-report"* | \
        */PLAYBOOK.json)
            validate_retrospective_skills
            validate_playbook
            ;;
        *)
            echo "✅ No specific validation required for this file"
            exit 0
            ;;
    esac
}

# Run validation
main "$1"