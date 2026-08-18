#!/usr/bin/env bash
# cleanup.sh - reclaim space from cfn-edit-safety pre-edit backups.
#
# DEFAULTS TO DRY RUN. Nothing is ever deleted without --apply.
#
# Backups live at <backups_root>/<agent_id>/<unix_ts>_<md5_of_file>/ with a
# metadata.json in each dir (see restore.sh header for the exact fields).
# A dir whose metadata.json is missing or fails to parse is an ORPHAN: it is
# always counted and reported, and only ever deleted when --prune-orphans is
# also given.
#
# Primary safety rule: --keep-latest N (default 1) keeps the N newest
# backups PER distinct metadata.original_file, regardless of age. Only
# backups outside that newest-N window, and older than --older-than DAYS
# (default 7), are removed.

set -euo pipefail

# GNU-tool shims for macOS (timeout/stat/date/sed/free/nproc/readlink).
# Defines nothing on Linux; see .claude/helpers/cfn-portable.sh.
. "$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd -P)/.claude/helpers/cfn-portable.sh" 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"

# Same repo-root resolution as restore.sh / cfn-hook-selftest.sh: readlink -f
# first (reverse symlinks under ~/.claude must not resolve to $HOME), then
# git, then a depth-based fallback. This script lives 5 levels below the
# repo root: <root>/.claude/skills/cfn-edit-safety/lib/backup/cleanup.sh
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
    REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
fi

DEFAULT_BACKUPS_ROOT="$REPO_ROOT/.backups"
BACKUPS_ROOT="${CFN_BACKUP_ROOT:-$DEFAULT_BACKUPS_ROOT}"

usage() {
    cat >&2 <<'USAGE'
Usage:
  cleanup.sh [--older-than DAYS] [--keep-latest N] [--agent-id ID]
             [--apply] [--prune-orphans] [--json]

Defaults to a dry run (--older-than 7 --keep-latest 1). Pass --apply to
actually delete. Refuses to run against any backups root other than
<repo_root>/.backups unless CFN_BACKUP_ALLOW_FOREIGN_ROOT=1 (tests only);
override the root itself with CFN_BACKUP_ROOT.
USAGE
}

require_jq() {
    command -v jq >/dev/null 2>&1 || { echo "Error: jq is required but not installed" >&2; exit 1; }
}

# Normalize a metadata timestamp to unix seconds. A 13-digit value is
# treated as milliseconds.
normalize_ts() {
    local raw="$1"
    if [[ "$raw" =~ ^[0-9]{13}$ ]]; then
        echo $(( raw / 1000 ))
    elif [[ "$raw" =~ ^[0-9]+$ ]]; then
        echo "$raw"
    else
        echo 0
    fi
}

resolve_real() {
    readlink -f -- "$1" 2>/dev/null || printf '%s\n' "$1"
}

dir_size_bytes() {
    du -sb -- "$1" 2>/dev/null | cut -f1
}

# Populated by scan_and_process.
SCANNED=0
REMOVED=0
KEPT_BY_LATEST=0
ORPHANS=0
ORPHANS_REMOVED=0
BYTES_RECLAIMED=0

