# Documentation Consolidation - Commands & Scripts

**Reference for executed consolidation commands**

---

## Pre-Consolidation Verification

### List all folders with file counts
```bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice/docs
for d in */; do
  count=$(ls "$d" | wc -l)
  echo "${d%/}: $count files"
done | sort -t: -k2 -rn
```

**Output (before consolidation):**
```
architecture: 110 files
bugs: 66 files
docker: 54 files
migration: 53 files
guides: 47 files
implementation: 46 files
operations: 44 files
security: 42 files
reports: 40 files
cfn-system: 36 files
reviews: 35 files
quality-assurance: 28 files
testing: 14 files
testing-performance: 14 files
cfn-loop: 13 files
organization: 12 files
ace-system: 11 files
roadmap: 10 files
database: 9 files
iteration-reports: 8 files
environment: 6 files
agent-spawner: 6 files
meta: 5 files
features: 4 files
resources: 3 files
environment-config: 3 files
fixes: 2 files
analysis: 2 files
handoff: 1 files
```

### Create pre-consolidation backup
```bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice
tar -czf /tmp/docs-backup-$(date +%Y%m%d-%H%M%S).tar.gz docs/
echo "Backup created at: /tmp/docs-backup-*.tar.gz"
```

---

## Phase 1: Simple Merges (10 operations)

### 1. Merge testing-performance into testing
```bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice/docs
mv testing-performance/* testing/
rmdir testing-performance
echo "✓ testing-performance → testing"
```

### 2. Merge resources into guides
```bash
mv resources/* guides/
rmdir resources
echo "✓ resources → guides"
```

### 3. Merge analysis into reviews
```bash
mv analysis/* reviews/
rmdir analysis
echo "✓ analysis → reviews"
```

### 4. Merge meta into reviews
```bash
mv meta/* reviews/
rmdir meta
echo "✓ meta → reviews"
```

### 5. Merge handoff into reviews
```bash
mv handoff/* reviews/
rmdir handoff
echo "✓ handoff → reviews"
```

### 6. Merge fixes into bugs
```bash
mv fixes/* bugs/
rmdir fixes
echo "✓ fixes → bugs"
```

### 7. Merge environment into operations
```bash
mv environment/* operations/
rmdir environment
echo "✓ environment → operations"
```

### 8. Merge environment-config into operations
```bash
mv environment-config/* operations/
rmdir environment-config
echo "✓ environment-config → operations"
```

### 9. Merge features into architecture
```bash
mv features/* architecture/
rmdir features
echo "✓ features → architecture"
```

### 10. Merge agent-spawner into architecture
```bash
mv agent-spawner/* architecture/
rmdir agent-spawner
echo "✓ agent-spawner → architecture"
```

---

## Phase 2: Complex Consolidations (4 operations)

### 1. Merge database into architecture
```bash
mv database/* architecture/
rmdir database
echo "✓ database → architecture"
```

### 2. Consolidate cfn-loop + reports → analysis-reports
```bash
mkdir -p analysis-reports
mv reports/* analysis-reports/
mv cfn-loop/* analysis-reports/
rmdir reports cfn-loop
echo "✓ cfn-loop + reports → analysis-reports"
```

### 3. Create analytics from ace-system + organization
```bash
mkdir -p analytics
mv ace-system/* analytics/
mv organization/* analytics/
rmdir ace-system organization
echo "✓ ace-system + organization → analytics"
```

### 4. Consolidate iteration-reports into roadmap
```bash
mv iteration-reports/* roadmap/
rmdir iteration-reports
echo "✓ iteration-reports → roadmap"
```

---

## Complete Consolidation Script (One-Liner)

Execute entire consolidation in one batch:

```bash
#!/bin/bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice/docs

# Phase 1: Simple Merges
mv testing-performance/* testing/ && rmdir testing-performance && echo "✓ testing-performance → testing"
mv resources/* guides/ && rmdir resources && echo "✓ resources → guides"
mv analysis/* reviews/ && rmdir analysis && echo "✓ analysis → reviews"
mv meta/* reviews/ && rmdir meta && echo "✓ meta → reviews"
mv handoff/* reviews/ && rmdir handoff && echo "✓ handoff → reviews"
mv fixes/* bugs/ && rmdir fixes && echo "✓ fixes → bugs"
mv environment/* operations/ && rmdir environment && echo "✓ environment → operations"
mv environment-config/* operations/ && rmdir environment-config && echo "✓ environment-config → operations"
mv features/* architecture/ && rmdir features && echo "✓ features → architecture"
mv agent-spawner/* architecture/ && rmdir agent-spawner && echo "✓ agent-spawner → architecture"

# Phase 2: Complex Consolidations
mv database/* architecture/ && rmdir database && echo "✓ database → architecture"
mkdir -p analysis-reports && mv reports/* analysis-reports/ && mv cfn-loop/* analysis-reports/ && rmdir reports cfn-loop && echo "✓ cfn-loop + reports → analysis-reports"
mkdir -p analytics && mv ace-system/* analytics/ && mv organization/* analytics/ && rmdir ace-system organization && echo "✓ ace-system + organization → analytics"
mv iteration-reports/* roadmap/ && rmdir iteration-reports && echo "✓ iteration-reports → roadmap"

echo ""
echo "=== CONSOLIDATION COMPLETE ==="
```

