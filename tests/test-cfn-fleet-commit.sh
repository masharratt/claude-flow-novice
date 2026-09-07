#!/bin/bash
# tests/test-cfn-fleet-commit.sh
# Phase CI :: cfn-fleet `commit` + `migrate-next` subcommands (Priority 1)
# Guards two real incidents from fleet run e59a7826 (gg-all-projects, 2026-09-05):
#   - FormField incident (L~1654): a staged hunk rode another session's commit.
#     `fleet commit` must refuse (exit 66) while unclaimed dirty files (incl.
#     untracked) exist, and must stage ONLY claimed paths.
#   - Migration collision (L1851): two sessions computed the same next migration
#     number (0082/0084). `fleet migrate-next` must reserve under one flock and
#     never hand the same number to two workstreams.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

SKILL_LIB="$PROJECT_ROOT/.claude/skills/cfn-fleet/lib"

TEST_TMP=$(mktemp -d -t cfn-fleet-commit.XXXXXX)
FIXTURES=()
FIX_OUT="$TEST_TMP/out.txt"
FIX_ERR="$TEST_TMP/err.txt"
RC=0

cleanup() {
    local d
    for d in "${FIXTURES[@]:-}"; do
        if [ -n "$d" ] && [ -d "$d" ]; then
            rm -rf "$d"
        fi
    done
    rm -rf "$TEST_TMP"
}
trap cleanup EXIT

# ----------------------------------------------------------------------------
# Fixture helpers
# ----------------------------------------------------------------------------

# Write a SPEC-shaped roster.tsv (header + 10 tab-separated columns).
# Usage: write_roster <run_dir> <WS01-claims>
write_roster() {
    local rd="$1" claims="${2:-claimed.txt}"
    printf 'ws_id\tname\ttask\tstatus\tclaims\tlanded_sha\tmigration_num\tscratch_db\theartbeat\tnotes\n' > "$rd/roster.tsv"
    printf 'WS01\tws-auth\tbuild auth\tworking\t%s\t\t\t\t0\tprev note\n' "$claims" >> "$rd/roster.tsv"
    printf 'WS02\tws-api\tbuild api\tpending\t\t\t\t\t0\t\n' >> "$rd/roster.tsv"
    : > "$rd/.roster.lock"
}

# Build a temp git repo with a fleet run dir inside it, cd into the repo root.
# Sets FIXTURE_REPO, FLEET_RUN_DIR.
build_fixture_repo() {
    local claims="${1:-claimed.txt}"
    local repo
    repo=$(mktemp -d "$TEST_TMP/repo.XXXXXX")
    FIXTURES+=("$repo")
    FIXTURE_REPO="$repo"
    git -C "$repo" init -q -b main 2>/dev/null || git -C "$repo" init -q
    git -C "$repo" config user.email "fleet-test@example.com"
    git -C "$repo" config user.name "Fleet Test"
    git -C "$repo" config commit.gpgsign false
    git -C "$repo" config core.autocrlf false
    printf 'base\n' > "$repo/tracked.txt"
    # The fleet run dir is metadata, not deliverable: ignore it so roster
    # writes never register as unclaimed dirty files.
    printf 'planning/fleet-*/\n' > "$repo/.gitignore"
    git -C "$repo" add tracked.txt .gitignore
    git -C "$repo" commit -qm init
    mkdir -p "$repo/planning/fleet-test"
    write_roster "$repo/planning/fleet-test" "$claims"
    export FLEET_RUN_DIR="$repo/planning/fleet-test"
    cd "$repo"
}

# Run a fleet cmd function in a subshell, capture out/err/rc without tripping set -e.
expect_code() {
    local expected="$1"
    shift
    RC=0
    ( "$@" ) > "$FIX_OUT" 2> "$FIX_ERR" || RC=$?
    if [ "$RC" -ne "$expected" ]; then
        log_error "expected exit $expected, got $RC"
        log_error "stdout: $(cat "$FIX_OUT")"
        log_error "stderr: $(cat "$FIX_ERR")"
    fi
}

