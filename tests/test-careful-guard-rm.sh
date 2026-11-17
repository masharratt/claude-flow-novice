#!/usr/bin/env bash
# tests/test-careful-guard-rm.sh
# cfn-careful-guard.sh :: target-aware rm classification.
#
# Every rm is judged by WHERE it points, not by its flags. There is no "ask"
# verdict any more (2026-11-17: 173 prompts in 4 days, 168 approved by hand):
#   allow  temp areas and configured zones (careful-zones.json), rebuildable
#          folders (node_modules, .venv, ...), files git can restore (tracked
#          and unchanged), paths that do not exist
#   trash  unrecoverable work inside a repo (untracked, modified, ignored) and
#          user data outside any project: the rm is rewritten (updatedInput)
#          to cfn-trash.sh, which moves the targets to a dated trash folder
#   deny   /, top-level folders, $HOME and its key folders, a repo root, .git,
#          any ancestor of the working directory, credentials, the protected
#          list, and any target the guard cannot resolve (with guidance)
#
# "trash" is permissionDecision allow + updatedInput on stdout with exit 0;
# "deny" is exit 2. The hook runs as a subprocess exactly as production
# invokes it. SAFETY: commands are only ever fed to the guard as JSON, never
# run, except the rewritten trash commands and cfn-trash.sh itself, which run
# against fixtures inside this test's own mktemp sandbox ($T) with a fake HOME.
# Temp roots are pointed at a dedicated scratch dir via CFN_CAREFUL_TEMP_ROOTS
# so the fixture repo (itself under the OS temp dir) is not classed as temp.
set -euo pipefail
PROJECT_ROOT=$(git rev-parse --show-toplevel)
# CFN_CAREFUL_TEST_ROOT points at a staged copy of the .claude tree (develop
# without touching the live guard); default is this checkout.
STAGE=${CFN_CAREFUL_TEST_ROOT:-$PROJECT_ROOT}
HOOK="$STAGE/.claude/hooks/cfn-careful-guard.sh"
TRASH_SH="$STAGE/.claude/cfn-scripts/cfn-trash.sh"

T=$(mktemp -d "${TMPDIR:-/tmp}/careful-rm.XXXXXX")
T=$(cd "$T" && pwd -P)
trap 'rm -rf "$T"' EXIT
FAKE_HOME="$T/home"
SCRATCH="$T/scratch"
REPO="$FAKE_HOME/Projects/demo"
mkdir -p "$SCRATCH/pkg" "$FAKE_HOME/Downloads/stuff" "$REPO"
# Zone config lives in the sandbox too: no real path is ever named in a test.
ZONES="$T/zones.json"
cat > "$ZONES" <<EOF
{"allow_zones": ["$T/z/churn", "~/.claude-tmp", "~/.claude/projects/*/tool-results",
                 "$T/z/win/People/*/AppData/Local/Temp"],
 "trash_zones": ["$T/z/win/People"],
 "protected": ["~/MDTWII-art", "$T/z/keep/art"],
 "deny_exact": ["$T/z/win/People", "$T/z/win/People/*"]}
