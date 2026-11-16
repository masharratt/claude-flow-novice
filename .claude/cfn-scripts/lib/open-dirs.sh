#!/usr/bin/env bash
# open-dirs.sh: one reader + validator for a project's glm-open folder list,
# used by zai-fence.sh (both backends bind the folders read+write) and by the
# spawners (cfn-fleet spawn, cfn-tmux-agents spawn) to refuse a glm-open launch
# up front with a clear message instead of a dead pane.
#
# The list: <main repo toplevel>/.claude/glm-open-dirs, COMMITTED in that
# project. Only the HEAD blob is policy (git show HEAD:...), never the working
# copy: an untracked list refuses, an uncommitted edit is ignored. The HEAD
# entry must be a regular file (mode 100644); a symlink (120000) refuses. One absolute folder per line; # comments and blank lines dropped.
#   ro:/abs/folder      bound read-only instead of read+write
#   /abs/dir/prefix-*   * or ? in the LAST path segment only: expanded at fence
#                       start to the existing folders it matches (files are
#                       skipped); zero matches warn on stderr and skip. A glob
#                       in an earlier segment refuses the list.
# Every literal entry and every glob match goes through the same checks.
# Its presence is the opt-in, per project. There is no global list and no env
# override: the fence reads the file itself from its own root.
#
# cfn_open_dirs_root DIR
#   Prints the main checkout's toplevel for DIR (worktrees resolve to the repo
#   that owns them), or DIR's real path when it is not in a git repo. Same rule
#   as the fence root.
# cfn_open_dirs_list ROOT [--no-approval]
#   Without --no-approval the HEAD policy must also match the approval store
#   (cfn_open_dirs_approved); only glm-open-approve.sh passes --no-approval.
#   Prints "MODE<TAB>REALPATH" per folder (MODE rw or ro), deduplicated, sorted
#   shallow-first with ro after rw at equal depth, so a backend that applies
#   them in order lets the deeper (or ro) entry win for its subtree. Returns 1
#   with a "glm-open-dirs: ..." reason on stderr when the file is missing, has
#   no entries, or ANY entry is refused (one bad line refuses the whole list):
#   not absolute, not an existing folder, /, a top-level folder, inside a
#   system tree, $HOME or a parent of it, overlapping ~/.claude or anything
#   ~/.claude links to, or holding a character a sandbox profile cannot quote.
# cfn_open_dirs_wanted SET_FIELD
#   rc 0 when an engine's set field carries ZAI_FENCE_OPEN_DIRS=1 (glm-open).
#
# Shared fence policy constants (both zai-fence backends read these):
#   CFN_GIT_REDIRECT_VARS  git env that can move the repo/root; unset before any
#                          root lookup and before the worker runs.
#   CFN_CRED_PATHS         credential paths under $HOME: masked by both backends
#                          wherever a bind exposes them; an opened folder inside
#                          one is refused.
#   CFN_FENCE_SCRUB_ENV    credential env the fence removes before exec.
#
# Bash 3.2 compatible; defines functions and constants only.

# shellcheck disable=SC2034  # constants read by the zai-fence backends
CFN_OPEN_DIRS_FILE=.claude/glm-open-dirs
CFN_GIT_REDIRECT_VARS="GIT_DIR GIT_WORK_TREE GIT_COMMON_DIR GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES GIT_NAMESPACE GIT_CEILING_DIRECTORIES GIT_DISCOVERY_ACROSS_FILESYSTEM GIT_CONFIG GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_PARAMETERS GIT_CONFIG_COUNT GIT_REPLACE_REF_BASE GIT_GRAFT_FILE GIT_PREFIX"
CFN_CRED_PATHS=".ssh .aws .gnupg .config/gh .config/gh-work .config/cfn-mailbox .config/cfn-fleet .npmrc .git-credentials .netrc .docker .cargo/credentials .cargo/credentials.toml .kube .azure .config/gcloud Library/Keychains"
CFN_FENCE_SCRUB_ENV="OPENAI_API_KEY ANTHROPIC_API_KEY AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN PGPASSWORD DATABASE_URL POSTGRES_URL AIRTABLE_API_KEY AIRTABLE_TOKEN ATTIO_API_KEY SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY"

# Secret file/dir names masked inside every glm-open folder (Linux allow-list
# backend: find -name patterns; directories become empty tmpfs).
CFN_OPEN_SECRET_NAMES=".env .env.* .envrc .dev.vars *.local.json settings.local.json .npmrc .pypirc .netrc .git-credentials credentials credentials.json credentials.*.json service-account*.json *.pem *.key *.p12 *.pfx id_rsa* id_ed25519* id_ecdsa* .aws .docker .ssh .vercel .supabase secrets.* *.tfstate*"

