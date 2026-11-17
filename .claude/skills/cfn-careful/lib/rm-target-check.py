#!/usr/bin/env python3
"""Judge every rm in a Bash tool call by WHERE it points.

Called by cfn-careful-guard.sh with the PreToolUse JSON payload on stdin.
Prints a verdict on the first line, then a body:
  none                 no rm in the command
  allow                every target is safe to lose
  trash + hook JSON    some target holds work git cannot bring back, or user
                       data outside any project: the hook JSON allows the
                       call with updatedInput rewriting each such rm to
                       cfn-trash.sh (same flags, same args)
  deny + message       a target is a place nothing should ever delete
  guide-deny + message the target cannot be worked out, or the trash rewrite
                       is not safe for this command: denied with guidance
  worker-deny + message  a fleet worker hit a trash or guide-deny case

There is no "ask" verdict (2026-11-17: 173 prompts in 4 days, 168 approved
by hand, sessions stalled for hours). Nothing here ever prompts.

allow: temp areas, configured allow zones, rebuildable folders, files git
can restore (tracked and unchanged), paths that do not exist.
deny: /, top-level and system folders, $HOME and its key folders, a repo
root, .git, the working directory or any parent of it, a mount point,
credentials, the protected list and deny_exact entries from the config.
trash: everything else that would lose data.
guide-deny: anything unresolvable; a trash rm in a command that also runs
something other than rm / cd / assignments (the guard would otherwise
auto-allow that other command, and rtk-rewrite.sh rewrites such commands
too, so whose updatedInput wins is not guaranteed); or a command rtk would
rewrite.

Zones, trash zones, the protected list and deny_exact live in ONE config
file: .claude/cfn-config/careful-zones.json (CFN_CAREFUL_ZONES_FILE
overrides it, for tests). Each entry is a glob pattern, ~ allowed.
Every allow-in-zone, trash and deny is appended to an audit JSONL file:
CFN_CAREFUL_AUDIT_FILE, else ${CFN_DATA_DIR:-~/.claude/cfn-data}/careful-audit.jsonl
(gitignored: .claude/cfn-data/*.jsonl).

Fleet worker exception: when FLEET_RUN_DIR is set and the session cwd is
inside a linked git worktree under <repo>/.claude/worktrees/, untracked and
not-ignored files inside THAT worktree are allowed (the worker's own scratch:
probes, screenshots, debug tests). Tracked, ignored and out-of-worktree
targets keep the normal verdict. Bypass-mode workers otherwise froze on the
ask prompt (2026-10-10, ~12 stalls in one night).

Fleet workers never get a trash rewrite or a guide-deny: an unattended
bypassPermissions worker stalled ~80s on each old ask, and a worker's rules
stay as they were. For a worker each such case becomes worker-deny, whose message
tells it to rewrite the rm with a literal path or stop and report to the
master. It never becomes allow. A worker is FLEET_RUN_DIR set (local spawns
export it) or a session cwd / CLAUDE_PROJECT_DIR inside
$HOME/fleet-repos/<project>-wt/<ws> (remote --host spawns, whose pane has no
fleet env). That second signal only ever tightens a verdict.

Fresh temp variables: rm of $x is allowed when the same command proves x
holds a path mktemp just created (fresh_temp_var.py has the exact rule).

Tests: tests/test-careful-guard-rm.sh
cfn: shlex tokenizer, no real shell parse; quoted '$X' is treated as a
variable, upgrade to a bash AST parser if that misjudges a real command.
"""
import glob
import json
import os
import re
import shlex
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fresh_temp_var import fresh_temp_vars  # noqa: E402

