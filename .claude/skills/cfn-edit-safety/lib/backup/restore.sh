#!/usr/bin/env bash
# restore.sh - restore files from cfn-edit-safety pre-edit backups.
#
# Two backup conventions are understood (newest wins across both):
#
#   1. current  <backups_root>/<agent_id>/<unix_ts>_<md5_of_file>/
#         original       - byte copy of the pre-edit file
#         metadata.json  - {"timestamp","agent_id","original_file","file_hash",
#                           "backup_path","created_at"}
#         revert.sh      - executable, cp's original back over original_file
#      Written by backup.sh (this directory).
#
#   2. legacy   <file>.backup-<unix_ts> siblings next to the target file.
#      Written by the deprecated .claude/hooks/deprecated/cfn-pre-edit-backup.sh.
#      Real backups in this format are still on disk and are still the only
#      rollback safety net for those files. There is no metadata and no
#      recorded hash, so legacy candidates skip the integrity gate (see
#      do_restore_legacy) instead of the gate being dropped globally. A
#      `.backup-<non-numeric>` suffix (e.g. `.backup-phase1`) is kept as a
#      candidate but collapses to ts=0 so it can never outrank a real
#      timestamp. Ported from cfn-restore-from-backup.sh, which is now a thin
#      wrapper around this script.
#
# <backups_root> for the id/dir-based commands (--backup-id, positional
# <backup_dir_path>) and for the safety-backup written before every restore
# defaults to $(pwd)/.backups -- deliberately matching backup.sh's own
# default (`project_root="${3:-$(pwd)}"`), since backup.sh is the sole real
# producer of these backups and the live hook (see cfn-invoke-pre-edit.sh:117)
# calls it with no --project-root, so whatever directory an agent's cwd is in
# when backup.sh runs is where ".backups" lands.
#
# The file-based commands (--list, --file) search more than one root, because
# backup.sh's project root is fixed at BACKUP time, which is not necessarily
# the cwd at RESTORE time: see collect_search_roots. Both paths honor
# CFN_BACKUP_ROOT, which must name the backups directory itself (i.e. it
# should end in "/.backups" the same way the real one does) and short-
# circuits the search entirely, so that invoking backup.sh with
# --project-root "$(dirname "$BACKUPS_ROOT")" reproduces the same layout
# under the override.
#
# Finding this script's own sibling files (backup.sh) still resolves via
# readlink -f on BASH_SOURCE regardless of cwd -- only the backups-root
# default is pwd-based, matching backup.sh's convention.
#
# This script never deletes anything. See cleanup.sh for reclaiming space.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
BACKUP_SH="$SCRIPT_DIR/backup.sh"

# Resolve the single backups root used by the id/dir-based restore commands
# (--backup-id, positional <backup_dir_path>) and by the safety backup taken
# before every restore. $(pwd)/.backups wins when it exists, matching
# backup.sh exactly. When it does not, walk up to the enclosing git root and
# use its .backups if present, so a restore invoked from a subdirectory still
# finds the backups the hook wrote at the project root. Falls back to the
# pwd-based path so the "no backups anywhere" case reports against the
# location backup.sh would have used.
#
# The file-based commands (--list, --file) do NOT use this single root --
# see collect_search_roots for the full ancestor-walk multi-root search.
resolve_backups_root() {
    if [[ -n "${CFN_BACKUP_ROOT:-}" ]]; then
        echo "$CFN_BACKUP_ROOT"
        return 0
    fi

    local here
    here="$(pwd)"
    if [[ -d "$here/.backups" ]]; then
        echo "$here/.backups"
        return 0
    fi

    local git_root
    if git_root="$(git rev-parse --show-toplevel 2>/dev/null)" \
        && [[ -n "$git_root" ]] && [[ -d "$git_root/.backups" ]]; then
        echo "$git_root/.backups"
        return 0
    fi

    echo "$here/.backups"
}

BACKUPS_ROOT="$(resolve_backups_root)"

usage() {
    cat >&2 <<'USAGE'
Usage:
  restore.sh --list <file_path> [--agent-id ID]
  restore.sh --file <file_path> [--agent-id ID] [--dry-run] [--force]
  restore.sh --backup-id <ts_md5> [--agent-id ID] [--dry-run] [--force]
  restore.sh <backup_dir_path> [--dry-run] [--force]
USAGE
}

