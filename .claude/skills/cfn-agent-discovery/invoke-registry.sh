#!/usr/bin/env bash
# Invoke Agent Registry Discovery

# Ensure script runs from project root
cd "$(git rev-parse --show-toplevel)" || exit 1

# Run discovery script
./skills/agent-discovery/discover-agents.py

# Optional: output registry to stdout
cat .claude/skills/agent-discovery/agents-registry.json