#!/bin/bash
set -e

# cfn-changelog-management/add-changelog-entry.sh
# Adds sparse, structured entries to readme/CHANGELOG.md

# Default values
TYPE=""
SUMMARY=""
IMPACT=""
VERSION=""
ISSUE=""
FILES=""
MIGRATION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --type)
      TYPE="$2"
      shift 2
      ;;
    --summary)
      SUMMARY="$2"
      shift 2
      ;;
    --impact)
      IMPACT="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    --issue)
      ISSUE="$2"
      shift 2
      ;;
    --files)
      FILES="$2"
      shift 2
      ;;
    --migration)
      MIGRATION="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

# Validation
if [[ -z "$TYPE" ]]; then
  echo "Error: --type is required" >&2
  echo "Valid types: feature, bugfix, breaking, dependency, architecture, performance, security" >&2
  exit 1
fi

if [[ -z "$SUMMARY" ]]; then
  echo "Error: --summary is required" >&2
  exit 1
fi

if [[ -z "$IMPACT" ]]; then
  echo "Error: --impact is required" >&2
  exit 1
fi

# Validate type
VALID_TYPES="feature|bugfix|breaking|dependency|architecture|performance|security"
if [[ ! "$TYPE" =~ ^($VALID_TYPES)$ ]]; then
  echo "Error: --type must be one of: feature, bugfix, breaking, dependency, architecture, performance, security (got: $TYPE)" >&2
  exit 1
fi

# Validate summary length
SUMMARY_LENGTH=${#SUMMARY}
if (( SUMMARY_LENGTH < 10 )); then
  echo "Error: --summary must be at least 10 characters (got $SUMMARY_LENGTH)" >&2
  exit 1
fi

if (( SUMMARY_LENGTH > 100 )); then
  echo "Error: --summary must be at most 100 characters (got $SUMMARY_LENGTH)" >&2
  exit 1
fi

# Validate file limit
if [[ -n "$FILES" ]]; then
  FILE_COUNT=$(echo "$FILES" | tr ',' '\n' | wc -l)
  if (( FILE_COUNT > 5 )); then
    echo "Error: --files can contain at most 5 files (got $FILE_COUNT)" >&2
    exit 1
  fi
fi

# Path to changelog
CHANGELOG_FILE="readme/CHANGELOG.md"
PROJECT_ROOT="/mnt/c/Users/masha/Documents/claude-flow-novice"
CHANGELOG_PATH="$PROJECT_ROOT/$CHANGELOG_FILE"

# Check if changelog exists
if [[ ! -f "$CHANGELOG_PATH" ]]; then
  echo "Error: Changelog not found at $CHANGELOG_PATH" >&2
  echo "Expected format: readme/CHANGELOG.md" >&2
  exit 1
fi

# Map type to section header
case "$TYPE" in
  feature)
    SECTION="### Features"
    ;;
  bugfix)
    SECTION="### Bug Fixes"
    ;;
  breaking)
    SECTION="### Breaking Changes"
    ;;
  dependency)
    SECTION="### Dependencies"
    ;;
  architecture)
    SECTION="### Architecture"
    ;;
  performance)
    SECTION="### Performance"
    ;;
  security)
    SECTION="### Security"
    ;;
esac

# Current date
CURRENT_DATE=$(date +%Y-%m-%d)

# Build entry
ENTRY="- $SUMMARY ($CURRENT_DATE)"
ENTRY="$ENTRY\n  - Impact: $IMPACT"

if [[ -n "$FILES" ]]; then
  ENTRY="$ENTRY\n  - Files: \`$FILES\`"
fi

if [[ -n "$ISSUE" ]]; then
  ENTRY="$ENTRY\n  - Issue: $ISSUE"
fi

if [[ -n "$MIGRATION" ]]; then
  ENTRY="$ENTRY\n  - Migration: $MIGRATION"
fi

# Find [Unreleased] section and appropriate subsection
# Insert entry after section header

# Check if [Unreleased] section exists
if ! grep -q "## \[Unreleased\]" "$CHANGELOG_PATH"; then
  echo "Error: [Unreleased] section not found in changelog" >&2
  echo "Expected format:" >&2
  echo "## [Unreleased]" >&2
  echo "" >&2
  echo "### Features" >&2
  exit 1
fi

# Check if section exists within [Unreleased]
if ! awk '/## \[Unreleased\]/,/^---$/ { if (/'"$SECTION"'/) found=1 } END { exit !found }' "$CHANGELOG_PATH"; then
  echo "Error: $SECTION not found within [Unreleased] section" >&2
  exit 1
fi

# Insert entry after section header (first blank line or entry)
awk -v section="$SECTION" -v entry="$ENTRY" '
  # Track if we are in [Unreleased] section
  /## \[Unreleased\]/ { in_unreleased=1 }
  /^## \[/ && !/## \[Unreleased\]/ { in_unreleased=0 }

  # When we find the target section within [Unreleased]
  in_unreleased && $0 ~ section {
    print
    getline  # Read next line
    print    # Print it (usually blank line)
    print entry
    next
  }
  {print}
' "$CHANGELOG_PATH" > "${CHANGELOG_PATH}.tmp"

mv "${CHANGELOG_PATH}.tmp" "$CHANGELOG_PATH"

echo "✅ Changelog entry added successfully"
echo "   Type: $TYPE"
echo "   Summary: $SUMMARY"
echo "   Section: $SECTION"
echo "   Location: $CHANGELOG_FILE"

# Output path for scripting
echo "$CHANGELOG_PATH"
