#!/usr/bin/env bash
set -euo pipefail

# CFN Migration to Global ~/.claude/
# Moves agents, skills, commands, hooks, and supporting infrastructure to universal location
# Creates symlinks in project for continued development

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_CLAUDE_DIR="$SCRIPT_DIR/.claude"
GLOBAL_CLAUDE_DIR="$HOME/.claude"
BACKUP_DIR="$HOME/.claude-migration-backup-$(date +%Y%m%d-%H%M%S)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[MIGRATE]${NC} $*"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

die() {
    error "$*"
    exit 1
}

# Preflight checks
log "Starting CFN migration to global ~/.claude/"
log "Project: $SCRIPT_DIR"
log "Global: $GLOBAL_CLAUDE_DIR"

[ -d "$PROJECT_CLAUDE_DIR" ] || die "Project .claude/ directory not found"
[ -d "$GLOBAL_CLAUDE_DIR" ] || die "Global ~/.claude/ directory not found"

# Create backup
log "Creating backup at $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
cp -a "$GLOBAL_CLAUDE_DIR" "$BACKUP_DIR/global-before"
cp -a "$PROJECT_CLAUDE_DIR" "$BACKUP_DIR/project-before"

# Directories to migrate
MIGRATE_DIRS=(
    "agents"
    "skills"
    "commands"
    "hooks"
    "cfn-config"
    "cfn-data"
    "cfn-extras"
    "cfn-scripts"
    "core"
    "helpers"
    "prompts"
    "tooling"
    "agent-principles"
    "adaptive-context"
)

# Supporting files to migrate
MIGRATE_FILES=(
    "CLAUDE.md"
)

# Step 1: Move directories (excluding build artifacts)
log ""
log "Step 1: Moving directories to ~/.claude/"
for dir in "${MIGRATE_DIRS[@]}"; do
    src="$PROJECT_CLAUDE_DIR/$dir"
    dst="$GLOBAL_CLAUDE_DIR/$dir"

    if [ ! -d "$src" ]; then
        warn "Skipping $dir (not found)"
        continue
    fi

    log "  Migrating $dir..."

    if [ -d "$dst" ]; then
        warn "    $dst already exists, merging..."
        rsync -a --exclude='target/' --exclude='node_modules/' --exclude='*.db-shm' --exclude='*.db-wal' "$src/" "$dst/"
    else
        mkdir -p "$(dirname "$dst")"
        rsync -a --exclude='target/' --exclude='node_modules/' --exclude='*.db-shm' --exclude='*.db-wal' "$src/" "$dst/"
    fi
done

# Step 2: Move supporting files
log ""
log "Step 2: Moving supporting files..."
for file in "${MIGRATE_FILES[@]}"; do
    src="$PROJECT_CLAUDE_DIR/$file"
    dst="$GLOBAL_CLAUDE_DIR/$file"

    if [ ! -f "$src" ]; then
        warn "Skipping $file (not found)"
        continue
    fi

    if [ -f "$dst" ]; then
        warn "  $file exists at destination, creating .cfn-migrated backup"
        cp "$dst" "$dst.before-cfn-migration"
    fi

    log "  Copying $file..."
    cp "$src" "$dst"
done

# Step 3: Create Playwright universal setup
log ""
log "Step 3: Setting up universal Playwright..."
mkdir -p "$GLOBAL_CLAUDE_DIR/playwright"
mkdir -p "$GLOBAL_CLAUDE_DIR/playwright-screenshots"

if [ -f "$SCRIPT_DIR/Dockerfile.playwright" ]; then
    cp "$SCRIPT_DIR/Dockerfile.playwright" "$GLOBAL_CLAUDE_DIR/playwright/"
    log "  Copied Dockerfile.playwright"
fi

if [ -d "$SCRIPT_DIR/scripts" ] && [ -f "$SCRIPT_DIR/scripts/playwright-mcp-server.js" ]; then
    mkdir -p "$GLOBAL_CLAUDE_DIR/playwright/scripts"
    cp "$SCRIPT_DIR/scripts/playwright-mcp-server.js" "$GLOBAL_CLAUDE_DIR/playwright/scripts/"
    log "  Copied playwright-mcp-server.js"
fi

# Create Playwright Docker build script
cat > "$GLOBAL_CLAUDE_DIR/playwright/build-image.sh" << 'EOF'
#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f "Dockerfile.playwright" ]; then
    echo "Error: Dockerfile.playwright not found" >&2
    exit 1