die_usage() {
    echo "Error: $1" >&2
    usage
    exit 1
}

require_jq() {
    command -v jq >/dev/null 2>&1 || { echo "Error: jq is required but not installed" >&2; exit 1; }
}

# Normalize a metadata timestamp to unix seconds. backup.sh always writes
# `date +%s` (seconds), but other producers could plausibly write
# milliseconds; a 13-digit value is treated as milliseconds.
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

# Normalize to an absolute path without requiring the path to exist. Backups
# record whatever path string the caller passed to backup.sh (may be relative
# or absolute), so both the recorded path and the restore target must be
# compared in the same normalized form.
#
# Ported from cfn-restore-from-backup.sh's abspath(). The prior version of
# this function used `readlink -f`, which requires every directory component
# up to (but not including) the final one to already exist on disk; when a
# target's containing directory tree does not exist (e.g. restoring into a
# freshly-recreated directory), `readlink -f` fails outright and the fallback
# below it returned the raw, unnormalized string -- silently breaking the
# path comparison instead of matching. `realpath -m` (GNU coreutils)
# canonicalizes a missing path the same way an existing one would resolve,
# without requiring any component to exist, matching the hook's behavior.
resolve_real() {
    local p="$1"
    case "$p" in
        /*) ;;
        *) p="$PWD/$p" ;;
    esac
    if command -v realpath >/dev/null 2>&1; then
        realpath -m -- "$p" 2>/dev/null || printf '%s\n' "$p"
    else
        printf '%s\n' "$p"
    fi
}

# Candidate roots holding a .backups/ tree for the file-based commands
# (--list, --file). Ported from cfn-restore-from-backup.sh's collect_roots:
# backup.sh's project root is fixed at BACKUP time ($(pwd) then), which is
# not necessarily the cwd at RESTORE time. Search the current directory, the
# git top level of the target file's directory, and every ancestor directory
# of the target file, deduped, in that order. CFN_BACKUP_ROOT short-circuits
# this entirely (it already names the .backups directory itself).
collect_search_roots() {
    local target_dir="$1"

    if [[ -n "${CFN_BACKUP_ROOT:-}" ]]; then
        [[ -d "$CFN_BACKUP_ROOT" ]] && printf '%s\n' "$CFN_BACKUP_ROOT"
        return 0
    fi

    local -a candidate_roots=()
    candidate_roots+=("$PWD")

    local git_root
    if git_root="$(git -C "$target_dir" rev-parse --show-toplevel 2>/dev/null)" && [[ -n "$git_root" ]]; then
        candidate_roots+=("$git_root")
    fi

    local d="$target_dir"
    while [[ -n "$d" && "$d" != "/" ]]; do
        candidate_roots+=("$d")
        d="$(dirname -- "$d")"
    done
    candidate_roots+=("/")

    local seen="" r
    for r in "${candidate_roots[@]}"; do
        case "$seen" in
            *"|${r}|"*) continue ;;
        esac
        seen="${seen}|${r}|"
        [[ -d "$r/.backups" ]] && printf '%s\n' "$r/.backups"
    done
}

# Find backup dirs (NUL-delimited walk), across every root collect_search_roots
# returns, whose metadata.original_file resolves to the same real path as $1.
# Optional agent filter in $2. Emits NUL terminated backup dir paths on stdout.
find_candidate_dirs() {
    local target_real="$1"
    local agent_filter="${2:-}"
    local target_dir
    target_dir="$(dirname -- "$target_real")"

    local root search_root
    while IFS= read -r root; do
        [[ -n "$root" ]] || continue
        search_root="$root"
        if [[ -n "$agent_filter" ]]; then
            search_root="$root/$agent_filter"
            [[ -d "$search_root" ]] || continue
        fi

        while IFS= read -r -d '' meta; do
            local orig
            orig="$(jq -r '.original_file // empty' "$meta" 2>/dev/null || true)"
            [[ -n "$orig" ]] || continue
            local orig_real
            orig_real="$(resolve_real "$orig")"
            if [[ "$orig_real" == "$target_real" ]]; then
                printf '%s\0' "$(dirname -- "$meta")"
            fi
        done < <(find "$search_root" -type f -name 'metadata.json' -print0 2>/dev/null)
    done < <(collect_search_roots "$target_dir")
}

# Find legacy <file>.backup-<ts> sibling candidates for $1 (already a
# resolved absolute path). Ported from cfn-restore-from-backup.sh: a numeric
# suffix competes on its timestamp; a non-numeric suffix (e.g. .backup-phase1)
# is kept as a candidate but collapses to ts=0 so it can never outrank a real
# timestamp. Emits "<ts>\tlegacy\t<path>" lines.
find_legacy_candidates() {
    local target_abs="$1"
    local legacy ts
    for legacy in "$target_abs".backup-*; do
        [[ -f "$legacy" ]] || continue
        ts="${legacy##*.backup-}"
        case "$ts" in
            ''|*[!0-9]*) ts=0 ;;
        esac
        printf '%s\tlegacy\t%s\n' "$ts" "$legacy"
    done
}

# Combine current-convention and legacy candidates for $1 (target_real),
# emitting "<ts>\t<kind>\t<path>" lines, kind in {current, legacy}, so both
# conventions compete in one newest-wins ordering.
collect_all_candidates() {
    local target_real="$1"
    local agent_filter="${2:-}"

    local d raw ts
    while IFS= read -r -d '' d; do
        raw="$(jq -r '.timestamp // "0"' "$d/metadata.json" 2>/dev/null || echo 0)"
        ts="$(normalize_ts "$raw")"
        printf '%s\tcurrent\t%s\n' "$ts" "$d"
    done < <(find_candidate_dirs "$target_real" "$agent_filter")

    find_legacy_candidates "$target_real"
}

# Sort "<ts>\t<kind>\t<path>" lines (stdin) newest first. Paths are assumed
# free of embedded newlines (current-convention dirs live under the fixed
# <root>/<agent_id>/<ts>_<hash> layout; legacy siblings are <file>.backup-<ts>).
sort_candidates_newest_first() {
    sort -t "$(printf '\t')" -k1,1nr
}

# Locate a single backup directory by its <ts>_<md5> id.
find_backup_by_id() {
    local id="$1"
    local agent_filter="${2:-}"
    local search_root="$BACKUPS_ROOT"

    [[ -d "$search_root" ]] || return 1
    if [[ -n "$agent_filter" ]]; then
        search_root="$BACKUPS_ROOT/$agent_filter"
        [[ -d "$search_root" ]] || return 1
    fi

    local found=""
    while IFS= read -r -d '' d; do
        found="$d"
        break
    done < <(find "$search_root" -type d -name "$id" -print0 2>/dev/null)

    [[ -n "$found" ]] || return 1
    printf '%s\n' "$found"
}

list_backups_cmd() {
    local file_path="$1"
    local agent_filter="$2"

    local target_real
    target_real="$(resolve_real "$file_path")"

    local -a sorted=()
    while IFS= read -r line; do sorted+=("$line"); done \
        < <(collect_all_candidates "$target_real" "$agent_filter" | sort_candidates_newest_first)

    if [[ ${#sorted[@]} -eq 0 ]]; then
        echo "No backups found for: $file_path" >&2
        return 2
    fi

    local line kind path id created agent size
    for line in "${sorted[@]}"; do
        kind="$(printf '%s' "$line" | cut -f2)"
        path="$(printf '%s' "$line" | cut -f3-)"
        if [[ "$kind" == "legacy" ]]; then
            id="$(basename -- "$path")"
            size="$(stat -c '%s' -- "$path" 2>/dev/null || wc -c < "$path" 2>/dev/null || echo '?')"
            printf '%s\tlegacy\tsize=%s\tpath=%s\n' "$id" "$size" "$path"
        else
            id="$(basename -- "$path")"
            created="$(jq -r '.created_at // "unknown"' "$path/metadata.json" 2>/dev/null || echo unknown)"
            agent="$(jq -r '.agent_id // "unknown"' "$path/metadata.json" 2>/dev/null || echo unknown)"
            if [[ -f "$path/original" ]]; then
                size="$(stat -c '%s' -- "$path/original" 2>/dev/null || wc -c < "$path/original" 2>/dev/null || echo '?')"
            else
                size="missing"
            fi
            printf '%s\tcreated_at=%s\tagent_id=%s\tsize=%s\tpath=%s\n' "$id" "$created" "$agent" "$size" "$path/original"
        fi
    done
    return 0
}

integrity_check() {
    local d="$1"
    local meta="$d/metadata.json"
    local orig_file="$d/original"

    [[ -f "$orig_file" ]] || { echo "Error: backup missing 'original' file: $d" >&2; return 1; }
    [[ -f "$meta" ]] || { echo "Error: backup missing metadata.json: $d" >&2; return 1; }

    local expected actual
    expected="$(jq -r '.file_hash // empty' "$meta" 2>/dev/null || true)"
    if [[ -z "$expected" ]]; then
        echo "Error: metadata.json missing file_hash: $d" >&2
        return 1
    fi
    actual="$(md5sum -- "$orig_file" | cut -d' ' -f1)"
    if [[ "$actual" != "$expected" ]]; then
        echo "Error: integrity check failed for $d (expected $expected, got $actual)" >&2
        return 1
    fi
    return 0
}

# Restore one specific backup directory to its metadata.original_file.
do_restore() {
    local backup_dir="$1"
    local dry_run="$2"
    local force="$3"

    local meta="$backup_dir/metadata.json"
    [[ -f "$meta" ]] || { echo "Error: not a valid backup directory (no metadata.json): $backup_dir" >&2; return 1; }

    local target
    target="$(jq -r '.original_file // empty' "$meta" 2>/dev/null || true)"
    [[ -n "$target" ]] || { echo "Error: metadata.json missing original_file: $backup_dir" >&2; return 1; }

    if ! integrity_check "$backup_dir"; then
        if [[ "$force" != "true" ]]; then
            echo "Refusing to restore due to integrity failure. Use --force to override." >&2
            return 1
        fi
        echo "Warning: integrity check failed for $backup_dir, proceeding due to --force" >&2
    fi

    if [[ "$dry_run" == "true" ]]; then
        echo "DRY RUN: would restore '$target' from backup '$(basename -- "$backup_dir")'"
        if [[ -f "$target" ]]; then
            echo "DRY RUN: would first create a safety backup of the current '$target'"
        else
            echo "DRY RUN: '$target' does not currently exist; no safety backup would be made"
        fi
        return 0
    fi

    if [[ -f "$target" ]]; then
        echo "Creating safety backup of current content before restore..." >&2
        local project_root_for_backup
        project_root_for_backup="$(dirname -- "$BACKUPS_ROOT")"
        if ! "$BACKUP_SH" "$target" --agent-id restore-safety --project-root "$project_root_for_backup" >/dev/null; then
            echo "Error: failed to create safety backup of '$target'; aborting restore" >&2
            return 1
        fi
    fi

    mkdir -p -- "$(dirname -- "$target")"
    cp -- "$backup_dir/original" "$target"
    echo "Restored '$target' from backup '$(basename -- "$backup_dir")'"
    return 0
}

# Restore one legacy <file>.backup-<ts> sibling to $target. Legacy backups
# predate metadata.json and file_hash: there is nothing to verify against, so
# the integrity gate (integrity_check, above) is skipped for this kind only --
# it is not dropped globally, current-convention backups are still gated.
do_restore_legacy() {
    local source="$1"
    local target="$2"
    local dry_run="$3"

    if [[ "$dry_run" == "true" ]]; then
        echo "DRY RUN: would restore '$target' from legacy backup '$(basename -- "$source")'"
        if [[ -f "$target" ]]; then
            echo "DRY RUN: would first create a safety backup of the current '$target'"
        else
            echo "DRY RUN: '$target' does not currently exist; no safety backup would be made"
        fi
        return 0
    fi

    if [[ -f "$target" ]]; then
        echo "Creating safety backup of current content before restore..." >&2
        local project_root_for_backup
        project_root_for_backup="$(dirname -- "$BACKUPS_ROOT")"
        if ! "$BACKUP_SH" "$target" --agent-id restore-safety --project-root "$project_root_for_backup" >/dev/null; then
            echo "Error: failed to create safety backup of '$target'; aborting restore" >&2
            return 1
        fi
    fi

    mkdir -p -- "$(dirname -- "$target")"
    cp -- "$source" "$target"
    echo "Restored '$target' from legacy backup '$(basename -- "$source")'"
    return 0
}

# Dispatch a "<kind>\t<path>" candidate (current or legacy) to the matching
# restore function. $target is only used for the legacy path; the
# current-convention path re-reads original_file from its own metadata.json.
do_restore_candidate() {
    local kind="$1" path="$2" target="$3" dry_run="$4" force="$5"

    if [[ "$kind" == "legacy" ]]; then
        do_restore_legacy "$path" "$target" "$dry_run"
    else
        do_restore "$path" "$dry_run" "$force"
    fi
}

restore_file_cmd() {
    local file_path="$1" agent_filter="$2" dry_run="$3" force="$4"

    local target_real
    target_real="$(resolve_real "$file_path")"

    local -a sorted=()
    while IFS= read -r line; do sorted+=("$line"); done \
        < <(collect_all_candidates "$target_real" "$agent_filter" | sort_candidates_newest_first)

    if [[ ${#sorted[@]} -eq 0 ]]; then
        echo "No backup found for: $file_path" >&2
        return 2
    fi

    local top kind path
    top="${sorted[0]}"
    kind="$(printf '%s' "$top" | cut -f2)"
    path="$(printf '%s' "$top" | cut -f3-)"

    do_restore_candidate "$kind" "$path" "$target_real" "$dry_run" "$force"
    return $?
}

restore_id_cmd() {
    local id="$1" agent_filter="$2" dry_run="$3" force="$4"

    local d
    if ! d="$(find_backup_by_id "$id" "$agent_filter")"; then
        echo "No backup found with id: $id" >&2
        return 2
    fi

    do_restore "$d" "$dry_run" "$force"
}

restore_dir_cmd() {
    local dir="$1" dry_run="$2" force="$3"
    [[ -d "$dir" ]] || { echo "Error: not a directory: $dir" >&2; return 1; }
    do_restore "$dir" "$dry_run" "$force"
}

main() {
    require_jq

    [[ $# -ge 1 ]] || { usage; exit 1; }

    local mode="" file_path="" agent_id="" backup_id="" backup_dir_pos=""
    local dry_run="false" force="false"

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --list)
                [[ $# -ge 2 ]] || die_usage "--list requires a file path"
                mode="list"
                file_path="$2"
                shift 2
                ;;
            --file)
                [[ $# -ge 2 ]] || die_usage "--file requires a file path"
                mode="restore-file"
                file_path="$2"
                shift 2
                ;;
            --backup-id)
                [[ $# -ge 2 ]] || die_usage "--backup-id requires an id"
                mode="restore-id"
                backup_id="$2"
                shift 2
                ;;
            --agent-id)
                [[ $# -ge 2 ]] || die_usage "--agent-id requires a value"
                agent_id="$2"
                shift 2
                ;;
            --dry-run)
                dry_run="true"
                shift
                ;;
            --force)
                force="true"
                shift
                ;;
            -h|--help)
                usage
                exit 1
                ;;
            -*)
                die_usage "Unknown flag: $1"
                ;;
            *)
                if [[ -z "$mode" && -z "$backup_dir_pos" ]]; then
                    mode="restore-dir"
                    backup_dir_pos="$1"
                    shift
                else
                    die_usage "Unexpected argument: $1"
                fi
                ;;
        esac
    done

    local rc=0
    case "$mode" in
        list)
            list_backups_cmd "$file_path" "$agent_id" || rc=$?
            ;;
        restore-file)
            restore_file_cmd "$file_path" "$agent_id" "$dry_run" "$force" || rc=$?
            ;;
        restore-id)
            restore_id_cmd "$backup_id" "$agent_id" "$dry_run" "$force" || rc=$?
            ;;
        restore-dir)
            restore_dir_cmd "$backup_dir_pos" "$dry_run" "$force" || rc=$?
            ;;
        *)
            usage
            rc=1
            ;;
    esac

    exit "$rc"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