EOF

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
payload() { # command cwd -> PreToolUse JSON (SESSION_ID adds session_id)
  python3 -c 'import json,os,sys; p={"tool_name":"Bash","cwd":sys.argv[2],"tool_input":{"command":sys.argv[1],"description":"t"}}
s=os.environ.get("SESSION_ID")
if s: p["session_id"]=s
print(json.dumps(p))' "$1" "$2"
}
verdict_of() { # rc stdout -> deny|trash|ask|allow|rcN
  if [ "$1" = 2 ]; then echo deny
  elif printf '%s' "$2" | grep -q '"permissionDecision": *"ask"'; then echo ask
  elif printf '%s' "$2" | grep -q 'updatedInput' && printf '%s' "$2" | grep -q 'cfn-trash.sh'; then echo trash
  elif [ "$1" = 0 ] && [ -z "$2" ]; then echo allow
  else echo "rc$1"; fi
}
run() { # want(allow|trash|deny) description command
  local want=$1 desc=$2 cmd=$3 out rc=0 got
  out=$(payload "$cmd" "$REPO" \
    | env HOME="$FAKE_HOME" CFN_CAREFUL_TEMP_ROOTS="$SCRATCH" CFN_CAREFUL_ZONES_FILE="$ZONES" CFN_DATA_DIR="$T/data" TYPESAFE_API_KEY= \
        FLEET_RUN_DIR= CLAUDE_PROJECT_DIR= PATH="${RUNF_PATH:-$PATH}" bash "$HOOK" 2>"$T/stderr") || rc=$?
  printf '%s' "$out" > "$T/out"
  got=$(verdict_of "$rc" "$out")
  if [ "$got" = "$want" ] || { [ "$want" = safe ] && { [ "$got" = trash ] || [ "$got" = deny ]; }; }; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL ($desc): want $want got $got :: $cmd"; fi
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

# --- trash (was ask) ----------------------------------------------------------
run trash "untracked file"              "rm untracked.txt"
run trash "folder with a modified file" "rm -rf src"
run deny  "ignored secret file"         "rm -f .env"
run deny  "unknown variable"            "rm -rf \$SOMETHING_UNSET/x"
run deny  "command substitution"        "rm -rf \"\$(pwd)/src\""
run trash "outside repo, not temp"      "rm -rf ~/Downloads/stuff"
run trash "glob over repo files"        "rm -f *.txt"
run trash "one bad target of two"       "rm -rf node_modules untracked.txt"

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
run deny  "trash rm mixed with other commands" $'echo hi\nrm untracked.txt'
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
  out=$(payload "$cmd" "$cwd" \
    | env HOME="$FAKE_HOME" CFN_CAREFUL_TEMP_ROOTS="$SCRATCH" CFN_CAREFUL_ZONES_FILE="$ZONES" CFN_DATA_DIR="$T/data" TYPESAFE_API_KEY= \
        FLEET_RUN_DIR="$fl" CLAUDE_PROJECT_DIR="$cpd" PATH="${RUNF_PATH:-$PATH}" bash "$HOOK" 2>"$T/stderr") || rc=$?
  printf '%s' "$out" > "$T/out"
  got=$(verdict_of "$rc" "$out")
  if [ "$got" = "$want" ] || { [ "$want" = safe ] && { [ "$got" = trash ] || [ "$got" = deny ]; }; }; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL ($desc): want $want got $got :: $cmd"; fi
}

runf allow "worker: untracked file in own worktree"     "$WT" 1 "rm examples/probe.rs"
runf allow "worker: untracked dotfile"                  "$WT" 1 "rm -f .demo01.png"
runf allow "worker: wholly untracked folder"            "$WT" 1 "rm -rf examples/probe_dir"
runf allow "worker: absolute path in own worktree"      "$WT" 1 "rm -f $WT/examples/probe.rs"
runf allow "worker: temp area"                          "$WT" 1 "rm -rf $SCRATCH/wtmp"
runf allow "worker: untracked file plus temp"           "$WT" 1 "rm -f examples/probe.rs $SCRATCH/wtmp/f"
runf trash "not a fleet worker: same untracked file"    "$WT" 0 "rm examples/probe.rs"
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
runf deny  "non-worker: unparseable command is denied" "$WT" 0 "rm -rf \"unterminated"
runf deny  "non-worker: unresolvable rm is denied"     "$WT" 0 "tmpd=\$(pwd); rm -rf \"\$tmpd\""
spelled() { # desc: the last run's stderr tells the agent to spell the path out
  if grep -q 'spell the path out' "$T/stderr"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL ($1): no spell-it-out guidance in: $(cat "$T/stderr")"; fi
}
spelled "non-worker: unresolvable guidance"
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
runf trash "fleet clone itself is not a worker"         "$RCLONE" 0 "rm -f clone-scratch.rs"

