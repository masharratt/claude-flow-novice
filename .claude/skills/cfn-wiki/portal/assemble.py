#!/usr/bin/env python3
"""Payload assembly for the cfn-wiki portal, shared by both build modes.

build-portal.sh runs the five view modules and the mermaid pre-render, then
calls this script once per build:

  assemble.py single <work> <store> <repo> <template> <lib_dir> <out.html>
      Small-wiki default, unchanged: the whole payload (five views plus
      coverage and meta) is inlined into one self-contained page.

  assemble.py paged <work> <store> <repo> <template> <lib_dir> <out-root>
      Large-portal mode: a small shell plus one self-contained page per view
      and per feature, and the raw view payloads under data/.

Contract kept from the original single-file builder:
  payload = {arch, catalog, state, change, data, coverage, meta}
  meta    = {repo, generated_at, stale, degraded, fingerprint}
  stale    store meta.fingerprint differs from the wiki-fp marker in
            <repo>/readme/feature-status.md (missing file or marker = stale,
            same rule as wiki sync --check)
  degraded "" when the store is snapshot-backed, else a human reason
  state.entities[i].svg: sanitized inline SVG when mmdc rendered the
            entity's mermaid diagram; absent -> the template renders the
            transitions table fallback.

Paged layout under <out-root>:
  index.html                    shell: header, tabs, coverage summary. Its
                                payload holds ONLY {meta, coverage}; view
                                payloads and source excerpts never land here.
  pages/arch.html               each view page embeds just its own payload
                                (arch also carries a trimmed catalog so the
                                module index can link feature pages)
  pages/catalog.html            full catalog payload
  pages/data.html               data + state (including mermaid SVGs)
  pages/change.html             change story payload
  pages/coverage.html           the three-measure coverage view
  pages/capability-<fid>.html   one per catalog feature, excerpts included
  data/<view>.json              raw payloads (arch, catalog, state, change,
                                data, coverage, meta) for served-mode
                                hydration and tooling

Stdlib only. No em dashes (repo rule).
"""
import hashlib
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone

PLACEHOLDER = "__WIKI_PAYLOAD__"
# matches server.py FID_RE so page files stay servable through the portal
PAGE_SAFE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._%-]{0,120}")
SAFE_CHAR = re.compile(r"[A-Za-z0-9._-]")
MERMAID_SVG_SAFE_HREF = re.compile(r"(?:xlink:)?href\s*=\s*[\"']\s*(?:https?:)?//",
                                   re.I)
EXTERNAL_REF = re.compile(
    r'<link|src="http|href="http|@import|url\(\s*["\']?https?:')


def load_json(path):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def load_views(work):
    names = ("arch", "catalog", "state", "change", "data")
    return {name: load_json(os.path.join(work, "view-%s.json" % name))
            for name in names}


def compute_stale(store, repo):
    """Same rule as wiki sync --check: marker vs fresh fingerprint, then
    watched knowledge input hashes."""
    stale = True
    marker = ""
    fs_path = os.path.join(repo, "readme", "feature-status.md")
    if os.path.isfile(fs_path):
        try:
            with open(fs_path, encoding="utf-8") as fh:
                for line in fh:
                    m = re.search(r"wiki-fp:\s*([0-9a-f]{64})", line)
                    if m:
                        marker = m.group(1)
                        break
        except OSError:
            pass
    fp = store.get("meta", {}).get("fingerprint", "")
    if marker and fp and marker == fp:
        stale = False
        watched = dict(store.get("knowledge_inputs", {}))
        for feature in store.get("features", []):
            watched.update(feature.get("content_hashes", {}))
        for path, expected in watched.items():
            try:
                with open(os.path.join(repo, path), "rb") as source:
                    actual = hashlib.sha256(source.read()).hexdigest()
            except OSError:
                actual = "missing"
            if actual != expected:
                stale = True
                break
    return stale


def compute_degraded(store, repo, source_signature):
    meta = store.get("meta", {})
    degraded = ""
    if meta.get("cbm_mode") != "snapshot":
        degraded = ("CBM snapshot unavailable: git-only extraction"
                    " (dependency edges and symbol counts are unavailable;"
                    " run: wiki doctor --install)")
    if meta.get("cbm_mode") == "snapshot":
        provenance = os.path.join(repo, ".wiki/cache/cbm-source.sha256")
        try:
            with open(provenance) as fh:
                index_current = fh.read().strip() == source_signature(repo)
        except OSError:
            index_current = False
        if not index_current:
            degraded = ("Dependency index freshness is unverified or sources "
                        "changed. Run wiki sync with CBM available.")
    return degraded


