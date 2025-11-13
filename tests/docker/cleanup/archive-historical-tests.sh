#!/usr/bin/env bash
# Phase 2: Archive Historical Tests
# Archives 7 historical test files (4 marketing + 3 Sprint 5) to tests/archive/historical/
# with restoration documentation and quarterly deletion policy

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../" && pwd)"
ARCHIVE_DIR="${PROJECT_ROOT}/tests/archive/historical"
BACKUP_DIR="${PROJECT_ROOT}/.backups/test-archival-$(date +%s)"
DRY_RUN="${DRY_RUN:-true}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Test files to archive (relative to PROJECT_ROOT)
declare -a TESTS_TO_ARCHIVE=(
    # Marketing tests (4 files)
    "tests/integration/marketing-analytics-data-test.sh"
    "tests/integration/marketing-crm-contacts-test.sh"
    "tests/integration/marketing-email-campaigns-test.sh"
    "tests/integration/marketing-social-publishing-test.sh"

    # Sprint 5 tests (3 files)
    "tests/cfn-v3/test-sprint-5-functions-unix.sh"
    "tests/cfn-v3/test-sprint-5-functions.sh"
    "tests/cfn-v3/test-sprint-5-integration.sh"
)

# Archive reasons
declare -A ARCHIVE_REASONS=(
    ["tests/integration/marketing-analytics-data-test.sh"]="Historical marketing feature test - no longer maintained"
    ["tests/integration/marketing-crm-contacts-test.sh"]="Historical marketing feature test - no longer maintained"
    ["tests/integration/marketing-email-campaigns-test.sh"]="Historical marketing feature test - no longer maintained"
    ["tests/integration/marketing-social-publishing-test.sh"]="Historical marketing feature test - no longer maintained"
    ["tests/cfn-v3/test-sprint-5-functions-unix.sh"]="Sprint 5 completed - superseded by newer test architecture"
    ["tests/cfn-v3/test-sprint-5-functions.sh"]="Sprint 5 completed - superseded by newer test architecture"
    ["tests/cfn-v3/test-sprint-5-integration.sh"]="Sprint 5 completed - superseded by newer test architecture"
)

# Counters
ARCHIVED_COUNT=0
SKIPPED_COUNT=0
ERROR_COUNT=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

# Create archive directory structure
setup_archive_directory() {
    log_info "Setting up archive directory: ${ARCHIVE_DIR}"

    if [ "$DRY_RUN" = "true" ]; then
        log_warning "[DRY RUN] Would create directory: ${ARCHIVE_DIR}"
    else
        mkdir -p "${ARCHIVE_DIR}"
        log_success "Archive directory created"
    fi
}

# Create backup of files before archival
create_backup() {
    local file="$1"
    local full_path="${PROJECT_ROOT}/${file}"

    if [ ! -f "$full_path" ]; then
        return 1
    fi

    if [ "$DRY_RUN" = "true" ]; then
        log_warning "[DRY RUN] Would backup: ${file}"
    else
        mkdir -p "${BACKUP_DIR}/$(dirname "$file")"
        cp "$full_path" "${BACKUP_DIR}/${file}"
        log_success "Backed up: ${file}"
    fi

    return 0
}

# Archive a single test file
archive_test() {
    local file="$1"
    local full_path="${PROJECT_ROOT}/${file}"
    local archive_path="${ARCHIVE_DIR}/$(basename "$file")"

    log_info "Processing: ${file}"

    # Check if file exists
    if [ ! -f "$full_path" ]; then
        log_warning "File not found, skipping: ${file}"
        ((SKIPPED_COUNT++)) || true
        return 1
    fi

    # Create backup
    if ! create_backup "$file"; then
        log_error "Failed to create backup for: ${file}"
        ((ERROR_COUNT++)) || true
        return 1
    fi

    # Archive the file
    if [ "$DRY_RUN" = "true" ]; then
        log_warning "[DRY RUN] Would archive: ${file} -> ${archive_path}"
        log_warning "[DRY RUN] Would remove: ${full_path}"
    else
        cp "$full_path" "$archive_path"
        rm "$full_path"
        log_success "Archived: ${file}"
    fi

    ((ARCHIVED_COUNT++)) || true
    return 0
}

