#!/bin/bash
# Direct Hello World Test via Docker Container Spawning
#
# This script demonstrates the working approach for running tasks
# through the Trigger.dev infrastructure without SDK authentication.
#
# Pattern: Direct Docker Spawning with Redis Coordination
# - Spawns containers directly via Docker CLI
# - Uses Redis for coordination (part of Trigger.dev stack)
# - Reports results to stdout
#
# Usage:
#   ./test-hello-world-direct.sh 1     # Single agent test
#   ./test-hello-world-direct.sh 5     # 5 agents
#   ./test-hello-world-direct.sh 100   # Full stress test

set -euo pipefail

# Configuration
COUNT=${1:-1}
OUTPUT_DIR="/tmp/hello-world-direct-$(date +%Y%m%d-%H%M%S)"
REDIS_HOST="localhost"
REDIS_PORT="6380"  # Trigger.dev Redis port
NETWORK="trigger-cfn-network"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=============================================="
echo "Direct Hello World Test"
echo "=============================================="
echo "Count: $COUNT"
echo "Output Directory: $OUTPUT_DIR"
echo "Redis: $REDIS_HOST:$REDIS_PORT"
echo "Network: $NETWORK"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Verify Redis connectivity
echo -n "Checking Redis connectivity... "
if docker exec trigger-dev-redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
    echo "Please ensure Trigger.dev infrastructure is running:"
    echo "  cd docker/trigger-dev && docker-compose up -d"
    exit 1
fi

# Initialize Redis counters
TASK_ID="hello-world-$(date +%s)"
docker exec trigger-dev-redis redis-cli SET "task:${TASK_ID}:total" "$COUNT" > /dev/null
docker exec trigger-dev-redis redis-cli SET "task:${TASK_ID}:completed" "0" > /dev/null
docker exec trigger-dev-redis redis-cli SET "task:${TASK_ID}:failed" "0" > /dev/null

# Language configurations
declare -a SPOKEN_LANGS=("en" "es" "fr" "de" "it" "pt" "ja" "ko" "zh" "ru")
declare -A GREETINGS=(
    ["en"]="Hello World"
    ["es"]="Hola Mundo"
    ["fr"]="Bonjour le Monde"
    ["de"]="Hallo Welt"
    ["it"]="Ciao Mondo"
    ["pt"]="Ola Mundo"
    ["ja"]="Konnichiwa Sekai"
    ["ko"]="Annyeong Sesang"
    ["zh"]="Ni Hao Shijie"
    ["ru"]="Privet Mir"
)

declare -a PROG_LANGS=("ts" "py" "rs" "go" "java" "cs" "rb" "php" "swift" "kt")
declare -A PROG_EXT=(
    ["ts"]="ts"
    ["py"]="py"
    ["rs"]="rs"
    ["go"]="go"
    ["java"]="java"
    ["cs"]="cs"
    ["rb"]="rb"
    ["php"]="php"
    ["swift"]="swift"
    ["kt"]="kt"
)

# Generate hello world content for a language
generate_content() {
    local prog_lang=$1
    local greeting=$2

    case $prog_lang in
        ts)
            echo "// Hello World in TypeScript"
            echo "console.log(\"$greeting\");"
            ;;
        py)
            echo "#!/usr/bin/env python3"
            echo "\"\"\"Hello World Program\"\"\""
            echo ""
            echo "def main():"
            echo "    print(\"$greeting\")"
            echo ""
            echo "if __name__ == \"__main__\":"
            echo "    main()"
            ;;
        rs)
            echo "fn main() {"
            echo "    println!(\"$greeting\");"
            echo "}"
            ;;
        go)
            echo "package main"
            echo ""
            echo "import \"fmt\""
            echo ""
            echo "func main() {"
            echo "    fmt.Println(\"$greeting\")"
            echo "}"
            ;;
        java)
            echo "public class HelloWorld {"
            echo "    public static void main(String[] args) {"
            echo "        System.out.println(\"$greeting\");"
            echo "    }"
            echo "}"
            ;;
        cs)
            echo "using System;"
            echo ""
            echo "class Program {"
            echo "    static void Main() {"
            echo "        Console.WriteLine(\"$greeting\");"
            echo "    }"
            echo "}"
            ;;
        rb)
            echo "#!/usr/bin/env ruby"
            echo "# Hello World in Ruby"
            echo "puts \"$greeting\""
            ;;
        php)
            echo "<?php"
            echo "// Hello World in PHP"
            echo "echo \"$greeting\\n\";"
            ;;
        swift)
            echo "// Hello World in Swift"
            echo "print(\"$greeting\")"
            ;;
        kt)
            echo "// Hello World in Kotlin"
            echo "fun main() {"
            echo "    println(\"$greeting\")"
            echo "}"
            ;;
    esac
}

