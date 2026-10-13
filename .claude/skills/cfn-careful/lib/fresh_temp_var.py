"""Prove that a shell variable holds a path mktemp just created.

rm-target-check.py asks fresh_temp_vars(cmd) which variable names of one
Bash tool command may be deleted without resolving them. A name is proven
only when ALL of these hold for the SAME command string:

- it is assigned exactly once, as a top-level command of its own:
  x=$(mktemp ...), x="$(mktemp ...)" or x=`mktemp ...`, first in its and-or
  list (start, ; or newline before it) and not piped, so it always runs, in
  the current shell, before anything written after it;
- the substitution is one plain mktemp call: options -d -q -t -p
  --directory --quiet --tmpdir only (never -u, the dry run), and every
  template ends in XXX, so the output is a path mktemp just created;
- the name appears nowhere else except as $x / ${x} reads (or ${x:-w},
  ${x-w}, ${x:+w}, ${x+w}), all after the assignment, none single-quoted;
- the command uses nothing this scanner does not model: subshells, groups,
  functions, keywords, heredocs, arithmetic, backgrounding, escaped dollars,
  dynamic command names, builtins that can set variables (eval, read,
  declare, printf -v, ...), and IFS or PATH changes all prove nothing;
- if any read is unquoted, the mktemp call is fully literal and TMPDIR is
  untouched, so word splitting cannot turn the path into several words.

Anything else proves nothing and the caller keeps its normal verdict.
The rm target itself must be exactly $x or ${x} (optional trailing /); that
check lives in the caller, which sees the rm words.

cfn: hand-rolled scanner that rejects what it does not model; upgrade to a
real bash/zsh parser if it rejects common commands. Functions or aliases
from the user's shell snapshot that set the same name are out of scope.
Tests: tests/test-careful-guard-rm.sh
"""
import os
import re

NAME = r"[A-Za-z_][A-Za-z0-9_]*"
SAFE_CHARS = r"[A-Za-z0-9_./%+:@,~=-]"

# Names the shell sets or reads by itself (bash and zsh). Never proven.
SPECIAL_NAMES = {
    "_", "IFS", "PATH", "path", "CDPATH", "cdpath", "HOME", "PWD", "OLDPWD",
    "ENV", "TMPDIR", "SHELLOPTS", "RANDOM", "SRANDOM", "SECONDS", "LINENO",
    "REPLY", "reply", "OPTARG", "OPTIND", "PPID", "UID", "EUID", "GROUPS",
    "DIRSTACK", "dirstack", "PIPESTATUS", "pipestatus", "status", "argv",
    "MATCH", "match", "MBEGIN", "MEND", "mbegin", "mend", "PS1", "PS2", "PS3",
    "PS4", "PROMPT", "prompt", "PROMPT_COMMAND", "FPATH", "fpath", "MANPATH",
    "manpath", "MAILPATH", "mailpath", "module_path", "psvar", "options",
    "parameters", "funcstack", "SHLVL", "HOSTNAME", "GLOBIGNORE", "TMOUT",
    "history", "historywords", "commands", "functions", "aliases", "builtins",
    "modules", "nameddirs", "userdirs", "jobdirs", "jobstates", "jobtexts",
    "signals", "watch", "WATCH", "fignore", "FIGNORE", "POSIXLY_CORRECT",
}
SPECIAL_PREFIXES = ("BASH", "COMP", "EPOCH", "HIST", "FUNC", "ZSH", "READLINE",
                    "COPROC", "LC_")

# Standalone assignments that change how later commands run.
BLOCKED_ASSIGN = {"IFS", "PATH", "path", "CDPATH", "cdpath", "ENV",
                  "FPATH", "fpath"}

