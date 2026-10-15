#!/usr/bin/env bash
# One switch for the two exclusive modes.
#   mode.sh night    night mode on (turns work mode off first)
#   mode.sh work     work mode on (turns night mode off first, its report prints)
#   mode.sh off      both off (night report and work queue print if they were on)
#   mode.sh status   both flags
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NIGHT="$HERE/../cfn-night-mode/night-mode.sh"
WORK="$HERE/work-mode.sh"
case "${1:-}" in
    night) bash "$NIGHT" on ;;
    work) bash "$WORK" on ;;
    off)
        [ -f "${CFN_NIGHT_MODE_DIR:-$HOME/.claude}/.night-mode-active" ] && bash "$NIGHT" off
        [ -f "${CFN_WORK_MODE_DIR:-$HOME/.claude}/.work-mode-active" ] && bash "$WORK" off
        echo "night mode: off | work mode: off" ;;
    status) bash "$WORK" status ;;
    *) echo "usage: mode.sh {night|work|off|status}" >&2; exit 2 ;;
esac
