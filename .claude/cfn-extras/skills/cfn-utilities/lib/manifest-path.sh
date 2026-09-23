#!/usr/bin/env bash
# Resolve canonical CFN manifest storage path inside the project.
#
# Manifests live at <project-root>/.cfn-cache/manifests/<name>.json so they
# stay project-scoped (no cross-project bleed via /tmp/) and survive reboots
# without colliding under the same global namespace. The directory is added
# to .gitignore automatically on first use.

# Resolve project root: prefer git toplevel, fall back to PWD.
cfn_project_root() {
    local root
    if root=$(git rev-parse --show-toplevel 2>/dev/null); then
        printf '%s\n' "$root"
    else
        printf '%s\n' "$PWD"
    fi
}

# Ensure <project-root>/.cfn-cache/manifests/ exists and .cfn-cache/ is
# gitignored. Echoes the absolute manifests dir.
cfn_manifest_dir() {
    local root manifests_dir gitignore
    root=$(cfn_project_root)
    manifests_dir="${root}/.cfn-cache/manifests"
    mkdir -p "$manifests_dir"

    gitignore="${root}/.gitignore"
    if [[ -f "$gitignore" ]]; then
        if ! grep -qxE '\.cfn-cache/?' "$gitignore"; then
            printf '\n# CFN local cache (manifests, scratch state)\n.cfn-cache/\n' >> "$gitignore"
        fi
    else
        printf '# CFN local cache (manifests, scratch state)\n.cfn-cache/\n' > "$gitignore"
    fi

    printf '%s\n' "$manifests_dir"
}

# Compose a manifest path. Caller supplies the filename component.
# Usage: cfn_manifest_path "cfn-dry-review-${TS}.json"
cfn_manifest_path() {
    local name="${1:?manifest filename required}"
    local dir
    dir=$(cfn_manifest_dir)
    printf '%s/%s\n' "$dir" "$name"
}
