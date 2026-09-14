#!/usr/bin/env bash
# cfn-wiki scale and regression bench.
#
# Implements the "Scale and regression suite" section of
# planning/cfn-wiki/PLAN_context-bounded-repo-documentation.md: deterministic
# synthetic repositories at 1k / 10k / 100k files, each carrying the plan's
# shapes (monorepo apps/packages, one giant file >= 50k lines, sparse/partial
# graph, renamed+deleted sources across commits, dirty worktree, generated and
# vendor trees, deep import chains), measured against cfn-wiki discovery and
# the evidence packet ceilings.
#
# Usage:
#   tests/wiki-scale-bench.sh [--tiers 1000,10000,100000] [--keep] [--skip-portal]
#   tests/wiki-scale-bench.sh --red-selftest    # prove the FAIL path trips
#   tests/wiki-scale-bench.sh --determinism     # regen 1k twice, compare
#
# Env:
#   WIKI_SCALE_MAX          largest tier allowed (default 10000; set
#                           WIKI_SCALE_MAX=100000 to opt into the 100k tier)
#   WIKI_SCALE_WALL_BUDGET  estimated whole-run seconds budget (default 3600)
#   WIKI_SCALE_TMP          scratch root (default /tmp/wiki-scale-bench-PID)
#
# Output: one JSON line per tier on stdout (skip lines carry "skip": true and
# a reason). FAIL lines go to stderr; exit 1 when any hard ceiling is
# violated, 0 otherwise. Perf numbers are reported, never asserted (no
# unmeasured thresholds). All generated repositories live under WIKI_SCALE_TMP
# in /tmp; the real repository tree is never written to.
#
# Stdlib python3, git, GNU time, GNU stat only. No em dashes by repo rule.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$SCRIPT_DIR/../.claude/skills/cfn-wiki/lib"
DISCOVERY="$LIB/discovery.py"

SEED=20260914
WIKI_SCALE_MAX="${WIKI_SCALE_MAX:-10000}"
WIKI_SCALE_WALL_BUDGET="${WIKI_SCALE_WALL_BUDGET:-3600}"
WIKI_SCALE_TMP="${WIKI_SCALE_TMP:-/tmp/wiki-scale-bench-$$}"

KEEP=0
SKIP_PORTAL=0
FAILS=0
RUN_START=$(date +%s)

# ---------------------------------------------------------------------------
# helpers

now_s() { date +%s.%N; }

wall_between() { # start end -> seconds with 2 decimals
    # A negative result means the sampled clock jumped backward between the
    # two date calls (observed on WSL2 clock corrections). Clamping keeps a
    # bogus number out of the report; the warning keeps it visible.
    awk -v a="$1" -v b="$2" 'BEGIN {
        d = b - a
        if (d < 0) { printf "%.2f", 0 } else { printf "%.2f", d }
    }'
    if awk -v a="$1" -v b="$2" 'BEGIN { if (b < a) exit 0; exit 1 }'; then
        echo "bench: warning: clock sample inversion (${2} < ${1}); clamped to 0.00" >&2
    fi
}

elapsed_total() { echo $(( $(date +%s) - RUN_START )); }

cleanup() {
    if [ "$KEEP" -eq 0 ] && [ "$FAILS" -eq 0 ] && [ -d "$WIKI_SCALE_TMP" ]; then
        # A huge tier tree can hit a transient WSL2 rm race ("directory not
        # empty"); cleanup failure must never fail the bench or mask results.
        rm -rf "$WIKI_SCALE_TMP" 2>/dev/null || \
            echo "bench: warning: could not fully remove $WIKI_SCALE_TMP; remove manually" >&2
    elif [ -d "$WIKI_SCALE_TMP" ]; then
        echo "bench: kept scratch at $WIKI_SCALE_TMP (KEEP=$KEEP FAILS=$FAILS)" >&2
    fi
}
trap cleanup EXIT