# Approval store (host only, absent inside every fence): one file per fence root,
# <store>/<root-id>.sha256, first line = sha256 of the approved HEAD policy text.
# Written only by cfn-scripts/glm-open-approve.sh. CFN_GLM_OPEN_APPROVALS
# overrides the location (tests); it is set by the launching user, never read
# from the project.
cfn_open_dirs_store() { printf '%s\n' "${CFN_GLM_OPEN_APPROVALS:-$HOME/.config/cfn-fleet/glm-open}"; }

# cfn_open_dirs_sha256: sha256 hex of stdin (GNU or BSD userland).
cfn_open_dirs_sha256() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum | cut -d' ' -f1
    else shasum -a 256 | cut -d' ' -f1; fi
}

# cfn_open_dirs_root_id ROOT: collision-free id for a root (sha256 of its real
# path); the punctuation-replacing slug maps /x/a-b and /x/a/b to one name.
cfn_open_dirs_root_id() { printf '%s' "$1" | cfn_open_dirs_sha256; }

# _cfn_od_private PATH KIND: rc 0 when PATH is a KIND (d|f), not a symlink,
# owned by this user and not group/other writable.
_cfn_od_private() {
    local l
    [ -L "$1" ] && return 1
    case "$2" in d) [ -d "$1" ] || return 1 ;; f) [ -f "$1" ] || return 1 ;; esac
    l=$(ls -ldn "$1" 2>/dev/null) || return 1
    set -- $l
    [ "$3" = "$(id -u)" ] || return 1
    case "$1" in ?????w*|????????w*) return 1 ;; esac
    return 0
}

# cfn_open_dirs_approved ROOT BODY LIST: rc 0 when BODY's sha256 AND the
# resolved LIST ("mode<TAB>realpath" lines) both match the stored approval for
# ROOT (escape A: the text alone does not pin where its entries resolve);
# otherwise a reason on stderr.
cfn_open_dirs_approved() {
    local store f want got rest
    store=$(cfn_open_dirs_store)
    f="$store/$(cfn_open_dirs_root_id "$1").sha256"
    got=$(printf '%s\n' "$2" | cfn_open_dirs_sha256)
    if [ ! -e "$f" ]; then
        echo "glm-open-dirs: the committed list for $1 is not approved; review it, then run ~/.claude/cfn-scripts/glm-open-approve.sh $1" >&2
        return 1
    fi
    if ! _cfn_od_private "$store" d || ! _cfn_od_private "$f" f; then
        echo "glm-open-dirs: approval store $store (or its file) is a symlink, not yours, or group/other writable; refused (chmod 700 the dir, 600 the file)" >&2
        return 1
    fi
    IFS= read -r want < "$f" || want=""
    if [ "$want" != "$got" ]; then
        echo "glm-open-dirs: the committed list for $1 changed since it was approved; review it, then run ~/.claude/cfn-scripts/glm-open-approve.sh $1" >&2
        return 1
    fi
    rest=$(tail -n +3 "$f")
    if [ "$rest" != "$(printf '%s' "$3")" ]; then
        echo "glm-open-dirs: the folders the list for $1 resolves to changed since it was approved (a symlink moved?); review them, then run ~/.claude/cfn-scripts/glm-open-approve.sh $1" >&2
        return 1
    fi
    return 0
}

