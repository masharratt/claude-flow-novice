# Tooling ideas

Repeated manual work worth a tool. Add with cfn-tooling-idea.sh; set Status to done or dropped when handled.

| Date | Session | Idea | Saves | Evidence | Status |
|------|---------|------|-------|----------|--------|
| 2026-11-16 | 1273c60f | cfn-ship: push main, wait for all CI runs on the pushed sha, then ff-pull both VPS checkouts (refuse on tracked edits) and print one summary line | ~5 tool calls and ~10 min watching per push; done 6+ times today | push -> gh run list loop -> ssh vps/vps_personal pull repeated after every CFN push on 2026-11-15/16 | built 2026-11-16: .claude/cfn-scripts/cfn-ship.sh, tests/test-cfn-ship.sh |
