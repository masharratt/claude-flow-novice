# lib/cmd-migrate-next.sh — cfn-fleet `migrate-next`: migration number
# allocation under one flock. Sourced by cli/fleet after lib/common.sh;
# defines main (router contract).
#
# Incident class killed (planning/SPEC-cfn-fleet.md, migrate-next section):
# two sessions computed the same next migration number (0082/0084 collision,
# fleet run e59a7826 L1851). Scan + max + reserve run inside a single lock,
# and reservations recorded in the roster count toward the max even before
# the migration file exists, so no two workstreams can receive one number.
#
# Usage: main WSxx <migrations_dir>
# Exit codes: 0 ok (echoes the reserved, zero-padded number),
# 64 usage, 65 unknown WS / missing dir / WS already holds a reservation.

if ! command -v fleet_die >/dev/null 2>&1; then
    # Standalone/test sourcing: pull in the shared roster helpers.
    # shellcheck disable=SC1091
    source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/common.sh"
fi

main() {
    if [ $# -ne 2 ]; then
        fleet_die 64 "usage: fleet migrate-next WSxx <migrations_dir>"
    fi
    local ws="$1" mdir="$2"
    roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"
    if [ ! -d "$mdir" ]; then
        fleet_die 65 "migrations dir not found: $mdir"
    fi

    local roster lock
    roster=$(fleet_roster_file)
    lock="$(dirname "$roster")/.roster.lock"

    # Hold the roster lock (same file roster_set/cmd-add use) across scan +
    # max + reserve so two sessions cannot observe the same maximum.
    # Inside the lock every roster access is a direct awk call: roster_set
    # would take its own flock 9 and deadlock against the one we hold.
    exec 9>>"$lock"
    flock 9

    _fleet_migrate_release_lock() {
        flock -u 9
        exec 9>&-
    }

    local -a dir_nums=() all_nums=()
    local f base n
    for f in "$mdir"/*; do
        [ -e "$f" ] || continue
        base=$(basename "$f")
        if [[ "$base" =~ ^([0-9]+)_ ]]; then
            dir_nums+=("${BASH_REMATCH[1]}")
            # 10#: normalize to decimal — zero-padded names are octal-looking
            # to bash arithmetic (0082/0084 class).
            all_nums+=("$((10#${BASH_REMATCH[1]}))")
        fi
    done

    # Existing reservations count toward the max even though their migration
    # files do not exist yet; otherwise the second reservation in a row would
    # replay the 0082/0084 collision.
    local rid rnum
    while IFS=$'\t' read -r rid rnum; do
        if [ -n "$rid" ] && [ -n "$rnum" ]; then
            all_nums+=("$((10#$rnum))")
        fi
    done < <(awk -F'\t' '
        NR == 1 { for (i = 1; i <= NF; i++) if ($i == "migration_num") c = i; next }
        NR > 1  { print $1 "\t" $c }' "$roster")

    local max=0
    for n in "${all_nums[@]}"; do
        if [ "$n" -gt "$max" ]; then max="$n"; fi
    done

    # Zero-pad to the width of the numbers already in the dir (default 4 when
    # the dir has no numbered files yet).
    local width=4
    if [ "${#dir_nums[@]}" -gt 0 ]; then
        width=1
        for n in "${dir_nums[@]}"; do
            if [ "${#n}" -gt "$width" ]; then width="${#n}"; fi
        done
    fi

    local mine
    mine=$(awk -F'\t' -v ws="$ws" '
        NR == 1 { for (i = 1; i <= NF; i++) if ($i == "migration_num") c = i; next }
        $1 == ws { print $c; exit }' "$roster")
    if [ -n "$mine" ]; then
        _fleet_migrate_release_lock
        fleet_die 65 "$ws already has migration_num=$mine reserved"
    fi

    local next=$((max + 1))
    local padded
    padded=$(printf '%0*d' "$width" "$next")

    # Reserve: atomic row rewrite (tmp+mv) while still holding the lock,
    # mirroring roster_set's internals.
    local tmp="${roster}.tmp.$$"
    awk -F'\t' -v OFS='\t' -v ws="$ws" -v v="$padded" '
        NR == 1  { for (i = 1; i <= NF; i++) if ($i == "migration_num") c = i; print; next }
        $1 == ws && c { $c = v; print; next }
                       { print }' "$roster" > "$tmp" && mv -f "$tmp" "$roster"

    _fleet_migrate_release_lock
    printf '%s\n' "$padded"
}
