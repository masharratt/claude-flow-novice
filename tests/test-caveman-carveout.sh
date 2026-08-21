#!/usr/bin/env bash
# Guards the "Terse-Output Mode Carve-Out" section of the CFN operating guide
# (.claude/global/CLAUDE.md, symlinked to ~/.claude/CLAUDE.md).
#
# That section makes factual claims about a THIRD-PARTY plugin (caveman) that
# CFN does not control:
#
#   - `CAVEMAN_DEFAULT_MODE=off` silences both injections.
#   - The live switch is the flag file ~/.claude/.caveman-active.
#   - Patching the plugin cache is pointless because the cache is not a git
#     checkout and an update writes a new content-hashed directory.
#
# A plugin update can rename the knob or move the flag, at which point the guide
# is confidently wrong and the next person burns a session discovering it. The
# claims are mechanical, so they are checked mechanically here.
#
# The plugin is optional. When it is not installed the plugin-dependent checks
# skip and the run still passes. What never skips is the CLAUDE.md half: the
# carve-out rule is CFN's own and must not be silently dropped.
#
# NON-DESTRUCTIVE BY CONSTRUCTION: exercising `off` makes the real hook unlink
# the real flag file, which switches terse mode off in every live session on
# this machine. The flag is saved before the first probe and restored after the
# last one, including on early exit. This bit the author on 2026-08-21.
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
GUIDE="$REPO/.claude/global/CLAUDE.md"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
FLAG="$CLAUDE_DIR/.caveman-active"

PASS=0; FAIL=0; SKIP=0
ok()   { PASS=$((PASS+1)); printf 'ok   %s\n' "$1"; }
no()   { FAIL=$((FAIL+1)); printf 'FAIL %s\n' "$1"; }
skip() { SKIP=$((SKIP+1)); printf 'skip %s\n' "$1"; }

# ---- flag save/restore ----------------------------------------------------
SAVED_FLAG=""; HAD_FLAG=0
if [ -f "$FLAG" ] && [ ! -L "$FLAG" ]; then HAD_FLAG=1; SAVED_FLAG="$(cat "$FLAG")"; fi
restore_flag() {
  [ "$HAD_FLAG" = 1 ] || return 0
  [ -L "$FLAG" ] && return 0   # never write through a symlink
  printf '%s' "$SAVED_FLAG" > "$FLAG" && chmod 600 "$FLAG"
}
trap restore_flag EXIT

# ---- CFN's own rule must be present ---------------------------------------
grep -q '^### Terse-Output Mode Carve-Out' "$GUIDE" \
  && ok "guide: carve-out section present" \
  || no "guide: carve-out section present"

for claim in 'Subagent prompts' 'AskUserQuestion text' 'CAVEMAN_DEFAULT_MODE' '.caveman-active'; do
  grep -qF "$claim" "$GUIDE" \
    && ok "guide: mentions $claim" \
    || no "guide: mentions $claim"
done

# The carve-out exists to keep second-party output readable. If the guide ever
# stops naming the on-disk plan artifacts, agent briefs are the only thing left
# and the rule has lost half its point.
grep -qE 'PLAN, SPEC, VERIFY, DECISIONS' "$GUIDE" \
  && ok "guide: names the plan artifacts it exempts" \
  || no "guide: names the plan artifacts it exempts"

