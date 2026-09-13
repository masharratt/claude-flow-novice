#!/usr/bin/env python3
"""Local decision-portal server for a nitpicky run.

Serves review.html + screenshots from the run dir and persists every accepted
decision patch atomically (tmp file + rename) to <run-dir>/decisions.json.

Single process per run dir; binds 127.0.0.1 only; Python stdlib only.
POSTs require a matching localhost Origin header and a JSON Content-Type.
A malformed existing decisions.json fails startup without replacing it.

Exit codes: 0 = served until interrupt, 2 = bad inputs/state, 3 = port busy.
"""
import argparse
import importlib.util
import json
import os
import sys
import threading
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BODY = 65536
MAX_EXPLANATION = 20000
DECISION_VALUES = ("fix", "defer", "deny", "unreviewed")
STATIC_ROOT_FILES = {"review.html", "findings.json", "run.json", "CHECKLIST.md"}
IMAGE_MIME = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
    ".avif": "image/avif",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def load_export_module():
    path = Path(__file__).resolve().parent / "export-checklist.py"
    spec = importlib.util.spec_from_file_location("nitpicky_export", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class PortalState:
    """Findings + decisions with serialized atomic persistence."""

    def __init__(self, run_dir: Path):
        self.run_dir = run_dir
        self.lock = threading.Lock()
        self.path = run_dir / "decisions.json"

        meta = json.loads((run_dir / "run.json").read_text())
        findings_doc = json.loads((run_dir / "findings.json").read_text())
        self.run_id = meta["run_id"]
        self.app_url = meta["app_url"]
        self.redactions = [str(s) for s in meta.get("redactions", [])]
        self.known_ids = {f["id"] for f in findings_doc.get("findings", [])}

        if self.path.exists():
            try:
                doc = json.loads(self.path.read_text())
            except json.JSONDecodeError as exc:
                print(f"nitpicky-server: decisions.json is malformed ({exc}); "
                      f"fix or remove it manually — refusing to start and overwrite",
                      file=sys.stderr)
                raise SystemExit(2)
            if not isinstance(doc.get("decisions"), dict):
                print("nitpicky-server: decisions.json has no 'decisions' object; "
                      "refusing to start and overwrite", file=sys.stderr)
                raise SystemExit(2)
            self.decisions = doc["decisions"]
        else:
            self.decisions = {}

    def snapshot(self) -> dict:
        with self.lock:
            return {"run_id": self.run_id, "app_url": self.app_url,
                    "decisions": json.loads(json.dumps(self.decisions))}

    def patch(self, body: dict) -> dict:
        fid = body.get("id")
        if not isinstance(fid, str) or fid not in self.known_ids:
            raise ValueError("unknown finding id")
        unknown = set(body) - {"id", "decision", "explanation", "clientTs"}
        if unknown:
            raise ValueError(f"unknown fields: {sorted(unknown)}")
        record = dict(self.decisions.get(fid) or {})
        if "decision" in body:
            d = body["decision"]
            if d is not None and d not in DECISION_VALUES:
                raise ValueError(f"decision must be one of {DECISION_VALUES} or null")
            if d is None or d == "unreviewed":
                record.pop("decision", None)  # clear keeps explanation
            else:
                record["decision"] = d
        if "explanation" in body:
            expl = body["explanation"]
            if not isinstance(expl, str):
                raise ValueError("explanation must be a string")
            if len(expl) > MAX_EXPLANATION:
                raise ValueError(f"explanation longer than {MAX_EXPLANATION} chars")
            record["explanation"] = expl
        record["updatedAt"] = now_iso()
        if not record.get("decision") and not record.get("explanation"):
            self.decisions.pop(fid, None)
        else:
            self.decisions[fid] = record
        self._persist()
        return dict(record)

    def _persist(self) -> None:
        # caller holds the lock; atomic tmp+rename in the same directory
        tmp = self.path.with_name(f"decisions.json.tmp-{uuid.uuid4().hex}")
        tmp.write_text(json.dumps(
            {"version": 1, "updated_at": now_iso(), "decisions": self.decisions},
            indent=2, ensure_ascii=False) + "\n")
        os.replace(tmp, self.path)


class Handler(BaseHTTPRequestHandler):
    server_version = "nitpicky/1.1"
    state: PortalState
    export_mod: object
    httpd: ThreadingHTTPServer

    def log_message(self, fmt, *args):  # quiet per-request noise
        pass

    # ---------- helpers ----------
    def _origin_ok(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return False
        port = self.httpd.server_address[1]
        return origin in (f"http://127.0.0.1:{port}", f"http://localhost:{port}")

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

    def _serve_screenshot(self, name: str) -> None:
        # resolve strictly inside <run-dir>/screenshots/; ../ never escapes it
        shots = (self.state.run_dir.resolve() / "screenshots").resolve()
        candidate = (shots / name).resolve()
        if (candidate.parent != shots
                or candidate.suffix.lower() not in IMAGE_MIME
                or not candidate.is_file()):
            self._json(404, {"error": "not found"})
            return
        self._send(200, candidate.read_bytes(), IMAGE_MIME[candidate.suffix.lower()])

    def _static(self, rel: str) -> None:
        root = self.state.run_dir.resolve()
        candidate = (root / rel).resolve()
        if not str(candidate).startswith(str(root) + os.sep):
            self._json(404, {"error": "not found"})
            return
        if candidate.name in STATIC_ROOT_FILES and candidate.parent == root:
            ctype = "text/html" if candidate.suffix == ".html" else "application/json"
            if candidate.suffix == ".md":
                ctype = "text/markdown"
            self._send(200, candidate.read_bytes(), ctype + "; charset=utf-8")
            return
        self._json(404, {"error": "not found"})

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
        if path == "/api/decisions":
            self._json(200, self.state.snapshot())
        elif path in ("/", "/review.html"):
            self._static("review.html")
        elif path == "/findings.json":
            self._static("findings.json")
        elif path.startswith("/screenshots/"):
            self._serve_screenshot(path[len("/screenshots/"):])
        else:
            self._json(404, {"error": "not found"})

    def do_POST(self):
        if not self._origin_ok():
            self._json(403, {"error": "origin not allowed"})
            return
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            self._json(415, {"error": "Content-Type must be application/json"})
            return
        try:
            body = self._read_body()
        except PayloadTooLarge:
            self._json(413, {"error": f"body exceeds {MAX_BODY} bytes"})
            return
        except (ValueError, json.JSONDecodeError) as exc:
            self._json(400, {"error": f"invalid JSON body: {exc}"})
            return

        if self.path.split("?", 1)[0] == "/api/decision":
            try:
                record = self.state.patch(body)
            except ValueError as exc:
                self._json(400, {"error": str(exc)})
                return
            self._json(200, {"ok": True, "id": body["id"],
                             "record": record, "clientTs": body.get("clientTs")})
        elif self.path.split("?", 1)[0] == "/api/export":
            snap = self.state.snapshot()
            text, counts, undecided = self.export_mod.build_markdown_from_state(
                _findings_by_id(self.state), snap["decisions"],
                run_id=self.state.run_id, app_url=self.state.app_url,
                redactions=self.state.redactions)
            out = self.state.run_dir / "CHECKLIST.md"
            out.write_text(text)
            self._json(200, {"ok": True, "path": str(out),
                             "counts": counts, "undecided": undecided})
        else:
            self._json(404, {"error": "not found"})


class PayloadTooLarge(Exception):
    pass


def _findings_by_id(state: PortalState) -> dict:
    return {f["id"]: f for f in json.loads(
        (state.run_dir / "findings.json").read_text()).get("findings", [])}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-dir", required=True)
    ap.add_argument("--port", type=int, default=0, help="0 = pick a free port")
    args = ap.parse_args()
    run_dir = Path(args.run_dir).resolve()
    if not (run_dir / "findings.json").is_file():
        print(f"nitpicky-server: no findings.json in {run_dir}; "
              f"run merge-findings.py first", file=sys.stderr)
        return 2

    state = PortalState(run_dir)
    export_mod = load_export_module()

    server_info = {}

    class BoundHandler(Handler):
        pass

    BoundHandler.state = state
    BoundHandler.export_mod = export_mod

    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", args.port), BoundHandler)
    except OSError as exc:
        print(f"nitpicky-server: cannot bind port {args.port or '(auto)'}: {exc}",
              file=sys.stderr)
        return 3
    port = httpd.server_address[1]
    url = f"http://127.0.0.1:{port}/review.html"
    BoundHandler.httpd = httpd

    info = {"url": url, "port": port, "pid": os.getpid(),
            "started": now_iso(), "run_dir": str(run_dir)}
    (run_dir / "server.json").write_text(json.dumps(info, indent=2) + "\n")
    print(json.dumps(info), flush=True)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
