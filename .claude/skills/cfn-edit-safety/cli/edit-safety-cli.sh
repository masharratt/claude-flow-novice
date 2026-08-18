#!/usr/bin/env bash
# Edit Safety CLI Interface
# Provides command-line interface for the edit safety workflow

set -euo pipefail

# Script configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"
EDIT_SAFETY_SCRIPT="$PARENT_DIR/edit-safety.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print functions
print_header() {
    echo -e "${BLUE}=== Edit Safety CLI ===${NC}"
    echo
}

print_success() {
    echo -e "${GREEN}✓ $*${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $*${NC}"
}

print_error() {
    echo -e "${RED}✗ $*${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $*${NC}"
}

# Validate dependencies
check_dependencies() {
    local missing=()

    for cmd in jq tar; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            missing+=("$cmd")
        fi
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        print_error "Missing dependencies: ${missing[*]}"
        print_info "Install missing dependencies and try again"
        exit 1
    fi
}

# Interactive edit mode
interactive_edit() {
    print_header
    print_info "Interactive Edit Safety Mode"
    echo

    # Get file path
    local file_path
    read -p "Enter file path to edit: " file_path

    if [[ ! -f "$file_path" ]]; then
        print_error "File does not exist: $file_path"
        exit 1
    fi

    # Show current content
    echo
    print_info "Current file content:"
    echo "----------------------------------------"
    head -20 "$file_path"
    echo "----------------------------------------"

    # Get edit command
    echo
    local edit_command
    read -p "Enter edit command (or 'editor' to open in $EDITOR): " edit_command

    if [[ "$edit_command" == "editor" ]]; then
        if [[ -z "${EDITOR:-}" ]]; then
            print_error "EDITOR environment variable not set"
            exit 1
        fi

        # Create backup before opening editor
        print_info "Creating backup before editing..."
        "$EDIT_SAFETY_SCRIPT" edit "$file_path" "true" "interactive-prep"

        # Open editor
        "$EDITOR" "$file_path"

        # Run post-edit validation
        print_info "Running post-edit validation..."
        if "$EDIT_SAFETY_SCRIPT" edit "$file_path" "true" "interactive-validation"; then
            print_success "Edit completed successfully"
        else
            print_warning "Validation detected issues"
            read -p "Would you like to rollback? (y/N): " rollback
            if [[ "$rollback" =~ ^[Yy]$ ]]; then
                "$EDIT_SAFETY_SCRIPT" rollback "$file_path"
                print_success "Rollback completed"
            fi
        fi
    else
        # Execute custom edit command
        print_info "Executing edit with safety checks..."
        if "$EDIT_SAFETY_SCRIPT" edit "$file_path" "$edit_command" "interactive"; then
            print_success "Edit completed successfully"
        else
            print_error "Edit failed or was rolled back"
            exit 1
        fi
    fi
}

# Batch edit mode
batch_edit() {
    local config_file="$1"

    print_header
    print_info "Batch Edit Mode"
    print_info "Using configuration: $config_file"
    echo

    if [[ ! -f "$config_file" ]]; then
        print_error "Configuration file does not exist: $config_file"
        exit 1
    fi

    # Parse and execute edits from config
    local edits_failed=0
    local edits_total=0

    while IFS= read -r line; do
        # Skip comments and empty lines
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "$line" ]] && continue

        # Parse edit specification
        local file_path
        local edit_command

        file_path=$(echo "$line" | jq -r '.file // empty')
        edit_command=$(echo "$line" | jq -r '.command // empty')

        if [[ -z "$file_path" || -z "$edit_command" ]]; then
            print_warning "Skipping invalid edit specification: $line"
            continue
        fi

        ((edits_total++))

        print_info "Processing: $file_path"
        if "$EDIT_SAFETY_SCRIPT" edit "$file_path" "$edit_command" "batch-$edits_total"; then
            print_success "✓ $file_path"
        else
            print_error "✗ $file_path"
            ((edits_failed++))
        fi
        echo
    done < <(jq -c '.[]' "$config_file")

    # Summary
    print_header
    print_info "Batch Edit Summary:"
    print_info "Total edits: $edits_total"
    if [[ $edits_failed -eq 0 ]]; then
        print_success "All edits completed successfully"
    else
        print_warning "$edits_failed edits failed"
        exit 1
    fi
}

