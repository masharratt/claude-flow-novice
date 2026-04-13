---
name: commit
description: Stage, commit, and push changes using a background github-commit-agent. Accepts optional args for message override or push control.
version: 1.0.0
tags: [git, commit, push, background]
status: production
---

# Commit and Push Skill

**Purpose:** Stage relevant changes, create a conventional commit, and push to remote — all delegated to a background `github-commit-agent` so the main conversation stays unblocked.

## Usage

```
/commit
/commit "optional commit message override"
/commit --no-push
```

## Behavior

When invoked, spawn a **background** `github-commit-agent` with `run_in_background: true`.

### Agent prompt to use

```
You are handling a git commit and push operation.

Context:
- Working directory: {CWD}
- User args: {ARGS}

Steps:
1. Run `git status` (no -uall flag) to see untracked/modified files.
2. Run `git diff --stat HEAD` to understand scope of changes.
3. Run `git log --oneline -5` to match existing commit message style.
4. Stage relevant files by name (avoid `git add -A` or `git add .` to prevent accidentally including secrets or large binaries). Skip: .env, *.key, *.pem, credentials.*, *.secret.
5. If the user provided a message override in args, use it. Otherwise draft a conventional commit message (feat/fix/chore/docs/refactor) focused on "why" not "what", 1-2 sentences max.
6. Commit using HEREDOC format:
   git commit -m "$(cat <<'EOF'
   <message>

   Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
   EOF
   )"
7. Unless --no-push was passed, run `git push`.
8. Run `git status` to confirm clean working tree.
9. Return: branch name, commit hash, files committed, push status.

Important:
- NEVER force push, reset --hard, or use --no-verify.
- NEVER commit .env or credential files.
- If the pre-commit hook fails, fix the issue and create a NEW commit (never --amend).
- If on main/master and push would be force push, warn and abort.
```

### After spawning

- Inform the user the commit agent is running in the background.
- When the agent completes, summarize: commit hash, files staged, push result.

## Args parsing

| Arg | Behavior |
|-----|----------|
| (none) | Auto-generate commit message, push |
| `"message text"` | Use provided message, push |
| `--no-push` | Commit only, skip push |
| `--no-push "message"` | Commit with message, skip push |
