# shellcheck shell=bash  # fixture only: no shebang, never run it
# Exact incident shape (MDTWII 2026-11-23): mktemp unchecked, then
# rm -rf "$T/..." in a reset helper. T empty made this rm -rf /home /tmp.
T="$(mktemp -d "${TMPDIR:-/tmp}/em-shard.XXXXXX")"
reset() { rm -rf "$T/res" "$T/home" "$T/tmp"; mkdir -p "$T/res"; }
reset
