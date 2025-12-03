---
name: cfn-expert-update
description: Update CFN system expert agent with relevant git commits and project changes
version: 1.0.0
tags: [expert, update, git, knowledge]
status: production
---

# CFN Expert Update Skill

## Purpose

Updates the CFN system expert agent's knowledge base with relevant git commits and project changes.

## Usage

```bash
bash .claude/skills/cfn-expert-update/update-expert.sh [--since=commit_hash] [--force]
```

## Options

- `--since=<hash>`: Update from specific commit
- `--force`: Force update even if no changes detected