# ceiling <label> <actual> <limit>: hard ceiling, FAIL (exit 1) when violated.
ceiling() {
    local label="$1" actual="$2" limit="$3"
    if [ -z "$actual" ] || ! [[ "$actual" =~ ^[0-9]+$ ]] || \
            [ "$actual" -gt "$limit" ]; then
        echo "FAIL: $label: value '${actual:-missing}' exceeds ceiling $limit" >&2
        FAILS=$(( FAILS + 1 ))
        TIER_FAILED=1
        return 1
    fi
    return 0
}

# expect_flag <label> <actual> <expected>: exact string match assert.
expect_flag() {
    local label="$1" actual="$2" expected="$3"
    if [ "$actual" != "$expected" ]; then
        echo "FAIL: $label: got '$actual', expected '$expected'" >&2
        FAILS=$(( FAILS + 1 ))
        TIER_FAILED=1
        return 1
    fi
    return 0
}

# val <key> <file>: read key=value line written by the parse helpers below.
val() { sed -n "s/^$2=//p" "$1" | head -1; }

# emit_json k v k v ...: one JSON line, coercing true/false and numbers.
emit_json() {
    python3 - "$@" <<'PY'
import json
import sys
pairs = sys.argv[1:]
out = {}
for i in range(0, len(pairs) - 1, 2):
    key, raw = pairs[i], pairs[i + 1]
    if raw == 'true':
        raw = True
    elif raw == 'false':
        raw = False
    else:
        try:
            raw = int(raw)
        except ValueError:
            try:
                raw = float(raw)
            except ValueError:
                pass
    out[key] = raw
print(json.dumps(out))
PY
}

# ---------------------------------------------------------------------------
# synthetic repo generator (deterministic: fixed seed, sha256-derived content,
# no clock, no randomness)

