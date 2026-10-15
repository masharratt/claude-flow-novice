#!/usr/bin/env bash
# Tests for cfn-work-mode-guard.sh. Feeds PreToolUse JSON to the guard and checks block/allow.
# Never touches the real flag: CFN_WORK_MODE_DIR points at a temp dir for every case.
#   bash ~/.claude/hooks/cfn-work-mode-guard.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARD="$HERE/cfn-work-mode-guard.sh"
TMP_ROOT="${TMPDIR:-/tmp}"
WDIR=$(mktemp -d "${TMP_ROOT%/}/wm-test.XXXXXX")
trap 'rm -rf "$WDIR"' EXIT
export CFN_WORK_MODE_DIR="$WDIR"

# A project whose git common dir is named MDTWII, so project-scoped rules apply.
# Built in the temp dir so the test never depends on (or writes to) a real checkout.
MD="$WDIR/MDTWII"
mkdir -p "$MD" && git -C "$MD" init -q 2>/dev/null
OTHER="$WDIR/other-project"
mkdir -p "$OTHER"

PASS=0 FAIL=0
payload(){ # payload <tool> <command> <cwd>
    jq -nc --arg t "$1" --arg c "$2" --arg d "$3" \
        '{hook_event_name:"PreToolUse",tool_name:$t,tool_input:{command:$c},cwd:$d}'
}
run(){ # run <tool> <command> <cwd> -> sets RC, ERR
    ERR=$(payload "$1" "$2" "$3" | bash "$GUARD" 2>&1 >/dev/null); RC=$?
}
expect_block(){ # expect_block <command> [cwd]
    run Bash "$1" "${2:-$MD}"
    if [ "$RC" = "2" ] && printf '%s' "$ERR" | grep -q "WORK MODE"; then PASS=$((PASS+1))
    else FAIL=$((FAIL+1)); echo "FAIL (expected block, rc=$RC): $1"; fi
}
expect_allow(){ # expect_allow <command> [cwd] [tool]
    run "${3:-Bash}" "$1" "${2:-$MD}"
    if [ "$RC" = "0" ] && [ -z "$ERR" ]; then PASS=$((PASS+1))
    else FAIL=$((FAIL+1)); echo "FAIL (expected allow, rc=$RC): $1 :: ${ERR:0:200}"; fi
}

date -u +%Y-%m-%dT%H:%M:%SZ > "$WDIR/.work-mode-active"

# --- blocked: anything that opens a window ---
expect_block 'open https://example.com'
expect_block 'open -a Safari report.html'
expect_block 'cd /tmp && open .'
expect_block '/usr/bin/open shot.png'
expect_block 'FOO=1 nohup open shot.png &'
expect_block "osascript -e 'tell application \"Finder\" to activate'"
expect_block 'ls; osascript -e 1'
expect_block 'qlmanage -p shot.png'
expect_block 'blender scene.blend'
expect_block '/opt/homebrew/bin/blender scene.blend'
expect_block 'npx playwright test --headed'
expect_block '/Applications/Unity/Hub/Editor/6000.6.5f1/Unity.app/Contents/MacOS/Unity -projectPath x'
expect_block '/Applications/Foo.app/Contents/MacOS/Foo'
# --- blocked: MDTWII project rules ---
expect_block 'tools/unity/run.sh MDTWII.Editor.Foo.Bar'
expect_block 'bash tools/unity/run.sh --test EditMode'
expect_block './tools/unity/run.sh --nographics CaenBuild.BuildCaptureA'
expect_block 'tools/unity/run.sh MDTWII.Editor.Campaign.CampaignCapture.Run'
expect_block 'tools/unity/run.sh --nographics MDTWII.Editor.Campaign.CampaignPlayerBuild.BuildPlayer'
expect_block 'Builds/Caen.app/Contents/MacOS/Caen -screen-width 800'
expect_block 'cargo build && ./Builds/Campaign.app/Contents/MacOS/MDTWII'

# --- block queues the command ---
if grep -q 'tools/unity/run.sh MDTWII.Editor.Foo.Bar' "$WDIR/.work-mode-queue.log" 2>/dev/null; then PASS=$((PASS+1))
else FAIL=$((FAIL+1)); echo "FAIL: blocked command was not queued"; fi

# --- allowed: 'open' inside words, paths, flags, quotes ---
expect_allow 'fopen_test --open-files'
expect_allow 'git log --oneline -5'
expect_allow 'grep -rn "open(" src/'
expect_allow 'echo "then open the file; done"'
expect_allow 'git commit -m "open the door; osascript later"'
expect_allow 'ls ~/openmw/open'
# --- allowed: headless tools ---
expect_allow 'tools/unity/run.sh --nographics MDTWII.Editor.Foo.Bar'
expect_allow 'MDTWII_FFI_FEATURES=vfs,battle tools/unity/run.sh --nographics --test EditMode'
expect_allow '/Applications/Unity/Hub/Editor/6000.6.5f1/Unity.app/Contents/MacOS/Unity -batchmode -nographics -projectPath x -quit'
expect_allow 'blender -b --python x.py'
expect_allow '/opt/homebrew/bin/blender --background -P x.py'
expect_allow "tools/blender/run.sh --only '*Grass*'"
expect_allow 'npx playwright test'
expect_allow 'cargo test -p m2-core-ffi'
# --- allowed: reading about the tools ---
expect_allow 'grep -n nographics tools/unity/run.sh'
expect_allow 'cat tools/unity/run.sh'
expect_allow 'sed -n 1,40p tools/blender/run.sh'
expect_allow 'grep -rn CampaignCapture unity/MDTWII/Assets'
expect_allow 'ls Builds/Caen.app/Contents/MacOS/'
# --- allowed: project rules do not leak into other projects ---
expect_allow 'tools/unity/run.sh Foo.Bar' "$OTHER"
# --- allowed: other tools pass through ---
expect_allow 'open x' "$MD" Read

# --- flag off: everything passes ---
rm -f "$WDIR/.work-mode-active"
expect_allow 'open https://example.com'
expect_allow 'tools/unity/run.sh --nographics CaenBuild.BuildCaptureA'

# --- jq missing: fail open ---
date -u +%Y-%m-%dT%H:%M:%SZ > "$WDIR/.work-mode-active"
ERR=$(payload Bash 'open x' "$MD" | env PATH=/var/empty /bin/bash "$GUARD" 2>&1); RC=$?
if [ "$RC" = "0" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); echo "FAIL: jq missing did not fail open (rc=$RC)"; fi

echo "work-mode guard tests: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