fi

echo "Building claude-playwright:latest Docker image..."
docker build -f Dockerfile.playwright -t claude-playwright:latest .

echo ""
echo "Image built successfully. To verify:"
echo "  docker images | grep claude-playwright"
EOF
chmod +x "$GLOBAL_CLAUDE_DIR/playwright/build-image.sh"
log "  Created build-image.sh"

# Step 4: Remove old project directories and create symlinks
log ""
log "Step 4: Creating symlinks in project..."
for dir in "${MIGRATE_DIRS[@]}"; do
    src="$PROJECT_CLAUDE_DIR/$dir"
    target="$GLOBAL_CLAUDE_DIR/$dir"

    if [ ! -d "$target" ]; then
        warn "Skipping symlink for $dir (target doesn't exist)"
        continue
    fi

    if [ -L "$src" ]; then
        warn "  $dir is already a symlink, skipping"
        continue
    fi

    if [ -d "$src" ]; then
        log "  Removing project $dir..."
        rm -rf "$src"
    fi

    log "  Symlinking $dir -> ~/.claude/$dir"
    ln -s "$target" "$src"
done

# Step 5: Fix path references in scripts
log ""
log "Step 5: Fixing path references in scripts..."

fix_script_paths() {
    local file="$1"
    local changed=0

    # Backup original
    cp "$file" "$file.before-path-fix"

    # Fix common patterns
    # 1. SCRIPT_DIR/../.. -> $HOME/.claude
    if grep -q 'PROJECT_ROOT.*SCRIPT_DIR/\.\./\.\.' "$file" 2>/dev/null; then
        sed -i 's|PROJECT_ROOT=.*SCRIPT_DIR/\.\./\.\.[^"]*|PROJECT_ROOT="${CLAUDE_PROJECT_DIR:-.}"|g' "$file"
        changed=1
    fi

    # 2. .claude/ relative paths -> $HOME/.claude/
    if grep -q '\.claude/\(hooks\|skills\|agents\|commands\)/' "$file" 2>/dev/null; then
        sed -i 's|"\./\.claude/|"$HOME/.claude/|g' "$file"
        sed -i "s|'/\.claude/|'\$HOME/.claude/|g" "$file"
        changed=1
    fi

    # 3. ${CLAUDE_PROJECT_DIR:-.}/.claude/ -> $HOME/.claude/
    if grep -q '\${CLAUDE_PROJECT_DIR:-\.}/\.claude/' "$file" 2>/dev/null; then
        sed -i 's|\${CLAUDE_PROJECT_DIR:-\.}/\.claude/|$HOME/.claude/|g' "$file"
        changed=1
    fi

    if [ $changed -eq 1 ]; then
        log "    Fixed: $file"
    fi
}

# Fix all shell scripts
find "$GLOBAL_CLAUDE_DIR/hooks" -type f -name '*.sh' 2>/dev/null | while read -r script; do
    fix_script_paths "$script"
done

find "$GLOBAL_CLAUDE_DIR/skills" -type f -name '*.sh' 2>/dev/null | while read -r script; do
    fix_script_paths "$script"
done

# Step 6: Update settings.json
log ""
log "Step 6: Updating settings.json files..."

GLOBAL_SETTINGS="$GLOBAL_CLAUDE_DIR/settings.json"
PROJECT_SETTINGS="$PROJECT_CLAUDE_DIR/settings.json"

# Backup settings
cp "$GLOBAL_SETTINGS" "$GLOBAL_SETTINGS.before-cfn-migration"
cp "$PROJECT_SETTINGS" "$PROJECT_SETTINGS.before-cfn-migration"

log "  Creating updated settings.json files..."
log "  NOTE: Manual review required - this script creates templates, not automatic merges"