# Every bash and zsh builtin or reserved word (bash 5.3 compgen -b -k, zsh
# ${(k)builtins} ${(k)reswords}, plus module builtins that set variables),
# minus the few that cannot set a variable: cd echo pwd true false : and the
# guarded set / test / [ below. Any of these as a command word proves nothing.
BANNED_COMMANDS = set("""
! - . [[ ]] alias autoload bg bind bindkey break builtin bye caller case chdir
command compadd comparguments compcall compctl compdescribe compfiles
compgen complete compgroups compopt compquote compset comptags comptry
compvalues continue coproc declare dirs disable disown do done echotc echoti
elif else emulate enable end esac eval exec exit export fc fg fi float for
foreach function functions getln getopts hash help history if in integer jobs
kill let limit local log logout mapfile nocorrect noglob popd print printf
private pushd pushln r read readarray readonly rehash repeat return sched
select setopt shift shopt source suspend then time times trap ttyctl type
typeset ulimit umask unalias unfunction unhash unlimit unset unsetopt until
vared wait whence where which while zcompile zformat zle zmodload zparseopts
zregexparse zstyle { } sysread sysopen syswrite strftime zselect zsocket ztcp
zpty zstat pcre_match pcre_compile zgetattr zlistattr getcap zsystem zprof
zcurses zftp
""".split())
ARITH_TEST_OPS = {"-eq", "-ne", "-lt", "-le", "-gt", "-ge"}


class Unproven(Exception):
    pass


def _single(cmd, i, sq):
    """cmd[i] is a single quote. Record $names inside it; return the end."""
    j = cmd.find("'", i + 1)
    if j < 0:
        raise Unproven("unterminated single quote")
    for m in re.finditer(r"\$\{?(%s)" % NAME, cmd[i + 1:j]):
        sq.add(m.group(1))
    return j + 1


def _dollar(cmd, i, quoted, reads, sq):
    """cmd[i] is $. Record a variable read; return the end of the expansion."""
    nxt = cmd[i + 1:i + 2]
    if cmd.startswith("$((", i) or nxt in ("[", "'", '"'):
        raise Unproven("arithmetic or $-quoting")
    if nxt == "(":
        return _nested(cmd, i + 2, ")", reads, sq)
    if nxt == "{":
        j = cmd.find("}", i + 2)
        if j < 0:
            raise Unproven("unterminated ${")
        m = re.fullmatch(r"(%s)(?:(:?[-+])([^$`{}()\[\]'\"\\]*))?" % NAME, cmd[i + 2:j])
        if not m:
            raise Unproven("parameter expansion the proof does not model")
        reads.append((m.group(1), i, quoted))
        return j + 1
    m = re.match(NAME, cmd[i + 1:])
    if m:
        end = i + 1 + m.end()
        if cmd[end:end + 1] == "[":
            raise Unproven("subscript (arithmetic in zsh)")
        reads.append((m.group(0), i, quoted))
        return end
    return i + 1


def _double(cmd, i, reads, sq):
    """cmd[i] is a double quote; return the end of the quoted string."""
    j = i + 1
    while j < len(cmd):
        c = cmd[j]
        if c == '"':
            return j + 1
        if c == "\\":
            if cmd[j + 1:j + 2] in ("$", "`"):
                raise Unproven("escaped dollar")
            j += 2
        elif c == "$":
            j = _dollar(cmd, j, True, reads, sq)
        elif c == "`":
            j = _nested(cmd, j + 1, "`", reads, sq)
        else:
            j += 1
    raise Unproven("unterminated double quote")


def _nested(cmd, i, closer, reads, sq):
    """Body of $( ) or backticks, from i; return the index after the closer."""
    depth, j = 0, i
    while j < len(cmd):
        c = cmd[j]
        if c == closer and (closer == "`" or depth == 0):
            return j + 1
        if c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
        if c == "'":
            j = _single(cmd, j, sq)
        elif c == '"':
            j = _double(cmd, j, reads, sq)
        elif c == "$":
            j = _dollar(cmd, j, False, reads, sq)
        elif c == "`" and closer != "`":
            j = _nested(cmd, j + 1, "`", reads, sq)
        elif c == "\\":
            j += 2
        elif cmd.startswith("<<", j):
            raise Unproven("heredoc")
        else:
            j += 1
    raise Unproven("unterminated substitution")


