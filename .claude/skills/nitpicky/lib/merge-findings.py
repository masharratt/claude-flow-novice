#!/usr/bin/env python3
"""Merge per-lens nitpicky findings into findings.json and a self-contained review.html.

The review page is opened from the filesystem (file://), where fetch() is blocked,
so the findings payload is inlined into the HTML. Screenshot paths stay relative to
the run directory, so the whole run dir must stay together.

Finding ids are content hashes (lens + what), so re-merging after adding a lens
keeps existing ids stable and browser-saved decisions aligned.

Exit codes: 0 = merged (missing-screenshot warnings named in output),
1 = schema/parse errors (named), 2 = nothing to merge.
"""
import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

REQUIRED = ("what", "expected", "url", "screenshot")
SEVERITIES = ("high", "medium", "low")
PLACEHOLDER = "__NITPICKY_PAYLOAD__"


def finding_id(lens: str, what: str) -> str:
    digest = hashlib.sha256(f"{lens}\x1f{what}".encode("utf-8")).hexdigest()[:6]
    return f"NP-{digest}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-dir", required=True)
    ap.add_argument("--skill-dir", default=os.path.expanduser("~/.claude/skills/nitpicky"))
    args = ap.parse_args()
    run_dir = Path(args.run_dir)

    run_meta_path = run_dir / "run.json"
    if not run_meta_path.is_file():
        print(f"nitpicky-merge: no run.json in {run_dir}; run new-run.sh first", file=sys.stderr)
        return 2
    run_meta = json.loads(run_meta_path.read_text())

    findings_dir = run_dir / "findings"
    lens_files = sorted(findings_dir.glob("*.json")) if findings_dir.is_dir() else []
    if not lens_files:
        print(f"nitpicky-merge: no finding files in {findings_dir} (read 0 findings)", file=sys.stderr)
        return 2

    findings = []
    errors = []
    warnings = []
    missing_proofs = []
    files_read = 0
    for path in lens_files:
        try:
            doc = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            errors.append(f"{path.name}: invalid JSON ({exc})")
            continue
        lens = doc.get("lens") or path.stem
        items = doc.get("findings")
        if not isinstance(items, list):
            errors.append(f"{path.name}: missing 'findings' array")
            continue
        files_read += 1
        for i, item in enumerate(items):
            label = f"{path.name}#{i}"
            missing_keys = [k for k in REQUIRED if not item.get(k)]
            if missing_keys:
                errors.append(f"{label}: missing required keys {missing_keys}")
                continue
            severity = item.get("severity") or "medium"
            if severity not in SEVERITIES:
                warnings.append(f"{label}: severity '{severity}' not in {SEVERITIES}, using medium")
                severity = "medium"
            screenshot = str(item["screenshot"])
            proof_ok = (run_dir / screenshot).is_file()
            if not proof_ok:
                missing_proofs.append(screenshot)
            findings.append({
                "id": finding_id(lens, str(item["what"])),
                "lens": lens,
                "what": item["what"],
                "expected": item["expected"],
                "url": item["url"],
                "severity": severity,
                "area": item.get("area", ""),
                "steps": item.get("steps", ""),
                "screenshot": screenshot,
                "proof_ok": proof_ok,
            })

    # same lens+what twice -> suffix so ids stay unique
    seen: dict = {}
    for f in findings:
        n = seen.get(f["id"], 0)
        seen[f["id"]] = n + 1
        if n:
            f["id"] = f"{f['id']}-{n + 1}"

    if errors:
        for e in errors:
            print(f"nitpicky-merge: schema-error: {e}", file=sys.stderr)
        return 1

    if not findings:
        print(f"nitpicky-merge: read 0 findings from {files_read} lens files; nothing to merge",
              file=sys.stderr)
        return 2

    doc = {
        "run_id": run_meta["run_id"],
        "app_url": run_meta["app_url"],
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "counts": {
            "total": len(findings),
            "by_lens": {l: sum(1 for f in findings if f["lens"] == l)
                        for l in sorted({f["lens"] for f in findings})},
        },
        "findings": findings,
    }
    out = run_dir / "findings.json"
    tmp = out.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    tmp.replace(out)

    template = Path(args.skill_dir) / "review" / "template.html"
    html = template.read_text()
    if html.count(PLACEHOLDER) != 1:
        print(f"nitpicky-merge: template must contain exactly one {PLACEHOLDER}", file=sys.stderr)
        return 1
    payload = json.dumps(doc, ensure_ascii=False).replace("</", "<\\/")
    (run_dir / "review.html").write_text(html.replace(PLACEHOLDER, payload))

    by_lens = doc["counts"]["by_lens"]
    lens_summary = " ".join(f"{l}={n}" for l, n in by_lens.items())
    print(f"nitpicky-merge: merged {len(findings)} findings ({lens_summary}) "
          f"from {files_read} lens files -> {out}")
    for w in warnings:
        print(f"nitpicky-merge: warning: {w}")
    if missing_proofs:
        print(f"nitpicky-merge: missing-screenshots=[{', '.join(missing_proofs)}] "
              f"(findings kept and marked proof-broken in the review page; "
              f"re-shoot and re-merge to repair)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
