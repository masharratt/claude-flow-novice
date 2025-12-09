# Cerebras Code Generator Skill

## Description
Generates code using Cerebras API with context tracking and history management. Acts as an OpenAI-compatible wrapper for Cerebras API.

## Configuration
```bash
# Required environment variables
export CEREBRAS_API_KEY="your-api-key"
export CEREBRAS_MODEL="qwen2.5-coder-32b"  # or other Cerebras model

# Optional settings
export CEREBRAS_BASE_URL="https://api.cerebras.ai/v1"
export CONTEXT_DB_PATH="./.claude/skills/cfn-cerebras-code-generator/contexts.db"
```

## Usage

```bash
# Basic code generation
./generate-code.sh \
  --file-path "/path/to/file.ext" \
  --prompt "Create a REST API endpoint" \
  --context-files "src/models.py,src/utils.py"

# With explicit model
./generate-code.sh \
  --model "llama-3.1-70b" \
  --file-path "/path/to/file.py" \
  --prompt "Implement authentication middleware"
```

## Implementation Details

### Context Tracking
- Stores generation history in SQLite database
- Tracks what worked and what didn't
- Maintains conversation context
- Provides examples of successful patterns

### OpenAI Compatibility
- Uses OpenAI-compatible request/response format
- Supports streaming responses
- Handles token limits and rate limiting
- Automatic retry logic

### Features
- ✅ Visual diff generation
- ✅ Context file inclusion
- ✅ Error handling and validation
- ✅ Generation history tracking
- ✅ Success pattern learning
- ✅ Multiple model support