def compute_meta(store, repo, source_signature):
    return {
        "repo": os.path.basename(os.path.normpath(repo)),
        "generated_at": datetime.now(timezone.utc)
            .strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stale": compute_stale(store, repo),
        "degraded": compute_degraded(store, repo, source_signature),
        "fingerprint": store.get("meta", {}).get("fingerprint", ""),
    }


def sanitize_svg(text):
    """Fail closed: anything suspicious means no svg, table fallback stands."""
    m = re.search(r"<svg[\s\S]*</svg>", text)
    if not m:
        return None
    svg = m.group(0)
    if re.search(r"<script\b", svg, re.I):
        return None
    if re.search(r"@import\b", svg, re.I):
        return None
    if MERMAID_SVG_SAFE_HREF.search(svg):
        return None
    if re.search(r"url\(\s*[\"']?\s*(?:https?:)?//", svg, re.I):
        return None
    if re.search(r"data:text/html", svg, re.I):
        return None
    return svg


def attach_svgs(state, work):
    """Attach sanitized mmdc SVGs to state.entities (mutates state)."""
    plan_path = os.path.join(work, "mmd", "plan.json")
    if not os.path.isfile(plan_path):
        return
    with open(plan_path, encoding="utf-8") as fh:
        plan = json.load(fh)
    for item in plan:
        svg_path = os.path.join(work, "svg", "%d.svg" % item["index"])
        if not os.path.isfile(svg_path):
            continue  # mmdc failed or missing; table fallback stands
        try:
            with open(svg_path, encoding="utf-8") as fh:
                svg = sanitize_svg(fh.read())
        except OSError:
            svg = None
        if svg:
            state["entities"][item["index"]]["svg"] = svg


def coverage_for(repo):
    """work.coverage_report, or an error-marked coverage dict. Coverage must
    never fail the build; the panel reports the failure honestly instead."""
    try:
        import work
        return work.coverage_report(repo)
    except Exception as exc:  # noqa: BLE001 - reported in the panel
        return {"error": "coverage unavailable: %s" % exc}


def inline(template_html, payload):
    if PLACEHOLDER not in template_html:
        raise SystemExit("assemble: template has no %s slot" % PLACEHOLDER)
    # `</` inside JSON strings becomes the valid escape `<\/`, so a literal
    # "</script>" in a description can never close the payload tag early
    blob = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    return template_html.replace(PLACEHOLDER, blob)


def write_atomic(path, text):
    tmp = path + ".tmp-" + uuid.uuid4().hex
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text)
    os.replace(tmp, path)


def check_page(html, label):
    """Hard-fail checks for every emitted page (mirrors the bash selfcheck)."""
    if PLACEHOLDER in html:
        raise SystemExit("assemble: %s still holds the placeholder" % label)
    m = re.search(
        r"<script type=\"application/json\" id=\"wiki-payload\">(.*?)</script>",
        html, re.S)
    if not m:
        raise SystemExit("assemble: %s has no payload script tag" % label)
    json.loads(m.group(1))  # raises on truncation or bad escaping
    hit = EXTERNAL_REF.search(html)
    if hit:
        raise SystemExit(
            "assemble: external ref in %s near %r (self-contained contract)"
            % (label, hit.group(0)))


def page_name(fid):
    """Filesystem-safe page name; mirrored by pageName() in template.html."""
    if PAGE_SAFE.fullmatch(fid):
        return fid
    out = []
    for ch in fid:
        if SAFE_CHAR.fullmatch(ch):
            out.append(ch)
        else:
            out.append("".join("%%%02X" % b for b in ch.encode("utf-8")))
    return "".join(out)


def trim_catalog(catalog):
    """Arch page catalog: overview plus fid/name/kind only, so module links
    and counts stay correct without embedding the whole feature payload."""
    return {
        "overview": catalog.get("overview", {}),
        "features": [{"fid": f.get("fid"), "name": f.get("name"),
                      "kind": f.get("kind")}
                     for f in catalog.get("features", [])],
    }


