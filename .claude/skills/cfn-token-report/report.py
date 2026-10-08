#!/usr/bin/env python3
"""cfn-token-report: where Claude Code tokens went, from the local session logs.

Reads ~/.claude/projects/<project>/<session>.jsonl (main chat) and
<session>/subagents/agent-*.jsonl (subagents, typed by agent-*.meta.json).
Counts each assistant message ONCE: Claude Code writes the same message on
2-5 lines (one per content block) with identical usage, so line counts
inflate totals. Tokens only, no dollars: on a subscription the dollar figure
is notional, and limits are shown by Claude Code's own /usage.

Usage: report.py [--days N | --since YYYY-MM-DD] [--project NAME] [--top N] [--json]
Env:   CFN_TOKEN_REPORT_ROOT  log root (default ~/.claude/projects)
Exit:  0 = report printed (including "no usage"); 2 = bad arguments or no log folder
"""
# cfn: tokens only, no per-provider dollar cost; add pricing when a per-use provider
# (Z.ai, Kimi, OpenRouter) is run through Claude Code often enough to matter.
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

FIELDS = ("input", "output", "cache_write", "cache_read")
USAGE_KEYS = {
    "input": "input_tokens",
    "output": "output_tokens",
    "cache_write": "cache_creation_input_tokens",
    "cache_read": "cache_read_input_tokens",
}


def project_name(slug):
    """'-Users-me-Projects-claude-flow-novice-src' -> 'claude-flow-novice-src'."""
    marker = "-Projects-"
    if marker in slug:
        return slug.split(marker, 1)[1]
    parts = slug.strip("-").split("-")
    if len(parts) <= 2 and parts[0] == "Users":
        return "~ (home folder)"
    return slug


def parse_ts(raw):
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None


def agent_type(jsonl_path):
    meta = jsonl_path[: -len(".jsonl")] + ".meta.json"
    try:
        with open(meta, encoding="utf-8") as fh:
            kind = json.load(fh).get("agentType")
        if kind:
            return kind
    except (OSError, ValueError, AttributeError):
        pass
    return "subagent (unknown type)"


def log_files(root, since_epoch):
    """Yield (path, project, agent) for every session log touched since the window opened."""
    for slug in sorted(os.listdir(root)):
        pdir = os.path.join(root, slug)
        if not os.path.isdir(pdir):
            continue
        proj = project_name(slug)
        for dirpath, _dirs, files in os.walk(pdir):
            is_sub = os.path.basename(dirpath) == "subagents"
            for name in files:
                if not name.endswith(".jsonl"):
                    continue
                path = os.path.join(dirpath, name)
                try:
                    if os.path.getmtime(path) < since_epoch:
                        continue
                except OSError:
                    continue
                yield path, proj, (agent_type(path) if is_sub else "main")


def collect(root, since, project_filter):
    seen = {}
    skipped = 0
    for path, proj, agent in log_files(root, since.timestamp()):
        if project_filter and project_filter.lower() not in proj.lower():
            continue
        try:
            fh = open(path, encoding="utf-8", errors="replace")
        except OSError:
            continue
        with fh:
            for lineno, line in enumerate(fh):
                if '"assistant"' not in line or '"usage"' not in line:
                    if line.strip() and not line.lstrip().startswith("{"):
                        skipped += 1
                    continue
                try:
                    rec = json.loads(line)
                except ValueError:
                    skipped += 1
                    continue
                if rec.get("type") != "assistant":
                    continue
                msg = rec.get("message") or {}
                usage = msg.get("usage")
                ts = parse_ts(rec.get("timestamp"))
                if not isinstance(usage, dict) or ts is None or ts < since:
                    continue
                key = msg.get("id") or rec.get("requestId") or f"{path}:{lineno}"
                seen[key] = {
                    "ts": ts,
                    "project": proj,
                    "agent": agent,
                    "model": msg.get("model") or "unknown",
                    **{f: int(usage.get(k) or 0) for f, k in USAGE_KEYS.items()},
                }
    return list(seen.values()), skipped


def tally(rows, keyfn):
    groups = {}
    for r in rows:
        g = groups.setdefault(keyfn(r), {"messages": 0, **{f: 0 for f in FIELDS}})
        g["messages"] += 1
        for f in FIELDS:
            g[f] += r[f]
    return groups


