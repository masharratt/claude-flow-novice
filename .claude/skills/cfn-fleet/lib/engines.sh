#!/usr/bin/env bash
# cfn-fleet lib/engines.sh — engine registry readers
# (planning/HANDOFF_cfn-fleet-engines.md, sections 1 + 2).
#
# Sourced by lib/common.sh, so every fleet subcommand reaches it; also safe to
# source standalone (defines functions plus one template-path variable, no
# other side effects). The signatures below are the fixed contract the spawn
# agent codes against — change only additively:
#
#   fleet_engines_file               echo the active registry path:
#                                    <run-dir>/engines.env when present, else
#                                    the shipped templates/engines.env
#   fleet_engine_list                engine names from the registry, one per
#                                    line, registry order
#   fleet_engine_get FIELD ENGINE    echo one field (bin|args|set|unset|
#                                    trust_keys|banner_regex); exit 65 on
#                                    unknown field or engine
#   fleet_engine_resolve_set ENGINE  echo K=V lines with $SOURCE_VAR refs
#                                    resolved from the master shell env at
#                                    call time; exit 66 naming the variable
#                                    when a referenced source var is unset or
#                                    empty
#   fleet_engine_default             FLEET_DEFAULT_ENGINE from fleet.env, else
#                                    claude-sub
#   fleet_ws_engine WS               roster engine cell; empty cell or absent
#                                    column falls back to fleet_engine_default
#                                    (a pre-engine roster therefore reads
#                                    claude-sub unless FLEET_DEFAULT_ENGINE
#                                    says otherwise — the back-compat clause of
#                                    the handoff holds whenever the default is
#                                    unset, and matches spawn precedence
#                                    --engine > roster cell > FLEET_DEFAULT_ENGINE
#                                    > claude-sub)
#   fleet_engines_install            copy the template into the run dir; echo
#                                    the installed path; refuse to overwrite an
#                                    existing run-dir copy (65). Wiring point
#                                    for cmd-init: call once after scaffolding
#                                    the run dir, ignore stdout.
#
# Registry format lives in templates/engines.env (7 fields, " | " separator,
# no values on disk).

# Shipped registry, resolved once at source time. BASH_SOURCE[0] is this file
# even when sourced from common.sh, so the sibling templates/ dir is stable
# through the ~/.claude reverse symlink too.
# shellcheck disable=SC2034
_FLEET_ENGINES_TEMPLATE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../templates" && pwd)/engines.env"

# shellcheck disable=SC2034
_ENGINES_FIELDS="bin|args|set|unset|trust_keys|banner_regex"

# _engines_trim VALUE — trim leading/trailing whitespace (field edges only).
_engines_trim(){
  local s="$1"
  s="${s#"${s%%[![:space:]]*}"}"
  s="${s%"${s##*[![:space:]]}"}"
  printf '%s' "$s"
}

# _engines_split_row LINE ARRAY_NAME — split a registry line on the literal
# " | " separator into ARRAY_NAME (nameref, bash 4.3+). Unspaced '|' inside a
# field (banner_regex alternation) is left alone; adjacent separators yield an
# empty field. Empty-field tolerance: "a | | b" (single-spaced, the natural
# way to type it) is normalized to "a |  | b" first — the literal " | " forms
# overlap there, and without this the empty field would silently merge into
# its right neighbour.
_engines_split_row(){
  local -n _out="$2"
  local rest="${1//' | | '/' |  | '}"
  local -a parts=()
  while [[ "$rest" == *" | "* ]]; do
    parts+=("$(_engines_trim "${rest%%" | "*}")")
    rest="${rest#*" | "}"
  done
  parts+=("$(_engines_trim "$rest")")
  _out=("${parts[@]}")
}

# _engines_data_line LINE FILE ARRAY_NAME — parse one registry line into
# ARRAY_NAME (nameref). Returns 1 for comments/blank lines (nothing to do);
# exits 65 for a malformed data line so a broken registry fails loudly instead
# of silently dropping engines.
_engines_data_line(){
  case "$1" in '#'*|"") return 1 ;; esac
  # local parse array must NOT share its name with any caller's target array:
  # the nameref below resolves to the nearest scope, and a same-named local
  # would swallow the assignment instead of writing through to the caller
  local -a _parsed=()
  _engines_split_row "$1" _parsed
  if [ "${#_parsed[@]}" -ne 7 ]; then
    fleet_die 65 "malformed engine line in $2 (want 7 ' | '-separated fields): ${1:0:60}"
  fi
  # shellcheck disable=SC2178  # nameref, not a scalar assignment
  local -n _out="$3"
  _out=("${_parsed[@]}")
}

