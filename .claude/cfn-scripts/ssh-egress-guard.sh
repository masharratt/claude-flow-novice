#!/usr/bin/env bash
# ssh-egress-guard.sh: block outbound SSH (tcp/22) from this Linux host except
# to loopback, the Tailscale network, and an explicit allow list.
#
# Why: the trojanized Claude Code extension 2.1.313 (29 Oct 2026) phoned home
# with a reverse SSH tunnel (`ssh -N -R ...` to its server on port 22).
# Inbound firewalls and Tailscale ACLs do not see outbound connections; this
# does. GitHub keeps working because ~/.ssh/config sends it to
# ssh.github.com:443 instead of port 22.
#
# Usage (needs root except --dry-run and status):
#   ssh-egress-guard.sh apply   [--dry-run]   (re)build the rules, idempotent
#   ssh-egress-guard.sh remove  [--dry-run]   take the rules out
#   ssh-egress-guard.sh install               copy to /usr/local/sbin + systemd unit (survives restart)
#   ssh-egress-guard.sh uninstall             remove unit, rules and installed copy
#   ssh-egress-guard.sh status
# Extra allowed destinations: CFN_SSH_EGRESS_ALLOW="203.0.113.7 2001:db8::/32"
# (install saves it to /etc/default/cfn-ssh-egress).
#
# The installed copy is root-owned on purpose: a boot unit running a script the
# user can edit would hand root to any malware running as that user.
#
# cfn: port 22 only, a tunnel over 443 still gets out; per-process egress allow-listing (e.g. OpenSnitch) if that matters
# cfn: Docker container traffic (FORWARD chain) is not covered; add a DOCKER-USER rule if containers run untrusted code

set -uo pipefail

CHAIN=CFN_SSH_EGRESS
TAG=cfn-ssh-egress
TS_V4=100.64.0.0/10
TS_V6=fd7a:115c:a1e0::/48
INSTALLED=/usr/local/sbin/cfn-ssh-egress-guard
UNIT=/etc/systemd/system/cfn-ssh-egress.service
DEFAULTS=/etc/default/cfn-ssh-egress

CMD="${1:-}"; shift || true
DRY=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

die() { echo "ssh-egress-guard: $*" >&2; exit 1; }
run() { if [ "$DRY" = 1 ]; then echo "$*"; else "$@"; fi; }
need_root() { [ "$(id -u)" = 0 ] || die "must run as root (try: sudo $0 $CMD)"; }

V4_EXTRA=()
V6_EXTRA=()
parse_allow() {
  local e
  for e in ${CFN_SSH_EGRESS_ALLOW:-}; do
    if [[ "$e" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}(/[0-9]{1,2})?$ ]]; then
      V4_EXTRA+=("$e")
    elif [[ "$e" == *:* && "$e" =~ ^[0-9A-Fa-f:]+(/[0-9]{1,3})?$ ]]; then
      V6_EXTRA+=("$e")
    else
      die "invalid CFN_SSH_EGRESS_ALLOW entry: '$e' (IPv4/IPv6 address or CIDR only)"
    fi
  done
}

build_family() {  # $1 = iptables|ip6tables, $2 = tailscale range, rest = extra allows
  local t="$1" ts="$2" e; shift 2
  if [ "$DRY" = 1 ]; then echo "$t -N $CHAIN"; else "$t" -N "$CHAIN" 2>/dev/null || true; fi
  run "$t" -F "$CHAIN"
  run "$t" -A "$CHAIN" -o lo -j RETURN
  run "$t" -A "$CHAIN" -o tailscale0 -j RETURN
  run "$t" -A "$CHAIN" -d "$ts" -j RETURN
  for e in "$@"; do run "$t" -A "$CHAIN" -d "$e" -j RETURN; done
  run "$t" -A "$CHAIN" -m comment --comment "$TAG" -j REJECT --reject-with tcp-reset
  if [ "$DRY" = 1 ] || ! "$t" -C OUTPUT -p tcp --dport 22 -j "$CHAIN" 2>/dev/null; then
    run "$t" -I OUTPUT -p tcp --dport 22 -j "$CHAIN"
  fi
}

drop_family() {  # $1 = iptables|ip6tables
  local t="$1"
  if [ "$DRY" = 1 ]; then
    echo "$t -D OUTPUT -p tcp --dport 22 -j $CHAIN"; echo "$t -F $CHAIN"; echo "$t -X $CHAIN"; return
  fi
  while "$t" -D OUTPUT -p tcp --dport 22 -j "$CHAIN" 2>/dev/null; do :; done
  "$t" -F "$CHAIN" 2>/dev/null || true
  "$t" -X "$CHAIN" 2>/dev/null || true
}

case "$CMD" in
  apply)
    parse_allow
    [ "$DRY" = 1 ] || need_root
    command -v iptables >/dev/null || die "iptables not found"
    build_family iptables "$TS_V4" "${V4_EXTRA[@]}" || die "IPv4 rules failed"
    if command -v ip6tables >/dev/null; then
      build_family ip6tables "$TS_V6" "${V6_EXTRA[@]}" || die "IPv6 rules failed"
    fi
    [ "$DRY" = 1 ] || echo "ssh-egress-guard: outbound port 22 blocked except loopback, Tailscale${CFN_SSH_EGRESS_ALLOW:+, $CFN_SSH_EGRESS_ALLOW}"
    ;;
  remove)
    [ "$DRY" = 1 ] || need_root
    drop_family iptables
    command -v ip6tables >/dev/null && drop_family ip6tables
    [ "$DRY" = 1 ] || echo "ssh-egress-guard: rules removed"
    ;;
  install)
    need_root
    parse_allow
    install -o root -g root -m 0755 "$0" "$INSTALLED" || die "copy to $INSTALLED failed"
    printf 'CFN_SSH_EGRESS_ALLOW="%s"\n' "${CFN_SSH_EGRESS_ALLOW:-}" > "$DEFAULTS"
    chmod 0644 "$DEFAULTS"
    cat > "$UNIT" <<EOF
[Unit]
Description=CFN: block outbound SSH except Tailscale and allow list
Wants=network-pre.target
Before=network-pre.target

[Service]
Type=oneshot
RemainAfterExit=yes
EnvironmentFile=-$DEFAULTS
ExecStart=$INSTALLED apply
ExecStop=$INSTALLED remove

[Install]
WantedBy=multi-user.target
EOF
    if ! { systemctl daemon-reload && systemctl enable --now cfn-ssh-egress.service; }; then
      die "systemd enable failed"
    fi
    systemctl restart cfn-ssh-egress.service
    echo "ssh-egress-guard: installed; rules re-applied at every start"
    ;;
  uninstall)
    need_root
    systemctl disable --now cfn-ssh-egress.service 2>/dev/null || true
    rm -f "$UNIT" "$DEFAULTS"
    systemctl daemon-reload 2>/dev/null || true
    DRY=0; drop_family iptables; command -v ip6tables >/dev/null && drop_family ip6tables
    rm -f "$INSTALLED"
    echo "ssh-egress-guard: uninstalled"
    ;;
  status)
    for t in iptables ip6tables; do
      command -v "$t" >/dev/null || continue
      echo "== $t"; "$t" -S "$CHAIN" 2>&1 || echo "(not present or no permission)"
    done
    systemctl is-enabled cfn-ssh-egress.service 2>/dev/null | sed 's/^/unit: /'
    ;;
  *)
    echo "usage: $0 {apply|remove|install|uninstall|status} [--dry-run]" >&2
    exit 2
    ;;
esac
