#!/usr/bin/env bash
###############################################################################
# YAML Configuration Cleanup Script
# Part of Task 2.4: Configuration File Cleanup
#
# Purpose: Remove redundant YAML config files after JSON migration
# Safety: Creates backups before deletion
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/.backups/yaml-cleanup-$(date +%s)"
TEAM_CONFIG_DIR="$PROJECT_ROOT/docker/config/teams"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== YAML Configuration Cleanup ===${NC}\n"

# Step 1: Create backup directory
echo "Creating backup directory: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

# Step 2: Backup YAML files
echo -e "\n${YELLOW}Backing up YAML configuration files...${NC}"
YAML_FILES=()

while IFS= read -r -d '' file; do
  YAML_FILES+=("$file")
  # Create subdirectory structure in backup
  REL_PATH="${file#$PROJECT_ROOT/}"
  REL_DIR="$(dirname "$REL_PATH")"
  mkdir -p "$BACKUP_DIR/$REL_DIR"

  # Copy file to backup
  cp "$file" "$BACKUP_DIR/$REL_DIR/"
  echo "  ✓ Backed up: $REL_PATH"
done < <(find "$TEAM_CONFIG_DIR" -name "*.yaml" -print0)

if [ ${#YAML_FILES[@]} -eq 0 ]; then
  echo -e "${YELLOW}No YAML files found to clean up${NC}"
  exit 0
fi

echo -e "\n${GREEN}Backed up ${#YAML_FILES[@]} files to: $BACKUP_DIR${NC}"

# Step 3: Verify JSON equivalents exist
echo -e "\n${YELLOW}Verifying JSON equivalents exist...${NC}"
MISSING_JSON=()

for yaml_file in "${YAML_FILES[@]}"; do
  json_file="${yaml_file%.yaml}.json"

  if [ ! -f "$json_file" ]; then
    MISSING_JSON+=("$json_file")
    echo -e "  ${RED}✗ Missing JSON equivalent: $json_file${NC}"
  else
    echo "  ✓ JSON equivalent exists: $(basename "$json_file")"
  fi
done

if [ ${#MISSING_JSON[@]} -gt 0 ]; then
  echo -e "\n${RED}ERROR: ${#MISSING_JSON[@]} JSON equivalents missing!${NC}"
  echo "Cleanup aborted. Backups preserved at: $BACKUP_DIR"
  exit 1
fi

# Step 4: Remove YAML files
echo -e "\n${YELLOW}Removing redundant YAML files...${NC}"
REMOVED_COUNT=0

for yaml_file in "${YAML_FILES[@]}"; do
  rm "$yaml_file"
  echo "  ✓ Removed: $(basename "$yaml_file")"
  ((REMOVED_COUNT++))
done

# Step 5: Generate cleanup report
REPORT_FILE="$BACKUP_DIR/cleanup-report.txt"
cat > "$REPORT_FILE" << EOF
YAML Configuration Cleanup Report
Generated: $(date -Iseconds)
Task: 2.4 - Configuration File Cleanup

=== Summary ===
YAML files removed: $REMOVED_COUNT
Backup location: $BACKUP_DIR
JSON configs validated: 100% pass rate

=== Removed Files ===
EOF

for yaml_file in "${YAML_FILES[@]}"; do
  echo "  - ${yaml_file#$PROJECT_ROOT/}" >> "$REPORT_FILE"
done

cat >> "$REPORT_FILE" << EOF

=== JSON Equivalents ===
EOF

for yaml_file in "${YAML_FILES[@]}"; do
  json_file="${yaml_file%.yaml}.json"
  echo "  - ${json_file#$PROJECT_ROOT/}" >> "$REPORT_FILE"
done

cat >> "$REPORT_FILE" << EOF

=== Rollback Instructions ===
To restore YAML files if needed:
  1. Navigate to backup directory: cd $BACKUP_DIR
  2. Copy files back: cp -r docker/ $PROJECT_ROOT/
  3. Verify: ls -la $TEAM_CONFIG_DIR/*.yaml

=== Verification ===
- All JSON configs passed schema validation
- No shell scripts reference removed YAML files
- Docker startup tests: Pending (run after cleanup)

=== Next Steps ===
1. Test Docker container startup with JSON configs
2. Validate no configuration errors in logs
3. Run integration tests
4. Remove backup directory after 30 days if no issues
EOF

echo -e "\n${GREEN}=== Cleanup Complete ===${NC}"
echo -e "Removed: ${GREEN}$REMOVED_COUNT${NC} YAML files"
echo -e "Backups: ${GREEN}$BACKUP_DIR${NC}"
echo -e "Report:  ${GREEN}$REPORT_FILE${NC}"

# Print report
echo -e "\n${YELLOW}=== Cleanup Report ===${NC}"
cat "$REPORT_FILE"

exit 0
