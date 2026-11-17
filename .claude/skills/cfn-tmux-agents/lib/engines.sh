# shellcheck shell=bash
# cfn-tmux-agents engine registry access. The registry itself lives in the
# SHARED ~/.claude/cfn-config/engines.env (single source of truth, also
# consumed by cfn-fleet via its templates/engines.env symlink) so the two
# skills can never drift apart. Same 7-field format fleet uses:
#   name | bin | args | set | unset | trust_keys | banner_regex
# See the header of that file for the field contract.

_TA_ENGINES_FILE="${HOME:-/home}/.claude/cfn-config/engines.env"
if [ ! -f "$_TA_ENGINES_FILE" ]; then
  echo "tmux-agents: shared engine registry missing: $_TA_ENGINES_FILE (create it or re-run cfn link-runtime-dirs)" >&2
  exit 66
fi
_TA_ENGINES=$(grep -vE '^[[:space:]]*(#|$)' "$_TA_ENGINES_FILE")

# _ta_engine_row ENGINE — the raw registry line, rc 1 if unknown.
_ta_engine_row() {
  local row
  while IFS= read -r row; do
    [ "${row%% | *}" = "$1" ] && { printf '%s\n' "$row"; return 0; }
  done <<< "$_TA_ENGINES"
  return 1
}

# _ta_engine_field ENGINE FIELD(1-7) — empty string allowed. Fields 1-6
# never contain a pipe (format contract), so split the row on bare "|" and
# rejoin parts 7..N with the separator: banner_regex legitimately holds
# unspaced-pipe alternation and must survive intact. Empty fields (the
# set/unset cells) come out empty, not glued to a neighbor.
_ta_engine_field() {
  local row
  row=$(_ta_engine_row "$1") || return 1
  awk -F'|' -v n="$2" '{
    if (n < 7) v = $n
    else { v = ""; for (i = 7; i <= NF; i++) v = v (i > 7 ? "|" : "") $i }
    gsub(/^ +| +$/, "", v); print v
  }' <<< "$row"
}

# _ta_engine_list — one name per line.
_ta_engine_list() {
  printf '%s\n' "$_TA_ENGINES" | sed -e 's/ .*//'
}

# _ta_engine_resolve_set ENGINE — resolve the set field's NAME=$SOURCE_VAR
# entries against the master shell env NOW, one
# K=V per line for the pane env file (spawn-env.sh). Dies 66 naming the missing var.
_ta_engine_resolve_set() {
  local engine="$1" raw sv name ref
  raw=$(_ta_engine_field "$engine" 4) || return 1
  [ -n "$raw" ] || return 0
  # `|| [ -n "$sv" ]`: the list has no trailing newline, and a bare read
  # dropped its last item (glm lost CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT).
  while IFS= read -r sv || [ -n "$sv" ]; do
    [ -n "$sv" ] || continue
    name="${sv%%=*}"
    ref="${sv#*=}"
    if [[ "$ref" == \$* ]]; then
      local varname="${ref#\$}"
      local val="${!varname:-}"
      if [ -z "$val" ]; then
        _ta_die 66 "spawn: engine '$engine' needs $varname set in the master env (glm: export FLEET_ZAI_TOKEN, or TMUX_AGENTS_ZAI_TOKEN / ZAI_TOKEN which this skill picks up, or store it in the macOS keychain (service cfn-fleet-zai) or ~/.config/cfn-fleet/zai.token with chmod 600)"
      fi
      printf '%s=%s\n' "$name" "$val"
    else
      printf '%s=%s\n' "$name" "$ref"
    fi
  done < <(printf '%s' "$raw" | tr ',' '\n')
}

# _ta_zai_token_prefill — the shared registry references $FLEET_ZAI_TOKEN
# (fleet's canonical name). Order: FLEET_ZAI_TOKEN, TMUX_AGENTS_ZAI_TOKEN,
# ZAI_TOKEN, then the shared lookup (keychain, ~/.config/cfn-fleet/zai.token
# mode 600; .claude/cfn-scripts/lib/zai-token.sh, same as cfn-fleet). An env
# value under the minimum length ("null", a placeholder) dies 66 instead of
# reaching a 401 loop. Nothing found is not an error here: resolve_set dies 66.
# shellcheck source=../../../cfn-scripts/lib/zai-token.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../cfn-scripts/lib" && pwd -P)/zai-token.sh"
_ta_zai_token_prefill() {
  local src v rc=0
  for src in FLEET_ZAI_TOKEN TMUX_AGENTS_ZAI_TOKEN ZAI_TOKEN; do
    v="${!src:-}"
    [ -n "$v" ] || continue
    zai_token_check_value "env $src" "$v" || _ta_die 66 "spawn: $ZAI_TOKEN_ERR"
    export FLEET_ZAI_TOKEN="$v"
    return 0
  done
  zai_token_resolve || rc=$?
  case "$rc" in
    0) export FLEET_ZAI_TOKEN="$ZAI_TOKEN_VALUE" ;;
    2) _ta_die 66 "spawn: $ZAI_TOKEN_ERR" ;;
  esac
  return 0
}
