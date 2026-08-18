#!/usr/bin/env bash
set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

# Default configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="${COORDINATION_DB_PATH:-$SCRIPT_DIR/generations.db}"
CODESEARCH_INDEX="${CODESEARCH_INDEX_PATH:-./.claude/skills/cfn-codesearch/data}"
MAX_ATTEMPTS="${MAX_GENERATION_ATTEMPTS:-3}"
TEST_TIMEOUT="${DEFAULT_TEST_TIMEOUT:-60}"
MODEL="${CEREBRAS_MODEL:-qwen2.5-coder-32b}"
BASE_URL="${CEREBRAS_BASE_URL:-https://api.cerebras.ai/v1}"

# Parse arguments
AGENT_ID=""
FILE_PATH=""
PROMPT=""
CONTEXT_FILES=""
TEST_COMMAND=""
MODEL_OVERRIDE=""
MAX_ATTEMPTS_OVERRIDE=""
VERBOSE="false"

while [[ $# -gt 0 ]]; do
    case $1 in
        --agent-id) AGENT_ID="$2"; shift 2 ;;
        --file-path) FILE_PATH="$2"; shift 2 ;;
        --prompt) PROMPT="$2"; shift 2 ;;
        --context-files) CONTEXT_FILES="$2"; shift 2 ;;
        --test-command) TEST_COMMAND="$2"; shift 2 ;;
        --model) MODEL_OVERRIDE="$2"; shift 2 ;;
        --max-attempts) MAX_ATTEMPTS_OVERRIDE="$2"; shift 2 ;;
        --verbose) VERBOSE="true"; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Required arguments
if [[ -z "${AGENT_ID:-}" || -z "${FILE_PATH:-}" || -z "${PROMPT:-}" ]]; then
    echo "Usage: $0 --agent-id <id> --file-path <path> --prompt <prompt> [options]"
    echo "Options:"
    echo "  --context-files <files>    Comma-separated list of context files"
    echo "  --test-command <command>   Command to test generated code"
    echo "  --model <model>           Override default Cerebras model"
    echo "  --max-attempts <num>      Override max generation attempts"
    echo "  --verbose                 Enable verbose logging"
    exit 1
fi

# Apply overrides
[[ -n "$MODEL_OVERRIDE" ]] && MODEL="$MODEL_OVERRIDE"
[[ -n "$MAX_ATTEMPTS_OVERRIDE" ]] && MAX_ATTEMPTS="$MAX_ATTEMPTS_OVERRIDE"

# Logging function
log() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
    fi
}

# Initialize database
mkdir -p "$(dirname "$DB_PATH")"
sqlite3 "$DB_PATH" <<'EOF' || true
CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    prompt TEXT NOT NULL,
    context_files TEXT,
    model TEXT NOT NULL,
    pattern_examples TEXT,
    generated_code TEXT,
    test_command TEXT,
    test_output TEXT,
    success BOOLEAN,
    error_message TEXT,
    attempts INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    codesearch_id TEXT,
    confidence_score REAL,
    performance_ms REAL
);

CREATE INDEX IF NOT EXISTS idx_agent_file ON generations(agent_id, file_path);
CREATE INDEX IF NOT EXISTS idx_file_type ON generations(file_type);
CREATE INDEX IF NOT EXISTS idx_success ON generations(success);
CREATE INDEX IF NOT EXISTS idx_created_at ON generations(created_at);
EOF

# Function to query successful patterns from CodeSearch
query_codesearch_patterns() {
    local file_ext="${FILE_PATH##*.}"
    local prompt_keywords=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]' | grep -o '[a-z]\{3,\}' | tr '\n' ' ' | head -c 200)

    log "Querying CodeSearch for patterns: file_type=$file_ext, keywords=$prompt_keywords"

    # Use CodeSearch search to find similar successful patterns
    if [[ -f "$CODESEARCH_INDEX/search.sh" ]]; then
        "$CODESEARCH_INDEX/search.sh" "$file_ext $prompt_keywords" --top 5 2>/dev/null | \
        jq -r '.[] | select(.success == true) | .prompt' 2>/dev/null | \
        head -3 | \
        sed 's/"/\\"/g' | \
        awk '{printf "\"%s\"\\n", $0}' || \
        echo ""
    else
        log "CodeSearch not found at $CODESEARCH_INDEX, skipping pattern lookup"
        echo ""
    fi
}

