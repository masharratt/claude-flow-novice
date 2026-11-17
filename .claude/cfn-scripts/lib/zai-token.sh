#!/usr/bin/env bash
# Shared z.ai token lookup, sourced by cfn-fleet (lib/engines.sh) and
# cfn-tmux-agents (lib/engines.sh). One place for the keychain/token-file
# rules so the two skills cannot drift.
#
# Sources, in order (callers check their own env vars first):
#   1. macOS keychain generic password, service cfn-fleet-zai
#   2. ~/.config/cfn-fleet/zai.token, first line, file mode exactly 600
# The value is never printed in an error. Values under 20 chars are refused
# (a truncated paste, "null" or a placeholder would otherwise reach "started"
# and sit in a 401 retry loop).
#
# Contract (no exit, no die: callers map the code to their own die function):
#   zai_token_lookup        stdout = token (no newline); stderr = message when
#                           refused. rc 0 found, 1 no source has one, 2 refused.
#   zai_token_resolve       same, but in-shell: sets ZAI_TOKEN_VALUE and
#                           ZAI_TOKEN_ERR (no subshell, so callers can read the
#                           message without parsing stderr).
#   zai_token_check_value SRC VALUE
#                           rc 0 ok, rc 2 + ZAI_TOKEN_ERR when VALUE is under
#                           the minimum length. SRC names the source in the text.
# shellcheck shell=bash

# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh (stat shim).
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)/helpers/cfn-portable.sh" 2>/dev/null || true

ZAI_TOKEN_KEYCHAIN_SERVICE=cfn-fleet-zai
ZAI_TOKEN_MIN_LEN=20
ZAI_TOKEN_VALUE=""
ZAI_TOKEN_ERR=""

_zai_token_file_mode() { stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"; }  # GNU first

zai_token_check_value() {
  local src="$1" v="$2"
  if [ "${#v}" -lt "$ZAI_TOKEN_MIN_LEN" ]; then
    ZAI_TOKEN_ERR="z.ai token from $src is ${#v} chars; expected at least $ZAI_TOKEN_MIN_LEN (re-store the full token)"
    return 2
  fi
  return 0
}

zai_token_resolve() {
  local v="" from="" f="${HOME:-}/.config/cfn-fleet/zai.token" mode
  ZAI_TOKEN_VALUE="" ZAI_TOKEN_ERR=""
  if command -v security >/dev/null 2>&1; then
    v=$(security find-generic-password -s "$ZAI_TOKEN_KEYCHAIN_SERVICE" -w 2>/dev/null) || v=""
    [ -n "$v" ] && from="keychain service $ZAI_TOKEN_KEYCHAIN_SERVICE"
  fi
  if [ -z "$v" ] && [ -f "$f" ]; then
    mode=$(_zai_token_file_mode "$f")
    if [ "$mode" != 600 ]; then
      ZAI_TOKEN_ERR="z.ai token file $f has mode $mode; it must be 600 (chmod 600 $f)"
      return 2
    fi
    IFS= read -r v < "$f" || :
    v="${v%$'\r'}"
    from="$f"
  fi
  [ -n "$v" ] || return 1
  zai_token_check_value "$from" "$v" || return 2
  ZAI_TOKEN_VALUE="$v"
}

zai_token_lookup() {
  local rc=0
  zai_token_resolve || rc=$?
  case "$rc" in
    0) printf '%s' "$ZAI_TOKEN_VALUE" ;;
    2) printf '%s\n' "$ZAI_TOKEN_ERR" >&2 ;;
  esac
  return "$rc"
}
