# ACE Context Tests - Archived 2025-11-13

## Why Archived
ACE (Adaptive Context Engine) not integrated with Docker coordinator architecture.
Docker coordinator uses embedded context in agent environment variables.

## Tests Included
- test-ace-context-lookup.sh - Validates ACE context retrieval API
- test_ace_reflection_hook.sh - Validates ACE reflection hook patterns

## Restoration Criteria
Restore these tests if:
1. Coordinator adds ACE integration for richer context
2. Agent spawning requires dynamic context lookup
3. Reflection hooks needed for agent introspection

## Restoration Process
```bash
mv tests/archive/historical/ace/*.sh tests/
# Update test paths if directory structure changed
```