REBUILDABLE = {
    "node_modules", ".venv", ".next", ".turbo", "coverage",
    "DerivedData", "__pycache__", ".cache", ".pytest_cache", ".parcel-cache",
    ".svelte-kit", ".nuxt", ".vercel", ".swc", ".mypy_cache", ".ruff_cache",
    ".gradle", ".DS_Store",
}
# Generic names that are build output only inside a project. Outside one they
# are often real data (MDTWII 2026-11-15: /mnt/wsl/build/art-permanent/ was
# passing silently), so there they count only below a repo's top folder.
REBUILDABLE_IN_REPO = {"dist", "build", ".build", "target"}
SYSTEM_PREFIXES = (
    "/System", "/Library", "/usr", "/bin", "/sbin", "/etc", "/opt",
    "/Applications", "/private/etc", "/private/var/db", "/cores", "/Volumes",
    "/boot", "/lib", "/lib64", "/proc", "/sys", "/dev", "/root", "/srv",
)
HOME_KEY_DIRS = (
    "Projects", "Library", "Documents", "Desktop", "Downloads", "Pictures",
    "Movies", "Music", ".claude", ".ssh", ".aws", ".gnupg", ".config",
)
SEPARATORS = {";", "&&", "||", "|", "&", "(", ")", "|&", ";;"}
RANK = {"allow": 0, "trash": 1, "unresolved": 2, "deny": 3}
CREDENTIAL_DIRS = (".ssh", ".aws", ".gnupg", os.path.join(".config", "gh"))
TRASH_CMD = 'bash "$HOME/.claude/cfn-scripts/cfn-trash.sh"'
AUDIT_MAX_BYTES = 5 * 1024 * 1024  # cfn: one-step rotation to .1, add age-based pruning if audits matter long-term


class Unresolvable(Exception):
    pass


def real(p):
    return os.path.realpath(p) if p else p


HOME = real(os.environ.get("HOME", os.path.expanduser("~")))


def temp_roots():
    override = os.environ.get("CFN_CAREFUL_TEMP_ROOTS")
    if override:
        roots = override.split(":")
    else:
        roots = ["/tmp", "/private/tmp", "/var/folders", "/private/var/folders"]
        if os.environ.get("TMPDIR"):
            roots.append(os.environ["TMPDIR"])
    return [real(r).rstrip("/") for r in roots if r]


SCRATCH_ROOTS_FILE = os.path.join(HOME, ".config", "cfn", "careful-scratch-roots")


def safe_zone_roots(pats):
    """Expand glob patterns to existing folders that may act as allow zones.
    A match that is /, a top-level folder, a system folder, $HOME or one of
    its main folders is ignored, never trusted."""
    home_keys = {HOME} | {os.path.join(HOME, d) for d in HOME_KEY_DIRS}
    roots = []
    for pat in pats:
        for hit in glob.glob(os.path.expanduser(pat)):
            r = real(hit).rstrip("/")
            if not os.path.isdir(r) or len([x for x in r.split("/") if x]) < 2:
                continue
            if r in home_keys or any(r == p or r.startswith(p + "/") for p in SYSTEM_PREFIXES):
                continue
            roots.append(r)
    return roots


def scratch_roots():
    """Extra scratch folders, machine-local: glob patterns, one per line in
    ~/.config/cfn/careful-scratch-roots, plus CFN_CAREFUL_SCRATCH_ROOTS (colon
    list). A path strictly inside one passes like temp."""
    pats = [p for p in os.environ.get("CFN_CAREFUL_SCRATCH_ROOTS", "").split(":") if p]
    try:
        with open(SCRATCH_ROOTS_FILE) as f:
            pats += [ln.strip() for ln in f if ln.strip() and not ln.strip().startswith("#")]
    except OSError:
        pass
    return safe_zone_roots(pats)


ZONES_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.realpath(__file__))))),
    "cfn-config", "careful-zones.json")
_CONFIG = None


def config():
    """careful-zones.json as a dict of pattern lists. A missing or broken
    file gives empty lists: nothing extra is allowed, so unknown places fall
    through to trash (recoverable), never to a silent delete."""
    global _CONFIG
    if _CONFIG is None:
        path = os.environ.get("CFN_CAREFUL_ZONES_FILE") or ZONES_FILE
        try:
            with open(path) as f:
                raw = json.load(f)
        except (OSError, ValueError):
            raw = {}
        if not isinstance(raw, dict):
            raw = {}
        _CONFIG = {k: [p for p in raw.get(k, []) if isinstance(p, str) and p]
                   for k in ("allow_zones", "trash_zones", "protected", "deny_exact")}
    return _CONFIG


def literal_roots(pats):
    """Expand patterns to real paths; a pattern with no glob characters is
    kept even when nothing exists there yet."""
    out = []
    for pat in pats:
        pat = os.path.expanduser(pat)
        hits = glob.glob(pat)
        if not hits and not any(ch in pat for ch in "*?["):
            hits = [pat]
        out += [real(h).rstrip("/") for h in hits]
    return out


def is_credential(path):
    base = os.path.basename(path)
    if base == ".env" or base.startswith(".env.") or base.endswith((".pem", ".key")) \
            or base.startswith(("id_rsa", "id_ed25519", "id_ecdsa", "id_dsa")):
        return True
    for d in CREDENTIAL_DIRS:
        root = os.path.join(HOME, d)
        if path == root or path.startswith(root + "/"):
            return True
    return False


