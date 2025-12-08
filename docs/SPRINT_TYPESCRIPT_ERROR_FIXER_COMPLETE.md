cd .claude/skills/cfn-compilation-error-fixer/lib/fixer
export CEREBRAS_API_KEY="your-api-key"
export TS_PROJECT_PATH="/path/to/your/typescript/project"

# Phase 1: Bulk fixing
npx tsx typescript-gated-fixer-v2.ts

# Phase 2: Dedicated agent cleanup (for remaining errors)
# Spawn typescript-specialist agent with provided prompt