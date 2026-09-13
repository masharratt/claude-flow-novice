#!/usr/bin/env bash
# cfn-wiki change-story view: git history around the feature map, parsed
# cfn-retro style (one `git log` walk with a %x01 record separator), for the
# portal payload.
#
# Fixed JSON contract (API — the portal payload assembles from these keys):
#   wiki_view_change <store> <repo> [window]   # store = <repo>/.wiki/store.json
#                                              # window default "12w"
#     -> {
#          "commits":  [ {"sha": "<full hex>", "date": "<ISO-8601 author date>",
#                         "type": "feat"|"fix"|<conventional prefix>|"merge"|"other",
#                         "files_count": <n>} ],
#          "hotspots": [ {"file": "<repo-relative path>",
#                         "count": <commits in window touching the file>} ],
#          "story":    { "<fid>": {"first_commit_date": <ISO date or null>,
#                                  "commit_count": <n>} }
#        }
#
#   window: "<N>w" weeks | "<N>d" days | "<N>m" months (default 12w); a bare
#   number means weeks. Applies to commits, hotspots and story alike
#   (git --since).
#   commits: every commit in the window (newest first, git order), merges
#   included. type = the conventional-commit prefix (feat/fix/chore/docs/
#   style/refactor/perf/test/build/ci/revert, scope and ! tolerated),
#   "merge" for merge commits, "other" otherwise.
#   hotspots: top 10 files by commit touch count in the window, ties broken
#   by path name.
#   story: one entry per store fid (ALL fids, even untouched ones);
#   first_commit_date is the author date of the OLDEST in-window commit
#   touching any of the fid's files, null when none.
#
# Degraded: <repo> not a git work tree (or git missing) -> empty commits/
# hotspots and null story dates, exit 0, stderr notice. Exit 1 (stderr note,
# no stdout) only on a missing/unreadable store.

wiki_view_change() {
    local store="${1:?wiki_view_change: store path required}"
    local repo="${2:?wiki_view_change: repo path required}"
    local window="${3:-12w}"
    if [ ! -f "$store" ]; then
        echo "wiki_view_change: no store at $store (run wiki_extract first)" >&2
        return 1
    fi

    python3 - "$store" "$repo" "$window" <<'PY'
import datetime
import json
import re
import subprocess
import sys

# store load + single-object emit kept per-file across the five view modules:
# the plan's Phase 5 file contract has no shared view helper. (cfn: duplicated
# ~15-line loader, extract into lib/view-common.sh if a 6th view ever lands.)
try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        store = json.load(fh)
except (OSError, ValueError) as exc:
    sys.exit("wiki_view_change: store unreadable: %s" % exc)
repo, window = sys.argv[2], sys.argv[3]

CONVENTIONAL = {"feat", "fix", "chore", "docs", "style", "refactor",
                "perf", "test", "build", "ci", "revert"}
TYPE_RE = re.compile(r"^([A-Za-z]+)(?:\([^)]*\))?!?:\s?")
window_re = re.compile(r"^(\d+)\s*([wdm]?)$", re.I)


def since_clause(spec):
    m = window_re.match(spec.strip())
    if not m:
        print("wiki_view_change: window '%s' unrecognized, using 12w"
              % spec, file=sys.stderr)
        n, unit = 12, "w"
    else:
        n, unit = int(m.group(1)), m.group(2).lower() or "w"
    unit_name = {"w": "week", "d": "day", "m": "month"}[unit]
    return "%d %s ago" % (max(n, 1), unit_name)


def commit_type(subject):
    if subject.startswith("Merge "):
        return "merge"
    m = TYPE_RE.match(subject)
    if m:
        token = m.group(1).lower()
        return token if token in CONVENTIONAL else "other"
    return "other"


story_files = {f.get("fid", ""): set(f.get("files", []))
               for f in store.get("features", [])}

commits, hotspot_counts = [], {}
story = {fid: {"first_commit_date": None, "commit_count": 0}
         for fid in story_files}

try:
    log = subprocess.run(
        ["git", "-C", repo, "log", "--since=" + since_clause(window),
         "--date=iso-strict", "--format=%x01%H%x1f%ad%x1f%s", "--name-only"],
        capture_output=True, text=True, check=True).stdout
except (OSError, subprocess.CalledProcessError) as exc:
    print("wiki_view_change: DEGRADED: no git history for %s (%s)"
          % (repo, exc.__class__.__name__), file=sys.stderr)
    print(json.dumps({"commits": commits, "hotspots": [],
                      "story": story}, ensure_ascii=False))
    sys.exit(0)

first_dt = {}
for block in log.split("\x01"):
    if not block.strip():
        continue
    lines = block.splitlines()
    parts = lines[0].split("\x1f", 2)
    if len(parts) < 3:
        continue
    sha, date, subject = parts[0].strip(), parts[1].strip(), parts[2].strip()
    files = [ln.strip() for ln in lines[1:] if ln.strip()]
    commits.append({"sha": sha, "date": date,
                    "type": commit_type(subject),
                    "files_count": len(files)})
    for fp in files:
        hotspot_counts[fp] = hotspot_counts.get(fp, 0) + 1
    try:
        dt = datetime.datetime.fromisoformat(date)
    except ValueError:
        dt = None
    for fid, file_set in story_files.items():
        if file_set.intersection(files):
            story[fid]["commit_count"] += 1
            if dt is not None and (fid not in first_dt or dt < first_dt[fid]):
                first_dt[fid] = dt
                story[fid]["first_commit_date"] = date

hotspots = [{"file": fp, "count": n}
            for fp, n in sorted(hotspot_counts.items(),
                                key=lambda kv: (-kv[1], kv[0]))[:10]]
print(json.dumps({"commits": commits, "hotspots": hotspots, "story": story},
                 ensure_ascii=False))
PY
}