# _cfn_od_symlink_in PATH TREES...: rc 0 (and the symlink on stdout) when PATH,
# or any of its ancestors, is a symlink that sits inside one of TREES (worker-
# writable trees: the worker could repoint it between launches).
_cfn_od_symlink_in() {
    local path="$1" p="" comp loc t
    shift
    local IFS=/
    for comp in ${path#/}; do
        p="$p/$comp"
        [ -L "$p" ] || continue
        loc="$(cd "$(dirname "$p")" 2>/dev/null && pwd -P)/$comp" || continue
        for t in "$@"; do
            case "$loc/" in "$t"/*) printf '%s\n' "$loc"; return 0 ;; esac
        done
    done
    return 1
}

# _cfn_od_git ARGS...: git with every redirecting GIT_* var removed and
# replacement objects disabled (refs/replace could substitute the policy blob).
_cfn_od_git() {
    local v
    local -a u=()
    for v in $CFN_GIT_REDIRECT_VARS; do u+=(-u "$v"); done
    env "${u[@]}" GIT_NO_REPLACE_OBJECTS=1 git --no-replace-objects -c core.useReplaceRefs=false "$@"
}

cfn_open_dirs_root() {
    local common
    if common=$(_cfn_od_git -C "$1" rev-parse --path-format=absolute --git-common-dir 2>/dev/null); then
        realpath "$(dirname "$common")"
    else
        realpath "$1"
    fi
}

cfn_open_dirs_wanted() {
    case ",$(printf '%s' "$1" | tr -d '[:space:]')," in
        *,ZAI_FENCE_OPEN_DIRS=1,*) return 0 ;;
    esac
    return 1
}

# _cfn_od_overlap A B: rc 0 when A and B are the same path or one holds the other.
_cfn_od_overlap() {
    case "$1/" in "$2"/*) return 0 ;; esac
    case "$2/" in "$1"/*) return 0 ;; esac
    return 1
}

cfn_open_dirs_list() {
    local root="$1" approval="${2:-}" file entry r p t home_r seen=$'\n' n=0 tree body
    file="$root/$CFN_OPEN_DIRS_FILE"
    tree=$(_cfn_od_git -C "$root" ls-tree HEAD -- "$CFN_OPEN_DIRS_FILE" 2>/dev/null) || tree=""
    case "$tree" in
        "") echo "glm-open-dirs: $file is not committed at HEAD of $root; this project has not opted in to glm-open (commit one absolute folder per line there, or use the plain glm engine; untracked or uncommitted lists are ignored)" >&2
            return 1 ;;
        "100644 blob "*) ;;
        "120000 "*) echo "glm-open-dirs: $file is a symlink in HEAD (mode 120000); it must be a regular file" >&2; return 1 ;;
        *) echo "glm-open-dirs: $file in HEAD is not a regular file (want mode 100644): ${tree%%$'\t'*}" >&2; return 1 ;;
    esac
    # A replacement ref for the policy blob, or any object on its path, means
    # someone tried to swap the policy without committing it: refuse outright.
    local sha
    for sha in $(_cfn_od_git -C "$root" rev-parse HEAD 'HEAD^{tree}' HEAD:.claude "HEAD:$CFN_OPEN_DIRS_FILE" 2>/dev/null); do
        if _cfn_od_git -C "$root" show-ref --verify --quiet "refs/replace/$sha"; then
            echo "glm-open-dirs: refs/replace/$sha replaces the committed policy in $root (or an object on its path); refused (git replace -d $sha)" >&2
            return 1
        fi
    done
    body=$(_cfn_od_git -C "$root" show "HEAD:$CFN_OPEN_DIRS_FILE" 2>/dev/null) \
        || { echo "glm-open-dirs: cannot read HEAD:$CFN_OPEN_DIRS_FILE in $root" >&2; return 1; }
    if [ -e "$file" ] || [ -L "$file" ]; then
        [ "$(cat "$file" 2>/dev/null)" = "$body" ] \
            || echo "glm-open-dirs: WARN $file differs from HEAD; using the committed version" >&2
    fi
    home_r=$(realpath "$HOME" 2>/dev/null) || { echo "glm-open-dirs: cannot resolve \$HOME" >&2; return 1; }

    # ~/.claude and every real target its symlinks reach stay read-only in the
    # fence; an opened folder overlapping any of them would make them writable.
    local -a protected=()
    protected+=("$home_r/.claude")
    [ -e "$HOME/.claude" ] && protected+=("$(realpath "$HOME/.claude")")
    for p in "$HOME"/.claude/* "$HOME"/.claude/*/*; do
        [ -L "$p" ] || continue
        t=$(realpath "$p" 2>/dev/null) || continue
        protected+=("$t")
    done

    local out="" raw mode dir pat m had_nullglob
    local -a rawpaths=()
    local -a cands
    while IFS= read -r raw; do
        [ -n "$raw" ] || continue
        mode=rw; entry="$raw"
        case "$entry" in ro:*) mode=ro; entry="${entry#ro:}" ;; esac
        case "$entry" in
            /*) ;;
            *) echo "glm-open-dirs: '$raw' in $file is not an absolute path" >&2; return 1 ;;
        esac
        cands=()
        case "$entry" in
            *[*?]*)
                dir="${entry%/*}"; pat="${entry##*/}"
                case "$dir" in
                    *[*?]*) echo "glm-open-dirs: '$raw' in $file has a glob before its last path segment (only the last segment may hold * or ?)" >&2; return 1 ;;
                esac
                had_nullglob=0; shopt -q nullglob && had_nullglob=1
                shopt -s nullglob
                local IFS=
                for m in "${dir:-}"/$pat; do [ -d "$m" ] && cands+=("$m"); done
                unset IFS
                [ "$had_nullglob" = 1 ] || shopt -u nullglob
                if [ "${#cands[@]}" -eq 0 ]; then
                    echo "glm-open-dirs: WARN '$raw' in $file matches no folder; skipped" >&2
                    continue
                fi ;;
            *) cands=("$entry") ;;
        esac
        for entry in "${cands[@]}"; do
            rawpaths+=("$entry")
            r=$(_cfn_od_check "$file" "$raw" "$entry" "$home_r" "${protected[@]}") || return 1
            case "$seen" in *$'\n'"$mode $r"$'\n'*) continue ;; esac
            seen+="$mode $r"$'\n'
            out+="$mode"$'\t'"$r"$'\n'
            n=$((n + 1))
        done
    done < <(printf '%s\n' "$body" | sed -e 's/#.*//' -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | grep -v '^$')

    if [ "$n" -eq 0 ]; then
        echo "glm-open-dirs: $file lists no folders; glm-open needs at least one (or use the plain glm engine)" >&2
        return 1
    fi
    # Escape A: an entry reached through a symlink inside a worker-writable tree
    # (the root or an rw opening) could be repointed by the worker; refuse.
    local -a trees=("$root")
    local line ln
    while IFS=$'\t' read -r m line; do [ "$m" = rw ] && trees+=("$line"); done <<<"$out"
    for entry in "${rawpaths[@]}"; do
        if ln=$(_cfn_od_symlink_in "$entry" "${trees[@]}"); then
            echo "glm-open-dirs: '$entry' in $file passes through the symlink $ln inside a writable tree (the worker could repoint it); list the real folder instead" >&2
            return 1
        fi
    done
    local sorted
    sorted=$(_cfn_od_sort "$out")
    if [ "$approval" != --no-approval ]; then
        cfn_open_dirs_approved "$root" "$body" "$sorted" || return 1
    fi
    printf '%s\n' "$sorted"
}