# _engines_row FILE ENGINE — print the engine's 7 fields newline-separated;
# exit 65 (with a fleet: message) for a missing file or unknown engine.
# Callers propagate via `out=$(_engines_row ...) || exit "$?"` so the die
# message already on stderr is not duplicated.
_engines_row(){
  local file="$1" engine="$2" line
  [ -f "$file" ] || fleet_die 65 "no engine registry at $file (fleet init first, or templates/engines.env missing)"
  local -a f=()
  while IFS= read -r line || [ -n "$line" ]; do
    _engines_data_line "$line" "$file" f || continue
    if [ "${f[0]}" = "$engine" ]; then
      printf '%s\n' "${f[@]}"
      return 0
    fi
  done < "$file"
  fleet_die 65 "unknown engine: $engine (known: $(fleet_engine_list 2>/dev/null | tr '\n' ' '))"
}

# fleet_engines_file — run-dir copy wins; the shipped template is the fallback
# so commands keep working in run dirs created before this registry existed.
fleet_engines_file(){
  local rd f
  rd=$(fleet_run_dir)
  f="$rd/engines.env"
  if [ -f "$f" ]; then
    printf '%s\n' "$f"
  else
    printf '%s\n' "$_FLEET_ENGINES_TEMPLATE"
  fi
}

fleet_engine_list(){ # engine names, one per line, registry order
  local file line
  file=$(fleet_engines_file)
  [ -f "$file" ] || fleet_die 65 "no engine registry at $file"
  local -a f=()
  while IFS= read -r line || [ -n "$line" ]; do
    _engines_data_line "$line" "$file" f || continue
    printf '%s\n' "${f[0]}"
  done < "$file"
}

fleet_engine_get(){ # fleet_engine_get FIELD ENGINE — echo the field; 65 unknown
  local field="$1" engine="$2" out idx
  case "$field" in
    bin) idx=1;; args) idx=2;; set) idx=3;;
    unset) idx=4;; trust_keys) idx=5;; banner_regex) idx=6;;
    *) fleet_die 65 "unknown engine field: $field (known: $_ENGINES_FIELDS)" ;;
  esac
  out=$(_engines_row "$(fleet_engines_file)" "$engine") || exit "$?"
  local -a f=()
  mapfile -t f <<< "$out"   # one element per field; empty fields preserved
  printf '%s\n' "${f[$idx]}"
}