# Hook timeout fallback (the python check did not finish): workers deny too.
SLOW="$T/slowbin"; mkdir -p "$SLOW"
printf '#!/bin/sh\nsleep 8\n' > "$SLOW/python3"; chmod +x "$SLOW/python3"
RUNF_PATH="$SLOW:$PATH" runf deny "non-worker: check timed out denies, never asks" "$WT" 0 "rm -f untracked.txt"
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
run safe  "trailing slash inside"       'd=$(mktemp -d); rm -rf "$d/"'
run safe  "trailing slash outside"      'd=$(mktemp -d); rm -rf "$d"/'
run allow "mktemp file"                 'f=$(mktemp); echo x > "$f"; rm -f "$f"'
run allow "mktemp with template"        'd=$(mktemp -d "${TMPDIR:-/tmp}/careful.XXXXXX") && rm -rf "$d"'
run allow "mktemp -t prefix"            'd=$(mktemp -d -t careful) && rm -rf "$d"'
run allow "newline separated"           $'d=$(mktemp -d)\ncp tracked.txt "$d/"\nrm -rf "$d"'
run allow "uppercase name"              'WORK=$(mktemp -d); rm -rf "$WORK"'
runf allow "worker: proven mktemp var"  "$WT" 1 'tmpd=$(mktemp -d) && rm -rf "$tmpd"'