def _scan(cmd):
    """Split cmd into top-level simple commands and record every read.

    Returns (commands, reads, sq): commands is a list of
    (operator_before, [(word, start, end), ...]); reads is a list of
    (name, start, quoted); sq is the set of $names inside single quotes.
    """
    commands, reads, sq = [], [], set()
    words, op, wstart = [], None, None
    i, n = 0, len(cmd)

    def flush_word(end):
        nonlocal wstart
        if wstart is not None:
            words.append((cmd[wstart:end], wstart, end))
            wstart = None

    def flush_cmd(next_op):
        nonlocal words, op
        if words:
            commands.append((op, words))
            words, op = [], next_op
        elif op not in ("&&", "||", "|"):
            op = next_op

    while i < n:
        c = cmd[i]
        if c in " \t":
            flush_word(i)
            i += 1
        elif c == "\n":
            flush_word(i)
            flush_cmd("\n")
            i += 1
        elif c == "#" and wstart is None:
            j = cmd.find("\n", i)
            i = n if j < 0 else j
        elif c == "\\":
            if cmd[i + 1:i + 2] != "\n":
                raise Unproven("backslash escape")
            flush_word(i)
            i += 2
        elif c == ";":
            if cmd[i + 1:i + 2] == ";":
                raise Unproven(";;")
            flush_word(i)
            flush_cmd(";")
            i += 1
        elif c == "&":
            if cmd[i + 1:i + 2] == "&":
                flush_word(i)
                flush_cmd("&&")
                i += 2
            elif wstart is not None and cmd[i - 1] in "<>":
                i += 1
            elif cmd[i + 1:i + 2] == ">":
                wstart = i if wstart is None else wstart
                i += 2
            else:
                raise Unproven("background job")
        elif c == "|":
            two = cmd[i:i + 2]
            flush_word(i)
            flush_cmd("||" if two == "||" else "|")
            i += 2 if two in ("||", "|&") else 1
        elif c in "(){}":
            raise Unproven("subshell, group or function")
        elif cmd.startswith("<<", i) or cmd.startswith("<(", i) or cmd.startswith(">(", i):
            raise Unproven("heredoc or process substitution")
        else:
            wstart = i if wstart is None else wstart
            if c == "'":
                i = _single(cmd, i, sq)
            elif c == '"':
                i = _double(cmd, i, reads, sq)
            elif c == "$":
                i = _dollar(cmd, i, False, reads, sq)
            elif c == "`":
                i = _nested(cmd, i + 1, "`", reads, sq)
            else:
                i += 1
    flush_word(n)
    flush_cmd(None)
    return commands, reads, sq


def _check_commands(commands):
    """Raise Unproven on any top-level command that could set a variable.

    Returns the names assigned anywhere at top level, with repeats.
    """
    assigned = []
    for _op, words in commands:
        k = 0
        while k < len(words):
            m = re.match(r"(%s)(\+?=|\[)" % NAME, words[k][0])
            if not m:
                break
            if m.group(2) == "[":
                raise Unproven("array element assignment")
            assigned.append(m.group(1))
            k += 1
        if k == len(words):
            for w, _s, _e in words:
                name = re.match(NAME, w).group(0)
                if name in BLOCKED_ASSIGN or name.startswith("BASH"):
                    raise Unproven("assignment to %s" % name)
            continue
        first, args = words[k][0], [w for w, _s, _e in words[k + 1:]]
        if first == ":":
            continue
        if not re.fullmatch(r"[A-Za-z0-9_./+@%][A-Za-z0-9_./+@%-]*|\[", first):
            raise Unproven("dynamic or quoted command name")
        if first in ("[", "test"):
            if ARITH_TEST_OPS.intersection(args):
                raise Unproven("numeric test (arithmetic in zsh)")
        elif first == "set":
            if not all(re.fullmatch(r"[-+][euxvo]+|pipefail|errexit|nounset|xtrace", a) for a in args):
                raise Unproven("set with arguments")
        elif first in BANNED_COMMANDS:
            raise Unproven("%s can set variables" % first)
    return assigned