scan_and_process() {
    local older_than_days="$1"
    local keep_latest="$2"
    local agent_filter="$3"
    local apply="$4"
    local prune_orphans="$5"

    SCANNED=0
    REMOVED=0
    KEPT_BY_LATEST=0
    ORPHANS=0
    ORPHANS_REMOVED=0
    BYTES_RECLAIMED=0

    local now
    now=$(date +%s)
    local cutoff_secs=$(( older_than_days * 86400 ))

    local search_root="$BACKUPS_ROOT"
    if [[ -n "$agent_filter" ]]; then
        search_root="$BACKUPS_ROOT/$agent_filter"
    fi

    [[ -d "$search_root" ]] || return 0

    # Backup dirs are always <agent_id>/<ts>_<hash>. When an agent filter is
    # given, search_root is already the agent dir, so backup dirs are its
    # direct children; otherwise they are grandchildren of BACKUPS_ROOT.
    local -a all_dirs=()
    if [[ -n "$agent_filter" ]]; then
        while IFS= read -r -d '' d; do all_dirs+=("$d"); done \
            < <(find "$search_root" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)
    else
        while IFS= read -r -d '' d; do all_dirs+=("$d"); done \
            < <(find "$search_root" -mindepth 2 -maxdepth 2 -type d -print0 2>/dev/null)
    fi

    SCANNED=${#all_dirs[@]}
    [[ $SCANNED -gt 0 ]] || return 0

    local -a valid_dirs=() valid_orig=() valid_ts=() orphan_dirs=()
    local d meta orig raw_ts

    for d in "${all_dirs[@]}"; do
        meta="$d/metadata.json"
        if [[ ! -f "$meta" ]] || ! jq -e . "$meta" >/dev/null 2>&1; then
            ORPHANS=$((ORPHANS + 1))
            orphan_dirs+=("$d")
            continue
        fi
        orig="$(jq -r '.original_file // empty' "$meta" 2>/dev/null || true)"
        raw_ts="$(jq -r '.timestamp // empty' "$meta" 2>/dev/null || true)"
        if [[ -z "$orig" || -z "$raw_ts" ]]; then
            ORPHANS=$((ORPHANS + 1))
            orphan_dirs+=("$d")
            continue
        fi
        valid_dirs+=("$d")
        valid_orig+=("$(resolve_real "$orig")")
        valid_ts+=("$(normalize_ts "$raw_ts")")
    done

    local n=${#valid_dirs[@]}
    local i o

    # Build the distinct set of original_file paths.
    local -A seen=()
    local -a uniq_origs=()
    for ((i = 0; i < n; i++)); do
        o="${valid_orig[$i]}"
        if [[ -z "${seen[$o]+x}" ]]; then
            seen[$o]=1
            uniq_origs+=("$o")
        fi
    done

    for o in "${uniq_origs[@]}"; do
        local -a idxs=()
        for ((i = 0; i < n; i++)); do
            [[ "${valid_orig[$i]}" == "$o" ]] && idxs+=("$i")
        done

        # Sort this group's indices newest-first by timestamp.
        local -a sorted_idxs=()
        while IFS= read -r line; do
            sorted_idxs+=("$line")
        done < <(
            for i in "${idxs[@]}"; do
                printf '%s\t%s\n' "${valid_ts[$i]}" "$i"
            done | sort -t "$(printf '\t')" -k1,1nr | cut -f2
        )

        local rank=0 dir ts age sz
        for i in "${sorted_idxs[@]}"; do
            rank=$((rank + 1))
            dir="${valid_dirs[$i]}"
            ts="${valid_ts[$i]}"

            if (( rank <= keep_latest )); then
                KEPT_BY_LATEST=$((KEPT_BY_LATEST + 1))
                continue
            fi

            age=$(( now - ts ))
            if (( age > cutoff_secs )); then
                sz="$(dir_size_bytes "$dir")"
                [[ -n "$sz" ]] || sz=0
                REMOVED=$((REMOVED + 1))
                BYTES_RECLAIMED=$((BYTES_RECLAIMED + sz))
                if [[ "$apply" == "true" ]]; then
                    rm -rf -- "$dir"
                fi
            fi
        done
    done

    # Orphans have no metadata, so keep-latest cannot apply to them, and
    # --prune-orphans removes them full stop: it is not gated on
    # --older-than, which is a user-facing retention knob unrelated to
    # orphan status. The only protection an orphan gets is a short fixed
    # grace window against a backup.sh write caught mid-flight (original
    # written, metadata.json not yet).
    if [[ "$prune_orphans" == "true" ]]; then
        # cfn: fixed 60s grace against a mid-flight backup.sh write, switch to
        # a lockfile or an atomic metadata-last rename if backups ever get
        # large enough that a write exceeds it
        local orphan_grace_secs=60
        local mtime age sz
        for d in "${orphan_dirs[@]}"; do
            mtime="$(stat -c '%Y' -- "$d" 2>/dev/null || echo "$now")"
            age=$(( now - mtime ))
            if (( age > orphan_grace_secs )); then
                sz="$(dir_size_bytes "$d")"
                [[ -n "$sz" ]] || sz=0
                ORPHANS_REMOVED=$((ORPHANS_REMOVED + 1))
                BYTES_RECLAIMED=$((BYTES_RECLAIMED + sz))
                if [[ "$apply" == "true" ]]; then
                    rm -rf -- "$d"
                fi
            fi
        done
    fi

    return 0
}

print_report() {
    local dry_run="$1" json="$2"

    if [[ "$json" == "true" ]]; then
        local dry_run_json="false"
        [[ "$dry_run" == "true" ]] && dry_run_json="true"
        jq -n \
            --argjson scanned "$SCANNED" \
            --argjson removed "$REMOVED" \
            --argjson kept_by_latest "$KEPT_BY_LATEST" \
            --argjson orphans "$ORPHANS" \
            --argjson orphans_removed "$ORPHANS_REMOVED" \
            --argjson bytes_reclaimed "$BYTES_RECLAIMED" \
            --argjson dry_run "$dry_run_json" \
            '{scanned: $scanned, removed: $removed, kept_by_latest: $kept_by_latest, orphans: $orphans, orphans_removed: $orphans_removed, bytes_reclaimed: $bytes_reclaimed, dry_run: $dry_run}'
    else
        local mode_label="dry-run"
        local removed_label="removed"
        local orphans_removed_label="orphans_removed"
        if [[ "$dry_run" == "true" ]]; then
            # Dry run never deletes anything. The label must say so, not
            # claim a removal that did not happen.
            removed_label="would_remove"
            orphans_removed_label="would_remove_orphans"
        else
            mode_label="apply"
        fi
        echo "Backup cleanup report ($mode_label)"
        printf '  %-17s %s\n' "scanned:" "$SCANNED"
        printf '  %-17s %s\n' "${removed_label}:" "$REMOVED"
        printf '  %-17s %s\n' "kept_by_latest:" "$KEPT_BY_LATEST"
        printf '  %-17s %s\n' "orphans:" "$ORPHANS"
        printf '  %-17s %s\n' "${orphans_removed_label}:" "$ORPHANS_REMOVED"
        printf '  %-17s %s\n' "bytes_reclaimed:" "$BYTES_RECLAIMED"
    fi
}

main() {
    require_jq

    local older_than=7
    local keep_latest=1
    local agent_filter=""
    local apply="false"
    local prune_orphans="false"
    local json_out="false"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --older-than)
                [[ $# -ge 2 ]] || { echo "Error: --older-than requires a value" >&2; usage; exit 1; }
                older_than="$2"
                shift 2
                ;;
            --keep-latest)
                [[ $# -ge 2 ]] || { echo "Error: --keep-latest requires a value" >&2; usage; exit 1; }
                keep_latest="$2"
                shift 2
                ;;
            --agent-id)
                [[ $# -ge 2 ]] || { echo "Error: --agent-id requires a value" >&2; usage; exit 1; }
                agent_filter="$2"
                shift 2
                ;;
            --apply)
                apply="true"
                shift
                ;;
            --prune-orphans)
                prune_orphans="true"
                shift
                ;;
            --json)
                json_out="true"
                shift
                ;;
            -h|--help)
                usage
                exit 1
                ;;
            *)
                echo "Error: unknown argument: $1" >&2
                usage
                exit 1
                ;;
        esac
    done

    if ! [[ "$older_than" =~ ^[0-9]+$ ]]; then
        echo "Error: --older-than must be a non-negative integer (got '$older_than')" >&2
        exit 1
    fi
    if ! [[ "$keep_latest" =~ ^[0-9]+$ ]]; then
        echo "Error: --keep-latest must be a non-negative integer (got '$keep_latest')" >&2
        exit 1
    fi

    # HARD SAFETY: never operate on a backups root other than the repo's own
    # <repo_root>/.backups unless the test escape hatch is explicitly set.
    # Compare canonicalized paths so a trailing slash or symlink hop can't
    # produce a false mismatch (or a false pass).
    local resolved_backups_root resolved_default_root
    resolved_backups_root="$(resolve_real "$BACKUPS_ROOT")"
    resolved_default_root="$(resolve_real "$DEFAULT_BACKUPS_ROOT")"

    if [[ "$resolved_backups_root" != "$resolved_default_root" ]]; then
        if [[ "${CFN_BACKUP_ALLOW_FOREIGN_ROOT:-0}" != "1" ]]; then
            echo "Error: refusing to run - backups root '$BACKUPS_ROOT' is not the repo's .backups directory ('$DEFAULT_BACKUPS_ROOT')." >&2
            echo "Set CFN_BACKUP_ALLOW_FOREIGN_ROOT=1 to override (tests only)." >&2
            exit 1
        fi
    fi

    # --apply is the write path; dry_run is its logical inverse.
    local dry_run="true"
    [[ "$apply" == "true" ]] && dry_run="false"

    if [[ ! -d "$BACKUPS_ROOT" ]]; then
        print_report "$dry_run" "$json_out"
        exit 0
    fi

    local lock_file="$BACKUPS_ROOT/cleanup.lock"
    exec 9>"$lock_file"
    if ! flock -n 9; then
        echo "Error: another cleanup.sh run is already in progress (lock: $lock_file)" >&2
        exit 1
    fi

    scan_and_process "$older_than" "$keep_latest" "$agent_filter" "$apply" "$prune_orphans"
    print_report "$dry_run" "$json_out"

    exit 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
