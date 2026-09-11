#!/usr/bin/env bash
# Fake engine that opens a startup update modal (codex-cli shape) and only
# shows its banner after the caller picks "2" (Skip). Anything else, or no
# input, leaves it blocked: the banner gate must then time out.
printf '  Update available! 0.1 -> 0.2\n'
printf '  1. Update now (runs npm install -g)\n'
printf '  2. Skip\n'
printf '  Press enter to continue\n'
IFS= read -r line
[ "$line" = "2" ] || exit 5
printf 'AGENTS-TEST-BANNER modal-cleared\n'
exec cat