def excerpt_markers(catalog):
    """Strings that must never appear in the shell (evidence packet text)."""
    markers = []
    for f in catalog.get("features", []):
        for src in f.get("sources", []):
            text = (src.get("excerpt") or "").strip()
            if len(text) >= 24:
                markers.append(text[:60])
        for step in f.get("flow", []):
            text = (step.get("excerpt") or "").strip()
            if len(text) >= 24:
                markers.append(text[:60])
    return markers


def emit_single(work, store_path, repo, template_html, source_signature,
                out_path):
    views = load_views(work)
    attach_svgs(views["state"], work)
    store = load_json(store_path)
    meta = compute_meta(store, repo, source_signature)
    payload = {
        "arch": views["arch"],
        "catalog": views["catalog"],
        "state": views["state"],
        "change": views["change"],
        "data": views["data"],
        "coverage": coverage_for(repo),
        "meta": meta,
    }
    html = inline(template_html, payload)
    check_page(html, "single index.html")
    write_atomic(out_path, html)
    return out_path


def emit_paged(work, store_path, repo, template_html, source_signature,
                out_root):
    views = load_views(work)
    attach_svgs(views["state"], work)
    store = load_json(store_path)
    meta = compute_meta(store, repo, source_signature)
    coverage = coverage_for(repo)
    catalog = views["catalog"]

    pages_root = os.path.join(out_root, "pages")
    data_root = os.path.join(out_root, "data")
    os.makedirs(pages_root, exist_ok=True)
    os.makedirs(data_root, exist_ok=True)

    def page(extra, page_id):
        m = dict(meta)
        m["mode"] = "paged"
        if page_id:
            m["page"] = page_id
        payload = dict(extra)
        payload["meta"] = m
        return inline(template_html, payload)

    pages = {
        "arch.html": page({"arch": views["arch"],
                           "catalog": trim_catalog(catalog)}, "arch"),
        "catalog.html": page({"catalog": catalog}, "catalog"),
        "data.html": page({"data": views["data"],
                           "state": views["state"]}, "data"),
        "change.html": page({"change": views["change"]}, "change"),
        "coverage.html": page({"coverage": coverage}, "coverage"),
    }
    for f in catalog.get("features", []):
        fid = f.get("fid") or ""
        name = "capability-%s.html" % page_name(fid)
        pages[name] = page({"catalog": {"features": [f]}},
                           "capability:" + fid)

    shell_meta = dict(meta)
    shell_meta["mode"] = "shell"
    shell_html = inline(template_html,
                        {"coverage": coverage, "meta": shell_meta})

    # shell contract: only meta + coverage, never view payloads or excerpts
    shell_payload = {"coverage": coverage, "meta": shell_meta}
    if set(shell_payload) != {"meta", "coverage"}:
        raise SystemExit("assemble: shell payload gained view data")
    for marker in excerpt_markers(catalog):
        if marker and marker in shell_html:
            raise SystemExit(
                "assemble: evidence text leaked into the shell: %r" % marker)

    for name, html in pages.items():
        check_page(html, "pages/%s" % name)
        write_atomic(os.path.join(pages_root, name), html)
    check_page(shell_html, "shell index.html")
    write_atomic(os.path.join(out_root, "index.html"), shell_html)

    data_files = {
        "arch.json": views["arch"],
        "catalog.json": catalog,
        "state.json": views["state"],
        "change.json": views["change"],
        "data.json": views["data"],
        "coverage.json": coverage,
        "meta.json": meta,
    }
    for name, doc in data_files.items():
        write_atomic(os.path.join(data_root, name),
                     json.dumps(doc, ensure_ascii=False) + "\n")
    return out_root


def main(argv):
    if len(argv) != 8:
        print("usage: assemble.py single|paged <work> <store> <repo> "
              "<template> <lib_dir> <out>", file=sys.stderr)
        return 64
    mode, work, store_path, repo, template_path, lib_dir, out = argv[1:8]
    sys.path.insert(0, lib_dir)
    from knowledge import source_signature  # noqa: F401 (shared freshness)

    with open(template_path, encoding="utf-8") as fh:
        template_html = fh.read()

    if mode == "single":
        print(emit_single(work, store_path, repo, template_html,
                          source_signature, out))
    elif mode == "paged":
        print(emit_paged(work, store_path, repo, template_html,
                         source_signature, out))
    else:
        print("assemble: unknown mode %r" % mode, file=sys.stderr)
        return 64
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