# Function to store generation in CodeSearch
store_in_codesearch() {
    local success="$1"
    local prompt="$2"
    local generated_code="$3"
    local file_type="$4"

    # Store for future pattern matching
    local metadata=$(cat <<EOF
{
    "agent_id": "$AGENT_ID",
    "file_type": "$file_type",
    "model": "$MODEL",
    "success": $success,
    "created_at": "$(date -Iseconds)",
    "prompt_length": ${#prompt},
    "code_length": ${#generated_code}
}
EOF
)

    # Use CodeSearch to store the pattern
    if [[ -f "$CODESEARCH_INDEX/store.sh" ]]; then
        echo "$prompt" | \
        "$CODESEARCH_INDEX/store.sh" --metadata "$metadata" --type "prompt_pattern" 2>/dev/null || true
    fi
}

# Function to generate code using Cerebras
generate_code() {
    local enhanced_prompt="$1"

    log "Generating code with Cerebras (model: $MODEL)..."

    local request_body=$(jq -n \
        --arg model "$MODEL" \
        --arg prompt "$enhanced_prompt" \
        '{
            model: $model,
            messages: [
                {
                    role: "system",
                    content: "You are an expert software developer. Generate clean, efficient, and well-documented code. Follow the provided context and successful patterns."
                },
                {
                    role: "user",
                    content: $prompt
                }
            ],
            max_tokens: 8192,
            temperature: 0.1,
            stream: false
        }')

    local response=$(curl -s -X POST "$BASE_URL/chat/completions" \
        -H "Authorization: Bearer $CEREBRAS_API_KEY" \
        -H "Content-Type: application/json" \
        -d "$request_body")

    # Check for errors
    if echo "$response" | jq -e '.error' >/dev/null 2>&1; then
        local error_msg=$(echo "$response" | jq -r '.error.message')
        echo "ERROR:$error_msg"
        return 1
    fi

    local generated_code=$(echo "$response" | jq -r '.choices[0].message.content')
    if [[ "$generated_code" == "null" || -z "$generated_code" ]]; then
        echo "ERROR:No content generated"
        return 1
    fi

    echo "$generated_code"
    return 0
}

# Function to test generated code
test_code() {
    local code="$1"

    if [[ -z "${TEST_COMMAND:-}" ]]; then
        log "No test command provided, skipping tests"
        return 0
    fi

    log "Testing generated code with: $TEST_COMMAND"

    # Create backup of existing file
    local backup_path=""
    if [[ -f "$FILE_PATH" ]]; then
        backup_path="${FILE_PATH}.backup.$(date +%s)"
        cp "$FILE_PATH" "$backup_path"
    fi

    # Write generated code
    echo "$code" > "$FILE_PATH"

    # Run test with timeout
    local test_output=""
    local test_success=false

    if timeout "$TEST_TIMEOUT" bash -c "$TEST_COMMAND" 2>&1; then
        test_success=true
        test_output="Tests passed successfully"
    else
        local exit_code=$?
        if [[ $exit_code -eq 124 ]]; then
            test_output="Test timed out after ${TEST_TIMEOUT}s"
        else
            test_output="Tests failed with exit code $exit_code"
        fi
    fi

    # Restore backup if test failed
    if [[ "$test_success" != "true" && -n "$backup_path" ]]; then
        mv "$backup_path" "$FILE_PATH"
    elif [[ -n "$backup_path" ]]; then
        rm "$backup_path"
    fi

    echo "$test_output"
    [[ "$test_success" == "true" ]]
}

# Main execution
log "Starting code generation coordination for agent: $AGENT_ID"
log "Target file: $FILE_PATH"
log "File type: ${FILE_PATH##*.}"

# Extract file type
FILE_TYPE="${FILE_PATH##*.}"

# Query CodeSearch for successful patterns
PATTERNS=$(query_codesearch_patterns)
log "Found ${#PATTERNS} pattern examples"

# Build enhanced prompt with patterns
ENHANCED_PROMPT="# Task
Generate code for: $FILE_PATH

# Requirements
$PROMPT

# Context Files"
if [[ -n "$CONTEXT_FILES" ]]; then
    IFS=',' read -ra FILES <<< "$CONTEXT_FILES"
    for file in "${FILES[@]}"; do
        if [[ -f "$file" ]]; then
            ENHANCED_PROMPT="$ENHANCED_PROMPT

## $file
\`\`\`
$(cat "$file")
\`\`\`"
        fi
    done
fi

# Add successful patterns if found
if [[ -n "$PATTERNS" ]]; then
    ENHANCED_PROMPT="$ENHANCED_PROMPT

# Successful Patterns (Reference Only)
These patterns have worked successfully for similar tasks:"
    echo "$PATTERNS" | while read -r pattern; do
        if [[ -n "$pattern" ]]; then
            ENHANCED_PROMPT="$ENHANCED_PROMPT

Previous Success:
$pattern"
        fi
    done
fi

ENHANCED_PROMPT="$ENHANCED_PROMPT

# Instructions
- Generate clean, production-ready code
- Follow the patterns shown in successful examples
- Include proper error handling and documentation
- Ensure compatibility with existing codebase"

# Track attempts
ATTEMPT=1
FINAL_SUCCESS=false
FINAL_CODE=""
FINAL_ERROR=""

while [[ $ATTEMPT -le $MAX_ATTEMPTS ]]; do
    log "Attempt $ATTEMPT/$MAX_ATTEMPTS"

    # Generate code
    local generation_result=$(generate_code "$ENHANCED_PROMPT")

    if [[ "$generation_result" == ERROR:* ]]; then
        FINAL_ERROR="${generation_result#ERROR:}"
        log "Generation failed: $FINAL_ERROR"
    else
        # Test the generated code
        local test_result=$(test_code "$generation_result")
        local test_success=$?

        if [[ $test_success -eq 0 ]]; then
            FINAL_SUCCESS=true
            FINAL_CODE="$generation_result"
            log "Generation successful on attempt $ATTEMPT"
            break
        else
            FINAL_ERROR="$test_result"
            log "Test failed on attempt $ATTEMPT: $FINAL_ERROR"

            # Enhance prompt with error feedback for retry
            ENHANCED_PROMPT="$ENHANCED_PROMPT

# Previous Attempt Failed
Error: $FINAL_ERROR

Please fix the issue and try again."
        fi
    fi

    ATTEMPT=$((ATTEMPT + 1))
done

# Calculate confidence score
CONFIDENCE=0.0
if [[ "$FINAL_SUCCESS" == "true" ]]; then
    CONFIDENCE=$(awk "BEGIN {print 1.0 - ($ATTEMPT - 1) / $MAX_ATTEMPTS}")
fi

# Store in database
sqlite3 "$DB_PATH" <<EOF
INSERT INTO generations (
    agent_id, file_path, file_type, prompt, context_files, model,
    pattern_examples, generated_code, test_command, test_output,
    success, error_message, attempts, confidence_score
) VALUES (
    '$AGENT_ID',
    '$FILE_PATH',
    '$FILE_TYPE',
    $(printf '%s' "$PROMPT" | sed "s/'/''/g"),
    '${CONTEXT_FILES:-}',
    '$MODEL',
    $(printf '%s' "$PATTERNS" | sed "s/'/''/g"),
    $(printf '%s' "$FINAL_CODE" | sed "s/'/''/g"),
    '${TEST_COMMAND:-}',
    $(printf '%s' "$FINAL_ERROR" | sed "s/'/''/g"),
    $FINAL_SUCCESS,
    $(printf '%s' "$FINAL_ERROR" | sed "s/'/''/g"),
    $((ATTEMPT - 1)),
    $CONFIDENCE
);
EOF

# Store in CodeSearch for future learning
store_in_codesearch "$FINAL_SUCCESS" "$PROMPT" "$FINAL_CODE" "$FILE_TYPE"

# Final result
if [[ "$FINAL_SUCCESS" == "true" ]]; then
    echo "✅ Code generation successful!"
    echo "📁 File: $FILE_PATH"
    echo "🔧 Attempts: $((ATTEMPT - 1))/$MAX_ATTEMPTS"
    echo "📊 Confidence: $(printf '%.1f%%' $(echo "$CONFIDENCE * 100" | bc -l))"
    echo "💾 Pattern stored in CodeSearch"
else
    echo "❌ Code generation failed after $MAX_ATTEMPTS attempts"
    echo "📁 File: $FILE_PATH"
    echo "❌ Error: $FINAL_ERROR"
fi

exit $([[ "$FINAL_SUCCESS" == "true" ]] && echo 0 || echo 1)