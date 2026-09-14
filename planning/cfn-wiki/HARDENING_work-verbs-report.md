# Work-queue hardening: release, requeue, map scope validation

Date: 2026-09-14
Source: CONTRACTS_work-knowledge-v2.md section 5 amendments
Files: .claude/skills/cfn-wiki/lib/work.py, .claude/skills/cfn-wiki/lib/wiki.sh, tests/test-wiki-work.py

## Verbs

`work release <repo> --job <id> [--owner <owner>]`
- leased/in_progress -> queued in one BEGIN IMMEDIATE transaction
- lease fields cleared; open attempt row ended with outcome='released'
- checkpoint_path on the attempt row retained (file untouched)
- refuses exit 2 when the job holds no lease; --owner must equal the
  lease_owner or refuse exit 2

`work requeue <repo> --job <id> --reason <text>`
- operator path for accepted-but-unpromotable jobs (promotion refused and
  rolled back, no lease path back): accepted -> queued
- reason recorded in blocked_reason as the audit trail (invisible to the
  status envelope while queued); blocked_on cleared; attempt_count kept
- refuses exit 2 on any non-accepted status
- never touches a job with a committed promotion (exit 2)

Both routed through the wiki.sh work wrapper (usage strings updated).

## Map scope-path validation (work plan)

validate_map now takes the repo. For every map capability entry, the scope
is tokenized on commas/whitespace; tokens containing a slash or shaped like
a filename with a 1-4 char extension are path candidates. If a capability
names at least one path candidate and none exists on disk
(os.path.exists on the repo-relative token), plan fails naming the
capability id and every offending path. Scopes with no path tokens (ids,
plain words) skip the disk check. Catches the pilot failure mode: a map
citing .claude/edit-safety.sh which never existed.

## Tests

tests/test-wiki-work.py: 59 green (49 pre-existing + 10 new)
- PlanTests +3 (scope reject / one-path accept / no-path skip)
- ReleaseTests +3, RequeueTests +3, ShellWrapperTests +1
TDD: all new verb tests and the scope rejection observed red before
implementation (argparse invalid choice / plan seeded anyway).
tests/test-wiki-discovery.py: 64 green (no cross-breakage).
Output: /tmp/test-claude-flow-novice-1789400458.txt

Fixture helpers v2_repo/accept_candidate moved from PromoteTests to the
Fixture base so RequeueTests reuses them; PromoteTests count unchanged.