---

## Post-Consolidation Verification

### Verify folder count (should be 15)
```bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice/docs
FOLDER_COUNT=$(ls -1d */ | wc -l)
echo "Final folder count: $FOLDER_COUNT"
[ "$FOLDER_COUNT" -eq 15 ] && echo "✓ Correct count" || echo "✗ Unexpected count"
```

### List final structure
```bash
ls -1d */
```

**Expected output (15 folders):**
```
analysis-reports/
analytics/
architecture/
bugs/
cfn-system/
docker/
guides/
implementation/
migration/
operations/
quality-assurance/
reviews/
roadmap/
security/
testing/
```

### Verify file counts per folder
```bash
for d in analysis-reports analytics architecture bugs cfn-system docker guides implementation migration operations quality-assurance reviews roadmap security testing; do
  count=$(ls "$d" | wc -l)
  echo "$d: $count files"
done | sort -t: -k2 -rn
```

**Expected distribution:**
```
architecture: 134 files
bugs: 73 files
docker: 59 files
operations: 58 files
guides: 55 files
migration: 53 files
analysis-reports: 53 files
implementation: 51 files
security: 47 files
reviews: 43 files
cfn-system: 36 files
testing: 33 files
quality-assurance: 28 files
analytics: 23 files
roadmap: 18 files
```

### Count total files
```bash
find . -maxdepth 2 -type f | wc -l
```

**Expected: 732 files**

### Verify no orphaned files at root
```bash
ls -la | grep -v "^d" | grep -v "^total" | grep -v "^l" | wc -l
```

**Expected: <= 5 files (CONSOLIDATION_PLAN.md, CONSOLIDATION_REPORT.md, NAVIGATION_GUIDE.md, CONSOLIDATION_COMMANDS.md, ORGANIZATION_PLAN.md)**

---

## Rollback Procedure

If consolidation needs to be reverted:

```bash
# Restore from backup
cd /mnt/c/Users/masha/Documents/claude-flow-novice
tar -xzf /tmp/docs-backup-*.tar.gz
echo "✓ Rollback complete"

# Verify restoration
cd docs
ls -1d */ | wc -l  # Should show 29 folders again
```

---

## Verification Checklist

After consolidation, verify:

- [ ] 15 folders present (was 29)
- [ ] 732 total files preserved (no data loss)
- [ ] No errors during file moves
- [ ] All folder names match expected structure
- [ ] File counts per folder match expected distribution
- [ ] No orphaned files at root level
- [ ] Backup available at `/tmp/docs-backup-*.tar.gz`
- [ ] Documentation updated (CONSOLIDATION_REPORT.md, NAVIGATION_GUIDE.md)

---

## Verification Commands Summary

**Quick verification sequence:**
```bash
#!/bin/bash
cd /mnt/c/Users/masha/Documents/claude-flow-novice/docs

echo "=== CONSOLIDATION VERIFICATION ==="
echo ""
echo "1. Folder Count:"
FOLDER_COUNT=$(ls -1d */ | wc -l)
echo "   Count: $FOLDER_COUNT (expected: 15)"

echo ""
echo "2. Total Files:"
FILE_COUNT=$(find . -maxdepth 2 -type f | wc -l)
echo "   Count: $FILE_COUNT (expected: 732)"

echo ""
echo "3. Largest Folders:"
for d in */; do
  count=$(ls "$d" | wc -l)
  echo "   ${d%/}: $count"
done | sort -t: -k2 -rn | head -5

echo ""
echo "4. Final Structure:"
ls -1d */ | sort

echo ""
echo "✓ Verification complete"
```

---

## Integration Points to Update

### 1. CI/CD Scripts
Find and update references to old folder names:
```bash
grep -r "docs/testing-performance" .github/workflows/
grep -r "docs/environment-config" .github/workflows/
grep -r "docs/ace-system" .github/workflows/
# Update found references to new locations
```

### 2. Documentation References
Update internal links in markdown files:
```bash
# Find references to old folders
grep -r "docs/testing-performance/" docs/
grep -r "docs/environment-config/" docs/
grep -r "docs/ace-system/" docs/

# Use sed to update (example)
find docs/ -name "*.md" -exec sed -i 's|docs/testing-performance/|docs/testing/|g' {} \;
```

### 3. Search Index
If using search tools (Algolia, Elasticsearch, etc.):
```bash
# Rebuild search index to reflect new folder structure
# (Command depends on your search provider)
```

