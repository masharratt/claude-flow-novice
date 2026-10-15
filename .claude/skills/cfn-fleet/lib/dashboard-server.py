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
  GET  /api/health         {"ok": true, "open": true|false, "pane": true|false,
                            "sessions": true}
  POST /api/open-terminal  {"ws": "<ws_id>"}: open a terminal window attached
                           to that worker's tmux session.
  GET  /api/pane?ws=<ws_id>&lines=<N>
                           {"ok": true, "text": "...", "ts": <epoch>}: the last
                           N lines (clamped 5..200, default 40) of the worker's
                           pane, read by running `fleet peek` (argv, never a
                           shell string).

  GET  /api/sessions       {"ok": true, "project": "<name>", "ts": <epoch>,
                            "sessions": [...]}: every live Claude Code session
                           on this machine (see Sessions below).

Host rows. The session of a host row lives on the server, on the socket and
session recorded in RUN_DIR/remote/<WS>.env by `fleet spawn --host`; the run
socket and roster name are local values and are never used for a host row.
A host row without that file has no attachable session (409).

Live pane. The ws id is the only request input. The pane is read by the
fleet CLI (FLEET_DASHBOARD_PEEK_CMD, else this skill's cli/fleet) run as
[cmd, "peek", ws, N] with FLEET_RUN_DIR set and an 8s timeout, so local and
host rows resolve exactly as `fleet peek` does. Peek exit codes map to HTTP:
65 (no session) 409, 66 (host unreachable) 503, timeout 504, other 500.
Output is stripped of ANSI/OSC sequences and control characters except
newline and tab before it leaves the server. Load guard: each ws's result
(success or error) is cached PANE_TTL_LOCAL_S (PANE_TTL_HOST_S for host rows)
and at most one peek per ws is in flight; concurrent requests wait for it and
share the result. Gate: Host must be this loopback port, Origin (when sent)
must be this origin, Sec-Fetch-Site must not be cross-site.

Sessions. Source: FLEET_DASHBOARD_SESSIONS_DIR, else ~/.claude/sessions.
Only regular, non-symlink files named <pid>.json are opened; the
<pid>.<hash>.key files beside them are never opened, listed into output or
served. Each session object carries only the SESSION_FIELDS whitelist (never
sessionId, messagingSocketPath or any other field of the file). A file whose
pid is not alive is skipped (os.kill(pid, 0); EPERM counts alive;
FLEET_DASHBOARD_PID_ALIVE="pid,pid" replaces the check, test seam). Project
root: the cwd with /.claude/worktrees/<x> stripped, else the nearest
ancestor holding .git or planning/. A session is a lane when its cwd is a
roster row's worktree (<root>/.claude/worktrees/<ws lowercased>) or its tmux
session name equals a roster row's name, searched over this run first, then
every non-archived <root>/planning/fleet-*/roster.tsv, newest first. A run
dir holding a .archived marker (`fleet archive`) is never read. Rows from
other projects are flagged "other"; no update for STALE_SESSION_S flags
"stale"; both are display-only. The attach command is built from
pattern-checked values only: a lane uses its run's socket and roster name;
any other session with a tmux name gets one only when `tmux has-session`
finds that name on this run's socket. Whole result cached SESSIONS_TTL_S.
Same read-only gate as /api/pane.

Open-terminal security model. The request names ONLY a ws id. The session
name and host come from roster.tsv (read by header name, like the bash
renderer), the socket from argv (set at start by _fleet_tmux_socket); none is
ever taken from the request. Every value is matched against a strict pattern
before use, and every launcher gets an argv list, never a shell string. Gate:
Host must be this loopback port, Origin must be http://127.0.0.1:<port> or
http://localhost:<port>, Sec-Fetch-Site must not be cross-site, Content-Type
must be application/json. The gate stops a web page in another tab from
driving the endpoint (no CSRF, no DNS rebinding).

Launchers (open-terminal), first match wins:
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
import stat
import subprocess
import sys
import threading
import time
import urllib.parse

SESSION_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
SOCKET_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$")
HOST_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._@-]{0,252}$")
WS_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
DISTRO_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
MAX_BODY = 4096
LAUNCH_WAIT_S = 10
WT_GLOB = "/mnt/c/Users/*/AppData/Local/Microsoft/WindowsApps/wt.exe"
FAIL_TEXT = "Could not open a terminal, use the command shown"
PANE_LINES_DEFAULT = 40
PANE_LINES_MIN = 5
PANE_LINES_MAX = 200
PANE_TIMEOUT_S = 8
PANE_TTL_LOCAL_S = 2.0
PANE_TTL_HOST_S = 5.0
PANE_MAX_BYTES = 256 * 1024
PANE_ERR_MAX = 200
SESSIONS_TTL_S = 3.0
STALE_SESSION_S = 24 * 3600
SESSION_FILE_RE = re.compile(r"^([0-9]{1,10})\.json$")
SESSION_MAX_BYTES = 64 * 1024
SESSION_NAME_MAX = 80
SESSION_BRIEF_MAX = 160
TMUX_PROBE_TTL_S = 30.0
TMUX_PROBE_TIMEOUT_S = 2
ARCHIVE_MARKER = ".archived"
# Closed list of keys a session object may carry; nothing else from the
# session file ever reaches the page.
SESSION_FIELDS = ("pid", "name", "project", "other", "role", "ws", "brief", "run",
                  "state", "updated", "stale", "tmux", "attach")
