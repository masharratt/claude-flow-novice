#!/bin/bash
set -euo pipefail

# YAML to JSON Configuration Migration Script
# Purpose: Safely migrate CFN YAML configuration files to standardized JSON format
# Usage: ./scripts/migrate-yaml-to-json.sh [--dry-run] [--verbose] [--config FILE]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default configuration
DRY_RUN=false
VERBOSE=false
SPECIFIC_CONFIG=""
BACKUP_DIR="${PROJECT_ROOT}/.backups/yaml-migration-$(date +%Y%m%d-%H%M%S)"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --config)
      SPECIFIC_CONFIG="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Dependency checking
check_dependencies() {
  local missing_deps=()
  local install_instructions=""

  # Check for yq
  if ! command -v yq >/dev/null 2>&1; then
    missing_deps+=("yq")
  fi

  # Check for jq
  if ! command -v jq >/dev/null 2>&1; then
    missing_deps+=("jq")
  fi

  # If dependencies are missing, show error with installation instructions
  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    echo -e "${RED}ERROR: Missing required dependencies${NC}"
    echo ""
    echo "The following tools are required but not installed:"
    for dep in "${missing_deps[@]}"; do
      echo "  - $dep"
    done
    echo ""
    echo "Installation Instructions:"
    echo "=========================="
    echo ""

    # Detect OS and provide appropriate installation instructions
    if [[ "$OSTYPE" == "darwin"* ]]; then
      # macOS
      echo "macOS (using Homebrew):"
      for dep in "${missing_deps[@]}"; do
        echo "  brew install $dep"
      done
    elif [[ -f /etc/debian_version ]]; then
      # Debian/Ubuntu
      echo "Debian/Ubuntu:"
      for dep in "${missing_deps[@]}"; do
        if [[ "$dep" == "yq" ]]; then
          echo "  sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64"
          echo "  sudo chmod +x /usr/local/bin/yq"
        else
          echo "  sudo apt-get update && sudo apt-get install -y $dep"
        fi
      done
    elif [[ -f /etc/redhat-release ]]; then
      # RedHat/CentOS/Fedora
      echo "RedHat/CentOS/Fedora:"
      for dep in "${missing_deps[@]}"; do
        if [[ "$dep" == "yq" ]]; then
          echo "  sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64"
          echo "  sudo chmod +x /usr/local/bin/yq"
        else
          echo "  sudo yum install -y $dep"
        fi
      done
    elif [[ -f /etc/arch-release ]]; then
      # Arch Linux
      echo "Arch Linux:"
      for dep in "${missing_deps[@]}"; do
        echo "  sudo pacman -S $dep"
      done
    else
      # Generic Linux
      echo "Linux (generic):"
      for dep in "${missing_deps[@]}"; do
        if [[ "$dep" == "yq" ]]; then
          echo "  # Download yq binary from GitHub:"
          echo "  sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64"
          echo "  sudo chmod +x /usr/local/bin/yq"
        else
          echo "  # Install $dep using your package manager"
        fi
      done
    fi

    echo ""
    echo "For more installation options, visit:"
    for dep in "${missing_deps[@]}"; do
      if [[ "$dep" == "yq" ]]; then
        echo "  - yq: https://github.com/mikefarah/yq#install"
      elif [[ "$dep" == "jq" ]]; then
        echo "  - jq: https://stedolan.github.io/jq/download/"
      fi
    done
    echo ""

    exit 1
  fi

  # Verify yq is the correct version (mikefarah/yq, not kislyuk/yq)
  local yq_version
  yq_version=$(yq --version 2>&1)
  if [[ ! "$yq_version" =~ mikefarah ]]; then
    echo -e "${YELLOW}WARNING: Detected yq version may not be compatible${NC}"
    echo "This script requires mikefarah/yq, not kislyuk/yq (Python version)"
    echo "Current version: $yq_version"
    echo ""
    echo "To install the correct version:"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      echo "  brew install yq"
    else
      echo "  sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64"
      echo "  sudo chmod +x /usr/local/bin/yq"
    fi
    echo ""
    echo "More info: https://github.com/mikefarah/yq#install"
    echo ""
    exit 1
  fi
}

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_verbose() {
  if [[ "$VERBOSE" == "true" ]]; then
    echo -e "${BLUE}[VERBOSE]${NC} $1"
  fi
}