cat > "$GLOBAL_CLAUDE_DIR/settings.json.cfn-migrated" << 'EOF'
{
  "permissions": {
    "allow": [
      "Bash(npx:*)",
      "Bash(claude:*)",
      "Bash(wsl:*)",
      "Bash(cat:*)",
      "Bash(ls:*)",
      "Bash(cd:*)",
      "Bash(pwd:*)",
      "Bash(mkdir:*)",
      "Bash(node:*)",
      "Bash(npm:*)",
      "Bash(yarn:*)",
      "Bash(git:*)",
      "Bash(which:*)",
      "Bash(echo:*)",
      "Bash(find:*)",
      "Bash(grep:*)",
      "Bash(curl:*)",
      "Bash(wget:*)",
      "WebSearch"
    ],
    "deny": [
      "Bash(rm -rf /)",
      "Bash(eval :*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Grep|Glob|Search",
        "hooks": [
          {
            "type": "command",
            "command": "bash $HOME/.claude/hooks/cfn-smart-search-hook.sh",
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'FILE=$(cat | jq -r \".tool_input.file_path // .tool_input.path // empty\"); [ -z \"$FILE\" ] && exit 0; if echo \"$FILE\" | grep -qE \"^\\\\.env$|\\\\.env\\\\.|\\\\.pem$|\\\\.key$|/\\\\.aws/|id_rsa|credentials\\\\.json|secrets\\\\.(json|yaml|yml)\"; then echo \"BLOCKED: Cannot edit sensitive file: $FILE\" >&2; exit 2; fi'",
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'INPUT=$(cat); FILE=$(echo \"$INPUT\" | jq -r \".tool_input.file_path // empty\"); CONTENT=$(echo \"$INPUT\" | jq -r \".tool_input.content // empty\"); [ -z \"$FILE\" ] && exit 0; if echo \"$FILE\" | grep -qE \"\\\\.json$\"; then echo \"$CONTENT\" | jq . >/dev/null 2>&1 || { echo \"BLOCKED: Invalid JSON\" >&2; exit 2; }; fi'",
            "timeout": 5
          }
        ]
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'INPUT=$(cat); FILE=$(echo \"$INPUT\" | jq -r \".tool_input.file_path // empty\"); [ -z \"$FILE\" ] || [ ! -f \"$FILE\" ] && exit 0; if echo \"$FILE\" | grep -qE \"package\\\\.json$|node_modules/|\\\\.git/|dist/|build/\"; then exit 0; fi; $HOME/.claude/hooks/cfn-invoke-pre-edit.sh \"$FILE\" --agent-id \"${AGENT_ID:-hook}\" >/dev/null 2>&1 || true'",
            "timeout": 30
          }
        ]
      },
      {
        "matcher": "WebSearch",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import json, sys, re; from datetime import datetime; input_data = json.load(sys.stdin); tool_input = input_data.get('tool_input', {}); query = tool_input.get('query', ''); current_year = str(datetime.now().year); has_year = re.search(r'\\\\b20\\\\d{2}\\\\b', query); has_temporal = any(word in query.lower() for word in ['latest', 'recent', 'current', 'new', 'now', 'today']); should_add_year = not has_year and not has_temporal; modified_query = f'{query} {current_year}' if should_add_year else query; output = {'hookSpecificOutput': {'hookEventName': 'PreToolUse', 'modifiedToolInput': {'query': modified_query}}}; print(json.dumps(output)); sys.exit(0)\"",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'INPUT=$(cat); EXIT_CODE=$(echo \"$INPUT\" | jq -r \".tool_result.exit_code // 0\"); STDERR=$(echo \"$INPUT\" | jq -r \".tool_result.stderr // empty\"); if [ \"$EXIT_CODE\" != \"0\" ] && [ -n \"$STDERR\" ]; then $HOME/.claude/skills/cfn-error-management/cli/capture-error.sh --error-type BASH_EXECUTION --message \"${STDERR:0:500}\" --context \"bash-tool\" --agent-id \"${AGENT_ID:-hook}\" 2>&1 || true; fi; echo \"[Hook] Command completed (exit: $EXIT_CODE)\" >&2'"
          }
        ]
      },
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'INPUT=$(cat); FILE=$(echo \"$INPUT\" | jq -r \".tool_input.file_path // .tool_input.path // empty\"); [ -z \"$FILE\" ] || [ ! -f \"$FILE\" ] && exit 0; if echo \"$FILE\" | grep -qE \"package\\\\.json$|node_modules/|\\\\.git/|dist/|build/\"; then exit 0; fi; cd \"${CLAUDE_PROJECT_DIR:-.}\"; node config/hooks/post-edit-pipeline.js \"$FILE\" --agent-id \"${AGENT_ID:-hook}\" 2>&1 | tail -20 || true'",
            "timeout": 45
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "manual",
        "hooks": [
          {
            "type": "command",
            "command": "bash $HOME/.claude/hooks/cfn-precompact-enhanced.sh"
          }
        ]
      },
      {
        "matcher": "auto",
        "hooks": [
          {
            "type": "command",
            "command": "bash $HOME/.claude/hooks/cfn-precompact-enhanced.sh"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "nohup ~/.local/bin/wsl-memory-monitor.sh > /dev/null 2>&1 & sleep 0.5 && echo \"[WSL Memory Monitor] Running (PID: $(cat /tmp/wsl-memory-monitor.pid 2>/dev/null || echo starting))\""
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'INPUT=$(cat); TRANSCRIPT=$(echo \"$INPUT\" | jq -r \".transcript_path // empty\"); AGENT_ID=$(echo \"$INPUT\" | jq -r \".agent_id // empty\"); [ -n \"$AGENT_ID\" ] && $HOME/.claude/skills/cfn-agent-lifecycle/cli/lifecycle-hook.sh complete --agent-id \"$AGENT_ID\" --status completed --confidence 0.92 2>&1 || true; [ -z \"$TRANSCRIPT\" ] || [ ! -f \"$TRANSCRIPT\" ] && exit 0; LINES=$(wc -l < \"$TRANSCRIPT\" 2>/dev/null || echo 0); if [ \"$LINES\" -lt 5 ]; then grep -qiE \"complete|finished|done|summary\" \"$TRANSCRIPT\" 2>/dev/null || echo \"{\\\\\"decision\\\\\":\\\\\"block\\\\\",\\\\\"reason\\\\\":\\\\\"Output incomplete ($LINES lines)\\\\\"}\"; fi'",
            "timeout": 15
          }
        ]
      }
    ]
  },
  "mcpServers": {
    "playwright": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "--init",
        "--name",
        "mcp-playwright-${AGENT_ID:-agent}",
        "--memory=1g",
        "--shm-size=2g",
        "-e",
        "AGENT_ID=${AGENT_ID:-agent}",
        "-e",
        "NODE_PATH=/usr/local/lib/node_modules",
        "-e",
        "PLAYWRIGHT_BROWSERS_PATH=/ms-playwright",
        "-v",
        "${HOME}/.claude/playwright-screenshots:/app/screenshots",
        "claude-playwright:latest",
        "node",
        "/app/scripts/playwright-mcp-server.js"
      ]
    }
  },
  "includeCoAuthoredBy": true,
  "tieredRouting": {
    "enabled": true
  }
}
EOF

