---
description: "Find documentation that's out of sync with code"
---

# /detect-stale-docs - Find Outdated Documentation

This is a convenience alias. Full implementation: `/cfn-codesearch:cfn-detect-stale-docs`

Automatically finds documentation that does not match the current code using CodeSearch semantic analysis.

## What it does

- Cross-references code to check if files/functions mentioned in docs still exist
- Flags docs mentioning "legacy", "deprecated", or "obsolete"
- Detects orphan docs with no code references
- Assigns a staleness score (0-100+)

## Prerequisites

- Codebase must be indexed first (`/codebase-reindex`)
- OPENAI_API_KEY must be set