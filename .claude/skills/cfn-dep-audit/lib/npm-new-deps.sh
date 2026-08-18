#!/usr/bin/env bash
# cfn-dep-audit helper: structurally detect newly-added npm dependency keys.
#
# Reads ONLY the dependency sections of package.json
# (dependencies, devDependencies, peerDependencies, optionalDependencies) and
# diffs the key set against BASE_REF. A scripts entry (e.g. "e2e": "vitest run")
# is never a dependency, so it can never be flagged here.
#
# This replaces the old line-grep over the whole file, which matched any
# "key": "value" whose value started with a version char (^~>=<0-9v) and so
# mistook a script command starting with v or a digit for a package range.
#
# Sourceable and side-effect-free (function defs only) so it can be unit-tested
# directly without network or npm.
#
# cfn_npm_new_deps "$BASE_REF"  -> prints "pkg<TAB>range" for deps present now
#                                  but absent at BASE_REF. Empty BASE_REF treats
#                                  all current deps as new (new file / no history).

cfn_npm_dep_keys() { # stdin = package.json -> sorted, unique dep names
  jq -r '
    try
      (.dependencies, .devDependencies, .peerDependencies, .optionalDependencies
       | select(.) | keys[]?)
    catch empty
  ' 2>/dev/null | sort -u
}

cfn_npm_dep_range() { # $1 = pkg name -> range from ./package.json (or empty)
  jq -r --arg k "$1" '
    first(
      (.dependencies, .devDependencies, .peerDependencies, .optionalDependencies
       | select(.) | .[$k]) // empty
    )
  ' package.json 2>/dev/null
}

cfn_npm_new_deps() { # $1 = BASE_REF (git ref, e.g. HEAD / HEAD~1) or ""
  local base_ref="$1"
  local base_keys cur_keys pkg range
  if [[ -n "$base_ref" ]]; then
    base_keys=$(git show "$base_ref:package.json" 2>/dev/null | cfn_npm_dep_keys)
  else
    base_keys=""
  fi
  cur_keys=$(cfn_npm_dep_keys < package.json)
  # -13 = lines only in cur (new keys); grep . drops blank lines.
  comm -13 <(printf '%s\n' "$base_keys" | grep .) <(printf '%s\n' "$cur_keys" | grep .) \
    | while IFS= read -r pkg; do
        [[ -z "$pkg" ]] && continue
        range=$(cfn_npm_dep_range "$pkg")
        [[ -n "$range" ]] && printf '%s\t%s\n' "$pkg" "$range"
      done
}
