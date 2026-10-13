#!/usr/bin/env bash
# tests/test-careful-guard-rm.sh
# cfn-careful-guard.sh :: target-aware rm classification.
#
# Every rm is judged by WHERE it points, not by its flags:
#   allow  temp areas, rebuildable folders (node_modules, .next, ...), files
#          git can restore (tracked and unchanged), paths that do not exist
#   ask    unrecoverable work inside a repo (untracked, modified, ignored like
#          .env), anything outside a repo and outside temp, and any target the
#          guard cannot resolve (unknown variable, command substitution)
#   deny   /, top-level folders, $HOME and its key folders, a repo root, .git,
#          and any ancestor of the working directory
#
# "ask" is a PreToolUse permissionDecision on stdout with exit 0; "deny" is
# exit 2. The hook runs as a subprocess exactly as production invokes it.
# Temp roots are pointed at a dedicated scratch dir via CFN_CAREFUL_TEMP_ROOTS
# so the fixture repo (itself under the OS temp dir) is not classed as temp.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
HOOK="$PROJECT_ROOT/.claude/hooks/cfn-careful-guard.sh"

T=$(mktemp -d "${TMPDIR:-/tmp}/careful-rm.XXXXXX")
T=$(cd "$T" && pwd -P)
trap 'rm -rf "$T"' EXIT
FAKE_HOME="$T/home"
SCRATCH="$T/scratch"
REPO="$FAKE_HOME/Projects/demo"
mkdir -p "$SCRATCH/pkg" "$FAKE_HOME/Downloads/stuff" "$REPO"

# Fixture repo: tracked clean, tracked modified, untracked, ignored secret,
# rebuildable folders.
(
  cd "$REPO"
  git init -q
  git config user.email t@example.com; git config user.name t
  mkdir -p src clean_dir node_modules/pkg .next/cache
  echo a > src/a.txt; echo b > src/b.txt; echo c > clean_dir/c.txt
  echo keep > tracked.txt
  printf '.env\nnode_modules/\n.next/\n' > .gitignore
  git add -A; git commit -qm init
  echo changed >> src/b.txt
  echo new > untracked.txt
  echo SECRET=1 > .env
  echo x > node_modules/pkg/index.js; echo x > .next/cache/c
)