# Bypass attempts: never allow (and never ask). "safe" = trash or deny: the
# target is either moved to the trash or the rm is blocked.
run safe  "reassigned after mktemp"      'x=$(mktemp -d); x=$(pwd); rm -rf "$x"'
run safe  "reassigned to real folder"    'x=$(mktemp -d); x=~/Downloads/stuff; rm -rf "$x"'
run safe  "reassigned to untracked"      'x=$(mktemp -d) ; x=untracked.txt ; rm -rf $x'
run safe  "assigned twice from mktemp"   'x=$(mktemp -d); x=$(mktemp -d); rm -rf "$x"'
run safe  "append assignment"            'x=$(mktemp -d); x+=/..; rm -rf "$x"'
run safe  "default expansion target"     'x=$(mktemp -d); rm -rf "${x:-/}"'
run safe  "assign-default elsewhere"     'x=$(mktemp -d); : "${x:=src}"; rm -rf "$x"'
run safe  "eval reassign"                'x=$(mktemp -d); eval "x=src"; rm -rf "$x"'
run safe  "eval with built name"         'x=$(mktemp -d); n=$(echo eA== | base64 -d); eval "$n=src"; rm -rf "$x"'
run safe  "obfuscated declare"           "x=\$(mktemp -d); n=\$(echo eA== | base64 -d); dec''lare \"\$n\"=src; rm -rf \"\$x\""
run safe  "function body reassigns"      'f(){ x=src; }; x=$(mktemp -d); f; rm -rf "$x"'
run safe  "function keyword"             'function f { x=src; }; x=$(mktemp -d); f; rm -rf "$x"'
run safe  "assigned in subshell"         '(x=$(mktemp -d)); rm -rf "$x"'
run safe  "assigned in brace group"      '{ x=$(mktemp -d); }; rm -rf "$x"'
run safe  "assigned in background"       'x=$(mktemp -d) & rm -rf "$x"'
run safe  "assigned in pipeline"         'x=$(mktemp -d) | cat; rm -rf "$x"'
run safe  "assigned after false &&"      'false && x=$(mktemp -d); rm -rf "$x"'
run safe  "assigned after true ||"       'true || x=$(mktemp -d); rm -rf "$x"'
run safe  "assigned inside if"           'if false; then x=$(mktemp -d); fi; rm -rf "$x"'
run safe  "prefix assignment only"       'x=$(mktemp -d) true; rm -rf "$x"'
run safe  "rm before the assignment"     'rm -rf "$x"; x=$(mktemp -d)'
run safe  "for loop variable"            'x=$(mktemp -d); for x in src; do :; done; rm -rf "$x"'
run safe  "read into it"                 'x=$(mktemp -d); read x <<< src; rm -rf "$x"'
run safe  "read -a attached"             'x=$(mktemp -d); echo src | read -ax; rm -rf "$x"'
run safe  "printf -v"                    'x=$(mktemp -d); printf -v x src; rm -rf "$x"'
run safe  "printf -v attached"           'x=$(mktemp -d); printf -vx src; rm -rf "$x"'
run safe  "mapfile"                      'x=$(mktemp -d); mapfile -t x < tracked.txt; rm -rf "$x"'
run safe  "arithmetic expansion"         'x=$(mktemp -d); : $((x=0)); rm -rf "$x"'
run safe  "arithmetic via value"         'x=$(mktemp -d); n=x=0; : $((n)); rm -rf "$x"'
run safe  "arithmetic command"           'x=$(mktemp -d); ((x=0)); rm -rf "$x"'
run safe  "let"                          'x=$(mktemp -d); let x=0; rm -rf "$x"'
run safe  "double bracket arithmetic"    'x=$(mktemp -d); n=x=0; [[ n -eq 0 ]]; rm -rf "$x"'
run safe  "substring offset arithmetic"  'x=$(mktemp -d); n=x=0; y=ab; : "${y:n}"; rm -rf "$x"'
run safe  "array element"                'x=$(mktemp -d); x[0]=src; rm -rf "$x"'
run deny "array assignment"             'x=($(mktemp -d) src); rm -rf $x'
run safe  "declare"                      'x=$(mktemp -d); declare x=src; rm -rf "$x"'
run safe  "declare nameref"              'x=$(mktemp -d); declare -n r=x; r=src; rm -rf "$x"'
run safe  "local"                        'x=$(mktemp -d); local x=src; rm -rf "$x"'
run safe  "export"                       'export x=$(mktemp -d); rm -rf "$x"'
run safe  "readonly"                     'readonly x=$(mktemp -d); rm -rf "$x"'
run safe  "unset"                        'x=$(mktemp -d); unset x; rm -rf "$x"'
run safe  "IFS split"                    'IFS=/; x=$(mktemp -d); rm -rf $x'
run safe  "PATH hijack of mktemp"        'PATH=.:$PATH; x=$(mktemp -d); rm -rf "$x"'
run deny "special name PWD"             'PWD=$(mktemp -d); cd src; rm -rf "$PWD"'
run safe  "special name OLDPWD"          'OLDPWD=$(mktemp -d); cd src; cd ..; rm -rf "$OLDPWD"'
run safe  "trap reassigns"               "x=\$(mktemp -d); trap 'x=src' DEBUG; rm -rf \"\$x\""
run safe  "source a file"                'x=$(mktemp -d); . ./tracked.txt; rm -rf "$x"'
run safe  "command builtin prefix"       'x=$(mktemp -d); command read x < tracked.txt; rm -rf "$x"'
run safe  "heredoc arithmetic"           $'x=$(mktemp -d); cat <<EOF\n$((x=0))\nEOF\nrm -rf "$x"'
run safe  "single-quoted literal target" "x=\$(mktemp -d); rm -rf '\$x'"
run safe  "escaped dollar target"        'x=$(mktemp -d); rm -rf \$x'
run safe  "parent of the temp dir"       'x=$(mktemp -d); rm -rf "$x/.."'
run safe  "glob under it"                'x=$(mktemp -d); rm -rf untracked.txt "$x"/*'
run safe  "concatenated text"            'x=$(mktemp -d); rm -rf "$x"src'
run safe  "two variables"                'x=$(mktemp -d); rm -rf "$x$y"'
run safe  "zsh head modifier"            'x=$(mktemp -d); rm -rf $x:h'
run safe  "zsh indirect assign"          'x=$(mktemp -d); n=x; : ${(P)n::=src}; rm -rf "$x"'
run safe  "one var plus untracked"       'x=$(mktemp -d); rm -rf "$x" untracked.txt'
run deny "one var plus home"            'x=$(mktemp -d); rm -rf "$x" ~'
run safe  "no-preserve-root"             'x=$(mktemp -d); rm -rf --no-preserve-root "$x/"'
run safe  "mktemp dry run"               'x=$(mktemp -u); rm -rf "$x"'
run safe  "mktemp -du cluster"           'x=$(mktemp -du); rm -rf "$x"'
run safe  "template without random X"    'x=$(mktemp -d src); rm -rf "$x"'
run safe  "not mktemp"                   'x=$(mktemps -d); rm -rf "$x"'
run safe  "second command in subst"      'x=$(mktemp -d; echo src); rm -rf $x'
run safe  "text after subst"             'x=$(mktemp -d)/..; rm -rf "$x"'
run safe  "nested subst in template"     'x=$(mktemp -d "$(pwd)/a.XXXXXX"); rm -rf "$x"'
run safe  "template with a space, unquoted" 'x=$(mktemp -d "/tmp/a b.XXXXXX"); rm -rf $x'
run safe  "variable template, unquoted"  'x=$(mktemp -d "$D.XXXXXX"); rm -rf $x'