# ----------------------------------------------------------------------------
# lib/common.sh loading
# ----------------------------------------------------------------------------
# Real common.sh (agent A) is used when present. Until it lands, tests may run
# against a SPEC-faithful stub, but only when FLEET_TEST_ALLOW_STUB_COMMON=1 is
# set explicitly, so stub coverage can never pass silently.
load_common_or_stub() {
    if [ -f "$SKILL_LIB/common.sh" ]; then
        # shellcheck disable=SC1091
        source "$SKILL_LIB/common.sh"
        log_info "using real lib/common.sh"
        return 0
    fi
    if [ "${FLEET_TEST_ALLOW_STUB_COMMON:-0}" != "1" ]; then
        echo "FATAL: $SKILL_LIB/common.sh not found. Set FLEET_TEST_ALLOW_STUB_COMMON=1 to run against SPEC stubs." >&2
        exit 1
    fi
    log_warn "common.sh not landed yet; using SPEC stub (FLEET_TEST_ALLOW_STUB_COMMON=1)"
    cat > "$TEST_TMP/common-stub.sh" <<'STUB'
# SPEC-faithful minimal common.sh (planning/SPEC-cfn-fleet.md, lib/common.sh section).
fleet_run_dir() {
    if [ -n "${FLEET_RUN_DIR:-}" ]; then printf '%s\n' "$FLEET_RUN_DIR"; return 0; fi
    printf 'no fleet run dir (fleet init first)\n' >&2
    exit 64
}
fleet_env_get() {
    local f key val
    f="$(fleet_run_dir)/fleet.env"
    key="$1"
    [ -f "$f" ] || { printf '%s\n' ""; return 0; }
    val=$(awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/,""); print; exit}' "$f")
    printf '%s\n' "$val"
}
fleet_roster_file() {
    printf '%s/roster.tsv\n' "$(fleet_run_dir)"
}
roster_exists() {
    local f; f=$(fleet_roster_file)
    awk -F'\t' -v w="$1" 'NR>1 && $1==w {found=1; exit} END {exit found ? 0 : 1}' "$f"
}
roster_get() {
    local ws="$1" field="$2" f col
    f=$(fleet_roster_file)
    col=$(awk -F'\t' -v fl="$2" 'NR==1 {for (i=1;i<=NF;i++) if ($i==fl) {print i; exit}}' "$f")
    [ -n "$col" ] || fleet_die 65 "unknown roster field: $field"
    roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"
    awk -F'\t' -v c="$col" -v w="$ws" 'NR>1 && $1==w {print $c; exit}' "$f"
}
roster_set() {
    local ws="$1" field="$2" val="$3" f tmp
    f=$(fleet_roster_file)
    roster_exists "$ws" || fleet_die 65 "unknown workstream: $ws"
    (
        flock -x 200 || exit 71
        tmp="$f.tmp.$$"
        awk -F'\t' -v OFS='\t' -v w="$ws" -v fl="$field" -v v="$val" '
            NR==1 {for (i=1;i<=NF;i++) if ($i==fl) c=i; print; next}
            $1==w && c {$c=v; print; next}
            {print}' "$f" > "$tmp" && mv "$tmp" "$f"
    ) 200>"$(fleet_run_dir)/.roster.lock"
}
roster_rows() {
    tail -n +2 "$(fleet_roster_file)"
}
fleet_die() {
    local code="$1"
    shift
    printf '%s\n' "$*" >&2
    exit "$code"
}
STUB
    # shellcheck disable=SC1090
    source "$TEST_TMP/common-stub.sh"
}

# ----------------------------------------------------------------------------
# commit tests
# ----------------------------------------------------------------------------