def _subst_body(rhs):
    for pat in (r"\$\((.*)\)", r'"\$\((.*)\)"', r"`(.*)`", r'"`(.*)`"'):
        m = re.fullmatch(pat, rhs, re.S)
        if m:
            return m.group(1)
    return None


def _mktemp_literal(body):
    """None when body is not one plain mktemp call that always creates a
    fresh path; else True when it has no $ expansions, False otherwise."""
    piece = r"(?:%s+|\"(?:%s|\$\{%s(?::?-%s*)?\}|\$%s)*\"|'%s*')" % (
        SAFE_CHARS, SAFE_CHARS, NAME, SAFE_CHARS, NAME, SAFE_CHARS)
    toks = body.split()
    if not toks or toks[0] != "mktemp":
        return None
    if not all(re.fullmatch(piece + "+", t) for t in toks[1:]):
        return None
    k, opts_done, takes_arg = 1, False, False
    while k < len(toks):
        t = toks[k]
        k += 1
        if takes_arg:
            takes_arg = False
            continue
        if not opts_done and t == "--":
            opts_done = True
        elif not opts_done and t.startswith("--"):
            if t not in ("--directory", "--quiet", "--tmpdir") and not t.startswith("--tmpdir="):
                return None
        elif not opts_done and t.startswith("-") and len(t) > 1:
            for pos, ch in enumerate(t[1:]):
                if ch in "pt":
                    takes_arg = pos == len(t) - 2
                    break
                if ch not in "dq":
                    return None
        elif not re.sub(r"[\"']", "", t).endswith("XXX"):
            return None
    return "$" not in body


def _safe_unquoted(cmd):
    tmp = os.environ.get("TMPDIR", "")
    return "TMPDIR" not in cmd and re.fullmatch(SAFE_CHARS + "*", tmp) is not None


def _name_ok(name, cmd, astart, aend, reads, sq, literal, assigned):
    if name in SPECIAL_NAMES or name.startswith(SPECIAL_PREFIXES):
        return False
    if name in sq or assigned.count(name) != 1:
        return False
    for m in re.finditer(r"(?<![A-Za-z0-9_])%s(?![A-Za-z0-9_])" % name, cmd):
        s, e = m.start(), m.end()
        if s == astart:
            continue  # the assignment itself (count checked above)
        if cmd[s - 1:s] == "$" or cmd[s - 2:s] == "${":
            if s < aend:
                return False  # read before (or inside) the assignment
            continue
        if (s > 0 and cmd[s - 1] in "/.-") or cmd[e:e + 1] in ("/", "."):
            continue  # part of a path, file name or flag
        return False
    mine = [r for r in reads if r[0] == name]
    if any(not quoted for _n, _s, quoted in mine):
        if not literal or not _safe_unquoted(cmd):
            return False
    return True


def fresh_temp_vars(cmd):
    """Names in cmd proven to hold a path mktemp just created (see module doc)."""
    if "\\$" in cmd or re.search(r"(?<![A-Za-z0-9_])IFS(?![A-Za-z0-9_])", cmd):
        return set()
    try:
        commands, reads, sq = _scan(cmd)
        assigned = _check_commands(commands)
    except Unproven:
        return set()
    proven = set()
    for idx, (op, words) in enumerate(commands):
        if len(words) != 1 or op not in (None, ";", "\n"):
            continue
        if idx + 1 < len(commands) and commands[idx + 1][0] == "|":
            continue
        w, start, end = words[0]
        m = re.fullmatch(r"(%s)=(.*)" % NAME, w, re.S)
        if not m:
            continue
        body = _subst_body(m.group(2))
        literal = _mktemp_literal(body) if body is not None else None
        if literal is None:
            continue
        if _name_ok(m.group(1), cmd, start, end, reads, sq, literal, assigned):
            proven.add(m.group(1))
    return proven
