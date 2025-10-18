# Git Secrets Setup

This repository uses [git-secrets](https://github.com/awslabs/git-secrets) to prevent committing secrets.

## Installation Status

✅ git-secrets is installed in `~/.local/bin/git-secrets`
✅ Pre-commit hooks configured
✅ Custom patterns for Anthropic/Z.ai API keys configured

## Verification

Check installation:
```bash
~/.local/bin/git-secrets --list
# Or if added to PATH:
git-secrets --list
```

Test scanning:
```bash
echo "ANTHROPIC_API_KEY=sk-ant-api03-test" > test.txt
~/.local/bin/git-secrets --scan test.txt
rm test.txt
```

## Adding to PATH (Optional)

For convenience, add git-secrets to your PATH:

**Linux/macOS:**
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
# Or for zsh:
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.bashrc  # or source ~/.zshrc
```

**Windows (WSL):**
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

After adding to PATH, you can use `git-secrets` directly instead of `~/.local/bin/git-secrets`.

## Patterns Configured

- Anthropic API Keys: `sk-ant-api03-[a-zA-Z0-9\-_]{95}`
- Z.ai API Keys: `[a-f0-9]{32}\.[a-zA-Z0-9]{16}`
- NPM Tokens: `npm_[a-zA-Z0-9]{36}`
- AWS credentials (via --register-aws)
- Generic API keys and secrets

## Pre-commit Hook

The git-secrets pre-commit hook will:
1. Scan all staged files for secrets
2. Block commits containing secrets
3. Show which patterns were detected

## Emergency Bypass (Not Recommended)

```bash
git commit --no-verify
```

## Support

- GitHub: https://github.com/awslabs/git-secrets
- Claude Flow Novice: https://github.com/ruvnet/claude-flow-novice