SESSION_STATE = {"busy": "working", "idle": "idle", "waiting": "idle",
                 "shell": "running a shell command"}
LANE_FINAL_STATES = ("done", "dead", "blocked")
REVIEW_RE = re.compile(r"(?<![\w-])review(?:ing|ed)?(?![\w-])", re.I)
GATE_RE = re.compile(r"(?<![\w-])gate(?![\w-])", re.I)
WORKTREE_RE = re.compile(r"^(.*?)/\.claude/worktrees/[^/]+(?:/.*)?$")
FLEET_CLI = os.path.join(os.path.dirname(os.path.dirname(os.path.realpath(__file__))),
                         "cli", "fleet")
# ESC-introduced sequences: CSI, OSC (BEL or ST terminated), DCS/SOS/PM/APC
# strings, then any other escape (intermediates plus a final byte, which
# covers charset selects like ESC ( B), then a lone ESC. Remaining C0/C1
# controls except newline and tab are dropped after.
ANSI_RE = re.compile(
    r"\x1b\[[0-?]*[ -/]*[@-~]"
    r"|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?"
    r"|\x1b[PX^_][^\x1b]*(?:\x1b\\)?"
    r"|\x1b[ -/]*[0-~]"
    r"|\x1b")
CTRL_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")

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


def peek_cmd():
    """The fleet CLI used for pane reads, or None when it is not executable."""
    cmd = os.environ.get("FLEET_DASHBOARD_PEEK_CMD", "") or FLEET_CLI
    if os.path.isfile(cmd) and os.access(cmd, os.X_OK):
        return cmd
    return None


def strip_controls(text):
    """Pane text with ANSI/OSC sequences and control chars removed; keeps
    newline and tab."""
    return CTRL_RE.sub("", ANSI_RE.sub("", text))


def remote_target(run_dir, ws):
    """(sock, session) recorded in RUN_DIR/remote/<ws>.env, or None.

    The file holds KEY=%q-quoted values; each value is shlex-parsed as one
    word and must still pass the strict patterns. Nothing in it is run."""
    path = os.path.join(run_dir, "remote", ws + ".env")
    vals = {}
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                key, sep, raw = line.rstrip("\r\n").partition("=")
                if not sep or key not in ("FLEET_SOCK", "FLEET_SESSION"):
                    continue
                try:
                    words = shlex.split(raw)
                except ValueError:
                    return None
                if len(words) != 1:
                    return None
                vals[key] = words[0]
    except OSError:
        return None
    sock = vals.get("FLEET_SOCK", "")
    session = vals.get("FLEET_SESSION", "")
    if not SOCKET_RE.match(sock) or not SESSION_RE.match(session):
        return None
    return sock, session


