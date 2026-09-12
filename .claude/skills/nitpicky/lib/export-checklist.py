#!/usr/bin/env python3
"""Export a nitpicky review into a hand-off checklist for the implementation team.

Reads findings.json (merged) plus a decisions file of the shape
    { "<finding-id>": {"decision": "fix|defer|deny", "explanation": "..."} }
(accepts the review page's backup format {run_id, decisions: {...}}} too)
and writes CHECKLIST.md into the run directory. Undecided findings are counted
in the header and excluded from the sections.

The server imports build_markdown_from_state() for its /api/export endpoint;
keep that function dependency-free (stdlib only, no argparse/sys use).

Exit codes: 0 = written, 2 = bad inputs.
"""
import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}
DECISIONS = ("fix", "defer", "deny")


def item_block(f: dict, explanation: str, with_checkbox: bool) -> list:
    lines = []
    bullet = "- [ ]" if with_checkbox else "-"
    lines.append(f"{bullet} {f['id']} [{f['lens']} · {f['severity']}] {f['what']}")
    lines.append(f"  - Where: {f['url']}")
    lines.append(f"  - Expected: {f['expected']}")
    proof = f["screenshot"] if f.get("proof_ok", True) else f"{f['screenshot']} (screenshot missing)"
    lines.append(f"  - Proof: {proof}")
    if f.get("steps"):
        lines.append(f"  - Steps: {f['steps']}")
    if explanation:
        lines.append(f"  - Context from review: \"{explanation}\"")
    return lines


def build_markdown_from_state(findings_by_id: dict, decisions: dict,
                              run_id: str = "unknown", app_url: str = "unknown"):
    """Shared checklist builder. Returns (markdown_text, counts, undecided)."""
    groups = {d: [] for d in DECISIONS}
    undecided = 0
    for fid, f in findings_by_id.items():
        entry = decisions.get(fid) or {}
        d = entry.get("decision")
        if d in DECISIONS:
            groups[d].append((f, entry.get("explanation", "")))
        else:
            undecided += 1
    for d in DECISIONS:
        groups[d].sort(key=lambda t: SEVERITY_ORDER.get(t[0].get("severity"), 9))

    total = len(findings_by_id)
    counts = {d: len(groups[d]) for d in DECISIONS}
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    lines = [
        "# Nitpicky — Pre-Launch Polish Checklist",
        "",
        f"App: {app_url}",
        f"Run: {run_id}",
        f"Generated: {now}",
        (f"Progress: decided {total - undecided} of {total} — "
         f"Fix: {counts['fix']} · Defer: {counts['defer']} · Deny: {counts['deny']} · "
         f"Undecided: {undecided} (excluded below)"),
        "",
    ]

    if counts["fix"]:
        lines += [f"## Fix ({counts['fix']}) — hand to implementation team", ""]
        for f, expl in groups["fix"]:
            lines += item_block(f, expl, with_checkbox=True)
            lines.append("")
    if counts["defer"]:
        lines += [f"## Deferred ({counts['defer']}) — revisit after launch", ""]
        for f, expl in groups["defer"]:
            lines += item_block(f, expl, with_checkbox=False)
            lines.append("")
    if counts["deny"]:
        lines += [f"## Denied ({counts['deny']}) — reviewed, no action (appendix)", ""]
        for f, expl in groups["deny"]:
            reason = f" — \"{expl}\"" if expl else ""
            lines.append(f"- {f['id']} [{f['lens']} · {f['severity']}] {f['what']}{reason}")
        lines.append("")

    return "\n".join(lines).rstrip() + "\n", counts, undecided


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-dir", required=True)
    ap.add_argument("--decisions", required=True,
                    help="decisions JSON file (server decisions.json or downloaded backup)")
    ap.add_argument("-o", "--out", default=None,
                    help="output path (default: <run-dir>/CHECKLIST.md)")
    args = ap.parse_args()
    run_dir = Path(args.run_dir)

    findings_path = run_dir / "findings.json"
    if not findings_path.is_file():
        print(f"nitpicky-export: no findings.json in {run_dir}; run merge-findings.py first",
              file=sys.stderr)
        return 2
    try:
        findings_doc = json.loads(findings_path.read_text())
        decisions = json.loads(Path(args.decisions).read_text())
    except json.JSONDecodeError as exc:
        print(f"nitpicky-export: invalid JSON ({exc})", file=sys.stderr)
        return 2
    if not isinstance(decisions, dict):
        print("nitpicky-export: decisions file must be a JSON object keyed by finding id",
              file=sys.stderr)
        return 2
    # accept the review page's backup/server format ({decisions: {...}}) or a flat map
    if isinstance(decisions.get("decisions"), dict):
        decisions = decisions["decisions"]

    findings_by_id = {f["id"]: f for f in findings_doc.get("findings", [])}
    text, counts, undecided = build_markdown_from_state(
        findings_by_id, decisions,
        run_id=findings_doc.get("run_id", "unknown"),
        app_url=findings_doc.get("app_url", "unknown"))

    out_path = Path(args.out) if args.out else run_dir / "CHECKLIST.md"
    out_path.write_text(text)

    print(f"nitpicky-export: wrote {out_path}")
    print(f"nitpicky-export: Fix: {counts['fix']} Defer: {counts['defer']} "
          f"Deny: {counts['deny']} undecided={undecided}")
    if undecided:
        print(f"nitpicky-export: warning: {undecided} undecided findings excluded "
              f"(finish triage in review.html or export again)", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
