#!/usr/bin/env python3
"""Merge per-lens nitpicky findings into findings.json and a self-contained review.html.

The review page is opened over the portal server (or file://), so the findings
payload is also inlined into the HTML. Screenshot paths stay relative to the run
directory. Finding ids are content hashes (lens + what): re-merging after adding a
lens keeps existing ids stable and saved decisions aligned.

Merge also does the mechanical checks agents cannot be trusted to self-report:
- duplicate-evidence detection: byte-identical screenshots referenced by findings
  from different lenses are flagged evidence_flag="duplicate-image" (contaminated
  capture, typically a shared-browser collision)
- cross-lens clustering: near-identical findings (same normalized text, or same
  route with token overlap >= 0.6) share a cluster id so one triage decision can
  cover the duplicates
- coverage accounting: per-route covered/blocked/skipped marks from each agent are
  aggregated; expected routes (run.json `coverage.expected`) never covered are named
- redaction: every string in run.json `redactions` is scrubbed from all finding
  text before anything is written
- run-health summary: counts suspected-env findings so a degraded backend is
  visible before triage starts

Exit codes: 0 = merged (warnings named in output), 1 = schema/parse errors,
2 = nothing to merge.
"""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

REQUIRED = ("what", "expected", "url", "screenshot")
SEVERITIES = ("high", "medium", "low")
PLACEHOLDER = "__NITPICKY_PAYLOAD__"
SCRUB_FIELD_VALUES = ("what", "expected", "url", "area", "steps", "screenshot")
CLUSTER_JACCARD = 0.6


def finding_id(lens: str, what: str) -> str:
    digest = hashlib.sha256(f"{lens}\x1f{what}".encode("utf-8")).hexdigest()[:6]
    return f"NP-{digest}"


def scrub(text, redactions):
    if not redactions or not isinstance(text, str):
        return text
    for secret in redactions:
        if secret:
            text = text.replace(secret, "[REDACTED]")
    return text


def norm_tokens(text: str) -> frozenset:
    return frozenset(re.findall(r"[a-z0-9]+", text.lower()))


def jaccard(a: frozenset, b: frozenset) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def route_of(url: str) -> str:
    try:
        return urlparse(url).path or "/"
    except Exception:
        return "/"


def assign_clusters(findings):
    """Greedy clustering: identical normalized text, or same route + jaccard >= 0.6."""
    n = len(findings)
    tokens = [norm_tokens(f["what"]) for f in findings]
    routes = [route_of(f["url"]) for f in findings]
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(n):
        for j in range(i + 1, n):
            if routes[i] != routes[j]:
                continue
            same_text = tokens[i] == tokens[j]
            if same_text or jaccard(tokens[i], tokens[j]) >= CLUSTER_JACCARD:
                ri, rj = find(i), find(j)
                if ri != rj:
                    parent[rj] = ri

    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)
    clusters = {}
    next_id = 1
    for members in groups.values():
        if len(members) < 2:
            continue
        cid = f"C{next_id}"
        next_id += 1
        for i in members:
            findings[i]["cluster"] = cid
            findings[i]["cluster_size"] = len(members)
        clusters[cid] = [findings[i]["id"] for i in members]
    return clusters


def detect_duplicate_evidence(run_dir: Path, findings, redactions):
    flagged = []
    by_hash = {}
    for f in findings:
        shot = run_dir / f["screenshot"]
        if not shot.is_file():
            continue
        digest = hashlib.sha256(shot.read_bytes()).hexdigest()
        by_hash.setdefault(digest, []).append(f)
    for members in by_hash.values():
        lenses = {m["lens"] for m in members}
        if len(members) > 1 and len(lenses) > 1:
            for m in members:
                m["evidence_flag"] = "duplicate-image"
            flagged.append({
                "hash": digest[:12],
                "lenses": sorted(lenses),
                "ids": [m["id"] for m in members],
            })
    return flagged