cat > "$PROJECT_CLAUDE_DIR/settings.json.cfn-migrated" << 'EOF'
{
  "env": {
    "_ANTHROPIC_DEFAULT_HAIKU_MODEL": "glm-4.6",
    "_ANTHROPIC_DEFAULT_SONNET_MODEL": "glm-4.7",
    "_ANTHROPIC_DEFAULT_OPUS_MODEL": "glm-4.7",
    "_ANTHROPIC_BASE_URL": "https://api.z.ai/api/anthropic",
    "_ANTHROPIC_AUTH_TOKEN": "[REDACTED]"
  },
  "permissions": {
    "allow": [
      "Bash(npx claude-flow-novice :*)",
      "Bash(npm run lint)",
      "Bash(npm run test:*)",
      "Bash(npm test :*)",
      "Bash(git status)",
      "Bash(git diff :*)",
      "Bash(git log :*)",
      "Bash(git add :*)",
      "Bash(git commit :*)",
      "Bash(git push)",
      "Bash(jq :*)",
      "Bash(node :*)",
      "Bash(which :*)",
      "Bash(pwd)",
      "Bash(ls :*)"
    ]
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/cfn-SessionStart-cfn-build-ruvector.sh",
            "timeout": 60
          }
        ]
      }
    ]
  },
  "enableAllProjectMcpServers": true,
  "disabledMcpjsonServers": [
    "n8n-mcp",
    "shadcn",
    "zai-mcp-server",
    "ruv-swarm",
    "claude-flow",
    "chrome-devtools"
  ]
}
EOF

warn "  Created settings.json.cfn-migrated files (review and replace manually)"

# Step 7: Create codesearch rebuild script
log ""
log "Step 7: Creating codesearch rebuild script..."

cat > "$GLOBAL_CLAUDE_DIR/skills/cfn-codesearch/rebuild.sh" << 'EOF'
#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f "Cargo.toml" ]; then
    echo "Error: Cargo.toml not found. Are you in cfn-codesearch directory?" >&2
    exit 1
fi

echo "Rebuilding cfn-codesearch Rust binary..."
cargo build --release