# _cfn_od_sort LINES: depth (slash count), ro after rw, then path: shallow
# first so deeper wins.
_cfn_od_sort() {
    # depth (slash count), ro after rw, then path: shallow first so deeper wins
    printf '%s' "$1" | awk -F'\t' '{ p = $2; d = gsub("/", "/", p); print d "\t" ($1 == "ro") "\t" $0 }' \
        | sort -t "$(printf '\t')" -k1,1n -k2,2n -k4 | cut -f3-
}

# _cfn_od_check FILE RAW ENTRY HOME_R PROTECTED...: print ENTRY's real path, or
# return 1 with the reason on stderr.
_cfn_od_check() {
    local file="$1" raw="$2" entry="$3" home_r="$4" r p
    shift 4
    [ -d "$entry" ] || { echo "glm-open-dirs: '$raw' in $file is not an existing folder" >&2; return 1; }
    r=$(realpath "$entry" 2>/dev/null) || { echo "glm-open-dirs: cannot resolve '$entry' ($raw) in $file" >&2; return 1; }
    case "$r" in
        *'"'*|*'\'*|*$'\n'*|*$'\t'*) echo "glm-open-dirs: '$entry' ($raw) in $file holds a quote, backslash, tab or newline" >&2; return 1 ;;
    esac
    [ "$r" != / ] || { echo "glm-open-dirs: '$raw' in $file is / (refused)" >&2; return 1; }
    case "${r#/}" in
        */*) ;;
        *) echo "glm-open-dirs: '$entry' ($raw) in $file is a top-level folder ($r); list a folder inside it" >&2; return 1 ;;
    esac
    for p in /bin /boot /dev /etc /lib /lib32 /lib64 /libx32 /opt /proc /root /run /sbin /snap /srv /sys /usr /var \
             /System /Library /Applications /private; do
        case "$r/" in "$p"/*) echo "glm-open-dirs: '$entry' ($raw) in $file is inside the system folder $p (refused)" >&2; return 1 ;; esac
    done
    case "$home_r/" in
        "$r"/*) echo "glm-open-dirs: '$entry' ($raw) in $file is \$HOME or a parent of it (refused)" >&2; return 1 ;;
    esac
    local c cr
    for c in $CFN_CRED_PATHS; do
        cr="$home_r/$c"
        [ -e "$cr" ] && cr=$(realpath "$cr" 2>/dev/null || printf '%s' "$cr")
        for p in "$home_r/$c" "$cr"; do
            case "$r/" in "$p"/*) echo "glm-open-dirs: '$entry' ($raw) in $file is inside the credential path ~/$c (refused)" >&2; return 1 ;; esac
        done
    done
    for p in "$@"; do
        if _cfn_od_overlap "$r" "$p"; then
            echo "glm-open-dirs: '$entry' ($raw) in $file overlaps $p (~/.claude or a folder it links to stays read-only)" >&2
            return 1
        fi
    done
    printf '%s\n' "$r"
}
