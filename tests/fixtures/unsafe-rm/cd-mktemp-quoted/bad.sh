# Lint fixture for tests/test-unsafe-rm-patterns.sh. Never executed.
exit 0
# banned: a failed mktemp makes this cd "", which stays in the cwd
T=$(cd "$(mktemp -d)" && pwd -P)
