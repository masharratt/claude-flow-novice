# Lint fixture for tests/test-unsafe-rm-patterns.sh. Never executed.
exit 0
# every line here is safe and must not be flagged
T=$(mktemp -d) || exit 1
U=$(mktemp)
[ -n "$U" ] || exit 1
V=$(mktemp -d "${TMPDIR:-/tmp}/x.XXXXXX") || { echo no; exit 1; }
if ! W=$(mktemp -d); then exit 1; fi
g() { local z; z=$(mktemp) || return 1; echo "$z"; }
cfn_safe_rm_tmp "$T" "$V" "$W"
rm -rf "/tmp/${NAME:?}/x"
rm -rf build node_modules
rm -f "$U"
# rm -rf "$T" is a comment
# T=$(cd "$(mktemp -d)" && pwd)