def strip_heredocs(cmd):
    """Drop heredoc bodies: their text is data, not commands."""
    out, lines, i = [], cmd.split("\n"), 0
    while i < len(lines):
        line = lines[i]
        out.append(line)
        m = re.search(r"<<-?\s*['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?", line)
        i += 1
        if m:
            end = m.group(1)
            while i < len(lines) and lines[i].strip() != end:
                i += 1
            i += 1
    return "\n".join(out)


def segments(cmd):
    lex = shlex.shlex(strip_heredocs(cmd).replace("\n", " ; "), posix=True,
                      punctuation_chars=";&|()")
    lex.whitespace_split = True
    seg = []
    for tok in lex:
        # shlex glues adjacent punctuation (`);`, `)&&`): any all-punctuation
        # token separates. Regression: `x=$(pwd); rm -rf ~` hid the rm.
        if tok in SEPARATORS or (tok and not tok.strip(";&|()")):
            if seg:
                yield seg
            seg = []
        else:
            seg.append(tok)
    if seg:
        yield seg


def expand(tok, env, cwd):
    if "$(" in tok or "`" in tok:
        raise Unresolvable("it is built from a command's output")
    if tok == "~" or tok.startswith("~/"):
        tok = HOME + tok[1:]

    def var(m):
        name = m.group(1) or m.group(2)
        if name in env:
            return env[name]
        if name == "HOME":
            return HOME
        if name == "PWD":
            return cwd
        if name == "TMPDIR" and os.environ.get("TMPDIR"):
            return os.environ["TMPDIR"]
        raise Unresolvable("it uses $%s, which the guard cannot see" % name)

    tok = re.sub(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)", var, tok)
    if "$" in tok:
        raise Unresolvable("it uses a shell variable the guard cannot see")
    return tok


def absolute(p, cwd):
    p = os.path.normpath(os.path.join(cwd, p))
    base = os.path.basename(p)
    if base in ("", ".", ".."):
        return real(p)
    return os.path.join(real(os.path.dirname(p)), base)


def git(args, where):
    return subprocess.run(["git", "-C", where] + args, capture_output=True,
                          text=True, timeout=3)


def fleet_worktree(cwd):
    """Top of the fleet worker's own worktree, or None when not a worker.

    A worker has FLEET_RUN_DIR in its env (spawn exports it in the pane) and a
    session cwd inside a LINKED worktree (git dir differs from the common git
    dir) whose path contains /.claude/worktrees/. The main checkout never
    qualifies.
    """
    if not os.environ.get("FLEET_RUN_DIR"):
        return None
    try:
        out = git(["rev-parse", "--show-toplevel", "--absolute-git-dir",
                   "--git-common-dir"], cwd)
    except Exception:
        return None
    lines = out.stdout.splitlines()
    if out.returncode != 0 or len(lines) != 3:
        return None
    top, gitdir, common = real(lines[0]), real(lines[1]), lines[2]
    common = real(common if os.path.isabs(common) else os.path.join(cwd, common))
    if gitdir == common or "/.claude/worktrees/" not in top + "/":
        return None
    return top


WORKER_WT = None

WORKER_GUIDANCE = (
    "You are an unattended fleet worker, so this is blocked instead of waiting "
    "on a permission prompt nobody will answer. To proceed: rewrite the rm with "
    "a literal, fully spelled-out path to exactly what you mean to delete (no "
    "variables, globs or command output); a variable set from $(mktemp ...) "
    "earlier in the same command also works. If that is blocked too, the target "
    "holds work git cannot bring back: do not delete it, stop and report to the "
    "master.")


def fleet_worker(cwd):
    """True when this session is a fleet worker (local or remote host)."""
    if os.environ.get("FLEET_RUN_DIR"):
        return True
    remote = re.escape(HOME) + r"/fleet-repos/[^/]+-wt/[^/]+(/|$)"
    for p in (cwd, os.environ.get("CLAUDE_PROJECT_DIR")):
        if p and re.match(remote, real(p)):
            return True
    return False


def has_rebuildable_part(path, names=REBUILDABLE):
    return any(part in names for part in path.split("/"))