generate_repo() { # <dir> <budget>
    python3 - "$1" "$2" "$SEED" <<'PY'
import hashlib
import os
import sys

repo = os.path.abspath(sys.argv[1])
budget = int(sys.argv[2])
seed = int(sys.argv[3])


def digest(*parts):
    joined = '|'.join(str(p) for p in parts)
    return hashlib.sha256(joined.encode('utf-8')).hexdigest()


files = {}


def add(rel, text):
    files[rel] = text


# fixed scaffold: git metadata, credentials (excluded), docs, config,
# lockfile (generated class), CI workflow (job candidate).
add('.gitignore', '.wiki/\n')
add('.env', 'SYNTH_TOKEN=%d\n' % seed)
add('README.md',
    '# synthetic scale fixture %d\n\nGenerated deterministically by '
    'tests/wiki-scale-bench.sh. Not real code.\n' % seed)
add('package.json',
    '{"name": "scale-synth", "version": "1.0.0", '
    '"dependencies": {"left-pad": "1.0.0", "widget-core": "2.3.1"}, '
    '"devDependencies": {"typebench": "0.9.0"}}\n')
add('package-lock.json',
    '{"name": "scale-synth", "lockfileVersion": 3, "packages": {}}\n')
add('tsconfig.json', '{"compilerOptions": {"strict": true}}\n')
add('.github/workflows/ci.yml',
    'jobs:\n  build:\n    steps:\n      - run: make check\n')

# giant file: one python module with >= 50000 lines.
lines = ['# giant-file fixture seed %d' % seed,
         'GIANT_CONST = %d' % (seed % 99991)]
for i in range(25000):
    lines.append('def g_%05d(arg=%d):' % (i, i % 97))
    lines.append('    return arg + %d' % i)
add('giant/big.py', '\n'.join(lines) + '\n')

# span ceiling targets: narrow lines fit 120 in 8192 bytes, wide lines do not.
add('span/target_narrow.py',
    ''.join(('L%03d' % i).ljust(63, '.') + '\n' for i in range(500)))
add('span/target_wide.py',
    ''.join(('W%03d' % i).ljust(99, '.') + '\n' for i in range(200)))

# deep dependency chain at repo root: c00 imports c01 ... imports c39.
for k in range(40):
    if k < 39:
        add('c%02d.py' % k,
            'import c%02d\n\nchain_value_%02d = %d\n' % (k + 1, k, k))
    else:
        add('c39.py', 'chain_value_39 = 39\n')

# sparse / partial graph: half import missing modules, half standalone.
for i in range(20):
    if i % 2 == 0:
        add('sparse/s%02d.py' % i,
            'import missing_module_%02d\n\n\ndef s%02d_fn():\n'
            '    return %d\n' % (i, i, i))
    else:
        add('sparse/s%02d.py' % i, 'standalone_%02d = %d\n' % (i, i))

# rename + delete history fixtures (moved in commit 2, removed in commit 3).
add('src/legacy_old.py',
    'def legacy_op(alpha):\n    """moved by git mv in commit 2"""\n'
    '    return alpha * %d\n' % (seed % 4096))
add('src/doomed.py',
    'def doomed_op():\n    """deleted by git rm in commit 3"""\n'
    '    return %d\n' % (seed % 512))

# dirty worktree anchor: tracked here, edited after the last commit.
add('apps/web/src/app_main.ts',
    'export function appMain(seedValue: number): number {\n'
    '  return seedValue + %d;\n}\n' % (seed % 89))

fixed = len(files)
scaled = max(0, budget - fixed)
mono_n = scaled * 45 // 100
vendor_n = scaled * 15 // 100
nm_n = scaled * 25 // 100
src_n = scaled - mono_n - vendor_n - nm_n

# monorepo: apps/<name>/src/*.ts (js adapter, routes) and packages/*.py.
apps = ('web', 'api', 'worker', 'admin', 'mobile')
pkgs = ('shared', 'ui', 'utils', 'core')
apps_n = mono_n // 2
pkg_n = mono_n - apps_n
per_app = apps_n // len(apps)
extra = apps_n - per_app * len(apps)
i = 0
for app in apps:
    count = per_app + (extra if app == 'web' else 0)
    for _ in range(count):
        body = ('export function handler_%05d(x: number): number {\n'
                '  const tag = "%s";\n  return x + %d;\n}\n'
                % (i, digest('app', app, i)[:8], i % 53))
        if i % 17 == 0:
            body += 'app.get("/route/%05d", handler_%05d);\n' % (i, i)
        add('apps/%s/src/f%05d.ts' % (app, i), body)
        i += 1
per_pkg = pkg_n // len(pkgs)
extra = pkg_n - per_pkg * len(pkgs)
i = 0
for pkg in pkgs:
    count = per_pkg + (extra if pkg == 'shared' else 0)
    for _ in range(count):
        add('packages/%s/lib%05d.py' % (pkg, i),
            'def lib_%05d(a, b=%d):\n    return a + b * %d\n'
            % (i, i % 31, i))
        i += 1

# vendored tree: ruby files, no adapter, parser gap stays visible.
made = 0
vendor_pkgs = max(1, vendor_n // 8) if vendor_n else 0
for k in range(vendor_pkgs):
    for j in range(8):
        if made >= vendor_n:
            break
        add('vendor/lib%03d/mod_%02d.rb' % (k, j),
            'class Mod%02d\n  def call(x)\n    x * %d\n  end\nend\n'
            % (j, k))
        made += 1
k = 0
while made < vendor_n:
    add('vendor/extra%04d.rb' % k, '# stray vendor file %d\n' % k)
    made += 1
    k += 1

# generated / dependency filler: node_modules scale with minified lines.
made = 0
for k in range(nm_n // 2):
    add('node_modules/p%05d/package.json' % k,
        '{"name": "p%05d", "version": "1.%d.0", "main": "index.js"}\n'
        % (k, k % 9))
    add('node_modules/p%05d/index.js' % k,
        'module.exports=function(){return "%s";};\n'
        % (digest('nm', k)[:40] * 17))
    made += 2
k = 0
while made < nm_n:
    add('node_modules/p%05d/extra.js' % k, 'var x="%s";\n' % ('z' * 700))
    made += 1
    k += 1

# regular src tree with partial cross imports (every 7th imports a helper
# that does not exist: sparse graph contribution).
if src_n:
    dirs = 10
    per = src_n // dirs
    extra = src_n - per * dirs
    n = 0
    for d in range(dirs):
        count = per + (1 if d < extra else 0)
        for _ in range(count):
            head = 'import mod_helper_missing\n\n' if n % 7 == 0 else ''
            add('src/m%d/mod%05d.py' % (d, n),
                head + 'def fn_a_%05d(v):\n    return v + %d\n\n'
                'def fn_b_%05d(v):\n    return v * 2\n' % (n, n % 13, n))
            n += 1

for rel in sorted(files):
    full = os.path.join(repo, rel)
    parent = os.path.dirname(full)
    if parent:
        os.makedirs(parent, exist_ok=True)
    with open(full, 'w', encoding='utf-8') as handle:
        handle.write(files[rel])

print(len(files))
PY
}

# git_history <repo>: 3 dated commits (add, rename, delete), then a dirty
# worktree (one tracked edit + one untracked file).
git_history() {
    local repo="$1"
    export GIT_AUTHOR_DATE="2026-01-01T00:00:00+00:00"
    export GIT_COMMITTER_DATE="2026-01-01T00:00:00+00:00"
    git -C "$repo" init -q -b main
    git -C "$repo" config user.email 'bench@example.test'
    git -C "$repo" config user.name 'wiki scale bench'
    git -C "$repo" add -A
    git -C "$repo" commit -qm "synth c1: full tree seed $SEED"
    git -C "$repo" mv src/legacy_old.py src/legacy_new.py
    git -C "$repo" commit -qm 'synth c2: rename legacy source'
    git -C "$repo" rm -q src/doomed.py
    git -C "$repo" commit -qm 'synth c3: delete doomed source'
    printf '// late local edit seed %s\n' "$SEED" \
        >> "$repo/apps/web/src/app_main.ts"
    printf 'local scratch note %s\n' "$SEED" > "$repo/scratch_notes.md"
}

# ---------------------------------------------------------------------------
# measurement helpers

parse_discover() { # <json file>
    python3 - "$1" <<'PY'
import json
import sys
data = json.load(open(sys.argv[1]))
counts = data.get('counts') or {}
totals = data.get('totals') or {}
print('files=%s' % (data.get('enumeration') or {}).get('files_seen'))
print('revision=%s' % data.get('revision'))
print('symbols=%s' % totals.get('symbols'))
print('relations=%s' % totals.get('relations'))
print('rebuilt=%s' % (data.get('index') or {}).get('rebuilt'))
for key in ('source', 'test', 'vendored', 'generated', 'excluded', 'docs',
            'config', 'unknown', 'archived'):
    print('count_%s=%s' % (key, counts.get(key, 0)))
PY
}

parse_query() { # <json file>
    python3 - "$1" <<'PY'
import json
import sys
try:
    data = json.load(open(sys.argv[1]))
except (ValueError, OSError):
    print('items=parse_error')
    raise SystemExit(0)
items = data.get('items') or []
first = items[0] if items else {}
print('items=%d' % len(items))
print('accounted=%s' % data.get('accounted_bytes'))
print('truncated=%s' % str(data.get('truncated')).lower())
print('reason=%s' % (data.get('truncation_reason') or 'none'))
print('total=%s' % data.get('total'))
if first.get('kind') == 'span':
    print('span_lines=%s' % (
        first.get('end_line', 0) - first.get('start_line', 0) + 1))
    print('span_bytes=%s' % first.get('content_bytes'))
PY
}

run_discover() { # <repo> <workdir>: sets D_WALL, D_RSS_KB, writes disc.out
    local repo="$1" work="$2" t0 t1 elapsed_line
    t0=$(now_s)
    /usr/bin/time -v -o "$work/time.out" \
        python3 "$DISCOVERY" discover "$repo" \
        > "$work/disc.out" 2> "$work/disc.err"
    t1=$(now_s)
    # Authoritative wall time is the one /usr/bin/time measured around the
    # child itself: shell-side date samples can straddle a WSL2 clock
    # correction and invert (observed as a negative wall in a prior run).
    elapsed_line=$(sed -n \
        's/^[[:space:]]*Elapsed (wall clock) time (h:mm:ss or m:ss): \(.*\)$/\1/p' \
        "$work/time.out" | tail -1)
    D_WALL=$(awk -v e="$elapsed_line" 'BEGIN {
        n = split(e, parts, ":")
        if (n == 3) { printf "%.2f", parts[1] * 3600 + parts[2] * 60 + parts[3] }
        else if (n == 2) { printf "%.2f", parts[1] * 60 + parts[2] }
        else { printf "%.2f", -1 }
    }')
    if ! [[ "$D_WALL" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
        # time -v parse failed: fall back to the shell samples
        D_WALL=$(wall_between "$t0" "$t1")
    fi
    D_RSS_KB=$(sed -n \
        's/^[[:space:]]*Maximum resident set size (kbytes): \([0-9]\+\).*/\1/p' \
        "$work/time.out" | tail -1)
}

run_query() { # <repo> <workdir> <name> kind args...: sets Q_WALL, writes q.<name>
    local repo="$1" work="$2" name="$3"; shift 3
    local t0 t1
    t0=$(now_s)
    python3 "$DISCOVERY" query "$repo" "$@" \
        > "$work/q.$name.out" 2> "$work/q.$name.err"
    t1=$(now_s)
    Q_WALL=$(wall_between "$t0" "$t1")
}

measure_portal() { # <repo> -> prints byte count, or failed:<last stderr line>
    local repo="$1" out err
    out=$(mktemp) ; err=$(mktemp)
    if timeout 900 bash -c '
            set -euo pipefail
            source "$1/extract-features.sh"
            source "$1/../portal/build-portal.sh"
            repo="$2"
            wiki_extract "$repo" >/dev/null
            wiki_build_portal "$repo/.wiki/store.json" "$repo" \
                "$repo/.wiki/portal/index.html" >/dev/null
        ' _ "$LIB" "$repo" > "$out" 2> "$err"; then
        stat -c %s "$repo/.wiki/portal/index.html"
    else
        printf 'failed:%s\n' \
            "$(tail -1 "$err" | tr -d '\"' | tr '\n' ' ' | cut -c1-160)"
    fi
    rm -f "$out" "$err"
}

# ---------------------------------------------------------------------------
# one tier

run_tier() { # <tier>
    local tier="$1"
    local tier_dir="$WIKI_SCALE_TMP/tier-$tier"
    local work="$tier_dir/.bench-work"
    TIER_FAILED=0

    mkdir -p "$work"

    local t0 t1 gen_wall git_wall
    t0=$(now_s)
    local gen_files
    gen_files=$(generate_repo "$tier_dir/repo" "$tier")
    t1=$(now_s); gen_wall=$(wall_between "$t0" "$t1")

    t0=$(now_s)
    git_history "$tier_dir/repo"
    t1=$(now_s); git_wall=$(wall_between "$t0" "$t1")

    run_discover "$tier_dir/repo" "$work"
    parse_discover "$work/disc.out" > "$work/disc.vars"
    local files_total symbols_total relations_total
    files_total=$(val "$work/disc.vars" files)
    symbols_total=$(val "$work/disc.vars" symbols)
    relations_total=$(val "$work/disc.vars" relations)
    local revision dirty
    revision=$(val "$work/disc.vars" revision)
    case "$revision" in
        *-dirty-*) dirty=true ;;
        *) dirty=false ;;
    esac
    local index_mb
    index_mb=$(awk -v b="$(stat -c %s "$tier_dir/repo/.wiki/discovery.sqlite")" \
        'BEGIN { printf "%.2f", b / 1048576 }')
    local rss_mb
    rss_mb=$(awk -v k="${D_RSS_KB:-0}" 'BEGIN { printf "%.1f", k / 1024 }')

    # files list query (list caps + accounted bytes)
    run_query "$tier_dir/repo" "$work" files files --class source
    local fq_wall=$Q_WALL
    parse_query "$work/q.files.out" > "$work/q.files.vars"
    local fq_items fq_bytes
    fq_items=$(val "$work/q.files.vars" items)
    fq_bytes=$(val "$work/q.files.vars" accounted)

    # symbols list query (second list-cap sample)
    run_query "$tier_dir/repo" "$work" symbols symbols
    parse_query "$work/q.symbols.out" > "$work/q.symbols.vars"
    local sym_items
    sym_items=$(val "$work/q.symbols.vars" items)

    # span queries: 120-line request on the giant file (required check; the
    # window sits fully inside the 50002-line file), 120-line request on the
    # wide target (byte-cap path), 500-line request on the narrow target
    # (line-cap path).
    run_query "$tier_dir/repo" "$work" spanGiant span \
        giant/big.py 40000 40119
    local sq_wall=$Q_WALL
    parse_query "$work/q.spanGiant.out" > "$work/q.spanGiant.vars"
    local sq_lines sq_bytes
    sq_lines=$(val "$work/q.spanGiant.vars" span_lines)
    sq_bytes=$(val "$work/q.spanGiant.vars" span_bytes)

    run_query "$tier_dir/repo" "$work" spanWide span \
        span/target_wide.py 1 120
    parse_query "$work/q.spanWide.out" > "$work/q.spanWide.vars"
    local wide_lines wide_bytes wide_trunc wide_reason
    wide_lines=$(val "$work/q.spanWide.vars" span_lines)
    wide_bytes=$(val "$work/q.spanWide.vars" span_bytes)
    wide_trunc=$(val "$work/q.spanWide.vars" truncated)
    wide_reason=$(val "$work/q.spanWide.vars" reason)

    run_query "$tier_dir/repo" "$work" spanNarrow span \
        span/target_narrow.py 1 500
    parse_query "$work/q.spanNarrow.out" > "$work/q.spanNarrow.vars"
    local narrow_lines narrow_bytes narrow_reason
    narrow_lines=$(val "$work/q.spanNarrow.vars" span_lines)
    narrow_bytes=$(val "$work/q.spanNarrow.vars" span_bytes)
    narrow_reason=$(val "$work/q.spanNarrow.vars" reason)

    # portal: single-file initial payload at 1k/10k; skipped at 100k.
    local portal_bytes='skipped'
    if [ "$SKIP_PORTAL" -eq 1 ]; then
        portal_bytes='skipped:--skip-portal'
    elif [ "$tier" -ge 100000 ]; then
        portal_bytes='skipped:tier>=100000 (single-file portal embed measured only below 100k)'
    else
        portal_bytes=$(measure_portal "$tier_dir/repo")
    fi
    case "$portal_bytes" in
        [0-9]*) ;;
        *) echo "bench: tier $tier portal: $portal_bytes" >&2 ;;
    esac

    # hard ceilings (plan: initial packet ceilings must hold at every scale).
    # Every check runs under `|| true`: set -e must not abort the tier before
    # its JSON line is emitted; ceiling()/expect_flag() record the failure.
    ceiling "tier $tier files-query item cap" "$fq_items" 40 || true
    ceiling "tier $tier files-query byte cap" "$fq_bytes" 8192 || true
    ceiling "tier $tier symbols-query item cap" "$sym_items" 40 || true
    ceiling "tier $tier span-120 giant line cap" "$sq_lines" 120 || true
    ceiling "tier $tier span-120 giant byte cap" "$sq_bytes" 8192 || true
    ceiling "tier $tier span-120 wide line cap" "$wide_lines" 120 || true
    ceiling "tier $tier span-120 wide byte cap" "$wide_bytes" 8192 || true
    # wide lines are 100 chars: an uncapped delivery would be 120 lines of
    # ~12120 bytes, so the byte cap must engage and report truncation.
    expect_flag "tier $tier span-120 wide truncation" "$wide_trunc" true \
        || true
    expect_flag "tier $tier span-120 wide truncation reason" \
        "$wide_reason" max_bytes || true
    ceiling "tier $tier span-500 narrow line cap" "$narrow_lines" 120 || true
    ceiling "tier $tier span-500 narrow byte cap" "$narrow_bytes" 8192 || true
    expect_flag "tier $tier span-500 narrow truncation reason" \
        "$narrow_reason" max_results || true
    # the 500-line request on 64-char lines must deliver exactly the full
    # 120-line page (120 * 65 = 7800 bytes, under the byte cap).
    expect_flag "tier $tier span-500 narrow delivered lines" \
        "$narrow_lines" 120 || true

    emit_json \
        tier "$tier" \
        files "$files_total" \
        generated_files "$gen_files" \
        dirty_worktree "$dirty" \
        gen_wall_s "$gen_wall" \
        git_wall_s "$git_wall" \
        discover_wall_s "$D_WALL" \
        discover_peak_rss_mb "$rss_mb" \
        index_mb "$index_mb" \
        symbols "$symbols_total" \
        relations "$relations_total" \
        count_source "$(val "$work/disc.vars" count_source)" \
        count_vendored "$(val "$work/disc.vars" count_vendored)" \
        count_generated "$(val "$work/disc.vars" count_generated)" \
        count_excluded "$(val "$work/disc.vars" count_excluded)" \
        count_test "$(val "$work/disc.vars" count_test)" \
        files_query_wall_s "$fq_wall" \
        files_query_items "$fq_items" \
        files_query_bytes "$fq_bytes" \
        span_query_wall_s "$sq_wall" \
        span_query_lines "$sq_lines" \
        span_query_bytes "$sq_bytes" \
        span_wide_lines "$wide_lines" \
        span_wide_bytes "$wide_bytes" \
        span_narrow_lines "$narrow_lines" \
        span_narrow_bytes "$narrow_bytes" \
        ceiling_failures "$TIER_FAILED" \
        portal_bytes "$portal_bytes"

    if [ "$KEEP" -eq 0 ] && [ "$TIER_FAILED" -eq 0 ]; then
        rm -rf "$tier_dir" 2>/dev/null || \
            echo "bench: warning: could not fully remove $tier_dir; remove manually" >&2
    fi
}