# Show backup status
show_status() {
    print_header
    print_info "Edit Safety Status"
    echo

    # Show workspace info
    local workspace="${EDIT_SAFETY_WORKSPACE:-/tmp/edit-safety}"
    print_info "Workspace: $workspace"

    if [[ -d "$workspace" ]]; then
        local backup_count
        backup_count=$(find "$workspace" -name "backup-*.tar.gz" 2>/dev/null | wc -l)
        print_info "Active backups: $backup_count"

        # Show recent backups
        echo
        print_info "Recent Backups:"
        "$EDIT_SAFETY_SCRIPT" list | head -10
    else
        print_warning "Workspace not found"
    fi

    # Show disk usage
    echo
    print_info "Disk Usage:"
    if [[ -d "$workspace" ]]; then
        du -sh "$workspace" 2>/dev/null || print_warning "Could not calculate disk usage"
    fi
}

# Generate batch edit template
generate_template() {
    local output_file="$1"

    cat > "$output_file" << 'EOF'
[
  {
    "file": "/path/to/file1.txt",
    "command": "sed -i 's/old_text/new_text/g' file1.txt",
    "description": "Replace old_text with new_text"
  },
  {
    "file": "/path/to/file2.py",
    "command": "cp new_version.py file2.py",
    "description": "Update file2.py with new version"
  }
]
EOF

    print_success "Template generated: $output_file"
    print_info "Edit the file and run: $0 batch $output_file"
}

# Main CLI handler
main() {
    # Check dependencies
    check_dependencies

    # Ensure edit-safety script is executable
    chmod +x "$EDIT_SAFETY_SCRIPT"

    local command="${1:-}"
    shift || true

    case "$command" in
        "edit")
            if [[ $# -eq 0 ]]; then
                interactive_edit
            else
                # Direct edit mode
                "$EDIT_SAFETY_SCRIPT" edit "$@"
            fi
            ;;
        "rollback")
            "$EDIT_SAFETY_SCRIPT" rollback "$@"
            ;;
        "batch")
            if [[ $# -lt 1 ]]; then
                print_error "Usage: $0 batch <config.json>"
                exit 1
            fi
            batch_edit "$1"
            ;;
        "status")
            show_status
            ;;
        "list")
            "$EDIT_SAFETY_SCRIPT" list
            ;;
        "cleanup")
            "$EDIT_SAFETY_SCRIPT" cleanup
            ;;
        "template")
            local output_file="${1:-batch-edit-template.json}"
            generate_template "$output_file"
            ;;
        "help"|"-h"|"--help")
            cat << EOF
Edit Safety CLI - Command Line Interface for Safe File Editing

USAGE:
    $0 edit [file_path] [edit_command] [agent_id]
        Edit a file with safety checks. Omit arguments for interactive mode.

    $0 rollback <file_path>
        Rollback a file to its last backup.

    $0 batch <config.json>
        Execute multiple edits from a JSON configuration file.

    $0 status
        Show edit safety status and backup information.

    $0 list
        List all registered backups.

    $0 cleanup
        Clean up old backups and temporary files.

    $0 template [output_file]
        Generate a batch edit template file.

    $0 help
        Show this help message.

EXAMPLES:
    # Interactive edit mode
    $0 edit

    # Direct edit with command
    $0 edit /path/to/file.txt "sed -i 's/foo/bar/g'"

    # Batch edit from config
    $0 batch edits.json

    # Generate template
    $0 template my-edits.json

ENVIRONMENT:
    EDIT_SAFETY_WORKSPACE    Workspace directory (default: /tmp/edit-safety)
    EDITOR                  Default text editor for interactive mode

EOF
            ;;
        *)
            print_error "Unknown command: $command"
            print_info "Use '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Execute main function if script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi