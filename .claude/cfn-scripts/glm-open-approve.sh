#!/usr/bin/env bash
# glm-open-approve.sh [DIR]: approve the committed .claude/glm-open-dirs of the
# repo holding DIR (default: cwd) for glm-open workers. Run by the user on the
# host, never inside a fence (the approval store is absent there).
#
# List lines: one absolute folder each; prefixes ro: (read-only) and noscan:
# (skip the secret-file scan for that folder; only for folders you know hold
# no passwords) in any order. Any change, noscan included, needs a new approval.
#
# Prints the validated folders, then records sha256 of the HEAD policy text and
# the resolved folder list in
# <store>/<root-id>.sha256 (store: $CFN_GLM_OPEN_APPROVALS, default
# ~/.config/cfn-fleet/glm-open; dir 0700, file 0600, written to a temp file
# and moved into place). The fence and both spawners refuse a list whose
# committed text no longer matches. Exit: 0 approved, 65 invalid list or
# unsafe store.
set -euo pipefail
LIB="$(cd "$(dirname "$(realpath "${BASH_SOURCE[0]}")")" && pwd)/lib/open-dirs.sh"
# shellcheck source=lib/open-dirs.sh
. "$LIB"
# shellcheck disable=SC2086
unset $CFN_GIT_REDIRECT_VARS

dir="${1:-$PWD}"
root=$(cfn_open_dirs_root "$dir") || { echo "glm-open-approve: cannot resolve the repo root of $dir" >&2; exit 65; }
list=$(cfn_open_dirs_list "$root" --no-approval --with-flags) || { echo "glm-open-approve: nothing approved" >&2; exit 65; }
body=$(_cfn_od_git -C "$root" show "HEAD:$CFN_OPEN_DIRS_FILE")

store=$(cfn_open_dirs_store)
if [ ! -e "$store" ]; then (umask 077 && mkdir -p "$store"); fi
_cfn_od_private "$store" d || { echo "glm-open-approve: $store is a symlink, not yours, or group/other writable; refused" >&2; exit 65; }
f="$store/$(cfn_open_dirs_root_id "$root").sha256"
if [ -e "$f" ] || [ -L "$f" ]; then
  _cfn_od_private "$f" f || { echo "glm-open-approve: $f is a symlink, not yours, or group/other writable; refused" >&2; exit 65; }
fi
tmp=$(umask 077 && mktemp "$store/.approve.XXXXXX")
# line 1: sha256 of the policy text; line 2: root; then the RESOLVED folders
# ("mode<TAB>realpath"), so a symlink that later points elsewhere refuses.
{ printf '%s\n' "$body" | cfn_open_dirs_sha256; printf '%s\n' "$root"; printf '%s\n' "$list"; } > "$tmp"
chmod 600 "$tmp"
mv -f "$tmp" "$f"
echo "glm-open-approve: approved for $root:"
printf '%s\n' "$list" | sed 's/^/  /'