# --- extra scratch roots (MDTWII 2026-11-15) ----------------------------------
# Art lanes stalled overnight (5 asks, one ~1 h) deleting their own scratch under
# /mnt/wsl/churn/art/trials/<trial>/. Machine-local list of glob patterns in
# ~/.config/cfn/careful-scratch-roots (or CFN_CAREFUL_SCRATCH_ROOTS): paths
# strictly INSIDE a matching folder pass like temp; the folder itself, its
# parents and siblings keep the normal verdict.
CHURN="$T/churn"
mkdir -p "$CHURN/art/trials/x/out" "$CHURN/art/trials/y" "$CHURN/build/art-permanent/p" "$CHURN/approved"
echo a > "$CHURN/art/trials/x/out/a.json"; echo b > "$CHURN/art/trials/y/b.png"
echo k > "$CHURN/build/art-permanent/p/keep.png"; echo k > "$CHURN/approved/k.png"
run trash "scratch roots: none configured yet"   "rm $CHURN/art/trials/x/out/a.json"
mkdir -p "$FAKE_HOME/.config/cfn"
printf '# MDTWII art trials\n%s/art/trials/*\n\n/\n' "$CHURN" > "$FAKE_HOME/.config/cfn/careful-scratch-roots"
run allow "scratch roots: file inside a trial"  "rm $CHURN/art/trials/x/out/a.json"
run allow "scratch roots: folder inside a trial" "rm -rf $CHURN/art/trials/x/out"
run allow "scratch roots: glob inside a trial"  "rm -rf $CHURN/art/trials/y/*"
run trash "scratch roots: the trial itself"      "rm -rf $CHURN/art/trials/x"
run trash "scratch roots: trials folder"         "rm -rf $CHURN/art/trials/"
run trash "scratch roots: churn root"            "rm -rf $CHURN"
run trash "scratch roots: art-permanent"         "rm $CHURN/build/art-permanent/p/keep.png"
run trash "scratch roots: approved"              "rm -rf $CHURN/approved"
run trash "scratch roots: dot-dot escape"        "rm -rf $CHURN/art/trials/x/../../../approved"
run trash "scratch roots: a bare / entry is ignored" "rm $CHURN/approved/k.png"
run deny "scratch roots: repo root still denied" "rm -rf $REPO"
# A fleet worker turns ask into worker-deny; an allowed scratch path must stay allow.
wout=$(python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","cwd":sys.argv[2],"tool_input":{"command":sys.argv[1]}}))' "rm -rf $CHURN/art/trials/x/out" "$REPO" \
  | env HOME="$FAKE_HOME" CFN_CAREFUL_TEMP_ROOTS="$SCRATCH" CFN_CAREFUL_ZONES_FILE="$ZONES" CFN_DATA_DIR="$T/data" TYPESAFE_API_KEY= \
      FLEET_RUN_DIR="$T/run" CLAUDE_PROJECT_DIR= bash "$HOOK" 2>/dev/null) && wrc=0 || wrc=$?
if [ "$wrc" = 0 ] && ! printf '%s' "$wout" | grep -q permissionDecision; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL (scratch roots: fleet worker allowed): rc=$wrc out=$wout"; fi
rm -f "$FAKE_HOME/.config/cfn/careful-scratch-roots"
# Generic build-output names count only inside a project.
mkdir -p "$T/outside/build/keep" "$T/outside/node_modules/p" "$REPO/dist/x" "$REPO/target/debug"
echo k > "$T/outside/build/keep/k.png"; echo x > "$T/outside/node_modules/p/i.js"
echo o > "$REPO/dist/x/o.js"; echo o > "$REPO/target/debug/bin"
run trash "build folder outside a project trashes"   "rm -rf $T/outside/build/keep"
run allow "node_modules outside a project allows" "rm -rf $T/outside/node_modules"
run allow "untracked dist inside a project"       "rm -rf dist/x"
run allow "untracked target inside a project"     "rm -rf $REPO/target"
out=$(python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","cwd":sys.argv[2],"tool_input":{"command":sys.argv[1]}}))' "rm $CHURN/art/trials/x/out/a.json" "$REPO" \
  | env HOME="$FAKE_HOME" CFN_CAREFUL_TEMP_ROOTS="$SCRATCH" CFN_CAREFUL_SCRATCH_ROOTS="$CHURN/art/trials/*" CFN_CAREFUL_ZONES_FILE="$ZONES" CFN_DATA_DIR="$T/data" TYPESAFE_API_KEY= \
      FLEET_RUN_DIR= CLAUDE_PROJECT_DIR= bash "$HOOK" 2>/dev/null) && rc=0 || rc=$?
if [ "$rc" = 0 ] && ! printf '%s' "$out" | grep -q permissionDecision; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL (scratch roots: env var): rc=$rc"; fi


# =============================================================================
# 2026-11-17: no more "ask". Zones allow, unsaved work goes to the trash,
# unresolvable targets and credentials are denied. Every target below lives in
# the sandbox ($T, fake HOME); the zone config is $ZONES.
# =============================================================================
mkdir -p "$T/z/churn/run1/out" "$FAKE_HOME/.claude-tmp/s" "$FAKE_HOME/.claude/projects/p1/tool-results" \
  "$T/z/win/People/u/AppData/Local/Temp/WinGet" "$T/z/win/People/u/MDTWII-captures" "$FAKE_HOME/MDTWII-art/sub" \
  "$T/z/keep/art" "$REPO/.venv/lib" "$REPO/analysis/squads-p9" "$FAKE_HOME/.ssh" "$FAKE_HOME/.aws" "$FAKE_HOME/.config/gh"
echo f > "$T/z/churn/run1/out/f.txt"; echo s > "$FAKE_HOME/.claude-tmp/s/x"
echo r > "$FAKE_HOME/.claude/projects/p1/tool-results/r.txt"
echo w > "$T/z/win/People/u/AppData/Local/Temp/WinGet/log.txt"; echo c > "$T/z/win/People/u/MDTWII-captures/c.png"
echo a > "$FAKE_HOME/MDTWII-art/a.png"; echo a > "$FAKE_HOME/MDTWII-art/sub/b.png"; echo k > "$T/z/keep/art/k.png"
echo v > "$REPO/.venv/lib/x.py"; echo '{}' > "$REPO/analysis/squads-p9/metrics-validateA-strike-A.json"
echo k > "$FAKE_HOME/.ssh/id_rsa"; echo k > "$REPO/server.pem"; echo k > "$REPO/.env.local"; echo k > "$REPO/tls.key"

# --- rule 1: allow zones (from the config file) ----------------------------------
run allow "zone: rm -rf dir in churn zone"         "rm -rf $T/z/churn/run1/out"
run allow "zone: glob in churn zone"               "rm -rf $T/z/churn/run1/*"
run allow "zone: ~/.claude-tmp"                    "rm -rf ~/.claude-tmp/s"
run allow "zone: tool-results"                     "rm -f ~/.claude/projects/p1/tool-results/r.txt"
run allow "zone: Windows user temp"                "rm -rf $T/z/win/People/u/AppData/Local/Temp/WinGet"
run trash "zone: the zone folder itself is not inside it" "rm -rf $T/z/churn"
run allow ".venv is rebuildable"                   "rm -rf .venv"

# --- rule 2: trash -----------------------------------------------------------------
run trash "fruit-fly: untracked analysis output"   "rm analysis/squads-p9/metrics-validateA-strike-A.json"
if grep -q 'cfn-trash.sh' "$T/out" && grep -q 'metrics-validateA-strike-A.json' "$T/out" \
   && grep -q '"permissionDecision": *"allow"' "$T/out"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL (trash: rewrite shape): $(cat "$T/out")"; fi
run trash "trash zone: Windows user data"          "rm -rf $T/z/win/People/u/MDTWII-captures"
run trash "glob args with one unsaved file"        "rm -f analysis/squads-p9/*.json tracked.txt"
run trash "allowed rm left alone, unsaved one rewritten" "rm -rf node_modules; rm untracked.txt"
newcmd=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["hookSpecificOutput"]["updatedInput"]["command"])' "$T/out" 2>/dev/null || true)
case "$newcmd" in
  "rm -rf node_modules; "*cfn-trash.sh*" untracked.txt") pass=$((pass+1)) ;;
  *) fail=$((fail+1)); echo "FAIL (trash: only the unsaved segment is rewritten): $newcmd" ;;
esac
run deny  "trash rm with another command is denied with guidance" "rm untracked.txt && echo done"
if grep -q 'own command' "$T/stderr"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL (mixed: own-command guidance): $(cat "$T/stderr")"; fi
run trash "cd then trash"                          "cd analysis && rm -rf squads-p9"
# Another hook (rtk-rewrite.sh) also rewrites commands; when it would, whose
# updatedInput wins is not guaranteed, so the guard refuses to rely on its own.
FAKERTK="$T/fakertk"; mkdir -p "$FAKERTK"
printf '#!/bin/sh\n[ "$1" = rewrite ] || exit 1\nprintf "rtk %%s" "$2"; exit 3\n' > "$FAKERTK/rtk"; chmod +x "$FAKERTK/rtk"
RUNF_PATH="$FAKERTK:$PATH" run deny "rtk would rewrite too: denied, never a raw rm" "rm untracked.txt"

# --- rule 3: variables -------------------------------------------------------------
run trash "var resolved from same-command assignment" 'D=~/Downloads/stuff; rm -rf "$D"'
run trash "quoted var with \$HOME resolved"        'D="$HOME/Downloads/stuff" && rm -rf $D'
run allow "var resolved to a zone"                 "Z=$T/z/churn/run1; rm -rf \"\$Z/out\""
run deny  "unresolved var is denied"               'rm -rf "$NOPE/x"'
spelled "unresolved var guidance"

# --- rule 4: credentials and protected list ------------------------------------------
run deny  "credential: ssh key"                    "rm -f ~/.ssh/id_rsa"
run deny  "credential: .ssh folder"                "rm -rf ~/.ssh"
run deny  "credential: .aws folder"                "rm -rf ~/.aws"
run deny  "credential: gh config"                  "rm -rf ~/.config/gh"
run deny  "credential: pem"                        "rm -f server.pem"
run deny  "credential: key"                        "rm tls.key"
run deny  "credential: .env.local"                 "rm .env.local"
run deny  "protected: file in MDTWII-art"          "rm ~/MDTWII-art/a.png"
run deny  "protected: recursive under it"          "rm -rf ~/MDTWII-art/sub"
run deny  "protected: the folder itself"           "rm -rf ~/MDTWII-art"
run deny  "protected: a parent of a protected folder" "rm -rf $T/z/keep"
run deny  "deny_exact: Windows Users folder"       "rm -rf $T/z/win/People"
run deny  "deny_exact: one Windows user"           "rm -rf $T/z/win/People/u"

# --- workers keep their old behaviour: deny, never trash or prompt -----------------------
runf deny "worker: unsaved file is denied, not trashed" "$REPO" 1 "rm analysis/squads-p9/metrics-validateA-strike-A.json"
guided "worker: trash-class guidance"

# --- rule 5: audit log ------------------------------------------------------------------
SESSION_ID=sess-1234 run trash "session id is passed on" "rm untracked.txt"
if grep -q 'CFN_TRASH_SESSION=sess-1234' "$T/out"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL (session id in rewrite): $(cat "$T/out")"; fi
if python3 - "$T/data/careful-audit.jsonl" <<'PY'
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
need = {"ts", "verdict", "rule", "path", "cwd", "command"}
bad = [r for r in rows if not need <= set(r)]
seen = {r["verdict"] for r in rows}
miss = {"allow", "trash", "deny"} - seen
sess = any(r.get("session") == "sess-1234" for r in rows)
zone_allow = any(r["verdict"] == "allow" and "zone" in r["rule"] for r in rows)
ok = rows and not bad and not miss and sess and zone_allow
if not ok:
    print("rows=%d missing_keys=%d missing_verdicts=%s session=%s zone_allow=%s" % (len(rows), len(bad), sorted(miss), sess, zone_allow))
sys.exit(0 if ok else 1)
PY
then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL (audit log)"; fi

# --- the rewritten command really moves the file into the trash -------------------------
mkdir -p "$FAKE_HOME/.claude"; ln -sfn "$(dirname "$TRASH_SH")" "$FAKE_HOME/.claude/cfn-scripts"
echo doomed > "$REPO/doomed.txt"
run trash "rewrite to execute" "rm -f doomed.txt"
newcmd=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["hookSpecificOutput"]["updatedInput"]["command"])' "$T/out" 2>/dev/null || true)
# Only run it when it is plainly the trash script on a sandbox file.
case "$newcmd" in
  *'cfn-trash.sh" -f doomed.txt')
    (cd "$REPO" && env HOME="$FAKE_HOME" CFN_TRASH_ROOT="$T/trash" bash -c "$newcmd") || true
    if [ ! -e "$REPO/doomed.txt" ] && grep -rq doomed "$T/trash" --include='*.txt' \
       && grep -q "$REPO/doomed.txt" "$T/trash"/*/manifest.jsonl; then pass=$((pass+1))
    else fail=$((fail+1)); echo "FAIL (rewrite executed: file not in trash)"; fi ;;
  *) fail=$((fail+1)); echo "FAIL (rewrite to execute: unexpected command, not run): $newcmd" ;;
esac

# --- cfn-trash.sh itself (sandbox only) ---------------------------------------------------
TW="$T/tw"; TR="$T/trash2"; mkdir -p "$TW/d/inner" "$TW/x1" "$TW/x2"
echo a > "$TW/a.txt"; echo i > "$TW/d/inner/i"; echo 1 > "$TW/x1/same"; echo 2 > "$TW/x2/same"; echo m > "$TW/-dash"
tr_run() { (cd "$TW" && env HOME="$FAKE_HOME" CFN_TRASH_ROOT="$TR" CFN_TRASH_SESSION=s-9 bash "$TRASH_SH" "$@" 2>/dev/null); }
check() { if eval "$2"; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL (cfn-trash: $1)"; fi; }
check "moves a file"            'tr_run a.txt && [ ! -e "$TW/a.txt" ] && grep -q "\"orig\": *\"$TW/a.txt\"" "$TR"/*/manifest.jsonl'
check "manifest has session"    'grep -q "s-9" "$TR"/*/manifest.jsonl'
check "manifest has cwd"        'grep -q "\"cwd\": *\"$TW\"" "$TR"/*/manifest.jsonl'
check "-f: missing is ok"       'tr_run -f no-such-file'
check "missing without -f fails" '! tr_run no-such-file'
check "dir without -r fails"    '! tr_run d && [ -d "$TW/d" ]'
check "-rf moves a dir"         'tr_run -rf d && [ ! -e "$TW/d" ] && find "$TR" -name i | grep -q inner/i'
check "same name twice kept"    'tr_run x1/same x2/same && [ "$(find "$TR" -name same | wc -l)" -eq 2 ]'
check "-- then a dash name"     'tr_run -- -dash && [ ! -e "$TW/-dash" ]'
mkdir -p "$TR/2020-01-01/old" "$TR/not-a-date"; touch -t 202001010000 "$TR/2020-01-01" "$TR/not-a-date"
echo b > "$TW/b.txt"
check "reaps dated folders over 7 days old" 'tr_run b.txt && [ ! -e "$TR/2020-01-01" ] && [ -d "$TR/not-a-date" ]'
check "keeps today's folder"    '[ -d "$TR/$(date +%F)" ]'
echo c > "$TW/c.txt"
check "default root is under the (fake) home" '(cd "$TW" && env -u CFN_TRASH_ROOT HOME="$FAKE_HOME" XDG_DATA_HOME= bash "$TRASH_SH" c.txt 2>/dev/null) && ls "$FAKE_HOME/.local/share/cfn-trash/"*/manifest.jsonl >/dev/null 2>&1'

echo "passed=$pass failed=$fail"
[ "$fail" = 0 ]