def classify(path, cwd):
    """Return (verdict, reason, rule) for one resolved absolute path."""
    shown = path.replace(HOME, "~", 1) if path.startswith(HOME) else path
    parts = [p for p in path.split("/") if p]
    if len(parts) <= 1:
        return "deny", "%s is a top-level folder of the computer" % shown, "top-level"
    if path.startswith(SYSTEM_PREFIXES) and not any(
            path.startswith(r + "/") for r in temp_roots()):
        for pre in SYSTEM_PREFIXES:
            if path == pre or path.startswith(pre + "/"):
                return "deny", "%s is a system folder" % shown, "system"
    if path == HOME or path in {os.path.join(HOME, d) for d in HOME_KEY_DIRS}:
        return "deny", "%s is your home folder or one of its main folders" % shown, "home"
    if cwd == path or cwd.startswith(path + "/"):
        return "deny", "%s contains the folder the command is running in" % shown, "cwd-ancestor"
    if ".git" in parts:
        return "deny", "%s is git history" % shown, "git-history"
    if os.path.ismount(path):
        return "deny", "%s is a whole drive or mount" % shown, "mount"
    cfg = config()
    for p in literal_roots(cfg["protected"]):
        if path == p or path.startswith(p + "/") or p.startswith(path + "/"):
            return "deny", "%s is on the protected list" % shown, "protected"
    for p in literal_roots(cfg["deny_exact"]):
        if path == p or p.startswith(path + "/"):
            return "deny", "%s is a folder nothing should delete" % shown, "deny-exact"
    roots = temp_roots()
    if path in roots:
        return "deny", "%s is the whole temp area" % shown, "temp-root"
    if any(path.startswith(r + "/") for r in roots):
        return "allow", "", "temp-zone"
    if os.path.isdir(path) and os.path.exists(os.path.join(path, ".git")):
        return "deny", "%s is a whole project" % shown, "repo-root"
    if any(path.startswith(r + "/") for r in safe_zone_roots(cfg["allow_zones"])):
        return "allow", "", "allow-zone"
    if any(path.startswith(r + "/") for r in scratch_roots()):
        return "allow", "", "scratch-zone"
    if is_credential(path):
        return "deny", "%s holds credentials" % shown, "credential"
    if not os.path.lexists(path):
        return "allow", "", ""
    if has_rebuildable_part(path):
        return "allow", "", ""
    if any(path == r or path.startswith(r + "/") for r in literal_roots(cfg["trash_zones"])):
        return "trash", "%s is user data in a trash zone" % shown, "trash-zone"

    where = path if os.path.isdir(path) else os.path.dirname(path)
    top = git(["rev-parse", "--show-toplevel"], where)
    if top.returncode != 0:
        return "trash", "%s is outside any project and outside the temp area" % shown, "outside-project"
    if has_rebuildable_part(os.path.relpath(path, real(top.stdout.strip())),
                            REBUILDABLE_IN_REPO):
        return "allow", "", ""
    st = git(["status", "--porcelain=v1", "-z", "--ignored",
              "--untracked-files=all", "--", path], top.stdout.strip())
    if st.returncode != 0:
        return "trash", "git could not say whether %s is saved" % shown, "git-unknown"
    lost, untracked_only = [], True
    for entry in st.stdout.split("\0"):
        if len(entry) < 4:
            continue
        code, name = entry[:2], entry[3:]
        if code == "!!" and has_rebuildable_part(name, REBUILDABLE | REBUILDABLE_IN_REPO):
            continue
        lost.append(name)
        if code != "??":
            untracked_only = False
    if lost and untracked_only and WORKER_WT and real(top.stdout.strip()) == WORKER_WT:
        return "allow", "", ""
    if lost:
        names = ", ".join(lost[:3]) + (" and %d more" % (len(lost) - 3) if len(lost) > 3 else "")
        return "trash", "git cannot bring back %s" % names, "unsaved-work"
    return "allow", "", ""


SIMPLE_WORDS = {"rm", "cd"}