echo ""
echo "Binary built at: target/release/codesearch"
echo "Install globally with:"
echo "  sudo cp target/release/codesearch /usr/local/bin/"
EOF
chmod +x "$GLOBAL_CLAUDE_DIR/skills/cfn-codesearch/rebuild.sh"

log "  Created rebuild.sh for cfn-codesearch"

# Step 8: Create migration summary
log ""
log "Step 8: Creating migration summary..."

cat > "$SCRIPT_DIR/MIGRATION_SUMMARY.md" << EOF
# CFN Migration Summary

**Date:** $(date +"%Y-%m-%d %H:%M:%S")
**Backup Location:** $BACKUP_DIR

## What Was Migrated

### Directories
$(printf '- %s\n' "${MIGRATE_DIRS[@]}")

### Files
$(printf '- %s\n' "${MIGRATE_FILES[@]}")

### Universal Playwright Setup
- Docker image: \`claude-playwright:latest\`
- Screenshots: \`~/.claude/playwright-screenshots/\`
- Build script: \`~/.claude/playwright/build-image.sh\`

## Post-Migration Tasks

### 1. Rebuild Playwright Docker Image
\`\`\`bash
cd ~/.claude/playwright/
./build-image.sh
\`\`\`

### 2. Rebuild cfn-codesearch Binary
\`\`\`bash
cd ~/.claude/skills/cfn-codesearch/
./rebuild.sh
# Optional: install globally
sudo cp target/release/codesearch /usr/local/bin/
\`\`\`

### 3. Update Settings Files

**Global settings:** Review and replace
\`\`\`bash
# Compare differences
diff ~/.claude/settings.json ~/.claude/settings.json.cfn-migrated

# When ready:
mv ~/.claude/settings.json.cfn-migrated ~/.claude/settings.json
\`\`\`

**Project settings:** Review and replace
\`\`\`bash
# Compare differences
diff .claude/settings.json .claude/settings.json.cfn-migrated

# When ready:
mv .claude/settings.json.cfn-migrated .claude/settings.json
\`\`\`

**IMPORTANT:** Add your actual Z.ai API token to project settings.json env section.

### 4. Update ~/.claude/CLAUDE.md

Add CFN-specific instructions to global CLAUDE.md so all projects inherit:

\`\`\`markdown
## CFN Operating Guide

- **CodeSearch FIRST:** Query CodeSearch index before grep/glob
- **Agent usage:** Non-trivial tasks → CFN Loop
- **Files:** Subdirs only, never project root
- **Secrets:** Never hardcode, always redact

See: ~/.claude/skills/cfn-loop-orchestration-v2/ for coordination patterns
\`\`\`

### 5. Test in Another Project

\`\`\`bash
cd ~/projects/daily-reach
claude code  # or your preferred project

# Verify CFN skills are available:
# Type /cfn-<tab> and confirm autocomplete works

# Test spawning an agent:
# "Please use the cfn-loop to analyze this codebase"
\`\`\`

### 6. Clean Up Project .claude/ (Optional)

Once confirmed working, clean up migrated backups:
\`\`\`bash
# In project
rm -f .claude/**/*.before-path-fix
rm -f .claude/settings.json.before-cfn-migration
rm -f .claude/settings.local.json.before-cfn-migration
\`\`\`

## Rollback Instructions

If something breaks:
\`\`\`bash
# Restore global
rm -rf ~/.claude/
cp -a $BACKUP_DIR/global-before ~/.claude

# Restore project
rm -rf $SCRIPT_DIR/.claude
cp -a $BACKUP_DIR/project-before $SCRIPT_DIR/.claude
\`\`\`

## Verification Checklist

- [ ] Playwright Docker image builds: \`docker images | grep claude-playwright\`
- [ ] CodeSearch binary works: \`~/.claude/skills/cfn-codesearch/target/release/codesearch --version\`
- [ ] Symlinks created in project: \`ls -la .claude/\`
- [ ] CFN skills available in other projects
- [ ] Hooks execute without errors
- [ ] Agent spawning works with /cfn-loop-task

EOF

log ""
log "${GREEN}Migration complete!${NC}"
log ""
log "Next steps:"
log "  1. Read MIGRATION_SUMMARY.md"
log "  2. Rebuild Playwright: cd ~/.claude/playwright/ && ./build-image.sh"
log "  3. Rebuild codesearch: cd ~/.claude/skills/cfn-codesearch/ && ./rebuild.sh"
log "  4. Update settings.json files (manual review required)"
log "  5. Test in another project"
log ""
log "Backup location: $BACKUP_DIR"
