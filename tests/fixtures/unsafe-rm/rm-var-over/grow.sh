# Lint fixture for tests/test-unsafe-rm-patterns.sh. Never executed.
exit 0
# two sites, baseline allows one
rm -rf "$A"
trap 'rm -Rf "$B"' EXIT