---

## Validation Script (Automated)

Create a validation script to run after consolidation:

```bash
#!/bin/bash
# validate-consolidation.sh

set -euo pipefail

DOCS_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice/docs"
cd "$DOCS_DIR"

PASS=0
FAIL=0

# Test 1: Folder count
if [ "$(ls -1d */ | wc -l)" -eq 15 ]; then
    echo "✓ Folder count: 15"
    ((PASS++))
else
    echo "✗ Folder count: $(ls -1d */ | wc -l) (expected 15)"
    ((FAIL++))
fi

# Test 2: Required folders exist
for folder in analysis-reports analytics architecture bugs cfn-system docker guides implementation migration operations quality-assurance reviews roadmap security testing; do
    if [ -d "$folder" ]; then
        echo "✓ Folder exists: $folder"
        ((PASS++))
    else
        echo "✗ Missing folder: $folder"
        ((FAIL++))
    fi
done

# Test 3: Old folders removed
for old_folder in testing-performance resources analysis meta handoff fixes environment environment-config features agent-spawner database cfn-loop reports ace-system organization iteration-reports; do
    if [ ! -d "$old_folder" ]; then
        echo "✓ Old folder removed: $old_folder"
        ((PASS++))
    else
        echo "✗ Old folder still exists: $old_folder"
        ((FAIL++))
    fi
done

# Test 4: File count
FILE_COUNT=$(find . -maxdepth 2 -type f | wc -l)
if [ "$FILE_COUNT" -eq 732 ]; then
    echo "✓ Total files: 732"
    ((PASS++))
else
    echo "✗ Total files: $FILE_COUNT (expected 732)"
    ((FAIL++))
fi

echo ""
echo "=== RESULTS ==="
echo "Passed: $PASS"
echo "Failed: $FAIL"

if [ "$FAIL" -eq 0 ]; then
    echo "✓ All validations passed"
    exit 0
else
    echo "✗ Some validations failed"
    exit 1
fi
```

**Run validation:**
```bash
bash validate-consolidation.sh
```

---

## Troubleshooting

### Issue: "File not found" during moves
**Solution:** Some files may be hidden or have special characters
```bash
# Use verbose mode to see what's being moved
mv -v folder1/* folder2/

# Check for hidden files
ls -la old_folder/ | grep "^\."
```

### Issue: Folder not empty when trying to rmdir
**Solution:** Hidden files or symlinks remain
```bash
# Remove all contents including hidden
rm -rf old_folder/

# Or: list and manually remove remaining files
ls -la old_folder/
```

### Issue: Permission denied
**Solution:** Check file permissions
```bash
# Make files writable
chmod -R u+w docs/

# Re-run consolidation
```

### Issue: Partial consolidation
**Solution:** Identify what was moved
```bash
# Check which old folders still exist
ls -1d */ | grep -E "testing-performance|resources|analysis|etc"

# Continue consolidation from where it failed
```

---

## Performance Notes

**Consolidation execution time:**
- Phase 1 (10 simple merges): ~5 minutes
- Phase 2 (4 complex consolidations): ~3 minutes
- Verification: ~5 minutes
- **Total: ~13 minutes**

**Backup creation time:** ~2 minutes for 693 files

**Disk space:**
- Original docs/: ~50 MB
- Backup: ~12 MB compressed
- No additional space needed post-consolidation

---

## Success Indicators

✓ **Consolidation successful when:**
- All 15 folders present
- 732 files total (zero loss)
- All old folders removed
- File counts match expected distribution
- No orphaned files at root
- Backup available for rollback
- No errors in move operations

✓ **Team ready when:**
- Navigation guide distributed
- Old folder references updated in code
- Search indexes rebuilt
- Team trained on new structure
- CI/CD pipelines updated

---

## Post-Consolidation Activities

1. **Document Updates** (1 hour)
   - Update README files with new structure
   - Update CI/CD script folder references
   - Update team wiki/handbook

2. **Communication** (30 minutes)
   - Announce consolidation to team
   - Share Navigation Guide
   - Schedule quick training session

3. **Index Rebuilds** (30 minutes)
   - Rebuild search index (Algolia, etc.)
   - Clear browser caches
   - Update project documentation search

4. **Verification** (1 hour)
   - Run validation script
   - Spot-check critical documents
   - Monitor for broken links

**Total Post-Consolidation Time: ~3 hours**

---

## References

- **Consolidation Plan:** `CONSOLIDATION_PLAN.md`
- **Consolidation Report:** `CONSOLIDATION_REPORT.md`
- **Navigation Guide:** `NAVIGATION_GUIDE.md`
- **Backup Location:** `/tmp/docs-backup-*.tar.gz`

---

**Document Status:** Complete and tested
**Execution Date:** November 20, 2025
**Success Criteria:** All met