test_commit_clean_stages_only_claimed_and_lands() {
    log_step "GIVEN repo whose only dirty files are claimed (modified + untracked)"
    build_fixture_repo "claimed.txt claimed-new.txt"
    printf 'changed\n' > claimed.txt
    printf 'new\n' > claimed-new.txt

    expect_code 0 main WS01 -m "add auth"

    assert_equals "fleet WS01: add auth" "$(git log -1 --pretty=%s)" "commit message prefixed fleet WSxx"
    local sha status landed
    sha=$(git rev-parse --short HEAD)
    landed=$(roster_get WS01 landed_sha)
    status=$(roster_get WS01 status)
    assert_equals "$sha" "$landed" "roster landed_sha records commit sha"
    assert_equals "landed" "$status" "roster status set to landed"
    assert_equals "" "$(git status --porcelain -uall)" "no dirty files left (all claimed committed)"
}

test_commit_unclaimed_dirty_refused_66() {
    log_step "GIVEN claimed + unclaimed dirty + untracked unclaimed files"
    build_fixture_repo "claimed.txt"
    printf 'changed\n' > claimed.txt      # claimed, tracked, modified
    printf 'changed\n' > other.txt        # unclaimed, tracked, modified
    printf 'x\n' > stray.txt              # unclaimed, untracked

    local head_before
    head_before=$(git rev-parse HEAD)
    expect_code 66 main WS01 -m "nope"

    assert_contains "$(cat "$FIX_ERR")" "unclaimed dirty files present" "guard message on stderr"
    assert_contains "$(cat "$FIX_ERR")" "other.txt" "unclaimed tracked file listed"
    assert_contains "$(cat "$FIX_ERR")" "stray.txt" "unclaimed untracked file listed"
    assert_not_contains "$(cat "$FIX_ERR")" "claimed.txt" "claimed file not listed as unclaimed"
    assert_equals "$head_before" "$(git rev-parse HEAD)" "no commit created on refusal"
    assert_equals "" "$(git diff --cached --name-only)" "nothing staged on refusal (staged hunk must not ride)"
    assert_equals "working" "$(roster_get WS01 status)" "status unchanged on refusal"
    assert_equals "" "$(roster_get WS01 landed_sha)" "landed_sha unchanged on refusal"
}

test_commit_force_with_note_stages_only_claimed() {
    log_step "GIVEN unclaimed dirty files, WHEN --force-with-note"
    build_fixture_repo "claimed.txt"
    printf 'changed\n' > claimed.txt
    printf 'changed\n' > other.txt
    printf 'x\n' > stray.txt

    expect_code 0 main WS01 -m "forced" --force-with-note

    assert_equals "fleet WS01: forced" "$(git log -1 --pretty=%s)" "forced commit created"
    local names
    names=$(git show --name-only --pretty=format: HEAD)
    assert_contains "$names" "claimed.txt" "claimed file committed"
    assert_not_contains "$names" "other.txt" "unclaimed file NOT swept into commit"
    assert_not_contains "$names" "stray.txt" "untracked unclaimed file NOT swept into commit"
    assert_contains "$(roster_get WS01 notes)" "forced-commit-unclaimed-left" "force note appended to roster"
    assert_equals "landed" "$(roster_get WS01 status)" "status landed after forced commit"
    assert_contains "$(git status --porcelain -uall)" "other.txt" "unclaimed dirty file left in worktree"
    assert_contains "$(git status --porcelain -uall)" "stray.txt" "untracked unclaimed file left in worktree"
}

test_commit_no_commit_stage_only_dry_run() {
    log_step "GIVEN claimed + unclaimed dirty, WHEN --no-commit"
    build_fixture_repo "claimed.txt"
    printf 'changed\n' > claimed.txt
    printf 'changed\n' > other.txt
    printf 'x\n' > stray.txt

    local head_before
    head_before=$(git rev-parse HEAD)
    expect_code 66 main WS01 -m "dry" --no-commit

    log_step "WHEN only claimed files dirty, --no-commit stages without committing"
    build_fixture_repo "claimed.txt"
    printf 'changed\n' > claimed.txt
    head_before=$(git rev-parse HEAD)
    expect_code 0 main WS01 -m "dry" --no-commit

    assert_equals "$head_before" "$(git rev-parse HEAD)" "--no-commit creates no commit"
    assert_equals "claimed.txt" "$(git diff --cached --name-only)" "only claimed path staged"
    assert_equals "" "$(roster_get WS01 landed_sha)" "landed_sha NOT set on stage-only"
    assert_equals "working" "$(roster_get WS01 status)" "status NOT landed on stage-only"
}