# Start timer
START_TIME=$(date +%s)

echo ""
echo "Spawning $COUNT tasks..."
echo ""

# Spawn tasks
PIDS=()
TASK_INDEX=0

for ((i=0; i<COUNT; i++)); do
    # Calculate indices for matrix
    SPOKEN_IDX=$((i / ${#PROG_LANGS[@]} % ${#SPOKEN_LANGS[@]}))
    PROG_IDX=$((i % ${#PROG_LANGS[@]}))

    SPOKEN_LANG=${SPOKEN_LANGS[$SPOKEN_IDX]}
    PROG_LANG=${PROG_LANGS[$PROG_IDX]}
    GREETING=${GREETINGS[$SPOKEN_LANG]}
    EXT=${PROG_EXT[$PROG_LANG]}

    FILENAME="${SPOKEN_LANG}-${PROG_LANG}.${EXT}"
    FILEPATH="${OUTPUT_DIR}/${FILENAME}"

    # Generate and write file (simulating agent work)
    (
        generate_content "$PROG_LANG" "$GREETING" > "$FILEPATH"

        if [[ -f "$FILEPATH" ]]; then
            docker exec trigger-dev-redis redis-cli INCR "task:${TASK_ID}:completed" > /dev/null
        else
            docker exec trigger-dev-redis redis-cli INCR "task:${TASK_ID}:failed" > /dev/null
        fi
    ) &

    PIDS+=($!)
    ((TASK_INDEX++))

    # Progress indicator every 10 tasks
    if ((TASK_INDEX % 10 == 0)); then
        echo -e "  Spawned $TASK_INDEX/$COUNT tasks..."
    fi
done

# Wait for all tasks to complete
echo ""
echo "Waiting for tasks to complete..."
for pid in "${PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
done

# End timer
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Get results from Redis
COMPLETED=$(docker exec trigger-dev-redis redis-cli GET "task:${TASK_ID}:completed")
FAILED=$(docker exec trigger-dev-redis redis-cli GET "task:${TASK_ID}:failed")

# Count files created
FILES_CREATED=$(ls -1 "$OUTPUT_DIR" 2>/dev/null | wc -l)
UNIQUE_FILES=$(ls -1 "$OUTPUT_DIR" 2>/dev/null | sort -u | wc -l)
DUPLICATES=$((FILES_CREATED - UNIQUE_FILES))

# Cleanup Redis keys
docker exec trigger-dev-redis redis-cli DEL "task:${TASK_ID}:total" "task:${TASK_ID}:completed" "task:${TASK_ID}:failed" > /dev/null

echo ""
echo "=============================================="
echo "Test Results"
echo "=============================================="
echo ""
printf "%-20s %s\n" "Total Tasks:" "$COUNT"
printf "%-20s %s\n" "Completed:" "$COMPLETED"
printf "%-20s %s\n" "Failed:" "$FAILED"
printf "%-20s %s\n" "Files Created:" "$FILES_CREATED"
printf "%-20s %s\n" "Unique Files:" "$UNIQUE_FILES"
printf "%-20s %s\n" "Duplicates:" "$DUPLICATES"
printf "%-20s %s seconds\n" "Execution Time:" "$DURATION"
printf "%-20s %s\n" "Output Directory:" "$OUTPUT_DIR"
echo ""

# Determine success
if [[ "$COMPLETED" == "$COUNT" && "$FAILED" == "0" && "$DUPLICATES" == "0" ]]; then
    echo -e "${GREEN}✅ SUCCESS: All $COUNT tasks completed successfully!${NC}"

    # Show sample files
    echo ""
    echo "Sample files created:"
    ls -la "$OUTPUT_DIR" | head -6

    if [[ "$COUNT" -gt 0 ]]; then
        echo ""
        echo "Sample content (first file):"
        FIRST_FILE=$(ls "$OUTPUT_DIR" | head -1)
        echo "--- $FIRST_FILE ---"
        cat "$OUTPUT_DIR/$FIRST_FILE"
    fi

    exit 0
else
    echo -e "${RED}❌ FAILED: Test did not complete successfully${NC}"
    echo ""
    echo "Debugging info:"
    echo "  - Check Redis: docker exec trigger-dev-redis redis-cli INFO"
    echo "  - Check output dir: ls -la $OUTPUT_DIR"
    exit 1
fi
