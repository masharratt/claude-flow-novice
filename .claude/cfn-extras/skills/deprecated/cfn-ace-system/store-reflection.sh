#!/bin/bash

# Parse arguments
while [ $# -gt 0 ]; do
    key="$1"
    case $key in
        --sprint)
            SPRINT="$2"
            shift 2
            ;;
        --file)
            LESSONS_FILE="$2"
            shift 2
            ;;
        *)
            echo "Unknown parameter: $1"
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$SPRINT" ] || [ -z "$LESSONS_FILE" ]; then
    echo "Usage: $0 --sprint <sprint_number> --file <lessons_file_path>"
    exit 1
fi

# Ensure artifacts directory exists
mkdir -p .claude/artifacts/ace-reflections

# Store reflection with timestamp
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%S")
OUTPUT_FILE=".claude/artifacts/ace-reflections/sprint-${SPRINT}_${TIMESTAMP}.json"

# Copy lessons file to artifacts
cp "$LESSONS_FILE" "$OUTPUT_FILE"

# Update latest reflection pointer
echo "$OUTPUT_FILE" > .claude/artifacts/ace-reflections/LATEST

echo "Reflection for Sprint $SPRINT stored successfully at $OUTPUT_FILE"

# Optional: Use Redis to broadcast reflection event
if command -v redis-cli &> /dev/null; then
    redis-cli lpush "ace:reflections" "$OUTPUT_FILE"
fi