# ---- locate the plugin ------------------------------------------------------
PROOT=""
for cand in "$CLAUDE_DIR"/plugins/cache/caveman/caveman/*/hooks/caveman-activate.js; do
  [ -f "$cand" ] && { PROOT="$(cd "$(dirname "$cand")/.." && pwd -P)"; break; }
done

if [ -z "$PROOT" ]; then
  skip "plugin not installed; knob and flag claims unverified"
elif ! command -v node >/dev/null 2>&1; then
  skip "node not on PATH; knob and flag claims unverified"
else
  ACT="$PROOT/hooks/caveman-activate.js"
  TRK="$PROOT/hooks/caveman-mode-tracker.js"

  # The guide tells people to reach for this exact env var. Prove it is still
  # the highest-priority knob rather than a name the plugin has since dropped.
  grep -q 'CAVEMAN_DEFAULT_MODE' "$PROOT/hooks/caveman-config.js" \
    && ok "plugin: CAVEMAN_DEFAULT_MODE still read by the config resolver" \
    || no "plugin: CAVEMAN_DEFAULT_MODE still read by the config resolver"

  # off => session start emits nothing of substance.
  n=$(CAVEMAN_DEFAULT_MODE=off node "$ACT" 2>/dev/null | wc -c)
  [ "$n" -le 8 ] \
    && ok "off: SessionStart payload silenced ($n bytes)" \
    || no "off: SessionStart payload silenced (got $n bytes, want <=8)"

  # off => per-prompt reinforcement emits nothing at all.
  n=$(printf '%s' '{"prompt":"unrelated prompt"}' \
        | CAVEMAN_DEFAULT_MODE=off node "$TRK" 2>/dev/null | wc -c)
  [ "$n" -eq 0 ] \
    && ok "off: UserPromptSubmit payload silenced" \
    || no "off: UserPromptSubmit payload silenced (got $n bytes, want 0)"

  # Non-vacuity: the two checks above are worthless if the hooks emit nothing
  # when ON either. An active mode must still produce a real payload.
  n=$(CAVEMAN_DEFAULT_MODE=full node "$ACT" 2>/dev/null | wc -c)
  [ "$n" -gt 500 ] \
    && ok "on: SessionStart still emits a real payload ($n bytes)" \
    || no "on: SessionStart still emits a real payload (got $n bytes, want >500)"

  # The guide says intensity level is not a size lever, so on/off is the only
  # real choice. If a future release makes lite genuinely small, that advice
  # should change.
  full=$(CAVEMAN_DEFAULT_MODE=full  node "$ACT" 2>/dev/null | wc -c)
  lite=$(CAVEMAN_DEFAULT_MODE=lite  node "$ACT" 2>/dev/null | wc -c)
  if [ "$lite" -gt $((full / 2)) ]; then
    ok "guide: intensity is still not a size lever (full=$full lite=$lite)"
  else
    no "guide: lite is now much smaller than full (full=$full lite=$lite); revisit the on/off advice"
  fi

  # The flag path the guide tells people to delete must be the one the plugin
  # actually reads.
  node -e '
    const p = process.argv[1], os = require("os"), path = require("path");
    const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
    process.stdout.write(path.join(dir, ".caveman-active"));
  ' "$PROOT" > /tmp/.cfn-caveman-flagpath.$$ 2>/dev/null
  got="$(cat /tmp/.cfn-caveman-flagpath.$$ 2>/dev/null)"; rm -f /tmp/.cfn-caveman-flagpath.$$
  [ "$got" = "$FLAG" ] \
    && ok "flag path matches the guide (~/.claude/.caveman-active)" \
    || no "flag path drifted: plugin uses $got"

  # The cache is not a git checkout, which is why the guide forbids patching it.
  [ -d "$PROOT/.git" ] \
    && no "plugin cache is now a git checkout; the no-patch rationale in the guide is stale" \
    || ok "plugin cache is not a git checkout (patching it is still futile)"

  # Restore before reporting so a failure cannot leave terse mode off.
  restore_flag
  if [ "$HAD_FLAG" = 1 ]; then
    [ "$(cat "$FLAG" 2>/dev/null)" = "$SAVED_FLAG" ] \
      && ok "live caveman flag restored after probing off mode" \
      || no "live caveman flag NOT restored (was '$SAVED_FLAG')"
  fi
fi

echo
echo "caveman carve-out: $PASS passed, $FAIL failed, $SKIP skipped"
[ "$FAIL" -eq 0 ]