test_commit_dir_claim_prefix_match() {
    log_step "GIVEN claim is a directory prefix (src/auth), dirty file inside it"
    build_fixture_repo "src/auth"
    mkdir -p src/auth
    printf 'h\n' > src/auth/handler.py
    printf 'o\n' > src/other.py
    git add src
    git commit -qm "seed src"
    printf 'h2\n' > src/auth/handler.py    # claimed (prefix dir), dirty
    printf 'o2\n' > src/other.py           # unclaimed, dirty

    expect_code 66 main WS01 -m "x"

    assert_contains "$(cat "$FIX_ERR")" "src/other.py" "unclaimed file under sibling dir listed"
    assert_not_contains "$(cat "$FIX_ERR")" "handler.py" "file under claimed dir prefix not listed"
}

test_commit_requires_repo_root() {
    log_step "GIVEN cwd is a subdirectory of the repo"
    build_fixture_repo "claimed.txt"
    mkdir -p sub
    cd sub
    printf 'changed\n' > ../claimed.txt

    expect_code 64 main WS01 -m "x"

    assert_contains "$(cat "$FIX_ERR")" "repo root" "hint names the repo root"
}

test_commit_unknown_ws_refused_65() {
    log_step "GIVEN WS id absent from roster"
    build_fixture_repo "claimed.txt"
    printf 'changed\n' > claimed.txt

    expect_code 65 main WS99 -m "x"
    assert_contains "$(cat "$FIX_ERR")" "WS99" "unknown WS reported"
}

# ----------------------------------------------------------------------------
# migrate-next tests
# ----------------------------------------------------------------------------

# Build fixture with a migrations dir seeded from args (each arg a filename).
# Sets MIGRATIONS (repo-relative path). cwd = repo root.
build_fixture_with_migrations() {
    local claims="${1:-}"; shift
    build_fixture_repo "$claims"
    mkdir -p db/migrations
    local f
    for f in "$@"; do
        printf '%s\n' "-- migration" > "db/migrations/$f"
    done
    MIGRATIONS="db/migrations"
}

test_migrate_next_empty_dir_reserves_0001() {
    log_step "GIVEN migrations dir with no numbered files (non-numeric ignored)"
    build_fixture_with_migrations "" "readme.md" "notes.txt"

    expect_code 0 main WS01 "$MIGRATIONS"

    assert_equals "0001" "$(tail -n 1 "$FIX_OUT" | tr -d '[:space:]')" "first reservation is 0001 (width 4 default)"
    assert_equals "0001" "$(roster_get WS01 migration_num)" "reservation recorded in roster"
}

test_migrate_next_max_plus_one_zero_padded() {
    log_step "GIVEN existing 0001..0007 migration files"
    build_fixture_with_migrations "" "0001_a.sql" "0002_b.sql" "0007_c.sql"

    expect_code 0 main WS01 "$MIGRATIONS"

    assert_equals "0008" "$(tail -n 1 "$FIX_OUT" | tr -d '[:space:]')" "next = max+1, padded to existing width"
    assert_equals "0008" "$(roster_get WS01 migration_num)" "roster migration_num set"
}

test_migrate_next_width_follows_existing() {
    log_step "GIVEN existing 2-digit migration name"
    build_fixture_with_migrations "" "07_users.sql"

    expect_code 0 main WS01 "$MIGRATIONS"

    assert_equals "08" "$(tail -n 1 "$FIX_OUT" | tr -d '[:space:]')" "padded to width of existing names"
}

test_migrate_next_second_call_same_ws_refused_65() {
    log_step "GIVEN WS01 already holds a reservation"
    build_fixture_with_migrations "" "0007_c.sql"
    expect_code 0 main WS01 "$MIGRATIONS"

    expect_code 65 main WS01 "$MIGRATIONS"

    assert_equals "0008" "$(roster_get WS01 migration_num)" "existing reservation unchanged on refusal"
    assert_contains "$(cat "$FIX_ERR")" "WS01" "refusal names the workstream"
}

