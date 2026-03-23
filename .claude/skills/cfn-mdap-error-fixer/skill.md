# Setup (one-time)
cd .claude/skills/cfn-mdap-error-fixer/lib/fixer
npm install

# Run from your Rust project directory
cd /path/to/your/rust-project
export CEREBRAS_API_KEY="your-key"
npx tsx /path/to/.claude/skills/cfn-mdap-error-fixer/lib/fixer/cerebras-gated-fixer-v2.ts

# Or specify project path explicitly
npx tsx cerebras-gated-fixer-v2.ts --project=/path/to/rust-project

# Or use environment variable
export RUST_PROJECT_PATH=/path/to/rust-project
npx tsx cerebras-gated-fixer-v2.ts