class PaneCache:
    """Per-ws result cache plus a per-ws lock so one peek per ws runs at a time.

    Entries are {"lines", "at", "ttl", "code", "body"}; errors are cached too,
    so a down host is not re-asked by every tab."""

    def __init__(self):
        self._guard = threading.Lock()
        self._locks = {}
        self._entries = {}

    def lock_for(self, ws):
        with self._guard:
            lk = self._locks.get(ws)
            if lk is None:
                lk = self._locks[ws] = threading.Lock()
            return lk

    def get(self, ws, lines):
        with self._guard:
            ent = self._entries.get(ws)
        if ent and ent["lines"] == lines and time.monotonic() - ent["at"] < ent["ttl"]:
            return ent["code"], ent["body"]
        return None

    def put(self, ws, lines, ttl, code, body):
        with self._guard:
            self._entries[ws] = {"lines": lines, "at": time.monotonic(),
                                 "ttl": ttl, "code": code, "body": body}


def run_peek(run_dir, ws, lines):
    """(http_code, body) for one `fleet peek` run."""
    cmd = peek_cmd()
    if cmd is None:
        return 501, {"ok": False, "error": "the fleet CLI is not available to read panes"}
    env = dict(os.environ)
    env["FLEET_RUN_DIR"] = run_dir
    try:
        proc = subprocess.run([cmd, "peek", ws, str(lines)], cwd=run_dir, env=env,
                              stdin=subprocess.DEVNULL, capture_output=True,
                              timeout=PANE_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return 504, {"ok": False, "error": "reading the pane timed out"}
    except OSError:
        return 500, {"ok": False, "error": "could not run the fleet CLI"}
    if proc.returncode == 0:
        text = proc.stdout[-PANE_MAX_BYTES:].decode("utf-8", errors="replace")
        return 200, {"ok": True, "text": strip_controls(text), "ts": int(time.time())}
    err = ""
    for ln in proc.stderr.decode("utf-8", errors="replace").splitlines():
        if ln.strip():
            err = ln.strip()
            break
    if err.startswith("fleet: "):
        err = err[len("fleet: "):]
    err = strip_controls(err)[:PANE_ERR_MAX]
    if proc.returncode == 65:
        return 409, {"ok": False, "error": err or "no session for this workstream"}
    if proc.returncode == 66:
        return 503, {"ok": False, "error": err or "host is unreachable"}
    return 500, {"ok": False, "error": err or "could not read the pane"}


def roster_rows(run_dir):
    """Every roster row as a {header: cell} dict (read by header name, empty
    cells kept). Raises OSError when roster.tsv cannot be read."""
    path = os.path.join(run_dir, "roster.tsv")
    with open(path, encoding="utf-8", errors="replace") as fh:
        lines = [ln.rstrip("\r\n") for ln in fh]
    if not lines:
        return []
    head = lines[0].split("\t")
    rows = []
    for line in lines[1:]:
        if not line:
            continue
        cells = line.split("\t")
        rows.append({h: (cells[i] if i < len(cells) else "") for i, h in enumerate(head)})
    return rows


def roster_row(run_dir, ws):
    """The roster row for ws as a {header: cell} dict, or None."""
    for row in roster_rows(run_dir):
        if row.get("ws_id", "") == ws:
            return row
    return None


# --- sessions -----------------------------------------------------------

def sessions_dir():
    return (os.environ.get("FLEET_DASHBOARD_SESSIONS_DIR", "")
            or os.path.join(os.path.expanduser("~"), ".claude", "sessions"))


def pid_alive(pid):
    """True while pid exists. EPERM means it exists under another user."""
    if pid <= 0:
        return False
    seam = os.environ.get("FLEET_DASHBOARD_PID_ALIVE")
    if seam is not None:
        return str(pid) in [p.strip() for p in seam.split(",")]
    try:
        os.kill(pid, 0)
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def project_root(path):
    """The project a path belongs to: the part before /.claude/worktrees/<x>,
    else the nearest ancestor holding .git or planning/, else path itself."""
    p = os.path.normpath(path)
    m = WORKTREE_RE.match(p)
    if m:
        return m.group(1) or "/"
    d = p
    while True:
        if os.path.exists(os.path.join(d, ".git")) or os.path.isdir(os.path.join(d, "planning")):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            return p
        d = parent


def run_project_root(run_dir):
    """Project root of a run dir (<root>/planning/fleet-<slug>)."""
    parent = os.path.dirname(run_dir)
    if os.path.basename(parent) == "planning":
        return project_root(os.path.dirname(parent))
    return project_root(run_dir)


def is_archived(run_dir):
    return os.path.lexists(os.path.join(run_dir, ARCHIVE_MARKER))


def run_socket(run_dir):
    """Twin of _fleet_tmux_socket: FLEET_TMUX_SOCKET from fleet.env, else
    fleet-<slug> with characters outside [A-Za-z0-9_.-] folded to dashes."""
    try:
        with open(os.path.join(run_dir, "fleet.env"), encoding="utf-8", errors="replace") as fh:
            for line in fh:
                key, sep, val = line.rstrip("\r\n").partition("=")
                if sep and key == "FLEET_TMUX_SOCKET" and val:
                    return val
    except OSError:
        pass
    slug = os.path.basename(run_dir)
    if slug.startswith("fleet-"):
        slug = slug[len("fleet-"):]
    return re.sub(r"[^A-Za-z0-9_.-]", "-", "fleet-" + slug)


def project_runs(root, served_run):
    """[(run_dir, rows)] for root: the served run first (when it belongs to
    root), then every other non-archived planning/fleet-* run, newest roster
    first. Unreadable rosters are skipped."""
    cands = []
    for d in glob.glob(os.path.join(glob.escape(root), "planning", "fleet-*")):
        if os.path.abspath(d) == served_run or is_archived(d):
            continue
        try:
            cands.append((os.path.getmtime(os.path.join(d, "roster.tsv")), d))
        except OSError:
            continue
    ordered = [d for _, d in sorted(cands, reverse=True)]
    if run_project_root(served_run) == root and not is_archived(served_run):
        ordered.insert(0, served_run)
    runs = []
    for d in ordered:
        try:
            runs.append((d, roster_rows(d)))
        except OSError:
            continue
    return runs


def lane_match(cwd, tmux_name, root, runs):
    """(run_dir, row) of the roster row this session is the lane of, or None."""
    for run_dir, rows in runs:
        for row in rows:
            ws = row.get("ws_id", "")
            if not WS_RE.match(ws) or row.get("host", ""):
                continue
            worktree = os.path.join(root, ".claude", "worktrees", ws.lower())
            if cwd == worktree or (tmux_name and row.get("name", "") == tmux_name):
                return run_dir, row
    return None


def session_state(status):
    return SESSION_STATE.get(status, "unknown")


def lane_state(row, session_status):
    """Roster done/dead/blocked win; a review or gate word in the status or
    the latest note reads as in review / in gate; else the session status."""
    status = row.get("status", "")
    if status in LANE_FINAL_STATES:
        return status
    for text in (status, row.get("notes", "")):
        if REVIEW_RE.search(text):
            return "in review"
        if GATE_RE.search(text):
            return "in gate"
    return session_state(session_status)


class TmuxProbe:
    """Cached `tmux -L sock has-session -t =name` answers (argv, never a
    shell string; tmux missing or a timeout reads as absent)."""

    def __init__(self):
        self._guard = threading.Lock()
        self._seen = {}

    def has(self, sock, name):
        key = (sock, name)
        now = time.monotonic()
        with self._guard:
            hit = self._seen.get(key)
        if hit and now - hit[0] < TMUX_PROBE_TTL_S:
            return hit[1]
        tmux = shutil.which("tmux")
        found = False
        if tmux:
            try:
                found = subprocess.run([tmux, "-L", sock, "has-session", "-t", "=" + name],
                                       stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL,
                                       timeout=TMUX_PROBE_TIMEOUT_S).returncode == 0
            except (OSError, subprocess.TimeoutExpired):
                found = False
        with self._guard:
            self._seen[key] = (now, found)
        return found


def read_session_file(path):
    """The parsed session dict, or None. Refuses symlinks, non-regular files
    (a FIFO would block the open) and oversized files."""
    try:
        st = os.lstat(path)
    except OSError:
        return None
    if not stat.S_ISREG(st.st_mode) or st.st_size > SESSION_MAX_BYTES:
        return None
    try:
        with open(path, "rb") as fh:
            data = json.loads(fh.read(SESSION_MAX_BYTES).decode("utf-8", errors="replace"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def epoch_s(v):
    """Epoch seconds from an epoch-ms number, else 0."""
    if isinstance(v, bool) or not isinstance(v, (int, float)) or v <= 0:
        return 0
    return int(v // 1000)


def attach_text(sock, name):
    return " ".join(shlex.quote(a) for a in attach_argv(sock, name, ""))


def collect_sessions(run_dir, socket_name, probe):
    """The /api/sessions body: whitelisted session objects, sorted this
    project first, then other projects by name; within a project fresh before
    stale, masters before lanes, then by name."""
    sdir = sessions_dir()
    dash_root = run_project_root(run_dir)
    now = int(time.time())
    try:
        names = os.listdir(sdir)
    except OSError:
        names = []
    runs_cache = {}
    out = []
    for fname in names:
        m = SESSION_FILE_RE.match(fname)
        if not m:
            continue  # .key files and anything else are never opened
        pid = int(m.group(1))
        if not pid_alive(pid):
            continue
        data = read_session_file(os.path.join(sdir, fname))
        if data is None or data.get("pid", pid) != pid:
            continue
        cwd = data.get("cwd")
        if not isinstance(cwd, str) or not cwd.startswith("/"):
            continue
        cwd = os.path.normpath(cwd)
        name = data.get("name")
        name = strip_controls(name)[:SESSION_NAME_MAX] if isinstance(name, str) else ""
        raw_tmux = data.get("tmux")
        tmux_name = raw_tmux.split(":", 1)[0] if isinstance(raw_tmux, str) else ""
        if not SESSION_RE.match(tmux_name):
            tmux_name = ""
        status = data.get("status") if isinstance(data.get("status"), str) else ""
        updated = (max(epoch_s(data.get("updatedAt")), epoch_s(data.get("statusUpdatedAt")))
                   or epoch_s(data.get("startedAt")))
        root = project_root(cwd)
        if root not in runs_cache:
            runs_cache[root] = project_runs(root, run_dir)
        row = {"pid": pid, "name": name, "project": os.path.basename(root) or root,
               "other": root != dash_root, "role": "master", "ws": "", "brief": "",
               "run": "", "state": session_state(status), "updated": updated,
               "stale": not updated or now - updated > STALE_SESSION_S,
               "tmux": tmux_name, "attach": ""}
        match = lane_match(cwd, tmux_name, root, runs_cache[root])
        if match:
            lane_run, lrow = match
            sock = socket_name if lane_run == run_dir else run_socket(lane_run)
            lname = lrow.get("name", "")
            row.update({"role": "lane", "ws": lrow.get("ws_id", ""),
                        "brief": strip_controls(lrow.get("task", ""))[:SESSION_BRIEF_MAX],
                        "run": os.path.basename(lane_run),
                        "state": lane_state(lrow, status)})
            if SESSION_RE.match(lname) and SOCKET_RE.match(sock):
                row["attach"] = attach_text(sock, lname)
        elif tmux_name and SOCKET_RE.match(socket_name) and probe.has(socket_name, tmux_name):
            row["attach"] = attach_text(socket_name, tmux_name)
        out.append({k: row[k] for k in SESSION_FIELDS})
    out.sort(key=lambda r: (r["other"], r["project"] if r["other"] else "", r["stale"],
                            r["role"] != "master", r["name"], r["pid"]))
    return {"ok": True, "project": os.path.basename(dash_root) or dash_root,
            "ts": now, "sessions": out}


class SessionsCache:
    """One cached /api/sessions body; one collection runs at a time."""

    def __init__(self):
        self._lock = threading.Lock()
        self._at = None
        self._body = None

    def get(self, build):
        with self._lock:
            if self._at is None or time.monotonic() - self._at >= SESSIONS_TTL_S:
                self._body = build()
                self._at = time.monotonic()
            return self._body


class Handler(http.server.SimpleHTTPRequestHandler):
    run_dir = ""
    socket_name = ""
    port = 0
    pane_cache = PaneCache()
    sessions_cache = SessionsCache()
    tmux_probe = TmuxProbe()

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
            return self.send_json(200, {"ok": True, "open": open_available(),
                                        "pane": peek_cmd() is not None,
                                        "sessions": True})
        if p == "/api/pane":
            return self.pane()
        if p == "/api/sessions":
            return self.sessions()
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
    def gate(self, read_only=False):
        """None when the request passes the same-origin gate, else (code, error).

        read_only (GET /api/pane, /api/sessions): a same-origin GET may omit Origin, so it is
        checked only when sent, and there is no body to type-check."""
        allowed_hosts = ("127.0.0.1:%d" % self.port, "localhost:%d" % self.port)
        allowed_origins = tuple("http://" + h for h in allowed_hosts)
        if self.headers.get("Host", "") not in allowed_hosts:
            return 403, "unexpected Host header"
        origin = self.headers.get("Origin")
        if read_only:
            if origin is not None and origin not in allowed_origins:
                return 403, "same-origin requests only"
        elif (origin or "") not in allowed_origins:
            return 403, "same-origin requests only"
        if self.headers.get("Sec-Fetch-Site", "").lower() == "cross-site":
            return 403, "same-origin requests only"
        if read_only:
            return None
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
        sock = self.socket_name
        if status == "pending":
            return self.send_json(409, {"ok": False, "error": "workstream has not started, no session yet"})
        if host:
            # Host rows attach to the socket and session recorded at spawn,
            # never the local run socket and roster name.
            if not HOST_RE.match(host):
                return self.send_json(409, {"ok": False, "error": "roster host is not a valid ssh alias"})
            target = remote_target(self.run_dir, ws)
            if target is None:
                return self.send_json(409, {"ok": False, "error": "no remote session recorded for this workstream"})
            sock, name = target
        else:
            if not SESSION_RE.match(name):
                return self.send_json(409, {"ok": False, "error": "roster name is not a valid tmux session"})
            if not SOCKET_RE.match(sock):
                return self.send_json(500, {"ok": False, "error": "server socket name is invalid"})
        attach = attach_argv(sock, name, host)
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


    # --- sessions -------------------------------------------------------
    def sessions(self):
        bad = self.gate(read_only=True)
        if bad:
            return self.send_json(bad[0], {"ok": False, "error": bad[1]})
        body = self.sessions_cache.get(
            lambda: collect_sessions(self.run_dir, self.socket_name, self.tmux_probe))
        return self.send_json(200, body)

    # --- live pane ------------------------------------------------------
    def pane(self):
        bad = self.gate(read_only=True)
        if bad:
            return self.send_json(bad[0], {"ok": False, "error": bad[1]})
        query = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
        ws = (query.get("ws") or [""])[0]
        if not WS_RE.match(ws):
            return self.send_json(400, {"ok": False, "error": "ws must be a workstream id"})
        raw = (query.get("lines") or [""])[0]
        if raw == "":
            lines = PANE_LINES_DEFAULT
        elif raw.isdigit() and len(raw) <= 6:
            lines = min(max(int(raw), PANE_LINES_MIN), PANE_LINES_MAX)
        else:
            return self.send_json(400, {"ok": False, "error": "lines must be a number"})
        try:
            row = roster_row(self.run_dir, ws)
        except OSError:
            return self.send_json(500, {"ok": False, "error": "cannot read roster.tsv"})
        if row is None:
            return self.send_json(404, {"ok": False, "error": "unknown workstream"})
        if row.get("status", "") == "pending":
            return self.send_json(409, {"ok": False, "error": "workstream has not started, no session yet"})
        ttl = PANE_TTL_HOST_S if row.get("host", "") else PANE_TTL_LOCAL_S
        cache = self.pane_cache
        hit = cache.get(ws, lines)
        if hit is None:
            # One peek per ws: later requests block here, then find the cache
            # filled by the request that held the lock.
            lk = cache.lock_for(ws)
            if not lk.acquire(timeout=PANE_TIMEOUT_S + 4):
                return self.send_json(503, {"ok": False, "error": "pane read busy, try again"})
            try:
                hit = cache.get(ws, lines)
                if hit is None:
                    hit = run_peek(self.run_dir, ws, lines)
                    cache.put(ws, lines, ttl, hit[0], hit[1])
            finally:
                lk.release()
        return self.send_json(hit[0], hit[1])


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