fleet_engine_resolve_set(){ # K=V lines, $SOURCE_VAR resolved; 66 names the var
  local engine="$1" out entry name val src
  out=$(_engines_row "$(fleet_engines_file)" "$engine") || exit "$?"
  local -a f=()
  mapfile -t f <<< "$out"
  [ -n "${f[3]}" ] || return 0
  local -a entries=()
  IFS=',' read -ra entries <<< "${f[3]}"
  for entry in "${entries[@]}"; do
    entry=$(_engines_trim "$entry")
    [ -n "$entry" ] || continue
    case "$entry" in
      *=*) ;;
      *) fleet_die 65 "malformed set entry for engine $engine (want NAME=value): $entry" ;;
    esac
    name="${entry%%=*}"
    val="${entry#*=}"
    [[ "$name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] \
      || fleet_die 65 "malformed set entry for engine $engine (NAME must be a shell identifier): $entry"
    if [[ "$val" == '$'* ]]; then
      src="${val:1}"
      [[ "$src" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] \
        || fleet_die 65 "malformed set entry for engine $engine (source var must be a shell identifier): $entry"
      val="${!src:-}"
      if [ -z "$val" ] && [ "$src" = FLEET_ZAI_TOKEN ]; then
        # rc 1 = no source has a token (fall through to the 66 below);
        # any other rc is the lookup's own refusal and must abort here.
        local zrc=0
        val=$(_fleet_zai_token_lookup) || zrc=$?
        [ "$zrc" -eq 0 ] || [ "$zrc" -eq 1 ] || exit "$zrc"
      fi
      if [ -z "$val" ]; then
        if [ "$src" = FLEET_ZAI_TOKEN ]; then
          fleet_die 66 "engine '$engine' needs the z.ai token: export FLEET_ZAI_TOKEN, or store it once in the macOS keychain (security add-generic-password -a \"\$USER\" -s $_FLEET_ZAI_KEYCHAIN_SERVICE -w) or in ~/.config/cfn-fleet/zai.token (chmod 600); it is never written to the run dir"
        fi
        fleet_die 66 "engine '$engine' needs \$$src in the master shell env (export $src=<value> before spawn; it is never written to disk)"
      fi
    fi
    printf '%s=%s\n' "$name" "$val"
  done
}

# z.ai token home, used only when FLEET_ZAI_TOKEN is unset or empty:
#   1. macOS keychain generic password, service cfn-fleet-zai
#      store once:  security add-generic-password -a "$USER" -s cfn-fleet-zai -w
#      (no value after -w: security prompts for it, so it never lands in
#      shell history)
#   2. ~/.config/cfn-fleet/zai.token, first line, file mode exactly 600
# The value is never printed: errors name the source, never the content.
# Values under 20 chars are refused (a truncated paste or a placeholder would
# otherwise reach "started" and sit in a 401 retry loop).
_FLEET_ZAI_KEYCHAIN_SERVICE=cfn-fleet-zai
_FLEET_ZAI_MIN_LEN=20

# _fleet_zai_token_lookup: print the token (no newline); rc 1 when no source
# has one; fleet_die 66 when a source holds an unusable value.
_fleet_zai_token_lookup(){
  local v="" from="" f="$HOME/.config/cfn-fleet/zai.token" mode
  if command -v security >/dev/null 2>&1; then
    v=$(security find-generic-password -s "$_FLEET_ZAI_KEYCHAIN_SERVICE" -w 2>/dev/null) || v=""
    [ -n "$v" ] && from="keychain service $_FLEET_ZAI_KEYCHAIN_SERVICE"
  fi
  if [ -z "$v" ] && [ -f "$f" ]; then
    mode=$(_fleet_file_mode "$f")
    [ "$mode" = 600 ] \
      || fleet_die 66 "z.ai token file $f has mode $mode; it must be 600 (chmod 600 $f)"
    IFS= read -r v < "$f" || :
    v="${v%$'\r'}"
    from="$f"
  fi
  [ -n "$v" ] || return 1
  [ "${#v}" -ge "$_FLEET_ZAI_MIN_LEN" ] \
    || fleet_die 66 "z.ai token from $from is ${#v} chars; expected at least $_FLEET_ZAI_MIN_LEN (re-store the full token)"
  printf '%s' "$v"
}

fleet_engine_default(){ # FLEET_DEFAULT_ENGINE from fleet.env else claude-sub
  local d
  d=$(fleet_env_get FLEET_DEFAULT_ENGINE)
  printf '%s\n' "${d:-claude-sub}"
}

fleet_ws_engine(){ # roster engine cell; empty/absent -> fleet_engine_default
  local ws="$1" eng
  eng=$(roster_get "$ws" engine) || exit "$?"
  if [ -n "$eng" ]; then
    printf '%s\n' "$eng"
  else
    fleet_engine_default
  fi
}

# fleet_engines_install — copy the shipped template into the run dir. cmd-init
# wiring point (init is owned elsewhere): call after scaffold, e.g.
#   fleet_engines_install >/dev/null
# Idempotent-safe: an existing run-dir copy is never overwritten (65), so a
# user-tuned registry cannot be clobbered by a re-install.
fleet_engines_install(){
  local rd dst
  rd=$(fleet_run_dir)
  [ -f "$_FLEET_ENGINES_TEMPLATE" ] \
    || fleet_die 71 "engine registry template missing: $_FLEET_ENGINES_TEMPLATE"
  dst="$rd/engines.env"
  if [ -e "$dst" ]; then
    fleet_die 65 "run dir already has engines.env: $dst (edit it in place; fleet_engines_install never overwrites)"
  fi
  cp "$_FLEET_ENGINES_TEMPLATE" "$dst" || fleet_die 71 "copy failed: $_FLEET_ENGINES_TEMPLATE -> $dst"
  printf '%s\n' "$dst"
}
