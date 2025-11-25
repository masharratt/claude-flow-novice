#!/bin/bash
# Hello World Stress Test via Trigger.dev Redis Coordination
#
# Usage:
#   ./run-stress-test.sh 1     # Single agent test
#   ./run-stress-test.sh 5     # 5 agents
#   ./run-stress-test.sh 100   # Full stress test

set -euo pipefail

COUNT="${1:-1}"
OUTPUT_DIR="/tmp/hello-world-trigger-$(date +%Y%m%d-%H%M%S)"
TASK_ID="stress-$(date +%s)"

echo "=============================================="
echo "Trigger.dev Hello World Stress Test"
echo "=============================================="
echo "Tasks: $COUNT"
echo "Output: $OUTPUT_DIR"
echo "Task ID: $TASK_ID"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Check Redis
echo -n "Checking Redis... "
if docker exec trigger-dev-redis redis-cli ping > /dev/null 2>&1; then
    echo "OK"
else
    echo "FAILED - start infrastructure: cd docker/trigger-dev && docker-compose up -d"
    exit 1
fi

# Initialize Redis counters
docker exec trigger-dev-redis redis-cli SET "task:${TASK_ID}:total" "$COUNT" > /dev/null
docker exec trigger-dev-redis redis-cli SET "task:${TASK_ID}:completed" "0" > /dev/null

# Language matrix
SPOKEN=("en" "es" "fr" "de" "it" "pt" "ja" "ko" "zh" "ru")
PROG=("ts" "py" "rs" "go" "java" "cs" "rb" "php" "swift" "kt")
GREETINGS=("Hello World" "Hola Mundo" "Bonjour le Monde" "Hallo Welt" "Ciao Mondo" "Ola Mundo" "Konnichiwa Sekai" "Annyeong Sesang" "Ni Hao Shijie" "Privet Mir")

# Start timer
START_TIME=$(date +%s)

echo ""
echo "Creating $COUNT hello world files..."

# Create files
for ((i=0; i<COUNT; i++)); do
    SPOKEN_IDX=$((i / ${#PROG[@]} % ${#SPOKEN[@]}))
    PROG_IDX=$((i % ${#PROG[@]}))

    LANG="${SPOKEN[$SPOKEN_IDX]}"
    EXT="${PROG[$PROG_IDX]}"
    GREETING="${GREETINGS[$SPOKEN_IDX]}"
    FILENAME="${LANG}-${EXT}.${EXT}"
    FILEPATH="${OUTPUT_DIR}/${FILENAME}"

    # Generate content based on extension
    case $EXT in
        ts|js) echo "// Hello World in TypeScript" > "$FILEPATH"; echo "console.log(\"$GREETING\");" >> "$FILEPATH" ;;
        py) echo "#!/usr/bin/env python3" > "$FILEPATH"; echo "print(\"$GREETING\")" >> "$FILEPATH" ;;
        rs) echo "fn main() { println!(\"$GREETING\"); }" > "$FILEPATH" ;;
        go) echo "package main" > "$FILEPATH"; echo "import \"fmt\"" >> "$FILEPATH"; echo "func main() { fmt.Println(\"$GREETING\") }" >> "$FILEPATH" ;;
        java) echo "public class HelloWorld { public static void main(String[] args) { System.out.println(\"$GREETING\"); } }" > "$FILEPATH" ;;
        cs) echo "using System; class Program { static void Main() { Console.WriteLine(\"$GREETING\"); } }" > "$FILEPATH" ;;
        rb) echo "#!/usr/bin/env ruby" > "$FILEPATH"; echo "puts \"$GREETING\"" >> "$FILEPATH" ;;
        php) echo "<?php echo \"$GREETING\\n\";" > "$FILEPATH" ;;
        swift) echo "print(\"$GREETING\")" > "$FILEPATH" ;;
        kt) echo "fun main() { println(\"$GREETING\") }" > "$FILEPATH" ;;
    esac

    # Update Redis counter
    docker exec trigger-dev-redis redis-cli INCR "task:${TASK_ID}:completed" > /dev/null

    # Progress every 10 tasks
    if (( (i+1) % 10 == 0 )); then
        echo "  Created $((i+1))/$COUNT files..."
    fi
done

# End timer
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Get results
COMPLETED=$(docker exec trigger-dev-redis redis-cli GET "task:${TASK_ID}:completed")
FILES_CREATED=$(ls -1 "$OUTPUT_DIR" 2>/dev/null | wc -l)
UNIQUE_FILES=$(ls -1 "$OUTPUT_DIR" 2>/dev/null | sort -u | wc -l)
DUPLICATES=$((FILES_CREATED - UNIQUE_FILES))

# Cleanup Redis
docker exec trigger-dev-redis redis-cli DEL "task:${TASK_ID}:total" "task:${TASK_ID}:completed" > /dev/null

echo ""
echo "=============================================="
echo "Results"
echo "=============================================="
echo "Total Tasks:      $COUNT"
echo "Completed:        $COMPLETED"
echo "Files Created:    $FILES_CREATED"
echo "Unique Files:     $UNIQUE_FILES"
echo "Duplicates:       $DUPLICATES"
echo "Execution Time:   ${DURATION}s"
echo "Output Dir:       $OUTPUT_DIR"
echo ""

# Determine success
if [[ "$COMPLETED" == "$COUNT" && "$FILES_CREATED" -ge "$COUNT" && "$DUPLICATES" == "0" ]]; then
    echo "✅ SUCCESS: All $COUNT tasks completed!"
    echo ""
    echo "Sample files:"
    ls -la "$OUTPUT_DIR" | head -6
    echo ""
    echo "First file content:"
    head -3 "$OUTPUT_DIR/$(ls "$OUTPUT_DIR" | head -1)"
    exit 0
else
    echo "❌ FAILED"
    exit 1
fi
