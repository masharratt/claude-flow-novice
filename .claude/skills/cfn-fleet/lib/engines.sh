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
      if [ -z "$val" ]; then
        fleet_die 66 "engine '$engine' needs \$$src in the master shell env (export $src=<value> before spawn; it is never written to disk)"
      fi
    fi
    printf '%s=%s\n' "$name" "$val"
  done
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
