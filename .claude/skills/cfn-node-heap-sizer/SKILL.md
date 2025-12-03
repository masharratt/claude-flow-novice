---
name: cfn-node-heap-sizer
description: Task mode heap limiter for memory-constrained environments
version: 1.0.0
tags: [memory, heap, node, performance]
status: production
---

# CFN Node Heap Sizer Skill

## Purpose

Limits Node.js heap size for Task tool agents to prevent OOM issues in memory-constrained environments.

## Usage

```bash
bash .claude/skills/cfn-node-heap-sizer/task-mode-heap-limiter.sh [--max-size=MB]
```

## Configuration

The script sets `--max-old-space-size` for Node.js processes spawned by agents.
