#!/usr/bin/env python3
"""Judge every rm in a Bash tool call by WHERE it points.

Called by cfn-careful-guard.sh with the PreToolUse JSON payload on stdin.
Prints a verdict on the first line, then a body:
  none                 no rm in the command
  allow                every target is safe to lose
  ask  + hook JSON     some target holds work git cannot bring back, or the
                       target cannot be worked out (Claude Code asks the user)
  deny + message       a target is a place nothing should ever delete
  worker-deny + message  a fleet worker hit an ask: denied with guidance

allow: temp areas, rebuildable folders, files git can restore (tracked and
unchanged), paths that do not exist.
deny: /, top-level and system folders, $HOME and its key folders, a repo
root, .git, the working directory or any parent of it.
ask: everything else that would lose data, and anything unresolvable.

Fleet worker exception: when FLEET_RUN_DIR is set and the session cwd is
inside a linked git worktree under <repo>/.claude/worktrees/, untracked and
not-ignored files inside THAT worktree are allowed (the worker's own scratch:
probes, screenshots, debug tests). Tracked, ignored and out-of-worktree
targets keep the normal verdict. Bypass-mode workers otherwise froze on the
ask prompt (2026-10-10, ~12 stalls in one night).

Fleet workers never get ask: an unattended bypassPermissions worker stalled
~80s on each one. For a worker every ask becomes worker-deny, whose message
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
    "node_modules", ".next", "dist", "build", ".build", ".turbo", "coverage",
    "DerivedData", "__pycache__", ".cache", ".pytest_cache", ".parcel-cache",
    ".svelte-kit", ".nuxt", ".vercel", ".swc", ".mypy_cache", ".ruff_cache",
    "target", ".gradle", ".DS_Store",
}
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
RANK = {"allow": 0, "ask": 1, "deny": 2}


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


def has_rebuildable_part(path):
    return any(part in REBUILDABLE for part in path.split("/"))


def classify(path, cwd):
    """Return (verdict, reason) for one resolved absolute path."""
    shown = path.replace(HOME, "~", 1) if path.startswith(HOME) else path
    parts = [p for p in path.split("/") if p]
    if len(parts) <= 1:
        return "deny", "%s is a top-level folder of the computer" % shown
    if path.startswith(SYSTEM_PREFIXES) and not any(
            path.startswith(r + "/") for r in temp_roots()):
        for pre in SYSTEM_PREFIXES:
            if path == pre or path.startswith(pre + "/"):
                return "deny", "%s is a system folder" % shown
    if path == HOME or path in {os.path.join(HOME, d) for d in HOME_KEY_DIRS}:
        return "deny", "%s is your home folder or one of its main folders" % shown
    if cwd == path or cwd.startswith(path + "/"):
        return "deny", "%s contains the folder the command is running in" % shown
    if ".git" in parts:
        return "deny", "%s is git history" % shown
    roots = temp_roots()
    if path in roots:
        return "deny", "%s is the whole temp area" % shown
    if any(path.startswith(r + "/") for r in roots):
        return "allow", ""
    if os.path.isdir(path) and os.path.exists(os.path.join(path, ".git")):
        return "deny", "%s is a whole project" % shown
    if not os.path.lexists(path):
        return "allow", ""
    if has_rebuildable_part(path):
        return "allow", ""

    where = path if os.path.isdir(path) else os.path.dirname(path)
    top = git(["rev-parse", "--show-toplevel"], where)
    if top.returncode != 0:
        return "ask", "%s is outside any project and outside the temp area" % shown
    st = git(["status", "--porcelain=v1", "-z", "--ignored",
              "--untracked-files=all", "--", path], top.stdout.strip())
    if st.returncode != 0:
        return "ask", "git could not say whether %s is saved" % shown
    lost, untracked_only = [], True
    for entry in st.stdout.split("\0"):
        if len(entry) < 4:
            continue
        code, name = entry[:2], entry[3:]
        if code == "!!" and has_rebuildable_part(name):
            continue
        lost.append(name)
        if code != "??":
            untracked_only = False
    if lost and untracked_only and WORKER_WT and real(top.stdout.strip()) == WORKER_WT:
        return "allow", ""
    if lost:
        names = ", ".join(lost[:3]) + (" and %d more" % (len(lost) - 3) if len(lost) > 3 else "")
        return "ask", "git cannot bring back %s" % names
    return "allow", ""


def judge(cmd, cwd):
    env, verdict, reasons, saw_rm = {}, "allow", [], False
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
        if words[0] == "cd" and len(words) == 2:
            try:
                cwd = absolute(expand(words[1], env, cwd), cwd)
            except Unresolvable:
                cwd = "/nonexistent-unresolved-cd"
            continue
        if os.path.basename(words[0]) != "rm":
            continue
        saw_rm = True
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
                v, why = "ask", "the guard cannot tell where %s points: %s" % (t, e)
                verdict = max(verdict, v, key=RANK.get)
                reasons.append((v, why))
                continue
            paths = [p]
            if any(ch in p for ch in "*?["):
                paths = glob.glob(os.path.join(cwd, p)) if not p.startswith("/") else glob.glob(p)
            for one in paths:
                one = absolute(one, cwd)
                # rm -rf link/ empties the link's target, so judge the target.
                if t.endswith("/") and os.path.islink(one.rstrip("/")):
                    one = os.path.realpath(one)
                v, why = classify(one, cwd)
                verdict = max(verdict, v, key=RANK.get)
                if why:
                    reasons.append((v, why))
    if not saw_rm:
        return "none", ""
    top = [r for v, r in reasons if v == verdict]
    return verdict, "; ".join(dict.fromkeys(top))


def main():
    payload = {}
    try:
        payload = json.load(sys.stdin)
        cmd = payload.get("tool_input", {}).get("command", "") or ""
        cwd = real(payload.get("cwd") or os.getcwd())
        global WORKER_WT
        WORKER_WT = fleet_worktree(cwd)
        verdict, reason = judge(cmd, cwd)
    except Exception as e:  # never let a parse failure wave a delete through
        verdict, reason = "ask", "the delete check could not read this command (%s)" % e.__class__.__name__
    if verdict == "ask":
        try:
            worker = fleet_worker(real(payload.get("cwd") or os.getcwd()))
        except Exception:
            worker = bool(os.environ.get("FLEET_RUN_DIR"))
        if worker:
            verdict, reason = "worker-deny", "Delete check: %s. %s" % (reason, WORKER_GUIDANCE)
    print(verdict)
    if verdict == "ask":
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "ask",
            "permissionDecisionReason": "Delete check: " + reason,
        }}))
    else:
        print(reason)


if __name__ == "__main__":
    main()
