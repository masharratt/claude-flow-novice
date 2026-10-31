#!/usr/bin/env bash
# Tests for ssh-egress-guard.sh (Linux half of the outbound SSH block).
#
# Why it exists: the trojanized Claude Code extension 2.1.313 (29 Oct 2026)
# opened a reverse SSH tunnel OUT to its server on port 22. Inbound firewalls
# and Tailscale do not stop that; an outbound port-22 block that still allows
# loopback and the Tailscale network does.
#
# Uses --dry-run with stub iptables/ip6tables on PATH; never touches the real
# firewall and never needs root.
#
# Run: bash tests/test-ssh-egress-guard.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GUARD="$REPO_ROOT/.claude/cfn-scripts/ssh-egress-guard.sh"

PASS=0
FAIL=0
ok()   { PASS=$((PASS + 1)); echo "ok: $1"; }
bad()  { FAIL=$((FAIL + 1)); echo "FAIL: $1"; }
has()  { case "$1" in *"$2"*) return 0 ;; esac; return 1; }

source "$REPO_ROOT/.claude/cfn-scripts/lib/safe-rm.sh" || exit 1  # cfn_safe_rm_tmp
WORK="$(mktemp -d "${TMPDIR:-/tmp}/cfn-ssh-egress-test.XXXXXX")" || exit 1
trap 'cfn_safe_rm_tmp "$WORK"' EXIT
mkdir -p "$WORK/bin"
for t in iptables ip6tables; do
  printf '#!/usr/bin/env bash\necho "%s $*" >> "%s/calls.log"\nexit 1\n' "$t" "$WORK" > "$WORK/bin/$t"
  chmod +x "$WORK/bin/$t"
done

[ -f "$GUARD" ] || { bad "guard script missing: $GUARD"; echo "PASS=$PASS FAIL=$FAIL"; exit 1; }

OUT=$(PATH="$WORK/bin:$PATH" bash "$GUARD" apply --dry-run 2>&1)
RC=$?
[ "$RC" = 0 ] && ok "dry-run apply exits 0 without root" || bad "dry-run exit $RC: $OUT"
[ ! -s "$WORK/calls.log" ] && ok "dry-run never calls iptables" || bad "dry-run ran: $(cat "$WORK/calls.log")"

has "$OUT" "iptables -A CFN_SSH_EGRESS -o lo -j RETURN" && ok "loopback allowed" || bad "no loopback allow"
has "$OUT" "iptables -A CFN_SSH_EGRESS -o tailscale0 -j RETURN" && ok "tailscale iface allowed" || bad "no tailscale0 allow"
has "$OUT" "iptables -A CFN_SSH_EGRESS -d 100.64.0.0/10 -j RETURN" && ok "tailscale v4 range allowed" || bad "no 100.64/10 allow"
has "$OUT" "ip6tables -A CFN_SSH_EGRESS -d fd7a:115c:a1e0::/48 -j RETURN" && ok "tailscale v6 range allowed" || bad "no fd7a allow"
has "$OUT" "iptables -A CFN_SSH_EGRESS -m comment --comment cfn-ssh-egress -j REJECT" && ok "v4 default reject" || bad "no v4 reject"
has "$OUT" "ip6tables -A CFN_SSH_EGRESS -m comment --comment cfn-ssh-egress -j REJECT" && ok "v6 default reject" || bad "no v6 reject"
has "$OUT" "iptables -I OUTPUT -p tcp --dport 22 -j CFN_SSH_EGRESS" && ok "OUTPUT jumps on tcp/22 only" || bad "no OUTPUT jump"

# Reject must come after every allow, or the allows are dead.
REJ=$(printf '%s\n' "$OUT" | grep -n 'iptables -A CFN_SSH_EGRESS .*REJECT' | head -1 | cut -d: -f1)
LASTALLOW=$(printf '%s\n' "$OUT" | grep -n '^iptables -A CFN_SSH_EGRESS .*RETURN' | tail -1 | cut -d: -f1)
[ -n "$REJ" ] && [ -n "$LASTALLOW" ] && [ "$REJ" -gt "$LASTALLOW" ] \
  && ok "reject after allows" || bad "rule order: reject=$REJ lastallow=$LASTALLOW"

OUT=$(PATH="$WORK/bin:$PATH" CFN_SSH_EGRESS_ALLOW="203.0.113.7 198.51.100.0/24" bash "$GUARD" apply --dry-run 2>&1)
has "$OUT" "iptables -A CFN_SSH_EGRESS -d 203.0.113.7 -j RETURN" && ok "extra allow host" || bad "extra allow host missing"
has "$OUT" "iptables -A CFN_SSH_EGRESS -d 198.51.100.0/24 -j RETURN" && ok "extra allow range" || bad "extra allow range missing"

OUT=$(PATH="$WORK/bin:$PATH" CFN_SSH_EGRESS_ALLOW='1.2.3.4;reboot' bash "$GUARD" apply --dry-run 2>&1)
RC=$?
[ "$RC" != 0 ] && has "$OUT" "invalid" && ok "rejects malformed allow entry" || bad "accepted malformed allow (rc=$RC): $OUT"

OUT=$(PATH="$WORK/bin:$PATH" bash "$GUARD" remove --dry-run 2>&1)
has "$OUT" "iptables -D OUTPUT -p tcp --dport 22 -j CFN_SSH_EGRESS" && ok "remove drops jump" || bad "remove missing jump delete"
has "$OUT" "iptables -X CFN_SSH_EGRESS" && ok "remove deletes chain" || bad "remove missing chain delete"

OUT=$(PATH="$WORK/bin:$PATH" bash "$GUARD" apply 2>&1)
RC=$?
if [ "$(id -u)" != 0 ]; then
  [ "$RC" != 0 ] && has "$OUT" "root" && ok "real apply refuses without root" || bad "non-root apply rc=$RC: $OUT"
fi

OUT=$(bash "$GUARD" bogus 2>&1); RC=$?
[ "$RC" = 2 ] && ok "unknown command exits 2" || bad "unknown command rc=$RC"

echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = 0 ]
