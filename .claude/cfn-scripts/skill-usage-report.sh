#!/usr/bin/env bash
# skill-usage-report — summarize Skill-tool usage recorded by the tracker hook.
#
# Joins the full skill inventory (~/.claude/skills, project-local .claude/skills,
# and plugin SKILL.md files under ~/.claude/plugins) against recorded usage in
# $CFN_SKILL_USAGE_DB, then prints which skills are used vs unused so unused
# ones can be flagged as deprecation candidates.
#
#   default:      per-skill table (SKILL, USES, PROJECTS, LAST_USED, STATUS),
#                 least-used sorted to top.
#   --unused:     only zero-use skills, one per line, plus summary line.
#   --top N:      top-N most-used skills as a table.
#   --since DATE: restrict the usage window (YYYY-MM-DD; ISO-8601 lexicographic
#                 compare means a date prefix works against %Y-%m-%dT... ts).
#   --json:       machine-readable JSON list instead of a table.
#
#   Env override:
#       CFN_SKILL_USAGE_DB  default $HOME/.claude/cfn-data/skill-usage.sqlite
#
#   Usage:
#       skill-usage-report.sh [--unused] [--top N] [--since YYYY-MM-DD] [--json]
set -euo pipefail

export CFN_SKILL_USAGE_DB="${CFN_SKILL_USAGE_DB:-$HOME/.claude/cfn-data/skill-usage.sqlite}"

python3 - "$@" <<'PY'
import argparse, glob, json, os, sqlite3

def normalize(name):
    return name.split(":")[-1].strip().lower()

def inventory():
    skills = set()
    home = os.path.expanduser("~")
    bases = [
        os.path.join(home, ".claude", "skills"),
        os.path.join(os.getcwd(), ".claude", "skills"),
    ]
    for base in bases:
        if os.path.isdir(base):
            for name in os.listdir(base):
                if os.path.isdir(os.path.join(base, name)):
                    skills.add(normalize(name))
    plugins_root = os.path.join(home, ".claude", "plugins")
    if os.path.isdir(plugins_root):
        for path in glob.glob(os.path.join(plugins_root, "**", "SKILL.md"), recursive=True):
            skills.add(normalize(os.path.basename(os.path.dirname(path))))
    return skills

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--unused", action="store_true")
    ap.add_argument("--top", type=int)
    ap.add_argument("--since")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    db = os.environ.get("CFN_SKILL_USAGE_DB") or os.path.expanduser("~/.claude/cfn-data/skill-usage.sqlite")
    inv = inventory()

    # aggregate usage per skill_norm (empty if DB/table missing)
    agg = {}
    try:
        con = sqlite3.connect(db)
        con.row_factory = sqlite3.Row
        where = ""
        params = ()
        if args.since:
            where = "WHERE ts >= ?"
            params = (args.since,)
        rows = con.execute(
            "SELECT skill_norm, COUNT(*) cnt, GROUP_CONCAT(DISTINCT project) projects, MAX(ts) last "
            "FROM skill_usage " + where + " GROUP BY skill_norm", params)
        for r in rows:
            agg[r["skill_norm"]] = {"cnt": r["cnt"], "projects": r["projects"] or "", "last": r["last"] or ""}
        con.close()
    except sqlite3.Error:
        pass

    # union: inventory plus any usage-only skills (orphan usage is still reported)
    names = set(inv) | set(agg.keys())
    rows_out = []
    for n in names:
        a = agg.get(n)
        cnt = a["cnt"] if a else 0
        rows_out.append({
            "skill": n,
            "total_uses": cnt,
            "projects": a["projects"] if a else "",
            "last_used": a["last"] if a else "",
            "status": "used" if cnt > 0 else "unused",
        })

    if args.unused:
        shown = sorted((r for r in rows_out if r["total_uses"] == 0), key=lambda r: r["skill"])
    elif args.top is not None:
        shown = sorted(rows_out, key=lambda r: (-r["total_uses"], r["skill"]))[:max(args.top, 0)]
    else:
        shown = sorted(rows_out, key=lambda r: (r["total_uses"], r["skill"]))

    if args.json:
        print(json.dumps(shown))
        return

    if args.unused:
        for r in shown:
            print(r["skill"])
    else:
        print(f"{'SKILL':<40} {'USES':>6} {'PROJECTS':<30} {'LAST_USED':<22} STATUS")
        for r in shown:
            print(f"{r['skill'][:40]:<40} {r['total_uses']:>6} {r['projects'][:30]:<30} {(r['last_used'] or '-')[:22]:<22} {r['status']}")

    # summary always reflects the full inventory (independent of --top/--unused filter)
    total = len(inv)
    used = sum(1 for n in inv if (agg.get(n) or {}).get("cnt", 0) > 0)
    print(f"Total skills: {total} | Used: {used} | Unused: {total - used}")

main()
PY
