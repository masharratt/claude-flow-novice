#!/usr/bin/env python3
"""Pre-loop readiness scan of a plan directory.

Answers one question in bounded output: what in this plan still needs a human
before /cfn-loop-task can start. Measured 2026-08-20, a coordinator answered it
by grepping SPEC/DECISIONS/PLAN in the main chat: ~41k context tokens over 26
bash calls, one grep alone returning 7.1k tokens.

It is a section scan, not a keyword grep. A heading that announces open work
(escalations, still open, parked, unresolved, open questions, defects not
patched) contributes its items; the same heading qualified as answered,
resolved, closed, decided, retired, or not re-litigated does not. That
distinction is what a raw grep for "open" cannot make.

Called through preflight.sh. See tests/test-preflight.sh.
"""
import argparse
import json
import os
import re
import sys

ARTIFACTS = ["PLAN", "VERIFY", "SPEC", "DECISIONS", "TEST", "ARCH", "DATA", "OPS", "UX"]
REQUIRED = ["PLAN", "VERIFY", "SPEC", "DECISIONS"]

# A heading announcing work that is still owed to a human.
OPEN_HEADING = re.compile(
    r"escalation|still open|open question|open fork|unresolved|unanswered|parked"
    r"|needs? (a )?decision|awaiting|pending|blocked on|to be decided|tbd"
    r"|reported not patched|not patched|outstanding", re.I)
# The same words qualified as already handled. Checked first, wins.
CLOSED_HEADING = re.compile(
    r"answered|resolved|closed|decided|retired|superseded|not re-litigated"
    r"|already (handled|taken)|no longer", re.I)
ITEM = re.compile(r"^(?:[-*+]\s+|\d+[.)]\s+|#{3,6}\s+)(.+)$")
MAX_ITEMS = 8
MAX_ITEM_CHARS = 90


def find_artifacts(plan_dir):
    found, missing = {}, []
    names = sorted(os.listdir(plan_dir))
    for kind in ARTIFACTS:
        hit = next((n for n in names if n.startswith(kind + "_") and n.endswith(".md")), None)
        if hit:
            found[kind] = os.path.join(plan_dir, hit)
        elif kind in REQUIRED:
            missing.append(kind)
    return found, missing


def scan_open_sections(path):
    """-> list of {file, heading, items[], item_count, truncated}."""
    out = []
    cur = None
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.rstrip("\n")
            m = re.match(r"^(#{2,6})\s+(.*)$", line)
            if m:
                depth, heading = len(m.group(1)), m.group(2).strip()
                # A sub-heading inside an open section is one of its items, not a
                # new section, unless it opens or closes work in its own right.
                if (cur and depth > cur["_depth"]
                        and not OPEN_HEADING.search(heading)
                        and not CLOSED_HEADING.search(heading)):
                    add_item(cur, heading)
                    continue
                if cur:
                    out.append(cur)
                    cur = None
                if OPEN_HEADING.search(heading) and not CLOSED_HEADING.search(heading):
                    cur = {"file": os.path.basename(path), "heading": heading,
                           "items": [], "item_count": 0, "truncated": 0, "_depth": depth}
                continue
            if cur is None:
                continue
            im = ITEM.match(line.strip())
            if im:
                add_item(cur, im.group(1).strip())
    if cur:
        out.append(cur)
    for s in out:
        s.pop("_depth", None)
        s["truncated"] = max(0, s["item_count"] - len(s["items"]))
    return [s for s in out if s["item_count"]]


def add_item(section, text):
    text = re.sub(r"\s+", " ", text).strip(" *_`")
    if not text:
        return
    section["item_count"] += 1
    if len(section["items"]) < MAX_ITEMS:
        section["items"].append(text[:MAX_ITEM_CHARS])


def open_blocking_deferrals(plan_dir, slug):
    """planning/.DEFERRALS_<slug>.json lives beside the plan dir, not inside it."""
    for cand in (os.path.join(os.path.dirname(plan_dir.rstrip("/")), f".DEFERRALS_{slug}.json"),
                 os.path.join(plan_dir, f".DEFERRALS_{slug}.json")):
        if not os.path.isfile(cand):
            continue
        try:
            with open(cand, encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError):
            return 0
        items = data.get("deferrals", data) if isinstance(data, dict) else data
        if not isinstance(items, list):
            return 0
        return sum(1 for d in items if isinstance(d, dict)
                   and str(d.get("status", "OPEN")).upper() == "OPEN"
                   and d.get("blocking", True))
    return 0


def main():
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("--plan-dir")
    ap.add_argument("--slug")
    ap.add_argument("--json", action="store_true")
    try:
        args = ap.parse_args()
    except SystemExit:
        return 2

    plan_dir = args.plan_dir
    if not plan_dir and args.slug:
        plan_dir = os.path.join("planning", args.slug)
    if not plan_dir:
        print("usage: preflight.sh --plan-dir planning/<slug> [--json]\n"
              "       preflight.sh --slug <slug> [--json]", file=sys.stderr)
        return 2
    if not os.path.isdir(plan_dir):
        print(f"error: plan dir not found: {plan_dir}", file=sys.stderr)
        return 2

    slug = args.slug or os.path.basename(plan_dir.rstrip("/"))
    artifacts, missing = find_artifacts(plan_dir)

    sections = []
    for kind in ("DECISIONS", "SPEC", "PLAN", "ARCH", "OPS", "DATA", "UX", "TEST"):
        if kind in artifacts:
            sections.extend(scan_open_sections(artifacts[kind]))

    deferrals = open_blocking_deferrals(plan_dir, slug)
    open_count = sum(s["item_count"] for s in sections)
    needs_human = bool(sections or deferrals or missing)

    result = {
        "slug": slug,
        "plan_dir": plan_dir,
        "artifacts": {k: artifacts.get(k) for k in ARTIFACTS},
        "missing_artifacts": missing,
        "open_sections": sections,
        "open_item_count": open_count,
        "open_blocking_deferrals": deferrals,
        "needs_human": needs_human,
    }

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(f"preflight {slug}  ({plan_dir})")
        if missing:
            print(f"  MISSING ARTIFACT: {', '.join(missing)}")
        if deferrals:
            print(f"  {deferrals} open blocking deferral(s) "
                  f"(resolve via deferrals.sh before the loop can exit)")
        for s in sections:
            print(f"  [{s['file']}] {s['heading']}  ({s['item_count']} item(s))")
            for it in s["items"]:
                print(f"      - {it}")
            if s["truncated"]:
                print(f"      ... {s['truncated']} more not listed")
        if needs_human:
            print(f"  => NEEDS A HUMAN: {open_count} open item(s), "
                  f"{deferrals} open deferral(s), {len(missing)} missing artifact(s).")
            print("     Resolve or explicitly accept each one, record the answers in "
                  "DECISIONS, then re-run.")
        else:
            print("  => clear to start: no open escalations, deferrals, or missing artifacts.")

    return 1 if needs_human else 0


if __name__ == "__main__":
    sys.exit(main())
