# Historical Test Archive

## Overview
This directory contains archived test files from **Phase 2** of the test suite cleanup initiative. These tests are preserved for historical reference and potential restoration needs.

## Archive Date
2025-11-13T12:29:56Z

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