# Generate manifest JSON
generate_manifest() {
    local manifest_path="${ARCHIVE_DIR}/MANIFEST.json"

    log_info "Generating archive manifest"

    if [ "$DRY_RUN" = "true" ]; then
        log_warning "[DRY RUN] Would generate manifest: ${manifest_path}"
        return 0
    fi

    # Calculate deletion date (12 months from now)
    DELETION_DATE=$(date -u -d "+12 months" +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -v+12m +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "MANUAL_CALCULATION_REQUIRED")

    # Start JSON
    cat > "$manifest_path" << 'JSON_START'
{
  "archive_metadata": {
JSON_START

    # Add metadata fields with variable substitution
    cat >> "$manifest_path" << JSON_META
    "archive_date": "${TIMESTAMP}",
    "archive_phase": "Phase 2 - Historical Tests",
    "total_files": ${#TESTS_TO_ARCHIVE[@]},
    "archived_count": ${ARCHIVED_COUNT},
    "retention_policy": "12 months from archive date",
    "deletion_date": "${DELETION_DATE}"
  },
  "archived_tests": [
JSON_META

    # Generate test entries
    local first=true
    for test_file in "${TESTS_TO_ARCHIVE[@]}"; do
        if [ -f "${ARCHIVE_DIR}/$(basename "$test_file")" ]; then
            if [ "$first" = true ]; then
                first=false
            else
                echo "," >> "$manifest_path"
            fi

            local file_size=$(stat -f%z "${ARCHIVE_DIR}/$(basename "$test_file")" 2>/dev/null || stat -c%s "${ARCHIVE_DIR}/$(basename "$test_file")" 2>/dev/null || echo "unknown")
            local filename=$(basename "$test_file")
            local reason="${ARCHIVE_REASONS[$test_file]}"

            cat >> "$manifest_path" << JSON_ENTRY
    {
      "filename": "${filename}",
      "original_path": "${test_file}",
      "archive_path": "tests/archive/historical/${filename}",
      "reason": "${reason}",
      "archived_at": "${TIMESTAMP}",
      "file_size": "${file_size}",
      "restoration_command": "cp tests/archive/historical/${filename} ${test_file}"
    }
JSON_ENTRY
        fi
    done

    # Close JSON
    cat >> "$manifest_path" << 'JSON_END'

  ],
  "restoration_instructions": {
    "single_file": "cp tests/archive/historical/FILENAME ORIGINAL_PATH",
    "all_files": "bash tests/archive/historical/restore-all.sh",
    "verification": "Run tests after restoration to verify functionality"
  },
  "notes": [
    "These tests are archived for historical reference",
    "Scheduled for deletion after 12-month retention period",
    "Contact DevOps before restoration to verify dependencies",
    "Marketing tests may require feature re-enablement",
    "Sprint 5 tests may be incompatible with current architecture"
  ]
}
JSON_END

    log_success "Manifest generated: ${manifest_path}"
}

# Generate README
generate_readme() {
    local readme_path="${ARCHIVE_DIR}/README.md"

    log_info "Generating archive README"

    if [ "$DRY_RUN" = "true" ]; then
        log_warning "[DRY RUN] Would generate README: ${readme_path}"
        return 0
    fi

    cat > "$readme_path" << 'README_END'
# Historical Test Archive

## Overview
This directory contains archived test files from **Phase 2** of the test suite cleanup initiative. These tests are preserved for historical reference and potential restoration needs.

## Archive Date
README_END

    echo "${TIMESTAMP}" >> "$readme_path"

    cat >> "$readme_path" << 'README_BODY'

## Retention Policy
- **Retention Period:** 12 months from archive date
- **Deletion Date:** See MANIFEST.json for calculated deletion date
- **Quarterly Review:** Archive reviewed every 3 months for early deletion candidates

## Archived Tests

### Marketing Tests (4 files)
Historical marketing feature tests that are no longer maintained:
- `marketing-analytics-data-test.sh` - Marketing analytics data processing tests
- `marketing-crm-contacts-test.sh` - CRM contacts integration tests
- `marketing-email-campaigns-test.sh` - Email campaign management tests
- `marketing-social-publishing-test.sh` - Social media publishing tests

**Reason for Archival:** Marketing features deprecated or moved to separate microservices

### Sprint 5 Tests (3 files)
Sprint 5 completion tests superseded by newer test architecture:
- `test-sprint-5-functions-unix.sh` - Unix-specific Sprint 5 function tests
- `test-sprint-5-functions.sh` - Cross-platform Sprint 5 function tests
- `test-sprint-5-integration.sh` - Sprint 5 integration test suite

**Reason for Archival:** Sprint completed, tests superseded by modular test architecture in tests/cfn-v3/

## Restoration Instructions

### Restore Single File
```bash
# Generic pattern
cp tests/archive/historical/FILENAME ORIGINAL_PATH

# Example: Restore marketing analytics test
cp tests/archive/historical/marketing-analytics-data-test.sh tests/integration/marketing-analytics-data-test.sh
chmod +x tests/integration/marketing-analytics-data-test.sh
```

### Restore All Files
```bash
# Restore all archived tests to their original locations
bash tests/archive/historical/restore-all.sh

# Verify restoration
ls -l tests/integration/marketing-*.sh
ls -l tests/cfn-v3/test-sprint-5-*.sh
```

### Restore Specific Category
```bash
# Restore only marketing tests
for file in tests/archive/historical/marketing-*.sh; do
    filename=$(basename "$file")
    cp "$file" "tests/integration/$filename"
    chmod +x "tests/integration/$filename"
done

# Restore only Sprint 5 tests
for file in tests/archive/historical/test-sprint-5-*.sh; do
    filename=$(basename "$file")
    cp "$file" "tests/cfn-v3/$filename"
    chmod +x "tests/cfn-v3/$filename"
done
```

## Verification After Restoration

### Marketing Tests
```bash
# Verify marketing feature dependencies
npm run test:integration -- marketing-analytics-data-test.sh

# Check for missing dependencies
grep -r "require\|import" tests/integration/marketing-*.sh
```

### Sprint 5 Tests
```bash
# Verify Sprint 5 test compatibility
bash tests/cfn-v3/test-sprint-5-integration.sh

# Check for architectural changes
diff tests/cfn-v3/test-sprint-5-functions.sh tests/cfn-v3/current-test-pattern.sh
```

## Important Warnings

### Before Restoration
1. **Check Dependencies:** Marketing tests may require feature flags or services
2. **Review Architecture:** Sprint 5 tests may be incompatible with current CFN v3 architecture
3. **Consult DevOps:** Contact team before restoring to verify impact
4. **Update Test Data:** Archived tests may reference obsolete test fixtures

### Known Issues
- **Marketing Tests:** May fail if marketing microservices are not running
- **Sprint 5 Tests:** Unix-specific tests may not run on Windows/macOS
- **Integration Tests:** May require database schema updates

## Deletion Policy

### Scheduled Deletion
- Archive will be automatically flagged for deletion after **12 months**
- Quarterly reviews may identify tests for early deletion
- Final approval required before permanent deletion

### Early Deletion Criteria
- No restoration requests in 6 months
- Features confirmed permanently removed
- Tests confirmed obsolete by architecture review

### Permanent Deletion Process
1. Create final backup in `.backups/historical-tests-final/`
2. Notify team via Slack/email with 30-day warning
3. Update deletion log in `tests/archive/DELETION_LOG.md`
4. Remove files and update manifests

## Metadata

- **Archive Phase:** Phase 2 - Historical Tests
- **Total Files:** 7 (4 marketing + 3 Sprint 5)
- **Total Size:** See MANIFEST.json for file sizes
- **Archive Method:** Automated via `tests/docker/cleanup/archive-historical-tests.sh`
- **Backup Location:** `.backups/test-archival-*/`

## Contact

For questions about this archive:
- **DevOps Team:** Check `tests/docker/cleanup/README.md`
- **Restoration Requests:** Create issue with label `test-restoration`
- **Deletion Approval:** Requires approval from Tech Lead

## Related Documentation

- Phase 1 Cleanup: `tests/docker/cleanup/README.md`
- Test Suite Maintenance: `tests/docker/TEST_SUITE_MAINTENANCE_PLAN.md`
- Archive Policy: `tests/archive/ARCHIVE_POLICY.md` (if exists)
README_BODY

    log_success "README generated: ${readme_path}"
}

# Generate restoration script
generate_restore_script() {
    local restore_script="${ARCHIVE_DIR}/restore-all.sh"

    log_info "Generating restoration script"

    if [ "$DRY_RUN" = "true" ]; then
        log_warning "[DRY RUN] Would generate restore script: ${restore_script}"
        return 0
    fi

    cat > "$restore_script" << 'RESTORE_END'
#!/usr/bin/env bash
# Restore all archived historical tests to their original locations

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../" && pwd)"
ARCHIVE_DIR="${PROJECT_ROOT}/tests/archive/historical"

echo "Restoring archived historical tests..."

# Marketing tests
mkdir -p "${PROJECT_ROOT}/tests/integration"
for file in "${ARCHIVE_DIR}"/marketing-*.sh; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        cp "$file" "${PROJECT_ROOT}/tests/integration/$filename"
        chmod +x "${PROJECT_ROOT}/tests/integration/$filename"
        echo "Restored: tests/integration/$filename"
    fi
done

# Sprint 5 tests
mkdir -p "${PROJECT_ROOT}/tests/cfn-v3"
for file in "${ARCHIVE_DIR}"/test-sprint-5-*.sh; do
    if [ -f "$file" ]; then
        filename=$(basename "$file")
        cp "$file" "${PROJECT_ROOT}/tests/cfn-v3/$filename"
        chmod +x "${PROJECT_ROOT}/tests/cfn-v3/$filename"
        echo "Restored: tests/cfn-v3/$filename"
    fi
done

echo ""
echo "Restoration complete!"
echo "Verify with: ls -l tests/integration/marketing-*.sh tests/cfn-v3/test-sprint-5-*.sh"
RESTORE_END

    chmod +x "$restore_script"
    log_success "Restore script generated: ${restore_script}"
}

# Print summary
print_summary() {
    echo ""
    echo "======================================"
    echo "Phase 2 Archive Summary"
    echo "======================================"
    echo "Mode: $([ "$DRY_RUN" = "true" ] && echo "DRY RUN" || echo "LIVE EXECUTION")"
    echo "Archived: ${ARCHIVED_COUNT}"
    echo "Skipped: ${SKIPPED_COUNT}"
    echo "Errors: ${ERROR_COUNT}"
    echo "======================================"

    if [ "$DRY_RUN" = "true" ]; then
        echo ""
        log_warning "DRY RUN MODE - No changes made"
        log_info "To execute archival: DRY_RUN=false $0"
    else
        echo ""
        log_success "Archive location: ${ARCHIVE_DIR}"
        log_success "Backup location: ${BACKUP_DIR}"
        log_info "View manifest: cat ${ARCHIVE_DIR}/MANIFEST.json"
        log_info "View README: cat ${ARCHIVE_DIR}/README.md"
    fi
}

# Main execution
main() {
    log_info "Phase 2: Archive Historical Tests"
    log_info "Mode: $([ "$DRY_RUN" = "true" ] && echo "DRY RUN" || echo "LIVE EXECUTION")"
    echo ""

    # Setup
    setup_archive_directory

    # Archive tests
    for test_file in "${TESTS_TO_ARCHIVE[@]}"; do
        archive_test "$test_file"
    done

    # Generate documentation
    generate_manifest
    generate_readme
    generate_restore_script

    # Summary
    print_summary

    # Exit code
    if [ $ERROR_COUNT -gt 0 ]; then
        exit 1
    fi

    exit 0
}

# Run
main "$@"