def aggregate_coverage(run_meta, lens_docs):
    """covered wins per route; else the most serious mark (blocked < skipped)."""
    expected = run_meta.get("coverage", {}).get("expected", [])
    marks = {}  # route -> {status, note, lens}
    for doc in lens_docs:
        lens = doc.get("lens") or "?"
        for entry in doc.get("coverage", []) or []:
            path = entry.get("path")
            status = entry.get("status")
            if not path or status not in ("covered", "blocked", "skipped"):
                continue
            cur = marks.get(path)
            rank = {"covered": 0, "blocked": 1, "skipped": 2}
            if cur is None or rank[status] < rank[cur["status"]]:
                if cur is None or status == "covered" or cur["status"] != "covered":
                    marks[path] = {"status": status, "note": entry.get("note", ""),
                                   "lens": lens}
    covered = sorted(p for p, m in marks.items() if m["status"] == "covered")
    blocked = [{"path": p, "note": marks[p]["note"], "lens": marks[p]["lens"]}
               for p in sorted(marks) if marks[p]["status"] == "blocked"]
    skipped = [{"path": p, "note": marks[p]["note"], "lens": marks[p]["lens"]}
               for p in sorted(marks) if marks[p]["status"] == "skipped"]
    covered_set = set(covered)
    uncovered_expected = sorted(p for p in expected if p not in covered_set)
    return {
        "expected": sorted(expected),
        "covered": covered,
        "blocked": blocked,
        "skipped": skipped,
        "uncovered_expected": uncovered_expected,
    }


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
    redactions = [str(s) for s in run_meta.get("redactions", [])]

    findings_dir = run_dir / "findings"
    lens_files = sorted(findings_dir.glob("*.json")) if findings_dir.is_dir() else []
    if not lens_files:
        print(f"nitpicky-merge: no finding files in {findings_dir} (read 0 findings)", file=sys.stderr)
        return 2

    findings = []
    errors = []
    warnings = []
    missing_proofs = []
    lens_docs = []
    files_read = 0
    for path in lens_files:
        try:
            doc = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            errors.append(f"{path.name}: invalid JSON ({exc})")
            continue
        if not isinstance(doc, dict) or not isinstance(doc.get("findings"), list):
            errors.append(f"{path.name}: missing 'findings' array")
            continue
        lens_docs.append(doc)
        lens = doc.get("lens") or path.stem
        files_read += 1
        for i, item in enumerate(doc["findings"]):
            label = f"{path.name}#{i}"
            missing_keys = [k for k in REQUIRED if not item.get(k)]
            if missing_keys:
                errors.append(f"{label}: missing required keys {missing_keys}")
                continue
            severity = item.get("severity") or "medium"
            if severity not in SEVERITIES:
                warnings.append(f"{label}: severity '{severity}' not in {SEVERITIES}, using medium")
                severity = "medium"
            screenshot = scrub(str(item["screenshot"]), redactions)
            proof_ok = (run_dir / screenshot).is_file()
            if not proof_ok:
                missing_proofs.append(screenshot)
            findings.append({
                "id": finding_id(lens, str(item["what"])),
                "lens": lens,
                "what": scrub(str(item["what"]), redactions),
                "expected": scrub(str(item["expected"]), redactions),
                "url": scrub(str(item["url"]), redactions),
                "severity": severity,
                "area": scrub(str(item.get("area", "")), redactions),
                "steps": scrub(str(item.get("steps", "")), redactions),
                "screenshot": screenshot,
                "proof_ok": proof_ok,
                "suspected_env_cause": bool(item.get("suspected_env_cause", False)),
            })

    # duplicate ids -> suffix so ids stay unique
    seen = {}
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

    clusters = assign_clusters(findings)
    dup_evidence = detect_duplicate_evidence(run_dir, findings, redactions)
    coverage = aggregate_coverage(run_meta, lens_docs)

    env_count = sum(1 for f in findings if f["suspected_env_cause"])
    doc = {
        "run_id": run_meta["run_id"],
        "app_url": run_meta["app_url"],
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "counts": {
            "total": len(findings),
            "by_lens": {l: sum(1 for f in findings if f["lens"] == l)
                        for l in sorted({f["lens"] for f in findings})},
        },
        "env_summary": {"suspected_env_findings": env_count},
        "clusters": clusters,
        "coverage": coverage,
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
    print(f"nitpicky-merge: run-health: suspected-env={env_count} "
          f"clusters={len(clusters)} duplicate-evidence-groups={len(dup_evidence)} "
          f"coverage: covered={len(coverage['covered'])} blocked={len(coverage['blocked'])} "
          f"skipped={len(coverage['skipped'])} uncovered-expected={len(coverage['uncovered_expected'])}")
    if env_count >= max(3, len(findings) // 10):
        print("nitpicky-merge: run-health WARNING: many findings look server-side; "
              "backend may be degraded — interpret triage accordingly")
    for w in warnings:
        print(f"nitpicky-merge: warning: {w}")
    if dup_evidence:
        for g in dup_evidence:
            print(f"nitpicky-merge: duplicate-evidence: lenses={g['lenses']} "
                  f"ids=[{', '.join(g['ids'])}] — byte-identical screenshot across lens "
                  f"prefixes; evidence likely contaminated (shared browser), re-shoot")
    if coverage["uncovered_expected"]:
        print(f"nitpicky-merge: uncovered-expected=[{', '.join(coverage['uncovered_expected'])}] "
              f"(routes in run.json coverage.expected never marked covered; "
              f"re-brief one agent for just these)")
    if missing_proofs:
        print(f"nitpicky-merge: missing-screenshots=[{', '.join(missing_proofs)}] "
              f"(findings kept and marked proof-broken in the review page; "
              f"re-shoot and re-merge to repair)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