pass=0; fail=0
run() { # want(allow|ask|deny) description command
  local want=$1 desc=$2 cmd=$3 out rc=0 got
  out=$(python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","cwd":sys.argv[2],"tool_input":{"command":sys.argv[1]}}))' "$cmd" "$REPO" \
    | env HOME="$FAKE_HOME" CFN_CAREFUL_TEMP_ROOTS="$SCRATCH" CFN_DATA_DIR="$T/data" TYPESAFE_API_KEY= \
        FLEET_RUN_DIR= CLAUDE_PROJECT_DIR= bash "$HOOK" 2>/dev/null) || rc=$?
  if [ "$rc" = 2 ]; then got=deny
  elif printf '%s' "$out" | grep -q '"permissionDecision": *"ask"'; then got=ask
  elif [ "$rc" = 0 ]; then got=allow
  else got="rc$rc"; fi
  if [ "$got" = "$want" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL ($desc): want $want got $got :: $cmd"; fi
}

# --- allow -------------------------------------------------------------------
run allow "temp folder"                 "rm -rf $SCRATCH/pkg"
run allow "temp via variable"           "S=$SCRATCH/pkg; rm -rf \$S; mkdir -p \$S"
run allow "temp via braced variable"    "T=$SCRATCH; rm -rf \"\${T}/pkg\""
run allow "node_modules"                "rm -rf node_modules"
run allow "nested rebuildable"          "rm -rf .next/cache"
run allow "tracked unchanged file"      "rm tracked.txt"
run allow "tracked unchanged folder"    "rm -rf clean_dir"
run allow "path that does not exist"    "rm -f nothing-here.txt"
run allow "rm mentioned in prose"       "echo 'never run rm -rf / here'"
run allow "cd then relative temp"       "cd $SCRATCH && rm -rf pkg"

# --- ask ---------------------------------------------------------------------
run ask   "untracked file"              "rm untracked.txt"
run ask   "folder with a modified file" "rm -rf src"
run ask   "ignored secret file"         "rm -f .env"
run ask   "unknown variable"            "rm -rf \$SOMETHING_UNSET/x"
run ask   "command substitution"        "rm -rf \"\$(pwd)/src\""
run ask   "outside repo, not temp"      "rm -rf ~/Downloads/stuff"
run ask   "glob over repo files"        "rm -f *.txt"
run ask   "one bad target of two"       "rm -rf node_modules untracked.txt"

# --- deny --------------------------------------------------------------------
run deny  "root"                        "rm -rf /"
run deny  "home"                        "rm -rf ~"
run deny  "home via variable"           "rm -rf \$HOME"
run deny  "projects folder"             "rm -rf \$HOME/Projects"
run deny  "git history"                 "rm -rf .git"
run deny  "repo root"                   "rm -rf $REPO"
run deny  "parent of working dir"       "rm -rf .."
run deny  "empty variable lands on /"   "S=; rm -rf \$S/Tests"
run deny  "top-level folder"            "rm -rf /usr/local"

# --- other rules still apply after an allowed rm ------------------------------
run deny  "allowed rm then force push"  "rm -rf node_modules && git push --force origin x"

# --- rm hidden behind syntax the old gate or tokenizer missed --------------------
# Regression: shlex glued `);` into one token, so an rm after `$(...)`; escaped
# the check; and the hook's rm gate missed an rm at the start of a later line.
run deny  "rm after a substitution"     'x=$(pwd); rm -rf ~'
run ask   "rm on its own line"          $'echo hi\nrm untracked.txt'
run deny  "rm -rf home on its own line" $'cd /tmp\nrm -rf ~'

# --- fleet worker in its own worktree -------------------------------------------
# A fleet worker (FLEET_RUN_DIR set, session cwd inside a linked worktree under
# <repo>/.claude/worktrees/) deletes its own scratch without a prompt: untracked,
# not-ignored files inside that worktree only. Regression: ~12 bypassPermissions
# workers froze on "Delete check: git cannot bring back <probe>.rs" (2026-10-10).
WT="$REPO/.claude/worktrees/ws01"
OTHER_WT="$T/elsewhere-wt"
(
  cd "$REPO"
  printf 'extracted/\n' >> .gitignore; git add .gitignore; git commit -qm ignore-extracted
  git worktree add -q "$WT" -b fleet/WS01
  git worktree add -q "$OTHER_WT" -b other
  cd "$WT"
  mkdir -p examples/probe_dir extracted/screens
  echo p > examples/probe.rs; echo p > examples/probe_dir/a.rs; echo p > .demo01.png
  echo shot > extracted/screens/check.png
  echo changed >> src/b.txt
  echo o > "$OTHER_WT/scratch.rs"
)
mkdir -p "$SCRATCH/wtmp"; echo x > "$SCRATCH/wtmp/f"

runf() { # want desc cwd fleet(0|1) command [CLAUDE_PROJECT_DIR]
  local want=$1 desc=$2 cwd=$3 fleet=$4 cmd=$5 cpd=${6:-} out rc=0 got fl=""
  [ "$fleet" = 1 ] && fl="$T/run"
  out=$(python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","cwd":sys.argv[2],"tool_input":{"command":sys.argv[1]}}))' "$cmd" "$cwd" \
    | env HOME="$FAKE_HOME" CFN_CAREFUL_TEMP_ROOTS="$SCRATCH" CFN_DATA_DIR="$T/data" TYPESAFE_API_KEY= \
        FLEET_RUN_DIR="$fl" CLAUDE_PROJECT_DIR="$cpd" PATH="${RUNF_PATH:-$PATH}" bash "$HOOK" 2>"$T/stderr") || rc=$?
  if [ "$rc" = 2 ]; then got=deny
  elif printf '%s' "$out" | grep -q '"permissionDecision": *"ask"'; then got=ask
  elif [ "$rc" = 0 ]; then got=allow
  else got="rc$rc"; fi
  if [ "$got" = "$want" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL ($desc): want $want got $got :: $cmd"; fi
}

runf allow "worker: untracked file in own worktree"     "$WT" 1 "rm examples/probe.rs"
runf allow "worker: untracked dotfile"                  "$WT" 1 "rm -f .demo01.png"
runf allow "worker: wholly untracked folder"            "$WT" 1 "rm -rf examples/probe_dir"
runf allow "worker: absolute path in own worktree"      "$WT" 1 "rm -f $WT/examples/probe.rs"
runf allow "worker: temp area"                          "$WT" 1 "rm -rf $SCRATCH/wtmp"
runf allow "worker: untracked file plus temp"           "$WT" 1 "rm -f examples/probe.rs $SCRATCH/wtmp/f"
runf ask   "not a fleet worker: same untracked file"    "$WT" 0 "rm examples/probe.rs"
runf deny  "worker: tracked modified file"              "$WT" 1 "rm src/b.txt"
runf deny  "worker: ignored data dir"                   "$WT" 1 "rm -rf extracted/screens"
runf deny  "worker: ignored data file"                  "$WT" 1 "rm extracted/screens/check.png"
runf deny  "worker: untracked file in main checkout"    "$REPO" 1 "rm untracked.txt"
runf deny  "worker: main checkout file from worktree"   "$WT" 1 "rm $REPO/untracked.txt"
runf deny  "worker: worktree not under .claude/worktrees" "$OTHER_WT" 1 "rm scratch.rs"
runf deny  "worker: other worktree's file"              "$WT" 1 "rm $OTHER_WT/scratch.rs"
runf deny  "worker: folder outside any repo"            "$WT" 1 "rm -rf ~/Downloads/stuff"
runf deny  "worker: unknown variable"                   "$WT" 1 "rm -f \$W/x.txt"
runf deny  "worker: untracked plus tracked modified"    "$WT" 1 "rm -f examples/probe.rs src/b.txt"
runf deny  "worker: the worktree itself"                "$REPO" 1 "rm -rf $WT"


# --- fleet worker: deny with guidance instead of ask ----------------------------
# Unattended bypassPermissions workers stalled ~80s on every "ask" (nobody is
# there to answer). A worker now gets a deny whose message says how to proceed.
# It never turns an ask into an allow.
guided() { # desc: the last runf's stderr carries the worker guidance
  if grep -q 'fully spelled-out path' "$T/stderr" && grep -q 'report to the master' "$T/stderr"; then
    pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL ($1): no worker guidance in: $(cat "$T/stderr")"; fi
}
runf deny  "worker: unresolvable rm is denied"          "$WT" 1 "tmpd=\$(pwd); rm -rf \"\$tmpd\""
guided "worker: unresolvable rm guidance"
runf deny  "worker: untracked main-checkout file"       "$WT" 1 "rm $REPO/untracked.txt"
guided "worker: untracked file guidance"
runf deny  "worker: unparseable command"                "$WT" 1 "rm -rf \"unterminated"
guided "worker: parse failure guidance"
runf ask   "non-worker: unparseable command still asks" "$WT" 0 "rm -rf \"unterminated"
runf ask   "non-worker: unresolvable rm still asks"     "$WT" 0 "tmpd=\$(pwd); rm -rf \"\$tmpd\""
runf allow "worker: allowed rm stays allowed"           "$WT" 1 "rm -rf node_modules"
runf deny  "worker: hard deny keeps its own message"    "$WT" 1 "rm -rf ~"
if grep -q 'report to the master' "$T/stderr"; then fail=$((fail+1)); echo "FAIL (worker: hard deny got worker guidance)"; else pass=$((pass+1)); fi

# Remote host worker (fleet spawn --host): no FLEET_RUN_DIR in its pane; its
# session runs from ~/fleet-repos/<project>-wt/<ws> on the server.
RWT="$FAKE_HOME/fleet-repos/demo-wt/ws02"
RCLONE="$FAKE_HOME/fleet-repos/demo"
(
  cd "$REPO"
  git worktree add -q "$RWT" -b fleet/WS02
  git clone -q "$REPO" "$RCLONE"
  echo r > "$RWT/remote-probe.rs"; echo r > "$RCLONE/clone-scratch.rs"
)
runf deny  "remote worker: untracked file"              "$RWT" 0 "rm -f remote-probe.rs"
guided "remote worker: guidance"
runf deny  "remote worker: unresolvable variable"       "$RWT" 0 "rm -rf \"\$W\""
runf deny  "remote worker: subdir cwd"                  "$RWT/src" 0 "rm -f ../remote-probe.rs"
runf deny  "remote worker: cwd drifted, project dir set" "$SCRATCH" 0 "rm -f $RWT/remote-probe.rs" "$RWT"
runf allow "remote worker: temp still allowed"          "$RWT" 0 "rm -rf $SCRATCH/pkg"
runf ask   "fleet clone itself is not a worker"         "$RCLONE" 0 "rm -f clone-scratch.rs"

# Hook timeout fallback (the python check did not finish): workers deny too.
SLOW="$T/slowbin"; mkdir -p "$SLOW"
printf '#!/bin/sh\nsleep 8\n' > "$SLOW/python3"; chmod +x "$SLOW/python3"
RUNF_PATH="$SLOW:$PATH" runf ask  "non-worker: check timed out asks" "$WT" 0 "rm -f untracked.txt"
RUNF_PATH="$SLOW:$PATH" runf deny "worker: check timed out denies"  "$WT" 1 "rm -f untracked.txt"
guided "worker: timeout guidance"

# --- trailing-slash symlink is judged by what it points at ---------------------
# rm -rf link/ deletes the CONTENTS of the link's target (macOS and GNU), so the
# target decides, not the link's own (temp) location. Security review 2026-10-13.
ln -s "$REPO" "$SCRATCH/lnk-to-project"
run deny  "trailing-slash link into a project"  "rm -rf $SCRATCH/lnk-to-project/"
run allow "link itself, no slash"               "rm -rf $SCRATCH/lnk-to-project"

# --- rm of a variable proven to hold a fresh mktemp path -------------------------
echo z > "$REPO/0"   # untracked: an arithmetic x=0 then points at real work
# Allowed only when the SAME command assigns the variable exactly once, at top
# level and unconditionally, from $(mktemp ...) or backticks, nothing else can
# touch it, and the rm target is exactly that variable (optional trailing /).
run allow "mktemp dir, && chain"        'tmpd=$(mktemp -d) && echo hi > "$tmpd/f" && rm -rf "$tmpd"'
run allow "mktemp dir, ; separated"     'd=$(mktemp -d); cd "$d"; touch a; cd -; rm -rf "$d"'
run allow "mktemp dir, unquoted"        'd=$(mktemp -d); rm -rf $d'
run allow "mktemp in backticks"         'd=`mktemp -d`; rm -rf "$d"'
run allow "quoted substitution"         'd="$(mktemp -d)"; rm -rf "$d"'
run allow "braced read"                 'd=$(mktemp -d); rm -rf "${d}"'
# A trailing / follows a symlink: `rmdir $d; ln -s ~/Projects $d; rm -rf $d/`
# empties the link target (security review 2026-10-13), so no exemption.
run ask   "trailing slash inside"       'd=$(mktemp -d); rm -rf "$d/"'
run ask   "trailing slash outside"      'd=$(mktemp -d); rm -rf "$d"/'
run allow "mktemp file"                 'f=$(mktemp); echo x > "$f"; rm -f "$f"'
run allow "mktemp with template"        'd=$(mktemp -d "${TMPDIR:-/tmp}/careful.XXXXXX") && rm -rf "$d"'
run allow "mktemp -t prefix"            'd=$(mktemp -d -t careful) && rm -rf "$d"'
run allow "newline separated"           $'d=$(mktemp -d)\ncp tracked.txt "$d/"\nrm -rf "$d"'
run allow "uppercase name"              'WORK=$(mktemp -d); rm -rf "$WORK"'
runf allow "worker: proven mktemp var"  "$WT" 1 'tmpd=$(mktemp -d) && rm -rf "$tmpd"'

# Bypass attempts: each keeps today's verdict (never allow).
run ask  "reassigned after mktemp"      'x=$(mktemp -d); x=$(pwd); rm -rf "$x"'
run ask  "reassigned to real folder"    'x=$(mktemp -d); x=~/Downloads/stuff; rm -rf "$x"'
run ask  "reassigned to untracked"      'x=$(mktemp -d) ; x=untracked.txt ; rm -rf $x'
run ask  "assigned twice from mktemp"   'x=$(mktemp -d); x=$(mktemp -d); rm -rf "$x"'
run ask  "append assignment"            'x=$(mktemp -d); x+=/..; rm -rf "$x"'
run ask  "default expansion target"     'x=$(mktemp -d); rm -rf "${x:-/}"'
run ask  "assign-default elsewhere"     'x=$(mktemp -d); : "${x:=src}"; rm -rf "$x"'
run ask  "eval reassign"                'x=$(mktemp -d); eval "x=src"; rm -rf "$x"'
run ask  "eval with built name"         'x=$(mktemp -d); n=$(echo eA== | base64 -d); eval "$n=src"; rm -rf "$x"'
run ask  "obfuscated declare"           "x=\$(mktemp -d); n=\$(echo eA== | base64 -d); dec''lare \"\$n\"=src; rm -rf \"\$x\""
run ask  "function body reassigns"      'f(){ x=src; }; x=$(mktemp -d); f; rm -rf "$x"'
run ask  "function keyword"             'function f { x=src; }; x=$(mktemp -d); f; rm -rf "$x"'
run ask  "assigned in subshell"         '(x=$(mktemp -d)); rm -rf "$x"'
run ask  "assigned in brace group"      '{ x=$(mktemp -d); }; rm -rf "$x"'
run ask  "assigned in background"       'x=$(mktemp -d) & rm -rf "$x"'
run ask  "assigned in pipeline"         'x=$(mktemp -d) | cat; rm -rf "$x"'
run ask  "assigned after false &&"      'false && x=$(mktemp -d); rm -rf "$x"'
run ask  "assigned after true ||"       'true || x=$(mktemp -d); rm -rf "$x"'
run ask  "assigned inside if"           'if false; then x=$(mktemp -d); fi; rm -rf "$x"'
run ask  "prefix assignment only"       'x=$(mktemp -d) true; rm -rf "$x"'
run ask  "rm before the assignment"     'rm -rf "$x"; x=$(mktemp -d)'
run ask  "for loop variable"            'x=$(mktemp -d); for x in src; do :; done; rm -rf "$x"'
run ask  "read into it"                 'x=$(mktemp -d); read x <<< src; rm -rf "$x"'
run ask  "read -a attached"             'x=$(mktemp -d); echo src | read -ax; rm -rf "$x"'
run ask  "printf -v"                    'x=$(mktemp -d); printf -v x src; rm -rf "$x"'
run ask  "printf -v attached"           'x=$(mktemp -d); printf -vx src; rm -rf "$x"'
run ask  "mapfile"                      'x=$(mktemp -d); mapfile -t x < tracked.txt; rm -rf "$x"'
run ask  "arithmetic expansion"         'x=$(mktemp -d); : $((x=0)); rm -rf "$x"'
run ask  "arithmetic via value"         'x=$(mktemp -d); n=x=0; : $((n)); rm -rf "$x"'
run ask  "arithmetic command"           'x=$(mktemp -d); ((x=0)); rm -rf "$x"'
run ask  "let"                          'x=$(mktemp -d); let x=0; rm -rf "$x"'
run ask  "double bracket arithmetic"    'x=$(mktemp -d); n=x=0; [[ n -eq 0 ]]; rm -rf "$x"'
run ask  "substring offset arithmetic"  'x=$(mktemp -d); n=x=0; y=ab; : "${y:n}"; rm -rf "$x"'
run ask  "array element"                'x=$(mktemp -d); x[0]=src; rm -rf "$x"'
run deny "array assignment"             'x=($(mktemp -d) src); rm -rf $x'
run ask  "declare"                      'x=$(mktemp -d); declare x=src; rm -rf "$x"'
run ask  "declare nameref"              'x=$(mktemp -d); declare -n r=x; r=src; rm -rf "$x"'
run ask  "local"                        'x=$(mktemp -d); local x=src; rm -rf "$x"'
run ask  "export"                       'export x=$(mktemp -d); rm -rf "$x"'
run ask  "readonly"                     'readonly x=$(mktemp -d); rm -rf "$x"'
run ask  "unset"                        'x=$(mktemp -d); unset x; rm -rf "$x"'
run ask  "IFS split"                    'IFS=/; x=$(mktemp -d); rm -rf $x'
run ask  "PATH hijack of mktemp"        'PATH=.:$PATH; x=$(mktemp -d); rm -rf "$x"'
run deny "special name PWD"             'PWD=$(mktemp -d); cd src; rm -rf "$PWD"'
run ask  "special name OLDPWD"          'OLDPWD=$(mktemp -d); cd src; cd ..; rm -rf "$OLDPWD"'
run ask  "trap reassigns"               "x=\$(mktemp -d); trap 'x=src' DEBUG; rm -rf \"\$x\""
run ask  "source a file"                'x=$(mktemp -d); . ./tracked.txt; rm -rf "$x"'
run ask  "command builtin prefix"       'x=$(mktemp -d); command read x < tracked.txt; rm -rf "$x"'
run ask  "heredoc arithmetic"           $'x=$(mktemp -d); cat <<EOF\n$((x=0))\nEOF\nrm -rf "$x"'
run ask  "single-quoted literal target" "x=\$(mktemp -d); rm -rf '\$x'"
run ask  "escaped dollar target"        'x=$(mktemp -d); rm -rf \$x'
run ask  "parent of the temp dir"       'x=$(mktemp -d); rm -rf "$x/.."'
run ask  "glob under it"                'x=$(mktemp -d); rm -rf untracked.txt "$x"/*'
run ask  "concatenated text"            'x=$(mktemp -d); rm -rf "$x"src'
run ask  "two variables"                'x=$(mktemp -d); rm -rf "$x$y"'
run ask  "zsh head modifier"            'x=$(mktemp -d); rm -rf $x:h'
run ask  "zsh indirect assign"          'x=$(mktemp -d); n=x; : ${(P)n::=src}; rm -rf "$x"'
run ask  "one var plus untracked"       'x=$(mktemp -d); rm -rf "$x" untracked.txt'
run deny "one var plus home"            'x=$(mktemp -d); rm -rf "$x" ~'
run ask  "no-preserve-root"             'x=$(mktemp -d); rm -rf --no-preserve-root "$x/"'
run ask  "mktemp dry run"               'x=$(mktemp -u); rm -rf "$x"'
run ask  "mktemp -du cluster"           'x=$(mktemp -du); rm -rf "$x"'
run ask  "template without random X"    'x=$(mktemp -d src); rm -rf "$x"'
run ask  "not mktemp"                   'x=$(mktemps -d); rm -rf "$x"'
run ask  "second command in subst"      'x=$(mktemp -d; echo src); rm -rf $x'
run ask  "text after subst"             'x=$(mktemp -d)/..; rm -rf "$x"'
run ask  "nested subst in template"     'x=$(mktemp -d "$(pwd)/a.XXXXXX"); rm -rf "$x"'
run ask  "template with a space, unquoted" 'x=$(mktemp -d "/tmp/a b.XXXXXX"); rm -rf $x'
run ask  "variable template, unquoted"  'x=$(mktemp -d "$D.XXXXXX"); rm -rf $x'

echo "passed=$pass failed=$fail"
[ "$fail" = 0 ]