def judge(cmd, cwd):
    """Return (verdict, reason, per-rm-segment verdicts, audit events, simple).

    simple: every segment is an rm, a cd or plain assignments, so a trash
    rewrite changes nothing but the rm itself."""
    env, verdict, reasons, saw_rm = {}, "allow", [], False
    seg_verdicts, events, simple = [], [], True
    fresh = fresh_temp_vars(cmd)
    for seg in segments(cmd):
        words = list(seg)
        if words and words[0] == "export":
            words = words[1:]
        assigns = []
        while words and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", words[0]):
            assigns.append(words.pop(0))
        if not words:
            for a in assigns:
                name, val = a.split("=", 1)
                try:
                    env[name] = expand(val, env, cwd)
                except Unresolvable:
                    env.pop(name, None)
            continue
        if os.path.basename(words[0]) not in SIMPLE_WORDS:
            simple = False
        if words[0] == "cd" and len(words) == 2:
            try:
                cwd = absolute(expand(words[1], env, cwd), cwd)
            except Unresolvable:
                cwd = "/nonexistent-unresolved-cd"
            continue
        if os.path.basename(words[0]) != "rm":
            continue
        saw_rm = True
        seg_v = "allow"
        targets, opts_done = [], False
        for w in words[1:]:
            if not opts_done and w == "--":
                opts_done = True
            elif not opts_done and w.startswith("-") and w != "-":
                continue
            else:
                targets.append(w)
        for t in targets:
            # No trailing /: `$d/` follows a symlink swapped in for the temp dir.
            m = re.fullmatch(r"\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))", t)
            if m and (m.group(1) or m.group(2)) in fresh and "--no-preserve-root" not in words:
                continue  # holds a path mktemp just created in this command
            try:
                p = expand(t, env, cwd)
            except Unresolvable as e:
                why = "the guard cannot tell where %s points: %s" % (t, e)
                seg_v = max(seg_v, "unresolved", key=RANK.get)
                reasons.append(("unresolved", why))
                events.append(("deny", "unresolved", t))
                continue
            paths = [p]
            if any(ch in p for ch in "*?["):
                paths = glob.glob(os.path.join(cwd, p)) if not p.startswith("/") else glob.glob(p)
            for one in paths:
                one = absolute(one, cwd)
                # rm -rf link/ empties the link's target, so judge the target.
                if t.endswith("/") and os.path.islink(one.rstrip("/")):
                    one = os.path.realpath(one)
                v, why, rule = classify(one, cwd)
                seg_v = max(seg_v, v, key=RANK.get)
                if why:
                    reasons.append((v, why))
                if rule and (v != "allow" or rule.endswith("zone")):
                    events.append((v, rule, one))
        seg_verdicts.append(seg_v)
        verdict = max(verdict, seg_v, key=RANK.get)
    if not saw_rm:
        return "none", "", [], [], simple
    top = [r for v, r in reasons if v == verdict]
    return verdict, "; ".join(dict.fromkeys(top)), seg_verdicts, events, simple


WORD_STOP = " \t;&|()`\n"


def rm_word_spans(cmd):
    """(start, end) of every rm command word in cmd, in order, found with the
    same separators segments() uses but on the original text, so the rest of
    the command can be kept byte for byte. None when the text cannot be
    scanned (unterminated quote)."""
    spans, i, n, at_start = [], 0, len(cmd), True
    while i < n:
        c = cmd[i]
        if c in " \t":
            i += 1
            continue
        if c in ";&|()`\n":
            at_start, i = True, i + 1
            continue
        if c == "#":
            j = cmd.find("\n", i)
            i = n if j < 0 else j
            continue
        start, val = i, []
        while i < n and cmd[i] not in WORD_STOP:
            ch = cmd[i]
            if ch == "\\":
                if i + 1 < n and cmd[i + 1] != "\n":
                    val.append(cmd[i + 1])
                i += 2
            elif ch == "'":
                j = cmd.find("'", i + 1)
                if j < 0:
                    return None
                val.append(cmd[i + 1:j])
                i = j + 1
            elif ch == '"':
                j = i + 1
                while j < n and cmd[j] != '"':
                    j += 2 if cmd[j] == "\\" else 1
                if j >= n:
                    return None
                val.append(cmd[i + 1:j])
                i = j + 1
            else:
                val.append(ch)
                i += 1
        word = "".join(val)
        if at_start:
            if word == "export" or re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", word):
                continue
            if os.path.basename(word) == "rm":
                spans.append((start, i))
            at_start = False
    return spans


def trash_rewrite(cmd, seg_verdicts, session):
    """cmd with each trash-verdict rm word swapped for cfn-trash.sh, or None
    when the rm words found in the text do not line up one to one with the
    rm segments the judge saw (heredocs, comments, odd quoting)."""
    if "<<" in cmd:
        return None
    spans = rm_word_spans(cmd)
    if spans is None or len(spans) != len(seg_verdicts):
        return None
    sid = re.sub(r"[^A-Za-z0-9._-]", "", session or "")[:80]
    repl = ("CFN_TRASH_SESSION=%s " % sid if sid else "") + TRASH_CMD
    out, last = [], 0
    for (s, e), v in zip(spans, seg_verdicts):
        if v == "trash":
            out += [cmd[last:s], repl]
            last = e
    out.append(cmd[last:])
    return "".join(out)