skip_tier() { # <tier> <reason>
    emit_json tier "$1" skip true reason "$2"
}

# ---------------------------------------------------------------------------
# modes

red_selftest() {
    # Prove the FAIL machinery can trip: fabricate violations through the
    # same ceiling()/expect_flag() helpers the tiers use.
    ceiling 'red-selftest byte ceiling' 99999 8192 || true
    ceiling 'red-selftest item ceiling' 41 40 || true
    expect_flag 'red-selftest flag' false true || true
    if [ "$FAILS" -ne 3 ]; then
        echo 'RED SELFTEST BROKEN: FAIL path did not trip (assertions cannot fail)' >&2
        exit 2
    fi
    echo 'RED SELFTEST OK: FAIL path trips on all three fabricated violations'
    exit 0
}

determinism_check() {
    # Regenerate the 1k fixture twice; tracked history and worktree bytes
    # must be identical.
    local tmp a b
    tmp=$(mktemp -d /tmp/wiki-scale-determinism-XXXXXX)
    a="$tmp/a" ; b="$tmp/b"
    mkdir -p "$a" "$b"
    generate_repo "$a" 1000 > /dev/null
    generate_repo "$b" 1000 > /dev/null
    git_history "$a"
    git_history "$b"
    local digest_a digest_b
    digest_a=$( (cd "$a" && git rev-parse HEAD && \
        git ls-files -z | sort -z | xargs -0 sha256sum | sha256sum && \
        sha256sum scratch_notes.md apps/web/src/app_main.ts) | sha256sum)
    digest_b=$( (cd "$b" && git rev-parse HEAD && \
        git ls-files -z | sort -z | xargs -0 sha256sum | sha256sum && \
        sha256sum scratch_notes.md apps/web/src/app_main.ts) | sha256sum)
    if [ "$digest_a" != "$digest_b" ]; then
        echo "DETERMINISM FAIL: $digest_a != $digest_b" >&2
        rm -rf "$tmp"
        exit 1
    fi
    rm -rf "$tmp"
    echo "DETERMINISM OK: two independent 1k generations are byte-identical (seed $SEED)"
    exit 0
}