test_migrate_next_sequential_reservations_no_dupe() {
    log_step "GIVEN dir max 0007; two workstreams reserve in sequence"
    # Guards the 0082/0084 collision: the second reservation must see the first
    # WS's roster reservation even though neither has written its file yet.
    build_fixture_with_migrations "" "0007_c.sql"

    expect_code 0 main WS01 "$MIGRATIONS"
    local first
    first=$(tail -n 1 "$FIX_OUT" | tr -d '[:space:]')

    expect_code 0 main WS02 "$MIGRATIONS"
    local second
    second=$(tail -n 1 "$FIX_OUT" | tr -d '[:space:]')

    assert_equals "0008" "$first" "first WS gets max+1"
    assert_equals "0009" "$second" "second WS gets first+1 (roster reservation counted)"
    if [ "$first" = "$second" ]; then
        log_error "DUPLICATE migration number handed to WS01 and WS02"
        return 1
    fi
    assert_equals "0008" "$(roster_get WS01 migration_num)" "WS01 reservation recorded"
    assert_equals "0009" "$(roster_get WS02 migration_num)" "WS02 reservation recorded"
}

test_migrate_next_missing_dir_refused_65() {
    log_step "GIVEN nonexistent migrations dir"
    build_fixture_repo ""

    expect_code 65 main WS01 "db/does-not-exist"
    assert_contains "$(cat "$FIX_ERR")" "db/does-not-exist" "missing dir reported"
}

# ----------------------------------------------------------------------------
# run
# ----------------------------------------------------------------------------

load_common_or_stub

# Router contract: each cmd file defines `main`, so only one may be "live" at a
# time. Run the commit suite to completion before sourcing migrate-next.
# shellcheck disable=SC1091
source "$SKILL_LIB/cmd-commit.sh"

test_commit_clean_stages_only_claimed_and_lands
test_commit_unclaimed_dirty_refused_66
test_commit_force_with_note_stages_only_claimed
test_commit_no_commit_stage_only_dry_run
test_commit_dir_claim_prefix_match
test_commit_requires_repo_root
test_commit_unknown_ws_refused_65

test_commit_run_dir_dirt_ignored_by_guard() {
    # Regression (2026-09-06): the commit guard originally had no
    # fleet-run-dir exclusion, so another workstream's roster heartbeat under
    # planning/fleet-*/ (run dir tracked or unignored) would 66 every commit
    # in real runs. Same exclusion land already had.
    log_step "GIVEN unignored fleet run dir with dirt from another WS heartbeat"
    build_fixture_repo "claimed.txt"
    git rm -q --cached .gitignore
    rm .gitignore
    git commit -qm "track fleet run dir"
    printf 'changed\n' > claimed.txt
    printf 'hb\n' > "$FLEET_RUN_DIR/roster.tsv.tmp.999"   # roster_set tmp of another WS

    expect_code 0 main WS01 -m "auth"

    assert_equals "fleet WS01: auth" "$(git log -1 --pretty=%s)" "commit succeeds despite run-dir dirt"
    local names
    names=$(git show --name-only --pretty=format: HEAD)
    assert_contains "$names" "claimed.txt" "claimed file committed"
    assert_not_contains "$names" "roster.tsv.tmp.999" "run-dir dirt NOT swept into commit"
}
test_commit_run_dir_dirt_ignored_by_guard

# shellcheck disable=SC1091
source "$SKILL_LIB/cmd-migrate-next.sh"

test_migrate_next_empty_dir_reserves_0001
test_migrate_next_max_plus_one_zero_padded
test_migrate_next_width_follows_existing
test_migrate_next_second_call_same_ws_refused_65
test_migrate_next_sequential_reservations_no_dupe
test_migrate_next_missing_dir_refused_65

print_test_summary
