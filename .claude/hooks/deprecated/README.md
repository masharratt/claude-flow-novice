# Deprecated Hooks

These hooks have been superseded by the integrated post-edit pipeline (`config/hooks/post-edit-pipeline.js`) and settings.json hook configuration.

## Deprecation Date: 2025-12-10

## Why Deprecated

| Script | Superseded By |
|--------|---------------|
| cfn-credential-scanner.sh | Pipeline Phase 2 security scanner |
| cfn-lint-sql-injection.sh | Pipeline Phase 2.6 SQL injection detection |
| cfn-detect-hardcoded-credentials.sh | Pipeline Phase 2 security scanner |
| cfn-invoke-security-validation.sh | Pipeline Phase 2 security scanner |
| cfn-post-edit.sh | Full pipeline via PostToolUse hook |
| cfn-pre-edit-backup.sh | cfn-invoke-pre-edit.sh (wired in settings.json) |
| cfn-invoke-post-edit-ts.sh | Pipeline handles TypeScript directly |
| cfn-invoke-pre-edit-ts.sh | Pre-edit backup wired in settings.json |

## Active Hooks (in parent directory)

- `cfn-invoke-pre-edit.sh` - Pre-edit backup (WIRED)
- `cfn-precompact-enhanced.sh` - Context preservation (WIRED)
- `cfn-restore-from-backup.sh` - Revert capability
- `cfn-subagent-start.sh` - Future use
- `cfn-subagent-stop.sh` - Future use
- `install-git-hooks.sh` - Git integration