usage() {
    sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

# ---------------------------------------------------------------------------
# main

main() {
    local tiers='1000 10000 100000'
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --tiers) tiers="${2//,/ }"; shift 2 ;;
            --keep) KEEP=1; shift ;;
            --skip-portal) SKIP_PORTAL=1; shift ;;
            --red-selftest) red_selftest ;;
            --determinism) determinism_check ;;
            -h|--help) usage; exit 0 ;;
            *) echo "bench: unknown flag: $1" >&2; usage >&2; exit 64 ;;
        esac
    done

    if [ ! -f "$DISCOVERY" ]; then
        echo "bench: discovery.py not found at $DISCOVERY" >&2
        exit 1
    fi
    if ! command -v /usr/bin/time > /dev/null 2>&1; then
        echo 'bench: GNU /usr/bin/time is required for peak RSS' >&2
        exit 1
    fi

    mkdir -p "$WIKI_SCALE_TMP"

    local last_seconds=0 last_files=0
    for tier in $tiers; do
        if [ "$tier" -gt "$WIKI_SCALE_MAX" ]; then
            skip_tier "$tier" \
                "tier above WIKI_SCALE_MAX=$WIKI_SCALE_MAX; set WIKI_SCALE_MAX=$tier to enable"
            continue
        fi
        # wall budget guard: estimate the tier from the last measured tier
        # (cost scales roughly with file count; 1.3 fudge for git overhead).
        local estimate=0
        if [ "$last_files" -gt 0 ]; then
            estimate=$(awk -v s="$last_seconds" -v f="$last_files" -v n="$tier" \
                'BEGIN { printf "%.0f", s * (n / f) * 1.3 }')
        fi
        local elapsed
        elapsed=$(elapsed_total)
        if [ "$last_files" -gt 0 ] && \
                [ $(( elapsed + estimate )) -gt "$WIKI_SCALE_WALL_BUDGET" ]; then
            skip_tier "$tier" \
                "estimated ${estimate}s at ${elapsed}s elapsed exceeds WIKI_SCALE_WALL_BUDGET=${WIKI_SCALE_WALL_BUDGET}s"
            continue
        fi
        # disk guard: files + .git + index + scratch, ~6 KB per file.
        local avail_kb
        avail_kb=$(df -k /tmp | awk 'NR==2 { print $4 }')
        if [ "$avail_kb" -lt $(( tier * 6 )) ]; then
            skip_tier "$tier" \
                "only ${avail_kb}KB free in /tmp, need ~$(( tier * 6 ))KB"
            continue
        fi

        local tier_start
        tier_start=$(now_s)
        run_tier "$tier"
        last_seconds=$(wall_between "$tier_start" "$(now_s)")
        last_files=$tier
    done

    if [ "$FAILS" -gt 0 ]; then
        echo "bench: $FAILS ceiling violation(s)" >&2
        exit 1
    fi
    exit 0
}

main "$@"