def rtk_would_rewrite(cmd):
    """True when rtk-rewrite.sh would also emit updatedInput for this
    command. Two hooks rewriting one call race, so the guard then refuses to
    rely on its own rewrite. Any doubt (rtk errors, hangs) counts as True."""
    if not any(os.access(os.path.join(d, "rtk"), os.X_OK)
               for d in os.environ.get("PATH", "").split(os.pathsep) if d):
        return False
    try:
        out = subprocess.run(["rtk", "rewrite", cmd], capture_output=True, text=True, timeout=1.5)
    except Exception:
        return True
    if out.returncode in (0, 3):
        return out.stdout.strip() != cmd.strip()
    return False


def audit(events, outcome, payload, cmd, cwd):
    """Append one JSON line per allow-in-zone, trash and deny. Best effort:
    a log failure never changes the verdict."""
    if not events:
        return
    try:
        path = os.environ.get("CFN_CAREFUL_AUDIT_FILE") or os.path.join(
            os.environ.get("CFN_DATA_DIR") or os.path.join(HOME, ".claude", "cfn-data"),
            "careful-audit.jsonl")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if os.path.exists(path) and os.path.getsize(path) > AUDIT_MAX_BYTES:
            os.replace(path, path + ".1")
        ts = __import__("datetime").datetime.now().astimezone().isoformat(timespec="seconds")
        with open(path, "a") as f:
            for verdict, rule, target in events:
                f.write(json.dumps({
                    "ts": ts, "verdict": verdict, "outcome": outcome, "rule": rule,
                    "path": target, "cwd": cwd, "session": payload.get("session_id") or "",
                    "command": cmd[:300]}) + "\n")
    except Exception:
        pass


LITERAL_GUIDANCE = (
    "To proceed, spell the path out literally (no command output or unknown "
    "variables); a VAR=literal or VAR=$(mktemp ...) set earlier in the same "
    "command also works.")
OWN_COMMAND_GUIDANCE = (
    "This delete would go to the trash (cfn-trash.sh), which needs the rm in "
    "its own command: run it alone (cd and VAR=value before it are fine), "
    "then run the rest separately.")


def main():
    payload, cmd, cwd = {}, "", os.getcwd()
    seg_verdicts, events, simple = [], [], False
    try:
        payload = json.load(sys.stdin)
        cmd = payload.get("tool_input", {}).get("command", "") or ""
        cwd = real(payload.get("cwd") or os.getcwd())
        global WORKER_WT
        WORKER_WT = fleet_worktree(cwd)
        verdict, reason, seg_verdicts, events, simple = judge(cmd, cwd)
    except Exception as e:  # never let a parse failure wave a delete through
        verdict, reason = "unresolved", "the delete check could not read this command (%s)" % e.__class__.__name__
        events = [("deny", "unreadable", "")]
    body = reason
    if verdict in ("trash", "unresolved"):
        try:
            worker = fleet_worker(cwd)
        except Exception:
            worker = bool(os.environ.get("FLEET_RUN_DIR"))
        new = None
        if worker:
            verdict, body = "worker-deny", "Delete check: %s. %s" % (reason, WORKER_GUIDANCE)
        elif verdict == "unresolved":
            verdict, body = "guide-deny", "Delete check: %s. %s" % (reason, LITERAL_GUIDANCE)
        else:
            new = trash_rewrite(cmd, seg_verdicts, payload.get("session_id")) if simple else None
            if new is None or rtk_would_rewrite(cmd):
                verdict, body = "guide-deny", "Delete check: %s. %s" % (reason, OWN_COMMAND_GUIDANCE)
            else:
                tool_input = dict(payload.get("tool_input") or {})
                tool_input["command"] = new
                body = json.dumps({"hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "allow",
                    "permissionDecisionReason": "Delete check: %s, so it goes to the trash "
                                                "(cfn-trash.sh, kept 7 days) instead." % reason,
                    "updatedInput": tool_input,
                }})
    audit(events, verdict, payload, cmd, cwd)
    print(verdict)
    print(body)


if __name__ == "__main__":
    main()
