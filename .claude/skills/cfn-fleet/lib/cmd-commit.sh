#!/bin/bash
# lib/cmd-commit.sh — cfn-fleet `commit`: claim-enforced git commit.
# Sourced by cli/fleet after lib/common.sh; defines main (router contract).
#
# Incident class killed (planning/SPEC-cfn-fleet.md, commit section): a staged
# hunk rode another session's commit (FormField incident, fleet run e59a7826
# L~1654). Unclaimed dirty files refuse the commit (exit 66); only claimed
# paths are ever staged.
#
# Usage: main WSxx -m <msg> [--no-commit] [--force-with-note]
# Exit codes: 0 ok, 64 usage/not-repo-root, 65 unknown WS / nothing to commit,
# 66 unclaimed dirty files present, 71 git failure.

if ! command -v fleet_die >/dev/null 2>&1; then
    # Standalone/test sourcing: pull in the shared roster helpers.
    # shellcheck disable=SC1091
    source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
fi

# Claim matcher + dirty scan live in lib/common.sh (_fleet_path_claimed,
# _fleet_all_dirty, _fleet_unclaimed_dirty), shared with cmd-land.sh.

main() {
    local ws="" msg="" no_commit=0 force_note=0
    while [ $# -gt 0 ]; do
        case "$1" in
            -m)
                if [ $# -lt 2 ]; then fleet_die 64 "fleet commit: -m requires a message"; fi
                msg="$2"
                shift 2
                ;;
            --no-commit)
                no_commit=1
                shift
                ;;
            --force-with-note)
                force_note=1
                shift
                ;;
            -*)
                fleet_die 64 "fleet commit: unknown flag: $1"
                ;;
            *)
                if [ -z "$ws" ]; then
                    ws="$1"
                    shift
                else
                    fleet_die 64 "fleet commit: unexpected argument: $1"
                fi
                ;;
        esac
    done
    if [ -z "$ws" ]; then
        fleet_die 64 "usage: fleet commit WSxx -m <msg> [--no-commit] [--force-with-note]"
    fi
    if [ -z "$msg" ]; then
        fleet_die 64 "fleet commit: message required (-m)"
    fi
    roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"

    # Claims are repo-relative, so the working tree must be the repo root.
    local toplevel
    toplevel=$(git rev-parse --show-toplevel 2>/dev/null) || fleet_die 64 "fleet commit: not a git repository"
    if [ "$(pwd -P)" != "$(cd "$toplevel" && pwd -P)" ]; then
        fleet_die 64 "fleet commit must run from the repo root: $toplevel"
    fi

    local claims
    claims=$(roster_get "$ws" claims)

    # Dirty paths via the shared guard helpers (common.sh): rename sides split
    # and claim-checked independently, fleet run dir excluded (other WSes'
    # roster heartbeats under planning/fleet-*/ are not this WS's dirt).
    # -uall expands untracked directories so every stray file is guarded.
    local run_dir="" run_dir_rel=""
    run_dir=$(fleet_run_dir 2>/dev/null || true)
    if [ -n "$run_dir" ]; then
        # shellcheck disable=SC2053
        [[ "$run_dir/" == "$toplevel/"* ]] && run_dir_rel="${run_dir#"$toplevel"/}"
    fi
    local -a dirty_paths=() unclaimed=()
    local path
    while IFS= read -r path; do
        dirty_paths+=("$path")
        _fleet_path_claimed "$path" "$claims" || unclaimed+=("$path")
    done < <(_fleet_all_dirty "$run_dir_rel")

    if [ "${#unclaimed[@]}" -gt 0 ] && [ "$force_note" -eq 0 ]; then
        {
            printf 'unclaimed dirty files present:\n'
            local u
            for u in "${unclaimed[@]}"; do
                printf '  %s\n' "$u"
            done
        } >&2
        fleet_die 66 "unclaimed dirty files present; claim them, clean, or --force-with-note"
    fi

    # Stage ONLY claimed paths: intersect dirty paths with claims so an
    # unclaimed hunk can never ride this commit, even under --force-with-note.
    local -a to_stage=()
    local d
    for d in "${dirty_paths[@]}"; do
        _fleet_path_claimed "$d" "$claims" && to_stage+=("$d")
    done

    if [ "${#to_stage[@]}" -eq 0 ]; then
        if [ "$no_commit" -eq 1 ]; then
            printf 'fleet commit --no-commit: nothing claimed is dirty for %s; nothing staged\n' "$ws"
            return 0
        fi
        fleet_die 65 "nothing to commit for $ws: no dirty files match its claims"
    fi

    git add -- "${to_stage[@]}"

    if [ "$no_commit" -eq 1 ]; then
        printf 'fleet commit --no-commit: staged for %s: %s\n' "$ws" "${to_stage[*]}"
        return 0
    fi

    if ! git commit -q -m "fleet $ws: $msg"; then
        fleet_die 71 "fleet commit: git commit failed for $ws"
    fi

    local sha
    sha=$(git rev-parse --short HEAD)
    roster_set "$ws" landed_sha "$sha"
    roster_set "$ws" status "landed"

    if [ "$force_note" -eq 1 ]; then
        local notes
        notes=$(roster_get "$ws" notes)
        roster_set "$ws" notes "${notes:+${notes} }forced-commit-unclaimed-left"
    fi

    printf '%s\n' "$sha"
}
