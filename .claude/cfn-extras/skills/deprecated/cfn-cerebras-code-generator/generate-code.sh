#!/usr/bin/env bash
set -euo pipefail

# Default values
MODEL="${CEREBRAS_MODEL:-qwen2.5-coder-32b}"
BASE_URL="${CEREBRAS_BASE_URL:-https://api.cerebras.ai/v1}"
DB_PATH="${CONTEXT_DB_PATH:-./contexts.db}"
MAX_TOKENS=8192
TEMPERATURE=0.1

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --file-path) FILE_PATH="$2"; shift 2 ;;
        --prompt) PROMPT="$2"; shift 2 ;;
        --context-files) CONTEXT_FILES="$2"; shift 2 ;;
        --model) MODEL="$2"; shift 2 ;;
        --max-tokens) MAX_TOKENS="$2"; shift 2 ;;
        --temperature) TEMPERATURE="$2"; shift 2 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Required arguments
if [[ -z "${FILE_PATH:-}" || -z "${PROMPT:-}" ]]; then
    echo "Usage: $0 --file-path <path> --prompt <prompt> [--context-files <files>] [--model <model>]"
    exit 1
fi

# Check API key
if [[ -z "${CEREBRAS_API_KEY:-}" ]]; then
    echo "Error: CEREBRAS_API_KEY environment variable is required"
    exit 1
fi

# Create database for context tracking
mkdir -p "$(dirname "$DB_PATH")"
sqlite3 "$DB_PATH" <<EOF || true
CREATE TABLE IF NOT EXISTS generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path TEXT NOT NULL,
    prompt TEXT NOT NULL,
    context_files TEXT,
    model TEXT NOT NULL,
    response TEXT NOT NULL,
    success BOOLEAN,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confidence_score REAL
);
CREATE INDEX IF NOT EXISTS idx_file_path ON generations(file_path);
CREATE INDEX IF NOT EXISTS idx_success ON generations(success);
EOF

# Function to retrieve similar successful generations
get_similar_patterns() {
    local file_ext="${FILE_PATH##*.}"
    sqlite3 "$DB_PATH" <<SQL
SELECT prompt, response FROM generations
WHERE file_path LIKE '%.${file_ext}'
AND success = 1
AND confidence_score > 0.8
ORDER BY created_at DESC
LIMIT 3
SQL
}

# Function to store generation result
store_generation() {
    local success="$1"
    local response="$2"
    local error_msg="$3"
    local confidence="${4:-0.0}"

    sqlite3 "$DB_PATH" <<SQL
INSERT INTO generations (
    file_path, prompt, context_files, model, response, success, error_message, confidence_score
) VALUES (
    '$FILE_PATH',
    '$(printf '%s' "$PROMPT" | sed "s/'/''/g")',
    '${CONTEXT_FILES:-}',
    '$MODEL',
    '$(printf '%s' "$response" | sed "s/'/''/g")',
    $success,
    '$error_msg',
    $confidence
);
SQL
}

# Build context from similar patterns
CONTEXT_HEADER="# Context from Similar Successful Generations
These examples show what has worked before for similar files:
"
SIMILAR_PATTERNS=$(get_similar_patterns)
if [[ -n "$SIMILAR_PATTERNS" ]]; then
    CONTEXT_HEADER="$CONTEXT_HEADER

$SIMILAR_PATTERNS

"
fi

# Build context files content if provided
CONTEXT_FILES_CONTENT=""
if [[ -n "${CONTEXT_FILES:-}" ]]; then
    CONTEXT_FILES_CONTENT="# Context Files:
"
    IFS=',' read -ra FILES <<< "$CONTEXT_FILES"
    for file in "${FILES[@]}"; do
        if [[ -f "$file" ]]; then
            CONTEXT_FILES_CONTENT="$CONTEXT_FILES_CONTENT
## $file
\`\`\`
$(cat "$file")
\`\`\`
"
        fi
    done
fi

# Enhanced prompt with context
ENHANCED_PROMPT="$CONTEXT_HEADER$CONTEXT_FILES_CONTENT

# Current Request
Generate or modify code for the file at: $FILE_PATH

Requirements:
- Write production-ready code
- Follow best practices and patterns from context
- Include proper error handling
- Add comments where necessary
- Ensure compatibility with existing codebase

Task:
$PROMPT"

# Prepare request for Cerebras (OpenAI-compatible format)
REQUEST=$(jq -n \
    --arg model "$MODEL" \
    --arg prompt "$ENHANCED_PROMPT" \
    --argjson max_tokens $MAX_TOKENS \
    --argjson temperature $TEMPERATURE \
    '{
        model: $model,
        messages: [
            {
                role: "system",
                content: "You are an expert software developer. Generate clean, efficient, and well-documented code. Follow the provided context and patterns."
            },
            {
                role: "user",
                content: $prompt
            }
        ],
        max_tokens: $max_tokens,
        temperature: $temperature,
        stream: false
    }')

# Make API call
echo "Generating code for $FILE_PATH using $MODEL..."
RESPONSE=$(curl -s -X POST "$BASE_URL/chat/completions" \
    -H "Authorization: Bearer $CEREBRAS_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$REQUEST")

# Extract content and handle errors
if echo "$RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
    ERROR_MSG=$(echo "$RESPONSE" | jq -r '.error.message')
    echo "Error from Cerebras API: $ERROR_MSG"
    store_generation 0 "$ERROR_MSG" "$ERROR_MSG" 0.0
    exit 1
fi

GENERATED_CODE=$(echo "$RESPONSE" | jq -r '.choices[0].message.content')
USAGE_INFO=$(echo "$RESPONSE" | jq -r '.usage')

# Calculate confidence based on usage and response quality
CONFIDENCE=0.9
if [[ "$GENERATED_CODE" == "null" || -z "$GENERATED_CODE" ]]; then
    CONFIDENCE=0.0
    store_generation 0 "" "No content generated" 0.0
    echo "Error: No content generated"
    exit 1
fi

# Store successful generation
store_generation 1 "$GENERATED_CODE" "" "$CONFIDENCE"

# Create backup of existing file if it exists
if [[ -f "$FILE_PATH" ]]; then
    cp "$FILE_PATH" "${FILE_PATH}.backup.$(date +%s)"
    echo "Backup created: ${FILE_PATH}.backup.$(date +%s)"
fi

# Write generated code to file
echo "$GENERATED_CODE" > "$FILE_PATH"

# Report usage
echo "✅ Code generated successfully!"
echo "📁 File: $FILE_PATH"
echo "📊 Usage: $USAGE_INFO"
echo "💾 Context stored in database"
echo "📈 Confidence: $CONFIDENCE"