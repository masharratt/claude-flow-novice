#!/usr/bin/env python3
"""cfn-fleet dashboard server: static run dir plus the open-terminal API.

    python3 dashboard-server.py PORT RUN_DIR SOCKET

Started by _fleet_dash_serve_start (lib/cmd-dashboard.sh), which records the
pid; _fleet_dash_serve_is_serving matches the pid's command line on this
file's name, so keep it. Binds 127.0.0.1 only.

Static: serves RUN_DIR like http.server. Quiet logging: every page poll GETs
roster.tsv plus files/<ws>.txt per lane, and stock http.server logs one line
per request (50 MB in 14 h on a 70-row roster), so only 5xx responses and
startup errors reach the log.

API:
  GET  /api/health         {"ok": true, "open": true|false}
  POST /api/open-terminal  {"ws": "<ws_id>"}: open a terminal window attached
                           to that worker's tmux session.

Open-terminal security model. The request names ONLY a ws id. The session
name and host come from roster.tsv (read by header name, like the bash
renderer), the socket from argv (set at start by _fleet_tmux_socket); none is
ever taken from the request. Every value is matched against a strict pattern
before use, and every launcher gets an argv list, never a shell string. Gate:
Host must be this loopback port, Origin must be http://127.0.0.1:<port> or
http://localhost:<port>, Sec-Fetch-Site must not be cross-site, Content-Type
must be application/json. The gate stops a web page in another tab from
driving the endpoint (no CSRF, no DNS rebinding).

Launchers, first match wins:
  FLEET_DASHBOARD_OPEN_CMD set: run that program with the attach argv (test
      seam). When set but not executable, open is unavailable: the real
      launchers are never used as a fallback.
  macOS: osascript, Terminal "do script" with the shell-quoted command passed
      as a script argument (never spliced into AppleScript source).
  WSL2 (WSL_DISTRO_NAME set and wt.exe found): wt.exe new-tab wsl.exe -d
      <distro> <attach argv>.
  Otherwise: 501 carrying the attach command for the user to run.

Pattern twins: SESSION_RE, SOCKET_RE and HOST_RE are pinned twins of
_fleet_dash_attach_cmd (bash) and the ATTACH_* regexes in the page JS; keep
all three in sync.
"""

import functools
import glob
import http.server
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import threading

SESSION_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
SOCKET_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$")
HOST_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._@-]{0,252}$")
WS_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
DISTRO_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
MAX_BODY = 4096
LAUNCH_WAIT_S = 10
WT_GLOB = "/mnt/c/Users/*/AppData/Local/Microsoft/WindowsApps/wt.exe"
FAIL_TEXT = "Could not open a terminal, use the command shown"

# cfn: one launch at a time, no per-client rate limit; add one if the server
# ever listens beyond loopback.
_LAUNCH_LOCK = threading.Lock()


def attach_argv(sock, name, host):
    """tmux attach argv for one worker, wrapped in ssh -t for a remote host."""
    argv = ["tmux", "-L", sock, "attach", "-t", name]
    if host:
        return ["ssh", "-t", host] + argv
    return argv


def find_wt():
    for cand in sorted(glob.glob(WT_GLOB)):
        if os.path.isfile(cand):
            return cand
    return shutil.which("wt.exe")


def launcher_for(attach):
    """(argv, None) for the available launcher, or (None, reason)."""
    seam = os.environ.get("FLEET_DASHBOARD_OPEN_CMD", "")
    if seam:
        if os.path.isfile(seam) and os.access(seam, os.X_OK):
            return [seam] + attach, None
        return None, "FLEET_DASHBOARD_OPEN_CMD is not an executable file"
    if sys.platform == "darwin":
        osa = shutil.which("osascript")
        if osa:
            cmd = " ".join(shlex.quote(a) for a in attach)
            return [osa,
                    "-e", "on run argv",
                    "-e", 'tell application "Terminal"',
                    "-e", "do script (item 1 of argv)",
                    "-e", "activate",
                    "-e", "end tell",
                    "-e", "end run",
                    cmd], None
        return None, "osascript not found"
    distro = os.environ.get("WSL_DISTRO_NAME", "")
    if distro:
        if not DISTRO_RE.match(distro):
            return None, "WSL_DISTRO_NAME has unexpected characters"
        wt = find_wt()
        if wt:
            return [wt, "new-tab", "wsl.exe", "-d", distro] + attach, None
        return None, "wt.exe not found"
    return None, "no supported terminal launcher on this machine"


def open_available():
    argv, _ = launcher_for(["tmux"])
    return argv is not None


def roster_row(run_dir, ws):
    """The roster row for ws as a {header: cell} dict, or None."""
    path = os.path.join(run_dir, "roster.tsv")
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = [ln.rstrip("\r\n") for ln in fh]
    if not lines:
        return None
    head = lines[0].split("\t")
    for line in lines[1:]:
        if not line:
            continue
        cells = line.split("\t")
        row = {h: (cells[i] if i < len(cells) else "") for i, h in enumerate(head)}
        if row.get("ws_id", "") == ws:
            return row
    return None


