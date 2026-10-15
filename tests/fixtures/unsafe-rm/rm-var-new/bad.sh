# Lint fixture for tests/test-unsafe-rm-patterns.sh. Never executed.
exit 0
# three recursive deletes of a variable target
rm -rf "$T"
rm -fr "$T/sub"
cleanup() { rm -r "${T}"; }
