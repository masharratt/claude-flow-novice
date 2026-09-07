#!/bin/bash
# cfn-fleet lib/cmd-db-clean.sh — thin alias so the router's literal
# lib/cmd-<subcommand>.sh mapping reaches the db-clean implementation, which
# lives in cmd-db.sh (SPEC layout defines no separate db-clean file).
# Real-run origin: junk rehearsal-DB reaper (run e59a7826).

if ! command -v fleet_die >/dev/null 2>&1; then
    # Standalone/test sourcing: pull in the shared roster helpers.
    # shellcheck disable=SC1091
    source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
fi
# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/cmd-db.sh"

main() {
    _fleet_db_clean "$@"
}
