#!/usr/bin/env python3
"""Local annotation server for the cfn-wiki portal.

Serves the self-contained portal page from <wiki-dir>/portal/ and persists
every annotation patch atomically (tmp file + rename) to
<wiki-dir>/annotations.json.

Single process per wiki dir; binds 127.0.0.1 only; Python stdlib only.
POSTs require a matching localhost Origin header and a JSON Content-Type.
A malformed existing annotations.json fails startup without replacing it.

Routes:
  GET  /                  -> portal/index.html
  GET  /api/annotations   -> {"version", "updated_at", "annotations": {...}}
  POST /api/annotations   -> patch {id, note, clientTs?}; empty note deletes
  GET  /wiki/<fid>        -> generated feature page readme/wiki/<fid>/wiki.md
  GET  /pages/<name>.html -> paged-build page (wiki build --paged)
  GET  /data/<name>.json  -> paged-build view payload for shell hydration

Exit codes: 0 = served until interrupt, 2 = bad inputs/state, 3 = port busy.
"""
import argparse
import json
import os
import re
import sys
import threading
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BODY = 65536
MAX_NOTE = 20000
# annotation targets: feature:<fid> | entity:<entity name> | module:<module id>
ID_RE = re.compile(r"^(feature|entity|module):[^\x00-\x1f]{1,200}$")
FID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$")
# paged portal assets: single filename, no separators, no traversal
PAGE_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._%-]{0,120}\.html$")
DATA_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.json$")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class PortalState:
    """Annotations with serialized atomic persistence to annotations.json."""

    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.Lock()
        if self.path.exists():
            try:
                doc = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                print(f"wiki-portal-server: annotations.json is malformed "
                      f"({exc}); fix or remove it manually, refusing to start "
                      f"and overwrite", file=sys.stderr)
                raise SystemExit(2)
            if not isinstance(doc.get("annotations"), dict):
                print("wiki-portal-server: annotations.json has no "
                      "'annotations' object; refusing to start and overwrite",
                      file=sys.stderr)
                raise SystemExit(2)
            self.annotations = doc["annotations"]
        else:
            self.annotations = {}

    def snapshot(self) -> dict:
        with self.lock:
            return {
                "version": 1,
                "updated_at": now_iso(),
                "annotations": json.loads(json.dumps(self.annotations)),
            }

    def patch(self, body: dict) -> dict:
        target = body.get("id")
        if not isinstance(target, str) or not ID_RE.match(target):
            raise ValueError("id must be feature:|entity:|module: plus a name")
        unknown = set(body) - {"id", "note", "clientTs"}
        if unknown:
            raise ValueError(f"unknown fields: {sorted(unknown)}")
        note = body.get("note")
        if not isinstance(note, str):
            raise ValueError("note must be a string")
        if len(note) > MAX_NOTE:
            raise ValueError(f"note longer than {MAX_NOTE} chars")
        with self.lock:
            if note:
                self.annotations[target] = {
                    "note": note, "updatedAt": now_iso()}
            else:
                self.annotations.pop(target, None)
            self._persist()
            return dict(self.annotations.get(target) or {})

    def _persist(self) -> None:
        # caller holds the lock; atomic tmp+rename in the same directory
        tmp = self.path.with_name(
            f"annotations.json.tmp-{uuid.uuid4().hex}")
        tmp.write_text(json.dumps(
            {"version": 1, "updated_at": now_iso(),
             "annotations": self.annotations},
            indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(tmp, self.path)


class Handler(BaseHTTPRequestHandler):
    server_version = "cfn-wiki-portal/0.1"
    state: PortalState
    portal_dir: Path
    repo_dir: Path
    read_only: bool
    httpd: ThreadingHTTPServer

    def log_message(self, fmt, *args):  # quiet per-request noise
        pass

    # ---------- helpers ----------
    def _origin_ok(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return False
        port = self.httpd.server_address[1]
        return origin in (f"http://127.0.0.1:{port}",
                          f"http://localhost:{port}")

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy",
                         "default-src 'none'; img-src 'self' data:; "
                         "style-src 'self' 'unsafe-inline'; "
                         "script-src 'self' 'unsafe-inline'; connect-src 'self'")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, obj: dict) -> None:
        self._send(code, json.dumps(obj).encode("utf-8"), "application/json")

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise PayloadTooLarge()
        raw = self.rfile.read(length) if length else b""
        if len(raw) > MAX_BODY:
            raise PayloadTooLarge()
        body = json.loads(raw.decode("utf-8") or "{}")
        if not isinstance(body, dict):
            raise ValueError("body must be a JSON object")
        return body

    # ---------- routes ----------
    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/annotations":
            self._json(200, self.state.snapshot())
        elif path in ("/", "/index.html"):
            page = self.portal_dir / "index.html"
            if page.is_file():
                self._send(200, page.read_bytes(), "text/html; charset=utf-8")
            else:
                self._json(404, {"error": "portal not built; run: wiki build"})
        elif path.startswith("/wiki/"):
            self._serve_wiki_page(path[len("/wiki/"):])
        elif path.startswith("/pages/"):
            self._serve_portal_asset(path[len("/pages/"):],
                                     self.portal_dir / "pages",
                                     PAGE_NAME_RE, "text/html; charset=utf-8")
        elif path.startswith("/data/"):
            self._serve_portal_asset(path[len("/data/"):],
                                     self.portal_dir / "data",
                                     DATA_NAME_RE, "application/json")
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.read_only:
            self._json(403, {"error": "static mode: annotations are read-only"})
            return
        if not self._origin_ok():
            self._json(403, {"error": "origin not allowed"})
            return
        if self.headers.get("Content-Type", "").split(";")[0] != \
                "application/json":
            self._json(415, {"error": "Content-Type must be application/json"})
            return
        if self.path.split("?", 1)[0] != "/api/annotations":
            self._json(404, {"error": "not found"})
            return
        try:
            body = self._read_body()
        except PayloadTooLarge:
            self._json(413, {"error": f"body exceeds {MAX_BODY} bytes"})
            return
        except (ValueError, json.JSONDecodeError) as exc:
            self._json(400, {"error": f"invalid JSON body: {exc}"})
            return
        try:
            record = self.state.patch(body)
        except ValueError as exc:
            self._json(400, {"error": str(exc)})
            return
        self._json(200, {"ok": True, "id": body["id"], "record": record,
                         "clientTs": body.get("clientTs")})

    def _serve_wiki_page(self, fid: str) -> None:
        # fid is regex-validated, so the resolved path can never leave
        # <repo>/readme/wiki/
        if not FID_RE.match(fid):
            self._json(404, {"error": "not found"})
            return
        page = (self.repo_dir / "readme" / "wiki" / fid / "wiki.md").resolve()
        root = (self.repo_dir / "readme" / "wiki").resolve()
        if page.parent != root and page.parent.parent != root:
            self._json(404, {"error": "not found"})
            return
        if not page.is_file():
            self._json(404, {"error": "not found"})
            return
        self._send(200, page.read_bytes(), "text/markdown; charset=utf-8")

    def _serve_portal_asset(self, name: str, base: Path, name_re, ctype: str,
                            ) -> None:
        # regex-validated single filename: the resolved file always sits
        # directly inside base, never above it
        if not name_re.match(name):
            self._json(404, {"error": "not found"})
            return
        asset = (base / name).resolve()
        if asset.parent != base.resolve() or not asset.is_file():
            self._json(404, {"error": "not found"})
            return
        self._send(200, asset.read_bytes(), ctype)


class PayloadTooLarge(Exception):
    pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--wiki-dir", required=True,
                    help="<repo>/.wiki; holds annotations.json and portal/")
    ap.add_argument("--port", type=int, default=0, help="0 = pick a free port")
    ap.add_argument("--read-only", action="store_true",
                    help="serve without annotation persistence (static mode)")
    args = ap.parse_args()

    wiki_dir = Path(args.wiki_dir).resolve()
    portal_dir = wiki_dir / "portal"
    if not (portal_dir / "index.html").is_file():
        print(f"wiki-portal-server: no portal at {portal_dir}/index.html; "
              f"run: wiki build", file=sys.stderr)
        return 2

    state = PortalState(wiki_dir / "annotations.json")

    class BoundHandler(Handler):
        pass

    BoundHandler.state = state
    BoundHandler.portal_dir = portal_dir
    BoundHandler.repo_dir = wiki_dir.parent
    BoundHandler.read_only = bool(args.read_only)

    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", args.port), BoundHandler)
    except OSError as exc:
        print(f"wiki-portal-server: cannot bind port "
              f"{args.port or '(auto)'}: {exc}", file=sys.stderr)
        return 3
    port = httpd.server_address[1]
    url = f"http://127.0.0.1:{port}/"
    BoundHandler.httpd = httpd

    info = {"url": url, "port": port, "pid": os.getpid(),
            "started": now_iso(), "wiki_dir": str(wiki_dir),
            "read_only": bool(args.read_only)}
    (portal_dir / "server.json").write_text(
        json.dumps(info, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(info), flush=True)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
