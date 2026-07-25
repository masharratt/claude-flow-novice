#!/bin/bash
# cfn-selftest: not-a-hook manually-invoked CLI, never fires on an event
# Quick CLI for CodeSearch usage reports
# Usage: cs-report [--project <name>] [--days <n>] [--raw]
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HOOK_DIR/cfn-codesearch-logger.sh"
cs_report "$@"
