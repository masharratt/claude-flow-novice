#!/usr/bin/env bash
# lib/upsert.sh - OP-W3 upsert_by_key_atomic.
#
# Sourced by record.sh. Exposes:
#   upsert_by_key_atomic - atomic upsert to <root>/.VERIFY_<slug>.decisions.json
#   (<root> defaults to the plan's own dir planning/<slug>/, legacy flat planning/)
#
# Pattern reused from .claude/skills/cfn-megaplan/bars/bless-verify.sh:62-66,137-149
# (DIR/BASE/mktemp+mv atomic-write). EXTENSION: upsert-by-key (replace by
# `.id`) instead of append-only. Justified by SPEC FR-2: decisions are
# entities that evolve (proposed->accepted->superseded), not events.
#
# Atomicity (FR-4):
#   - mktemp inside the target dir guarantees the final mv is same-filesystem
#     and POSIX rename(2) atomic.
#   - EXIT/INT/TERM trap removes any lingering $TMP. The unset-before-set
#     case is guarded with ${TMP:-} under `set -u`.
#   - A killed writer (kill -9 mid-write) leaves the OLD file intact.
#
# Branches:
#   5a) TARGET absent  - bootstrap {slug, decisions:[$new]} (NEVER bare array).
#   5b) TARGET exists AND invalid JSON - exit 5, PRESERVE bad file.
#   5c) TARGET exists and valid - upsert by id (replace or append; relative
#       order of other elements preserved).

# Globals set here for the EXIT trap installed by record.sh main.
TMP=""

# upsert_by_key_atomic <ENTRY_JSON> - exits 4/5 on FS/corrupt errors.
# Sets TARGET globally on success so sink-delegate can log it.
upsert_by_key_atomic() {
  local entry="$1"
  DIR="$ROOT"
  BASE="VERIFY_${SLUG}"
  TARGET="$DIR/.$BASE.decisions.json"

  # EC-9 / EC-11: dir missing or read-only.
  if [ ! -d "$DIR" ] || [ ! -w "$DIR" ]; then
    printf 'planning dir missing or read-only: %s\n' "$DIR" >&2
    exit "$E_FILESYSTEM"
  fi

  # EC-9: mktemp failure (disk full, exhausted inodes).
  TMP="$(mktemp "$DIR/.dec.XXXXXX" 2>/dev/null)" || {
    printf 'mktemp failed in %s\n' "$DIR" >&2
    exit "$E_FILESYSTEM"
  }

  if [ ! -f "$TARGET" ]; then
    # Branch 5a: bootstrap wrapper object. NEVER a bare array (renderer
    # gates on .decisions | type == "array" at section-decisions.sh:23).
    if ! jq -n --arg slug "$SLUG" --argjson new "$entry" \
        '{slug: $slug, decisions: [$new]}' > "$TMP" 2>/dev/null; then
      rm -f "$TMP"
      printf 'internal: jq failed to build decision object\n' >&2
      exit "$E_JQ_BUILD"
    fi
  elif ! jq empty "$TARGET" 2>/dev/null; then
    # Branch 5b: existing file is not valid JSON. PRESERVE the bad file
    # for inspection (do NOT overwrite). The rename(2) atomic mv never
    # happens because we exit before reaching it.
    rm -f "$TMP"
    printf 'existing %s is not valid JSON; refusing overwrite\n' \
      "$TARGET" >&2
    exit "$E_TARGET_CORRUPT"
  else
    # Branch 5c: upsert by id. Replace if id exists; append otherwise.
    # Relative order of other elements preserved.
    if ! jq --argjson new "$entry" '
        if (.decisions // [] | map(.id) | index($new.id)) != null
        then .decisions = (.decisions | map(if .id == $new.id then $new else . end))
        else .decisions += [$new] end
      ' "$TARGET" > "$TMP" 2>/dev/null; then
      rm -f "$TMP"
      printf 'internal: jq upsert produced invalid JSON\n' >&2
      exit "$E_TARGET_CORRUPT"
    fi
  fi

  # Final defensive check: the temp file must parse before the rename.
  if ! jq empty "$TMP" 2>/dev/null; then
    rm -f "$TMP"
    printf 'internal: jq upsert produced invalid JSON\n' >&2
    exit "$E_TARGET_CORRUPT"
  fi

  # Atomic rename(2). Same-filesystem mv is atomic; the file visible to
  # any reader is either the OLD content or the NEW content, never partial.
  if ! mv "$TMP" "$TARGET" 2>/dev/null; then
    rm -f "$TMP"
    printf 'mv failed to commit %s\n' "$TARGET" >&2
    exit "$E_FILESYSTEM"
  fi

  # TMP is now consumed by the rename. Clear it so the EXIT trap no-ops.
  TMP=""
  return 0
}

# cleanup_tmp - EXIT/INT/TERM trap. Removes a lingering $TMP if the writer
# was killed before the rename completed. Safe to call multiple times.
# The ${TMP:-} default guards the unset-before-set case under `set -u`.
cleanup_tmp() {
  [ -n "${TMP:-}" ] && rm -f "$TMP" 2>/dev/null || true
}