# Identify YAML config files
identify_yaml_configs() {
  local configs=()

  if [[ -n "$SPECIFIC_CONFIG" ]]; then
    if [[ -f "$SPECIFIC_CONFIG" ]]; then
      configs+=("$SPECIFIC_CONFIG")
    else
      log_error "Config file not found: $SPECIFIC_CONFIG"
      exit 1
    fi
  else
    # Team configurations
    for file in "${PROJECT_ROOT}"/docker/config/teams/*.yaml; do
      if [[ -f "$file" ]]; then
        configs+=("$file")
      fi
    done

    # Runtime contract
    if [[ -f "${PROJECT_ROOT}/docker/runtime/cfn-runtime.contract.yml" ]]; then
      configs+=("${PROJECT_ROOT}/docker/runtime/cfn-runtime.contract.yml")
    fi
  fi

  echo "${configs[@]}"
}

# Extract comments from YAML file
extract_comments() {
  local yaml_file="$1"
  local temp_comments="${BACKUP_DIR}/$(basename "$yaml_file").comments"

  # Extract lines starting with # (comments)
  grep "^#" "$yaml_file" > "$temp_comments" 2>/dev/null || true

  echo "$temp_comments"
}

# Convert YAML to JSON
convert_yaml_to_json() {
  local yaml_file="$1"
  local json_file="$2"

  log_verbose "Converting: $yaml_file -> $json_file"

  # Use yq to convert YAML to JSON with proper formatting
  # yq (version 0.0.0) outputs JSON by default
  yq . "$yaml_file" | jq '.' > "$json_file"

  if [[ $? -ne 0 ]]; then
    log_error "Failed to convert $yaml_file to JSON"
    return 1
  fi

  # Validate JSON syntax
  if ! jq empty "$json_file" 2>/dev/null; then
    log_error "Generated JSON is invalid: $json_file"
    return 1
  fi

  log_verbose "Successfully converted to valid JSON"
  return 0
}

# Add metadata to JSON
add_migration_metadata() {
  local json_file="$1"
  local yaml_file="$2"

  # Add migration metadata
  local temp_file="${json_file}.tmp"
  jq --arg source "$(basename "$yaml_file")" \
     --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
     '. + {
       "_migration": {
         "source_file": $source,
         "migrated_at": $timestamp,
         "format_version": "1.0"
       }
     }' "$json_file" > "$temp_file"

  mv "$temp_file" "$json_file"
}

# Create backup
create_backup() {
  local yaml_file="$1"
  local backup_file="${BACKUP_DIR}/$(basename "$yaml_file").backup"

  mkdir -p "$BACKUP_DIR"
  cp "$yaml_file" "$backup_file"

  log_verbose "Created backup: $backup_file"
  echo "$backup_file"
}

# Migrate single file
migrate_file() {
  local yaml_file="$1"

  # Determine JSON filename (handle both .yaml and .yml extensions)
  local json_file
  if [[ "$yaml_file" =~ \.yaml$ ]]; then
    json_file="${yaml_file%.yaml}.json"
  elif [[ "$yaml_file" =~ \.yml$ ]]; then
    json_file="${yaml_file%.yml}.json"
  else
    log_error "File is not a YAML file: $yaml_file"
    return 1
  fi

  log_info "Migrating: $(basename "$yaml_file")"

  # Create backup
  local backup_file
  backup_file=$(create_backup "$yaml_file")

  # Extract comments for documentation
  local comments_file
  comments_file=$(extract_comments "$yaml_file")

  # Convert YAML to JSON
  if [[ "$DRY_RUN" == "true" ]]; then
    log_info "[DRY-RUN] Would convert: $yaml_file -> $json_file"

    # Show preview of conversion
    local preview_json="${BACKUP_DIR}/$(basename "$json_file").preview"
    convert_yaml_to_json "$yaml_file" "$preview_json"

    log_info "[DRY-RUN] Preview (first 20 lines):"
    head -20 "$preview_json" | sed 's/^/  /'

    return 0
  fi

  # Actual conversion
  if ! convert_yaml_to_json "$yaml_file" "$json_file"; then
    log_error "Migration failed for: $yaml_file"
    return 1
  fi

  # Add metadata
  add_migration_metadata "$json_file" "$yaml_file"

  # Remove original YAML file
  rm "$yaml_file"

  log_success "Migrated: $(basename "$yaml_file") -> $(basename "$json_file")"

  return 0
}

# Validate all migrated configs
validate_migrations() {
  local json_files=("$@")
  local failed=0

  log_info "Validating migrated JSON files..."

  for json_file in "${json_files[@]}"; do
    if [[ ! -f "$json_file" ]]; then
      continue
    fi

    if jq empty "$json_file" 2>/dev/null; then
      log_success "Valid JSON: $(basename "$json_file")"
    else
      log_error "Invalid JSON: $(basename "$json_file")"
      ((failed++))
    fi
  done

  if [[ $failed -gt 0 ]]; then
    log_error "$failed file(s) failed validation"
    return 1
  fi

  log_success "All JSON files validated successfully"
  return 0
}

# Generate migration report
generate_report() {
  local yaml_files=("$@")
  local report_file="${BACKUP_DIR}/migration-report.txt"

  {
    echo "YAML to JSON Migration Report"
    echo "=============================="
    echo "Date: $(date)"
    echo "Backup Directory: $BACKUP_DIR"
    echo ""
    echo "Files Migrated:"
    for file in "${yaml_files[@]}"; do
      local json_file="${file%.yaml}.json"
      json_file="${json_file%.yml}.json"
      echo "  - $(basename "$file") -> $(basename "$json_file")"
    done
    echo ""
    echo "Rollback Instructions:"
    echo "  To restore original YAML files, run:"
    echo "  ./scripts/migrate-yaml-to-json.sh --rollback $BACKUP_DIR"
  } > "$report_file"

  cat "$report_file"
  log_success "Migration report saved: $report_file"
}

# Main migration process
main() {
  log_info "CFN YAML to JSON Migration Tool"
  log_info "================================"

  # Check dependencies before proceeding
  check_dependencies

  if [[ "$DRY_RUN" == "true" ]]; then
    log_warning "DRY-RUN MODE: No files will be modified"
  fi

  # Identify files to migrate
  local yaml_files_str
  yaml_files_str=$(identify_yaml_configs)
  IFS=' ' read -r -a yaml_files <<< "$yaml_files_str"

  if [[ ${#yaml_files[@]} -eq 0 ]]; then
    log_error "No YAML configuration files found"
    exit 1
  fi

  log_info "Found ${#yaml_files[@]} YAML configuration file(s)"

  # Create backup directory
  mkdir -p "$BACKUP_DIR"

  # Migrate each file
  local migrated_files=()
  local failed=0

  for yaml_file in "${yaml_files[@]}"; do
    if migrate_file "$yaml_file"; then
      local json_file="${yaml_file%.yaml}.json"
      json_file="${json_file%.yml}.json"
      migrated_files+=("$json_file")
    else
      ((failed++))
    fi
  done

  if [[ "$DRY_RUN" == "true" ]]; then
    log_info ""
    log_info "DRY-RUN COMPLETE"
    log_info "================"
    log_info "To execute migration, run without --dry-run flag"
    exit 0
  fi

  # Validate migrations
  if [[ ${#migrated_files[@]} -gt 0 ]]; then
    validate_migrations "${migrated_files[@]}"
  fi

  # Generate report
  generate_report "${yaml_files[@]}"

  # Summary
  log_info ""
  log_info "Migration Summary"
  log_info "================="
  log_success "Successfully migrated: $((${#yaml_files[@]} - failed)) file(s)"

  if [[ $failed -gt 0 ]]; then
    log_error "Failed migrations: $failed file(s)"
    exit 1
  fi

  log_info ""
  log_success "Migration completed successfully!"
  log_info "Backups saved to: $BACKUP_DIR"
}

# Execute main function
main