def ranked(groups, top=None):
    """Biggest first, by fresh tokens (everything except cheap cache reads)."""
    items = sorted(
        groups.items(),
        key=lambda kv: kv[1]["input"] + kv[1]["output"] + kv[1]["cache_write"],
        reverse=True,
    )
    return [{"key": k, **v} for k, v in (items[:top] if top else items)]


def human(n):
    for unit, size in (("B", 1e9), ("M", 1e6), ("K", 1e3)):
        if n >= size:
            return f"{n / size:.1f}{unit}"
    return str(n)


def print_table(title, rows):
    print(f"\n{title}")
    print(f"  {'':28} {'replies':>8} {'output':>8} {'new input':>10} {'cache write':>12} {'cache read':>11}")
    for r in rows:
        label = r["key"] if len(r["key"]) <= 28 else r["key"][:27] + "~"
        print(
            f"  {label:28} {r['messages']:>8} {human(r['output']):>8} {human(r['input']):>10}"
            f" {human(r['cache_write']):>12} {human(r['cache_read']):>11}"
        )


def main(argv):
    ap = argparse.ArgumentParser(description="Token use from Claude Code session logs.")
    when = ap.add_mutually_exclusive_group()
    when.add_argument("--days", type=int, default=7, help="look back N days (default 7)")
    when.add_argument("--since", help="start date, YYYY-MM-DD (local time)")
    ap.add_argument("--project", help="only projects whose name contains this text")
    ap.add_argument("--top", type=int, default=10, help="rows per breakdown (default 10)")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args(argv)

    now = datetime.now(timezone.utc)
    if args.since:
        try:
            since = datetime.strptime(args.since, "%Y-%m-%d").astimezone()
        except ValueError:
            print(f"cfn-token-report: --since expects YYYY-MM-DD, got {args.since}", file=sys.stderr)
            return 2
    else:
        if args.days < 1:
            print("cfn-token-report: --days must be 1 or more", file=sys.stderr)
            return 2
        since = now - timedelta(days=args.days)

    root = os.environ.get("CFN_TOKEN_REPORT_ROOT") or os.path.expanduser("~/.claude/projects")
    if not os.path.isdir(root):
        print(f"cfn-token-report: no session log folder at {root}", file=sys.stderr)
        return 2

    rows, skipped = collect(root, since, args.project)
    totals = tally(rows, lambda r: "all").get("all", {"messages": 0, **{f: 0 for f in FIELDS}})
    report = {
        "window": {
            "since": since.isoformat(timespec="seconds"),
            "until": now.isoformat(timespec="seconds"),
            "project_filter": args.project,
            "skipped_lines": skipped,
        },
        "totals": totals,
        "by_project": ranked(tally(rows, lambda r: r["project"]), args.top),
        "by_agent": ranked(tally(rows, lambda r: r["agent"]), args.top),
        "by_model": ranked(tally(rows, lambda r: r["model"])),
        "by_day": sorted(
            ({"key": k, **v} for k, v in tally(rows, lambda r: r["ts"].astimezone().strftime("%Y-%m-%d")).items()),
            key=lambda d: d["key"],
        ),
    }

    if args.json:
        json.dump(report, sys.stdout)
        print()
        return 0

    start = since.astimezone().strftime("%Y-%m-%d")
    scope = f" in projects matching '{args.project}'" if args.project else ""
    if totals["messages"] == 0:
        print(f"No usage found since {start}{scope}.")
        return 0
    print(f"Token use since {start}{scope}: {totals['messages']} replies")
    print(
        f"  output {human(totals['output'])}, new input {human(totals['input'])}, "
        f"cache written {human(totals['cache_write'])}, cache read {human(totals['cache_read'])}"
    )
    print("  Sorted by fresh tokens (output + new input + cache written); cache reads are cheap re-reads.")
    print_table("By project", report["by_project"])
    print_table("By agent (main = your chat)", report["by_agent"])
    print_table("By model", report["by_model"])
    print_table("By day", report["by_day"])
    if skipped:
        print(f"\n({skipped} unreadable log lines skipped)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
