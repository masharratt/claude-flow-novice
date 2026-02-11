# CFN Migration Summary

**Date:** 2026-02-11 12:29:47
**Backup Location:** /home/masharratt/.claude-migration-backup-20260211-122918

## What Was Migrated

### Directories


### Files


### Universal Playwright Setup
- Docker image: `claude-playwright:latest`
- Screenshots: `~/.claude/playwright-screenshots/`
- Build script: `~/.claude/playwright/build-image.sh`

## Post-Migration Tasks

### 1. Rebuild Playwright Docker Image
```bash
cd ~/.claude/playwright/
./build-image.sh
```

### 2. Rebuild cfn-codesearch Binary
```bash
cd ~/.claude/skills/cfn-codesearch/
./rebuild.sh
# Optional: install globally
sudo cp target/release/codesearch /usr/local/bin/
```

### 3. Update Settings Files

**Global settings:** Review and replace
```bash
# Compare differences
diff ~/.claude/settings.json ~/.claude/settings.json.cfn-migrated

# When ready:
mv ~/.claude/settings.json.cfn-migrated ~/.claude/settings.json
```

**Project settings:** Review and replace
```bash
# Compare differences
diff .claude/settings.json .claude/settings.json.cfn-migrated

# When ready:
mv .claude/settings.json.cfn-migrated .claude/settings.json
```

**IMPORTANT:** Add your actual Z.ai API token to project settings.json env section.

### 4. Update ~/.claude/CLAUDE.md

Add CFN-specific instructions to global CLAUDE.md so all projects inherit:

```markdown
## CFN Operating Guide

- **CodeSearch FIRST:** Query CodeSearch index before grep/glob
- **Agent usage:** Non-trivial tasks → CFN Loop
- **Files:** Subdirs only, never project root
- **Secrets:** Never hardcode, always redact

See: ~/.claude/skills/cfn-loop-orchestration-v2/ for coordination patterns
```

### 5. Test in Another Project

```bash
cd ~/projects/daily-reach
claude code  # or your preferred project

# Verify CFN skills are available:
# Type /cfn-<tab> and confirm autocomplete works

# Test spawning an agent:
# "Please use the cfn-loop to analyze this codebase"
```

### 6. Clean Up Project .claude/ (Optional)

Once confirmed working, clean up migrated backups:
```bash
# In project
rm -f .claude/**/*.before-path-fix
rm -f .claude/settings.json.before-cfn-migration
rm -f .claude/settings.local.json.before-cfn-migration
```

## Rollback Instructions

If something breaks:
```bash
# Restore global
rm -rf ~/.claude/
cp -a /home/masharratt/.claude-migration-backup-20260211-122918/global-before ~/.claude

# Restore project
rm -rf /home/masharratt/projects/claude-flow-novice/.claude
cp -a /home/masharratt/.claude-migration-backup-20260211-122918/project-before /home/masharratt/projects/claude-flow-novice/.claude
```

## Verification Checklist

- [ ] Playwright Docker image builds: `docker images | grep claude-playwright`
- [ ] CodeSearch binary works: `~/.claude/skills/cfn-codesearch/target/release/codesearch --version`
- [ ] Symlinks created in project: `ls -la .claude/`
- [ ] CFN skills available in other projects
- [ ] Hooks execute without errors
- [ ] Agent spawning works with /cfn-loop-task

