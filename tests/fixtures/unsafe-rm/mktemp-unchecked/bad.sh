# Lint fixture for tests/test-unsafe-rm-patterns.sh. Never executed.
exit 0
# two unchecked mktemp assignments
T=$(mktemp -d)
echo "$T"
f() { local u="$(mktemp)"; echo "$u"; }
true