class Handler(http.server.SimpleHTTPRequestHandler):
    run_dir = ""
    socket_name = ""
    port = 0

    # --- quiet logging (5xx only) ---------------------------------------
    def log_message(self, fmt, *args):
        pass

    def log_request(self, code="-", size="-"):
        try:
            failed = int(code) >= 500
        except (TypeError, ValueError):
            failed = False
        if failed:
            http.server.SimpleHTTPRequestHandler.log_message(
                self, "\"%s\" %s %s", self.requestline, str(code), str(size))

    # Static responses: nosniff only. No frame-ancestors or X-Frame-Options:
    # the VS Code Simple Browser shows the page inside a frame.
    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        http.server.SimpleHTTPRequestHandler.end_headers(self)

    def send_json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def api_path(self):
        return self.path.split("?", 1)[0]

    # --- routing --------------------------------------------------------
    def do_GET(self):
        p = self.api_path()
        if p == "/api/health":
            return self.send_json(200, {"ok": True, "open": open_available()})
        if p.startswith("/api/"):
            return self.send_json(404, {"ok": False, "error": "not found"})
        return http.server.SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        p = self.api_path()
        if p != "/api/open-terminal":
            return self.send_json(404, {"ok": False, "error": "not found"})
        return self.open_terminal()

    def do_PUT(self):
        return self.send_json(405, {"ok": False, "error": "method not allowed"})

    do_DELETE = do_PUT
    do_PATCH = do_PUT

    # --- open-terminal --------------------------------------------------
    def gate(self):
        """None when the request passes the same-origin gate, else (code, error)."""
        allowed_hosts = ("127.0.0.1:%d" % self.port, "localhost:%d" % self.port)
        allowed_origins = tuple("http://" + h for h in allowed_hosts)
        if self.headers.get("Host", "") not in allowed_hosts:
            return 403, "unexpected Host header"
        if self.headers.get("Origin", "") not in allowed_origins:
            return 403, "same-origin requests only"
        if self.headers.get("Sec-Fetch-Site", "").lower() == "cross-site":
            return 403, "same-origin requests only"
        ctype = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if ctype != "application/json":
            return 415, "Content-Type must be application/json"
        return None

    def read_ws(self):
        """(ws, None) from the JSON body, or (None, (code, error))."""
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None, (400, "bad Content-Length")
        if length <= 0 or length > MAX_BODY:
            return None, (400, "body missing or too large")
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None, (400, "body is not JSON")
        ws = data.get("ws") if isinstance(data, dict) else None
        if not isinstance(ws, str) or not WS_RE.match(ws):
            return None, (400, "ws must be a workstream id")
        return ws, None

    def open_terminal(self):
        bad = self.gate()
        if bad:
            return self.send_json(bad[0], {"ok": False, "error": bad[1]})
        ws, bad = self.read_ws()
        if bad:
            return self.send_json(bad[0], {"ok": False, "error": bad[1]})
        try:
            row = roster_row(self.run_dir, ws)
        except OSError:
            return self.send_json(500, {"ok": False, "error": "cannot read roster.tsv"})
        if row is None:
            return self.send_json(404, {"ok": False, "error": "unknown workstream"})
        status = row.get("status", "")
        name = row.get("name", "")
        host = row.get("host", "")
        if status == "pending":
            return self.send_json(409, {"ok": False, "error": "workstream has not started, no session yet"})
        if not SESSION_RE.match(name):
            return self.send_json(409, {"ok": False, "error": "roster name is not a valid tmux session"})
        if host and not HOST_RE.match(host):
            return self.send_json(409, {"ok": False, "error": "roster host is not a valid ssh alias"})
        if not SOCKET_RE.match(self.socket_name):
            return self.send_json(500, {"ok": False, "error": "server socket name is invalid"})
        attach = attach_argv(self.socket_name, name, host)
        command = " ".join(shlex.quote(a) for a in attach)
        argv, reason = launcher_for(attach)
        if argv is None:
            return self.send_json(501, {"ok": False, "error": reason, "command": command})
        with _LAUNCH_LOCK:
            try:
                proc = subprocess.Popen(argv, stdin=subprocess.DEVNULL,
                                        stdout=subprocess.DEVNULL,
                                        stderr=subprocess.DEVNULL,
                                        start_new_session=True)
            except OSError:
                return self.send_json(500, {"ok": False, "error": FAIL_TEXT, "command": command})
            try:
                rc = proc.wait(timeout=LAUNCH_WAIT_S)
            except subprocess.TimeoutExpired:
                rc = 0  # still running: the window is the user's now
        if rc != 0:
            return self.send_json(500, {"ok": False, "error": FAIL_TEXT, "command": command})
        return self.send_json(200, {"ok": True, "command": command})


def main(argv):
    if len(argv) != 4:
        sys.stderr.write("usage: dashboard-server.py PORT RUN_DIR SOCKET\n")
        return 64
    port = int(argv[1])
    run_dir = os.path.abspath(argv[2])
    Handler.run_dir = run_dir
    Handler.socket_name = argv[3]
    Handler.port = port
    handler = functools.partial(Handler, directory=run_dir)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
